/** api/devApi.ts — เมนูนักพัฒนา: ผู้ขอจำลอง (ทดลองฝั่งผู้ใช้โดยยังไม่ต่อ LINE) */
import { api } from './client';
import type { RequestBase } from './requestApi';

export type MockUser = { id: number; full_name: string; phone: string; phone2: string | null; hospital_code: string; hospital_name: string };
export type MockProfile = { id: number; full_name: string; phone: string; phone2: string | null; hospital_id: number; hospital_code: string; hospital_name: string; pdpa_accepted_at: string | null };
export type MockRequest = RequestBase & { position_all: number | null; position_color: number | null };
export type ProfileInput = { full_name: string; hospital_code: string; hospital_name: string; phone: string; phone2: string };
export type SubmitInput = { patient_name: string; patient_gender: string; patient_age: string; patient_province: string; patient_phone: string; color_code: string; substance_code: string; reason_code: string; note: string };

export const devApi = {
  list: () => api.post<MockUser[]>('/dev/mock/list', {}),
  create: (p: ProfileInput) => api.post<{ id: number }>('/dev/mock/create', p),
  clear: () => api.post<{ requesters: number; requests: number }>('/dev/mock/clear', {}),
  profile: (requester_id: number) => api.post<MockProfile | null>('/dev/as/profile', { requester_id }),
  saveProfile: (requester_id: number, profile: ProfileInput) => api.post<MockProfile>('/dev/as/save-profile', { requester_id, profile }),
  submit: (requester_id: number, request: SubmitInput) => api.post<{ id: number; request_no: string }>('/dev/as/submit', { requester_id, request }),
  mine: (requester_id: number) => api.post<MockRequest[]>('/dev/as/mine', { requester_id }),
  cancel: (requester_id: number, id: number) => api.post<unknown>('/dev/as/cancel', { requester_id, id }),
  respond: (requester_id: number, id: number, accept: boolean) => api.post<unknown>('/dev/as/respond', { requester_id, id, accept }),
};
