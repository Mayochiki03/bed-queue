/**
 * ExportService.ts — สร้างไฟล์ Excel รายงานของระบบ: เลือกได้ว่าจะเอาชุดข้อมูลไหนบ้าง (แต่ละชุด = 1 ชีต หรือหลายชีต)
 *
 *   summary    สรุปภาพรวม: การ์ดตัวเลข + กราฟ 5 แบบ + ตารางที่อยู่เบื้องหลังกราฟ
 *   widgets    ชีตละ 1 กราฟของ Dashboard (ตารางข้อมูล + กราฟรูปแบบเดียวกับบนหน้าเว็บ)
 *   requests   รายการคำขอทั้งหมด ทุกฟิลด์ (ผู้ป่วย/ผู้ขอ/เวลาที่ส่ง-เรียก-ยืนยัน/ผู้ทำ/ช่องทาง/หมายเหตุ)
 *   events     ประวัติเหตุการณ์ทุกครั้งของทุกคำขอ รวมค่าก่อน → หลังเมื่อมีการแก้ไข
 *   requesters ผู้ขอที่ลงทะเบียน (เบอร์ รพ. สถานะ PDPA จำนวนคำขอ)
 *   audit      บันทึกการใช้งานระบบ (ใคร ทำอะไร เมื่อไร) — ผู้ดูแลขึ้นไปเท่านั้น
 * เวลาทั้งหมดแสดงเป็นเวลาไทย พ.ศ. · วันที่เป็นวันที่จริงของ Excel (กรอง/เรียงได้) · ตัวเลขเป็นตัวเลขจริง
 */
import { badRequest, notFound } from '../../core/http';
import { getSetting } from '../../core/settings';
import { formatThaiDate } from '../../core/thaiDate';
import { bangkokDate, fitWidths, ReportBook, type Cell, type ReportSheet } from '../../core/xlsxReport';
import type { ChartSpec } from '../../core/xlsxCharts';
import { MEASURE_LABEL, type WidgetConfig, type WidgetResult } from '../dashboard/Widget';
import type { Period } from '../dashboard/Period';
import type { DashboardService } from '../dashboard/DashboardService';
import type { WidgetService } from '../dashboard/WidgetService';
import { isSnapshot } from '../dashboard/WidgetEngine';
import { STATUS_LABEL, type Status } from '../request/Request';
import type { RequestFilters } from '../request/RequestRepository';
import type { ExportBuildDto, Section } from './ExportDto';
import type { ExportRepository, ExportScope } from './ExportRepository';

const DAY = 86_400_000;
const NO_COLOR = '_NONE';

const STATUS_STYLE: Record<string, { fill: string; color: string }> = {
  WAITING: { fill: 'DBEAFE', color: '1E40AF' },
  CALLED: { fill: 'FEF3C7', color: '92400E' },
  NEED_DATE: { fill: 'FFEDD5', color: '9A3412' },
  CONFIRMED: { fill: 'DCFCE7', color: '166534' },
  DECLINED: { fill: 'E2E8F0', color: '475569' },
  CANCELLED: { fill: 'F1F5F9', color: '64748B' },
};
const GENDER: Record<string, string> = { M: 'ชาย', F: 'หญิง', O: 'อื่น ๆ' };
const SOURCE: Record<string, string> = { APP: 'ผู้ขอส่งเอง', ADMIN: 'เจ้าหน้าที่บันทึก', IMPORT: 'นำเข้าจาก Excel' };
const VIA: Record<string, string> = { LINE: 'ผ่าน LINE', PHONE: 'ทางโทรศัพท์', ADMIN: 'โดยเจ้าหน้าที่', SYSTEM: 'โดยระบบ' };
const EVENT: Record<string, string> = { SUBMITTED: 'ส่งคำขอ', CALLED: 'เรียกคิว', CONFIRMED: 'ยืนยันส่งตัว', DECLINED: 'ไม่ยืนยัน', CANCELLED: 'ยกเลิก', DEFERRED: 'ยืนยันจะมา ขอเลื่อนวัน', REQUEUED: 'คืนคิว', REOPENED: 'เปิดคิวใหม่', EDITED: 'แก้ไขข้อมูล', TRANSFERRED: 'โอนเคส' };
const GROUP_HEADER: Record<string, string> = { color: 'สี', substance: 'ประเภทสารเสพติด', reason: 'เหตุผลการส่งต่อ', hospital: 'โรงพยาบาล', status: 'สถานะ', gender: 'เพศ', source: 'ช่องทาง', day: 'วันที่', week: 'สัปดาห์ (เริ่มวันจันทร์)', month: 'เดือน', none: 'รายการ' };

const statusText = (s: string | null) => (s ? (STATUS_LABEL[s as Status] ?? s) : null);
const round1 = (n: number) => Math.round(n * 10) / 10;
const daysBetween = (a: string | null, b: string | null) => (a && b ? round1(Math.max(0, new Date(b).getTime() - new Date(a).getTime()) / DAY) : null);
const thaiLong = (d: Date) => d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric' });
const thaiStamp = (d: Date) => d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortDay = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' });
const hex = (c: string | null | undefined) => (c ? c.replace('#', '').toUpperCase() : undefined);

type Actor = { full_name: string; role: string };

export class ExportService {
  constructor(
    private repo: ExportRepository,
    private dashboard: DashboardService,
    private widgets: WidgetService,
  ) {}

  /** ข้อมูลสำหรับหน้าต่างเลือกส่งออก */
  async options(canAudit: boolean) {
    return { widgets: (await this.widgets.all()).map((w) => ({ id: w.id, title: w.title, chart: w.chart, is_active: w.is_active })), can_audit: canAudit, default_days: await getSetting<number>('dashboard_default_days') };
  }

  async build(dto: ExportBuildDto, actor: Actor, now = new Date()): Promise<{ filename: string; buffer: Buffer }> {
    const sections = new Set<Section>(dto.sections);
    const canAudit = actor.role === 'ADMIN' || actor.role === 'DEV';
    if (sections.has('audit') && !canAudit) throw badRequest('ส่งออกบันทึกการใช้งานได้เฉพาะผู้ดูแลระบบ');

    const period = await this.dashboard.resolve(dto, now);
    const days = period.days;
    const since = period.since;
    const untilIso = period.until?.toISOString();
    const scope: ExportScope = dto.filters ? { filters: dto.filters as RequestFilters } : dto.scope === 'period' ? { sinceIso: since.toISOString(), ...(untilIso ? { untilIso } : {}) } : {};
    const spanText = period.custom ? `${thaiLong(since)} – ${thaiLong(new Date((period.until ?? now).getTime() - 1))}` : `${thaiLong(since)} – ${thaiLong(now)}`;
    const scopeText = dto.filters ? 'ตามตัวกรองที่เลือกในหน้าประวัติคำขอ' : dto.scope === 'period' ? `ส่งคำขอในช่วง ${period.label} (${spanText})` : 'ทั้งหมดตั้งแต่เริ่มใช้ระบบ';

    const lookups = await this.repo.lookups();
    const lk = (type: string, code: string | null) => (code ? (lookups.find((l) => l.type === type && l.code === code)?.label ?? code) : null);
    const colorOf = (code: string | null) => hex(lookups.find((l) => l.type === 'COLOR' && l.code === code)?.color);

    const book = new ReportBook('รายงานระบบคิวขอเตียง');
    const meta = `สร้างเมื่อ ${thaiStamp(now)} · โดย ${actor.full_name}`;
    const colorCodes = lookups.filter((l) => l.type === 'COLOR').map((l) => l.code);
    const ctx: Ctx = { book, lk, colorOf, meta, days, period, now, scope, scopeText, colorCodes, colorActive: new Set(colorCodes) };

    if (sections.has('summary')) await this.summarySheet(ctx);
    if (sections.has('widgets')) await this.widgetSheets(ctx, dto);
    if (sections.has('requests')) await this.requestSheet(ctx);
    if (sections.has('events')) await this.eventSheet(ctx);
    if (sections.has('requesters')) await this.requesterSheet(ctx);
    if (sections.has('audit')) await this.auditSheet(ctx, dto.scope === 'period' ? since.toISOString() : undefined, dto.scope === 'period' ? untilIso : undefined);

    const stamp = bangkokDate(now.toISOString())!.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const only = dto.sections.length === 1 ? ({ summary: 'สรุปภาพรวม', widgets: 'กราฟ', requests: 'รายการคำขอ', events: 'ประวัติเหตุการณ์', requesters: 'ผู้ขอ', audit: 'บันทึกการใช้งาน' } as const)[dto.sections[0]!] : 'ข้อมูล';
    return { filename: `คิวขอเตียง-${only}-${stamp}.xlsx`, buffer: await book.build() };
  }

  // ====================== สรุปภาพรวม ======================
  private async summarySheet(c: Ctx) {
    const sum = await this.dashboard.summary({}, c.now, c.period);
    const s = c.book.sheet('สรุปภาพรวม', { widths: [30, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14] });
    s.banner('รายงานสรุปภาพรวม ระบบคิวขอเตียง', `ข้อมูลช่วง ${c.period.label} · ${c.meta}`);
    const q = sum.queue;
    const p = sum.period;
    s.kpis(4, [
      { label: 'รอคิวอยู่ (ขณะนี้)', value: q.waiting, note: 'ยังไม่ถูกเรียก' },
      { label: 'เรียกแล้ว รอยืนยัน', value: q.called, note: 'ขณะนี้', color: 'B45309' },
      { label: 'เรียกแล้วเกินเวลา', value: q.overdue, note: 'ควรโทรตาม', color: q.overdue > 0 ? 'B42318' : '64748B' },
      { label: `ส่งคำขอ (${c.period.label})`, value: p.submitted, note: 'ทุกสถานะ' },
      { label: 'ยืนยันส่งตัว', value: p.confirmed, note: `ในกลุ่มที่ส่งช่วงนี้`, color: '166534' },
      { label: 'ไม่ยืนยัน', value: p.declined, color: '475569' },
      { label: 'ยกเลิก', value: p.cancelled, color: '475569' },
      { label: 'เฉลี่ยจนยืนยัน (วัน)', value: p.avg_days_to_confirm, note: p.min_days_to_confirm !== null ? `เร็วสุด ${p.min_days_to_confirm} · ช้าสุด ${p.max_days_to_confirm}` : 'ยังไม่มีข้อมูล', fmt: '0.0' },
    ]);
    s.note(8, 'ตัวเลข "รอคิว/เรียกแล้ว/เกินเวลา" คือสถานะ ณ ตอนสร้างไฟล์ ส่วนที่เหลือนับจากคำขอที่ส่งเข้ามาในช่วงเวลาที่เลือก — ตารางข้างล่างคือข้อมูลเบื้องหลังกราฟ แก้ตัวเลขแล้วกราฟเปลี่ยนตาม');

    // ---- ตารางเบื้องหลัง (เริ่มแถว 62) ----
    let r = 62;
    s.sectionTitle(r - 1, 'ข้อมูลเบื้องหลังกราฟ', 12);

    // สีเรียงตามข้อมูลหลัก (แดง ส้ม เหลือง เขียว) และแสดงสีที่ไม่มีคิวเป็น 0 ด้วย
    const byColor = new Map(sum.queue.by_color.map((x) => [x.code, x]));
    const orderedCodes = [...c.colorCodes.filter((code) => c.colorActive.has(code) || byColor.has(code)), ...(byColor.has(NO_COLOR) ? [NO_COLOR] : [])];
    const colorRows = orderedCodes.map((code) => byColor.get(code) ?? { code, count: 0, oldest_days: null });
    const t1 = s.table(r, 1, ['สี', 'รอคิว (ราย)', 'รอนานสุด (วัน)'], colorRows.map((x) => [x.code === NO_COLOR ? 'ไม่ระบุสี' : (c.lk('COLOR', x.code) ?? x.code), x.count, x.oldest_days]), {
      style: (ri, ci) => (ci === 0 ? { fill: hex(c.colorOf(colorRows[ri]!.code)) ?? 'F1F5F9', color: colorRows[ri]!.code === NO_COLOR ? '1E293B' : 'FFFFFF', bold: true } : undefined),
      numFmt: { 2: '0.0' },
    });
    r += Math.max(colorRows.length, 1) + 3;

    const open = Math.max(0, p.submitted - p.confirmed - p.declined - p.cancelled);
    const statusRows: [string, number, string][] = [
      ['ยืนยันส่งตัว', p.confirmed, '16A34A'],
      ['ไม่ยืนยัน', p.declined, '64748B'],
      ['ยกเลิก', p.cancelled, 'CBD5E1'],
      ['ยังไม่จบ (รอคิว/เรียกแล้ว)', open, '2A78D6'],
    ];
    const t2 = s.table(r, 1, ['ผลลัพธ์ของคำขอที่ส่งช่วงนี้', 'ราย', 'สัดส่วน'], statusRows.map(([l, n]) => [l, n, p.submitted ? n / p.submitted : 0]), { numFmt: { 2: '0.0%' } });
    r += statusRows.length + 3;

    const subRows = sum.substances;
    const t3 = s.table(r, 1, ['ประเภทสารเสพติด', 'ส่งเข้า (ราย)', 'ยืนยัน (ราย)', 'เฉลี่ยจนยืนยัน (วัน)', 'เร็วสุด (วัน)', 'ช้าสุด (วัน)'], subRows.map((x) => [x.code === NO_COLOR ? 'ไม่ระบุ' : (c.lk('SUBSTANCE', x.code) ?? x.code), x.submitted, x.confirmed, x.avg_days, x.min_days, x.max_days]), { numFmt: { 3: '0.0', 4: '0.0', 5: '0.0' } });
    r += Math.max(subRows.length, 1) + 3;

    const colorCodes = orderedCodes.filter((x) => x !== NO_COLOR);
    const hasNone = sum.hospitals.some((h) => (h.by_color[NO_COLOR] ?? 0) > 0);
    const hospCols = [...colorCodes, ...(hasNone ? [NO_COLOR] : [])];
    const hospRows = sum.hospitals;
    const t4 = s.table(r, 1, ['โรงพยาบาล', ...hospCols.map((x) => (x === NO_COLOR ? 'ไม่ระบุสี' : (c.lk('COLOR', x) ?? x))), 'รวม (ราย)'], hospRows.map((h) => [h.name, ...hospCols.map((x) => h.by_color[x] ?? 0), h.total]));
    r += Math.max(hospRows.length, 1) + 3;

    const t5 = s.table(r, 1, ['วันที่', 'ส่งคำขอ', 'ยืนยันส่งตัว'], sum.trend.map((x) => [shortDay(x.date), x.submitted, x.confirmed]));

    // ---- กราฟ (แถว 10 ลงไป) ----
    const noData = (n: number) => n === 0;
    const colorsHex = colorRows.map((x) => (x.code === NO_COLOR ? '94A3B8' : (c.colorOf(x.code) ?? '64748B')));
    if (!noData(colorRows.length)) s.chart({ kind: 'col', title: 'คิวที่รออยู่ ตามสี', catRef: t1.col(0), cats: colorRows.map((x) => (x.code === NO_COLOR ? 'ไม่ระบุสี' : (c.lk('COLOR', x.code) ?? x.code))), series: [{ name: 'รอคิว (ราย)', nameRef: t1.head(1), valRef: t1.col(1), values: colorRows.map((x) => x.count), pointColors: colorsHex }], anchor: { col: 0, row: 9, cols: 4, rows: 17 }, valueTitle: 'ราย' });
    s.chart({ kind: 'doughnut', title: `ผลลัพธ์ของคำขอที่ส่ง · ${c.period.label}`, catRef: t2.col(0), cats: statusRows.map((x) => x[0]), series: [{ name: 'ราย', nameRef: t2.head(1), valRef: t2.col(1), values: statusRows.map((x) => x[1]), pointColors: statusRows.map((x) => x[2]) }], anchor: { col: 4, row: 9, cols: 6, rows: 17 } });
    if (hospRows.length) s.chart({ kind: 'bar', stacked: true, title: 'โรงพยาบาลที่ส่งเคสมากสุด (แยกตามสี)', catRef: t4.col(0), cats: hospRows.map((h) => h.name), series: hospCols.map((x, i) => ({ name: x === NO_COLOR ? 'ไม่ระบุสี' : (c.lk('COLOR', x) ?? x), nameRef: t4.head(1 + i), valRef: t4.col(1 + i), values: hospRows.map((h) => h.by_color[x] ?? 0), color: x === NO_COLOR ? '94A3B8' : c.colorOf(x) })), anchor: { col: 0, row: 27, cols: 4, rows: 17 }, valueTitle: 'ราย' });
    if (subRows.length) s.chart({ kind: 'col', title: 'ประเภทสารเสพติด: ส่งเข้า เทียบ ยืนยัน', catRef: t3.col(0), cats: subRows.map((x) => (x.code === NO_COLOR ? 'ไม่ระบุ' : (c.lk('SUBSTANCE', x.code) ?? x.code))), series: [{ name: 'ส่งเข้า (ราย)', nameRef: t3.head(1), valRef: t3.col(1), values: subRows.map((x) => x.submitted), color: '2A78D6' }, { name: 'ยืนยัน (ราย)', nameRef: t3.head(2), valRef: t3.col(2), values: subRows.map((x) => x.confirmed), color: '1BAF7A' }], anchor: { col: 4, row: 27, cols: 6, rows: 17 }, valueTitle: 'ราย' });
    s.chart({ kind: 'line', title: 'คำขอรายวัน: ส่งเข้า เทียบ ยืนยันส่งตัว', catRef: t5.col(0), cats: sum.trend.map((x) => shortDay(x.date)), series: [{ name: 'ส่งคำขอ', nameRef: t5.head(1), valRef: t5.col(1), values: sum.trend.map((x) => x.submitted), color: '2A78D6' }, { name: 'ยืนยันส่งตัว', nameRef: t5.head(2), valRef: t5.col(2), values: sum.trend.map((x) => x.confirmed), color: '1BAF7A' }], anchor: { col: 0, row: 45, cols: 10, rows: 15 }, valueTitle: 'ราย', labels: false });
  }

  // ====================== กราฟของ Dashboard (ชีตละอัน) ======================
  private async widgetSheets(c: Ctx, dto: ExportBuildDto) {
    let list: (WidgetConfig & { id?: number })[];
    if (dto.config) list = [dto.config as WidgetConfig];
    else {
      list = await this.widgets.pick(dto.widget_ids);
      if (dto.widget_ids.length && !list.length) throw notFound('ไม่พบกราฟที่เลือก (อาจถูกลบไปแล้ว)');
    }
    if (!list.length) return;
    const { results } = await this.widgets.computeMany(list, c.period, c.now);

    const kpis = list.map((w, i) => ({ w, r: results[i]! })).filter((x) => x.w.chart === 'number');
    if (kpis.length) {
      const s = c.book.sheet('ตัวเลขสรุป', { widths: [44, 14, 12, 28] });
      s.banner('ตัวเลขสรุปจาก Dashboard', c.meta, 4);
      const rows: Cell[][] = kpis.flatMap(({ w, r }) => r.columns.map((col, ci): Cell[] => [r.columns.length > 1 ? `${w.title} – ${col.label}` : w.title, r.rows[0]?.values[ci] ?? null, r.unit, periodText(w.measures, r.period_label)]));
      s.table(4, 1, ['รายการ', 'ค่า', 'หน่วย', 'ช่วงเวลา'], rows, { numFmt: { 1: '0.0' } });
    }

    list.forEach((w, i) => {
      if (w.chart === 'number') return;
      const r = results[i]!;
      const withTotal = r.unit === 'ราย' && r.columns.length > 1;
      const header = [GROUP_HEADER[w.group_by] ?? w.group_by, ...r.columns.map((col) => `${col.label} (${r.unit})`), ...(withTotal ? ['รวม'] : [])];
      const rows: Cell[][] = r.rows.map((row) => [row.label, ...row.values, ...(withTotal ? [row.total] : [])]);
      const wide = header.length > 6;
      const s = c.book.sheet(`กราฟ-${w.title || 'widget'}`, { widths: [32, ...header.slice(1).map(() => 16)] });
      s.banner(w.title || 'กราฟ', `${periodText(w.measures, r.period_label)} · ${c.meta}`, Math.max(8, header.length));
      const t = s.table(4, 1, header, rows, {
        numFmt: r.unit === 'วัน' ? Object.fromEntries(r.columns.map((_, ci) => [ci + 1, '0.0'])) : undefined,
        style: (ri, ci) => (ci === 0 && r.rows[ri]?.color ? { fill: hex(r.rows[ri]!.color)!, color: 'FFFFFF', bold: true } : undefined),
      });
      const spec = widgetChart(w, r, t, wide ? { col: 0, row: 6 + rows.length, cols: Math.min(10, header.length + 3), rows: 18 } : { col: header.length + 1, row: 3, cols: 9, rows: 19 });
      if (spec) s.chart(spec);
    });
  }

  // ====================== รายการคำขอ ======================
  private async requestSheet(c: Ctx) {
    const [rows, edits, notes] = await Promise.all([this.repo.requests(c.scope), this.repo.editCounts(), this.repo.closingNotes()]);
    const header = [
      'เลขคำขอ', 'สถานะ', 'ชื่อผู้ป่วย', 'เพศ', 'อายุ (ปี)', 'จังหวัด', 'เบอร์ผู้ป่วย/ญาติ', 'สี', 'ประเภทสารเสพติด', 'เหตุผลการส่งต่อ', 'หมายเหตุ',
      'รหัส รพ.', 'โรงพยาบาลต้นทาง', 'ผู้ขอ', 'เบอร์ผู้ขอ', 'เบอร์สำรองผู้ขอ', 'ช่องทางที่ส่งเข้า',
      'เวลาที่ส่งคำขอ', 'เวลาที่เรียกคิว (ล่าสุด)', 'เรียกคิวกี่ครั้ง', 'เรียกโดย', 'เวลาที่ผู้ขอตอบ', 'เวลาที่ปิดเคส', 'ได้ผลจาก', 'ปิดเคสโดย', 'หมายเหตุตอนปิดเคส',
      'รอจากส่งถึงเรียก (วัน)', 'รอจากส่งถึงปิดเคส (วัน)', 'แก้ไขกี่ครั้ง', 'บันทึกเข้าระบบเมื่อ', 'แก้ไขล่าสุดเมื่อ', 'วันที่เตียงว่าง / วันที่ส่งตัว',
    ];
    const data: Cell[][] = rows.map((r) => [
      r.request_no ?? `#${r.id}`, statusText(r.status), r.patient_name, r.patient_gender ? (GENDER[r.patient_gender] ?? r.patient_gender) : null, r.patient_age, r.patient_province, r.patient_phone,
      c.lk('COLOR', r.color_code), c.lk('SUBSTANCE', r.substance_code), c.lk('REASON', r.reason_code), r.note,
      r.hospital_code, r.hospital_name, r.requester_name, r.requester_phone, r.requester_phone2, SOURCE[r.source] ?? r.source,
      bangkokDate(r.submitted_at), bangkokDate(r.called_at), r.call_count || null, r.called_by_name, bangkokDate(r.responded_at), bangkokDate(r.resolved_at), r.resolved_via ? (VIA[r.resolved_via] ?? r.resolved_via) : null, r.resolved_by_name, notes.get(r.id) ?? null,
      daysBetween(r.submitted_at, r.called_at), daysBetween(r.submitted_at, r.resolved_at), edits.get(r.id) ?? null, bangkokDate(r.created_at), bangkokDate(r.updated_at), r.bed_date ? formatThaiDate(r.bed_date) : null,
    ]);
    const s = c.book.sheet('คำขอ', { widths: fitWidths(header, data, 9, 40), tab: '2A78D6' });
    s.banner('รายการคำขอเตียงทั้งหมด', `${c.scopeText} · ${rows.length.toLocaleString('th-TH')} รายการ · ${c.meta}`, 14);
    s.note(3, 'ข้อมูลผู้ป่วยเป็นข้อมูลส่วนบุคคล ใช้เพื่อประสานงานส่งตัวเท่านั้น — เก็บรักษาไฟล์นี้อย่างปลอดภัย ไม่ส่งต่อนอกหน่วยงาน', 14);
    s.table(4, 1, header, data, {
      autoFilter: true,
      freeze: true,
      wrapCols: [10, 25],
      numFmt: { 26: '0.0', 27: '0.0' },
      style: (ri, ci) => {
        if (ci === 1) {
          const st = STATUS_STYLE[rows[ri]!.status];
          return st ? { ...st, bold: true } : undefined;
        }
        if (ci === 7 && rows[ri]!.color_code) {
          const f = c.colorOf(rows[ri]!.color_code);
          return f ? { fill: f, color: 'FFFFFF', bold: true } : undefined;
        }
        return undefined;
      },
    });
    s.ws.views = [{ state: 'frozen', ySplit: 4, xSplit: 3, showGridLines: false }];
  }

  // ====================== ประวัติเหตุการณ์ ======================
  private async eventSheet(c: Ctx) {
    const rows = await this.repo.events(c.scope);
    const label = (field: string, v: string | null) => {
      if (v === null) return '(ว่าง)';
      if (field === 'color_code') return c.lk('COLOR', v) ?? v;
      if (field === 'substance_code') return c.lk('SUBSTANCE', v) ?? v;
      if (field === 'reason_code') return c.lk('REASON', v) ?? v;
      if (field === 'patient_gender') return GENDER[v] ?? v;
      if (field === 'submitted_at') return thaiStamp(new Date(v));
      return v;
    };
    const diff = (json: string | null): string | null => {
      if (!json) return null;
      try {
        return (JSON.parse(json) as { field: string; label: string; from: string | null; to: string | null }[]).map((x) => `${x.label}: ${label(x.field, x.from)} → ${label(x.field, x.to)}`).join('\n');
      } catch {
        return null;
      }
    };
    const header = ['เวลา', 'เลขคำขอ', 'ชื่อผู้ป่วย', 'โรงพยาบาล', 'เหตุการณ์', 'จากสถานะ', 'เป็นสถานะ', 'ผู้ทำรายการ', 'ช่องทาง', 'รายละเอียด / หมายเหตุ', 'ค่าที่เปลี่ยน (ก่อน → หลัง)'];
    const data: Cell[][] = rows.map((e) => [bangkokDate(e.created_at), e.request_no, e.patient_name, e.hospital_name, EVENT[e.event] ?? e.event, statusText(e.from_status), statusText(e.to_status), e.by_label, e.via ? (VIA[e.via] ?? e.via) : null, e.detail, diff(e.changes)]);
    const s = c.book.sheet('ประวัติเหตุการณ์', { widths: fitWidths(header, data, 10, 48), tab: 'D98A1C' });
    s.banner('ประวัติเหตุการณ์ของทุกคำขอ', `${c.scopeText} · ${rows.length.toLocaleString('th-TH')} เหตุการณ์ · ${c.meta}`, 11);
    s.note(3, 'ทุกการส่ง/เรียก/ยืนยัน/ยกเลิก/แก้ไข/โอนเคส ถูกบันทึกไว้ว่าใครทำ เมื่อไร ผ่านช่องทางไหน — แก้ไขข้อมูลจะเห็นค่าก่อนและหลัง', 11);
    s.table(4, 1, header, data, { autoFilter: true, wrapCols: [9, 10], style: (_ri, ci, v) => (ci === 4 && typeof v === 'string' ? { bold: true } : undefined) });
    s.ws.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  }

  // ====================== ผู้ขอ ======================
  private async requesterSheet(c: Ctx) {
    const { rows, total, open } = await this.repo.requesters();
    const header = ['ชื่อ-สกุล', 'โรงพยาบาล', 'รหัส รพ.', 'เบอร์โทร', 'เบอร์สำรอง', 'ลงทะเบียนผ่าน LINE', 'ชื่อใน LINE', 'รับทราบเรื่องข้อมูลส่วนบุคคลเมื่อ', 'สถานะ', 'ใช้งานล่าสุด', 'ลงทะเบียนเมื่อ', 'คำขอทั้งหมด (ราย)', 'ที่ยังไม่จบ (ราย)'];
    const data: Cell[][] = rows.map((r) => [
      r.full_name, r.hospital_name, r.hospital_code, r.phone, r.phone2, r.line_user_id ? ((r.line_user_id.startsWith('MOCK-') || r.line_user_id.startsWith('DEMO-')) ? 'ผู้ขอจำลอง (ทดสอบ)' : 'ใช่') : 'ไม่ใช่ (เจ้าหน้าที่บันทึก)', r.display_name,
      bangkokDate(r.pdpa_accepted_at), r.is_blocked ? 'ระงับการใช้งาน' : 'ปกติ', bangkokDate(r.last_seen_at), bangkokDate(r.created_at), total.get(r.id) ?? 0, open.get(r.id) ?? 0,
    ]);
    const s = c.book.sheet('ผู้ขอ', { widths: fitWidths(header, data, 10, 40), tab: '7C5CD6' });
    s.banner('ผู้ขอที่ลงทะเบียน', `${rows.length.toLocaleString('th-TH')} คน · ${c.meta}`, 13);
    s.table(4, 1, header, data, { autoFilter: true, style: (ri, ci) => (ci === 8 && rows[ri]!.is_blocked ? { fill: 'FDE8E6', color: 'B42318', bold: true } : undefined) });
    s.ws.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  }

  // ====================== บันทึกการใช้งาน ======================
  private async auditSheet(c: Ctx, sinceIso: string | undefined, untilIso?: string) {
    const rows = await this.repo.audit(sinceIso, untilIso);
    const header = ['เวลา', 'ผู้ใช้', 'หน้า', 'การกระทำ', 'ผล (HTTP)', 'Path', 'IP', 'รายละเอียดที่บันทึก'];
    const data: Cell[][] = rows.map((r) => [bangkokDate(r.created_at), r.username, r.page, r.action, r.status_code, r.path, r.ip, r.detail]);
    const s = c.book.sheet('บันทึกการใช้งาน', { widths: [20, 18, 14, 16, 11, 34, 16, 60], tab: '64748B' });
    s.banner('บันทึกการใช้งานระบบ (audit log)', `${sinceIso ? 'เฉพาะช่วงที่เลือก' : 'ทั้งหมด'} · ${rows.length.toLocaleString('th-TH')} รายการ · ${c.meta}`, 8);
    s.table(4, 1, header, data, {
      autoFilter: true,
      wrapCols: [7],
      style: (ri, ci) => (ci === 4 ? (rows[ri]!.status_code < 400 ? { fill: 'DCFCE7', color: '166534' } : { fill: 'FDE8E6', color: 'B42318', bold: true }) : undefined),
    });
    s.ws.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  }
}

type Ctx = {
  book: ReportBook;
  lk: (type: string, code: string | null) => string | null;
  colorOf: (code: string | null) => string | undefined;
  meta: string;
  days: number;
  period: Period;
  now: Date;
  scope: ExportScope;
  scopeText: string;
  colorCodes: string[];
  colorActive: Set<string>;
};

const periodText = (measures: readonly (keyof typeof MEASURE_LABEL)[], label: string) => (isSnapshot(measures) ? 'ขณะนี้ (ไม่ขึ้นกับช่วงเวลา)' : label);

/** กราฟของ widget → กราฟ Excel รูปแบบเดียวกัน (ตัวเลข/ตารางไม่มีกราฟ) */
function widgetChart(w: WidgetConfig, r: WidgetResult, t: ReturnType<ReportSheet['table']>, anchor: ChartSpec['anchor']): Omit<ChartSpec, 'sheet'> | null {
  if (!r.rows.length || w.chart === 'table' || w.chart === 'number') return null;
  const kind: ChartSpec['kind'] = ({ bar: 'col', tiles: 'col', hbar: 'bar', line: 'line', donut: 'doughnut' } as const)[w.chart];
  const cats = r.rows.map((row) => row.label);
  const rowColors = r.columns.length === 1 && r.rows.some((row) => row.color) ? r.rows.map((row) => hex(row.color) ?? '94A3B8') : undefined;
  const series = (kind === 'doughnut' ? r.columns.slice(0, 1) : r.columns).map((col, i) => ({ name: col.label, nameRef: t.head(1 + i), valRef: t.col(1 + i), values: r.rows.map((row) => row.values[i] ?? null), color: hex(col.color), pointColors: rowColors }));
  return { kind, title: w.title || 'กราฟ', stacked: r.column_mode === 'split' && kind !== 'line' && kind !== 'doughnut', catRef: t.col(0), cats, series, anchor, valueTitle: r.unit };
}
