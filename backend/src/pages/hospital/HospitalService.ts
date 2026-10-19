/**
 * HospitalService.ts — กติกาธุรกิจของ "โรงพยาบาล"
 *   - รหัส 5 หลักห้ามซ้ำ · ลบไม่ได้ถ้ามีคำขอ/ผู้ขอผูกอยู่ (ให้ปิดใช้งานแทน)
 *   - verify(): ตรวจรหัส+ชื่อตอนผู้ขอลงทะเบียน (ต้องมีในรายชื่อ เปิดใช้งาน และชื่อตรง)
 *   - นำเข้า Excel: ดูตัวอย่างก่อน (preview) แล้วค่อยยืนยัน (commit) — commit อ่านไฟล์ซ้ำและตรวจใหม่เองเสมอ ไม่เชื่อผลจาก preview
 */
import { badRequest, conflict, notFound } from '../../core/http';
import type { HospitalAddDto, HospitalImportDto, HospitalSearchDto, HospitalUpdateDto } from './HospitalDto';
import { buildTemplate, ExcelFormatError, normalizeName, parseHospitalSheet, type ParsedRow } from './HospitalExcel';
import type { Hospital } from './Hospital';
import type { HospitalRepository } from './HospitalRepository';

export type ImportAction = 'NEW' | 'UPDATE' | 'SAME' | 'ERROR';
export type ImportPreviewRow = { row: number; code: string; name: string; health_region: number | null; is_active: boolean; action: ImportAction; message: string };
const PREVIEW_LIMIT = 300;

export class HospitalService {
  constructor(private repo: HospitalRepository) {}

  search({ q, pageNo, pageSize }: HospitalSearchDto) {
    return this.repo.search(q, { pageNo, pageSize });
  }

  async options() {
    return (await this.repo.active()).map((h) => ({ id: h.id, code: h.code, name: h.name, health_region: h.health_region ?? null }));
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
   * หาโรงพยาบาลจากรหัส 5 หลัก ไม่มีก็สร้างให้ — ใช้เฉพาะผู้ขอจำลอง/ข้อมูลทดสอบของ dev (ผู้ขอจริงต้องผ่าน verify)
   * ถ้ามีแล้วใช้ชื่อเดิมของระบบ ไม่ทับด้วยชื่อที่พิมพ์
   */
  async findOrCreate(code: string, name: string): Promise<number> {
    const hit = await this.repo.findByCode(code);
    if (hit) return hit.id;
    return this.repo.insert({ code, name, is_active: 'Y' });
  }

  /** ค้นจากรหัสสำหรับหน้าลงทะเบียน (เติมชื่อให้อัตโนมัติ): ไม่พบ/ปิดใช้งาน = found false */
  async lookupByCode(code: string): Promise<{ found: boolean; name: string }> {
    const h = await this.repo.findByCode(code);
    return h && h.is_active ? { found: true, name: h.name } : { found: false, name: '' };
  }

  /**
   * ตรวจรหัส+ชื่อโรงพยาบาลตอนลงทะเบียน คืน id ถ้าผ่าน — ไม่ผ่านโยน 400 พร้อมข้อความที่บอกว่าต้องแก้อะไร
   * (ชื่อเทียบแบบไม่สนช่องว่าง/จุด และ "โรงพยาบาล" = "รพ.")
   */
  async verify(code: string, name: string): Promise<number> {
    const h = await this.repo.findByCode(code);
    if (!h || !h.is_active) throw badRequest('ไม่พบรหัสโรงพยาบาลนี้ในระบบ — ตรวจรหัส 5 หลักอีกครั้ง หรือติดต่อเจ้าหน้าที่', { hospital_code: 'ไม่พบรหัสนี้ในระบบ' });
    if (normalizeName(h.name) !== normalizeName(name)) throw badRequest(`ชื่อโรงพยาบาลไม่ตรงกับรหัสนี้ (ในระบบคือ "${h.name}")`, { hospital_name: `ชื่อในระบบคือ ${h.name}` });
    return h.id;
  }

  // ---------- นำเข้า / ดาวน์โหลด Excel ----------
  async template(withData: boolean) {
    const rows = withData ? await this.repo.all() : [];
    return buildTemplate(rows.map((h) => ({ code: h.code, name: h.name, health_region: h.health_region ?? null, is_active: !!h.is_active })));
  }

  private async classify(file: HospitalImportDto): Promise<{ rows: ImportPreviewRow[]; plan: { id: number | null; code: string; name: string; health_region: number | null; is_active: boolean }[] }> {
    const buf = Buffer.from(file.file_base64, 'base64');
    let parsed: ParsedRow[];
    try {
      parsed = await parseHospitalSheet(buf);
    } catch (e) {
      if (e instanceof ExcelFormatError) throw badRequest(e.message, { file_base64: e.message });
      throw e;
    }
    if (!parsed.length) throw badRequest('ไม่พบข้อมูลในไฟล์ (มีแต่หัวตาราง)', { file_base64: 'ไม่พบข้อมูล' });
    const existing = new Map((await this.repo.all()).map((h: Hospital) => [h.code, h]));
    const plan: { id: number | null; code: string; name: string; health_region: number | null; is_active: boolean }[] = [];
    const rows = parsed.map((p): ImportPreviewRow => {
      const base = { row: p.row, code: p.code, name: p.name, health_region: p.health_region, is_active: p.is_active };
      if (p.error) return { ...base, action: 'ERROR', message: p.error };
      const cur = existing.get(p.code);
      if (!cur) {
        plan.push({ id: null, ...base });
        return { ...base, action: 'NEW', message: 'เพิ่มใหม่' };
      }
      const changes = [cur.name !== p.name && 'ชื่อ', (cur.health_region ?? null) !== p.health_region && 'เขต', !!cur.is_active !== p.is_active && 'สถานะ'].filter(Boolean);
      if (!changes.length) return { ...base, action: 'SAME', message: 'ไม่เปลี่ยนแปลง' };
      plan.push({ id: cur.id, ...base });
      return { ...base, action: 'UPDATE', message: `อัปเดต ${changes.join(', ')}` };
    });
    return { rows, plan };
  }

  /** ดูตัวอย่างผลนำเข้า (ยังไม่บันทึกอะไร) — ส่งกลับสรุปจำนวน + แถวตัวอย่าง (แถวผิดพลาดขึ้นก่อน) */
  async importPreview(file: HospitalImportDto) {
    const { rows } = await this.classify(file);
    const count = (a: ImportAction) => rows.filter((r) => r.action === a).length;
    const ordered = [...rows.filter((r) => r.action === 'ERROR'), ...rows.filter((r) => r.action !== 'ERROR')];
    return { total: rows.length, new_count: count('NEW'), update_count: count('UPDATE'), same_count: count('SAME'), error_count: count('ERROR'), rows: ordered.slice(0, PREVIEW_LIMIT), truncated: ordered.length > PREVIEW_LIMIT };
  }

  /** นำเข้าจริง: เพิ่ม/อัปเดตเฉพาะแถวที่ถูกต้อง (แถวผิดพลาดข้าม) ในธุรกรรมเดียว */
  async importCommit(file: HospitalImportDto, userId: number | null) {
    const { rows, plan } = await this.classify(file);
    await this.repo.upsertMany(plan);
    const skipped = rows.length - plan.length;
    await this.repo.addImportBatch({ filename: file.filename, total_rows: rows.length, imported: plan.length, skipped, created_by: userId });
    return { total: rows.length, created: plan.filter((p) => !p.id).length, updated: plan.filter((p) => p.id).length, unchanged: rows.filter((r) => r.action === 'SAME').length, skipped_errors: rows.filter((r) => r.action === 'ERROR').length };
  }
}
