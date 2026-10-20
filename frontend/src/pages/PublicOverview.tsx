/**
 * PublicOverview — หน้า "ภาพรวมคิว" ดูอย่างเดียว ไม่ต้องล็อกอิน (/admin/overview) · เฉพาะเครือข่ายภายใน
 *   - ไม่มีเมนู/ปุ่มแก้/ส่งออก/ชื่อผู้ใช้ — ตัวเลขรวมเท่านั้น (ไม่มีชื่อผู้ป่วย/เบอร์โทร)
 *   - รีเฟรชอัตโนมัติ (ปิด/1/2/5 นาที) + โหมดจอใหญ่ (ขยายตัวอักษร) + เต็มจอ สำหรับแขวนผนัง · เปิดด้วย ?tv=1 = จอใหญ่ + รีเฟรช 1 นาที
 *   - ผู้ดูแลยังไม่เปิดสวิตช์ / เปิดจากนอกวง → ขึ้นข้อความอธิบาย ไม่มีข้อมูลหลุด
 */
import { AlertTriangle, Maximize2, RefreshCw, ScreenShare } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import type { DashboardSummary, WidgetWithResult } from '../api/dashboardApi';
import { pubdashApi, type PubdashStatus } from '../api/pubdashApi';
import { PeriodPicker } from '../components/PeriodPicker';
import { Select } from '../components/Select';
import { Spinner } from '../components/Spinner';
import { WidgetCard } from '../components/widgets/WidgetCard';
import { cn } from '../lib/cn';
import { isValid, toParams, type PeriodChoice } from '../lib/period';
import { useSession } from '../lib/session';

const REFRESH_OPTIONS = [
  { value: '0', label: 'รีเฟรชเอง' },
  { value: '60', label: 'ทุก 1 นาที' },
  { value: '120', label: 'ทุก 2 นาที' },
  { value: '300', label: 'ทุก 5 นาที' },
];
const noop = () => undefined;
const noDnd = { draggable: false, onDragStart: noop, onDragOver: noop, onDrop: noop, onDragEnd: noop };

function stored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ไม่มี storage ก็ใช้ต่อได้ */
  }
}

export default function PublicOverview() {
  const { app, ready, user } = useSession();
  const [params] = useSearchParams();
  const tv = params.get('tv') === '1';
  const fromRoot = params.get('r') === '1'; // มาจากการพิมพ์ ip:พอร์ต เฉย ๆ
  const [status, setStatus] = useState<PubdashStatus | null>(null);
  const [blocked, setBlocked] = useState('');
  const [period, setPeriod] = useState<PeriodChoice | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [widgets, setWidgets] = useState<WidgetWithResult[] | null>(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState<Date | null>(null);
  const [refreshSec, setRefreshSec] = useState(tv ? '60' : stored('overview.refresh', '120'));
  const [big, setBig] = useState(tv || stored('overview.big', '0') === '1');

  useEffect(() => {
    void pubdashApi.status().then((r) => {
      if (r.ok && r.data) {
        setStatus(r.data);
        setPeriod({ kind: 'days', days: r.data.default_days });
      } else setBlocked(r.message || 'เปิดหน้านี้ไม่ได้');
    });
  }, []);

  // โหมดจอใหญ่ = ขยายตัวอักษรทั้งหน้า (Tailwind ใช้ rem) — คืนค่าเมื่อออกจากหน้า
  useEffect(() => {
    document.documentElement.style.fontSize = big ? '125%' : '';
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [big]);

  const load = useCallback(async (c: PeriodChoice) => {
    const r = await pubdashApi.data(toParams(c));
    if (r.ok && r.data) {
      setSummary(r.data.summary);
      setWidgets(r.data.widgets);
      setUpdated(new Date());
      setError('');
    } else setError(r.message || 'โหลดข้อมูลไม่สำเร็จ');
  }, []);

  useEffect(() => {
    if (!status?.enabled || period === null || !isValid(period)) return;
    void load(period);
    const sec = Number(refreshSec);
    if (!sec) return;
    const t = setInterval(() => void load(period), sec * 1000);
    return () => clearInterval(t);
  }, [status, period, refreshSec, load]);

  const header = (
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5 sm:px-6">
      <span className="text-lg font-bold text-primary">{status?.app_name ?? app.name}</span>
      <span className="text-muted-foreground">· ภาพรวมคิว</span>
      <span className="rounded-full bg-primary-soft px-3 py-1 text-xs text-primary">ดูอย่างเดียว · เฉพาะเครือข่ายโรงพยาบาล</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {status?.enabled && (
          <>
            <Select size="sm" aria-label="รีเฟรชอัตโนมัติ" className="w-auto min-w-[8.5rem]" icon={<RefreshCw className="size-4" aria-hidden="true" />} value={refreshSec} options={REFRESH_OPTIONS} onChange={(v) => { setRefreshSec(v); store('overview.refresh', v); }} />
            <button type="button" aria-pressed={big} onClick={() => { setBig(!big); store('overview.big', big ? '0' : '1'); }} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm', big ? 'border-primary bg-primary-soft text-primary' : 'border-border text-foreground hover:bg-muted')}>
              <ScreenShare className="size-4" aria-hidden="true" /> จอใหญ่
            </button>
            <button type="button" onClick={() => void document.documentElement.requestFullscreen?.().catch(noop)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted">
              <Maximize2 className="size-4" aria-hidden="true" /> เต็มจอ
            </button>
          </>
        )}
        <Link to="/" className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
          {user ? 'ไปหน้าหลัก' : 'เข้าสู่ระบบเจ้าหน้าที่'}
        </Link>
      </div>
    </header>
  );

  // พิมพ์ ip:พอร์ตเฉย ๆ: ล็อกอินค้างอยู่ → ไปหน้าหลักของตัวเอง · ยังไม่เปิดให้ดูโดยไม่ล็อกอิน/เปิดจากนอกวง → ไปหน้า login (ไม่ต้องเจอหน้าว่าง)
  if (fromRoot) {
    if (!ready) return <Spinner />;
    if (user) return <Navigate to="/" replace />;
    if (blocked || (status && !status.enabled)) return <Navigate to="/" replace />;
  }
  if (blocked || (status && !status.enabled)) {
    return (
      <div className="min-h-screen bg-background">
        {header}
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-foreground">{blocked ? 'เปิดหน้านี้ไม่ได้' : 'ยังไม่เปิดให้ดูภาพรวมโดยไม่ล็อกอิน'}</h1>
          <p className="mt-3 text-muted-foreground">{blocked || 'ผู้ดูแลระบบต้องเปิดสวิตช์ที่ ตั้งค่าระบบ → Dashboard ก่อน หรือเข้าสู่ระบบเจ้าหน้าที่เพื่อดู Dashboard เต็มรูปแบบ'}</p>
        </main>
      </div>
    );
  }
  if (!status || !period || (!summary && !error)) return <Spinner />;

  const q = summary?.queue;
  return (
    <div className="min-h-screen bg-background">
      {header}
      <main className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 sm:px-6">
        {error && !summary ? (
          <p role="alert" className="text-danger">{error}</p>
        ) : (
          q && (
            <>
              <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-gradient-to-r from-hero-from to-hero-to px-7 py-6 text-white">
                <div>
                  <h1 className="text-[26px] font-bold">ภาพรวมคิวขอเตียง</h1>
                  <p className="text-[15px] opacity-90">
                    ขณะนี้มีคิวรอ {q.waiting} ราย · เรียกแล้วรอยืนยัน {q.called} ราย{q.need_date > 0 ? ` · รอนัดวัน ${q.need_date} ราย` : ''}
                  </p>
                </div>
                <PeriodPicker value={period} onChange={setPeriod} extraDays={period.kind === 'days' ? [period.days] : []} />
              </section>

              {q.overdue > 0 && (
                <section role="status" className="flex items-center gap-3 rounded-xl border border-warn-ink/25 bg-warn-soft px-4 py-3 text-[15px] text-warn-ink">
                  <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
                  <span>
                    <b>{q.overdue} เคสรอการติดต่อกลับเกิน {status.confirm_timeout_hours} ชม.</b>
                  </span>
                </section>
              )}

              <p className="text-sm text-muted-foreground">
                ข้อมูลนับจากช่วง: {summary?.period_label}
                {updated && ` · อัปเดตล่าสุด ${updated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
                {error && <span role="alert" className="ml-2 text-danger">· {error} (แสดงข้อมูลชุดล่าสุด)</span>}
              </p>

              {widgets && widgets.length > 0 ? (
                <section aria-label="Dashboard" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
                  {widgets.map((w) => (
                    <WidgetCard key={w.id} w={w} result={w.result} edit={false} isAdmin={false} isFirst isLast dragging={false} dragOver={false} onMove={noop} onWidth={noop} onToggle={noop} onEdit={noop} onDuplicate={noop} onDelete={noop} dnd={noDnd} />
                  ))}
                </section>
              ) : (
                <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">ยังไม่มี widget บน Dashboard</p>
              )}
            </>
          )
        )}
      </main>
    </div>
  );
}
