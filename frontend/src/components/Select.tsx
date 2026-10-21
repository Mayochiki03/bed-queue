/**
 * components/Select.tsx — ช่องเลือกจากรายการ (แทน <select> ของเบราว์เซอร์ที่หน้าตาเปลี่ยนไปตามเครื่อง/ดูเก่า)
 *
 *   <Select value={v} onChange={setV} options={[{ value: 'A', label: 'ตัวเลือก A' }, ...]} placeholder="-- เลือก --" />
 *
 * ทุกที่ที่ต้องการช่องเลือกใช้ตัวนี้ (ผ่าน SelectField / FilterSelect ใน Fields.tsx หรือใช้ตรง ๆ)
 * - รายการลอยเหนือเนื้อหา (portal) จึงไม่ถูกตัดโดยตาราง/หน้าต่างป๊อปอัป และกลับด้านขึ้นเองเมื่อที่ด้านล่างไม่พอ
 * - คีย์บอร์ด: ลูกศรขึ้น/ลง · Home/End · Enter/เว้นวรรค เลือก · Esc ปิด · พิมพ์ตัวอักษรตัวแรกเพื่อข้ามไป
 * - option.group = หัวข้อกลุ่ม (แสดงเมื่อกลุ่มเปลี่ยน) · option.hint = ข้อความเล็กใต้ชื่อ
 * - tone="glass" ใช้บนพื้นสี (แบนเนอร์หน้าหลัก)
 */
import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';

export type SelectOption = { value: string; label: string; hint?: string; group?: string; disabled?: boolean; /** เส้นคั่นก่อนรายการนี้ */ divider?: boolean };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  invalid?: boolean;
  size?: 'md' | 'sm';
  tone?: 'default' | 'glass';
  icon?: ReactNode;
  className?: string;
  /** ความกว้างขั้นต่ำของรายการที่ลอย (ค่าเริ่มต้น = เท่าปุ่ม) */
  menuMinWidth?: number;
};

type Pos = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

const triggerBase = 'flex w-full min-w-0 max-w-full items-center justify-between gap-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed';
const TONE = {
  default: 'rounded-md border border-border bg-card text-foreground hover:border-ring/60 focus-visible:outline-ring disabled:bg-muted disabled:text-muted-foreground aria-[invalid=true]:border-danger',
  glass: 'rounded-xl border border-white/30 bg-white/15 font-medium text-white hover:bg-white/25 focus-visible:outline-white',
};
const SIZE = { md: 'px-3 py-2 text-sm', sm: 'px-2.5 py-1.5 text-xs' };

export function Select({ value, onChange, options, placeholder = '-- เลือก --', id, 'aria-label': ariaLabel, disabled, invalid, size = 'md', tone = 'default', icon, className, menuMinWidth }: Props) {
  const auto = useId();
  const uid = id ?? auto;
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<Pos | null>(null);

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? placeholder;
  const isPlaceholder = !selected;

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const gap = 6;
    const below = window.innerHeight - r.bottom - gap - 8;
    const above = r.top - gap - 8;
    const wanted = Math.min(320, options.length * 40 + 12);
    const up = below < Math.min(wanted, 200) && above > below;
    const width = Math.max(r.width, menuMinWidth ?? 0);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos(up ? { left, width, bottom: window.innerHeight - r.top + gap, maxHeight: Math.min(320, above) } : { left, width, top: r.bottom + gap, maxHeight: Math.min(320, below) });
  }, [options.length, menuMinWidth]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
    const move = (e: Event) => {
      if (menu.current?.contains(e.target as Node)) return; // เลื่อนในรายการเอง ไม่ต้องปิด
      place();
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', move, true);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', move, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openMenu = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
    btn.current?.focus();
  };
  const step = (from: number, dir: 1 | -1) => {
    for (let k = 1; k <= options.length; k++) {
      const j = (from + dir * k + options.length * 2) % options.length;
      if (!options[j]!.disabled) return j;
    }
    return from;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openMenu();
      else setActive((a) => step(a, e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Home' || e.key === 'End') {
      if (!open) return;
      e.preventDefault();
      setActive(e.key === 'Home' ? step(-1, 1) : step(options.length, -1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) pick(active);
      else openMenu();
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation(); // ไม่ให้ปิดหน้าต่างป๊อปอัปที่ครอบอยู่
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const from = open ? active : Math.max(0, options.findIndex((o) => o.value === value));
      const next = [...options.keys()].map((k) => (from + 1 + k) % options.length).find((j) => !options[j]!.disabled && options[j]!.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (next !== undefined) {
        if (open) setActive(next);
        else onChange(options[next]!.value);
      }
    }
  };

  return (
    <>
      <button
        ref={btn}
        id={uid}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(triggerBase, TONE[tone], SIZE[size], className)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className={cn('truncate', isPlaceholder && tone === 'default' && 'text-faint')}>{label}</span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 opacity-70 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={menu}
            id={`${uid}-list`}
            role="listbox"
            aria-label={ariaLabel}
            onKeyDown={onKeyDown}
            data-floating-popup="" style={{ pointerEvents: 'auto', position: 'fixed', left: pos.left, minWidth: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
            className="z-[100] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-xl"
          >
            {options.map((o, i) => {
              const sel = o.value === value;
              const newGroup = o.group && o.group !== options[i - 1]?.group;
              return (
                <li key={o.value || `_${i}`} role="presentation" className={cn((o.divider || newGroup) && i > 0 && 'mt-1 border-t border-border pt-1')}>
                  {newGroup && <p className="px-3 pb-0.5 pt-1.5 text-xs font-semibold text-muted-foreground">{o.group}</p>}
                  <button
                    type="button"
                    tabIndex={-1}
                    role="option"
                    aria-selected={sel}
                    data-active={i === active}
                    disabled={o.disabled}
                    onMouseEnter={() => !o.disabled && setActive(i)}
                    onClick={() => pick(i)}
                    className={cn('flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[15px] disabled:opacity-40', i === active && 'bg-muted', sel && 'font-semibold text-primary-ink')}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span>{o.label}</span>
                      {o.hint && <span className="text-xs font-normal text-muted-foreground">{o.hint}</span>}
                    </span>
                    {sel && <Check className="size-4 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
