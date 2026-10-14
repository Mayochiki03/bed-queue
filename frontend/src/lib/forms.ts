import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ApiResult } from '../api/client';

/** เอาข้อความ error รายช่องจาก API ไปขีดแดงในฟอร์ม (เช่น รหัสซ้ำ → ช่อง code) — คืน true ถ้ามีช่องให้ขีด */
export function applyFieldErrors<T extends FieldValues>(setError: UseFormSetError<T>, res: ApiResult<unknown>): boolean {
  const entries = Object.entries(res.fields ?? {}).filter(([k]) => k !== '_');
  entries.forEach(([name, message]) => setError(name as Path<T>, { type: 'server', message }));
  return entries.length > 0;
}

/**
 * กด Enter ในช่องกรอกบรรทัดเดียวแล้วฟอร์มถูกส่งทั้งที่ยังพิมพ์ไม่เสร็จ — ใส่ฟังก์ชันนี้ที่ <form onKeyDown={noEnterSubmit}>
 * (Enter ในช่องหมายเหตุ/textarea ยังขึ้นบรรทัดใหม่ได้ และกดปุ่มด้วย Enter/Space ยังทำงานตามปกติ)
 */
export function noEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
  const el = e.target as HTMLElement;
  if (e.key === 'Enter' && el.tagName === 'INPUT') e.preventDefault();
}
