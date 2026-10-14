/**
 * HospitalRepository.ts — ชั้นที่คุยกับฐานข้อมูลของ "โรงพยาบาล"
 */
import { db, insertGetId, nowIso, whereContains } from '../../core/db';
import { paginate, type PageResult, type Paging } from '../../core/http';
import type { Hospital } from './Hospital';

export class HospitalRepository {
  search(q: string, paging: Paging): Promise<PageResult<Hospital>> {
    const base = db('hospital');
    if (q) {
      base.where((w) => {
        whereContains(w, 'code', q);
        w.orWhere((o) => whereContains(o, 'name', q));
      });
    }
    return paginate<Hospital>(paging, base, (x) => x.select('*').orderBy('name').orderBy('id'));
  }

  /** รายการสำหรับ dropdown/ค้นหา (เฉพาะที่เปิดใช้งาน) */
  active(): Promise<Hospital[]> {
    return db('hospital').where({ is_active: true }).select('*').orderBy('name');
  }

  findById(id: number): Promise<Hospital | undefined> {
    return db('hospital').where({ id }).first();
  }

  findByCode(code: string): Promise<Hospital | undefined> {
    return db('hospital').where({ code }).first();
  }

  async insert(d: { code: string; name: string; is_active: 'Y' | 'N' }): Promise<number> {
    const now = nowIso();
    return insertGetId(db, 'hospital', { code: d.code, name: d.name, is_active: d.is_active === 'Y', created_at: now, updated_at: now });
  }

  async update(id: number, d: { code: string; name: string; is_active: 'Y' | 'N' }): Promise<void> {
    await db('hospital').where({ id }).update({ code: d.code, name: d.name, is_active: d.is_active === 'Y', updated_at: nowIso() });
  }

  async delete(id: number): Promise<void> {
    await db('hospital').where({ id }).delete();
  }

  /** จำนวนคำขอ + ผู้ขอที่อ้างอิง รพ. นี้ (กันลบทั้งที่มีข้อมูลผูกอยู่) */
  async usageCount(id: number): Promise<number> {
    const a = (await db('bed_request').where({ hospital_id: id }).count({ n: '*' }).first()) as { n: number | string } | undefined;
    const b = (await db('requester').where({ hospital_id: id }).count({ n: '*' }).first()) as { n: number | string } | undefined;
    return Number(a?.n ?? 0) + Number(b?.n ?? 0);
  }
}
