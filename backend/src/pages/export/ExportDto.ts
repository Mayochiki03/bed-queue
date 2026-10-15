/** ExportDto.ts — ข้อมูลที่รับเข้าของการส่งออก Excel (POST /api/export/build) */
import { z } from 'zod';
import { idField } from '../../core/http';
import { STATUSES } from '../request/Request';
import { widgetConfigShape } from '../dashboard/WidgetDto';

export const SECTIONS = ['summary', 'widgets', 'requests', 'events', 'requesters', 'audit'] as const;
export type Section = (typeof SECTIONS)[number];

export const exportBuildDto = z.object({
  /** เลือกว่าจะเอาข้อมูลชุดไหนบ้าง (แต่ละชุดคือชีตของ Excel) */
  sections: z.array(z.enum(SECTIONS)).min(1, 'เลือกข้อมูลที่จะส่งออกอย่างน้อย 1 อย่าง'),
  /** ช่วงเวลา (วันล่าสุด) ของสรุป/กราฟ — ไม่ใส่ = ค่าเริ่มต้นของ Dashboard */
  days: z.coerce.number().int().min(1, 'ช่วงเวลาต้องอย่างน้อย 1 วัน').max(3650).optional(),
  /** ขอบเขตของ คำขอ/เหตุการณ์/log: period = เฉพาะช่วง days วัน · all = ทั้งหมดตั้งแต่เริ่มใช้ระบบ */
  scope: z.enum(['period', 'all']).default('period'),
  /** กราฟที่จะส่งออก (ว่าง = ทุกอันที่แสดงอยู่) */
  widget_ids: z.array(idField).max(200).default([]),
  /** กราฟที่ยังไม่บันทึก (จากตัวอย่างในตัวสร้าง) — ใช้แทน widget_ids */
  config: z.object({ ...widgetConfigShape, title: z.string().trim().max(120).default('') }).optional(),
  /** ตัวกรองของหน้าประวัติคำขอ (ส่งมาเมื่อกดส่งออกจากหน้านั้น) — ใช้แทน scope กับคำขอ/เหตุการณ์ */
  filters: z
    .object({
      q: z.string().trim().default(''),
      statuses: z.array(z.enum(STATUSES)).default([]),
      color_code: z.string().trim().default(''),
      hospital_id: z.coerce.number().int().positive().optional(),
      date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .optional(),
});
export type ExportBuildDto = z.infer<typeof exportBuildDto>;
