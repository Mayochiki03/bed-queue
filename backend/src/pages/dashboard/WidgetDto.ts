/**
 * WidgetDto.ts — ตรวจข้อมูลที่ส่งมาเพื่อสร้าง/แก้/preview/จัดวาง/ส่งออก widget
 * (ความเข้ากันได้ของตัวเลือก เช่น กราฟเส้นต้องแยกตามเวลา ตรวจใน checkCompat ที่ Widget.ts)
 */
import { z } from 'zod';
import { idField } from '../../core/http';
import { CHARTS, GROUPS, MEASURES, PERIODS, SPLITS } from './Widget';

const codeList = z.array(z.string().trim().min(1).max(30)).max(50).default([]);

export const widgetConfigShape = {
  title: z.string().trim().min(1, 'กรุณาตั้งชื่อ widget').max(120, 'ชื่อยาวเกิน 120 ตัวอักษร'),
  measures: z.array(z.enum(MEASURES)).min(1, 'เลือกค่าที่วัดอย่างน้อย 1 อย่าง').max(3, 'เลือกได้ไม่เกิน 3 อย่าง'),
  group_by: z.enum(GROUPS).default('none'),
  split_by: z.enum(SPLITS).default('none'),
  chart: z.enum(CHARTS),
  period_days: z
    .number()
    .int()
    .nullable()
    .default(null)
    .refine((v) => v === null || (PERIODS as readonly number[]).includes(v), `ช่วงเวลาเลือกได้: ${PERIODS.join(', ')} วัน`),
  filters: z.object({ colors: codeList, substances: codeList, reasons: codeList }).default({ colors: [], substances: [], reasons: [] }),
  row_limit: z.number().int().min(3).max(50).default(10),
};

const days = z.number().int().min(1).max(365).optional();

export const widgetSaveDto = z.object({
  id: idField.optional(),
  ...widgetConfigShape,
  width: z.number().int().min(1).max(4).default(2),
  is_active: z.boolean().default(true),
});
export type WidgetSaveDto = z.infer<typeof widgetSaveDto>;

/** preview ไม่บังคับชื่อ (ผู้ใช้ยังพิมพ์ไม่เสร็จก็ดูตัวอย่างได้) */
export const widgetPreviewDto = z.object({ config: z.object({ ...widgetConfigShape, title: z.string().trim().max(120).default('') }), days });
export const widgetDataDto = z.object({ days, include_hidden: z.boolean().default(false) });
export const widgetIdDto = z.object({ id: idField });
export const widgetLayoutDto = z.object({
  items: z
    .array(z.object({ id: idField, sort_order: z.number().int().min(0).max(100000), width: z.number().int().min(1).max(4), is_active: z.boolean() }))
    .min(1)
    .max(200),
});
