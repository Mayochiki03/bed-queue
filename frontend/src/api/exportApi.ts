/** api/exportApi.ts — ส่งออก Excel ปุ่มเดียว เลือกชุดข้อมูลได้ (สรุป+กราฟ / รายการคำขอ / ประวัติเหตุการณ์ / ผู้ขอ / log) */
import { api } from './client';

export type ExportSection = 'summary' | 'widgets' | 'requests' | 'events' | 'requesters' | 'audit';
export type ExportOptions = { widgets: { id: number; title: string; chart: string; is_active: boolean }[]; can_audit: boolean; default_days: number };
export type ExportFilters = { q: string; statuses: string[]; color_code: string; hospital_id?: number; date_from?: string; date_to?: string };
export type ExportBody = { sections: ExportSection[]; days?: number; scope?: 'period' | 'all'; widget_ids?: number[]; filters?: ExportFilters };

export const exportApi = {
  options: () => api.post<ExportOptions>('/export/options', {}),
  build: (body: ExportBody) => api.download('/export/build', body, 'คิวขอเตียง.xlsx'),
};
