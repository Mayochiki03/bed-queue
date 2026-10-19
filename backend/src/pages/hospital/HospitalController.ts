/**
 * HospitalController.ts — API "โรงพยาบาล"
 *   POST /api/hospital/options  {}                         รายการสำหรับ dropdown (เจ้าหน้าที่ทุกคน)
 *   POST /api/hospital/search   { q, pageNo, pageSize }    (ADMIN ขึ้นไป)
 *   POST /api/hospital/get | add | update | delete         (ADMIN ขึ้นไป)
 *   POST /api/hospital/template      { with_data }          ดาวน์โหลดไฟล์ Excel แม่แบบ (with_data = ใส่รายชื่อปัจจุบันมาด้วย)
 *   POST /api/hospital/import-preview { filename, file_base64 }   ดูตัวอย่างก่อนนำเข้า (ไม่บันทึก)
 *   POST /api/hospital/import-commit  { filename, file_base64 }   นำเข้าจริง (เพิ่มรหัสใหม่/อัปเดตรหัสเดิม)
 */
import { Router, type Request, type Response } from 'express';
import { requireRole } from '../../core/auth';
import { ok, parse } from '../../core/http';
import { sendXlsx } from '../../core/xlsx';
import { hospitalAddDto, hospitalIdDto, hospitalImportDto, hospitalSearchDto, hospitalTemplateDto, hospitalUpdateDto } from './HospitalDto';
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
    this.router.post('/template', requireRole('ADMIN'), this.template);
    this.router.post('/import-preview', requireRole('ADMIN'), this.importPreview);
    this.router.post('/import-commit', requireRole('ADMIN'), this.importCommit);
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
  private template = async (req: Request, res: Response) => {
    const { with_data } = parse(hospitalTemplateDto, req.body);
    sendXlsx(res, with_data ? 'รายชื่อโรงพยาบาล.xlsx' : 'แม่แบบนำเข้าโรงพยาบาล.xlsx', await this.service.template(with_data));
  };
  private importPreview = async (req: Request, res: Response) => {
    res.json(ok(await this.service.importPreview(parse(hospitalImportDto, req.body))));
  };
  private importCommit = async (req: Request, res: Response) => {
    const r = await this.service.importCommit(parse(hospitalImportDto, req.body), req.user!.id);
    res.json(ok(r, `นำเข้าแล้ว: เพิ่มใหม่ ${r.created} · อัปเดต ${r.updated} · ข้าม ${r.skipped_errors}`));
  };
}
