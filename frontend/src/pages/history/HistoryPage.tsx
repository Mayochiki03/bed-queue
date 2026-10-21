/**
 * HistoryPage — ประวัติ/ค้นหาคำขอทั้งหมด (ทุกสถานะ): กรองตามสถานะ สี โรงพยาบาล ช่วงวันที่ + ค้นหา ชื่อผู้ป่วย/ผู้ขอ/เลขคำขอ
 * กดแถวเพื่อดูรายละเอียดและประวัติของคำขอ (ทำรายการต่อได้เหมือนในบอร์ด)
 */
import { FileSpreadsheet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { hospitalApi, type HospitalOption } from '../../api/hospitalApi';
import { requestApi, STATUS_OPTIONS, type RequestBase } from '../../api/requestApi';
import { Button } from '../../components/Button';
import { ColorChip } from '../../components/ColorChip';
import { DataTable, type Column } from '../../components/DataTable';
import { DatePicker } from '../../components/DatePicker';
import { ExportDialog } from '../../components/ExportDialog';
import { FilterInput, FilterSelect } from '../../components/Fields';
import { PageCard, PageTitle } from '../../components/PageCard';
import { Pagination } from '../../components/Pagination';
import { RequestDialog } from '../../components/queue/RequestDialog';
import { StatusChip } from '../../components/queue/parts';
import { useLookups } from '../../hooks/useLookups';
import { useTableData } from '../../hooks/useTableData';
import { formatDate, formatDateTime } from '../../lib/format';
import { MSG } from '../../lib/messages';

export default function HistoryPage() {
  const lk = useLookups();
  const table = useTableData(requestApi.search, { q: '', status: '', color_code: '', hospital_id: '', date_from: '', date_to: '' });
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void hospitalApi.options().then((r) => r.ok && r.data && setHospitals(r.data));
  }, []);

  const columns: Column<RequestBase>[] = [
    {
      header: 'ผู้ป่วย',
      className: 'min-w-[9rem]',
      cell: (r) => (
        <div>
          <div className="font-medium text-primary">{r.patient_name}</div>
          <div className="text-xs text-muted-foreground">
            {r.request_no} <span className="sm:hidden">· {r.hospital_name}</span>
          </div>
        </div>
      ),
    },
    { header: 'โรงพยาบาล', cell: (r) => r.hospital_name, className: 'hidden sm:table-cell' },
    { header: 'สี', cell: (r) => (r.color_code ? <ColorChip label={lk.label('COLOR', r.color_code)} color={lk.colorOf(r.color_code)} /> : <span className="text-faint">-</span>), className: 'hidden md:table-cell' },
    { header: 'สารเสพติด', cell: (r) => (r.substance_other ? `${lk.label('SUBSTANCE', r.substance_code)}: ${r.substance_other}` : lk.label('SUBSTANCE', r.substance_code)), className: 'hidden lg:table-cell' },
    { header: 'ผู้ขอ', cell: (r) => r.requester_name, className: 'hidden lg:table-cell' },
    { header: 'ส่งเมื่อ', cell: (r) => formatDateTime(r.submitted_at), className: 'hidden md:table-cell whitespace-nowrap' },
    { header: 'เรียกคิวเมื่อ', cell: (r) => (r.called_at ? formatDateTime(r.called_at) : <span className="text-faint">-</span>), className: 'hidden xl:table-cell whitespace-nowrap' },
    { header: 'วันที่เตียง/ส่งตัว', cell: (r) => (r.bed_date ? formatDate(r.bed_date) : <span className="text-faint">-</span>), className: 'hidden xl:table-cell whitespace-nowrap' },
    { header: 'ปิดเคสเมื่อ', cell: (r) => (r.resolved_at ? formatDateTime(r.resolved_at) : <span className="text-faint">-</span>), className: 'hidden xl:table-cell whitespace-nowrap' },
    { header: 'สถานะ', cell: (r) => <StatusChip status={r.status} /> },
  ];

  return (
    <>
      <PageTitle hint="คำขอทั้งหมดทุกสถานะ — กดที่แถวไหนก็ได้เพื่อดูรายละเอียดและประวัติ">ประวัติคำขอ</PageTitle>
      <PageCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-3">
          <FilterInput label="ค้นหา ชื่อผู้ป่วย / ผู้ขอ / โรงพยาบาล / เลขคำขอ" value={table.draft.q} onChange={(v) => table.setDraft('q', v)} onEnter={table.search} />
          <FilterSelect label="สถานะ" value={table.draft.status} onChange={(v) => table.setDraft('status', v)} options={STATUS_OPTIONS} />
          <FilterSelect label="สี" value={table.draft.color_code} onChange={(v) => table.setDraft('color_code', v)} options={[...lk.colors.map((c) => ({ value: c.code, label: c.label })), { value: '_NONE', label: 'ไม่ระบุสี' }]} />
          <FilterSelect label="โรงพยาบาล" value={table.draft.hospital_id} onChange={(v) => table.setDraft('hospital_id', v)} options={hospitals.map((h) => ({ value: String(h.id), label: h.name }))} />
          <div className="flex flex-col gap-1">
            <label htmlFor="date_from" className="text-sm font-medium">
              ส่งตั้งแต่วันที่
            </label>
            <DatePicker id="date_from" placeholder="ทุกวัน" value={table.draft.date_from} onChange={(v) => table.setDraft('date_from', v)} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="date_to" className="text-sm font-medium">
              ถึงวันที่
            </label>
            <DatePicker id="date_to" placeholder="ทุกวัน" value={table.draft.date_to} onChange={(v) => table.setDraft('date_to', v)} />
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
        title="รายการคำขอ"
        actions={
          <Button variant="outline" onClick={() => setExporting(true)}>
            <FileSpreadsheet className="size-4" /> ส่งออก Excel
          </Button>
        }
      >
        <DataTable columns={columns} rows={table.rows} rowKey={(r) => r.id} loading={table.loading} onRowClick={(r) => setOpenId(r.id)} />
        <Pagination paging={table.paging} onPage={table.goPage} onPageSize={table.changePageSize} />
      </PageCard>
      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        initial={['requests', 'events']}
        filters={{
          q: table.applied.q.trim(),
          statuses: table.applied.status ? [table.applied.status] : [],
          color_code: table.applied.color_code,
          hospital_id: table.applied.hospital_id ? Number(table.applied.hospital_id) : undefined,
          date_from: table.applied.date_from || undefined,
          date_to: table.applied.date_to || undefined,
        }}
        filtersNote="คำขอและประวัติเหตุการณ์จะออกตามตัวกรองที่ใช้อยู่ในหน้านี้ (ไม่ได้กดค้นหาใหม่ = ใช้ค่าล่าสุดที่ค้นแล้ว) — ล้างตัวกรองถ้าต้องการทั้งหมด"
      />
      {openId && <RequestDialog id={openId} onClose={() => setOpenId(null)} onChanged={table.reload} />}
    </>
  );
}
