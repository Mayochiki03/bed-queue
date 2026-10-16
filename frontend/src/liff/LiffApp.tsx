/**
 * LiffApp — หน้าผู้ขอที่เปิดในแอป LINE (LIFF)
 *   1) ขอ liff_id จากเซิร์ฟเวอร์ → liff.init → ยังไม่ล็อกอิน LINE = พาไปล็อกอิน
 *   2) แนบ ID token ของ LINE ทุกคำสั่ง API (เซิร์ฟเวอร์ให้ LINE ตรวจเอง — ไม่เชื่อ userId ที่หน้าเว็บส่ง)
 *   3) ยังไม่ลงทะเบียน → เลือกประเภทผู้ขอ → (หน่วยงาน) ยินยอม PDPA + กรอกข้อมูล · (บุคคลทั่วไป) กำลังพัฒนา
 *   4) ลงทะเบียนแล้ว → RequesterApp ตัวเดียวกับที่ทดลองในเมนูผู้ขอจำลอง · เมนู LINE ใช้ ?tab=mine|submit|profile เลือกแท็บแรก
 */
import liff from '@line/liff';
import { Building2, ChevronLeft, Construction, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, configureClient, onSessionExpired } from '../api/client';
import type { MockProfile, MockRequest, ProfileInput } from '../api/devApi';
import { Button } from '../components/Button';
import { RegisterFlow, RequesterApp, type RequesterApi, type Tab } from '../components/requester/RequesterApp';
import { Spinner } from '../components/Spinner';

type Boot = { app_name: string; theme: string; liff_id: string; mode: string };
type Stage = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'choose' } | { kind: 'general' } | { kind: 'register' } | { kind: 'app' };

const TABS: Tab[] = ['mine', 'submit', 'profile'];

/** ล็อกอิน LINE ใหม่ (token หมดอายุ) — กันวนซ้ำด้วยตัวนับใน sessionStorage */
function relogin() {
  try {
    const n = Number(sessionStorage.getItem('relogin') ?? '0');
    if (n >= 2) return;
    sessionStorage.setItem('relogin', String(n + 1));
  } catch {
    /* ไม่มี sessionStorage ก็ลองต่อ */
  }
  liff.logout();
  liff.login({ redirectUri: window.location.href });
}

export default function LiffApp() {
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [initialTab, setInitialTab] = useState<Tab>('mine');

  const requesterApi = useMemo<RequesterApi>(
    () => ({
      profile: () => api.post<MockProfile | null>('/requester/profile'),
      saveProfile: (p: ProfileInput) => api.post<MockProfile>('/requester/save-profile', { profile: { ...p, accept_pdpa: true } }),
      submit: (request) => api.post<{ id: number; request_no: string }>('/requester/submit', { request }),
      mine: () => api.post<MockRequest[]>('/requester/mine'),
      cancel: (id) => api.post<unknown>('/requester/cancel', { id }),
      respond: (id, accept) => api.post<unknown>('/requester/respond', { id, accept }),
    }),
    [],
  );

  useEffect(() => onSessionExpired(relogin), []);

  useEffect(() => {
    void (async () => {
      try {
        const boot = await api.post<Boot>('/requester/boot');
        if (!boot.ok || !boot.data) return setStage({ kind: 'error', message: boot.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' });
        document.documentElement.dataset.theme = boot.data.theme;
        document.title = boot.data.app_name;
        if (!boot.data.liff_id) return setStage({ kind: 'error', message: 'ระบบยังไม่ได้ตั้งค่า LIFF ID — แจ้งผู้ดูแลระบบ' });

        await liff.init({ liffId: boot.data.liff_id });
        if (!liff.isLoggedIn()) return liff.login({ redirectUri: window.location.href });
        try {
          sessionStorage.removeItem('relogin');
        } catch {
          /* ignore */
        }
        configureClient({
          headers: async () => ({ Authorization: `Bearer ${liff.getIDToken() ?? ''}` }),
          rewrite: { '/lookup/options': '/requester/lookups', '/setting/ui': '/requester/ui' }, // ข้อมูลหลัก + ข้อความ PDPA ฝั่งสาธารณะ
        });

        const tab = new URLSearchParams(window.location.search).get('tab') as Tab | null;
        if (tab && TABS.includes(tab)) setInitialTab(tab);

        const me = await requesterApi.profile();
        if (!me.ok) return setStage({ kind: 'error', message: me.message });
        setStage(me.data ? { kind: 'app' } : { kind: 'choose' });
      } catch (err) {
        setStage({ kind: 'error', message: `เปิดหน้านี้ไม่สำเร็จ: ${err instanceof Error ? err.message : 'ไม่ทราบสาเหตุ'}` });
      }
    })();
  }, [requesterApi]);

  return (
    <div className="mx-auto h-dvh max-w-md bg-background">
      {stage.kind === 'loading' && (
        <div className="grid h-full place-items-center">
          <Spinner />
        </div>
      )}
      {stage.kind === 'error' && (
        <div className="grid h-full place-items-center p-6 text-center">
          <div>
            <p className="font-display text-lg font-semibold">เปิดหน้านี้ไม่ได้</p>
            <p className="mt-2 text-sm text-muted-foreground">{stage.message}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              ลองใหม่
            </Button>
          </div>
        </div>
      )}
      {stage.kind === 'choose' && <ChooseType onPick={(k) => setStage({ kind: k === 'agency' ? 'register' : 'general' })} />}
      {stage.kind === 'general' && <GeneralComingSoon onBack={() => setStage({ kind: 'choose' })} />}
      {stage.kind === 'register' && (
        <div className="h-full overflow-y-auto">
          <button type="button" onClick={() => setStage({ kind: 'choose' })} className="flex items-center gap-1 px-4 pt-4 text-sm text-muted-foreground">
            <ChevronLeft className="size-4" aria-hidden /> เปลี่ยนประเภทผู้ขอ
          </button>
          <RegisterFlow
            onRegister={async (p) => {
              const res = await requesterApi.saveProfile(p);
              if (res.ok) setStage({ kind: 'app' });
              return res;
            }}
          />
        </div>
      )}
      {stage.kind === 'app' && <RequesterApp api={requesterApi} initialTab={initialTab} />}
    </div>
  );
}

function ChooseType({ onPick }: { onPick: (k: 'agency' | 'general') => void }) {
  const card = 'flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary';
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-6">
      <div>
        <h1 className="font-display text-xl font-semibold">ขอเตียงในฐานะ</h1>
        <p className="mt-1 text-sm text-muted-foreground">เลือกประเภทผู้ขอ — เลือกครั้งเดียว ครั้งต่อไปเข้าหน้าคำขอของคุณทันที</p>
      </div>
      <button type="button" className={card} onClick={() => onPick('agency')}>
        <Building2 className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
        <span>
          <span className="block font-semibold">หน่วยงานราชการ / โรงพยาบาล</span>
          <span className="block text-sm text-muted-foreground">เจ้าหน้าที่ที่ส่งต่อผู้ป่วยจากหน่วยงานของตน</span>
        </span>
      </button>
      <button type="button" className={card} onClick={() => onPick('general')}>
        <UserRound className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
        <span>
          <span className="block font-semibold">บุคคลทั่วไป</span>
          <span className="block text-sm text-muted-foreground">ญาติ / ผู้ปกครอง / ผู้ที่ต้องการขอเตียงเอง</span>
        </span>
      </button>
    </div>
  );
}

function GeneralComingSoon({ onBack }: { onBack: () => void }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <Construction className="mx-auto size-10 text-muted-foreground" aria-hidden />
        <p className="mt-3 font-display text-lg font-semibold">กำลังพัฒนา</p>
        <p className="mt-2 text-sm text-muted-foreground">ช่องทางสำหรับบุคคลทั่วไปยังไม่เปิดให้ใช้งาน กรุณาติดต่อเจ้าหน้าที่โดยตรง</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          กลับ
        </Button>
      </div>
    </div>
  );
}
