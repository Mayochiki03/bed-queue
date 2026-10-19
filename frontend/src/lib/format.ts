/** วันที่ล้วน YYYY-MM-DD → "20 ต.ค. 2569" (ไม่ผ่านเขตเวลา จึงไม่เลื่อนวัน) */
export function formatDate(ymd: string | null | undefined): string {
  if (!ymd) return '-';
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString('th-TH', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) — ใช้เป็นค่าต่ำสุดของช่องเลือกวันที่ */
export const todayThai = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

/** แสดงเวลา ISO (UTC) เป็นเวลาท้องถิ่นแบบไทย เช่น 12/10/2569 15:20:05 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' });
}
