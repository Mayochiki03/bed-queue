/**
 * NotificationMigration.ts — ตารางข้อความแจ้งเตือน LINE
 *   notification_template  ข้อความแต่ละชนิด (หัวข้อ/เนื้อหา/เปิด-ปิด) — ใส่ค่าตั้งต้นให้ตอนสร้างตาราง
 *   notification_log       ประวัติการส่งทุกครั้ง (ส่งแล้ว / ไม่สำเร็จ / ไม่ได้ส่งเพราะอะไร) ใช้นับโควต้าต่อเดือน
 */
import type { Migration } from '../../core/pages';
import { nowIso } from '../../core/db';
import { TEMPLATE_DEFS } from './Notification';

export const notificationMigrations: Migration[] = [
  {
    name: '20261015_20_notification',
    async up(db) {
      await db.schema.createTable('notification_template', (t) => {
        t.string('type', 30).primary();
        t.string('title', 100).notNullable();
        t.text('body').notNullable();
        t.boolean('is_enabled').notNullable().defaultTo(true);
        t.string('updated_at', 30).notNullable();
        t.integer('updated_by').nullable();
      });
      const now = nowIso();
      await db('notification_template').insert(TEMPLATE_DEFS.map((d) => ({ type: d.type, title: d.title, body: d.body, is_enabled: d.enabled, updated_at: now })));

      await db.schema.createTable('notification_log', (t) => {
        t.increments('id');
        t.integer('request_id').nullable().index();
        t.integer('requester_id').nullable();
        t.string('type', 30).notNullable();
        t.string('channel', 10).notNullable().defaultTo('PUSH');
        t.string('status', 10).notNullable(); // SENT | FAILED | SKIPPED
        t.string('error_message', 500).nullable();
        t.string('created_at', 30).notNullable().index();
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists('notification_log');
      await db.schema.dropTableIfExists('notification_template');
    },
  },
  {
    // ข้อความ "อนุมัติสมาชิก" (v0.9.1) — ตารางสร้างไปแล้วจึงเพิ่มแถวใหม่ที่นี่ (saveTemplate เป็น update ต้องมีแถวก่อน)
    name: '20261019_21_notification_member_approved',
    async up(db) {
      const d = TEMPLATE_DEFS.find((x) => x.type === 'MEMBER_APPROVED')!;
      if (!(await db('notification_template').where({ type: d.type }).first())) await db('notification_template').insert({ type: d.type, title: d.title, body: d.body, is_enabled: d.enabled, updated_at: nowIso() });
    },
    async down(db) {
      await db('notification_template').where({ type: 'MEMBER_APPROVED' }).delete();
    },
  },
  {
    // ข้อความ "ไม่อนุมัติสมาชิก" (v0.10.0)
    name: '20261020_22_notification_member_rejected',
    async up(db) {
      const d = TEMPLATE_DEFS.find((x) => x.type === 'MEMBER_REJECTED')!;
      if (!(await db('notification_template').where({ type: d.type }).first())) await db('notification_template').insert({ type: d.type, title: d.title, body: d.body, is_enabled: d.enabled, updated_at: nowIso() });
    },
    async down(db) {
      await db('notification_template').where({ type: 'MEMBER_REJECTED' }).delete();
    },
  },
];
