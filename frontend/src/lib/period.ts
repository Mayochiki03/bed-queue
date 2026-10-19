/** lib/period.ts — ช่วงเวลาที่เลือกบน Dashboard (ใช้ร่วมกับตัวเลข กราฟ และการส่งออก Excel) */
export type PeriodParams = { days?: number; preset?: 'today' | 'yesterday' | 'all'; date_from?: string; date_to?: string };

export type PeriodChoice = { kind: 'days'; days: number } | { kind: 'preset'; preset: 'today' | 'yesterday' | 'all' } | { kind: 'custom'; from: string; to: string };

export const DAY_OPTIONS = [7, 30, 90];

export function toParams(c: PeriodChoice): PeriodParams {
  if (c.kind === 'days') return { days: c.days };
  if (c.kind === 'preset') return { preset: c.preset };
  return { date_from: c.from, ...(c.to ? { date_to: c.to } : {}) };
}

/** ค่าที่ใช้ในช่องเลือก (select) */
export function choiceKey(c: PeriodChoice): string {
  return c.kind === 'days' ? `d${c.days}` : c.kind === 'preset' ? c.preset : 'custom';
}

export function fromKey(key: string, prev: PeriodChoice, todayIso: string): PeriodChoice {
  if (key === 'custom') return prev.kind === 'custom' ? prev : { kind: 'custom', from: todayIso, to: todayIso };
  if (key === 'today' || key === 'yesterday' || key === 'all') return { kind: 'preset', preset: key };
  return { kind: 'days', days: Number(key.slice(1)) };
}

/** วันนี้ตามเวลาไทย YYYY-MM-DD */
export function todayThai(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** ช่วงที่เลือกครบพอจะส่งไปคำนวณ (กำหนดเอง ต้องมีวันเริ่ม และวันสิ้นสุดไม่ก่อนวันเริ่ม) */
export function isValid(c: PeriodChoice): boolean {
  return c.kind !== 'custom' || (/^\d{4}-\d{2}-\d{2}$/.test(c.from) && (!c.to || c.to >= c.from));
}
