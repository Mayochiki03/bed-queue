/** api/pubdashApi.ts — Dashboard ดูอย่างเดียวไม่ต้องล็อกอิน (เฉพาะเครือข่ายภายใน · ผู้ดูแลเปิดสวิตช์ก่อน) */
import { api } from './client';
import type { DashboardSummary, WidgetWithResult } from './dashboardApi';
import type { PeriodParams } from '../lib/period';

export type PubdashStatus = { enabled: boolean; app_name: string; confirm_timeout_hours: number; default_days: number };

export const pubdashApi = {
  status: () => api.post<PubdashStatus>('/pubdash/status', {}),
  data: (p: PeriodParams) => api.post<{ summary: DashboardSummary; widgets: WidgetWithResult[]; period_label: string }>('/pubdash/data', p),
};
