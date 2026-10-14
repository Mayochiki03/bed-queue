/**
 * pages/setting — ตั้งค่าของระบบ (เวลารอยืนยัน, การแสดงคิว, Dashboard, ข้อความ PDPA, โควต้า LINE, การเชื่อมต่อ LINE)
 * ประกาศค่าที่ SettingDefs.ts · กลไกเก็บ/เข้ารหัสอยู่ที่ core/settings.ts
 * สิทธิ์เป็นรายค่า (ค่าการเชื่อมต่อ LINE เห็น/แก้ได้เฉพาะ DEV) — ตรวจใน core/settings.ts
 */
import { definePage } from '../../core/pages';
import './SettingDefs';
import { settingRouter } from './SettingController';

export const settingPage = definePage({ name: 'setting', minRole: 'STAFF', router: settingRouter });
