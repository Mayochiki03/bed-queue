/**
 * make-rich-menu.mjs — สร้างภาพ Rich Menu ของ LINE OA (docs/line/rich-menu.png, 2500x843 px)
 * ใช้: node scripts/make-rich-menu.mjs  (ต้องมี Playwright + Chromium ในเครื่อง)
 * ภาพมี 3 ปุ่มเท่ากัน: คำขอของฉัน | ส่งคำขอเตียง | ข้อมูลของฉัน — ตรงกับแท็บของหน้าผู้ขอ
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'line');
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const p = await b.newPage({ viewport: { width: 2500, height: 843 } });
await p.goto('file://' + path.join(dir, 'rich-menu.html'));
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: path.join(dir, 'rich-menu.png') });
await b.close();
console.log('สร้าง docs/line/rich-menu.png แล้ว');
