/**
 * components/SelectModal.tsx — modal "เลือกรายการจากตาราง": ช่องค้นหา + ตารางมี checkbox + แบ่งหน้า + ปุ่ม ยกเลิก/ยืนยัน
 * ใช้เมื่ออยากให้ผู้ใช้ "เลือกค่า" จากรายการยาว ๆ (เช่น เลือกคู่ค้า เลือกผู้ใช้) แทนช่อง dropdown
 *
 * ห่อเป็น modal ของหน้าตัวเองไว้ในโฟลเดอร์ modal/ ของหน้านั้น (ดูตัวอย่าง pages/xxx/modal/XxxPickModal.tsx):
 *
 *   <SelectModal open={open} onClose={...} title="เลือกคู่ค้า" columns={...} rowKey={(r) => r.id}
 *                fetcher={(p) => hospitalApi.search({ ...p, category: '' })} onConfirm={(rows) => ...} />
 *
 * multiple = false (ค่าเริ่มต้น): เลือกได้ 1 รายการ · multiple: เลือกได้หลายรายการ (ข้ามหน้าก็จำไว้)
 */
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import type { ApiResult, PageResult } from '../api/client';
import { useTableData } from '../hooks/useTableData';
import { MSG } from '../lib/messages';
import { Button } from './Button';
import { DataTable, type Column } from './DataTable';
import { FilterInput } from './Fields';
import { Pagination } from './Pagination';

type Props<T> = {
  open: boolean;
  onClose: () => void;
  title?: string;
  searchLabel?: string;
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  fetcher: (p: { q: string; pageNo: number; pageSize: number }) => Promise<ApiResult<PageResult<T>>>;
  multiple?: boolean;
  onConfirm: (rows: T[]) => void;
};

export function SelectModal<T>(props: Props<T>) {
  return (
    <Dialog.Root open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[94vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-card p-5 shadow-xl">
          <Dialog.Title className="mb-3 text-lg font-semibold">{props.title ?? 'ค้นหารายการที่ต้องการ'}</Dialog.Title>
          <Dialog.Description className="sr-only">เลือกรายการจากตารางแล้วกดยืนยัน</Dialog.Description>
          {/* แยกเป็นคอมโพเนนต์ย่อย เพื่อให้ค่าที่ค้นหา/เลือกไว้ถูกล้างทุกครั้งที่เปิดใหม่ */}
          <Body {...props} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body<T>({ onClose, searchLabel = 'ค้นหา', columns, rowKey, fetcher, multiple, onConfirm }: Props<T>) {
  const table = useTableData(fetcher, { q: '' });
  const [selected, setSelected] = useState<Map<string | number, T>>(new Map());

  function toggle(row: T) {
    const key = rowKey(row);
    setSelected((prev) => {
      const next = new Map(multiple ? prev : []);
      if (prev.has(key)) next.delete(key);
      else next.set(key, row);
      return next;
    });
  }

  const checkboxColumn: Column<T> = {
    header: '',
    className: 'w-10',
    cell: (row) => (
      <input type="checkbox" className="size-4 accent-primary" checked={selected.has(rowKey(row))} onChange={() => toggle(row)} aria-label="เลือกรายการ" />
    ),
  };

  return (
    <>
      <div className="mb-3 flex items-end gap-2">
        <div className="flex-1">
          <FilterInput label={searchLabel} value={table.draft.q} onChange={(v) => table.setDraft('q', v)} onEnter={table.search} />
        </div>
        <Button onClick={table.search}>{MSG.search}</Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <DataTable columns={[checkboxColumn, ...columns]} rows={table.rows} rowKey={rowKey} loading={table.loading} />
        <Pagination paging={table.paging} onPage={table.goPage} onPageSize={table.changePageSize} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-sm text-muted-foreground">เลือกแล้ว {selected.size} รายการ</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            {MSG.cancel}
          </Button>
          <Button
            disabled={selected.size === 0}
            onClick={() => {
              onConfirm([...selected.values()]);
              onClose();
            }}
          >
            {MSG.confirm}
          </Button>
        </div>
      </div>
    </>
  );
}
