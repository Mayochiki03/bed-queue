/**
 * core/http.ts — รูปแบบคำตอบของ API ที่ทุกหน้าใช้ร่วมกัน + error + ตัวช่วยแบ่งหน้า
 *
 * สำเร็จ:  { status: 'SUCCESS', message?, data }
 * ผิดพลาด: { status: 'DUPLICATE' | 'VALIDATION' | 'NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'ERROR', message, fields? }
 * รายการแบ่งหน้า: data = { resultList, pageNo, pageSize, totalRow, totalPage }
 *
 * ใช้ใน Controller:  res.json(ok(data))      ใน Service:  throw conflict('รหัสซ้ำ', { code: 'รหัสนี้มีอยู่แล้ว' })
 *
 * กฎ: ไม่ส่งข้อมูล/id ผ่าน URL (path หรือ query) — ทุก API เป็น POST และส่งข้อมูลใน body
 */
import type { Knex } from 'knex';
import { z } from 'zod';

export type ErrorStatus = 'DUPLICATE' | 'VALIDATION' | 'NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'ERROR';

export class HttpError extends Error {
  constructor(
    public httpStatus: number,
    public status: ErrorStatus,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) => new HttpError(400, 'VALIDATION', message, fields);
export const unauthorized = (message = 'กรุณาเข้าสู่ระบบ') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'คุณไม่มีสิทธิ์ใช้งานส่วนนี้') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'ไม่พบข้อมูล') => new HttpError(404, 'NOT_FOUND', message);
/** ข้อมูลซ้ำ — fields บอกว่าช่องไหนซ้ำ หน้าจอจะขีดแดงช่องนั้นให้เอง */
export const conflict = (message: string, fields?: Record<string, string>) => new HttpError(409, 'DUPLICATE', message, fields);

export const ok = <T>(data: T, message?: string) => ({ status: 'SUCCESS' as const, message, data });

/** แปลง error ของ zod เป็น HttpError (ข้อความแรก + รายช่อง) */
export function fromZod(err: z.ZodError): HttpError {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = err.issues[0];
  const where = first?.path.length ? `${first.path.join('.')}: ` : '';
  return badRequest(`ข้อมูลไม่ถูกต้อง (${where}${first?.message ?? ''})`, fields);
}

/** ตรวจ body/query ด้วย zod schema — ไม่ผ่านจะ throw ให้ error handler ตอบ 400 เอง */
export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw fromZod(r.error);
  return r.data;
}

/** ช่อง id ที่ส่งมาใน body (ห้ามส่ง id ผ่าน URL) */
export const idField = z.coerce.number().int().positive('id ไม่ถูกต้อง');

/** ช่องแบ่งหน้าที่ DTO ค้นหาทุกตัวนำไปต่อท้าย: z.object({ q: ..., ...pagingShape }) */
export const pagingShape = {
  pageNo: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(15),
};

export type Paging = { pageNo: number; pageSize: number };
export type PageResult<T> = { resultList: T[]; pageNo: number; pageSize: number; totalRow: number; totalPage: number; rowsPerPageOption: number[] };

/**
 * แบ่งหน้าให้ query: ใส่ query ที่ "กรองเสร็จแล้ว" (ยังไม่ select/order) แล้วได้ผลแบ่งหน้ากลับมา
 *
 * @example
 *   return paginate<Hospital>(paging, db('hospital').where(...), (q) => q.select('*').orderBy('id', 'desc'));
 */
export async function paginate<T>(
  { pageNo, pageSize }: Paging,
  base: Knex.QueryBuilder,
  order: (q: Knex.QueryBuilder) => Knex.QueryBuilder,
): Promise<PageResult<T>> {
  const countRow = await base.clone().clearSelect().clearOrder().count({ n: '*' }).first();
  const totalRow = Number((countRow as { n: number | string } | undefined)?.n ?? 0);
  const resultList = (await order(base.clone()).limit(pageSize).offset((pageNo - 1) * pageSize)) as T[];
  return { resultList, pageNo, pageSize, totalRow, totalPage: Math.max(1, Math.ceil(totalRow / pageSize)), rowsPerPageOption: [15, 30, 50, 100] };
}
