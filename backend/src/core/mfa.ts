/**
 * core/mfa.ts — นโยบายและข้อมูล 2FA ของบัญชีเจ้าหน้าที่ (ดัดแปลงจากระบบจองคิวนวด)
 *
 *   mfaRequired(user)        บัญชีนี้ต้องใช้ 2FA ไหม (role ถูกบังคับ หรือ admin ติ๊กบังคับรายคน)
 *   mfaEnabled(user)         ผูกแอปเสร็จแล้วหรือยัง
 *   startSetup(user)         สร้าง/ใช้ secret ที่รอยืนยันอยู่ → QR (data URL) + secret ไว้พิมพ์เอง
 *   confirmSetup(user, code) ยืนยันรหัสแรก → เปิดใช้ + ออกรหัสสำรอง 10 ชุด (แสดงครั้งเดียว)
 *   verifyLogin(user, ...)   ตรวจตอนล็อกอิน (รหัส 6 หลัก หรือรหัสสำรอง)
 *   resetMfa(userId)         ล้าง 2FA (มือถือหาย/เปลี่ยนเครื่อง) + ตัด session ทุกเครื่อง
 */
import QRCode from 'qrcode';
import { config } from './config';
import { db, nowIso } from './db';
import { decrypt, encrypt } from './crypto';
import { badRequest, conflict } from './http';
import type { Role } from './pages';
import { formatSecret, generateRecoveryCodes, generateSecret, hashRecoveryCode, otpauthUrl, verifyTotp } from './totp';

export type MfaUser = { id: number; username: string; role: Role; totp_secret_enc?: string | null; totp_enabled_at?: string | null; totp_required?: number | boolean | null };

export const mfaRequired = (u: MfaUser): boolean => config.mfaRequiredRoles.includes(u.role) || !!u.totp_required;
export const mfaEnabled = (u: MfaUser): boolean => !!u.totp_enabled_at;

const INVALID_CODE = 'รหัสไม่ถูกต้อง หรือหมดเวลาแล้ว กรุณาใช้รหัสล่าสุดจากแอป';

/** เริ่มผูกแอป: ถ้ามี secret ที่สแกนค้างไว้ (ยังไม่ยืนยัน) ใช้ตัวเดิม → รีเฟรชแล้ว QR ไม่เปลี่ยน รายการในแอปไม่ซ้ำ */
export async function startSetup(user: MfaUser) {
  if (mfaEnabled(user)) throw conflict('บัญชีนี้ผูกแอปยืนยันตัวตนแล้ว');
  let secret = user.totp_secret_enc ? decrypt(user.totp_secret_enc) : '';
  if (!secret) {
    secret = generateSecret();
    await db('users').where({ id: user.id }).whereNull('totp_enabled_at').update({ totp_secret_enc: encrypt(secret) });
  }
  const issuer = String(config.appName).replace(/:/g, ' ').slice(0, 60);
  const url = otpauthUrl({ issuer, account: user.username, secret });
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
  // url = ลิงก์ otpauth:// ให้กดเปิดแอปได้เลยเมื่อตั้งค่าจากมือถือเครื่องเดียวกับแอป (สแกนจอตัวเองไม่ได้)
  return { qr, url, secret: formatSecret(secret), issuer, account: user.username };
}

/** ยืนยันรหัสแรกจากแอป → เปิดใช้ 2FA + ออกรหัสสำรอง (แสดงครั้งเดียว) */
export async function confirmSetup(user: MfaUser, code: string): Promise<string[]> {
  return db.transaction(async (trx) => {
    const row = (await trx('users').where({ id: user.id }).forUpdate().first('totp_secret_enc', 'totp_enabled_at')) as { totp_secret_enc: string | null; totp_enabled_at: string | null };
    if (row.totp_enabled_at) throw conflict('บัญชีนี้ผูกแอปยืนยันตัวตนแล้ว');
    const secret = row.totp_secret_enc ? decrypt(row.totp_secret_enc) : '';
    if (!secret) throw badRequest('กรุณาสแกน QR ใหม่อีกครั้ง');
    const step = verifyTotp(secret, code);
    if (step == null) throw badRequest(INVALID_CODE, { code: INVALID_CODE });
    await trx('users').where({ id: user.id }).update({ totp_enabled_at: nowIso(), totp_last_step: step });
    const codes = generateRecoveryCodes();
    await trx('user_recovery_code').where({ user_id: user.id }).delete();
    await trx('user_recovery_code').insert(codes.map((c) => ({ user_id: user.id, code_hash: hashRecoveryCode(c) })));
    return codes;
  });
}

/** ตรวจตอนล็อกอิน (ล็อกแถวผู้ใช้ไว้ → ส่งรหัสเดียวกันพร้อมกัน 2 ครั้ง ผ่านได้ครั้งเดียว) */
export async function verifyLogin(user: MfaUser, input: { code?: string; recovery_code?: string }): Promise<{ method: 'TOTP' | 'RECOVERY'; recovery_left?: number }> {
  return db.transaction(async (trx) => {
    const row = (await trx('users').where({ id: user.id }).forUpdate().first('totp_secret_enc', 'totp_last_step')) as { totp_secret_enc: string | null; totp_last_step: number | string | null };
    if (input.recovery_code) {
      const n = await trx('user_recovery_code').where({ user_id: user.id, code_hash: hashRecoveryCode(input.recovery_code) }).whereNull('used_at').update({ used_at: nowIso() });
      if (!n) throw badRequest('รหัสสำรองไม่ถูกต้อง หรือถูกใช้ไปแล้ว', { recovery_code: 'รหัสสำรองไม่ถูกต้อง หรือถูกใช้ไปแล้ว' });
      const left = (await trx('user_recovery_code').where({ user_id: user.id }).whereNull('used_at').count({ n: '*' }).first()) as { n: number | string };
      return { method: 'RECOVERY', recovery_left: Number(left.n) };
    }
    const secret = row.totp_secret_enc ? decrypt(row.totp_secret_enc) : '';
    const step = secret ? verifyTotp(secret, input.code, { afterStep: row.totp_last_step == null ? null : Number(row.totp_last_step) }) : null;
    if (step == null) throw badRequest(INVALID_CODE, { code: INVALID_CODE });
    await trx('users').where({ id: user.id }).update({ totp_last_step: step });
    return { method: 'TOTP' };
  });
}

/** ล้าง 2FA ของบัญชี + ตัด session ทุกเครื่อง (ล็อกอินครั้งถัดไปจะได้ QR ใหม่ถ้ายังถูกบังคับใช้) */
export async function resetMfa(userId: number): Promise<void> {
  await db.transaction(async (trx) => {
    await trx('users').where({ id: userId }).update({ totp_secret_enc: null, totp_enabled_at: null, totp_last_step: null, updated_at: nowIso() });
    await trx('users').where({ id: userId }).increment('session_version', 1);
    await trx('user_recovery_code').where({ user_id: userId }).delete();
  });
}

export async function recoveryCodesLeft(userId: number): Promise<number> {
  const r = (await db('user_recovery_code').where({ user_id: userId }).whereNull('used_at').count({ n: '*' }).first()) as { n: number | string };
  return Number(r.n);
}
