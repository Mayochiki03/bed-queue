/**
 * LineWebhookController.ts — POST /api/line/webhook (LINE เรียกเอง ไม่มี session ของเจ้าหน้าที่)
 * ตรวจลายเซ็น x-line-signature = base64(HMAC-SHA256(Channel Secret, ข้อความดิบ)) ก่อนทำอะไรทั้งนั้น
 * ตอบ 200 ทันที แล้วค่อยประมวลผล (LINE รอไม่เกินไม่กี่วินาที) · ปุ่ม Verify ของ LINE ส่ง events ว่าง → ตอบ 200
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { getSetting } from '../../core/settings';
import type { LineEvent, LineWebhookService } from './LineWebhookService';

export function validSignature(secret: string, raw: Buffer | undefined, signature: string | undefined): boolean {
  if (!secret || !raw || !signature) return false;
  const expect = crypto.createHmac('sha256', secret).update(raw).digest();
  const got = Buffer.from(signature, 'base64');
  return got.length === expect.length && crypto.timingSafeEqual(got, expect);
}

export class LineWebhookController {
  router = Router();
  constructor(private service: LineWebhookService) {
    this.router.post('/webhook', async (req, res, next) => {
      try {
        const secret = await getSetting<string>('line_channel_secret');
        if (!secret) return void res.status(503).json({ status: 'ERROR', message: 'ยังไม่ได้ตั้ง Channel Secret' });
        if (!validSignature(secret, req.rawBody, req.header('x-line-signature'))) return void res.status(401).json({ status: 'UNAUTHORIZED', message: 'ลายเซ็นไม่ถูกต้อง' });
        const events: LineEvent[] = Array.isArray(req.body?.events) ? req.body.events : [];
        res.status(200).json({ status: 'SUCCESS' });
        void this.service.handle(events);
      } catch (e) {
        next(e);
      }
    });
  }
}
