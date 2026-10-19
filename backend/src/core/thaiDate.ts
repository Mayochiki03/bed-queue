/**
 * core/thaiDate.ts — วันที่แบบไทย (เขตเวลา Asia/Bangkok) ที่ใช้ร่วมกันทั้งระบบ
 * วันที่เตียงว่าง (bed_date) เก็บเป็นข้อความ YYYY-MM-DD ตามเวลาไทย ไม่ใช่ timestamp — จึงไม่เลื่อนวันเมื่อเปลี่ยนเขตเวลา
 */

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) */
export const thaiToday = (now: Date = new Date()): string => now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

/** "2026-10-20" → "20 ต.ค. 2569" (ปี พ.ศ.) · ค่าว่าง/รูปแบบผิด คืนค่าเดิม */
export function formatThaiDate(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd ?? '';
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}
