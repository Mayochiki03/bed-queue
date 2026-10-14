/**
 * Home — หน้าหลัก = Dashboard: ทักทาย + เลือกช่วงเวลา + เตือนเกินเวลา + widget ที่จัดวางเองได้
 * widget มาจาก POST /api/dashboard/widget/data · ผู้ดูแลกด "จัดวาง" เพื่อ ลากวาง/ปรับกว้าง/ซ่อน/เพิ่ม/แก้/ทำซ้ำ/ลบ แล้วกด "บันทึกการจัดวาง"
 * (widget ใช้ร่วมกันทุกคน — ผู้ใช้ทั่วไปเห็นอย่างเดียว) · ส่งออก Excel ได้ทั้งหน้าและรายกราฟ
 */
import { AlertTriangle, Download, LayoutGrid, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboardApi, type DashboardSummary, type WidgetSaveInput, type WidgetWithResult } from '../api/dashboardApi';
import { settingApi, type UiSettings } from '../api/settingApi';
import { Button } from '../components/Button';
import { usePopup } from '../components/Popup';
import { Spinner } from '../components/Spinner';
import { WidgetBuilder, BLANK } from '../components/widgets/WidgetBuilder';
import { WidgetCard } from '../components/widgets/WidgetCard';
import { cn } from '../lib/cn';
import { hasRole, useSession } from '../lib/session';

const RANGES = [7, 30, 90];

const toInput = (w: WidgetWithResult, copy = false): WidgetSaveInput => ({
  ...(copy ? {} : { id: w.id }),
  title: copy ? `${w.title} (สำเนา)` : w.title,
  measures: w.measures,
  group_by: w.group_by,
  split_by: w.split_by,
  chart: w.chart,
  period_days: w.period_days,
  filters: w.filters,
  row_limit: w.row_limit,
  width: w.width,
  is_active: w.is_active,
});

export default function Home() {
  const { user } = useSession();
  const popup = usePopup();
  const isAdmin = hasRole(user?.role, 'ADMIN');
  const [ui, setUi] = useState<UiSettings | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [widgets, setWidgets] = useState<WidgetWithResult[] | null>(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [builder, setBuilder] = useState<WidgetSaveInput | null>(null);
  const dragId = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  useEffect(() => {
    void settingApi.ui().then((r) => {
      if (r.ok && r.data) {
        setUi(r.data);
        setDays(r.data.dashboard_default_days);
      } else setError(r.message);
    });
  }, []);

  const loadSummary = useCallback(async (d: number) => {
    const r = await dashboardApi.summary(d);
    if (r.ok && r.data) setSummary(r.data);
    else setError(r.message);
  }, []);
  const loadWidgets = useCallback(
    async (d: number, hidden: boolean) => {
      const r = await dashboardApi.widgets(d, hidden);
      if (r.ok && r.data) {
        setWidgets(r.data.widgets);
        setError('');
      } else setError(r.message);
    },
    [],
  );

  useEffect(() => {
    if (days === null) return;
    void loadSummary(days);
    // ระหว่างจัดวางที่ยังไม่บันทึก ไม่โหลดทับ draft
    if (!(edit && dirty)) void loadWidgets(days, edit && isAdmin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, edit]);

  if (error && !widgets) return <p role="alert" className="text-danger">{error}</p>;
  if (!ui || !summary || !widgets || days === null) return <Spinner />;
  const q = summary.queue;
  const range = RANGES.includes(days) ? RANGES : [...RANGES, days].sort((a, b) => a - b);

  const update = (next: WidgetWithResult[]) => {
    setWidgets(next);
    setDirty(true);
  };
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= widgets.length) return;
    const next = [...widgets];
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    update(next);
  };
  const patchW = (id: number, p: Partial<WidgetWithResult>) => update(widgets.map((w) => (w.id === id ? { ...w, ...p } : w)));

  function drop(targetId: number) {
    const from = dragId.current;
    dragId.current = null;
    setDragging(null);
    setOver(null);
    if (from === null || from === targetId) return;
    const a = widgets!.findIndex((w) => w.id === from);
    const b = widgets!.findIndex((w) => w.id === targetId);
    const next = [...widgets!];
    const [item] = next.splice(a, 1);
    next.splice(b, 0, item!);
    update(next);
  }

  async function enterEdit() {
    setEdit(true);
  }
  async function cancelEdit() {
    if (dirty && !(await popup.confirm({ message: 'ยังไม่ได้บันทึกการจัดวาง ต้องการทิ้งการเปลี่ยนแปลงหรือไม่?', danger: true, confirmText: 'ทิ้ง' }))) return;
    setDirty(false);
    setEdit(false);
    await loadWidgets(days!, false);
  }
  async function saveLayout() {
    if (!(await popup.confirm({ title: 'บันทึกการจัดวาง', message: 'การจัดวางนี้ใช้ร่วมกันทุกคนที่เปิด Dashboard ต้องการบันทึกหรือไม่?', confirmText: 'บันทึก' }))) return;
    setSaving(true);
    const res = await dashboardApi.layout(widgets!.map((w, i) => ({ id: w.id, sort_order: i + 1, width: w.width, is_active: w.is_active })));
    setSaving(false);
    if (!res.ok) return popup.warn(res.message);
    popup.success('บันทึกการจัดวางแล้ว');
    setDirty(false);
    setEdit(false);
    await loadWidgets(days!, false);
  }
  async function remove(w: WidgetWithResult) {
    if (!(await popup.confirm({ message: `ลบ widget "${w.title}" ?\nการลบมีผลกับทุกคน`, danger: true, confirmText: 'ลบ' }))) return;
    const res = await dashboardApi.remove(w.id);
    if (!res.ok) return popup.warn(res.message);
    setWidgets((cur) => (cur ?? []).filter((x) => x.id !== w.id));
  }
  async function afterBuilderSaved() {
    setBuilder(null);
    // บันทึก widget ลงฐานข้อมูลแล้ว → โหลดใหม่ (ถ้ามีการจัดวางค้างอยู่ ให้ผู้ใช้เห็นลำดับล่าสุดจากเซิร์ฟเวอร์)
    setDirty(false);
    await loadWidgets(days!, edit && isAdmin);
  }
  const exportAll = () => void dashboardApi.exportXlsx({ days: days! });

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-gradient-to-r from-hero-from to-hero-to px-7 py-6 text-white">
        <div>
          <h1 className="text-[26px] font-bold">สวัสดี {user?.full_name}</h1>
          <p className="text-[15px] opacity-90">
            ขณะนี้มีคิวรอ {q.waiting} ราย · เรียกแล้วรอยืนยัน {q.called} ราย
          </p>
        </div>
        <div role="group" aria-label="ช่วงเวลา" className="flex rounded-full bg-white/15 p-[3px]">
          {range.map((d) => (
            <button key={d} type="button" aria-pressed={d === days} onClick={() => setDays(d)} className={cn('rounded-full px-3.5 py-1.5 text-sm', d === days ? 'bg-white font-semibold text-primary-ink' : 'text-white hover:bg-white/10')}>
              {d} วัน
            </button>
          ))}
        </div>
      </section>

      {q.overdue > 0 && (
        <section role="alert" className="flex items-center gap-3 rounded-xl border border-warn-ink/25 bg-warn-soft px-4 py-3 text-[15px] text-warn-ink">
          <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
          <span>
            <b>{q.overdue} เคสเรียกแล้วเกิน {ui.confirm_timeout_hours} ชม.</b> ผู้ขอยังไม่ตอบ — ควรโทรตามเบอร์ที่ให้ไว้
          </span>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{edit ? 'โหมดจัดวาง: ลากการ์ดเพื่อสลับตำแหน่ง หรือใช้ปุ่มลูกศร' : `ข้อมูลนับจากช่วง ${days} วันล่าสุด`}</p>
        <div className="flex flex-wrap gap-2">
          {!edit && (
            <Button variant="outline" size="sm" onClick={exportAll}>
              <Download className="size-4" /> ส่งออก Excel ทั้งหน้า
            </Button>
          )}
          {isAdmin && !edit && (
            <Button variant="outline" size="sm" onClick={() => void enterEdit()}>
              <LayoutGrid className="size-4" /> จัดวาง Dashboard
            </Button>
          )}
          {isAdmin && edit && (
            <>
              <Button variant="outline" size="sm" onClick={() => setBuilder({ ...BLANK })}>
                <Plus className="size-4" /> เพิ่ม widget
              </Button>
              <Button variant="outline" size="sm" onClick={() => void cancelEdit()}>
                {dirty ? 'ยกเลิก' : 'เสร็จสิ้น'}
              </Button>
              <Button size="sm" disabled={!dirty} loading={saving} onClick={() => void saveLayout()}>
                บันทึกการจัดวาง
              </Button>
            </>
          )}
        </div>
      </div>

      {widgets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">ยังไม่มี widget บน Dashboard{isAdmin && ' — กด "จัดวาง Dashboard" แล้ว "เพิ่ม widget"'}</p>
      ) : (
        <section aria-label="Dashboard" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {widgets.map((w, i) => (
            <WidgetCard
              key={w.id}
              w={w}
              result={w.result}
              edit={edit}
              isAdmin={isAdmin}
              isFirst={i === 0}
              isLast={i === widgets.length - 1}
              dragging={dragging === w.id}
              dragOver={over === w.id && dragging !== w.id}
              onMove={(d) => move(i, d)}
              onWidth={(width) => patchW(w.id, { width })}
              onToggle={() => patchW(w.id, { is_active: !w.is_active })}
              onEdit={() => setBuilder(toInput(w))}
              onDuplicate={() => setBuilder(toInput(w, true))}
              onDelete={() => void remove(w)}
              onExport={() => void dashboardApi.exportXlsx({ days: days!, ids: [w.id] })}
              dnd={{
                draggable: true,
                onDragStart: () => {
                  dragId.current = w.id;
                  setDragging(w.id);
                },
                onDragOver: (e) => {
                  e.preventDefault();
                  setOver(w.id);
                },
                onDrop: () => drop(w.id),
                onDragEnd: () => {
                  dragId.current = null;
                  setDragging(null);
                  setOver(null);
                },
              }}
            />
          ))}
        </section>
      )}

      {builder && <WidgetBuilder open initial={builder} dashboardDays={days} onClose={() => setBuilder(null)} onSaved={() => void afterBuilderSaved()} />}
    </div>
  );
}
