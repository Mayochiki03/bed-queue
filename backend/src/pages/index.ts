/**
 * pages/index.ts — รายชื่อ "หน้า" ทั้งหมดของระบบฝั่งหลังบ้าน (เขียนมือ ไม่มีการค้นไฟล์อัตโนมัติ)
 *
 * เพิ่มหน้าใหม่ = 1) ก๊อปโฟลเดอร์หน้าตัวอย่าง (เช่น hospital) แล้วเปลี่ยนชื่อ  2) import แล้วต่อท้ายรายการด้านล่าง
 * ระวัง: ลำดับ migration ดูจากชื่อ (วันที่_เลข) ไม่ใช่ลำดับในรายการนี้ — hospital(10) → lookup(11) → request(20+)
 */
import type { PageDef } from '../core/pages';
import { dashboardPage } from './dashboard';
import { devPage } from './dev';
import { exportPage } from './export';
import { hospitalPage } from './hospital';
import { linePage } from './line';
import { logPage } from './log';
import { memberPage } from './member';
import { notificationPage } from './notification';
import { lookupPage } from './lookup';
import { requestPage } from './request';
import { requesterPage } from './requester';
import { settingPage } from './setting';
import { userPage } from './user';

export const pages: PageDef[] = [
  settingPage, // ตั้งค่าระบบ (เก็บใน DB)
  hospitalPage, // โรงพยาบาลต้นทาง
  lookupPage, // ข้อมูลหลัก: สี / สารเสพติด / เหตุผล
  requestPage, // คำขอเตียง (ตาราง — API มาใน Round 2)
  dashboardPage, // สรุปตัวเลข/กราฟหน้าหลัก
  exportPage, // ส่งออก Excel (รายงาน+กราฟ+ข้อมูลละเอียด)
  notificationPage, // ข้อความแจ้งเตือน LINE (เลือกเปิด/ปิด + ประวัติการส่ง)
  memberPage, // สมาชิก รพ. — อนุมัติผู้ที่ลงทะเบียนผ่าน LINE
  requesterPage, // API ฝั่งผู้ขอผ่าน LINE (LIFF) — public ตรวจ ID token ของ LINE เอง
  linePage, // LINE webhook (ตอบ "สถานะ" + ปุ่มยืนยันในแชท) — public ตรวจลายเซ็นเอง
  userPage, // ผู้ใช้งาน
  devPage, // เมนูนักพัฒนา (ผู้ขอจำลอง) — DEV เท่านั้น
  logPage, // ดู audit log
];
