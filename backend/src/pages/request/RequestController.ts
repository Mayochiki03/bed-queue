/**
 * RequestController.ts — API คำขอเตียงสำหรับเจ้าหน้าที่ (STAFF ขึ้นไป)
 *   POST /api/request/board        {}                                บอร์ดคิว: คำขอที่ยังเปิดอยู่ + ลำดับ + เกินเวลา
 *   POST /api/request/search       { q, statuses, color_code, hospital_id, date_from, date_to, pageNo, pageSize }
 *   POST /api/request/get          { id }                            รายละเอียด + ประวัติ
 *   POST /api/request/add          { ... }                           เจ้าหน้าที่บันทึกแทนผู้ขอ
 *   POST /api/request/update       { id, ... }                       แก้ไขข้อมูล (ไม่เปลี่ยนสถานะ)
 *   POST /api/request/transition   { id, action, via?, note? }       เรียกคิว/ยืนยัน/ไม่ยืนยัน/ยกเลิก/คืนคิว/เปิดใหม่
 *   POST /api/request/transfer     { id, requester_id }              โอนเคสให้ผู้ขออื่นของ รพ. เดียวกัน
 *   POST /api/request/requesters   { hospital_id }                   ผู้ขอของ รพ. (ไว้เลือกตอนเพิ่ม/โอนเคส)
 * ข้อมูลผู้ป่วย: audit แบบ minimal (ไม่เก็บ body)
 */
import { Router, type Request, type Response } from 'express';
import { ok, parse } from '../../core/http';
import { requestAddDto, requestIdDto, requestRequestersDto, requestSearchDto, requestTransferDto, requestTransitionDto, requestUpdateDto } from './RequestDto';
import type { RequestService } from './RequestService';

export class RequestController {
  readonly router = Router();

  constructor(private service: RequestService) {
    this.router.post('/board', this.board);
    this.router.post('/search', this.search);
    this.router.post('/get', this.get);
    this.router.post('/add', this.add);
    this.router.post('/update', this.update);
    this.router.post('/transition', this.transition);
    this.router.post('/transfer', this.transfer);
    this.router.post('/requesters', this.requesters);
  }

  private actor = (req: Request) => ({ id: req.user!.id, full_name: req.user!.full_name });

  private board = async (_req: Request, res: Response) => {
    res.json(ok(await this.service.board()));
  };
  private search = async (req: Request, res: Response) => {
    res.json(ok(await this.service.search(parse(requestSearchDto, req.body))));
  };
  private get = async (req: Request, res: Response) => {
    res.json(ok(await this.service.get(parse(requestIdDto, req.body).id)));
  };
  private add = async (req: Request, res: Response) => {
    res.status(201).json(ok(await this.service.create(parse(requestAddDto, req.body), this.actor(req)), 'บันทึกคำขอแล้ว'));
  };
  private update = async (req: Request, res: Response) => {
    res.json(ok(await this.service.update(parse(requestUpdateDto, req.body), this.actor(req)), 'แก้ไขข้อมูลแล้ว'));
  };
  private transition = async (req: Request, res: Response) => {
    const dto = parse(requestTransitionDto, req.body);
    res.json(ok(await this.service.transition(dto, { user_id: req.user!.id, label: req.user!.full_name }), 'บันทึกแล้ว'));
  };
  private transfer = async (req: Request, res: Response) => {
    const dto = parse(requestTransferDto, req.body);
    res.json(ok(await this.service.transfer(dto.id, dto.requester_id, this.actor(req)), 'โอนเคสแล้ว'));
  };
  private requesters = async (req: Request, res: Response) => {
    res.json(ok(await this.service.requesters(parse(requestRequestersDto, req.body).hospital_id)));
  };
}
