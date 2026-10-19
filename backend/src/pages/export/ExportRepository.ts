/** ExportRepository.ts — ดึงข้อมูลดิบสำหรับส่งออก Excel (อ่านอย่างเดียว) — ใช้เงื่อนไขกรองเดียวกับหน้าประวัติคำขอ */
import type { Knex } from 'knex';
import { db } from '../../core/db';
import { OPEN_STATUSES } from '../request/Request';
import { applyRequestFilters, type RequestFilters } from '../request/RequestRepository';

const MAX_ROWS = 100_000;

export type ExportScope = { filters?: RequestFilters; sinceIso?: string; untilIso?: string };

const emptyFilters: RequestFilters = { q: '', statuses: [], color_code: '', hospital_id: undefined, date_from: undefined, date_to: undefined };

function scoped(base: Knex.QueryBuilder, s: ExportScope) {
  applyRequestFilters(base, s.filters ?? emptyFilters);
  if (s.sinceIso) base.where('r.submitted_at', '>=', s.sinceIso);
  if (s.untilIso) base.where('r.submitted_at', '<', s.untilIso);
  return base;
}

export type RequestExportRow = {
  id: number;
  request_no: string | null;
  status: string;
  patient_name: string;
  patient_gender: string | null;
  patient_age: number | null;
  patient_province: string | null;
  patient_phone: string | null;
  color_code: string | null;
  substance_code: string | null;
  reason_code: string | null;
  note: string | null;
  hospital_code: string;
  hospital_name: string;
  requester_name: string;
  requester_phone: string | null;
  requester_phone2: string | null;
  source: string;
  submitted_at: string;
  called_at: string | null;
  bed_date: string | null;
  call_count: number;
  responded_at: string | null;
  resolved_at: string | null;
  resolved_via: string | null;
  called_by_name: string | null;
  resolved_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type EventExportRow = {
  request_no: string | null;
  patient_name: string;
  hospital_name: string;
  event: string;
  from_status: string | null;
  to_status: string | null;
  by_label: string | null;
  via: string | null;
  detail: string | null;
  changes: string | null;
  created_at: string;
};

export class ExportRepository {
  requests(s: ExportScope): Promise<RequestExportRow[]> {
    const base = db('bed_request as r').join('hospital as h', 'h.id', 'r.hospital_id').leftJoin('users as uc', 'uc.id', 'r.called_by').leftJoin('users as ur', 'ur.id', 'r.resolved_by');
    scoped(base, s);
    return base
      .select('r.*', 'h.code as hospital_code', 'h.name as hospital_name', 'uc.full_name as called_by_name', 'ur.full_name as resolved_by_name')
      .orderBy('r.submitted_at', 'desc')
      .orderBy('r.id', 'desc')
      .limit(MAX_ROWS);
  }

  events(s: ExportScope): Promise<EventExportRow[]> {
    const base = db('request_event as e').join('bed_request as r', 'r.id', 'e.request_id').join('hospital as h', 'h.id', 'r.hospital_id');
    scoped(base, s);
    return base
      .select('r.request_no', 'r.patient_name', 'h.name as hospital_name', 'e.event', 'e.from_status', 'e.to_status', 'e.by_label', 'e.via', 'e.detail', 'e.changes', 'e.created_at')
      .orderBy('r.submitted_at', 'desc')
      .orderBy('r.id', 'desc')
      .orderBy('e.id')
      .limit(MAX_ROWS);
  }

  /** จำนวนครั้งที่แก้ไขของแต่ละคำขอ */
  async editCounts(): Promise<Map<number, number>> {
    const rows = (await db('request_event').where({ event: 'EDITED' }).groupBy('request_id').select('request_id').count({ n: '*' })) as unknown as { request_id: number; n: number | string }[];
    return new Map(rows.map((r) => [r.request_id, Number(r.n)]));
  }

  /** หมายเหตุตอนปิดเคส (ยืนยัน/ไม่ยืนยัน/ยกเลิก) ล่าสุดของแต่ละคำขอ */
  async closingNotes(): Promise<Map<number, string>> {
    const rows = (await db('request_event').whereIn('event', ['CONFIRMED', 'DECLINED', 'CANCELLED']).whereNotNull('detail').orderBy('id').select('request_id', 'detail')) as { request_id: number; detail: string }[];
    return new Map(rows.map((r) => [r.request_id, r.detail]));
  }

  async requesters() {
    const rows = await db('requester as q')
      .join('hospital as h', 'h.id', 'q.hospital_id')
      .select('q.*', 'h.code as hospital_code', 'h.name as hospital_name')
      .orderBy('h.name')
      .orderBy('q.full_name')
      .limit(MAX_ROWS);
    const counts = (await db('bed_request').groupBy('requester_id').select('requester_id').count({ n: '*' })) as unknown as { requester_id: number | null; n: number | string }[];
    const open = (await db('bed_request').whereIn('status', OPEN_STATUSES).groupBy('requester_id').select('requester_id').count({ n: '*' })) as unknown as { requester_id: number | null; n: number | string }[];
    return {
      rows: rows as {
        id: number;
        line_user_id: string | null;
        display_name: string | null;
        full_name: string;
        phone: string;
        phone2: string | null;
        hospital_code: string;
        hospital_name: string;
        pdpa_accepted_at: string | null;
        is_blocked: number | boolean;
        last_seen_at: string | null;
        created_at: string;
      }[],
      total: new Map(counts.map((c) => [c.requester_id ?? -1, Number(c.n)])),
      open: new Map(open.map((c) => [c.requester_id ?? -1, Number(c.n)])),
    };
  }

  audit(sinceIso: string | undefined, untilIso?: string) {
    const q = db('audit_logs').orderBy('id', 'desc').limit(MAX_ROWS);
    if (sinceIso) q.where('created_at', '>=', sinceIso);
    if (untilIso) q.where('created_at', '<', untilIso);
    return q.select('created_at', 'username', 'page', 'action', 'status_code', 'path', 'ip', 'detail') as Promise<
      { created_at: string; username: string | null; page: string; action: string; status_code: number; path: string; ip: string | null; detail: string | null }[]
    >;
  }

  lookups(): Promise<{ type: string; code: string; label: string; color: string | null }[]> {
    return db('lookup').orderBy('sort_order').orderBy('id').select('type', 'code', 'label', 'color');
  }
}
