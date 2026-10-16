import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// build แยกสำหรับหน้าผู้ขอใน LINE (LIFF) → dist-liff/ — พอร์ต public ส่งเฉพาะโฟลเดอร์นี้
// แยกจาก dist/ (หน้าเจ้าหน้าที่) จึงไม่มีโค้ดหน้าเจ้าหน้าที่อยู่บนพอร์ตที่ออกอินเทอร์เน็ตเลย
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist-liff', emptyOutDir: true, rollupOptions: { input: path.resolve(__dirname, 'liff.html') } },
});
