/**
 * ExportController.ts — ส่งออก Excel (ปุ่มเดียว เลือกชุดข้อมูลได้)
 *   POST /api/export/options  {}                                   รายการกราฟ + สิทธิ์ที่ใช้ได้ (หน้าต่างเลือกส่งออก)
 *   POST /api/export/build    { sections, days?, scope, widget_ids?, config?, filters? }   ดาวน์โหลดไฟล์ .xlsx
 * เจ้าหน้าที่ (STAFF) ส่งออกได้ทุกชุดยกเว้นบันทึกการใช้งาน (ผู้ดูแลขึ้นไป) · ทุกการส่งออกถูกบันทึกใน audit ว่าเลือกอะไรไป
 */
import { Router, type Request, type Response } from 'express';
import { ok, parse } from '../../core/http';
import { sendXlsx } from '../../core/xlsx';
import { hasRole } from '../../core/pages';
import { exportBuildDto } from './ExportDto';
import type { ExportService } from './ExportService';

export class ExportController {
  readonly router = Router();

  constructor(private service: ExportService) {
    this.router.post('/options', this.options);
    this.router.post('/build', this.build);
  }

  private options = async (req: Request, res: Response) => {
    res.json(ok(await this.service.options(hasRole(req.user!.role, 'ADMIN'))));
  };

  private build = async (req: Request, res: Response) => {
    const dto = parse(exportBuildDto, req.body);
    const { filename, buffer } = await this.service.build(dto, { full_name: req.user!.full_name, role: req.user!.role });
    sendXlsx(res, filename, buffer);
  };
}
