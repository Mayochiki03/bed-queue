/** api/memberApi.ts — API หน้าสมาชิก รพ. (อนุมัติผู้ที่ลงทะเบียนผ่าน LINE) */
import { api, type PageResult } from './client';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type MemberRow = {
  id: number;
  full_name: string;
  display_name: string | null;
  phone: string;
  phone2: string | null;
  hospital_code: string;
  hospital_name: string;
  approval_status: ApprovalStatus;
  decided_note: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
  is_blocked: boolean;
  created_at: string;
  /** เบอร์ใหม่ที่สมาชิกขอเปลี่ยน รอเจ้าหน้าที่อนุมัติ */
  pending_phone: string | null;
  pending_phone2: string | null;
  phone_change_at: string | null;
};
export type MemberUpdate = { id: number; full_name: string; hospital_code: string; hospital_name: string; phone: string; phone2: string };

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = { PENDING: 'รออนุมัติ', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ' };

export const memberApi = {
  search: (p: { q: string; status: string; pageNo: number; pageSize: number }) => api.post<PageResult<MemberRow>>('/member/search', p),
  pendingCount: () => api.post<{ count: number }>('/member/pending-count', {}),
  approve: (id: number) => api.post<{ id: number }>('/member/approve', { id }),
  approvePhone: (id: number) => api.post<{ id: number }>('/member/approve-phone', { id }),
  rejectPhone: (id: number) => api.post<{ id: number }>('/member/reject-phone', { id }),
  update: (v: MemberUpdate) => api.post<{ id: number }>('/member/update', v),
  reject: (id: number, note: string) => api.post<{ id: number }>('/member/reject', { id, note }),
};
