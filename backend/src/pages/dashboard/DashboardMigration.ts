/**
 * DashboardMigration.ts — ตาราง dashboard_widget (widget บนหน้าหลัก ใช้ร่วมกันทุกคน) + widget ตั้งต้น
 * สำคัญ: knex schema builder เท่านั้น ห้าม ENUM / SQL ดิบ · ชื่อ migration เรียงหลังตารางคำขอ (_20.._25)
 *
 * measures เก็บเป็นข้อความคั่นด้วยจุลภาค, filters เก็บเป็น JSON ข้อความ (ตรวจรูปแบบที่ DTO/Service)
 */
import type { Migration } from '../../core/pages';
import type { WidgetConfig } from './Widget';

type Seed = Omit<WidgetConfig, 'filters' | 'row_limit'> & { width: number; filters?: WidgetConfig['filters']; row_limit?: number };
const NO_FILTER = { colors: [], substances: [], reasons: [] };

/** widget ตั้งต้นของหน้าหลัก (ผู้ดูแลแก้/ลบ/เพิ่มได้ภายหลัง) */
export const DEFAULT_WIDGETS: Seed[] = [
  { title: 'รอคิว', measures: ['waiting'], group_by: 'none', split_by: 'none', chart: 'number', period_days: null, width: 1 },
  { title: 'เรียกแล้ว รอยืนยัน', measures: ['called'], group_by: 'none', split_by: 'none', chart: 'number', period_days: null, width: 1 },
  { title: 'ยืนยันส่งตัว', measures: ['confirmed'], group_by: 'none', split_by: 'none', chart: 'number', period_days: null, width: 1 },
  { title: 'เฉลี่ยจนยืนยัน', measures: ['avg_days'], group_by: 'none', split_by: 'none', chart: 'number', period_days: null, width: 1 },
  { title: 'คิวที่รออยู่ ตามสี', measures: ['waiting'], group_by: 'color', split_by: 'none', chart: 'tiles', period_days: null, width: 4 },
  { title: 'คำขอรายวัน: ส่งเข้า เทียบ ยืนยันส่งตัว', measures: ['submitted', 'confirmed'], group_by: 'day', split_by: 'none', chart: 'line', period_days: null, width: 2 },
  { title: 'โรงพยาบาลที่ส่งเคสมากสุด', measures: ['submitted'], group_by: 'hospital', split_by: 'color', chart: 'hbar', period_days: null, width: 2, row_limit: 10 },
  { title: 'ประเภทสารเสพติด', measures: ['submitted'], group_by: 'substance', split_by: 'none', chart: 'hbar', period_days: null, width: 2 },
  { title: 'เฉลี่ยกี่วันจนยืนยัน แยกตามสารเสพติด', measures: ['avg_days'], group_by: 'substance', split_by: 'none', chart: 'hbar', period_days: null, width: 2 },
  { title: 'สถานะของคำขอที่ส่งเข้ามา', measures: ['submitted'], group_by: 'status', split_by: 'none', chart: 'donut', period_days: null, width: 2 },
];

export const dashboardMigrations: Migration[] = [
  {
    name: '20261014_30_dashboard_widget',
    async up(db) {
      await db.schema.createTable('dashboard_widget', (t) => {
        t.increments('id');
        t.string('title', 120).notNullable();
        t.string('measures', 200).notNullable(); // submitted,confirmed
        t.string('group_by', 20).notNullable().defaultTo('none');
        t.string('split_by', 20).notNullable().defaultTo('none');
        t.string('chart', 20).notNullable();
        t.integer('period_days').nullable(); // null = ตามหน้า Dashboard
        t.text('filters').nullable(); // JSON {colors,substances,reasons}
        t.integer('row_limit').notNullable().defaultTo(10);
        t.integer('width').notNullable().defaultTo(2);
        t.integer('sort_order').notNullable().defaultTo(0);
        t.boolean('is_active').notNullable().defaultTo(true);
        t.integer('created_by').nullable();
        t.string('created_at', 30).notNullable();
        t.string('updated_at', 30).notNullable();
        t.index('sort_order');
      });
      const now = new Date().toISOString();
      await db('dashboard_widget').insert(
        DEFAULT_WIDGETS.map((w, i) => ({
          title: w.title,
          measures: w.measures.join(','),
          group_by: w.group_by,
          split_by: w.split_by,
          chart: w.chart,
          period_days: w.period_days,
          filters: JSON.stringify(w.filters ?? NO_FILTER),
          row_limit: w.row_limit ?? 10,
          width: w.width,
          sort_order: (i + 1) * 10,
          is_active: true,
          created_at: now,
          updated_at: now,
        })),
      );
    },
    async down(db) {
      await db.schema.dropTableIfExists('dashboard_widget');
    },
  },
];
