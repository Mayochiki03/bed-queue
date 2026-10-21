/**
 * components/DatePicker.tsx — เลือกวันที่ (แทน <input type="date"> ที่หน้าตา/รูปแบบ mm/dd/yyyy เปลี่ยนไปตามเบราว์เซอร์)
 *
 *   <DatePicker value={ymd} onChange={setYmd} min="2026-10-19" max={todayThai()} aria-label="ตั้งแต่วันที่" />
 *
 * value/ค่าที่ส่งกลับเป็น 'YYYY-MM-DD' (ค.ศ.) หรือ '' เสมอ — แต่แสดงผลเป็นภาษาไทย พ.ศ. (เช่น 19 ต.ค. 2569)
 * คีย์บอร์ด: ลูกศรเลื่อนวัน/สัปดาห์ · PageUp/PageDown เปลี่ยนเดือน · Enter เลือก · Esc ปิด
 */
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';
import { todayThai } from '../lib/format';

type Props = {
  value: string;
  onChange: (ymd: string) => void;
  min?: string;
  max?: string;
  id?: string;
  'aria-label'?: string;
  placeholder?: string;
  disabled?: boolean;
  tone?: 'default' | 'glass';
  clearable?: boolean;
  className?: string;
};

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const WEEK = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1, d: Number(s.slice(8, 10)) } : null);
/** บวกลบวันแบบไม่ผูกเขตเวลา */
function addDays(s: string, n: number): string {
  const p = parse(s)!;
  const t = new Date(Date.UTC(p.y, p.m, p.d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}
export function formatThaiYmd(s: string): string {
  const p = parse(s);
  return p ? `${p.d} ${MONTHS_SHORT[p.m]} ${p.y + 543}` : '';
}

export function DatePicker({ value, onChange, min, max, id, 'aria-label': ariaLabel, placeholder = 'เลือกวันที่', disabled, tone = 'default', clearable = true, className }: Props) {
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [focusDay, setFocusDay] = useState(value || todayThai());
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  const view = parse(focusDay) ?? parse(todayThai())!; // เดือนที่กำลังดู
  const today = todayThai();
  const inRange = (s: string) => (!min || s >= min) && (!max || s <= max);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const h = 380;
    const w = 304;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const up = window.innerHeight - r.bottom < h && r.top > window.innerHeight - r.bottom;
    setPos(up ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
  };
  useLayoutEffect(() => {
    if (open) place();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const move = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) place();
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', move, true);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', move, true);
    };
  }, [open]);
  useEffect(() => {
    if (open && pos) pop.current?.querySelector<HTMLElement>('[data-focus="true"]')?.focus();
  }, [open, pos, focusDay]);

  const openIt = () => {
    if (disabled) return;
    setFocusDay(value && parse(value) ? value : inRange(today) ? today : (min ?? max ?? today));
    setOpen(true);
  };
  const pick = (s: string) => {
    if (!inRange(s)) return;
    onChange(s);
    setOpen(false);
    btn.current?.focus();
  };
  const shiftMonth = (n: number) => {
    const t = new Date(Date.UTC(view.y, view.m + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    setFocusDay(ymd(t.getUTCFullYear(), t.getUTCMonth(), Math.min(view.d, last)));
  };

  // 6 สัปดาห์ของเดือนที่ดู เริ่มวันอาทิตย์
  const first = new Date(Date.UTC(view.y, view.m, 1));
  const cells = Array.from({ length: 42 }, (_, i) => {
    const t = new Date(Date.UTC(view.y, view.m, 1 - first.getUTCDay() + i));
    return { s: ymd(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()), other: t.getUTCMonth() !== view.m, day: t.getUTCDate() };
  });

  const onGridKey = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      setFocusDay(addDays(focusDay, step[e.key]!));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      shiftMonth(e.key === 'PageUp' ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
    }
  };

  const glass = tone === 'glass';
  return (
    <>
      <span className={cn('relative inline-flex w-full', className)}>
        <button
          ref={btn}
          id={id}
          type="button"
          aria-label={ariaLabel ? `${ariaLabel}${value ? `: ${formatThaiYmd(value)}` : ''}` : undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : openIt())}
          className={cn(
            'flex w-full items-center justify-between gap-2 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed',
            glass ? 'rounded-xl border border-white/30 bg-white/15 px-3 py-2 font-medium text-white hover:bg-white/25 focus-visible:outline-white' : 'rounded-md border border-border bg-card px-3 py-2 text-foreground hover:border-ring/60 focus-visible:outline-ring disabled:bg-muted',
            clearable && value && 'pr-9',
          )}
        >
          <span className={cn('truncate', !value && !glass && 'text-faint')}>{value ? formatThaiYmd(value) : placeholder}</span>
          <CalendarDays className="size-4 shrink-0 opacity-70" aria-hidden="true" />
        </button>
        {clearable && value && !disabled && (
          <button type="button" aria-label="ล้างวันที่" onClick={() => onChange('')} className={cn('absolute right-8 top-1/2 -translate-y-1/2 rounded p-0.5', glass ? 'text-white/80 hover:text-white' : 'text-muted-foreground hover:text-danger')}>
            <X className="size-3.5" />
          </button>
        )}
      </span>
      {open &&
        pos &&
        createPortal(
          <div ref={pop} role="dialog" aria-label="เลือกวันที่" data-floating-popup="" style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, pointerEvents: 'auto' }} className="z-[100] w-[19rem] max-w-[calc(100vw-1rem)] rounded-2xl border border-border bg-card p-3 text-foreground shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => shiftMonth(-1)} className="rounded-lg p-2 hover:bg-muted">
                <ChevronLeft className="size-4" />
              </button>
              <p className="text-[15px] font-semibold" aria-live="polite">
                {MONTHS[view.m]} {view.y + 543}
              </p>
              <button type="button" aria-label="เดือนถัดไป" onClick={() => shiftMonth(1)} className="rounded-lg p-2 hover:bg-muted">
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div role="grid" onKeyDown={onGridKey} className="grid grid-cols-7 gap-y-0.5 text-center text-sm">
              {WEEK.map((w) => (
                <span key={w} className="py-1 text-xs font-medium text-muted-foreground">
                  {w}
                </span>
              ))}
              {cells.map((c) => {
                const ok = inRange(c.s);
                const sel = c.s === value;
                const foc = c.s === focusDay;
                return (
                  <button
                    key={c.s}
                    type="button"
                    role="gridcell"
                    aria-selected={sel}
                    aria-label={formatThaiYmd(c.s)}
                    data-focus={foc}
                    tabIndex={foc ? 0 : -1}
                    disabled={!ok}
                    onClick={() => pick(c.s)}
                    className={cn(
                      'mx-auto flex size-9 items-center justify-center rounded-full',
                      c.other && 'text-faint',
                      ok && !sel && 'hover:bg-muted',
                      c.s === today && !sel && 'border border-primary/50 font-semibold text-primary-ink',
                      sel && 'bg-primary font-semibold text-white',
                      !ok && 'cursor-not-allowed opacity-30',
                    )}
                  >
                    {c.day}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm">
              <button type="button" disabled={!inRange(today)} onClick={() => pick(today)} className="rounded-lg px-2.5 py-1.5 font-medium text-primary-ink hover:bg-muted disabled:opacity-40">
                วันนี้
              </button>
              {clearable && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-muted-foreground hover:bg-muted"
                >
                  ล้าง
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
