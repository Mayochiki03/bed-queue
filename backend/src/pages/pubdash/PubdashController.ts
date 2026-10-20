/**
 * pages/pubdash — Dashboard แบบ "ดูอย่างเดียว ไม่ต้องล็อกอิน" (เฉพาะวงเครือข่ายภายใน + ผู้ดูแลต้องเปิดสวิตช์ก่อน)
 *   POST /api/pubdash/status   {}   เปิดใช้อยู่ไหม + ค่าที่หน้าจอต้องใช้ (ชื่อระบบ, เวลาเตือน) — ตอบแม้ปิดอยู่ จะได้แสดงข้อความ "ยังไม่เปิดใช้"
 *   POST /api/pubdash/data     { days? | preset? | date_from?, date_to? }   ตัวเลขสรุป + widget ที่แสดง (ไม่มีรายการคำขอ/ชื่อผู้ป่วย/เบอร์)
 * ไม่ได้เปิดผ่านพอร์ตสาธารณะ (Cloudflare Tunnel) — ลงทะเบียนเฉพาะฝั่งภายใน และ lanOnly ปฏิเสธคำขอที่มี header ของ proxy
 * ไม่บันทึก audit รายคำขอ (หน้าจอแขวนผนังรีเฟรชทุกนาที จะท่วม log) — การเปิด/ปิดสวิตช์ถูกบันทึกที่หน้าตั้งค่า
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../../core/config';
import { forbidden, ok, parse } from '../../core/http';
import { getSetting } from '../../core/settings';
import { dashboardDto } from '../dashboard/DashboardDto';
import type { DashboardService } from '../dashboard/DashboardService';
import type { WidgetService } from '../dashboard/WidgetService';
import { lanOnly } from './LanGuard';

export class PubdashController {
  readonly router = Router();

  constructor(
    private dash: DashboardService,
    private widgets: WidgetService,
  ) {
    this.router.use(lanOnly);
    this.router.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
    this.router.post('/status', this.status);
    this.router.post('/data', this.enabled, this.data);
  }

  private enabled = async (_req: Request, _res: Response, next: NextFunction) => {
    if (!(await getSetting<boolean>('public_dashboard_enabled'))) return next(forbidden('ยังไม่เปิดให้ดู Dashboard โดยไม่ล็อกอิน'));
    next();
  };

  private status = async (_req: Request, res: Response) => {
    res.json(
      ok({
        enabled: await getSetting<boolean>('public_dashboard_enabled'),
        app_name: config.appName,
        confirm_timeout_hours: await getSetting<number>('confirm_timeout_hours'),
        default_days: await getSetting<number>('dashboard_default_days'),
      }),
    );
  };

  private data = async (req: Request, res: Response) => {
    const dto = parse(dashboardDto, req.body);
    const now = new Date();
    const summary = await this.dash.summary(dto, now);
    const widgets = await this.widgets.data(dto, false, now); // ไม่ส่ง widget ที่ซ่อน
    res.json(ok({ summary, widgets: widgets.widgets, period_label: widgets.period_label }));
  };
}
