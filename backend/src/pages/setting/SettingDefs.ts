/**
 * SettingDefs.ts — รายการ "ค่าตั้งค่า" ของระบบจองเตียงทั้งหมด (ชื่อ, ชนิด, ค่าเริ่มต้น, ใครแก้ได้)
 * เพิ่มค่าใหม่ = เพิ่มบรรทัดที่นี่ แล้วอ่านด้วย getSetting('ชื่อ') (ไม่ต้องสร้างตารางหรือ seed อะไร)
 */
import { registerSettings, type SettingDef } from '../../core/settings';

export const DEFAULT_PDPA_NOTICE =
  'ข้อมูลที่กรอกในระบบนี้ใช้เพื่อการประสานงานขอเตียงและส่งต่อผู้ป่วยเท่านั้น เข้าถึงได้เฉพาะเจ้าหน้าที่ที่ได้รับมอบหมาย ' +
  'โปรดกรอกเท่าที่จำเป็น และผู้กรอกต้องมั่นใจว่ามีสิทธิ์เปิดเผยข้อมูลผู้ป่วยรายนี้เพื่อวัตถุประสงค์ดังกล่าว';

export const settingDefs: SettingDef[] = [
  // ---------- คิว ----------
  {
    key: 'confirm_timeout_hours',
    label: 'เวลารอผู้ขอยืนยัน (ชั่วโมง)',
    category: 'queue',
    type: 'INT',
    default: 24,
    min: 1,
    max: 720,
    hint: 'เรียกคิวแล้วผู้ขอยังไม่กดตอบเกินเวลานี้ ระบบจะขึ้นเตือนให้ admin โทรตาม (ไม่ยกเลิกเอง)',
  },
  {
    key: 'queue_display',
    label: 'การบอกคิวให้ผู้ขอ',
    category: 'queue',
    type: 'STRING',
    default: 'all',
    options: [
      { value: 'all', label: 'บอกภาพรวม: ก่อนหน้าคุณอีกกี่คิว (นับรวมทุกสี)' },
      { value: 'color', label: 'บอกเฉพาะในสีเดียวกับเคสของผู้ขอ' },
    ],
    hint: 'ผู้ขอเห็นแค่จำนวนคิวที่เหลือก่อนถึงเคสของตัวเอง ไม่เห็นรายละเอียดแยกตามสี (admin เลือกเรียกเคสตามความเร่งด่วน ลำดับจึงเป็นเพียงภาพรวม) · หน้าคิวของ admin มีให้สลับดูทั้งแบบรวมและแยกสีอยู่แล้ว',
  },

  // ---------- Dashboard ----------
  { key: 'dashboard_default_days', label: 'ช่วงเวลาเริ่มต้นของ Dashboard (วัน)', category: 'dashboard', type: 'INT', default: 30, min: 1, max: 3650 },
  { key: 'dashboard_top_n', label: 'จำนวนอันดับเริ่มต้นของกราฟโรงพยาบาล', category: 'dashboard', type: 'INT', default: 10, min: 3, max: 50 },

  // ---------- ผู้ขอ ----------
  {
    key: 'pdpa_notice',
    label: 'ข้อความแจ้งเรื่องข้อมูลส่วนบุคคล (แสดงตอนผู้ขอลงทะเบียน)',
    category: 'requester',
    type: 'TEXT',
    default: DEFAULT_PDPA_NOTICE,
    hint: 'ควรให้ผู้รับผิดชอบ PDPA ของโรงพยาบาลตรวจ/แก้ข้อความนี้',
  },

  // ---------- LINE (โควต้า) ----------
  { key: 'line_monthly_quota', label: 'โควต้าข้อความ LINE ต่อเดือน', category: 'line', type: 'INT', default: 300, min: 0, max: 10000000, hint: 'แพ็กเกจฟรีของ LINE OA ในไทย = 300 (ตามที่ใช้อยู่) · 0 = ไม่จำกัด' },
  { key: 'line_quota_warn_pct', label: 'เตือนเมื่อใช้โควต้าไปแล้ว (%)', category: 'line', type: 'INT', default: 80, min: 1, max: 100 },

  // ---------- การเชื่อมต่อ LINE (เฉพาะนักพัฒนา) ----------
  {
    key: 'connection_mode',
    label: 'โหมดการเชื่อมต่อ',
    category: 'connection',
    type: 'STRING',
    default: 'LOCAL',
    minRole: 'DEV',
    options: [
      { value: 'LOCAL', label: 'LOCAL — ยังไม่ต่อ LINE (ใช้ผู้ใช้จำลอง)' },
      { value: 'DEV_TUNNEL', label: 'DEV_TUNNEL — LINE OA ทดสอบ + Cloudflare Tunnel' },
      { value: 'PRODUCTION', label: 'PRODUCTION — LINE OA ของโรงพยาบาล' },
    ],
  },
  {
    key: 'public_base_url',
    label: 'Public URL (https://…)',
    category: 'connection',
    type: 'STRING',
    default: '',
    minRole: 'DEV',
    hint: 'URL ของ Cloudflare Tunnel ที่ชี้มาที่ระบบนี้',
    validate: (v) => (v === '' || /^https:\/\/[^\s/]+/.test(v) ? null : 'ต้องขึ้นต้นด้วย https://'),
  },
  { key: 'liff_id', label: 'LIFF ID', category: 'connection', type: 'STRING', default: '', minRole: 'DEV' },
  { key: 'line_login_channel_id', label: 'LINE Login Channel ID', category: 'connection', type: 'STRING', default: '', minRole: 'DEV' },
  { key: 'line_channel_secret', label: 'Messaging API Channel Secret', category: 'connection', type: 'SECRET', default: '', minRole: 'DEV', hint: 'เว้นว่าง = ใช้ค่าเดิม' },
  { key: 'line_channel_token', label: 'Messaging API Channel Access Token', category: 'connection', type: 'SECRET', default: '', minRole: 'DEV', hint: 'เว้นว่าง = ใช้ค่าเดิม (เก็บแบบเข้ารหัส)' },
];

registerSettings(settingDefs);
