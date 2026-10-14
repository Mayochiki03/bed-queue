/**
 * core/crypto.ts — เข้ารหัส/ถอดรหัสค่าลับที่เก็บในฐานข้อมูล (เช่น LINE token) ด้วย AES-256-GCM
 *
 * กุญแจมาจาก APP_SECRET_KEY ใน .env — ถ้ากุญแจหาย/เปลี่ยน ค่าที่เข้ารหัสไว้จะถอดไม่ได้ (ต้องกรอกใหม่)
 * ข้อความที่เข้ารหัสมีรูปแบบ  v1:<iv>:<tag>:<data>  (base64)  — ถ้ามีคนแก้ข้อความ GCM จะจับได้ (ถอดแล้วได้ค่าว่าง)
 */
import crypto from 'node:crypto';
import { config } from './config';

const KEY = Buffer.from(config.appSecretKey, 'hex');

export function encrypt(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decrypt(payload: string): string {
  if (!payload) return '';
  const [version, iv, tag, data] = payload.split(':');
  if (version !== 'v1' || !iv || !tag || !data) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return ''; // กุญแจเปลี่ยน หรือข้อมูลเสีย
  }
}
