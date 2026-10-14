/**
 * Hospital.ts — Entity: โรงพยาบาลต้นทางที่ส่งคำขอ (รหัส รพ. 5 หลักตามกระทรวงฯ เช่น 11206)
 * ผู้ขอพิมพ์ชื่อ+รหัสเอง ระบบสร้างรายการให้อัตโนมัติถ้ายังไม่มี (admin แก้ไข/รวมรายการซ้ำภายหลังได้)
 */
export type Hospital = {
  id: number;
  code: string;
  name: string;
  is_active: boolean | number;
  created_at: string;
  updated_at: string;
};
