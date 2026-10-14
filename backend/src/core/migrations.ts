/**
 * core/migrations.ts — ตารางของแกนกลาง: users, audit_logs
 *
 * สำคัญ: กฎของ migration (ให้ใช้ได้ทุกฐานข้อมูล): ใช้ knex schema builder เท่านั้น ห้าม ENUM / SQL ดิบ
 *    วันที่-เวลาเก็บเป็นข้อความ ISO (string 30) เหมือนกันทุกฐาน
 */
import type { Migration } from './pages';

export const coreMigrations: Migration[] = [
  {
    name: '20260101_core_users',
    async up(db) {
      await db.schema.createTable('users', (t) => {
        t.increments('id');
        t.string('username', 60).notNullable().unique();
        t.string('password_hash', 100).notNullable();
        t.string('full_name', 120).notNullable();
        t.string('role', 20).notNullable(); // STAFF | ADMIN | DEV  (เพิ่ม role ที่ core/pages.ts)
        t.boolean('is_active').notNullable().defaultTo(true);
        t.string('created_at', 30).notNullable();
        t.string('updated_at', 30).notNullable();
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists('users');
    },
  },
  {
    name: '20260101_core_audit_logs',
    async up(db) {
      await db.schema.createTable('audit_logs', (t) => {
        t.increments('id');
        t.integer('user_id').nullable();
        t.string('username', 60).nullable();
        t.string('page', 60).notNullable(); // ชื่อหน้า เช่น hospital
        t.string('action', 20).notNullable(); // POST | PUT | DELETE | LOGIN | LOGOUT ...
        t.string('path', 200).notNullable();
        t.integer('status_code').notNullable();
        t.string('ip', 60).nullable();
        t.text('detail').nullable(); // body ที่ส่งมา (ตัดรหัสผ่านออกแล้ว) เป็น JSON
        t.string('created_at', 30).notNullable().index();
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists('audit_logs');
    },
  },
  {
    name: '20260101_core_app_setting',
    async up(db) {
      await db.schema.createTable('app_setting', (t) => {
        t.string('key', 60).primary();
        t.text('value').nullable();
        t.string('updated_at', 30).notNullable();
        t.integer('updated_by').nullable();
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists('app_setting');
    },
  },
];
