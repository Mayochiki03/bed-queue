/**
 * pages/dev — เมนูนักพัฒนา (DEV เท่านั้น): ผู้ขอจำลองสำหรับทดลองฝั่งผู้ใช้ (เพิ่ม: ทดสอบเชื่อม LINE / Tunnel ในรอบถัดไป)
 * ไม่มีตารางของตัวเอง — ใช้ตาราง requester / bed_request ของหน้า request
 */
import { definePage } from '../../core/pages';
import { devRouter } from './DevController';

export const devPage = definePage({ name: 'dev', minRole: 'DEV', audit: 'minimal', router: devRouter });
