/** AccountPage — บัญชีของฉัน: สถานะยืนยันตัวตน 2 ชั้น + เปลี่ยนรหัสผ่านของตัวเอง (ทุก role) */
import { ShieldCheck } from 'lucide-react';
import { useSession } from '../../lib/session';
import { useForm } from 'react-hook-form';
import { Navigate, Route, Routes } from 'react-router';
import { userApi } from '../../api/userApi';
import { EditorPage } from '../../components/EditorPage';
import { TextField } from '../../components/Fields';

type V = { current_password: string; new_password: string; confirm: string };

function ChangePassword() {
  const { user } = useSession();
  const form = useForm<V>({ defaultValues: { current_password: '', new_password: '', confirm: '' } });
  return (
    <EditorPage title="เปลี่ยนรหัสผ่าน" mode="edit" backTo="/" form={form} saveText="เปลี่ยนรหัสผ่าน" onSave={(v) => userApi.changeOwnPassword(v.current_password, v.new_password)}>
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div>
          <div className="font-medium text-foreground">ยืนยันตัวตน 2 ชั้น: {user?.mfa_enabled ? 'เปิดใช้แล้ว' : 'ยังไม่ได้ผูกแอป'}</div>
          <div className="text-muted-foreground">
            {user?.mfa_enabled ? 'ถ้าเปลี่ยนมือถือหรือมือถือหาย ให้ผู้ดูแลกด "รีเซ็ต 2FA" ที่หน้าผู้ใช้งาน แล้วผูกแอปใหม่ตอนล็อกอินครั้งถัดไป' : 'จะถูกพาไปผูกแอปตอนล็อกอินครั้งถัดไป (ถ้าสิทธิ์ของคุณถูกบังคับ)'}
          </div>
        </div>
      </div>
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
