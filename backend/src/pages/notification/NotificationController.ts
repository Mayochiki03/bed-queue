/**
 * NotificationController.ts — API ข้อความแจ้งเตือน LINE (ADMIN ขึ้นไป)
 *   POST /api/notification/templates  {}                           ข้อความทุกชนิด + ตัวแปรที่ใช้ได้
 *   POST /api/notification/save       { type, title, body, is_enabled }
 *   POST /api/notification/summary    {}                           ยอดเดือนนี้ + โควต้า + สถานะการเชื่อมต่อ
 *   POST /api/notification/logs       { status?, type?, pageNo, pageSize }   ประวัติการส่ง
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ok, pagingShape, parse } from '../../core/http';
import { TEMPLATE_DEFS } from './Notification';
import type { NotificationService } from './NotificationService';

const saveDto = z.object({
  type: z.enum(TEMPLATE_DEFS.map((d) => d.type) as [string, ...string[]]),
  title: z.string().trim().min(1, 'กรุณากรอกหัวข้อ').max(100, 'หัวข้อยาวเกิน 100 ตัวอักษร'),
  body: z.string().trim().min(1, 'กรุณากรอกข้อความ').max(1500, 'ข้อความยาวเกิน 1,500 ตัวอักษร'),
  is_enabled: z.boolean(),
});
const logsDto = z.object({ status: z.enum(['', 'SENT', 'FAILED', 'SKIPPED']).default(''), type: z.string().default(''), ...pagingShape });

export class NotificationController {
  readonly router = Router();

  constructor(private service: NotificationService) {
    this.router.post('/templates', async (_req: Request, res: Response) => {
      res.json(ok({ templates: await service.templates(), vars: service.vars() }));
    });
    this.router.post('/save', async (req: Request, res: Response) => {
      const d = parse(saveDto, req.body);
      await service.save(d.type, d, req.user!.id);
      res.json(ok(null, 'บันทึกข้อความแล้ว'));
    });
    this.router.post('/summary', async (_req: Request, res: Response) => {
      res.json(ok(await service.summary()));
    });
    this.router.post('/logs', async (req: Request, res: Response) => {
      const d = parse(logsDto, req.body);
      res.json(ok(await service.logs({ status: d.status, type: d.type }, d)));
    });
  }
}
