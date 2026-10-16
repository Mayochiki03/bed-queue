/** api/settingApi.ts — API ตั้งค่าระบบ */
import { api } from './client';

export type SettingType = 'STRING' | 'TEXT' | 'INT' | 'BOOL' | 'SECRET';
export type SettingItem = {
  key: string;
  label: string;
  category: string;
  type: SettingType;
  hint: string;
  options: { value: string; label: string }[] | null;
  min: number | null;
  max: number | null;
  value: string | number | boolean;
  is_set: boolean;
};
export type UiSettings = { confirm_timeout_hours: number; queue_display: 'all' | 'color'; dashboard_default_days: number; dashboard_top_n: number; pdpa_notice: string };

export type TestKind = 'database' | 'encryption' | 'time' | 'public_url' | 'line_token' | 'line_quota' | 'line_push' | 'line_webhook';
export type TestResult = { ok: boolean; title: string; detail: string };

export const settingApi = {
  test: (kind: TestKind, line_user_id?: string) => api.post<TestResult>('/setting/test', { kind, ...(line_user_id ? { line_user_id } : {}) }),
  list: (categories: string[] = []) => api.post<SettingItem[]>('/setting/list', { categories }),
  save: (values: Record<string, unknown>) => api.post<null>('/setting/save', { values }),
  ui: () => api.post<UiSettings>('/setting/ui', {}),
};
