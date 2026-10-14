/**
 * HistoryPage — ประวัติ/ค้นหาคำขอทั้งหมด (ทุกสถานะ): กรองตามสถานะ สี โรงพยาบาล ช่วงวันที่ + ค้นหา ชื่อผู้ป่วย/ผู้ขอ/เลขคำขอ
 * กดแถวเพื่อดูรายละเอียดและประวัติของคำขอ (ทำรายการต่อได้เหมือนในบอร์ด)
 */
import { useEffect, useState } from 'react';
import { hospitalApi, type HospitalOption } from '../../api/hospitalApi';
import { requestApi, STATUS_OPTIONS, type RequestBase } from '../../api/requestApi';
import { Button } from '../../components/Button';
import { ColorChip } from '../../components/ColorChip';
import { DataTable, type Column } from '../../components/DataTable';
import { FilterInput, FilterSelect } from '../../components/Fields';
import { PageCard, PageTitle } from '../../components/PageCard';
import { Pagination } from '../../components/Pagination';
import { RequestDialog } from '../../components/queue/RequestDialog';
import { StatusChip } from '../../components/queue/parts';
import { useLookups } from '../../hooks/useLookups';
import { useTableData } from '../../hooks/useTableData';
import { formatDateTime } from '../../lib/format';
import { MSG } from '../../lib/messages';

export default function HistoryPage() {
  const lk = useLookups();
  const table = useTableData(requestApi.search, { q: '', status: '', color_code: '', hospital_id: '', date_from: '', date_to: '' });
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    void hospitalApi.options().then((r) => r.ok && r.data && setHospitals(r.data));
  }, []);

  const columns: Column<RequestBase>[] = [
    {
      header: 'ผู้ป่วย',
      className: 'min-w-[9rem]',
      cell: (r) => (
        <button type="button" className="text-left" onClick={() => setOpenId(r.id)}>
          <div className="font-medium text-primary hover:underline">{r.patient_name}</div>
          <div className="text-xs text-muted-foreground">
            {r.request_no} <span className="sm:hidden">· {r.hospital_name}</span>
          </div>
        </button>
      ),
    },
    { header: 'โรงพยาบาล', cell: (r) => r.hospital_name, className: 'hidden sm:table-cell' },
    { header: 'สี', cell: (r) => (r.color_code ? <ColorChip label={lk.label('COLOR', r.color_code)} color={lk.colorOf(r.color_code)} /> : <span className="text-faint">-</span>), className: 'hidden md:table-cell' },
    { header: 'สารเสพติด', cell: (r) => lk.label('SUBSTANCE', r.substance_code), className: 'hidden lg:table-cell' },
    { header: 'ส่งเมื่อ', cell: (r) => formatDateTime(r.submitted_at), className: 'hidden md:table-cell whitespace-nowrap' },
    { header: 'สถานะ', cell: (r) => <StatusChip status={r.status} /> },
  ];

  return (
    <>
      <PageTitle hint="คำขอทั้งหมดทุกสถานะ — กดที่ชื่อผู้ป่วยเพื่อดูรายละเอียดและประวัติ">ประวัติคำขอ</PageTitle>
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
            <input id="date_from" type="date" className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" value={table.draft.date_from} onChange={(e) => table.setDraft('date_from', e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="date_to" className="text-sm font-medium">
              ถึงวันที่
            </label>
            <input id="date_to" type="date" className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" value={table.draft.date_to} onChange={(e) => table.setDraft('date_to', e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="outline" onClick={table.reset}>
            {MSG.reset}
          </Button>
          <Button onClick={table.search}>{MSG.search}</Button>
        </div>
      </PageCard>
      <PageCard title="รายการคำขอ">
        <DataTable columns={columns} rows={table.rows} rowKey={(r) => r.id} loading={table.loading} />
        <Pagination paging={table.paging} onPage={table.goPage} onPageSize={table.changePageSize} />
      </PageCard>
      {openId && <RequestDialog id={openId} onClose={() => setOpenId(null)} onChanged={table.reload} />}
    </>
  );
}
