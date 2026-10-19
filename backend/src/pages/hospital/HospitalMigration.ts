/**
 * HospitalMigration.ts — ตาราง hospital (สำคัญ: knex schema builder เท่านั้น)
 */
import type { Migration } from '../../core/pages';

export const hospitalMigrations: Migration[] = [
  {
    name: '20261014_10_hospital',
    async up(db) {
      await db.schema.createTable('hospital', (t) => {
        t.increments('id');
        t.string('code', 5).notNullable().unique();
        t.string('name', 150).notNullable();
        t.boolean('is_active').notNullable().defaultTo(true);
        t.string('created_at', 30).notNullable();
        t.string('updated_at', 30).notNullable();
      });
    },
    async down(db) {
      await db.schema.dropTableIfExists('hospital');
    },
  },
  {
    // เขตสุขภาพ 1-14 (ว่างได้ — โรงพยาบาลที่ผู้ขอพิมพ์เองในรุ่นก่อนยังไม่มีเขต)
    name: '20261019_12_hospital_region',
    async up(db) {
      await db.schema.alterTable('hospital', (t) => {
        t.integer('health_region').nullable();
      });
    },
    async down(db) {
      await db.schema.alterTable('hospital', (t) => {
        t.dropColumn('health_region');
      });
    },
  },
];
