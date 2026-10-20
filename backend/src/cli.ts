/**
 * cli.ts — คำสั่งจัดการฐานข้อมูล  (รันผ่าน npm run migrate / migrate:status / db:reset / seed)
 */
import { ensureAdmin } from './core/auth';
import { checkConnection, closeDb } from './core/db';
import { migrateLatest, migrateRollback, migrateStatus, resetDb } from './core/migrate';
import { config } from './core/config';
import { clearMock, createMock, mockStatus } from './mockData';

const cmd = process.argv[2];

async function main() {
  await checkConnection();
  switch (cmd) {
    case 'migrate': {
      const { applied } = await migrateLatest();
      console.log(applied.length ? `migrate แล้ว:\n - ${applied.join('\n - ')}` : 'ไม่มี migration ค้าง');
      break;
    }
    case 'rollback': {
      const { reverted } = await migrateRollback();
      console.log(reverted.length ? `ย้อนแล้ว:\n - ${reverted.join('\n - ')}` : 'ไม่มีอะไรให้ย้อน');
      break;
    }
    case 'status':
      for (const m of await migrateStatus()) console.log(`${m.applied ? '[x]' : '·'} ${m.name}`);
      break;
    case 'seed':
      console.log((await ensureAdmin()) ? `สร้างแอดมิน ${config.admin.username} แล้ว` : 'มีผู้ใช้อยู่แล้ว ไม่ต้องสร้าง');
      break;
    case 'reset': {
      if (config.isProd) throw new Error('ห้ามรัน reset บน production');
      if (!process.argv.includes('--yes')) {
        const d = config.db;
        throw new Error(`reset จะลบข้อมูลทั้งหมดในฐานข้อมูล "${d.database}" (${d.host}:${d.port}) — ถ้าแน่ใจให้รัน: npm run db:reset -- --yes`);
      }
      await resetDb(); // ย้อนทุก migration แล้วสร้างใหม่
      await ensureAdmin();
      console.log('รีเซ็ตฐานข้อมูลแล้ว (ข้อมูลเดิมถูกลบทั้งหมด)');
      break;
    }
    case 'mock': {
      if (config.isProd) throw new Error('ห้ามสร้างข้อมูลตัวอย่างบน production');
      await migrateLatest(); // ถ้าเพิ่งอัปเดตโค้ดแล้วยังไม่ได้เปิดระบบ ตารางอาจยังไม่ครบ
      const r = await createMock({ force: process.argv.includes('--force') });
      console.log(`สร้างข้อมูลตัวอย่างแล้ว: ผู้ขอจำลอง ${r.requesters} คน · ผู้ลงทะเบียนตัวอย่าง (หน้าสมาชิก) ${r.members} คน · คำขอ ${r.requests} รายการ · รพ. ตัวอย่าง ${r.hospitals} แห่ง\nตรวจว่าเหลือเท่าไร: npm run mock:status · ลบทิ้ง (ทำก่อนขึ้น production): npm run mock:clear`);
      break;
    }
    case 'mock-clear': {
      await migrateLatest();
      const r = await clearMock();
      const left = await mockStatus();
      console.log(`ลบข้อมูลตัวอย่างแล้ว: ผู้ขอจำลอง/ผู้ลงทะเบียนตัวอย่าง ${r.requesters} คน · คำขอ ${r.requests} รายการ · รพ. ตัวอย่าง ${r.hospitals} แห่ง\nฐานข้อมูล "${config.db.database}" เหลือข้อมูลตัวอย่าง: ${left.total === 0 ? 'ไม่มี ✔' : `ผู้ขอ ${left.requesters} · คำขอ ${left.requests} · รพ. ${left.hospitals} (รพ. ตัวอย่างที่ยังมีผู้ใช้จริงอ้างอิงอยู่จะไม่ถูกลบ)`}`);
      break;
    }
    case 'mock-status': {
      await migrateLatest();
      const r = await mockStatus();
      console.log(`ฐานข้อมูล "${config.db.database}": ผู้ขอจำลอง/ผู้ลงทะเบียนตัวอย่าง ${r.requesters} คน · คำขอตัวอย่าง ${r.requests} รายการ · รพ. ตัวอย่าง ${r.hospitals} แห่ง${r.total ? '\n→ ก่อนขึ้น production ให้รัน: npm run mock:clear' : '\n→ ไม่มีข้อมูลตัวอย่าง พร้อมขึ้น production ในส่วนนี้'}`);
      break;
    }
    default:
      console.log('ใช้: npm run migrate | migrate:status | db:reset | seed | mock | mock:status | mock:clear');
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
