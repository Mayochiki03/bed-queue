/** api/notificationApi.ts — ข้อความแจ้งเตือน LINE (ADMIN ขึ้นไป) */
import { api, type PageResult } from './client';

export type NotifyTemplate = { type: string; name: string; when: string; title: string; body: string; is_enabled: boolean; default_enabled: boolean };
export type TemplateVar = { key: string; label: string; sample: string };
export type NotifySummary = { sent: number; failed: number; skipped: number; quota: number; warn_pct: number; near_limit: boolean; mode: string; token_set: boolean; live: boolean };
export type NotifyLog = { id: number; request_id: number | null; request_no: string | null; type: string; status: 'SENT' | 'FAILED' | 'SKIPPED'; error_message: string | null; created_at: string };

export const notificationApi = {
  templates: () => api.post<{ templates: NotifyTemplate[]; vars: TemplateVar[] }>('/notification/templates', {}),
  save: (b: { type: string; title: string; body: string; is_enabled: boolean }) => api.post<null>('/notification/save', b),
  summary: () => api.post<NotifySummary>('/notification/summary', {}),
  logs: (p: { status: string; type: string; pageNo: number; pageSize: number }) => api.post<PageResult<NotifyLog>>('/notification/logs', p),
};
