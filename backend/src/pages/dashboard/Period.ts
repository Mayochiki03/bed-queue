/**
 * Period.ts — ช่วงเวลาของ Dashboard / ส่งออก Excel (ทุกวันที่คิดตามเวลาไทย)
 *
 * รับได้ 4 แบบ (เลือกอย่างใดอย่างหนึ่ง):
 *   days N                  N วันล่าสุด (นับถึงเวลานี้)            — แบบเดิม
 *   preset 'today'          วันนี้            'yesterday' เมื่อวาน     'all' ทั้งหมดตั้งแต่เริ่มใช้ระบบ
 *   date_from [+ date_to]   กำหนดเอง YYYY-MM-DD (ถึงสิ้นวัน date_to · ไม่ใส่ date_to = ถึงวันนี้)
 * ผลลัพธ์: since (รวม) · until (ไม่รวม · null = ถึงตอนนี้) · days (จำนวนวันของช่วง) · label (ข้อความแสดงผล)
 */
import { z } from 'zod';

const DAY = 86_400_000;
const MAX_SPAN_DAYS = 3660;
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD');

export const PRESETS = ['today', 'yesterday', 'all'] as const;
export type Preset = (typeof PRESETS)[number];

/** ช่องที่ DTO ของ Dashboard/ส่งออกใช้ร่วมกัน */
export const periodShape = {
  days: z.coerce.number().int().min(1, 'ช่วงเวลาต้องอย่างน้อย 1 วัน').max(3650, 'ช่วงเวลาเกิน 3650 วัน').optional(),
  preset: z.enum(PRESETS).optional(),
  date_from: ymd.optional(),
  date_to: ymd.optional(),
};
export type PeriodInput = { days?: number; preset?: Preset; date_from?: string; date_to?: string };

/** ตรวจความสมเหตุสมผลของช่วงที่กำหนดเอง (ใช้กับ .superRefine ของ DTO) */
export function refinePeriod(v: PeriodInput, ctx: z.RefinementCtx) {
  if (v.date_to && !v.date_from) ctx.addIssue({ code: 'custom', path: ['date_from'], message: 'ต้องระบุวันเริ่มต้นด้วย' });
  if (v.date_from && v.date_to && v.date_to < v.date_from) ctx.addIssue({ code: 'custom', path: ['date_to'], message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น' });
  if (v.date_from && !validYmd(v.date_from)) ctx.addIssue({ code: 'custom', path: ['date_from'], message: 'วันที่ไม่มีจริง' });
  if (v.date_to && !validYmd(v.date_to)) ctx.addIssue({ code: 'custom', path: ['date_to'], message: 'วันที่ไม่มีจริง' });
  if (v.date_from && v.date_to && validYmd(v.date_from) && validYmd(v.date_to) && spanDays(v.date_from, v.date_to) > MAX_SPAN_DAYS) {
    ctx.addIssue({ code: 'custom', path: ['date_to'], message: `ช่วงเวลายาวเกิน ${MAX_SPAN_DAYS} วัน` });
  }
}

export type Period = {
  since: Date;
  /** ไม่รวมเวลานี้ · null = ไม่จำกัดปลาย (นับถึงตอนนี้) */
  until: Date | null;
  days: number;
  label: string;
  /** วันแรก/วันสุดท้ายของช่วง (YYYY-MM-DD เวลาไทย) */
  from_date: string;
  to_date: string;
  /** true = กำหนดเป็นวันที่ (วันนี้/เมื่อวาน/ทั้งหมด/กำหนดเอง) · false = N วันล่าสุดแบบเดิม (แกนเวลานับถอยหลังจากเวลานี้) */
  custom: boolean;
};

const thaiDate = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
const startOfThaiDay = (key: string) => new Date(`${key}T00:00:00+07:00`);
const addDays = (key: string, n: number) => new Date(startOfThaiDay(key).getTime() + n * DAY + 12 * 3_600_000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
function validYmd(key: string) {
  const d = startOfThaiDay(key);
  return !Number.isNaN(d.getTime()) && thaiDate(d) === key;
}
const spanDays = (from: string, to: string) => Math.round((startOfThaiDay(to).getTime() - startOfThaiDay(from).getTime()) / DAY) + 1;
const thaiShort = (key: string) => startOfThaiDay(key).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });

/** ช่วง "N วันล่าสุด" แบบเดิม (ใช้กับ widget ที่ตั้งช่วงของตัวเอง และทางเข้าเดิมที่ส่ง days) */
export function lastDays(days: number, now: Date): Period {
  return { since: new Date(now.getTime() - days * DAY), until: null, days, label: `${days} วันล่าสุด`, from_date: thaiDate(new Date(now.getTime() - days * DAY)), to_date: thaiDate(now), custom: false };
}

function range(from: string, to: string, label?: string): Period {
  return { since: startOfThaiDay(from), until: startOfThaiDay(addDays(to, 1)), days: spanDays(from, to), label: label ?? (from === to ? thaiShort(from) : `${thaiShort(from)} – ${thaiShort(to)}`), from_date: from, to_date: to, custom: true };
}

/**
 * แปลงที่ผู้ใช้เลือกเป็นช่วงเวลา · defaultDays = ค่าเริ่มต้นของระบบเมื่อไม่ได้เลือกอะไร
 * earliest: คืนเวลาส่งคำขอแรกสุด (ใช้กับ preset 'all') — null = ยังไม่มีข้อมูล
 */
export async function resolvePeriod(input: PeriodInput, now: Date, defaultDays: number, earliest: () => Promise<string | null>): Promise<Period> {
  const today = thaiDate(now);
  if (input.date_from) return range(input.date_from, input.date_to ?? today);
  if (input.preset === 'today') return range(today, today, 'วันนี้');
  if (input.preset === 'yesterday') {
    const y = addDays(today, -1);
    return range(y, y, 'เมื่อวาน');
  }
  if (input.preset === 'all') {
    const first = await earliest();
    return range(first ? thaiDate(new Date(first)) : today, today, 'ทั้งหมดตั้งแต่เริ่มใช้ระบบ');
  }
  return lastDays(input.days ?? defaultDays, now);
}

/** รายการวัน (YYYY-MM-DD) ตั้งแต่วันแรกถึงวันสุดท้ายของช่วง */
export function dayKeys(p: Period): string[] {
  const out: string[] = [];
  for (let k = p.from_date, i = 0; k <= p.to_date && i < MAX_SPAN_DAYS + 5; k = addDays(k, 1), i++) out.push(k);
  return out;
}
