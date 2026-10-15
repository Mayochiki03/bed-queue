/**
 * pages/export — ส่งออก Excel รายงาน (สรุป+กราฟ, รายการคำขอละเอียด, ประวัติเหตุการณ์, ผู้ขอ, บันทึกการใช้งาน)
 * ไม่มีตารางของตัวเอง · audit แบบ minimal (เก็บว่าเลือกส่งออกอะไร ไม่เก็บชื่อผู้ป่วย)
 */
import { definePage } from '../../core/pages';
import { dashboardService, widgetService } from '../dashboard';
import { ExportController } from './ExportController';
import { ExportRepository } from './ExportRepository';
import { ExportService } from './ExportService';

export const exportService = new ExportService(new ExportRepository(), dashboardService, widgetService);

export const exportPage = definePage({
  name: 'export',
  minRole: 'STAFF',
  audit: 'minimal',
  router: new ExportController(exportService).router,
  migrations: [],
});
