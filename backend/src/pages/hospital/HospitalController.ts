/**
 * HospitalController.ts — API "โรงพยาบาล"
 *   POST /api/hospital/options  {}                         รายการสำหรับ dropdown (เจ้าหน้าที่ทุกคน)
 *   POST /api/hospital/search   { q, pageNo, pageSize }    (ADMIN ขึ้นไป)
 *   POST /api/hospital/get | add | update | delete         (ADMIN ขึ้นไป)
 */
import { Router, type Request, type Response } from 'express';
import { requireRole } from '../../core/auth';
import { ok, parse } from '../../core/http';
import { hospitalAddDto, hospitalIdDto, hospitalSearchDto, hospitalUpdateDto } from './HospitalDto';
import type { HospitalService } from './HospitalService';

export class HospitalController {
  readonly router = Router();

  constructor(private service: HospitalService) {
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
    res.json(ok(await this.service.search(parse(hospitalSearchDto, req.body))));
  };
  private get = async (req: Request, res: Response) => {
    res.json(ok(await this.service.get(parse(hospitalIdDto, req.body).id)));
  };
  private add = async (req: Request, res: Response) => {
    res.status(201).json(ok(await this.service.create(parse(hospitalAddDto, req.body)), 'บันทึกข้อมูลสำเร็จ'));
  };
  private update = async (req: Request, res: Response) => {
    res.json(ok(await this.service.update(parse(hospitalUpdateDto, req.body)), 'แก้ไขข้อมูลสำเร็จ'));
  };
  private remove = async (req: Request, res: Response) => {
    await this.service.remove(parse(hospitalIdDto, req.body).id);
    res.json(ok(null, 'ลบข้อมูลสำเร็จ'));
  };
}
