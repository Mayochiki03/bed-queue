/**
 * NotificationPage — ข้อความแจ้งเตือน LINE ถึงผู้ขอ (ADMIN ขึ้นไป) หน้าตาตามระบบจองคิวนวด
 *   แท็บ "ข้อความ"       : สวิตช์เปิด/ปิดทีละชนิด + แก้หัวข้อ/ข้อความ + ตัวอย่างที่ผู้ขอจะเห็น (กดตัวแปรเพื่อแทรกลงข้อความ)
 *   แท็บ "ประวัติการส่ง" : ทุกครั้งที่ระบบส่ง/ไม่ได้ส่ง (พร้อมเหตุผล) + กรองตามผลลัพธ์
 *   แถบสรุปด้านบน        : ใช้โควต้าเดือนนี้เท่าไร + สถานะ "ส่งจริง / โหมดทดสอบ"
 */
import { AlertTriangle, BellRing, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { notificationApi, type NotifyLog, type NotifySummary, type NotifyTemplate, type TemplateVar } from '../../api/notificationApi';
import { Button } from '../../components/Button';
import { DataTable, type Column } from '../../components/DataTable';
import { FilterSelect } from '../../components/Fields';
import { PageCard, PageTitle } from '../../components/PageCard';
import { Pagination } from '../../components/Pagination';
import { usePopup } from '../../components/Popup';
import { Spinner } from '../../components/Spinner';
import { Switch } from '../../components/Switch';
import { useTableData } from '../../hooks/useTableData';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';

const STATUS: Record<NotifyLog['status'], { label: string; cls: string }> = {
  SENT: { label: 'ส่งแล้ว', cls: 'bg-success-soft text-success-ink' },
  FAILED: { label: 'ส่งไม่สำเร็จ', cls: 'bg-danger-soft text-danger-ink' },
  SKIPPED: { label: 'ไม่ได้ส่ง', cls: 'bg-neutral-soft text-neutral-ink' },
};

export default function NotificationPage() {
  const [tab, setTab] = useState<'templates' | 'logs'>('templates');
  const [summary, setSummary] = useState<NotifySummary | null>(null);
  useEffect(() => {
    void notificationApi.summary().then((r) => r.ok && setSummary(r.data));
  }, [tab]);

  return (
    <>
      <PageTitle hint="ข้อความที่ระบบส่งหาผู้ขอทาง LINE — เลือกได้ว่าจะแจ้งเรื่องไหน ไม่แจ้งเรื่องไหน (ชนิดที่ปิดจะไม่ส่งและไม่กินโควต้า)">ข้อความแจ้งเตือน</PageTitle>
      {summary && <SummaryBar s={summary} />}
      <div role="tablist" className="mb-4 inline-flex rounded-lg border border-border bg-muted p-1 text-sm">
        {(
          [
            ['templates', 'ข้อความ'],
            ['logs', 'ประวัติการส่ง'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('rounded-md px-4 py-1.5', tab === k ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'templates' ? <Templates onSaved={() => void notificationApi.summary().then((r) => r.ok && setSummary(r.data))} /> : <Logs />}
    </>
  );
}

/** แถบสรุป: โควต้าเดือนนี้ + โหมด */
function SummaryBar({ s }: { s: NotifySummary }) {
  const pct = s.quota > 0 ? Math.min(100, Math.round((s.sent / s.quota) * 100)) : 0;
  return (
    <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground">โควต้าข้อความ LINE เดือนนี้</span>
          <span className="text-sm text-muted-foreground">
            <b className="font-display text-lg text-foreground">{s.sent}</b> / {s.quota > 0 ? s.quota : 'ไม่จำกัด'} ข้อความ
          </span>
        </div>
        {s.quota > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="โควต้าที่ใช้ไป">
            <div className={cn('h-full rounded-full', s.near_limit ? 'bg-danger' : 'bg-primary')} style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>ส่งไม่สำเร็จ {s.failed}</span>
          <span>ไม่ได้ส่ง {s.skipped}</span>
          {s.near_limit && (
            <span className="inline-flex items-center gap-1 text-danger-ink">
              <AlertTriangle className="size-3.5" aria-hidden />
              ใช้เกิน {s.warn_pct}% ของโควต้าแล้ว ระบบจะหยุดส่งเมื่อเต็ม
            </span>
          )}
        </div>
      </div>
      <div className={cn('rounded-lg border p-4 text-sm', s.live ? 'border-success-ink/30 bg-success-soft text-success-ink' : 'border-warn-ink/30 bg-warn-soft text-warn-ink')}>
        <div className="flex items-center gap-2 font-semibold">
          <BellRing className="size-4" aria-hidden />
          {s.live ? 'ส่งจริงผ่าน LINE' : 'ยังไม่ส่งจริง (โหมดทดสอบ)'}
        </div>
        <p className="mt-1 text-xs opacity-90">{s.live ? `โหมด ${s.mode} · ตั้ง Token แล้ว` : s.mode === 'LOCAL' ? 'โหมด LOCAL: ระบบจดประวัติแต่ไม่ส่งข้อความจริง ให้นักพัฒนาตั้งค่าที่เมนู "การเชื่อมต่อ LINE"' : 'ยังไม่ได้ตั้ง Channel Access Token'}</p>
      </div>
    </div>
  );
}

function Templates({ onSaved }: { onSaved: () => void }) {
  const popup = usePopup();
  const [data, setData] = useState<{ templates: NotifyTemplate[]; vars: TemplateVar[] } | null>(null);
  const load = () => notificationApi.templates().then((r) => (r.ok && r.data ? setData(r.data) : popup.error(r.message)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!data) return <Spinner />;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {data.templates.map((t) => (
        <TemplateCard
          key={t.type}
          t={t}
          vars={data.vars}
          onSaved={() => {
            void load();
            onSaved();
          }}
        />
      ))}
    </div>
  );
}

function TemplateCard({ t, vars, onSaved }: { t: NotifyTemplate; vars: TemplateVar[]; onSaved: () => void }) {
  const popup = usePopup();
  const [form, setForm] = useState({ title: t.title, body: t.body, is_enabled: t.is_enabled });
  const [saving, setSaving] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setForm({ title: t.title, body: t.body, is_enabled: t.is_enabled }), [t]);
  const dirty = form.title !== t.title || form.body !== t.body || form.is_enabled !== t.is_enabled;

  const preview = (text: string) => text.replace(/\{(\w+)\}/g, (m, k: string) => vars.find((v) => v.key === k)?.sample ?? m);
  /** แทรกตัวแปรที่ตำแหน่งเคอร์เซอร์ */
  const insert = (key: string) => {
    const el = area.current;
    const at = el?.selectionStart ?? form.body.length;
    const end = el?.selectionEnd ?? at;
    const next = `${form.body.slice(0, at)}{${key}}${form.body.slice(end)}`;
    setForm({ ...form, body: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + key.length + 2, at + key.length + 2);
    });
  };

  async function save() {
    if (!(await popup.confirm({ title: 'ยืนยันการบันทึก', message: `บันทึกข้อความ "${t.name}"?${form.is_enabled ? '' : '\nชนิดนี้ถูกปิด ระบบจะไม่ส่งข้อความนี้'}`, confirmText: 'บันทึก' }))) return;
    setSaving(true);
    const res = await notificationApi.save({ type: t.type, ...form }).finally(() => setSaving(false));
    if (res.ok) {
      popup.success(res.message);
      onSaved();
    } else popup.error(res.message);
  }

  return (
    <PageCard className={cn(!form.is_enabled && 'bg-muted/30')}>
      <Switch checked={form.is_enabled} onChange={(v) => setForm({ ...form, is_enabled: v })} label={t.name} description={t.when} />
      <div className={cn('mt-4 flex flex-col gap-3', !form.is_enabled && 'opacity-60')}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          หัวข้อ
          <input value={form.title} maxLength={100} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-md border border-border bg-card px-3 py-2 text-sm font-normal focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          ข้อความ
          <textarea ref={area} rows={4} value={form.body} maxLength={1500} onChange={(e) => setForm({ ...form, body: e.target.value })} className="rounded-md border border-border bg-card px-3 py-2 text-sm font-normal focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30" />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">แทรกตัวแปร:</span>
          {vars.map((v) => (
            <button key={v.key} type="button" title={`${v.label} เช่น ${v.sample}`} onClick={() => insert(v.key)} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-primary-ink hover:bg-primary-soft">
              {v.label}
            </button>
          ))}
        </div>
        <div className="rounded-lg bg-muted px-4 py-3">
          <div className="text-xs text-muted-foreground">ตัวอย่างที่ผู้ขอจะเห็น</div>
          <div className="mt-1 font-display font-semibold text-foreground">{form.title}</div>
          <p className="mt-1 whitespace-pre-line text-sm text-foreground">{preview(form.body)}</p>
        </div>
      </div>
      {dirty && (
        <div className="mt-4 flex gap-2">
          <Button size="sm" loading={saving} onClick={() => void save()}>
            <Save className="size-4" />
            บันทึก
          </Button>
          <Button size="sm" variant="outline" onClick={() => setForm({ title: t.title, body: t.body, is_enabled: t.is_enabled })}>
            ยกเลิกการแก้
          </Button>
        </div>
      )}
    </PageCard>
  );
}

function Logs() {
  const table = useTableData(notificationApi.logs, { status: '', type: '' });
  const columns: Column<NotifyLog>[] = [
    { header: 'เวลา', cell: (r) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(r.created_at)}</span> },
    { header: 'ชนิด', cell: (r) => r.type },
    { header: 'เลขที่คำขอ', cell: (r) => r.request_no ?? '-', className: 'hidden sm:table-cell' },
    { header: 'ผล', cell: (r) => <span className={cn('whitespace-nowrap rounded px-2 py-0.5 text-xs', STATUS[r.status].cls)}>{STATUS[r.status].label}</span> },
    { header: 'หมายเหตุ', cell: (r) => <span className="text-muted-foreground">{r.error_message ?? ''}</span>, className: 'hidden md:table-cell' },
  ];
  return (
    <PageCard title="ประวัติการส่ง">
      <div className="mb-3 grid gap-3 sm:max-w-md sm:grid-cols-2">
        <FilterSelect
          label="ผลลัพธ์"
          value={table.draft.status}
          onChange={(v) => {
            table.setDraft('status', v);
          }}
          options={[
            { value: 'SENT', label: 'ส่งแล้ว' },
            { value: 'FAILED', label: 'ส่งไม่สำเร็จ' },
            { value: 'SKIPPED', label: 'ไม่ได้ส่ง' },
          ]}
        />
        <div className="flex items-end gap-2">
          <Button onClick={table.search}>ค้นหา</Button>
          <Button variant="outline" onClick={table.reset}>
            ล้างค่า
          </Button>
        </div>
      </div>
      <DataTable columns={columns} rows={table.rows} rowKey={(r) => r.id} loading={table.loading} />
      <Pagination paging={table.paging} onPage={table.goPage} onPageSize={table.changePageSize} />
    </PageCard>
  );
}
