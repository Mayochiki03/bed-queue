/**
 * app.ts — ประกอบ Express app: กลุ่ม /api (auth, หน้าต่าง ๆ) และเสิร์ฟหน้าเว็บที่ build แล้ว
 */
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { auditMiddleware } from './core/audit';
import { authRouter, requireAuth, requireRole } from './core/auth';
import { config } from './core/config';
import { fromZod, HttpError, notFound, ok } from './core/http';
import { pages } from './pages';

declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer;
  }
}

/**
 * พอร์ต INTERNAL (LAN เท่านั้น) — ทุกหน้า: หน้าเจ้าหน้าที่ /admin + API ทั้งหมด
 * (ชื่อ createApp คงไว้เพราะชุดทดสอบใช้ตัวนี้)
 */
export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  // เก็บ rawBody ไว้ด้วย — ใช้ตรวจลายเซ็น (x-line-signature) ของ LINE webhook ซึ่งต้องคำนวณจากข้อความดิบ
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => ((req as Request).rawBody = buf) }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(auditMiddleware);

  api.get('/health', (_req, res) => res.json(ok({ time: new Date().toISOString() })));
  // ข้อมูลที่หน้าเว็บต้องรู้ก่อนล็อกอิน (ชื่อระบบ + ธีม)
  api.get('/app', (_req, res) => res.json(ok({ name: config.appName, theme: config.theme })));
  api.use('/auth', authRouter);

  // ลงทะเบียนทุกหน้าจาก src/pages/index.ts → /api/<name>
  //   ค่าเริ่มต้น: ต้องล็อกอิน + มี role ถึง minRole · access:'public' = หน้านั้นตรวจสิทธิ์เอง (ผู้ขอผ่าน LINE / webhook)
  for (const page of pages) {
    const mark = (_req: Request, res: Response, next: NextFunction) => {
      res.locals.auditMinimal = page.audit === 'minimal';
      next();
    };
    if (page.access === 'public') api.use(`/${page.name}`, mark, page.router);
    else api.use(`/${page.name}`, mark, requireAuth, requireRole(page.minRole ?? 'STAFF'), page.router);
  }

  api.use((_req, _res, next) => next(notFound('ไม่พบ API นี้')));
  app.use('/api', api);

  // production: เสิร์ฟหน้าเว็บที่ build แล้ว (npm run build) — หน้าเจ้าหน้าที่อยู่ที่ /admin (เหมือนระบบนวด) · / พาไป /admin
  const index = path.join(config.frontendDist, 'index.html');
  if (fs.existsSync(index)) {
    app.use(express.static(config.frontendDist, { index: false }));
    app.get('/', (_req, res) => res.redirect('/admin/'));
    app.get(/^\/admin(\/.*)?$/, (_req, res) => res.sendFile(index));
  }

  app.use(errorHandler);

  return app;
}

/** ตัวจัดการ error กลาง — ทุก throw ในหน้าต่าง ๆ มาจบที่นี่ และตอบรูปแบบเดียวกันหมด (ใช้ทั้งสองพอร์ต) */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const e = err instanceof ZodError ? fromZod(err) : err;
  if (e instanceof HttpError) {
    res.status(e.httpStatus).json({ status: e.status, message: e.message, fields: e.fields });
    return;
  }
  if (typeof e === 'object' && e && (e as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ status: 'VALIDATION', message: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง' });
    return;
  }
  console.error('[error]', e);
  res.status(500).json({ status: 'ERROR', message: 'เกิดข้อผิดพลาดในระบบ' });
}
