/**
 * ConsentCard — หน้ายินยอมเรื่องข้อมูลส่วนบุคคล (PDPA) ที่ผู้ขอเห็นก่อนลงทะเบียนครั้งแรก
 * รูปแบบตามระบบจองคิวนวด: รายการ "ข้อมูลที่เราเก็บ" + ข้อความของหน่วยงาน + ติ๊กยินยอม + ปุ่มเริ่มใช้งาน (ต้องติ๊กก่อนจึงกดได้)
 * ข้อความของหน่วยงานมาจากตั้งค่าระบบ "pdpa_notice" (ผู้รับผิดชอบ PDPA ของโรงพยาบาลแก้ได้)
 */
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../Button';

const COLLECTED = [
  'ชื่อ-นามสกุล เบอร์โทร และโรงพยาบาลของผู้ขอ (เจ้าหน้าที่ผู้ประสานงาน)',
  'ข้อมูลผู้ป่วยที่กรอกในคำขอ เช่น ชื่อ อายุ เพศ จังหวัด ระดับสี ประเภทสารเสพติด เหตุผลการส่งต่อ และหมายเหตุ',
  'บัญชี LINE ของคุณ (user ID และชื่อที่แสดง) เพื่อส่งการ์ดเรียกคิวและแจ้งเตือน',
  'ประวัติการดำเนินการ: เวลาที่ส่ง เรียกคิว ยืนยัน และผู้ทำรายการ เพื่อตรวจสอบย้อนหลัง',
];

export function ConsentCard({ notice, busy, onAccept }: { notice: string; busy?: boolean; onAccept: () => void }) {
  const [agree, setAgree] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground">ก่อนเริ่มใช้งาน</h2>
        <p className="mt-1 text-sm text-muted-foreground">ระบบเก็บข้อมูลเท่าที่จำเป็นสำหรับการประสานงานขอเตียงเท่านั้น</p>
      </div>
      <div className="rounded-xl bg-muted p-4">
        <div className="mb-2 flex items-center gap-2 font-display font-semibold text-primary-ink">
          <ShieldCheck className="size-5" aria-hidden />
          ข้อมูลที่เราเก็บ
        </div>
        <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
          {COLLECTED.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {notice && <p className="mt-3 whitespace-pre-line text-xs text-muted-foreground">{notice}</p>}
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" />
        <span>ฉันรับทราบและยินยอมให้เก็บและใช้ข้อมูลข้างต้นเพื่อประสานงานขอเตียง และมีสิทธิ์เปิดเผยข้อมูลผู้ป่วยเพื่อวัตถุประสงค์นี้ โดยจะกรอกเท่าที่จำเป็น</span>
      </label>
      <Button full loading={busy} disabled={!agree} className="h-11" onClick={onAccept}>
        ยินยอมและเริ่มใช้งาน
      </Button>
    </div>
  );
}
