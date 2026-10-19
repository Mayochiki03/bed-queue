/**
 * RequesterApp — หน้าจอของ "ผู้ขอ" (เจ้าหน้าที่ รพ.อื่น) ทั้งชุด: ยินยอม PDPA → ลงทะเบียน → คำขอของฉัน / ส่งคำขอ / ข้อมูลของฉัน
 * ออกแบบเป็นแอปมือถือ: หัวสีแบรนด์ + แท็บล่าง + การ์ดคำขอที่บอกสถานะชัดเจน
 * ไม่ผูกกับวิธีเรียก API — รับ `api` (RequesterApi) เข้ามา: ตอนนี้ใช้กับ "ผู้ขอจำลอง" ของ dev (pages/dev) ภายหลัง LIFF ส่ง api ที่ใช้ตัวตนจาก LINE มาแทนได้เลย
 * ลำดับคิว: บอกแค่ภาพรวม "ก่อนหน้าคุณอีก N คิว" (ไม่แยกรายสี) ตามตั้งค่า queue_display
 */
import { CalendarDays, CircleCheck, CircleUserRound, ClipboardList, Hash, Hourglass, Phone, PlusCircle, RefreshCw, UserRound, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import type { ApiResult } from '../../api/client';
import type { MockProfile, MockRequest, ProfileInput, RespondAnswer, SubmitInput } from '../../api/devApi';
import { OPEN_STATUSES } from '../../api/requestApi';
import { settingApi } from '../../api/settingApi';
import { useLookups } from '../../hooks/useLookups';
import { cn } from '../../lib/cn';
import { formatDate, formatDateTime } from '../../lib/format';
import { applyFieldErrors, noEnterSubmit } from '../../lib/forms';
import { Button } from '../Button';
import { SelectField, TextAreaField, TextField } from '../Fields';
import { usePopup } from '../Popup';
import { StatusChip } from '../queue/parts';
import { Spinner } from '../Spinner';
import { ConsentCard } from './ConsentCard';

/** สิ่งที่หน้าจอผู้ขอเรียกใช้ — ฝั่งที่ฝังเป็นคนบอกว่าเรียก API ยังไง */
export type RequesterApi = {
  profile: () => Promise<ApiResult<MockProfile | null>>;
  saveProfile: (p: ProfileInput) => Promise<ApiResult<MockProfile>>;
  submit: (r: SubmitInput) => Promise<ApiResult<{ id: number; request_no: string }>>;
  mine: () => Promise<ApiResult<MockRequest[]>>;
  cancel: (id: number) => Promise<ApiResult<unknown>>;
  respond: (id: number, answer: RespondAnswer) => Promise<ApiResult<unknown>>;
  /** ค้นชื่อ รพ. จากรหัส 5 หลัก (ใช้เติมชื่อและตรวจว่ามีในรายชื่อกลาง) — ไม่ใส่ = ไม่ตรวจที่หน้าจอ (เซิร์ฟเวอร์ตรวจเสมอ) */
  checkHospital?: HospitalCheck;
};

export type HospitalCheck = (code: string) => Promise<ApiResult<{ found: boolean; name: string }>>;

const EMPTY_SUBMIT: SubmitInput = { patient_name: '', patient_gender: '', patient_age: '', patient_province: '', patient_phone: '', color_code: '', substance_code: '', reason_code: '', note: '' };
const GENDERS = [
  { value: 'M', label: 'ชาย' },
  { value: 'F', label: 'หญิง' },
  { value: 'O', label: 'อื่น ๆ' },
];

export type Tab = 'mine' | 'submit' | 'profile';

/** ผู้ขอที่ยังไม่เคยลงทะเบียน: ยินยอม → กรอกข้อมูล แล้วเรียก onRegister(ข้อมูล) */
export function RegisterFlow({ onRegister, checkHospital }: { onRegister: (p: ProfileInput) => Promise<ApiResult<unknown>>; checkHospital?: HospitalCheck }) {
  const popup = usePopup();
  const [notice, setNotice] = useState('');
  const [agreed, setAgreed] = useState(false);
  const form = useForm<ProfileInput>({ defaultValues: { full_name: '', hospital_code: '', hospital_name: '', phone: '', phone2: '' } });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void settingApi.ui().then((r) => r.ok && r.data && setNotice(r.data.pdpa_notice));
  }, []);

  const submit = form.handleSubmit(async (v) => {
    setSaving(true);
    const res = await onRegister(v).finally(() => setSaving(false));
    if (!res.ok) {
      applyFieldErrors(form.setError, res);
      popup.warn(res.message);
    }
  });

  return (
    <div className="p-4">
      {!agreed ? (
        <ConsentCard notice={notice} onAccept={() => setAgreed(true)} />
      ) : (
        <FormProvider {...form}>
          <form onSubmit={submit} onKeyDown={noEnterSubmit} noValidate className="flex flex-col gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">ข้อมูลของคุณ</h2>
              <p className="mt-1 text-sm text-muted-foreground">กรอกครั้งเดียว หลังเจ้าหน้าที่ตรวจและอนุมัติแล้วจึงส่งคำขอได้</p>
            </div>
            <ProfileFields check={checkHospital} />
            <Button type="submit" full loading={saving} className="mt-2 h-11">
              ลงทะเบียน
            </Button>
          </form>
        </FormProvider>
      )}
    </div>
  );
}

function ProfileFields({ check }: { check?: HospitalCheck }) {
  return (
    <>
      <TextField name="full_name" label="ชื่อ-สกุล" required maxLength={120} />
      <HospitalFields check={check} />
      <TextField name="phone" label="เบอร์โทร" required maxLength={50} hint="ใส่เบอร์ต่อได้ เช่น 0243535646 ต่อ 1275" />
      <TextField name="phone2" label="เบอร์สำรอง" maxLength={50} />
    </>
  );
}

/**
 * รหัส + ชื่อ รพ.: พิมพ์รหัส 5 หลักแล้วระบบเติมชื่อให้จากรายชื่อกลาง (ล็อกช่องชื่อ) — ไม่พบรหัส = แจ้งทันที
 * ช่วยให้กรอกง่ายและตรงกับรายชื่อ (เซิร์ฟเวอร์ตรวจรหัส+ชื่ออีกครั้งตอนกดลงทะเบียนเสมอ)
 */
function HospitalFields({ check }: { check?: HospitalCheck }) {
  const { watch, setValue, setError, clearErrors } = useFormContext<ProfileInput>();
  const code = watch('hospital_code');
  const [state, setState] = useState<'idle' | 'checking' | 'found' | 'missing'>('idle');
  const filled = useRef(false);

  useEffect(() => {
    if (!check || !/^\d{5}$/.test(code ?? '')) {
      if (filled.current) {
        setValue('hospital_name', '');
        filled.current = false;
      }
      setState('idle');
      return;
    }
    let cancelled = false;
    setState('checking');
    void check(code).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data?.found) {
        setValue('hospital_name', res.data.name, { shouldValidate: true });
        filled.current = true;
        clearErrors('hospital_code');
        setState('found');
      } else {
        if (filled.current) {
          setValue('hospital_name', ''); // เคยเติมชื่อจากรหัสก่อนหน้า — ล้างออก กันชื่อ รพ. เก่าค้าง
          filled.current = false;
        }
        setState('missing');
        setError('hospital_code', { message: res.ok ? 'ไม่พบรหัสนี้ในระบบ — ตรวจรหัส 5 หลัก หรือติดต่อเจ้าหน้าที่' : res.message });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3">
      <TextField name="hospital_code" label="รหัส รพ." required maxLength={5} hint={state === 'checking' ? 'กำลังตรวจ...' : '5 หลัก'} />
      <TextField name="hospital_name" label="ชื่อโรงพยาบาล" required maxLength={150} readOnly={state === 'found'} hint={state === 'found' ? 'ตรวจพบในรายชื่อ' : check ? 'ชื่อจะขึ้นให้เมื่อกรอกรหัส' : undefined} />
    </div>
  );
}

/** สมาชิกที่ยังรออนุมัติ / ไม่ได้รับอนุมัติ: บอกสถานะชัดเจน + แก้ข้อมูลได้ (เช่น พิมพ์เบอร์/รหัสผิด) — เช็กสถานะอัตโนมัติทุก 15 วินาที */
function PendingApproval({ api, profile, onRefresh, onSaved }: { api: RequesterApi; profile: MockProfile; onRefresh: () => Promise<void>; onSaved: () => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [checking, setChecking] = useState(false);
  const rejected = profile.approval_status === 'REJECTED';
  return (
    <div className="flex h-full flex-col">
      <header className="bg-linear-to-br from-[var(--hero-from)] to-[var(--hero-to)] px-5 pt-5 pb-6 text-primary-foreground">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/20">
            <CircleUserRound className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="truncate font-display text-lg leading-tight font-bold">{profile.full_name}</div>
            <div className="truncate text-xs opacity-90">{`${profile.hospital_name} (${profile.hospital_code})`}</div>
          </div>
        </div>
      </header>
      <main className="-mt-3 flex-1 overflow-y-auto rounded-t-3xl bg-background px-4 pt-5 pb-4">
        {editing ? (
          <>
            <ProfileTab api={api} profile={profile} onSaved={async () => { setEditing(false); await onSaved(); }} />
            <Button variant="outline" full className="mt-3 h-11" onClick={() => setEditing(false)}>
              ยกเลิก
            </Button>
          </>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-5 text-center">
            <span className={cn('mx-auto grid size-14 place-items-center rounded-full', rejected ? 'bg-danger-soft text-danger-ink' : 'bg-warn-soft text-warn-ink')}>{rejected ? <XCircle className="size-7" aria-hidden /> : <Hourglass className="size-7" aria-hidden />}</span>
            <h2 className="mt-3 font-display text-xl font-bold text-foreground">{rejected ? 'ไม่ได้รับการอนุมัติ' : 'รอเจ้าหน้าที่อนุมัติ'}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {rejected
                ? `เจ้าหน้าที่ไม่อนุมัติการลงทะเบียนนี้${profile.decided_note ? ` (${profile.decided_note})` : ''} — หากข้อมูลไม่ถูกต้อง แก้ไขแล้วส่งใหม่ หรือติดต่อเจ้าหน้าที่`
                : 'ลงทะเบียนเรียบร้อยแล้ว เจ้าหน้าที่จะตรวจสอบข้อมูล (อาจโทรกลับเพื่อยืนยัน) เมื่ออนุมัติแล้วจะส่งคำขอและดูคิวได้ทันที — หน้านี้จะอัปเดตเอง'}
            </p>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-left text-sm">
              <dt className="text-muted-foreground">โรงพยาบาล</dt>
              <dd>{profile.hospital_name}</dd>
              <dt className="text-muted-foreground">เบอร์โทร</dt>
              <dd>{profile.phone}</dd>
            </dl>
            <div className="mt-5 flex flex-col gap-2">
              <Button
                full
                className="h-11"
                loading={checking}
                onClick={async () => {
                  setChecking(true);
                  await onRefresh().finally(() => setChecking(false));
                }}
              >
                <CircleCheck className="size-4" />
                ตรวจสอบสถานะ
              </Button>
              <Button variant="outline" full className="h-11" onClick={() => setEditing(true)}>
                แก้ไขข้อมูล
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/** แอปของผู้ขอที่ลงทะเบียนแล้ว */
export function RequesterApp({ api, onProfileChanged, initialTab = 'mine' }: { api: RequesterApi; onProfileChanged?: () => void | Promise<void>; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [profile, setProfile] = useState<MockProfile | null>(null);
  const [mine, setMine] = useState<MockRequest[] | null>(null);
  const popup = usePopup();

  const loadMine = useCallback(async () => {
    const res = await api.mine();
    if (res.ok && res.data) setMine(res.data);
    else popup.error(res.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);
  const loadProfile = useCallback(async () => {
    const res = await api.profile();
    if (res.ok) setProfile(res.data);
  }, [api]);

  const approved = profile?.approval_status === 'APPROVED';
  const loaded = profile !== null;

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // อนุมัติแล้ว = โหลด/รีเฟรชคำขอ · ยังไม่อนุมัติ = รีเฟรชสถานะสมาชิก (ผู้ที่เจ้าหน้าที่เพิ่งอนุมัติจะเข้าใช้ได้เองโดยไม่ต้องเปิดใหม่)
  useEffect(() => {
    if (!loaded) return;
    if (approved) void loadMine();
    const t = window.setInterval(() => document.visibilityState === 'visible' && void (approved ? loadMine() : loadProfile()), 15_000);
    return () => window.clearInterval(t);
  }, [loaded, approved, loadMine, loadProfile]);

  const tabs: { key: Tab; label: string; icon: typeof ClipboardList }[] = [
    { key: 'mine', label: 'คำขอของฉัน', icon: ClipboardList },
    { key: 'submit', label: 'ส่งคำขอ', icon: PlusCircle },
    { key: 'profile', label: 'ข้อมูลของฉัน', icon: UserRound },
  ];

  if (profile && !approved) return <PendingApproval api={api} profile={profile} onRefresh={loadProfile} onSaved={async () => { await loadProfile(); await onProfileChanged?.(); }} />;

  return (
    <div className="flex h-full flex-col">
      {/* หัว: ชื่อ + โรงพยาบาล */}
      <header className="bg-linear-to-br from-[var(--hero-from)] to-[var(--hero-to)] px-5 pt-5 pb-6 text-primary-foreground">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/20">
            <CircleUserRound className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-xs opacity-80">สวัสดี</div>
            <div className="truncate font-display text-lg leading-tight font-bold">{profile?.full_name ?? '...'}</div>
            <div className="truncate text-xs opacity-90">{profile ? `${profile.hospital_name} (${profile.hospital_code})` : ''}</div>
          </div>
        </div>
      </header>

      {/* เนื้อหา: เลื่อนได้ ทับหัวนิดหน่อยให้ดูเป็นชั้น */}
      <main className="-mt-3 flex-1 overflow-y-auto rounded-t-3xl bg-background px-4 pt-4 pb-4">
        {tab === 'mine' && <MineTab api={api} rows={mine} reload={loadMine} goSubmit={() => setTab('submit')} />}
        {tab === 'submit' && (
          <SubmitTab
            api={api}
            onDone={async () => {
              await loadMine();
              setTab('mine');
            }}
          />
        )}
        {tab === 'profile' && profile && (
          <ProfileTab
            api={api}
            profile={profile}
            onSaved={async () => {
              await loadProfile();
              await onProfileChanged?.();
            }}
          />
        )}
      </main>

      {/* แท็บล่าง */}
      <nav className="grid grid-cols-3 border-t border-border bg-card px-2 pt-1.5 pb-2" aria-label="เมนูผู้ขอ">
        {tabs.map(({ key, label, icon: Icon }) => {
          const on = tab === key;
          const waiting = key === 'mine' ? (mine ?? []).filter((r) => OPEN_STATUSES.includes(r.status)).length : 0;
          return (
            <button key={key} type="button" aria-pressed={on} onClick={() => setTab(key)} className={cn('relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px]', on ? 'font-semibold text-primary-ink' : 'text-muted-foreground')}>
              <span className={cn('grid h-7 w-14 place-items-center rounded-full transition-colors', on && 'bg-primary-soft')}>
                <Icon className="size-5" aria-hidden />
              </span>
              {label}
              {waiting > 0 && <span className="absolute top-0 right-[22%] grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4 text-white">{waiting}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** "ก่อนหน้าคุณอีก N คิว" — ภาพรวมเท่านั้น (ไม่บอกรายละเอียดแยกสี) */
function QueueHint({ r }: { r: MockRequest }) {
  const color = r.position_color !== null;
  const pos = color ? r.position_color : r.position_all;
  if (pos === null) return null;
  const ahead = pos - 1;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl bg-info-soft px-3 py-2.5 text-info-ink">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/70 font-display text-lg font-bold tabular-nums">{ahead}</span>
      <div className="min-w-0 text-sm leading-tight">
        <div className="font-semibold">{ahead === 0 ? 'คุณอยู่คิวแรก' : `ก่อนหน้าคุณอีก ${ahead} คิว`}</div>
        <div className="text-xs opacity-80">{color ? 'นับเฉพาะคำขอสีเดียวกัน · ' : ''}ลำดับเป็นภาพรวม อาจเปลี่ยนตามความเร่งด่วน</div>
      </div>
    </div>
  );
}

function MineTab({ api, rows, reload, goSubmit }: { api: RequesterApi; rows: MockRequest[] | null; reload: () => Promise<void>; goSubmit: () => void }) {
  const popup = usePopup();
  const lk = useLookups();
  const [filter, setFilter] = useState<'open' | 'done'>('open');
  if (!rows) return <Spinner />;

  const open = rows.filter((r) => OPEN_STATUSES.includes(r.status));
  const done = rows.filter((r) => !OPEN_STATUSES.includes(r.status));
  const shown = filter === 'open' ? open : done;
  const called = open.filter((r) => r.status === 'CALLED').length;

  async function respond(r: MockRequest, answer: RespondAnswer) {
    const day = r.bed_date ? formatDate(r.bed_date) : '';
    const text = {
      CONFIRM: { title: 'ยืนยันตามวันที่แจ้ง', msg: `ยืนยันส่งตัวผู้ป่วยตามคำขอ ${r.request_no}${day ? ` ในวันที่ ${day}` : ''} ใช่หรือไม่?` },
      DEFER: { title: 'ส่งตัวได้ แต่ขอเลื่อนวัน', msg: `ยืนยันว่าจะส่งตัวผู้ป่วยตามคำขอ ${r.request_no} แต่วันที่${day ? ` ${day} ` : ''}ไม่สะดวก\n\nเจ้าหน้าที่จะโทรกลับเพื่อนัดวันที่ตรงกัน` },
      DECLINE: { title: 'ไม่ยืนยัน', msg: `แจ้งว่า "ไม่ยืนยัน" การส่งตัวตามคำขอ ${r.request_no} ใช่หรือไม่?` },
    }[answer];
    if (!(await popup.confirm({ title: text.title, message: text.msg, danger: answer === 'DECLINE', confirmText: text.title }))) return;
    const res = await api.respond(r.id, answer);
    if (res.ok) popup.success(res.message || 'บันทึกแล้ว');
    else popup.error(res.message);
    await reload();
  }
  async function cancel(r: MockRequest) {
    if (!(await popup.confirm({ title: 'ยกเลิกคำขอ', message: `ยกเลิกคำขอ ${r.request_no} ใช่หรือไม่?`, danger: true, confirmText: 'ยกเลิกคำขอ' }))) return;
    const res = await api.cancel(r.id);
    if (res.ok) popup.success('ยกเลิกคำขอแล้ว');
    else popup.error(res.message);
    await reload();
  }

  return (
    <div className="flex flex-col gap-3">
      {called > 0 && (
        <div role="status" className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-medium text-warn-ink">
          มี {called} คำขอถึงคิวแล้ว รอคุณยืนยันการส่งตัว
        </div>
      )}
      <div className="flex items-center gap-2">
        <div role="tablist" className="inline-flex flex-1 rounded-xl bg-muted p-1 text-sm">
          {(
            [
              ['open', `กำลังดำเนินการ (${open.length})`],
              ['done', `ปิดแล้ว (${done.length})`],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={cn('flex-1 rounded-lg px-2 py-1.5', filter === k ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-muted-foreground')}>
              {l}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void reload()} aria-label="โหลดใหม่">
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {shown.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {filter === 'open' ? 'ไม่มีคำขอที่กำลังดำเนินการ' : 'ยังไม่มีคำขอที่ปิดแล้ว'}
          {filter === 'open' && (
            <div className="mt-3">
              <Button size="sm" onClick={goSubmit}>
                ส่งคำขอใหม่
              </Button>
            </div>
          )}
        </div>
      )}

      {shown.map((r) => (
        <article key={r.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex">
            <span className="w-1.5 shrink-0" style={{ backgroundColor: lk.colorOf(r.color_code) }} aria-hidden />
            <div className="min-w-0 flex-1 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-semibold text-foreground">{r.patient_name}</h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-0.5">
                      <Hash className="size-3" aria-hidden />
                      {r.request_no}
                    </span>
                    {r.color_code && (
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2 rounded-full" style={{ backgroundColor: lk.colorOf(r.color_code) }} aria-hidden />
                        {lk.label('COLOR', r.color_code)}
                      </span>
                    )}
                    <span>ส่งเมื่อ {formatDateTime(r.submitted_at)}</span>
                    {r.requester_name && <span>โดย {r.requester_name}</span>}
                  </div>
                </div>
                <StatusChip status={r.status} />
              </div>

              {r.status === 'WAITING' && <QueueHint r={r} />}

              {r.status === 'CALLED' && (
                <div className="mt-3 rounded-xl bg-linear-to-br from-warn-soft to-accent-soft p-3 ring-1 ring-warn-ink/20">
                  <p className="text-sm font-semibold text-warn-ink">ถึงคิวแล้ว โปรดยืนยันการส่งตัว</p>
                  {r.bed_date && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1 text-sm font-semibold text-foreground">
                      <CalendarDays className="size-4" aria-hidden="true" />
                      เตียงว่างรับวันที่ {formatDate(r.bed_date)}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-warn-ink/80">กรุณาตอบภายในเวลาที่กำหนด หรือโทรประสานเจ้าหน้าที่</p>
                  <div className="mt-3 grid gap-2">
                    <Button className="h-10" onClick={() => void respond(r, 'CONFIRM')}>
                      ยืนยันตามวันที่แจ้ง
                    </Button>
                    <Button variant="outline" className="h-10 bg-white/70" onClick={() => void respond(r, 'DEFER')}>
                      ส่งตัวได้ แต่วันนั้นไม่สะดวก (ขอเลื่อนวัน)
                    </Button>
                    <Button variant="outline" className="h-10 bg-white/70 text-danger" onClick={() => void respond(r, 'DECLINE')}>
                      ไม่ยืนยัน
                    </Button>
                  </div>
                </div>
              )}

              {r.status === 'NEED_DATE' && (
                <div className="mt-3 rounded-xl bg-accent-soft p-3 text-accent-ink ring-1 ring-accent-ink/15">
                  <p className="text-sm font-semibold">รับทราบว่าคุณจะส่งตัว แต่วันที่แจ้งไม่สะดวก</p>
                  <p className="mt-0.5 text-xs opacity-90">เจ้าหน้าที่จะโทรกลับที่เบอร์ของคุณเพื่อนัดวันที่ตรงกัน เมื่อตกลงแล้วจะมีข้อความยืนยันวันที่ส่งใน LINE</p>
                </div>
              )}

              {r.status === 'CONFIRMED' && r.bed_date && (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-success-soft px-2.5 py-1.5 text-sm font-semibold text-success-ink">
                  <CalendarDays className="size-4" aria-hidden="true" />
                  วันที่ส่งตัว {formatDate(r.bed_date)}
                </p>
              )}

              {OPEN_STATUSES.includes(r.status) && (
                <div className="mt-2 text-right">
                  <button type="button" className="text-xs font-medium text-danger hover:underline" onClick={() => void cancel(r)}>
                    ยกเลิกคำขอ
                  </button>
                </div>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

/** เลือกสีด้วยปุ่มสีกดเลือก (แทน dropdown) — ค่าเก็บในฟอร์มชื่อ color_code */
function ColorPicker() {
  const { watch, setValue } = useFormContext<SubmitInput>();
  const lk = useLookups();
  const cur = watch('color_code');
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-foreground">สี (ระดับผู้ป่วย)</legend>
      <div className="grid grid-cols-4 gap-2">
        {lk.colors
          .filter((c) => c.is_active)
          .map((c) => {
            const on = cur === c.code;
            return (
              <button key={c.code} type="button" aria-pressed={on} onClick={() => setValue('color_code', on ? '' : c.code, { shouldDirty: true })} className={cn('flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-xs transition-colors', on ? 'border-transparent text-white shadow' : 'border-border bg-card text-foreground hover:bg-muted')} style={on ? { backgroundColor: c.color ?? '#6B7280' } : undefined}>
                <span className={cn('size-5 rounded-full ring-2', on ? 'ring-white' : 'ring-transparent')} style={{ backgroundColor: c.color ?? '#6B7280' }} aria-hidden />
                {c.label}
              </button>
            );
          })}
      </div>
    </fieldset>
  );
}

function SubmitTab({ api, onDone }: { api: RequesterApi; onDone: () => void | Promise<void> }) {
  const popup = usePopup();
  const lk = useLookups();
  const form = useForm<SubmitInput>({ defaultValues: EMPTY_SUBMIT });
  const [saving, setSaving] = useState(false);
  const opts = (list: { code: string; label: string; is_active: boolean | number }[]) => list.filter((l) => l.is_active).map((l) => ({ value: l.code, label: l.label }));

  const submit = form.handleSubmit(async (v) => {
    if (!(await popup.confirm({ title: 'ส่งคำขอ', message: `ส่งคำขอเตียงของ "${v.patient_name}" ใช่หรือไม่?`, confirmText: 'ส่งคำขอ' }))) return;
    setSaving(true);
    const res = await api.submit(v).finally(() => setSaving(false));
    if (res.ok && res.data) {
      popup.success(`ส่งคำขอแล้ว เลขคำขอ ${res.data.request_no}`);
      form.reset(EMPTY_SUBMIT);
      await onDone();
    } else if (res.status === 'DUPLICATE' || res.status === 'VALIDATION') {
      applyFieldErrors(form.setError, res);
      popup.warn(res.message);
    } else popup.error(res.message);
  });

  const section = 'rounded-2xl border border-border bg-card p-3.5 flex flex-col gap-3';
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} onKeyDown={noEnterSubmit} noValidate className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">ส่งคำขอเตียง</h2>
          <p className="text-xs text-muted-foreground">ผู้ป่วย 1 ราย ต่อ 1 คำขอ · กรอกเท่าที่จำเป็น</p>
        </div>
        <section className={section}>
          <h3 className="text-sm font-semibold text-primary-ink">ข้อมูลผู้ป่วย</h3>
          <TextField name="patient_name" label="ชื่อ-สกุลผู้ป่วย" required maxLength={150} />
          <div className="grid grid-cols-2 gap-3">
            <SelectField name="patient_gender" label="เพศ" placeholder="ไม่ระบุ" options={GENDERS} />
            <TextField name="patient_age" label="อายุ (ปี)" type="number" />
          </div>
          <TextField name="patient_province" label="จังหวัด" maxLength={80} />
          <TextField name="patient_phone" label="เบอร์โทรผู้ป่วย/ญาติ" maxLength={50} />
        </section>
        <section className={section}>
          <h3 className="text-sm font-semibold text-primary-ink">ระดับและเหตุผล</h3>
          <ColorPicker />
          <SelectField name="substance_code" label="ประเภทสารเสพติด" placeholder="ไม่ระบุ" options={opts(lk.substances)} />
          <SelectField name="reason_code" label="เหตุผลการส่งต่อ" placeholder="ไม่ระบุ" options={opts(lk.reasons)} />
          <TextAreaField name="note" label="หมายเหตุ" maxLength={1000} />
        </section>
        <p className="text-xs text-muted-foreground">ข้อมูลผู้ป่วยเป็นข้อมูลสุขภาพ ใช้เพื่อประสานงานขอเตียงเท่านั้น</p>
        <Button type="submit" full loading={saving} className="h-11">
          ส่งคำขอ
        </Button>
      </form>
    </FormProvider>
  );
}

function ProfileTab({ api, profile, onSaved }: { api: RequesterApi; profile: MockProfile; onSaved: () => void | Promise<void> }) {
  const popup = usePopup();
  const form = useForm<ProfileInput>({ defaultValues: { full_name: profile.full_name, hospital_code: profile.hospital_code, hospital_name: profile.hospital_name, phone: profile.phone, phone2: profile.phone2 ?? '' } });
  const [saving, setSaving] = useState(false);
  const submit = form.handleSubmit(async (v) => {
    if (!(await popup.confirm({ title: 'บันทึกข้อมูล', message: 'ต้องการบันทึกข้อมูลของคุณใช่หรือไม่?', confirmText: 'บันทึก' }))) return;
    setSaving(true);
    const res = await api.saveProfile(v).finally(() => setSaving(false));
    if (res.ok) {
      popup.success('บันทึกข้อมูลแล้ว');
      await onSaved();
    } else {
      applyFieldErrors(form.setError, res);
      popup.warn(res.message);
    }
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} onKeyDown={noEnterSubmit} noValidate className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">ข้อมูลของฉัน</h2>
          <p className="text-xs text-muted-foreground">แก้ไขได้ตลอด · ถ้าเปลี่ยนโรงพยาบาล ต้องรอเจ้าหน้าที่อนุมัติใหม่</p>
        </div>
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5">
          <ProfileFields check={api.checkHospital} />
        </section>
        {profile.pdpa_accepted_at && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="size-3.5" aria-hidden />
            รับทราบนโยบายข้อมูลส่วนบุคคลเมื่อ {formatDateTime(profile.pdpa_accepted_at)}
          </p>
        )}
        <Button type="submit" full loading={saving} className="h-11">
          บันทึก
        </Button>
      </form>
    </FormProvider>
  );
}
