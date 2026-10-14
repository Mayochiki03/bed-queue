/**
 * SettingPage — ตั้งค่าระบบ แยกเป็นหมวด อ่านง่าย: เมนูหมวดด้านข้าง · แต่ละค่ามีคำอธิบาย + หน่วย · แถบบันทึกลอยด้านล่างเมื่อมีการแก้
 * ปุ่ม "ทดสอบ" ใช้เช็คว่าระบบพร้อม (ฐานข้อมูล/การเข้ารหัส/เวลา และสำหรับนักพัฒนา: Public URL, LINE token)
 * ค่าลับ (token/secret) ไม่แสดงค่าเดิม เว้นว่าง = ใช้ค่าเดิม · หมวดเชื่อมต่อ LINE เห็นเฉพาะนักพัฒนา (backend กรองให้)
 */
import { CheckCircle2, Clock, Database, FlaskConical, KeyRound, LayoutDashboard, ListOrdered, MessageSquare, Plug, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { settingApi, type SettingItem, type TestKind, type TestResult } from '../../api/settingApi';
import { Button } from '../../components/Button';
import { PageTitle } from '../../components/PageCard';
import { usePopup } from '../../components/Popup';
import { Spinner } from '../../components/Spinner';
import { cn } from '../../lib/cn';
import { hasRole, useSession } from '../../lib/session';
import { MSG } from '../../lib/messages';

const CATEGORY: Record<string, { label: string; desc: string; icon: LucideIcon }> = {
  queue: { label: 'คิว', desc: 'กติกาเวลารอและการแสดงลำดับคิว', icon: ListOrdered },
  dashboard: { label: 'Dashboard', desc: 'ค่าเริ่มต้นของหน้าหลัก (จัดวางกราฟทำได้ที่หน้าหลักโดยตรง)', icon: LayoutDashboard },
  requester: { label: 'หน้าผู้ขอ (PDPA)', desc: 'ข้อความที่ผู้ขอเห็นตอนลงทะเบียน', icon: ShieldCheck },
  line: { label: 'โควต้าข้อความ LINE', desc: 'ควบคุมไม่ให้ข้อความเกินโควต้ารายเดือน', icon: MessageSquare },
  connection: { label: 'เชื่อมต่อ LINE (นักพัฒนา)', desc: 'โหมด/URL/คีย์ของ LINE — ค่าลับเก็บแบบเข้ารหัส', icon: Plug },
};
const UNIT: Record<string, string> = { confirm_timeout_hours: 'ชั่วโมง', dashboard_default_days: 'วัน', dashboard_top_n: 'อันดับ', line_monthly_quota: 'ข้อความ/เดือน', line_quota_warn_pct: '%' };

const inputClass = 'w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30';

type TestDef = { kind: TestKind; label: string; desc: string; icon: LucideIcon; dev?: boolean };
const TESTS: TestDef[] = [
  { kind: 'database', label: 'ฐานข้อมูล', desc: 'ลองคำสั่งง่าย ๆ และวัดเวลาตอบกลับ', icon: Database },
  { kind: 'encryption', label: 'การเข้ารหัสค่าลับ', desc: 'เข้ารหัส-ถอดรหัสตัวอย่าง ตรวจกุญแจ APP_SECRET_KEY', icon: KeyRound },
  { kind: 'time', label: 'เวลาเซิร์ฟเวอร์', desc: 'ดูเวลาไทยและเขตเวลา (ผลต่อ "รอมากี่ชั่วโมง")', icon: Clock },
  { kind: 'public_url', label: 'Public URL', desc: 'เรียก /api/health ผ่าน URL ที่ตั้งไว้', icon: Plug, dev: true },
  { kind: 'line_token', label: 'LINE Channel Token', desc: 'ถาม LINE ว่า Token นี้ใช้ได้ไหม (ไม่ส่งข้อความ ไม่กินโควต้า)', icon: MessageSquare, dev: true },
];

export default function SettingPage() {
  const popup = usePopup();
  const { user } = useSession();
  const isDev = hasRole(user?.role, 'DEV');
  const [items, setItems] = useState<SettingItem[] | null>(null);
  const [edited, setEdited] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState('queue');
  const [results, setResults] = useState<Partial<Record<TestKind, TestResult & { at: string }>>>({});
  const [running, setRunning] = useState<TestKind | null>(null);

  async function load() {
    const res = await settingApi.list();
    if (res.ok && res.data) {
      setItems(res.data);
      setEdited({});
    } else popup.error(res.message);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, SettingItem[]>();
    for (const i of items ?? []) map.set(i.category, [...(map.get(i.category) ?? []), i]);
    return [...map.entries()];
  }, [items]);

  if (!items) return <Spinner />;
  const dirtyKeys = Object.keys(edited);
  const dirty = dirtyKeys.length > 0;
  const valueOf = (i: SettingItem) => (i.key in edited ? edited[i.key]! : i.value);
  const set = (key: string, v: string | number | boolean) => setEdited((e) => ({ ...e, [key]: v }));
  const tabs = [...groups.map(([c]) => c), 'test'];
  const current = tabs.includes(active) ? active : tabs[0]!;

  async function handleSave() {
    if (!(await popup.confirm({ title: MSG.confirmSaveTitle, message: `บันทึกการตั้งค่า ${dirtyKeys.length} รายการ?`, confirmText: MSG.save }))) return;
    setSaving(true);
    const res = await settingApi.save(edited).finally(() => setSaving(false));
    if (res.ok) {
      popup.success(res.message || MSG.saved);
      await load();
    } else popup.warn(res.message);
  }

  async function runTest(kind: TestKind) {
    if (dirty && (kind === 'public_url' || kind === 'line_token')) {
      popup.warn('มีค่าที่แก้ไว้แต่ยังไม่ได้บันทึก — การทดสอบใช้ค่าที่บันทึกแล้วเท่านั้น กรุณากดบันทึกก่อน');
      return;
    }
    setRunning(kind);
    const res = await settingApi.test(kind).finally(() => setRunning(null));
    const out: TestResult = res.ok && res.data ? res.data : { ok: false, title: 'ทดสอบไม่สำเร็จ', detail: res.message };
    setResults((r) => ({ ...r, [kind]: { ...out, at: new Date().toLocaleTimeString('th-TH') } }));
  }

  function renderInput(i: SettingItem) {
    const v = valueOf(i);
    const id = `set_${i.key}`;
    if (i.options)
      return (
        <select id={id} className={inputClass} value={String(v)} onChange={(e) => set(i.key, e.target.value)}>
          {i.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    if (i.type === 'BOOL')
      return (
        <button type="button" role="switch" id={id} aria-checked={!!v} onClick={() => set(i.key, !v)} className={cn('relative h-7 w-12 rounded-full transition-colors', v ? 'bg-primary' : 'bg-border')}>
          <span className={cn('absolute top-0.5 size-6 rounded-full bg-white shadow transition-all', v ? 'left-[22px]' : 'left-0.5')} />
        </button>
      );
    if (i.type === 'TEXT') return <textarea id={id} rows={5} className={inputClass} value={String(v)} onChange={(e) => set(i.key, e.target.value)} />;
    if (i.type === 'INT')
      return (
        <div className="flex items-center gap-2">
          <input id={id} type="number" min={i.min ?? undefined} max={i.max ?? undefined} className={cn(inputClass, 'max-w-[10rem]')} value={String(v)} onChange={(e) => set(i.key, e.target.value)} />
          {UNIT[i.key] && <span className="text-sm text-muted-foreground">{UNIT[i.key]}</span>}
          {i.min !== null && i.max !== null && <span className="hidden text-xs text-faint sm:inline">({i.min}–{i.max})</span>}
        </div>
      );
    if (i.type === 'SECRET')
      return (
        <div className="flex flex-wrap items-center gap-2">
          <input id={id} type="password" autoComplete="new-password" className={cn(inputClass, 'min-w-0 flex-1')} value={i.key in edited ? String(v) : ''} placeholder={i.is_set ? '•••••••• เว้นว่าง = ใช้ค่าเดิม' : 'ยังไม่ได้ตั้งค่า'} onChange={(e) => set(i.key, e.target.value)} />
          <span className={cn('rounded-full px-2.5 py-1 text-xs', i.is_set ? 'bg-success-soft text-success-ink' : 'bg-muted text-muted-foreground')}>{i.is_set ? 'ตั้งค่าแล้ว' : 'ยังไม่ตั้ง'}</span>
        </div>
      );
    return <input id={id} className={inputClass} value={String(v)} onChange={(e) => set(i.key, e.target.value)} />;
  }

  const meta = (c: string) => CATEGORY[c] ?? { label: c, desc: '', icon: FlaskConical };
  const list = groups.find(([c]) => c === current)?.[1] ?? [];

  return (
    <>
      <PageTitle hint="แก้แล้วกดบันทึกที่แถบด้านล่าง · ปุ่ม “ทดสอบระบบ” ใช้เช็คว่าทุกอย่างพร้อมก่อนเปิดใช้งานจริง">ตั้งค่าระบบ</PageTitle>
      <div className="grid gap-4 pb-24 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="หมวดตั้งค่า" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {tabs.map((c) => {
            const m = c === 'test' ? { label: 'ทดสอบระบบ', icon: FlaskConical, desc: '' } : meta(c);
            const Icon = m.icon;
            const n = c === 'test' ? 0 : (groups.find(([k]) => k === c)?.[1] ?? []).filter((i) => i.key in edited).length;
            return (
              <button key={c} type="button" aria-current={c === current} onClick={() => setActive(c)} className={cn('flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm', c === current ? 'border-primary bg-primary-soft font-semibold text-primary-ink' : 'border-border bg-card hover:bg-muted')}>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 whitespace-nowrap">{m.label}</span>
                {n > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{n}</span>}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {current !== 'test' ? (
            <section className="rounded-2xl border border-border bg-card">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-lg font-semibold">{meta(current).label}</h2>
                {meta(current).desc && <p className="text-sm text-muted-foreground">{meta(current).desc}</p>}
              </header>
              <div className="divide-y divide-border">
                {list.map((i) => (
                  <div key={i.key} className={cn('grid gap-2 px-5 py-4', i.type === 'TEXT' ? '' : 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center md:gap-6')}>
                    <div>
                      <label htmlFor={`set_${i.key}`} className="text-sm font-medium">
                        {i.label}
                        {i.key in edited && <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-xs text-warn-ink">แก้ไขแล้ว</span>}
                      </label>
                      {i.hint && <p className="mt-0.5 text-xs text-muted-foreground">{i.hint}</p>}
                    </div>
                    <div>{renderInput(i)}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-border bg-card">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-lg font-semibold">ทดสอบระบบ</h2>
                <p className="text-sm text-muted-foreground">กดทดสอบทีละข้อ ไม่เปลี่ยนแปลงข้อมูลและไม่ส่งข้อความหาใคร</p>
              </header>
              <div className="divide-y divide-border">
                {TESTS.filter((t) => !t.dev || isDev).map((t) => {
                  const r = results[t.kind];
                  const Icon = t.icon;
                  return (
                    <div key={t.kind} className="flex flex-wrap items-start gap-3 px-5 py-4">
                      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{t.label}</div>
                        <p className="text-xs text-muted-foreground">{t.desc}</p>
                        {r && (
                          <div data-testid={`test-${t.kind}`} className={cn('mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-sm', r.ok ? 'bg-success-soft text-success-ink' : 'bg-danger/10 text-danger')}>
                            {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
                            <div>
                              <b>{r.title}</b>
                              <p className="text-xs opacity-90">{r.detail}</p>
                              <p className="text-xs opacity-60">ทดสอบเมื่อ {r.at}</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <Button variant="outline" size="sm" loading={running === t.kind} onClick={() => void runTest(t.kind)}>
                        ทดสอบ
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm">มีการแก้ไข {dirtyKeys.length} รายการที่ยังไม่ได้บันทึก</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEdited({})}>
                {MSG.reset}
              </Button>
              <Button loading={saving} onClick={() => void handleSave()}>
                {MSG.save}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
