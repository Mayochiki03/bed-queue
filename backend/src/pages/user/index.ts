/**
 * pages/user — จัดการบัญชีเจ้าหน้าที่ (ADMIN ขึ้นไป) · ตาราง users เป็นของแกนกลางจึงไม่มี migration ของหน้านี้
 */
import { definePage } from '../../core/pages';
import { UserController } from './UserController';
import { UserRepository } from './UserRepository';
import { UserService } from './UserService';

export const userPage = definePage({
  name: 'user',
  minRole: 'ADMIN',
  router: new UserController(new UserService(new UserRepository())).router,
});
