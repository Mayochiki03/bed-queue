/**
 * LineClient.ts — เรียก LINE Messaging API (ใช้ fetch ตรง ๆ ไม่ใช้ SDK)
 *   push(to, messages)   ส่งข้อความหาผู้ใช้ 1 คน (นับโควต้าข้อความของ OA)
 *   botInfo()            ตรวจ Channel Access Token + ชื่อ OA
 *   reply(token, msgs)   ตอบกลับด้วย replyToken (ไม่นับโควต้า — ใช้ได้ครั้งเดียวภายใน ~1 นาทีหลังได้รับเหตุการณ์)
 *   webhookInfo/webhookTest  ดู/ทดสอบ Webhook URL ที่ตั้งไว้ฝั่ง LINE
 *   quota()              โควต้าข้อความต่อเดือนของ OA และที่ใช้ไปแล้ว (นับจากฝั่ง LINE)
 * ทุกคำสั่งมีเวลาหมด 8 วินาที ไม่ throw — คืน { ok, status, data }
 */
import { getSetting } from '../../core/settings';

type Res<T = unknown> = { ok: boolean; status: number; data: T | null };

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Res<T>> {
  const token = await getSetting<string>('line_channel_token');
  if (!token) return { ok: false, status: 0, data: null };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const resp = await fetch(`https://api.line.me${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    const data = (await resp.json().catch(() => null)) as T | null;
    return { ok: resp.ok, status: resp.status, data };
  } catch {
    return { ok: false, status: -1, data: null };
  } finally {
    clearTimeout(timer);
  }
}

export const lineClient = {
  push: (to: string, messages: unknown[]) => call<{ message?: string }>('POST', '/v2/bot/message/push', { to, messages }),
  /** ตอบกลับผู้ที่ทัก/กดปุ่ม — ฟรี ไม่กินโควต้า push */
  reply: (replyToken: string, messages: unknown[]) => call<{ message?: string }>('POST', '/v2/bot/message/reply', { replyToken, messages }),
  webhookInfo: () => call<{ endpoint?: string; active?: boolean }>('GET', '/v2/bot/channel/webhook/endpoint'),
  /** ให้ LINE ยิงเหตุการณ์ว่างมาทดสอบที่ Webhook URL (ไม่ส่ง endpoint = ใช้ที่ตั้งไว้) */
  webhookTest: (endpoint?: string) => call<{ success?: boolean; statusCode?: number; reason?: string; detail?: string }>('POST', '/v2/bot/channel/webhook/test', endpoint ? { endpoint } : {}),
  botInfo: () => call<{ displayName?: string; basicId?: string }>('GET', '/v2/bot/info'),
  /** โควต้าข้อความ: type 'limited' + value = จำนวนต่อเดือน · 'none' = ไม่จำกัด */
  quota: () => call<{ type?: string; value?: number }>('GET', '/v2/bot/message/quota'),
  consumption: () => call<{ totalUsage?: number }>('GET', '/v2/bot/message/quota/consumption'),
};
