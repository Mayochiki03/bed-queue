/**
 * MemberDto.ts — ข้อมูลที่รับเข้าของหน้า "สมาชิก รพ." (อนุมัติผู้ขอที่ลงทะเบียนผ่าน LINE)
 */
import { z } from 'zod';
import { idField, pagingShape } from '../../core/http';
import { phoneRequired, phoneText } from '../../core/phone';

const optPhone = (label: string) =>
  phoneText(label)
    .nullish()
    .transform((v) => (v ? v : null));

export const memberSearchDto = z.object({
  q: z.string().trim().default(''),
  /** ว่าง = ทุกสถานะ · PHONE = มีคำขอเปลี่ยนเบอร์ค้าง */
  status: z.enum(['', 'PENDING', 'APPROVED', 'REJECTED', 'PHONE']).default(''),
  ...pagingShape,
});
export const memberIdDto = z.object({ id: idField });
export const memberRejectDto = z.object({ id: idField, note: z.string().trim().max(200, 'เหตุผลยาวเกิน 200 ตัวอักษร').default('') });

export type MemberSearchDto = z.infer<typeof memberSearchDto>;

export const memberUpdateDto = z.object({
  id: idField,
  full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-สกุล').max(120, 'ชื่อยาวเกิน 120 ตัวอักษร'),
  hospital_code: z.string().trim().regex(/^\d{5}$/, 'รหัสโรงพยาบาลต้องเป็นตัวเลข 5 หลัก'),
  hospital_name: z.string().trim().min(1, 'กรุณากรอกชื่อโรงพยาบาล').max(150),
  phone: phoneRequired('เบอร์โทร'),
  phone2: optPhone('เบอร์สำรอง'),
});
export type MemberUpdateDto = z.infer<typeof memberUpdateDto>;
