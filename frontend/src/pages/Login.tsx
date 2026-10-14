import { FormProvider, useForm } from 'react-hook-form';
import { Button } from '../components/Button';
import { TextField } from '../components/Fields';
import { PageCard } from '../components/PageCard';
import { useSession } from '../lib/session';
import { useState } from 'react';

type LoginForm = { username: string; password: string };

export default function Login() {
  const { login, app } = useSession();
  const form = useForm<LoginForm>({ defaultValues: { username: '', password: '' } });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = form.handleSubmit(async (v) => {
    setBusy(true);
    setError('');
    const res = await login(v.username, v.password);
    setBusy(false);
    if (!res.ok) setError(res.message);
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-4 text-center font-display text-2xl font-bold text-primary-ink">{app.name}</h1>
        <PageCard title="เข้าสู่ระบบ">
          <FormProvider {...form}>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <TextField name="username" label="ชื่อผู้ใช้" required />
              <TextField name="password" label="รหัสผ่าน" type="password" required />
              {error && (
                <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-ink">
                  {error}
                </p>
              )}
              <Button type="submit" full loading={busy}>
                เข้าสู่ระบบ
              </Button>
            </form>
          </FormProvider>
        </PageCard>
      </div>
    </div>
  );
}
