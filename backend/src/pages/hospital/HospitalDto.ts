/**
 * HospitalDto.ts — ข้อมูลที่รับเข้าของหน้า "โรงพยาบาล" + กติกาตรวจ
 */
import { z } from 'zod';
import { idField, pagingShape } from '../../core/http';

export const hospitalCodeField = z.string().trim().regex(/^\d{5}$/, 'รหัสโรงพยาบาลต้องเป็นตัวเลข 5 หลัก');
export const hospitalNameField = z.string().trim().min(1, 'กรุณากรอกชื่อโรงพยาบาล').max(150, 'ชื่อยาวเกิน 150 ตัวอักษร');

/** เขตสุขภาพ 1-14 · ว่าง = ยังไม่ระบุ (รับทั้งเลขและข้อความจากฟอร์ม) */
export const healthRegionField = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number({ invalid_type_error: 'เขตสุขภาพต้องเป็นตัวเลข 1-14' }).int().min(1, 'เขตสุขภาพต้องเป็น 1-14').max(14, 'เขตสุขภาพต้องเป็น 1-14').nullable());

const editable = { name: hospitalNameField, health_region: healthRegionField, is_active: z.enum(['Y', 'N']).default('Y') };

export const hospitalAddDto = z.object({ code: hospitalCodeField, ...editable });
export const hospitalUpdateDto = z.object({ id: idField, code: hospitalCodeField, ...editable });
export const hospitalIdDto = z.object({ id: idField });
export const hospitalSearchDto = z.object({ q: z.string().trim().default(''), ...pagingShape });
/** นำเข้า Excel: ส่งไฟล์เป็น base64 ใน body (ไม่ใส่ในพาธ URL) — จำกัดขนาดเพราะ body รับได้ไม่เกิน 1 MB */
export const hospitalImportDto = z.object({
  filename: z.string().trim().max(200).default('hospital.xlsx'),
  file_base64: z.string().min(1, 'กรุณาเลือกไฟล์ Excel').max(900_000, 'ไฟล์ใหญ่เกินไป (ไม่เกินประมาณ 650 KB) — แบ่งไฟล์เป็นหลายส่วน'),
});
export const hospitalTemplateDto = z.object({ with_data: z.boolean().default(false) });
export type HospitalImportDto = z.infer<typeof hospitalImportDto>;

export type HospitalAddDto = z.infer<typeof hospitalAddDto>;
export type HospitalUpdateDto = z.infer<typeof hospitalUpdateDto>;
export type HospitalSearchDto = z.infer<typeof hospitalSearchDto>;
