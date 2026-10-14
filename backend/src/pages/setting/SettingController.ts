/**
 * SettingController.ts — API ตั้งค่าของระบบ
 *   POST /api/setting/list   { categories?: string[] }     รายการค่า (ADMIN ขึ้นไป — เห็นเฉพาะค่าที่ role ตัวเองแก้ได้)
 *   POST /api/setting/save   { values: { key: value } }    บันทึกหลายค่าพร้อมกัน
 *   POST /api/setting/ui     {}                             ค่าที่หน้าจอทุกคนต้องใช้ (ไม่มีค่าลับ)
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../core/auth';
import { ok, parse } from '../../core/http';
import { getSetting, listSettings, updateSettings } from '../../core/settings';

const listDto = z.object({ categories: z.array(z.string()).default([]) });
const saveDto = z.object({ values: z.record(z.unknown()) });

export const settingRouter = Router();

settingRouter.post('/list', requireRole('ADMIN'), async (req, res) => {
  const { categories } = parse(listDto, req.body);
  res.json(ok(await listSettings(categories, req.user!.role)));
});

settingRouter.post('/save', requireRole('ADMIN'), async (req, res) => {
  const { values } = parse(saveDto, req.body);
  await updateSettings(values, req.user!);
  res.json(ok(null, 'บันทึกการตั้งค่าแล้ว'));
});

settingRouter.post('/ui', async (_req, res) => {
  res.json(
    ok({
      confirm_timeout_hours: await getSetting<number>('confirm_timeout_hours'),
      queue_display: await getSetting('queue_display'),
      dashboard_default_days: await getSetting<number>('dashboard_default_days'),
      dashboard_top_n: await getSetting<number>('dashboard_top_n'),
      dashboard_widgets: (await getSetting('dashboard_widgets')).split(',').map((w) => w.trim()),
    }),
  );
});
