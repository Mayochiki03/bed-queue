/**
 * LogTable — ตัวอย่างหน้า "อ่านอย่างเดียว" (ไม่มีปุ่มเพิ่ม/แก้/ลบ) ดูบันทึกการใช้งานของระบบ
 * ใช้เป็นต้นแบบหน้ารายงาน / Log: กรอง + ตาราง + แบ่งหน้า
 */
import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { logApi, type LogRow } from '../../api/logApi';
import { Button } from '../../components/Button';
import { DataTable, type Column } from '../../components/DataTable';
import { ExportDialog } from '../../components/ExportDialog';
import { Modal } from '../../components/Modal';
import { FilterInput, FilterSelect } from '../../components/Fields';
import { PageCard, PageTitle } from '../../components/PageCard';
import { Pagination } from '../../components/Pagination';
import { useTableData } from '../../hooks/useTableData';
import { formatDateTime } from '../../lib/format';
import { MSG } from '../../lib/messages';

const pretty = (json: string) => {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
};

const ACTIONS = ['LOGIN', 'LOGOUT', 'CHANGE_PASSWORD', 'ADD', 'UPDATE', 'DELETE', 'GET', 'BOARD', 'TRANSITION', 'TRANSFER', 'BUILD'].map((v) => ({ value: v, label: v }));

export default function LogTable() {
  const table = useTableData(logApi.search, { q: '', page: '', action: '', date_from: '', date_to: '' });
  const [open, setOpen] = useState<LogRow | null>(null);
  const [exporting, setExporting] = useState(false);

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
          <FilterInput label="หน้า (เช่น request, hospital, auth)" value={table.draft.page} onChange={(v) => table.setDraft('page', v)} onEnter={table.search} />
          <FilterSelect label="การกระทำ" value={table.draft.action} onChange={(v) => table.setDraft('action', v)} options={ACTIONS} />
          <div className="flex flex-col gap-1">
            <label htmlFor="log_from" className="text-sm font-medium">
              ตั้งแต่วันที่
            </label>
            <input id="log_from" type="date" className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" value={table.draft.date_from} onChange={(e) => table.setDraft('date_from', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="log_to" className="text-sm font-medium">
              ถึงวันที่
            </label>
            <input id="log_to" type="date" className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" value={table.draft.date_to} onChange={(e) => table.setDraft('date_to', e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="outline" onClick={table.reset}>
            {MSG.reset}
          </Button>
          <Button onClick={table.search}>{MSG.search}</Button>
        </div>
      </PageCard>
      <PageCard
        title="รายการ"
        actions={
          <Button variant="outline" onClick={() => setExporting(true)}>
            <FileSpreadsheet className="size-4" /> ส่งออก Excel
          </Button>
        }
      >
        <DataTable columns={columns} rows={table.rows} rowKey={(r) => r.id} loading={table.loading} onRowClick={setOpen} />
        <Pagination paging={table.paging} onPage={table.goPage} onPageSize={table.changePageSize} />
      </PageCard>
      <ExportDialog open={exporting} onClose={() => setExporting(false)} initial={['audit']} />
      {open && (
        <Modal open onClose={() => setOpen(null)} title="รายละเอียดบันทึกการใช้งาน" description={`${open.username ?? '-'} · ${open.page}/${open.action.toLowerCase()}`}>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">เวลา</dt><dd>{formatDateTime(open.created_at)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">ผู้ใช้</dt><dd>{open.username ?? '-'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">หน้า / การกระทำ</dt><dd>{open.page} / {open.action}</dd></div>
            <div><dt className="text-xs text-muted-foreground">ผลลัพธ์ (HTTP)</dt><dd>{open.status_code}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Path</dt><dd><code className="break-all text-xs">{open.path}</code></dd></div>
            <div><dt className="text-xs text-muted-foreground">IP</dt><dd>{open.ip ?? '-'}</dd></div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">รายละเอียดที่บันทึก</dt>
              <dd>
                {open.detail ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">{pretty(open.detail)}</pre> : <span className="text-faint">ไม่มี (หน้าที่มีข้อมูลผู้ป่วยบันทึกเฉพาะรหัส/การกระทำ ไม่บันทึกชื่อ-เบอร์)</span>}
              </dd>
            </div>
          </dl>
        </Modal>
      )}
    </>
  );
}
