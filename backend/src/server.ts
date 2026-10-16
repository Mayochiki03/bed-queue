/**
 * server.ts — จุดเริ่มระบบ: (migrate ถ้าตั้งไว้) → สร้างแอดมินคนแรก → เปิดพอร์ต
 */
import type { Server } from 'node:http';
import { createApp } from './app';
import { ensureAdmin } from './core/auth';
import { config } from './core/config';
import { checkConnection, closeDb } from './core/db';
import { migrateLatest } from './core/migrate';
import { createPublicApp } from './publicApp';

async function main() {
  await checkConnection();
  if (config.autoMigrate) {
    const { applied } = await migrateLatest();
    if (applied.length) console.log(`[db] migrate แล้ว ${applied.length} รายการ`);
  }
  if (await ensureAdmin()) {
    console.log(`[db] สร้างผู้ดูแลระบบคนแรก: ${config.admin.username} / ${config.isProd ? '(ตาม ADMIN_PASSWORD)' : config.admin.password}`);
  }

  const listen = (name: string, app: ReturnType<typeof createApp>, host: string, port: number, url: string) =>
    new Promise<Server>((resolve) => {
      const server = app.listen(port, host, () => {
        console.log(`[${name}] ${url}`);
        resolve(server);
      });
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') console.error(`[${name}] พอร์ต ${port} ถูกใช้อยู่แล้ว — ตั้ง ${name === 'internal' ? 'INTERNAL_PORT' : 'PUBLIC_PORT'} ใหม่ใน .env`);
        else console.error(err);
        process.exit(1);
      });
    });

  console.log(`[db] ${config.db.client}`);
  const servers = await Promise.all([
    listen('internal', createApp(), config.host, config.internalPort, `http://localhost:${config.internalPort}/admin  (หน้าเจ้าหน้าที่ — LAN เท่านั้น)`),
    listen('public', createPublicApp(), config.publicHost, config.publicPort, `http://localhost:${config.publicPort}  (ต่อ Cloudflare Tunnel: webhook + หน้าผู้ขอ)`),
  ]);

  const stop = () => {
    for (const s of servers) s.close();
    void closeDb().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('[start] เริ่มระบบไม่สำเร็จ:', err instanceof Error ? err.message : err);
  process.exit(1);
});
