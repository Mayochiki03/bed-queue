/** AccountPage — เปลี่ยนรหัสผ่านของตัวเอง (ทุก role) */
import { useForm } from 'react-hook-form';
import { Navigate, Route, Routes } from 'react-router';
import { userApi } from '../../api/userApi';
import { EditorPage } from '../../components/EditorPage';
import { TextField } from '../../components/Fields';

type V = { current_password: string; new_password: string; confirm: string };

function ChangePassword() {
  const form = useForm<V>({ defaultValues: { current_password: '', new_password: '', confirm: '' } });
  return (
    <EditorPage title="เปลี่ยนรหัสผ่าน" mode="edit" backTo="/" form={form} saveText="เปลี่ยนรหัสผ่าน" onSave={(v) => userApi.changeOwnPassword(v.current_password, v.new_password)}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField name="current_password" label="รหัสผ่านปัจจุบัน" type="password" required maxLength={100} className="md:col-span-2" />
        <TextField name="new_password" label="รหัสผ่านใหม่" type="password" required maxLength={100} rules={{ minLength: { value: 8, message: 'อย่างน้อย 8 ตัวอักษร' } }} />
        <TextField name="confirm" label="ยืนยันรหัสผ่านใหม่" type="password" required maxLength={100} rules={{ validate: (v) => v === form.getValues('new_password') || 'รหัสผ่านไม่ตรงกัน' }} />
      </div>
    </EditorPage>
  );
}

export default function AccountPage() {
  return (
    <Routes>
      <Route index element={<ChangePassword />} />
      <Route path="*" element={<Navigate to="/account" replace />} />
    </Routes>
  );
}
