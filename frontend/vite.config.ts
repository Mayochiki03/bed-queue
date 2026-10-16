import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// อ่านพอร์ตจากไฟล์ .env ตัวเดียวกับ backend (โฟลเดอร์นอกสุด) — ไม่ต้องตั้งซ้ำสองที่
// หน้าเจ้าหน้าที่อยู่ที่ /admin (เหมือนระบบนวด) — เปิด http://localhost:5173/admin · เปิด / จะถูกพาไป /admin
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const apiPort = env.INTERNAL_PORT || '4002';
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'redirect-root-to-admin',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/') {
              res.statusCode = 302;
              res.setHeader('Location', '/admin/');
              res.end();
            } else next();
          });
        },
      },
    ],
    server: {
      port: Number(env.WEB_PORT || 5173),
      host: true, // ให้เครื่องอื่นใน LAN / มือถือเปิดได้
      allowedHosts: ['.trycloudflare.com'], // เปิดผ่าน Cloudflare Quick Tunnel ตอนทดสอบกับ LINE
      proxy: { '/api': `http://localhost:${apiPort}` },
    },
  };
});
