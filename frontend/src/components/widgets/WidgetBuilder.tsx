/**
 * WidgetBuilder — หน้าต่างสร้าง/แก้ widget พร้อม "ตัวอย่างสด" (เรียก /widget/preview เมื่อหยุดแก้ ~400ms)
 * ตัวเลือกที่ใช้ร่วมกันไม่ได้จะถูกปิดและบอกเหตุผล (กติกาเดียวกับเซิร์ฟเวอร์ — เซิร์ฟเวอร์ตรวจซ้ำเสมอ)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { dashboardApi, type WidgetResult, type WidgetSaveInput } from '../../api/dashboardApi';
import { useLookups } from '../../hooks/useLookups';
import { cn } from '../../lib/cn';
import {
  CATEGORY_GROUPS, CHARTS, CHART_LABEL, COUNT_MEASURES, DAYS_MEASURES, GROUP_LABEL, MEASURE_LABEL, PERIODS, SPLITS, TIME_GROUPS, WIDTH_LABEL,
  checkCompat, suggestChart, type ChartType, type Group, type Measure, type Split, type WidgetConfig,
} from '../../lib/widgetRules';
import { Button } from '../Button';
import { Modal } from '../Modal';
import { usePopup } from '../Popup';
import { Spinner } from '../Spinner';
import { WidgetView } from './WidgetView';

export const BLANK: WidgetSaveInput = {
  title: '',
  measures: ['submitted'],
  group_by: 'color',
  split_by: 'none',
  chart: 'hbar',
  period_days: null,
  filters: { colors: [], substances: [], reasons: [] },
  row_limit: 10,
  width: 2,
  is_active: true,
};

const sel = 'w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30';
const Section = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <fieldset className="mb-4 rounded-xl border border-border p-3.5">
    <legend className="px-1.5 text-sm font-semibold text-foreground">
      <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>
      {title}
    </legend>
    {children}
  </fieldset>
);

type Props = { open: boolean; initial: WidgetSaveInput; dashboardDays: number; onClose: () => void; onSaved: () => void };

export function WidgetBuilder({ open, initial, dashboardDays, onClose, onSaved }: Props) {
  const popup = usePopup();
  const lookups = useLookups();
  const [w, setW] = useState<WidgetSaveInput>(initial);
  const [preview, setPreview] = useState<WidgetResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (open) setW(initial);
  }, [open, initial]);

  const config: WidgetConfig = useMemo(
    () => ({ title: w.title, measures: w.measures, group_by: w.group_by, split_by: w.split_by, chart: w.chart, period_days: w.period_days, filters: w.filters, row_limit: w.row_limit }),
    [w.title, w.measures, w.group_by, w.split_by, w.chart, w.period_days, w.filters, w.row_limit],
  );
  const problem = checkCompat(config);

  useEffect(() => {
    if (!open) return;
    if (problem) {
      setErr(problem);
      setPreview(null);
      return;
    }
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      void dashboardApi.preview({ ...config, title: config.title || 'ตัวอย่าง' }, dashboardDays).then((r) => {
        if (my !== seq.current) return;
        setBusy(false);
        if (r.ok && r.data) {
          setPreview(r.data);
          setErr('');
        } else {
          setPreview(null);
          setErr(r.message);
        }
      });
    }, 400);
    return () => clearTimeout(t);
  }, [open, config, problem, dashboardDays]);

  const patch = (p: Partial<WidgetSaveInput>) => setW((x) => ({ ...x, ...p }));
  /** เปลี่ยนค่าที่ส่งผลต่อรูปแบบ แล้วเลือกรูปแบบที่เหมาะให้ถ้าของเดิมใช้ไม่ได้ */
  const patchShape = (p: Partial<Pick<WidgetConfig, 'measures' | 'group_by' | 'split_by'>>) =>
    setW((x) => {
      const next = { ...x, ...p };
      if (p.group_by === 'none') next.split_by = 'none';
      else if (p.group_by && p.group_by === next.split_by) next.split_by = 'none';
      if (next.measures.length !== 1) next.split_by = 'none';
      // เปลี่ยนมาแยกตามเวลา: กราฟเส้นอ่านง่ายที่สุด (ถ้าเดิมเป็นแท่งแนวนอน/การ์ด/วงกลม)
      const toTime = p.group_by && (TIME_GROUPS as readonly string[]).includes(p.group_by) && !(TIME_GROUPS as readonly string[]).includes(x.group_by);
      const chart = toTime && next.chart !== 'table' && !checkCompat({ ...next, chart: 'line' }) ? 'line' : suggestChart(next);
      return { ...next, chart };
    });

  const toggleMeasure = (m: Measure) => {
    const has = w.measures.includes(m);
    let ms = has ? w.measures.filter((x) => x !== m) : [...w.measures, m];
    // ชนิดหน่วยต่างกัน → เริ่มใหม่ด้วยตัวที่เพิ่งกด
    const isDays = (DAYS_MEASURES as readonly string[]).includes(m);
    if (!has && ms.some((x) => (DAYS_MEASURES as readonly string[]).includes(x) !== isDays)) ms = [m];
    patchShape({ measures: ms });
  };
  const toggleFilter = (k: 'colors' | 'substances' | 'reasons', code: string) =>
    patch({ filters: { ...w.filters, [k]: w.filters[k].includes(code) ? w.filters[k].filter((c) => c !== code) : [...w.filters[k], code] } });

  async function handleSave() {
    if (!w.title.trim()) return popup.warn('กรุณาตั้งชื่อ widget');
    if (problem) return popup.warn(problem);
    setSaving(true);
    const res = await dashboardApi.save({ ...w, title: w.title.trim() }).finally(() => setSaving(false));
    if (res.ok) {
      popup.success('บันทึก widget แล้ว');
      onSaved();
    } else popup.warn(res.message);
  }

  const chartReason = (c: ChartType) => checkCompat({ ...config, chart: c });
  const showLimit = w.group_by !== 'none' && !(TIME_GROUPS as readonly string[]).includes(w.group_by);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={w.id ? 'แก้ไข widget' : 'สร้าง widget ใหม่'}
      description="เลือกว่าจะวัดอะไร แยกอย่างไร และแสดงเป็นกราฟแบบไหน — ดูตัวอย่างด้านขวาได้ทันที"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button loading={saving} onClick={() => void handleSave()}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ตั้งค่า */}
        <div>
          <Section n={1} title="ชื่อ">
            <input aria-label="ชื่อ widget" className={sel} maxLength={80} placeholder="เช่น คำขอรายสัปดาห์ แยกตามสี" value={w.title} onChange={(e) => patch({ title: e.target.value })} />
          </Section>

          <Section n={2} title="วัดอะไร (เลือกได้หลายอย่างถ้าเป็นหน่วยเดียวกัน)">
            <p className="mb-1.5 text-xs text-muted-foreground">จำนวนราย</p>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {COUNT_MEASURES.map((m) => (
                <Chip key={m} on={w.measures.includes(m)} onClick={() => toggleMeasure(m)}>
                  {MEASURE_LABEL[m]}
                </Chip>
              ))}
            </div>
            <p className="mb-1.5 text-xs text-muted-foreground">ระยะเวลา (วัน)</p>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_MEASURES.map((m) => (
                <Chip key={m} on={w.measures.includes(m)} onClick={() => toggleMeasure(m)}>
                  {MEASURE_LABEL[m]}
                </Chip>
              ))}
            </div>
          </Section>

          <Section n={3} title="แยกกลุ่มตาม">
            <select aria-label="แยกกลุ่มตาม" className={sel} value={w.group_by} onChange={(e) => patchShape({ group_by: e.target.value as Group })}>
              <option value="none">{GROUP_LABEL.none}</option>
              <optgroup label="ตามประเภท">
                {CATEGORY_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {GROUP_LABEL[g]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="ตามเวลา">
                {TIME_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {GROUP_LABEL[g]}
                  </option>
                ))}
              </optgroup>
            </select>
            <label className="mt-2.5 block text-xs text-muted-foreground">
              ซ้อนสีตาม (เลือกได้เมื่อวัดอย่างเดียวและมีการแยกกลุ่ม)
              <select aria-label="ซ้อนสีตาม" className={cn(sel, 'mt-1')} value={w.split_by} disabled={w.group_by === 'none' || w.measures.length !== 1} onChange={(e) => patchShape({ split_by: e.target.value as Split })}>
                <option value="none">ไม่ซ้อน</option>
                {SPLITS.filter((s) => s !== 'none' && s !== w.group_by).map((s) => (
                  <option key={s} value={s}>
                    {GROUP_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </Section>

          <Section n={4} title="แสดงเป็น">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CHARTS.map((c) => {
                const reason = chartReason(c);
                const on = w.chart === c;
                return (
                  <button key={c} type="button" disabled={!!reason && !on} aria-pressed={on} title={reason ?? undefined} onClick={() => patch({ chart: c })} className={cn('rounded-lg border px-2 py-2 text-sm', on ? 'border-primary bg-primary-soft font-semibold text-primary-ink' : 'border-border hover:bg-muted', reason && !on && 'cursor-not-allowed opacity-40')}>
                    {CHART_LABEL[c]}
                  </button>
                );
              })}
            </div>
            {problem && <p role="alert" className="mt-2 text-xs text-warn-ink">{problem}</p>}
          </Section>

          <Section n={5} title="ช่วงเวลาและตัวกรอง">
            <label className="block text-xs text-muted-foreground">
              ช่วงเวลา
              <select aria-label="ช่วงเวลา" className={cn(sel, 'mt-1')} value={w.period_days ?? ''} onChange={(e) => patch({ period_days: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">ตามที่เลือกบนหน้า Dashboard</option>
                {PERIODS.map((d) => (
                  <option key={d} value={d}>
                    {d} วันล่าสุด
                  </option>
                ))}
              </select>
            </label>
            {showLimit && (
              <label className="mt-2.5 block text-xs text-muted-foreground">
                แสดงสูงสุดกี่แถว
                <input aria-label="จำนวนแถวสูงสุด" type="number" min={1} max={50} className={cn(sel, 'mt-1')} value={w.row_limit} onChange={(e) => patch({ row_limit: Math.min(50, Math.max(1, Number(e.target.value) || 10)) })} />
              </label>
            )}
            <FilterChips title="เฉพาะสี" items={lookups.colors.map((c) => ({ code: c.code, label: c.label }))} picked={w.filters.colors} onToggle={(c) => toggleFilter('colors', c)} />
            <FilterChips title="เฉพาะสารเสพติด" items={lookups.substances.map((c) => ({ code: c.code, label: c.label }))} picked={w.filters.substances} onToggle={(c) => toggleFilter('substances', c)} />
            <FilterChips title="เฉพาะเหตุผลส่งต่อ" items={lookups.reasons.map((c) => ({ code: c.code, label: c.label }))} picked={w.filters.reasons} onToggle={(c) => toggleFilter('reasons', c)} />
            <p className="mt-1.5 text-xs text-faint">ไม่เลือก = รวมทั้งหมด</p>
          </Section>

          <Section n={6} title="บนหน้า Dashboard">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-muted-foreground">
                ความกว้าง{' '}
                <select aria-label="ความกว้าง" className="ml-1 rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground" value={w.width} onChange={(e) => patch({ width: Number(e.target.value) })}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {WIDTH_LABEL[n]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={w.is_active} onChange={(e) => patch({ is_active: e.target.checked })} />
                แสดงบน Dashboard
              </label>
            </div>
          </Section>
        </div>

        {/* ตัวอย่างสด */}
        <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-[16px] font-semibold">{w.title || 'ตัวอย่าง'}</h3>
              <span className="text-xs text-muted-foreground">ตัวอย่างสด{busy && ' · กำลังโหลด…'}</span>
            </div>
            <div data-testid="preview" className="min-h-[200px]">
              {err ? <p role="status" className="py-10 text-center text-sm text-warn-ink">{err}</p> : preview ? <WidgetView chart={w.chart} group_by={w.group_by} result={preview} /> : <Spinner />}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn('rounded-full border px-3 py-1 text-[13px]', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>
      {children}
    </button>
  );
}

function FilterChips({ title, items, picked, onToggle }: { title: string; items: { code: string; label: string }[]; picked: string[]; onToggle: (c: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2.5">
      <p className="mb-1 text-xs text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <Chip key={i.code} on={picked.includes(i.code)} onClick={() => onToggle(i.code)}>
            {i.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
