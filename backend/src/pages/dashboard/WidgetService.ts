/**
 * WidgetService.ts — จัดการ widget ของ Dashboard (สร้าง/แก้/ลบ/จัดวาง) + คำนวณข้อมูล + ส่งออก Excel
 * widget ใช้ร่วมกันทุกคน (ผู้ดูแลจัดหน้าให้ทุกคนเห็นเหมือนกัน) · ดูข้อมูล/ส่งออกได้ทุกคน, แก้ไขได้เฉพาะ ADMIN ขึ้นไป (กั้นที่ Controller)
 */
import { badRequest, notFound } from '../../core/http';
import { getSetting } from '../../core/settings';
import { checkCompat, type WidgetConfig, type WidgetRecord, type WidgetResult, type WidgetWithResult } from './Widget';
import type { WidgetSaveDto } from './WidgetDto';
import { computeWidget, type EngineContext } from './WidgetEngine';
import type { WidgetRepository } from './WidgetRepository';

const DAY = 86_400_000;
const MAX_WIDGETS = 60;

export class WidgetService {
  constructor(private repo: WidgetRepository) {}

  /** ตัวช่วยคำนวณหลาย widget พร้อมกัน — ดึงแถวจากฐานข้อมูลครั้งเดียวด้วยช่วงเวลายาวที่สุด */
  async computeMany(widgets: WidgetConfig[], days: number | undefined, now: Date): Promise<{ results: WidgetResult[]; days: number }> {
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
    const { results, days: used } = await this.computeMany(active, days, now);
    const byId = new Map(active.map((w, i) => [w.id, results[i]!]));
    return { days: used, widgets: all.map((w) => ({ ...w, result: byId.get(w.id) ?? null })) };
  }

  /** widget ที่จะส่งออก: ระบุ id ได้ ไม่ระบุ = ทุกอัน ที่แสดงอยู่ */
  pick(ids: number[]): Promise<WidgetRecord[]> {
    return ids.length ? this.repo.findMany(ids) : this.repo.list(true);
  }

  /** ทุก widget (รวมที่ซ่อน) ไว้ให้หน้าต่างเลือกข้อมูลส่งออกแสดงรายการ */
  all(): Promise<WidgetRecord[]> {
    return this.repo.list(false);
  }

  async preview(config: WidgetConfig, days: number | undefined, now = new Date()): Promise<WidgetResult> {
    this.validate(config);
    return (await this.computeMany([config], days, now)).results[0]!;
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
}

export type { WidgetRecord };
