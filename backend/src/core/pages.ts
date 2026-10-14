/**
 * core/pages.ts — "หน้า" (page) ของระบบฝั่งหลังบ้าน + สิทธิ์ (role)
 *
 * 1 หน้า = 1 โฟลเดอร์ใน src/pages/<ชื่อ>/  ประกอบด้วย
 *   index.ts  → definePage({ name, minRole, router, migrations })
 *
 * แล้วเอาไปต่อรายชื่อใน src/pages/index.ts (เขียนมือ — เปิดไฟล์นั้นดูก็รู้ว่าระบบมีหน้าอะไรบ้าง)
 * API ของหน้าจะอยู่ที่  /api/<name>/...  โดยอัตโนมัติ และถูกบันทึก audit log ให้เอง
 *
 * สิทธิ์แบบลำดับชั้น (คนที่สูงกว่าทำได้ทุกอย่างของคนที่ต่ำกว่า):
 *   STAFF  เจ้าหน้าที่จัดคิว  <  ADMIN  ผู้ดูแล  <  DEV  นักพัฒนา (เมนู dev: ตั้งค่า LINE ฯลฯ)
 *   minRole: 'ADMIN' = ADMIN และ DEV เข้าได้ (STAFF เข้าไม่ได้)
 */
import type { Knex } from 'knex';
import type { Router } from 'express';

export type Role = 'STAFF' | 'ADMIN' | 'DEV';
/** เรียงจากสิทธิ์น้อยไปมาก */
export const ROLES = ['STAFF', 'ADMIN', 'DEV'] as const;
export const ROLE_RANK: Record<Role, number> = { STAFF: 1, ADMIN: 2, DEV: 3 };
export const ROLE_LABEL: Record<Role, string> = { STAFF: 'เจ้าหน้าที่จัดคิว', ADMIN: 'ผู้ดูแล', DEV: 'นักพัฒนา' };

/** role นี้มีสิทธิ์ถึงระดับ min ไหม (เช่น hasRole('DEV', 'ADMIN') = true) */
export const hasRole = (role: Role, min: Role): boolean => ROLE_RANK[role] >= ROLE_RANK[min];

export type Migration = {
  /** ชื่อไม่ซ้ำ + เรียงตามวันที่ เช่น '20261014_10_hospital' (ตารางที่ถูกอ้างอิงต้องมีชื่อเรียงก่อน) */
  name: string;
  up: (db: Knex) => Promise<void>;
  down: (db: Knex) => Promise<void>;
};

export type PageDef = {
  /** ชื่อหน้า = ส่วนหนึ่งของ URL (/api/hospital) และชื่อที่ใช้ในบันทึก audit */
  name: string;
  /** role ต่ำสุดที่เรียก API นี้ได้ (ไม่ใส่ = STAFF = ทุกคนที่ล็อกอิน) */
  minRole?: Role;
  /**
   * staff (ค่าเริ่มต้น) = ต้องล็อกอินเป็นเจ้าหน้าที่
   * public = ไม่ตรวจ session ของเจ้าหน้าที่ — หน้านั้นต้องตรวจสิทธิ์เองใน router (เช่น ผู้ขอผ่าน LINE, webhook ของ LINE)
   */
  access?: 'staff' | 'public';
  /** full (ค่าเริ่มต้น) = audit เก็บ body ด้วย (ตัดรหัสผ่าน/token ให้) · minimal = เก็บแค่ ใคร/ทำอะไร/ผลลัพธ์ ไม่เก็บ body (หน้าที่มีข้อมูลผู้ป่วย) */
  audit?: 'full' | 'minimal';
  router: Router;
  migrations?: Migration[];
};

export const definePage = (page: PageDef): PageDef => page;
