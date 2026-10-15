/** LogRepository.ts — ค้นบันทึกการใช้งานจากฐานข้อมูล (อ่านอย่างเดียว) */
import { db, orWhereContains, whereContains } from '../../core/db';
import { paginate, type Paging } from '../../core/http';
import type { Log } from './Log';

export class LogRepository {
  search(f: { q: string; page: string; action: string; date_from?: string; date_to?: string }, paging: Paging) {
    const base = db('audit_logs');
    if (f.q) base.where((w) => whereContains(w, 'username', f.q).orWhere((o) => orWhereContains(o, 'path', f.q)));
    if (f.page) base.where('page', f.page);
    if (f.action) base.where('action', f.action);
    if (f.date_from) base.where('created_at', '>=', new Date(`${f.date_from}T00:00:00+07:00`).toISOString());
    if (f.date_to) base.where('created_at', '<', new Date(new Date(`${f.date_to}T00:00:00+07:00`).getTime() + 86_400_000).toISOString());
    return paginate<Log>(paging, base, (q) => q.select('*').orderBy('id', 'desc'));
  }
}
