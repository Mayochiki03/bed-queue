/**
 * LoginMfa — ขั้นยืนยันตัวตน 2 ชั้นหลังกรอกรหัสผ่านถูก (หน้าตาและลำดับตามระบบจองคิวนวด)
 *   MfaVerify : กรอกรหัส 6 หลักจากแอป Authenticator (หรือรหัสสำรองเมื่อไม่มีมือถือ)
 *   MfaSetup  : ผูกแอปครั้งแรก 3 ขั้น (ติดตั้งแอป → สแกน QR → กรอกรหัสแรก) แล้วแสดงรหัสสำรอง 10 ชุด (ครั้งเดียว)
 * เรียก API: /auth/mfa/setup | enable | verify (ถือ cookie ชั่วคราว 10 นาทีหลังรหัสผ่านถูก)
 */
import { ArrowLeft, Check, Copy, LifeBuoy, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { cn } from '../lib/cn';
import { useSession, type User } from '../lib/session';

/** กรอบกลางจอ ใช้ร่วมกันทุกขั้น */
function Frame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className={cn('w-full rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8', wide ? 'max-w-md md:max-w-3xl md:p-10' : 'max-w-sm')}>{children}</div>
    </div>
  );
}

/** ช่องรหัส 6 หลัก: ตัวใหญ่ แป้นตัวเลข รองรับเติมอัตโนมัติ ครบ 6 ตัวส่งเอง */
function CodeInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; disabled?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, '').slice(0, 6);
        onChange(v);
        if (v.length === 6) onComplete?.(v);
      }}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      disabled={disabled}
      placeholder="000000"
      aria-label="รหัส 6 หลักจากแอป"
      className="h-16 w-full rounded-xl border border-border bg-card text-center font-display text-3xl tracking-[0.4em] tabular-nums placeholder:text-border focus:border-ring focus:outline-none focus:ring-4 focus:ring-ring/20 disabled:opacity-60"
    />
  );
}

const Error = ({ text }: { text: string }) => (
  <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
    {text}
  </p>
);

type Who = { full_name: string; username: string };
type VerifyRes = { user: User; recovery_left: number | null };
type EnableRes = { user: User; recovery_codes: string[] };

export function MfaVerify({ who }: { who: Who }) {
  const { finishMfa, cancelMfa } = useSession();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const submit = async (value = code) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const res = await api.post<VerifyRes>('/auth/mfa/verify', useRecovery ? { recovery_code: value.trim() } : { code: value });
    if (res.ok && res.data) {
      const left = res.data.recovery_left;
      if (left != null && left <= 3) {
        // แจ้งให้รู้ว่ารหัสสำรองใกล้หมด แล้วค่อยเข้าระบบ
        setNotice(`ใช้รหัสสำรองแล้ว เหลือ ${left} ชุด — ควรแจ้งผู้ดูแลให้รีเซ็ต 2FA เพื่อผูกมือถือใหม่`);
        setTimeout(() => finishMfa(res.data!.user), 2500);
        return;
      }
      finishMfa(res.data.user);
      return;
    }
    setError(res.fields?.code ?? res.fields?.recovery_code ?? res.message);
    setCode('');
    setBusy(false);
    if (res.status === 'UNAUTHORIZED') cancelMfa(); // ticket หมดอายุ → กลับหน้ากรอกรหัสผ่าน
  };

  return (
    <Frame>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); void submit(); }}>
        <span className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary-ink">
          <ShieldCheck className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold text-foreground">ยืนยันตัวตน</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          คุณ{who.full_name} ({who.username})
          <br />
          {useRecovery ? 'กรอกรหัสสำรองชุดใดชุดหนึ่ง (ใช้ได้ชุดละครั้ง)' : 'เปิดแอป Authenticator ในมือถือ แล้วกรอกรหัส 6 หลัก'}
        </p>
        {useRecovery ? (
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="xxxx-xxxx"
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            aria-label="รหัสสำรอง"
            className="h-14 w-full rounded-xl border border-border bg-card text-center font-display text-xl tracking-widest focus:border-ring focus:outline-none focus:ring-4 focus:ring-ring/20"
          />
        ) : (
          <CodeInput value={code} onChange={setCode} onComplete={(v) => void submit(v)} disabled={busy} />
        )}
        {error && <Error text={error} />}
        {notice && <p className="mt-4 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn-ink">{notice}</p>}
        <Button type="submit" full loading={busy} className="mt-6 h-11" disabled={useRecovery ? code.trim().length < 8 : code.length !== 6}>
          ยืนยัน
        </Button>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" onClick={cancelMfa} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            เปลี่ยนบัญชี
          </button>
          <button type="button" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(''); }} className="inline-flex items-center gap-1 text-primary hover:underline">
            <LifeBuoy className="size-4" aria-hidden />
            {useRecovery ? 'ใช้รหัสจากแอปแทน' : 'ไม่มีมือถือ? ใช้รหัสสำรอง'}
          </button>
        </div>
        {useRecovery && <p className="mt-4 text-xs text-muted-foreground">ไม่มีทั้งมือถือและรหัสสำรอง: ติดต่อผู้ดูแลระบบให้กด "รีเซ็ต 2FA"</p>}
      </form>
    </Frame>
  );
}

const Step = ({ n }: { n: number }) => (
  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-ink">{n}</span>
);

type SetupInfo = { qr: string; url: string; secret: string; issuer: string; account: string };

export function MfaSetup({ who }: { who: Who }) {
  const { finishMfa, cancelMfa } = useSession();
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EnableRes | null>(null);

  useEffect(() => {
    void api.post<SetupInfo>('/auth/mfa/setup').then((r) => {
      if (r.ok && r.data) setInfo(r.data);
      else {
        setError(r.message);
        if (r.status === 'UNAUTHORIZED') cancelMfa();
      }
    });
  }, [cancelMfa]);

  const submit = async (value = code) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const res = await api.post<EnableRes>('/auth/mfa/enable', { code: value });
    if (res.ok && res.data) {
      setResult(res.data);
      return;
    }
    setError(res.fields?.code ?? res.message);
    setCode('');
    setBusy(false);
  };

  if (result) return <RecoveryCodes codes={result.recovery_codes} who={who} onContinue={() => finishMfa(result.user)} />;

  const qr = (big: boolean) =>
    !info ? (
      error ? null : <Spinner />
    ) : (
      <div className={cn('flex flex-col items-center', big && 'rounded-2xl bg-muted p-6')}>
        <img src={info.qr} alt="QR code สำหรับแอป Authenticator" width={big ? 240 : 200} height={big ? 240 : 200} className="rounded-xl border border-border bg-white p-2" />
        {big && <p className="mt-3 text-center text-sm text-muted-foreground">สแกนด้วยแอป Authenticator<br />ในมือถือของคุณ</p>}
      </div>
    );

  return (
    <Frame wide>
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-ink">
          <Smartphone className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold leading-tight text-foreground">ตั้งค่ายืนยันตัวตน 2 ชั้น</h1>
          <p className="mt-1 text-sm text-muted-foreground">คุณ{who.full_name} ({who.username}) ทำครั้งเดียว ใช้เวลาประมาณ 1 นาที</p>
        </div>
      </div>

      <div className="mt-7 md:grid md:grid-cols-[minmax(0,1fr)_288px] md:gap-10">
        <ol className="space-y-6">
          <li className="flex gap-3">
            <Step n={1} />
            <div className="min-w-0 text-sm">
              <div className="font-medium text-foreground">ติดตั้งแอปในมือถือของคุณเอง</div>
              <div className="text-muted-foreground">Google Authenticator หรือ Microsoft Authenticator (ฟรี มีทั้ง iPhone และ Android)</div>
            </div>
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-medium text-foreground">
                เปิดแอป กด <b>+</b> แล้วสแกน QR<span className="hidden md:inline"> ทางขวา</span>
              </div>
              <div className="mt-3 md:hidden">{qr(false)}</div>
              {info && (
                <>
                  <a href={info.url} className="mt-3 inline-flex items-center gap-1 rounded-md bg-primary-soft px-3 py-2 text-xs font-medium text-primary-ink md:hidden">
                    <Smartphone className="size-4" aria-hidden />
                    ใช้มือถือเครื่องนี้? กดเพื่อเพิ่มในแอป
                  </a>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-primary">สแกนไม่ได้? พิมพ์รหัสเอง</summary>
                    <p className="mt-2 text-muted-foreground">ในแอปเลือก "ป้อนคีย์การตั้งค่า" ชื่อบัญชี: {info.account} ประเภท: ตามเวลา</p>
                    <code className="mt-1 block select-all break-all rounded-md bg-muted px-3 py-2 font-mono text-sm">{info.secret}</code>
                  </details>
                </>
              )}
            </div>
          </li>
          <li className="flex gap-3">
            <Step n={3} />
            <form className="min-w-0 flex-1 text-sm" onSubmit={(e: FormEvent) => { e.preventDefault(); void submit(); }}>
              <div className="mb-2 font-medium text-foreground">กรอกรหัส 6 หลักที่แอปแสดง</div>
              <CodeInput value={code} onChange={setCode} onComplete={(v) => void submit(v)} disabled={busy || !info} />
              {error && <Error text={error} />}
              <Button type="submit" full loading={busy} className="mt-4 h-11" disabled={code.length !== 6 || !info}>
                ยืนยันและเปิดใช้
              </Button>
            </form>
          </li>
        </ol>
        <aside className="hidden md:block">{qr(true)}</aside>
      </div>
      <button type="button" onClick={cancelMfa} className="mt-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        เปลี่ยนบัญชี
      </button>
    </Frame>
  );
}

/** แสดงรหัสสำรอง 10 ชุด ครั้งเดียว — ต้องกดยืนยันว่าเก็บแล้วจึงเข้าระบบ */
function RecoveryCodes({ codes, who, onContinue }: { codes: string[]; who: Who; onContinue: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');
  return (
    <Frame>
      <span className="grid size-12 place-items-center rounded-xl bg-success-soft text-success-ink">
        <Check className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold text-foreground">เปิดใช้งานแล้ว</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        เก็บรหัสสำรองของ {who.username} ไว้ในที่ปลอดภัย ใช้เข้าระบบเมื่อมือถือหายหรือเปลี่ยนเครื่อง ชุดละครั้ง <b>แสดงครั้งเดียวเท่านั้น</b>
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-muted p-4 font-mono text-sm tracking-wider">
        {codes.map((c) => (
          <li key={c} className="select-all">
            {c}
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        full
        className="mt-3"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setCopied(true));
        }}
      >
        <Copy className="size-4" />
        {copied ? 'คัดลอกแล้ว' : 'คัดลอกทั้งหมด'}
      </Button>
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
        <span>ฉันเก็บรหัสสำรองไว้แล้ว</span>
      </label>
      <Button full className="mt-4 h-11" disabled={!saved} onClick={onContinue}>
        เข้าสู่ระบบ
      </Button>
    </Frame>
  );
}
