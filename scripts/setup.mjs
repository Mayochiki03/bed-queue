// สร้างไฟล์ .env จาก .env.example พร้อมสุ่ม JWT_SECRET  —  รัน: npm run setup
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, '.env');

if (fs.existsSync(target)) {
  console.log('มีไฟล์ .env อยู่แล้ว — ไม่แตะต้อง (ลบไฟล์ก่อนถ้าต้องการสร้างใหม่)');
  process.exit(0);
}

const secret = crypto.randomBytes(32).toString('hex');
const appKey = crypto.randomBytes(32).toString('hex');
const text = fs
  .readFileSync(path.join(root, '.env.example'), 'utf8')
  .replace('# JWT_SECRET=', `JWT_SECRET=${secret} #`)
  .replace('# APP_SECRET_KEY=', `APP_SECRET_KEY=${appKey} #`);
fs.writeFileSync(target, text);
console.log('สร้าง .env แล้ว (สุ่ม JWT_SECRET และ APP_SECRET_KEY ให้เรียบร้อย)\nแก้ค่าในไฟล์นั้นได้ตามต้องการ แล้วรัน: npm run dev');
