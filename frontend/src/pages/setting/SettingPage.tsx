/**
 * SettingPage — ตั้งค่าระบบ (เก็บในฐานข้อมูล) แยกเป็นหมวด · ค่าลับ (token/secret) ไม่แสดงค่าเดิม เว้นว่าง = ใช้ค่าเดิม
 * หมวด "เชื่อมต่อ LINE" เห็นเฉพาะนักพัฒนา (backend กรองให้ ไม่ได้ซ่อนแค่ที่หน้าจอ)
 * กด "บันทึก" → popup ยืนยัน → ส่งเฉพาะค่าที่แก้
 */
import { useEffect, useMemo, useState } from 'react';
import { settingApi, type SettingItem } from '../../api/settingApi';
import { Button } from '../../components/Button';
import { PageCard, PageTitle } from '../../components/PageCard';
import { usePopup } from '../../components/Popup';
import { Spinner } from '../../components/Spinner';
import { MSG } from '../../lib/messages';

const CATEGORY_LABEL: Record<string, string> = {
  queue: 'คิว',
  dashboard: 'Dashboard',
  requester: 'หน้าผู้ขอ (PDPA)',
  line: 'โควต้าข้อความ LINE',
  connection: 'เชื่อมต่อ LINE (นักพัฒนา)',
};
const WIDGET_LABEL: Record<string, string> = {
  summary: 'ตัวเลขสรุป',
  status: 'สัดส่วนตามสถานะ',
  hospital: 'โรงพยาบาลที่มีเคสมาก',
  color: 'สัดส่วนตามสี',
  hospital_color: 'โรงพยาบาล × สี',
  substance: 'ประเภทสารเสพติด',
  trend: 'แนวโน้มรายวัน',
  duration: 'ระยะเวลาจนยืนยัน',
};
const inputClass = 'w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30';

export default function SettingPage() {
  const popup = usePopup();
  const [items, setItems] = useState<SettingItem[] | null>(null);
  const [edited, setEdited] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await settingApi.list();
    if (res.ok && res.data) {
      setItems(res.data);
      setEdited({});
    } else popup.error(res.message);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, SettingItem[]>();
    for (const i of items ?? []) map.set(i.category, [...(map.get(i.category) ?? []), i]);
    return [...map.entries()];
  }, [items]);

  if (!items) return <Spinner />;
  const dirty = Object.keys(edited).length > 0;
  const valueOf = (i: SettingItem) => (i.key in edited ? edited[i.key]! : i.value);
  const set = (key: string, v: string | number | boolean) => setEdited((e) => ({ ...e, [key]: v }));

  async function handleSave() {
    if (!(await popup.confirm({ title: MSG.confirmSaveTitle, message: MSG.confirmSave, confirmText: MSG.save }))) return;
    setSaving(true);
    const res = await settingApi.save(edited).finally(() => setSaving(false));
    if (res.ok) {
      popup.success(res.message || MSG.saved);
      await load();
    } else popup.warn(res.message);
  }

  function renderInput(i: SettingItem) {
    const v = valueOf(i);
    const id = `set_${i.key}`;
    if (i.key === 'dashboard_widgets') {
      const on = String(v).split(',').map((w) => w.trim());
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-2" id={id}>
          {Object.entries(WIDGET_LABEL).map(([w, label]) => (
            <label key={w} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={on.includes(w)} onChange={(e) => set(i.key, Object.keys(WIDGET_LABEL).filter((x) => (x === w ? e.target.checked : on.includes(x))).join(','))} />
              {label}
            </label>
          ))}
        </div>
      );
    }
    if (i.options) {
      return (
        <select id={id} className={inputClass} value={String(v)} onChange={(e) => set(i.key, e.target.value)}>
          {i.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    if (i.type === 'TEXT') return <textarea id={id} rows={4} className={inputClass} value={String(v)} onChange={(e) => set(i.key, e.target.value)} />;
    if (i.type === 'INT') return <input id={id} type="number" min={i.min ?? undefined} max={i.max ?? undefined} className={inputClass} value={String(v)} onChange={(e) => set(i.key, e.target.value)} />;
    if (i.type === 'SECRET') return <input id={id} type="password" autoComplete="new-password" className={inputClass} value={String(v === i.value ? '' : v)} placeholder={i.is_set ? '•••••••• (ตั้งค่าไว้แล้ว — เว้นว่างเพื่อใช้ค่าเดิม)' : 'ยังไม่ได้ตั้งค่า'} onChange={(e) => set(i.key, e.target.value)} />;
    return <input id={id} className={inputClass} value={String(v)} onChange={(e) => set(i.key, e.target.value)} />;
  }

  return (
    <>
      <PageTitle>ตั้งค่าระบบ</PageTitle>
      <div className="grid gap-4">
        {groups.map(([cat, list]) => (
          <PageCard key={cat} title={CATEGORY_LABEL[cat] ?? cat}>
            <div className="grid gap-4 md:grid-cols-2">
              {list.map((i) => (
                <div key={i.key} className={i.type === 'TEXT' || i.key === 'dashboard_widgets' ? 'flex flex-col gap-1 md:col-span-2' : 'flex flex-col gap-1'}>
                  <label htmlFor={`set_${i.key}`} className="text-sm font-medium">
                    {i.label}
                  </label>
                  {renderInput(i)}
                  {i.hint && i.key !== 'dashboard_widgets' && <p className="text-xs text-muted-foreground">{i.hint}</p>}
                </div>
              ))}
            </div>
          </PageCard>
        ))}
        <div className="flex justify-center gap-3">
          <Button variant="outline" disabled={!dirty} onClick={() => setEdited({})}>
            {MSG.reset}
          </Button>
          <Button disabled={!dirty} loading={saving} onClick={() => void handleSave()}>
            {MSG.save}
          </Button>
        </div>
      </div>
    </>
  );
}
