/** api/hospitalApi.ts — API หน้าโรงพยาบาล (ส่งข้อมูลทุกอย่างใน body ไม่ใส่ id ใน URL) */
import { api, type PageResult } from './client';

export type Hospital = { id: number; code: string; name: string; health_region: number | null; is_active: boolean | number; created_at: string; updated_at: string };
/** health_region: ข้อความจากช่องเลือก ('' = ไม่ระบุ, '1'-'14') */
export type HospitalInput = { code: string; name: string; health_region: string; is_active: 'Y' | 'N' };
export type HospitalOption = { id: number; code: string; name: string; health_region: number | null };

export type ImportAction = 'NEW' | 'UPDATE' | 'SAME' | 'ERROR';
export type ImportRow = { row: number; code: string; name: string; health_region: number | null; is_active: boolean; action: ImportAction; message: string };
export type ImportPreview = { total: number; new_count: number; update_count: number; same_count: number; error_count: number; rows: ImportRow[]; truncated: boolean };
export type ImportResult = { total: number; created: number; updated: number; unchanged: number; skipped_errors: number };

export const hospitalApi = {
  search: (p: { q: string; pageNo: number; pageSize: number }) => api.post<PageResult<Hospital>>('/hospital/search', p),
  options: () => api.post<HospitalOption[]>('/hospital/options', {}),
  get: (id: number) => api.post<Hospital>('/hospital/get', { id }),
  add: (body: HospitalInput) => api.post<{ id: number }>('/hospital/add', body),
  update: (id: number, body: HospitalInput) => api.post<{ id: number }>('/hospital/update', { id, ...body }),
  remove: (id: number) => api.post<null>('/hospital/delete', { id }),
  /** ดาวน์โหลดไฟล์ Excel แม่แบบ (withData = ใส่รายชื่อที่มีอยู่แล้วมาด้วย เอาไปแก้แล้วนำเข้ากลับได้) */
  template: (withData: boolean) => api.download('/hospital/template', { with_data: withData }, withData ? 'รายชื่อโรงพยาบาล.xlsx' : 'แม่แบบนำเข้าโรงพยาบาล.xlsx'),
  importPreview: (filename: string, file_base64: string) => api.post<ImportPreview>('/hospital/import-preview', { filename, file_base64 }),
  importCommit: (filename: string, file_base64: string) => api.post<ImportResult>('/hospital/import-commit', { filename, file_base64 }),
};
