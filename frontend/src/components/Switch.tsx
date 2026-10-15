/** Switch — สวิตช์เปิด/ปิด (กดทั้งแถวได้ มี label + คำอธิบาย) ใช้กับตั้งค่าที่เป็น เปิด/ปิด เช่น ชนิดข้อความแจ้งเตือน */
import { cn } from '../lib/cn';

type Props = { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean; id?: string };

export function Switch({ checked, onChange, label, description, disabled, id }: Props) {
  return (
    <button type="button" role="switch" id={id} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex w-full items-start gap-3 text-left disabled:opacity-60">
      <span className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-border')}>
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </span>
    </button>
  );
}
