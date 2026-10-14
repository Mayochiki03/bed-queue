/**
 * pages/dashboard — ตัวเลขและกราฟสรุป (หน้าหลัก) · อ่านอย่างเดียว ไม่มี migration
 */
import { definePage } from '../../core/pages';
import { DashboardController } from './DashboardController';
import { DashboardRepository } from './DashboardRepository';
import { DashboardService } from './DashboardService';

export const dashboardService = new DashboardService(new DashboardRepository());

export const dashboardPage = definePage({
  name: 'dashboard',
  minRole: 'STAFF',
  router: new DashboardController(dashboardService).router,
});
