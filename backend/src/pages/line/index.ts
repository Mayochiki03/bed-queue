/**
 * pages/line — ปลายทาง webhook ของ LINE (ผู้ขอพิมพ์ "สถานะ" / กดปุ่มบนการ์ดเรียกคิว)
 * access 'public' เพราะ LINE ไม่มี session ของเจ้าหน้าที่ — ตรวจลายเซ็นเองใน controller · audit minimal (ไม่เก็บ body)
 */
import { definePage } from '../../core/pages';
import { requesterService } from '../request';
import { LineWebhookController } from './LineWebhookController';
import { LineWebhookService } from './LineWebhookService';

export const lineWebhookService = new LineWebhookService(requesterService);

export const linePage = definePage({
  name: 'line',
  access: 'public',
  audit: 'minimal',
  router: new LineWebhookController(lineWebhookService).router,
});
