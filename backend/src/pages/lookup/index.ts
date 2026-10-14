/**
 * pages/lookup — "ข้อมูลหลัก": สี/ระดับผู้ป่วย, ประเภทสารเสพติด, เหตุผลการส่งต่อ (admin เพิ่ม/แก้/ปิดใช้งานได้)
 * ประกอบชั้น: Repository ← Service ← Controller แล้วลงทะเบียนเป็นหน้า "lookup" (/api/lookup/...)
 * หน้าอื่นที่ต้องแปลงชื่อ→code (import Excel) ใช้ lookupService.resolveLabel
 */
import { definePage } from '../../core/pages';
import { LookupController } from './LookupController';
import { lookupMigrations } from './LookupMigration';
import { LookupRepository } from './LookupRepository';
import { LookupService } from './LookupService';

export const lookupService = new LookupService(new LookupRepository());

export const lookupPage = definePage({
  name: 'lookup',
  minRole: 'STAFF', // อ่านรายการ (options) ได้ทุกคน — ส่วนแก้ไขจำกัด ADMIN ที่ Controller
  router: new LookupController(lookupService).router,
  migrations: lookupMigrations,
});
