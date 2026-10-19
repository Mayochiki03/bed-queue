/**
 * Hospital.ts — Entity: โรงพยาบาลต้นทางที่ส่งคำขอ (รหัส รพ. 5 หลักตามกระทรวงฯ เช่น 11206)
 * รายชื่อเป็นข้อมูลกลางที่แอดมินคีย์หรือนำเข้าจาก Excel — ผู้ขอสมัครได้เฉพาะรหัส+ชื่อที่ตรงกับรายการนี้ (ตรวจตอนลงทะเบียน)
 */
export type Hospital = {
  id: number;
  code: string;
  name: string;
  /** เขตสุขภาพ 1-14 (null = ยังไม่ระบุ) */
  health_region: number | null;
  is_active: boolean | number;
  created_at: string;
  updated_at: string;
};
