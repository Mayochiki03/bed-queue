/**
 * RequesterService.ts — งานฝั่ง "ผู้ขอ" (เจ้าหน้าที่ รพ.อื่น): ลงทะเบียน/แก้โปรไฟล์ · ส่งคำขอ · ดูคำขอของตัวเอง + ลำดับคิว · ยกเลิก · ตอบรับ/ปฏิเสธเมื่อถูกเรียก
 *
 * ตัวตนผู้ขอ = line_user_id ที่ "ตรวจสอบแล้ว" โดยชั้นนอก (LINE LIFF ในรอบถัดไป / หน้าทดลองของ dev ที่ล็อกอินเป็น DEV)
 * Service นี้ไม่ตรวจตัวตนเอง — ผู้เรียกต้องส่ง Requester ที่ยืนยันแล้วเข้ามาเสมอ
 * (ผู้ขอที่ถูกระงับ is_blocked ทำอะไรไม่ได้)
 *
 * ลงทะเบียน: ต้องกรอกรหัส+ชื่อ รพ. ตรงกับรายชื่อกลาง (HospitalService.verify) แล้วสถานะเป็น PENDING รอเจ้าหน้าที่อนุมัติ
 * ก่อนอนุมัติ: ดูโปรไฟล์ตัวเองได้ แต่ส่ง/ดู/ยกเลิก/ตอบคำขอไม่ได้ · แก้ได้ทุกช่อง (เปลี่ยน รพ. = รออนุมัติใหม่)
 * หลังอนุมัติ: ชื่อ-สกุล/รพ. ล็อก (เจ้าหน้าที่แก้ให้ที่หน้าสมาชิก) · เบอร์ใหม่ต้องส่งเป็นคำขอ รอเจ้าหน้าที่อนุมัติ
 * เจ้าหน้าที่ รพ. เดียวกัน (อนุมัติแล้ว) เห็นและจัดการคำขอของ รพ. ร่วมกันทั้งหมด
 */
import { badRequest, forbidden, notFound } from '../../core/http';
import { getSetting } from '../../core/settings';
import { hospitalService } from '../hospital';
import type { BedRequest, Requester } from './Request';
import type { RequesterProfileDto, SubmitDto } from './RequestDto';
import type { RequestRepository } from './RequestRepository';
import { RequestService } from './RequestService';

export type RequesterView = {
  id: number;
  full_name: string;
  phone: string;
  phone2: string | null;
  hospital_id: number;
  hospital_code: string;
  hospital_name: string;
  pdpa_accepted_at: string | null;
  /** PENDING รออนุมัติ · APPROVED ใช้งานได้ · REJECTED ไม่อนุมัติ */
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decided_note: string | null;
  /** true = อนุมัติแล้ว → ชื่อ-สกุลและ รพ. แก้เองไม่ได้ (ต้องติดต่อเจ้าหน้าที่) */
  locked: boolean;
  /** เบอร์ใหม่ที่ขอเปลี่ยน รออนุมัติ */
  pending_phone: string | null;
  pending_phone2: string | null;
};

export type MyRequestView = BedRequest & {
  /** ตำแหน่งในคิว — แสดงทีละแบบตามตั้งค่า queue_display: all = รวมทุกสี (ค่าเริ่มต้น) · color = เฉพาะสีเดียวกัน (อีกแบบเป็น null) */
  position_all: number | null;
  position_color: number | null;
};

export class RequesterService {
  constructor(
    private repo: RequestRepository,
    private requests: RequestService,
  ) {}

  private async view(r: Requester): Promise<RequesterView> {
    const h = await this.repo.hospital(r.hospital_id);
    return { id: r.id, full_name: r.full_name, phone: r.phone, phone2: r.phone2, hospital_id: r.hospital_id, hospital_code: h?.code ?? '', hospital_name: h?.name ?? '', pdpa_accepted_at: r.pdpa_accepted_at, approval_status: r.approval_status, decided_note: r.decided_note, locked: r.approval_status === 'APPROVED', pending_phone: r.phone_change_at ? r.pending_phone : null, pending_phone2: r.phone_change_at ? r.pending_phone2 : null };
  }

  /** โปรไฟล์ของ line_user_id นี้ (null = ยังไม่ลงทะเบียน) */
  async profile(lineUserId: string): Promise<RequesterView | null> {
    const r = await this.repo.requesterByLine(lineUserId);
    if (!r) return null;
    this.assertNotBlocked(r);
    return this.view(r);
  }

  private assertNotBlocked(r: Requester) {
    if (r.is_blocked) throw forbidden('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อเจ้าหน้าที่');
  }

  /**
   * ลงทะเบียนครั้งแรก หรือแก้ไขโปรไฟล์
   * mock = true เฉพาะผู้ขอจำลองของ dev: ไม่ตรวจกับรายชื่อ (สร้าง รพ. ให้) และอนุมัติทันที — ผู้ขอจริงผ่าน LINE ต้อง verify + รออนุมัติเสมอ
   */
  async saveProfile(lineUserId: string, displayName: string | null, dto: RequesterProfileDto, opts: { mock?: boolean } = {}): Promise<RequesterView> {
    const cur = await this.repo.requesterByLine(lineUserId);
    if (cur) this.assertNotBlocked(cur);

    // อนุมัติแล้ว: ชื่อ-สกุลและ รพ. ล็อก (ตรวจที่นี่ ไม่ใช่แค่ซ่อนในหน้าจอ) · เบอร์ใหม่ = ส่งเป็นคำขอให้เจ้าหน้าที่อนุมัติ
    // ตรวจก่อนเรียก hospitalService.verify เพื่อไม่ให้ความพยายามย้าย รพ. ไปเปลืองการค้นฐานข้อมูล
    if (cur && cur.approval_status === 'APPROVED' && !opts.mock) {
      const h = await this.repo.hospital(cur.hospital_id);
      const errs: Record<string, string> = {};
      if (dto.hospital_code !== (h?.code ?? '') || dto.hospital_name.replace(/\s+/g, '') !== (h?.name ?? '').replace(/\s+/g, '')) errs.hospital_code = 'แก้โรงพยาบาลเองไม่ได้ กรุณาติดต่อเจ้าหน้าที่';
      if (dto.full_name.replace(/\s+/g, '') !== cur.full_name.replace(/\s+/g, '')) errs.full_name = 'แก้ชื่อ-สกุลเองไม่ได้ กรุณาติดต่อเจ้าหน้าที่';
      if (Object.keys(errs).length) throw badRequest('ข้อมูลชื่อ-สกุลและโรงพยาบาลแก้เองไม่ได้ กรุณาติดต่อเจ้าหน้าที่', errs);
      // เบอร์สำรองที่ยังว่างอยู่ เติมได้เลย (ไม่มีของเดิมให้เสียหาย) · เบอร์ที่มีค่าอยู่แล้วต้องส่งคำขอเปลี่ยน
      const fillPhone2 = !cur.phone2 && !!dto.phone2;
      const same = dto.phone === cur.phone && (fillPhone2 || (dto.phone2 ?? null) === (cur.phone2 ?? null));
      await this.repo.updateRequester(cur.id, {
        display_name: displayName,
        last_seen_at: new Date().toISOString(),
        ...(fillPhone2 ? { phone2: dto.phone2 } : {}),
        ...(same ? { pending_phone: null, pending_phone2: null, phone_change_at: null } : { pending_phone: dto.phone, pending_phone2: dto.phone2, phone_change_at: new Date().toISOString() }),
      });
      return this.view((await this.repo.requesterById(cur.id))!);
    }
    if (!cur && !dto.accept_pdpa) throw badRequest('กรุณารับทราบเรื่องข้อมูลส่วนบุคคลก่อนลงทะเบียน', { accept_pdpa: 'ต้องรับทราบก่อน' });

    const hospitalId = opts.mock ? await hospitalService.findOrCreate(dto.hospital_code, dto.hospital_name) : await hospitalService.verify(dto.hospital_code, dto.hospital_name);
    const fields = { full_name: dto.full_name, phone: dto.phone, phone2: dto.phone2, hospital_id: hospitalId, display_name: displayName, last_seen_at: new Date().toISOString() };
    if (cur) {
      // เปลี่ยนโรงพยาบาล = ต้องให้เจ้าหน้าที่อนุมัติใหม่ (กันย้ายไปดูคำขอของ รพ. อื่นเอง)
      const moved = hospitalId !== cur.hospital_id && !opts.mock;
      await this.repo.updateRequester(cur.id, {
        ...fields,
        pending_phone: null,
        pending_phone2: null,
        phone_change_at: null,
        ...(cur.pdpa_accepted_at || !dto.accept_pdpa ? {} : { pdpa_accepted_at: new Date().toISOString() }),
        ...(moved ? { approval_status: 'PENDING', decided_by: null, decided_at: null, decided_note: null } : {}),
      });
      return this.view((await this.repo.requesterById(cur.id))!);
    }
    const id = await this.repo.insertRequester({
      line_user_id: lineUserId,
      display_name: displayName,
      full_name: dto.full_name,
      phone: dto.phone,
      phone2: dto.phone2,
      hospital_id: hospitalId,
      pdpa_accepted_at: new Date().toISOString(),
      approval_status: opts.mock ? 'APPROVED' : 'PENDING',
    });
    return this.view((await this.repo.requesterById(id))!);
  }

  /** ค้นชื่อ รพ. จากรหัส (หน้าลงทะเบียนเรียกเพื่อเติมชื่อให้) */
  hospitalCheck(code: string) {
    return hospitalService.lookupByCode(code);
  }

  private async mustBe(lineUserId: string): Promise<Requester> {
    const r = await this.repo.requesterByLine(lineUserId);
    if (!r) throw badRequest('ยังไม่ได้ลงทะเบียน กรุณากรอกข้อมูลผู้ขอก่อน');
    this.assertNotBlocked(r);
    if (r.approval_status === 'PENDING') throw forbidden('บัญชีของคุณรอเจ้าหน้าที่อนุมัติ — เมื่ออนุมัติแล้วจะใช้งานได้ทันที');
    if (r.approval_status === 'REJECTED') throw forbidden(`บัญชีของคุณไม่ได้รับการอนุมัติ${r.decided_note ? ` (${r.decided_note})` : ''} — กรุณาติดต่อเจ้าหน้าที่`);
    if (!r.pdpa_accepted_at) throw forbidden('กรุณารับทราบนโยบายข้อมูลส่วนบุคคลก่อนใช้งาน');
    return r;
  }

  /** ส่งคำขอ (ผู้ป่วย 1 ราย) — ผู้ขอ 1 คนส่งได้หลายราย */
  async submit(lineUserId: string, input: SubmitDto, note: { by_user_id?: number | null; detail?: string } = {}) {
    const r = await this.mustBe(lineUserId);
    const dto = RequestService.normalizeOther(input, true);
    for (const [field, type, label] of [
      ['color_code', 'COLOR', 'สี'],
      ['substance_code', 'SUBSTANCE', 'ประเภทสารเสพติด'],
      ['reason_code', 'REASON', 'เหตุผลการส่งต่อ'],
    ] as const) {
      const code = dto[field];
      if (code && !(await this.repo.lookupActive(type, code))) throw badRequest(`${label}ไม่ถูกต้อง`, { [field]: `เลือก${label}ที่มีในระบบ` });
    }
    await this.requests.assertNoDuplicate(r.hospital_id, dto.patient_name);
    const id = await this.repo.transaction(async (trx) => {
      const newId = await this.repo.insert(
        {
          requester_id: r.id,
          hospital_id: r.hospital_id,
          requester_name: r.full_name,
          requester_phone: r.phone,
          requester_phone2: r.phone2,
          patient_name: dto.patient_name,
          patient_gender: dto.patient_gender,
          patient_age: dto.patient_age,
          patient_province: dto.patient_province,
          patient_phone: dto.patient_phone,
          color_code: dto.color_code,
          substance_code: dto.substance_code,
          reason_code: dto.reason_code,
          substance_other: dto.substance_other,
          reason_other: dto.reason_other,
          note: dto.note,
          status: 'WAITING',
          submitted_at: new Date().toISOString(),
          source: 'APP',
        },
        trx,
      );
      await this.repo.addEvent({ request_id: newId, event: 'SUBMITTED', to_status: 'WAITING', by_user_id: note.by_user_id ?? null, by_label: r.full_name, via: 'LINE', detail: note.detail ?? null }, trx);
      return newId;
    });
    await this.requests.hooks.notify?.('SUBMITTED', id);
    return { id, request_no: `BQ${String(id).padStart(6, '0')}` };
  }

  /** คำขอของโรงพยาบาลของผู้ขอคนนี้ (ทุกคนใน รพ. เดียวกันเห็นร่วมกัน) พร้อมลำดับคิว (ตามตั้งค่า queue_display) */
  async mine(lineUserId: string): Promise<MyRequestView[]> {
    const r = await this.mustBe(lineUserId);
    const [rows, display] = await Promise.all([this.repo.byHospital(r.hospital_id), getSetting('queue_display')]);
    const pos = await this.requests.positionsOf(rows.filter((x) => x.status === 'WAITING').map((x) => x.id));
    return rows.map((x) => {
      const p = pos.get(x.id);
      return { ...x, position_all: p && display !== 'color' ? p.all : null, position_color: p && display === 'color' ? p.color : null };
    });
  }

  private async ownRequest(lineUserId: string, id: number) {
    const r = await this.mustBe(lineUserId);
    const row = await this.repo.findById(id);
    if (!row || row.hospital_id !== r.hospital_id) throw notFound('ไม่พบคำขอนี้'); // เจ้าหน้าที่ รพ. เดียวกันจัดการแทนกันได้
    return { r, row };
  }

  async cancel(lineUserId: string, id: number) {
    const { r } = await this.ownRequest(lineUserId, id);
    return this.requests.transition({ id, action: 'CANCEL', via: 'LINE', note: 'ผู้ขอยกเลิกเอง' }, { user_id: null, label: r.full_name });
  }

  /** ผู้ขอตอบหลังถูกเรียกคิว (กดจากการ์ดใน LINE หรือหน้าผู้ขอ): CONFIRM ยืนยัน · DEFER ยืนยันจะส่งแต่วันที่แจ้งไม่สะดวก · DECLINE ไม่ยืนยัน */
  async respond(lineUserId: string, id: number, answer: 'CONFIRM' | 'DEFER' | 'DECLINE') {
    const { r } = await this.ownRequest(lineUserId, id);
    return this.requests.transition({ id, action: answer, via: 'LINE' }, { user_id: null, label: r.full_name });
  }
}
