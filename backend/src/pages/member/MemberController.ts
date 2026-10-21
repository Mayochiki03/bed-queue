/**
 * MemberController.ts — API "สมาชิก รพ." (เจ้าหน้าที่ทุกคนอนุมัติได้)
 *   POST /api/member/search         { q, status, pageNo, pageSize }
 *   POST /api/member/pending-count  {}                  จำนวนที่รออนุมัติ (ป้ายเตือนบนบอร์ดคิว)
 *   POST /api/member/approve        { id }
 *   POST /api/member/reject         { id, note? }
 *   POST /api/member/approve-phone  { id }              อนุมัติเบอร์ใหม่ที่สมาชิกขอเปลี่ยน
 *   POST /api/member/reject-phone   { id }              ไม่อนุมัติ (คงเบอร์เดิม)
 *   POST /api/member/update         { id, full_name, hospital_code, hospital_name, phone, phone2 }  เจ้าหน้าที่แก้ข้อมูลสมาชิกแทน
 */
import { Router, type Request, type Response } from 'express';
import { ok, parse } from '../../core/http';
import { memberIdDto, memberRejectDto, memberSearchDto, memberUpdateDto } from './MemberDto';
import type { MemberService } from './MemberService';

export class MemberController {
  readonly router = Router();

  constructor(private service: MemberService) {
    this.router.post('/search', this.search);
    this.router.post('/pending-count', this.pendingCount);
    this.router.post('/approve', this.approve);
    this.router.post('/reject', this.reject);
    this.router.post('/approve-phone', this.approvePhone);
    this.router.post('/reject-phone', this.rejectPhone);
    this.router.post('/update', this.update);
  }

  private search = async (req: Request, res: Response) => {
    res.json(ok(await this.service.search(parse(memberSearchDto, req.body))));
  };
  private pendingCount = async (_req: Request, res: Response) => {
    res.json(ok(await this.service.pendingCount()));
  };
  private approve = async (req: Request, res: Response) => {
    res.json(ok(await this.service.approve(parse(memberIdDto, req.body).id, req.user!.id), 'อนุมัติสมาชิกแล้ว'));
  };
  private reject = async (req: Request, res: Response) => {
    const dto = parse(memberRejectDto, req.body);
    res.json(ok(await this.service.reject(dto.id, dto.note, req.user!.id), 'บันทึกไม่อนุมัติแล้ว'));
  };
  private approvePhone = async (req: Request, res: Response) => {
    res.json(ok(await this.service.approvePhone(parse(memberIdDto, req.body).id), 'อนุมัติเบอร์ใหม่แล้ว'));
  };
  private rejectPhone = async (req: Request, res: Response) => {
    res.json(ok(await this.service.rejectPhone(parse(memberIdDto, req.body).id), 'ไม่อนุมัติเบอร์ใหม่ — คงเบอร์เดิม'));
  };
  private update = async (req: Request, res: Response) => {
    res.json(ok(await this.service.update(parse(memberUpdateDto, req.body)), 'บันทึกข้อมูลสมาชิกแล้ว'));
  };
}
