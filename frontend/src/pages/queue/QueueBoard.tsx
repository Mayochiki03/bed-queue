/**
 * QueueBoard — บอร์ดคิวของเจ้าหน้าที่ (แบบ Jira): เห็นว่า "คิวต่อไป" เป็นผู้ป่วยคนไหน โรงพยาบาลไหน สีอะไร รอมานานเท่าไร
 *   - มุมมอง "รวมทุกสี" (เรียงตามเวลาที่ส่ง) หรือ "แยกตามสี" (คอลัมน์ละสี) + คอลัมน์ "เรียกแล้ว รอยืนยัน" (เกินเวลาขึ้นก่อน)
 *     + คอลัมน์ "ยืนยันจะมา รอนัดวัน" (ผู้ขอบอกว่าจะส่งตัวแต่วันที่เสนอไม่สะดวก — เจ้าหน้าที่ต้องโทรกลับไปนัดวัน)
 *   - ระบบไม่รู้ว่าเตียงสีไหนว่าง: เจ้าหน้าที่ดูคิวแล้วเลือกเรียกเคสเอง (ลำดับที่ 1 ของแต่ละคอลัมน์ติดป้าย "คิวถัดไป")
 *   - โหลดใหม่เองทุก 30 วินาที (พักเมื่อเปิดแท็บอื่น) และมีปุ่มโหลดใหม่
 */
import { CalendarClock, ClipboardPlus, History, RefreshCw, Search, TriangleAlert, UserCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { memberApi } from '../../api/memberApi';
import { requestApi, type Action, type BoardData, type BoardItem } from '../../api/requestApi';
import { Button } from '../../components/Button';
import { RequestCard } from '../../components/queue/RequestCard';
import { RequestDialog } from '../../components/queue/RequestDialog';
import { usePopup } from '../../components/Popup';
import { Spinner } from '../../components/Spinner';
import { useLookups } from '../../hooks/useLookups';
import { cn } from '../../lib/cn';

type View = 'all' | 'color';
const VIEW_KEY = 'bq.queue.view';
const POLL_MS = 30_000;

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'color' ? 'color' : 'all';
  } catch {
    return 'all';
  }
}

type Lane = { key: string; title: string; color: string | null; items: BoardItem[]; kind: 'waiting' | 'called' | 'needdate' };

export default function QueueBoard() {
  const navigate = useNavigate();
  const popup = usePopup();
  const lk = useLookups();
  const [data, setData] = useState<BoardData | null>(null);
  const [view, setViewState] = useState<View>(loadView);
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<{ id: number; action?: Action } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const failed = useRef(false);
  const [pendingMembers, setPendingMembers] = useState(0);

  const load = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      void memberApi.pendingCount().then((m) => m.ok && m.data && setPendingMembers(m.data.count));
      const res = await requestApi.board();
      if (res.ok && res.data) {
        setData(res.data);
        failed.current = false;
      } else if (manual || !failed.current) {
        failed.current = true;
        popup.error(res.message);
      }
      setRefreshing(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ไม่เป็นไร: จำมุมมองไม่ได้ก็ใช้ต่อได้ */
    }
  };

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    const k = q.trim().toLowerCase();
    if (!k) return items;
    return items.filter((i) => [i.patient_name, i.hospital_name, i.hospital_code, i.requester_name, i.request_no ?? ''].some((s) => s.toLowerCase().includes(k)));
  }, [data, q]);

  const lanes = useMemo<Lane[]>(() => {
    const waiting = filtered.filter((i) => i.status === 'WAITING');
    const called = filtered
      .filter((i) => i.status === 'CALLED')
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.called_at ?? '').localeCompare(b.called_at ?? ''));
    const needDate = filtered.filter((i) => i.status === 'NEED_DATE').sort((a, b) => (a.responded_at ?? '').localeCompare(b.responded_at ?? ''));
    const calledLane: Lane = { key: 'called', title: 'เรียกแล้ว รอยืนยัน', color: null, items: called, kind: 'called' };
    const needDateLane: Lane = { key: 'needdate', title: 'ยืนยันจะมา รอนัดวัน', color: null, items: needDate, kind: 'needdate' };
    if (view === 'all') return [{ key: 'waiting', title: 'รอคิว (เรียงตามเวลาที่ส่ง)', color: null, items: waiting, kind: 'waiting' }, calledLane, needDateLane];
    const codes = new Set(waiting.map((i) => i.color_code ?? '_NONE'));
    const colorLanes: Lane[] = lk.colors
      .filter((c) => c.is_active || codes.has(c.code))
      .map((c) => ({ key: c.code, title: c.label, color: c.color, items: waiting.filter((i) => i.color_code === c.code), kind: 'waiting' as const }));
    if (codes.has('_NONE')) colorLanes.push({ key: '_NONE', title: 'ไม่ระบุสี', color: null, items: waiting.filter((i) => !i.color_code), kind: 'waiting' });
    return [...colorLanes, calledLane, needDateLane];
  }, [filtered, view, lk.colors]);

  if (!data || !lk.ready) return <Spinner />;

  const all = data.items;
  const waitingN = all.filter((i) => i.status === 'WAITING').length;
  const calledN = all.filter((i) => i.status === 'CALLED').length;
  const needDateN = all.filter((i) => i.status === 'NEED_DATE').length;
  const overdueN = all.filter((i) => i.overdue).length;
  const updated = new Date(data.now).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">คิวขอเตียง</h1>
          <p className="text-sm text-muted-foreground">
            รอคิว {waitingN} ราย · เรียกแล้วรอยืนยัน {calledN} ราย · รอนัดวัน {needDateN} ราย · อัปเดต {updated} น.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/history')}>
            <History className="size-4" />
            ประวัติ
          </Button>
          <Button variant="outline" loading={refreshing} onClick={() => void load(true)} aria-label="โหลดใหม่">
            <RefreshCw className="size-4" />
            โหลดใหม่
          </Button>
          <Button onClick={() => navigate('/queue/add')}>
            <ClipboardPlus className="size-4" />
            เพิ่มคำขอ
          </Button>
        </div>
      </header>

      {pendingMembers > 0 && (
        <section role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-info-ink/25 bg-info-soft px-4 py-3 text-[15px] text-info-ink">
          <UserCheck className="size-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <b>{pendingMembers} คนลงทะเบียนใหม่รออนุมัติ</b> — ตรวจสอบแล้วกดอนุมัติ เขาจึงจะส่งคำขอได้
          </span>
          <Button variant="outline" size="sm" onClick={() => navigate('/member')}>
            ไปหน้าสมาชิก
          </Button>
        </section>
      )}

      {overdueN > 0 && (
        <section role="alert" className="flex items-center gap-3 rounded-xl border border-warn-ink/25 bg-warn-soft px-4 py-3 text-[15px] text-warn-ink">
          <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
          <span>
            <b>
              {overdueN} เคสเรียกแล้วเกิน {data.timeout_hours} ชม.
            </b>{' '}
            ผู้ขอยังไม่ตอบ — ควรโทรตามที่เบอร์ของผู้ขอ (อยู่ในคอลัมน์ "เรียกแล้ว รอยืนยัน")
          </span>
        </section>
      )}

      {needDateN > 0 && (
        <section role="status" className="flex items-center gap-3 rounded-xl border border-accent-ink/25 bg-accent-soft px-4 py-3 text-[15px] text-accent-ink">
          <CalendarClock className="size-5 shrink-0" aria-hidden="true" />
          <span>
            <b>{needDateN} เคสยืนยันว่าจะส่งตัว แต่วันที่เสนอไม่สะดวก</b> — โทรกลับไปนัดวัน แล้วกด "บันทึกวันที่" ที่การ์ดในคอลัมน์ "ยืนยันจะมา รอนัดวัน" ระบบจะแจ้งผู้ขอทาง LINE
          </span>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="มุมมองคิว" className="flex rounded-lg border border-border bg-card p-0.5 text-sm">
          {(
            [
              ['all', 'รวมทุกสี'],
              ['color', 'แยกตามสี'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn('rounded-md px-3.5 py-1.5', view === v ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
              {l}
            </button>
          ))}
        </div>
        <label className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <span className="sr-only">ค้นหาในบอร์ด</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อผู้ป่วย / โรงพยาบาล / ผู้ขอ / เลขคำขอ" className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30" />
        </label>
      </div>

      {/* คอลัมน์: มือถือเลื่อนแนวนอน · จอใหญ่เรียงเต็มความกว้าง */}
      {/* มุมมองแยกสีมีหลายคอลัมน์ (สี + เรียกแล้ว + รอนัดวัน) — คอลัมน์กว้างคงที่แล้วเลื่อนแนวนอน ไม่บีบจนการ์ดล้น */}
      <div className={cn('-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6 lg:mx-0 lg:snap-none lg:px-0', view === 'all' ? 'lg:grid lg:grid-cols-[2fr_1fr_1fr] lg:overflow-visible lg:pb-0' : 'lg:pb-3')}>
        {lanes.map((lane) => (
          <section key={lane.key} aria-label={lane.title} className={cn('flex w-[84vw] shrink-0 snap-start flex-col rounded-xl bg-muted/70 sm:w-80', view === 'all' && 'lg:w-auto lg:min-w-0')}>
            <header className="flex items-center justify-between gap-2 rounded-t-xl border-t-4 px-3 py-2.5" style={{ borderTopColor: lane.color ?? (lane.kind === 'called' ? 'var(--warn-ink)' : lane.kind === 'needdate' ? 'var(--accent-ink)' : 'var(--primary)') }}>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                {lane.color && <i className="inline-block size-2.5 rounded-full" style={{ background: lane.color }} aria-hidden="true" />}
                {lane.title}
              </h2>
              <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">{lane.items.length}</span>
            </header>
            <div className={cn('flex flex-col gap-2.5 px-2.5 pb-3', view === 'all' && lane.kind === 'waiting' && 'xl:grid xl:grid-cols-2 xl:items-start')}>
              {lane.items.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">{lane.kind === 'called' ? 'ไม่มีเคสที่รอการยืนยัน' : lane.kind === 'needdate' ? 'ไม่มีเคสที่รอนัดวัน' : 'ไม่มีคิวค้าง'}</p>}
              {lane.items.map((item, i) => (
                <RequestCard
                  key={item.id}
                  item={item}
                  rank={view === 'all' ? 'all' : 'color'}
                  showColor={view === 'all' || lane.kind !== 'waiting'}
                  isNext={lane.kind === 'waiting' && i === 0 && !q}
                  onOpen={() => setDialog({ id: item.id })}
                  onAction={(action) => setDialog({ id: item.id, action })}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-xs text-faint">ระบบไม่ทราบว่าเตียงสีไหนว่าง — ดูคิวแล้วเลือกเรียกเคสที่เหมาะสม · ลำดับคิวนับตามเวลาที่ส่งคำขอ (คืนคิว/เปิดใหม่ได้ตำแหน่งเดิม)</p>

      {dialog && (
        <RequestDialog
          key={`${dialog.id}-${dialog.action ?? ''}`}
          id={dialog.id}
          initialAction={dialog.action}
          onClose={() => setDialog(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
