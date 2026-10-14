/**
 * pages/hospital — โรงพยาบาลต้นทาง (ชื่อ + รหัส 5 หลัก) · ผู้ขอพิมพ์เอง ระบบสร้างให้อัตโนมัติ admin ดูแลทีหลัง
 */
import { definePage } from '../../core/pages';
import { HospitalController } from './HospitalController';
import { hospitalMigrations } from './HospitalMigration';
import { HospitalRepository } from './HospitalRepository';
import { HospitalService } from './HospitalService';

export const hospitalService = new HospitalService(new HospitalRepository());

export const hospitalPage = definePage({
  name: 'hospital',
  minRole: 'STAFF',
  router: new HospitalController(hospitalService).router,
  migrations: hospitalMigrations,
});
