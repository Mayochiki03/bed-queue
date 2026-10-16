/**
 * pages/requester — API ฝั่งผู้ขอผ่าน LINE (LIFF) · access public: ตรวจตัวตนด้วย ID token ของ LINE เองใน controller
 * audit minimal: ไม่เก็บ body (มีข้อมูลผู้ป่วย) · ต่อกับพอร์ต public ใน publicApp.ts
 */
import { definePage } from '../../core/pages';
import { requesterService } from '../request';
import { RequesterController } from './RequesterController';

export const requesterPage = definePage({
  name: 'requester',
  access: 'public',
  audit: 'minimal',
  router: new RequesterController(requesterService).router,
});
