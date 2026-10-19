/**
 * components/queue/parts.tsx — ชิ้นส่วนเล็ก ๆ ที่ใช้ซ้ำในหน้าคิว: ป้ายสถานะ, เวลารอ, เบอร์โทร (กดโทรได้), ป้ายประวัติ
 */
import { Phone } from 'lucide-react';
import { cn } from '../../lib/cn';
import { STATUS_LABEL, type Status } from '../../api/requestApi';

const STATUS_STYLE: Record<Status, string> = {
  WAITING: 'bg-info-soft text-info-ink',
  CALLED: 'bg-warn-soft text-warn-ink',
  NEED_DATE: 'bg-accent-soft text-accent-ink',
  CONFIRMED: 'bg-success-soft text-success-ink',
  DECLINED: 'bg-neutral-soft text-neutral-ink',
  CANCELLED: 'bg-neutral-soft text-neutral-ink',
};

export const StatusChip = ({ status }: { status: Status }) => <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;

/** รอมากี่วัน/ชั่วโมง (น้อยกว่า 1 วันแสดงเป็นชั่วโมง) */
export function fmtWait(days: number): string {
  if (days < 1) {
    const h = Math.round(days * 24);
    return h < 1 ? 'เพิ่งส่ง' : `${h} ชม.`;
  }
  return `${days % 1 === 0 ? days : days.toFixed(1)} วัน`;
}

export const fmtHours = (h: number) => (h < 48 ? `${Math.round(h)} ชม.` : `${(h / 24).toFixed(1)} วัน`);

/** เบอร์โทร — กดโทรได้บนมือถือ (เบอร์ต่อ เช่น "ต่อ 1275" แสดงตามที่กรอก แต่ลิงก์โทรใช้เฉพาะเบอร์ก่อนคำว่าต่อ) */
export function PhoneLink({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className="text-faint">-</span>;
  const main = value.split(/ต่อ|ext/i)[0] ?? value;
  const digits = main.replace(/[^\d+]/g, '');
  return (
    <a href={`tel:${digits}`} className={cn('inline-flex items-center gap-1 text-primary hover:underline', className)}>
      <Phone className="size-3.5 shrink-0" aria-hidden="true" />
      {value}
    </a>
  );
}

export const EVENT_LABEL: Record<string, string> = {
  SUBMITTED: 'ส่งคำขอ',
  CALLED: 'เรียกคิว',
  CONFIRMED: 'ยืนยันส่งตัว',
  DEFERRED: 'ยืนยันจะมา ขอเลื่อนวัน',
  DECLINED: 'ไม่ยืนยัน',
  CANCELLED: 'ยกเลิก',
  REQUEUED: 'คืนคิว',
  REOPENED: 'เปิดคิวใหม่',
  EDITED: 'แก้ไขข้อมูล',
  TRANSFERRED: 'โอนเคส',
};
export const VIA_LABEL: Record<string, string> = { LINE: 'ผ่าน LINE', PHONE: 'ทางโทรศัพท์', ADMIN: 'โดยเจ้าหน้าที่', SYSTEM: 'โดยระบบ' };
export const GENDER_LABEL: Record<string, string> = { M: 'ชาย', F: 'หญิง', O: 'อื่น ๆ' };
