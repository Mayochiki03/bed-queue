/**
 * core/xlsxReport.ts — สร้างรายงาน Excel "สวย" (หัวรายงาน, การ์ดตัวเลข, ตารางมีเส้น/แถบสี, วันที่เป็นพุทธศักราช, กราฟจริง)
 * ใช้ทั้งการส่งออก Dashboard และรายการคำขอ — เขียนครั้งเดียว หน้าตาเหมือนกันทุกไฟล์
 *
 *   const book = new ReportBook('รายงานระบบคิวขอเตียง');
 *   const s = book.sheet('สรุปภาพรวม', { widths: [28, 13, 13] });
 *   s.banner('รายงาน', 'ช่วง ...');
 *   const t = s.table(10, 1, ['สี', 'จำนวน'], [['แดง', 3]]);
 *   s.chart({ kind: 'col', title: 'คิวตามสี', catRef: t.col(0), cats: [...], series: [{ name: 'จำนวน', valRef: t.col(1), values: [3] }], anchor: {...} });
 *   const buffer = await book.build();
 *
 * ความปลอดภัย: ข้อความที่ขึ้นต้นด้วย = + - @ จะถูกนำหน้าด้วย ' กัน Excel ตีความเป็นสูตร (CSV/Excel injection)
 */
import ExcelJS from 'exceljs';
import { injectCharts, ref, type ChartSpec } from './xlsxCharts';

export const BRAND = '0F6F78';
const INK = '0F172A';
const MUTED = '64748B';
const LINE = 'E2E8F0';
const ZEBRA = 'F8FAFC';
const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;

/** วันที่แบบไทย (พ.ศ.) ที่ Excel รู้จัก — เก็บเป็นวันที่จริง กรอง/เรียงได้ */
export const DATE_TIME_FMT = '[$-107041E]d/mm/yyyy h:mm;@';
export const DATE_FMT = '[$-107041E]d/mm/yyyy;@';

export type Cell = string | number | null | Date;
const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** ISO (UTC) → วันที่ที่แสดงเวลาไทยใน Excel (Excel ไม่มีเขตเวลา จึงเลื่อน +7 ชม. แล้วเก็บเป็นเวลา "ตามที่เห็น") */
export const bangkokDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : new Date(Math.floor(t / 1000) * 1000 + 7 * 3_600_000);
};

const colLetter = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

export type TableOptions = {
  numFmt?: Record<number, string>;
  /** คอลัมน์ที่เป็นวันที่ (ค่าเป็น Date) ใช้รูปแบบ พ.ศ. อัตโนมัติ */
  dateCols?: number[];
  /** สี/สไตล์ของเซลล์ข้อมูล (คืน undefined = ปกติ) */
  style?: (row: number, col: number, value: Cell) => { fill?: string; color?: string; bold?: boolean } | undefined;
  /** คอลัมน์ที่ให้ตัดบรรทัดอัตโนมัติ */
  wrapCols?: number[];
  autoFilter?: boolean;
  freeze?: boolean;
  /** แถวสุดท้ายเป็นแถว "รวม" (ตัวหนา มีเส้นบน) */
  totalRow?: boolean;
};

export class ReportSheet {
  constructor(
    readonly name: string,
    readonly ws: ExcelJS.Worksheet,
    private book: ReportBook,
  ) {}

  /** แถบหัวรายงานสีเข้ม + บรรทัดรอง */
  banner(title: string, subtitle?: string, lastCol = 12) {
    const ws = this.ws;
    ws.mergeCells(1, 1, 1, lastCol);
    const t = ws.getCell(1, 1);
    t.value = safe(title);
    t.font = { name: 'Tahoma', size: 18, bold: true, color: { argb: argb('FFFFFF') } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(BRAND) } };
    t.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 38;
    ws.mergeCells(2, 1, 2, lastCol);
    const s = ws.getCell(2, 1);
    s.value = subtitle ? safe(subtitle) : '';
    s.font = { name: 'Tahoma', size: 10, color: { argb: argb('E3F2F3') } };
    s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('1B8791') } };
    s.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(2).height = 22;
  }

  sectionTitle(row: number, text: string, lastCol = 12) {
    const ws = this.ws;
    ws.mergeCells(row, 1, row, lastCol);
    const c = ws.getCell(row, 1);
    c.value = safe(text);
    c.font = { name: 'Tahoma', size: 13, bold: true, color: { argb: argb(BRAND) } };
    c.border = { bottom: { style: 'medium', color: { argb: argb(BRAND) } } };
    ws.getRow(row).height = 24;
  }

  /** การ์ดตัวเลข 1 คอลัมน์/ใบ เรียงต่อกันในแถว row..row+2 */
  kpis(row: number, items: { label: string; value: number | string | null; note?: string; color?: string; fmt?: string }[], startCol = 1) {
    const ws = this.ws;
    items.forEach((k, i) => {
      const col = startCol + i;
      const base = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('F1F5F9') } } } as const;
      const border = { left: { style: 'thin', color: { argb: argb('FFFFFF') } }, right: { style: 'thin', color: { argb: argb('FFFFFF') } } } as const;
      const l = ws.getCell(row, col);
      l.value = safe(k.label);
      l.font = { name: 'Tahoma', size: 9, color: { argb: argb(MUTED) } };
      l.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
      Object.assign(l, base, { border });
      const v = ws.getCell(row + 1, col);
      v.value = k.value === null ? '-' : k.value;
      v.font = { name: 'Tahoma', size: 22, bold: true, color: { argb: argb(k.color ?? BRAND) } };
      v.alignment = { vertical: 'middle', horizontal: 'center' };
      if (typeof k.value === 'number' && k.fmt) v.numFmt = k.fmt;
      Object.assign(v, base, { border });
      const n = ws.getCell(row + 2, col);
      n.value = k.note ? safe(k.note) : '';
      n.font = { name: 'Tahoma', size: 8, color: { argb: argb(MUTED) } };
      n.alignment = { wrapText: true, vertical: 'top', horizontal: 'center' };
      Object.assign(n, base, { border });
    });
    ws.getRow(row).height = 30;
    ws.getRow(row + 1).height = 38;
    ws.getRow(row + 2).height = 26;
  }

  /**
   * ตารางข้อมูล: หัวตารางสีเข้ม ตัวหนา แถวสลับสี เส้นบาง ๆ — คืนตำแหน่งไว้ให้กราฟอ้างอิง
   * row/col เริ่มนับที่ 1
   */
  table(row: number, col: number, header: string[], rows: Cell[][], opt: TableOptions = {}) {
    const ws = this.ws;
    header.forEach((h, i) => {
      const c = ws.getCell(row, col + i);
      c.value = safe(h);
      c.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: argb('FFFFFF') } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('1E3A44') } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: argb(LINE) } } };
    });
    ws.getRow(row).height = 30;
    rows.forEach((r, ri) => {
      const isTotal = opt.totalRow && ri === rows.length - 1;
      r.forEach((v, ci) => {
        const c = ws.getCell(row + 1 + ri, col + ci);
        c.value = typeof v === 'string' ? safe(v) : v;
        const st = opt.style?.(ri, ci, v);
        c.font = { name: 'Tahoma', size: 10, bold: !!st?.bold || isTotal, color: { argb: argb(st?.color ?? INK) } };
        const bg = st?.fill ?? (isTotal ? 'E2E8F0' : ri % 2 === 1 ? ZEBRA : 'FFFFFF');
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(bg) } };
        c.border = { bottom: { style: 'hair', color: { argb: argb('CBD5E1') } }, ...(isTotal ? { top: { style: 'thin', color: { argb: argb('94A3B8') } } } : {}) };
        c.alignment = { vertical: 'top', wrapText: !!opt.wrapCols?.includes(ci), horizontal: typeof v === 'number' ? 'right' : v instanceof Date ? 'center' : 'left' };
        if (v instanceof Date) c.numFmt = opt.dateCols?.includes(ci) ? DATE_TIME_FMT : DATE_TIME_FMT;
        if (typeof v === 'number' && opt.numFmt?.[ci]) c.numFmt = opt.numFmt[ci]!;
      });
    });
    const first = row + 1;
    const last = row + Math.max(rows.length, 1);
    if (header.length > 14) ws.pageSetup.fitToPage = false; // ตารางกว้างมาก: พิมพ์ตามขนาดจริง ไม่ย่อจนอ่านไม่ออก
    if (opt.autoFilter) ws.autoFilter = { from: { row, column: col }, to: { row: last, column: col + header.length - 1 } };
    if (opt.freeze) ws.views = [{ state: 'frozen', ySplit: row, xSplit: 0 }];
    const range = (c: number) => `${colLetter(col + c)}${first}:${colLetter(col + c)}${last}`;
    return {
      first,
      last,
      /** อ้างอิงคอลัมน์ข้อมูลที่ c (เริ่ม 0) ใช้กับกราฟ */
      col: (c: number) => ref(this.name, range(c)),
      head: (c: number) => ref(this.name, `${colLetter(col + c)}${row}`),
    };
  }

  /** ข้อความหมายเหตุตัวเล็กสีเทา */
  note(row: number, text: string, lastCol = 12) {
    this.ws.mergeCells(row, 1, row, lastCol);
    const c = this.ws.getCell(row, 1);
    c.value = safe(text);
    c.font = { name: 'Tahoma', size: 9, italic: true, color: { argb: argb(MUTED) } };
    c.alignment = { wrapText: true, vertical: 'top' };
  }

  chart(spec: Omit<ChartSpec, 'sheet'>) {
    this.book.charts.push({ ...spec, sheet: this.name });
  }
}

export class ReportBook {
  readonly wb = new ExcelJS.Workbook();
  readonly charts: ChartSpec[] = [];
  private used = new Set<string>();

  constructor(title: string, creator = 'ระบบคิวขอเตียง') {
    this.wb.creator = creator;
    this.wb.title = title;
    this.wb.created = new Date();
  }

  private uniqueName(raw: string) {
    const base = (raw.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet').slice(0, 31);
    let name = base;
    for (let i = 2; this.used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
    this.used.add(name.toLowerCase());
    return name;
  }

  sheet(name: string, o: { widths?: number[]; tab?: string; gridlines?: boolean } = {}): ReportSheet {
    const nm = this.uniqueName(name);
    const ws = this.wb.addWorksheet(nm, { properties: { tabColor: { argb: argb(o.tab ?? BRAND) } }, views: [{ showGridLines: o.gridlines ?? false }] });
    (o.widths ?? []).forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.properties.defaultRowHeight = 20;
    // พิมพ์: แนวนอน กว้างพอดี 1 หน้า (ยาวกี่หน้าก็ได้)
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } };
    return new ReportSheet(nm, ws, this);
  }

  async build(): Promise<Buffer> {
    const buf = Buffer.from(await this.wb.xlsx.writeBuffer());
    return injectCharts(buf, this.charts);
  }
}

/** ความกว้างคอลัมน์ที่พอดีกับข้อความภาษาไทย (กว้างกว่าอักษรละตินเล็กน้อย) */
export function fitWidths(header: string[], rows: Cell[][], min = 8, max = 48): number[] {
  return header.map((h, i) => {
    const longest = Math.max(h.length, ...rows.slice(0, 500).map((r) => (r[i] instanceof Date ? 17 : String(r[i] ?? '').length)));
    return Math.min(max, Math.max(min, Math.round(longest * 1.15) + 3));
  });
}
