/**
 * Lookup.ts — Entity: "ข้อมูลหลัก" ที่ admin จัดการเองได้ เก็บรวมตารางเดียว แยกด้วย type
 *   COLOR      สี/ระดับของผู้ป่วย (แดง ส้ม เหลือง เขียว) — ใช้แยกคอลัมน์คิวและสีในกราฟ
 *   SUBSTANCE  ประเภทสารเสพติด (ยาบ้า สุรา ไอซ์ กระท่อม ...)
 *   REASON     เหตุผลการส่งต่อ
 * คำขอเก็บ "code" ของค่าเหล่านี้ (ไม่ใช่ id) — เปลี่ยนชื่อที่แสดง (label) ได้โดยประวัติเก่าเปลี่ยนตาม
 */
export const LOOKUP_TYPES = ['COLOR', 'SUBSTANCE', 'REASON'] as const;
export type LookupType = (typeof LOOKUP_TYPES)[number];

export const LOOKUP_TYPE_LABEL: Record<LookupType, string> = {
  COLOR: 'สี/ระดับผู้ป่วย',
  SUBSTANCE: 'ประเภทสารเสพติด',
  REASON: 'เหตุผลการส่งต่อ',
};

export type Lookup = {
  id: number;
  type: LookupType;
  code: string;
  label: string;
  /** สีที่แสดง (#RRGGBB) — ใช้กับ type COLOR */
  color: string | null;
  sort_order: number;
  is_active: boolean | number;
  created_at: string;
  updated_at: string;
};
