/**
 * PeriodPicker — เลือกช่วงเวลาของ Dashboard: วันนี้ / เมื่อวาน / 7 / 30 / 90 วัน / ทั้งหมด / กำหนดเอง (วันที่เริ่ม–สิ้นสุด)
 * ใช้ Select กลางของระบบ (tone="glass" เพราะวางบนแบนเนอร์สี)
 */
import { Calendar } from 'lucide-react';
import { choiceKey, DAY_OPTIONS, fromKey, isValid, todayThai, type PeriodChoice } from '../lib/period';
import { Select, type SelectOption } from './Select';
import { DatePicker } from './DatePicker';

type Props = { value: PeriodChoice; onChange: (c: PeriodChoice) => void; extraDays?: number[] };

export function PeriodPicker({ value, onChange, extraDays = [] }: Props) {
  const today = todayThai();
  const days = [...new Set([...DAY_OPTIONS, ...extraDays])].sort((a, b) => a - b);
  const options: SelectOption[] = [
    { value: 'today', label: 'วันนี้' },
    { value: 'yesterday', label: 'เมื่อวาน' },
    ...days.map((d, i) => ({ value: `d${d}`, label: `${d} วันล่าสุด`, divider: i === 0 })),
    { value: 'all', label: 'ทั้งหมดตั้งแต่เปิดระบบ', divider: true },
    { value: 'custom', label: 'กำหนดเอง…', hint: 'เลือกวันที่เริ่ม–สิ้นสุด', divider: true },
  ];
  const bad = value.kind === 'custom' && !isValid(value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select tone="glass" aria-label="ช่วงเวลา" className="w-auto min-w-[11rem] py-2" icon={<Calendar className="size-4 opacity-90" aria-hidden="true" />} value={choiceKey(value)} options={options} onChange={(k) => onChange(fromKey(k, value, today))} menuMinWidth={256} />
      {value.kind === 'custom' && (
        <>
          <DatePicker tone="glass" clearable={false} className="w-auto" aria-label="ตั้งแต่วันที่" value={value.from} max={today} onChange={(v) => onChange({ ...value, from: v || today })} />
          <span className="text-sm text-white/80" aria-hidden="true">ถึง</span>
          <DatePicker tone="glass" clearable={false} className="w-auto" aria-label="ถึงวันที่" value={value.to} min={value.from || undefined} max={today} onChange={(v) => onChange({ ...value, to: v || today })} />
          {bad && <span role="alert" className="text-sm text-white">วันสิ้นสุดต้องไม่ก่อนวันเริ่ม</span>}
        </>
      )}
    </div>
  );
}
