/**
 * core/audit.ts — บันทึกประวัติการใช้งาน (audit log) ให้อัตโนมัติ
 *
 * ทุก request แบบ POST ภายใต้ /api/<หน้า>/<การกระทำ> จะถูกบันทึกว่า
 * "ใคร ทำอะไร ที่หน้าไหน เมื่อไร ผลเป็นอย่างไร" (action = ท้าย path เช่น ADD / UPDATE / DELETE / GET)
 * ยกเว้น /search (แค่ค้นหารายการ ไม่บันทึกเพื่อไม่ให้ log ท่วม) — คนเขียนหน้าใหม่ไม่ต้องทำอะไรเลย
 * และฝั่งหน้าจอส่งค่าเหล่านี้มาปลอมไม่ได้ (ดึงจาก session ฝั่งเซิร์ฟเวอร์เท่านั้น)
 */
import type { NextFunction, Request, Response } from 'express';
import { db, nowIso } from './db';

const SENSITIVE = /password|secret|token/i;
/** ฟิลด์ที่เป็นเนื้อไฟล์ (เช่น นำเข้า Excel ส่งมาเป็น base64 ยาวหลายแสนตัวอักษร) — จดแค่ขนาด ไม่เก็บเนื้อไฟล์ลง log */
const FILE_BODY = /base64/i;
const SKIPPED = /\/search$/;
/** หน้า audit 'minimal' (มีข้อมูลผู้ป่วย): เก็บเฉพาะฟิลด์ที่ไม่ใช่ข้อมูลส่วนบุคคล — รู้ว่าทำอะไรกับเคสไหน/ส่งออกอะไร โดยไม่เก็บชื่อ-เบอร์ */
const SAFE_KEYS = ['id', 'ids', 'action', 'via', 'hospital_id', 'requester_id', 'color_code', 'substance_code', 'reason_code', 'status', 'statuses', 'days', 'sections', 'widget_ids', 'scope', 'date_from', 'date_to'];
function safeSubset(body: unknown): unknown {
  if (!body || typeof body !== 'object') return undefined;
  const pick = Object.fromEntries(Object.entries(body as Record<string, unknown>).filter(([k]) => SAFE_KEYS.includes(k)));
  return Object.keys(pick).length ? pick : undefined;
}

function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? '***' : FILE_BODY.test(k) && typeof v === 'string' ? `[ไฟล์ ${v.length.toLocaleString('en-US')} ตัวอักษร ไม่เก็บใน log]` : mask(v)]));
  }
  return value;
}

type AuditEntry = {
  user_id?: number | null;
  username?: string | null;
  page: string;
  action: string;
  path: string;
  status_code: number;
  ip?: string | null;
  detail?: unknown;
};

/** บันทึกเหตุการณ์เอง (เช่น login/logout) — ใช้ได้จากทุกที่ ไม่ throw */
export async function writeAudit(e: AuditEntry): Promise<void> {
  try {
    await db('audit_logs').insert({
      user_id: e.user_id ?? null,
      username: e.username ?? null,
      page: e.page,
      action: e.action,
      path: e.path.slice(0, 200),
      status_code: e.status_code,
      ip: e.ip ?? null,
      detail: e.detail === undefined ? null : JSON.stringify(mask(e.detail)).slice(0, 4000),
      created_at: nowIso(),
    });
  } catch (err) {
    console.error('[audit] บันทึกไม่สำเร็จ:', err);
  }
}

/** middleware: ใช้ที่ api.use(auditMiddleware) — ข้าม /api/auth (auth บันทึกเอง) */
export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'OPTIONS') return next();
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0] ?? '';
    const segments = path.split('/'); // ['', 'api', 'hospital', 'add']
    const page = segments[2] ?? '';
    if (!page || page === 'auth' || SKIPPED.test(path)) return;
    void writeAudit({
      user_id: req.user?.id,
      username: req.user?.username,
      page,
      action: (segments[3] ?? req.method).toUpperCase(),
      path,
      status_code: res.statusCode,
      ip: req.ip,
      // หน้าที่ตั้ง audit: 'minimal' (มีข้อมูลผู้ป่วย) ไม่เก็บ body ทั้งก้อน — เก็บแค่ใคร/ทำอะไร/ผลลัพธ์ + ฟิลด์ที่ไม่ใช่ข้อมูลส่วนบุคคล
      detail: res.locals.auditMinimal ? safeSubset(req.body) : req.body,
    });
  });
  next();
}
