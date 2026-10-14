/**
 * LookupMigration.ts — ตาราง lookup + ข้อมูลตั้งต้น (สี 4 ระดับ, สารเสพติดทั่วไป, เหตุผลการส่งต่อ)
 * สำคัญ: ใช้ knex schema builder เท่านั้น ห้าม ENUM / SQL ดิบ
 */
import type { Migration } from '../../core/pages';

const SEED = [
  // สี/ระดับผู้ป่วย (ลำดับ = ลำดับคอลัมน์บนบอร์ดคิว)
  { type: 'COLOR', code: 'RED', label: 'แดง', color: '#DC2626', sort_order: 1 },
  { type: 'COLOR', code: 'ORANGE', label: 'ส้ม', color: '#EA580C', sort_order: 2 },
  { type: 'COLOR', code: 'YELLOW', label: 'เหลือง', color: '#CA8A04', sort_order: 3 },
  { type: 'COLOR', code: 'GREEN', label: 'เขียว', color: '#16A34A', sort_order: 4 },
  // สารเสพติด
  { type: 'SUBSTANCE', code: 'METH', label: 'ยาบ้า', color: null, sort_order: 1 },
  { type: 'SUBSTANCE', code: 'ICE', label: 'ไอซ์', color: null, sort_order: 2 },
  { type: 'SUBSTANCE', code: 'ALCOHOL', label: 'สุรา', color: null, sort_order: 3 },
  { type: 'SUBSTANCE', code: 'KRATOM', label: 'กระท่อม', color: null, sort_order: 4 },
  { type: 'SUBSTANCE', code: 'OTHER', label: 'อื่น ๆ', color: null, sort_order: 99 },
  // เหตุผลการส่งต่อ (จากฟอร์มเดิม — แก้/เพิ่มได้ที่หน้าข้อมูลหลัก)
  { type: 'REASON', code: 'APPROPRIATE_TREATMENT', label: 'เพื่อการรักษาที่เหมาะสม', color: null, sort_order: 1 },
  { type: 'REASON', code: 'BEYOND_CAPACITY', label: 'เกินศักยภาพในการดูแล', color: null, sort_order: 2 },
  { type: 'REASON', code: 'PATIENT_REQUEST', label: 'เป็นความต้องการของผู้ป่วย/ญาติ', color: null, sort_order: 3 },
  { type: 'REASON', code: 'OTHER', label: 'อื่น ๆ', color: null, sort_order: 99 },
];

export const lookupMigrations: Migration[] = [
  {
    name: '20261014_11_lookup',
    async up(db) {
      await db.schema.createTable('lookup', (t) => {
        t.increments('id');
        t.string('type', 20).notNullable();
        t.string('code', 30).notNullable();
        t.string('label', 100).notNullable();
        t.string('color', 9).nullable();
        t.integer('sort_order').notNullable().defaultTo(0);
        t.boolean('is_active').notNullable().defaultTo(true);
        t.string('created_at', 30).notNullable();
        t.string('updated_at', 30).notNullable();
        t.unique(['type', 'code']);
      });
      const now = new Date().toISOString();
      await db('lookup').insert(SEED.map((s) => ({ ...s, is_active: true, created_at: now, updated_at: now })));
    },
    async down(db) {
      await db.schema.dropTableIfExists('lookup');
    },
  },
];
