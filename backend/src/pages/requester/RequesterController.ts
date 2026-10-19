/**
 * RequesterController.ts — API ฝั่งผู้ขอ (เปิดผ่านพอร์ต public ให้หน้า LIFF เรียก)
 * ทุกคำสั่งยกเว้น boot/ui/lookups ต้องมี ID token ของ LINE (Authorization: Bearer) — ตัวตนมาจาก LINE เท่านั้น ไม่รับ id ผู้ขอจากหน้าเว็บ
 * ผู้ขอทำได้เฉพาะคำขอของตัวเอง (RequesterService ตรวจความเป็นเจ้าของ)
 *
 *   POST /api/requester/boot          {}  ค่าที่ต้องรู้ก่อนล็อกอิน LINE: liff_id, ชื่อระบบ
 *   POST /api/requester/ui            {}  ข้อความ PDPA ฯลฯ        POST /api/requester/lookups {}  สี/สาร/เหตุผล
 *   POST /api/requester/hospital-check { code }  ค้นชื่อ รพ. จากรหัส (เติมชื่อในฟอร์มลงทะเบียน)
 *   POST /api/requester/profile | save-profile | submit | mine | cancel | respond
 */
import { Router, type Request, type Response } from 'express';
import { config } from '../../core/config';
import { idField, ok, parse } from '../../core/http';
import { getSetting } from '../../core/settings';
import { hospitalCodeField } from '../hospital/HospitalDto';
import { lookupService } from '../lookup';
import { requesterProfileDto, respondDto, submitDto } from '../request/RequestDto';
import type { RequesterService } from '../request/RequesterService';
import { z } from 'zod';
import { requireLine } from './LineAuth';

export class RequesterController {
  router = Router();
  constructor(private svc: RequesterService) {
    const r = this.router;
    r.post('/boot', async (_req: Request, res: Response) => {
      res.json(ok({ app_name: config.appName, theme: config.theme, liff_id: await getSetting<string>('liff_id'), mode: await getSetting<string>('connection_mode') }));
    });
    r.post('/ui', async (_req: Request, res: Response) => {
      res.json(ok({ confirm_timeout_hours: await getSetting<number>('confirm_timeout_hours'), queue_display: await getSetting('queue_display'), pdpa_notice: await getSetting<string>('pdpa_notice') }));
    });
    r.post('/lookups', async (_req: Request, res: Response) => res.json(ok(await lookupService.options())));

    r.post('/profile', requireLine, async (req, res) => res.json(ok(await this.svc.profile(req.line!.userId))));
    r.post('/hospital-check', requireLine, async (req, res) => {
      const { code } = parse(z.object({ code: hospitalCodeField }), req.body);
      res.json(ok(await this.svc.hospitalCheck(code)));
    });
    r.post('/save-profile', requireLine, async (req, res) => {
      const dto = parse(requesterProfileDto, req.body?.profile ?? {});
      res.json(ok(await this.svc.saveProfile(req.line!.userId, req.line!.name, dto), 'บันทึกข้อมูลผู้ขอแล้ว'));
    });
    r.post('/submit', requireLine, async (req, res) => {
      const dto = parse(submitDto, req.body?.request ?? {});
      res.status(201).json(ok(await this.svc.submit(req.line!.userId, dto, { detail: 'ผู้ขอส่งผ่าน LINE' }), 'ส่งคำขอแล้ว'));
    });
    r.post('/mine', requireLine, async (req, res) => res.json(ok(await this.svc.mine(req.line!.userId))));
    r.post('/cancel', requireLine, async (req, res) => {
      const { id } = parse(z.object({ id: idField }), req.body);
      res.json(ok(await this.svc.cancel(req.line!.userId, id), 'ยกเลิกคำขอแล้ว'));
    });
    r.post('/respond', requireLine, async (req, res) => {
      const dto = parse(respondDto, req.body);
      res.json(ok(await this.svc.respond(req.line!.userId, dto.id, dto.answer), { CONFIRM: 'ยืนยันแล้ว', DEFER: 'บันทึกแล้ว เจ้าหน้าที่จะโทรกลับเพื่อนัดวัน', DECLINE: 'แจ้งไม่ยืนยันแล้ว' }[dto.answer]));
    });
  }
}
