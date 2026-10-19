/**
 * MemberRepository.ts — ชั้นที่คุยกับฐานข้อมูลของ "สมาชิก รพ." (ตาราง requester ที่ผู้ขอสมัครผ่าน LINE)
 */
import { db, nowIso, whereContains } from '../../core/db';
import { paginate, type PageResult, type Paging } from '../../core/http';

export type MemberRow = {
  id: number;
  full_name: string;
  display_name: string | null;
  phone: string;
  phone2: string | null;
  hospital_code: string;
  hospital_name: string;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decided_note: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
  is_blocked: boolean | number;
  created_at: string;
};

export class MemberRepository {
  /** ผู้ขอจริงเท่านั้น (ไม่รวมผู้ขอจำลอง MOCK-) · เรียงใหม่สุดก่อน (หน้าจอกรองเริ่มที่ "รออนุมัติ") */
  search(q: string, status: string, paging: Paging): Promise<PageResult<MemberRow>> {
    const base = db('requester as q').join('hospital as h', 'h.id', 'q.hospital_id').whereNotNull('q.line_user_id').whereNot('q.line_user_id', 'like', 'MOCK-%');
    if (status) base.where('q.approval_status', status);
    if (q) {
      base.where((w) => {
        whereContains(w, 'q.full_name', q);
        w.orWhere((o) => whereContains(o, 'h.name', q));
        w.orWhere((o) => whereContains(o, 'h.code', q));
        w.orWhere((o) => whereContains(o, 'q.phone', q));
      });
    }
    return paginate<MemberRow>(paging, base, (x) =>
      x
        .leftJoin('users as u', 'u.id', 'q.decided_by')
        .select('q.id', 'q.full_name', 'q.display_name', 'q.phone', 'q.phone2', 'h.code as hospital_code', 'h.name as hospital_name', 'q.approval_status', 'q.decided_note', 'q.decided_at', 'u.full_name as decided_by_name', 'q.is_blocked', 'q.created_at')
        .orderBy('q.created_at', 'desc')
        .orderBy('q.id', 'desc'),
    );
  }

  async pendingCount(): Promise<number> {
    const r = (await db('requester').where({ approval_status: 'PENDING' }).whereNot('line_user_id', 'like', 'MOCK-%').count({ n: '*' }).first()) as { n: number | string } | undefined;
    return Number(r?.n ?? 0);
  }

  findById(id: number): Promise<{ id: number; line_user_id: string | null; approval_status: string } | undefined> {
    return db('requester').where({ id }).select('id', 'line_user_id', 'approval_status').first();
  }

  async decide(id: number, status: 'APPROVED' | 'REJECTED', userId: number, note: string | null): Promise<void> {
    await db('requester').where({ id }).update({ approval_status: status, decided_by: userId, decided_at: nowIso(), decided_note: note, updated_at: nowIso() });
  }
}
