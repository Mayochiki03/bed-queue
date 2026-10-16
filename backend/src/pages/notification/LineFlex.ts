/**
 * LineFlex.ts — สร้างการ์ด (Flex message) ของ LINE · ฟังก์ชันล้วน ไม่ต่อ DB/เครือข่าย จึงทดสอบง่าย
 * ปุ่มแบบ postback ส่งค่า data กลับมาที่ webhook เช่น  a=confirm&r=12  (a = การกระทำ, r = id คำขอ)
 */
export type Btn = { label: string; style?: 'primary' | 'secondary'; color?: string } & ({ uri: string } | { data: string; displayText?: string });

const GREEN = '#2F6B4F';

const button = (b: Btn) => ({
  type: 'button',
  style: b.style ?? 'primary',
  height: 'sm',
  ...(b.style === 'secondary' ? {} : { color: b.color ?? GREEN }),
  action: 'uri' in b ? { type: 'uri', label: b.label, uri: b.uri } : { type: 'postback', label: b.label, data: b.data, ...(b.displayText ? { displayText: b.displayText } : {}) },
});

/** การ์ดมาตรฐาน: หัวสีเขียว + ข้อความ + ปุ่ม (ไม่ใส่ปุ่มก็ได้) */
export function card(title: string, text: string, buttons: Btn[] = [], headerColor = GREEN) {
  return {
    type: 'flex',
    altText: title,
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', backgroundColor: headerColor, paddingAll: '16px', contents: [{ type: 'text', text: title, color: '#FFFFFF', weight: 'bold', size: 'md', wrap: true }] },
      body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: [{ type: 'text', text, wrap: true, size: 'sm', color: '#1F2A24' }] },
      ...(buttons.length ? { footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', contents: buttons.map(button) } } : {}),
    },
  };
}

export type StatusLine = { request_no: string; status_label: string; detail: string };

/** ข้อความตอบคำว่า "สถานะ" — ไม่มีชื่อผู้ป่วย (กันข้อมูลส่วนบุคคลหลุดในแชท) */
export function statusText(lines: StatusLine[]): string {
  if (!lines.length) return 'ตอนนี้ยังไม่มีคำขอที่รอดำเนินการ';
  return lines.map((l) => `${l.request_no} · ${l.status_label}${l.detail ? `\n${l.detail}` : ''}`).join('\n\n');
}

/** แปลง postback data "a=confirm&r=12" เป็นออบเจ็กต์ — ค่าที่ไม่ถูกต้องคืน null */
export function parsePostback(data: string): { a: string; r: number } | null {
  const p = new URLSearchParams(data);
  const a = p.get('a');
  const r = Number(p.get('r'));
  if (!a || !Number.isInteger(r) || r <= 0) return null;
  return { a, r };
}
