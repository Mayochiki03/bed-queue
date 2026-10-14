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
export type UiSettings = { confirm_timeout_hours: number; queue_display: 'both' | 'color' | 'all'; dashboard_default_days: number; dashboard_top_n: number; dashboard_widgets: string[] };

export const settingApi = {
  list: () => api.post<SettingItem[]>('/setting/list', {}),
  save: (values: Record<string, unknown>) => api.post<null>('/setting/save', { values }),
  ui: () => api.post<UiSettings>('/setting/ui', {}),
};
