/**
 * DevPage — เมนูนักพัฒนา: "ผู้ขอจำลอง" ทดลองเล่นฝั่งผู้ใช้โดยยังไม่ต่อ LINE
 * เลือกผู้ขอจำลอง → ใช้งานในกรอบมือถือ (คำขอของฉัน / ส่งคำขอ / ข้อมูลของฉัน) → ไปดูผลบนบอร์ดคิวของ admin
 * เมื่อ admin "เรียกคิว" การ์ดเรียกคิวจะขึ้นในกรอบนี้ให้กดยืนยัน/ไม่ยืนยัน (จำลองการ์ด LINE)
 * ข้อมูลทดสอบทั้งหมดลบได้ด้วยปุ่ม "ล้างข้อมูลจำลอง" · ใช้ได้เฉพาะผู้ใช้สิทธิ์นักพัฒนา
 */
import { FlaskConical, Plus, RefreshCw, Trash2, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { devApi, type MockProfile, type MockRequest, type MockUser, type ProfileInput, type SubmitInput } from '../../api/devApi';
import { Button } from '../../components/Button';
import { ColorChip } from '../../components/ColorChip';
import { SelectField, TextAreaField, TextField } from '../../components/Fields';
import { PageCard, PageTitle } from '../../components/PageCard';
import { usePopup } from '../../components/Popup';
import { StatusChip } from '../../components/queue/parts';
import { Spinner } from '../../components/Spinner';
import { useLookups } from '../../hooks/useLookups';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { applyFieldErrors, noEnterSubmit } from '../../lib/forms';

const EMPTY_PROFILE: ProfileInput = { full_name: '', hospital_code: '', hospital_name: '', phone: '', phone2: '' };
const EMPTY_SUBMIT: SubmitInput = { patient_name: '', patient_gender: '', patient_age: '', patient_province: '', patient_phone: '', color_code: '', substance_code: '', reason_code: '', note: '' };
const GENDERS = [
  { value: 'M', label: 'ชาย' },
  { value: 'F', label: 'หญิง' },
  { value: 'O', label: 'อื่น ๆ' },
];

export default function DevPage() {
  const navigate = useNavigate();
  const popup = usePopup();
  const [users, setUsers] = useState<MockUser[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await devApi.list();
    if (res.ok && res.data) {
      setUsers(res.data);
      setSelected((cur) => (cur && res.data!.some((u) => u.id === cur) ? cur : (res.data![0]?.id ?? null)));
    } else popup.error(res.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function clearAll() {
    if (!(await popup.confirm({ title: 'ล้างข้อมูลจำลอง', message: 'ลบผู้ขอจำลองทั้งหมด พร้อมคำขอและประวัติของพวกเขา?\n(คำขอที่เจ้าหน้าที่บันทึกเองไม่ถูกลบ)', danger: true, confirmText: 'ลบ' }))) return;
    const res = await devApi.clear();
    if (res.ok) {
      popup.success(res.message);
      setSelected(null);
      await load();
    } else popup.error(res.message);
  }

  if (!users) return <Spinner />;

  return (
    <>
      <PageTitle hint="ทดลองส่งคำขอในฐานะผู้ขอ แล้วไปดูผลบนบอร์ดคิว · ยังไม่ใช้ LINE จริง · ข้อมูลที่นี่เป็นข้อมูลทดสอบ">ผู้ขอจำลอง (ทดลองฝั่งผู้ใช้)</PageTitle>
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <PageCard
          title="ผู้ขอจำลอง"
          actions={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              สร้าง
            </Button>
          }
        >
          {creating && (
            <CreateMock
              onDone={async (id) => {
                setCreating(false);
                await load();
                if (id) setSelected(id);
              }}
            />
          )}
          {users.length === 0 && !creating && <p className="py-4 text-sm text-muted-foreground">ยังไม่มีผู้ขอจำลอง — กด "สร้าง" เพื่อเริ่ม (ตัวอย่าง: รพ.สงขลา รหัส 11206)</p>}
          <ul className="flex flex-col gap-2">
            {users.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => setSelected(u.id)} aria-pressed={selected === u.id} className={cn('flex w-full items-start gap-3 rounded-lg border p-3 text-left', selected === u.id ? 'border-primary bg-primary-soft' : 'border-border hover:bg-muted')}>
                  <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium text-foreground">{u.full_name}</span>
                    <span className="block truncate text-muted-foreground">
                      {u.hospital_name} ({u.hospital_code})
                    </span>
                    <span className="block text-xs text-faint">{u.phone}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/queue')}>
              เปิดบอร์ดคิว
            </Button>
            {users.length > 0 && (
              <Button variant="outline" size="sm" className="text-danger" onClick={() => void clearAll()}>
                <Trash2 className="size-4" />
                ล้างข้อมูลจำลอง
              </Button>
            )}
          </div>
          <p className="mt-3 flex gap-2 text-xs text-muted-foreground">
            <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            ผู้ขอจำลองไม่ผูกกับบัญชี LINE จริง — สั่งงานแทนผู้ขอจริงจากหน้านี้ไม่ได้
          </p>
        </PageCard>

        {selected ? <PhoneView key={selected} requesterId={selected} onProfileChanged={load} /> : <PageCard>เลือกหรือสร้างผู้ขอจำลองทางซ้ายเพื่อเริ่มทดลอง</PageCard>}
      </div>
    </>
  );
}

function CreateMock({ onDone }: { onDone: (id?: number) => void | Promise<void> }) {
  const popup = usePopup();
  const form = useForm<ProfileInput>({ defaultValues: { ...EMPTY_PROFILE, full_name: 'สมศรี ใจดี', hospital_code: '11206', hospital_name: 'รพ.สงขลา', phone: '0243535646 ต่อ 1275' } });
  const [saving, setSaving] = useState(false);
  const submit = form.handleSubmit(async (v) => {
    setSaving(true);
    const res = await devApi.create(v).finally(() => setSaving(false));
    if (res.ok && res.data) await onDone(res.data.id);
    else {
      applyFieldErrors(form.setError, res);
      popup.warn(res.message);
    }
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={submit} onKeyDown={noEnterSubmit} noValidate className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-3">
        <TextField name="full_name" label="ชื่อ-สกุล" required maxLength={120} />
        <div className="grid grid-cols-2 gap-3">
          <TextField name="hospital_code" label="รหัส รพ. 5 หลัก" required maxLength={5} />
          <TextField name="hospital_name" label="ชื่อ รพ." required maxLength={150} />
        </div>
        <TextField name="phone" label="เบอร์โทร" required maxLength={50} />
        <TextField name="phone2" label="เบอร์สำรอง" maxLength={50} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => void onDone()}>
            ยกเลิก
          </Button>
          <Button size="sm" type="submit" loading={saving}>
            สร้างผู้ขอจำลอง
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

type Tab = 'mine' | 'submit' | 'profile';

/** กรอบมือถือจำลอง: สิ่งที่ผู้ขอจะเห็นเมื่อเปิดผ่าน LINE */
function PhoneView({ requesterId, onProfileChanged }: { requesterId: number; onProfileChanged: () => void | Promise<void> }) {
  const [tab, setTab] = useState<Tab>('mine');
  const [profile, setProfile] = useState<MockProfile | null>(null);
  const [mine, setMine] = useState<MockRequest[] | null>(null);
  const popup = usePopup();

  const loadMine = useCallback(async () => {
    const res = await devApi.mine(requesterId);
    if (res.ok && res.data) setMine(res.data);
    else popup.error(res.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requesterId]);
  const loadProfile = useCallback(async () => {
    const res = await devApi.profile(requesterId);
    if (res.ok) setProfile(res.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requesterId]);

  useEffect(() => {
    void loadMine();
    void loadProfile();
    const t = window.setInterval(() => document.visibilityState === 'visible' && void loadMine(), 15_000);
    return () => window.clearInterval(t);
  }, [loadMine, loadProfile]);

  return (
    <div className="mx-auto w-full max-w-[24rem] lg:mx-0">
      <div className="overflow-hidden rounded-[1.75rem] border-[6px] border-neutral-ink/80 bg-background shadow-lg">
        <div className="bg-primary px-4 py-3 text-primary-foreground">
          <div className="text-xs opacity-80">ผู้ขอ (มุมมองมือถือ)</div>
          <div className="font-semibold">{profile?.full_name ?? '...'}</div>
          <div className="text-xs opacity-90">{profile ? `${profile.hospital_name} (${profile.hospital_code})` : ''}</div>
        </div>
        <nav className="grid grid-cols-3 border-b border-border bg-card text-sm" aria-label="เมนูผู้ขอ">
          {(
            [
              ['mine', 'คำขอของฉัน'],
              ['submit', 'ส่งคำขอ'],
              ['profile', 'ข้อมูลของฉัน'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={cn('px-2 py-2.5', tab === k ? 'border-b-2 border-primary font-semibold text-primary-ink' : 'text-muted-foreground')}>
              {l}
            </button>
          ))}
        </nav>
        <div className="max-h-[70vh] min-h-[28rem] overflow-y-auto p-3">
          {tab === 'mine' && <MineTab requesterId={requesterId} rows={mine} reload={loadMine} goSubmit={() => setTab('submit')} />}
          {tab === 'submit' && (
            <SubmitTab
              requesterId={requesterId}
              onDone={async () => {
                await loadMine();
                setTab('mine');
              }}
            />
          )}
          {tab === 'profile' && profile && (
            <ProfileTab
              requesterId={requesterId}
              profile={profile}
              onSaved={async () => {
                await loadProfile();
                await onProfileChanged();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MineTab({ requesterId, rows, reload, goSubmit }: { requesterId: number; rows: MockRequest[] | null; reload: () => Promise<void>; goSubmit: () => void }) {
  const popup = usePopup();
  const lk = useLookups();
  if (!rows) return <Spinner />;

  async function respond(r: MockRequest, accept: boolean) {
    const msg = accept ? `ยืนยันส่งตัว "${r.patient_name}" ใช่หรือไม่?` : `แจ้งว่า "ไม่ยืนยัน" การส่งตัว "${r.patient_name}" ใช่หรือไม่?`;
    if (!(await popup.confirm({ title: accept ? 'ยืนยันส่งตัว' : 'ไม่ยืนยัน', message: msg, danger: !accept }))) return;
    const res = await devApi.respond(requesterId, r.id, accept);
    if (res.ok) popup.success(res.message || 'บันทึกแล้ว');
    else popup.error(res.message);
    await reload();
  }
  async function cancel(r: MockRequest) {
    if (!(await popup.confirm({ title: 'ยกเลิกคำขอ', message: `ยกเลิกคำขอของ "${r.patient_name}" ใช่หรือไม่?`, danger: true, confirmText: 'ยกเลิกคำขอ' }))) return;
    const res = await devApi.cancel(requesterId, r.id);
    if (res.ok) popup.success('ยกเลิกคำขอแล้ว');
    else popup.error(res.message);
    await reload();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{rows.length} รายการ · โหลดใหม่ทุก 15 วินาที</span>
        <Button variant="ghost" size="sm" onClick={() => void reload()} aria-label="โหลดใหม่">
          <RefreshCw className="size-4" />
        </Button>
      </div>
      {rows.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          ยังไม่มีคำขอ
          <div className="mt-3">
            <Button size="sm" onClick={goSubmit}>
              ส่งคำขอแรก
            </Button>
          </div>
        </div>
      )}
      {rows.map((r) => (
        <article key={r.id} className="rounded-lg border border-border bg-card p-3 text-sm">
          <div className="mb-1 flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground">{r.patient_name}</h3>
            <StatusChip status={r.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{r.request_no}</span>
            {r.color_code && <ColorChip label={lk.label('COLOR', r.color_code)} color={lk.colorOf(r.color_code)} />}
            <span>ส่งเมื่อ {formatDateTime(r.submitted_at)}</span>
          </div>
          {r.status === 'WAITING' && (r.position_all !== null || r.position_color !== null) && (
            <p className="mt-2 rounded-md bg-info-soft px-2.5 py-1.5 text-info-ink">
              {r.position_color !== null && <>คิวที่ {r.position_color} ในสีเดียวกัน</>}
              {r.position_color !== null && r.position_all !== null && ' · '}
              {r.position_all !== null && <>คิวที่ {r.position_all} ของทุกสี</>}
            </p>
          )}
          {r.status === 'CALLED' && (
            <div className="mt-2 rounded-lg border border-warn-ink/30 bg-warn-soft p-3">
              <p className="mb-2 font-medium text-warn-ink">ถึงคิวของผู้ป่วยรายนี้แล้ว โปรดยืนยันการส่งตัว</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => void respond(r, false)}>
                  ไม่ยืนยัน
                </Button>
                <Button size="sm" className="flex-1" onClick={() => void respond(r, true)}>
                  ยืนยัน
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-warn-ink/80">การ์ดนี้จำลองข้อความที่ผู้ขอจะได้รับใน LINE</p>
            </div>
          )}
          {(r.status === 'WAITING' || r.status === 'CALLED') && (
            <div className="mt-2 text-right">
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => void cancel(r)}>
                ยกเลิกคำขอ
              </Button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function SubmitTab({ requesterId, onDone }: { requesterId: number; onDone: () => void | Promise<void> }) {
  const popup = usePopup();
  const lk = useLookups();
  const form = useForm<SubmitInput>({ defaultValues: EMPTY_SUBMIT });
  const [saving, setSaving] = useState(false);
  const opts = (list: { code: string; label: string; is_active: boolean | number }[]) => list.filter((l) => l.is_active).map((l) => ({ value: l.code, label: l.label }));

  const submit = form.handleSubmit(async (v) => {
    if (!(await popup.confirm({ title: 'ส่งคำขอ', message: `ส่งคำขอเตียงของ "${v.patient_name}" ใช่หรือไม่?`, confirmText: 'ส่งคำขอ' }))) return;
    setSaving(true);
    const res = await devApi.submit(requesterId, v).finally(() => setSaving(false));
    if (res.ok && res.data) {
      popup.success(`ส่งคำขอแล้ว เลขคำขอ ${res.data.request_no}`);
      form.reset(EMPTY_SUBMIT);
      await onDone();
    } else if (res.status === 'DUPLICATE' || res.status === 'VALIDATION') {
      applyFieldErrors(form.setError, res);
      popup.warn(res.message);
    } else popup.error(res.message);
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} onKeyDown={noEnterSubmit} noValidate className="flex flex-col gap-3">
        <TextField name="patient_name" label="ชื่อ-สกุลผู้ป่วย" required maxLength={150} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField name="patient_gender" label="เพศ" placeholder="ไม่ระบุ" options={GENDERS} />
          <TextField name="patient_age" label="อายุ (ปี)" type="number" />
        </div>
        <TextField name="patient_province" label="จังหวัด" maxLength={80} />
        <TextField name="patient_phone" label="เบอร์โทรผู้ป่วย/ญาติ" maxLength={50} />
        <SelectField name="color_code" label="สี (ระดับผู้ป่วย)" placeholder="ไม่ระบุ" options={opts(lk.colors)} />
        <SelectField name="substance_code" label="ประเภทสารเสพติด" placeholder="ไม่ระบุ" options={opts(lk.substances)} />
        <SelectField name="reason_code" label="เหตุผลการส่งต่อ" placeholder="ไม่ระบุ" options={opts(lk.reasons)} />
        <TextAreaField name="note" label="หมายเหตุ" maxLength={1000} />
        <p className="text-xs text-muted-foreground">ข้อมูลผู้ป่วยเป็นข้อมูลสุขภาพ ใช้เพื่อประสานงานขอเตียงเท่านั้น</p>
        <Button type="submit" full loading={saving}>
          ส่งคำขอ
        </Button>
      </form>
    </FormProvider>
  );
}

function ProfileTab({ requesterId, profile, onSaved }: { requesterId: number; profile: MockProfile; onSaved: () => void | Promise<void> }) {
  const popup = usePopup();
  const form = useForm<ProfileInput>({ defaultValues: { full_name: profile.full_name, hospital_code: profile.hospital_code, hospital_name: profile.hospital_name, phone: profile.phone, phone2: profile.phone2 ?? '' } });
  const [saving, setSaving] = useState(false);
  const submit = form.handleSubmit(async (v) => {
    if (!(await popup.confirm({ title: 'บันทึกข้อมูล', message: 'ต้องการบันทึกข้อมูลของคุณใช่หรือไม่?', confirmText: 'บันทึก' }))) return;
    setSaving(true);
    const res = await devApi.saveProfile(requesterId, v).finally(() => setSaving(false));
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
        <TextField name="full_name" label="ชื่อ-สกุล" required maxLength={120} />
        <div className="grid grid-cols-2 gap-3">
          <TextField name="hospital_code" label="รหัส รพ. 5 หลัก" required maxLength={5} />
          <TextField name="hospital_name" label="ชื่อ รพ." required maxLength={150} />
        </div>
        <TextField name="phone" label="เบอร์โทร" required maxLength={50} hint='ใส่เบอร์ต่อได้ เช่น 0243535646 ต่อ 1275' />
        <TextField name="phone2" label="เบอร์สำรอง" maxLength={50} />
        <p className="text-xs text-muted-foreground">ลงทะเบียนครั้งเดียว — แก้ไขภายหลังได้ที่นี่ · รหัส รพ. เดียวกันของหลายคนจะใช้โรงพยาบาลเดียวกันในระบบ</p>
        <Button type="submit" full loading={saving}>
          บันทึก
        </Button>
      </form>
    </FormProvider>
  );
}
