/**
 * UserEditor — ฟอร์มเพิ่ม/แก้ไขผู้ใช้
 * ตัวเลือกสิทธิ์แสดงเฉพาะระดับที่ไม่สูงกว่าตัวเอง (ADMIN เห็นแค่ เจ้าหน้าที่/ผู้ดูแล) — backend ตรวจซ้ำอีกชั้นเสมอ
 * แก้ของตัวเอง: เปลี่ยนสิทธิ์/ปิดใช้งานไม่ได้
 */
import { useEffect, useState } from 'react';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { userApi, type UserInput, type UserRow } from '../../api/userApi';
import { Button } from '../../components/Button';
import { MfaBadge } from './MfaBadge';
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
  const form = useForm<UserInput>({ defaultValues: { username: '', password: '', full_name: '', role: 'STAFF', is_active: 'Y', totp_required: 'N' } });
  const [detail, setDetail] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const isSelf = mode === 'edit' && id === me?.id;
  const roleOptions = ALL_ROLES.filter((r) => hasRole(me?.role, r)).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

  useEffect(() => {
    if (mode !== 'edit' || !id) return;
    void userApi.get(id).then((res) => {
      if (res.ok && res.data) {
        form.reset({ username: res.data.username, password: '', full_name: res.data.full_name, role: res.data.role, is_active: res.data.is_active ? 'Y' : 'N', totp_required: res.data.totp_required ? 'Y' : 'N' });
        setDetail(res.data);
        setLoading(false);
      } else {
        popup.error(res.message);
        navigate('/user');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function resetMfa() {
    if (!id || !(await popup.confirm({ title: 'รีเซ็ต 2FA', message: 'ล้างการผูกแอปยืนยันตัวตนของบัญชีนี้ และตัดการเข้าสู่ระบบทุกเครื่อง\nล็อกอินครั้งถัดไปต้องผูกแอปใหม่ ทำเมื่อเจ้าของบัญชีมือถือหายหรือเปลี่ยนเครื่องเท่านั้น', danger: true, confirmText: 'รีเซ็ต 2FA' }))) return;
    const res = await userApi.resetMfa(id);
    if (res.ok) {
      popup.success(res.message);
      setDetail((d) => (d ? { ...d, mfa_state: d.mfa_by_role || d.totp_required ? 'PENDING' : 'OFF', totp_enabled_at: null, recovery_left: 0 } : d));
    } else popup.error(res.message);
  }

  if (mode === 'edit' && !id) return <Navigate to="/user" replace />;
  if (loading) return <Spinner />;

  return (
    <EditorPage
      title={mode === 'add' ? 'เพิ่มผู้ใช้งาน' : 'แก้ไขผู้ใช้งาน'}
      mode={mode}
      backTo="/user"
      form={form}
      onSave={(v) => (mode === 'add' ? userApi.add(v) : userApi.update(id!, { full_name: v.full_name, role: v.role || (me?.role ?? 'STAFF'), is_active: v.is_active, totp_required: v.totp_required }))}
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

      {/* ยืนยันตัวตน 2 ชั้น: บังคับรายคน + ดูสถานะ + รีเซ็ต (มือถือหาย) */}
      <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
        <div className="mb-3 flex items-center gap-2 font-display font-semibold text-foreground">
          <ShieldCheck className="size-5 text-primary" aria-hidden />
          ยืนยันตัวตน 2 ชั้น (แอป Authenticator)
        </div>
        <RadioField
          name="totp_required"
          label="บังคับใช้กับบัญชีนี้"
          disabled={!!detail?.mfa_by_role}
          hint={detail?.mfa_by_role ? 'สิทธิ์นี้ถูกบังคับใช้ 2FA ตามนโยบายระบบอยู่แล้ว' : 'ติ๊กบังคับรายคนได้ เมื่อเข้าสู่ระบบครั้งถัดไปจะถูกพาไปผูกแอป'}
          options={[
            { value: 'Y', label: 'บังคับ' },
            { value: 'N', label: 'ไม่บังคับ' },
          ]}
        />
        {mode === 'edit' && detail && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <MfaBadge state={detail.mfa_state} />
            {detail.mfa_state === 'ENABLED' && (
              <>
                <span className="text-muted-foreground">รหัสสำรองเหลือ {detail.recovery_left ?? 0} ชุด</span>
                <Button variant="outline" size="sm" onClick={() => void resetMfa()}>
                  <RotateCcw className="size-4" />
                  รีเซ็ต 2FA
                </Button>
              </>
            )}
            {detail.mfa_state === 'PENDING' && <span className="text-muted-foreground">ยังไม่ได้ผูกแอป จะถูกพาไปผูกตอนล็อกอินครั้งถัดไป</span>}
          </div>
        )}
      </div>
    </EditorPage>
  );
}
