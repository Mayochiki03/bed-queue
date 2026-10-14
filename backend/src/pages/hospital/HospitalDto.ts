/**
 * HospitalDto.ts — ข้อมูลที่รับเข้าของหน้า "โรงพยาบาล" + กติกาตรวจ
 */
import { z } from 'zod';
import { idField, pagingShape } from '../../core/http';

export const hospitalCodeField = z.string().trim().regex(/^\d{5}$/, 'รหัสโรงพยาบาลต้องเป็นตัวเลข 5 หลัก');
export const hospitalNameField = z.string().trim().min(1, 'กรุณากรอกชื่อโรงพยาบาล').max(150, 'ชื่อยาวเกิน 150 ตัวอักษร');

const editable = { name: hospitalNameField, is_active: z.enum(['Y', 'N']).default('Y') };

export const hospitalAddDto = z.object({ code: hospitalCodeField, ...editable });
export const hospitalUpdateDto = z.object({ id: idField, code: hospitalCodeField, ...editable });
export const hospitalIdDto = z.object({ id: idField });
export const hospitalSearchDto = z.object({ q: z.string().trim().default(''), ...pagingShape });

export type HospitalAddDto = z.infer<typeof hospitalAddDto>;
export type HospitalUpdateDto = z.infer<typeof hospitalUpdateDto>;
export type HospitalSearchDto = z.infer<typeof hospitalSearchDto>;
