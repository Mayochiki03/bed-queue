/**
 * pages/log — หน้าตัวอย่าง "อ่านอย่างเดียว" (ใช้เป็นต้นแบบหน้ารายงาน / log): ไม่มี migration ของตัวเอง
 */
import { definePage } from '../../core/pages';
import { LogController } from './LogController';
import { LogRepository } from './LogRepository';
import { LogService } from './LogService';

const controller = new LogController(new LogService(new LogRepository()));

export const logPage = definePage({
  name: 'log',
  minRole: 'ADMIN', // ผู้ดูแลระบบขึ้นไป
  router: controller.router,
});
