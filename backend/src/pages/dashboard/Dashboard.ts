/**
 * Dashboard.ts — ชนิดข้อมูลที่ API สรุปผล (Dashboard) ส่งกลับ
 * ทุกอย่างคำนวณจากตาราง bed_request (ไม่มีตารางสรุปแยก) ชื่อ/สีของ code ให้หน้าเว็บแปลงจาก lookup เอง
 */
export type ColorQueue = { code: string; count: number; oldest_days: number | null };
export type TrendPoint = { date: string; submitted: number; confirmed: number };
export type HospitalStat = { hospital_id: number; code: string; name: string; total: number; by_color: Record<string, number> };
export type SubstanceStat = { code: string; submitted: number; confirmed: number; avg_days: number | null; min_days: number | null; max_days: number | null };

export type DashboardSummary = {
  days: number;
  period_label: string;
  /** สถานะปัจจุบันของคิว (ไม่ขึ้นกับช่วงเวลา) */
  queue: { waiting: number; called: number; need_date: number; overdue: number; by_color: ColorQueue[] };
  /** ผลลัพธ์ของคำขอที่ส่งเข้ามาในช่วงเวลา */
  period: { submitted: number; confirmed: number; declined: number; cancelled: number; avg_days_to_confirm: number | null; min_days_to_confirm: number | null; max_days_to_confirm: number | null };
  trend: TrendPoint[];
  hospitals: HospitalStat[];
  substances: SubstanceStat[];
};
