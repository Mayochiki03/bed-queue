/**
 * LanGuard.ts — ให้เรียก API ได้เฉพาะเครื่องในวงเครือข่ายภายใน (ใช้กับ Dashboard ที่ไม่ต้องล็อกอิน)
 *
 * ตัดสินจาก "ที่อยู่ของ socket จริง" (req.socket.remoteAddress) เท่านั้น — ห้ามใช้ req.ip / X-Forwarded-For
 * เพราะ trust proxy เปิดไว้ (ต้องรองรับ Cloudflare) ทำให้ใครก็ส่ง X-Forwarded-For ปลอมเป็น 10.x มาได้
 * และถ้ามีคนเอาพอร์ตนี้ไปต่อ tunnel / reverse proxy ทุกคำขอจะมาจาก 127.0.0.1 → จึงปฏิเสธทุกคำขอที่มี header ของ proxy ด้วย
 */
import type { NextFunction, Request, Response } from 'express';
import { forbidden } from '../../core/http';

/** header ที่ proxy / tunnel เติมให้ — ถ้าเจอ แปลว่าคำขอไม่ได้มาจากเครื่องในวงตรง ๆ */
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'forwarded', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'true-client-ip', 'via'];

export function normalizeIp(addr: string | undefined): string {
  if (!addr) return '';
  const a = addr.toLowerCase();
  return a.startsWith('::ffff:') ? a.slice(7) : a;
}

/** ที่อยู่ภายใน: 10/8 · 172.16/12 · 192.168/16 · 127/8 · ::1 · fe80::/10 · fc00::/7 */
export function isPrivateIp(addr: string | undefined): boolean {
  const ip = normalizeIp(addr);
  if (!ip) return false;
  if (ip === '::1') return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return false;
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return /^fe[89ab][0-9a-f]:/.test(ip) || /^f[cd][0-9a-f]{2}:/.test(ip);
}

export function lanOnly(req: Request, _res: Response, next: NextFunction) {
  if (PROXY_HEADERS.some((h) => req.headers[h] !== undefined)) return next(forbidden('เปิดดูได้เฉพาะในเครือข่ายโรงพยาบาล'));
  if (!isPrivateIp(req.socket.remoteAddress)) return next(forbidden('เปิดดูได้เฉพาะในเครือข่ายโรงพยาบาล'));
  next();
}
