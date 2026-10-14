/** api/userApi.ts — API ผู้ใช้งาน + เปลี่ยนรหัสผ่านตัวเอง */
import { api, type PageResult } from './client';
import type { Role } from '../lib/session';

export type UserRow = { id: number; username: string; full_name: string; role: Role; is_active: boolean | number; created_at: string };
export type UserInput = { username: string; password: string; full_name: string; role: Role | ''; is_active: 'Y' | 'N' };

export const userApi = {
  search: (p: { q: string; role: string; pageNo: number; pageSize: number }) => api.post<PageResult<UserRow>>('/user/search', p),
  get: (id: number) => api.post<UserRow>('/user/get', { id }),
  add: (body: UserInput) => api.post<{ id: number }>('/user/add', body),
  update: (id: number, body: { full_name: string; role: Role | ''; is_active: 'Y' | 'N' }) => api.post<{ id: number }>('/user/update', { id, ...body }),
  remove: (id: number) => api.post<null>('/user/delete', { id }),
  resetPassword: (id: number, new_password: string) => api.post<null>('/user/reset-password', { id, new_password }),
  changeOwnPassword: (current_password: string, new_password: string) => api.post<null>('/auth/change-password', { current_password, new_password }),
};
