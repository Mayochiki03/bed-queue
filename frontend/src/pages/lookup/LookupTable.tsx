/** LookupTable — รายการข้อมูลหลัก: กรองตามประเภท/ค้นหา + ตาราง (แก้/ลบ) */
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { LOOKUP_TYPE_OPTIONS, lookupApi, lookupTypeLabel, type Lookup } from '../../api/lookupApi';
import { Button } from '../../components/Button';
import { ColorChip } from '../../components/ColorChip';
import { DataTable, type Column } from '../../components/DataTable';
import { FilterInput, FilterSelect } from '../../components/Fields';
import { PageCard, PageTitle } from '../../components/PageCard';
import { Pagination } from '../../components/Pagination';
import { Switch } from '../../components/Switch';
import { usePopup } from '../../components/Popup';
import { useTableData } from '../../hooks/useTableData';
import { MSG } from '../../lib/messages';

export default function LookupTable() {
  const navigate = useNavigate();
  const popup = usePopup();
  const table = useTableData(lookupApi.search, { type: '', q: '' });

  async function handleDelete(row: Lookup) {
    if (!(await popup.confirm({ title: MSG.delete, message: `${MSG.confirmDelete}\n(${row.label})`, danger: true, confirmText: MSG.delete }))) return;
    const res = await lookupApi.remove(row.id);
    if (res.ok) {
      popup.success(MSG.deleted);
      table.reload();
    } else {
      popup.warn(res.message); // เช่น มีคำขอใช้อยู่ → ให้ปิดใช้งานแทน
    }
  }

  async function toggleActive(row: Lookup, active: boolean) {
    const res = await lookupApi.update(row.id, { label: row.label, color: row.color ?? '', sort_order: row.sort_order, is_active: active ? 'Y' : 'N' });
    if (res.ok) {
      popup.success(active ? `เปิดใช้ "${row.label}" แล้ว` : `ปิด "${row.label}" แล้ว — ไม่ขึ้นให้เลือกในคำขอใหม่`);
      table.reload();
    } else popup.error(res.message);
  }

  const columns: Column<Lookup>[] = [
    { header: 'ประเภท', cell: (r) => lookupTypeLabel(r.type), className: 'hidden sm:table-cell' },
    { header: 'ชื่อที่แสดง', 
      className: 'min-w-[7rem]',
      cell: (r) => (
        <>
          {r.type === 'COLOR' ? <ColorChip label={r.label} color={r.color} /> : r.label}
          <div className="text-xs text-muted-foreground sm:hidden">{lookupTypeLabel(r.type)}</div>
        </>
      ),
    },
    { header: 'รหัส', cell: (r) => r.code, className: 'hidden md:table-cell' },
    { header: 'ลำดับ', cell: (r) => r.sort_order, className: 'hidden md:table-cell' },
    {
      header: 'ใช้งาน',
      align: 'center',
      // สวิตช์กดสลับได้ทันทีจากตาราง (ไม่ต้องเข้าไปแก้ทีละรายการ) — ปิดแล้วจะไม่ขึ้นให้เลือกตอนสร้างคำขอใหม่ แต่คำขอเก่ายังเห็นค่าเดิม
      cell: (r) => (
        <span onClick={(e) => e.stopPropagation()} className="inline-flex whitespace-nowrap max-sm:[&_.block]:sr-only">
          <Switch checked={!!r.is_active} onChange={(v) => void toggleActive(r, v)} label={r.is_active ? 'ใช้งาน' : 'ปิด'} />
        </span>
      ),
    },
    {
      header: 'จัดการ',
      align: 'center',
      cell: (r) => (
        <div className="flex justify-center gap-1">
          <Button variant="ghost" size="sm" aria-label={MSG.edit} onClick={() => navigate('/lookup/edit', { state: { id: r.id } })}>
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
      <PageTitle hint="ไม่ใช้รายการไหน ให้กดสวิตช์ “ใช้งาน” ปิดได้เลย (คำขอเก่ายังเห็นค่าเดิม สถิติไม่เพี้ยน) — รายการที่มีคำขอใช้อยู่ลบไม่ได้">สี / สารเสพติด / เหตุผลการส่งต่อ</PageTitle>
      <PageCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-3">
          <FilterSelect label="ประเภท" value={table.draft.type} onChange={(v) => table.setDraft('type', v)} options={LOOKUP_TYPE_OPTIONS} />
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
        title="รายการข้อมูลหลัก"
        actions={
          <Button onClick={() => navigate('/lookup/add')}>
            <Plus className="size-4" />
            {MSG.add}
          </Button>
        }
      >
        <DataTable columns={columns} rows={table.rows} rowKey={(r) => r.id} loading={table.loading} onRowClick={(r) => navigate('/lookup/edit', { state: { id: r.id } })} />
        <Pagination paging={table.paging} onPage={table.goPage} onPageSize={table.changePageSize} />
      </PageCard>
    </>
  );
}
