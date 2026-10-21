/**
 * MemberService.ts — กติกาธุรกิจของ "สมาชิก รพ.": เจ้าหน้าที่ตรวจและอนุมัติ/ไม่อนุมัติผู้ที่ลงทะเบียนผ่าน LINE
 *   - อนุมัติ/ไม่อนุมัติได้จากทุกสถานะ (แก้ใจภายหลังได้) · ผู้ขอจำลองของ dev จัดการที่หน้านี้ไม่ได้
 */
import { badRequest, notFound } from '../../core/http';
import { hospitalService } from '../hospital';
import type { MemberSearchDto, MemberUpdateDto } from './MemberDto';
import type { MemberRepository } from './MemberRepository';

export class MemberService {
  /** ต่อกับการแจ้งเตือน LINE (ผูกไว้ที่ pages/notification/index.ts) */
  readonly hooks: { approved?: (requesterId: number) => Promise<void>; rejected?: (requesterId: number, note: string) => Promise<void> } = {};

  constructor(private repo: MemberRepository) {}

  async search({ q, status, pageNo, pageSize }: MemberSearchDto) {
    const page = await this.repo.search(q, status, { pageNo, pageSize });
    return { ...page, resultList: page.resultList.map((m) => ({ ...m, is_blocked: !!m.is_blocked })) };
  }

  async pendingCount() {
    return { count: await this.repo.pendingCount() };
  }

  private async mustFind(id: number) {
    const m = await this.repo.findById(id);
    if (!m || !m.line_user_id || m.line_user_id.startsWith('MOCK-')) throw notFound('ไม่พบสมาชิกนี้');
    return m;
  }

  async approve(id: number, userId: number) {
    const m = await this.mustFind(id);
    await this.repo.decide(id, 'APPROVED', userId, null);
    if (m.approval_status !== 'APPROVED') await this.hooks.approved?.(id); // กดอนุมัติซ้ำไม่ส่งข้อความซ้ำ
    return { id };
  }

  async reject(id: number, note: string, userId: number) {
    const m = await this.mustFind(id);
    await this.repo.decide(id, 'REJECTED', userId, note || null);
    if (m.approval_status !== 'REJECTED') await this.hooks.rejected?.(id, note); // กดซ้ำไม่ส่งซ้ำ
    return { id };
  }

  private async withPendingPhone(id: number) {
    const m = await this.mustFind(id);
    if (!m.phone_change_at || !m.pending_phone) throw badRequest('สมาชิกนี้ไม่มีคำขอเปลี่ยนเบอร์ค้างอยู่');
    return m;
  }

  /** อนุมัติเบอร์ใหม่ → ใช้เบอร์ที่ขอแทนเบอร์เดิม */
  async approvePhone(id: number) {
    const m = await this.withPendingPhone(id);
    await this.repo.decidePhone(id, true, { phone: m.pending_phone, phone2: m.pending_phone2 });
    return { id };
  }

  /** ไม่อนุมัติเบอร์ใหม่ → คงเบอร์เดิม */
  async rejectPhone(id: number) {
    const m = await this.withPendingPhone(id);
    await this.repo.decidePhone(id, false, { phone: m.pending_phone, phone2: m.pending_phone2 });
    return { id };
  }

  /** เจ้าหน้าที่แก้ข้อมูลสมาชิกแทน (กรณีสมาชิกขอย้าย รพ./แก้ชื่อ — ตัวสมาชิกเองแก้ไม่ได้หลังอนุมัติ) · รพ. ต้องตรงรายชื่อกลาง */
  async update(dto: MemberUpdateDto) {
    await this.mustFind(dto.id);
    const hospitalId = await hospitalService.verify(dto.hospital_code, dto.hospital_name);
    await this.repo.updateProfile(dto.id, { full_name: dto.full_name, hospital_id: hospitalId, phone: dto.phone, phone2: dto.phone2 });
    return { id: dto.id };
  }
}
