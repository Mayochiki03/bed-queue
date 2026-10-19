/** DashboardDto.ts — ข้อมูลที่รับเข้าของ Dashboard: ช่วงเวลา (N วันล่าสุด / วันนี้ / เมื่อวาน / ทั้งหมด / กำหนดวันเอง) */
import { z } from 'zod';
import { periodShape, refinePeriod } from './Period';

export const dashboardDto = z.object(periodShape).superRefine(refinePeriod);
export type DashboardDto = z.infer<typeof dashboardDto>;
