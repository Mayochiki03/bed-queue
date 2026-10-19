/**
 * DashboardService.ts — คำนวณตัวเลข Dashboard (หน้าหลัก)
 *   - queue     : สถานะปัจจุบัน รอ/เรียกแล้ว/เกินเวลา + คิวตามสี (รอนานสุดกี่วัน)
 *   - period    : ผลลัพธ์ของคำขอที่ส่งในช่วง N วัน + ระยะเวลาจนยืนยัน (เฉลี่ย/เร็วสุด/ช้าสุด)
 *   - trend     : รายวัน ส่งคำขอ เทียบ ยืนยันส่งตัว (วันที่ตามเวลาไทย)
 *   - hospitals : โรงพยาบาลที่ส่งเคสมากสุด แยกตามสี
 *   - substances: ระยะเวลาจนยืนยันตามประเภทสารเสพติด
 * "เกินเวลา" = เรียกแล้วเกิน confirm_timeout_hours ชั่วโมงแต่ยังไม่ตอบ
 */
import { getSetting } from '../../core/settings';
import type { DashboardSummary, HospitalStat, SubstanceStat } from './Dashboard';
import type { DashboardDto } from './DashboardDto';
import type { DashboardRepository, DashRow } from './DashboardRepository';

const DAY = 86_400_000;
const NO_COLOR = '_NONE';
const round1 = (n: number) => Math.round(n * 10) / 10;
const daysBetween = (fromIso: string, toIso: string) => (new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY;
/** วันที่ (YYYY-MM-DD) ตามเวลาไทย */
export const thaiDate = (d: Date | string) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

export class DashboardService {
  constructor(private repo: DashboardRepository) {}

  async summary(dto: DashboardDto, now = new Date()): Promise<DashboardSummary> {
    const days = dto.days ?? (await getSetting<number>('dashboard_default_days'));
    const topN = await getSetting<number>('dashboard_top_n');
    const timeoutHours = await getSetting<number>('confirm_timeout_hours');
    const since = new Date(now.getTime() - days * DAY).toISOString();
    const nowIso = now.toISOString();

    const [open, submitted, confirmed] = await Promise.all([this.repo.openQueue(), this.repo.submittedSince(since), this.repo.confirmedSince(since)]);

    // ---- คิวปัจจุบัน ----
    const waiting = open.filter((r) => r.status === 'WAITING');
    const called = open.filter((r) => r.status === 'CALLED');
    const needDate = open.filter((r) => r.status === 'NEED_DATE');
    const overdue = called.filter((r) => r.called_at && now.getTime() - new Date(r.called_at).getTime() > timeoutHours * 3_600_000).length;
    const byColor = new Map<string, { count: number; oldest: string | null }>();
    for (const r of waiting) {
      const k = r.color_code ?? NO_COLOR;
      const cur = byColor.get(k) ?? { count: 0, oldest: null };
      cur.count += 1;
      if (!cur.oldest || r.submitted_at < cur.oldest) cur.oldest = r.submitted_at;
      byColor.set(k, cur);
    }

    // ---- ผลลัพธ์ในช่วงเวลา ----
    const count = (st: string) => submitted.filter((r) => r.status === st).length;
    const confirmedSubmitted = submitted.filter((r) => r.status === 'CONFIRMED' && r.resolved_at);
    const durs = confirmedSubmitted.map((r) => Math.max(0, daysBetween(r.submitted_at, r.resolved_at!)));

    // ---- แนวโน้มรายวัน ----
    const trendMap = new Map<string, { submitted: number; confirmed: number }>();
    for (let i = days - 1; i >= 0; i--) trendMap.set(thaiDate(new Date(now.getTime() - i * DAY)), { submitted: 0, confirmed: 0 });
    for (const r of submitted) {
      const t = trendMap.get(thaiDate(r.submitted_at));
      if (t) t.submitted += 1;
    }
    for (const r of confirmed) {
      const t = r.resolved_at ? trendMap.get(thaiDate(r.resolved_at)) : undefined;
      if (t) t.confirmed += 1;
    }

    // ---- โรงพยาบาล x สี ----
    const hosp = new Map<number, HospitalStat>();
    for (const r of submitted) {
      const h = hosp.get(r.hospital_id) ?? { hospital_id: r.hospital_id, code: '', name: '', total: 0, by_color: {} };
      const k = r.color_code ?? NO_COLOR;
      h.total += 1;
      h.by_color[k] = (h.by_color[k] ?? 0) + 1;
      hosp.set(r.hospital_id, h);
    }
    const top = [...hosp.values()].sort((a, b) => b.total - a.total || a.hospital_id - b.hospital_id).slice(0, topN);
    const names = new Map((await this.repo.hospitals(top.map((h) => h.hospital_id))).map((h) => [h.id, h]));
    for (const h of top) {
      h.code = names.get(h.hospital_id)?.code ?? '';
      h.name = names.get(h.hospital_id)?.name ?? `รหัส ${h.hospital_id}`;
    }

    // ---- สารเสพติด: จำนวนคำขอ + ระยะเวลาจนยืนยัน ----
    const subCount = new Map<string, number>();
    for (const r of submitted) subCount.set(r.substance_code ?? NO_COLOR, (subCount.get(r.substance_code ?? NO_COLOR) ?? 0) + 1);
    const sub = new Map<string, number[]>();
    for (const r of confirmedSubmitted) {
      const k = r.substance_code ?? NO_COLOR;
      sub.set(k, [...(sub.get(k) ?? []), Math.max(0, daysBetween(r.submitted_at, r.resolved_at!))]);
    }
    const substances: SubstanceStat[] = [...subCount.entries()]
      .map(([code, submittedCount]) => {
        const v = sub.get(code) ?? [];
        return {
          code,
          submitted: submittedCount,
          confirmed: v.length,
          avg_days: v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null,
          min_days: v.length ? round1(Math.min(...v)) : null,
          max_days: v.length ? round1(Math.max(...v)) : null,
        };
      })
      .sort((a, b) => b.submitted - a.submitted);

    return {
      days,
      queue: {
        waiting: waiting.length,
        called: called.length,
        need_date: needDate.length,
        overdue,
        by_color: [...byColor.entries()].map(([code, v]) => ({ code, count: v.count, oldest_days: v.oldest ? round1(daysBetween(v.oldest, nowIso)) : null })),
      },
      period: {
        submitted: submitted.length,
        confirmed: count('CONFIRMED'),
        declined: count('DECLINED'),
        cancelled: count('CANCELLED'),
        avg_days_to_confirm: durs.length ? round1(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
        min_days_to_confirm: durs.length ? round1(Math.min(...durs)) : null,
        max_days_to_confirm: durs.length ? round1(Math.max(...durs)) : null,
      },
      trend: [...trendMap.entries()].map(([date, v]) => ({ date, ...v })),
      hospitals: top,
      substances,
    };
  }
}
