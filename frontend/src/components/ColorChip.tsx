/** ColorChip — ป้ายสีของผู้ป่วย (แดง/ส้ม/เหลือง/เขียว) ใช้ทั้งในตารางและการ์ดคิว; ตัวอักษรขาวบนสีเข้มเสมอ (อ่านง่ายบนมือถือ) */
export function ColorChip({ label, color }: { label: string; color: string | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: color || '#6B7280' }}>
      {label}
    </span>
  );
}
