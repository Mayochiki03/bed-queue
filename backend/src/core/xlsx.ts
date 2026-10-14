/**
 * core/xlsx.ts — สร้างไฟล์ Excel (.xlsx) จากตารางข้อมูล ใช้ร่วมกันทุกหน้าที่ต้อง "ส่งออก"
 *
 *   const buf = await buildWorkbook([{ name: 'สรุป', title: 'รายงาน', header: ['ชื่อ', 'จำนวน'], rows: [['ก', 3]] }]);
 *   res.send(buf)   // ใช้ sendXlsx(res, 'ชื่อไฟล์', buf) เพื่อตั้ง header ให้
 *
 * - ตัวเลขเก็บเป็นตัวเลขจริง (เอาไปรวม/ทำกราฟต่อใน Excel ได้) · ค่า null = เซลล์ว่าง
 * - ข้อความที่ขึ้นต้นด้วย = + - @ จะถูกนำหน้าด้วย ' เพื่อกัน Excel ตีความเป็นสูตร (CSV/Excel injection)
 * - ชื่อชีตถูกตัดอักขระต้องห้ามและความยาวเกิน 31 ให้เอง · ชื่อซ้ำจะต่อเลขท้าย
 */
import ExcelJS from 'exceljs';
import type { Response } from 'express';

export type Cell = string | number | null;
export type SheetSpec = {
  name: string;
  /** บรรทัดหัวเรื่อง (ตัวหนา) และบรรทัดรอง (เช่น ช่วงเวลา) เหนือตาราง */
  title?: string;
  subtitle?: string;
  header: string[];
  rows: Cell[][];
  /** รูปแบบตัวเลขต่อคอลัมน์ (เริ่มคอลัมน์แรก = 0) เช่น '0.0' */
  numFmt?: Record<number, string>;
};

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const safeText = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const cellValue = (v: Cell) => (typeof v === 'string' ? safeText(v) : v);

export function sheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet').slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

export async function buildWorkbook(sheets: SheetSpec[], creator = 'bed-queue'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = creator;
  wb.created = new Date();
  const used = new Set<string>();

  for (const s of sheets) {
    const ws = wb.addWorksheet(sheetName(s.name, used), { views: [{ state: 'frozen', ySplit: 0 }] });
    let r = 1;
    if (s.title) {
      ws.getCell(r, 1).value = cellValue(s.title);
      ws.getCell(r, 1).font = { bold: true, size: 14 };
      r++;
    }
    if (s.subtitle) {
      ws.getCell(r, 1).value = cellValue(s.subtitle);
      ws.getCell(r, 1).font = { color: { argb: 'FF64748B' } };
      r++;
    }
    if (s.title || s.subtitle) r++;

    const headRow = r;
    s.header.forEach((h, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = cellValue(h);
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
      c.border = { bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } };
      c.alignment = { vertical: 'middle', wrapText: true };
    });
    r++;
    for (const row of s.rows) {
      row.forEach((v, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = cellValue(v);
        if (typeof v === 'number') {
          c.alignment = { horizontal: 'right' };
          if (s.numFmt?.[i]) c.numFmt = s.numFmt[i]!;
        }
      });
      r++;
    }
    ws.views = [{ state: 'frozen', ySplit: headRow }];

    // ความกว้างคอลัมน์ตามเนื้อหา (ภาษาไทยกว้างกว่าตัวอักษรละติน เผื่อไว้เล็กน้อย)
    s.header.forEach((h, i) => {
      const longest = Math.max(String(h).length, ...s.rows.map((row) => String(row[i] ?? '').length), 6);
      ws.getColumn(i + 1).width = Math.min(60, Math.round(longest * 1.2) + 3);
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** ส่งไฟล์ .xlsx กลับไปให้เบราว์เซอร์ดาวน์โหลด (ชื่อไฟล์ภาษาไทยได้) */
export function sendXlsx(res: Response, filename: string, buf: Buffer) {
  const name = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(buf);
}
