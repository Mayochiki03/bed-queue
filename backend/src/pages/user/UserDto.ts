/**
 * UserDto.ts — ข้อมูลที่รับเข้าของหน้า "ผู้ใช้งาน" + กติกาตรวจ
 */
import { z } from 'zod';
import { idField, pagingShape } from '../../core/http';
import { ROLES } from '../../core/pages';

const roleField = z.enum(ROLES, { errorMap: () => ({ message: 'กรุณาเลือกสิทธิ์การใช้งาน' }) });
const passwordField = z.string().min(8, 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร').max(100, 'รหัสผ่านยาวเกินไป');

const editable = {
  full_name: z.string().trim().min(1, 'กรุณากรอกชื่อ-สกุล').max(120, 'ชื่อยาวเกิน 120 ตัวอักษร'),
  role: roleField,
  is_active: z.enum(['Y', 'N']).default('Y'),
  /** บังคับให้บัญชีนี้ใช้ 2FA (role ที่ถูกบังคับอยู่แล้วไม่ต้องติ๊ก) */
  totp_required: z.enum(['Y', 'N']).default('N'),
};

export const userAddDto = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,60}$/, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - (3-60 ตัว)'),
  password: passwordField,
  ...editable,
});
export const userUpdateDto = z.object({ id: idField, ...editable });
export const userIdDto = z.object({ id: idField });
export const userResetPasswordDto = z.object({ id: idField, new_password: passwordField });
export const userSearchDto = z.object({ q: z.string().trim().default(''), role: z.string().default(''), ...pagingShape });

export type UserAddDto = z.infer<typeof userAddDto>;
export type UserUpdateDto = z.infer<typeof userUpdateDto>;
export type UserResetPasswordDto = z.infer<typeof userResetPasswordDto>;
export type UserSearchDto = z.infer<typeof userSearchDto>;
