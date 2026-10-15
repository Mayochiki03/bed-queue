/** LogDto.ts — ข้อมูลที่รับเข้าของหน้าบันทึกการใช้งาน (POST /api/log/search) */
import { z } from 'zod';
import { pagingShape } from '../../core/http';

export const logSearchDto = z.object({ q: z.string().trim().default(''), page: z.string().default(''), action: z.string().default(''),
  /** ช่วงวันที่ (YYYY-MM-DD เวลาไทย) */
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('').transform(() => undefined)),
  ...pagingShape });
export type LogSearchDto = z.infer<typeof logSearchDto>;
