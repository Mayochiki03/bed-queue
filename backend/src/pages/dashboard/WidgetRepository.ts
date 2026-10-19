/**
 * WidgetRepository.ts — ตาราง dashboard_widget + ดึงแถวคำขอ/ข้อมูลหลักที่ widget ต้องใช้
 */
import { db, insertGetId, nowIso } from '../../core/db';
import { OPEN_STATUSES } from '../request/Request';
import type { Dim, EngineRow } from './WidgetEngine';
import type { Measure, WidgetConfig, WidgetRecord } from './Widget';

type Row = {
  id: number;
  title: string;
  measures: string;
  group_by: string;
  split_by: string;
  chart: string;
  period_days: number | null;
  filters: string | null;
  row_limit: number;
  width: number;
  sort_order: number;
  is_active: number | boolean;
};

const parseFilters = (s: string | null): WidgetConfig['filters'] => {
  try {
    const f = JSON.parse(s ?? '{}') as Partial<WidgetConfig['filters']>;
    return { colors: f.colors ?? [], substances: f.substances ?? [], reasons: f.reasons ?? [] };
  } catch {
    return { colors: [], substances: [], reasons: [] };
  }
};

const toRecord = (r: Row): WidgetRecord => ({
  id: r.id,
  title: r.title,
  measures: r.measures.split(',').filter(Boolean) as Measure[],
  group_by: r.group_by as WidgetRecord['group_by'],
  split_by: r.split_by as WidgetRecord['split_by'],
  chart: r.chart as WidgetRecord['chart'],
  period_days: r.period_days,
  filters: parseFilters(r.filters),
  row_limit: r.row_limit,
  width: r.width,
  sort_order: r.sort_order,
  is_active: !!r.is_active,
});

const ENGINE_COLS = ['id', 'hospital_id', 'color_code', 'substance_code', 'reason_code', 'patient_gender', 'source', 'status', 'submitted_at', 'called_at', 'resolved_at'];

export class WidgetRepository {
  async list(onlyActive: boolean): Promise<WidgetRecord[]> {
    const q = db('dashboard_widget').select('*').orderBy('sort_order').orderBy('id');
    if (onlyActive) q.where({ is_active: true });
    return ((await q) as Row[]).map(toRecord);
  }

  async find(id: number): Promise<WidgetRecord | undefined> {
    const r = (await db('dashboard_widget').where({ id }).first()) as Row | undefined;
    return r ? toRecord(r) : undefined;
  }

  async findMany(ids: number[]): Promise<WidgetRecord[]> {
    if (!ids.length) return [];
    return ((await db('dashboard_widget').whereIn('id', ids).orderBy('sort_order').orderBy('id')) as Row[]).map(toRecord);
  }

  count(): Promise<number> {
    return db('dashboard_widget').count({ n: '*' }).first().then((r) => Number((r as { n: number | string }).n));
  }

  async maxSort(): Promise<number> {
    const r = (await db('dashboard_widget').max({ m: 'sort_order' }).first()) as { m: number | null } | undefined;
    return r?.m ?? 0;
  }

  async insert(c: WidgetConfig & { width: number; is_active: boolean; sort_order: number }, userId: number): Promise<number> {
    const now = nowIso();
    return insertGetId(db, 'dashboard_widget', {
      title: c.title,
      measures: c.measures.join(','),
      group_by: c.group_by,
      split_by: c.split_by,
      chart: c.chart,
      period_days: c.period_days,
      filters: JSON.stringify(c.filters),
      row_limit: c.row_limit,
      width: c.width,
      sort_order: c.sort_order,
      is_active: c.is_active,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });
  }

  update(id: number, c: WidgetConfig & { width: number; is_active: boolean }) {
    return db('dashboard_widget')
      .where({ id })
      .update({
        title: c.title,
        measures: c.measures.join(','),
        group_by: c.group_by,
        split_by: c.split_by,
        chart: c.chart,
        period_days: c.period_days,
        filters: JSON.stringify(c.filters),
        row_limit: c.row_limit,
        width: c.width,
        is_active: c.is_active,
        updated_at: nowIso(),
      });
  }

  remove(id: number) {
    return db('dashboard_widget').where({ id }).delete();
  }

  async saveLayout(items: { id: number; sort_order: number; width: number; is_active: boolean }[]) {
    const now = nowIso();
    await db.transaction(async (trx) => {
      for (const i of items) await trx('dashboard_widget').where({ id: i.id }).update({ sort_order: i.sort_order, width: i.width, is_active: i.is_active, updated_at: now });
    });
  }

  /** คำขอที่เกี่ยวกับช่วงเวลา (ส่งเข้า/ปิดเคสตั้งแต่ since) + คิวที่ยังเปิดอยู่ทั้งหมด */
  rowsSince(sinceIso: string): Promise<EngineRow[]> {
    return db('bed_request')
      .where((b) => b.where('submitted_at', '>=', sinceIso).orWhere('resolved_at', '>=', sinceIso).orWhereIn('status', OPEN_STATUSES))
      .select(ENGINE_COLS);
  }

  async dims(type: 'COLOR' | 'SUBSTANCE' | 'REASON'): Promise<Dim[]> {
    const rows = (await db('lookup').where({ type }).orderBy('sort_order').orderBy('id')) as { code: string; label: string; color: string | null; is_active: number | boolean }[];
    return rows.map((r) => ({ key: r.code, label: r.label, color: r.color, active: !!r.is_active }));
  }

  async hospitalNames(): Promise<Map<number, string>> {
    const rows = (await db('hospital').select('id', 'name')) as { id: number; name: string }[];
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
