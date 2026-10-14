/** UserTable — รายการผู้ใช้งาน: ค้นหา/กรองสิทธิ์ + ตาราง (แก้/ตั้งรหัสผ่าน/ลบ) */
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { userApi, type UserRow } from '../../api/userApi';
import { Button } from '../../components/Button';
import { DataTable, type Column } from '../../components/DataTable';
import { FilterInput, FilterSelect } from '../../components/Fields';
import { PageCard, PageTitle } from '../../components/PageCard';
import { Pagination } from '../../components/Pagination';
import { usePopup } from '../../components/Popup';
import { useTableData } from '../../hooks/useTableData';
import { MSG } from '../../lib/messages';
import { hasRole, ROLE_LABEL, useSession } from '../../lib/session';

const ROLE_OPTIONS = (['STAFF', 'ADMIN', 'DEV'] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

export default function UserTable() {
  const navigate = useNavigate();
  const popup = usePopup();
  const { user: me } = useSession();
  const table = useTableData(userApi.search, { q: '', role: '' });

  async function handleDelete(row: UserRow) {
    if (!(await popup.confirm({ title: MSG.delete, message: `${MSG.confirmDelete}\n(${row.username} ${row.full_name})`, danger: true, confirmText: MSG.delete }))) return;
    const res = await userApi.remove(row.id);
    if (res.ok) {
      popup.success(MSG.deleted);
      table.reload();
    } else {
      popup.error(res.message);
    }
  }

  const columns: Column<UserRow>[] = [
    {
      header: 'ชื่อผู้ใช้',
      className: 'min-w-[6rem]',
      cell: (r) => (
        <>
          <div>{r.username}</div>
          <div className="text-xs text-muted-foreground sm:hidden">{r.full_name}</div>
        </>
      ),
    },
    { header: 'ชื่อ-สกุล', cell: (r) => r.full_name, className: 'hidden sm:table-cell' },
    { header: 'สิทธิ์', cell: (r) => ROLE_LABEL[r.role], className: 'hidden sm:table-cell' },
    {
      header: 'สถานะ',
      className: 'hidden md:table-cell',
      cell: (r) => <span className={r.is_active ? 'whitespace-nowrap rounded bg-success-soft px-2 py-0.5 text-xs text-success-ink' : 'whitespace-nowrap rounded bg-neutral-soft px-2 py-0.5 text-xs text-neutral-ink'}>{r.is_active ? 'ใช้งาน' : 'ปิด'}</span>,
    },
    {
      header: 'จัดการ',
      align: 'center',
      cell: (r) => {
        const manageable = hasRole(me?.role, r.role); // จัดการได้เฉพาะบัญชีที่ไม่สูงกว่าตัวเอง
        const self = r.id === me?.id;
        return (
          <div className="flex justify-center gap-1">
            <Button variant="ghost" size="sm" aria-label={MSG.edit} disabled={!manageable} onClick={() => navigate('/user/edit', { state: { id: r.id } })}>
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" aria-label="ตั้งรหัสผ่านใหม่" disabled={!manageable || self} onClick={() => navigate('/user/password', { state: { id: r.id } })}>
              <KeyRound className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" aria-label={MSG.delete} className="text-danger" disabled={!manageable || self} onClick={() => void handleDelete(r)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageTitle>ผู้ใช้งาน</PageTitle>
      <PageCard className="mb-4">
        <div className="grid gap-3 md:grid-cols-3">
          <FilterInput label="ค้นหา ชื่อผู้ใช้ / ชื่อ-สกุล" value={table.draft.q} onChange={(v) => table.setDraft('q', v)} onEnter={table.search} />
          <FilterSelect label="สิทธิ์" value={table.draft.role} onChange={(v) => table.setDraft('role', v)} options={ROLE_OPTIONS} />
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="outline" onClick={table.reset}>
            {MSG.reset}
          </Button>
          <Button onClick={table.search}>{MSG.search}</Button>
        </div>
      </PageCard>
      <PageCard
        title="รายการผู้ใช้งาน"
        actions={
          <Button onClick={() => navigate('/user/add')}>
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
