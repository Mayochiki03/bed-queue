/**
 * RequesterService.ts — งานฝั่ง "ผู้ขอ" (เจ้าหน้าที่ รพ.อื่น): ลงทะเบียน/แก้โปรไฟล์ · ส่งคำขอ · ดูคำขอของตัวเอง + ลำดับคิว · ยกเลิก · ตอบรับ/ปฏิเสธเมื่อถูกเรียก
 *
 * ตัวตนผู้ขอ = line_user_id ที่ "ตรวจสอบแล้ว" โดยชั้นนอก (LINE LIFF ในรอบถัดไป / หน้าทดลองของ dev ที่ล็อกอินเป็น DEV)
 * Service นี้ไม่ตรวจตัวตนเอง — ผู้เรียกต้องส่ง Requester ที่ยืนยันแล้วเข้ามาเสมอ
 * (ผู้ขอที่ถูกระงับ is_blocked ทำอะไรไม่ได้)
 */
import { badRequest, forbidden, notFound } from '../../core/http';
import { getSetting } from '../../core/settings';
import { hospitalService } from '../hospital';
import type { BedRequest, Requester } from './Request';
import type { RequesterProfileDto, SubmitDto } from './RequestDto';
import type { RequestRepository } from './RequestRepository';
import type { RequestService } from './RequestService';

export type RequesterView = {
  id: number;
  full_name: string;
  phone: string;
  phone2: string | null;
  hospital_id: number;
  hospital_code: string;
  hospital_name: string;
  pdpa_accepted_at: string | null;
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
    return { id: r.id, full_name: r.full_name, phone: r.phone, phone2: r.phone2, hospital_id: r.hospital_id, hospital_code: h?.code ?? '', hospital_name: h?.name ?? '', pdpa_accepted_at: r.pdpa_accepted_at };
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

  /** ลงทะเบียนครั้งแรก หรือแก้ไขโปรไฟล์ (ลงทะเบียนครั้งเดียว แก้ภายหลังได้) */
  async saveProfile(lineUserId: string, displayName: string | null, dto: RequesterProfileDto): Promise<RequesterView> {
    const cur = await this.repo.requesterByLine(lineUserId);
    if (cur) this.assertNotBlocked(cur);
    if (!cur && !dto.accept_pdpa) throw badRequest('กรุณารับทราบเรื่องข้อมูลส่วนบุคคลก่อนลงทะเบียน', { accept_pdpa: 'ต้องรับทราบก่อน' });

    // โรงพยาบาลเลือกจากรหัส 5 หลัก — หลายคนใน รพ. เดียวกันใช้แถวเดียวกัน (มีอยู่แล้วใช้ชื่อเดิมของระบบ)
    const hospitalId = await hospitalService.findOrCreate(dto.hospital_code, dto.hospital_name);
    const fields = { full_name: dto.full_name, phone: dto.phone, phone2: dto.phone2, hospital_id: hospitalId, display_name: displayName, last_seen_at: new Date().toISOString() };
    if (cur) {
      await this.repo.updateRequester(cur.id, { ...fields, ...(cur.pdpa_accepted_at || !dto.accept_pdpa ? {} : { pdpa_accepted_at: new Date().toISOString() }) });
      return this.view((await this.repo.requesterById(cur.id))!);
    }
    const id = await this.repo.insertRequester({ line_user_id: lineUserId, display_name: displayName, full_name: dto.full_name, phone: dto.phone, phone2: dto.phone2, hospital_id: hospitalId, pdpa_accepted_at: new Date().toISOString() });
    return this.view((await this.repo.requesterById(id))!);
  }

  private async mustBe(lineUserId: string): Promise<Requester> {
    const r = await this.repo.requesterByLine(lineUserId);
    if (!r) throw badRequest('ยังไม่ได้ลงทะเบียน กรุณากรอกข้อมูลผู้ขอก่อน');
    this.assertNotBlocked(r);
    if (!r.pdpa_accepted_at) throw forbidden('กรุณารับทราบนโยบายข้อมูลส่วนบุคคลก่อนใช้งาน');
    return r;
  }

  /** ส่งคำขอ (ผู้ป่วย 1 ราย) — ผู้ขอ 1 คนส่งได้หลายราย */
  async submit(lineUserId: string, dto: SubmitDto, note: { by_user_id?: number | null; detail?: string } = {}) {
    const r = await this.mustBe(lineUserId);
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

  /** คำขอของผู้ขอคนนี้ พร้อมลำดับคิว (ตามตั้งค่า queue_display) */
  async mine(lineUserId: string): Promise<MyRequestView[]> {
    const r = await this.mustBe(lineUserId);
    const [rows, display] = await Promise.all([this.repo.byRequester(r.id), getSetting('queue_display')]);
    const pos = await this.requests.positionsOf(rows.filter((x) => x.status === 'WAITING').map((x) => x.id));
    return rows.map((x) => {
      const p = pos.get(x.id);
      return { ...x, position_all: p && display !== 'color' ? p.all : null, position_color: p && display === 'color' ? p.color : null };
    });
  }

  private async ownRequest(lineUserId: string, id: number) {
    const r = await this.mustBe(lineUserId);
    const row = await this.repo.findById(id);
    if (!row || row.requester_id !== r.id) throw notFound('ไม่พบคำขอนี้');
    return { r, row };
  }

  async cancel(lineUserId: string, id: number) {
    const { r } = await this.ownRequest(lineUserId, id);
    return this.requests.transition({ id, action: 'CANCEL', via: 'LINE', note: 'ผู้ขอยกเลิกเอง' }, { user_id: null, label: r.full_name });
  }

  /** ผู้ขอตอบ "ยืนยัน/ไม่ยืนยัน" หลังถูกเรียกคิว (กดจากการ์ดใน LINE) */
  async respond(lineUserId: string, id: number, accept: boolean) {
    const { r } = await this.ownRequest(lineUserId, id);
    return this.requests.transition({ id, action: accept ? 'CONFIRM' : 'DECLINE', via: 'LINE', }, { user_id: null, label: r.full_name });
  }
}
