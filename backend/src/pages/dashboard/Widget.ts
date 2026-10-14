/**
 * Widget.ts — ชนิดข้อมูลของ "widget" บน Dashboard (กราฟ/ตัวเลขที่ผู้ดูแลสร้างเองได้)
 *
 * 1 widget = "วัดอะไร (measures)" + "แยกตามอะไร (group_by)" + "ซ้อนสีตามอะไร (split_by)" + "แสดงแบบไหน (chart)" + ช่วงเวลา + ตัวกรอง
 * ผลลัพธ์ (WidgetResult) เป็นตารางตัวเลขแถว x คอลัมน์ ที่หน้าเว็บเอาไปวาดเป็นกราฟ และ Excel ใช้ตารางเดียวกันนี้
 */

/** ค่าที่วัดได้ — ชนิด "ราย" (นับคำขอ) หรือ "วัน" (ระยะเวลาจากส่งคำขอจนยืนยันส่งตัว) */
export const COUNT_MEASURES = ['submitted', 'confirmed', 'declined', 'cancelled', 'waiting', 'called', 'overdue'] as const;
export const DAYS_MEASURES = ['avg_days', 'max_days', 'min_days'] as const;
export const MEASURES = [...COUNT_MEASURES, ...DAYS_MEASURES] as const;
export type Measure = (typeof MEASURES)[number];

export const MEASURE_LABEL: Record<Measure, string> = {
  submitted: 'คำขอที่ส่งเข้ามา',
  confirmed: 'ยืนยันส่งตัว',
  declined: 'ไม่ยืนยัน',
  cancelled: 'ยกเลิก',
  waiting: 'รอคิวอยู่ (ขณะนี้)',
  called: 'เรียกแล้ว รอยืนยัน (ขณะนี้)',
  overdue: 'เรียกแล้วเกินเวลา (ขณะนี้)',
  avg_days: 'ระยะเวลาเฉลี่ยจนยืนยัน',
  max_days: 'ระยะเวลาช้าสุดจนยืนยัน',
  min_days: 'ระยะเวลาเร็วสุดจนยืนยัน',
};

/** ค่าที่ "ขณะนี้" = ดูสถานะปัจจุบัน ไม่ขึ้นกับช่วงเวลา */
export const SNAPSHOT_MEASURES: readonly Measure[] = ['waiting', 'called', 'overdue'];

export const CATEGORY_GROUPS = ['color', 'substance', 'reason', 'hospital', 'status', 'gender', 'source'] as const;
export const TIME_GROUPS = ['day', 'week', 'month'] as const;
export const GROUPS = ['none', ...CATEGORY_GROUPS, ...TIME_GROUPS] as const;
export type Group = (typeof GROUPS)[number];
export type TimeGroup = (typeof TIME_GROUPS)[number];

export const GROUP_LABEL: Record<Group, string> = {
  none: 'ไม่แยก (ตัวเลขเดียว)',
  color: 'สี',
  substance: 'ประเภทสารเสพติด',
  reason: 'เหตุผลการส่งต่อ',
  hospital: 'โรงพยาบาล',
  status: 'สถานะคำขอ',
  gender: 'เพศผู้ป่วย',
  source: 'ช่องทางที่ส่งเข้ามา',
  day: 'รายวัน',
  week: 'รายสัปดาห์',
  month: 'รายเดือน',
};

/** ซ้อนสีได้เฉพาะมิติที่เป็นหมวดหมู่ (ไม่รวมโรงพยาบาลเพราะมีหลายสิบค่า) */
export const SPLITS = ['none', 'color', 'substance', 'reason', 'status', 'gender', 'source'] as const;
export type Split = (typeof SPLITS)[number];

export const CHARTS = ['number', 'tiles', 'bar', 'hbar', 'line', 'donut', 'table'] as const;
export type ChartType = (typeof CHARTS)[number];

export const PERIODS = [7, 30, 90, 180, 365] as const;

export type WidgetFilters = { colors: string[]; substances: string[]; reasons: string[] };

/** ส่วนที่ผู้ใช้กำหนด (ไม่รวม id/ลำดับ) */
export type WidgetConfig = {
  title: string;
  measures: Measure[];
  group_by: Group;
  split_by: Split;
  chart: ChartType;
  /** null = ตามช่วงเวลาที่เลือกบนหน้า Dashboard */
  period_days: number | null;
  filters: WidgetFilters;
  /** จำนวนแถวสูงสุด (ใช้กับกลุ่ม "โรงพยาบาล") */
  row_limit: number;
};

export type WidgetRecord = WidgetConfig & {
  id: number;
  /** ความกว้าง 1-4 (จาก 4 ส่วนของหน้า) */
  width: number;
  sort_order: number;
  is_active: boolean;
};

export type WidgetColumn = { key: string; label: string; color: string | null };
export type WidgetRow = { key: string; label: string; color: string | null; values: (number | null)[]; total: number | null };

export type WidgetResult = {
  unit: 'ราย' | 'วัน';
  /** จำนวนวันของช่วงเวลาที่ใช้จริง */
  days: number;
  /** series = แต่ละคอลัมน์คือ "ค่าที่วัด" ต่างกัน · split = แต่ละคอลัมน์คือส่วนย่อยของแถว (ซ้อนสี) */
  column_mode: 'series' | 'split';
  time_group: TimeGroup | null;
  columns: WidgetColumn[];
  rows: WidgetRow[];
};

export type WidgetWithResult = WidgetRecord & { result: WidgetResult | null };

/** ชนิดหน่วยของชุดค่าที่วัด (ปนกันไม่ได้) */
export const unitOf = (m: Measure): 'ราย' | 'วัน' => ((DAYS_MEASURES as readonly string[]).includes(m) ? 'วัน' : 'ราย');

/** ตรวจว่าการตั้งค่าเข้ากันได้ไหม — คืนข้อความภาษาไทยถ้าไม่ได้ (ใช้ทั้งตอน preview/บันทึก) */
export function checkCompat(c: Pick<WidgetConfig, 'measures' | 'group_by' | 'split_by' | 'chart'>): string | null {
  const units = new Set(c.measures.map(unitOf));
  if (units.size > 1) return 'เลือกค่าที่วัดคนละชนิดรวมกันไม่ได้ (จำนวนราย กับ ระยะเวลาวัน) — แยกเป็นคนละ widget';
  if (new Set(c.measures).size !== c.measures.length) return 'เลือกค่าที่วัดซ้ำกัน';
  const time = (TIME_GROUPS as readonly string[]).includes(c.group_by);
  if (c.chart === 'number' && c.group_by !== 'none') return 'แบบ "ตัวเลข" ใช้ได้เมื่อไม่แยกกลุ่มเท่านั้น';
  if (c.group_by === 'none' && c.chart !== 'number') return 'ถ้าไม่แยกกลุ่ม ต้องแสดงแบบ "ตัวเลข"';
  if (c.chart === 'line' && !time) return 'กราฟเส้นใช้ได้เมื่อแยกตามวัน/สัปดาห์/เดือน';
  if ((c.chart === 'tiles' || c.chart === 'donut') && time) return 'แบบนี้ใช้กับการแยกตามเวลาไม่ได้ — ใช้กราฟเส้นหรือแท่งแทน';
  if (c.chart === 'donut' && (c.measures.length !== 1 || unitOf(c.measures[0]!) !== 'ราย')) return 'แผนภูมิวงกลมใช้ได้กับค่าที่วัด 1 อย่างชนิดจำนวนราย';
  if (c.split_by !== 'none') {
    if (c.group_by === 'none') return 'ซ้อนสีได้เมื่อมีการแยกกลุ่ม';
    if (c.measures.length !== 1) return 'ซ้อนสีได้เมื่อเลือกค่าที่วัดเพียง 1 อย่าง';
    if (c.split_by === c.group_by) return 'ซ้อนสีกับแยกกลุ่มต้องเป็นคนละอย่างกัน';
    if (c.chart === 'number' || c.chart === 'tiles' || c.chart === 'donut') return 'แบบนี้ไม่รองรับการซ้อนสี';
  }
  return null;
}
