/**
 * ConnectionPage — เมนูนักพัฒนา: การเชื่อมต่อ LINE / อินเทอร์เน็ต (DEV เท่านั้น) จัดหน้าตามระบบจองคิวนวด (v0.10)
 *   ซ้าย  : โหมดการทำงาน + ค่าการเชื่อมต่อแยกกลุ่ม (Tunnel / LINE Login / Messaging API) — ทุกช่องบอก "เอาจาก" เมนูไหน
 *   ขวา   : กล่อง "ค่าที่ต้องนำไปวางใน LINE Developers" (LIFF Endpoint / Webhook URL คัดลอกได้) + แผงทดสอบ + ขั้นตอนตั้งค่า
 *   ค่าลับไม่แสดงค่าเดิม เว้นว่าง = ใช้ค่าเดิม · การทดสอบใช้ค่าที่บันทึกแล้วเท่านั้น
 */
import { ArrowDownToLine, Check, ChevronRight, CircleCheck, CircleX, Cloud, Copy, Gauge, Globe, KeyRound, LogIn, MessageSquare, Save, Send, TriangleAlert, Webhook, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
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

/** LIFF ID = "<Channel ID ของ LINE Login>-<รหัส>" */
const liffPrefix = (liffId: string) => /^(\d+)-/.exec(liffId)?.[1] ?? '';

/** เส้นทางเมนู เช่น LINE Developers › LINE Login › Basic settings › Channel ID */
function Path({ steps, label = 'เอาจาก' }: { steps: string[]; label?: string }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs leading-snug text-muted-foreground">
      <span className="mr-0.5 rounded bg-muted px-1.5 py-px font-medium text-foreground">{label}</span>
      {steps.map((st, i) => (
        <span key={st} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5 text-faint" aria-hidden />}
          <span className={i === steps.length - 1 ? 'font-medium text-foreground' : ''}>{st}</span>
        </span>
      ))}
    </p>
  );
}

/** หัวกลุ่มของช่องกรอก: เป็นค่าของอะไร ใช้ทำอะไร */
function Group({ icon: Icon, title, purpose, children }: { icon: LucideIcon; title: string; purpose: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display font-semibold leading-tight">{title}</p>
          <p className="text-sm text-muted-foreground">{purpose}</p>
        </div>
      </div>
      {children}
    </fieldset>
  );
}

/** ช่องกรอก + ที่มาของค่า + คำอธิบาย/คำเตือน */
function SourcedField({ label, steps, hint, warn, edited, children }: { label: string; steps: string[]; hint?: string; warn?: string | null; edited?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          {label}
          {edited && <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-xs font-normal text-warn-ink">แก้ไขแล้ว</span>}
        </span>
        {children}
      </label>
      <Path steps={steps} />
      {warn && (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-danger-ink" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {warn}
        </p>
      )}
      {hint && !warn && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}

/** ค่าที่ระบบสร้างให้ → คัดลอกไปวางใน LINE (http ใน LAN ใช้ clipboard API ไม่ได้ → สำรองด้วยการเลือกข้อความแล้ว execCommand) */
function CopyValue({ id, label, value, steps, note }: { id: string; label: string; value: string; steps: string[]; note?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        const box = document.getElementById(id);
        if (box) {
          const range = document.createRange();
          range.selectNodeContents(box);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          document.execCommand('copy');
          sel?.removeAllRanges();
        }
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* เลือกข้อความเองได้ */
    }
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <Button size="sm" variant="outline" disabled={!value} onClick={() => void copy()}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </Button>
      </div>
      <div id={id} data-testid={id} className={cn('select-all break-all rounded-lg border border-border bg-muted px-3.5 py-2.5 font-mono text-sm', !value && 'text-faint')}>
        {value || 'กรอก Public URL แล้วบันทึกก่อน'}
      </div>
      <Path steps={steps} label="วางที่" />
      {note && <p className="mt-1 text-xs text-faint">{note}</p>}
    </div>
  );
}

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
  const savedBase = String(item('public_base_url').value ?? '').replace(/\/+$/, '');
  const liffEndpoint = savedBase;
  const webhookUrl = savedBase ? `${savedBase}/api/line/webhook` : '';
  const prefix = liffPrefix(val('liff_id').trim());
  const channelMismatch = !!prefix && !!val('line_login_channel_id').trim() && prefix !== val('line_login_channel_id').trim();
  const urlChanged = 'public_base_url' in edited && edited.public_base_url!.trim().replace(/\/+$/, '') !== savedBase;

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
            <p className="-mt-2 mb-4 text-xs text-muted-foreground">LINE Developers = developers.line.biz → เลือก Provider ของ OA → จะเห็น 2 channel: LINE Login กับ Messaging API</p>
            <div className="flex flex-col gap-6">
              <Group icon={Cloud} title="Cloudflare Tunnel" purpose="ลิงก์ที่ LINE และคนนอกโรงพยาบาลใช้เข้าระบบ (ชี้ไปพอร์ต public 4003 เท่านั้น — หน้าเจ้าหน้าที่ไม่ผ่าน tunnel)">
                <SourcedField
                  label="Public URL"
                  edited={'public_base_url' in edited}
                  steps={['เครื่อง server', 'รัน npm run tunnel', 'log ของ cloudflared', 'บรรทัด https://….trycloudflare.com']}
                  hint="Quick Tunnel ได้ลิงก์ใหม่ทุกครั้งที่ tunnel เริ่มใหม่ → แก้ช่องนี้ แล้วนำ LIFF Endpoint URL และ Webhook URL (กล่องด้านขวา) ไปวางใน LINE ใหม่ด้วย"
                >
                  <input className={cn(inputClass, 'font-normal')} autoComplete="off" value={val('public_base_url')} onChange={(e) => set('public_base_url', e.target.value)} placeholder="https://xxxx.trycloudflare.com" />
                </SourcedField>
              </Group>

              <Group icon={LogIn} title="LINE Login channel" purpose="ให้ผู้ขอเปิดหน้าคำขอในแอป LINE และระบบรู้ว่าเป็นใคร">
                <SourcedField
                  label="LINE Login Channel ID"
                  edited={'line_login_channel_id' in edited}
                  steps={['LINE Developers', 'channel LINE Login', 'แท็บ Basic settings', 'Channel ID']}
                  hint="ตัวเลขล้วน — คนละตัวกับ Channel ID ของ Messaging API (เลขคล้ายกันมาก ระวังสลับ)"
                  warn={channelMismatch ? `ไม่ตรงกับ LIFF ID — LIFF ID ขึ้นต้นด้วย ${prefix} ดังนั้น Channel ID ต้องเป็น ${prefix} (ถ้าบันทึกแบบนี้ผู้ขอจะล็อกอินวนไม่จบ)` : null}
                >
                  <input className={cn(inputClass, 'font-normal', channelMismatch && 'border-danger')} autoComplete="off" inputMode="numeric" value={val('line_login_channel_id')} onChange={(e) => set('line_login_channel_id', e.target.value)} placeholder="2012345678" />
                </SourcedField>
                <SourcedField label="LIFF ID" edited={'liff_id' in edited} steps={['LINE Developers', 'channel LINE Login', 'แท็บ LIFF', 'LIFF ID']} hint="รูปแบบ 1234567890-AbCdEfGh — ตัวเลขหน้าขีด = Channel ID ของ LINE Login ช่องบน">
                  <input className={cn(inputClass, 'font-normal')} autoComplete="off" value={val('liff_id')} onChange={(e) => set('liff_id', e.target.value)} placeholder="1234567890-AbCdEfGh" />
                </SourcedField>
              </Group>

              <Group icon={MessageSquare} title="Messaging API channel" purpose={'ให้ OA ส่งข้อความเรียกคิว/แจ้งเตือน และรับการพิมพ์ "สถานะ" กับการกดปุ่มยืนยันในแชท'}>
                <SourcedField
                  label="Channel Secret"
                  edited={'line_channel_secret' in edited}
                  steps={['LINE Developers', 'channel Messaging API', 'แท็บ Basic settings', 'Channel secret']}
                  hint={`${item('line_channel_secret').is_set ? 'ตั้งไว้แล้ว — เว้นว่าง = ใช้ค่าเดิม' : 'ยังไม่ได้ตั้ง'} · ใช้ตรวจว่าข้อความในแชทมาจาก LINE จริง`}
                >
                  <input type="password" autoComplete="off" className={cn(inputClass, 'font-normal')} value={edited.line_channel_secret ?? ''} onChange={(e) => set('line_channel_secret', e.target.value)} placeholder={item('line_channel_secret').is_set ? '••••••••' : ''} />
                </SourcedField>
                <SourcedField
                  label="Channel Access Token"
                  edited={'line_channel_token' in edited}
                  steps={['LINE Developers', 'channel Messaging API', 'แท็บ Messaging API', 'Channel access token (long-lived)', 'Issue']}
                  hint={item('line_channel_token').is_set ? 'ตั้งไว้แล้ว — เว้นว่าง = ใช้ค่าเดิม (เก็บแบบเข้ารหัส)' : 'ยังไม่ได้ตั้ง · ข้อความยาวมาก กด Issue แล้วคัดลอกทั้งหมด'}
                >
                  <input type="password" autoComplete="off" className={cn(inputClass, 'font-normal')} value={edited.line_channel_token ?? ''} onChange={(e) => set('line_channel_token', e.target.value)} placeholder={item('line_channel_token').is_set ? '••••••••' : ''} />
                </SourcedField>
              </Group>
            </div>
          </PageCard>
        </div>

        <div className="flex flex-col gap-4">
          <PageCard title="ค่าที่ต้องนำไปใส่ใน LINE Developers">
            <p className="-mt-2 mb-4 text-xs text-muted-foreground">ระบบสร้างให้จาก Public URL ที่บันทึกไว้ — กดคัดลอกแล้วไปวาง</p>
            <div className="flex flex-col gap-5">
              {urlChanged && (
                <p className="flex items-start gap-1.5 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-ink">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  แก้ Public URL แล้วแต่ยังไม่ได้บันทึก — กดบันทึกก่อน ค่าข้างล่างจึงจะเปลี่ยนตาม
                </p>
              )}
              <CopyValue id="copy-liff" label="LIFF Endpoint URL" value={liffEndpoint} steps={['channel LINE Login', 'แท็บ LIFF', 'กด LIFF app', 'Endpoint URL']} note="Scope ของ LIFF ต้องติ๊ก openid, profile และ chat_message.write" />
              <CopyValue id="copy-webhook" label="Webhook URL" value={webhookUrl} steps={['channel Messaging API', 'แท็บ Messaging API', 'Webhook settings', 'Webhook URL']} note={'วางแล้วเปิดสวิตช์ Use webhook → กด Verify ต้องขึ้น Success · พิมพ์ "สถานะ" และปุ่มยืนยัน/ไม่ยืนยันในแชทใช้ได้เมื่อตั้งข้อนี้แล้ว'} />
            </div>
          </PageCard>

          <PageCard title="ทดสอบการเชื่อมต่อ">
            <p className="-mt-2 mb-3 text-xs text-muted-foreground">ใช้ค่าที่บันทึกแล้ว — กดทีละข้อจากบนลงล่าง · ข้อ 1-4 ไม่ส่งข้อความหาใคร ไม่กินโควต้า</p>
            <ul className="flex flex-col gap-2">
              {row('public_url', Globe, 'เปิดเว็บจากอินเทอร์เน็ตได้', 'เรียก /api/health ผ่าน Public URL')}
              {row('line_token', KeyRound, 'Channel Access Token ใช้ได้', 'ถาม LINE ว่า Token นี้ใช้ได้ไหม และเป็นของ OA ไหน')}
              {row('line_webhook', Webhook, 'Webhook ตั้งถูกและ LINE ส่งมาถึง', 'ถาม LINE ว่า Webhook URL ที่ตั้งไว้ตรงกับของระบบไหน แล้วให้ LINE ยิงทดสอบมา (ตรวจลายเซ็นด้วย)')}
              {row('line_quota', Gauge, 'โควต้าข้อความเดือนนี้', 'อ่านโควต้าและจำนวนที่ใช้ไปจาก LINE')}
            </ul>
            <div className="mt-4 rounded-lg bg-muted p-4">
              <label className="flex flex-col gap-1 text-sm font-medium">
                ส่งข้อความทดสอบไปที่ LINE user ID
                <input value={pushTo} onChange={(e) => setPushTo(e.target.value)} placeholder="U0123456789abcdef…" className={cn(inputClass, 'font-normal')} />
                <span className="text-xs font-normal text-muted-foreground">ส่งจริง 1 ข้อความ นับโควต้า</span>
              </label>
              <Path steps={['LINE Developers', 'channel ใดก็ได้', 'แท็บ Basic settings', 'Your user ID (ล่างสุด)']} />
              <ul className="mt-3">{row('line_push', Send, 'ส่งข้อความทดสอบ', 'ส่งข้อความสั้น ๆ หาผู้ใช้นี้ ตรวจในแอป LINE', !pushTo.trim())}</ul>
            </div>
          </PageCard>

          <PageCard title="ตั้งค่าครั้งแรก (ทำครั้งเดียวต่อ OA)">
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>LINE Developers ใช้ <b>Provider เดียวกับ LINE OA</b></li>
              <li>channel <b>Messaging API</b> (ผูกกับ OA) → กรอก Channel Secret + ออก Channel Access Token</li>
              <li>สร้าง channel <b>LINE Login</b> ใต้ Provider เดียวกัน → Basic settings ตั้ง Linked OA เป็น OA นี้</li>
              <li>ใน LINE Login เพิ่ม LIFF app ขนาด Full → คัดลอก LIFF ID มากรอก และวาง LIFF Endpoint URL จากกล่องด้านบน</li>
              <li>LINE Login: เปลี่ยนสถานะ <b>Developing → Published</b> (ถ้ายังเป็น Developing คนทั่วไปเปิดไม่ได้ ขึ้น “User need to have developer role”)</li>
              <li>Messaging API: วาง Webhook URL → เปิด Use webhook → Verify</li>
              <li>เลือกโหมด → บันทึก → กดทดสอบทีละข้อ</li>
              <li>ก่อนเปลี่ยนจาก OA ทดสอบเป็น OA จริง ลบข้อมูลผู้ขอจำลองที่เมนู "ผู้ขอจำลอง" เพราะ LINE user ID ของ OA ทดสอบใช้กับ OA จริงไม่ได้</li>
            </ol>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-faint">
              <ArrowDownToLine className="size-4" aria-hidden />
              Rich Menu ของ OA ให้ลิงก์ไปที่ https://liff.line.me/&lt;LIFF ID&gt; (ดูภาพเมนูใน docs/line)
            </p>
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
