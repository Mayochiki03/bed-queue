/**
 * RequestRepository.ts — ชั้นที่คุยกับฐานข้อมูลของ คำขอเตียง / ผู้ขอ / ประวัติเหตุการณ์
 * (รวมตัวเลือกกรองของหน้าค้นหา · ไม่ใช้ SQL เฉพาะฐานข้อมูล)
 */
import type { Knex } from 'knex';
import { db, insertGetId, nowIso, orWhereContains, whereContains } from '../../core/db';
import { paginate, type PageResult, type Paging } from '../../core/http';
import { OPEN_STATUSES, type BedRequest, type RequestEvent, type Requester, type Status } from './Request';
import type { RequestSearchDto } from './RequestDto';

type Executor = Knex | Knex.Transaction;

export type BedRequestInsert = Omit<BedRequest, 'id' | 'request_no' | 'created_at' | 'updated_at' | 'called_at' | 'called_by' | 'bed_date' | 'call_count' | 'responded_at' | 'resolved_at' | 'resolved_by' | 'resolved_via'>;

/** แปลงค่า boolean ของ MariaDB (0/1) ในแถวผู้ขอ */
const toRequester = (r: Requester & { is_blocked: number | boolean }): Requester => ({ ...r, is_blocked: !!r.is_blocked });

export type RequestFilters = Pick<RequestSearchDto, 'q' | 'statuses' | 'color_code' | 'hospital_id' | 'date_from' | 'date_to'>;

/**
 * เงื่อนไขกรองคำขอ (ใช้ร่วมกันทั้งหน้าประวัติและการส่งออก Excel — ได้ผลตรงกันเสมอ)
 * base ต้อง join hospital เป็น h และ bed_request เป็น r
 */
export function applyRequestFilters(base: Knex.QueryBuilder, dto: RequestFilters) {
  if (dto.statuses.length) base.whereIn('r.status', dto.statuses);
  if (dto.color_code) {
    if (dto.color_code === '_NONE') base.whereNull('r.color_code');
    else base.where('r.color_code', dto.color_code);
  }
  if (dto.hospital_id) base.where('r.hospital_id', dto.hospital_id);
  // ช่วงวันที่ตามเวลาไทย (UTC+7): วันที่ D เริ่ม D-1 17:00Z ถึง D 17:00Z
  if (dto.date_from) base.where('r.submitted_at', '>=', new Date(`${dto.date_from}T00:00:00+07:00`).toISOString());
  if (dto.date_to) base.where('r.submitted_at', '<', new Date(new Date(`${dto.date_to}T00:00:00+07:00`).getTime() + 86_400_000).toISOString());
  if (dto.q) {
    base.where((w) => {
      whereContains(w, 'r.request_no', dto.q);
      orWhereContains(w, 'r.patient_name', dto.q);
      orWhereContains(w, 'r.requester_name', dto.q);
      orWhereContains(w, 'h.name', dto.q);
    });
  }
  return base;
}

export class RequestRepository {
  // ---------- คำขอ ----------
  findById(id: number, x: Executor = db): Promise<BedRequest | undefined> {
    return x('bed_request').where({ id }).first();
  }

  /** คำขอที่ยังเปิดอยู่ (รอ/เรียกแล้ว/รอนัดวัน) พร้อมชื่อ/รหัสโรงพยาบาล — เรียงตามเวลาที่ส่ง */
  openWithHospital(): Promise<(BedRequest & { hospital_code: string; hospital_name: string })[]> {
    return db('bed_request as r')
      .join('hospital as h', 'h.id', 'r.hospital_id')
      .whereIn('r.status', OPEN_STATUSES)
      .select('r.*', 'h.code as hospital_code', 'h.name as hospital_name')
      .orderBy('r.submitted_at')
      .orderBy('r.id');
  }

  /** คำขอของผู้ขอคนหนึ่ง (ล่าสุดก่อน) */
  /** คำขอทั้งหมดของโรงพยาบาลนี้ (เจ้าหน้าที่ รพ. เดียวกันเห็นผู้ป่วยของ รพ. ร่วมกัน) */
  byHospital(hospitalId: number, limit = 100): Promise<BedRequest[]> {
    return db('bed_request').where({ hospital_id: hospitalId }).orderBy('submitted_at', 'desc').orderBy('id', 'desc').limit(limit);
  }

  /** คิวที่รออยู่ทั้งหมด (ใช้คำนวณลำดับ) — เรียงตามเวลาที่ส่ง */
  waitingOrder(): Promise<{ id: number; color_code: string | null }[]> {
    return db('bed_request').where({ status: 'WAITING' }).select('id', 'color_code').orderBy('submitted_at').orderBy('id');
  }

  /** ผู้ป่วยชื่อเดียวกันของ รพ. เดียวกันที่ยังมีคำขอเปิดอยู่ (กันส่งซ้ำ/กดซ้ำ) */
  findOpenDuplicate(hospitalId: number, patientName: string, exceptId?: number): Promise<BedRequest | undefined> {
    const q = db('bed_request').where({ hospital_id: hospitalId }).whereIn('status', OPEN_STATUSES);
    whereContains(q, 'patient_name', patientName); // ใช้ contains แล้วเทียบแบบตรงตัวในชั้น Service
    if (exceptId) q.whereNot({ id: exceptId });
    return q.first();
  }

  async insert(row: BedRequestInsert, x: Executor = db): Promise<number> {
    const now = nowIso();
    const id = await insertGetId(x, 'bed_request', { ...row, call_count: 0, created_at: now, updated_at: now });
    await x('bed_request').where({ id }).update({ request_no: `BQ${String(id).padStart(6, '0')}` });
    return id;
  }

  /**
   * เปลี่ยนสถานะแบบกันชนกัน: อัปเดตเมื่อสถานะปัจจุบันยังเป็นหนึ่งใน expected เท่านั้น
   * คืน true ถ้าอัปเดตได้ (false = มีคนเปลี่ยนไปก่อนแล้ว)
   */
  async updateIfStatus(id: number, expected: Status[], patch: Record<string, unknown>, x: Executor = db): Promise<boolean> {
    const n = await x('bed_request')
      .where({ id })
      .whereIn('status', expected)
      .update({ ...patch, updated_at: nowIso() });
    return n > 0;
  }

  update(id: number, patch: Record<string, unknown>, x: Executor = db) {
    return x('bed_request')
      .where({ id })
      .update({ ...patch, updated_at: nowIso() });
  }

  /** ค้นหา/ประวัติ (แบ่งหน้า) */
  search(dto: RequestSearchDto, paging: Paging): Promise<PageResult<BedRequest & { hospital_code: string; hospital_name: string }>> {
    const base = db('bed_request as r').join('hospital as h', 'h.id', 'r.hospital_id');
    applyRequestFilters(base, dto);
    return paginate(paging, base, (q) => q.select('r.*', 'h.code as hospital_code', 'h.name as hospital_name').orderBy('r.submitted_at', 'desc').orderBy('r.id', 'desc'));
  }

  // ---------- ประวัติเหตุการณ์ ----------
  addEvent(
    e: { request_id: number; event: string; from_status?: string | null; to_status?: string | null; by_user_id?: number | null; by_label?: string | null; via?: string | null; detail?: string | null; changes?: unknown[] | null },
    x: Executor = db,
  ) {
    return x('request_event').insert({
      request_id: e.request_id,
      event: e.event,
      from_status: e.from_status ?? null,
      to_status: e.to_status ?? null,
      by_user_id: e.by_user_id ?? null,
      by_label: e.by_label ?? null,
      via: e.via ?? null,
      detail: e.detail ? e.detail.slice(0, 500) : null,
      changes: e.changes?.length ? JSON.stringify(e.changes).slice(0, 8000) : null,
      created_at: nowIso(),
    });
  }

  events(requestId: number): Promise<RequestEvent[]> {
    return db('request_event').where({ request_id: requestId }).orderBy('id');
  }

  /** ชื่อเจ้าหน้าที่จาก id (ไว้แสดง "ใครเรียก/ใครปิดเคส") */
  async userNames(ids: (number | null | undefined)[]): Promise<Map<number, string>> {
    const list = [...new Set(ids.filter((i): i is number => !!i))];
    if (!list.length) return new Map();
    const rows = await db('users').whereIn('id', list).select('id', 'full_name');
    return new Map(rows.map((r: { id: number; full_name: string }) => [r.id, r.full_name]));
  }

  // ---------- ผู้ขอ ----------
  async requesterById(id: number): Promise<Requester | undefined> {
    const r = await db('requester').where({ id }).first();
    return r ? toRequester(r) : undefined;
  }

  async requesterByLine(lineUserId: string): Promise<Requester | undefined> {
    const r = await db('requester').where({ line_user_id: lineUserId }).first();
    return r ? toRequester(r) : undefined;
  }

  async requestersOfHospital(hospitalId: number): Promise<Requester[]> {
    return ((await db('requester').where({ hospital_id: hospitalId }).orderBy('full_name')) as Requester[]).map(toRequester);
  }

  /** approval_status: สมัครเองผ่าน LINE = PENDING (ต้องรออนุมัติ) · ผู้ขอจำลอง/ข้อมูลทดสอบ = APPROVED */
  insertRequester(r: { line_user_id: string | null; display_name: string | null; full_name: string; phone: string; phone2: string | null; hospital_id: number; pdpa_accepted_at: string | null; approval_status?: 'PENDING' | 'APPROVED' }): Promise<number> {
    const now = nowIso();
    return insertGetId(db, 'requester', { approval_status: 'APPROVED', ...r, is_blocked: false, last_seen_at: now, created_at: now, updated_at: now });
  }

  updateRequester(id: number, patch: Record<string, unknown>) {
    return db('requester')
      .where({ id })
      .update({ ...patch, updated_at: nowIso() });
  }

  /** ผู้ขอจำลอง (line_user_id ขึ้นต้น MOCK-) สำหรับหน้าทดลองของ dev */
  async mockRequesters(): Promise<(Requester & { hospital_code: string; hospital_name: string })[]> {
    const rows = await db('requester as q')
      .join('hospital as h', 'h.id', 'q.hospital_id')
      .where('q.line_user_id', 'like', 'MOCK-%')
      .select('q.*', 'h.code as hospital_code', 'h.name as hospital_name')
      .orderBy('q.id');
    return rows.map(toRequester) as (Requester & { hospital_code: string; hospital_name: string })[];
  }

  /** ลบผู้ขอจำลองทั้งหมดพร้อมคำขอและประวัติของพวกเขา — คืนจำนวนที่ลบ */
  async deleteMockData(): Promise<{ requesters: number; requests: number }> {
    return db.transaction(async (trx) => {
      const ids = (await trx('requester').where('line_user_id', 'like', 'MOCK-%').select('id')).map((r: { id: number }) => r.id);
      if (!ids.length) return { requesters: 0, requests: 0 };
      const reqIds = (await trx('bed_request').whereIn('requester_id', ids).select('id')).map((r: { id: number }) => r.id);
      if (reqIds.length) {
        await trx('request_event').whereIn('request_id', reqIds).delete();
        await trx('referral').whereIn('request_id', reqIds).delete();
        await trx('bed_request').whereIn('id', reqIds).delete();
      }
      await trx('requester').whereIn('id', ids).delete();
      return { requesters: ids.length, requests: reqIds.length };
    });
  }

  hospital(id: number): Promise<{ id: number; code: string; name: string; is_active: number | boolean } | undefined> {
    return db('hospital').where({ id }).first();
  }

  async lookupActive(type: 'COLOR' | 'SUBSTANCE' | 'REASON', code: string): Promise<boolean> {
    const r = await db('lookup').where({ type, code }).first();
    return !!r && !!r.is_active;
  }

  transaction<T>(fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return db.transaction(fn);
  }
}
