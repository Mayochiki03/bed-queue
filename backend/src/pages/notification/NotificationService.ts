/**
 * NotificationService.ts — ส่งข้อความแจ้งเตือน LINE หาผู้ขอตามที่ตั้งไว้ (เปิด/ปิดทีละชนิด)
 *
 * เรียกจาก RequestService ผ่าน hook หลังเปลี่ยนสถานะสำเร็จ — ส่งไม่สำเร็จห้ามทำให้งานหลักล้ม (จับ error แล้วจดลง log)
 * ผลของทุกครั้งถูกจดใน notification_log: SENT ส่งแล้ว · FAILED LINE ปฏิเสธ · SKIPPED ไม่ได้ส่ง (บอกเหตุผล)
 * เหตุที่ SKIPPED: ปิดชนิดนี้ไว้ (ไม่จด) · โหมด LOCAL · ยังไม่ตั้ง token · ผู้ขอไม่มี LINE/เป็นผู้ขอจำลอง · โควต้าเดือนนี้เต็ม
 */
import { notFound } from '../../core/http';
import { getSetting } from '../../core/settings';
import { lineClient } from './LineClient';
import { card, type Btn } from './LineFlex';
import { TEMPLATE_DEFS, TEMPLATE_VARS, type NotifyType } from './Notification';
import type { NotificationRepository } from './NotificationRepository';

/** ต้นเดือนตามเวลาไทย (ISO UTC) — LINE นับโควต้าเป็นเดือนปฏิทิน */
export function monthStartBangkok(now = new Date()): string {
  const bkk = new Date(now.getTime() + 7 * 3_600_000);
  return new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), 1) - 7 * 3_600_000).toISOString();
}

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

export class NotificationService {
  constructor(private repo: NotificationRepository) {}

  async templates() {
    const rows = await this.repo.templates();
    const defs = new Map(TEMPLATE_DEFS.map((d) => [d.type, d]));
    // เรียงตามลำดับใน TEMPLATE_DEFS (ชนิดที่ใช้บ่อยอยู่บน)
    return TEMPLATE_DEFS.map((d) => {
      const r = rows.find((x) => x.type === d.type);
      return { type: d.type, name: d.name, when: d.when, title: r?.title ?? d.title, body: r?.body ?? d.body, is_enabled: r ? !!r.is_enabled : d.enabled, default_enabled: defs.get(d.type)!.enabled };
    });
  }

  vars() {
    return TEMPLATE_VARS;
  }

  async save(type: string, d: { title: string; body: string; is_enabled: boolean }, userId: number) {
    if (!TEMPLATE_DEFS.some((x) => x.type === type)) throw notFound('ไม่พบข้อความชนิดนี้');
    await this.repo.saveTemplate(type, d, userId);
  }

  /** สรุปเดือนนี้ + โควต้า + สถานะการเชื่อมต่อ (หน้าแจ้งเตือนของแอดมิน) */
  async summary() {
    const counts = await this.repo.countsSince(monthStartBangkok());
    const [quota, warnPct, mode, token] = await Promise.all([getSetting<number>('line_monthly_quota'), getSetting<number>('line_quota_warn_pct'), getSetting<string>('connection_mode'), getSetting<string>('line_channel_token')]);
    const sent = counts.SENT ?? 0;
    return {
      sent,
      failed: counts.FAILED ?? 0,
      skipped: counts.SKIPPED ?? 0,
      quota,
      warn_pct: warnPct,
      near_limit: quota > 0 && sent >= (quota * warnPct) / 100,
      mode,
      token_set: !!token,
      /** true = ส่งจริงได้ (ไม่ใช่โหมด LOCAL และมี token) */
      live: mode !== 'LOCAL' && !!token,
    };
  }

  logs(f: { status: string; type: string }, paging: { pageNo: number; pageSize: number }) {
    return this.repo.search(f, paging);
  }

  /**
   * ส่งแจ้งเตือนชนิด type ของคำขอ requestId — ไม่ throw
   * toRequesterId: ส่งหาผู้ขออีกคน (เช่น โอนเคส ส่งหาผู้ขอคนใหม่) ไม่ใส่ = ผู้ขอเจ้าของคำขอ
   */
  async notify(type: NotifyType, requestId: number, toRequesterId?: number): Promise<void> {
    try {
      const tpl = (await this.repo.template(type)) ?? undefined;
      const def = TEMPLATE_DEFS.find((d) => d.type === type)!;
      if (!(tpl ? !!tpl.is_enabled : def.enabled)) return; // ปิดชนิดนี้ไว้ — ไม่ส่งและไม่จด

      const ctx = await this.repo.requestContext(requestId);
      if (!ctx) return;
      const target = toRequesterId ? await this.repo.requesterLine(toRequesterId) : { id: ctx.requester_id, line_user_id: ctx.line_user_id };
      const log = (status: 'SENT' | 'FAILED' | 'SKIPPED', error: string | null) => this.repo.addLog({ request_id: requestId, requester_id: target?.id ?? null, type, status, error_message: error });

      if (!target || !target.line_user_id) return void (await log('SKIPPED', 'ผู้ขอไม่มีบัญชี LINE (เจ้าหน้าที่บันทึกแทน)'));
      if (target.line_user_id.startsWith('MOCK-')) return void (await log('SKIPPED', 'ผู้ขอจำลอง (ทดสอบ) ไม่ส่งจริง'));
      const [mode, token, quota] = await Promise.all([getSetting<string>('connection_mode'), getSetting<string>('line_channel_token'), getSetting<number>('line_monthly_quota')]);
      if (mode === 'LOCAL') return void (await log('SKIPPED', 'โหมด LOCAL (ยังไม่ต่อ LINE)'));
      if (!token) return void (await log('SKIPPED', 'ยังไม่ได้ตั้ง Channel Access Token'));
      if (quota > 0 && ((await this.repo.countsSince(monthStartBangkok())).SENT ?? 0) >= quota) return void (await log('SKIPPED', `โควต้าเดือนนี้เต็ม (${quota} ข้อความ)`));

      const timeout = await getSetting<number>('confirm_timeout_hours');
      const vars = {
        request_no: ctx.request_no ?? `#${ctx.id}`,
        hospital: ctx.hospital_name ?? '',
        requester_name: ctx.requester_name,
        color: ctx.color_name ?? '-',
        reason: ctx.reason_name ?? '-',
        timeout_hours: String(timeout),
      };
      const title = tpl?.title ?? def.title;
      const text = fill(tpl?.body ?? def.body, vars);
      const r = await lineClient.push(target.line_user_id, [await this.flex(title, text, def.button, type, requestId)]);
      if (r.ok) await log('SENT', null);
      else await log('FAILED', (r.data?.message ?? (r.status === -1 ? 'ติดต่อ LINE ไม่ได้ (หมดเวลา)' : `LINE ตอบ ${r.status}`)).slice(0, 500));
    } catch (err) {
      console.error('[notify]', err);
      try {
        await this.repo.addLog({ request_id: requestId, requester_id: null, type, status: 'FAILED', error_message: `ผิดพลาดในระบบ: ${(err as Error).message}`.slice(0, 500) });
      } catch {
        /* จดไม่ได้ก็ปล่อย — ห้ามกระทบงานหลัก */
      }
    }
  }

  /** การ์ดแจ้งเตือน: ปุ่มเปิดหน้าผู้ขอ + (เฉพาะเรียกคิว) ปุ่มยืนยัน/ไม่ยืนยันในแชท ถ้าเปิด webhook ไว้ */
  private async flex(title: string, text: string, button: string | undefined, type: NotifyType, requestId: number) {
    const [liff, base, hook, callBtns, secret] = await Promise.all([getSetting<string>('liff_id'), getSetting<string>('public_base_url'), getSetting<boolean>('line_webhook_enabled'), getSetting<boolean>('line_call_buttons'), getSetting<string>('line_channel_secret')]);
    const url = liff ? `https://liff.line.me/${liff}` : base || null;
    const buttons: Btn[] = [];
    if (type === 'CALLED' && hook && callBtns && secret) {
      buttons.push({ label: 'ยืนยันส่งตัว', data: `a=confirm&r=${requestId}`, displayText: 'ยืนยันส่งตัว' }, { label: 'ไม่ยืนยัน', style: 'secondary', data: `a=decline&r=${requestId}` });
    }
    if (button && url) buttons.push({ label: button, style: buttons.length ? 'secondary' : 'primary', uri: url });
    return card(title, text, buttons);
  }
}
