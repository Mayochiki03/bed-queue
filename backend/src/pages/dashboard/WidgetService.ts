/**
 * WidgetService.ts — จัดการ widget ของ Dashboard (สร้าง/แก้/ลบ/จัดวาง) + คำนวณข้อมูล + ส่งออก Excel
 * widget ใช้ร่วมกันทุกคน (ผู้ดูแลจัดหน้าให้ทุกคนเห็นเหมือนกัน) · ดูข้อมูล/ส่งออกได้ทุกคน, แก้ไขได้เฉพาะ ADMIN ขึ้นไป (กั้นที่ Controller)
 */
import { badRequest, notFound } from '../../core/http';
import { getSetting } from '../../core/settings';
import { buildWorkbook, type SheetSpec } from '../../core/xlsx';
import { MEASURE_LABEL, checkCompat, type WidgetConfig, type WidgetRecord, type WidgetResult, type WidgetWithResult } from './Widget';
import type { WidgetSaveDto } from './WidgetDto';
import { computeWidget, isSnapshot, thaiDate, type EngineContext } from './WidgetEngine';
import type { WidgetRepository } from './WidgetRepository';

const DAY = 86_400_000;
const MAX_WIDGETS = 60;

export class WidgetService {
  constructor(private repo: WidgetRepository) {}

  /** ตัวช่วยคำนวณหลาย widget พร้อมกัน — ดึงแถวจากฐานข้อมูลครั้งเดียวด้วยช่วงเวลายาวที่สุด */
  private async compute(widgets: WidgetConfig[], days: number | undefined, now: Date): Promise<{ results: WidgetResult[]; days: number }> {
    const baseDays = days ?? (await getSetting<number>('dashboard_default_days'));
    const effective = widgets.map((w) => w.period_days ?? baseDays);
    const maxDays = Math.max(1, ...effective);
    const [rows, colors, substances, reasons, hospitalNames, timeoutHours] = await Promise.all([
      this.repo.rowsSince(new Date(now.getTime() - maxDays * DAY).toISOString()),
      this.repo.dims('COLOR'),
      this.repo.dims('SUBSTANCE'),
      this.repo.dims('REASON'),
      this.repo.hospitalNames(),
      getSetting<number>('confirm_timeout_hours'),
    ]);
    const base: Omit<EngineContext, 'days'> = { now, timeoutHours, colors, substances, reasons, hospitalNames };
    return { results: widgets.map((w, i) => computeWidget(w, rows, { ...base, days: effective[i]! })), days: baseDays };
  }

  private validate(c: Pick<WidgetConfig, 'measures' | 'group_by' | 'split_by' | 'chart'>) {
    const msg = checkCompat(c);
    if (msg) throw badRequest(msg, { chart: msg });
  }

  /** includeHidden: ผู้ดูแลที่อยู่ในโหมดจัดหน้า ต้องเห็น widget ที่ซ่อนอยู่ด้วย (ไม่คำนวณข้อมูลให้ตัวที่ซ่อน) */
  async data(days: number | undefined, includeHidden: boolean, now = new Date()): Promise<{ days: number; widgets: WidgetWithResult[] }> {
    const all = await this.repo.list(!includeHidden);
    const active = all.filter((w) => w.is_active);
    const { results, days: used } = await this.compute(active, days, now);
    const byId = new Map(active.map((w, i) => [w.id, results[i]!]));
    return { days: used, widgets: all.map((w) => ({ ...w, result: byId.get(w.id) ?? null })) };
  }

  async preview(config: WidgetConfig, days: number | undefined, now = new Date()): Promise<WidgetResult> {
    this.validate(config);
    return (await this.compute([config], days, now)).results[0]!;
  }

  async save(dto: WidgetSaveDto, userId: number): Promise<{ id: number }> {
    const { id, width, is_active, ...config } = dto;
    this.validate(config);
    if (id) {
      if (!(await this.repo.find(id))) throw notFound('ไม่พบ widget นี้ (อาจถูกลบไปแล้ว)');
      await this.repo.update(id, { ...config, width, is_active });
      return { id };
    }
    if ((await this.repo.count()) >= MAX_WIDGETS) throw badRequest(`สร้าง widget ได้ไม่เกิน ${MAX_WIDGETS} อัน — ลบอันที่ไม่ใช้ก่อน`);
    const sort_order = (await this.repo.maxSort()) + 10;
    return { id: await this.repo.insert({ ...config, width, is_active, sort_order }, userId) };
  }

  async remove(id: number) {
    if (!(await this.repo.find(id))) throw notFound('ไม่พบ widget นี้ (อาจถูกลบไปแล้ว)');
    await this.repo.remove(id);
  }

  async saveLayout(items: { id: number; sort_order: number; width: number; is_active: boolean }[]) {
    const found = new Set((await this.repo.findMany(items.map((i) => i.id))).map((w) => w.id));
    const missing = items.find((i) => !found.has(i.id));
    if (missing) throw notFound('มี widget ที่ถูกลบไปแล้ว — โหลดหน้าใหม่แล้วจัดวางอีกครั้ง');
    await this.repo.saveLayout(items);
  }

  // ---------------- ส่งออก Excel ----------------
  async exportXlsx(opts: { days?: number; ids?: number[]; config?: WidgetConfig }, now = new Date()): Promise<{ filename: string; buffer: Buffer }> {
    let list: (WidgetConfig & { id?: number })[];
    if (opts.config) {
      this.validate(opts.config);
      list = [opts.config];
    } else if (opts.ids?.length) {
      const found = await this.repo.findMany(opts.ids);
      if (!found.length) throw notFound('ไม่พบ widget ที่เลือก');
      list = found;
    } else list = await this.repo.list(true);
    if (!list.length) throw badRequest('ไม่มี widget ให้ส่งออก');

    const { results, days } = await this.compute(list, opts.days, now);
    const stamp = thaiDate(now);
    const sheets: SheetSpec[] = [];

    // ตัวเลขเดี่ยว (KPI) รวมไว้ชีตแรกชีตเดียว
    const kpis = list.map((w, i) => ({ w, r: results[i]! })).filter((x) => x.w.chart === 'number');
    if (kpis.length) {
      sheets.push({
        name: 'ตัวเลขสรุป',
        title: 'ตัวเลขสรุป Dashboard',
        subtitle: `ข้อมูล ณ วันที่ ${stamp}`,
        header: ['รายการ', 'ค่า', 'หน่วย', 'ช่วงเวลา'],
        rows: kpis.flatMap(({ w, r }) =>
          r.columns.map((c, ci): (string | number | null)[] => [kpis.length && r.columns.length > 1 ? `${w.title} - ${c.label}` : w.title, r.rows[0]?.values[ci] ?? null, r.unit, periodText(w.measures, r.days)]),
        ),
        numFmt: { 1: '0.0' },
      });
    }

    list.forEach((w, i) => {
      if (w.chart === 'number') return;
      const r = results[i]!;
      const header = [groupHeader(w.group_by), ...r.columns.map((c) => `${c.label} (${r.unit})`)];
      if (r.unit === 'ราย' && r.columns.length > 1) header.push('รวม');
      sheets.push({
        name: w.title || `Widget ${i + 1}`,
        title: w.title || 'Widget',
        subtitle: `${periodText(w.measures, r.days)} · ข้อมูล ณ วันที่ ${stamp}`,
        header,
        rows: r.rows.map((row) => [row.label, ...row.values, ...(r.unit === 'ราย' && r.columns.length > 1 ? [row.total] : [])]),
        numFmt: r.unit === 'วัน' ? Object.fromEntries(r.columns.map((_, ci) => [ci + 1, '0.0'])) : undefined,
      });
    });

    const buffer = await buildWorkbook(sheets);
    const single = list.length === 1 ? list[0]!.title : '';
    void days;
    return { filename: `${single || 'dashboard'}-${stamp.replaceAll('-', '')}.xlsx`, buffer };
  }
}

const periodText = (measures: readonly (keyof typeof MEASURE_LABEL)[], days: number) => (isSnapshot(measures) ? 'ขณะนี้ (ไม่ขึ้นกับช่วงเวลา)' : `${days} วันล่าสุด`);

const GROUP_HEADER: Record<string, string> = {
  color: 'สี',
  substance: 'ประเภทสารเสพติด',
  reason: 'เหตุผลการส่งต่อ',
  hospital: 'โรงพยาบาล',
  status: 'สถานะ',
  gender: 'เพศ',
  source: 'ช่องทาง',
  day: 'วันที่',
  week: 'สัปดาห์ (เริ่มวันจันทร์)',
  month: 'เดือน',
  none: 'รายการ',
};
const groupHeader = (g: string) => GROUP_HEADER[g] ?? g;

export type { WidgetRecord };
