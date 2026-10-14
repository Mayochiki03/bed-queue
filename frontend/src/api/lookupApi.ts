/** api/lookupApi.ts — API ข้อมูลหลัก (สี / สารเสพติด / เหตุผลการส่งต่อ) */
import { api, type PageResult } from './client';

export type LookupType = 'COLOR' | 'SUBSTANCE' | 'REASON';
export const LOOKUP_TYPE_OPTIONS: { value: LookupType; label: string }[] = [
  { value: 'COLOR', label: 'สี/ระดับผู้ป่วย' },
  { value: 'SUBSTANCE', label: 'ประเภทสารเสพติด' },
  { value: 'REASON', label: 'เหตุผลการส่งต่อ' },
];
export const lookupTypeLabel = (t: string) => LOOKUP_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

export type Lookup = { id: number; type: LookupType; code: string; label: string; color: string | null; sort_order: number; is_active: boolean | number };
export type LookupInput = { type: LookupType | ''; code: string; label: string; color: string; sort_order: number | string; is_active: 'Y' | 'N' };
export type LookupOptions = Record<LookupType, Lookup[]>;

export const lookupApi = {
  options: () => api.post<LookupOptions>('/lookup/options', {}),
  search: (p: { type: string; q: string; pageNo: number; pageSize: number }) => api.post<PageResult<Lookup>>('/lookup/search', p),
  get: (id: number) => api.post<Lookup>('/lookup/get', { id }),
  add: (body: LookupInput) => api.post<{ id: number }>('/lookup/add', body),
  update: (id: number, body: Omit<LookupInput, 'type' | 'code'>) => api.post<{ id: number }>('/lookup/update', { id, ...body }),
  remove: (id: number) => api.post<null>('/lookup/delete', { id }),
};
