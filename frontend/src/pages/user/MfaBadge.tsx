/** MfaBadge — ป้ายสถานะยืนยันตัวตน 2 ชั้นของผู้ใช้ (ใช้ในตารางและหน้าแก้ไข) */
import type { MfaState } from '../../api/userApi';
import { cn } from '../../lib/cn';

const LABEL: Record<MfaState, { text: string; cls: string }> = {
  ENABLED: { text: 'เปิดใช้แล้ว', cls: 'bg-success-soft text-success-ink' },
  PENDING: { text: 'รอผูกแอป', cls: 'bg-warn-soft text-warn-ink' },
  OFF: { text: 'ไม่บังคับ', cls: 'bg-neutral-soft text-neutral-ink' },
};

export function MfaBadge({ state }: { state: MfaState }) {
  const l = LABEL[state];
  return <span className={cn('whitespace-nowrap rounded px-2 py-0.5 text-xs', l.cls)}>{l.text}</span>;
}
