/**
 * LookupController.ts — API "ข้อมูลหลัก" (สี/สารเสพติด/เหตุผลการส่งต่อ)
 *   POST /api/lookup/options   {}                    ทุกค่าจัดกลุ่มตาม type (เจ้าหน้าที่ทุกคนอ่านได้)
 *   POST /api/lookup/search    { type, q, pageNo, pageSize }
 *   POST /api/lookup/get       { id }
 *   POST /api/lookup/add | update | delete          (ADMIN ขึ้นไป)
 */
import { Router, type Request, type Response } from 'express';
import { requireRole } from '../../core/auth';
import { ok, parse } from '../../core/http';
import { lookupAddDto, lookupIdDto, lookupSearchDto, lookupUpdateDto } from './LookupDto';
import type { LookupService } from './LookupService';

export class LookupController {
  readonly router = Router();

  constructor(private service: LookupService) {
    this.router.post('/options', this.options);
    this.router.post('/search', requireRole('ADMIN'), this.search);
    this.router.post('/get', requireRole('ADMIN'), this.get);
    this.router.post('/add', requireRole('ADMIN'), this.add);
    this.router.post('/update', requireRole('ADMIN'), this.update);
    this.router.post('/delete', requireRole('ADMIN'), this.remove);
  }

  private options = async (_req: Request, res: Response) => {
    res.json(ok(await this.service.options()));
  };
  private search = async (req: Request, res: Response) => {
    res.json(ok(await this.service.search(parse(lookupSearchDto, req.body))));
  };
  private get = async (req: Request, res: Response) => {
    res.json(ok(await this.service.get(parse(lookupIdDto, req.body).id)));
  };
  private add = async (req: Request, res: Response) => {
    res.status(201).json(ok(await this.service.create(parse(lookupAddDto, req.body)), 'บันทึกข้อมูลสำเร็จ'));
  };
  private update = async (req: Request, res: Response) => {
    res.json(ok(await this.service.update(parse(lookupUpdateDto, req.body)), 'แก้ไขข้อมูลสำเร็จ'));
  };
  private remove = async (req: Request, res: Response) => {
    await this.service.remove(parse(lookupIdDto, req.body).id);
    res.json(ok(null, 'ลบข้อมูลสำเร็จ'));
  };
}
