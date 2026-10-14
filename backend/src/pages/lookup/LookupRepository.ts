/**
 * LookupRepository.ts — ชั้นที่คุยกับฐานข้อมูลของ "ข้อมูลหลัก" (query อย่างเดียว ไม่มีกติกาธุรกิจ)
 */
import { db, insertGetId, nowIso, whereContains } from '../../core/db';
import { paginate, type PageResult, type Paging } from '../../core/http';
import type { Lookup, LookupType } from './Lookup';

/** คอลัมน์ของ bed_request ที่เก็บ code ของแต่ละ type (ใช้นับว่ามีคำขอใช้อยู่ไหม) */
const USAGE_COLUMN: Record<LookupType, string> = { COLOR: 'color_code', SUBSTANCE: 'substance_code', REASON: 'reason_code' };

export class LookupRepository {
  search(filters: { type: string; q: string }, paging: Paging): Promise<PageResult<Lookup>> {
    const base = db('lookup');
    if (filters.type) base.where('type', filters.type);
    if (filters.q) {
      base.where((w) => {
        whereContains(w, 'code', filters.q);
        w.orWhere((o) => whereContains(o, 'label', filters.q));
      });
    }
    return paginate<Lookup>(paging, base, (q) => q.select('*').orderBy('type').orderBy('sort_order').orderBy('id'));
  }

  /** ทุกค่า (รวมที่ปิดใช้งาน) — ฟอร์มกรองเฉพาะที่เปิดอยู่ ส่วนหน้ารายงานใช้ชื่อของค่าที่ปิดแล้วด้วย */
  all(): Promise<Lookup[]> {
    return db('lookup').select('*').orderBy('type').orderBy('sort_order').orderBy('id');
  }

  findById(id: number): Promise<Lookup | undefined> {
    return db('lookup').where({ id }).first();
  }

  find(type: string, code: string): Promise<Lookup | undefined> {
    return db('lookup').where({ type, code }).first();
  }

  async insert(d: { type: string; code: string; label: string; color: string; sort_order: number; is_active: 'Y' | 'N' }): Promise<number> {
    const now = nowIso();
    return insertGetId(db, 'lookup', { type: d.type, code: d.code, label: d.label, color: d.color || null, sort_order: d.sort_order, is_active: d.is_active === 'Y', created_at: now, updated_at: now });
  }

  async update(id: number, d: { label: string; color: string; sort_order: number; is_active: 'Y' | 'N' }): Promise<void> {
    await db('lookup').where({ id }).update({ label: d.label, color: d.color || null, sort_order: d.sort_order, is_active: d.is_active === 'Y', updated_at: nowIso() });
  }

  async delete(id: number): Promise<void> {
    await db('lookup').where({ id }).delete();
  }

  /** จำนวนคำขอที่ใช้ค่านี้อยู่ */
  async usageCount(type: LookupType, code: string): Promise<number> {
    const row = (await db('bed_request').where(USAGE_COLUMN[type], code).count({ n: '*' }).first()) as { n: number | string } | undefined;
    return Number(row?.n ?? 0);
  }
}
