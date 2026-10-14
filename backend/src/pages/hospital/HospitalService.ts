/**
 * HospitalService.ts — กติกาธุรกิจของ "โรงพยาบาล"
 *   - รหัส 5 หลักห้ามซ้ำ · ลบไม่ได้ถ้ามีคำขอ/ผู้ขอผูกอยู่ (ให้ปิดใช้งานแทน)
 */
import { conflict, notFound } from '../../core/http';
import type { HospitalAddDto, HospitalSearchDto, HospitalUpdateDto } from './HospitalDto';
import type { HospitalRepository } from './HospitalRepository';

export class HospitalService {
  constructor(private repo: HospitalRepository) {}

  search({ q, pageNo, pageSize }: HospitalSearchDto) {
    return this.repo.search(q, { pageNo, pageSize });
  }

  async options() {
    return (await this.repo.active()).map((h) => ({ id: h.id, code: h.code, name: h.name }));
  }

  async get(id: number) {
    const row = await this.repo.findById(id);
    if (!row) throw notFound('ไม่พบโรงพยาบาลนี้');
    return { ...row, is_active: !!row.is_active };
  }

  async create(dto: HospitalAddDto) {
    if (await this.repo.findByCode(dto.code)) throw conflict('รหัสโรงพยาบาลนี้มีอยู่แล้ว', { code: 'รหัสนี้มีอยู่แล้ว' });
    return { id: await this.repo.insert(dto) };
  }

  async update({ id, ...dto }: HospitalUpdateDto) {
    await this.get(id);
    const same = await this.repo.findByCode(dto.code);
    if (same && same.id !== id) throw conflict('รหัสโรงพยาบาลนี้มีอยู่แล้ว', { code: 'รหัสนี้มีอยู่แล้ว' });
    await this.repo.update(id, dto);
    return { id };
  }

  async remove(id: number) {
    await this.get(id);
    const used = await this.repo.usageCount(id);
    if (used > 0) throw conflict(`มีคำขอหรือผู้ขอผูกกับโรงพยาบาลนี้อยู่ ${used} รายการ — ลบไม่ได้ ให้ "ปิดใช้งาน" แทน`);
    await this.repo.delete(id);
  }

  /**
   * หาโรงพยาบาลจากรหัส 5 หลัก ไม่มีก็สร้างให้ (ใช้ตอนผู้ขอลงทะเบียน / import Excel)
   * ถ้ามีแล้วใช้ชื่อเดิมของระบบ ไม่ทับด้วยชื่อที่ผู้ขอพิมพ์
   */
  async findOrCreate(code: string, name: string): Promise<number> {
    const hit = await this.repo.findByCode(code);
    if (hit) return hit.id;
    return this.repo.insert({ code, name, is_active: 'Y' });
  }
}
