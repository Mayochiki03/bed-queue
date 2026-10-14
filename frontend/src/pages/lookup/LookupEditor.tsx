/** LookupEditor — ฟอร์มเพิ่ม/แก้ไขข้อมูลหลัก · ประเภทและรหัสตั้งตอนเพิ่มแล้วแก้ไม่ได้ (คำขอเก่าอ้างถึงรหัสนี้) */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { LOOKUP_TYPE_OPTIONS, lookupApi, type LookupInput } from '../../api/lookupApi';
import { EditorPage } from '../../components/EditorPage';
import { ColorField, RadioField, SelectField, TextField } from '../../components/Fields';
import { usePopup } from '../../components/Popup';
import { Spinner } from '../../components/Spinner';
import { useEditId } from '../../hooks/useEditId';

export default function LookupEditor({ mode }: { mode: 'add' | 'edit' }) {
  const id = useEditId();
  const navigate = useNavigate();
  const popup = usePopup();
  const form = useForm<LookupInput>({ defaultValues: { type: '', code: '', label: '', color: '', sort_order: 0, is_active: 'Y' } });
  const [loading, setLoading] = useState(mode === 'edit');
  const type = form.watch('type');

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    void lookupApi.get(id).then((res) => {
      if (res.ok && res.data) {
        const d = res.data;
        form.reset({ type: d.type, code: d.code, label: d.label, color: d.color ?? '', sort_order: d.sort_order, is_active: d.is_active ? 'Y' : 'N' });
        setLoading(false);
      } else {
        popup.error(res.message);
        navigate('/lookup');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (mode === 'edit' && !id) return <Navigate to="/lookup" replace />;
  if (loading) return <Spinner />;

  return (
    <EditorPage
      title={mode === 'add' ? 'เพิ่มข้อมูลหลัก' : 'แก้ไขข้อมูลหลัก'}
      mode={mode}
      backTo="/lookup"
      form={form}
      onSave={({ type: _t, code: _c, ...rest }) => (mode === 'add' ? lookupApi.add(form.getValues()) : lookupApi.update(id!, rest))}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField name="type" label="ประเภทข้อมูล" required options={LOOKUP_TYPE_OPTIONS} disabled={mode === 'edit'} />
        <TextField name="code" label="รหัส" required maxLength={30} readOnly={mode === 'edit'} placeholder="เช่น CANNABIS" hint={mode === 'edit' ? 'รหัสแก้ไขไม่ได้' : 'A-Z 0-9 _ เท่านั้น (ระบบแปลงเป็นตัวพิมพ์ใหญ่ให้)'} />
        <TextField name="label" label="ชื่อที่แสดง" required maxLength={100} />
        <TextField name="sort_order" label="ลำดับ" type="number" hint="เลขน้อยแสดงก่อน (สีจะเรียงเป็นคอลัมน์ตามลำดับนี้)" />
        {type === 'COLOR' && <ColorField name="color" label="สี" required />}
        <RadioField
          name="is_active"
          label="สถานะ"
          required
          options={[
            { value: 'Y', label: 'ใช้งาน' },
            { value: 'N', label: 'ปิดใช้งาน' },
          ]}
        />
      </div>
    </EditorPage>
  );
}
