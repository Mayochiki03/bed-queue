/** api/logApi.ts — เรียก API หน้า log (อ่านอย่างเดียว) */
import { api, type PageResult } from './client';

export type LogRow = { id: number; username: string | null; page: string; action: string; path: string; status_code: number; ip: string | null; created_at: string };
export type LogSearch = { q: string; page: string; action: string; pageNo: number; pageSize: number };

export const logApi = {
  search: (p: LogSearch) => api.post<PageResult<LogRow>>('/log/search', p),
};
