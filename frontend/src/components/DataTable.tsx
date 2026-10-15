import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { MSG } from '../lib/messages';
import { Spinner } from './Spinner';

export type Column<T> = {
  header: string;
  /** แสดงอะไรในเซลล์ — index คือลำดับแถวในหน้านี้ (เริ่ม 0) */
  cell: (row: T, index: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  /** กดที่ไหนก็ได้ในแถวเพื่อเปิดรายละเอียด/แก้ไข (ปุ่ม ลิงก์ และช่องกรอกในแถวยังทำงานของมันเอง) */
  onRowClick?: (row: T) => void;
};

const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' };

/**
 * ตารางข้อมูลมาตรฐาน — กำหนดคอลัมน์เป็นรายการ แล้วส่งแถวเข้ามา
 *   <DataTable rowKey={(r) => r.id} rows={rows} columns={[{ header: 'ชื่อ', cell: (r) => r.name }]} />
 *
 * จอเล็ก (มือถือ): คอลัมน์ที่ไม่สำคัญให้ซ่อนด้วย className — เช่น 'hidden md:table-cell' (ซ่อนต่ำกว่า 768px)
 * คอลัมน์ "จัดการ" (แก้/ลบ) ไม่ควรซ่อน เพื่อให้กดได้ทุกขนาดจอ
 */
export function DataTable<T>({ columns, rows, rowKey, loading, onRowClick }: Props<T>) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-accent-soft text-accent-ink">
          <tr>
            {columns.map((c) => (
              <th key={c.header} className={cn('px-3 py-2.5 font-semibold', alignClass[c.align ?? 'left'], c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row)}
              className={cn('border-t border-border odd:bg-card even:bg-muted/40 hover:bg-primary-soft/60', onRowClick && 'cursor-pointer focus-visible:bg-primary-soft focus-visible:outline-none')}
              {...(onRowClick
                ? {
                    tabIndex: 0,
                    onClick: (e: React.MouseEvent) => {
                      if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label')) return;
                      onRowClick(row);
                    },
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row);
                    },
                  }
                : {})}
            >
              {columns.map((c) => (
                <td key={c.header} className={cn('px-3 py-2', alignClass[c.align ?? 'left'], c.className)}>
                  {c.cell(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <Spinner />}
      {!loading && rows.length === 0 && <p className="py-8 text-center text-muted-foreground">{MSG.noData}</p>}
    </div>
  );
}
