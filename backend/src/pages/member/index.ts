/**
 * pages/member — สมาชิก รพ.: เจ้าหน้าที่ตรวจและอนุมัติผู้ที่ลงทะเบียนผ่าน LINE (ไม่มีตารางของตัวเอง ใช้ตาราง requester)
 * audit minimal: รายชื่อมีชื่อ-เบอร์ของบุคคล ไม่เก็บ body ใน audit log
 */
import { definePage } from '../../core/pages';
import { MemberController } from './MemberController';
import { MemberRepository } from './MemberRepository';
import { MemberService } from './MemberService';

export const memberService = new MemberService(new MemberRepository());

export const memberPage = definePage({
  name: 'member',
  minRole: 'STAFF',
  audit: 'minimal',
  router: new MemberController(memberService).router,
  migrations: [],
});
