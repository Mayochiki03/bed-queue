/**
 * Log.ts — Entity: หนึ่งแถวของบันทึกการใช้งาน (ตาราง audit_logs เป็นของแกนกลาง ดู core/migrations.ts)
 */
export type Log = {
  id: number;
  user_id: number | null;
  username: string | null;
  page: string;
  action: string;
  path: string;
  status_code: number;
  ip: string | null;
  detail: string | null;
  created_at: string;
};
