/**
 * LookupService.ts — กติกาธุรกิจของ "ข้อมูลหลัก"
 *   - รหัสซ้ำใน type เดียวกันไม่ได้ · สีของ COLOR ต้องเป็น #RRGGBB
 *   - ลบได้เฉพาะค่าที่ยังไม่มีคำขอใช้ (ถ้ามีแล้วให้ "ปิดใช้งาน" แทน เพื่อไม่ให้สถิติย้อนหลังเพี้ยน)
 */
import { badRequest, conflict, notFound } from '../../core/http';
import { LOOKUP_TYPES, type Lookup, type LookupType } from './Lookup';
import type { LookupAddDto, LookupSearchDto, LookupUpdateDto } from './LookupDto';
import type { LookupRepository } from './LookupRepository';

export class LookupService {
  constructor(private repo: LookupRepository) {}

  search({ type, q, pageNo, pageSize }: LookupSearchDto) {
    return this.repo.search({ type, q }, { pageNo, pageSize });
  }

  /** จัดกลุ่มตาม type — สำหรับฟอร์ม/กราฟ/ตัวกรองทั้งระบบ */
  async options() {
    const grouped = Object.fromEntries(LOOKUP_TYPES.map((t) => [t, [] as Lookup[]])) as Record<LookupType, Lookup[]>;
    for (const row of await this.repo.all()) grouped[row.type].push({ ...row, is_active: !!row.is_active });
    return grouped;
  }

  async get(id: number) {
    const row = await this.repo.findById(id);
    if (!row) throw notFound('ไม่พบข้อมูลหลักนี้');
    return { ...row, is_active: !!row.is_active };
  }

  async create(dto: LookupAddDto) {
    if (dto.type === 'COLOR' && !dto.color) throw badRequest('กรุณาเลือกสี', { color: 'กรุณาเลือกสี' });
    if (await this.repo.find(dto.type, dto.code)) throw conflict('รหัสนี้มีอยู่แล้วในประเภทเดียวกัน', { code: 'รหัสนี้มีอยู่แล้ว' });
    return { id: await this.repo.insert(dto) };
  }

  async update({ id, ...dto }: LookupUpdateDto) {
    const row = await this.get(id);
    if (row.type === 'COLOR' && !dto.color) throw badRequest('กรุณาเลือกสี', { color: 'กรุณาเลือกสี' });
    await this.repo.update(id, dto);
    return { id };
  }

  async remove(id: number) {
    const row = await this.get(id);
    const used = await this.repo.usageCount(row.type, row.code);
    if (used > 0) throw conflict(`มีคำขอใช้ค่านี้อยู่ ${used} รายการ — ลบไม่ได้ ให้ "ปิดใช้งาน" แทน`);
    await this.repo.delete(id);
  }

  /**
   * หา/สร้างค่าจากชื่อที่แสดง — ใช้ตอน import Excel (ชื่อที่ไม่รู้จักจะสร้างเป็นค่าใหม่ให้)
   * คืน code ของค่านั้น
   */
  async resolveLabel(type: LookupType, label: string, autoCreate: boolean): Promise<string | null> {
    const text = label.trim();
    if (!text) return null;
    const all = await this.repo.all();
    const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    const hit = all.find((r) => r.type === type && (norm(r.label) === norm(text) || r.code.toLowerCase() === text.toLowerCase()));
    if (hit) return hit.code;
    if (!autoCreate) return null;
    const next = all.filter((r) => r.type === type).length + 1;
    let code = `X${String(next).padStart(3, '0')}`;
    while (all.some((r) => r.type === type && r.code === code)) code = `X${String(Number(code.slice(1)) + 1).padStart(3, '0')}`;
    await this.repo.insert({ type, code, label: text.slice(0, 100), color: type === 'COLOR' ? '#6B7280' : '', sort_order: 90 + next, is_active: 'Y' });
    return code;
  }
}
