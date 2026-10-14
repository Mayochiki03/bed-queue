/**
 * LogController.ts — ตัวอย่างหน้า "อ่านอย่างเดียว" (ดูบันทึกการใช้งาน) มี API เดียว
 *   POST /api/log/search   { q, page, action, pageNo, pageSize }
 */
import { Router, type Request, type Response } from 'express';
import { ok, parse } from '../../core/http';
import { logSearchDto } from './LogDto';
import type { LogService } from './LogService';

export class LogController {
  readonly router = Router();

  constructor(private service: LogService) {
    this.router.post('/search', this.search);
  }

  private search = async (req: Request, res: Response) => {
    res.json(ok(await this.service.search(parse(logSearchDto, req.body))));
  };
}
