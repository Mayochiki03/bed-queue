/** DashboardDto.ts — ข้อมูลที่รับเข้าของ Dashboard: ช่วงเวลา (วัน) 1-3650 */
import { z } from 'zod';

export const dashboardDto = z.object({ days: z.coerce.number().int().min(1, 'ช่วงเวลาต้องอย่างน้อย 1 วัน').max(3650, 'ช่วงเวลาเกิน 3650 วัน').optional() });
export type DashboardDto = z.infer<typeof dashboardDto>;
