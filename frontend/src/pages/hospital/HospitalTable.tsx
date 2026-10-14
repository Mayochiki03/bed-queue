/** HospitalTable — รายการโรงพยาบาล: ค้นหา รหัส/ชื่อ + ตาราง (แก้/ลบ) + แบ่งหน้า */
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { hospitalApi, type Hospital } from '../../api/hospitalApi';
import { Button } from '../../components/Button';
import { DataTable, type Column } from '../../components/DataTable';
import { FilterInput } from '../../components/Fields';
import { PageCard, PageTitle } from '../../components/PageCard';
import { Pagination } from '../../components/Pagination';
import { usePopup } from '../../components/Popup';
import { useTableData } from '../../hooks/useTableData';
import { MSG } from '../../lib/messages';

export default function HospitalTable() {
  const navigate = useNavigate();
  const popup = usePopup();
  const table = useTableData(hospitalApi.search, { q: '' });

  async function handleDelete(row: Hospital) {
    if (!(await popup.confirm({ title: MSG.delete, message: `${MSG.confirmDelete}\n(${row.code} ${row.name})`, danger: true, confirmText: MSG.delete }))) return;
    const res = await hospitalApi.remove(row.id);
    if (res.ok) {
      popup.success(MSG.deleted);
      table.reload();
    } else {
      popup.error(res.message);
    }
  }

  const columns: Column<Hospital>[] = [
    { header: 'รหัส', cell: (r) => r.code },
    { header: 'ชื่อโรงพยาบาล', cell: (r) => r.name, className: 'min-w-[8rem]' },
    {
      header: 'สถานะ',
      className: 'hidden sm:table-cell',
      cell: (r) => <span className={r.is_active ? 'whitespace-nowrap rounded bg-success-soft px-2 py-0.5 text-xs text-success-ink' : 'whitespace-nowrap rounded bg-neutral-soft px-2 py-0.5 text-xs text-neutral-ink'}>{r.is_active ? 'ใช้งาน' : 'ปิด'}</span>,
    },
    {
      header: 'จัดการ',
      align: 'center',
      cell: (r) => (
        <div className="flex justify-center gap-1">
          <Button variant="ghost" size="sm" aria-label={MSG.edit} onClick={() => navigate('/hospital/edit', { state: { id: r.id } })}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" aria-label={MSG.delete} className="text-danger" onClick={() => void handleDelete(r)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageTitle hint="ผู้ขอพิมพ์ชื่อ+รหัสเอง ระบบสร้างรายการให้อัตโนมัติ — ที่นี่ไว้แก้ชื่อที่พิมพ์ผิดหรือปิดรายการ">โรงพยาบาล</PageTitle>
      <PageCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-3">
          <FilterInput label="ค้นหา รหัส / ชื่อ" value={table.draft.q} onChange={(v) => table.setDraft('q', v)} onEnter={table.search} />
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="outline" onClick={table.reset}>
            {MSG.reset}
          </Button>
          <Button onClick={table.search}>{MSG.search}</Button>
        </div>
      </PageCard>
      <PageCard
        title="รายการโรงพยาบาล"
        actions={
          <Button onClick={() => navigate('/hospital/add')}>
            <Plus className="size-4" />
            {MSG.add}
          </Button>
        }
      >
        <DataTable columns={columns} rows={table.rows} rowKey={(r) => r.id} loading={table.loading} />
        <Pagination paging={table.paging} onPage={table.goPage} onPageSize={table.changePageSize} />
      </PageCard>
    </>
  );
}
