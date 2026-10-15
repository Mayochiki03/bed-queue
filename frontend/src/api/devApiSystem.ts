/** api/devApiSystem.ts — ข้อมูลระบบสำหรับหน้า "ระบบและเครื่องมือ" (DEV) */
import { api } from './client';

export type SystemInfo = {
  env: string;
  node: string;
  db_client: string;
  db_name: string;
  db_version: string;
  uptime_sec: number;
  mode: string;
  mfa_required_roles: string[];
  counts: { users: number; requesters: number; requests: number; hospitals: number; logs: number; notifications: number };
};

export const systemApi = { info: () => api.post<SystemInfo>('/dev/system', {}) };
