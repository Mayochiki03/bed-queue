/**
 * RequestCard — การ์ดคำขอบนบอร์ดคิว (แบบ Jira): ลำดับ · ผู้ป่วย · โรงพยาบาล · เวลารอ · ปุ่มทำงานเร็ว
 * กดที่ตัวการ์ดเปิดรายละเอียด · ปุ่มบนการ์ดไม่เปิดรายละเอียดซ้อน
 */
import { Clock, TriangleAlert } from 'lucide-react';
import type { BoardItem } from '../../api/requestApi';
import { useLookups } from '../../hooks/useLookups';
import { cn } from '../../lib/cn';
import { Button } from '../Button';
import { ColorChip } from '../ColorChip';
import { fmtHours, fmtWait, GENDER_LABEL, PhoneLink } from './parts';

type Props = {
  item: BoardItem;
  /** ลำดับที่ใหญ่ของการ์ด: all = ลำดับรวมทุกสี, color = ลำดับในสีเดียวกัน */
  rank: 'all' | 'color';
  showColor: boolean;
  isNext: boolean;
  onOpen: () => void;
  onAction: (action: 'CALL' | 'CONFIRM' | 'DECLINE') => void;
};

export function RequestCard({ item: r, rank, showColor, isNext, onOpen, onAction }: Props) {
  const lk = useLookups();
  const pos = rank === 'all' ? r.position_all : r.position_color;
  const other = rank === 'all' ? r.position_color : r.position_all;
  const called = r.status === 'CALLED';
  const meta = [r.patient_gender ? GENDER_LABEL[r.patient_gender] : '', r.patient_age !== null ? `${r.patient_age} ปี` : '', r.substance_code ? lk.label('SUBSTANCE', r.substance_code) : ''].filter(Boolean).join(' · ');

  return (
    <article
      className={cn(
        'group cursor-pointer rounded-lg border bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-ring/40',
        r.overdue ? 'border-warn-ink/50' : isNext ? 'border-primary/60' : 'border-border',
      )}
      style={showColor ? { borderLeft: `4px solid ${lk.colorOf(r.color_code)}` } : undefined}
      onClick={onOpen}
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {pos !== null ? (
            <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold', isNext ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')} title={rank === 'all' ? 'ลำดับรวมทุกสี' : 'ลำดับในสีเดียวกัน'}>
              {pos}
            </span>
          ) : (
            <span className="inline-flex h-6 items-center whitespace-nowrap rounded-md bg-warn-soft px-1.5 text-xs font-semibold text-warn-ink">เรียกแล้ว</span>
          )}
          {showColor && r.color_code && <ColorChip label={lk.label('COLOR', r.color_code)} color={lk.colorOf(r.color_code)} />}
          {isNext && <span className="whitespace-nowrap text-[11px] font-semibold text-primary-ink">คิวถัดไป</span>}
        </div>
        <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-faint">{r.request_no}</span>
      </div>

      <h3 className="truncate text-[15px] font-semibold text-foreground" title={r.patient_name}>
        {r.patient_name}
      </h3>
      {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      <p className="mt-1 truncate text-sm text-foreground" title={r.hospital_name}>
        {r.hospital_name}
      </p>
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        <span className="truncate">ผู้ขอ {r.requester_name}</span>
        {r.requester_phone && <PhoneLink value={r.requester_phone} className="text-xs" />}
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="size-3.5" aria-hidden="true" />
            รอมา {fmtWait(r.wait_days)}
            {!called && other !== null && <span className="text-faint">· {rank === 'all' ? 'ในสี' : 'รวม'} #{other}</span>}
          </span>
          {called && r.called_hours !== null && (
            <span className={cn('inline-flex items-center gap-1', r.overdue ? 'font-semibold text-warn-ink' : 'text-muted-foreground')}>
              {r.overdue && <TriangleAlert className="size-3.5" aria-hidden="true" />}
              เรียกแล้ว {fmtHours(r.called_hours)}
              {r.overdue ? ' (เกินเวลา)' : ''}
            </span>
          )}
        </div>
        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          {r.status === 'WAITING' && (
            <Button size="sm" onClick={() => onAction('CALL')}>
              เรียกคิว
            </Button>
          )}
          {called && (
            <>
              <Button size="sm" variant="outline" onClick={() => onAction('DECLINE')}>
                ไม่ยืนยัน
              </Button>
              <Button size="sm" onClick={() => onAction('CONFIRM')}>
                ยืนยัน
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
