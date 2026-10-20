/**
 * mockData.ts — สร้างข้อมูลตัวอย่าง "สมจริง" ไว้โชว์ระบบ (npm run mock) และลบทิ้ง (npm run mock:clear)
 *
 * ข้อมูลทั้งหมดผูกกับ "ผู้ขอจำลอง" (line_user_id ขึ้นต้น MOCK-) จึง
 *   - ไม่ส่งข้อความ LINE จริงหาใคร (ระบบข้ามผู้ขอจำลอง)
 *   - ผู้ลงทะเบียนตัวอย่างในหน้า "สมาชิก รพ." ใช้ line_user_id ขึ้นต้น DEMO- (ระบบข้ามการส่ง LINE เหมือนกัน)
 *   - ลบได้หมดด้วยปุ่ม "ล้างข้อมูลจำลอง" ในเมนูนักพัฒนา หรือ npm run mock:clear (ไม่แตะข้อมูลที่เจ้าหน้าที่บันทึกเอง)
 * ชื่อ/เบอร์เป็นของสมมติ (นามสกุล "ตัวอย่าง", เบอร์ 081000xxxx) · สุ่มแบบคงที่ รันกี่ครั้งก็ได้ข้อมูลหน้าตาเดิม (เวลาเลื่อนตามวันนี้)
 */
import { db } from './core/db';
import { requestRepository } from './pages/request';
import { requestNo } from './pages/request/Request';
import { formatThaiDate, thaiToday } from './core/thaiDate';

/** รพ. ตัวอย่าง: รหัส 9900x + ต่อท้าย "(ตัวอย่าง)" — ไม่ชนรหัสจริง และ mock:clear ลบเฉพาะกลุ่มนี้ (ที่ไม่มีใครอ้างอิงแล้ว) ไม่แตะ รพ. จริงที่นำเข้าจาก Excel */
const HOSPITALS: [string, string][] = [
  ['99001', 'รพ.สงขลา (ตัวอย่าง)'],
  ['99002', 'รพ.หาดใหญ่ (ตัวอย่าง)'],
  ['99003', 'รพ.สทิงพระ (ตัวอย่าง)'],
  ['99004', 'รพ.สะเดา (ตัวอย่าง)'],
  ['99005', 'รพ.นาทวี (ตัวอย่าง)'],
  ['99006', 'รพ.ระโนด (ตัวอย่าง)'],
  ['99007', 'รพ.รัตภูมิ (ตัวอย่าง)'],
  ['99008', 'รพ.จะนะ (ตัวอย่าง)'],
];
const MOCK_HOSPITAL_CODES = HOSPITALS.map(([c]) => c);
/** ผู้ลงทะเบียนตัวอย่างที่ไปโผล่ในหน้า "สมาชิก รพ." (ให้ลองกดอนุมัติ/ไม่อนุมัติ) — line_user_id ขึ้นต้น DEMO- (ระบบไม่ส่ง LINE จริงหา) */
const DEMO_MEMBERS: { name: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; note?: string }[] = [
  { name: 'สายสุนีย์ ตัวอย่าง', status: 'PENDING' },
  { name: 'ธีรวัฒน์ ตัวอย่าง', status: 'PENDING' },
  { name: 'กมลชนก ตัวอย่าง', status: 'PENDING' },
  { name: 'ณัฐพล ตัวอย่าง', status: 'PENDING' },
  { name: 'ลลิตา ตัวอย่าง', status: 'PENDING' },
  { name: 'ภานุพงศ์ ตัวอย่าง', status: 'APPROVED' },
  { name: 'จิราพร ตัวอย่าง', status: 'APPROVED' },
  { name: 'อดิศร ตัวอย่าง', status: 'REJECTED', note: 'เบอร์โทรไม่ตรงกับ รพ.' },
  { name: 'วราภรณ์ ตัวอย่าง', status: 'REJECTED' },
];
const STAFF = ['สมศรี ใจดี', 'วิชัย มั่นคง', 'นภา สุขสม', 'ประเสริฐ ชูศักดิ์', 'อรทัย พึ่งบุญ', 'กิตติ ศรีสุข', 'พรทิพย์ แก้วมณี', 'ธนากร ทองดี', 'ศิริพร ใจเย็น', 'สุรชัย วงศ์ใหญ่', 'ปรียา นามสกุล', 'มานะ เพียรดี'].map((n) => n.replace('นามสกุล', 'ตัวอย่าง'));
const FIRST_M = ['สมชาย', 'วิรัตน์', 'อนุชา', 'ปรีชา', 'ธวัช', 'สุเทพ', 'ชาตรี', 'เอกชัย', 'บุญเลิศ', 'ประยุทธ'];
const FIRST_F = ['สมหญิง', 'วารี', 'จินตนา', 'สุนีย์', 'พิมพ์ใจ', 'รัตนา', 'อัญชลี', 'มาลี'];
const PROVINCES = ['สงขลา', 'สงขลา', 'สงขลา', 'พัทลุง', 'ปัตตานี', 'ยะลา', 'สตูล', 'นครศรีธรรมราช', 'ตรัง'];
const NOTES = ['มีอาการหวาดระแวง ญาติมาด้วย', 'ผ่านการล้างพิษแล้ว 3 วัน', 'ต้องการเตียงแยก', 'ญาติสะดวกพาไปส่งเอง', 'มีโรคประจำตัว เบาหวาน', 'ส่งต่อตามนโยบายจังหวัด', null, null, null, null];

const iso = (ms: number) => new Date(ms).toISOString();
const H = 3_600_000;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ลบผู้ขอจำลอง/ผู้ลงทะเบียนตัวอย่าง + คำขอ/ประวัติของพวกเขา + รพ. ตัวอย่าง (เฉพาะที่ไม่มีใครอ้างอิงแล้ว) — ไม่แตะข้อมูลที่เจ้าหน้าที่บันทึกเอง/รพ. จริง */
export async function clearMock() {
  const r = await requestRepository.deleteMockData();
  const hospitals = await db('hospital')
    .whereIn('code', MOCK_HOSPITAL_CODES)
    .whereNotExists(db('requester').select(db.raw('1')).whereRaw('requester.hospital_id = hospital.id'))
    .whereNotExists(db('bed_request').select(db.raw('1')).whereRaw('bed_request.hospital_id = hospital.id'))
    .delete();
  return { ...r, hospitals: Number(hospitals) };
}

/** ข้อมูลตัวอย่างที่ค้างอยู่ในฐานข้อมูลนี้เท่าไร (ใช้ตรวจก่อนขึ้น production) */
export async function mockStatus() {
  const count = async (q: any) => Number(((await q.count({ n: '*' }).first()) as { n: number | string }).n);
  const requesters = await count(db('requester').where('line_user_id', 'like', 'MOCK-%').orWhere('line_user_id', 'like', 'DEMO-%'));
  const requests = await count(db('bed_request').whereIn('requester_id', db('requester').where('line_user_id', 'like', 'MOCK-%').orWhere('line_user_id', 'like', 'DEMO-%').select('id')));
  const hospitals = await count(db('hospital').whereIn('code', MOCK_HOSPITAL_CODES));
  return { requesters, requests, hospitals, total: requesters + requests + hospitals };
}

export async function createMock(opts: { force?: boolean } = {}) {
  const existing = Number(((await db('requester').where('line_user_id', 'like', 'MOCK-%').orWhere('line_user_id', 'like', 'DEMO-%').count({ n: '*' }).first()) as { n: number | string }).n);
  if (existing && !opts.force) throw new Error(`มีผู้ขอจำลองอยู่แล้ว ${existing} คน — รันซ้ำเพื่อสร้างใหม่ให้ใช้: npm run mock -- --force (จะลบข้อมูลจำลองเดิมก่อน)`);
  if (existing) await clearMock();

  const R = rng(20261016);
  const pick = <T>(a: T[]) => a[Math.floor(R() * a.length)]!;
  const between = (a: number, b: number) => a + R() * (b - a);
  const weighted = <T>(items: [T, number][]) => {
    let x = R() * items.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of items) if ((x -= w) <= 0) return v;
    return items[0]![0];
  };

  const now = Date.now();
  const stamp = iso(now);
  const admin = (await db('users').orderBy('id').first('id', 'full_name')) as { id: number; full_name: string } | undefined;
  const staffLabel = admin?.full_name ?? 'เจ้าหน้าที่';

  // โรงพยาบาล (ใช้ของเดิมถ้ามีรหัสนี้อยู่แล้ว)
  const hospitalIds: number[] = [];
  for (const [code, name] of HOSPITALS) {
    const found = await db('hospital').where({ code }).first();
    if (found) hospitalIds.push(found.id);
    else {
      await db('hospital').insert({ code, name, health_region: 12, is_active: true, created_at: stamp, updated_at: stamp });
      hospitalIds.push((await db('hospital').where({ code }).first()).id);
    }
  }

  // ผู้ขอจำลอง 12 คน กระจายตามโรงพยาบาล
  const requesters: { id: number; name: string; phone: string; phone2: string | null; hospital: number }[] = [];
  for (let i = 0; i < STAFF.length; i++) {
    const hospital = hospitalIds[i % hospitalIds.length]!;
    const phone = `081000${String(1000 + i).slice(-4)}`;
    const phone2 = i % 3 === 0 ? `074${String(300000 + i * 137).slice(-6)} ต่อ ${100 + i}` : null;
    const id = await requestRepository.insertRequester({ line_user_id: `MOCK-demo${String(i + 1).padStart(2, '0')}`, display_name: `ผู้ขอจำลอง ${STAFF[i]}`, full_name: STAFF[i]!, phone, phone2, hospital_id: hospital, pdpa_accepted_at: iso(now - 50 * 24 * H), });
    requesters.push({ id, name: STAFF[i]!, phone, phone2, hospital });
  }

  // ผู้ลงทะเบียนตัวอย่างให้หน้า "สมาชิก รพ." (รออนุมัติ 5 · อนุมัติแล้ว 2 · ไม่อนุมัติ 2) — ใช้ลองกดอนุมัติ/ไม่อนุมัติได้จริง
  for (let i = 0; i < DEMO_MEMBERS.length; i++) {
    const m = DEMO_MEMBERS[i]!;
    const id = await requestRepository.insertRequester({
      line_user_id: `DEMO-reg${String(i + 1).padStart(2, '0')}`,
      display_name: `ตัวอย่าง LINE ${i + 1}`,
      full_name: m.name,
      phone: `081000${String(9000 + i).slice(-4)}`,
      phone2: null,
      hospital_id: hospitalIds[(i + 3) % hospitalIds.length]!,
      pdpa_accepted_at: iso(now - (i + 1) * 6 * H),
      approval_status: 'PENDING',
    });
    await db('requester')
      .where({ id })
      .update({
        approval_status: m.status,
        created_at: iso(now - (i + 1) * 6 * H),
        ...(m.status === 'PENDING' ? {} : { decided_by: admin?.id ?? null, decided_at: iso(now - (i + 1) * 3 * H), decided_note: m.note ?? null }),
      });
  }

  type Plan = 'WAITING' | 'CALLED' | 'CALLED_OVERDUE' | 'NEED_DATE' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED';
  const plans: Plan[] = [...Array(14).fill('WAITING'), ...Array(3).fill('CALLED'), ...Array(2).fill('CALLED_OVERDUE'), ...Array(4).fill('NEED_DATE'), ...Array(25).fill('CONFIRMED'), ...Array(6).fill('DECLINED'), ...Array(6).fill('CANCELLED')];
  // สลับลำดับให้ผสมกัน
  for (let i = plans.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [plans[i], plans[j]] = [plans[j]!, plans[i]!];
  }

  let n = 0;
  for (const plan of plans) {
    n++;
    const rq = pick(requesters);
    const male = R() < 0.68;
    const color = weighted<string>([['RED', 20], ['ORANGE', 30], ['YELLOW', 30], ['GREEN', 20]]);
    const submitted =
      plan === 'WAITING' ? now - between(0.3, 21) * 24 * H
      : plan.startsWith('CALLED') || plan === 'NEED_DATE' ? now - between(3, 14) * 24 * H
      : now - between(5, 44) * 24 * H;
    const called = plan === 'CALLED' ? now - between(2, 20) * H : plan === 'NEED_DATE' ? now - between(8, 40) * H : plan === 'CALLED_OVERDUE' ? now - between(27, 52) * H : plan === 'WAITING' ? null : Math.min(submitted + between(4, 72) * H, now - 6 * H);
    const resolved = plan === 'CONFIRMED' || plan === 'DECLINED' ? Math.min((called ?? submitted) + between(0.5, 20) * H, now - 1 * H) : plan === 'CANCELLED' ? Math.min((called ?? submitted) + between(1, 30) * H, now - 1 * H) : null;
    const status = plan === 'CALLED_OVERDUE' ? 'CALLED' : plan;
    // วันที่เตียงว่าง: เรียกแล้ว/รอนัดวัน = วันที่เสนอ (อีก 1-5 วัน) · ยืนยันแล้ว = วันที่ส่งตัวที่ตกลงกัน (ใกล้วันที่ปิดเคส)
    const offered = called ? thaiToday(new Date(now + Math.round(between(1, 5)) * 24 * H)) : null;
    const viaDefer = status === 'CONFIRMED' && R() < 0.3; // บางเคสผู้ขอบอกว่าวันที่เสนอไม่สะดวก แล้วเจ้าหน้าที่โทรนัดวันใหม่
    const deferredAt = status === 'NEED_DATE' ? Math.min(called! + between(1, 6) * H, now - 1 * H) : viaDefer ? called! + (resolved! - called!) * 0.4 : null;
    const bedDate = status === 'CONFIRMED' ? thaiToday(new Date(resolved! + Math.round(between(1, 6)) * 24 * H)) : offered;
    const via = viaDefer ? 'PHONE' : weighted<string>([['LINE', 55], ['PHONE', 45]]);
    const id = (
      await db('bed_request').insert({
        requester_id: rq.id,
        hospital_id: rq.hospital,
        requester_name: rq.name,
        requester_phone: rq.phone,
        requester_phone2: rq.phone2,
        patient_name: `${male ? 'นาย' : 'นางสาว'}${pick(male ? FIRST_M : FIRST_F)} ตัวอย่าง`,
        patient_gender: male ? 'M' : 'F',
        patient_age: Math.round(between(16, 62)),
        patient_province: pick(PROVINCES),
        patient_phone: R() < 0.5 ? `082000${String(2000 + n).slice(-4)}` : null,
        color_code: color,
        substance_code: weighted<string>([['METH', 35], ['ALCOHOL', 25], ['ICE', 15], ['KRATOM', 15], ['OTHER', 10]]),
        reason_code: weighted<string>([['APPROPRIATE_TREATMENT', 45], ['BEYOND_CAPACITY', 30], ['PATIENT_REQUEST', 15], ['OTHER', 10]]),
        note: pick(NOTES),
        status,
        submitted_at: iso(submitted),
        called_at: called ? iso(called) : null,
        called_by: called ? (admin?.id ?? null) : null,
        bed_date: called ? bedDate : null,
        call_count: called ? (R() < 0.15 ? 2 : 1) : 0,
        responded_at: status === 'CONFIRMED' || status === 'DECLINED' ? iso(resolved!) : deferredAt ? iso(deferredAt) : null,
        resolved_at: resolved ? iso(resolved) : null,
        resolved_by: resolved && via !== 'LINE' ? (admin?.id ?? null) : null,
        resolved_via: resolved ? (status === 'CANCELLED' ? 'LINE' : via) : null,
        source: 'APP',
        created_at: iso(submitted),
        updated_at: iso(resolved ?? deferredAt ?? called ?? submitted),
      })
    )[0] as number;
    const rid = typeof id === 'number' && id > 0 ? id : (await db('bed_request').orderBy('id', 'desc').first('id')).id;
    await db('bed_request').where({ id: rid }).update({ request_no: requestNo(rid) });

    const ev = (event: string, from: string | null, to: string | null, at: number, label: string, v: string, detail: string | null = null) =>
      db('request_event').insert({ request_id: rid, event, from_status: from, to_status: to, by_user_id: null, by_label: label, via: v, detail, created_at: iso(at) });
    await ev('SUBMITTED', null, 'WAITING', submitted, rq.name, 'LINE');
    if (called) await ev('CALLED', 'WAITING', 'CALLED', called, staffLabel, 'ADMIN', `เตียงว่างวันที่ ${formatThaiDate(offered)}`);
    if (deferredAt) await ev('DEFERRED', 'CALLED', 'NEED_DATE', deferredAt, rq.name, 'LINE', `วันที่เสนอ ${formatThaiDate(offered)} ไม่สะดวก — ยืนยันว่าจะส่งตัว รอเจ้าหน้าที่โทรนัดวัน`);
    if (status === 'CONFIRMED') {
      const dateText = `วันที่ส่งตัว ${formatThaiDate(bedDate)}`;
      if (viaDefer) await ev('CONFIRMED', 'NEED_DATE', 'CONFIRMED', resolved!, staffLabel, 'PHONE', `${dateText} (เดิมเสนอ ${formatThaiDate(offered)}) · โทรนัดวันใหม่กับผู้ขอแล้ว`);
      else await ev('CONFIRMED', 'CALLED', 'CONFIRMED', resolved!, via === 'LINE' ? rq.name : staffLabel, via, via === 'PHONE' ? `${dateText} · ผู้ขอแจ้งทางโทรศัพท์` : dateText);
    }
    if (status === 'DECLINED') await ev('DECLINED', 'CALLED', 'DECLINED', resolved!, via === 'LINE' ? rq.name : staffLabel, via, 'ญาติขอเลื่อนการส่งตัว');
    if (status === 'CANCELLED') await ev('CANCELLED', called ? 'CALLED' : 'WAITING', 'CANCELLED', resolved!, rq.name, 'LINE', 'ผู้ขอยกเลิกเอง');
  }
  return { hospitals: hospitalIds.length, requesters: requesters.length, members: DEMO_MEMBERS.length, requests: plans.length };
}
