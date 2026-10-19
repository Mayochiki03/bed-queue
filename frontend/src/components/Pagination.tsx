import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageResult } from '../api/client';
import { Button } from './Button';
import { Select } from './Select';

export type Paging = Pick<PageResult<unknown>, 'pageNo' | 'pageSize' | 'totalRow' | 'totalPage' | 'rowsPerPageOption'>;

type Props = { paging: Paging; onPage: (n: number) => void; onPageSize: (n: number) => void };

/** แถบเปลี่ยนหน้าใต้ตาราง: จำนวนแถวต่อหน้า + 1-15 จาก N + ปุ่มก่อนหน้า/ถัดไป */
export function Pagination({ paging, onPage, onPageSize }: Props) {
  const from = paging.totalRow === 0 ? 0 : (paging.pageNo - 1) * paging.pageSize + 1;
  const to = Math.min(paging.pageNo * paging.pageSize, paging.totalRow);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>จำนวนแถวต่อหน้า</span>
<Select size="sm" aria-label="จำนวนแถวต่อหน้า" className="w-auto min-w-[4.5rem]" value={String(paging.pageSize)} onChange={(v) => onPageSize(Number(v))} options={paging.rowsPerPageOption.map((n) => ({ value: String(n), label: String(n) }))} />
      </div>
      <span>
        {from}-{to} จาก {paging.totalRow}
      </span>
      <Button variant="ghost" size="sm" aria-label="หน้าก่อนหน้า" disabled={paging.pageNo <= 1} onClick={() => onPage(paging.pageNo - 1)}>
        <ChevronLeft className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" aria-label="หน้าถัดไป" disabled={paging.pageNo >= paging.totalPage} onClick={() => onPage(paging.pageNo + 1)}>
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
