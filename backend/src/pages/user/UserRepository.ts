/**
 * UserRepository.ts — ชั้นที่คุยกับตาราง users (ไม่ select password_hash ออกมาเลย ยกเว้นที่จำเป็นต่อการแก้รหัส)
 */
import bcrypt from 'bcryptjs';
import { db, insertGetId, nowIso, orWhereContains, whereContains } from '../../core/db';
import { paginate, type PageResult, type Paging } from '../../core/http';
import type { User } from './User';

const COLS = ['id', 'username', 'full_name', 'role', 'is_active', 'created_at', 'updated_at'];

export class UserRepository {
  search(f: { q: string; role: string }, paging: Paging): Promise<PageResult<User>> {
    const base = db('users');
    if (f.q) base.where((w) => whereContains(w, 'username', f.q).orWhere((o) => orWhereContains(o, 'full_name', f.q)));
    if (f.role) base.where('role', f.role);
    return paginate<User>(paging, base, (q) => q.select(COLS).orderBy('id'));
  }

  findById(id: number): Promise<User | undefined> {
    return db('users').where({ id }).select(COLS).first();
  }

  findByUsername(username: string): Promise<User | undefined> {
    return db('users').where({ username }).select(COLS).first();
  }

  async insert(d: { username: string; password: string; full_name: string; role: string; is_active: 'Y' | 'N' }): Promise<number> {
    const now = nowIso();
    return insertGetId(db, 'users', {
      username: d.username,
      password_hash: await bcrypt.hash(d.password, 10),
      full_name: d.full_name,
      role: d.role,
      is_active: d.is_active === 'Y',
      created_at: now,
      updated_at: now,
    });
  }

  async update(id: number, d: { full_name: string; role: string; is_active: 'Y' | 'N' }): Promise<void> {
    await db('users').where({ id }).update({ full_name: d.full_name, role: d.role, is_active: d.is_active === 'Y', updated_at: nowIso() });
  }

  async setPassword(id: number, password: string): Promise<void> {
    await db('users').where({ id }).update({ password_hash: await bcrypt.hash(password, 10), updated_at: nowIso() });
  }

  async delete(id: number): Promise<void> {
    await db('users').where({ id }).delete();
  }
}
