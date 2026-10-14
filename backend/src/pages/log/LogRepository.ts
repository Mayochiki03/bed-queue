/** LogRepository.ts — ค้นบันทึกการใช้งานจากฐานข้อมูล (อ่านอย่างเดียว) */
import { db, orWhereContains, whereContains } from '../../core/db';
import { paginate, type Paging } from '../../core/http';
import type { Log } from './Log';

export class LogRepository {
  search(f: { q: string; page: string; action: string }, paging: Paging) {
    const base = db('audit_logs');
    if (f.q) base.where((w) => whereContains(w, 'username', f.q).orWhere((o) => orWhereContains(o, 'path', f.q)));
    if (f.page) base.where('page', f.page);
    if (f.action) base.where('action', f.action);
    return paginate<Log>(paging, base, (q) => q.select('*').orderBy('id', 'desc'));
  }
}
