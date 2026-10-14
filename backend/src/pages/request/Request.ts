/**
 * Request.ts — ชนิดข้อมูลและกติกาสถานะของ "คำขอเตียง"
 *
 * สถานะ: WAITING รอคิว → CALLED เรียกแล้ว (รอยืนยัน) → CONFIRMED ยืนยันส่งตัว / DECLINED ไม่ยืนยัน
 *        CANCELLED ยกเลิก (จากสถานะไหนก็ได้ที่ยังไม่จบ) · REQUEUE คืนคิว (CALLED → WAITING ลำดับเดิม) · REOPEN เปิดคิวใหม่ (DECLINED/CANCELLED → WAITING)
 * ลำดับคิว = เรียงตาม submitted_at (เวลาที่ส่งเข้ามา) — คืนคิว/เปิดใหม่ไม่เปลี่ยน submitted_at จึงได้ตำแหน่งเดิม
 */
export const STATUSES = ['WAITING', 'CALLED', 'CONFIRMED', 'DECLINED', 'CANCELLED'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  WAITING: 'รอคิว',
  CALLED: 'เรียกแล้ว',
  CONFIRMED: 'ยืนยันส่งตัว',
  DECLINED: 'ไม่ยืนยัน',
  CANCELLED: 'ยกเลิก',
};

export const ACTIONS = ['CALL', 'CONFIRM', 'DECLINE', 'CANCEL', 'REQUEUE', 'REOPEN'] as const;
export type Action = (typeof ACTIONS)[number];

export const VIAS = ['LINE', 'PHONE', 'ADMIN', 'SYSTEM'] as const;
export type Via = (typeof VIAS)[number];

/** action → สถานะต้นทางที่ทำได้ / สถานะปลายทาง / ชื่อเหตุการณ์ในประวัติ */
export const TRANSITIONS: Record<Action, { from: Status[]; to: Status; event: string; label: string }> = {
  CALL: { from: ['WAITING', 'CALLED'], to: 'CALLED', event: 'CALLED', label: 'เรียกคิว' },
  CONFIRM: { from: ['CALLED'], to: 'CONFIRMED', event: 'CONFIRMED', label: 'ยืนยันส่งตัว' },
  DECLINE: { from: ['CALLED'], to: 'DECLINED', event: 'DECLINED', label: 'ไม่ยืนยัน' },
  CANCEL: { from: ['WAITING', 'CALLED', 'CONFIRMED'], to: 'CANCELLED', event: 'CANCELLED', label: 'ยกเลิก' },
  REQUEUE: { from: ['CALLED'], to: 'WAITING', event: 'REQUEUED', label: 'คืนคิว' },
  REOPEN: { from: ['DECLINED', 'CANCELLED'], to: 'WAITING', event: 'REOPENED', label: 'เปิดคิวใหม่' },
};

export type BedRequest = {
  id: number;
  request_no: string | null;
  requester_id: number | null;
  hospital_id: number;
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
  called_by: number | null;
  call_count: number;
  responded_at: string | null;
  resolved_at: string | null;
  resolved_by: number | null;
  resolved_via: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export type Requester = {
  id: number;
  line_user_id: string | null;
  display_name: string | null;
  full_name: string;
  phone: string;
  phone2: string | null;
  hospital_id: number;
  pdpa_accepted_at: string | null;
  is_blocked: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RequestEvent = {
  id: number;
  request_id: number;
  event: string;
  from_status: string | null;
  to_status: string | null;
  by_user_id: number | null;
  by_label: string | null;
  via: string | null;
  detail: string | null;
  created_at: string;
};

/** แถวบนบอร์ดคิว — คำขอที่ยังเปิดอยู่ พร้อมลำดับและข้อมูลโรงพยาบาล */
export type BoardItem = BedRequest & {
  hospital_code: string;
  hospital_name: string;
  /** ลำดับในคิวรวมทุกสี / ในสีเดียวกัน (เฉพาะสถานะ WAITING) */
  position_all: number | null;
  position_color: number | null;
  /** รอมากี่วันนับจากส่งคำขอ */
  wait_days: number;
  /** เรียกแล้วเกินเวลา confirm_timeout_hours โดยยังไม่ตอบ */
  overdue: boolean;
  /** เรียกมาแล้วกี่ชั่วโมง (เฉพาะ CALLED) */
  called_hours: number | null;
};

export const requestNo = (id: number) => `BQ${String(id).padStart(6, '0')}`;
