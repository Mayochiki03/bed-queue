/** UserPassword — ตั้งรหัสผ่านใหม่ให้ผู้ใช้อื่น (รับ id ทาง state) · ผู้ใช้เดิมต้องล็อกอินด้วยรหัสใหม่ */
import { useForm } from 'react-hook-form';
import { Navigate } from 'react-router';
import { userApi } from '../../api/userApi';
import { EditorPage } from '../../components/EditorPage';
import { TextField } from '../../components/Fields';
import { useEditId } from '../../hooks/useEditId';

type V = { new_password: string; confirm: string };

export default function UserPassword() {
  const id = useEditId();
  const form = useForm<V>({ defaultValues: { new_password: '', confirm: '' } });
  if (!id) return <Navigate to="/user" replace />;
  return (
    <EditorPage title="ตั้งรหัสผ่านใหม่" mode="edit" backTo="/user" form={form} saveText="ตั้งรหัสผ่าน" onSave={(v) => userApi.resetPassword(id, v.new_password)}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField name="new_password" label="รหัสผ่านใหม่" type="password" required maxLength={100} rules={{ minLength: { value: 8, message: 'อย่างน้อย 8 ตัวอักษร' } }} />
        <TextField name="confirm" label="ยืนยันรหัสผ่านใหม่" type="password" required maxLength={100} rules={{ validate: (v) => v === form.getValues('new_password') || 'รหัสผ่านไม่ตรงกัน' }} />
      </div>
    </EditorPage>
  );
}
