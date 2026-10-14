/**
 * RequestService.ts — กติกาของคิว: บอร์ดคิว + เรียกคิว/บันทึกผล/ยกเลิก/คืนคิว + เจ้าหน้าที่เพิ่ม/แก้คำขอ + โอนเคส
 *
 *   - ลำดับคิว: เรียงตาม submitted_at ของคำขอที่ยัง WAITING — ลำดับรวมทุกสี และลำดับในสีเดียวกัน
 *   - เปลี่ยนสถานะผ่าน transition() เท่านั้น: ตรวจว่าเปลี่ยนจากสถานะนี้ได้ไหม + กันกดชนกัน (สองคนกดพร้อมกัน) + จดประวัติทุกครั้ง
 *   - ระบบไม่บริหารจำนวนเตียงว่าง: เจ้าหน้าที่ดูคิวและเลือกเคสที่จะเรียกเอง
 */
import { badRequest, conflict, notFound } from '../../core/http';
import { getSetting } from '../../core/settings';
import { TRANSITIONS, type BedRequest, type BoardItem, type Requester, type Status } from './Request';
import type { RequestAddDto, RequestSearchDto, RequestTransitionDto, RequestUpdateDto } from './RequestDto';
import type { RequestRepository } from './RequestRepository';

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
export type Actor = { id: number; full_name: string };

export class RequestService {
  constructor(private repo: RequestRepository) {}

  // ---------- บอร์ดคิว ----------
  async board(now = new Date()): Promise<{ now: string; timeout_hours: number; items: BoardItem[] }> {
    const timeoutHours = await getSetting<number>('confirm_timeout_hours');
    const rows = await this.repo.openWithHospital();
    // ลำดับของคิวที่รออยู่ (เรียงตามเวลาที่ส่งอยู่แล้ว)
    const perColor = new Map<string, number>();
    const posAll = new Map<number, number>();
    const posColor = new Map<number, number>();
    for (const w of rows.filter((r) => r.status === 'WAITING')) {
      const k = w.color_code ?? '_NONE';
      perColor.set(k, (perColor.get(k) ?? 0) + 1);
      posAll.set(w.id, posAll.size + 1);
      posColor.set(w.id, perColor.get(k)!);
    }
    const items: BoardItem[] = rows.map((r) => {
      const calledMs = r.called_at ? now.getTime() - new Date(r.called_at).getTime() : null;
      return {
        ...r,
        position_all: posAll.get(r.id) ?? null,
        position_color: posColor.get(r.id) ?? null,
        wait_days: round1((now.getTime() - new Date(r.submitted_at).getTime()) / DAY),
        overdue: r.status === 'CALLED' && calledMs !== null && calledMs > timeoutHours * 3_600_000,
        called_hours: r.status === 'CALLED' && calledMs !== null ? round1(calledMs / 3_600_000) : null,
      };
    });
    return { now: now.toISOString(), timeout_hours: timeoutHours, items };
  }

  /** ลำดับของคำขอหนึ่ง ๆ (ใช้กับหน้าผู้ขอ) — null ถ้าไม่ได้อยู่ในสถานะรอคิว */
  async positionsOf(ids: number[]): Promise<Map<number, { all: number; color: number }>> {
    const out = new Map<number, { all: number; color: number }>();
    const perColor = new Map<string, number>();
    let all = 0;
    for (const w of await this.repo.waitingOrder()) {
      const k = w.color_code ?? '_NONE';
      perColor.set(k, (perColor.get(k) ?? 0) + 1);
      all += 1;
      if (ids.includes(w.id)) out.set(w.id, { all, color: perColor.get(k)! });
    }
    return out;
  }

  search(dto: RequestSearchDto) {
    return this.repo.search(dto, { pageNo: dto.pageNo, pageSize: dto.pageSize });
  }

  async get(id: number) {
    const row = await this.repo.findById(id);
    if (!row) throw notFound('ไม่พบคำขอนี้');
    const [hospital, events, requester] = await Promise.all([this.repo.hospital(row.hospital_id), this.repo.events(id), row.requester_id ? this.repo.requesterById(row.requester_id) : undefined]);
    const pos = row.status === 'WAITING' ? (await this.positionsOf([id])).get(id) : undefined;
    return {
      ...row,
      hospital_code: hospital?.code ?? '',
      hospital_name: hospital?.name ?? '',
      position_all: pos?.all ?? null,
      position_color: pos?.color ?? null,
      requester: requester ? { id: requester.id, full_name: requester.full_name, phone: requester.phone, phone2: requester.phone2, has_line: !!requester.line_user_id } : null,
      events,
    };
  }

  requesters(hospitalId: number) {
    return this.repo.requestersOfHospital(hospitalId).then((list) =>
      list.map((r) => ({ id: r.id, full_name: r.full_name, phone: r.phone, phone2: r.phone2, has_line: !!r.line_user_id, is_blocked: r.is_blocked })),
    );
  }

  // ---------- ตรวจข้อมูลก่อนบันทึก ----------
  private async assertCodes(d: { color_code: string | null; substance_code: string | null; reason_code: string | null }, current?: Pick<BedRequest, 'color_code' | 'substance_code' | 'reason_code'>) {
    const checks: [keyof typeof d, 'COLOR' | 'SUBSTANCE' | 'REASON', string][] = [
      ['color_code', 'COLOR', 'สี'],
      ['substance_code', 'SUBSTANCE', 'ประเภทสารเสพติด'],
      ['reason_code', 'REASON', 'เหตุผลการส่งต่อ'],
    ];
    for (const [field, type, label] of checks) {
      const code = d[field];
      if (!code || (current && current[field] === code)) continue; // ค่าเดิมที่ภายหลังถูกปิดใช้งานยังคงไว้ได้
      if (!(await this.repo.lookupActive(type, code))) throw badRequest(`${label}ไม่ถูกต้อง`, { [field]: `เลือก${label}ที่มีในระบบ` });
    }
  }

  async assertNoDuplicate(hospitalId: number, patientName: string, exceptId?: number) {
    const hit = await this.repo.findOpenDuplicate(hospitalId, patientName, exceptId);
    const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    if (hit && norm(hit.patient_name) === norm(patientName)) {
      throw conflict(`ผู้ป่วยชื่อนี้ของโรงพยาบาลนี้มีคำขอที่ยังไม่จบอยู่แล้ว (${hit.request_no ?? `#${hit.id}`}) — ไม่ต้องส่งซ้ำ`, { patient_name: 'มีคำขอของผู้ป่วยรายนี้อยู่แล้ว' });
    }
  }

  // ---------- เจ้าหน้าที่เพิ่ม/แก้ ----------
  async create(dto: RequestAddDto, actor: Actor) {
    const hospital = await this.repo.hospital(dto.hospital_id);
    if (!hospital) throw badRequest('ไม่พบโรงพยาบาลนี้', { hospital_id: 'เลือกโรงพยาบาล' });
    await this.assertCodes(dto);
    await this.assertNoDuplicate(dto.hospital_id, dto.patient_name);

    let requester: Requester | undefined;
    if (dto.requester_id) {
      requester = await this.repo.requesterById(dto.requester_id);
      if (!requester || requester.hospital_id !== dto.hospital_id) throw badRequest('ผู้ขอที่เลือกไม่ได้อยู่โรงพยาบาลนี้', { requester_id: 'ผู้ขอไม่อยู่โรงพยาบาลนี้' });
    }
    const submittedAt = dto.submitted_at ?? new Date().toISOString();
    if (new Date(submittedAt).getTime() > Date.now() + 5 * 60_000) throw badRequest('วันเวลาที่ส่งต้องไม่เป็นอนาคต', { submitted_at: 'เป็นอนาคตไม่ได้' });

    const id = await this.repo.transaction(async (trx) => {
      const newId = await this.repo.insert(
        {
          requester_id: requester?.id ?? null,
          hospital_id: dto.hospital_id,
          requester_name: requester?.full_name ?? dto.requester_name,
          requester_phone: dto.requester_phone ?? requester?.phone ?? null,
          requester_phone2: dto.requester_phone2 ?? requester?.phone2 ?? null,
          patient_name: dto.patient_name,
          patient_gender: dto.patient_gender,
          patient_age: dto.patient_age,
          patient_province: dto.patient_province,
          patient_phone: dto.patient_phone,
          color_code: dto.color_code,
          substance_code: dto.substance_code,
          reason_code: dto.reason_code,
          note: dto.note,
          status: 'WAITING',
          submitted_at: submittedAt,
          source: 'ADMIN',
        },
        trx,
      );
      await this.repo.addEvent({ request_id: newId, event: 'SUBMITTED', to_status: 'WAITING', by_user_id: actor.id, by_label: actor.full_name, via: 'ADMIN', detail: 'เจ้าหน้าที่บันทึกแทนผู้ขอ' }, trx);
      return newId;
    });
    return { id };
  }

  async update(dto: RequestUpdateDto, actor: Actor) {
    const cur = await this.repo.findById(dto.id);
    if (!cur) throw notFound('ไม่พบคำขอนี้');
    if (dto.hospital_id !== cur.hospital_id) {
      if (!(await this.repo.hospital(dto.hospital_id))) throw badRequest('ไม่พบโรงพยาบาลนี้', { hospital_id: 'เลือกโรงพยาบาล' });
      // ย้ายโรงพยาบาลแล้วผู้ขอเดิมไม่ใช่คนของ รพ. ใหม่ → ถอดการผูกผู้ขอ (ยังเก็บชื่อ/เบอร์ตามที่กรอก)
    }
    await this.assertCodes(dto, cur);
    if (dto.patient_name !== cur.patient_name || dto.hospital_id !== cur.hospital_id) {
      if (cur.status === 'WAITING' || cur.status === 'CALLED') await this.assertNoDuplicate(dto.hospital_id, dto.patient_name, cur.id);
    }

    const { id, ...patch } = dto;
    const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => (patch[k] ?? null) !== ((cur as Record<string, unknown>)[k] ?? null));
    if (changed.length === 0) return { id };
    await this.repo.transaction(async (trx) => {
      await this.repo.update(id, { ...patch, ...(dto.hospital_id !== cur.hospital_id ? { requester_id: null } : {}) }, trx);
      await this.repo.addEvent({ request_id: id, event: 'EDITED', by_user_id: actor.id, by_label: actor.full_name, via: 'ADMIN', detail: `แก้ไข: ${changed.join(', ')}` }, trx);
    });
    return { id };
  }

  // ---------- เปลี่ยนสถานะ ----------
  /**
   * เรียกคิว/ยืนยัน/ไม่ยืนยัน/ยกเลิก/คืนคิว/เปิดใหม่
   * by = ผู้ทำ (เจ้าหน้าที่ หรือชื่อผู้ขอเมื่อผู้ขอตอบเอง) · via = LINE | PHONE | ADMIN | SYSTEM
   */
  async transition(dto: Pick<RequestTransitionDto, 'id' | 'action' | 'via'> & { note?: string | null }, by: { user_id: number | null; label: string }) {
    const rule = TRANSITIONS[dto.action];
    const cur = await this.repo.findById(dto.id);
    if (!cur) throw notFound('ไม่พบคำขอนี้');
    if (!rule.from.includes(cur.status)) {
      throw conflict(`ทำ "${rule.label}" ไม่ได้ — คำขอนี้อยู่ในสถานะ "${statusLabel(cur.status)}" (อาจมีคนเปลี่ยนไปก่อนแล้ว กรุณาโหลดหน้าใหม่)`);
    }
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: rule.to };
    switch (dto.action) {
      case 'CALL':
        Object.assign(patch, { called_at: now, called_by: by.user_id, call_count: cur.call_count + 1, responded_at: null });
        break;
      case 'CONFIRM':
      case 'DECLINE':
        Object.assign(patch, { responded_at: now, resolved_at: now, resolved_by: by.user_id, resolved_via: dto.via });
        break;
      case 'CANCEL':
        Object.assign(patch, { resolved_at: now, resolved_by: by.user_id, resolved_via: dto.via });
        break;
      case 'REQUEUE':
        Object.assign(patch, { called_at: null, called_by: null }); // ตำแหน่งเดิมในคิว (submitted_at ไม่เปลี่ยน)
        break;
      case 'REOPEN':
        Object.assign(patch, { resolved_at: null, resolved_by: null, resolved_via: null, responded_at: null, called_at: null, called_by: null });
        break;
    }

    await this.repo.transaction(async (trx) => {
      const okUpdate = await this.repo.updateIfStatus(dto.id, rule.from, patch, trx);
      if (!okUpdate) throw conflict('มีคนเปลี่ยนสถานะคำขอนี้ไปก่อนแล้ว กรุณาโหลดหน้าใหม่');
      await this.repo.addEvent({ request_id: dto.id, event: rule.event, from_status: cur.status, to_status: rule.to, by_user_id: by.user_id, by_label: by.label, via: dto.via, detail: dto.note }, trx);
    });
    return { id: dto.id, status: rule.to };
  }

  /** โอนเคสให้ผู้ขออีกคนของโรงพยาบาลเดียวกัน (เช่น คนเดิมย้าย/ลาออก) */
  async transfer(id: number, requesterId: number, actor: Actor) {
    const cur = await this.repo.findById(id);
    if (!cur) throw notFound('ไม่พบคำขอนี้');
    if (cur.status !== 'WAITING' && cur.status !== 'CALLED') throw conflict('โอนได้เฉพาะคำขอที่ยังไม่จบ (รอคิว/เรียกแล้ว)');
    const to = await this.repo.requesterById(requesterId);
    if (!to || to.hospital_id !== cur.hospital_id) throw badRequest('โอนได้เฉพาะผู้ขอของโรงพยาบาลเดียวกัน', { requester_id: 'ผู้ขอไม่อยู่โรงพยาบาลเดียวกัน' });
    if (to.is_blocked) throw badRequest('ผู้ขอคนนี้ถูกระงับการใช้งาน', { requester_id: 'ถูกระงับ' });
    if (to.id === cur.requester_id) throw badRequest('เป็นผู้ขอคนเดิมอยู่แล้ว', { requester_id: 'เป็นคนเดิม' });
    await this.repo.transaction(async (trx) => {
      await this.repo.update(id, { requester_id: to.id, requester_name: to.full_name, requester_phone: to.phone, requester_phone2: to.phone2 }, trx);
      await this.repo.addEvent({ request_id: id, event: 'TRANSFERRED', by_user_id: actor.id, by_label: actor.full_name, via: 'ADMIN', detail: `โอนจาก ${cur.requester_name} ไป ${to.full_name}` }, trx);
    });
    return { id };
  }
}

const statusLabel = (s: Status) => ({ WAITING: 'รอคิว', CALLED: 'เรียกแล้ว', CONFIRMED: 'ยืนยันส่งตัว', DECLINED: 'ไม่ยืนยัน', CANCELLED: 'ยกเลิก' })[s];
