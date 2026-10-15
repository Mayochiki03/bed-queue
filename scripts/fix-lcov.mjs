/**
 * fix-lcov.mjs — แก้ path ในไฟล์ coverage ให้ SonarQube อ่านได้
 * SonarQube สแกนจากโฟลเดอร์บนสุดของ repo แต่ c8 เขียน path เป็น src/... (นับจาก backend)
 * จึงแปลงเป็น backend/src/... · รันต่อท้าย `npm run test:coverage` อัตโนมัติ
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lcov = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'coverage', 'lcov.info');
if (!fs.existsSync(lcov)) {
  console.error('ไม่พบ backend/coverage/lcov.info — รัน npm run test:coverage ก่อน');
  process.exit(1);
}
fs.writeFileSync(lcov, fs.readFileSync(lcov, 'utf8').replace(/^SF:(?:\.[\\/])?src([\\/])/gm, 'SF:backend/src$1'));
console.log('backend/coverage/lcov.info พร้อมส่งให้ SonarQube');
