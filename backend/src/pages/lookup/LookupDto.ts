/**
 * LookupDto.ts — ข้อมูลที่รับเข้าของหน้า "ข้อมูลหลัก" + กติกาตรวจ
 * type และ code กำหนดตอนเพิ่มแล้วแก้ไม่ได้ (คำขอเก่าอ้างถึง code นี้) — แก้ได้แค่ชื่อที่แสดง/สี/ลำดับ/เปิด-ปิด
 */
import { z } from 'zod';
import { idField, pagingShape } from '../../core/http';
import { LOOKUP_TYPES } from './Lookup';

const typeField = z.enum(LOOKUP_TYPES, { errorMap: () => ({ message: 'กรุณาเลือกประเภทข้อมูล' }) });
const hexColor = z.union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/, 'สีต้องเป็นรูปแบบ #RRGGBB')]).default('');

const editable = {
  label: z.string().trim().min(1, 'กรุณากรอกชื่อที่แสดง').max(100, 'ชื่อยาวเกิน 100 ตัวอักษร'),
  color: hexColor,
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  is_active: z.enum(['Y', 'N']).default('Y'),
};

export const lookupAddDto = z.object({
  type: typeField,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{1,30}$/, 'รหัสใช้ได้เฉพาะ A-Z 0-9 และ _ (ไม่เกิน 30 ตัว)'),
  ...editable,
});
export const lookupUpdateDto = z.object({ id: idField, ...editable });
export const lookupIdDto = z.object({ id: idField });
export const lookupSearchDto = z.object({ type: z.string().default(''), q: z.string().trim().default(''), ...pagingShape });

export type LookupAddDto = z.infer<typeof lookupAddDto>;
export type LookupUpdateDto = z.infer<typeof lookupUpdateDto>;
export type LookupSearchDto = z.infer<typeof lookupSearchDto>;
