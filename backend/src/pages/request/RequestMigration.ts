/**
 * RequestMigration.ts — ตารางของระบบคิวขอเตียง (สำคัญ: knex schema builder เท่านั้น ห้าม ENUM / SQL ดิบ)
 *   requester          ผู้ขอ (เจ้าหน้าที่ รพ.อื่น ลงทะเบียนครั้งเดียวผ่าน LINE)
 *   bed_request        คำขอ 1 แถว = ผู้ป่วย 1 ราย (คิวเรียงตาม submitted_at)
 *   request_event      ประวัติทุกการเปลี่ยนสถานะของคำขอ (ใครทำ เมื่อไหร่ ผ่านช่องทางไหน)
 *   referral           การส่งตัว (เตรียมโครงตารางไว้เฉย ๆ — ยังไม่มีฟังก์ชัน)
 *   import_batch       ประวัติการนำเข้า Excel
 *   line_message_log   บันทึกการส่งข้อความ LINE (ใช้นับโควตา/ดูว่าส่งไม่ออกเพราะอะไร)
 *
 * status ของคำขอ: WAITING รอคิว · CALLED เรียกแล้วรอยืนยัน · CONFIRMED ยืนยันส่งตัว
 *                 DECLINED ไม่ยืนยัน · CANCELLED ยกเลิก
 * (เก็บเป็นข้อความ ตรวจที่ DTO/Service — ไม่ใช้ ENUM เพื่อให้ย้ายฐานข้อมูลได้)
 */
import type { Migration } from '../../core/pages';

export const requestMigrations: Migration[] = [
  {
    name: '20261014_20_requester',
    async up(db) {
      await db.schema.createTable('requester', (t) => {
        t.increments('id');
        t.string('line_user_id', 60).nullable().unique(); // null = บันทึกโดย admin/ข้อมูลนำเข้า (ไม่มี LINE)
        t.string('display_name', 200).nullable();
        t.string('full_name', 120).notNullable();
        // เบอร์เก็บเป็นข้อความอิสระ รองรับเบอร์สำนักงานที่มีเบอร์ต่อ เช่น "0243535646 ต่อ 1275"
        t.string('phone', 50).notNullable(); // เบอร์หลัก
        t.string('phone2', 50).nullable(); // เบอร์สำรอง (เผื่อเบอร์แรกติดต่อไม่ได้)
        t.integer('hospital_id').unsigned().notNullable().references('id').inTable('hospital');
        t.string('pdpa_accepted_at', 30).nullable();
        t.boolean('is_blocked').notNullable().defaultTo(false);
        t.string('last_seen_at', 30).nullable();
        t.string('created_at', 30).notNullable();
        t.string('updated_at', 30).notNullable();
        t.index('hospital_id');
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists('requester');
    },
  },
  {
    name: '20261014_21_import_batch',
    async up(db) {
      await db.schema.createTable('import_batch', (t) => {
        t.increments('id');
        t.string('filename', 200).notNullable();
        t.integer('total_rows').notNullable().defaultTo(0);
        t.integer('imported').notNullable().defaultTo(0);
        t.integer('skipped').notNullable().defaultTo(0);
        t.integer('created_by').nullable();
        t.string('created_at', 30).notNullable();
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists('import_batch');
    },
  },
  {
    name: '20261014_22_bed_request',
    async up(db) {
      await db.schema.createTable('bed_request', (t) => {
        t.increments('id');
        t.string('request_no', 20).nullable().unique(); // BQ000123 — ตั้งหลังรู้ id
        t.integer('requester_id').unsigned().nullable().references('id').inTable('requester');
        t.integer('hospital_id').unsigned().notNullable().references('id').inTable('hospital');
        // snapshot ผู้ขอ ณ ตอนส่ง (ผู้ขอเปลี่ยนเบอร์ทีหลังก็ไม่กระทบประวัติ)
        t.string('requester_name', 120).notNullable();
        t.string('requester_phone', 50).nullable();
        t.string('requester_phone2', 50).nullable();
        // ผู้ป่วย
        t.string('patient_name', 150).notNullable();
        t.string('patient_gender', 10).nullable(); // M | F | O
        t.integer('patient_age').nullable();
        t.string('patient_province', 80).nullable();
        t.string('patient_phone', 50).nullable();
        t.string('color_code', 30).nullable();
        t.string('substance_code', 30).nullable();
        t.string('reason_code', 30).nullable();
        t.text('note').nullable();
        // สถานะ/เวลา
        t.string('status', 20).notNullable().defaultTo('WAITING');
        t.string('submitted_at', 30).notNullable();
        t.string('called_at', 30).nullable();
        t.integer('called_by').nullable();
        t.integer('call_count').notNullable().defaultTo(0);
        t.string('responded_at', 30).nullable();
        t.string('resolved_at', 30).nullable();
        t.integer('resolved_by').nullable();
        t.string('resolved_via', 20).nullable(); // LINE | PHONE | ADMIN
        t.string('source', 10).notNullable().defaultTo('APP'); // APP | ADMIN | IMPORT
        t.integer('import_batch_id').unsigned().nullable().references('id').inTable('import_batch');
        t.string('import_key', 100).nullable().unique(); // กันนำเข้า Excel ซ้ำ
        t.string('created_at', 30).notNullable();
        t.string('updated_at', 30).notNullable();
        t.index('status');
        t.index(['status', 'color_code', 'submitted_at']);
        t.index('hospital_id');
        t.index('requester_id');
        t.index('substance_code');
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists('bed_request');
    },
  },
  {
    name: '20261014_23_request_event',
    async up(db) {
      await db.schema.createTable('request_event', (t) => {
        t.increments('id');
        t.integer('request_id').unsigned().notNullable().references('id').inTable('bed_request').onDelete('CASCADE');
        t.string('event', 30).notNullable(); // SUBMITTED | CALLED | CONFIRMED | DECLINED | CANCELLED | REQUEUED | EDITED ...
        t.string('from_status', 20).nullable();
        t.string('to_status', 20).nullable();
        t.integer('by_user_id').nullable();
        t.string('by_label', 120).nullable(); // ชื่อผู้ทำ (เจ้าหน้าที่/ผู้ขอ/ระบบ)
        t.string('via', 20).nullable(); // LINE | PHONE | ADMIN | SYSTEM
        t.string('detail', 500).nullable();
        t.string('created_at', 30).notNullable();
        t.index('request_id');
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists('request_event');
    },
  },
  {
    name: '20261014_24_referral',
    async up(db) {
      // เตรียมโครงไว้ — ยังไม่ทราบว่าใครเป็นผู้ดำเนินการส่งตัว (ฟังก์ชันค่อยทำทีหลัง)
      await db.schema.createTable('referral', (t) => {
        t.increments('id');
        t.integer('request_id').unsigned().notNullable().unique().references('id').inTable('bed_request').onDelete('CASCADE');
        t.string('status', 20).notNullable().defaultTo('PENDING');
        t.string('scheduled_at', 30).nullable();
        t.string('completed_at', 30).nullable();
        t.string('arranged_by', 120).nullable();
        t.text('detail').nullable();
        t.string('created_at', 30).notNullable();
        t.string('updated_at', 30).notNullable();
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists('referral');
    },
  },
  {
    name: '20261014_25_line_message_log',
    async up(db) {
      await db.schema.createTable('line_message_log', (t) => {
        t.increments('id');
        t.integer('request_id').unsigned().nullable();
        t.string('line_user_id', 60).nullable();
        t.string('kind', 30).notNullable(); // CALL | TEST | REPLY ...
        t.string('status', 20).notNullable(); // SENT | FAILED | SKIPPED_LOCAL | SKIPPED_QUOTA | SKIPPED_NO_LINE
        t.integer('counted').notNullable().defaultTo(0); // นับโควตากี่ข้อความ
        t.string('error', 300).nullable();
        t.string('created_at', 30).notNullable();
        t.index('created_at');
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists('line_message_log');
    },
  },
  {
    name: '20261014_31_request_event_changes',
    async up(db) {
      // เก็บ "ค่าก่อน → ค่าหลัง" ของทุกฟิลด์ที่ถูกแก้ (JSON) — detail เดิมเก็บได้แค่ชื่อฟิลด์
      await db.schema.alterTable('request_event', (t) => {
        t.text('changes').nullable();
      });
    },
    async down(db) {
      await db.schema.alterTable('request_event', (t) => {
        t.dropColumn('changes');
      });
    },
  },
];
