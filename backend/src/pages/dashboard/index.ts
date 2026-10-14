/**
 * pages/dashboard — ตัวเลขสรุปหน้าหลัก + widget ที่ผู้ดูแลสร้าง/จัดวางเองได้ (กราฟ ตัวเลข ตาราง) + ส่งออก Excel
 * อ่านข้อมูลจากตาราง bed_request (ไม่มีตารางสรุปแยก) · ตาราง dashboard_widget เก็บการตั้งค่าของ widget
 */
import { definePage } from '../../core/pages';
import { DashboardController } from './DashboardController';
import { dashboardMigrations } from './DashboardMigration';
import { DashboardRepository } from './DashboardRepository';
import { DashboardService } from './DashboardService';
import { WidgetRepository } from './WidgetRepository';
import { WidgetService } from './WidgetService';

export const dashboardService = new DashboardService(new DashboardRepository());
export const widgetService = new WidgetService(new WidgetRepository());

export const dashboardPage = definePage({
  name: 'dashboard',
  minRole: 'STAFF',
  router: new DashboardController(dashboardService, widgetService).router,
  migrations: dashboardMigrations,
});
