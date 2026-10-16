/**
 * LineAuth.ts — ยืนยันว่าผู้เรียก API คือผู้ใช้ LINE คนนั้นจริง
 *
 * หน้าเว็บใน LIFF ส่ง ID token (liff.getIDToken()) มาใน header  Authorization: Bearer <token>
 * เซิร์ฟเวอร์ให้ LINE ตรวจเอง (POST https://api.line.me/oauth2/v2.1/verify) แล้วได้ userId (sub) + ชื่อที่แสดง
 * — ห้ามเชื่อ userId ที่หน้าเว็บส่งมาเอง เพราะปลอมได้ · ผลการตรวจจำไว้ในหน่วยความจำจนกว่า token หมดอายุ (ลดการเรียก LINE)
 *
 * ต้องตั้ง "LINE Login Channel ID" ในหน้าการเชื่อมต่อ LINE และไม่ใช่โหมด LOCAL
 */
import type { NextFunction, Request, Response } from 'express';
import { forbidden, HttpError, unauthorized } from '../../core/http';
import { getSetting } from '../../core/settings';

export type LineIdentity = { userId: string; name: string | null };

declare module 'express-serve-static-core' {
  interface Request {
    line?: LineIdentity;
  }
}

const cache = new Map<string, LineIdentity & { exp: number }>();
const MAX_CACHE = 2000;

function remember(token: string, v: LineIdentity & { exp: number }) {
  if (cache.size >= MAX_CACHE) {
    const now = Date.now() / 1000;
    for (const [k, c] of cache) if (c.exp <= now) cache.delete(k);
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  }
  cache.set(token, v);
}

export async function verifyIdToken(token: string): Promise<LineIdentity> {
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now() / 1000) return { userId: hit.userId, name: hit.name };

  const [mode, clientId] = await Promise.all([getSetting<string>('connection_mode'), getSetting<string>('line_login_channel_id')]);
  if (mode === 'LOCAL') throw forbidden('ระบบยังอยู่ในโหมด LOCAL (ยังไม่เปิดใช้ผ่าน LINE)');
  if (!clientId) throw new HttpError(503, 'ERROR', 'ยังไม่ได้ตั้ง LINE Login Channel ID');

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const resp = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: token, client_id: clientId }).toString(),
      signal: ctl.signal,
    });
    const data = (await resp.json().catch(() => null)) as { sub?: string; name?: string; exp?: number } | null;
    if (!resp.ok || !data?.sub) throw unauthorized('เข้าสู่ระบบ LINE หมดอายุ กรุณาเปิดหน้านี้จาก LINE ใหม่');
    const id = { userId: data.sub, name: data.name ?? null };
    remember(token, { ...id, exp: data.exp ?? Date.now() / 1000 + 600 });
    return id;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, 'ERROR', 'ตรวจสอบตัวตนกับ LINE ไม่ได้ กรุณาลองใหม่');
  } finally {
    clearTimeout(timer);
  }
}

/** middleware: ต้องมี Bearer ID token ที่ LINE รับรอง → ตั้ง req.line */
export async function requireLine(req: Request, _res: Response, next: NextFunction) {
  try {
    const m = /^Bearer (.+)$/.exec(req.header('authorization') ?? '');
    if (!m) throw unauthorized('กรุณาเปิดหน้านี้ผ่านแอป LINE');
    req.line = await verifyIdToken(m[1]!);
    next();
  } catch (e) {
    next(e);
  }
}

/** ใช้ในเทสต์: ล้างผลที่จำไว้ */
export const clearIdTokenCache = () => cache.clear();
