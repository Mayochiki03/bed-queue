/**
 * SettingController.ts — API ตั้งค่าของระบบ
 *   POST /api/setting/list   { categories?: string[] }     รายการค่า (ADMIN ขึ้นไป — เห็นเฉพาะค่าที่ role ตัวเองแก้ได้)
 *   POST /api/setting/save   { values: { key: value } }    บันทึกหลายค่าพร้อมกัน
 *   POST /api/setting/test   { kind, line_user_id? }        ปุ่มทดสอบ: database | encryption | time | public_url | line_token | line_quota | line_push | line_webhook (5 ข้อหลังเฉพาะนักพัฒนา)
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
import { lineClient } from '../notification/LineClient';
import { monthStartBangkok } from '../notification/NotificationService';

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
      pdpa_notice: await getSetting<string>('pdpa_notice'),
    }),
  );
});

type TestResult = { ok: boolean; title: string; detail: string };
const testDto = z.object({
  kind: z.enum(['database', 'encryption', 'time', 'public_url', 'line_token', 'line_quota', 'line_push', 'line_webhook']),
  /** line_push: LINE user ID ที่จะส่งข้อความทดสอบไปหา (ส่งจริง 1 ข้อความ นับโควต้า) */
  line_user_id: z.string().trim().max(60).optional(),
});

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
  const { kind, line_user_id } = parse(testDto, req.body);
  if (['public_url', 'line_token', 'line_quota', 'line_push', 'line_webhook'].includes(kind) && !hasRole(req.user!.role, 'DEV')) throw forbidden('ทดสอบข้อนี้ได้เฉพาะนักพัฒนา');
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
    case 'line_quota': {
      if (!(await getSetting<string>('line_channel_token'))) throw badRequest('ยังไม่ได้ตั้ง Channel Access Token');
      const [q, used] = await Promise.all([lineClient.quota(), lineClient.consumption()]);
      if (!q.ok || !used.ok) {
        r = { ok: false, title: 'อ่านโควต้าจาก LINE ไม่ได้', detail: `LINE ตอบ ${q.status || used.status} — ตรวจ Token (ต้องเป็น Messaging API ของ OA นี้)` };
      } else {
        const limit = q.data?.type === 'limited' ? q.data.value : null;
        const mine = (await db('notification_log').where('created_at', '>=', monthStartBangkok()).where({ status: 'SENT' }).count({ n: '*' }).first()) as { n: number | string };
        r = { ok: true, title: 'โควต้าข้อความเดือนนี้', detail: `LINE นับใช้ไป ${used.data?.totalUsage ?? 0} จาก ${limit ?? 'ไม่จำกัด'} ข้อความ (ระบบนี้ส่งเอง ${Number(mine.n)} ข้อความ — ข้อความจากช่องทางอื่นของ OA เช่น แชทตอบเองก็นับรวม)` };
      }
      break;
    }
    case 'line_webhook': {
      if (!(await getSetting<string>('line_channel_token'))) throw badRequest('ยังไม่ได้ตั้ง Channel Access Token');
      if (!(await getSetting<string>('line_channel_secret'))) throw badRequest('ยังไม่ได้ตั้ง Channel Secret (ใช้ตรวจลายเซ็นของ LINE)');
      const base = (await getSetting<string>('public_base_url')).replace(/\/+$/, '');
      const expect = base ? `${base}/api/line/webhook` : '';
      const info = await lineClient.webhookInfo();
      if (!info.ok) {
        r = { ok: false, title: 'อ่าน Webhook URL จาก LINE ไม่ได้', detail: `LINE ตอบ ${info.status || 'ไม่ตอบ'} — ตรวจ Channel Access Token` };
        break;
      }
      const set = info.data?.endpoint ?? '';
      if (!set) {
        r = { ok: false, title: 'ยังไม่ได้ตั้ง Webhook URL ใน LINE Developers', detail: `วางที่ Messaging API → Webhook URL: ${expect || '(ตั้ง Public URL ก่อน)'}` };
        break;
      }
      if (expect && set !== expect) {
        r = { ok: false, title: 'Webhook URL ใน LINE ไม่ตรงกับของระบบ', detail: `LINE ใช้ ${set} แต่ระบบนี้ควรเป็น ${expect} — Cloudflare Quick Tunnel เปลี่ยน URL ทุกครั้งที่เปิดใหม่ ต้องแก้ทั้งสองฝั่งให้ตรงกัน` };
        break;
      }
      const t = await lineClient.webhookTest();
      if (!t.ok) r = { ok: false, title: 'ให้ LINE ทดสอบไม่สำเร็จ', detail: `LINE ตอบ ${t.status || 'ไม่ตอบ'}` };
      else if (t.data?.success) r = { ok: true, title: 'Webhook ใช้งานได้', detail: `LINE ยิงทดสอบมาที่ ${set} แล้วระบบตอบ ${t.data.statusCode ?? 200} · ลายเซ็นถูกต้อง · ถ้า Use webhook ใน LINE ยังปิดอยู่ให้เปิดด้วย` };
      else r = { ok: false, title: 'LINE ยิงทดสอบแล้วระบบตอบผิดปกติ', detail: `${t.data?.reason ?? 'ไม่ทราบสาเหตุ'}${t.data?.statusCode ? ` (รหัส ${t.data.statusCode})` : ''}${t.data?.detail ? ` — ${t.data.detail}` : ''} · ตรวจ Channel Secret ว่าตรงกับ OA นี้ และ Tunnel ยังทำงานอยู่` };
      break;
    }
    case 'line_push': {
      if (!(await getSetting<string>('line_channel_token'))) throw badRequest('ยังไม่ได้ตั้ง Channel Access Token');
      if (!line_user_id) throw badRequest('กรอก LINE user ID ที่จะส่งทดสอบไปหา', { line_user_id: 'กรอก LINE user ID' });
      const resp = await lineClient.push(line_user_id, [{ type: 'text', text: 'ทดสอบจากระบบคิวขอเตียง: หากเห็นข้อความนี้ แสดงว่าการเชื่อมต่อ LINE ใช้งานได้' }]);
      r = resp.ok
        ? { ok: true, title: 'ส่งข้อความทดสอบแล้ว', detail: 'ตรวจใน LINE ของ user ID นี้ (ข้อความนี้นับเป็น 1 ข้อความในโควต้า)' }
        : { ok: false, title: 'ส่งไม่สำเร็จ', detail: `LINE ตอบ ${resp.status || 'ไม่ตอบ'}${resp.data?.message ? `: ${resp.data.message}` : ''} — ผู้รับต้องเป็นเพื่อนกับ OA นี้ และ user ID ต้องมาจาก Provider เดียวกัน` };
      break;
    }
  }
  res.json(ok(r));
});
