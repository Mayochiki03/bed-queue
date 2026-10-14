/**
 * Home — หน้าหลัก = Dashboard: ทักทาย + เลือกช่วงเวลา + เตือนเกินเวลา + ตัวเลขสรุป + คิวตามสี + กราฟ
 * ข้อมูลมาจาก POST /api/dashboard/summary · กราฟที่แสดงตั้งได้ที่ "ตั้งค่าระบบ > Dashboard" (dashboard_widgets)
 * ช่วงเวลา 7/30/90 วันกดสลับได้ (ค่าเริ่มต้นจากตั้งค่า dashboard_default_days)
 */
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { dashboardApi, type DashboardSummary } from '../api/dashboardApi';
import { settingApi, type UiSettings } from '../api/settingApi';
import { HBars } from '../components/charts/HBars';
import { StackedBars } from '../components/charts/StackedBars';
import { SERIES, TrendChart } from '../components/charts/TrendChart';
import { cn } from '../lib/cn';
import { Spinner } from '../components/Spinner';
import { useLookups } from '../hooks/useLookups';
import { hasRole, useSession } from '../lib/session';

const RANGES = [7, 30, 90];
const NONE = '_NONE';

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 rounded-2xl border border-border bg-card p-5', className)}>
      <h2 className="mb-3 text-[17px] font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'primary' }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 sm:px-5 sm:py-4">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className={cn('font-display text-[30px] font-bold leading-tight sm:text-[34px]', tone === 'primary' && 'text-primary')}>{value}</div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

const Legend = ({ items }: { items: { label: string; color: string; line?: boolean }[] }) => (
  <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
    {items.map((i) => (
      <span key={i.label} className="flex items-center gap-1.5">
        <i className={cn('inline-block', i.line ? 'h-[3px] w-3.5 rounded' : 'size-2.5 rounded-[3px]')} style={{ background: i.color }} />
        {i.label}
      </span>
    ))}
  </div>
);

export default function Home() {
  const { user, app } = useSession();
  const lookups = useLookups();
  const [ui, setUi] = useState<UiSettings | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void settingApi.ui().then((r) => {
      if (r.ok && r.data) {
        setUi(r.data);
        setDays(r.data.dashboard_default_days);
      } else setError(r.message);
    });
  }, []);

  useEffect(() => {
    if (days === null) return;
    let cancelled = false;
    void dashboardApi.summary(days).then((r) => {
      if (cancelled) return;
      if (r.ok && r.data) {
        setData(r.data);
        setError('');
      } else setError(r.message);
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (error && !data) return <p role="alert" className="text-danger">{error}</p>;
  if (!ui || !data || days === null || !lookups.ready) return <Spinner />;

  const on = (w: string) => ui.dashboard_widgets.includes(w);
  const q = data.queue;
  const p = data.period;
  const closed = p.confirmed + p.declined + p.cancelled;
  const pct = (n: number) => (closed ? `${Math.round((n / closed) * 100)}%` : '-');
  const range = RANGES.includes(days) ? RANGES : [...RANGES, days].sort((a, b) => a - b);

  const colorRows = lookups.colors.filter((c) => c.is_active || q.by_color.some((b) => b.code === c.code));
  const stackedRows = data.hospitals.map((h) => ({
    key: h.hospital_id,
    label: h.name,
    total: h.total,
    parts: [...lookups.colors.map((c) => ({ code: c.code, label: c.label, color: c.color ?? '#6B7280', value: h.by_color[c.code] ?? 0 })), { code: NONE, label: 'ไม่ระบุสี', color: '#94a3b8', value: h.by_color[NONE] ?? 0 }],
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* ทักทาย + ช่วงเวลา */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-gradient-to-r from-hero-from to-hero-to px-7 py-6 text-white">
        <div>
          <h1 className="text-[26px] font-bold">สวัสดี {user?.full_name}</h1>
          <p className="text-[15px] opacity-90">
            ขณะนี้มีคิวรอ {q.waiting} ราย · เรียกแล้วรอยืนยัน {q.called} ราย
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div role="group" aria-label="ช่วงเวลา" className="flex rounded-full bg-white/15 p-[3px]">
            {range.map((d) => (
              <button key={d} type="button" aria-pressed={d === days} onClick={() => setDays(d)} className={cn('rounded-full px-3.5 py-1.5 text-sm', d === days ? 'bg-white font-semibold text-primary-ink' : 'text-white hover:bg-white/10')}>
                {d} วัน
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* เกินเวลา */}
      {q.overdue > 0 && (
        <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn-ink/25 bg-warn-soft px-4 py-3 text-warn-ink">
          <div className="flex items-center gap-3 text-[15px]">
            <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
            <span>
              <b>{q.overdue} เคสเรียกแล้วเกิน {ui.confirm_timeout_hours} ชม.</b> ผู้ขอยังไม่ตอบ — ควรโทรตามเบอร์ที่ให้ไว้
            </span>
          </div>
        </section>
      )}

      {/* ตัวเลขสรุป */}
      {on('summary') && (
        <section aria-label="สรุป" className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 sm:gap-3.5">
          <Stat label="รอคิว" value={q.waiting} note="รายที่ยังไม่ถูกเรียก" />
          <Stat label="เรียกแล้ว รอยืนยัน" value={q.called} note={q.overdue > 0 ? <span className="font-semibold text-warn-ink">เกินเวลา {q.overdue} ราย</span> : 'ไม่มีเคสเกินเวลา'} />
          <Stat label={`ยืนยันส่งตัว (${days} วัน)`} value={p.confirmed} tone="primary" note={p.avg_days_to_confirm !== null ? `เฉลี่ย ${p.avg_days_to_confirm} วันจากส่งคำขอ` : 'ยังไม่มีข้อมูลระยะเวลา'} />
          <Stat label="ไม่ยืนยัน / ยกเลิก" value={p.declined + p.cancelled} note={`ไม่ยืนยัน ${p.declined} · ยกเลิก ${p.cancelled}`} />
        </section>
      )}

      {/* คิวตามสี */}
      {on('color') && (
        <Card title="คิวที่รออยู่ ตามสี">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {colorRows.map((c) => {
              const row = q.by_color.find((b) => b.code === c.code);
              return (
                <div key={c.code} className="rounded-xl bg-muted px-3.5 py-3" style={{ borderLeft: `6px solid ${c.color ?? '#6B7280'}` }}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{c.label}</span>
                    <span className="font-display text-[26px] font-bold">{row?.count ?? 0}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{row && row.oldest_days !== null ? `รอนานสุด ${row.oldest_days} วัน` : 'ไม่มีคิวค้าง'}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* กราฟ */}
      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-3.5">
        {on('trend') && (
          <Card title="คำขอรายวัน: ส่งเข้า เทียบ ยืนยันส่งตัว">
            <Legend
              items={[
                { label: 'ส่งคำขอ', color: SERIES.submitted, line: true },
                { label: 'ยืนยันส่งตัว', color: SERIES.confirmed, line: true },
              ]}
            />
            <TrendChart data={data.trend} />
          </Card>
        )}

        {(on('hospital') || on('hospital_color')) && (
          <Card title="โรงพยาบาลที่ส่งเคสมากสุด">
            {data.hospitals.length === 0 ? (
              <Empty />
            ) : on('hospital_color') ? (
              <>
                <Legend items={lookups.colors.map((c) => ({ label: c.label, color: c.color ?? '#6B7280' }))} />
                <StackedBars rows={stackedRows} />
              </>
            ) : (
              <HBars rows={data.hospitals.map((h) => ({ key: String(h.hospital_id), label: h.name, value: h.total, text: `${h.total} ราย` }))} />
            )}
          </Card>
        )}

        {on('substance') && (
          <Card title="ประเภทสารเสพติด (จำนวนคำขอ)">
            {data.substances.length === 0 ? <Empty /> : <HBars rows={data.substances.map((s) => ({ key: s.code, label: s.code === NONE ? 'ไม่ระบุ' : lookups.label('SUBSTANCE', s.code), value: s.submitted, text: `${s.submitted} ราย` }))} />}
          </Card>
        )}

        {on('duration') && (
          <Card title="เฉลี่ยกี่วันจนยืนยัน แยกตามสารเสพติด">
            {p.avg_days_to_confirm === null ? (
              <Empty />
            ) : (
              <>
                <p className="mb-3 text-[13px] text-muted-foreground">
                  เร็วสุด {p.min_days_to_confirm} วัน · ช้าสุด {p.max_days_to_confirm} วัน (ทุกสาร)
                </p>
                <HBars rows={data.substances.filter((s) => s.avg_days !== null).map((s) => ({ key: s.code, label: s.code === NONE ? 'ไม่ระบุ' : lookups.label('SUBSTANCE', s.code), value: s.avg_days!, text: `${s.avg_days} วัน` }))} />
              </>
            )}
          </Card>
        )}

        {on('status') && (
          <Card title={`ผลลัพธ์ของคำขอที่ปิดแล้ว (${days} วัน)`}>
            {closed === 0 ? (
              <Empty />
            ) : (
              <>
                <div className="my-4 flex h-[26px] gap-0.5" role="img" aria-label={`ยืนยัน ${p.confirmed} ไม่ยืนยัน ${p.declined} ยกเลิก ${p.cancelled}`}>
                  {[
                    { n: p.confirmed, c: 'var(--primary)' },
                    { n: p.declined, c: '#475569' },
                    { n: p.cancelled, c: '#cbd5e1' },
                  ]
                    .filter((s) => s.n > 0)
                    .map((s, i, arr) => (
                      <b key={s.c} className="block min-w-[3px]" style={{ flex: `${s.n} 1 0`, background: s.c, borderRadius: `${i === 0 ? 6 : 0}px ${i === arr.length - 1 ? 6 : 0}px ${i === arr.length - 1 ? 6 : 0}px ${i === 0 ? 6 : 0}px` }} />
                    ))}
                </div>
                <div className="flex flex-col gap-2 text-sm">
                  {[
                    { l: 'ยืนยันส่งตัว', n: p.confirmed, c: 'var(--primary)' },
                    { l: 'ไม่ยืนยัน', n: p.declined, c: '#475569' },
                    { l: 'ยกเลิก', n: p.cancelled, c: '#cbd5e1' },
                  ].map((s) => (
                    <div key={s.l} className="flex justify-between">
                      <span className="flex items-center gap-2">
                        <i className="inline-block size-2.5 rounded-[3px]" style={{ background: s.c }} />
                        {s.l}
                      </span>
                      <span>
                        <b>{s.n}</b> · {pct(s.n)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        )}
      </section>

      <p className="text-xs text-faint">
        {app.name} · ข้อมูลนับจากคำขอที่ส่งเข้ามาในช่วง {days} วันล่าสุด
        {hasRole(user?.role, 'ADMIN') && (
          <>
            {' · '}
            <Link to="/setting" className="inline-flex items-center gap-1 text-primary hover:underline">
              เลือกกราฟที่แสดง <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

const Empty = () => <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลในช่วงเวลานี้</p>;
