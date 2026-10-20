/** pages/pubdash — Dashboard ดูอย่างเดียวไม่ต้องล็อกอิน (เฉพาะวงภายใน, ปิดเป็นค่าเริ่มต้น) */
import { definePage } from '../../core/pages';
import { dashboardService, widgetService } from '../dashboard';
import { PubdashController } from './PubdashController';

export const pubdashPage = definePage({
  name: 'pubdash',
  access: 'public',
  router: new PubdashController(dashboardService, widgetService).router,
});
