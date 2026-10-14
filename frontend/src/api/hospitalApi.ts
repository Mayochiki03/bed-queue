/** api/hospitalApi.ts — API หน้าโรงพยาบาล (ส่งข้อมูลทุกอย่างใน body ไม่ใส่ id ใน URL) */
import { api, type PageResult } from './client';

export type Hospital = { id: number; code: string; name: string; is_active: boolean | number; created_at: string; updated_at: string };
export type HospitalInput = { code: string; name: string; is_active: 'Y' | 'N' };
export type HospitalOption = { id: number; code: string; name: string };

export const hospitalApi = {
  search: (p: { q: string; pageNo: number; pageSize: number }) => api.post<PageResult<Hospital>>('/hospital/search', p),
  options: () => api.post<HospitalOption[]>('/hospital/options', {}),
  get: (id: number) => api.post<Hospital>('/hospital/get', { id }),
  add: (body: HospitalInput) => api.post<{ id: number }>('/hospital/add', body),
  update: (id: number, body: HospitalInput) => api.post<{ id: number }>('/hospital/update', { id, ...body }),
  remove: (id: number) => api.post<null>('/hospital/delete', { id }),
};
