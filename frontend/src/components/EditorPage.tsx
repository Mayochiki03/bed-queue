/**
 * components/EditorPage.tsx — โครงหน้า "เพิ่ม/แก้ไข" มาตรฐาน: ฟอร์ม + ปุ่ม ยกเลิก/บันทึก
 * รวมกติกากลางไว้ที่เดียว:
 *   - กด Enter ในช่องกรอกไม่ส่งฟอร์ม (noEnterSubmit)
 *   - ตรวจฟอร์ม → popup ถามยืนยันก่อนบันทึกจริง → สำเร็จ = popup แล้วกลับหน้ารายการ
 *   - ซ้ำ/ข้อมูลผิด = ขีดแดงช่องที่ผิด · อย่างอื่น = popup error
 *   - ยกเลิกตอนมีการกรอกค้างอยู่ = ถามก่อนทิ้ง
 */
import { useState, type ReactNode } from 'react';
import { FormProvider, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { useNavigate } from 'react-router';
import type { ApiResult } from '../api/client';
import { applyFieldErrors, noEnterSubmit } from '../lib/forms';
import { MSG } from '../lib/messages';
import { Button } from './Button';
import { PageCard, PageTitle } from './PageCard';
import { usePopup } from './Popup';

type Props<T extends FieldValues> = {
  title: string;
  mode: 'add' | 'edit';
  backTo: string;
  form: UseFormReturn<T>;
  onSave: (values: T) => Promise<ApiResult<unknown>>;
  children: ReactNode;
  saveText?: string;
};

export function EditorPage<T extends FieldValues>({ title, mode, backTo, form, onSave, children, saveText = MSG.save }: Props<T>) {
  const navigate = useNavigate();
  const popup = usePopup();
  const { isDirty } = form.formState; // อ่านตอน render ไม่ใช่ใน handler
  const [saving, setSaving] = useState(false); // หมุนเฉพาะตอนส่งจริง ไม่หมุนตอนรอกดยืนยัน

  const handleSave = form.handleSubmit(async (values) => {
    if (!(await popup.confirm({ title: MSG.confirmSaveTitle, message: MSG.confirmSave, confirmText: saveText }))) return;
    setSaving(true);
    const res = await onSave(values).finally(() => setSaving(false));
    if (res.ok) {
      popup.success(res.message || MSG.saved);
      navigate(backTo);
    } else if (res.status === 'DUPLICATE' || res.status === 'VALIDATION') {
      applyFieldErrors(form.setError, res);
      popup.warn(res.message);
    } else {
      popup.error(res.message);
    }
  });

  async function handleCancel() {
    if (isDirty && !(await popup.confirm({ message: mode === 'add' ? MSG.confirmCancelAdd : MSG.confirmCancelEdit, danger: true }))) return;
    navigate(backTo);
  }

  return (
    <>
      <PageTitle>{title}</PageTitle>
      <PageCard>
        <FormProvider {...form}>
          <form onSubmit={handleSave} onKeyDown={noEnterSubmit} noValidate>
            {children}
            <div className="mt-6 flex justify-center gap-3 border-t border-border pt-4">
              <Button variant="outline" onClick={() => void handleCancel()}>
                {MSG.cancel}
              </Button>
              <Button type="submit" loading={saving}>
                {saveText}
              </Button>
            </div>
          </form>
        </FormProvider>
      </PageCard>
    </>
  );
}
