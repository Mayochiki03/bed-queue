/**
 * SettingController.ts — API ตั้งค่าของระบบ
 *   POST /api/setting/list   { categories?: string[] }     รายการค่า (ADMIN ขึ้นไป — เห็นเฉพาะค่าที่ role ตัวเองแก้ได้)
 *   POST /api/setting/save   { values: { key: value } }    บันทึกหลายค่าพร้อมกัน
 *   POST /api/setting/test   { kind }                       ปุ่มทดสอบในหน้าตั้งค่า: database | encryption | time | public_url | line_token (สองข้อหลังเฉพาะนักพัฒนา)
 *   POST /api/setting/ui     {}                             ค่าที่หน้าจอทุกคนต้องใช้ (ไม่มีค่าลับ)
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../core/auth';
import { ok, parse } from '../../core/http';
import { forbidden, badRequest } from '../../core/http';
import { db } from '../../core/db';
import { decrypt, encrypt } from '../../core/crypto';
import { hasRole } from '../../core/pages';
import { getSetting, listSettings, updateSettings } from '../../core/settings';

const listDto = z.object({ categories: z.array(z.string()).default([]) });
const saveDto = z.object({ values: z.record(z.unknown()) });

export const settingRouter = Router();

settingRouter.post('/list', requireRole('ADMIN'), async (req, res) => {
  const { categories } = parse(listDto, req.body);
  res.json(ok(await listSettings(categories, req.user!.role)));
});

settingRouter.post('/save', requireRole('ADMIN'), async (req, res) => {
  const { values } = parse(saveDto, req.body);
  await updateSettings(values, req.user!);
  res.json(ok(null, 'บันทึกการตั้งค่าแล้ว'));
});

settingRouter.post('/ui', async (_req, res) => {
  res.json(
    ok({
      confirm_timeout_hours: await getSetting<number>('confirm_timeout_hours'),
      queue_display: await getSetting('queue_display'),
      dashboard_default_days: await getSetting<number>('dashboard_default_days'),
      dashboard_top_n: await getSetting<number>('dashboard_top_n'),
    }),
  );
});

type TestResult = { ok: boolean; title: string; detail: string };
const testDto = z.object({ kind: z.enum(['database', 'encryption', 'time', 'public_url', 'line_token']) });

/** fetch แบบมีเวลาหมด เพื่อไม่ให้ปุ่มทดสอบค้าง */
async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

settingRouter.post('/test', requireRole('ADMIN'), async (req, res) => {
  const { kind } = parse(testDto, req.body);
  if ((kind === 'public_url' || kind === 'line_token') && !hasRole(req.user!.role, 'DEV')) throw forbidden('ทดสอบข้อนี้ได้เฉพาะนักพัฒนา');
  let r: TestResult;
  switch (kind) {
    case 'database': {
      const t0 = Date.now();
      await db.raw('select 1');
      r = { ok: true, title: 'เชื่อมต่อฐานข้อมูลได้', detail: `ตอบกลับใน ${Date.now() - t0} มิลลิวินาที` };
      break;
    }
    case 'encryption': {
      const sample = `ทดสอบ-${Date.now()}`;
      const back = decrypt(encrypt(sample));
      r = back === sample
        ? { ok: true, title: 'ระบบเข้ารหัสค่าลับทำงานปกติ', detail: 'เข้ารหัสแล้วถอดกลับได้ตรงกัน (กุญแจ APP_SECRET_KEY ใช้งานได้)' }
        : { ok: false, title: 'ระบบเข้ารหัสผิดปกติ', detail: 'ถอดรหัสแล้วไม่ตรงกับที่เข้ารหัส — ตรวจ APP_SECRET_KEY ใน .env' };
      break;
    }
    case 'time': {
      const now = new Date();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const thai = now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'medium' });
      r = { ok: true, title: 'เวลาของเซิร์ฟเวอร์', detail: `เวลาไทย ${thai} · เขตเวลาเครื่อง ${tz} · ระบบเก็บเวลาเป็น UTC (ISO) และแปลงเป็นเวลาไทยตอนแสดงผล` };
      break;
    }
    case 'public_url': {
      const base = (await getSetting('public_base_url')).replace(/\/+$/, '');
      if (!base) throw badRequest('ยังไม่ได้ตั้ง Public URL');
      try {
        const resp = await fetchWithTimeout(`${base}/api/health`, {});
        r = resp.ok
          ? { ok: true, title: 'เข้าถึง Public URL ได้', detail: `${base}/api/health ตอบกลับ ${resp.status} — URL นี้ชี้มาที่ระบบนี้จริง` }
          : { ok: false, title: 'Public URL ตอบกลับผิดปกติ', detail: `${base}/api/health ตอบ ${resp.status} — ตรวจว่า Tunnel ชี้มาที่พอร์ตของ API` };
      } catch {
        r = { ok: false, title: 'เข้าถึง Public URL ไม่ได้', detail: `${base} ไม่ตอบภายใน 8 วินาที — ตรวจว่า Cloudflare Tunnel ทำงานอยู่` };
      }
      break;
    }
    case 'line_token': {
      const token = await getSetting('line_channel_token');
      if (!token) throw badRequest('ยังไม่ได้ตั้ง Channel Access Token');
      try {
        const resp = await fetchWithTimeout('https://api.line.me/v2/bot/info', { headers: { Authorization: `Bearer ${token}` } });
        if (resp.ok) {
          const info = (await resp.json()) as { displayName?: string; basicId?: string };
          r = { ok: true, title: 'Token ใช้งานได้', detail: `LINE OA: ${info.displayName ?? '-'} ${info.basicId ?? ''}`.trim() };
        } else r = { ok: false, title: 'LINE ไม่รับ Token นี้', detail: `LINE ตอบ ${resp.status} — คัดลอก Channel Access Token (long-lived) ใหม่จาก LINE Developers` };
      } catch {
        r = { ok: false, title: 'ติดต่อ LINE ไม่ได้', detail: 'เซิร์ฟเวอร์เรียก api.line.me ไม่สำเร็จ — ตรวจอินเทอร์เน็ต/ไฟร์วอลล์ขาออก' };
      }
      break;
    }
  }
  res.json(ok(r));
});
