/**
 * ConnectionPage — เมนูนักพัฒนา: การเชื่อมต่อ LINE / อินเทอร์เน็ต (DEV เท่านั้น) จัดหน้าตามระบบจองคิวนวด
 *   ซ้าย  : โหมดการทำงาน (3 ใบ) + ค่าการเชื่อมต่อ (Public URL, LIFF, Channel ID, Secret, Token)
 *   ขวา   : แผงทดสอบ (Public URL / Token / โควต้า / ส่งข้อความทดสอบ) + ขั้นตอนตั้งค่า LINE
 *   ค่าลับไม่แสดงค่าเดิม เว้นว่าง = ใช้ค่าเดิม · การทดสอบใช้ค่าที่บันทึกแล้วเท่านั้น
 */
import { CircleCheck, CircleX, Gauge, Globe, KeyRound, Save, Send, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { settingApi, type SettingItem, type TestKind, type TestResult } from '../../api/settingApi';
import { Button } from '../../components/Button';
import { PageCard, PageTitle } from '../../components/PageCard';
import { usePopup } from '../../components/Popup';
import { Spinner } from '../../components/Spinner';
import { cn } from '../../lib/cn';

const MODES = [
  { value: 'LOCAL', label: 'LOCAL', desc: 'พัฒนาบนเครื่อง ยังไม่ต่อ LINE ทดสอบฝั่งผู้ขอผ่านเมนูผู้ขอจำลอง ข้อความแจ้งเตือนจดประวัติแต่ไม่ส่งจริง' },
  { value: 'DEV_TUNNEL', label: 'DEV_TUNNEL', desc: 'ทดสอบบนมือถือจริงกับ LINE OA ทดสอบ ผ่าน Cloudflare Tunnel ชั่วคราว (URL เปลี่ยนทุกครั้งที่รัน)' },
  { value: 'PRODUCTION', label: 'PRODUCTION', desc: 'ใช้งานจริงกับ LINE OA ของโรงพยาบาล ผ่าน Cloudflare Tunnel ถาวร' },
];
const inputClass = 'w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30';

type Out = (TestResult & { loading?: false }) | { loading: true };

export default function ConnectionPage() {
  const popup = usePopup();
  const [items, setItems] = useState<SettingItem[] | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [tests, setTests] = useState<Partial<Record<TestKind, Out>>>({});
  const [pushTo, setPushTo] = useState('');

  async function load() {
    const r = await settingApi.list(['connection']);
    if (r.ok && r.data) {
      setItems(r.data);
      setEdited({});
    } else popup.error(r.message);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!items) return <Spinner />;

  const item = (k: string) => items.find((i) => i.key === k)!;
  const val = (k: string) => (k in edited ? edited[k]! : String(item(k).value ?? ''));
  const set = (k: string, v: string) => setEdited((e) => ({ ...e, [k]: v }));
  const dirty = Object.keys(edited).length > 0;
  const savedMode = String(item('connection_mode').value);

  async function save() {
    if (!(await popup.confirm({ title: 'ยืนยันการบันทึก', message: `บันทึกการเชื่อมต่อ ${Object.keys(edited).length} รายการ?${'connection_mode' in edited ? `\nโหมดจะเปลี่ยนเป็น ${edited.connection_mode}` : ''}`, confirmText: 'บันทึก' }))) return;
    setSaving(true);
    const r = await settingApi.save(edited).finally(() => setSaving(false));
    if (r.ok) {
      popup.success(r.message);
      await load();
    } else popup.warn(r.message);
  }

  async function test(kind: TestKind) {
    if (dirty) return popup.warn('มีค่าที่แก้ไว้แต่ยังไม่ได้บันทึก — การทดสอบใช้ค่าที่บันทึกแล้วเท่านั้น กรุณากดบันทึกก่อน');
    setTests((t) => ({ ...t, [kind]: { loading: true } }));
    const r = await settingApi.test(kind, kind === 'line_push' ? pushTo : undefined);
    setTests((t) => ({ ...t, [kind]: r.ok && r.data ? r.data : { ok: false, title: 'ทดสอบไม่สำเร็จ', detail: r.fields?.line_user_id ?? r.message } }));
  }

  const row = (kind: TestKind, Icon: LucideIcon, label: string, desc: string, disabled = false) => {
    const r = tests[kind];
    return (
      <li className="flex flex-wrap items-start gap-3 rounded-lg border border-border px-4 py-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">{label}</div>
          <p className="text-xs text-muted-foreground">{desc}</p>
          {r && !r.loading && (
            <div data-testid={`test-${kind}`} className={cn('mt-2 flex items-start gap-1.5 text-sm', r.ok ? 'text-success-ink' : 'text-danger-ink')}>
              {r.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />}
              <div>
                <b>{r.title}</b>
                <p className="text-xs opacity-90">{r.detail}</p>
              </div>
            </div>
          )}
        </div>
        <Button size="sm" variant="outline" loading={r?.loading} disabled={disabled} onClick={() => void test(kind)}>
          ทดสอบ
        </Button>
      </li>
    );
  };

  const field = (k: string, label: string, hint?: string, extra?: { secret?: boolean; placeholder?: string }) => {
    const it = item(k);
    return (
      <label key={k} className="flex flex-col gap-1 text-sm font-medium">
        <span>
          {label}
          {k in edited && <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-xs font-normal text-warn-ink">แก้ไขแล้ว</span>}
        </span>
        <input
          type={extra?.secret ? 'password' : 'text'}
          autoComplete="off"
          className={cn(inputClass, 'font-normal')}
          value={extra?.secret ? (k in edited ? edited[k]! : '') : val(k)}
          placeholder={extra?.secret ? (it.is_set ? '•••••••• เว้นว่าง = ใช้ค่าเดิม' : 'ยังไม่ได้ตั้งค่า') : extra?.placeholder}
          onChange={(e) => set(k, e.target.value)}
        />
        <span className="text-xs font-normal text-muted-foreground">{extra?.secret ? (it.is_set ? 'ตั้งไว้แล้ว (เก็บแบบเข้ารหัส) ' : 'ยังไม่ได้ตั้ง ') : ''}{hint}</span>
      </label>
    );
  };

  return (
    <>
      <PageTitle hint="สลับโหมด ตั้งค่า LINE OA / Public URL และทดสอบทีละข้อ (เฉพาะนักพัฒนา)">การเชื่อมต่อ LINE</PageTitle>
      <div className="grid gap-4 pb-20 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <PageCard title="โหมดการทำงาน">
            <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="โหมดการทำงาน">
              {MODES.map((m) => {
                const on = val('connection_mode') === m.value;
                return (
                  <button key={m.value} type="button" role="radio" aria-checked={on} onClick={() => set('connection_mode', m.value)} className={cn('rounded-lg border px-4 py-3 text-left transition-colors', on ? 'border-primary bg-primary-soft ring-2 ring-primary' : 'border-border hover:border-primary')}>
                    <span className="block font-display font-semibold">{m.label}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{m.desc}</span>
                  </button>
                );
              })}
            </div>
            {val('connection_mode') !== savedMode && <p className="mt-3 text-xs text-warn-ink">ยังไม่ได้บันทึก — โหมดปัจจุบันคือ {savedMode}</p>}
          </PageCard>

          <PageCard title="ค่าการเชื่อมต่อ">
            <p className="-mt-2 mb-4 text-xs text-muted-foreground">จาก LINE Developers (Provider เดียวกับ LINE OA)</p>
            <div className="flex flex-col gap-4">
              {field('public_base_url', 'Public URL', 'https://… ของ Cloudflare Tunnel ที่ชี้มาที่ระบบนี้', { placeholder: 'https://bed.example.go.th' })}
              {field('liff_id', 'LIFF ID', undefined, { placeholder: '1234567890-AbCdEfGh' })}
              {field('line_login_channel_id', 'LINE Login Channel ID')}
              {field('line_channel_secret', 'Messaging API Channel Secret', undefined, { secret: true })}
              {field('line_channel_token', 'Messaging API Channel Access Token', 'ชนิด long-lived', { secret: true })}
            </div>
          </PageCard>
        </div>

        <div className="flex flex-col gap-4">
          <PageCard title="ทดสอบการเชื่อมต่อ">
            <p className="-mt-2 mb-3 text-xs text-muted-foreground">ใช้ค่าที่บันทึกแล้ว · ข้อ 1-3 ไม่ส่งข้อความหาใคร ไม่กินโควต้า</p>
            <ul className="flex flex-col gap-2">
              {row('public_url', Globe, 'เปิดเว็บจากอินเทอร์เน็ตได้', 'เรียก /api/health ผ่าน Public URL')}
              {row('line_token', KeyRound, 'Channel Access Token ใช้ได้', 'ถาม LINE ว่า Token นี้ใช้ได้ไหม และเป็นของ OA ไหน')}
              {row('line_quota', Gauge, 'โควต้าข้อความเดือนนี้', 'อ่านโควต้าและจำนวนที่ใช้ไปจาก LINE')}
            </ul>
            <div className="mt-4 rounded-lg bg-muted p-4">
              <label className="flex flex-col gap-1 text-sm font-medium">
                ส่งข้อความทดสอบไปที่ LINE user ID
                <input value={pushTo} onChange={(e) => setPushTo(e.target.value)} placeholder="U0123456789abcdef…" className={cn(inputClass, 'font-normal')} />
                <span className="text-xs font-normal text-muted-foreground">หา user ID ของตัวเองได้ที่ LINE Developers &gt; Basic settings &gt; Your user ID (ส่งจริง 1 ข้อความ นับโควต้า)</span>
              </label>
              <ul className="mt-3">{row('line_push', Send, 'ส่งข้อความทดสอบ', 'ส่งข้อความสั้น ๆ หาผู้ใช้นี้ ตรวจในแอป LINE', !pushTo.trim())}</ul>
            </div>
          </PageCard>

          <PageCard title="ขั้นตอนตั้งค่า LINE">
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>LINE Developers สร้าง Provider (ใช้ Provider เดียวกับ LINE OA)</li>
              <li>สร้าง Messaging API channel แล้วออก Channel Access Token (long-lived)</li>
              <li>สร้าง LINE Login channel ใต้ Provider เดียวกัน แล้วตั้ง Linked OA</li>
              <li>เพิ่ม LIFF app ขนาด Full, scope: profile, openid, chat_message.write และใส่ Endpoint URL = Public URL</li>
              <li>กรอกค่าในหน้านี้ เลือกโหมด กดบันทึก แล้วทดสอบทีละข้อ</li>
              <li>ก่อนเปลี่ยนจาก OA ทดสอบเป็น OA จริง ลบข้อมูลผู้ขอจำลองที่เมนู "ผู้ขอจำลอง" เพราะ LINE user ID ของ OA ทดสอบใช้กับ OA จริงไม่ได้</li>
            </ol>
          </PageCard>
        </div>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm">มีการแก้ไข {Object.keys(edited).length} รายการที่ยังไม่ได้บันทึก</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEdited({})}>
                ล้างค่า
              </Button>
              <Button loading={saving} onClick={() => void save()}>
                <Save className="size-4" />
                บันทึก
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
