/**
 * SystemPage — เมนูนักพัฒนา: ระบบและเครื่องมือ (DEV เท่านั้น)
 *   ซ้าย : ข้อมูลระบบ (เวอร์ชัน Node/ฐานข้อมูล, โหมด, role ที่บังคับ 2FA, จำนวนข้อมูล)
 *   ขวา : ทดสอบระบบทีละข้อ (ฐานข้อมูล / การเข้ารหัสค่าลับ / เวลาเซิร์ฟเวอร์) — ไม่เปลี่ยนข้อมูล ไม่ส่งข้อความ
 */
import { CircleCheck, CircleX, Clock, Database, KeyRound, RefreshCw, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { systemApi, type SystemInfo } from '../../api/devApiSystem';
import { settingApi, type TestKind, type TestResult } from '../../api/settingApi';
import { Button } from '../../components/Button';
import { PageCard, PageTitle } from '../../components/PageCard';
import { Spinner } from '../../components/Spinner';
import { cn } from '../../lib/cn';

const COUNT_LABEL: Record<keyof SystemInfo['counts'], string> = { users: 'ผู้ใช้งาน', requesters: 'ผู้ขอที่ลงทะเบียน', requests: 'คำขอทั้งหมด', hospitals: 'โรงพยาบาล', logs: 'บันทึกการใช้งาน (audit)', notifications: 'ประวัติแจ้งเตือน LINE' };
const TESTS: { kind: TestKind; label: string; desc: string; icon: LucideIcon }[] = [
  { kind: 'database', label: 'ฐานข้อมูล', desc: 'ลองคำสั่งง่าย ๆ และวัดเวลาตอบกลับ', icon: Database },
  { kind: 'encryption', label: 'การเข้ารหัสค่าลับ', desc: 'เข้ารหัส-ถอดรหัสตัวอย่าง ตรวจกุญแจ APP_SECRET_KEY', icon: KeyRound },
  { kind: 'time', label: 'เวลาเซิร์ฟเวอร์', desc: 'ดูเวลาไทยและเขตเวลา (ผลต่อ "รอมากี่ชั่วโมง")', icon: Clock },
];

export default function SystemPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [results, setResults] = useState<Partial<Record<TestKind, TestResult & { at: string }>>>({});
  const [running, setRunning] = useState<TestKind | null>(null);
  const load = () => systemApi.info().then((r) => r.ok && setInfo(r.data));
  useEffect(() => {
    void load();
  }, []);

  async function run(kind: TestKind) {
    setRunning(kind);
    const r = await settingApi.test(kind).finally(() => setRunning(null));
    const out: TestResult = r.ok && r.data ? r.data : { ok: false, title: 'ทดสอบไม่สำเร็จ', detail: r.message };
    setResults((s) => ({ ...s, [kind]: { ...out, at: new Date().toLocaleTimeString('th-TH') } }));
  }

  if (!info) return <Spinner />;
  const rows: [string, string][] = [
    ['โหมดการเชื่อมต่อ', info.mode],
    ['สภาพแวดล้อม', info.env],
    ['Node.js', info.node],
    ['ฐานข้อมูล', `${info.db_client} ${info.db_version} (${info.db_name})`],
    ['เปิดเซิร์ฟเวอร์มาแล้ว', `${Math.floor(info.uptime_sec / 3600)} ชม. ${Math.floor((info.uptime_sec % 3600) / 60)} นาที`],
    ['สิทธิ์ที่บังคับยืนยันตัวตน 2 ชั้น', info.mfa_required_roles.length ? info.mfa_required_roles.join(', ') : 'ไม่บังคับ (ใช้ได้เฉพาะเครื่องทดสอบ)'],
  ];
  return (
    <>
      <PageTitle hint="สำหรับนักพัฒนา: ตรวจสถานะระบบและทดสอบการทำงานพื้นฐาน">ระบบและเครื่องมือ</PageTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <PageCard
          title="ข้อมูลระบบ"
          actions={
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="size-4" />
              รีเฟรช
            </Button>
          }
        >
          <dl className="divide-y divide-border text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex flex-wrap justify-between gap-2 py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
            {(Object.keys(info.counts) as (keyof SystemInfo['counts'])[]).map((k) => (
              <div key={k} className="flex flex-wrap justify-between gap-2 py-2">
                <dt className="text-muted-foreground">{COUNT_LABEL[k]}</dt>
                <dd className="font-medium tabular-nums">{info.counts[k].toLocaleString('th-TH')}</dd>
              </div>
            ))}
          </dl>
        </PageCard>

        <PageCard title="ทดสอบระบบ">
          <p className="-mt-2 mb-3 text-xs text-muted-foreground">กดทดสอบทีละข้อ ไม่เปลี่ยนแปลงข้อมูลและไม่ส่งข้อความหาใคร (ทดสอบ LINE อยู่ที่เมนู "การเชื่อมต่อ LINE")</p>
          <ul className="flex flex-col gap-2">
            {TESTS.map((t) => {
              const r = results[t.kind];
              const Icon = t.icon;
              return (
                <li key={t.kind} className="flex flex-wrap items-start gap-3 rounded-lg border border-border px-4 py-3">
                  <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t.label}</div>
                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                    {r && (
                      <div data-testid={`test-${t.kind}`} className={cn('mt-2 flex items-start gap-1.5 text-sm', r.ok ? 'text-success-ink' : 'text-danger-ink')}>
                        {r.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />}
                        <div>
                          <b>{r.title}</b>
                          <p className="text-xs opacity-90">{r.detail}</p>
                          <p className="text-xs opacity-60">ทดสอบเมื่อ {r.at}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" loading={running === t.kind} onClick={() => void run(t.kind)}>
                    ทดสอบ
                  </Button>
                </li>
              );
            })}
          </ul>
        </PageCard>
      </div>
    </>
  );
}
