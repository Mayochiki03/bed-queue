/**
 * ทดสอบ API จริงกับฐานข้อมูลจริง: npm test
 *
 * ระวัง: เทสต์ "ลบตารางทั้งหมดแล้วสร้างใหม่" ทุกครั้ง จึงใช้ฐานข้อมูลแยกเท่านั้น:
 *    ค่าเริ่มต้น bed_queue_test (สร้างไว้แล้วใน database/init.sql) — เปลี่ยนได้ด้วย TEST_DB_NAME
 *    และ "ชื่อต้องลงท้ายด้วย _test" ไม่งั้นเทสต์ไม่ยอมรัน (กันเผลอลบข้อมูลจริง)
 * ทดสอบกับ PostgreSQL: DB_CLIENT=postgres DB_PORT=5432 TEST_DB_NAME=bed_queue_test npm test
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'bed_queue_test'; // ต้องตั้งก่อน import config (ค่านี้ชนะ .env)

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

const { createApp } = await import('../src/app');
const { ensureAdmin } = await import('../src/core/auth');
const { config } = await import('../src/core/config');
const { checkConnection, closeDb, db } = await import('../src/core/db');
const { resetDb } = await import('../src/core/migrate');

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let cookie = '';
let staffCookie = '';

async function call(method: string, path: string, body?: unknown, withCookie: boolean | string = true) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(typeof withCookie === 'string' ? { cookie: withCookie } : withCookie && cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { status: string; message?: string; data?: any; fields?: Record<string, string> };
  return { http: res.status, ...json, headers: res.headers };
}

before(async () => {
  assert.match(config.db.database, /_test$/, `เทสต์ใช้ได้เฉพาะฐานข้อมูลที่ชื่อลงท้าย _test (ตอนนี้: ${config.db.database}) — กันลบข้อมูลจริง`);
  await checkConnection();
  await resetDb(); // เริ่มจากฐานข้อมูลว่างเสมอ (ใช้ซ้ำกับ MariaDB/PostgreSQL ได้)
  await ensureAdmin();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(async () => {
  server.close();
  await closeDb();
});

describe('auth', () => {
  it('ยังไม่ล็อกอิน → 401', async () => {
    const r = await call('POST', '/hospital/options', {}, false);
    assert.equal(r.http, 401);
    assert.equal(r.status, 'UNAUTHORIZED');
  });

  it('รหัสผิด → 401', async () => {
    const r = await call('POST', '/auth/login', { username: config.admin.username, password: 'wrong' });
    assert.equal(r.http, 401);
  });

  it('ล็อกอินสำเร็จ ได้ cookie · ผู้ใช้คนแรกเป็น DEV', async () => {
    const r = await call('POST', '/auth/login', { username: config.admin.username, password: config.admin.password });
    assert.equal(r.http, 200);
    cookie = (r.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    assert.ok(cookie.startsWith('app_session='));
    assert.equal((await call('GET', '/auth/me')).data.role, 'DEV');
  });
});

describe('ผู้ใช้งาน + ลำดับสิทธิ์ STAFF < ADMIN < DEV', () => {
  let adminId = 0;
  let staffId = 0;
  let adminCookie = '';

  it('DEV สร้างผู้ดูแล (ADMIN) และเจ้าหน้าที่ (STAFF) ได้', async () => {
    const a = await call('POST', '/user/add', { username: 'Admin1', password: 'password123', full_name: 'ผู้ดูแล 1', role: 'ADMIN', is_active: 'Y' });
    assert.equal(a.http, 201);
    adminId = a.data.id;
    const s = await call('POST', '/user/add', { username: 'staff1', password: 'password123', full_name: 'เจ้าหน้าที่ 1', role: 'STAFF', is_active: 'Y' });
    assert.equal(s.http, 201);
    staffId = s.data.id;
    assert.equal((await call('POST', '/user/get', { id: adminId })).data.username, 'admin1'); // เปลี่ยนเป็นตัวพิมพ์เล็กให้
  });

  it('ชื่อผู้ใช้ซ้ำ → 409 / รหัสสั้นเกิน → 400', async () => {
    const dup = await call('POST', '/user/add', { username: 'staff1', password: 'password123', full_name: 'x', role: 'STAFF' });
    assert.equal(dup.http, 409);
    assert.ok(dup.fields?.username);
    const short = await call('POST', '/user/add', { username: 'newone', password: '123', full_name: 'x', role: 'STAFF' });
    assert.equal(short.http, 400);
    assert.ok(short.fields?.password);
  });

  it('ไม่ส่ง password_hash ออกมาใน API', async () => {
    const r = await call('POST', '/user/search', {});
    assert.ok(r.data.totalRow >= 3);
    assert.ok(!JSON.stringify(r.data).includes('password_hash'));
  });

  it('STAFF เข้าหน้าผู้ใช้/ตั้งค่า/log ไม่ได้ (403) แต่อ่านรายการ dropdown ได้', async () => {
    const r = await call('POST', '/auth/login', { username: 'staff1', password: 'password123' });
    assert.equal(r.http, 200);
    staffCookie = (r.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    assert.equal((await call('POST', '/user/search', {}, staffCookie)).http, 403);
    assert.equal((await call('POST', '/setting/save', { values: { queue_display: 'all' } }, staffCookie)).http, 403);
    assert.equal((await call('POST', '/log/search', {}, staffCookie)).http, 403);
    assert.equal((await call('POST', '/hospital/add', { code: '11111', name: 'x' }, staffCookie)).http, 403);
    assert.equal((await call('POST', '/lookup/search', {}, staffCookie)).http, 403);
    assert.equal((await call('POST', '/hospital/options', {}, staffCookie)).http, 200);
    assert.equal((await call('POST', '/lookup/options', {}, staffCookie)).http, 200);
    assert.equal((await call('POST', '/setting/ui', {}, staffCookie)).http, 200);
  });

  it('ADMIN จัดการ STAFF ได้ แต่สร้าง/แก้/ลบ DEV ไม่ได้ และแก้ role/ปิดตัวเองไม่ได้', async () => {
    const r = await call('POST', '/auth/login', { username: 'admin1', password: 'password123' });
    adminCookie = (r.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const devRow = await db('users').where({ username: config.admin.username }).first();
    const mk = await call('POST', '/user/add', { username: 'dev-try', password: 'password123', full_name: 'x', role: 'DEV' }, adminCookie);
    assert.equal(mk.http, 403);
    assert.equal((await call('POST', '/user/update', { id: devRow.id, full_name: 'แฮ็ก', role: 'DEV', is_active: 'Y' }, adminCookie)).http, 403);
    assert.equal((await call('POST', '/user/delete', { id: devRow.id }, adminCookie)).http, 403);
    assert.equal((await call('POST', '/user/reset-password', { id: devRow.id, new_password: 'hacked1234' }, adminCookie)).http, 403);
    assert.equal((await call('POST', '/user/update', { id: staffId, full_name: 'เจ้าหน้าที่ใหม่', role: 'STAFF', is_active: 'Y' }, adminCookie)).http, 200);
    assert.equal((await call('POST', '/user/update', { id: adminId, full_name: 'ผู้ดูแล 1', role: 'STAFF', is_active: 'Y' }, adminCookie)).http, 400);
    assert.equal((await call('POST', '/user/update', { id: adminId, full_name: 'ผู้ดูแล 1', role: 'ADMIN', is_active: 'N' }, adminCookie)).http, 400);
    assert.equal((await call('POST', '/user/delete', { id: adminId }, adminCookie)).http, 400);
  });

  it('รีเซ็ตรหัสผ่าน → ล็อกอินด้วยรหัสใหม่ได้ รหัสเก่าไม่ได้', async () => {
    assert.equal((await call('POST', '/user/reset-password', { id: staffId, new_password: 'newpass5678' }, adminCookie)).http, 200);
    assert.equal((await call('POST', '/auth/login', { username: 'staff1', password: 'password123' })).http, 401);
    assert.equal((await call('POST', '/auth/login', { username: 'staff1', password: 'newpass5678' })).http, 200);
  });

  it('บัญชีที่ปิดใช้งานแล้ว session เดิมใช้ต่อไม่ได้ทันที', async () => {
    assert.equal((await call('POST', '/user/update', { id: staffId, full_name: 'เจ้าหน้าที่ใหม่', role: 'STAFF', is_active: 'N' }, adminCookie)).http, 200);
    assert.equal((await call('POST', '/hospital/options', {}, staffCookie)).http, 401);
  });

  it('ลบผู้ใช้', async () => {
    assert.equal((await call('POST', '/user/delete', { id: staffId }, adminCookie)).http, 200);
    assert.equal((await call('POST', '/user/get', { id: staffId })).http, 404);
  });
});

describe('โรงพยาบาล (CRUD แบบ POST body)', () => {
  let id = 0;
  const body = { code: '11206', name: 'รพ.สงขลา', is_active: 'Y' };

  it('เพิ่ม', async () => {
    const r = await call('POST', '/hospital/add', body);
    assert.equal(r.http, 201);
    id = r.data.id;
  });

  it('รหัสซ้ำ → 409 · รหัสไม่ใช่ตัวเลข 5 หลัก → 400', async () => {
    const dup = await call('POST', '/hospital/add', body);
    assert.equal(dup.http, 409);
    assert.ok(dup.fields?.code);
    for (const code of ['1120', '112066', 'abcde', '']) {
      const r = await call('POST', '/hospital/add', { ...body, code });
      assert.equal(r.http, 400, `code=${code}`);
      assert.ok(r.fields?.code);
    }
  });

  it('search + options + get', async () => {
    await call('POST', '/hospital/add', { code: '14561', name: 'รพ.สทิงพระ' });
    assert.equal((await call('POST', '/hospital/search', {})).data.totalRow, 2);
    assert.equal((await call('POST', '/hospital/search', { q: 'สทิง' })).data.totalRow, 1);
    assert.equal((await call('POST', '/hospital/search', { q: '11206' })).data.resultList[0].name, 'รพ.สงขลา');
    assert.equal((await call('POST', '/hospital/options', {})).data.length, 2);
    assert.equal((await call('POST', '/hospital/get', { id })).data.code, '11206');
    assert.equal((await call('POST', '/hospital/get', {})).http, 400);
  });

  it('แก้ไข (ชนรหัสคนอื่นไม่ได้) และ findOrCreate ไม่ทับชื่อเดิม', async () => {
    assert.equal((await call('POST', '/hospital/update', { id, code: '11206', name: 'รพ.สงขลา (แก้)', is_active: 'Y' })).http, 200);
    assert.equal((await call('POST', '/hospital/update', { id, code: '14561', name: 'x', is_active: 'Y' })).http, 409);
    const { hospitalService } = await import('../src/pages/hospital');
    assert.equal(await hospitalService.findOrCreate('11206', 'ชื่ออื่น'), id);
    assert.equal((await call('POST', '/hospital/get', { id })).data.name, 'รพ.สงขลา (แก้)');
    const created = await hospitalService.findOrCreate('99999', 'รพ.ใหม่');
    assert.ok(created > id);
  });

  it('ปิดใช้งานแล้วไม่อยู่ใน options · ลบไม่ได้ถ้ามีคำขอผูกอยู่ · ไม่มี API รับ id ทาง URL', async () => {
    await call('POST', '/hospital/update', { id, code: '11206', name: 'รพ.สงขลา', is_active: 'N' });
    assert.equal((await call('POST', '/hospital/options', {})).data.length, 2); // เหลือ 14561 + 99999
    const now = new Date().toISOString();
    await db('bed_request').insert({ hospital_id: id, requester_name: 'ทดสอบ', patient_name: 'ผู้ป่วย', status: 'WAITING', submitted_at: now, created_at: now, updated_at: now });
    assert.equal((await call('POST', '/hospital/delete', { id })).http, 409);
    assert.equal((await call('GET', `/hospital/${id}`)).http, 404);
    assert.equal((await call('GET', '/hospital?q=11206')).http, 404);
    await db('bed_request').where({ hospital_id: id }).delete();
    assert.equal((await call('POST', '/hospital/delete', { id })).http, 200);
    assert.equal((await call('POST', '/hospital/get', { id })).http, 404);
  });
});

describe('ข้อมูลหลัก (lookup)', () => {
  it('มีข้อมูลตั้งต้น: สี 4 ระดับ เรียงตามลำดับ · สารเสพติด · เหตุผล', async () => {
    const r = await call('POST', '/lookup/options', {});
    assert.deepEqual(r.data.COLOR.map((c: any) => c.label), ['แดง', 'ส้ม', 'เหลือง', 'เขียว']);
    assert.ok(r.data.COLOR.every((c: any) => /^#[0-9A-Fa-f]{6}$/.test(c.color)));
    const sub = r.data.SUBSTANCE.map((c: any) => c.label);
    for (const need of ['ยาบ้า', 'ไอซ์', 'สุรา', 'กระท่อม']) assert.ok(sub.includes(need), need);
    assert.ok(r.data.REASON.length >= 3);
  });

  let id = 0;
  it('เพิ่มสารเสพติดใหม่ · รหัสซ้ำในประเภทเดียวกันไม่ได้ แต่ข้ามประเภทได้', async () => {
    const r = await call('POST', '/lookup/add', { type: 'SUBSTANCE', code: 'cannabis', label: 'กัญชา', sort_order: 5 });
    assert.equal(r.http, 201);
    id = r.data.id;
    assert.equal((await call('POST', '/lookup/get', { id })).data.code, 'CANNABIS'); // แปลงเป็นตัวพิมพ์ใหญ่
    assert.equal((await call('POST', '/lookup/add', { type: 'SUBSTANCE', code: 'CANNABIS', label: 'ซ้ำ' })).http, 409);
    assert.equal((await call('POST', '/lookup/add', { type: 'REASON', code: 'CANNABIS', label: 'ข้ามประเภท' })).http, 201);
  });

  it('สีต้องมี #RRGGBB · type/code ผิดรูปแบบ → 400', async () => {
    assert.equal((await call('POST', '/lookup/add', { type: 'COLOR', code: 'BLUE', label: 'น้ำเงิน' })).http, 400);
    assert.equal((await call('POST', '/lookup/add', { type: 'COLOR', code: 'BLUE', label: 'น้ำเงิน', color: 'blue' })).http, 400);
    assert.equal((await call('POST', '/lookup/add', { type: 'COLOR', code: 'BLUE', label: 'น้ำเงิน', color: '#2563EB' })).http, 201);
    assert.equal((await call('POST', '/lookup/add', { type: 'NOPE', code: 'A', label: 'x' })).http, 400);
    assert.equal((await call('POST', '/lookup/add', { type: 'REASON', code: 'ก ข', label: 'x' })).http, 400);
  });

  it('แก้ไขได้เฉพาะชื่อ/สี/ลำดับ/เปิด-ปิด (code และ type คงเดิม) · search กรองตามประเภท', async () => {
    assert.equal((await call('POST', '/lookup/update', { id, label: 'กัญชา (แก้)', sort_order: 6, is_active: 'N', code: 'HACK', type: 'COLOR' })).http, 200);
    const row = (await call('POST', '/lookup/get', { id })).data;
    assert.equal(row.label, 'กัญชา (แก้)');
    assert.equal(row.code, 'CANNABIS');
    assert.equal(row.type, 'SUBSTANCE');
    assert.equal(row.is_active, false);
    const only = await call('POST', '/lookup/search', { type: 'COLOR' });
    assert.ok(only.data.resultList.every((x: any) => x.type === 'COLOR'));
  });

  it('ลบไม่ได้ถ้ามีคำขอใช้อยู่ (ให้ปิดใช้งานแทน) · ลบได้เมื่อไม่มีการใช้', async () => {
    const hospital = (await db('hospital').first()).id;
    const now = new Date().toISOString();
    await db('bed_request').insert({ hospital_id: hospital, requester_name: 'ทดสอบ', patient_name: 'ผู้ป่วย', substance_code: 'CANNABIS', status: 'WAITING', submitted_at: now, created_at: now, updated_at: now });
    assert.equal((await call('POST', '/lookup/delete', { id })).http, 409);
    await db('bed_request').where({ substance_code: 'CANNABIS' }).delete();
    assert.equal((await call('POST', '/lookup/delete', { id })).http, 200);
  });

  it('resolveLabel: จับคู่ชื่อ (ไม่สนช่องว่าง/ตัวพิมพ์) และสร้างค่าใหม่เมื่ออนุญาต', async () => {
    const { lookupService } = await import('../src/pages/lookup');
    assert.equal(await lookupService.resolveLabel('SUBSTANCE', ' ยา บ้า ', false), 'METH');
    assert.equal(await lookupService.resolveLabel('COLOR', 'purple', false), null);
    const code = await lookupService.resolveLabel('COLOR', 'ม่วง', true);
    assert.ok(code);
    assert.equal(await lookupService.resolveLabel('COLOR', 'ม่วง', true), code); // ครั้งที่สองใช้ของเดิม ไม่สร้างซ้ำ
    assert.equal(await lookupService.resolveLabel('COLOR', '   ', true), null);
  });
});

describe('ตั้งค่าระบบ (เก็บใน DB · ค่าลับเข้ารหัส)', () => {
  it('มีค่าเริ่มต้นให้ทุกค่า', async () => {
    const ui = (await call('POST', '/setting/ui', {})).data;
    assert.equal(ui.confirm_timeout_hours, 24);
    assert.equal(ui.queue_display, 'both');
    assert.ok(Array.isArray(ui.dashboard_widgets) && ui.dashboard_widgets.includes('summary'));
  });

  it('บันทึกค่าปกติ · ค่านอกช่วง/ไม่อยู่ในตัวเลือก → 400', async () => {
    assert.equal((await call('POST', '/setting/save', { values: { confirm_timeout_hours: 48, queue_display: 'color' } })).http, 200);
    const ui = (await call('POST', '/setting/ui', {})).data;
    assert.equal(ui.confirm_timeout_hours, 48);
    assert.equal(ui.queue_display, 'color');
    assert.equal((await call('POST', '/setting/save', { values: { confirm_timeout_hours: 0 } })).http, 400);
    assert.equal((await call('POST', '/setting/save', { values: { queue_display: 'xxx' } })).http, 400);
    assert.equal((await call('POST', '/setting/save', { values: { no_such_key: 1 } })).http, 400);
  });

  it('ค่าลับ: เก็บเข้ารหัสในฐานข้อมูล · ไม่ส่งค่าจริงกลับมา · เว้นว่าง = ใช้ค่าเดิม', async () => {
    const secret = 'channel-secret-ABC123';
    assert.equal((await call('POST', '/setting/save', { values: { line_channel_secret: secret } })).http, 200);
    const raw = await db('app_setting').where({ key: 'line_channel_secret' }).first();
    assert.ok(raw.value.startsWith('v1:') && !raw.value.includes(secret));
    const { getSetting } = await import('../src/core/settings');
    assert.equal(await getSetting('line_channel_secret'), secret);
    const list = await call('POST', '/setting/list', {});
    assert.ok(!JSON.stringify(list.data).includes(secret));
    assert.equal((await call('POST', '/setting/save', { values: { line_channel_secret: '' } })).http, 200);
    assert.equal(await getSetting('line_channel_secret'), secret);
  });

  it('ADMIN เห็น/แก้ค่าเชื่อมต่อ LINE (DEV เท่านั้น) ไม่ได้', async () => {
    const r = await call('POST', '/auth/login', { username: 'admin1', password: 'password123' });
    const ac = (r.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const list = await call('POST', '/setting/list', {}, ac);
    assert.equal(list.http, 200);
    assert.ok(!list.data.some((s: any) => s.key === 'line_channel_token' || s.key === 'connection_mode'));
    assert.ok(list.data.some((s: any) => s.key === 'confirm_timeout_hours'));
    assert.equal((await call('POST', '/setting/save', { values: { connection_mode: 'PRODUCTION' } }, ac)).http, 403);
  });
});

describe('crypto', () => {
  it('encrypt/decrypt ได้ค่าเดิม · ข้อความเดียวกันเข้ารหัสแล้วไม่เหมือนกัน · ถูกแก้ไขแล้วถอดไม่ได้', async () => {
    const { encrypt, decrypt } = await import('../src/core/crypto');
    const a = encrypt('สวัสดี token');
    assert.equal(decrypt(a), 'สวัสดี token');
    assert.notEqual(a, encrypt('สวัสดี token'));
    const parts = a.split(':');
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith('00') ? '11' : '00');
    assert.equal(decrypt(parts.join(':')), ''); // ข้อมูลถูกแก้ → ถอดได้ค่าว่าง (ไม่ใช่ค่าเพี้ยน)
  });
});

describe('ช่องเบอร์โทร (รองรับเบอร์ต่อ / เบอร์สำรอง)', () => {
  it('รับเบอร์มือถือ เบอร์สำนักงานที่มี "ต่อ" และเว้นว่างได้ · ปฏิเสธข้อความมั่ว', async () => {
    const { phoneText, phoneRequired } = await import('../src/core/phone');
    const p = phoneText();
    for (const ok of ['0812345678', '081-234-5678', '0243535646 ต่อ 1275', '0243535646ต่อ1275', '02-353-5646 ext.12', '074-123456, 074-654321', '']) {
      assert.equal(p.safeParse(ok).success, true, ok);
    }
    for (const bad of ['123', 'abcdefghij', '0812345678 <script>']) assert.equal(p.safeParse(bad).success, false, bad);
    assert.equal(p.parse('  0243535646   ต่อ   1275 '), '0243535646 ต่อ 1275');
    assert.equal(phoneRequired().safeParse('').success, false);
  });
});

describe('dashboard (สรุปตัวเลข)', () => {
  const NOW = new Date('2026-10-14T05:00:00.000Z');
  const ago = (d: number, h = 0) => new Date(NOW.getTime() - d * 86_400_000 - h * 3_600_000).toISOString();
  let h1 = 0;
  let h2 = 0;

  it('คำนวณคิว/ผลลัพธ์/แนวโน้ม/โรงพยาบาล/สารเสพติดถูกต้อง', async () => {
    assert.equal((await call('POST', '/setting/save', { values: { confirm_timeout_hours: 24 } })).http, 200); // ตั้งให้แน่นอน (เทสต์ก่อนหน้าแก้ไว้)
    await db('bed_request').delete();
    h1 = (await db('hospital').where({ code: '14561' }).first()).id;
    h2 = (await db('hospital').where({ code: '99999' }).first()).id;
    const row = (o: Record<string, unknown>) => ({ requester_name: 'ทดสอบ', patient_name: 'ผู้ป่วย', created_at: ago(0), updated_at: ago(0), ...o });
    await db('bed_request').insert([
      row({ hospital_id: h1, color_code: 'RED', substance_code: 'METH', status: 'WAITING', submitted_at: ago(3) }),
      row({ hospital_id: h1, color_code: 'RED', substance_code: 'ICE', status: 'WAITING', submitted_at: ago(1) }),
      row({ hospital_id: h2, color_code: 'GREEN', substance_code: 'METH', status: 'WAITING', submitted_at: ago(2) }),
      row({ hospital_id: h2, color_code: 'YELLOW', substance_code: 'ALCOHOL', status: 'CALLED', submitted_at: ago(5), called_at: ago(0, 30) }), // เกิน 24 ชม.
      row({ hospital_id: h1, color_code: 'YELLOW', substance_code: 'METH', status: 'CALLED', submitted_at: ago(2), called_at: ago(0, 2) }), // ยังไม่เกิน
      row({ hospital_id: h1, color_code: 'RED', substance_code: 'METH', status: 'CONFIRMED', submitted_at: ago(6), resolved_at: ago(4) }), // 2 วัน
      row({ hospital_id: h1, color_code: 'GREEN', substance_code: 'METH', status: 'CONFIRMED', submitted_at: ago(5), resolved_at: ago(1) }), // 4 วัน
      row({ hospital_id: h2, color_code: 'GREEN', substance_code: 'ALCOHOL', status: 'CONFIRMED', submitted_at: ago(4), resolved_at: ago(3) }), // 1 วัน
      row({ hospital_id: h2, color_code: 'GREEN', substance_code: 'ICE', status: 'DECLINED', submitted_at: ago(7), resolved_at: ago(6) }),
      row({ hospital_id: h1, color_code: 'GREEN', substance_code: 'ICE', status: 'CANCELLED', submitted_at: ago(8), resolved_at: ago(6) }),
      row({ hospital_id: h1, color_code: 'RED', substance_code: 'METH', status: 'CONFIRMED', submitted_at: ago(60), resolved_at: ago(58) }), // นอกช่วง 30 วัน
    ]);
    const { dashboardService } = await import('../src/pages/dashboard');
    const s = await dashboardService.summary({ days: 30 }, NOW);

    assert.deepEqual([s.queue.waiting, s.queue.called, s.queue.overdue], [3, 2, 1]);
    const red = s.queue.by_color.find((c) => c.code === 'RED')!;
    assert.equal(red.count, 2);
    assert.equal(red.oldest_days, 3); // รอนานสุด 3 วัน
    assert.equal(s.queue.by_color.find((c) => c.code === 'GREEN')!.count, 1);

    assert.equal(s.period.submitted, 10); // ไม่รวมแถวที่ส่งเมื่อ 60 วันก่อน
    assert.deepEqual([s.period.confirmed, s.period.declined, s.period.cancelled], [3, 1, 1]);
    assert.equal(s.period.avg_days_to_confirm, 2.3); // (2+4+1)/3
    assert.equal(s.period.min_days_to_confirm, 1);
    assert.equal(s.period.max_days_to_confirm, 4);

    assert.equal(s.trend.length, 30);
    assert.equal(s.trend.reduce((a, t) => a + t.submitted, 0), 10);
    assert.equal(s.trend.reduce((a, t) => a + t.confirmed, 0), 3);
    assert.equal(s.trend.at(-1)!.date, '2026-10-14');

    assert.equal(s.hospitals[0]!.hospital_id, h1); // h1 มี 6 รายการในช่วง, h2 มี 4 (ไม่เสมอกัน)
    assert.equal(s.hospitals[0]!.total, 6);
    assert.equal(s.hospitals[0]!.name, 'รพ.สทิงพระ');
    assert.equal(s.hospitals[0]!.by_color.RED, 3);

    const meth = s.substances.find((x) => x.code === 'METH')!;
    assert.deepEqual([meth.confirmed, meth.avg_days, meth.min_days, meth.max_days], [2, 3, 2, 4]);
    assert.equal(s.substances.find((x) => x.code === 'ALCOHOL')!.avg_days, 1);

    const week = await dashboardService.summary({ days: 7 }, NOW);
    assert.equal(week.trend.length, 7);
    assert.equal(week.period.submitted, 9); // ส่งภายใน 7 วัน (ขอบ 7 วันพอดีนับรวม · ago 8 และ ago 60 ตกช่วง)
  });

  it('API: STAFF เรียกได้ · ช่วงเวลาผิด → 400 · ไม่ส่ง days ใช้ค่าตั้งค่า', async () => {
    const r = await call('POST', '/dashboard/summary', {});
    assert.equal(r.http, 200);
    assert.equal(r.data.days, 30); // ค่าเริ่มต้น dashboard_default_days
    assert.ok(Array.isArray(r.data.trend) && r.data.trend.length === r.data.days);
    assert.equal((await call('POST', '/dashboard/summary', { days: 0 })).http, 400);
    assert.equal((await call('POST', '/dashboard/summary', { days: 99999 })).http, 400);
    assert.equal((await call('POST', '/dashboard/summary', {}, false)).http, 401);
    await db('bed_request').delete();
  });
});

describe('migration ของตารางคำขอ', () => {
  it('ตารางครบ และ import_key ซ้ำไม่ได้ (กันนำเข้าซ้ำ)', async () => {
    assert.ok(await db.schema.hasColumn('requester', 'phone2'));
    for (const t of ['requester', 'bed_request', 'request_event', 'referral', 'import_batch', 'line_message_log']) {
      assert.ok(await db.schema.hasTable(t), t);
    }
    const hospital = (await db('hospital').first()).id;
    const now = new Date().toISOString();
    const row = { hospital_id: hospital, requester_name: 'a', patient_name: 'b', import_key: 'K1', status: 'WAITING', submitted_at: now, created_at: now, updated_at: now };
    await db('bed_request').insert(row);
    await assert.rejects(() => db('bed_request').insert(row));
    await db('bed_request').where({ import_key: 'K1' }).delete();
  });
});

describe('audit อัตโนมัติ', () => {
  it('บันทึก add/update/delete พร้อมชื่อผู้ใช้ ไม่บันทึก search/options และไม่เก็บรหัสผ่าน/ค่าลับ', async () => {
    await new Promise((r) => setTimeout(r, 150)); // audit เขียนหลังตอบเสร็จ
    const rows = await db('audit_logs').where({ page: 'hospital' }).orderBy('id');
    assert.ok(rows.some((r) => r.action === 'ADD') && rows.some((r) => r.action === 'UPDATE') && rows.some((r) => r.action === 'DELETE'));
    assert.ok(rows.every((r) => r.action !== 'SEARCH'));
    assert.ok(rows.filter((r) => r.status_code !== 404).every((r) => !/\/\d+$/.test(r.path))); // path ของ API จริงไม่มี id
    const all = JSON.stringify(await db('audit_logs').select('*'));
    for (const secret of [config.admin.password, 'password123', 'newpass5678', 'channel-secret-ABC123']) {
      assert.ok(!all.includes(secret), `audit รั่ว: ${secret}`);
    }
    assert.ok((await db('audit_logs').where({ page: 'auth', action: 'LOGIN' })).length >= 3);
  });

  it('หน้า log อ่านได้ (ADMIN ขึ้นไป) และกรองตามหน้า/การกระทำได้', async () => {
    const r = await call('POST', '/log/search', { page: 'hospital', action: 'ADD' });
    assert.equal(r.http, 200);
    assert.ok(r.data.totalRow >= 2);
  });
});
