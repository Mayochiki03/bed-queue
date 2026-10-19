/** HospitalEditor — ฟอร์มเพิ่ม/แก้ไขโรงพยาบาล (ใช้ร่วมกัน) · รหัส รพ. 5 หลักตัวเลข */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { hospitalApi, type HospitalInput } from '../../api/hospitalApi';
import { EditorPage } from '../../components/EditorPage';
import { RadioField, SelectField, TextField } from '../../components/Fields';
import { usePopup } from '../../components/Popup';
import { Spinner } from '../../components/Spinner';
import { useEditId } from '../../hooks/useEditId';

/** เขตสุขภาพ 1-14 */
const REGIONS = Array.from({ length: 14 }, (_, i) => ({ value: String(i + 1), label: `เขตสุขภาพที่ ${i + 1}` }));

export default function HospitalEditor({ mode }: { mode: 'add' | 'edit' }) {
  const id = useEditId();
  const navigate = useNavigate();
  const popup = usePopup();
  const form = useForm<HospitalInput>({ defaultValues: { code: '', name: '', health_region: '', is_active: 'Y' } });
  const [loading, setLoading] = useState(mode === 'edit');

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    void hospitalApi.get(id).then((res) => {
      if (res.ok && res.data) {
        form.reset({ code: res.data.code, name: res.data.name, health_region: res.data.health_region ? String(res.data.health_region) : '', is_active: res.data.is_active ? 'Y' : 'N' });
        setLoading(false);
      } else {
        popup.error(res.message);
        navigate('/hospital');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (mode === 'edit' && !id) return <Navigate to="/hospital" replace />;
  if (loading) return <Spinner />;

  return (
    <EditorPage title={mode === 'add' ? 'เพิ่มโรงพยาบาล' : 'แก้ไขโรงพยาบาล'} mode={mode} backTo="/hospital" form={form} onSave={(v) => (mode === 'add' ? hospitalApi.add(v) : hospitalApi.update(id!, v))}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField name="code" label="รหัสโรงพยาบาล (5 หลัก)" required maxLength={5} placeholder="เช่น 11206" rules={{ pattern: { value: /^\d{5}$/, message: 'ต้องเป็นตัวเลข 5 หลัก' } }} />
        <TextField name="name" label="ชื่อโรงพยาบาล" required maxLength={150} placeholder="เช่น รพ.สงขลา" />
        <SelectField name="health_region" label="เขตสุขภาพ" placeholder="-- ไม่ระบุ --" options={REGIONS} />
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
