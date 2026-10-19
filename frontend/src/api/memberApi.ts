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
};

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = { PENDING: 'รออนุมัติ', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ไม่อนุมัติ' };

export const memberApi = {
  search: (p: { q: string; status: string; pageNo: number; pageSize: number }) => api.post<PageResult<MemberRow>>('/member/search', p),
  pendingCount: () => api.post<{ count: number }>('/member/pending-count', {}),
  approve: (id: number) => api.post<{ id: number }>('/member/approve', { id }),
  reject: (id: number, note: string) => api.post<{ id: number }>('/member/reject', { id, note }),
};
