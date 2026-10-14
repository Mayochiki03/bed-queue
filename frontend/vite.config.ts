import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// อ่านพอร์ตจากไฟล์ .env ตัวเดียวกับ backend (โฟลเดอร์นอกสุด) — ไม่ต้องตั้งซ้ำสองที่
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const apiPort = env.PORT || '4000';
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(env.WEB_PORT || 5173),
      proxy: { '/api': `http://localhost:${apiPort}` },
    },
  };
});
