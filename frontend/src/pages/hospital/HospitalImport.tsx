/**
 * HospitalImport — นำเข้ารายชื่อโรงพยาบาลจาก Excel: 1) ดาวน์โหลดแม่แบบ 2) เลือกไฟล์ → ระบบแสดงตัวอย่าง (เพิ่มใหม่/อัปเดต/ไม่เปลี่ยน/ผิดพลาด)
 * 3) ตรวจแล้วกดยืนยัน — ยังไม่บันทึกอะไรจนกว่าจะกดยืนยัน · แถวที่ผิดพลาดจะถูกข้าม ที่เหลือนำเข้า (จับคู่ด้วยรหัส 5 หลัก)
 */
import { ArrowLeft, Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { hospitalApi, type ImportAction, type ImportPreview } from '../../api/hospitalApi';
import { Button } from '../../components/Button';
import { DataTable, type Column } from '../../components/DataTable';
import { PageCard, PageTitle } from '../../components/PageCard';
import { usePopup } from '../../components/Popup';
import type { ImportRow } from '../../api/hospitalApi';

const MAX_BYTES = 650 * 1024;
const ACTION_LABEL: Record<ImportAction, string> = { NEW: 'เพิ่มใหม่', UPDATE: 'อัปเดต', SAME: 'ไม่เปลี่ยน', ERROR: 'ผิดพลาด' };
const ACTION_CLASS: Record<ImportAction, string> = { NEW: 'bg-success-soft text-success-ink', UPDATE: 'bg-info-soft text-info-ink', SAME: 'bg-neutral-soft text-neutral-ink', ERROR: 'bg-danger-soft text-danger-ink' };

/** อ่านไฟล์เป็น base64 (ตัดส่วนหัว data: ออก) */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    reader.readAsDataURL(file);
  });
}

export default function HospitalImport() {
  const navigate = useNavigate();
  const popup = usePopup();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);

  async function download(withData: boolean) {
    const res = await hospitalApi.template(withData);
    if (!res.ok) popup.error(res.message);
  }

  async function choose(f: File | undefined) {
    setPreview(null);
    setFile(null);
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) return popup.warn('ใช้ได้เฉพาะไฟล์ Excel นามสกุล .xlsx (ถ้าเป็น .xls ให้เปิดแล้ว "บันทึกเป็น" .xlsx ก่อน)');
    if (f.size > MAX_BYTES) return popup.warn('ไฟล์ใหญ่เกินไป (ไม่เกินประมาณ 650 KB) — แบ่งไฟล์เป็นหลายส่วน');
    setLoading(true);
    try {
      const base64 = await readBase64(f);
      const res = await hospitalApi.importPreview(f.name, base64);
      if (res.ok && res.data) {
        setFile({ name: f.name, base64 });
        setPreview(res.data);
      } else popup.error(res.message);
    } catch (e) {
      popup.error(e instanceof Error ? e.message : 'อ่านไฟล์ไม่ได้');
    } finally {
      setLoading(false);
      if (input.current) input.current.value = '';
    }
  }

  async function commit() {
    if (!file || !preview) return;
    const n = preview.new_count + preview.update_count;
    const note = preview.error_count ? `\nแถวที่ผิดพลาด ${preview.error_count} แถวจะถูกข้าม` : '';
    if (!(await popup.confirm({ title: 'ยืนยันนำเข้า', message: `เพิ่มใหม่ ${preview.new_count} · อัปเดต ${preview.update_count} รายการ${note}\nต้องการนำเข้าใช่หรือไม่?`, confirmText: `นำเข้า ${n} รายการ` }))) return;
    setLoading(true);
    const res = await hospitalApi.importCommit(file.name, file.base64).finally(() => setLoading(false));
    if (res.ok) {
      popup.success(res.message || 'นำเข้าสำเร็จ');
      navigate('/hospital');
    } else popup.error(res.message);
  }

  const columns: Column<ImportRow>[] = [
    { header: 'แถว', cell: (r) => r.row, className: 'w-14' },
    { header: 'รหัส', cell: (r) => r.code || '-' },
    { header: 'ชื่อโรงพยาบาล', cell: (r) => r.name || '-', className: 'min-w-[8rem]' },
    { header: 'เขต', cell: (r) => r.health_region ?? '-', className: 'hidden sm:table-cell' },
    { header: 'ผลที่จะเกิด', cell: (r) => <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs ${ACTION_CLASS[r.action]}`}>{ACTION_LABEL[r.action]}</span> },
    { header: 'หมายเหตุ', cell: (r) => <span className={r.action === 'ERROR' ? 'text-danger' : 'text-muted-foreground'}>{r.message}</span>, className: 'min-w-[8rem]' },
  ];
  const importable = preview ? preview.new_count + preview.update_count : 0;

  return (
    <>
      <PageTitle hint="กรอกรายชื่อใน Excel ตามแม่แบบ แล้วนำเข้าทีเดียว — ระบบจับคู่ด้วยรหัส 5 หลัก (รหัสเดิมอัปเดต รหัสใหม่เพิ่ม)">นำเข้าโรงพยาบาลจาก Excel</PageTitle>
      <PageCard title="1) ดาวน์โหลดแม่แบบ" className="mb-4">
        <p className="mb-3 text-sm text-muted-foreground">คอลัมน์: รหัสโรงพยาบาล (5 หลัก) · ชื่อโรงพยาบาล · เขตสุขภาพ (1-14) · สถานะ (ใช้งาน/ปิด) — ในไฟล์มีชีต "คำอธิบาย" ด้วย</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void download(false)}>
            <Download className="size-4" />
            แม่แบบเปล่า
          </Button>
          <Button variant="outline" onClick={() => void download(true)}>
            <Download className="size-4" />
            รายชื่อปัจจุบัน (แก้แล้วนำเข้ากลับได้)
          </Button>
        </div>
      </PageCard>
      <PageCard title="2) เลือกไฟล์ที่กรอกแล้ว" className="mb-4">
        <input ref={input} type="file" accept=".xlsx" className="sr-only" aria-label="เลือกไฟล์ Excel" onChange={(e) => void choose(e.target.files?.[0])} />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => input.current?.click()} loading={loading}>
            <Upload className="size-4" />
            เลือกไฟล์ .xlsx
          </Button>
          {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
        </div>
      </PageCard>
      {preview && (
        <PageCard
          title="3) ตรวจตัวอย่างก่อนนำเข้า"
          actions={
            <Button onClick={() => void commit()} disabled={importable === 0} loading={loading}>
              ยืนยันนำเข้า {importable} รายการ
            </Button>
          }
        >
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <span className="rounded bg-neutral-soft px-2 py-1 text-neutral-ink">ทั้งหมด {preview.total} แถว</span>
            <span className="rounded bg-success-soft px-2 py-1 text-success-ink">เพิ่มใหม่ {preview.new_count}</span>
            <span className="rounded bg-info-soft px-2 py-1 text-info-ink">อัปเดต {preview.update_count}</span>
            <span className="rounded bg-neutral-soft px-2 py-1 text-neutral-ink">ไม่เปลี่ยน {preview.same_count}</span>
            <span className={`rounded px-2 py-1 ${preview.error_count ? 'bg-danger-soft text-danger-ink' : 'bg-neutral-soft text-neutral-ink'}`}>ผิดพลาด {preview.error_count}</span>
          </div>
          {preview.error_count > 0 && <p className="mb-3 text-sm text-danger">แถวที่ผิดพลาดจะถูกข้ามและไม่ถูกนำเข้า — แก้ในไฟล์แล้วเลือกไฟล์ใหม่ หรือนำเข้าเฉพาะแถวที่ถูกต้องก่อนก็ได้</p>}
          <DataTable columns={columns} rows={preview.rows} rowKey={(r) => r.row} />
          {preview.truncated && <p className="mt-2 text-xs text-muted-foreground">แสดงตัวอย่าง 300 แถวแรก (แถวผิดพลาดขึ้นก่อน) — การนำเข้าจะทำกับทุกแถวในไฟล์</p>}
        </PageCard>
      )}
      <div className="mt-4">
        <Button variant="outline" onClick={() => navigate('/hospital')}>
          <ArrowLeft className="size-4" />
          กลับ
        </Button>
      </div>
    </>
  );
}
