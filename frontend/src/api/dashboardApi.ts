/** api/dashboardApi.ts — API Dashboard: คิวปัจจุบัน + widget (สร้าง/แก้/จัดวาง/ตัวอย่าง/ส่งออก Excel) */
import { api } from './client';
import type { ChartType, Group, Measure, Split, WidgetConfig } from '../lib/widgetRules';

export type DashboardSummary = {
  days: number;
  queue: { waiting: number; called: number; need_date: number; overdue: number; by_color: { code: string; count: number; oldest_days: number | null }[] };
  period: { submitted: number; confirmed: number; declined: number; cancelled: number; avg_days_to_confirm: number | null; min_days_to_confirm: number | null; max_days_to_confirm: number | null };
  trend: { date: string; submitted: number; confirmed: number }[];
  hospitals: { hospital_id: number; code: string; name: string; total: number; by_color: Record<string, number> }[];
  substances: { code: string; submitted: number; confirmed: number; avg_days: number | null; min_days: number | null; max_days: number | null }[];
};

export type WidgetColumn = { key: string; label: string; color: string | null };
export type WidgetRow = { key: string; label: string; color: string | null; values: (number | null)[]; total: number | null };
export type WidgetResult = { unit: 'ราย' | 'วัน'; days: number; column_mode: 'series' | 'split'; time_group: 'day' | 'week' | 'month' | null; columns: WidgetColumn[]; rows: WidgetRow[] };

export type WidgetRecord = WidgetConfig & { id: number; width: number; sort_order: number; is_active: boolean };
export type WidgetWithResult = WidgetRecord & { result: WidgetResult | null };
export type WidgetSaveInput = WidgetConfig & { id?: number; width: number; is_active: boolean };

export type { ChartType, Group, Measure, Split };

export const dashboardApi = {
  summary: (days: number) => api.post<DashboardSummary>('/dashboard/summary', { days }),
  widgets: (days: number | undefined, includeHidden: boolean) => api.post<{ days: number; widgets: WidgetWithResult[] }>('/dashboard/widget/data', { days, include_hidden: includeHidden }),
  preview: (config: WidgetConfig, days: number | undefined) => api.post<WidgetResult>('/dashboard/widget/preview', { config, days }),
  save: (w: WidgetSaveInput) => api.post<{ id: number }>('/dashboard/widget/save', w),
  remove: (id: number) => api.post<null>('/dashboard/widget/delete', { id }),
  layout: (items: { id: number; sort_order: number; width: number; is_active: boolean }[]) => api.post<null>('/dashboard/widget/layout', { items }),
};
