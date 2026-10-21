/**
 * RequestEditor — เจ้าหน้าที่เพิ่ม/แก้ไขคำขอเตียง (เช่น ผู้ขอโทรมาแจ้ง หรือบันทึกย้อนหลังจากฟอร์มเดิม)
 *   เพิ่ม: เลือกโรงพยาบาล → (เลือกผู้ขอที่ลงทะเบียนไว้ หรือกรอกชื่อ/เบอร์เอง) → ข้อมูลผู้ป่วย · ย้อนวันเวลาที่ส่งได้ (ตำแหน่งคิวนับตามเวลานี้)
 *   แก้: แก้ข้อมูลได้ทุกช่อง (ไม่เปลี่ยนสถานะ — ใช้ปุ่มในหน้ารายละเอียด) · ทุกการแก้บันทึกในประวัติ
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { hospitalApi, type HospitalOption } from '../../api/hospitalApi';
import { requestApi, type RequesterOption, type RequestInput } from '../../api/requestApi';
import { EditorPage } from '../../components/EditorPage';
import { DateTimeField, SelectField, TextAreaField, TextField } from '../../components/Fields';
import { usePopup } from '../../components/Popup';
import { Spinner } from '../../components/Spinner';
import { useEditId } from '../../hooks/useEditId';
import { useLookups } from '../../hooks/useLookups';

const EMPTY: RequestInput = {
  hospital_id: '',
  requester_id: '',
  requester_name: '',
  requester_phone: '',
  requester_phone2: '',
  patient_name: '',
  patient_gender: '',
  patient_age: '',
  patient_province: '',
  patient_phone: '',
  color_code: '',
  substance_code: '',
  reason_code: '',
  substance_other: '',
  reason_other: '',
  note: '',
  submitted_at: '',
};

const GENDERS = [
  { value: 'M', label: 'ชาย' },
  { value: 'F', label: 'หญิง' },
  { value: 'O', label: 'อื่น ๆ' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const nowLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function RequestEditor({ mode }: { mode: 'add' | 'edit' }) {
  const id = useEditId();
  const navigate = useNavigate();
  const popup = usePopup();
  const lk = useLookups();
  const form = useForm<RequestInput>({ defaultValues: EMPTY });
  const [loading, setLoading] = useState(mode === 'edit');
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [requesters, setRequesters] = useState<RequesterOption[]>([]);
  const hospitalId = form.watch('hospital_id');
  const requesterId = form.watch('requester_id');
  const substance = form.watch('substance_code');
  const reason = form.watch('reason_code');

  useEffect(() => {
    void hospitalApi.options().then((r) => r.ok && r.data && setHospitals(r.data));
  }, []);

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    void requestApi.get(id).then((res) => {
      if (res.ok && res.data) {
        const d = res.data;
        form.reset({
          ...EMPTY,
          hospital_id: String(d.hospital_id),
          requester_name: d.requester_name,
          requester_phone: d.requester_phone ?? '',
          requester_phone2: d.requester_phone2 ?? '',
          patient_name: d.patient_name,
          patient_gender: d.patient_gender ?? '',
          patient_age: d.patient_age === null ? '' : String(d.patient_age),
          patient_province: d.patient_province ?? '',
          patient_phone: d.patient_phone ?? '',
          color_code: d.color_code ?? '',
          substance_code: d.substance_code ?? '',
          reason_code: d.reason_code ?? '',
          substance_other: d.substance_other ?? '',
          reason_other: d.reason_other ?? '',
          note: d.note ?? '',
        });
        setLoading(false);
      } else {
        popup.error(res.message);
        navigate('/queue');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // เพิ่ม: โหลดรายชื่อผู้ขอของโรงพยาบาลที่เลือก
  useEffect(() => {
    if (mode !== 'add') return;
    setRequesters([]);
    form.setValue('requester_id', '');
    if (!hospitalId) return;
    void requestApi.requesters(Number(hospitalId)).then((r) => r.ok && r.data && setRequesters(r.data.filter((x) => !x.is_blocked)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalId, mode]);

  // เลือกผู้ขอที่มีในระบบ → เติมชื่อ/เบอร์ให้
  useEffect(() => {
    const r = requesters.find((x) => String(x.id) === requesterId);
    if (r) {
      form.setValue('requester_name', r.full_name, { shouldDirty: true });
      form.setValue('requester_phone', r.phone, { shouldDirty: true });
      form.setValue('requester_phone2', r.phone2 ?? '', { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requesterId]);

  if (mode === 'edit' && !id) return <Navigate to="/queue" replace />;
  if (loading || !lk.ready) return <Spinner />;

  const lookupOptions = (list: { code: string; label: string; is_active: boolean | number }[]) => list.filter((l) => l.is_active).map((l) => ({ value: l.code, label: l.label }));
  const fromRequester = !!requesterId;

  return (
    <EditorPage title={mode === 'add' ? 'เพิ่มคำขอเตียง' : 'แก้ไขคำขอเตียง'} mode={mode} backTo="/queue" form={form} onSave={(v) => (mode === 'add' ? requestApi.add(v) : requestApi.update(id!, v))}>
      <div className="flex flex-col gap-6">
        <section>
          <h2 className="mb-3 border-b border-border pb-1.5 text-base font-semibold">ผู้ขอ / โรงพยาบาลต้นทาง</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField name="hospital_id" label="โรงพยาบาลต้นทาง" required options={hospitals.map((h) => ({ value: String(h.id), label: `${h.name} (${h.code})` }))} />
            {mode === 'add' && (
              <SelectField
                name="requester_id"
                label="ผู้ขอที่ลงทะเบียนไว้"
                placeholder="-- ไม่อยู่ในรายการ (กรอกเอง) --"
                disabled={!hospitalId}
                hint={hospitalId && requesters.length === 0 ? 'โรงพยาบาลนี้ยังไม่มีผู้ขอที่ลงทะเบียนผ่าน LINE — กรอกชื่อ/เบอร์เอง' : 'เลือกแล้วระบบเติมชื่อ/เบอร์ให้ (และเคสจะผูกกับผู้ขอคนนี้)'}
                options={requesters.map((r) => ({ value: String(r.id), label: `${r.full_name} · ${r.phone}` }))}
              />
            )}
            <TextField name="requester_name" label="ชื่อผู้ขอ" required maxLength={120} readOnly={fromRequester} />
            <TextField name="requester_phone" label="เบอร์โทรผู้ขอ" maxLength={50} placeholder="เช่น 0812345678 หรือ 0243535646 ต่อ 1275" readOnly={fromRequester} />
            <TextField name="requester_phone2" label="เบอร์สำรอง" maxLength={50} readOnly={fromRequester} />
            {mode === 'add' && (
              <DateTimeField name="submitted_at" label="วันเวลาที่ส่งคำขอ" maxDate={nowLocal().slice(0, 10)} hint="เว้นว่าง = ตอนนี้ · บันทึกย้อนหลังได้ ลำดับคิวนับตามเวลานี้" rules={{ validate: (v: string) => !v || v <= nowLocal() || 'ต้องไม่เป็นเวลาในอนาคต' }} />
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 border-b border-border pb-1.5 text-base font-semibold">ผู้ป่วย</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField name="patient_name" label="ชื่อ-สกุลผู้ป่วย" required maxLength={150} />
            <div className="grid grid-cols-2 gap-4">
              <SelectField name="patient_gender" label="เพศ" placeholder="ไม่ระบุ" options={GENDERS} />
              <TextField name="patient_age" label="อายุ (ปี)" type="number" rules={{ min: { value: 0, message: '0-130' }, max: { value: 130, message: '0-130' } }} />
            </div>
            <TextField name="patient_province" label="จังหวัด" maxLength={80} />
            <TextField name="patient_phone" label="เบอร์โทรผู้ป่วย/ญาติ" maxLength={50} />
            <SelectField name="color_code" label="สี (ระดับผู้ป่วย)" placeholder="ไม่ระบุ" options={lookupOptions(lk.colors)} hint="สีใช้จัดคิวแยกตามเตียงที่ว่าง" />
            <SelectField name="substance_code" label="ประเภทสารเสพติด" placeholder="ไม่ระบุ" options={lookupOptions(lk.substances)} />
            {substance === 'OTHER' && <TextField name="substance_other" label="ระบุสารเสพติด (อื่น ๆ)" maxLength={200} hint="พิมพ์ได้หลายชนิด คั่นด้วยจุลภาค" />}
            <SelectField name="reason_code" label="เหตุผลการส่งต่อ" placeholder="ไม่ระบุ" options={lookupOptions(lk.reasons)} />
            {reason === 'OTHER' && <TextField name="reason_other" label="ระบุเหตุผล (อื่น ๆ)" maxLength={200} />}
            <TextAreaField name="note" label="หมายเหตุ" maxLength={1000} className="md:col-span-2" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">ข้อมูลผู้ป่วยเป็นข้อมูลสุขภาพ — กรอกเท่าที่จำเป็นต่อการประสานงานขอเตียง</p>
        </section>
      </div>
    </EditorPage>
  );
}
