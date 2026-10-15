/**
 * WidgetCard — กรอบของ widget บน Dashboard: ชื่อ + เนื้อหากราฟ + (โหมดจัดวาง) ปุ่มย้าย/ขนาด/ซ่อน/แก้/ทำซ้ำ/ลบ
 * ลากวางด้วยเมาส์ (HTML5 DnD) · มือถือ/คีย์บอร์ดใช้ปุ่มเลื่อนซ้าย-ขวาแทน
 */
import { ArrowLeft, ArrowRight, Copy, Eye, EyeOff, GripVertical, Pencil, Trash2 } from 'lucide-react';
import type { WidgetResult, WidgetWithResult } from '../../api/dashboardApi';
import { cn } from '../../lib/cn';
import { WIDTH_LABEL } from '../../lib/widgetRules';
import { WidgetView } from './WidgetView';

export const WIDTH_CLASS: Record<number, string> = { 1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-2 lg:col-span-3', 4: 'col-span-2 lg:col-span-4' };

type Props = {
  w: WidgetWithResult;
  result: WidgetResult | null;
  edit: boolean;
  isFirst: boolean;
  isLast: boolean;
  dragging: boolean;
  dragOver: boolean;
  isAdmin: boolean;
  onMove: (dir: -1 | 1) => void;
  onWidth: (width: number) => void;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  dnd: { draggable: boolean; onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void; onDragEnd: () => void };
};

const iconBtn = 'rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none';

export function WidgetCard({ w, result, edit, isFirst, isLast, dragging, dragOver, isAdmin, onMove, onWidth, onToggle, onEdit, onDuplicate, onDelete, dnd }: Props) {
  return (
    <section
      data-widget={w.id}
      {...(edit ? dnd : {})}
      className={cn(
        'min-w-0 rounded-2xl border bg-card p-4 sm:p-5',
        WIDTH_CLASS[w.width] ?? 'col-span-2',
        edit ? 'border-dashed border-primary/50' : 'border-border',
        !w.is_active && 'opacity-55',
        dragging && 'opacity-40',
        dragOver && 'ring-2 ring-primary',
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[16px] font-semibold text-foreground">
          {edit && <GripVertical className="size-4 shrink-0 cursor-grab text-faint" aria-hidden="true" />}
          <span className="truncate">{w.title}</span>
          {!w.is_active && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">ซ่อนอยู่</span>}
        </h2>
      </div>

      {result ? <WidgetView chart={w.chart} group_by={w.group_by} result={result} /> : <p className="py-6 text-center text-sm text-muted-foreground">{w.is_active ? 'ไม่สามารถแสดงกราฟนี้ได้' : 'ซ่อนอยู่ — ไม่แสดงให้ผู้อื่นเห็น'}</p>}

      {edit && isAdmin && (
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border pt-2.5">
          <button type="button" className={iconBtn} disabled={isFirst} onClick={() => onMove(-1)} aria-label="เลื่อนไปก่อนหน้า" title="เลื่อนไปก่อนหน้า">
            <ArrowLeft className="size-4" />
          </button>
          <button type="button" className={iconBtn} disabled={isLast} onClick={() => onMove(1)} aria-label="เลื่อนไปถัดไป" title="เลื่อนไปถัดไป">
            <ArrowRight className="size-4" />
          </button>
          <label className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
            ความกว้าง
            <select className="rounded-md border border-border bg-card px-1.5 py-1 text-xs text-foreground" value={w.width} onChange={(e) => onWidth(Number(e.target.value))} aria-label={`ความกว้าง ${w.title}`}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {WIDTH_LABEL[n]}
                </option>
              ))}
            </select>
          </label>
          <span className="flex-1" />
          <button type="button" className={iconBtn} onClick={onToggle} aria-label={w.is_active ? 'ซ่อน' : 'แสดง'} title={w.is_active ? 'ซ่อน' : 'แสดง'}>
            {w.is_active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </button>
          <button type="button" className={iconBtn} onClick={onEdit} aria-label={`แก้ไข ${w.title}`} title="แก้ไข">
            <Pencil className="size-4" />
          </button>
          <button type="button" className={iconBtn} onClick={onDuplicate} aria-label="ทำซ้ำ" title="ทำซ้ำ">
            <Copy className="size-4" />
          </button>
          <button type="button" className={cn(iconBtn, 'hover:text-danger')} onClick={onDelete} aria-label={`ลบ ${w.title}`} title="ลบ">
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </section>
  );
}
