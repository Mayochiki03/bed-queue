/**
 * lib/widgetRules.ts — ตัวเลือกของ widget บน Dashboard (ชื่อไทย) + กติกาว่าตัวเลือกไหนใช้ร่วมกันได้
 * ต้องตรงกับ backend/src/pages/dashboard/Widget.ts (ฝั่งเซิร์ฟเวอร์ตรวจซ้ำเสมอ — ที่นี่ไว้ปิดปุ่มที่ใช้ไม่ได้และบอกเหตุผล)
 */
export const COUNT_MEASURES = ['submitted', 'confirmed', 'declined', 'cancelled', 'waiting', 'called', 'overdue'] as const;
export const DAYS_MEASURES = ['avg_days', 'max_days', 'min_days'] as const;
export type Measure = (typeof COUNT_MEASURES)[number] | (typeof DAYS_MEASURES)[number];

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
export const SNAPSHOT_MEASURES: Measure[] = ['waiting', 'called', 'overdue'];

export const CATEGORY_GROUPS = ['color', 'substance', 'reason', 'hospital', 'status', 'gender', 'source'] as const;
export const TIME_GROUPS = ['day', 'week', 'month'] as const;
export type Group = 'none' | (typeof CATEGORY_GROUPS)[number] | (typeof TIME_GROUPS)[number];
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
export const SPLITS = ['none', 'color', 'substance', 'reason', 'status', 'gender', 'source'] as const;
export type Split = (typeof SPLITS)[number];

export const CHARTS = ['number', 'tiles', 'bar', 'hbar', 'line', 'donut', 'table'] as const;
export type ChartType = (typeof CHARTS)[number];
export const CHART_LABEL: Record<ChartType, string> = { number: 'ตัวเลข', tiles: 'การ์ดตัวเลข', bar: 'แท่งแนวตั้ง', hbar: 'แท่งแนวนอน', line: 'กราฟเส้น', donut: 'วงกลม', table: 'ตาราง' };

export const PERIODS = [7, 30, 90, 180, 365] as const;
export const WIDTH_LABEL: Record<number, string> = { 1: '1/4', 2: '2/4', 3: '3/4', 4: 'เต็มแถว' };

export type WidgetFilters = { colors: string[]; substances: string[]; reasons: string[] };
export type WidgetConfig = {
  title: string;
  measures: Measure[];
  group_by: Group;
  split_by: Split;
  chart: ChartType;
  period_days: number | null;
  filters: WidgetFilters;
  row_limit: number;
};

export const unitOf = (m: Measure): 'ราย' | 'วัน' => ((DAYS_MEASURES as readonly string[]).includes(m) ? 'วัน' : 'ราย');
export const isTimeGroup = (g: Group) => (TIME_GROUPS as readonly string[]).includes(g);
export const isSnapshot = (ms: Measure[]) => ms.length > 0 && ms.every((m) => SNAPSHOT_MEASURES.includes(m));

/** เหตุผลที่ตัวเลือกนี้ใช้ไม่ได้ (null = ใช้ได้) — ตรงกับ checkCompat ฝั่งเซิร์ฟเวอร์ */
export function checkCompat(c: Pick<WidgetConfig, 'measures' | 'group_by' | 'split_by' | 'chart'>): string | null {
  if (c.measures.length === 0) return 'เลือกค่าที่วัดอย่างน้อย 1 อย่าง';
  if (new Set(c.measures.map(unitOf)).size > 1) return 'ค่าที่วัดคนละชนิด (จำนวนราย กับ ระยะเวลาวัน) รวมกันไม่ได้';
  const time = isTimeGroup(c.group_by);
  if (c.chart === 'number' && c.group_by !== 'none') return 'แบบ "ตัวเลข" ใช้ได้เมื่อไม่แยกกลุ่มเท่านั้น';
  if (c.group_by === 'none' && c.chart !== 'number') return 'ถ้าไม่แยกกลุ่ม ต้องแสดงแบบ "ตัวเลข"';
  if (c.chart === 'line' && !time) return 'กราฟเส้นใช้ได้เมื่อแยกตามวัน/สัปดาห์/เดือน';
  if ((c.chart === 'tiles' || c.chart === 'donut') && time) return 'แบบนี้ใช้กับการแยกตามเวลาไม่ได้';
  if (c.chart === 'donut' && (c.measures.length !== 1 || unitOf(c.measures[0]!) !== 'ราย')) return 'วงกลมใช้ได้กับค่าที่วัด 1 อย่างชนิดจำนวนราย';
  if (c.split_by !== 'none') {
    if (c.group_by === 'none') return 'ซ้อนสีได้เมื่อมีการแยกกลุ่ม';
    if (c.measures.length !== 1) return 'ซ้อนสีได้เมื่อเลือกค่าที่วัด 1 อย่าง';
    if (c.split_by === c.group_by) return 'ซ้อนสีกับแยกกลุ่มต้องเป็นคนละอย่างกัน';
    if (c.chart === 'number' || c.chart === 'tiles' || c.chart === 'donut') return 'แบบนี้ไม่รองรับการซ้อนสี';
  }
  return null;
}

/** เปลี่ยนการแยกกลุ่มแล้ว เลือกรูปแบบที่เหมาะให้ถ้าของเดิมใช้ไม่ได้ */
export function suggestChart(c: Pick<WidgetConfig, 'measures' | 'group_by' | 'split_by' | 'chart'>): ChartType {
  if (!checkCompat(c)) return c.chart;
  const order: ChartType[] = c.group_by === 'none' ? ['number'] : isTimeGroup(c.group_by) ? ['line', 'bar', 'table'] : ['hbar', 'bar', 'tiles', 'donut', 'table'];
  return order.find((ch) => !checkCompat({ ...c, chart: ch })) ?? c.chart;
}
