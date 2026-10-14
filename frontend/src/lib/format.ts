/** แสดงเวลา ISO (UTC) เป็นเวลาท้องถิ่นแบบไทย เช่น 12/10/2569 15:20:05 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' });
}
