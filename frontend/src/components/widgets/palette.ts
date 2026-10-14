/**
 * palette.ts — สีของชุดข้อมูลในกราฟ widget (เรียงให้แยกกันได้ชัด ไม่พึ่งสีอย่างเดียว: ทุกกราฟมี legend/ป้ายชื่อ)
 * ถ้าคอลัมน์/แถวมีสีของตัวเอง (เช่น สีของระดับผู้ป่วยจากข้อมูลหลัก) ใช้สีนั้นก่อน
 */
export const PALETTE = ['#2a78d6', '#1baf7a', '#d98a1c', '#7c5cd6', '#d4476b', '#64748b'] as const;
export const colorAt = (i: number, own?: string | null) => own ?? PALETTE[i % PALETTE.length]!;

/** ปัดค่าสูงสุดของแกนให้เป็นเลขกลม ๆ */
export const niceMax = (v: number) => {
  if (v <= 4) return 4;
  if (v <= 8) return 8;
  if (v <= 12) return 12;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
};

export const fmtValue = (v: number | null, unit: 'ราย' | 'วัน') => (v === null ? '-' : unit === 'วัน' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v));

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** ป้ายแกนเวลาแบบสั้น: วัน/สัปดาห์ = "14 ต.ค." · เดือน = "ต.ค. 69" */
export function shortTime(key: string, group: 'day' | 'week' | 'month' | null): string {
  if (group === 'month') {
    const [y, m] = key.split('-');
    return `${TH_MONTH[Number(m) - 1]} ${String((Number(y) + 543) % 100).padStart(2, '0')}`;
  }
  if (group === 'day' || group === 'week') {
    const [, m, d] = key.split('-');
    return `${Number(d)} ${TH_MONTH[Number(m) - 1]}`;
  }
  return key;
}
