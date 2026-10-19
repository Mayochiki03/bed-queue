/**
 * HospitalExcel.ts — อ่าน/ตรวจ/สร้างไฟล์ Excel ของ "รายชื่อโรงพยาบาล" (ไม่แตะฐานข้อมูล — แค่แปลงไฟล์ ↔ ข้อมูล)
 *
 *   buildTemplate(rows)          สร้างไฟล์แม่แบบ (หัวตาราง + รายการเลือกเขต/สถานะ + ชีตคำอธิบาย) ใส่รายชื่อปัจจุบันมาด้วยก็ได้
 *   parseHospitalSheet(buffer)   อ่านชีตแรก หาแถวหัวตารางจากชื่อคอลัมน์ แล้วตรวจทีละแถว
 *   normalizeName(text)          ทำชื่อให้เทียบกันได้ ("โรงพยาบาลสงขลา" = "รพ.สงขลา" = "รพ สงขลา")
 *
 * คอลัมน์: รหัสโรงพยาบาล (5 หลัก) · ชื่อโรงพยาบาล · เขตสุขภาพ (1-14 ว่างได้) · สถานะ (ใช้งาน/ปิด ว่าง = ใช้งาน)
 * รหัสที่ Excel เก็บเป็นตัวเลข (เลข 0 นำหน้าหาย) จะเติม 0 ให้ครบ 5 หลัก
 */
import ExcelJS from 'exceljs';

export const HEADERS = ['รหัสโรงพยาบาล', 'ชื่อโรงพยาบาล', 'เขตสุขภาพ', 'สถานะ'] as const;
export const MAX_ROWS = 5000;

export type ParsedRow = {
  /** เลขแถวใน Excel (เริ่ม 1) */
  row: number;
  code: string;
  name: string;
  health_region: number | null;
  is_active: boolean;
  /** ข้อความผิดพลาดของแถวนี้ (ว่าง = ใช้ได้) */
  error: string;
};

/** ทำชื่อให้เทียบกันได้: ตัดช่องว่าง จุด · "โรงพยาบาล" นำหน้า = "รพ" · ตัวพิมพ์เล็ก */
export function normalizeName(s: string): string {
  return s
    .normalize('NFC')
    .replace(/\s+/g, '')
    .replace(/^โรงพยาบาล/, 'รพ')
    .replace(/[.．]/g, '')
    .toLowerCase();
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
    if ('text' in v && typeof v.text === 'string') return v.text.trim(); // ลิงก์
    if ('result' in v && v.result !== undefined && v.result !== null) return cellText(v.result as ExcelJS.CellValue); // สูตร
  }
  return '';
}

const ACTIVE_WORDS = new Set(['ใช้งาน', 'เปิด', 'เปิดใช้งาน', 'y', 'yes', '1', 'true', 'active']);
const INACTIVE_WORDS = new Set(['ปิด', 'ปิดใช้งาน', 'ไม่ใช้งาน', 'n', 'no', '0', 'false', 'inactive']);

function parseRow(row: number, c: { code: string; name: string; region: string; status: string }): ParsedRow {
  const out: ParsedRow = { row, code: c.code, name: c.name, health_region: null, is_active: true, error: '' };
  const errors: string[] = [];
  if (/^\d{1,4}$/.test(c.code)) out.code = c.code.padStart(5, '0'); // Excel ตัดเลข 0 นำหน้า
  if (!/^\d{5}$/.test(out.code)) errors.push('รหัสต้องเป็นตัวเลข 5 หลัก');
  if (!c.name) errors.push('ไม่มีชื่อโรงพยาบาล');
  else if (c.name.length > 150) errors.push('ชื่อยาวเกิน 150 ตัวอักษร');
  if (c.region) {
    const n = Number(c.region);
    if (Number.isInteger(n) && n >= 1 && n <= 14) out.health_region = n;
    else errors.push('เขตสุขภาพต้องเป็น 1-14');
  }
  if (c.status) {
    const w = c.status.toLowerCase();
    if (ACTIVE_WORDS.has(w)) out.is_active = true;
    else if (INACTIVE_WORDS.has(w)) out.is_active = false;
    else errors.push('สถานะต้องเป็น ใช้งาน หรือ ปิด');
  }
  out.error = errors.join(' · ');
  return out;
}

export class ExcelFormatError extends Error {}

/** อ่านชีตแรกของไฟล์ — โยน ExcelFormatError เมื่อเปิดไฟล์ไม่ได้ / ไม่พบหัวตาราง / แถวเกินกำหนด */
export async function parseHospitalSheet(buffer: Buffer): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ExcelFormatError('เปิดไฟล์ไม่ได้ — ต้องเป็นไฟล์ Excel (.xlsx) เท่านั้น');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ExcelFormatError('ไม่พบชีตในไฟล์');

  // หาแถวหัวตารางภายใน 10 แถวแรก จากชื่อคอลัมน์ (ไม่บังคับลำดับคอลัมน์)
  let headerRow = 0;
  const col: Record<'code' | 'name' | 'region' | 'status', number> = { code: 0, name: 0, region: 0, status: 0 };
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !headerRow; r++) {
    const found = { code: 0, name: 0, region: 0, status: 0 };
    ws.getRow(r).eachCell((cell, n) => {
      const t = cellText(cell.value).replace(/\s+/g, '');
      if (t.includes('รหัส')) found.code = n;
      else if (t.includes('ชื่อ')) found.name = n;
      else if (t.includes('เขต')) found.region = n;
      else if (t.includes('สถานะ')) found.status = n;
    });
    if (found.code && found.name) {
      headerRow = r;
      Object.assign(col, found);
    }
  }
  if (!headerRow) throw new ExcelFormatError('ไม่พบหัวตาราง "รหัสโรงพยาบาล" และ "ชื่อโรงพยาบาล" — ใช้ไฟล์แม่แบบจากปุ่มดาวน์โหลด');

  const rows: ParsedRow[] = [];
  const seen = new Map<string, number>();
  // นับเฉพาะแถวที่มีข้อมูล (ไฟล์ที่จัดรูปแบบทั้งคอลัมน์มี rowCount เป็นแสน) และหยุดสแกนที่ขอบเขตที่สมเหตุสมผล
  const lastRow = Math.min(ws.rowCount, headerRow + MAX_ROWS * 4);
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const get = (n: number) => (n ? cellText(row.getCell(n).value) : '');
    const cells = { code: get(col.code), name: get(col.name), region: get(col.region), status: get(col.status) };
    if (!cells.code && !cells.name && !cells.region && !cells.status) continue; // แถวว่าง
    if (rows.length >= MAX_ROWS) throw new ExcelFormatError(`แถวมากเกินไป (ไม่เกิน ${MAX_ROWS} แถวต่อไฟล์) — แบ่งไฟล์เป็นหลายส่วน`);
    const parsed = parseRow(r, cells);
    if (!parsed.error) {
      const first = seen.get(parsed.code);
      if (first) parsed.error = `รหัสซ้ำกับแถว ${first} ในไฟล์เดียวกัน`;
      else seen.set(parsed.code, r);
    }
    rows.push(parsed);
  }
  return rows;
}

type TemplateRow = { code: string; name: string; health_region: number | null; is_active: boolean };

/** ไฟล์แม่แบบ: ชีต "รายชื่อ รพ." (กรอกที่นี่) + ชีต "คำอธิบาย" */
export async function buildTemplate(existing: TemplateRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'bed-queue';
  const ws = wb.addWorksheet('รายชื่อ รพ.', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: HEADERS[0], key: 'code', width: 18, style: { numFmt: '@' } }, // เก็บเป็นข้อความ เลข 0 นำหน้าไม่หาย
    { header: HEADERS[1], key: 'name', width: 48 },
    { header: HEADERS[2], key: 'health_region', width: 14 },
    { header: HEADERS[3], key: 'status', width: 12 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
  for (const r of existing) ws.addRow({ code: r.code, name: r.name, health_region: r.health_region, status: r.is_active ? 'ใช้งาน' : 'ปิด' });

  // รายการเลือกในเซลล์ (ช่วยคีย์ให้ถูก) — ครอบคลุมถึงแถว 3000
  for (let i = 2; i <= 3000; i++) {
    ws.getCell(`C${i}`).dataValidation = { type: 'whole', operator: 'between', formulae: [1, 14], allowBlank: true, showErrorMessage: true, errorTitle: 'เขตสุขภาพ', error: 'ใส่เลข 1-14' };
    ws.getCell(`D${i}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"ใช้งาน,ปิด"'] };
    ws.getCell(`A${i}`).numFmt = '@';
  }

  const help = wb.addWorksheet('คำอธิบาย');
  help.getColumn(1).width = 110;
  [
    'วิธีใช้ไฟล์นี้',
    '1) กรอกข้อมูลที่ชีต "รายชื่อ รพ." แถวละ 1 โรงพยาบาล ห้ามลบหรือเปลี่ยนชื่อแถวหัวตาราง',
    '2) รหัสโรงพยาบาล: ตัวเลข 5 หลัก (ห้ามซ้ำกันในไฟล์) — ระบบใช้รหัสเป็นตัวจับคู่: รหัสที่มีอยู่แล้วจะถูกอัปเดตชื่อ/เขต/สถานะ รหัสใหม่จะถูกเพิ่ม',
    '3) ชื่อโรงพยาบาล: ชื่อที่ผู้ขอต้องกรอกให้ตรงตอนลงทะเบียน (ระบบเทียบ "โรงพยาบาลสงขลา" กับ "รพ.สงขลา" ว่าเท่ากัน)',
    '4) เขตสุขภาพ: เลข 1-14 (เว้นว่างได้)',
    '5) สถานะ: ใช้งาน หรือ ปิด (เว้นว่าง = ใช้งาน) — รายการที่ปิดจะสมัครสมาชิกไม่ได้',
    '6) อัปโหลดที่หน้า "โรงพยาบาล" > นำเข้า Excel ระบบจะแสดงตัวอย่างและแถวที่ผิดพลาดให้ตรวจก่อน แล้วค่อยกดยืนยันนำเข้า',
    '7) ไฟล์ละไม่เกิน 5,000 แถว และไม่เกินประมาณ 650 KB',
  ].forEach((t, i) => {
    const c = help.getCell(`A${i + 1}`);
    c.value = t;
    c.alignment = { wrapText: true, vertical: 'top' };
    if (i === 0) c.font = { bold: true };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
