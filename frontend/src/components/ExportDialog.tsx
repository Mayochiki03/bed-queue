/**
 * ExportDialog — ปุ่มส่งออก Excel "ปุ่มเดียว": กดแล้วเลือกว่าจะเอาข้อมูลชุดไหนบ้าง แล้วดาวน์โหลดเป็นไฟล์เดียว (ชีตแยกตามชุดข้อมูล)
 * ใช้ได้ทุกหน้า: หน้าหลัก (สรุป+กราฟ), หน้าประวัติคำขอ (ตามตัวกรองที่เลือกอยู่), หน้าบันทึกการใช้งาน (log)
 */
import { FileSpreadsheet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exportApi, type ExportFilters, type ExportOptions, type ExportSection } from '../api/exportApi';
import { cn } from '../lib/cn';
import { toParams, type PeriodChoice } from '../lib/period';
import { Button } from './Button';
import { Modal } from './Modal';
import { usePopup } from './Popup';
import { Spinner } from './Spinner';

const SECTION_INFO: Record<ExportSection, { title: string; desc: string }> = {
  summary: { title: 'สรุปภาพรวม + กราฟ', desc: 'การ์ดตัวเลข และกราฟ 5 แบบ (คิวตามสี, ผลลัพธ์, โรงพยาบาล, สารเสพติด, รายวัน) พร้อมตารางข้อมูลเบื้องหลัง' },
  widgets: { title: 'กราฟบน Dashboard ทีละอัน', desc: 'ชีตละ 1 กราฟ ตรงกับที่เห็นบนหน้าหลัก (ตารางข้อมูล + กราฟรูปแบบเดียวกัน)' },
  requests: { title: 'รายการคำขอทั้งหมด (ละเอียด)', desc: 'ผู้ป่วย ผู้ขอ โรงพยาบาล เบอร์โทร เวลาที่ส่ง/เรียกคิว/ผู้ขอตอบ/ปิดเคส ผู้ทำรายการ ช่องทาง หมายเหตุ — รวม 31 คอลัมน์' },
  events: { title: 'ประวัติเหตุการณ์ทุกครั้ง', desc: 'ส่งคำขอ เรียกคิว ยืนยัน/ไม่ยืนยัน ยกเลิก คืนคิว แก้ไข โอนเคส — ใครทำ เมื่อไร ผ่านช่องทางไหน และค่าก่อน → หลังเมื่อมีการแก้ไข' },
  requesters: { title: 'ผู้ขอที่ลงทะเบียน', desc: 'ชื่อ โรงพยาบาล เบอร์โทร สถานะ PDPA ใช้งานล่าสุด และจำนวนคำขอของแต่ละคน' },
  audit: { title: 'บันทึกการใช้งานระบบ (log)', desc: 'ใครเข้าระบบ ทำอะไรกับหน้าไหน เมื่อไร ผลสำเร็จหรือไม่ (เฉพาะผู้ดูแลระบบ)' },
};
const ORDER: ExportSection[] = ['summary', 'widgets', 'requests', 'events', 'requesters', 'audit'];

type Props = {
  open: boolean;
  onClose: () => void;
  /** ชุดข้อมูลที่ติ๊กไว้ตอนเปิด */
  initial: ExportSection[];
  /** ช่วงเวลาที่เลือกอยู่บน Dashboard — ไม่ใส่ = ค่าเริ่มต้นของระบบ */
  period?: PeriodChoice;
  /** ตัวกรองของหน้าที่เรียก (ประวัติคำขอ) — ถ้ามี คำขอ/เหตุการณ์จะออกตามตัวกรองนี้ */
  filters?: ExportFilters;
  filtersNote?: string;
};

export function ExportDialog({ open, onClose, initial, period, filters, filtersNote }: Props) {
  const popup = usePopup();
  const [opts, setOpts] = useState<ExportOptions | null>(null);
  const [picked, setPicked] = useState<Set<ExportSection>>(new Set(initial));
  const [widgetIds, setWidgetIds] = useState<Set<number>>(new Set());
  const [scope, setScope] = useState<'period' | 'all'>('period');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked(new Set(initial));
    setScope(filters ? 'all' : 'period');
    void exportApi.options().then((r) => {
      if (r.ok && r.data) {
        setOpts(r.data);
        setWidgetIds(new Set(r.data.widgets.filter((w) => w.is_active).map((w) => w.id)));
      } else {
        popup.error(r.message);
        onClose();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (s: ExportSection) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  const usedPeriod: PeriodChoice = period ?? { kind: 'days', days: opts?.default_days ?? 30 };
  const periodText = usedPeriod.kind === 'days' ? `${usedPeriod.days} วันล่าสุด` : usedPeriod.kind === 'preset' ? { today: 'วันนี้', yesterday: 'เมื่อวาน', all: 'ทั้งหมดตั้งแต่เปิดระบบ' }[usedPeriod.preset] : `${usedPeriod.from} ถึง ${usedPeriod.to || 'วันนี้'}`;
  const sections = ORDER.filter((s) => picked.has(s) && (s !== 'audit' || opts?.can_audit));
  const needsScope = sections.some((s) => s === 'requests' || s === 'events' || s === 'audit');
  const widgetsOk = !sections.includes('widgets') || widgetIds.size > 0;
  const canGo = sections.length > 0 && widgetsOk && !busy;

  async function go() {
    setBusy(true);
    const res = await exportApi
      .build({
        sections,
        ...toParams(usedPeriod),
        scope,
        widget_ids: sections.includes('widgets') ? [...widgetIds] : [],
        filters: filters && (sections.includes('requests') || sections.includes('events')) ? filters : undefined,
      })
      .finally(() => setBusy(false));
    if (res.ok) onClose();
    else popup.error(res.message);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-success-ink" aria-hidden="true" />
          ส่งออกเป็น Excel
        </span>
      }
      description="เลือกข้อมูลที่ต้องการ — ได้ไฟล์เดียว แยกชีตตามชุดข้อมูล มีตาราง สี และกราฟพร้อมใช้"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button disabled={!canGo} loading={busy} onClick={() => void go()}>
            ดาวน์โหลด Excel{sections.length > 0 ? ` (${sections.length} ชุด)` : ''}
          </Button>
        </>
      }
    >
      {!opts ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">เลือกแล้ว {sections.length} จาก {ORDER.filter((s) => s !== 'audit' || opts.can_audit).length} ชุด</span>
            <span className="flex gap-3">
              <button type="button" className="text-primary hover:underline" onClick={() => setPicked(new Set(ORDER.filter((s) => s !== 'audit' || opts.can_audit)))}>
                เลือกทั้งหมด
              </button>
              <button type="button" className="text-primary hover:underline" onClick={() => setPicked(new Set())}>
                ล้าง
              </button>
            </span>
          </div>

          {ORDER.filter((s) => s !== 'audit' || opts.can_audit).map((s) => {
            const on = picked.has(s);
            const info = SECTION_INFO[s];
            return (
              <div key={s} className={cn('rounded-xl border p-3.5 transition-colors', on ? 'border-primary bg-primary-soft/40' : 'border-border bg-card')}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" className="mt-1 size-4 accent-primary" checked={on} onChange={() => toggle(s)} />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-foreground">{info.title}</span>
                    <span className="block text-xs text-muted-foreground">{info.desc}</span>
                  </span>
                </label>
                {s === 'widgets' && on && (
                  <div className="mt-2.5 grid gap-1.5 border-t border-border pt-2.5 sm:grid-cols-2">
                    {opts.widgets.map((w) => (
                      <label key={w.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={widgetIds.has(w.id)}
                          onChange={() =>
                            setWidgetIds((cur) => {
                              const next = new Set(cur);
                              if (next.has(w.id)) next.delete(w.id);
                              else next.add(w.id);
                              return next;
                            })
                          }
                        />
                        <span className="truncate">{w.title}</span>
                        {!w.is_active && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">ซ่อนอยู่</span>}
                      </label>
                    ))}
                    {opts.widgets.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีกราฟบน Dashboard</p>}
                  </div>
                )}
              </div>
            );
          })}

          {needsScope &&
            (filters ? (
              <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info-ink">{filtersNote ?? 'คำขอและเหตุการณ์จะออกตามตัวกรองที่เลือกอยู่ในหน้านี้'}</p>
            ) : (
              <fieldset className="rounded-xl border border-border p-3.5">
                <legend className="px-1 text-sm font-semibold">ช่วงเวลาของ รายการคำขอ / ประวัติเหตุการณ์ / log</legend>
                <div className="flex flex-col gap-1.5 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="scope" className="size-4 accent-primary" checked={scope === 'period'} onChange={() => setScope('period')} />
                    เฉพาะที่ส่งในช่วง {periodText} (ตามที่เลือกบนหน้าหลัก)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="scope" className="size-4 accent-primary" checked={scope === 'all'} onChange={() => setScope('all')} />
                    ทั้งหมดตั้งแต่เริ่มใช้ระบบ
                  </label>
                </div>
              </fieldset>
            ))}
          <p className="text-xs text-faint">ไฟล์มีข้อมูลส่วนบุคคลของผู้ป่วย — เก็บรักษาอย่างปลอดภัยและไม่ส่งต่อนอกหน่วยงาน · ระบบบันทึกทุกครั้งที่ส่งออกว่าใครเลือกข้อมูลชุดไหน</p>
        </div>
      )}
    </Modal>
  );
}
