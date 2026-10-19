/**
 * LiffApp — หน้าผู้ขอที่เปิดในแอป LINE (LIFF)
 *   1) ขอ liff_id จากเซิร์ฟเวอร์ → liff.init → ยังไม่ล็อกอิน LINE = พาไปล็อกอิน
 *   2) แนบ ID token ของ LINE ทุกคำสั่ง API (เซิร์ฟเวอร์ให้ LINE ตรวจเอง — ไม่เชื่อ userId ที่หน้าเว็บส่ง)
 *   3) ยังไม่ลงทะเบียน → ยินยอม PDPA + กรอกข้อมูลผู้ขอ (LINE OA นี้สำหรับหน่วยงานราชการ/โรงพยาบาลเท่านั้น — บุคคลทั่วไปจะมี LINE OA แยกต่างหาก)
 *   4) ลงทะเบียนแล้ว → RequesterApp ตัวเดียวกับที่ทดลองในเมนูผู้ขอจำลอง · เมนู LINE ใช้ ?tab=mine|submit|profile เลือกแท็บแรก
 */
import liff from '@line/liff';
import { useEffect, useMemo, useState } from 'react';
import { api, configureClient, onSessionExpired } from '../api/client';
import type { MockProfile, MockRequest, ProfileInput } from '../api/devApi';
import { Button } from '../components/Button';
import { RegisterFlow, RequesterApp, type RequesterApi, type Tab } from '../components/requester/RequesterApp';
import { Spinner } from '../components/Spinner';

type Boot = { app_name: string; theme: string; liff_id: string; mode: string };
type Stage = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'register' } | { kind: 'app' };

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
      respond: (id, answer) => api.post<unknown>('/requester/respond', { id, answer }),
      checkHospital: (code) => api.post<{ found: boolean; name: string }>('/requester/hospital-check', { code }),
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
        setStage(me.data ? { kind: 'app' } : { kind: 'register' });
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
      {stage.kind === 'register' && (
        <div className="h-full overflow-y-auto">
          <RegisterFlow
            checkHospital={requesterApi.checkHospital}
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
