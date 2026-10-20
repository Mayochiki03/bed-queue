/**
 * components/Fields.tsx — ช่องกรอกสำหรับฟอร์ม (ใช้กับ react-hook-form ภายใน <FormProvider>)
 *
 *   <TextField name="code" label="รหัส" required maxLength={30} />
 *   <SelectField name="category" label="ประเภท" required options={[{ value: 'BANK', label: 'ธนาคาร' }]} />
 *   <RadioField name="is_active" label="สถานะ" options={[...]} />
 *   <TextAreaField name="note" label="หมายเหตุ" />
 *
 * ทุกช่องมี: label, required (ขึ้นดอกจัน + ตรวจว่าง), disabled/readOnly, แสดงข้อความ error ใต้ช่อง
 */
import { Search, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Controller, useFormContext, type RegisterOptions } from 'react-hook-form';
import { cn } from '../lib/cn';
import { MSG } from '../lib/messages';
import { DatePicker } from './DatePicker';
import { Select } from './Select';

type Option = { value: string; label: string };

type BaseProps = {
  name: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  /** กติกาตรวจเพิ่มเติมของ react-hook-form เช่น { validate: (v) => ... } */
  rules?: RegisterOptions;
  className?: string;
};

const inputClass =
  'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:bg-muted disabled:text-muted-foreground aria-[invalid=true]:border-danger';

function FieldShell({ name, label, required, hint, className, children }: BaseProps & { children: ReactNode }) {
  const {
    formState: { errors },
  } = useFormContext();
  const message = errors[name]?.message as string | undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {hint && !message && <p className="text-xs text-muted-foreground">{hint}</p>}
      {message && (
        <p role="alert" className="text-xs text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

export function TextField(props: BaseProps & { type?: 'text' | 'email' | 'number' | 'time' | 'date' | 'datetime-local' | 'password'; maxLength?: number; placeholder?: string; readOnly?: boolean }) {
  const { register, formState } = useFormContext();
  const { name, required, rules, type = 'text', maxLength, placeholder, readOnly, disabled } = props;
  return (
    <FieldShell {...props}>
      <input
        id={name}
        type={type}
        maxLength={maxLength}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={disabled}
        aria-invalid={!!formState.errors[name]}
        className={cn(inputClass, readOnly && 'bg-muted')}
        {...register(name, { required: required ? MSG.required : false, ...rules })}
      />
    </FieldShell>
  );
}

export function TextAreaField(props: BaseProps & { maxLength?: number; rows?: number }) {
  const { register, formState } = useFormContext();
  const { name, required, rules, maxLength, rows = 3, disabled } = props;
  return (
    <FieldShell {...props}>
      <textarea
        id={name}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={!!formState.errors[name]}
        className={inputClass}
        {...register(name, { required: required ? MSG.required : false, ...rules })}
      />
    </FieldShell>
  );
}

export function SelectField(props: BaseProps & { options: Option[]; placeholder?: string }) {
  const { control, formState } = useFormContext();
  const { name, required, rules, options, placeholder = '-- เลือก --', disabled } = props;
  return (
    <FieldShell {...props}>
      <Controller
        name={name}
        control={control}
        rules={{ required: required ? MSG.requiredSelect : false, ...rules } as never}
        render={({ field }) => (
          <Select id={name} disabled={disabled} invalid={!!formState.errors[name]} value={String(field.value ?? '')} onChange={field.onChange} placeholder={placeholder} options={[{ value: '', label: placeholder }, ...options]} />
        )}
      />
    </FieldShell>
  );
}

/**
 * ช่องวันเวลา (แทน datetime-local): ปฏิทินไทย + เลือกชั่วโมง/นาที — ค่าในฟอร์มเป็น 'YYYY-MM-DDTHH:mm' หรือ '' (ว่าง)
 *   <DateTimeField name="submitted_at" label="วันเวลาที่ส่งคำขอ" max="2026-10-19T12:30" />
 */
const two = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: two(i), label: two(i) }));
const MINUTES = Array.from({ length: 60 }, (_, i) => ({ value: two(i), label: two(i) }));
export function DateTimeField(props: BaseProps & { maxDate?: string }) {
  const { control, formState } = useFormContext();
  const { name, required, rules, disabled, maxDate } = props;
  return (
    <FieldShell {...props}>
      <Controller
        name={name}
        control={control}
        rules={{ required: required ? MSG.required : false, ...rules } as never}
        render={({ field }) => {
          const v = String(field.value ?? '');
          const date = v.slice(0, 10);
          const hh = v.slice(11, 13) || '08';
          const mm = v.slice(14, 16) || '00';
          const set = (d: string, h: string, m: string) => field.onChange(d ? `${d}T${h}:${m}` : '');
          // เลือกวันครั้งแรก: ถ้าเป็นวันนี้ ใช้เวลาปัจจุบัน (กันเวลาเริ่มต้นกลายเป็นอนาคต) ไม่งั้น 08:00
          const pickDate = (d: string) => {
            if (v || !d) return set(d, hh, mm);
            const now = new Date();
            const today = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
            return d === today ? set(d, two(now.getHours()), two(now.getMinutes())) : set(d, '08', '00');
          };
          return (
            <div className="flex flex-wrap items-center gap-2" aria-invalid={!!formState.errors[name]}>
              <DatePicker id={name} className="w-auto min-w-[11rem] flex-1" placeholder="เลือกวันที่" max={maxDate} disabled={disabled} value={date} onChange={pickDate} />
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                เวลา
                <Select aria-label="ชั่วโมง" className="w-auto min-w-[4.5rem]" disabled={disabled || !date} value={hh} options={HOURS} onChange={(h) => set(date, h, mm)} />
                :
                <Select aria-label="นาที" className="w-auto min-w-[4.5rem]" disabled={disabled || !date} value={mm} options={MINUTES} onChange={(m) => set(date, hh, m)} />
                น.
              </span>
            </div>
          );
        }}
      />
    </FieldShell>
  );
}

export function RadioField(props: BaseProps & { options: Option[]; direction?: 'row' | 'column' }) {
  const { register } = useFormContext();
  const { name, required, rules, options, direction = 'row', disabled } = props;
  return (
    <FieldShell {...props}>
      <div className={cn('flex gap-4 py-1', direction === 'column' && 'flex-col gap-2')}>
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              value={o.value}
              disabled={disabled}
              className="size-4 accent-primary"
              {...register(name, { required: required ? MSG.requiredSelect : false, ...rules })}
            />
            {o.label}
          </label>
        ))}
      </div>
    </FieldShell>
  );
}

/** ช่องค้นหาแบบไม่ผูกกับ react-hook-form (ใช้ในแถบกรองของหน้ารายการ) */
export function FilterInput({ label, value, onChange, placeholder, onEnter }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; onEnter?: () => void }) {
  const id = useId(); // ผูก label กับช่อง (กดชื่อช่องแล้วโฟกัส + โปรแกรมอ่านหน้าจออ่านชื่อถูก)
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <input
        id={id}
        className={inputClass}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options, allLabel = 'ทั้งหมด' }: { label: string; value: string; onChange: (v: string) => void; options: Option[]; allLabel?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <Select id={id} value={value} onChange={onChange} options={[{ value: '', label: allLabel }, ...options]} />
    </div>
  );
}

/**
 * ช่อง "เลือกจากรายการ" ในแถบกรอง: กล่องอ่านอย่างเดียว + ปุ่มแว่นขยายเปิด modal (เช่น SelectModal) + ปุ่มล้างค่า
 *   <PickerInput label="คู่ค้า" value={picked ? picked.name : ''} onOpen={() => setOpen(true)} onClear={() => setPicked(null)} />
 */
export function PickerInput({ label, value, onOpen, onClear, placeholder = 'กดแว่นขยายเพื่อเลือก' }: { label: string; value: string; onOpen: () => void; onClear?: () => void; placeholder?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex">
        <input id={id} readOnly value={value} placeholder={placeholder} onClick={onOpen} className={cn(inputClass, 'cursor-pointer rounded-r-none bg-muted/60')} />
        {value && onClear && (
          <button type="button" aria-label="ล้างค่า" onClick={onClear} className="border-y border-border bg-card px-2 text-muted-foreground hover:text-danger">
            <X className="size-4" />
          </button>
        )}
        <button type="button" aria-label="เลือกจากรายการ" onClick={onOpen} className="rounded-r-md border border-l-0 border-border bg-card px-3 text-primary hover:bg-primary-soft">
          <Search className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** ช่องเลือกสี (#RRGGBB) — ช่องสีทางซ้าย + ช่องพิมพ์รหัสสีทางขวา ใช้ค่าเดียวกัน */
export function ColorField(props: BaseProps) {
  const { register, watch, setValue, formState } = useFormContext();
  const { name, required, rules, disabled } = props;
  const value = (watch(name) as string) || '';
  return (
    <FieldShell {...props}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${props.label} (เลือกสี)`}
          disabled={disabled}
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#888888'}
          onChange={(e) => setValue(name, e.target.value.toUpperCase(), { shouldDirty: true })}
          className="h-10 w-12 cursor-pointer rounded-md border border-border bg-card p-1"
        />
        <input
          id={name}
          maxLength={7}
          placeholder="#RRGGBB"
          disabled={disabled}
          aria-invalid={!!formState.errors[name]}
          className={inputClass}
          {...register(name, { required: required ? MSG.required : false, ...rules })}
        />
      </div>
    </FieldShell>
  );
}
