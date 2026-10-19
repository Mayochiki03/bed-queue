/**
 * WidgetEngine.ts — คำนวณผลลัพธ์ของ widget จากแถวคำขอ (ฟังก์ชันล้วน ไม่แตะฐานข้อมูล เทสต์ง่าย)
 *
 * ขั้นตอน: เลือกแถวตาม "ค่าที่วัด" → กรอง → จัดกลุ่ม (แถว) และซ้อนสี/หลายค่า (คอลัมน์) → รวมค่า → เรียงและตัดจำนวนแถว
 * ทุกวันที่คิดตามเวลาไทย (Asia/Bangkok) · ระยะเวลา = วันที่ยืนยัน - วันที่ส่งคำขอ (เฉพาะคำขอที่ยืนยันส่งตัวแล้ว)
 * ปริมาณคำขอระดับโรงพยาบาลเดียวถือว่าพอสำหรับการรวมใน JS (ถ้าโตมากค่อยย้ายไปรวมใน SQL)
 */
import {
  MEASURE_LABEL,
  SNAPSHOT_MEASURES,
  TIME_GROUPS,
  unitOf,
  type Group,
  type Measure,
  type TimeGroup,
  type WidgetColumn,
  type WidgetConfig,
  type WidgetResult,
  type WidgetRow,
} from './Widget';

const DAY = 86_400_000;
export const NO_VALUE = '_NONE';

export type EngineRow = {
  id: number;
  hospital_id: number;
  color_code: string | null;
  substance_code: string | null;
  reason_code: string | null;
  patient_gender: string | null;
  source: string;
  status: string;
  submitted_at: string;
  called_at: string | null;
  resolved_at: string | null;
};

export type Dim = { key: string; label: string; color: string | null; active: boolean };
export type EngineContext = {
  now: Date;
  /** จำนวนวันของช่วงเวลาที่ใช้ */
  days: number;
  /** ช่วงเวลาแบบกำหนดวัน (ไม่ใส่ = N วันล่าสุดนับถึง now ตามเดิม): since รวม · until ไม่รวม (null = ถึงตอนนี้) */
  since?: Date;
  until?: Date | null;
  /** วัน (YYYY-MM-DD เวลาไทย) ทุกวันในช่วง ใช้ทำแกนเวลา */
  dayKeys?: string[];
  periodLabel?: string;
  timeoutHours: number;
  /** ข้อมูลหลัก เรียงตามลำดับแล้ว (รวมค่าที่ปิดใช้งานเพื่อแปลงชื่อประวัติเก่า) */
  colors: Dim[];
  substances: Dim[];
  reasons: Dim[];
  hospitalNames: Map<number, string>;
};

const STATUS_DIMS: Dim[] = [
  { key: 'WAITING', label: 'รอคิว', color: null, active: true },
  { key: 'CALLED', label: 'เรียกแล้ว', color: null, active: true },
  { key: 'NEED_DATE', label: 'ยืนยันจะมา รอนัดวัน', color: null, active: true },
  { key: 'CONFIRMED', label: 'ยืนยันส่งตัว', color: null, active: true },
  { key: 'DECLINED', label: 'ไม่ยืนยัน', color: null, active: true },
  { key: 'CANCELLED', label: 'ยกเลิก', color: null, active: true },
];
const GENDER_DIMS: Dim[] = [
  { key: 'M', label: 'ชาย', color: null, active: true },
  { key: 'F', label: 'หญิง', color: null, active: true },
  { key: 'O', label: 'อื่น ๆ', color: null, active: true },
  { key: NO_VALUE, label: 'ไม่ระบุ', color: null, active: true },
];
const SOURCE_DIMS: Dim[] = [
  { key: 'APP', label: 'ส่งผ่าน LINE', color: null, active: true },
  { key: 'ADMIN', label: 'เจ้าหน้าที่บันทึก', color: null, active: true },
  { key: 'IMPORT', label: 'นำเข้าจาก Excel', color: null, active: true },
];

/** วันที่ (YYYY-MM-DD) ตามเวลาไทย */
export const thaiDate = (d: Date | string) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
const round1 = (n: number) => Math.round(n * 10) / 10;

function weekStart(dayKey: string): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // จันทร์เป็นวันแรกของสัปดาห์
  return d.toISOString().slice(0, 10);
}
const bucketOf = (dayKey: string, g: TimeGroup) => (g === 'day' ? dayKey : g === 'week' ? weekStart(dayKey) : dayKey.slice(0, 7));

const thaiShort = (key: string) => new Date(`${key}T00:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
function timeLabel(key: string, g: TimeGroup): string {
  if (g === 'day') return thaiShort(key);
  if (g === 'week') return `สัปดาห์ ${thaiShort(key)}`;
  return new Date(`${key}-01T00:00:00+07:00`).toLocaleDateString('th-TH', { month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
}

type Item = { row: EngineRow; date: string; value: number };

/** แถวที่เข้าเงื่อนไขของ "ค่าที่วัด" นี้ พร้อมวันที่ที่ใช้จัดกลุ่มตามเวลา */
function select(m: Measure, rows: EngineRow[], ctx: EngineContext, sinceMs: number, untilMs: number): Item[] {
  const out: Item[] = [];
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= sinceMs && t < untilMs;
  };
  const timeoutMs = ctx.timeoutHours * 3_600_000;
  for (const r of rows) {
    switch (m) {
      case 'submitted':
        if (inRange(r.submitted_at)) out.push({ row: r, date: r.submitted_at, value: 1 });
        break;
      case 'confirmed':
      case 'declined':
      case 'cancelled': {
        const st = m === 'confirmed' ? 'CONFIRMED' : m === 'declined' ? 'DECLINED' : 'CANCELLED';
        if (r.status === st && r.resolved_at && inRange(r.resolved_at)) out.push({ row: r, date: r.resolved_at, value: 1 });
        break;
      }
      case 'waiting':
        if (r.status === 'WAITING') out.push({ row: r, date: r.submitted_at, value: 1 });
        break;
      case 'called':
        if (r.status === 'CALLED') out.push({ row: r, date: r.called_at ?? r.submitted_at, value: 1 });
        break;
      case 'overdue':
        if (r.status === 'CALLED' && r.called_at && ctx.now.getTime() - new Date(r.called_at).getTime() > timeoutMs) out.push({ row: r, date: r.called_at, value: 1 });
        break;
      default: {
        // avg_days / max_days / min_days
        if (r.status === 'CONFIRMED' && r.resolved_at && inRange(r.resolved_at)) {
          const days = Math.max(0, (new Date(r.resolved_at).getTime() - new Date(r.submitted_at).getTime()) / DAY);
          out.push({ row: r, date: r.resolved_at, value: days });
        }
      }
    }
  }
  return out;
}

const dimsOf = (g: Group, ctx: EngineContext): Dim[] | null =>
  g === 'color' ? ctx.colors : g === 'substance' ? ctx.substances : g === 'reason' ? ctx.reasons : g === 'status' ? STATUS_DIMS : g === 'gender' ? GENDER_DIMS : g === 'source' ? SOURCE_DIMS : null;

function keyOf(r: EngineRow, g: Group): string {
  switch (g) {
    case 'color':
      return r.color_code ?? NO_VALUE;
    case 'substance':
      return r.substance_code ?? NO_VALUE;
    case 'reason':
      return r.reason_code ?? NO_VALUE;
    case 'hospital':
      return String(r.hospital_id);
    case 'status':
      return r.status;
    case 'gender':
      return r.patient_gender ?? NO_VALUE;
    case 'source':
      return r.source;
    default:
      return 'all';
  }
}

function passes(r: EngineRow, f: WidgetConfig['filters']): boolean {
  if (f.colors.length && !f.colors.includes(r.color_code ?? NO_VALUE)) return false;
  if (f.substances.length && !f.substances.includes(r.substance_code ?? NO_VALUE)) return false;
  if (f.reasons.length && !f.reasons.includes(r.reason_code ?? NO_VALUE)) return false;
  return true;
}

function aggregate(measure: Measure, vals: number[] | undefined): number | null {
  if (!vals || vals.length === 0) return unitOf(measure) === 'ราย' ? 0 : null;
  if (measure === 'avg_days') return round1(vals.reduce((a, b) => a + b, 0) / vals.length);
  if (measure === 'max_days') return round1(Math.max(...vals));
  if (measure === 'min_days') return round1(Math.min(...vals));
  return vals.length; // ชนิดนับ
}

export function computeWidget(cfg: Pick<WidgetConfig, 'measures' | 'group_by' | 'split_by' | 'filters' | 'row_limit'>, rows: EngineRow[], ctx: EngineContext): WidgetResult {
  const sinceMs = ctx.since ? ctx.since.getTime() : ctx.now.getTime() - ctx.days * DAY;
  const untilMs = ctx.until ? ctx.until.getTime() : Number.POSITIVE_INFINITY;
  const unit = unitOf(cfg.measures[0]!);
  const dayList = ctx.dayKeys ?? Array.from({ length: ctx.days }, (_, i) => thaiDate(new Date(ctx.now.getTime() - (ctx.days - 1 - i) * DAY)));
  // ช่วงยาวมากแกนรายวันอ่านไม่ออก — ปรับเป็นรายสัปดาห์/รายเดือนให้อัตโนมัติ
  let timeGroup = (TIME_GROUPS as readonly string[]).includes(cfg.group_by) ? (cfg.group_by as TimeGroup) : null;
  if (timeGroup === 'day' && dayList.length > 120) timeGroup = 'week';
  if (timeGroup === 'week' && dayList.length > 900) timeGroup = 'month';
  const splitting = cfg.split_by !== 'none' && cfg.group_by !== 'none';

  // ช่วงเวลา → วัน/ที่เก็บ (ใช้กับกลุ่มตามเวลา)
  const buckets: string[] = [];
  const dayToBucket = new Map<string, string>();
  if (timeGroup) {
    for (const d of dayList) {
      const b = bucketOf(d, timeGroup);
      dayToBucket.set(d, b);
      if (!buckets.includes(b)) buckets.push(b);
    }
  }

  const items = cfg.measures.map((m) => ({ m, list: select(m, rows, ctx, sinceMs, untilMs).filter((i) => passes(i.row, cfg.filters)) }));

  // รวมค่า: groupKey -> colKey -> ค่าดิบ
  const cells = new Map<string, Map<string, number[]>>();
  const colUniverse = new Map<string, Dim>();
  const add = (gk: string, ck: string, v: number) => {
    let row = cells.get(gk);
    if (!row) cells.set(gk, (row = new Map()));
    let cell = row.get(ck);
    if (!cell) row.set(ck, (cell = []));
    cell.push(v);
  };

  for (const { m, list } of items) {
    for (const it of list) {
      let gk: string;
      if (cfg.group_by === 'none') gk = 'all';
      else if (timeGroup) {
        const b = dayToBucket.get(thaiDate(it.date));
        if (!b) continue; // นอกช่วงเวลา
        gk = b;
      } else gk = keyOf(it.row, cfg.group_by);

      let ck = m as string;
      if (splitting) {
        ck = keyOf(it.row, cfg.split_by);
        if (!colUniverse.has(ck)) colUniverse.set(ck, { key: ck, label: ck, color: null, active: true });
      }
      add(gk, ck, it.value);
    }
  }

  // ---- คอลัมน์ ----
  let columns: WidgetColumn[];
  const measure0 = cfg.measures[0]!;
  if (splitting) {
    const dims = dimsOf(cfg.split_by, ctx) ?? [];
    const seen = new Set(colUniverse.keys());
    const ordered = [...dims.filter((d) => d.active || seen.has(d.key)), ...[...seen].filter((k) => !dims.some((d) => d.key === k)).map((k) => ({ key: k, label: k === NO_VALUE ? 'ไม่ระบุ' : k, color: null, active: true }))];
    columns = ordered.map((d) => ({ key: d.key, label: d.key === NO_VALUE ? 'ไม่ระบุ' : d.label, color: d.color }));
    if (seen.has(NO_VALUE) && !columns.some((c) => c.key === NO_VALUE)) columns.push({ key: NO_VALUE, label: 'ไม่ระบุ', color: null });
  } else {
    columns = cfg.measures.map((m) => ({ key: m, label: MEASURE_LABEL[m], color: null }));
  }

  // ---- แถว ----
  let rowDefs: { key: string; label: string; color: string | null }[];
  if (cfg.group_by === 'none') rowDefs = [{ key: 'all', label: 'ทั้งหมด', color: null }];
  else if (timeGroup) rowDefs = buckets.map((b) => ({ key: b, label: timeLabel(b, timeGroup), color: null }));
  else if (cfg.group_by === 'hospital') {
    rowDefs = [...cells.keys()].map((k) => ({ key: k, label: ctx.hospitalNames.get(Number(k)) ?? `รหัส ${k}`, color: null }));
  } else {
    const dims = dimsOf(cfg.group_by, ctx) ?? [];
    const withData = new Set(cells.keys());
    rowDefs = dims.filter((d) => d.active || withData.has(d.key)).map((d) => ({ key: d.key, label: d.label, color: d.color }));
    for (const k of withData) if (!rowDefs.some((r) => r.key === k)) rowDefs.push({ key: k, label: k === NO_VALUE ? 'ไม่ระบุ' : k, color: null });
    // "ไม่ระบุ" แสดงเมื่อมีข้อมูลเท่านั้น (ไม่ใช่ค่าที่ผู้ใช้เลือกได้)
  }

  const out: WidgetRow[] = rowDefs.map((r) => {
    const cm = cells.get(r.key);
    const values = columns.map((c) => aggregate(splitting ? measure0 : (c.key as Measure), cm?.get(c.key)));
    const total = unit === 'ราย' ? values.reduce<number>((a, v) => a + (v ?? 0), 0) : null;
    return { ...r, values, total };
  });

  if (cfg.group_by === 'hospital') {
    out.sort((a, b) => (b.total ?? 0) - (a.total ?? 0) || (b.values[0] ?? 0) - (a.values[0] ?? 0));
    out.splice(cfg.row_limit);
  }

  return { unit, days: ctx.days, period_label: ctx.periodLabel ?? `${ctx.days} วันล่าสุด`, column_mode: splitting ? 'split' : 'series', time_group: timeGroup, columns, rows: out };
}

/** ค่าที่วัดแบบ "ขณะนี้" ทุกตัวไหม (หน้าจอแสดงคำว่า "ขณะนี้" แทน "N วันล่าสุด") */
export const isSnapshot = (ms: readonly Measure[]) => ms.every((m) => SNAPSHOT_MEASURES.includes(m));
