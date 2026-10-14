/**
 * DashboardController.ts — API Dashboard (เจ้าหน้าที่ทุกคนดูได้)
 *   POST /api/dashboard/summary  { days? }   ตัวเลข+กราฟทั้งหมดของหน้าหลัก
 */
import { Router, type Request, type Response } from 'express';
import { ok, parse } from '../../core/http';
import { dashboardDto } from './DashboardDto';
import type { DashboardService } from './DashboardService';

export class DashboardController {
  readonly router = Router();

  constructor(private service: DashboardService) {
    this.router.post('/summary', this.summary);
  }

  private summary = async (req: Request, res: Response) => {
    res.json(ok(await this.service.summary(parse(dashboardDto, req.body))));
  };
}
