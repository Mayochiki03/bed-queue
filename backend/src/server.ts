/**
 * server.ts — จุดเริ่มระบบ: (migrate ถ้าตั้งไว้) → สร้างแอดมินคนแรก → เปิดพอร์ต
 */
import { createApp } from './app';
import { ensureAdmin } from './core/auth';
import { config } from './core/config';
import { checkConnection, closeDb } from './core/db';
import { migrateLatest } from './core/migrate';

async function main() {
  await checkConnection();
  if (config.autoMigrate) {
    const { applied } = await migrateLatest();
    if (applied.length) console.log(`[db] migrate แล้ว ${applied.length} รายการ`);
  }
  if (await ensureAdmin()) {
    console.log(`[db] สร้างผู้ดูแลระบบคนแรก: ${config.admin.username} / ${config.isProd ? '(ตาม ADMIN_PASSWORD)' : config.admin.password}`);
  }

  const server = createApp().listen(config.port, config.host, () => {
    console.log(`[api] http://localhost:${config.port}  (ฐานข้อมูล: ${config.db.client})`);
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') console.error(`[api] พอร์ต ${config.port} ถูกใช้อยู่แล้ว — ตั้ง PORT ใหม่ใน .env (และ API_PORT ฝั่งหน้าเว็บให้ตรงกัน)`);
    else console.error(err);
    process.exit(1);
  });

  const stop = () => server.close(() => void closeDb().then(() => process.exit(0)));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('[start] เริ่มระบบไม่สำเร็จ:', err instanceof Error ? err.message : err);
  process.exit(1);
});
