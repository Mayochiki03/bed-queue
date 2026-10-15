/**
 * DevController.ts — เมนูสำหรับนักพัฒนา (DEV เท่านั้น): "ผู้ขอจำลอง" ให้ลองเล่นฝั่งผู้ใช้โดยยังไม่ต่อ LINE
 *
 * ทำงานแทนผู้ขอที่เป็น "ผู้ขอจำลอง" (line_user_id ขึ้นต้น MOCK-) เท่านั้น — สั่งแทนผู้ขอจริงไม่ได้
 * ตัวตนของผู้ขอจำลองยืนยันด้วย session ของ DEV ที่ล็อกอินอยู่ (ไม่มี endpoint สาธารณะที่ปลอมตัวเป็นผู้ขอได้)
 *
 *   POST /api/dev/system        {}                              ข้อมูลระบบ (เวอร์ชัน/ฐานข้อมูล/โหมด/จำนวนข้อมูล) สำหรับหน้า "ระบบและเครื่องมือ"
 *   POST /api/dev/mock/list     {}                              รายชื่อผู้ขอจำลอง
 *   POST /api/dev/mock/create   { full_name, hospital_code, hospital_name, phone, phone2? }
 *   POST /api/dev/mock/clear    {}                              ลบผู้ขอจำลองทั้งหมด + คำขอของพวกเขา
 *   POST /api/dev/as/profile | save-profile | submit | mine | cancel | respond   { requester_id, ... }
 */
import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../../core/config';
import { db } from '../../core/db';
import { idField, notFound, ok, parse } from '../../core/http';
import { getSetting } from '../../core/settings';
import { requesterProfileDto, respondDto, submitDto } from '../request/RequestDto';
import { requestRepository, requesterService } from '../request';

/** เวอร์ชันฐานข้อมูล (MariaDB/MySQL/PostgreSQL ต่างคำสั่งกัน) */
async function dbVersion(): Promise<string> {
  try {
    if (config.db.client === 'postgres') return String(((await db.raw('select version() as v')) as { rows: { v: string }[] }).rows[0]?.v ?? '-');
    const r = (await db.raw('select version() as v')) as [{ v: string }[]];
    return String(r[0][0]?.v ?? '-');
  } catch {
    return '-';
  }
}

const asDto = <T extends z.ZodRawShape>(shape: T) => z.object({ requester_id: idField, ...shape });

export const devRouter = Router();

/** หา line_user_id ของผู้ขอจำลองจาก id — ไม่ใช่ผู้ขอจำลอง = ปฏิเสธ */
async function mockLine(requesterId: number): Promise<{ line: string; name: string }> {
  const r = await requestRepository.requesterById(requesterId);
  if (!r || !r.line_user_id?.startsWith('MOCK-')) throw notFound('ไม่พบผู้ขอจำลองนี้ (ใช้ได้เฉพาะผู้ขอจำลอง)');
  return { line: r.line_user_id, name: r.full_name };
}

/** ข้อมูลระบบสำหรับนักพัฒนา (ไม่มีค่าลับ) */
devRouter.post('/system', async (_req: Request, res: Response) => {
  const count = async (table: string) => Number(((await db(table).count({ n: '*' }).first()) as { n: number | string }).n);
  res.json(
    ok({
      env: config.env,
      node: process.version,
      db_client: config.db.client,
      db_name: config.db.database,
      db_version: await dbVersion(),
      uptime_sec: Math.round(process.uptime()),
      mode: await getSetting<string>('connection_mode'),
      mfa_required_roles: config.mfaRequiredRoles,
      counts: { users: await count('users'), requesters: await count('requester'), requests: await count('bed_request'), hospitals: await count('hospital'), logs: await count('audit_logs'), notifications: await count('notification_log') },
    }),
  );
});

devRouter.post('/mock/list', async (_req: Request, res: Response) => {
  const rows = await requestRepository.mockRequesters();
  res.json(ok(rows.map((r) => ({ id: r.id, full_name: r.full_name, phone: r.phone, phone2: r.phone2, hospital_code: r.hospital_code, hospital_name: r.hospital_name }))));
});

devRouter.post('/mock/create', async (req: Request, res: Response) => {
  const dto = parse(requesterProfileDto, { ...req.body, accept_pdpa: true });
  const line = `MOCK-${randomBytes(6).toString('hex')}`;
  const v = await requesterService.saveProfile(line, `ผู้ขอจำลอง ${dto.full_name}`, dto);
  res.status(201).json(ok({ id: v.id }, 'สร้างผู้ขอจำลองแล้ว'));
});

devRouter.post('/mock/clear', async (_req: Request, res: Response) => {
  const r = await requestRepository.deleteMockData();
  res.json(ok(r, `ลบผู้ขอจำลอง ${r.requesters} คน และคำขอ ${r.requests} รายการ`));
});

devRouter.post('/as/profile', async (req: Request, res: Response) => {
  const { requester_id } = parse(asDto({}), req.body);
  const { line } = await mockLine(requester_id);
  res.json(ok(await requesterService.profile(line)));
});

devRouter.post('/as/save-profile', async (req: Request, res: Response) => {
  const dto = parse(asDto({ profile: requesterProfileDto }), req.body);
  const { line } = await mockLine(dto.requester_id);
  res.json(ok(await requesterService.saveProfile(line, null, { ...dto.profile, accept_pdpa: true }), 'บันทึกข้อมูลผู้ขอแล้ว'));
});

devRouter.post('/as/submit', async (req: Request, res: Response) => {
  const dto = parse(asDto({ request: submitDto }), req.body);
  const { line } = await mockLine(dto.requester_id);
  res.status(201).json(ok(await requesterService.submit(line, dto.request, { by_user_id: req.user!.id, detail: `ทดสอบโดย ${req.user!.full_name} (ผู้ขอจำลอง)` }), 'ส่งคำขอแล้ว'));
});

devRouter.post('/as/mine', async (req: Request, res: Response) => {
  const { requester_id } = parse(asDto({}), req.body);
  const { line } = await mockLine(requester_id);
  res.json(ok(await requesterService.mine(line)));
});

devRouter.post('/as/cancel', async (req: Request, res: Response) => {
  const dto = parse(asDto({ id: idField }), req.body);
  const { line } = await mockLine(dto.requester_id);
  res.json(ok(await requesterService.cancel(line, dto.id), 'ยกเลิกคำขอแล้ว'));
});

devRouter.post('/as/respond', async (req: Request, res: Response) => {
  const dto = parse(asDto({ id: idField, accept: respondDto.shape.accept }), req.body);
  const { line } = await mockLine(dto.requester_id);
  res.json(ok(await requesterService.respond(line, dto.id, dto.accept), dto.accept ? 'ยืนยันแล้ว' : 'แจ้งไม่ยืนยันแล้ว'));
});

