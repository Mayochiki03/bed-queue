/**
 * MemberDto.ts — ข้อมูลที่รับเข้าของหน้า "สมาชิก รพ." (อนุมัติผู้ขอที่ลงทะเบียนผ่าน LINE)
 */
import { z } from 'zod';
import { idField, pagingShape } from '../../core/http';

export const memberSearchDto = z.object({
  q: z.string().trim().default(''),
  /** ว่าง = ทุกสถานะ */
  status: z.enum(['', 'PENDING', 'APPROVED', 'REJECTED']).default(''),
  ...pagingShape,
});
export const memberIdDto = z.object({ id: idField });
export const memberRejectDto = z.object({ id: idField, note: z.string().trim().max(200, 'เหตุผลยาวเกิน 200 ตัวอักษร').default('') });

export type MemberSearchDto = z.infer<typeof memberSearchDto>;
