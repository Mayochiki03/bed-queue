/**
 * core/config.ts — อ่านค่าตั้งต้นจากไฟล์ .env (ถ้ามี) แล้วรวมเป็น object เดียวชื่อ `config`
 *
 * ไม่มีไฟล์ .env ก็รันได้ — ทุกค่ามีค่าเริ่มต้น แต่ต้องมีฐานข้อมูล MariaDB ตามคู่มือ database/README.md ก่อน
 * ไฟล์ใน core/ คือ "ตัวกลาง" ปกติไม่ต้องแก้ (ดู docs/02-อ่านโค้ด.md)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** โฟลเดอร์นอกสุดของโปรเจกต์ (ที่มี package.json ตัวแรก) */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// ค่าที่ตั้งไว้ใน environment จริงมีสิทธิ์เหนือไฟล์ .env เสมอ (loadEnvFile ไม่ทับค่าเดิม)
const envFile = process.env.ENV_FILE ?? path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

/** อ่านตัวแปรจาก .env พร้อมค่าเริ่มต้น */
export function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

export type DbClient = 'mariadb' | 'mysql' | 'postgres';

const DB_CLIENTS: Record<string, DbClient> = {
  mariadb: 'mariadb',
  mysql: 'mysql',
  postgres: 'postgres',
  postgresql: 'postgres',
  pg: 'postgres',
};

const dbName = env('DB_CLIENT', 'mariadb').toLowerCase();
const dbClient = DB_CLIENTS[dbName];
if (!dbClient) throw new Error(`DB_CLIENT="${dbName}" ไม่รองรับ — ใช้ได้: mariadb | mysql | postgres`);

/** รหัสผ่านตั้งต้นที่ database/init.sql สร้างให้ (ใช้ตอนพัฒนาเท่านั้น — production ต้องเปลี่ยน) */
const DEFAULT_DB_PASSWORD = 'app_password';

/** กุญแจเข้ารหัสค่าลับในฐานข้อมูล (AES-256 = hex 64 ตัว) — ค่านี้ใช้ตอนพัฒนาเท่านั้น production ต้องตั้ง APP_SECRET_KEY เอง */
export const DEV_SECRET_KEY = '0123456789abcdef'.repeat(4);

const nodeEnv = env('NODE_ENV', 'development');

export const config = {
  env: nodeEnv,
  isProd: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  appName: env('APP_NAME', 'ระบบคิวขอเตียง'),
  /** ธีมสี: care | herb | ocean | rose | slate | indigo | amber | graphite (ดู frontend/src/theme.css) */
  theme: env('APP_THEME', 'care'),
  host: env('HOST', '0.0.0.0'),
  port: Number(env('PORT', '4000')),

  db: {
    client: dbClient,
    host: env('DB_HOST', '127.0.0.1'),
    port: Number(env('DB_PORT', dbClient === 'postgres' ? '5432' : '3306')),
    user: env('DB_USER', 'app'),
    password: env('DB_PASSWORD', DEFAULT_DB_PASSWORD),
    database: env('DB_NAME', 'bed_queue'),
  },

  jwtSecret: env('JWT_SECRET', 'dev-only-secret-change-me'),
  appSecretKey: env('APP_SECRET_KEY', DEV_SECRET_KEY).toLowerCase(),
  /** จำนวน proxy ที่เชื่อถือหน้าเซิร์ฟเวอร์ (Cloudflare Tunnel = 1) — ทำให้ audit/rate limit เห็น IP จริง */
  trustProxy: Number(env('TRUST_PROXY', '1')),
  jwtHours: Number(env('JWT_HOURS', '12')),
  cookieSecure: env('COOKIE_SECURE', 'false') === 'true',

  /** true = ตอนเปิดระบบถ้ามี migration ค้างให้รันเอง (ค่าเริ่มต้น: เฉพาะโหมดพัฒนา/เทสต์) */
  autoMigrate: env('AUTO_MIGRATE', nodeEnv === 'production' ? 'false' : 'true') === 'true',
  /** โฟลเดอร์ผลลัพธ์ของ frontend (npm run build) — ถ้ามี backend จะเสิร์ฟให้เอง */
  frontendDist: path.resolve(ROOT, env('FRONTEND_DIST', 'frontend/dist')),

  admin: {
    username: env('ADMIN_USERNAME', 'admin'),
    password: env('ADMIN_PASSWORD', 'ChangeMe!123'),
  },
};

if (config.isProd && (config.jwtSecret.length < 32 || config.jwtSecret.includes('change-me'))) {
  throw new Error('production ต้องตั้ง JWT_SECRET ยาวอย่างน้อย 32 ตัวอักษร (รัน npm run setup เพื่อสร้างให้)');
}

if (config.isProd && config.db.password === DEFAULT_DB_PASSWORD) {
  throw new Error('production ห้ามใช้รหัสผ่านฐานข้อมูลตั้งต้น — ตั้ง DB_PASSWORD ใน .env ให้ตรงกับที่ตั้งไว้ในฐานข้อมูลจริง (ดู database/README.md)');
}

if (!/^[0-9a-f]{64}$/.test(config.appSecretKey)) {
  throw new Error('APP_SECRET_KEY ต้องเป็นตัวเลขฐาน 16 ยาว 64 ตัว (รัน npm run setup เพื่อสร้างให้)');
}
if (config.isProd && config.appSecretKey === DEV_SECRET_KEY) {
  throw new Error('production ต้องตั้ง APP_SECRET_KEY ของตัวเอง (รัน npm run setup เพื่อสร้างให้) — ห้ามใช้ค่าตั้งต้นสำหรับพัฒนา');
}
