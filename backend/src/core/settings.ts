/**
 * core/settings.ts — ค่าตั้งค่าของระบบที่ผู้ดูแลแก้ได้จากหน้าจอ (เก็บในตาราง app_setting)
 *
 * วิธีใช้:
 *   1) ประกาศค่าตั้งค่าที่ pages/setting/SettingDefs.ts (ชื่อ, ชนิด, ค่าเริ่มต้น, ใครแก้ได้)  → registerSettings([...])
 *   2) อ่านค่า:  const hours = await getSetting<number>('confirm_timeout_hours');
 *   3) หน้าจอแก้ค่าผ่าน listSettings / updateSettings (pages/setting)
 *
 * ชนิด: STRING / TEXT = ข้อความ · INT = จำนวนเต็ม · BOOL = เปิด/ปิด · SECRET = ค่าลับ (เข้ารหัสในฐานข้อมูล, หน้าจอไม่เห็นค่าจริง)
 * ยังไม่เคยตั้งค่า = ใช้ค่าเริ่มต้นในโค้ด (ไม่ต้อง seed ข้อมูล)
 * อ่านผ่าน cache 30 วินาที และล้าง cache ทันทีเมื่อแก้ค่า
 */
import { db, nowIso } from './db';
import { decrypt, encrypt } from './crypto';
import { badRequest, forbidden } from './http';
import { hasRole, type Role } from './pages';

export type SettingType = 'STRING' | 'TEXT' | 'INT' | 'BOOL' | 'SECRET';
export type SettingValue = string | number | boolean;

export type SettingDef = {
  key: string;
  label: string;
  /** กลุ่มที่แสดงในหน้าตั้งค่า เช่น queue / dashboard / line / connection */
  category: string;
  type: SettingType;
  default: SettingValue;
  hint?: string;
  /** INT: ค่าต่ำสุด/สูงสุด */
  min?: number;
  max?: number;
  /** STRING: เลือกได้เฉพาะค่าเหล่านี้ (แสดงเป็นรายการให้เลือก) */
  options?: { value: string; label: string }[];
  /** role ต่ำสุดที่เห็น/แก้ค่านี้ได้ (ไม่ใส่ = ADMIN) */
  minRole?: Role;
  /** ตรวจเพิ่ม — คืนข้อความ error ถ้าไม่ผ่าน, คืน null ถ้าผ่าน */
  validate?: (value: string) => string | null;
};

const defs = new Map<string, SettingDef>();

export function registerSettings(list: SettingDef[]) {
  for (const d of list) defs.set(d.key, d);
}

// ---------- cache ----------
let cache: Map<string, string> | null = null;
let loadedAt = 0;
const TTL_MS = 30_000;

async function load() {
  const rows = (await db('app_setting').select('key', 'value')) as { key: string; value: string | null }[];
  cache = new Map(rows.map((r) => [r.key, r.value ?? '']));
  loadedAt = Date.now();
}
const ensure = async () => {
  if (!cache || Date.now() - loadedAt > TTL_MS) await load();
};
export const invalidateSettings = () => {
  cache = null;
};

function cast(def: SettingDef, raw: string | undefined): SettingValue {
  if (raw === undefined) return def.default;
  switch (def.type) {
    case 'INT': {
      const n = Number.parseInt(raw, 10);
      return Number.isNaN(n) ? Number(def.default) : n;
    }
    case 'BOOL':
      return raw === '1' || raw === 'true';
    case 'SECRET':
      return decrypt(raw);
    default:
      return raw;
  }
}

function defOf(key: string): SettingDef {
  const d = defs.get(key);
  if (!d) throw new Error(`ยังไม่ได้ประกาศค่าตั้งค่า "${key}" (ดู pages/setting/SettingDefs.ts)`);
  return d;
}

/** อ่านค่าตั้งค่า (SECRET คืนค่าจริงที่ถอดรหัสแล้ว — ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น ห้ามส่งให้หน้าจอ) */
export async function getSetting<T extends SettingValue = string>(key: string): Promise<T> {
  await ensure();
  return cast(defOf(key), cache!.get(key)) as T;
}

export type SettingView = {
  key: string;
  label: string;
  category: string;
  type: SettingType;
  hint: string;
  options: { value: string; label: string }[] | null;
  min: number | null;
  max: number | null;
  /** SECRET ไม่ส่งค่าจริง — ส่งแค่ว่าตั้งไว้แล้วหรือยัง */
  value: SettingValue;
  is_set: boolean;
};

/** รายการสำหรับหน้าจอตั้งค่า — เฉพาะค่าที่ role นี้เห็นได้ */
export async function listSettings(categories: string[], viewer: Role): Promise<SettingView[]> {
  await load();
  return [...defs.values()]
    .filter((d) => (categories.length === 0 || categories.includes(d.category)) && hasRole(viewer, d.minRole ?? 'ADMIN'))
    .map((d) => ({
      key: d.key,
      label: d.label,
      category: d.category,
      type: d.type,
      hint: d.hint ?? '',
      options: d.options ?? null,
      min: d.min ?? null,
      max: d.max ?? null,
      value: d.type === 'SECRET' ? '' : cast(d, cache!.get(d.key)),
      is_set: d.type === 'SECRET' ? !!cache!.get(d.key) : cache!.has(d.key),
    }));
}

/** บันทึกหลายค่าพร้อมกัน — ตรวจสิทธิ์/ชนิด/ช่วงค่าทุกตัวก่อน ถ้าตัวใดไม่ผ่านจะไม่บันทึกเลย (SECRET ว่าง = ไม่เปลี่ยน) */
export async function updateSettings(values: Record<string, unknown>, actor: { id: number; role: Role }) {
  const prepared: { key: string; stored: string }[] = [];
  const errors: Record<string, string> = {};

  for (const [key, raw] of Object.entries(values)) {
    const d = defs.get(key);
    if (!d) throw badRequest(`ไม่รู้จักค่าตั้งค่า "${key}"`);
    if (!hasRole(actor.role, d.minRole ?? 'ADMIN')) throw forbidden(`คุณไม่มีสิทธิ์แก้ค่า "${d.label}"`);

    let stored: string;
    if (d.type === 'INT') {
      const n = Number(raw);
      if (raw === '' || raw === null || !Number.isInteger(n)) {
        errors[key] = 'ต้องเป็นจำนวนเต็ม';
        continue;
      }
      if ((d.min !== undefined && n < d.min) || (d.max !== undefined && n > d.max)) {
        errors[key] = `ต้องอยู่ระหว่าง ${d.min ?? '-∞'} ถึง ${d.max ?? '∞'}`;
        continue;
      }
      stored = String(n);
    } else if (d.type === 'BOOL') {
      stored = raw === true || raw === '1' || raw === 'true' || raw === 1 ? '1' : '0';
    } else {
      stored = String(raw ?? '').trim();
      if (d.type === 'SECRET' && stored === '') continue; // ช่องลับเว้นว่าง = ใช้ค่าเดิม
      if (d.options && !d.options.some((o) => o.value === stored)) {
        errors[key] = 'เลือกได้เฉพาะตัวเลือกที่กำหนด';
        continue;
      }
      const msg = d.validate?.(stored) ?? null;
      if (msg) {
        errors[key] = msg;
        continue;
      }
      if (d.type === 'SECRET') stored = encrypt(stored);
    }
    prepared.push({ key, stored });
  }

  if (Object.keys(errors).length) throw badRequest('ค่าที่กรอกไม่ถูกต้อง', errors);

  const now = nowIso();
  await db.transaction(async (trx) => {
    for (const { key, stored } of prepared) {
      const exists = await trx('app_setting').where({ key }).first();
      if (exists) await trx('app_setting').where({ key }).update({ value: stored, updated_at: now, updated_by: actor.id });
      else await trx('app_setting').insert({ key, value: stored, updated_at: now, updated_by: actor.id });
    }
  });
  invalidateSettings();
  return prepared.map((p) => p.key);
}
