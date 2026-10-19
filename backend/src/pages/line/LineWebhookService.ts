/**
 * LineWebhookService.ts — ตัวคิดของ LINE webhook (รับเหตุการณ์จาก LINE แล้วตอบด้วย reply = ฟรี ไม่กินโควต้า)
 *
 * รองรับ 3 เหตุการณ์:
 *   follow    เพิ่มเพื่อน → ทักทาย + บอกวิธีใช้
 *   message   พิมพ์ "สถานะ" → สรุปคำขอที่ยังไม่จบของคนนั้น (ไม่มีชื่อผู้ป่วย) · ข้อความอื่น → บอกวิธีใช้
 *   postback  ปุ่มบนการ์ดเรียกคิว: confirm → ยืนยันตามวันที่แจ้ง · defer → ยืนยันจะส่งแต่วันที่แจ้งไม่สะดวก (รอเจ้าหน้าที่โทรนัดวัน) · decline → ถามซ้ำก่อน · decline_yes → ไม่ยืนยันจริง
 * สิทธิ์: ทำได้เฉพาะคำขอของ line_user_id ที่กดมา (RequesterService ตรวจความเป็นเจ้าของให้) · ไม่ throw — error จดลง console แล้วตอบสุภาพ
 */
import { HttpError } from '../../core/http';
import { getSetting } from '../../core/settings';
import { formatThaiDate } from '../../core/thaiDate';
import { lineClient } from '../notification/LineClient';
import { card, parsePostback, statusText, type Btn, type StatusLine } from '../notification/LineFlex';
import { OPEN_STATUSES, STATUS_LABEL } from '../request/Request';
import type { RequesterService } from '../request/RequesterService';

export type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
};

const HELP = 'พิมพ์ "สถานะ" เพื่อดูคำขอเตียงของคุณ\nหรือกดปุ่มเมนูด้านล่างเพื่อส่งคำขอใหม่';

export class LineWebhookService {
  constructor(private requester: RequesterService) {}

  async handle(events: LineEvent[]): Promise<void> {
    if (!(await getSetting<boolean>('line_webhook_enabled'))) return;
    for (const ev of events) {
      try {
        await this.one(ev);
      } catch (err) {
        console.error('[line-webhook]', err);
      }
    }
  }

  private async reply(ev: LineEvent, messages: unknown[]) {
    if (ev.replyToken) await lineClient.reply(ev.replyToken, messages);
  }

  private async liffButton(): Promise<Btn[]> {
    const [liff, base] = await Promise.all([getSetting<string>('liff_id'), getSetting<string>('public_base_url')]);
    const url = liff ? `https://liff.line.me/${liff}` : base;
    return url ? [{ label: 'เปิดหน้าคำขอของฉัน', uri: url }] : [];
  }

  private async one(ev: LineEvent) {
    const uid = ev.source?.userId;
    if (!uid) return;
    if (ev.type === 'follow') return this.reply(ev, [card('ยินดีต้อนรับ', `ระบบขอเตียงโรงพยาบาล\n${HELP}`, await this.liffButton())]);
    if (ev.type === 'message' && ev.message?.type === 'text') {
      const text = (ev.message.text ?? '').trim();
      if (/^(สถานะ|status|คิว)$/i.test(text)) return this.reply(ev, [await this.statusCard(uid)]);
      return this.reply(ev, [{ type: 'text', text: HELP }]);
    }
    if (ev.type === 'postback' && ev.postback?.data) return this.postback(ev, uid, ev.postback.data);
  }

  async statusCard(uid: string) {
    const profile = await this.requester.profile(uid);
    if (!profile) return card('ยังไม่ได้ลงทะเบียน', 'กดเมนูด้านล่างเพื่อลงทะเบียนและส่งคำขอครั้งแรก', await this.liffButton());
    if (profile.approval_status === 'PENDING') return card('รอเจ้าหน้าที่อนุมัติ', `ลงทะเบียนของ ${profile.hospital_name} แล้ว กำลังรอเจ้าหน้าที่ตรวจสอบและอนุมัติ\nเมื่ออนุมัติแล้วจะส่งคำขอและดูคิวได้ทันที`, await this.liffButton());
    if (profile.approval_status === 'REJECTED') return card('ไม่ได้รับการอนุมัติ', `บัญชีนี้ไม่ได้รับการอนุมัติ${profile.decided_note ? ` (${profile.decided_note})` : ''}\nกรุณาติดต่อเจ้าหน้าที่`);
    const mine = await this.requester.mine(uid);
    const open = mine.filter((x) => OPEN_STATUSES.includes(x.status));
    const lines: StatusLine[] = open.map((x) => ({
      request_no: x.request_no ?? `#${x.id}`,
      status_label: STATUS_LABEL[x.status],
      detail:
        x.status === 'CALLED'
          ? `ถึงคิวแล้ว${x.bed_date ? ` เตียงว่างวันที่ ${formatThaiDate(x.bed_date)}` : ''} — รอคุณยืนยัน`
          : x.status === 'NEED_DATE'
            ? 'รับทราบว่าจะส่งตัวแล้ว — รอเจ้าหน้าที่โทรกลับเพื่อนัดวัน'
            : x.position_color != null
            ? `ก่อนหน้าคุณอีก ${Math.max(x.position_color - 1, 0)} คิว (ในสีเดียวกัน)`
            : x.position_all != null
              ? `ก่อนหน้าคุณอีก ${Math.max(x.position_all - 1, 0)} คิว`
              : '',
    }));
    return card('สถานะคำขอของคุณ', statusText(lines), await this.liffButton());
  }

  private async postback(ev: LineEvent, uid: string, data: string) {
    const p = parsePostback(data);
    if (!p) return;
    if (p.a === 'decline') {
      // ถามซ้ำก่อน — กันกดพลาดแล้วเสียคิว
      return this.reply(ev, [card('ยืนยันว่าไม่ส่งตัว?', `คำขอ ${p.r} จะถูกบันทึกว่า "ไม่ยืนยัน" และเจ้าหน้าที่จะเรียกคิวถัดไป`, [{ label: 'ใช่ ไม่ยืนยัน', data: `a=decline_yes&r=${p.r}`, color: '#B42318' }, { label: 'ยกเลิก (กลับไปเลือกใหม่)', style: 'secondary', data: `a=keep&r=${p.r}` }], '#B42318')]);
    }
    if (p.a === 'keep') return this.reply(ev, [{ type: 'text', text: 'รับทราบ — ยังไม่เปลี่ยนแปลงอะไร กดปุ่มบนการ์ดเรียกคิวได้เมื่อพร้อม' }]);
    if (p.a !== 'confirm' && p.a !== 'defer' && p.a !== 'decline_yes') return;
    const answer = p.a === 'confirm' ? 'CONFIRM' : p.a === 'defer' ? 'DEFER' : 'DECLINE';
    try {
      await this.requester.respond(uid, p.r, answer);
      const text = { CONFIRM: 'บันทึก "ยืนยันส่งตัว" ตามวันที่แจ้งแล้ว เจ้าหน้าที่จะติดต่อกลับ', DEFER: 'รับทราบ — จะส่งตัวแต่วันที่แจ้งไม่สะดวก เจ้าหน้าที่จะโทรกลับเพื่อนัดวันใหม่ที่ตรงกันกับคุณ', DECLINE: 'บันทึก "ไม่ยืนยัน" แล้ว' }[answer];
      return this.reply(ev, [{ type: 'text', text }]);
    } catch (err) {
      // เช่น กดซ้ำ/คิวถูกเปลี่ยนไปแล้ว/ไม่ใช่คำขอของคนนี้ — บอกตามจริงโดยไม่เปิดเผยข้อมูล
      const msg = err instanceof HttpError ? err.message : 'ทำรายการไม่สำเร็จ';
      return this.reply(ev, [{ type: 'text', text: `ทำรายการไม่ได้: ${msg}\nพิมพ์ "สถานะ" เพื่อดูสถานะล่าสุด` }]);
    }
  }
}
