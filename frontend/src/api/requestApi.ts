/** api/requestApi.ts — API คิวคำขอเตียง (บอร์ดคิว / ประวัติ / เรียกคิว / บันทึกผล) */
import { api, type PageResult } from './client';

export type Status = 'WAITING' | 'CALLED' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED';
export const STATUS_LABEL: Record<Status, string> = { WAITING: 'รอคิว', CALLED: 'เรียกแล้ว', CONFIRMED: 'ยืนยันส่งตัว', DECLINED: 'ไม่ยืนยัน', CANCELLED: 'ยกเลิก' };
export const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as Status[]).map((v) => ({ value: v, label: STATUS_LABEL[v] }));

export type Action = 'CALL' | 'CONFIRM' | 'DECLINE' | 'CANCEL' | 'REQUEUE' | 'REOPEN';
export type Via = 'LINE' | 'PHONE' | 'ADMIN' | 'SYSTEM';

export type RequestBase = {
  id: number;
  request_no: string | null;
  requester_id: number | null;
  hospital_id: number;
  hospital_code: string;
  hospital_name: string;
  requester_name: string;
  requester_phone: string | null;
  requester_phone2: string | null;
  patient_name: string;
  patient_gender: string | null;
  patient_age: number | null;
  patient_province: string | null;
  patient_phone: string | null;
  color_code: string | null;
  substance_code: string | null;
  reason_code: string | null;
  note: string | null;
  status: Status;
  submitted_at: string;
  called_at: string | null;
  call_count: number;
  responded_at: string | null;
  resolved_at: string | null;
  resolved_via: string | null;
  source: string;
};

export type BoardItem = RequestBase & { position_all: number | null; position_color: number | null; wait_days: number; overdue: boolean; called_hours: number | null };
export type BoardData = { now: string; timeout_hours: number; items: BoardItem[] };

export type RequestEvent = { id: number; event: string; from_status: string | null; to_status: string | null; by_label: string | null; via: string | null; detail: string | null; created_at: string };
export type RequestDetail = RequestBase & {
  position_all: number | null;
  position_color: number | null;
  requester: { id: number; full_name: string; phone: string; phone2: string | null; has_line: boolean } | null;
  events: RequestEvent[];
};

export type RequesterOption = { id: number; full_name: string; phone: string; phone2: string | null; has_line: boolean; is_blocked: boolean };

/** ข้อมูลฟอร์มเพิ่ม/แก้ (ช่องว่างส่งเป็นข้อความว่าง ฝั่ง API แปลงเป็น "ไม่ระบุ") */
export type RequestInput = {
  hospital_id: string;
  requester_id: string;
  requester_name: string;
  requester_phone: string;
  requester_phone2: string;
  patient_name: string;
  patient_gender: string;
  patient_age: string;
  patient_province: string;
  patient_phone: string;
  color_code: string;
  substance_code: string;
  reason_code: string;
  note: string;
  /** datetime-local (เวลาท้องถิ่น) — เว้นว่าง = ตอนนี้ */
  submitted_at: string;
};

export type RequestSearchParams = { q: string; status: string; color_code: string; hospital_id: string; date_from: string; date_to: string; pageNo: number; pageSize: number };

const toBody = (v: RequestInput) => ({
  hospital_id: Number(v.hospital_id),
  requester_id: v.requester_id ? Number(v.requester_id) : null,
  requester_name: v.requester_name,
  requester_phone: v.requester_phone,
  requester_phone2: v.requester_phone2,
  patient_name: v.patient_name,
  patient_gender: v.patient_gender,
  patient_age: v.patient_age,
  patient_province: v.patient_province,
  patient_phone: v.patient_phone,
  color_code: v.color_code,
  substance_code: v.substance_code,
  reason_code: v.reason_code,
  note: v.note,
});

export const requestApi = {
  board: () => api.post<BoardData>('/request/board', {}),
  search: (p: RequestSearchParams) =>
    api.post<PageResult<RequestBase>>('/request/search', {
      q: p.q,
      statuses: p.status ? [p.status] : [],
      color_code: p.color_code,
      hospital_id: p.hospital_id ? Number(p.hospital_id) : undefined,
      date_from: p.date_from || undefined,
      date_to: p.date_to || undefined,
      pageNo: p.pageNo,
      pageSize: p.pageSize,
    }),
  get: (id: number) => api.post<RequestDetail>('/request/get', { id }),
  add: (v: RequestInput) => api.post<{ id: number }>('/request/add', { ...toBody(v), submitted_at: v.submitted_at ? new Date(v.submitted_at).toISOString() : null }),
  update: (id: number, v: RequestInput) => {
    const { requester_id: _r, ...rest } = toBody(v);
    void _r;
    return api.post<{ id: number }>('/request/update', { id, ...rest });
  },
  transition: (id: number, action: Action, opts: { via?: Via; note?: string } = {}) => api.post<{ id: number; status: Status }>('/request/transition', { id, action, ...opts }),
  transfer: (id: number, requester_id: number) => api.post<{ id: number }>('/request/transfer', { id, requester_id }),
  requesters: (hospital_id: number) => api.post<RequesterOption[]>('/request/requesters', { hospital_id }),
};
