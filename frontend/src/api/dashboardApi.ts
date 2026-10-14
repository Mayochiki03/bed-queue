/** api/dashboardApi.ts — API สรุปตัวเลข/กราฟของหน้าหลัก */
import { api } from './client';

export type DashboardSummary = {
  days: number;
  queue: { waiting: number; called: number; overdue: number; by_color: { code: string; count: number; oldest_days: number | null }[] };
  period: { submitted: number; confirmed: number; declined: number; cancelled: number; avg_days_to_confirm: number | null; min_days_to_confirm: number | null; max_days_to_confirm: number | null };
  trend: { date: string; submitted: number; confirmed: number }[];
  hospitals: { hospital_id: number; code: string; name: string; total: number; by_color: Record<string, number> }[];
  substances: { code: string; submitted: number; confirmed: number; avg_days: number | null; min_days: number | null; max_days: number | null }[];
};

export const dashboardApi = {
  summary: (days: number) => api.post<DashboardSummary>('/dashboard/summary', { days }),
};
