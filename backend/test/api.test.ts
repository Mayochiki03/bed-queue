/**
 * ทดสอบ API จริงกับฐานข้อมูลจริง: npm test
 *
 * ระวัง: เทสต์ "ลบตารางทั้งหมดแล้วสร้างใหม่" ทุกครั้ง จึงใช้ฐานข้อมูลแยกเท่านั้น:
 *    ค่าเริ่มต้น bed_queue_test (สร้างไว้แล้วใน database/init.sql) — เปลี่ยนได้ด้วย TEST_DB_NAME
 *    และ "ชื่อต้องลงท้ายด้วย _test" ไม่งั้นเทสต์ไม่ยอมรัน (กันเผลอลบข้อมูลจริง)
 * ทดสอบกับ PostgreSQL: DB_CLIENT=postgres DB_PORT=5432 TEST_DB_NAME=bed_queue_test npm test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
const shellDb = process.env.DB_NAME; // ค่าที่ตั้งไว้ในเครื่อง/เทอร์มินัลก่อนเทสต์ทับ
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'bed_queue_test'; // ต้องตั้งก่อน import config (ค่านี้ชนะ .env)

// กันพลาดร้ายแรง: เทสต์ "ลบตารางทั้งหมด" — ถ้าระบบที่ใช้งานจริง (.env / ตัวแปรเครื่อง) ชี้ฐานเดียวกับฐานเทสต์ ข้อมูลจริงจะหายทุกครั้งที่รัน
{
  const envFile = process.env.ENV_FILE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
  const line = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => /^\s*DB_NAME\s*=/.test(l)) : undefined;
  const fromEnv = line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  for (const [where, name] of [['ไฟล์ .env', fromEnv], ['ตัวแปร DB_NAME ของเครื่อง', shellDb]] as const) {
    if (name && name.toLowerCase() === process.env.DB_NAME.toLowerCase()) {
      throw new Error(`เทสต์ไม่ยอมรัน: ${where} ตั้ง DB_NAME="${name}" ซึ่งเป็นฐานเดียวกับฐานของ npm test (ถูกลบทุกครั้ง)\n→ แก้ DB_NAME เป็นฐานของระบบจริง เช่น bed_queue แล้วรันใหม่`);
    }
  }
}

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

const { createApp } = await import('../src/app');
const { ensureAdmin } = await import('../src/core/auth');
const { config } = await import('../src/core/config');
const { checkConnection, closeDb, db } = await import('../src/core/db');
const { resetDb } = await import('../src/core/migrate');

let base = '';
/** วันที่เตียงว่างที่ใช้ทดสอบ (อีก 3 วัน ตามเวลาไทย) */
const { thaiToday } = await import('../src/core/thaiDate');
const BED_DAY = thaiToday(new Date(Date.now() + 3 * 86_400_000));
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
    assert.equal(ui.queue_display, 'all'); // ผู้ขอเห็นลำดับภาพรวมเป็นค่าเริ่มต้น
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

    // ช่วงเวลาแบบละเอียด: เมื่อวาน / กำหนดวันเอง / ทั้งหมด / วันนี้ (ไม่มีคำขอ)
    const yest = await dashboardService.summary({ preset: 'yesterday' }, NOW);
    assert.equal(yest.period_label, 'เมื่อวาน');
    assert.equal(yest.period.submitted, 1);
    assert.equal(yest.trend.length, 1);
    const today = await dashboardService.summary({ preset: 'today' }, NOW);
    assert.equal(today.period.submitted, 0);
    const custom = await dashboardService.summary({ date_from: '2026-10-10', date_to: '2026-10-12' }, NOW);
    assert.equal(custom.period.submitted, 4);
    assert.equal(custom.trend.length, 3);
    assert.equal(custom.trend[0]!.date, '2026-10-10');
    const all = await dashboardService.summary({ preset: 'all' }, NOW);
    assert.equal(all.period.submitted, 11); // รวมแถวเมื่อ 60 วันก่อน
    assert.equal(all.trend.length, 61);
  });

  it('API: STAFF เรียกได้ · ช่วงเวลาผิด → 400 · ไม่ส่ง days ใช้ค่าตั้งค่า', async () => {
    const r = await call('POST', '/dashboard/summary', {});
    assert.equal(r.http, 200);
    assert.equal(r.data.days, 30); // ค่าเริ่มต้น dashboard_default_days
    assert.ok(Array.isArray(r.data.trend) && r.data.trend.length === r.data.days);
    assert.equal((await call('POST', '/dashboard/summary', { days: 0 })).http, 400);
    assert.equal((await call('POST', '/dashboard/summary', { days: 99999 })).http, 400);
    assert.equal((await call('POST', '/dashboard/summary', { date_from: '2026-10-12', date_to: '2026-10-10' })).http, 400); // วันสิ้นสุดก่อนวันเริ่ม
    assert.equal((await call('POST', '/dashboard/summary', { preset: 'yesterday' })).http, 200);
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
    const P = (o: Record<string, unknown>, days = 30) => widgetService.preview(cfg(o) as any, { days }, NOW);

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

  it('ส่งออก Excel ปุ่มเดียว: ได้ไฟล์ .xlsx จริง มีกราฟของ Excel ครบ กันสูตร และเลือกชุดข้อมูลได้', async () => {
    const send = (body: unknown, ck = staffCookie) => fetch(`${base}/export/build`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: JSON.stringify(body) });
    const r = await send({ sections: ['summary', 'widgets'], days: 30 });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /spreadsheetml/);
    assert.match(r.headers.get('content-disposition') ?? '', /filename\*=UTF-8''.+\.xlsx/);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.subarray(0, 2).toString(), 'PK'); // xlsx = zip

    const ExcelJS = (await import('exceljs')).default;
    const JSZip = (await import('jszip')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    assert.equal(wb.worksheets[0]!.name, 'สรุปภาพรวม');
    assert.ok(wb.worksheets.length >= 3);
    // กราฟจริง: มีไฟล์ chart ใน zip และชีตสรุปอ้างถึง drawing
    const zip = await JSZip.loadAsync(buf);
    const charts = Object.keys(zip.files).filter((f) => /^xl\/charts\/chart\d+\.xml$/.test(f));
    assert.ok(charts.length >= 5, `ควรมีกราฟอย่างน้อย 5 อัน (มี ${charts.length})`);
    assert.match(await zip.file('[Content_Types].xml')!.async('string'), /drawingml\.chart\+xml/);
    for (const f of charts) assert.ok((await zip.file(f)!.async('string')).includes('<c:ser>'), f);

    // กราฟที่ยังไม่บันทึก + ชื่อขึ้นต้นด้วยสูตร → ถูกกัน
    const r2 = await send({ sections: ['widgets'], config: cfg({ title: '=HYPERLINK("x")', measures: ['submitted'], group_by: 'color', chart: 'bar' }) });
    assert.equal(r2.status, 200);
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(Buffer.from(await r2.arrayBuffer()) as any);
    assert.equal(String(wb2.worksheets[0]!.getCell(1, 1).value).startsWith("'="), true);

    assert.equal((await send({ sections: ['widgets'], widget_ids: [999999] })).status, 404);
    assert.equal((await send({ sections: [] })).status, 400); // ต้องเลือกอย่างน้อย 1 ชุด
    assert.equal((await send({ sections: ['audit'] })).status, 400); // STAFF ส่งออก log ไม่ได้
    assert.equal((await send({ sections: ['audit'] }, cookie)).status, 200); // ผู้ดูแลได้
    assert.equal((await call('POST', '/export/options', {}, false)).http, 401);
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
    as('submit', { requester_id: who, request: { patient_name, color_code, substance_code: 'METH', reason_code: 'OTHER', reason_other: 'ทดสอบ', ...extra } });
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
    assert.equal((await t(reqs.p1, 'CALL', { bed_date: BED_DAY })).http, 200);
    let it = await item(reqs.p1);
    assert.equal(it.status, 'CALLED');
    assert.equal(it.call_count, 1);
    assert.equal(it.position_all, null); // ไม่อยู่ในคิวรอแล้ว
    assert.equal((await item(reqs.p3)).position_color, 2); // แดง: admin=1, p3=2 (p1 ออกจากคิว)

    assert.equal((await t(reqs.p1, 'CALL', { bed_date: BED_DAY })).http, 200); // เรียกซ้ำได้ เพิ่มจำนวนครั้ง
    assert.equal((await item(reqs.p1)).call_count, 2);
    assert.equal((await t(reqs.p1, 'CONFIRM', { via: 'PHONE', note: 'โทรคุยแล้ว ส่งตัววันพรุ่งนี้' })).http, 200);
    assert.equal((await t(reqs.p1, 'CONFIRM')).http, 409); // กดซ้ำ
    assert.equal((await t(reqs.p1, 'DECLINE')).http, 409);
    const d = (await call('POST', '/request/get', { id: reqs.p1 }, staff)).data;
    assert.equal(d.status, 'CONFIRMED');
    assert.equal(d.resolved_via, 'PHONE');
    assert.deepEqual(d.events.map((e: any) => e.event), ['SUBMITTED', 'CALLED', 'CALLED', 'CONFIRMED']);
    assert.equal(d.events.at(-1).by_label, 'เจ้าหน้าที่ทดสอบ widget');
    assert.match(d.events.at(-1).detail, /โทรคุยแล้ว ส่งตัววันพรุ่งนี้$/); // มีวันที่ส่งตัวนำหน้า

    // ไม่ยืนยัน → เปิดคิวใหม่ กลับมาที่ตำแหน่งเดิม
    assert.equal((await t(reqs.p2, 'CALL', { bed_date: BED_DAY })).http, 200);
    assert.equal((await t(reqs.p2, 'DECLINE', { via: 'PHONE' })).http, 200);
    assert.equal((await t(reqs.p2, 'REOPEN')).http, 200);
    assert.equal((await item(reqs.p2)).status, 'WAITING');
    const waiting = (await board()).items.filter((i: any) => i.status === 'WAITING').map((i: any) => i.id);
    assert.ok(waiting.indexOf(reqs.p2) < waiting.indexOf(reqs.p3), 'เปิดใหม่ต้องได้ตำแหน่งเดิม (ส่งก่อน p3)');
  });

  it('คืนคิว (เรียกแล้วติดต่อไม่ได้) · เกินเวลา confirm_timeout_hours ขึ้น overdue · ยกเลิก', async () => {
    const t = (id: number, action: string, extra: Record<string, unknown> = {}) => call('POST', '/request/transition', { id, action, ...extra }, staff);
    await t(reqs.p3, 'CALL', { bed_date: BED_DAY });
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
    const ev = after.events.at(-1);
    assert.match(ev.detail, /สี/);
    const changes = JSON.parse(ev.changes) as { field: string; from: string | null; to: string | null }[];
    const color = changes.find((x) => x.field === 'color_code')!;
    assert.equal(color.to, 'ORANGE');
    assert.notEqual(color.from, 'ORANGE'); // เก็บค่าก่อนแก้ไว้ด้วย
    assert.ok(changes.some((x) => x.field === 'patient_age' && x.from === null && x.to === '45'));

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

  it('ฝั่งผู้ขอ: ดูคำขอ+ลำดับตาม queue_display · ถูกเรียกแล้วกดยืนยัน/ไม่ยืนยันเอง · ต่าง รพ. แตะกันไม่ได้ ร่วม รพ. เห็นร่วมกัน', async () => {
    const setDisplay = (v: string) => call('POST', '/setting/save', { values: { queue_display: v } });
    await setDisplay('all');
    let mine = (await as('mine', { requester_id: a })).data as any[];
    const w = mine.find((m) => m.id === reqs.p3 || m.id === reqs.p2)!;
    assert.ok(w.position_all > 0);
    assert.equal(w.position_color, null, 'ผู้ขอเห็นแค่ภาพรวม ไม่เห็นรายละเอียดแยกสี');
    assert.equal((await setDisplay('both')).http, 400); // ตัวเลือกเดิมที่เลิกใช้แล้ว
    await setDisplay('color');
    mine = (await as('mine', { requester_id: a })).data;
    assert.equal(mine.find((m) => m.id === w.id).position_all, null);
    assert.ok(mine.find((m) => m.id === w.id).position_color > 0);
    await setDisplay('all');
    mine = (await as('mine', { requester_id: a })).data;
    assert.equal(mine.find((m) => m.id === w.id).position_color, null);

    // ผู้ขอ C (คนละ รพ.) ไปแตะคำขอของ รพ.สงขลา ไม่ได้ และมองไม่เห็น
    assert.equal((await as('cancel', { requester_id: c, id: reqs.p2 })).http, 404);
    assert.equal((await as('respond', { requester_id: c, id: reqs.p2, accept: true })).http, 404);
    assert.ok(!((await as('mine', { requester_id: c })).data as any[]).some((m) => m.id === reqs.p2));
    // ผู้ขอ B (รพ.เดียวกับ A) เห็นคำขอของ รพ. ร่วมกัน
    assert.ok(((await as('mine', { requester_id: b })).data as any[]).some((m) => m.id === reqs.p2), 'เจ้าหน้าที่ รพ. เดียวกันเห็นผู้ป่วยของ รพ. ร่วมกัน');

    // ถูกเรียก → ผู้ขอกดยืนยันเอง (via LINE)
    await call('POST', '/request/transition', { id: reqs.p2, action: 'CALL', bed_date: BED_DAY }, staff);
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

  it('ส่งออก Excel ข้อมูลละเอียด: คำขอ/เหตุการณ์/ผู้ขอ ครบ เวลาเป็นเวลาไทย ตัวกรองใช้ได้ · log ไม่เก็บชื่อผู้ป่วย', async () => {
    const send = (body: unknown, ck = staff) => fetch(`${base}/export/build`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: JSON.stringify(body) });
    const ExcelJS = (await import('exceljs')).default;
    const load = async (r: Response) => {
      assert.equal(r.status, 200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await r.arrayBuffer()) as any);
      return wb;
    };
    const wb = await load(await send({ sections: ['requests', 'events', 'requesters'], scope: 'all' }));
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['คำขอ', 'ประวัติเหตุการณ์', 'ผู้ขอ']);
    const ws = wb.getWorksheet('คำขอ')!;
    const header = (ws.getRow(4).values as any[]).slice(1);
    for (const h of ['เลขคำขอ', 'ชื่อผู้ป่วย', 'โรงพยาบาลต้นทาง', 'ผู้ขอ', 'เบอร์ผู้ขอ', 'เวลาที่ส่งคำขอ', 'เวลาที่เรียกคิว (ล่าสุด)', 'เวลาที่ผู้ขอตอบ', 'เวลาที่ปิดเคส', 'ได้ผลจาก', 'เรียกโดย', 'ปิดเคสโดย', 'บันทึกเข้าระบบเมื่อ']) assert.ok(header.includes(h), `ขาดคอลัมน์ ${h}`);
    const total = await db('bed_request').count({ n: '*' }).first().then((r: any) => Number(r.n));
    assert.equal(ws.rowCount - 4, total); // ทุกคำขอ ไม่ตกหล่น
    const col = (name: string) => header.indexOf(name) + 1;
    const names = Array.from({ length: total }, (_, i) => String(ws.getRow(5 + i).getCell(col('ชื่อผู้ป่วย')).value));
    assert.ok(names.includes('ผู้ป่วย แดง1'));
    // เวลาไทย: ค่าใน Excel = UTC + 7 ชม.
    const row = Array.from({ length: total }, (_, i) => ws.getRow(5 + i)).find((r) => r.getCell(col('ชื่อผู้ป่วย')).value === 'ผู้ป่วย แดง1')!;
    const dbRow = await db('bed_request').where({ patient_name: 'ผู้ป่วย แดง1' }).first();
    assert.equal((row.getCell(col('เวลาที่ส่งคำขอ')).value as Date).getTime(), Math.floor(new Date(dbRow.submitted_at).getTime() / 1000) * 1000 + 7 * 3_600_000);
    assert.equal(String(row.getCell(col('สถานะ')).value), ({ WAITING: 'รอคิว', CALLED: 'เรียกแล้ว', CONFIRMED: 'ยืนยันส่งตัว', DECLINED: 'ไม่ยืนยัน', CANCELLED: 'ยกเลิก' } as Record<string, string>)[dbRow.status]);

    const ev = wb.getWorksheet('ประวัติเหตุการณ์')!;
    const evTotal = await db('request_event').count({ n: '*' }).first().then((r: any) => Number(r.n));
    assert.equal(ev.rowCount - 4, evTotal);
    const evText = JSON.stringify(ev.getSheetValues());
    assert.match(evText, /แก้ไขข้อมูล/);
    assert.match(evText, /สี: .* → ส้ม/); // ค่าก่อน → หลัง ของการแก้ไข

    // ตัวกรองเหมือนหน้าประวัติ: เฉพาะสถานะ CONFIRMED
    const only = await load(await send({ sections: ['requests'], filters: { statuses: ['CONFIRMED'], q: '', color_code: '' } }));
    const w2 = only.getWorksheet('คำขอ')!;
    const confirmed = await db('bed_request').where({ status: 'CONFIRMED' }).count({ n: '*' }).first().then((r: any) => Number(r.n));
    assert.ok(confirmed >= 1);
    assert.equal(w2.rowCount - 4, confirmed);

    // audit: บันทึกว่าส่งออกอะไร แต่ไม่เก็บชื่อผู้ป่วย
    await new Promise((r) => setTimeout(r, 200));
    const logs = await db('audit_logs').where({ page: 'export', action: 'BUILD' }).select('detail');
    assert.ok(logs.length >= 1 && logs.some((l: any) => String(l.detail).includes('"sections"')));
    const trans = await db('audit_logs').where({ page: 'request', action: 'TRANSITION' }).select('detail');
    assert.ok(trans.some((l: any) => String(l.detail).includes('"action"'))); // รู้ว่าทำอะไรกับเคสไหน
    assert.ok(!JSON.stringify(trans).includes('ผู้ป่วย แดง'));
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

describe('แจ้งเตือน LINE (เลือกเปิด/ปิดทีละชนิด · จดประวัติ · โควต้า)', () => {
  let staff = '';
  let who = 0;
  let rid = 0;
  const logs = async (type?: string) => (await call('POST', '/notification/logs', { type: type ?? '' })).data.resultList as any[];

  it('ตั้งต้น: 9 ชนิด เปิดเฉพาะที่จำเป็น · STAFF เข้าหน้านี้ไม่ได้', async () => {
    staff = ((await call('POST', '/auth/login', { username: 'wstaff', password: 'password123' })).headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    assert.equal((await call('POST', '/notification/templates', {}, staff)).http, 403);
    const t = (await call('POST', '/notification/templates', {})).data;
    assert.equal(t.templates.length, 9);
    const on = Object.fromEntries(t.templates.map((x: any) => [x.type, x.is_enabled]));
    assert.deepEqual(on, { CALLED: true, CONFIRMED: true, CANCELLED: true, REQUEUED: true, TRANSFERRED: true, MEMBER_APPROVED: true, MEMBER_REJECTED: true, SUBMITTED: false, REOPENED: false });
    // ข้อความตั้งต้นไม่มีชื่อผู้ป่วย (PDPA)
    assert.ok(t.templates.every((x: any) => !/patient_name|ชื่อผู้ป่วย/.test(x.body)));
  });

  it('เรียกคิวผู้ขอจำลอง → จด SKIPPED (ผู้ขอจำลอง) · ปิดชนิดนี้ → ไม่จดอะไรเพิ่ม · เปิดใหม่จดอีก', async () => {
    await db('notification_log').delete(); // เริ่มนับใหม่ (เทสต์ก่อนหน้ามีการเรียกคิวที่จดไว้แล้ว)
    who = (await call('POST', '/dev/mock/create', { full_name: 'ผู้ขอแจ้งเตือน', hospital_code: '11206', hospital_name: 'รพ.สงขลา', phone: '0811111111' })).data.id;
    rid = (await call('POST', '/dev/as/submit', { requester_id: who, request: { patient_name: 'ผู้ป่วย แจ้งเตือน', color_code: 'RED', substance_code: 'METH', reason_code: 'OTHER', reason_other: 'ทดสอบ' } })).data.id;
    assert.equal((await logs('SUBMITTED')).length, 0); // SUBMITTED ปิดอยู่
    assert.equal((await call('POST', '/request/transition', { id: rid, action: 'CALL', bed_date: BED_DAY }, staff)).http, 200);
    let l = await logs('CALLED');
    assert.equal(l.length, 1);
    assert.equal(l[0].status, 'SKIPPED');
    assert.match(l[0].error_message, /ผู้ขอจำลอง/);
    assert.equal(l[0].request_no, `BQ${String(rid).padStart(6, '0')}`);

    const t = (await call('POST', '/notification/templates', {})).data.templates.find((x: any) => x.type === 'CALLED');
    assert.equal((await call('POST', '/notification/save', { type: 'CALLED', title: t.title, body: t.body, is_enabled: false })).http, 200);
    assert.equal((await call('POST', '/request/transition', { id: rid, action: 'REQUEUE' }, staff)).http, 200);
    assert.equal((await call('POST', '/request/transition', { id: rid, action: 'CALL', bed_date: BED_DAY }, staff)).http, 200);
    assert.equal((await logs('CALLED')).length, 1, 'ปิดชนิดแล้วต้องไม่จด/ไม่ส่ง');
    assert.equal((await logs('REQUEUED')).length, 1); // ชนิดอื่นยังทำงาน
    await call('POST', '/notification/save', { type: 'CALLED', title: t.title, body: t.body, is_enabled: true });
    await call('POST', '/request/transition', { id: rid, action: 'REQUEUE' }, staff);
    await call('POST', '/request/transition', { id: rid, action: 'CALL', bed_date: BED_DAY }, staff);
    assert.equal((await logs('CALLED')).length, 2);
  });

  it('ผู้ขอกดเอง (ยกเลิก/ยืนยัน) ไม่แจ้งกลับ · เจ้าหน้าที่ยกเลิก → แจ้ง', async () => {
    await call('POST', '/dev/as/respond', { requester_id: who, id: rid, accept: true });
    assert.equal((await logs('CONFIRMED')).length, 0);
    const before = (await logs('CANCELLED')).length;
    const r2 = (await call('POST', '/dev/as/submit', { requester_id: who, request: { patient_name: 'ผู้ป่วย ยกเลิกเอง', color_code: 'GREEN', substance_code: 'METH', reason_code: 'OTHER', reason_other: 'ทดสอบ' } })).data.id;
    await call('POST', '/dev/as/cancel', { requester_id: who, id: r2 });
    assert.equal((await logs('CANCELLED')).length, before, 'ผู้ขอยกเลิกเองไม่ส่ง');
    const r3 = (await call('POST', '/dev/as/submit', { requester_id: who, request: { patient_name: 'ผู้ป่วย ถูกยกเลิก', color_code: 'GREEN', substance_code: 'METH', reason_code: 'OTHER', reason_other: 'ทดสอบ' } })).data.id;
    await call('POST', '/request/transition', { id: r3, action: 'CANCEL' }, staff);
    assert.equal((await logs('CANCELLED')).length, before + 1);
  });

  it('ส่งจริง (จำลอง LINE ด้วย fetch ปลอม): SENT / LINE ปฏิเสธ = FAILED / โควต้าเต็ม = SKIPPED · ผู้ใช้ LINE จริงใช้ข้อความจาก template', async () => {
    const save = (values: Record<string, unknown>) => call('POST', '/setting/save', { values });
    assert.equal((await save({ connection_mode: 'DEV_TUNNEL', line_channel_token: 'tok-ABC', liff_id: '1234-abcd' })).http, 200);
    const hosp = (await db('hospital').where({ code: '11206' }).first()).id;
    const now = new Date().toISOString();
    const [reqId] = await db('requester').insert({ line_user_id: 'U-real-1', full_name: 'ผู้ขอจริง', phone: '0800000000', hospital_id: hosp, pdpa_accepted_at: now, created_at: now, updated_at: now }).then(async () => [(await db('requester').where({ line_user_id: 'U-real-1' }).first()).id]);
    const mkReq = async (name: string) => {
      const id = (await call('POST', '/request/add', { hospital_id: hosp, requester_id: reqId, requester_name: 'x', patient_name: name, color_code: 'RED' }, staff)).data.id as number;
      return id;
    };
    const realFetch = globalThis.fetch;
    const sent: { url: string; body: any; auth: string }[] = [];
    let respond: () => { ok: boolean; status: number; json: unknown } = () => ({ ok: true, status: 200, json: {} });
    globalThis.fetch = (async (url: any, init: any) => {
      if (!String(url).startsWith('https://api.line.me')) return realFetch(url, init);
      const r = respond();
      sent.push({ url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization });
      return { ok: r.ok, status: r.status, json: async () => r.json } as Response;
    }) as typeof fetch;
    try {
      const a1 = await mkReq('ผู้ป่วย ส่งจริง1');
      await call('POST', '/request/transition', { id: a1, action: 'CALL', bed_date: BED_DAY }, staff);
      assert.equal(sent.length, 1);
      assert.equal(sent[0]!.url, 'https://api.line.me/v2/bot/message/push');
      assert.equal(sent[0]!.auth, 'Bearer tok-ABC');
      assert.equal(sent[0]!.body.to, 'U-real-1');
      const text = JSON.stringify(sent[0]!.body.messages[0]);
      assert.ok(text.includes('ถึงคิวของคุณแล้ว') && text.includes(`BQ${String(a1).padStart(6, '0')}`));
      assert.ok(!text.includes('ผู้ป่วย ส่งจริง1'), 'ห้ามมีชื่อผู้ป่วยในข้อความ LINE');
      assert.ok(text.includes('https://liff.line.me/1234-abcd') || text.includes('a=confirm'), 'การ์ดต้องมีทางตอบ: ปุ่มตอบ 3 ปุ่ม หรือปุ่มเปิดหน้าตอบรับ (ไม่ซ้อนกัน)');
      assert.equal((await logs('CALLED'))[0].status, 'SENT');

      respond = () => ({ ok: false, status: 400, json: { message: 'Invalid reply token' } });
      const a2 = await mkReq('ผู้ป่วย ส่งจริง2');
      await call('POST', '/request/transition', { id: a2, action: 'CALL', bed_date: BED_DAY }, staff);
      const failed = (await logs('CALLED'))[0];
      assert.equal(failed.status, 'FAILED');
      assert.match(failed.error_message, /Invalid reply token/);
      assert.equal((await call('POST', '/request/transition', { id: a2, action: 'CONFIRM', via: 'PHONE' }, staff)).http, 200, 'ส่ง LINE ล้มต้องไม่กระทบงานหลัก');

      respond = () => ({ ok: true, status: 200, json: {} });
      await save({ line_monthly_quota: 1 }); // ส่งไปแล้ว 1 ข้อความ → เต็ม
      const before = sent.length;
      const a3 = await mkReq('ผู้ป่วย ส่งจริง3');
      await call('POST', '/request/transition', { id: a3, action: 'CALL', bed_date: BED_DAY }, staff);
      assert.equal(sent.length, before, 'โควต้าเต็มต้องไม่เรียก LINE');
      const skipped = (await logs('CALLED'))[0];
      assert.equal(skipped.status, 'SKIPPED');
      assert.match(skipped.error_message, /โควต้า/);
      const s = (await call('POST', '/notification/summary', {})).data;
      assert.equal(s.sent, 1);
      assert.equal(s.failed, 1);
      assert.equal(s.live, true);
      assert.equal(s.near_limit, true);
    } finally {
      globalThis.fetch = realFetch;
      await save({ connection_mode: 'LOCAL', line_channel_token: '', line_monthly_quota: 300, liff_id: '' });
    }
  });

  it('สรุปเดือนนี้ + แก้ข้อความ: หัวข้อว่าง → 400', async () => {
    const s = (await call('POST', '/notification/summary', {})).data;
    assert.equal(s.sent, 1); // จากเทสต์ส่งจริงด้านบน
    assert.ok(s.skipped >= 3);
    assert.equal(s.live, false); // กลับเป็นโหมด LOCAL แล้ว
    assert.equal(s.quota, 300);
    assert.equal((await call('POST', '/notification/save', { type: 'CALLED', title: '', body: 'x', is_enabled: true })).http, 400);
    assert.equal((await call('POST', '/notification/save', { type: 'NOPE', title: 'x', body: 'x', is_enabled: true })).http, 400);
    await call('POST', '/dev/mock/clear', {});
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

describe('ยืนยันตัวตน 2 ชั้น (2FA)', () => {
  let ticket = '';
  let secret = '';
  let recovery: string[] = [];
  const first = (r: { headers: Headers }) => (r.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

  it('role ที่ถูกบังคับ: รหัสผ่านถูกยังไม่ได้ session ต้องผูกแอปก่อน', async () => {
    const add = await call('POST', '/user/add', { username: 'mfauser', password: 'password123', full_name: 'ผู้ใช้ 2FA', role: 'STAFF', is_active: 'Y' });
    assert.equal(add.http, 201);
    config.mfaRequiredRoles = ['STAFF'];
    const r = await call('POST', '/auth/login', { username: 'mfauser', password: 'password123' });
    assert.equal(r.data.mfa, 'setup');
    assert.ok(!(r.headers.get('set-cookie') ?? '').includes('app_session='));
    ticket = first(r);
    assert.ok(ticket.startsWith('app_mfa='));
    // ticket ใช้เป็น session ไม่ได้
    assert.equal((await call('POST', '/hospital/search', {}, ticket)).http, 401);
    // ไม่มี ticket → ผูกแอปไม่ได้
    assert.equal((await call('POST', '/auth/mfa/setup', {}, false)).http, 401);
  });

  it('ผูกแอป: ได้ QR + secret · รหัสผิดไม่ผ่าน · รหัสถูกได้ session + รหัสสำรอง 10 ชุด', async () => {
    const { generateSecret, totpAt, currentStep } = await import('../src/core/totp');
    void generateSecret;
    const setup = await call('POST', '/auth/mfa/setup', {}, ticket);
    assert.equal(setup.http, 200);
    assert.ok(String(setup.data.qr).startsWith('data:image/png;base64,'));
    secret = String(setup.data.secret).replace(/\s/g, '');
    // เรียกซ้ำได้ secret เดิม (รีเฟรชหน้าแล้ว QR ไม่เปลี่ยน)
    assert.equal(String((await call('POST', '/auth/mfa/setup', {}, ticket)).data.secret).replace(/\s/g, ''), secret);
    assert.equal((await call('POST', '/auth/mfa/enable', { code: '000000' }, ticket)).http, 400);
    const ok = await call('POST', '/auth/mfa/enable', { code: totpAt(secret, currentStep()) }, ticket);
    assert.equal(ok.http, 200);
    assert.equal(ok.data.recovery_codes.length, 10);
    recovery = ok.data.recovery_codes;
    assert.ok((ok.headers.get('set-cookie') ?? '').includes('app_session='));
    const stored = await db('users').where({ username: 'mfauser' }).first();
    assert.ok(stored.totp_secret_enc && !String(stored.totp_secret_enc).includes(secret), 'secret ต้องเข้ารหัสในฐานข้อมูล');
    const hashes = JSON.stringify(await db('user_recovery_code').select('*'));
    assert.ok(recovery.every((c) => !hashes.includes(c)), 'รหัสสำรองต้องเก็บเป็น hash');
  });

  it('ล็อกอินครั้งถัดไป: ต้องกรอกรหัส · ใช้รหัสเดิมซ้ำไม่ได้ · รหัสสำรองใช้ได้ครั้งเดียว', async () => {
    const { totpAt, currentStep } = await import('../src/core/totp');
    // ล็อกอินครั้งก่อนใช้ step ปัจจุบันไปแล้ว → ใช้รหัสของ step เดิมซ้ำไม่ได้ (กัน replay) ต้องรอ step ถัดไป
    let r = await call('POST', '/auth/login', { username: 'mfauser', password: 'password123' });
    assert.equal(r.data.mfa, 'verify');
    let t = first(r);
    assert.equal((await call('POST', '/auth/mfa/verify', { code: totpAt(secret, currentStep()) }, t)).http, 400);
    const good = await call('POST', '/auth/mfa/verify', { code: totpAt(secret, currentStep() + 1) }, t);
    assert.equal(good.http, 200);
    assert.ok((good.headers.get('set-cookie') ?? '').includes('app_session='));
    // รหัสสำรอง
    r = await call('POST', '/auth/login', { username: 'mfauser', password: 'password123' });
    t = first(r);
    const rc = await call('POST', '/auth/mfa/verify', { recovery_code: recovery[0] }, t);
    assert.equal(rc.http, 200);
    assert.equal(rc.data.recovery_left, 9);
    r = await call('POST', '/auth/login', { username: 'mfauser', password: 'password123' });
    assert.equal((await call('POST', '/auth/mfa/verify', { recovery_code: recovery[0] }, first(r))).http, 400);
  });

  it('รีเซ็ต 2FA: session เก่าใช้ไม่ได้ทันที และล็อกอินครั้งถัดไปต้องผูกแอปใหม่', async () => {
    const r = await call('POST', '/auth/login', { username: 'mfauser', password: 'password123' });
    // ช่วงเวลาปัจจุบันถูกใช้ไปแล้ว (กัน replay) → เข้าด้วยรหัสสำรองชุดที่ 2
    const v = await call('POST', '/auth/mfa/verify', { recovery_code: recovery[1] }, first(r));
    const sess = first(v);
    assert.equal((await call('GET', '/auth/me', undefined, sess)).http, 200);
    const u = await db('users').where({ username: 'mfauser' }).first();
    assert.equal((await call('POST', '/user/reset-mfa', { id: u.id })).http, 200);
    assert.equal((await call('GET', '/auth/me', undefined, sess)).http, 401);
    assert.equal((await call('POST', '/auth/login', { username: 'mfauser', password: 'password123' })).data.mfa, 'setup');
    const list = await call('POST', '/user/search', {});
    assert.equal(list.data.resultList.find((x: { username: string }) => x.username === 'mfauser').mfa_state, 'PENDING');
    config.mfaRequiredRoles = [];
  });

  it('ไม่ถูกบังคับ → ล็อกอินด้วยรหัสผ่านอย่างเดียวได้เหมือนเดิม (บัญชีที่ยังไม่ผูก)', async () => {
    await call('POST', '/user/add', { username: 'plain1', password: 'password123', full_name: 'ไม่ใช้ 2FA', role: 'STAFF', is_active: 'Y' });
    const r = await call('POST', '/auth/login', { username: 'plain1', password: 'password123' });
    assert.equal(r.http, 200);
    assert.equal(r.data.mfa, null);
    assert.ok((r.headers.get('set-cookie') ?? '').startsWith('app_session='));
  });
});

describe('LINE webhook', () => {
  const SECRET = 'sec-XYZ';
  const sign = (raw: string, secret = SECRET) => createHmac('sha256', secret).update(raw).digest('base64');
  const post = (body: unknown, signature?: string) => {
    const raw = JSON.stringify(body);
    return fetch(`${base}/line/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', ...(signature === undefined ? { 'x-line-signature': sign(raw) } : signature ? { 'x-line-signature': signature } : {}) }, body: raw });
  };
  const save = (values: Record<string, unknown>) => call('POST', '/setting/save', { values });
  const realFetch = globalThis.fetch;
  let sent: { url: string; body: any }[] = [];
  let lineWebhook: { endpoint: string; test: any } = { endpoint: '', test: { success: true, statusCode: 200 } };
  const fake = (async (url: any, init: any) => {
    const u = String(url);
    if (!u.startsWith('https://api.line.me')) return realFetch(url, init);
    if (u.endsWith('/channel/webhook/endpoint')) return { ok: true, status: 200, json: async () => ({ endpoint: lineWebhook.endpoint, active: true }) } as Response;
    if (u.endsWith('/channel/webhook/test')) return { ok: true, status: 200, json: async () => lineWebhook.test } as Response;
    sent.push({ url: u, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as typeof fetch;
  /** webhook ตอบ 200 ก่อนแล้วประมวลผลต่อ — รอจนมี reply ครบ */
  const waitSent = async (n: number) => {
    for (let i = 0; i < 100 && sent.length < n; i++) await new Promise((r) => setTimeout(r, 20));
    return sent;
  };
  const textOf = (i: number) => JSON.stringify(sent[i]!.body.messages);
  let staffC = '';
  let uid = 'U-hook-1';
  let calledId = 0;
  let waitingId = 0;

  before(async () => {
    staffC = ((await call('POST', '/auth/login', { username: 'wstaff', password: 'password123' })).headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    await save({ connection_mode: 'DEV_TUNNEL', line_channel_token: 'tok-W', line_channel_secret: SECRET, public_base_url: 'https://bed.example.com', liff_id: '99-abc' });
    await call('POST', '/dev/mock/create', { full_name: 'ตัวสร้าง รพ.', hospital_code: '11206', hospital_name: 'รพ.สงขลา', phone: '0800000000' }); // ให้มี รพ. 11206 แน่นอน
    const hosp = (await db('hospital').where({ code: '11206' }).first()).id;
    const now = new Date().toISOString();
    await db('requester').insert({ line_user_id: uid, full_name: 'ผู้ขอ เว็บฮุก', phone: '0800000001', hospital_id: hosp, pdpa_accepted_at: now, created_at: now, updated_at: now });
    const otherHosp = await (await import('../src/pages/hospital')).hospitalService.findOrCreate('99998', 'รพ.อื่นทดสอบ');
    await db('requester').insert({ line_user_id: 'U-hook-2', full_name: 'คนอื่น', phone: '0800000002', hospital_id: otherHosp, pdpa_accepted_at: now, created_at: now, updated_at: now });
    const rid = (await db('requester').where({ line_user_id: uid }).first()).id;
    const mk = async (name: string) => (await call('POST', '/request/add', { hospital_id: hosp, requester_id: rid, requester_name: 'x', patient_name: name, color_code: 'RED' }, staffC)).data.id as number;
    waitingId = await mk('ผู้ป่วย รอคิวลับ');
    calledId = await mk('ผู้ป่วย ถูกเรียกลับ');
    globalThis.fetch = fake;
  });
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('ไม่มีลายเซ็น/ลายเซ็นผิด → 401 · ลายเซ็นถูก + events ว่าง (ปุ่ม Verify) → 200', async () => {
    assert.equal((await post({ events: [] }, '')).status, 401);
    assert.equal((await post({ events: [] }, 'bm90LXZhbGlk')).status, 401);
    assert.equal((await post({ events: [] }, sign('{"events":[]}', 'secret-อื่น'))).status, 401);
    assert.equal((await post({ events: [] })).status, 200);
    assert.equal(sent.length, 0);
  });

  it('ยังไม่ตั้ง Channel Secret → 503', async () => {
    // เว้นว่าง = ใช้ค่าเดิม จึงต้องลบตรง ๆ ใน DB
    await db('app_setting').where({ key: 'line_channel_secret' }).delete();
    (await import('../src/core/settings')).invalidateSettings();
    assert.equal((await post({ events: [] })).status, 503);
    await save({ line_channel_secret: SECRET });
  });

  it('พิมพ์ "สถานะ" → ตอบด้วย reply (ไม่กินโควต้า) สรุปเลขคำขอ + ลำดับ ไม่มีชื่อผู้ป่วย', async () => {
    sent = [];
    await post({ events: [{ type: 'message', replyToken: 'rt-1', source: { userId: uid }, message: { type: 'text', text: 'สถานะ' } }] });
    await waitSent(1);
    assert.equal(sent[0]!.url, 'https://api.line.me/v2/bot/message/reply');
    assert.equal(sent[0]!.body.replyToken, 'rt-1');
    const t = textOf(0);
    assert.ok(t.includes(`BQ${String(waitingId).padStart(6, '0')}`) && t.includes('รอคิว'));
    assert.ok(!t.includes('ผู้ป่วย รอคิวลับ'), 'ห้ามมีชื่อผู้ป่วยในแชท');
  });

  it('ข้อความอื่น → บอกวิธีใช้ · ผู้ที่ยังไม่ลงทะเบียนพิมพ์ "สถานะ" → ชวนลงทะเบียน', async () => {
    sent = [];
    await post({ events: [{ type: 'message', replyToken: 'rt-2', source: { userId: uid }, message: { type: 'text', text: 'สวัสดี' } }] });
    await post({ events: [{ type: 'message', replyToken: 'rt-3', source: { userId: 'U-nobody' }, message: { type: 'text', text: 'สถานะ' } }] });
    await waitSent(2);
    assert.ok(textOf(0).includes('สถานะ') || textOf(1).includes('สถานะ'));
    assert.ok(sent.some((s) => JSON.stringify(s.body.messages).includes('ยังไม่ได้ลงทะเบียน')));
  });

  it('การ์ดเรียกคิวมีปุ่มยืนยัน/ไม่ยืนยันเมื่อเปิด webhook · ปิดตัวเลือก line_call_buttons → เหลือแค่ปุ่มเปิดเว็บ', async () => {
    sent = [];
    await call('POST', '/request/transition', { id: calledId, action: 'CALL', bed_date: BED_DAY }, staffC);
    assert.equal(sent[0]!.url, 'https://api.line.me/v2/bot/message/push');
    let t = textOf(0);
    assert.ok(t.includes(`a=confirm&r=${calledId}`) && t.includes(`a=decline&r=${calledId}`));
    await save({ line_call_buttons: false });
    sent = [];
    await call('POST', '/request/transition', { id: calledId, action: 'REQUEUE' }, staffC);
    await call('POST', '/request/transition', { id: calledId, action: 'CALL', bed_date: BED_DAY }, staffC);
    const push = sent.find((s) => s.body.messages?.[0]?.altText && JSON.stringify(s.body).includes('ถึงคิว'));
    assert.ok(push && !JSON.stringify(push.body).includes('a=confirm'));
    assert.ok(JSON.stringify(push!.body).includes('เปิดหน้าตอบรับ'), 'ปิดปุ่มตอบ → เหลือปุ่มเปิดหน้าตอบรับ');
    await save({ line_call_buttons: true });
  });

  it('กด "ไม่ยืนยัน" → ถามซ้ำก่อน (ยังไม่เปลี่ยนสถานะ) · คนต่าง รพ. กดคำขอของเราไม่ได้', async () => {
    sent = [];
    await post({ events: [{ type: 'postback', replyToken: 'rt-4', source: { userId: uid }, postback: { data: `a=decline&r=${calledId}` } }] });
    await waitSent(1);
    assert.ok(textOf(0).includes(`a=decline_yes&r=${calledId}`));
    assert.equal((await db('bed_request').where({ id: calledId }).first()).status, 'CALLED');

    sent = [];
    await post({ events: [{ type: 'postback', replyToken: 'rt-5', source: { userId: 'U-hook-2' }, postback: { data: `a=confirm&r=${calledId}` } }] });
    await waitSent(1);
    assert.ok(textOf(0).includes('ทำรายการไม่ได้'));
    assert.equal((await db('bed_request').where({ id: calledId }).first()).status, 'CALLED', 'คนอื่นต้องเปลี่ยนสถานะไม่ได้');
  });

  it('กด "ยืนยันส่งตัว" → CONFIRMED ผ่าน LINE · กดซ้ำ → บอกว่าทำไม่ได้ ไม่พัง · ปิด webhook → เงียบ', async () => {
    sent = [];
    await post({ events: [{ type: 'postback', replyToken: 'rt-6', source: { userId: uid }, postback: { data: `a=confirm&r=${calledId}` } }] });
    await waitSent(1);
    const row = await db('bed_request').where({ id: calledId }).first();
    assert.equal(row.status, 'CONFIRMED');
    assert.equal(row.resolved_via, 'LINE');
    assert.ok(textOf(0).includes('ยืนยันส่งตัว'));

    sent = [];
    await post({ events: [{ type: 'postback', replyToken: 'rt-7', source: { userId: uid }, postback: { data: `a=confirm&r=${calledId}` } }] });
    await waitSent(1);
    assert.ok(textOf(0).includes('ทำรายการไม่ได้'));

    await save({ line_webhook_enabled: false });
    sent = [];
    await post({ events: [{ type: 'message', replyToken: 'rt-8', source: { userId: uid }, message: { type: 'text', text: 'สถานะ' } }] });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(sent.length, 0);
    await save({ line_webhook_enabled: true });
  });

  it('postback ที่รูปแบบผิด/id ไม่ใช่ตัวเลข → เงียบ ไม่พัง', async () => {
    sent = [];
    const r = await post({ events: [{ type: 'postback', replyToken: 'rt-9', source: { userId: uid }, postback: { data: 'a=confirm&r=abc' } }, { type: 'unfollow', source: { userId: uid } }] });
    assert.equal(r.status, 200);
    await new Promise((r2) => setTimeout(r2, 150));
    assert.equal(sent.length, 0);
  });

  it('ปุ่มทดสอบ webhook: URL ไม่ตรง → ไม่ผ่าน · ตรง + LINE ยิงสำเร็จ → ผ่าน · LINE ยิงแล้วระบบตอบผิด → ไม่ผ่าน (พร้อมเหตุผล)', async () => {
    const test = () => call('POST', '/setting/test', { kind: 'line_webhook' });
    lineWebhook = { endpoint: '', test: { success: true } };
    assert.equal((await test()).data.ok, false);
    lineWebhook = { endpoint: 'https://old.trycloudflare.com/api/line/webhook', test: { success: true } };
    const mismatch = (await test()).data;
    assert.equal(mismatch.ok, false);
    assert.match(mismatch.detail, /old\.trycloudflare/);
    lineWebhook = { endpoint: 'https://bed.example.com/api/line/webhook', test: { success: true, statusCode: 200 } };
    assert.equal((await test()).data.ok, true);
    lineWebhook = { endpoint: 'https://bed.example.com/api/line/webhook', test: { success: false, statusCode: 401, reason: 'COULD_NOT_CONNECT' } };
    const bad = (await test()).data;
    assert.equal(bad.ok, false);
    assert.match(bad.detail, /COULD_NOT_CONNECT/);
    assert.equal((await call('POST', '/setting/test', { kind: 'line_webhook' }, staffC)).http, 403, 'เฉพาะนักพัฒนา');
  });

  it('คืนค่าเริ่มต้น', async () => {
    globalThis.fetch = realFetch;
    await save({ connection_mode: 'LOCAL', line_channel_token: '', public_base_url: '', liff_id: '' });
    await db('app_setting').where({ key: 'line_channel_secret' }).delete();
    (await import('../src/core/settings')).invalidateSettings();
  });
});

describe('วันที่เตียงว่าง + ยืนยันจะมาแต่ขอเลื่อนวัน (NEED_DATE)', () => {
  const SECRET = 'sec-DATE';
  const realFetch = globalThis.fetch;
  let sent: { url: string; body: any }[] = [];
  const fake = (async (url: any, init: any) => {
    if (!String(url).startsWith('https://api.line.me')) return realFetch(url, init);
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as typeof fetch;
  const save = (values: Record<string, unknown>) => call('POST', '/setting/save', { values });
  const sign = (raw: string) => createHmac('sha256', SECRET).update(raw).digest('base64');
  const postback = (uid: string, data: string) => {
    const raw = JSON.stringify({ events: [{ type: 'postback', replyToken: 'rt', source: { userId: uid }, postback: { data } }] });
    return fetch(`${base}/line/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sign(raw) }, body: raw });
  };
  const waitSent = async (n: number) => {
    for (let i = 0; i < 100 && sent.length < n; i++) await new Promise((r) => setTimeout(r, 20));
  };
  const day = (n: number) => thaiToday(new Date(Date.now() + n * 86_400_000));
  const uid = 'U-date-1';
  let staffD = '';
  let hosp = 0;
  let rid = 0;
  const mk = async (name: string) => (await call('POST', '/request/add', { hospital_id: hosp, requester_id: rid, requester_name: 'x', patient_name: name, color_code: 'GREEN' }, staffD)).data.id as number;
  const tr = (id: number, action: string, extra: Record<string, unknown> = {}) => call('POST', '/request/transition', { id, action, ...extra }, staffD);
  const row = (id: number) => db('bed_request').where({ id }).first();

  before(async () => {
    staffD = ((await call('POST', '/auth/login', { username: 'wstaff', password: 'password123' })).headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    await save({ connection_mode: 'DEV_TUNNEL', line_channel_token: 'tok-D', line_channel_secret: SECRET, public_base_url: 'https://bed.example.com', liff_id: '88-date' });
    await call('POST', '/dev/mock/create', { full_name: 'ตัวสร้าง รพ.', hospital_code: '11206', hospital_name: 'รพ.สงขลา', phone: '0800000000' });
    hosp = (await db('hospital').where({ code: '11206' }).first()).id;
    const now = new Date().toISOString();
    await db('requester').insert({ line_user_id: uid, full_name: 'ผู้ขอ วันที่', phone: '0800000077', hospital_id: hosp, pdpa_accepted_at: now, created_at: now, updated_at: now });
    rid = (await db('requester').where({ line_user_id: uid }).first()).id;
    globalThis.fetch = fake;
  });
  after(async () => {
    globalThis.fetch = realFetch;
    await save({ connection_mode: 'LOCAL', line_channel_token: '', public_base_url: '', liff_id: '' });
    await db('app_setting').where({ key: 'line_channel_secret' }).delete();
    (await import('../src/core/settings')).invalidateSettings();
  });

  it('เรียกคิวต้องใส่วันที่เตียงว่าง: ไม่ใส่/วันที่ผ่านมาแล้ว/วันที่ไม่มีจริง → 400 · ใส่ถูก → บันทึกวันที่ + จดในประวัติ', async () => {
    const id = await mk('ผู้ป่วย วันที่ 1');
    assert.equal((await tr(id, 'CALL')).http, 400);
    assert.equal((await tr(id, 'CALL', { bed_date: day(-1) })).http, 400);
    assert.equal((await tr(id, 'CALL', { bed_date: '2026-02-30' })).http, 400);
    assert.equal((await tr(id, 'CALL', { bed_date: day(0) })).http, 200, 'วันนี้ทำได้');
    assert.equal((await row(id)).bed_date, day(0));
    assert.equal((await tr(id, 'CALL', { bed_date: day(2), note: 'เลื่อนเป็นวันที่ใหม่' })).http, 200);
    const d = (await call('POST', '/request/get', { id }, staffD)).data;
    assert.equal(d.bed_date, day(2));
    assert.match(d.events.at(-1).detail, /เตียงว่างวันที่ .*เลื่อนเป็นวันที่ใหม่/);
  });

  it('การ์ด LINE ตอนเรียกคิว: บอกวันที่เตียงว่าง + 3 ปุ่ม (ยืนยัน / ขอเลื่อนวัน / ไม่ยืนยัน) ป้ายปุ่มไม่เกิน 20 ตัวอักษร', async () => {
    sent = [];
    const id = await mk('ผู้ป่วย วันที่ 2');
    await tr(id, 'CALL', { bed_date: day(2) });
    await waitSent(1);
    const msg = sent[0]!.body.messages[0];
    const text = JSON.stringify(msg);
    assert.ok(text.includes('เตียงว่างรับวันที่') && /2569|25\d\d/.test(text));
    for (const a of ['confirm', 'defer', 'decline']) assert.ok(text.includes(`a=${a}&r=${id}`), `ขาดปุ่ม ${a}`);
    const labels: string[] = msg.contents.footer.contents.map((b: any) => b.action.label);
    assert.ok(labels.every((l) => [...l].length <= 20), `ป้ายปุ่มยาวเกิน: ${labels.join(' | ')}`);
    assert.deepEqual(labels, ['ส่งตามวันที่แจ้ง', 'ยังส่ง ขอเลื่อนวัน', 'ไม่ส่งแล้ว'], 'มี 3 ปุ่มตอบพอดี ไม่มีปุ่มเปิดเว็บซ้ำ');
    assert.ok(!text.includes('กดตอบ') && text.includes('กรุณาตอบภายใน'), 'ข้อความสั้น ไม่อธิบายปุ่มซ้ำ');
    assert.ok(!text.includes('ผู้ป่วย วันที่ 2'), 'ห้ามมีชื่อผู้ป่วย');
  });

  it('กด "ส่งได้ แต่ขอเลื่อนวัน" → NEED_DATE · ขึ้นบอร์ดพร้อมวันที่เดิม · ยังนับเป็นคำขอเปิด (ส่งซ้ำไม่ได้) · ปุ่มกดซ้ำไม่พัง', async () => {
    const id = await mk('ผู้ป่วย วันที่ 3');
    await tr(id, 'CALL', { bed_date: day(2) });
    sent = [];
    assert.equal((await postback(uid, `a=defer&r=${id}`)).status, 200);
    await waitSent(1);
    assert.ok(JSON.stringify(sent[0]!.body.messages).includes('โทรกลับ'));
    const r = await row(id);
    assert.equal(r.status, 'NEED_DATE');
    assert.equal(r.bed_date, day(2), 'ยังเก็บวันที่ที่เสนอไว้อ้างอิง');
    assert.ok(r.responded_at);
    const board = (await call('POST', '/request/board', {}, staffD)).data.items.find((x: any) => x.id === id);
    assert.equal(board.status, 'NEED_DATE');
    assert.equal(board.overdue, false);
    assert.equal(board.position_all, null);
    assert.equal((await call('POST', '/request/add', { hospital_id: hosp, requester_id: rid, requester_name: 'x', patient_name: 'ผู้ป่วย วันที่ 3' }, staffD)).http, 409);
    sent = [];
    await postback(uid, `a=defer&r=${id}`);
    await waitSent(1);
    assert.ok(JSON.stringify(sent[0]!.body.messages).includes('ทำรายการไม่ได้'));
    const ev = (await call('POST', '/request/get', { id }, staffD)).data.events.map((e: any) => e.event);
    assert.deepEqual(ev, ['SUBMITTED', 'CALLED', 'DEFERRED']);
  });

  it('บันทึกวันที่ตกลงกัน (จาก NEED_DATE): ต้องมีวันที่ → CONFIRMED + แจ้ง LINE พร้อมวันที่และชื่อเจ้าหน้าที่ผู้ยืนยัน', async () => {
    const id = await mk('ผู้ป่วย วันที่ 4');
    await tr(id, 'CALL', { bed_date: day(2) });
    await tr(id, 'DEFER');
    assert.equal((await tr(id, 'CONFIRM')).http, 400, 'ต้องระบุวันที่ที่ตกลงกัน');
    assert.equal((await tr(id, 'CONFIRM', { bed_date: day(-2) })).http, 400);
    sent = [];
    assert.equal((await tr(id, 'CONFIRM', { bed_date: day(5), via: 'PHONE', note: 'โทรนัดแล้ว' })).http, 200);
    const r = await row(id);
    assert.equal(r.status, 'CONFIRMED');
    assert.equal(r.bed_date, day(5));
    assert.equal(r.resolved_via, 'PHONE');
    await waitSent(1);
    const text = JSON.stringify(sent[0]!.body.messages);
    assert.ok(text.includes('ขอยืนยันการจองคิว') && text.includes(`BQ${String(id).padStart(6, '0')}`));
    assert.ok(text.includes('เจ้าหน้าที่ทดสอบ widget'), 'ต้องมีชื่อเจ้าหน้าที่ผู้ยืนยัน');
    assert.ok(!text.includes('ผู้ป่วย วันที่ 4'));
    const last = (await call('POST', '/request/get', { id }, staffD)).data.events.at(-1);
    assert.equal(last.event, 'CONFIRMED');
    assert.match(last.detail, /วันที่ส่งตัว .*เดิมเสนอ .*โทรนัดแล้ว/);
    assert.equal((await db('notification_log').where({ request_id: id, type: 'CONFIRMED' }).first()).status, 'SENT');
  });

  it('ยืนยันจากสถานะ "เรียกแล้ว" ตามวันที่เสนอ → ไม่ส่งข้อความซ้ำ · เปลี่ยนวันตอนยืนยัน → ส่งข้อความยืนยันวันใหม่', async () => {
    const a = await mk('ผู้ป่วย วันที่ 5');
    await tr(a, 'CALL', { bed_date: day(2) });
    sent = [];
    assert.equal((await tr(a, 'CONFIRM', { via: 'PHONE' })).http, 200);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(sent.length, 0);
    assert.equal((await row(a)).bed_date, day(2));
    const b = await mk('ผู้ป่วย วันที่ 6');
    await tr(b, 'CALL', { bed_date: day(2) });
    sent = [];
    assert.equal((await tr(b, 'CONFIRM', { via: 'PHONE', bed_date: day(4) })).http, 200);
    await waitSent(1);
    assert.ok(JSON.stringify(sent[0]!.body.messages).includes('ขอยืนยันการจองคิว'));
    assert.equal((await row(b)).bed_date, day(4));
  });

  it('จาก NEED_DATE: เรียกใหม่ด้วยวันใหม่ได้ · คืนคิวได้ (วันที่ถูกล้าง) · ไม่ยืนยัน/ยกเลิกได้ · ขอเลื่อนวันได้เฉพาะตอนเรียกแล้ว', async () => {
    const a = await mk('ผู้ป่วย วันที่ 7');
    assert.equal((await tr(a, 'DEFER')).http, 409, 'ยังไม่ได้เรียก');
    await tr(a, 'CALL', { bed_date: day(1) });
    await tr(a, 'DEFER');
    assert.equal((await tr(a, 'DEFER')).http, 409);
    assert.equal((await tr(a, 'CALL', { bed_date: day(6) })).http, 200);
    let r = await row(a);
    assert.equal(r.status, 'CALLED');
    assert.equal(r.bed_date, day(6));
    assert.equal(r.responded_at, null);
    await tr(a, 'DEFER');
    assert.equal((await tr(a, 'REQUEUE')).http, 200);
    r = await row(a);
    assert.equal(r.status, 'WAITING');
    assert.equal(r.bed_date, null);
    const b = await mk('ผู้ป่วย วันที่ 8');
    await tr(b, 'CALL', { bed_date: day(1) });
    await tr(b, 'DEFER');
    assert.equal((await tr(b, 'DECLINE')).http, 200);
    const c = await mk('ผู้ป่วย วันที่ 9');
    await tr(c, 'CALL', { bed_date: day(1) });
    await tr(c, 'DEFER');
    assert.equal((await tr(c, 'CANCEL')).http, 200);
  });

  it('ผู้ขอตอบ DEFER ผ่าน API (answer) · ไม่ส่งคำตอบ → 400 · dashboard นับรอนัดวัน · ส่งออก Excel มีคอลัมน์วันที่เตียง', async () => {
    const mid = (await call('POST', '/dev/mock/create', { full_name: 'ผู้ขอจำลอง วันที่', hospital_code: '11206', hospital_name: 'รพ.สงขลา', phone: '0800000099' })).data.id as number;
    const sub = await call('POST', '/dev/as/submit', { requester_id: mid, request: { patient_name: 'ผู้ป่วย วันที่ 11', color_code: 'GREEN' } });
    assert.equal(sub.http, 201);
    await tr(sub.data.id, 'CALL', { bed_date: day(3) });
    assert.equal((await call('POST', '/dev/as/respond', { requester_id: mid, id: sub.data.id })).http, 400, 'ไม่ส่งคำตอบ → 400');
    const r1 = await call('POST', '/dev/as/respond', { requester_id: mid, id: sub.data.id, answer: 'DEFER' });
    assert.equal(r1.http, 200, JSON.stringify(r1.data));
    assert.equal((await row(sub.data.id)).status, 'NEED_DATE');
    assert.ok((await call('POST', '/dashboard/summary', {})).data.queue.need_date >= 1);

    const res = await fetch(`${base}/export/build`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ sections: ['requests', 'events'], scope: 'all' }) });
    assert.equal(res.status, 200);
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as any);
    const ws = wb.getWorksheet('คำขอ')!;
    const headerRow = ws.getRow(4).values as unknown[];
    assert.ok(headerRow.includes('วันที่เตียงว่าง / วันที่ส่งตัว'));
    const all = JSON.stringify(wb.getWorksheet('ประวัติเหตุการณ์')!.getSheetValues());
    assert.ok(all.includes('ยืนยันจะมา ขอเลื่อนวัน'));
  });

  it('ข้อมูลตัวอย่างสำหรับโชว์ (mock): สร้างครบทุกสถานะ มีวันที่เตียง/ประวัติรอนัดวัน · ลบแล้วไม่เหลือ ไม่แตะข้อมูลอื่น', async () => {
    const { createMock, clearMock } = await import('../src/mockData');
    await clearMock(); // เริ่มจากไม่มีผู้ขอจำลอง (เทสต์ก่อนหน้าสร้างไว้)
    const keep = Number(((await db('bed_request').count({ n: '*' }).first()) as { n: number | string }).n);
    const r = await createMock();
    assert.equal(r.requests, 60);
    const isMock = (q: any) => q.whereIn('requester_id', db('requester').where('line_user_id', 'like', 'MOCK-demo%').select('id'));
    const by = Object.fromEntries((await isMock(db('bed_request')).groupBy('status').select('status').count({ n: '*' })).map((x: any) => [x.status, Number(x.n)]));
    assert.deepEqual(by, { WAITING: 14, CALLED: 5, NEED_DATE: 4, CONFIRMED: 25, DECLINED: 6, CANCELLED: 6 });
    assert.equal((await isMock(db('bed_request')).whereIn('status', ['CALLED', 'NEED_DATE', 'CONFIRMED']).whereNull('bed_date')).length, 0, 'เรียกแล้ว/รอนัดวัน/ยืนยัน ต้องมีวันที่');
    const need = await isMock(db('bed_request')).where({ status: 'NEED_DATE' }).select('id');
    for (const x of need) assert.deepEqual((await db('request_event').where({ request_id: x.id }).orderBy('id')).map((e: any) => e.event), ['SUBMITTED', 'CALLED', 'DEFERRED']);
    // ผู้ลงทะเบียนตัวอย่างโผล่ในหน้า "สมาชิก รพ." (รออนุมัติ 5 / อนุมัติ 2 / ไม่อนุมัติ 2) · รพ. ตัวอย่างมีเขตสุขภาพ
    assert.equal(r.members, 9);
    assert.equal((await call('POST', '/member/pending-count', {})).data.count >= 5, true);
    const demo = (await call('POST', '/member/search', { status: 'PENDING', pageSize: 100 })).data.resultList.filter((m: any) => String(m.hospital_name).includes('ตัวอย่าง'));
    assert.equal(demo.length, 5);
    assert.ok(demo.every((m: any) => m.full_name.includes('ตัวอย่าง')));
    const rej = (await call('POST', '/member/search', { status: 'REJECTED', pageSize: 100 })).data.resultList.find((m: any) => m.decided_note === 'เบอร์โทรไม่ตรงกับ รพ.');
    assert.ok(rej, 'มีตัวอย่างที่ไม่อนุมัติพร้อมเหตุผล');
    assert.equal((await db('hospital').where({ code: '99001' }).first()).health_region, 12);
    // กดอนุมัติ/ไม่อนุมัติตัวอย่างได้ — ระบบจดว่าข้าม (ไม่ส่ง LINE จริง) ไม่ใช่ FAILED
    assert.equal((await call('POST', '/member/approve', { id: demo[0].id })).http, 200);
    const nlog = await db('notification_log').where({ type: 'MEMBER_APPROVED', requester_id: demo[0].id });
    assert.equal(nlog.length === 0 || nlog.every((x: any) => x.status === 'SKIPPED'), true);
    // mock:status นับได้ · ลบแล้วเหลือ 0 · รพ. ตัวอย่างหาย แต่ รพ. จริงที่ไม่ได้อยู่ในชุดตัวอย่างไม่ถูกแตะ
    const { mockStatus } = await import('../src/mockData');
    const st = await mockStatus();
    assert.ok(st.requesters >= 21 && st.requests === 60 && st.hospitals === 8, JSON.stringify(st));
    await db('hospital').insert({ code: '98765', name: 'รพ.จริงห้ามลบ', is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const cleared = await clearMock();
    assert.equal(cleared.requests, 60);
    assert.equal(cleared.hospitals, 8);
    assert.equal(Number(((await db('bed_request').count({ n: '*' }).first()) as { n: number | string }).n), keep);
    assert.deepEqual(await mockStatus(), { requesters: 0, requests: 0, hospitals: 0, total: 0 });
    assert.ok(await db('hospital').where({ code: '98765' }).first(), 'รพ. ที่ไม่ได้อยู่ในชุดตัวอย่างต้องไม่ถูกลบ');
    await db('hospital').where({ code: '98765' }).delete();
  });
});

describe('พอร์ต public (ต่อ tunnel)', () => {
  let pub = '';
  let srv: ReturnType<ReturnType<typeof createApp>['listen']>;
  before(async () => {
    const { createPublicApp } = await import('../src/publicApp');
    srv = createPublicApp().listen(0);
    pub = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  });
  after(() => {
    srv.close();
  });

  it('เปิดเฉพาะ health / webhook / หน้าชั่วคราว', async () => {
    assert.equal((await fetch(`${pub}/api/health`)).status, 200);
    const home = await fetch(`${pub}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type') ?? '', /html/);
    assert.match(home.headers.get('content-security-policy') ?? '', /script-src 'self' https:\/\/static\.line-scdn\.net/, 'LIFF SDK ต้องโหลด client features จาก LINE ได้');
    assert.ok(!(await home.text()).includes('/admin'), 'หน้าผู้ขอต้องไม่อ้างถึงหน้าเจ้าหน้าที่');
    // webhook ถึงตัวตรวจลายเซ็นจริง: ไม่มีลายเซ็น = 401 (หรือ 503 ถ้ายังไม่ตั้ง secret) ไม่ใช่ 404
    const wh = await fetch(`${pub}/api/line/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"events":[]}' });
    assert.ok([401, 503].includes(wh.status), `webhook ตอบ ${wh.status}`);
  });

  it('API/หน้าของเจ้าหน้าที่เข้าไม่ได้ทางพอร์ตนี้ (404) แม้รู้ URL', async () => {
    for (const [method, path] of [['POST', '/api/auth/login'], ['POST', '/api/user/search'], ['POST', '/api/request/search'], ['POST', '/api/setting/list'], ['GET', '/admin'], ['GET', '/admin/connection'], ['GET', '/assets/x.js']] as const) {
      const r = await fetch(pub + path, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
      assert.equal(r.status, 404, `${method} ${path}`);
    }
  });
});

describe('API ผู้ขอผ่าน LINE (พอร์ต public)', () => {
  let pub = '';
  let srv: ReturnType<ReturnType<typeof createApp>['listen']>;
  const realFetch = globalThis.fetch;
  let verifyCalls = 0;
  const fake = (async (url: any, init: any) => {
    if (String(url) !== 'https://api.line.me/oauth2/v2.1/verify') return realFetch(url, init);
    verifyCalls++;
    const p = new URLSearchParams(String(init.body));
    const tok = p.get('id_token') ?? '';
    const exp = Math.floor(Date.now() / 1000) + 3600;
    if (p.get('client_id') !== '2011916507') return { ok: false, status: 400, json: async () => ({ error: 'invalid_request' }) } as Response;
    if (tok === 'tok-A') return { ok: true, status: 200, json: async () => ({ sub: 'U-liff-A', name: 'สมชาย', exp }) } as Response;
    if (tok === 'tok-B') return { ok: true, status: 200, json: async () => ({ sub: 'U-liff-B', name: 'สมหญิง', exp }) } as Response;
    return { ok: false, status: 400, json: async () => ({ error: 'invalid_request', error_description: 'IdToken expired.' }) } as Response;
  }) as typeof fetch;
  const post = async (path: string, body: unknown = {}, token?: string) => {
    const r = await realFetch(`${pub}/api/requester${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { http: r.status, ...((await r.json()) as { status: string; message?: string; data?: any; fields?: any }) };
  };
  const save = (values: Record<string, unknown>) => call('POST', '/setting/save', { values });
  const profile = { full_name: 'สมชาย ใจดี', hospital_code: '11206', hospital_name: 'รพ.สงขลา', phone: '0811112222' };
  const patient = { patient_name: 'ผู้ป่วย ลับมาก', color_code: 'RED', substance_code: 'METH', reason_code: 'OTHER', reason_other: 'ญาติขอใกล้บ้าน' };

  before(async () => {
    const { createPublicApp } = await import('../src/publicApp');
    srv = createPublicApp().listen(0);
    pub = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    globalThis.fetch = fake;
    await save({ connection_mode: 'DEV_TUNNEL', line_login_channel_id: '2011916507', liff_id: '2011916507-abcd' });
    (await import('../src/pages/requester/LineAuth')).clearIdTokenCache();
  });
  after(async () => {
    globalThis.fetch = realFetch;
    srv.close();
    await save({ connection_mode: 'LOCAL', line_login_channel_id: '', liff_id: '' });
  });

  it('boot/ui/lookups เปิดให้ทุกคน (ไม่มีค่าลับ) · คำสั่งอื่นต้องมี token ที่ LINE รับรอง', async () => {
    const boot = await post('/boot');
    assert.equal(boot.data.liff_id, '2011916507-abcd');
    assert.ok(!JSON.stringify(boot).includes('secret'));
    assert.ok((await post('/ui')).data.pdpa_notice.length > 10);
    assert.ok((await post('/lookups')).data.COLOR.length > 0);
    assert.equal((await post('/profile')).http, 401, 'ไม่มี token');
    assert.equal((await post('/profile', {}, 'tok-expired')).http, 401, 'LINE ไม่รับรอง token');
  });

  it('โหมด LOCAL → ปฏิเสธ (403) แม้ token ถูก', async () => {
    await save({ connection_mode: 'LOCAL' });
    (await import('../src/pages/requester/LineAuth')).clearIdTokenCache();
    assert.equal((await post('/profile', {}, 'tok-A')).http, 403);
    await save({ connection_mode: 'DEV_TUNNEL' });
  });

  it('ลงทะเบียน: ต้องรับทราบ PDPA · รหัส+ชื่อ รพ. ต้องตรงรายชื่อกลาง · สมัครแล้วรออนุมัติ ใช้งานไม่ได้จนกว่าเจ้าหน้าที่อนุมัติ', async () => {
    assert.equal((await post('/profile', {}, 'tok-A')).data, null);
    const noPdpa = await post('/save-profile', { profile }, 'tok-A');
    assert.equal(noPdpa.http, 400);
    // รหัสไม่มีในรายชื่อ / ชื่อไม่ตรงกับรหัส → 400 พร้อมบอกชื่อที่ถูกต้อง
    const noCode = await post('/save-profile', { profile: { ...profile, hospital_code: '55555', accept_pdpa: true } }, 'tok-A');
    assert.equal(noCode.http, 400);
    assert.ok(noCode.fields?.hospital_code);
    const wrongName = await post('/save-profile', { profile: { ...profile, hospital_name: 'รพ.หาดใหญ่', accept_pdpa: true } }, 'tok-A');
    assert.equal(wrongName.http, 400);
    assert.ok(String(wrongName.message).includes('รพ.สงขลา'));
    assert.equal(await db('requester').where({ line_user_id: 'U-liff-A' }).first(), undefined, 'ไม่ผ่านตรวจ = ไม่สร้างสมาชิก');
    // ค้นชื่อจากรหัส (เติมชื่อในฟอร์ม) · ชื่อเขียนแบบ "โรงพยาบาล..." ก็ผ่าน
    assert.deepEqual((await post('/hospital-check', { code: '11206' }, 'tok-A')).data, { found: true, name: 'รพ.สงขลา' });
    assert.equal((await post('/hospital-check', { code: '55555' }, 'tok-A')).data.found, false);
    assert.equal((await post('/hospital-check', { code: '11206' })).http, 401, 'ต้องมี token');

    const saved = await post('/save-profile', { profile: { ...profile, hospital_name: 'โรงพยาบาลสงขลา', accept_pdpa: true } }, 'tok-A');
    assert.equal(saved.http, 200);
    assert.equal(saved.data.approval_status, 'PENDING');
    assert.equal((await db('requester').where({ line_user_id: 'U-liff-A' }).first()).display_name, 'สมชาย');
    assert.equal((await post('/profile', {}, 'tok-A')).data.approval_status, 'PENDING', 'ดูโปรไฟล์ตัวเองได้ขณะรออนุมัติ');
    assert.equal((await post('/submit', { request: patient }, 'tok-A')).http, 403, 'รออนุมัติ = ส่งคำขอไม่ได้');
    assert.equal((await post('/mine', {}, 'tok-A')).http, 403);

    // เจ้าหน้าที่เห็นในหน้าสมาชิก → อนุมัติ
    assert.equal((await call('POST', '/member/pending-count', {})).data.count, 1);
    const list = (await call('POST', '/member/search', { status: 'PENDING' })).data.resultList as any[];
    assert.equal(list.length, 1);
    assert.equal(list[0].hospital_code, '11206');
    // อนุมัติแล้วระบบแจ้งผู้ลงทะเบียนทาง LINE (จำลองเซิร์ฟเวอร์ LINE) · กดอนุมัติซ้ำไม่แจ้งซ้ำ
    const prevFetch = globalThis.fetch;
    const pushes: { to: string; messages: unknown[] }[] = [];
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url) !== 'https://api.line.me/v2/bot/message/push') return prevFetch(url, init);
      pushes.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as typeof fetch;
    await save({ line_channel_token: 'tok-M' });
    try {
      assert.equal((await call('POST', '/member/approve', { id: list[0].id })).http, 200);
      assert.equal(pushes.length, 1);
      assert.equal(pushes[0]!.to, 'U-liff-A');
      const text = JSON.stringify(pushes[0]!.messages[0]);
      assert.ok(text.includes('อนุมัติแล้ว') && text.includes('รพ.สงขลา'));
      const approvedLogs = await db('notification_log').where({ type: 'MEMBER_APPROVED', requester_id: list[0].id });
      assert.equal(approvedLogs.length, 1);
      assert.equal(approvedLogs[0].status, 'SENT');
      assert.equal(approvedLogs[0].request_id, null);
      assert.equal((await call('POST', '/member/approve', { id: list[0].id })).http, 200);
      assert.equal(pushes.length, 1, 'อนุมัติซ้ำไม่ส่งซ้ำ');
      // ไม่อนุมัติ → แจ้งผู้ลงทะเบียนพร้อมเหตุผล (ถ้ากรอก) · กดซ้ำไม่แจ้งซ้ำ · ไม่กรอกเหตุผลไม่มีบรรทัดว่าง · แล้วอนุมัติกลับเพื่อให้เทสต์ถัดไปทำงานต่อ
      assert.equal((await call('POST', '/member/reject', { id: list[0].id, note: 'เบอร์โทรไม่ตรงกับ รพ.' })).http, 200);
      assert.equal(pushes.length, 2);
      const rej = JSON.stringify(pushes[1]!.messages[0]);
      assert.ok(rej.includes('ยังไม่ได้รับอนุมัติ') && rej.includes('เหตุผล: เบอร์โทรไม่ตรงกับ รพ.'), rej);
      assert.equal((await call('POST', '/member/reject', { id: list[0].id, note: 'ซ้ำ' })).http, 200);
      assert.equal(pushes.length, 2, 'ไม่อนุมัติซ้ำไม่ส่งซ้ำ');
      assert.equal((await db('notification_log').where({ type: 'MEMBER_REJECTED', requester_id: list[0].id })).length, 1);
      assert.equal((await call('POST', '/member/approve', { id: list[0].id })).http, 200);
      assert.equal(pushes.length, 3, 'อนุมัติกลับหลังไม่อนุมัติ = สถานะเปลี่ยนจริง ส่งอีกครั้ง');
      assert.equal((await call('POST', '/member/reject', { id: list[0].id })).http, 200);
      assert.ok(!JSON.stringify(pushes[3]!.messages[0]).includes('เหตุผล:'), 'ไม่กรอกเหตุผลไม่แสดงหัวข้อเหตุผล');
      assert.equal((await call('POST', '/member/approve', { id: list[0].id })).http, 200);
    } finally {
      globalThis.fetch = prevFetch;
      await save({ line_channel_token: '' });
    }
    assert.equal((await call('POST', '/member/pending-count', {})).data.count, 0);
    const prof = (await post('/profile', {}, 'tok-A')).data;
    assert.equal(prof.approval_status, 'APPROVED');

    const sub = await post('/submit', { request: patient }, 'tok-A');
    assert.equal(sub.http, 201);
    const mineA = (await post('/mine', {}, 'tok-A')).data;
    assert.equal(mineA.find((x: any) => x.id === sub.data.id).status, 'WAITING');
    assert.ok(mineA.every((x: any) => x.hospital_id === prof.hospital_id), 'เห็นเฉพาะคำขอของ รพ. ตัวเอง (ร่วมกับเพื่อนร่วม รพ.)');

    // ผู้ใช้อีกคน (รพ.อื่น): ต้องลงทะเบียน+อนุมัติก่อน แล้วมองไม่เห็น/ยกเลิกคำขอของ รพ.สงขลาไม่ได้ ต่อให้ส่ง requester_id/line_user_id ปลอมมาใน body
    assert.equal((await post('/mine', { line_user_id: 'U-liff-A', requester_id: saved.data.id }, 'tok-B')).http, 400, 'ยังไม่ลงทะเบียน');
    const other = await post('/save-profile', { profile: { ...profile, full_name: 'สมหญิง', hospital_code: '99998', hospital_name: 'รพ.อื่นทดสอบ', accept_pdpa: true } }, 'tok-B');
    assert.equal(other.http, 200);
    assert.equal((await post('/mine', {}, 'tok-B')).http, 403, 'รออนุมัติ');
    await call('POST', '/member/approve', { id: other.data.id });
    assert.equal((await post('/mine', { line_user_id: 'U-liff-A' }, 'tok-B')).data.length, 0);
    assert.equal((await post('/cancel', { id: sub.data.id }, 'tok-B')).http, 404);
    assert.equal((await post('/respond', { id: sub.data.id, accept: true }, 'tok-B')).http, 404);

    assert.equal((await call('POST', '/member/reject', { id: other.data.id, note: 'ไม่ใช่เจ้าหน้าที่' })).http, 200);
    assert.equal((await post('/mine', {}, 'tok-B')).http, 403, 'ถูกไม่อนุมัติ = ใช้ไม่ได้');
    assert.ok(String((await post('/mine', {}, 'tok-B')).message).includes('ไม่ใช่เจ้าหน้าที่'));

    assert.equal((await post('/cancel', { id: sub.data.id }, 'tok-A')).http, 200);
    assert.equal((await call('POST', '/member/approve', { id: 999999 })).http, 404);
    // ผู้ขอจำลองของ dev ไม่โผล่ในหน้าสมาชิก/อนุมัติไม่ได้
    const mockId = (await call('POST', '/dev/mock/create', { full_name: 'จำลอง', hospital_code: '11206', hospital_name: 'รพ.สงขลา', phone: '0800000055' })).data.id as number;
    assert.ok(!((await call('POST', '/member/search', {})).data.resultList as any[]).some((m) => m.id === mockId), 'ผู้ขอจำลองไม่โผล่ในหน้าสมาชิก');
    assert.equal((await call('POST', '/member/approve', { id: mockId })).http, 404);
    // อนุมัติแล้ว: ชื่อ-สกุล/รพ. แก้เองไม่ได้ (บังคับที่เซิร์ฟเวอร์) · เบอร์ใหม่ = ส่งเป็นคำขอ ให้เจ้าหน้าที่อนุมัติ
    const own = (await post('/profile', {}, 'tok-A')).data;
    assert.equal(own.locked, true);
    const tryMove = await post('/save-profile', { profile: { ...profile, hospital_code: '99998', hospital_name: 'รพ.อื่นทดสอบ', accept_pdpa: true } }, 'tok-A');
    assert.equal(tryMove.http, 400);
    assert.ok(tryMove.fields?.hospital_code);
    const tryName = await post('/save-profile', { profile: { ...profile, full_name: 'ชื่อใหม่', hospital_name: 'รพ.สงขลา', accept_pdpa: true } }, 'tok-A');
    assert.equal(tryName.http, 400);
    assert.ok(tryName.fields?.full_name);
    const after = await db('requester').where({ id: own.id }).first();
    assert.equal(after.approval_status, 'APPROVED');
    assert.equal(after.full_name, 'สมชาย ใจดี');
    assert.equal(after.hospital_id, own.hospital_id, 'ย้าย รพ. เองไม่ได้');
    // เบอร์สำรองที่ยังว่าง เติมได้เลยไม่ต้องรออนุมัติ
    const fill = await post('/save-profile', { profile: { ...profile, hospital_name: 'รพ.สงขลา', phone2: '0877776666', accept_pdpa: true } }, 'tok-A');
    assert.equal(fill.data.phone2, '0877776666');
    assert.equal(fill.data.pending_phone, null);
    const phoneReq = await post('/save-profile', { profile: { ...profile, hospital_name: 'รพ.สงขลา', phone: '0899998888', accept_pdpa: true } }, 'tok-A');
    assert.equal(phoneReq.http, 200);
    assert.equal(phoneReq.data.phone, '0811112222', 'ยังใช้เบอร์เดิมจนกว่าจะอนุมัติ');
    assert.equal(phoneReq.data.pending_phone, '0899998888');
    assert.equal((await call('POST', '/member/pending-count', {})).data.count, 1, 'คำขอเปลี่ยนเบอร์นับในป้ายเตือน');
    const pend = (await call('POST', '/member/search', { status: 'PHONE' })).data.resultList as any[];
    assert.equal(pend.length, 1);
    assert.equal(pend[0].pending_phone, '0899998888');
    // ไม่อนุมัติ → คงเบอร์เดิม · ส่งใหม่แล้วอนุมัติ → ใช้เบอร์ใหม่
    assert.equal((await call('POST', '/member/reject-phone', { id: own.id })).http, 200);
    assert.equal((await db('requester').where({ id: own.id }).first()).phone, '0811112222');
    assert.equal((await call('POST', '/member/reject-phone', { id: own.id })).http, 400, 'ไม่มีคำขอค้าง');
    await post('/save-profile', { profile: { ...profile, hospital_name: 'รพ.สงขลา', phone: '0899998888', accept_pdpa: true } }, 'tok-A');
    assert.equal((await call('POST', '/member/approve-phone', { id: own.id })).http, 200);
    const np = await db('requester').where({ id: own.id }).first();
    assert.equal(np.phone, '0899998888');
    assert.equal(np.phone_change_at, null);
    // ส่งเบอร์เดิมกลับมาตรง ๆ = ไม่มีคำขอค้าง
    const noChange = await post('/save-profile', { profile: { ...profile, hospital_name: 'รพ.สงขลา', phone: '0899998888', accept_pdpa: true } }, 'tok-A');
    assert.equal(noChange.data.pending_phone, null);
    // เจ้าหน้าที่ย้าย รพ./แก้ชื่อให้ (ต้องตรงรายชื่อกลาง) — สถานะอนุมัติคงเดิม
    assert.equal((await call('POST', '/member/update', { id: own.id, full_name: 'สมชาย ใจดี', hospital_code: '99998', hospital_name: 'รพ.ผิด', phone: '0899998888' })).http, 400);
    assert.equal((await call('POST', '/member/update', { id: own.id, full_name: 'สมชาย ใจดี', hospital_code: '99998', hospital_name: 'รพ.อื่นทดสอบ', phone: '0899998888' })).http, 200);
    const moved = await db('requester').where({ id: own.id }).first();
    assert.equal(moved.approval_status, 'APPROVED');
    assert.notEqual(moved.hospital_id, own.hospital_id);
    // ก่อนอนุมัติ (ไม่ถูกล็อก) ยังแก้ได้ทุกช่อง: ไม่อนุมัติแล้วแก้ รพ. ที่พิมพ์ผิดได้
    assert.equal((await call('POST', '/member/reject', { id: own.id, note: 'x' })).http, 200);
    assert.equal((await post('/profile', {}, 'tok-A')).data.locked, false);
    assert.equal((await post('/save-profile', { profile: { ...profile, hospital_code: '11206', hospital_name: 'รพ.สงขลา', accept_pdpa: true } }, 'tok-A')).http, 200);
    await call('POST', '/member/approve', { id: own.id });
    await call('POST', '/member/update', { id: own.id, full_name: 'สมชาย ใจดี', hospital_code: '99998', hospital_name: 'รพ.อื่นทดสอบ', phone: '0811112222' });
  });

  it('เลือก "อื่น ๆ" ต้องพิมพ์รายละเอียด · เลือกอย่างอื่นระบบล้างทิ้ง · แสดงในรายการและส่งออก', async () => {
    const no = await post('/submit', { request: { patient_name: 'ผู้ป่วยอื่นๆ ก', substance_code: 'OTHER', reason_code: 'OTHER' } }, 'tok-A');
    assert.equal(no.http, 400);
    assert.ok(no.fields?.substance_other && no.fields?.reason_other);
    const ok = await post('/submit', { request: { patient_name: 'ผู้ป่วยอื่นๆ ข', substance_code: 'OTHER', substance_other: 'ยานอนหลับ, กัญชา', reason_code: 'BEYOND_CAPACITY', reason_other: 'ควรถูกล้างทิ้ง' } }, 'tok-A');
    assert.equal(ok.http, 201);
    const row = await db('bed_request').where({ id: ok.data.id }).first();
    assert.equal(row.substance_other, 'ยานอนหลับ, กัญชา');
    assert.equal(row.reason_other, null, 'เหตุผลไม่ใช่อื่น ๆ → ไม่เก็บรายละเอียด');
    const tooLong = await post('/submit', { request: { patient_name: 'ผู้ป่วยอื่นๆ ค', substance_code: 'OTHER', substance_other: 'ก'.repeat(201) } }, 'tok-A');
    assert.equal(tooLong.http, 400);
    const detail = (await call('POST', '/request/get', { id: ok.data.id })).data;
    assert.equal(detail.substance_other, 'ยานอนหลับ, กัญชา');
    // เจ้าหน้าที่แก้เป็นสารอื่น → ล้างรายละเอียดเดิม
    const upd = await call('POST', '/request/update', { id: ok.data.id, hospital_id: row.hospital_id, requester_name: row.requester_name, patient_name: row.patient_name, substance_code: 'METH' });
    assert.equal(upd.http, 200);
    assert.equal((await db('bed_request').where({ id: ok.data.id }).first()).substance_other, null);
    await post('/cancel', { id: ok.data.id }, 'tok-A');
  });

  it('จำผลตรวจ token ไว้ ไม่เรียก LINE ซ้ำทุกคำสั่ง', async () => {
    verifyCalls = 0;
    await post('/profile', {}, 'tok-A');
    await post('/mine', {}, 'tok-A');
    await post('/mine', {}, 'tok-A');
    assert.equal(verifyCalls, 0, 'tok-A ถูกจำไว้แล้วจากเทสต์ก่อนหน้า');
  });
});

describe('โรงพยาบาล: เขตสุขภาพ + นำเข้า Excel (แม่แบบ → ดูตัวอย่าง → ยืนยัน)', () => {
  const ExcelJS = async () => (await import('exceljs')).default;
  /** สร้างไฟล์ xlsx จากแถว (แถวแรกคือหัวตาราง) แล้วแปลงเป็น base64 ตามที่หน้าเว็บส่ง */
  const xlsxBase64 = async (rows: (string | number | null)[][], sheetFirst = true) => {
    const E = await ExcelJS();
    const wb = new E.Workbook();
    if (!sheetFirst) wb.addWorksheet('อื่น');
    const ws = wb.addWorksheet('รายชื่อ');
    rows.forEach((r) => ws.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  };
  const HEAD = ['รหัสโรงพยาบาล', 'ชื่อโรงพยาบาล', 'เขตสุขภาพ', 'สถานะ'];
  const prev = (file_base64: string) => call('POST', '/hospital/import-preview', { filename: 't.xlsx', file_base64 });
  const commit = (file_base64: string) => call('POST', '/hospital/import-commit', { filename: 't.xlsx', file_base64 });

  it('เพิ่ม/แก้ รพ. พร้อมเขตสุขภาพ 1-14 (ว่างได้ · นอกช่วง 400)', async () => {
    const add = await call('POST', '/hospital/add', { code: '20001', name: 'รพ.ทดสอบเขต', health_region: 12 });
    assert.equal(add.http, 201);
    assert.equal((await call('POST', '/hospital/get', { id: add.data.id })).data.health_region, 12);
    assert.equal((await call('POST', '/hospital/add', { code: '20002', name: 'รพ.ไม่มีเขต', health_region: '' })).http, 201);
    assert.equal((await call('POST', '/hospital/add', { code: '20003', name: 'x', health_region: 15 })).http, 400);
    assert.equal((await call('POST', '/hospital/add', { code: '20003', name: 'x', health_region: 'abc' })).http, 400);
    assert.equal((await call('POST', '/hospital/update', { id: add.data.id, code: '20001', name: 'รพ.ทดสอบเขต', health_region: '', is_active: 'Y' })).http, 200);
    assert.equal((await call('POST', '/hospital/get', { id: add.data.id })).data.health_region, null);
  });

  it('audit log ของการนำเข้า Excel ไม่เก็บเนื้อไฟล์ base64', async () => {
    const b64 = await xlsxBase64([HEAD, ['30001', 'รพ.ทดสอบ audit', 5, 'ใช้งาน']]);
    assert.equal((await prev(b64)).http, 200);
    const row = await db('audit_logs').where({ page: 'hospital' }).orderBy('id', 'desc').first();
    const detail = String(row.detail ?? '');
    assert.ok(detail.includes('ไม่เก็บ'), detail.slice(0, 200));
    assert.ok(!detail.includes(b64.slice(0, 60)), 'ต้องไม่มีเนื้อไฟล์');
    assert.ok(detail.length < 600);
  });

  it('ดาวน์โหลดแม่แบบ (เปล่า / พร้อมรายชื่อปัจจุบัน) · STAFF ใช้ไม่ได้', async () => {
    const E = await ExcelJS();
    const dl = async (with_data: boolean, ck = cookie) => fetch(`${base}/hospital/template`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck }, body: JSON.stringify({ with_data }) });
    const empty = await dl(false);
    assert.equal(empty.status, 200);
    assert.match(empty.headers.get('content-type') ?? '', /spreadsheetml/);
    const wb = new E.Workbook();
    await wb.xlsx.load(Buffer.from(await empty.arrayBuffer()) as any);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['รายชื่อ รพ.', 'คำอธิบาย']);
    assert.equal(wb.worksheets[0]!.getRow(1).getCell(1).value, 'รหัสโรงพยาบาล');
    assert.equal(wb.worksheets[0]!.getRow(2).getCell(1).value, null, 'แม่แบบเปล่ามีแต่หัวตาราง');
    assert.equal(wb.worksheets[0]!.getRow(2).getCell(2).value, null);
    const full = new E.Workbook();
    await full.xlsx.load(Buffer.from(await (await dl(true)).arrayBuffer()) as any);
    assert.ok(full.worksheets[0]!.getRow(2).getCell(1).value, 'มีรายชื่อปัจจุบัน');
    const stf = ((await call('POST', '/auth/login', { username: 'wstaff', password: 'password123' })).headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    assert.equal((await dl(false, stf)).status, 403);
  });

  it('ดูตัวอย่าง: แยก เพิ่มใหม่/อัปเดต/ไม่เปลี่ยน/ผิดพลาด ถูกต้อง · ไม่บันทึกอะไร', async () => {
    const before = Number((await db('hospital').count({ n: '*' }).first() as any).n);
    const file = await xlsxBase64([
      ['รายการนำเข้า (บรรทัดหัวเรื่อง ให้ข้าม)'],
      HEAD,
      ['30001', 'รพ.ใหม่ หนึ่ง', 11, 'ใช้งาน'],
      [30002, 'รพ.ใหม่ สอง (เลขล้วน)', '', ''], // ไม่มีเขต/สถานะ = ใช้งาน
      ['20001', 'รพ.ทดสอบเขต (ชื่อใหม่)', 5, 'ปิด'], // อัปเดตของเดิม
      ['11206', 'รพ.สงขลา', null, null], // เหมือนเดิม (ไม่มีเขต)
      ['123456', 'รหัสยาวไป', 1, ''],
      ['ABCDE', 'รหัสไม่ใช่เลข', 1, ''],
      ['30003', '', 1, ''],
      ['30004', 'เขตผิด', 99, ''],
      ['30005', 'สถานะผิด', 1, 'บางที'],
      ['30001', 'รหัสซ้ำในไฟล์', 1, ''],
      [null, null, null, null], // แถวว่างข้าม
    ]);
    const r = await prev(file);
    assert.equal(r.http, 200);
    assert.deepEqual({ t: r.data.total, n: r.data.new_count, u: r.data.update_count, s: r.data.same_count, e: r.data.error_count }, { t: 10, n: 2, u: 1, s: 1, e: 6 });
    assert.equal(r.data.rows[0].action, 'ERROR', 'แถวผิดพลาดขึ้นก่อน');
    assert.ok(r.data.rows.find((x: any) => x.code === '30001' && x.action === 'ERROR').message.includes('ซ้ำ'));
    assert.equal(r.data.rows.find((x: any) => x.code === '30002').code, '30002');
    assert.equal(Number((await db('hospital').count({ n: '*' }).first() as any).n), before, 'preview ต้องไม่บันทึก');
  });

  it('ยืนยันนำเข้า: เพิ่ม/อัปเดตเฉพาะแถวที่ถูกต้อง · เติม 0 นำหน้า · บันทึกประวัติ · นำเข้าซ้ำ = ไม่เปลี่ยน', async () => {
    const file = await xlsxBase64([
      HEAD,
      ['30001', 'รพ.ใหม่ หนึ่ง', 11, 'ใช้งาน'],
      [1234, 'รพ.รหัสสั้น (เติม 0)', 2, ''],
      ['20001', 'รพ.ทดสอบเขต (ชื่อใหม่)', 5, 'ปิด'],
      ['ABCDE', 'ผิด', 1, ''],
    ]);
    const r = await commit(file);
    assert.equal(r.http, 200);
    assert.deepEqual(r.data, { total: 4, created: 2, updated: 1, unchanged: 0, skipped_errors: 1 });
    const h = async (code: string) => db('hospital').where({ code }).first();
    assert.equal((await h('30001')).health_region, 11);
    assert.equal((await h('01234')).name, 'รพ.รหัสสั้น (เติม 0)');
    const upd = await h('20001');
    assert.equal(upd.name, 'รพ.ทดสอบเขต (ชื่อใหม่)');
    assert.equal(upd.health_region, 5);
    assert.ok(!upd.is_active);
    assert.equal(await h('ABCDE'), undefined);
    const batch = await db('import_batch').orderBy('id', 'desc').first();
    assert.deepEqual({ t: batch.total_rows, i: batch.imported, s: batch.skipped }, { t: 4, i: 3, s: 1 });
    const again = await commit(file);
    assert.deepEqual(again.data, { total: 4, created: 0, updated: 0, unchanged: 3, skipped_errors: 1 });
  });

  it('ไฟล์ผิด: ไม่ใช่ Excel / ไม่มีหัวตาราง / ไม่มีข้อมูล / ใหญ่เกิน / ไม่ได้ส่งไฟล์ → 400 ข้อความชัดเจน · STAFF 403', async () => {
    const notExcel = await prev(Buffer.from('นี่ไม่ใช่ excel').toString('base64'));
    assert.equal(notExcel.http, 400);
    assert.ok(notExcel.message!.includes('.xlsx'));
    const noHead = await prev(await xlsxBase64([['a', 'b'], ['1', '2']]));
    assert.equal(noHead.http, 400);
    assert.ok(noHead.message!.includes('หัวตาราง'));
    const noData = await prev(await xlsxBase64([HEAD]));
    assert.equal(noData.http, 400);
    assert.equal((await prev('A'.repeat(900_001))).http, 400);
    assert.equal((await call('POST', '/hospital/import-preview', {})).http, 400);
    const stf = ((await call('POST', '/auth/login', { username: 'wstaff', password: 'password123' })).headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    assert.equal((await call('POST', '/hospital/import-commit', { file_base64: await xlsxBase64([HEAD, ['30009', 'x', 1, '']]) }, stf)).http, 403);
    assert.equal(await db('hospital').where({ code: '30009' }).first(), undefined);
  });

  it('หัวตารางไม่ต้องเรียงตามแม่แบบ และอยู่ชีตแรกเท่านั้น · ชื่อ รพ. ที่ผ่านนำเข้าใช้ตรวจตอนสมัครได้ (โรงพยาบาล = รพ.)', async () => {
    const file = await xlsxBase64([['ชื่อโรงพยาบาล', 'สถานะ', 'รหัสโรงพยาบาล'], ['รพ.สลับคอลัมน์', 'ใช้งาน', '30010']]);
    assert.equal((await commit(file)).data.created, 1);
    const { hospitalService } = await import('../src/pages/hospital');
    assert.ok((await hospitalService.verify('30010', 'โรงพยาบาลสลับคอลัมน์')) > 0);
    await assert.rejects(() => hospitalService.verify('30010', 'รพ.อื่น'));
    await assert.rejects(() => hospitalService.verify('20001', 'รพ.ทดสอบเขต (ชื่อใหม่)'), /ไม่พบรหัส/); // ปิดใช้งานแล้ว สมัครไม่ได้
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

describe('Dashboard ไม่ต้องล็อกอิน (pubdash) — เฉพาะวงภายใน + ปิดเป็นค่าเริ่มต้น + หน้าอื่นต้องล็อกอินเสมอ', () => {
  const setEnabled = (v: boolean) => call('POST', '/setting/save', { values: { public_dashboard_enabled: v } });
  const anon = (path: string, headers: Record<string, string> = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });

  it('ปิดเป็นค่าเริ่มต้น: status บอกว่าปิด · data ถูกปฏิเสธ 403', async () => {
    const st = await (await anon('/pubdash/status')).json();
    assert.equal(st.data.enabled, false);
    assert.equal((await anon('/pubdash/data')).status, 403);
  });

  it('เปิดสวิตช์แล้วดูได้โดยไม่ล็อกอิน · มีแต่ตัวเลขรวม (ไม่มีชื่อผู้ป่วย/ผู้ขอ/เบอร์) · widget ที่ซ่อนไม่ออก', async () => {
    assert.equal((await setEnabled(true)).http, 200);
    try {
      const res = await anon('/pubdash/data');
      assert.equal(res.status, 200);
      const j = await res.json();
      assert.ok(typeof j.data.summary.queue.waiting === 'number');
      assert.ok(Array.isArray(j.data.widgets));
      assert.ok(j.data.widgets.every((w: any) => w.is_active), 'widget ที่ซ่อนห้ามออก');
      const raw = JSON.stringify(j);
      for (const k of ['patient_name', 'requester_name', 'phone', 'line_user_id', 'password']) assert.ok(!raw.includes(k), `รั่ว: ${k}`);
      assert.equal((await anon('/pubdash/data', { 'content-type': 'application/json' })).status, 200);
      assert.equal((await call('POST', '/pubdash/data', { days: 0 }, false)).http, 400, 'ช่วงเวลาผิดรูปแบบยังตรวจ 400');
    } finally {
      await setEnabled(false);
    }
    assert.equal((await anon('/pubdash/data')).status, 403, 'ปิดสวิตช์แล้วใช้ไม่ได้ทันที');
  });

  it('คำขอที่มี header ของ proxy/tunnel ถูกปฏิเสธ แม้เปิดสวิตช์ (กัน X-Forwarded-For ปลอม และการเอาพอร์ตนี้ไปต่อ tunnel)', async () => {
    await setEnabled(true);
    try {
      for (const h of [{ 'x-forwarded-for': '10.1.2.3' }, { 'x-forwarded-for': '8.8.8.8' }, { 'cf-connecting-ip': '1.2.3.4' }, { 'x-real-ip': '10.0.0.1' }, { forwarded: 'for=10.0.0.1' }, { 'cf-ray': 'abc' }] as Record<string, string>[]) {
        assert.equal((await anon('/pubdash/data', h)).status, 403, JSON.stringify(h));
        assert.equal((await anon('/pubdash/status', h)).status, 403, JSON.stringify(h));
      }
    } finally {
      await setEnabled(false);
    }
  });

  it('ตรวจที่อยู่ภายใน: 10/8 172.16/12 192.168/16 127/8 ::1 fe80 fc00 ผ่าน · IP สาธารณะ/รูปแบบแปลกไม่ผ่าน', async () => {
    const { isPrivateIp } = await import('../src/pages/pubdash/LanGuard');
    for (const ip of ['10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.50', '127.0.0.1', '::1', '::ffff:192.168.0.9', 'fe80::1', 'fd12:3456::1']) assert.equal(isPrivateIp(ip), true, ip);
    for (const ip of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.0.1', '11.0.0.1', '100.64.0.1', '2001:db8::1', '10.0.0.256', '', 'abc']) assert.equal(isPrivateIp(ip), false, ip);
    assert.equal(isPrivateIp(undefined), false);
  });

  it('ทุกหน้าของเจ้าหน้าที่ยังต้องล็อกอิน (401) · หน้าที่ไม่ตรวจ session ต้องเป็นรายการที่ตั้งใจเท่านั้น', async () => {
    const { pages } = await import('../src/pages');
    assert.deepEqual(
      pages.filter((p) => p.access === 'public').map((p) => p.name).sort(),
      ['line', 'pubdash', 'requester'],
      'มีหน้าใหม่ที่ตั้ง access: public — ต้องตรวจสิทธิ์เองและแก้รายการนี้อย่างตั้งใจ',
    );
    await setEnabled(true); // เปิดสวิตช์ไว้ระหว่างตรวจ เพื่อพิสูจน์ว่าการเปิด pubdash ไม่ทำให้หน้าอื่นหลุด
    try {
      for (const p of pages.filter((x) => x.access !== 'public')) {
        for (const action of ['search', 'get', 'add', 'summary', 'widget/data', 'export', 'templates', 'list']) {
          const r = await anon(`/${p.name}/${action}`);
          assert.equal(r.status, 401, `/api/${p.name}/${action} ต้อง 401 เมื่อไม่ล็อกอิน (ได้ ${r.status})`);
        }
      }
      // endpoint ของ dashboard เดิม (ที่ใช้ตอนล็อกอิน) ยังต้องล็อกอิน แม้ pubdash เปิดอยู่
      assert.equal((await anon('/dashboard/summary')).status, 401);
      assert.equal((await anon('/dashboard/widget/data')).status, 401);
      // STAFF ล็อกอินแล้วก็ยังห้ามเรียกของ ADMIN เหมือนเดิม
      assert.equal((await call('POST', '/setting/save', { values: { public_dashboard_enabled: false } }, false)).http, 401);
    } finally {
      await setEnabled(false);
    }
  });

  it('พิมพ์ ip:พอร์ตเฉย ๆ (/) → พาไปหน้าภาพรวมคิว · /admin/overview เปิดได้โดยไม่ล็อกอิน (หน้าเว็บ, ข้อมูลยังถูกคุมด้วย API)', async () => {
    const { default: fs } = await import('node:fs');
    const path = await import('node:path');
    if (!fs.existsSync(path.join(config.frontendDist, 'index.html'))) return; // ยังไม่ได้ build หน้าเว็บ — ข้าม
    const origin = base.replace(/\/api$/, '');
    const root = await fetch(origin + '/', { redirect: 'manual' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/admin/overview?r=1');
    assert.equal((await fetch(origin + '/admin/overview')).status, 200);
  });

  it('พอร์ต public (Cloudflare Tunnel) ไม่มี pubdash · การเปิด/ปิดสวิตช์ถูกบันทึกใน audit · ดู pubdash ไม่ท่วม audit', async () => {
    const { createPublicApp } = await import('../src/publicApp');
    const srv = createPublicApp().listen(0);
    try {
      const pub = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
      for (const a of ['status', 'data']) assert.equal((await fetch(`${pub}/api/pubdash/${a}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404);
    } finally {
      srv.close();
    }
    await new Promise((r) => setTimeout(r, 200));
    const saves = (await db('audit_logs').where({ page: 'setting', status_code: 200 }).whereRaw('detail like ?', ['%public_dashboard_enabled%'])) as any[];
    assert.ok(saves.length >= 2, 'ต้องมีบันทึกการเปิด/ปิดสวิตช์');
    assert.ok(saves.every((r) => r.username), 'ระบุได้ว่าใครเปิด/ปิด');
    assert.equal((await db('audit_logs').where({ page: 'pubdash' })).length, 0);
  });
});
