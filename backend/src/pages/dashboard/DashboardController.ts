/**
 * DashboardController.ts — API Dashboard
 *   POST /api/dashboard/summary         { days? }   ตัวเลขคิวปัจจุบัน (ใช้กับแถบด้านบนและแจ้งเตือนเกินเวลา)
 *   POST /api/dashboard/widget/data     { days?, include_hidden? }   widget ทั้งหมด + ผลลัพธ์ (ทุกคน · include_hidden เฉพาะ ADMIN)
 *   POST /api/dashboard/widget/preview  { config, days? }            ตัวอย่างตอนสร้าง/แก้ widget (ADMIN)
 *   POST /api/dashboard/widget/save     { id?, ...config }           สร้าง/แก้ widget (ADMIN)
 *   POST /api/dashboard/widget/delete   { id }                       ลบ widget (ADMIN)
 *   POST /api/dashboard/widget/layout   { items: [...] }             บันทึกลำดับ/ขนาด/การซ่อน (ADMIN)
 *   POST /api/dashboard/widget/export   { days?, ids?, config? }     ดาวน์โหลด Excel (ทุกคน)
 */
import { Router, type Request, type Response } from 'express';
import { hasRole } from '../../core/pages';
import { requireRole } from '../../core/auth';
import { ok, parse } from '../../core/http';
import { sendXlsx } from '../../core/xlsx';
import { dashboardDto } from './DashboardDto';
import type { DashboardService } from './DashboardService';
import { widgetDataDto, widgetExportDto, widgetIdDto, widgetLayoutDto, widgetPreviewDto, widgetSaveDto } from './WidgetDto';
import type { WidgetService } from './WidgetService';

export class DashboardController {
  readonly router = Router();

  constructor(
    private service: DashboardService,
    private widgets: WidgetService,
  ) {
    this.router.post('/summary', this.summary);
    this.router.post('/widget/data', this.widgetData);
    this.router.post('/widget/export', this.widgetExport);
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
    res.json(ok(await this.widgets.data(dto.days, dto.include_hidden && hasRole(req.user!.role, 'ADMIN'))));
  };

  private widgetPreview = async (req: Request, res: Response) => {
    const dto = parse(widgetPreviewDto, req.body);
    res.json(ok(await this.widgets.preview(dto.config, dto.days)));
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

  private widgetExport = async (req: Request, res: Response) => {
    const { filename, buffer } = await this.widgets.exportXlsx(parse(widgetExportDto, req.body));
    sendXlsx(res, filename, buffer);
  };
}
