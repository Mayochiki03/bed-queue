/**
 * publicApp.ts — พอร์ต PUBLIC (ต่อ Cloudflare Tunnel ออกอินเทอร์เน็ต) เปิดเท่าที่จำเป็นเท่านั้น
 *   GET  /api/health        ให้ปุ่มทดสอบ "เปิดเว็บจากอินเทอร์เน็ตได้" เรียก
 *   POST /api/line/webhook  LINE ส่งเหตุการณ์มา (พิมพ์ "สถานะ" / กดปุ่มยืนยัน-ไม่ยืนยัน) — ตรวจลายเซ็นเอง
 *   POST /api/requester/*   API ฝั่งผู้ขอ (ตรวจ ID token ของ LINE ทุกคำสั่ง)
 *   GET  /                  หน้าผู้ขอ (LIFF: frontend/dist-liff build แยก) · ยังไม่ได้ build = หน้าชั่วคราว · ไม่มีโค้ดหน้าเจ้าหน้าที่บนพอร์ตนี้
 *   อย่างอื่นทั้งหมด → 404  (ไม่มี /admin, ไม่มี API ของเจ้าหน้าที่ ผ่านพอร์ตนี้ ต่อให้รู้ URL ก็เข้าไม่ได้)
 * แยกจากพอร์ต INTERNAL (app.ts) ซึ่งมีทุกหน้าและใช้ใน LAN เท่านั้น
 */
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from './core/config';
import { ok } from './core/http';
import { errorHandler } from './app';
import { linePage } from './pages/line';
import { requesterPage } from './pages/requester';

const DIST = config.liffDist; // build แยกของหน้าผู้ขอ — ไม่มีโค้ดหน้าเจ้าหน้าที่
const LIFF_HTML = path.join(DIST, 'liff.html');

const PLACEHOLDER = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${config.appName}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f8f7;color:#1f2a24}main{max-width:22rem;padding:2rem;text-align:center}h1{font-size:1.25rem}p{color:#5b6b63;line-height:1.6}</style></head>
<body><main><h1>${config.appName}</h1><p>หน้าสำหรับผู้ขอเตียงเปิดผ่านแอป LINE ของโรงพยาบาล<br>ขณะนี้อยู่ระหว่างพัฒนา</p></main></body></html>`;

export function createPublicApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // หน้า LIFF: LIFF SDK โหลดส่วนเสริม (client features) จาก static.line-scdn.net ต้องอนุญาต ไม่งั้นขึ้น "Unable to load client features" · ฟอนต์/โค้ดอื่นจากเครื่องเราเท่านั้น · เรียก LINE ได้ (LIFF SDK) · รูปโปรไฟล์จาก line-scdn.net
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' https://static.line-scdn.net; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https://*.line-scdn.net; connect-src 'self' https://*.line.me https://*.line-scdn.net; base-uri 'none'; frame-ancestors 'none'");
    next();
  });
  // หลัง Cloudflare ใช้ IP จริงจาก header cf-connecting-ip
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => (req.headers['cf-connecting-ip'] as string | undefined) || req.ip || 'unknown',
    }),
  );
  // เก็บ rawBody ไว้ตรวจลายเซ็น x-line-signature
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => ((req as Request).rawBody = buf) }));

  app.get('/api/health', (_req, res) => res.json(ok({ time: new Date().toISOString(), service: 'public' })));
  app.use('/api/line', linePage.router);
  app.use('/api/requester', requesterPage.router);
  app.use('/api', (_req, res) => res.status(404).json({ status: 'NOT_FOUND', message: 'ไม่พบ API นี้' }));

  if (fs.existsSync(LIFF_HTML)) {
    app.use(express.static(DIST, { index: false, dotfiles: 'ignore', setHeaders: (res, f) => res.setHeader('Cache-Control', f.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache') }));
    app.get('/', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(LIFF_HTML);
    });
  } else app.get('/', (_req, res) => res.type('html').send(PLACEHOLDER));
  app.use((_req, res) => res.status(404).json({ status: 'NOT_FOUND', message: 'ไม่พบ' }));
  app.use(errorHandler);
  return app;
}
