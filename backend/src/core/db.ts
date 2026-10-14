/**
 * core/db.ts — จุดเชื่อมฐานข้อมูลจุดเดียวของทั้งระบบ (MariaDB เป็นหลัก / MySQL / PostgreSQL)
 *
 * โค้ดที่เหลือไม่ต้องรู้ว่าใช้ฐานไหน ความต่างถูกปรับไว้ที่นี่:
 *   - DATE/TIME คืนเป็น string เหมือนกันทุกฐาน, DECIMAL/BIGINT คืนเป็น number
 *   - เวลาใน session เป็น UTC (คอลัมน์ created_at ทุกตารางเก็บ UTC)
 *   - insertGetId(): เพิ่มแถวแล้วได้ id กลับมา
 *   - whereContains(): ค้นหาข้อความแบบไม่สนตัวพิมพ์เล็ก-ใหญ่
 *
 * สำคัญ: กฎ: ห้ามเขียน SQL เฉพาะฐาน (NOW(), ILIKE, RETURNING ...) นอกไฟล์นี้ — ใช้ knex query builder
 */
import knex, { type Knex } from 'knex';
import pg from 'pg';
import { config } from './config';

// PostgreSQL: ให้ชนิดข้อมูลคืนค่าเหมือน MySQL
pg.types.setTypeParser(1082, (v: string) => v); // DATE → 'YYYY-MM-DD'
pg.types.setTypeParser(1700, (v: string) => Number(v)); // NUMERIC → number
pg.types.setTypeParser(20, (v: string) => Number(v)); // BIGINT → number

const c = config.db;
export const isPg = c.client === 'postgres';

/** ซ่อน stack trace ยาว ๆ ตอนต่อฐานข้อมูลไม่ได้ (checkConnection() จะบอกสาเหตุเป็นภาษาไทยให้แทน) */
const log: Knex.Config['log'] = {
  warn(message: unknown) {
    if (typeof message === 'string' && message.startsWith('Acquire connection error')) return;
    console.warn(message);
  },
};

function buildKnex(): Knex {
  if (isPg) {
    return knex({
      log,
      client: 'pg',
      connection: { host: c.host, port: c.port, user: c.user, password: c.password, database: c.database },
      pool: {
        min: 0,
        max: 10,
        afterCreate(conn: { query: (s: string, cb: (e: Error | null) => void) => void }, done: (err: Error | null, conn: unknown) => void) {
          conn.query("SET TIME ZONE 'UTC'", (err) => done(err, conn));
        },
      },
    });
  }

  return knex({
    log,
    client: 'mysql2',
    connection: {
      host: c.host,
      port: c.port,
      user: c.user,
      password: c.password,
      database: c.database,
      charset: 'utf8mb4',
      dateStrings: true,
      decimalNumbers: true,
    },
    pool: {
      min: 0,
      max: 10,
      afterCreate(conn: { query: (s: string, cb: (e: Error | null) => void) => void }, done: (err: Error | null, conn: unknown) => void) {
        conn.query("SET time_zone = '+00:00'", (err) => done(err, conn));
      },
    },
  });
}

export const db = buildKnex();

/** เพิ่มแถวแล้วคืน id ของแถวใหม่ (ใช้แทน db(table).insert() เมื่อต้องการ id) */
export async function insertGetId(executor: Knex | Knex.Transaction, table: string, row: Record<string, unknown>): Promise<number> {
  if (isPg) {
    const rows = await executor(table).insert(row).returning('id');
    const first = rows[0] as { id: number } | number;
    return typeof first === 'object' ? first.id : first;
  }
  const [id] = await executor(table).insert(row);
  return Number(id);
}

/** escape ตัวอักขระพิเศษของ LIKE โดยใช้ ! เป็นตัวหนี (ใช้ได้ทุกฐาน) */
const likeEscape = (text: string) => text.toLowerCase().replace(/[!%_]/g, (m) => `!${m}`);

/** ค้นหาข้อความแบบมีคำนี้อยู่ ไม่สนตัวพิมพ์เล็ก-ใหญ่ (ใช้กับคอลัมน์ข้อความ) */
export function whereContains(builder: Knex.QueryBuilder, column: string, text: string) {
  return builder.whereRaw("LOWER(??) LIKE ? ESCAPE '!'", [column, `%${likeEscape(text)}%`]);
}

export function orWhereContains(builder: Knex.QueryBuilder, column: string, text: string) {
  return builder.orWhereRaw("LOWER(??) LIKE ? ESCAPE '!'", [column, `%${likeEscape(text)}%`]);
}

/** เวลาปัจจุบันแบบ ISO สำหรับคอลัมน์ created_at / updated_at (เก็บเป็น string ISO UTC ทุกฐาน ให้เหมือนกัน) */
export const nowIso = () => new Date().toISOString();

/**
 * ลองต่อฐานข้อมูลก่อนเริ่มงาน — ถ้าต่อไม่ได้ให้บอกสาเหตุเป็นภาษาไทยพร้อมวิธีแก้
 * (แทนที่จะโยน error ยาว ๆ ภาษาอังกฤษของไดรเวอร์)
 */
export async function checkConnection() {
  try {
    await db.raw('select 1');
  } catch (err) {
    const e = err as { code?: string; errors?: { code?: string }[]; message?: string };
    const code = e.code ?? e.errors?.[0]?.code ?? '';
    const where = `${c.client} ${c.host}:${c.port} ฐานข้อมูล "${c.database}" ผู้ใช้ "${c.user}"`;
    const guide = 'วิธีเตรียมฐานข้อมูล: ดู database/README.md';
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND')
      throw new Error(`ต่อฐานข้อมูลไม่ได้ (${where}) — ยังไม่ได้เปิดฐานข้อมูล หรือ DB_HOST/DB_PORT ใน .env ไม่ถูก\n${guide}`);
    if (code === 'ER_ACCESS_DENIED_ERROR' || code === '28P01' || code === '28000')
      throw new Error(`ฐานข้อมูลปฏิเสธการเข้าสู่ระบบ (${where}) — DB_USER/DB_PASSWORD ใน .env ไม่ตรงกับที่ตั้งไว้ในฐานข้อมูล\n${guide}`);
    if (code === 'ER_BAD_DB_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR' || code === '3D000')
      throw new Error(`ยังไม่มีฐานข้อมูลชื่อ "${c.database}" หรือผู้ใช้นี้ไม่มีสิทธิ์ใช้ (${where}) — ตรวจ DB_NAME ใน .env หรือสร้างฐานข้อมูลก่อน (รัน database/init.sql)\n${guide}`);
    throw err;
  }
}

export async function closeDb() {
  await db.destroy();
}
