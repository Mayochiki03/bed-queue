/**
 * MemberController.ts — API "สมาชิก รพ." (เจ้าหน้าที่ทุกคนอนุมัติได้)
 *   POST /api/member/search         { q, status, pageNo, pageSize }
 *   POST /api/member/pending-count  {}                  จำนวนที่รออนุมัติ (ป้ายเตือนบนบอร์ดคิว)
 *   POST /api/member/approve        { id }
 *   POST /api/member/reject         { id, note? }
 */
import { Router, type Request, type Response } from 'express';
import { ok, parse } from '../../core/http';
import { memberIdDto, memberRejectDto, memberSearchDto } from './MemberDto';
import type { MemberService } from './MemberService';

export class MemberController {
  readonly router = Router();

  constructor(private service: MemberService) {
    this.router.post('/search', this.search);
    this.router.post('/pending-count', this.pendingCount);
    this.router.post('/approve', this.approve);
    this.router.post('/reject', this.reject);
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
}
