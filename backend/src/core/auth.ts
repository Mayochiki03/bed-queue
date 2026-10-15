/**
 * core/auth.ts — เข้าสู่ระบบด้วยชื่อผู้ใช้/รหัสผ่าน + ยืนยันตัวตน 2 ชั้น (JWT เก็บใน httpOnly cookie)
 *
 *   POST /api/auth/login            { username, password }  → ได้ session เลย หรือ { mfa: 'setup' | 'verify' } ถ้าบัญชีต้องใช้ 2FA
 *   POST /api/auth/mfa/setup        {}                      ผูกแอปครั้งแรก: ได้ QR + secret (ต้องผ่านรหัสผ่านมาก่อน)
 *   POST /api/auth/mfa/enable       { code }                ยืนยันรหัสแรก → เปิดใช้ + เข้าสู่ระบบ + รหัสสำรอง 10 ชุด (แสดงครั้งเดียว)
 *   POST /api/auth/mfa/verify       { code | recovery_code } ล็อกอินขั้นที่ 2
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *   POST /api/auth/change-password  { current_password, new_password }
 *
 * ลำดับ: รหัสผ่านถูก → (ต้องใช้ 2FA) ได้ cookie ชั่วคราว app_mfa 10 นาที ยังเรียก API อื่นไม่ได้ → ผ่านรหัส 6 หลัก → ได้ session
 * role ที่ถูกบังคับดูที่ config.mfaRequiredRoles (env MFA_REQUIRED_ROLES) · admin ติ๊กบังคับรายคนได้ · รีเซ็ตเมื่อมือถือหาย (core/mfa.ts)
 *
 *   requireAuth          ต้องล็อกอิน (ตรวจกับฐานข้อมูลทุกครั้ง → ปิดบัญชี/เปลี่ยน role มีผลทันที)
 *   requireRole('ADMIN') ต้องมี role ระดับนี้ขึ้นไป (STAFF < ADMIN < DEV)
 */
import bcrypt from 'bcryptjs';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { writeAudit } from './audit';
import { config } from './config';
import { db, nowIso } from './db';
import { badRequest, forbidden, HttpError, ok, parse, unauthorized } from './http';
import { confirmSetup, mfaEnabled, mfaRequired, startSetup, verifyLogin } from './mfa';
import { hasRole, type Role } from './pages';

export const COOKIE = 'app_session';
/** cookie ชั่วคราวระหว่างรอผ่าน 2FA (ยังไม่ใช่ session) */
export const MFA_COOKIE = 'app_mfa';
const MFA_MINUTES = 10;

export type SessionUser = { id: number; username: string; full_name: string; role: Role };

declare module 'express-serve-static-core' {
  interface Request {
    /** ผู้ใช้ที่ล็อกอินอยู่ (มีค่าหลังผ่าน requireAuth) */
    user?: SessionUser;
  }
}

type UserRow = SessionUser & {
  password_hash: string;
  is_active: number | boolean;
  session_version: number;
  totp_secret_enc: string | null;
  totp_enabled_at: string | null;
  totp_required: number | boolean;
};

const toSessionUser = (u: UserRow): SessionUser => ({ id: u.id, username: u.username, full_name: u.full_name, role: u.role });

function issueSession(res: Response, user: UserRow) {
  // sv = session_version: รีเซ็ต 2FA/ตัด session แล้ว token เก่าทุกใบใช้ไม่ได้ทันที
  const token = jwt.sign({ uid: user.id, sv: user.session_version ?? 0 }, config.jwtSecret, { expiresIn: `${config.jwtHours}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true, // JavaScript ในหน้าเว็บอ่านไม่ได้ → กัน XSS ขโมย session
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.jwtHours * 3600 * 1000,
    path: '/',
  });
}

async function loadUser(req: Request): Promise<UserRow | null> {
  const token = req.cookies?.[COOKIE] as string | undefined;
  if (!token) return null;
  let payload: { uid: number; sv?: number; kind?: string };
  try {
    payload = jwt.verify(token, config.jwtSecret) as typeof payload;
  } catch {
    return null;
  }
  if (payload.kind) return null; // ticket ชั่วคราวของ 2FA ใช้เป็น session ไม่ได้
  const user = (await db('users').where({ id: payload.uid }).first()) as UserRow | undefined;
  if (!user || !user.is_active || (payload.sv ?? 0) !== (user.session_version ?? 0)) return null;
  return user;
}

// ---------- ขั้น 2FA: ticket ชั่วคราว ----------
function issueMfaTicket(res: Response, user: UserRow) {
  const token = jwt.sign({ uid: user.id, sv: user.session_version ?? 0, kind: 'mfa' }, config.jwtSecret, { expiresIn: `${MFA_MINUTES}m` });
  res.cookie(MFA_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: MFA_MINUTES * 60 * 1000, path: '/api/auth' });
}
const clearMfaTicket = (res: Response) => res.clearCookie(MFA_COOKIE, { path: '/api/auth' });

/** ใช้กับ /mfa/*: ต้องถือ ticket ที่ได้หลังรหัสผ่านถูก */
async function requireMfaTicket(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[MFA_COOKIE] as string | undefined;
  type Ticket = { uid: number; sv?: number; kind?: string };
  let payload: Ticket | null = null;
  try {
    payload = token ? (jwt.verify(token, config.jwtSecret) as unknown as Ticket) : null;
  } catch {
    payload = null;
  }
  if (!payload || payload.kind !== 'mfa') throw unauthorized('หมดเวลายืนยันตัวตน กรุณาเข้าสู่ระบบใหม่');
  const user = (await db('users').where({ id: payload.uid }).first()) as UserRow | undefined;
  if (!user || !user.is_active || (payload.sv ?? 0) !== (user.session_version ?? 0)) throw unauthorized('หมดเวลายืนยันตัวตน กรุณาเข้าสู่ระบบใหม่');
  (req as Request & { mfaUser?: UserRow }).mfaUser = user;
  next();
}
const mfaUserOf = (req: Request) => (req as Request & { mfaUser: UserRow }).mfaUser;

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await loadUser(req);
  if (!user) throw unauthorized();
  req.user = toSessionUser(user);
  next();
}

/** ใช้หลัง requireAuth — requireRole('ADMIN') = ADMIN และ DEV ผ่านได้ (ลำดับชั้น STAFF < ADMIN < DEV) */
export const requireRole = (min: Role) => (req: Request, _res: Response, next: NextFunction) => {
  if (!hasRole(req.user!.role, min)) throw forbidden();
  next();
};

export const authRouter = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'ERROR', message: 'พยายามเข้าสู่ระบบถี่เกินไป กรุณารอสักครู่' },
});

const loginSchema = z.object({ username: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้'), password: z.string().min(1, 'กรุณากรอกรหัสผ่าน') });

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = parse(loginSchema, req.body);
  const user = (await db('users').where({ username }).first()) as UserRow | undefined;
  // เปรียบเทียบรหัสผ่านเสมอ (แม้ไม่พบผู้ใช้) เพื่อไม่ให้เดาชื่อผู้ใช้จากความเร็วตอบ
  const hash = user?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const passOk = await bcrypt.compare(password, hash);
  if (!user || !user.is_active || !passOk) {
    await writeAudit({ username, page: 'auth', action: 'LOGIN', path: '/api/auth/login', status_code: 401, ip: req.ip });
    throw new HttpError(401, 'UNAUTHORIZED', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  // ต้องใช้ 2FA (หรือผูกไว้แล้วโดยสมัครใจ) → ยังไม่ให้ session ส่งไปขั้นรหัส 6 หลักก่อน
  if (mfaRequired(user) || mfaEnabled(user)) {
    issueMfaTicket(res, user);
    const stage = mfaEnabled(user) ? 'verify' : 'setup';
    await writeAudit({ user_id: user.id, username, page: 'auth', action: 'LOGIN_PASSWORD_OK', path: '/api/auth/login', status_code: 200, ip: req.ip, detail: { mfa: stage } });
    res.json(ok({ mfa: stage, user: { full_name: user.full_name, username: user.username } }));
    return;
  }
  await completeLogin(req, res, user, {});
  res.json(ok({ user: toSessionUser(user), mfa: null }));
});

/** ออก session จริง (หลังผ่านรหัสผ่าน และ 2FA ถ้ามี) */
async function completeLogin(req: Request, res: Response, user: UserRow, detail: Record<string, unknown>) {
  issueSession(res, user);
  if (req.cookies?.[MFA_COOKIE]) clearMfaTicket(res); // ล้างเฉพาะเมื่อมี (ไม่ส่ง Set-Cookie เกินจำเป็น)
  await writeAudit({ user_id: user.id, username: user.username, page: 'auth', action: 'LOGIN', path: '/api/auth/login', status_code: 200, ip: req.ip, detail });
}

// กันเดารหัส 6 หลัก: ผิดได้ 10 ครั้ง / 15 นาที / IP (ล็อกอินสำเร็จไม่นับ; แยกจากตัวนับรหัสผ่าน)
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'ERROR', message: 'กรอกรหัสยืนยันผิดบ่อยเกินไป กรุณารอ 15 นาที' },
});

const codeSchema = z
  .object({
    code: z.string().trim().regex(/^\d{3}\s?\d{3}$/, 'กรอกรหัส 6 หลักจากแอป').optional(),
    recovery_code: z.string().trim().min(8).max(20).optional(),
  })
  .refine((b) => b.code || b.recovery_code, { message: 'กรอกรหัส 6 หลัก หรือรหัสสำรอง', path: ['code'] });

/** ผูกแอปครั้งแรก: ได้ QR + secret (เฉพาะช่วงที่ถือ ticket หลังรหัสผ่านถูก) */
authRouter.post('/mfa/setup', requireMfaTicket, async (req, res) => {
  res.json(ok(await startSetup(mfaUserOf(req))));
});

/** ยืนยันรหัสแรก → เปิดใช้ 2FA + เข้าสู่ระบบ + รหัสสำรอง 10 ชุด (แสดงครั้งเดียว) */
authRouter.post('/mfa/enable', mfaLimiter, requireMfaTicket, async (req, res) => {
  const { code } = parse(codeSchema, req.body);
  const user = mfaUserOf(req);
  let recovery: string[];
  try {
    recovery = await confirmSetup(user, code ?? '');
  } catch (err) {
    await writeAudit({ user_id: user.id, username: user.username, page: 'auth', action: 'MFA_FAILED', path: '/api/auth/mfa/enable', status_code: 400, ip: req.ip, detail: { stage: 'setup' } });
    throw err;
  }
  await writeAudit({ user_id: user.id, username: user.username, page: 'auth', action: 'MFA_ENABLED', path: '/api/auth/mfa/enable', status_code: 200, ip: req.ip });
  await completeLogin(req, res, user, { method: 'TOTP_SETUP' });
  res.json(ok({ user: toSessionUser(user), recovery_codes: recovery }));
});

/** ล็อกอินขั้นที่ 2: รหัส 6 หลัก หรือรหัสสำรอง */
authRouter.post('/mfa/verify', mfaLimiter, requireMfaTicket, async (req, res) => {
  const body = parse(codeSchema, req.body);
  const user = mfaUserOf(req);
  if (!mfaEnabled(user)) throw badRequest('บัญชีนี้ยังไม่ได้ผูกแอปยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่');
  let r: Awaited<ReturnType<typeof verifyLogin>>;
  try {
    r = await verifyLogin(user, body.recovery_code ? { recovery_code: body.recovery_code } : { code: body.code });
  } catch (err) {
    await writeAudit({ user_id: user.id, username: user.username, page: 'auth', action: 'MFA_FAILED', path: '/api/auth/mfa/verify', status_code: 400, ip: req.ip, detail: { stage: 'login', recovery: !!body.recovery_code } });
    throw err;
  }
  await completeLogin(req, res, user, { method: r.method });
  res.json(ok({ user: toSessionUser(user), recovery_left: r.recovery_left ?? null }));
});

authRouter.post('/logout', async (req, res) => {
  const user = await loadUser(req);
  res.clearCookie(COOKIE, { path: '/' });
  if (req.cookies?.[MFA_COOKIE]) clearMfaTicket(res);
  if (user) await writeAudit({ user_id: user.id, username: user.username, page: 'auth', action: 'LOGOUT', path: '/api/auth/logout', status_code: 200, ip: req.ip });
  res.json(ok(null));
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const row = (await db('users').where({ id: req.user!.id }).first('totp_enabled_at')) as { totp_enabled_at: string | null };
  res.json(ok({ ...req.user, mfa_enabled: !!row.totp_enabled_at }));
});

const passwordSchema = z.object({
  current_password: z.string().min(1, 'กรุณากรอกรหัสผ่านเดิม'),
  new_password: z.string().min(8, 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร'),
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const body = parse(passwordSchema, req.body);
  const user = (await db('users').where({ id: req.user!.id }).first()) as UserRow;
  if (!(await bcrypt.compare(body.current_password, user.password_hash))) {
    throw new HttpError(400, 'VALIDATION', 'รหัสผ่านเดิมไม่ถูกต้อง', { current_password: 'รหัสผ่านเดิมไม่ถูกต้อง' });
  }
  await db('users').where({ id: user.id }).update({ password_hash: await bcrypt.hash(body.new_password, 10), updated_at: nowIso() });
  await writeAudit({ user_id: user.id, username: user.username, page: 'auth', action: 'CHANGE_PASSWORD', path: req.originalUrl, status_code: 200, ip: req.ip });
  res.json(ok(null, 'เปลี่ยนรหัสผ่านแล้ว'));
});

/** สร้างผู้ใช้คนแรก (role DEV = นักพัฒนา เห็นทุกเมนู) ถ้ายังไม่มีผู้ใช้เลย — ใช้ค่า ADMIN_USERNAME / ADMIN_PASSWORD จาก .env */
export async function ensureAdmin(): Promise<boolean> {
  const row = (await db('users').count({ n: '*' }).first()) as { n: number | string } | undefined;
  if (Number(row?.n ?? 0) > 0) return false;
  if (config.isProd && config.admin.password === 'ChangeMe!123') {
    throw new Error('production ต้องตั้ง ADMIN_PASSWORD ใหม่ (ห้ามใช้ค่าตัวอย่าง ChangeMe!123) ก่อนสร้างผู้ดูแลระบบคนแรก');
  }
  const now = nowIso();
  await db('users').insert({
    username: config.admin.username,
    password_hash: await bcrypt.hash(config.admin.password, 10),
    full_name: 'นักพัฒนาระบบ',
    role: 'DEV',
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  return true;
}
