/**
 * MemberTable — สมาชิก รพ.: รายชื่อผู้ที่ลงทะเบียนผ่าน LINE เริ่มที่ "รออนุมัติ" · เจ้าหน้าที่ตรวจชื่อ/รพ./เบอร์ แล้วกดอนุมัติหรือไม่อนุมัติ
 * (ผู้ที่อนุมัติแล้วของ รพ. เดียวกันเห็นคำขอของ รพ. ร่วมกัน — จึงต้องตรวจให้แน่ใจว่าเป็นเจ้าหน้าที่ รพ. นั้นจริง เช่น โทรกลับเบอร์ รพ.)
 */
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { APPROVAL_LABEL, memberApi, type ApprovalStatus, type MemberRow } from '../../api/memberApi';
import { Button } from '../../components/Button';
import { DataTable, type Column } from '../../components/DataTable';
import { FilterInput, FilterSelect } from '../../components/Fields';
import { PageCard, PageTitle } from '../../components/PageCard';
import { Pagination } from '../../components/Pagination';
import { usePopup } from '../../components/Popup';
import { useTableData } from '../../hooks/useTableData';
import { formatDateTime } from '../../lib/format';
import { MSG } from '../../lib/messages';

const STATUS_CLASS: Record<ApprovalStatus, string> = {
  PENDING: 'bg-warn-soft text-warn-ink',
  APPROVED: 'bg-success-soft text-success-ink',
  REJECTED: 'bg-danger-soft text-danger-ink',
};
const STATUS_OPTIONS = (Object.keys(APPROVAL_LABEL) as ApprovalStatus[]).map((v) => ({ value: v, label: APPROVAL_LABEL[v] }));

export default function MemberTable() {
  const popup = usePopup();
  const table = useTableData(memberApi.search, { q: '', status: 'PENDING' });
  const [busy, setBusy] = useState(0);

  async function approve(row: MemberRow) {
    const message = `${row.full_name}\n${row.hospital_code} ${row.hospital_name}\nเบอร์ ${row.phone}\n\nเมื่ออนุมัติ จะส่งคำขอและเห็นคำขอของ รพ. นี้ร่วมกับเจ้าหน้าที่คนอื่นของ รพ. เดียวกันได้ทั้งหมด`;
    if (!(await popup.confirm({ title: 'อนุมัติสมาชิก', message, confirmText: 'อนุมัติ' }))) return;
    setBusy(row.id);
    const res = await memberApi.approve(row.id).finally(() => setBusy(0));
    if (res.ok) {
      popup.success('อนุมัติแล้ว');
      table.reload();
    } else popup.error(res.message);
  }

  async function reject(row: MemberRow) {
    if (!(await popup.confirm({ title: 'ไม่อนุมัติสมาชิก', message: `${row.full_name} (${row.hospital_name}) จะใช้ระบบไม่ได้ — เปลี่ยนใจอนุมัติภายหลังได้`, danger: true, confirmText: 'ไม่อนุมัติ' }))) return;
    setBusy(row.id);
    const res = await memberApi.reject(row.id, '').finally(() => setBusy(0));
    if (res.ok) {
      popup.success('บันทึกแล้ว');
      table.reload();
    } else popup.error(res.message);
  }

  const columns: Column<MemberRow>[] = [
    {
      header: 'ผู้ลงทะเบียน',
      className: 'min-w-[9rem]',
      cell: (r) => (
        <>
          <div className="font-medium">{r.full_name}</div>
          {r.display_name && <div className="text-xs text-muted-foreground">LINE: {r.display_name}</div>}
          <div className="text-xs text-muted-foreground md:hidden">{r.phone}</div>
        </>
      ),
    },
    {
      header: 'โรงพยาบาล',
      className: 'min-w-[8rem]',
      cell: (r) => (
        <>
          <div>{r.hospital_name}</div>
          <div className="text-xs text-muted-foreground">{r.hospital_code}</div>
        </>
      ),
    },
    { header: 'เบอร์โทร', className: 'hidden md:table-cell', cell: (r) => <>{r.phone}{r.phone2 && <div className="text-xs text-muted-foreground">{r.phone2}</div>}</> },
    { header: 'ลงทะเบียนเมื่อ', className: 'hidden lg:table-cell whitespace-nowrap', cell: (r) => formatDateTime(r.created_at) },
    {
      header: 'สถานะ',
      cell: (r) => (
        <>
          <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${STATUS_CLASS[r.approval_status]}`}>{APPROVAL_LABEL[r.approval_status]}</span>
          {r.approval_status !== 'PENDING' && r.decided_by_name && <div className="mt-1 text-xs text-muted-foreground">โดย {r.decided_by_name} {formatDateTime(r.decided_at)}</div>}
        </>
      ),
    },
    {
      header: 'จัดการ',
      align: 'center',
      cell: (r) => (
        <div className="flex justify-center gap-1">
          {r.approval_status !== 'APPROVED' && (
            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => void approve(r)}>
              <Check className="size-4" />
              อนุมัติ
            </Button>
          )}
          {r.approval_status !== 'REJECTED' && (
            <Button size="sm" variant="ghost" className="text-danger" disabled={busy === r.id} onClick={() => void reject(r)}>
              <X className="size-4" />
              ไม่อนุมัติ
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageTitle hint="ผู้ที่ลงทะเบียนผ่าน LINE ต้องรอเจ้าหน้าที่ตรวจและอนุมัติก่อนจึงจะส่งคำขอและเห็นคำขอของ รพ. ตัวเองได้">สมาชิก รพ.</PageTitle>
      <PageCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-3">
          <FilterInput label="ค้นหา ชื่อ / โรงพยาบาล / รหัส / เบอร์" value={table.draft.q} onChange={(v) => table.setDraft('q', v)} onEnter={table.search} />
          <FilterSelect label="สถานะ" value={table.draft.status} onChange={(v) => table.setDraft('status', v)} options={STATUS_OPTIONS} />
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="outline" onClick={table.reset}>
            {MSG.reset}
          </Button>
          <Button onClick={table.search}>{MSG.search}</Button>
        </div>
      </PageCard>
      <PageCard title="รายชื่อสมาชิก">
        <DataTable columns={columns} rows={table.rows} rowKey={(r) => r.id} loading={table.loading} />
        <Pagination paging={table.paging} onPage={table.goPage} onPageSize={table.changePageSize} />
      </PageCard>
    </>
  );
}
