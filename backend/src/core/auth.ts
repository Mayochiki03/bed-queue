/**
 * core/auth.ts — เข้าสู่ระบบด้วยชื่อผู้ใช้/รหัสผ่าน (JWT เก็บใน httpOnly cookie)
 *
 *   POST /api/auth/login            { username, password }
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *   POST /api/auth/change-password  { current_password, new_password }
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
import { forbidden, HttpError, ok, parse, unauthorized } from './http';
import { hasRole, type Role } from './pages';

export const COOKIE = 'app_session';

export type SessionUser = { id: number; username: string; full_name: string; role: Role };

declare module 'express-serve-static-core' {
  interface Request {
    /** ผู้ใช้ที่ล็อกอินอยู่ (มีค่าหลังผ่าน requireAuth) */
    user?: SessionUser;
  }
}

type UserRow = SessionUser & { password_hash: string; is_active: number | boolean };

const toSessionUser = (u: UserRow): SessionUser => ({ id: u.id, username: u.username, full_name: u.full_name, role: u.role });

function issueSession(res: Response, user: UserRow) {
  const token = jwt.sign({ uid: user.id }, config.jwtSecret, { expiresIn: `${config.jwtHours}h` });
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
  let uid: number;
  try {
    uid = (jwt.verify(token, config.jwtSecret) as { uid: number }).uid;
  } catch {
    return null;
  }
  const user = (await db('users').where({ id: uid }).first()) as UserRow | undefined;
  return user && user.is_active ? user : null;
}

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
  issueSession(res, user);
  await writeAudit({ user_id: user.id, username, page: 'auth', action: 'LOGIN', path: '/api/auth/login', status_code: 200, ip: req.ip });
  res.json(ok(toSessionUser(user)));
});

authRouter.post('/logout', async (req, res) => {
  const user = await loadUser(req);
  res.clearCookie(COOKIE, { path: '/' });
  if (user) await writeAudit({ user_id: user.id, username: user.username, page: 'auth', action: 'LOGOUT', path: '/api/auth/logout', status_code: 200, ip: req.ip });
  res.json(ok(null));
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(ok(req.user));
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
