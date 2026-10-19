/**
 * pages/notification — ข้อความแจ้งเตือน LINE ถึงผู้ขอ: เลือกเปิด/ปิดแต่ละชนิด แก้ข้อความ ดูประวัติการส่งและโควต้า
 * ต่อเข้ากับคิว: RequestService เรียก requestService.hooks.notify(...) หลังเปลี่ยนสถานะ (ผูกไว้ที่ไฟล์นี้)
 */
import { definePage } from '../../core/pages';
import { requestService } from '../request';
import { NotificationController } from './NotificationController';
import { notificationMigrations } from './NotificationMigration';
import { NotificationRepository } from './NotificationRepository';
import { NotificationService } from './NotificationService';

export const notificationService = new NotificationService(new NotificationRepository());

// ผูกเหตุการณ์ของคิวเข้ากับการส่งแจ้งเตือน (ส่งไม่สำเร็จไม่กระทบงานหลัก — notify จับ error เอง)
requestService.hooks.notify = (type, requestId, toRequesterId, extra) => notificationService.notify(type, requestId, toRequesterId, extra);

export const notificationPage = definePage({
  name: 'notification',
  minRole: 'ADMIN',
  router: new NotificationController(notificationService).router,
  migrations: notificationMigrations,
});
