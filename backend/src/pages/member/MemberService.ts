/**
 * MemberService.ts — กติกาธุรกิจของ "สมาชิก รพ.": เจ้าหน้าที่ตรวจและอนุมัติ/ไม่อนุมัติผู้ที่ลงทะเบียนผ่าน LINE
 *   - อนุมัติ/ไม่อนุมัติได้จากทุกสถานะ (แก้ใจภายหลังได้) · ผู้ขอจำลองของ dev จัดการที่หน้านี้ไม่ได้
 */
import { notFound } from '../../core/http';
import type { MemberSearchDto } from './MemberDto';
import type { MemberRepository } from './MemberRepository';

export class MemberService {
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
    await this.mustFind(id);
    await this.repo.decide(id, 'APPROVED', userId, null);
    return { id };
  }

  async reject(id: number, note: string, userId: number) {
    await this.mustFind(id);
    await this.repo.decide(id, 'REJECTED', userId, note || null);
    return { id };
  }
}
