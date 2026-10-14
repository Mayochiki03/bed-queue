/**
 * core/migrate.ts — สร้าง/อัปเดตตารางในฐานข้อมูล
 *
 * migration ของแกนกลางอยู่ที่ core/migrations.ts ส่วนของแต่ละหน้าอยู่ในโฟลเดอร์หน้านั้น
 * (รายการทั้งหมดรวมจาก src/pages/index.ts — ไม่ต้องสร้างโฟลเดอร์ migration แยก)
 */
import type { Knex } from 'knex';
import { db } from './db';
import { coreMigrations } from './migrations';
import type { Migration } from './pages';
import { pages } from '../pages';

export function allMigrations(): Migration[] {
  const list = [...coreMigrations, ...pages.flatMap((p) => p.migrations ?? [])];
  const names = list.map((m) => m.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`ชื่อ migration ซ้ำ: ${dup}`);
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

function source(): Knex.MigrationSource<Migration> {
  const list = allMigrations();
  return {
    getMigrations: async () => list,
    getMigrationName: (m) => m.name,
    getMigration: async (m) => ({ up: m.up, down: m.down }),
  };
}

const opts = () => ({ migrationSource: source() });

/** แปลง error "ประวัติ migration ไม่ตรงกับโค้ด" (มักเกิดเมื่อใช้ฐานข้อมูลเก่าของอีกโปรเจกต์/เวอร์ชัน) เป็นคำแนะนำภาษาไทย */
function explain(err: unknown): never {
  if (err instanceof Error && /migration directory is corrupt/i.test(err.message)) {
    throw new Error(
      'ฐานข้อมูลนี้มีประวัติ migration ที่ไม่ตรงกับโค้ดปัจจุบัน (มักเกิดจากใช้ฐานข้อมูลเก่าของอีกโปรเจกต์หรือเวอร์ชัน) — ' +
        'ถ้าเป็นข้อมูลทดลอง: ให้ลบฐานข้อมูลนั้นแล้วสร้างใหม่ให้ว่าง (รัน database/init.sql) แล้วรันอีกครั้ง',
    );
  }
  throw err;
}

export async function migrateLatest() {
  const [batch, applied] = await db.migrate.latest(opts()).catch(explain);
  return { batch, applied: applied as string[] };
}

export async function migrateRollback() {
  const [batch, reverted] = await db.migrate.rollback(opts()).catch(explain);
  return { batch, reverted: reverted as string[] };
}

export async function migrateStatus() {
  const list = allMigrations();
  const done = new Set((await db.migrate.list(opts()).catch(explain))[0].map((m: { name: string }) => m.name));
  return list.map((m) => ({ name: m.name, applied: done.has(m.name) }));
}

/** ย้อนทุก migration แล้วสร้างใหม่ — ลบข้อมูลทั้งหมด! (ใช้กับ db:reset และก่อนรันเทสต์) */
export async function resetDb() {
  for (;;) {
    const { reverted } = await migrateRollback();
    if (!reverted.length) break;
  }
  await migrateLatest();
}
