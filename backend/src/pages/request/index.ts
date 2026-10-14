/**
 * pages/request — คำขอเตียง: บอร์ดคิว/เรียกคิว/บันทึกผล/ประวัติ (เจ้าหน้าที่) + งานฝั่งผู้ขอ (RequesterService ใช้โดยหน้า LINE และหน้าทดลองของ dev)
 * ตารางอยู่ใน RequestMigration.ts · ข้อมูลผู้ป่วย → audit แบบ minimal (ไม่เก็บ body ของคำขอ)
 */
import { definePage } from '../../core/pages';
import { RequestController } from './RequestController';
import { requestMigrations } from './RequestMigration';
import { RequestRepository } from './RequestRepository';
import { RequestService } from './RequestService';
import { RequesterService } from './RequesterService';

export const requestRepository = new RequestRepository();
export const requestService = new RequestService(requestRepository);
export const requesterService = new RequesterService(requestRepository, requestService);

export const requestPage = definePage({
  name: 'request',
  minRole: 'STAFF',
  audit: 'minimal',
  router: new RequestController(requestService).router,
  migrations: requestMigrations,
});
