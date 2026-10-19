/**
 * DashboardRepository.ts — ดึงแถวคำขอที่ต้องใช้สรุปผล (query ธรรมดา ไม่ใช้ SQL เฉพาะฐานข้อมูล แล้วรวมตัวเลขในชั้น Service)
 * ปริมาณคำขอระดับโรงพยาบาลเดียว (หลักพัน-หมื่น) ถือว่าพอ ถ้าโตมากให้ย้ายไปรวมตัวเลขใน SQL
 */
import { db } from '../../core/db';
import { OPEN_STATUSES } from '../request/Request';

export type DashRow = {
  id: number;
  hospital_id: number;
  color_code: string | null;
  substance_code: string | null;
  status: string;
  submitted_at: string;
  called_at: string | null;
  resolved_at: string | null;
};

const COLS = ['id', 'hospital_id', 'color_code', 'substance_code', 'status', 'submitted_at', 'called_at', 'resolved_at'];

export class DashboardRepository {
  /** คิวที่ยังเปิดอยู่ (รอ/เรียกแล้ว/รอนัดวัน) — ทั้งหมด ไม่จำกัดช่วงเวลา */
  openQueue(): Promise<DashRow[]> {
    return db('bed_request').whereIn('status', OPEN_STATUSES).select(COLS);
  }

  /** คำขอที่ส่งเข้ามาตั้งแต่เวลาที่กำหนด */
  submittedSince(sinceIso: string): Promise<DashRow[]> {
    return db('bed_request').where('submitted_at', '>=', sinceIso).select(COLS);
  }

  /** คำขอที่ยืนยันส่งตัวตั้งแต่เวลาที่กำหนด (นับแนวโน้ม "ยืนยัน" ตามวันที่ยืนยันจริง) */
  confirmedSince(sinceIso: string): Promise<DashRow[]> {
    return db('bed_request').where({ status: 'CONFIRMED' }).where('resolved_at', '>=', sinceIso).select(COLS);
  }

  hospitals(ids: number[]): Promise<{ id: number; code: string; name: string }[]> {
    return ids.length ? db('hospital').whereIn('id', ids).select('id', 'code', 'name') : Promise.resolve([]);
  }
}
