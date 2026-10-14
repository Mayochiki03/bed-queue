/**
 * LogTable — ตัวอย่างหน้า "อ่านอย่างเดียว" (ไม่มีปุ่มเพิ่ม/แก้/ลบ) ดูบันทึกการใช้งานของระบบ
 * ใช้เป็นต้นแบบหน้ารายงาน / Log: กรอง + ตาราง + แบ่งหน้า
 */
import { logApi, type LogRow } from '../../api/logApi';
import { Button } from '../../components/Button';
import { DataTable, type Column } from '../../components/DataTable';
import { FilterInput, FilterSelect } from '../../components/Fields';
import { PageCard, PageTitle } from '../../components/PageCard';
import { Pagination } from '../../components/Pagination';
import { useTableData } from '../../hooks/useTableData';
import { formatDateTime } from '../../lib/format';
import { MSG } from '../../lib/messages';

const ACTIONS = ['LOGIN', 'LOGOUT', 'CHANGE_PASSWORD', 'ADD', 'UPDATE', 'DELETE', 'GET'].map((v) => ({ value: v, label: v }));

export default function LogTable() {
  const table = useTableData(logApi.search, { q: '', page: '', action: '' });

  const columns: Column<LogRow>[] = [
    { header: 'เวลา', cell: (r) => formatDateTime(r.created_at), className: 'whitespace-nowrap' },
    { header: 'ผู้ใช้', cell: (r) => r.username ?? '-' },
    { header: 'หน้า', cell: (r) => r.page },
    { header: 'การกระทำ', cell: (r) => r.action },
    { header: 'Path', cell: (r) => <code className="text-xs">{r.path}</code> },
    {
      header: 'ผล',
      align: 'center',
      cell: (r) => (
        <span className={r.status_code < 400 ? 'rounded bg-success-soft px-2 py-0.5 text-xs text-success-ink' : 'rounded bg-danger-soft px-2 py-0.5 text-xs text-danger-ink'}>{r.status_code}</span>
      ),
    },
    { header: 'IP', cell: (r) => r.ip ?? '-' },
  ];

  return (
    <>
      <PageTitle hint="ทุกการเพิ่ม/แก้/ลบ/เข้าสู่ระบบ ถูกบันทึกให้อัตโนมัติ (การค้นหารายการไม่บันทึก)">บันทึกการใช้งาน</PageTitle>
      <PageCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-3">
          <FilterInput label="ค้นหา ผู้ใช้ / path" value={table.draft.q} onChange={(v) => table.setDraft('q', v)} onEnter={table.search} />
          <FilterInput label="หน้า (เช่น hospital, auth)" value={table.draft.page} onChange={(v) => table.setDraft('page', v)} onEnter={table.search} />
          <FilterSelect label="การกระทำ" value={table.draft.action} onChange={(v) => table.setDraft('action', v)} options={ACTIONS} />
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="outline" onClick={table.reset}>
            {MSG.reset}
          </Button>
          <Button onClick={table.search}>{MSG.search}</Button>
        </div>
      </PageCard>
      <PageCard title="รายการ">
        <DataTable columns={columns} rows={table.rows} rowKey={(r) => r.id} loading={table.loading} />
        <Pagination paging={table.paging} onPage={table.goPage} onPageSize={table.changePageSize} />
      </PageCard>
    </>
  );
}
