/**
 * UserController.ts — API "ผู้ใช้งาน" (ADMIN ขึ้นไป · รหัสผ่านไม่ถูกบันทึกลง audit log)
 *   POST /api/user/search | get | add | update | delete | reset-password | reset-mfa
 */
import { Router, type Request, type Response } from 'express';
import { ok, parse } from '../../core/http';
import { userAddDto, userIdDto, userResetPasswordDto, userSearchDto, userUpdateDto } from './UserDto';
import type { UserService } from './UserService';

export class UserController {
  readonly router = Router();

  constructor(private service: UserService) {
    this.router.post('/search', this.search);
    this.router.post('/get', this.get);
    this.router.post('/add', this.add);
    this.router.post('/update', this.update);
    this.router.post('/delete', this.remove);
    this.router.post('/reset-password', this.resetPassword);
    this.router.post('/reset-mfa', this.resetMfa);
  }

  private search = async (req: Request, res: Response) => {
    res.json(ok(await this.service.search(parse(userSearchDto, req.body))));
  };
  private get = async (req: Request, res: Response) => {
    res.json(ok(await this.service.get(parse(userIdDto, req.body).id)));
  };
  private add = async (req: Request, res: Response) => {
    res.status(201).json(ok(await this.service.create(parse(userAddDto, req.body), req.user!), 'บันทึกข้อมูลสำเร็จ'));
  };
  private update = async (req: Request, res: Response) => {
    res.json(ok(await this.service.update(parse(userUpdateDto, req.body), req.user!), 'แก้ไขข้อมูลสำเร็จ'));
  };
  private remove = async (req: Request, res: Response) => {
    await this.service.remove(parse(userIdDto, req.body).id, req.user!);
    res.json(ok(null, 'ลบข้อมูลสำเร็จ'));
  };
  private resetPassword = async (req: Request, res: Response) => {
    await this.service.resetPassword(parse(userResetPasswordDto, req.body), req.user!);
    res.json(ok(null, 'ตั้งรหัสผ่านใหม่สำเร็จ'));
  };
  private resetMfa = async (req: Request, res: Response) => {
    await this.service.resetMfa(parse(userIdDto, req.body).id, req.user!);
    res.json(ok(null, 'รีเซ็ตการยืนยันตัวตน 2 ชั้นแล้ว — ล็อกอินครั้งถัดไปต้องผูกแอปใหม่'));
  };
}
