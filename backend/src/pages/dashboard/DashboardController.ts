/**
 * DashboardController.ts — API Dashboard
 *   POST /api/dashboard/summary         { days? | preset? | date_from?, date_to? }   ตัวเลขคิวปัจจุบัน (ใช้กับแถบด้านบนและแจ้งเตือนเกินเวลา)
 *   POST /api/dashboard/widget/data     { days? | preset? | date_from?, date_to?, include_hidden? }   widget ทั้งหมด + ผลลัพธ์ (ทุกคน · include_hidden เฉพาะ ADMIN)
 *   POST /api/dashboard/widget/preview  { config, days? }            ตัวอย่างตอนสร้าง/แก้ widget (ADMIN)
 *   POST /api/dashboard/widget/save     { id?, ...config }           สร้าง/แก้ widget (ADMIN)
 *   POST /api/dashboard/widget/delete   { id }                       ลบ widget (ADMIN)
 *   POST /api/dashboard/widget/layout   { items: [...] }             บันทึกลำดับ/ขนาด/การซ่อน (ADMIN)
 *   (ส่งออก Excel ย้ายไปที่ POST /api/export/build ปุ่มเดียวเลือกข้อมูลได้)
 */
import { Router, type Request, type Response } from 'express';
import { hasRole } from '../../core/pages';
import { requireRole } from '../../core/auth';
import { ok, parse } from '../../core/http';
import { dashboardDto } from './DashboardDto';
import type { DashboardService } from './DashboardService';
import { widgetDataDto, widgetIdDto, widgetLayoutDto, widgetPreviewDto, widgetSaveDto } from './WidgetDto';
import type { WidgetService } from './WidgetService';

export class DashboardController {
  readonly router = Router();

  constructor(
    private service: DashboardService,
    private widgets: WidgetService,
  ) {
    this.router.post('/summary', this.summary);
    this.router.post('/widget/data', this.widgetData);
    this.router.post('/widget/preview', requireRole('ADMIN'), this.widgetPreview);
    this.router.post('/widget/save', requireRole('ADMIN'), this.widgetSave);
    this.router.post('/widget/delete', requireRole('ADMIN'), this.widgetDelete);
    this.router.post('/widget/layout', requireRole('ADMIN'), this.widgetLayout);
  }

  private summary = async (req: Request, res: Response) => {
    res.json(ok(await this.service.summary(parse(dashboardDto, req.body))));
  };

  private widgetData = async (req: Request, res: Response) => {
    const dto = parse(widgetDataDto, req.body);
    res.json(ok(await this.widgets.data(dto, dto.include_hidden && hasRole(req.user!.role, 'ADMIN'))));
  };

  private widgetPreview = async (req: Request, res: Response) => {
    const dto = parse(widgetPreviewDto, req.body);
    res.json(ok(await this.widgets.preview(dto.config, dto)));
  };

  private widgetSave = async (req: Request, res: Response) => {
    const dto = parse(widgetSaveDto, req.body);
    const r = await this.widgets.save(dto, req.user!.id);
    res.json(ok(r, dto.id ? 'แก้ไข widget แล้ว' : 'เพิ่ม widget แล้ว'));
  };

  private widgetDelete = async (req: Request, res: Response) => {
    await this.widgets.remove(parse(widgetIdDto, req.body).id);
    res.json(ok(null, 'ลบ widget แล้ว'));
  };

  private widgetLayout = async (req: Request, res: Response) => {
    await this.widgets.saveLayout(parse(widgetLayoutDto, req.body).items);
    res.json(ok(null, 'บันทึกการจัดวางแล้ว'));
  };
}
