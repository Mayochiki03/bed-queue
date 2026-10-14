/** LogDto.ts — ข้อมูลที่รับเข้าของหน้าบันทึกการใช้งาน (POST /api/log/search) */
import { z } from 'zod';
import { pagingShape } from '../../core/http';

export const logSearchDto = z.object({ q: z.string().trim().default(''), page: z.string().default(''), action: z.string().default(''), ...pagingShape });
export type LogSearchDto = z.infer<typeof logSearchDto>;
