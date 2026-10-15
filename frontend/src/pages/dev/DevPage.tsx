/**
 * DevPage — เมนูนักพัฒนา: "ผู้ขอจำลอง" ทดลองเล่นฝั่งผู้ใช้โดยยังไม่ต่อ LINE
 * เลือกผู้ขอจำลอง → ใช้งานในกรอบมือถือ (คำขอของฉัน / ส่งคำขอ / ข้อมูลของฉัน) → ไปดูผลบนบอร์ดคิวของ admin
 * เมื่อ admin "เรียกคิว" การ์ดเรียกคิวจะขึ้นในกรอบนี้ให้กดยืนยัน/ไม่ยืนยัน (จำลองการ์ด LINE)
 * ข้อมูลทดสอบทั้งหมดลบได้ด้วยปุ่ม "ล้างข้อมูลจำลอง" · ใช้ได้เฉพาะผู้ใช้สิทธิ์นักพัฒนา
 */
import { FlaskConical, Plus, RefreshCw, Trash2, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { devApi, type MockUser, type ProfileInput } from '../../api/devApi';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Fields';
import { PageCard, PageTitle } from '../../components/PageCard';
import { RegisterFlow, RequesterApp, type RequesterApi } from '../../components/requester/RequesterApp';
import { usePopup } from '../../components/Popup';
import { Spinner } from '../../components/Spinner';
import { cn } from '../../lib/cn';
import { applyFieldErrors, noEnterSubmit } from '../../lib/forms';

const EMPTY_PROFILE: ProfileInput = { full_name: '', hospital_code: '', hospital_name: '', phone: '', phone2: '' };

export default function DevPage() {
  const navigate = useNavigate();
  const popup = usePopup();
  const [users, setUsers] = useState<MockUser[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [registering, setRegistering] = useState(false); // ทดลองขั้นตอนผู้ขอใหม่ (ยินยอม PDPA -> ลงทะเบียน)

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
            <Button variant="outline" size="sm" onClick={() => setRegistering(true)}>
              ทดลองสมัครใหม่
            </Button>
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

        {registering ? (
          <div className="mx-auto w-full max-w-[24rem] lg:mx-0">
            <div className="overflow-hidden rounded-[2rem] border-[6px] border-neutral-ink/80 bg-background shadow-lg">
              <RegisterFlow
                onRegister={async (p) => {
                  const res = await devApi.create(p);
                  if (res.ok && res.data) {
                    setRegistering(false);
                    await load();
                    setSelected(res.data.id);
                  }
                  return res;
                }}
              />
            </div>
          </div>
        ) : selected ? <PhoneView key={selected} requesterId={selected} onProfileChanged={load} /> : <PageCard>เลือกหรือสร้างผู้ขอจำลองทางซ้ายเพื่อเริ่มทดลอง</PageCard>}
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

/** กรอบมือถือจำลอง: สิ่งที่ผู้ขอจะเห็นเมื่อเปิดผ่าน LINE (เนื้อหาคือ RequesterApp ตัวเดียวกับที่ LIFF จะใช้) */
function PhoneView({ requesterId, onProfileChanged }: { requesterId: number; onProfileChanged: () => void | Promise<void> }) {
  // ตัวเชื่อม: ผูก requester_id ของผู้ขอจำลองเข้ากับ API ของหน้าจอผู้ขอ
  const api = useMemo<RequesterApi>(
    () => ({
      profile: () => devApi.profile(requesterId),
      saveProfile: (p) => devApi.saveProfile(requesterId, p),
      submit: (r) => devApi.submit(requesterId, r),
      mine: () => devApi.mine(requesterId),
      cancel: (id) => devApi.cancel(requesterId, id),
      respond: (id, accept) => devApi.respond(requesterId, id, accept),
    }),
    [requesterId],
  );
  return (
    <div className="mx-auto w-full max-w-[24rem] lg:mx-0">
      <div className="overflow-hidden rounded-[2rem] border-[6px] border-neutral-ink/80 bg-background shadow-lg">
        <div className="h-[44rem] max-h-[80vh]">
          <RequesterApp api={api} onProfileChanged={onProfileChanged} />
        </div>
      </div>
    </div>
  );
}
