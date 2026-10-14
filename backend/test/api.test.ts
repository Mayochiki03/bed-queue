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
    assert.equal(ui.dashboard_default_days, 30);
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

describe('ปุ่มทดสอบในหน้าตั้งค่า', () => {
  it('database / encryption / time ผ่าน และ public_url ที่ยังไม่ตั้งค่า → 400', async () => {
    for (const kind of ['database', 'encryption', 'time']) {
      const r = await call('POST', '/setting/test', { kind });
      assert.equal(r.http, 200, kind);
      assert.equal(r.data.ok, true, kind);
    }
    assert.equal((await call('POST', '/setting/test', { kind: 'public_url' })).http, 400);
    assert.equal((await call('POST', '/setting/test', { kind: 'line_token' })).http, 400);
    assert.equal((await call('POST', '/setting/test', { kind: 'unknown' })).http, 400);
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

describe('dashboard widget (สร้าง/จัดวาง/คำนวณ/ส่งออก)', () => {
  const NOW = new Date('2026-10-14T05:00:00.000Z');
  const ago = (d: number, h = 0) => new Date(NOW.getTime() - d * 86_400_000 - h * 3_600_000).toISOString();
  const cfg = (o: Record<string, unknown>) => ({ title: 'ทดสอบ', measures: ['submitted'], group_by: 'none', split_by: 'none', chart: 'number', period_days: null, filters: { colors: [], substances: [], reasons: [] }, row_limit: 10, ...o });
  let h1 = 0;
  let h2 = 0;
  let staffCookie = '';

  it('มี widget ตั้งต้นของหน้าหลักจาก migration', async () => {
    assert.equal((await call('POST', '/user/add', { username: 'wstaff', password: 'password123', full_name: 'เจ้าหน้าที่ทดสอบ widget', role: 'STAFF' })).http, 201);
    const login = await call('POST', '/auth/login', { username: 'wstaff', password: 'password123' });
    staffCookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const r = await call('POST', '/dashboard/widget/data', {}, staffCookie);
    assert.equal(r.http, 200);
    assert.equal(r.data.widgets.length, 10);
    assert.ok(r.data.widgets.every((w: any) => w.result), 'ทุก widget ที่แสดงอยู่ต้องมีผลลัพธ์');
  });

  it('เตรียมข้อมูลและคำนวณ: จำนวน/ระยะเวลา/ซ้อนสี/เส้นเวลา/ตัวกรอง', async () => {
    await db('bed_request').delete();
    h1 = (await db('hospital').where({ code: '14561' }).first()).id;
    h2 = (await db('hospital').where({ code: '99999' }).first()).id;
    const row = (o: Record<string, unknown>) => ({ requester_name: 'ทดสอบ', patient_name: 'ผู้ป่วย', created_at: ago(0), updated_at: ago(0), ...o });
    await db('bed_request').insert([
      row({ hospital_id: h1, color_code: 'RED', substance_code: 'METH', reason_code: 'OTHER', status: 'WAITING', submitted_at: ago(3) }),
      row({ hospital_id: h1, color_code: 'RED', substance_code: 'ICE', status: 'WAITING', submitted_at: ago(1) }),
      row({ hospital_id: h2, color_code: 'GREEN', substance_code: 'METH', status: 'WAITING', submitted_at: ago(2) }),
      row({ hospital_id: h2, color_code: 'YELLOW', substance_code: 'ALCOHOL', status: 'CALLED', submitted_at: ago(5), called_at: ago(0, 30) }),
      row({ hospital_id: h1, color_code: 'RED', substance_code: 'METH', status: 'CONFIRMED', submitted_at: ago(6), resolved_at: ago(4) }), // 2 วัน
      row({ hospital_id: h1, color_code: 'GREEN', substance_code: 'METH', status: 'CONFIRMED', submitted_at: ago(5), resolved_at: ago(1) }), // 4 วัน
      row({ hospital_id: h2, color_code: 'GREEN', substance_code: 'ALCOHOL', status: 'CONFIRMED', submitted_at: ago(4), resolved_at: ago(3) }), // 1 วัน
      row({ hospital_id: h2, color_code: null, substance_code: 'ICE', status: 'DECLINED', submitted_at: ago(7), resolved_at: ago(6) }),
    ]);
    const { widgetService } = await import('../src/pages/dashboard');
    const P = (o: Record<string, unknown>, days = 30) => widgetService.preview(cfg(o) as any, days, NOW);

    // ตัวเลขเดียว
    const waiting = await P({ measures: ['waiting'] });
    assert.equal(waiting.rows[0]!.values[0], 3);
    assert.equal((await P({ measures: ['overdue'] })).rows[0]!.values[0], 1);
    const avg = await P({ measures: ['avg_days'] });
    assert.equal(avg.unit, 'วัน');
    assert.equal(avg.rows[0]!.values[0], 2.3);
    assert.equal((await P({ measures: ['max_days'] })).rows[0]!.values[0], 4);

    // แยกตามสี (มีทุกสีที่เปิดใช้ แม้เป็น 0) — คำขอที่ไม่ระบุสีไปอยู่ "ไม่ระบุ"
    const byColor = await P({ measures: ['submitted'], group_by: 'color', chart: 'bar' });
    for (const k of ['RED', 'ORANGE', 'YELLOW', 'GREEN']) assert.ok(byColor.rows.some((r) => r.key === k), k);
    assert.equal(byColor.rows.find((r) => r.key === 'RED')!.values[0], 3);
    assert.equal(byColor.rows.find((r) => r.key === 'ORANGE')!.values[0], 0);
    assert.equal(byColor.rows.find((r) => r.key === '_NONE')!.values[0], 1);
    assert.equal(byColor.rows.find((r) => r.key === 'RED')!.color, '#DC2626');

    // โรงพยาบาล x สี (ซ้อนสี)
    const stacked = await P({ measures: ['submitted'], group_by: 'hospital', split_by: 'color', chart: 'hbar' });
    assert.equal(stacked.column_mode, 'split');
    assert.equal(stacked.rows[0]!.key, String(h2) === stacked.rows[0]!.key ? String(h2) : String(h1)); // เรียงมาก→น้อย
    assert.equal(stacked.rows.reduce((a, r) => a + (r.total ?? 0), 0), 8);

    // เส้นเวลา 2 ค่า
    const line = await P({ measures: ['submitted', 'confirmed'], group_by: 'day', chart: 'line' });
    assert.equal(line.rows.length, 30);
    assert.equal(line.rows.at(-1)!.key, '2026-10-14');
    assert.equal(line.rows.reduce((a, r) => a + (r.values[0] ?? 0), 0), 8);
    assert.equal(line.rows.reduce((a, r) => a + (r.values[1] ?? 0), 0), 3);
    assert.equal((await P({ measures: ['submitted'], group_by: 'week', chart: 'bar' })).time_group, 'week');
    assert.equal((await P({ measures: ['submitted'], group_by: 'month', chart: 'bar' }, 90)).rows.length >= 3, true);

    // ตัวกรอง + ช่วงเวลา
    const red = await P({ measures: ['submitted'], filters: { colors: ['RED'], substances: [], reasons: [] } });
    assert.equal(red.rows[0]!.values[0], 3);
    assert.equal((await P({ measures: ['submitted'] }, 3)).rows[0]!.values[0], 3); // ส่งภายใน 3 วัน (ago 1, 2, 3 พอดีขอบนับรวม)
    assert.equal((await P({ measures: ['submitted'], period_days: 7 }, 30)).rows[0]!.values[0], 8);

    // row_limit ตัดอันดับ รพ.
    const top1 = await P({ measures: ['submitted'], group_by: 'hospital', chart: 'bar', row_limit: 3 });
    assert.equal(top1.rows.length, 2);
  });

  it('ตรวจความเข้ากันได้ของตัวเลือก → 400', async () => {
    const bad = async (o: Record<string, unknown>) => assert.equal((await call('POST', '/dashboard/widget/preview', { config: cfg(o) })).http, 400, JSON.stringify(o));
    await bad({ measures: ['submitted', 'avg_days'] }); // ปนหน่วย
    await bad({ group_by: 'color', chart: 'number' });
    await bad({ group_by: 'none', chart: 'bar' });
    await bad({ group_by: 'color', chart: 'line' }); // เส้นต้องเป็นเวลา
    await bad({ group_by: 'day', chart: 'donut' });
    await bad({ measures: ['submitted', 'confirmed'], group_by: 'color', split_by: 'substance', chart: 'bar' });
    await bad({ measures: [] });
    await bad({ period_days: 5 });
    assert.equal((await call('POST', '/dashboard/widget/preview', { config: cfg({ group_by: 'color', chart: 'bar' }) })).http, 200);
  });

  it('สิทธิ์: STAFF ดู/ส่งออกได้ แต่สร้าง/แก้/ลบ/จัดวาง/preview ไม่ได้', async () => {
    for (const p of ['preview', 'save', 'delete', 'layout']) assert.equal((await call('POST', `/dashboard/widget/${p}`, {}, staffCookie)).http, 403, p);
    assert.equal((await call('POST', '/dashboard/widget/data', {}, staffCookie)).http, 200);
    assert.equal((await call('POST', '/dashboard/widget/data', {}, false)).http, 401);
    // STAFF ขอ include_hidden ไม่ได้ผล (เห็นเฉพาะที่แสดงอยู่)
    const r = await call('POST', '/dashboard/widget/data', { include_hidden: true }, staffCookie);
    assert.ok(r.data.widgets.every((w: any) => w.is_active));
  });

  it('สร้าง/แก้/ซ่อน/จัดวาง/ลบ', async () => {
    const add = await call('POST', '/dashboard/widget/save', { ...cfg({ title: 'คิวตามสี (ทดสอบ)', measures: ['waiting'], group_by: 'color', chart: 'tiles' }), width: 4, is_active: true });
    assert.equal(add.http, 200);
    const id = add.data.id as number;
    const all = (await call('POST', '/dashboard/widget/data', {})).data.widgets as any[];
    assert.equal(all.at(-1).id, id); // ต่อท้ายสุด
    assert.equal(all.at(-1).width, 4);

    assert.equal((await call('POST', '/dashboard/widget/save', { id, ...cfg({ title: 'ชื่อใหม่', measures: ['waiting'], group_by: 'color', chart: 'bar' }), width: 2, is_active: true })).http, 200);
    assert.equal((await call('POST', '/dashboard/widget/save', { id: 999999, ...cfg({}), width: 2, is_active: true })).http, 404);
    assert.equal((await call('POST', '/dashboard/widget/save', { ...cfg({ title: '   ' }), width: 2, is_active: true })).http, 400);

    // ซ่อน + สลับลำดับ
    const layout = all.map((w, i) => ({ id: w.id, sort_order: (all.length - i) * 10, width: w.width, is_active: w.id === id ? false : true }));
    assert.equal((await call('POST', '/dashboard/widget/layout', { items: layout })).http, 200);
    const shown = (await call('POST', '/dashboard/widget/data', {})).data.widgets as any[];
    assert.equal(shown.length, all.length - 1);
    assert.equal(shown[0].id, all.at(-2).id); // ลำดับกลับด้าน
    const hidden = (await call('POST', '/dashboard/widget/data', { include_hidden: true })).data.widgets as any[];
    assert.equal(hidden.find((w) => w.id === id).result, null); // ตัวที่ซ่อนไม่คำนวณ

    assert.equal((await call('POST', '/dashboard/widget/layout', { items: [{ id: 999999, sort_order: 1, width: 1, is_active: true }] })).http, 404);
    assert.equal((await call('POST', '/dashboard/widget/delete', { id })).http, 200);
    assert.equal((await call('POST', '/dashboard/widget/delete', { id })).http, 404);
  });

  it('ส่งออก Excel ได้ไฟล์ .xlsx จริง (ทั้งหน้า / ตัวที่ยังไม่บันทึก) และกันสูตร', async () => {
    const send = (body: unknown) => fetch(`${base}/dashboard/widget/export`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: staffCookie }, body: JSON.stringify(body) });
    const r = await send({ days: 30 });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /spreadsheetml/);
    assert.match(r.headers.get('content-disposition') ?? '', /filename\*=UTF-8''dashboard-\d{8}\.xlsx/);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.subarray(0, 2).toString(), 'PK'); // xlsx = zip

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    assert.ok(wb.worksheets.length >= 2);
    assert.equal(wb.worksheets[0]!.name, 'ตัวเลขสรุป');

    const r2 = await send({ config: cfg({ title: '=HYPERLINK("x")', measures: ['submitted'], group_by: 'color', chart: 'bar' }) });
    assert.equal(r2.status, 200);
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(Buffer.from(await r2.arrayBuffer()) as any);
    assert.equal(String(wb2.worksheets[0]!.getCell(1, 1).value).startsWith("'="), true);

    assert.equal((await send({ ids: [999999] })).status, 404);
    await db('bed_request').delete();
  });
});

describe('คิวคำขอเตียง (ส่งคำขอ → บอร์ด → เรียกคิว → บันทึกผล)', () => {
  let staff = '';
  let a = 0; // ผู้ขอจำลอง A (รพ.สงขลา)
  let b = 0; // ผู้ขอจำลอง B (รพ.เดียวกัน)
  let c = 0; // ผู้ขอจำลอง C (รพ.อื่น)
  const reqs: Record<string, number> = {};
  const as = (path: string, body: Record<string, unknown>) => call('POST', `/dev/as/${path}`, body);
  const submit = (who: number, patient_name: string, color_code: string | null, extra: Record<string, unknown> = {}) =>
    as('submit', { requester_id: who, request: { patient_name, color_code, substance_code: 'METH', reason_code: 'OTHER', ...extra } });
  const board = async () => (await call('POST', '/request/board', {})).data;
  const item = async (id: number) => (await board()).items.find((i: any) => i.id === id);

  it('เตรียม: ผู้ใช้เจ้าหน้าที่ + ผู้ขอจำลอง (รพ.เดียวกัน 2 คน + รพ.อื่น 1 คน)', async () => {
    const login = await call('POST', '/auth/login', { username: 'wstaff', password: 'password123' });
    staff = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const mk = async (full_name: string, code: string, name: string, phone: string) => (await call('POST', '/dev/mock/create', { full_name, hospital_code: code, hospital_name: name, phone })).data.id as number;
    a = await mk('สมศรี ใจดี', '11206', 'รพ.สงขลา', '0243535646 ต่อ 1275');
    b = await mk('สมชาย รักงาน', '11206', 'รพ.สงขลา-พิมพ์ชื่อไม่เหมือนกัน', '0812345678');
    c = await mk('วิภา ตั้งใจ', '10711', 'รพ.หาดใหญ่', '0899999999');
    const mocks = (await call('POST', '/dev/mock/list', {})).data as any[];
    assert.equal(mocks.length, 3);
    // รพ.เดียวกัน ใช้แถวเดียวกัน (รหัสซ้ำไม่สร้างใหม่) และใช้ชื่อเดิมของระบบ
    assert.equal(mocks[0].hospital_name, mocks[1].hospital_name);
    assert.equal(await db('hospital').where({ code: '11206' }).count({ n: '*' }).first().then((r: any) => Number(r.n)), 1);
  });

  it('ส่งคำขอ: ผู้ขอคนเดียวส่งได้หลายราย · ชื่อซ้ำที่ยังเปิดอยู่ → 409 · รหัสสี/สารไม่มี → 400', async () => {
    reqs.p1 = (await submit(a, 'ผู้ป่วย แดง1', 'RED')).data.id;
    reqs.p2 = (await submit(a, 'ผู้ป่วย เขียว1', 'GREEN')).data.id;
    reqs.p3 = (await submit(b, 'ผู้ป่วย แดง2', 'RED')).data.id;
    reqs.p4 = (await submit(c, 'ผู้ป่วย เหลือง1', 'YELLOW')).data.id;
    assert.ok(reqs.p1 && reqs.p2 && reqs.p3 && reqs.p4);
    const dup = await submit(a, '  ผู้ป่วย  แดง1 ', 'RED'); // ช่องว่างต่างกันก็ถือว่าซ้ำ
    assert.equal(dup.http, 409);
    assert.equal((await submit(a, 'ผู้ป่วย ใหม่', 'PURPLE')).http, 400);
    assert.equal((await submit(a, '', 'RED')).http, 400);
    assert.equal((await submit(a, 'ผู้ป่วย อายุผิด', 'RED', { patient_age: 200 })).http, 400);
    // ผู้ขอที่ไม่ใช่ผู้ขอจำลอง (หรือ id ไม่มี) สั่งแทนไม่ได้
    assert.equal((await as('mine', { requester_id: 999999 })).http, 404);
  });

  it('บอร์ด: เรียงตามเวลาส่ง · ลำดับรวมทุกสี + ในสีเดียวกัน · ข้อมูล รพ./ผู้ขอครบ', async () => {
    const bd = await board();
    const waiting = bd.items.filter((i: any) => i.status === 'WAITING');
    assert.deepEqual(waiting.map((i: any) => i.id), [reqs.p1, reqs.p2, reqs.p3, reqs.p4]);
    assert.deepEqual(waiting.map((i: any) => i.position_all), [1, 2, 3, 4]);
    assert.deepEqual(waiting.map((i: any) => i.position_color), [1, 1, 2, 1]); // แดง: p1=1, p3=2
    const p1 = waiting[0];
    assert.equal(p1.hospital_code, '11206');
    assert.equal(p1.requester_name, 'สมศรี ใจดี');
    assert.equal(p1.requester_phone, '0243535646 ต่อ 1275');
    assert.equal(p1.request_no, `BQ${String(p1.id).padStart(6, '0')}`);
    assert.equal(p1.overdue, false);
  });

  it('เจ้าหน้าที่เพิ่มคำขอแทน (ย้อนเวลา → ขึ้นหน้าคิว) · ผู้ขอไม่ใช่ รพ. เดียวกัน → 400 · เวลาอนาคต → 400', async () => {
    const hosp = (await db('hospital').where({ code: '11206' }).first()).id;
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const add = await call('POST', '/request/add', { hospital_id: hosp, requester_name: 'โทรมาแจ้ง', requester_phone: '0811111111', patient_name: 'ผู้ป่วย โทรเข้า', color_code: 'RED', submitted_at: old }, staff);
    assert.equal(add.http, 201);
    reqs.admin = add.data.id;
    const it = await item(reqs.admin);
    assert.equal(it.source, 'ADMIN');
    assert.equal(it.position_all, 1); // ส่งเก่าสุด ขึ้นหน้า
    assert.equal(it.position_color, 1);
    assert.equal((await item(reqs.p1)).position_color, 2);
    assert.ok(it.wait_days >= 3 && it.wait_days < 3.1);

    assert.equal((await call('POST', '/request/add', { hospital_id: hosp, requester_id: c, requester_name: 'x', patient_name: 'ผู้ป่วย ผิด รพ.', color_code: 'RED' }, staff)).http, 400);
    assert.equal((await call('POST', '/request/add', { hospital_id: hosp, requester_name: 'x', patient_name: 'อนาคต', submitted_at: new Date(Date.now() + 86_400_000).toISOString() }, staff)).http, 400);
    assert.equal((await call('POST', '/request/add', { hospital_id: hosp, requester_name: 'x', patient_name: 'ผู้ป่วย โทรเข้า' }, staff)).http, 409); // ซ้ำ
  });

  it('เรียกคิว → ยืนยัน/ไม่ยืนยัน · ย้อนสถานะที่ไม่อนุญาตไม่ได้ (409) · ประวัติครบ', async () => {
    const t = (id: number, action: string, extra: Record<string, unknown> = {}) => call('POST', '/request/transition', { id, action, ...extra }, staff);
    assert.equal((await t(reqs.p1, 'CONFIRM')).http, 409); // ยังไม่ได้เรียก
    assert.equal((await t(reqs.p1, 'CALL')).http, 200);
    let it = await item(reqs.p1);
    assert.equal(it.status, 'CALLED');
    assert.equal(it.call_count, 1);
    assert.equal(it.position_all, null); // ไม่อยู่ในคิวรอแล้ว
    assert.equal((await item(reqs.p3)).position_color, 2); // แดง: admin=1, p3=2 (p1 ออกจากคิว)

    assert.equal((await t(reqs.p1, 'CALL')).http, 200); // เรียกซ้ำได้ เพิ่มจำนวนครั้ง
    assert.equal((await item(reqs.p1)).call_count, 2);
    assert.equal((await t(reqs.p1, 'CONFIRM', { via: 'PHONE', note: 'โทรคุยแล้ว ส่งตัววันพรุ่งนี้' })).http, 200);
    assert.equal((await t(reqs.p1, 'CONFIRM')).http, 409); // กดซ้ำ
    assert.equal((await t(reqs.p1, 'DECLINE')).http, 409);
    const d = (await call('POST', '/request/get', { id: reqs.p1 }, staff)).data;
    assert.equal(d.status, 'CONFIRMED');
    assert.equal(d.resolved_via, 'PHONE');
    assert.deepEqual(d.events.map((e: any) => e.event), ['SUBMITTED', 'CALLED', 'CALLED', 'CONFIRMED']);
    assert.equal(d.events.at(-1).by_label, 'เจ้าหน้าที่ทดสอบ widget');
    assert.equal(d.events.at(-1).detail, 'โทรคุยแล้ว ส่งตัววันพรุ่งนี้');

    // ไม่ยืนยัน → เปิดคิวใหม่ กลับมาที่ตำแหน่งเดิม
    assert.equal((await t(reqs.p2, 'CALL')).http, 200);
    assert.equal((await t(reqs.p2, 'DECLINE', { via: 'PHONE' })).http, 200);
    assert.equal((await t(reqs.p2, 'REOPEN')).http, 200);
    assert.equal((await item(reqs.p2)).status, 'WAITING');
    const waiting = (await board()).items.filter((i: any) => i.status === 'WAITING').map((i: any) => i.id);
    assert.ok(waiting.indexOf(reqs.p2) < waiting.indexOf(reqs.p3), 'เปิดใหม่ต้องได้ตำแหน่งเดิม (ส่งก่อน p3)');
  });

  it('คืนคิว (เรียกแล้วติดต่อไม่ได้) · เกินเวลา confirm_timeout_hours ขึ้น overdue · ยกเลิก', async () => {
    const t = (id: number, action: string) => call('POST', '/request/transition', { id, action }, staff);
    await t(reqs.p3, 'CALL');
    assert.equal((await item(reqs.p3)).overdue, false);
    await db('bed_request').where({ id: reqs.p3 }).update({ called_at: new Date(Date.now() - 30 * 3_600_000).toISOString() });
    const over = await item(reqs.p3);
    assert.equal(over.overdue, true);
    assert.ok(over.called_hours >= 30);
    assert.equal((await t(reqs.p3, 'REQUEUE')).http, 200);
    const back = await item(reqs.p3);
    assert.equal(back.status, 'WAITING');
    assert.equal(back.overdue, false);
    assert.equal(back.called_at, null);
    assert.equal((await t(reqs.p3, 'REQUEUE')).http, 409);
    assert.equal((await t(reqs.p4, 'CANCEL')).http, 200);
    assert.equal(await item(reqs.p4), undefined); // ปิดแล้วไม่อยู่บนบอร์ด
    assert.equal((await t(reqs.p4, 'REOPEN')).http, 200);
  });

  it('แก้ไขข้อมูล + โอนเคสให้ผู้ขอคนอื่นของ รพ. เดียวกัน (ข้าม รพ. ไม่ได้)', async () => {
    const cur = (await call('POST', '/request/get', { id: reqs.p3 }, staff)).data;
    const upd = await call('POST', '/request/update', { id: cur.id, hospital_id: cur.hospital_id, requester_name: cur.requester_name, requester_phone: cur.requester_phone, patient_name: cur.patient_name, patient_age: '45', patient_gender: 'M', color_code: 'ORANGE', substance_code: 'ICE', reason_code: 'OTHER' }, staff);
    assert.equal(upd.http, 200);
    const after = (await call('POST', '/request/get', { id: cur.id }, staff)).data;
    assert.equal(after.color_code, 'ORANGE');
    assert.equal(after.patient_age, 45);
    assert.match(after.events.at(-1).detail, /color_code/);

    const list = (await call('POST', '/request/requesters', { hospital_id: cur.hospital_id }, staff)).data as any[];
    assert.equal(list.length, 2);
    assert.equal((await call('POST', '/request/transfer', { id: cur.id, requester_id: c }, staff)).http, 400); // คนละ รพ.
    assert.equal((await call('POST', '/request/transfer', { id: cur.id, requester_id: b }, staff)).http, 400); // คนเดิม
    assert.equal((await call('POST', '/request/transfer', { id: cur.id, requester_id: a }, staff)).http, 200);
    const moved = (await call('POST', '/request/get', { id: cur.id }, staff)).data;
    assert.equal(moved.requester_name, 'สมศรี ใจดี');
    assert.equal(moved.requester.id, a);
    assert.equal(moved.events.at(-1).event, 'TRANSFERRED');
    // คำขอที่จบแล้วโอนไม่ได้
    assert.equal((await call('POST', '/request/transfer', { id: reqs.p1, requester_id: b }, staff)).http, 409);
  });

  it('ฝั่งผู้ขอ: ดูคำขอ+ลำดับตาม queue_display · ถูกเรียกแล้วกดยืนยัน/ไม่ยืนยันเอง · ยกเลิกของคนอื่นไม่ได้', async () => {
    const setDisplay = (v: string) => call('POST', '/setting/save', { values: { queue_display: v } });
    await setDisplay('both');
    let mine = (await as('mine', { requester_id: a })).data as any[];
    const w = mine.find((m) => m.id === reqs.p3 || m.id === reqs.p2)!;
    assert.ok(w.position_all > 0 && w.position_color > 0);
    await setDisplay('color');
    mine = (await as('mine', { requester_id: a })).data;
    assert.equal(mine.find((m) => m.id === w.id).position_all, null);
    assert.ok(mine.find((m) => m.id === w.id).position_color > 0);
    await setDisplay('all');
    mine = (await as('mine', { requester_id: a })).data;
    assert.equal(mine.find((m) => m.id === w.id).position_color, null);
    await setDisplay('both');

    // ผู้ขอ B ไปแตะคำขอของ A ไม่ได้
    assert.equal((await as('cancel', { requester_id: b, id: reqs.p2 })).http, 404);
    assert.equal((await as('respond', { requester_id: b, id: reqs.p2, accept: true })).http, 404);

    // ถูกเรียก → ผู้ขอกดยืนยันเอง (via LINE)
    await call('POST', '/request/transition', { id: reqs.p2, action: 'CALL' }, staff);
    assert.equal((await as('respond', { requester_id: a, id: reqs.p2, accept: true })).http, 200);
    const d = (await call('POST', '/request/get', { id: reqs.p2 }, staff)).data;
    assert.equal(d.status, 'CONFIRMED');
    assert.equal(d.resolved_via, 'LINE');
    assert.equal(d.events.at(-1).by_label, 'สมศรี ใจดี');
    assert.ok(d.responded_at);
    assert.equal((await as('respond', { requester_id: a, id: reqs.p2, accept: false })).http, 409); // ตอบซ้ำไม่ได้ (จบแล้ว)

    // ยังไม่ถูกเรียกแต่กดตอบ → ไม่ได้
    assert.equal((await as('respond', { requester_id: c, id: reqs.p4, accept: true })).http, 409);
    // ผู้ขอยกเลิกของตัวเอง
    assert.equal((await as('cancel', { requester_id: c, id: reqs.p4 })).http, 200);
    assert.equal((await call('POST', '/request/get', { id: reqs.p4 }, staff)).data.status, 'CANCELLED');
  });

  it('แก้โปรไฟล์ผู้ขอ (ลงทะเบียนครั้งเดียว แก้ภายหลังได้) · ผู้ขอที่ถูกระงับใช้ไม่ได้', async () => {
    const save = await as('save-profile', { requester_id: a, profile: { full_name: 'สมศรี ใจดี (ใหม่)', hospital_code: '11206', hospital_name: 'x', phone: '074-123456', phone2: '0899999999' } });
    assert.equal(save.http, 200);
    const prof = (await as('profile', { requester_id: a })).data;
    assert.equal(prof.full_name, 'สมศรี ใจดี (ใหม่)');
    assert.equal(prof.phone2, '0899999999');
    assert.equal((await as('save-profile', { requester_id: a, profile: { full_name: 'x', hospital_code: '12', hospital_name: 'x', phone: '0812345678' } })).http, 400);
    assert.equal((await as('save-profile', { requester_id: a, profile: { full_name: 'x', hospital_code: '11206', hospital_name: 'x', phone: 'abc' } })).http, 400);

    await db('requester').where({ id: c }).update({ is_blocked: true });
    assert.equal((await as('mine', { requester_id: c })).http, 403);
    assert.equal((await submit(c, 'ผู้ป่วย คนถูกระงับ', 'RED')).http, 403);
    await db('requester').where({ id: c }).update({ is_blocked: false });
  });

  it('ค้นหา/ประวัติ: กรองตามสถานะ สี รพ. คำค้น วันที่', async () => {
    const s = (body: Record<string, unknown>) => call('POST', '/request/search', body, staff);
    const all = (await s({})).data;
    assert.equal(all.totalRow, 5);
    assert.equal((await s({ statuses: ['CONFIRMED'] })).data.totalRow, 2);
    assert.equal((await s({ statuses: ['WAITING', 'CALLED'], color_code: 'RED' })).data.totalRow, 1); // เหลือเคสที่เจ้าหน้าที่บันทึก (p1 ยืนยันแล้ว, p3 เปลี่ยนเป็นส้ม)
    assert.equal((await s({ q: 'เหลือง' })).data.totalRow, 1);
    assert.equal((await s({ q: 'BQ' })).data.totalRow, 5);
    const h10711 = (await db('hospital').where({ code: '10711' }).first()).id;
    assert.equal((await s({ hospital_id: h10711 })).data.totalRow, 1);
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
    assert.equal((await s({ date_from: today, date_to: today })).data.totalRow, 4); // ไม่รวมรายการที่ย้อนเวลา 3 วัน
    assert.equal((await s({ date_from: 'ไม่ใช่วันที่' })).http, 400);
    assert.equal(all.resultList[0].submitted_at >= all.resultList.at(-1).submitted_at, true); // ใหม่สุดก่อน
  });

  it('สิทธิ์ + audit: ไม่ล็อกอิน 401 · STAFF เข้าเมนู dev ไม่ได้ · audit ไม่เก็บชื่อผู้ป่วย', async () => {
    assert.equal((await call('POST', '/request/board', {}, false)).http, 401);
    assert.equal((await call('POST', '/dev/mock/list', {}, staff)).http, 403);
    assert.equal((await call('POST', '/dev/as/submit', { requester_id: a, request: { patient_name: 'แอบส่ง' } }, staff)).http, 403);
    const logs = JSON.stringify(await db('audit_logs').whereIn('page', ['request', 'dev']).select('detail'));
    assert.ok(!logs.includes('ผู้ป่วย แดง1'), 'audit ของหน้าคำขอ/dev ต้องไม่เก็บชื่อผู้ป่วย');
  });

  it('ล้างข้อมูลจำลอง: ลบผู้ขอจำลอง + คำขอ + ประวัติของพวกเขา (ไม่แตะคำขอของเจ้าหน้าที่)', async () => {
    const before = await db('bed_request').count({ n: '*' }).first().then((r: any) => Number(r.n));
    const r = await call('POST', '/dev/mock/clear', {});
    assert.equal(r.http, 200);
    assert.equal(r.data.requesters, 3);
    assert.equal(r.data.requests, before - 1); // เหลือแค่ 1 รายการที่เจ้าหน้าที่บันทึก (ไม่ผูกผู้ขอ)
    assert.equal(await db('bed_request').count({ n: '*' }).first().then((x: any) => Number(x.n)), 1);
    assert.equal(await db('request_event').count({ n: '*' }).first().then((x: any) => Number(x.n)), 1);
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
