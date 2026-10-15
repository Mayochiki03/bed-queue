/**
 * User.ts — Entity: บัญชีเจ้าหน้าที่ (ตาราง users เป็นของแกนกลาง ดู core/migrations.ts)
 * ไม่ส่ง password_hash ออกไปนอกชั้น Repository
 */
import type { Role } from '../../core/pages';

export type User = {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean | number;
  /** admin ติ๊กบังคับ 2FA รายคน */
  totp_required: boolean | number;
  /** วันเวลาที่ผูกแอปยืนยันตัวตนแล้ว (null = ยังไม่ผูก) */
  totp_enabled_at: string | null;
  created_at: string;
  updated_at: string;
};
