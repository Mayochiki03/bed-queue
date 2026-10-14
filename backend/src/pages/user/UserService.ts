/**
 * UserService.ts — กติกาธุรกิจของ "ผู้ใช้งาน"
 *   - ผู้ใช้จัดการได้เฉพาะบัญชีที่ role ไม่สูงกว่าตัวเอง และตั้ง role ให้สูงกว่าตัวเองไม่ได้ (ADMIN สร้าง DEV ไม่ได้)
 *   - ห้ามแก้ role / ปิดใช้งาน / ลบ บัญชีของตัวเอง (กันล็อกตัวเองออก)
 *   - ชื่อผู้ใช้ห้ามซ้ำ · รหัสผ่านอย่างน้อย 8 ตัว (เก็บเป็น bcrypt)
 */
import { badRequest, conflict, forbidden, notFound } from '../../core/http';
import { hasRole, type Role } from '../../core/pages';
import type { UserAddDto, UserResetPasswordDto, UserSearchDto, UserUpdateDto } from './UserDto';
import type { UserRepository } from './UserRepository';

export class UserService {
  constructor(private repo: UserRepository) {}

  search({ q, role, pageNo, pageSize }: UserSearchDto) {
    return this.repo.search({ q, role }, { pageNo, pageSize });
  }

  async get(id: number) {
    const row = await this.repo.findById(id);
    if (!row) throw notFound('ไม่พบผู้ใช้งานนี้');
    return { ...row, is_active: !!row.is_active };
  }

  /** ตรวจว่า actor มีสิทธิ์จัดการ target (role ของ target ต้องไม่สูงกว่า actor) */
  private assertCanManage(actorRole: Role, targetRole: Role) {
    if (!hasRole(actorRole, targetRole)) throw forbidden('ไม่สามารถจัดการบัญชีที่มีสิทธิ์สูงกว่าตัวเองได้');
  }

  async create(dto: UserAddDto, actor: { role: Role }) {
    this.assertCanManage(actor.role, dto.role);
    if (await this.repo.findByUsername(dto.username)) throw conflict('ชื่อผู้ใช้นี้ถูกใช้แล้ว', { username: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' });
    return { id: await this.repo.insert(dto) };
  }

  async update({ id, ...dto }: UserUpdateDto, actor: { id: number; role: Role }) {
    const target = await this.get(id);
    this.assertCanManage(actor.role, target.role);
    this.assertCanManage(actor.role, dto.role);
    if (id === actor.id) {
      if (dto.role !== target.role) throw badRequest('เปลี่ยนสิทธิ์ของบัญชีตัวเองไม่ได้', { role: 'เปลี่ยนสิทธิ์ของตัวเองไม่ได้' });
      if (dto.is_active === 'N') throw badRequest('ปิดใช้งานบัญชีตัวเองไม่ได้', { is_active: 'ปิดใช้งานตัวเองไม่ได้' });
    }
    await this.repo.update(id, dto);
    return { id };
  }

  async resetPassword({ id, new_password }: UserResetPasswordDto, actor: { role: Role }) {
    const target = await this.get(id);
    this.assertCanManage(actor.role, target.role);
    await this.repo.setPassword(id, new_password);
  }

  async remove(id: number, actor: { id: number; role: Role }) {
    const target = await this.get(id);
    if (id === actor.id) throw badRequest('ลบบัญชีตัวเองไม่ได้');
    this.assertCanManage(actor.role, target.role);
    await this.repo.delete(id);
  }
}
