/**
 * UserEditor — ฟอร์มเพิ่ม/แก้ไขผู้ใช้
 * ตัวเลือกสิทธิ์แสดงเฉพาะระดับที่ไม่สูงกว่าตัวเอง (ADMIN เห็นแค่ เจ้าหน้าที่/ผู้ดูแล) — backend ตรวจซ้ำอีกชั้นเสมอ
 * แก้ของตัวเอง: เปลี่ยนสิทธิ์/ปิดใช้งานไม่ได้
 */
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { userApi, type UserInput } from '../../api/userApi';
import { EditorPage } from '../../components/EditorPage';
import { RadioField, SelectField, TextField } from '../../components/Fields';
import { usePopup } from '../../components/Popup';
import { Spinner } from '../../components/Spinner';
import { useEditId } from '../../hooks/useEditId';
import { hasRole, ROLE_LABEL, useSession, type Role } from '../../lib/session';

const ALL_ROLES: Role[] = ['STAFF', 'ADMIN', 'DEV'];

export default function UserEditor({ mode }: { mode: 'add' | 'edit' }) {
  const id = useEditId();
  const { user: me } = useSession();
  const navigate = useNavigate();
  const popup = usePopup();
  const form = useForm<UserInput>({ defaultValues: { username: '', password: '', full_name: '', role: 'STAFF', is_active: 'Y' } });
  const [loading, setLoading] = useState(mode === 'edit');
  const isSelf = mode === 'edit' && id === me?.id;
  const roleOptions = ALL_ROLES.filter((r) => hasRole(me?.role, r)).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    void userApi.get(id).then((res) => {
      if (res.ok && res.data) {
        form.reset({ username: res.data.username, password: '', full_name: res.data.full_name, role: res.data.role, is_active: res.data.is_active ? 'Y' : 'N' });
        setLoading(false);
      } else {
        popup.error(res.message);
        navigate('/user');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (mode === 'edit' && !id) return <Navigate to="/user" replace />;
  if (loading) return <Spinner />;

  return (
    <EditorPage
      title={mode === 'add' ? 'เพิ่มผู้ใช้งาน' : 'แก้ไขผู้ใช้งาน'}
      mode={mode}
      backTo="/user"
      form={form}
      onSave={(v) => (mode === 'add' ? userApi.add(v) : userApi.update(id!, { full_name: v.full_name, role: v.role || (me?.role ?? 'STAFF'), is_active: v.is_active }))}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextField name="username" label="ชื่อผู้ใช้" required maxLength={60} readOnly={mode === 'edit'} hint={mode === 'edit' ? 'แก้ไขไม่ได้' : 'a-z 0-9 . _ - (3-60 ตัว)'} />
        {mode === 'add' && <TextField name="password" label="รหัสผ่านเริ่มต้น" type="password" required maxLength={100} rules={{ minLength: { value: 8, message: 'อย่างน้อย 8 ตัวอักษร' } }} hint="อย่างน้อย 8 ตัวอักษร" />}
        <TextField name="full_name" label="ชื่อ-สกุล" required maxLength={120} />
        <SelectField name="role" label="สิทธิ์การใช้งาน" required options={roleOptions} disabled={isSelf} hint={isSelf ? 'เปลี่ยนสิทธิ์ของตัวเองไม่ได้' : undefined} />
        <RadioField
          name="is_active"
          label="สถานะ"
          required
          disabled={isSelf}
          options={[
            { value: 'Y', label: 'ใช้งาน' },
            { value: 'N', label: 'ปิดใช้งาน' },
          ]}
        />
      </div>
    </EditorPage>
  );
}
