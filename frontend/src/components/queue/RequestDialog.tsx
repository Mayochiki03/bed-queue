/**
 * RequestDialog — รายละเอียดคำขอ + ปุ่มดำเนินการ (เรียกคิว / บันทึกผล / คืนคิว / ยกเลิก / เปิดใหม่ / โอนเคส / แก้ไข) + ประวัติทุกเหตุการณ์
 * ใช้ทั้งในบอร์ดคิวและหน้าประวัติ · initialAction = เปิดมาที่ฟอร์มบันทึกผลทันที (กดมาจากปุ่มบนการ์ด)
 * ทุกการเปลี่ยนสถานะมี popup ยืนยันก่อน · ถ้ามีคนเปลี่ยนสถานะไปก่อน ระบบแจ้งและโหลดข้อมูลใหม่ให้
 */
import { ArrowRightLeft, Pencil } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { requestApi, type Action, type RequestDetail, type RequesterOption, type Via } from '../../api/requestApi';
import { useLookups } from '../../hooks/useLookups';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { Button } from '../Button';
import { ColorChip } from '../ColorChip';
import { Modal } from '../Modal';
import { usePopup } from '../Popup';
import { Spinner } from '../Spinner';
import { EVENT_LABEL, fmtHours, fmtWait, GENDER_LABEL, PhoneLink, StatusChip, VIA_LABEL } from './parts';

const ACTION_LABEL: Record<Action, string> = { CALL: 'เรียกคิว', CONFIRM: 'ยืนยันส่งตัว', DECLINE: 'ไม่ยืนยัน', CANCEL: 'ยกเลิกคำขอ', REQUEUE: 'คืนคิว', REOPEN: 'เปิดคิวใหม่' };
const OUTCOME: Action[] = ['CONFIRM', 'DECLINE', 'CANCEL'];
const inputClass = 'w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30';

type Props = { id: number; initialAction?: Action; onClose: () => void; onChanged: () => void };

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm text-foreground">{children || <span className="text-faint">-</span>}</dd>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = { APP: 'ผู้ขอส่งเอง', ADMIN: 'เจ้าหน้าที่บันทึกแทน', IMPORT: 'นำเข้าจาก Excel' };
const dayDiff = (a: string, b: string) => {
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
  return d < 1 ? fmtWait(d) : `${d.toFixed(1)} วัน`;
};

/** เวลาสำคัญของคำขอ: ส่ง → เรียก → ตอบ → ปิดเคส (ใครทำ ช่องทางไหน) */
function Times({ d }: { d: RequestDetail }) {
  const firstCall = d.events.find((e) => e.event === 'CALLED')?.created_at ?? null;
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'ส่งคำขอเมื่อ', value: <>{formatDateTime(d.submitted_at)} <span className="text-muted-foreground">({SOURCE_LABEL[d.source] ?? d.source})</span></> },
  ];
  if (Math.abs(new Date(d.created_at).getTime() - new Date(d.submitted_at).getTime()) > 120_000) rows.push({ label: 'บันทึกเข้าระบบเมื่อ', value: formatDateTime(d.created_at) });
  if (firstCall) rows.push({ label: 'เรียกคิวครั้งแรก', value: <>{formatDateTime(firstCall)} <span className="text-muted-foreground">(รอ {dayDiff(d.submitted_at, firstCall)} นับจากส่งคำขอ)</span></> });
  if (d.called_at) rows.push({ label: 'เรียกคิวล่าสุด', value: <>{formatDateTime(d.called_at)}{d.called_by_name ? ` · โดย ${d.called_by_name}` : ''} <span className="text-muted-foreground">(เรียกแล้ว {d.call_count} ครั้ง)</span></> });
  if (d.responded_at) rows.push({ label: 'ผู้ขอตอบเมื่อ', value: formatDateTime(d.responded_at) });
  if (d.resolved_at) {
    rows.push({
      label: d.status === 'CONFIRMED' ? 'ยืนยันส่งตัวเมื่อ' : d.status === 'DECLINED' ? 'ไม่ยืนยันเมื่อ' : 'ปิดเคสเมื่อ',
      value: (
        <>
          {formatDateTime(d.resolved_at)}
          {d.resolved_via ? ` · ${VIA_LABEL[d.resolved_via] ?? d.resolved_via}` : ''}
          {d.resolved_by_name ? ` · โดย ${d.resolved_by_name}` : ''} <span className="text-muted-foreground">(รวม {dayDiff(d.submitted_at, d.resolved_at)} นับจากส่งคำขอ)</span>
        </>
      ),
    });
  }
  if (Math.abs(new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) > 120_000) rows.push({ label: 'แก้ไขล่าสุดเมื่อ', value: formatDateTime(d.updated_at) });
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-foreground">เวลาสำคัญ</h3>
      <dl className="grid gap-x-4 gap-y-1.5 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-[11rem_1fr]">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** ค่าก่อน → หลัง ของเหตุการณ์แก้ไข/โอนเคส */
function Changes({ json }: { json: string | null }) {
  const lk = useLookups();
  if (!json) return null;
  let list: { field: string; label: string; from: string | null; to: string | null }[] = [];
  try {
    list = JSON.parse(json);
  } catch {
    return null;
  }
  const show = (field: string, v: string | null) => {
    if (v === null) return <span className="text-faint">(ว่าง)</span>;
    if (field === 'color_code') return lk.label('COLOR', v);
    if (field === 'substance_code') return lk.label('SUBSTANCE', v);
    if (field === 'reason_code') return lk.label('REASON', v);
    if (field === 'patient_gender') return GENDER_LABEL[v] ?? v;
    if (field === 'submitted_at') return formatDateTime(v);
    return v;
  };
  return (
    <ul className="mt-1 flex flex-col gap-0.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">
      {list.map((c) => (
        <li key={c.field} className="break-words">
          <span className="text-muted-foreground">{c.label}:</span> <span className="line-through decoration-faint">{show(c.field, c.from)}</span> → <b className="font-medium text-foreground">{show(c.field, c.to)}</b>
        </li>
      ))}
    </ul>
  );
}

export function RequestDialog({ id, initialAction, onClose, onChanged }: Props) {
  const navigate = useNavigate();
  const popup = usePopup();
  const lk = useLookups();
  const [d, setD] = useState<RequestDetail | null>(null);
  const [outcome, setOutcome] = useState<Action | null>(initialAction && OUTCOME.includes(initialAction) ? initialAction : null);
  const [via, setVia] = useState<Via>('PHONE');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [transfer, setTransfer] = useState<RequesterOption[] | null>(null);
  const [transferTo, setTransferTo] = useState('');

  const load = useCallback(async () => {
    const res = await requestApi.get(id);
    if (res.ok && res.data) setD(res.data);
    else {
      popup.error(res.message);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  // เปิดมาจากปุ่มบนการ์ดที่ไม่ต้องกรอกอะไร (เรียกคิว/คืนคิว/เปิดใหม่) → ถามยืนยันทันที
  useEffect(() => {
    if (d && (initialAction === 'CALL' || initialAction === 'REQUEUE' || initialAction === 'REOPEN')) void runSimple(initialAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.id]);

  async function finish(res: Awaited<ReturnType<typeof requestApi.transition>>, doneMessage: string) {
    if (res.ok) {
      popup.success(doneMessage);
      setOutcome(null);
      setNote('');
      onChanged();
      await load();
    } else {
      popup.error(res.message);
      onChanged(); // สถานะอาจถูกเปลี่ยนไปก่อนแล้ว — โหลดใหม่
      await load();
    }
  }

  /** เรียกคิว / คืนคิว / เปิดคิวใหม่ — ถามยืนยันแล้วทำเลย (ไม่ต้องกรอกอะไรเพิ่ม) */
  async function runSimple(a: 'CALL' | 'REQUEUE' | 'REOPEN') {
    if (!d) return;
    const who = `${d.patient_name} (${d.hospital_name})`;
    const phones = [d.requester_phone, d.requester_phone2].filter(Boolean).join(' / ');
    const message = {
      CALL: `เรียกคิว: ${who}\n\nหลังกดยืนยัน โปรดโทรแจ้งผู้ขอ ${d.requester_name}${phones ? `\nเบอร์ ${phones}` : ''}\n(ระบบยังไม่ส่งข้อความ LINE อัตโนมัติ)`,
      REQUEUE: `คืนคิว: ${who}\nคำขอจะกลับไปรอคิวที่ตำแหน่งเดิม (นับจากเวลาที่ส่งคำขอ)`,
      REOPEN: `เปิดคิวใหม่: ${who}\nคำขอจะกลับไปรอคิวที่ตำแหน่งเดิม (นับจากเวลาที่ส่งคำขอ)`,
    }[a];
    if (!(await popup.confirm({ title: ACTION_LABEL[a], message, confirmText: ACTION_LABEL[a] }))) {
      if (initialAction === a) onClose();
      return;
    }
    setBusy(true);
    const res = await requestApi.transition(d.id, a, { via: 'ADMIN' }).finally(() => setBusy(false));
    await finish(res, a === 'CALL' ? `บันทึกการเรียกคิวแล้ว\nโปรดโทรแจ้ง ${d.requester_name}${phones ? ` (${phones})` : ''}` : `${ACTION_LABEL[a]}แล้ว`);
  }

  async function submitOutcome() {
    if (!d || !outcome) return;
    setBusy(true);
    const res = await requestApi.transition(d.id, outcome, { via, note: note.trim() || undefined }).finally(() => setBusy(false));
    await finish(res, `${ACTION_LABEL[outcome]}แล้ว`);
  }

  async function openTransfer() {
    if (!d) return;
    const res = await requestApi.requesters(d.hospital_id);
    if (!res.ok || !res.data) return popup.error(res.message);
    setTransfer(res.data.filter((r) => r.id !== d.requester_id && !r.is_blocked));
    setTransferTo('');
  }

  async function submitTransfer() {
    if (!d || !transferTo) return;
    const target = transfer?.find((r) => r.id === Number(transferTo));
    if (!(await popup.confirm({ title: 'โอนเคส', message: `โอนคำขอของ ${d.patient_name}\nจาก ${d.requester_name}\nไป ${target?.full_name}\n\nผู้ขอคนใหม่จะเป็นผู้ติดต่อของเคสนี้` }))) return;
    setBusy(true);
    const res = await requestApi.transfer(d.id, Number(transferTo)).finally(() => setBusy(false));
    if (res.ok) {
      popup.success('โอนเคสแล้ว');
      setTransfer(null);
      onChanged();
      await load();
    } else popup.error(res.message);
  }

  const open = d?.status === 'WAITING' || d?.status === 'CALLED';
  const footer = d && !outcome && !transfer && (
    <>
      <Button variant="outline" onClick={() => navigate('/queue/edit', { state: { id: d.id } })}>
        <Pencil className="size-4" />
        แก้ไขข้อมูล
      </Button>
      {open && (
        <Button variant="outline" onClick={() => void openTransfer()}>
          <ArrowRightLeft className="size-4" />
          โอนเคส
        </Button>
      )}
      {d.status === 'WAITING' && (
        <>
          <Button variant="outline" className="text-danger" onClick={() => setOutcome('CANCEL')}>
            ยกเลิกคำขอ
          </Button>
          <Button loading={busy} onClick={() => void runSimple('CALL')}>
            เรียกคิว
          </Button>
        </>
      )}
      {d.status === 'CALLED' && (
        <>
          <Button variant="outline" className="text-danger" onClick={() => setOutcome('CANCEL')}>
            ยกเลิกคำขอ
          </Button>
          <Button variant="outline" onClick={() => void runSimple('REQUEUE')}>
            คืนคิว
          </Button>
          <Button variant="outline" onClick={() => void runSimple('CALL')}>
            เรียกซ้ำ
          </Button>
          <Button variant="outline" onClick={() => setOutcome('DECLINE')}>
            ไม่ยืนยัน
          </Button>
          <Button onClick={() => setOutcome('CONFIRM')}>ยืนยันส่งตัว</Button>
        </>
      )}
      {d.status === 'CONFIRMED' && (
        <Button variant="outline" className="text-danger" onClick={() => setOutcome('CANCEL')}>
          ยกเลิกคำขอ
        </Button>
      )}
      {(d.status === 'DECLINED' || d.status === 'CANCELLED') && <Button onClick={() => void runSimple('REOPEN')}>เปิดคิวใหม่</Button>}
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        d ? (
          <span className="flex flex-wrap items-center gap-2">
            {d.patient_name}
            <StatusChip status={d.status} />
            {d.color_code && <ColorChip label={lk.label('COLOR', d.color_code)} color={lk.colorOf(d.color_code)} />}
          </span>
        ) : (
          'รายละเอียดคำขอ'
        )
      }
      description={d ? `${d.request_no ?? ''} · ${d.hospital_name}` : undefined}
      footer={footer || undefined}
    >
      {!d ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-5">
          {/* ฟอร์มบันทึกผล */}
          {outcome && (
            <section className="rounded-lg border border-primary/30 bg-primary-soft/50 p-4">
              <h3 className="mb-3 font-semibold text-foreground">{ACTION_LABEL[outcome]}</h3>
              <fieldset className="mb-3">
                <legend className="mb-1 text-sm font-medium">ได้ผลจาก</legend>
                <div className="flex flex-wrap gap-4 text-sm">
                  {(
                    [
                      ['PHONE', 'โทรศัพท์คุยกับผู้ขอแล้ว'],
                      ['ADMIN', 'เจ้าหน้าที่ตัดสินใจเอง'],
                    ] as const
                  ).map(([v, l]) => (
                    <label key={v} className="flex items-center gap-2">
                      <input type="radio" name="via" className="size-4 accent-primary" checked={via === v} onChange={() => setVia(v)} />
                      {l}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="mb-1 block text-sm font-medium" htmlFor="outcome-note">
                หมายเหตุ (ไม่บังคับ)
              </label>
              <textarea id="outcome-note" rows={2} maxLength={300} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ผู้ขอแจ้งว่าญาติไม่พร้อม / นัดส่งตัววันพรุ่งนี้" />
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOutcome(null)}>
                  กลับ
                </Button>
                <Button variant={outcome === 'CANCEL' ? 'danger' : 'primary'} loading={busy} onClick={() => void submitOutcome()}>
                  {ACTION_LABEL[outcome]}
                </Button>
              </div>
            </section>
          )}

          {/* โอนเคส */}
          {transfer && (
            <section className="rounded-lg border border-primary/30 bg-primary-soft/50 p-4">
              <h3 className="mb-1 font-semibold text-foreground">โอนเคสให้ผู้ขออื่นของ {d.hospital_name}</h3>
              {transfer.length === 0 ? (
                <p className="text-sm text-muted-foreground">โรงพยาบาลนี้ยังไม่มีผู้ขอคนอื่นที่ลงทะเบียนไว้ — ให้เพื่อนร่วมงานลงทะเบียนก่อน หรือแก้ชื่อ/เบอร์ผู้ขอที่หน้า "แก้ไขข้อมูล"</p>
              ) : (
                <>
                  <label htmlFor="transfer-to" className="mb-1 block text-sm font-medium">
                    ผู้ขอคนใหม่
                  </label>
                  <select id="transfer-to" className={inputClass} value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                    <option value="">-- เลือก --</option>
                    {transfer.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.full_name} · {r.phone}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTransfer(null)}>
                  กลับ
                </Button>
                {transfer.length > 0 && (
                  <Button disabled={!transferTo} loading={busy} onClick={() => void submitTransfer()}>
                    โอนเคส
                  </Button>
                )}
              </div>
            </section>
          )}

          {d.status === 'CALLED' && d.called_at && (
            <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn-ink">
              เรียกคิวเมื่อ {formatDateTime(d.called_at)} (เรียกแล้ว {d.call_count} ครั้ง) · ยังไม่ได้รับการยืนยัน — ติดต่อ {d.requester_name} <PhoneLink value={d.requester_phone} />
            </p>
          )}

          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Info label="โรงพยาบาลต้นทาง">
              {d.hospital_name} <span className="text-muted-foreground">({d.hospital_code})</span>
            </Info>
            <Info label="ผู้ขอ">
              {d.requester_name}
              {d.requester?.has_line ? <span className="ml-1 rounded bg-primary-soft px-1.5 py-0.5 text-xs text-primary-ink">LINE</span> : null}
            </Info>
            <Info label="เบอร์ผู้ขอ">
              <div className="flex flex-col gap-0.5">
                <PhoneLink value={d.requester_phone} />
                {d.requester_phone2 && <PhoneLink value={d.requester_phone2} />}
              </div>
            </Info>
            <Info label="เบอร์ผู้ป่วย/ญาติ">{d.patient_phone && <PhoneLink value={d.patient_phone} />}</Info>
            <Info label="เพศ / อายุ">
              {[d.patient_gender ? GENDER_LABEL[d.patient_gender] : '', d.patient_age !== null ? `${d.patient_age} ปี` : ''].filter(Boolean).join(' · ')}
            </Info>
            <Info label="จังหวัด">{d.patient_province}</Info>
            <Info label="ประเภทสารเสพติด">{d.substance_code ? lk.label('SUBSTANCE', d.substance_code) : ''}</Info>
            <Info label="เหตุผลการส่งต่อ">{d.reason_code ? lk.label('REASON', d.reason_code) : ''}</Info>
            {d.status === 'WAITING' && (
              <Info label="ลำดับในคิว">
                {d.position_all !== null && (
                  <>
                    ที่ {d.position_all} ของทุกสี
                    {d.position_color !== null && d.color_code ? ` · ที่ ${d.position_color} ในสี${lk.label('COLOR', d.color_code)}` : ''}
                  </>
                )}
              </Info>
            )}
            <div className="sm:col-span-2">
              <Info label="หมายเหตุ">{d.note}</Info>
            </div>
          </dl>

          <Times d={d} />

          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">ประวัติทุกเหตุการณ์ ({d.events.length})</h3>
            <ol className="flex flex-col gap-0 border-l-2 border-border pl-4">
              {d.events.map((e, i) => (
                <li key={e.id} className={cn('relative pb-3 text-sm', i === d.events.length - 1 && 'pb-0')}>
                  <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-primary" aria-hidden="true" />
                  <div className="font-medium text-foreground">
                    {EVENT_LABEL[e.event] ?? e.event}
                    <span className="ml-2 font-normal text-muted-foreground">{formatDateTime(e.created_at)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[e.by_label, e.via ? VIA_LABEL[e.via] : ''].filter(Boolean).join(' · ')}
                    {e.detail ? ` — ${e.detail}` : ''}
                  </div>
                  <Changes json={e.changes} />
                </li>
              ))}
            </ol>
          </section>
          {d.status === 'CALLED' && d.called_at && <p className="text-xs text-faint">เรียกมาแล้ว {fmtHours((Date.now() - new Date(d.called_at).getTime()) / 3_600_000)} · รอมา {fmtWait((Date.now() - new Date(d.submitted_at).getTime()) / 86_400_000)} นับจากส่งคำขอ</p>}
        </div>
      )}
    </Modal>
  );
}
