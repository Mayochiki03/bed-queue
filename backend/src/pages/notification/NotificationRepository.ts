/** NotificationRepository.ts — อ่าน/เขียนตารางข้อความแจ้งเตือนและประวัติการส่ง (ไม่มีกติกาธุรกิจ) */
import { db, nowIso } from '../../core/db';
import { paginate, type Paging } from '../../core/http';
import type { LogRow, TemplateRow } from './Notification';

export class NotificationRepository {
  templates(): Promise<TemplateRow[]> {
    return db('notification_template').select('*').orderBy('type');
  }

  template(type: string): Promise<TemplateRow | undefined> {
    return db('notification_template').where({ type }).first();
  }

  async saveTemplate(type: string, d: { title: string; body: string; is_enabled: boolean }, userId: number | null) {
    await db('notification_template').where({ type }).update({ ...d, updated_at: nowIso(), updated_by: userId });
  }

  /** ข้อมูลที่ใช้เติมตัวแปรในข้อความ + LINE ของผู้รับ */
  async requestContext(requestId: number) {
    return db('bed_request as r')
      .leftJoin('hospital as h', 'h.id', 'r.hospital_id')
      .leftJoin('requester as q', 'q.id', 'r.requester_id')
      .leftJoin('lookup as c', function () {
        this.on('c.code', 'r.color_code').andOn('c.type', db.raw('?', ['COLOR']));
      })
      .leftJoin('lookup as rs', function () {
        this.on('rs.code', 'r.reason_code').andOn('rs.type', db.raw('?', ['REASON']));
      })
      .where('r.id', requestId)
      .first('r.id', 'r.request_no', 'r.requester_name', 'r.requester_id', 'h.name as hospital_name', 'q.line_user_id', 'c.label as color_name', 'rs.label as reason_name') as Promise<
      { id: number; request_no: string | null; requester_name: string; requester_id: number | null; hospital_name: string | null; line_user_id: string | null; color_name: string | null; reason_name: string | null } | undefined
    >;
  }

  requesterLine(requesterId: number): Promise<{ id: number; line_user_id: string | null } | undefined> {
    return db('requester').where({ id: requesterId }).first('id', 'line_user_id');
  }

  addLog(row: { request_id: number | null; requester_id: number | null; type: string; status: string; error_message: string | null }) {
    return db('notification_log').insert({ ...row, channel: 'PUSH', created_at: nowIso() });
  }

  /** จำนวนข้อความของเดือนนี้ แยกตามสถานะ (นับตั้งแต่ since = ต้นเดือนเวลาไทย) */
  async countsSince(since: string): Promise<Record<string, number>> {
    const rows = (await db('notification_log').where('created_at', '>=', since).groupBy('status').select('status').count({ n: '*' })) as { status: string; n: number | string }[];
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  }

  search(f: { status: string; type: string }, paging: Paging) {
    const base = db('notification_log as l').leftJoin('bed_request as r', 'r.id', 'l.request_id');
    if (f.status) base.where('l.status', f.status);
    if (f.type) base.where('l.type', f.type);
    return paginate<LogRow & { request_no: string | null }>(paging, base, (q) => q.select('l.*', 'r.request_no').orderBy('l.id', 'desc'));
  }
}
