/**
 * RequestDto.ts — ข้อมูลที่รับเข้าของคำขอเตียง (เจ้าหน้าที่/ผู้ขอ) + กติกาตรวจ
 * ช่องว่าง "" ถือเป็น "ไม่ระบุ" (null) · เบอร์โทรใช้กติกากลาง core/phone.ts
 */
import { z } from 'zod';
import { idField, pagingShape } from '../../core/http';
import { phoneRequired, phoneText } from '../../core/phone';
import { ACTIONS, STATUSES, VIAS } from './Request';

const optText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label}ยาวเกิน ${max} ตัวอักษร`)
    .nullish()
    .transform((v) => (v ? v : null));

const optCode = z
  .string()
  .trim()
  .max(30)
  .nullish()
  .transform((v) => (v ? v : null));

const optPhone = (label: string) =>
  phoneText(label)
    .nullish()
    .transform((v) => (v ? v : null));

const optAge = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === '' ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 130), 'อายุต้องเป็นจำนวนเต็ม 0-130');

/** ข้อมูลผู้ป่วย + ประเภท (ใช้ร่วมกันทั้งผู้ขอและเจ้าหน้าที่) */
export const patientShape = {
  patient_name: z
    .string()
    .trim()
    .min(1, 'กรุณากรอกชื่อผู้ป่วย')
    .max(150, 'ชื่อยาวเกิน 150 ตัวอักษร')
    .transform((s) => s.replace(/\s+/g, ' ')), // ช่องว่างซ้ำเหลือช่องเดียว (กันชื่อเดียวกันแต่ช่องว่างต่างกันถูกนับเป็นคนละราย)
  patient_gender: z
    .enum(['M', 'F', 'O', ''])
    .nullish()
    .transform((v) => (v ? v : null)),
  patient_age: optAge,
  patient_province: optText('จังหวัด', 80),
  patient_phone: optPhone('เบอร์โทรผู้ป่วย/ญาติ'),
  color_code: optCode,
  substance_code: optCode,
  reason_code: optCode,
  note: optText('หมายเหตุ', 1000),
};

/** เจ้าหน้าที่เพิ่มคำขอแทนผู้ขอ */
export const requestAddDto = z.object({
  hospital_id: idField,
  /** ผู้ขอที่มีในระบบ (ไม่ใส่ = กรอกชื่อ/เบอร์เอง) */
  requester_id: idField.nullish().transform((v) => v ?? null),
  requester_name: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ขอ').max(120),
  requester_phone: optPhone('เบอร์ผู้ขอ'),
  requester_phone2: optPhone('เบอร์สำรอง'),
  /** ย้อนวันที่ส่งคำขอ (กรณีบันทึกย้อนหลังจากโทรศัพท์/ฟอร์มเดิม) — ไม่ใส่ = เวลาปัจจุบัน */
  submitted_at: z
    .string()
    .datetime({ message: 'วันเวลาที่ส่งไม่ถูกต้อง' })
    .nullish()
    .transform((v) => v ?? null),
  ...patientShape,
});
export type RequestAddDto = z.infer<typeof requestAddDto>;

export const requestUpdateDto = z.object({
  id: idField,
  hospital_id: idField,
  requester_name: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ขอ').max(120),
  requester_phone: optPhone('เบอร์ผู้ขอ'),
  requester_phone2: optPhone('เบอร์สำรอง'),
  ...patientShape,
});
export type RequestUpdateDto = z.infer<typeof requestUpdateDto>;

export const requestIdDto = z.object({ id: idField });

export const requestTransitionDto = z.object({
  id: idField,
  action: z.enum(ACTIONS),
  /** ช่องทางที่ได้ผล: PHONE = โทรคุยกันแล้ว (ค่าเริ่มต้นของเจ้าหน้าที่) · ADMIN = เจ้าหน้าที่ตัดสินใจเอง */
  via: z.enum(VIAS).default('PHONE'),
  note: optText('หมายเหตุ', 300),
});
export type RequestTransitionDto = z.infer<typeof requestTransitionDto>;

export const requestTransferDto = z.object({ id: idField, requester_id: idField });
export const requestRequestersDto = z.object({ hospital_id: idField });

export const requestSearchDto = z.object({
  q: z.string().trim().default(''),
  statuses: z.array(z.enum(STATUSES)).default([]),
  color_code: z.string().trim().default(''),
  hospital_id: z.coerce.number().int().positive().optional(),
  /** ช่วงวันที่ส่งคำขอ (YYYY-MM-DD เวลาไทย) */
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ...pagingShape,
});
export type RequestSearchDto = z.infer<typeof requestSearchDto>;

// ---------- ผู้ขอ ----------
export const requesterProfileDto = z.object({
  full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-สกุล').max(120, 'ชื่อยาวเกิน 120 ตัวอักษร'),
  hospital_code: z.string().trim().regex(/^\d{5}$/, 'รหัสโรงพยาบาลต้องเป็นตัวเลข 5 หลัก'),
  hospital_name: z.string().trim().min(1, 'กรุณากรอกชื่อโรงพยาบาล').max(150),
  phone: phoneRequired('เบอร์โทร'),
  phone2: optPhone('เบอร์สำรอง'),
  /** ต้องติ๊กรับทราบเรื่องข้อมูลส่วนบุคคลตอนลงทะเบียนครั้งแรก */
  accept_pdpa: z.boolean().default(false),
});
export type RequesterProfileDto = z.infer<typeof requesterProfileDto>;

export const submitDto = z.object(patientShape);
export type SubmitDto = z.infer<typeof submitDto>;
export const respondDto = z.object({ id: idField, accept: z.boolean() });
