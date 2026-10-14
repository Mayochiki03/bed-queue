/**
 * config/routes.tsx — รายการหน้าทั้งหมดของระบบ (เขียนมือ ไล่อ่านได้ทีเดียว)
 *
 * 1 ฟีเจอร์ = 1 บรรทัด: ชี้ไปที่ "XxxPage" ซึ่งถือ route ย่อยของตัวเอง (list / add / edit ...)
 * path ต้องลงท้ายด้วย /* (ให้หน้าถือ route ย่อยได้)
 * minRole: สิทธิ์ขั้นต่ำที่เข้าหน้านี้ได้ (STAFF < ADMIN < DEV; ไม่ใส่ = ทุกคนที่ล็อกอิน) — ต้องตรงกับ minRole ของหน้าฝั่ง backend
 */
import type { ReactElement } from 'react';
import { hasRole, type Role } from '../lib/session';
import AccountPage from '../pages/account/AccountPage';
import HospitalPage from '../pages/hospital/HospitalPage';
import Home from '../pages/Home';
import LogPage from '../pages/log/LogPage';
import LookupPage from '../pages/lookup/LookupPage';
import SettingPage from '../pages/setting/SettingPage';
import UserPage from '../pages/user/UserPage';

export type AppRoute = { path: string; element: ReactElement; minRole?: Role };

export const routes: AppRoute[] = [
  { path: '/', element: <Home /> },
  { path: '/account/*', element: <AccountPage /> }, // เปลี่ยนรหัสผ่านตัวเอง

  { path: '/hospital/*', element: <HospitalPage />, minRole: 'ADMIN' },
  { path: '/lookup/*', element: <LookupPage />, minRole: 'ADMIN' },
  { path: '/user/*', element: <UserPage />, minRole: 'ADMIN' },
  { path: '/setting/*', element: <SettingPage />, minRole: 'ADMIN' },
  { path: '/log/*', element: <LogPage />, minRole: 'ADMIN' },
];

/** role นี้เข้าหน้าของเมนู path นี้ได้ไหม (ใช้กรองเมนู) — เมนู '/hospital' เทียบกับ route '/hospital/*' */
export function canAccess(menuPath: string, role: Role | undefined): boolean {
  const route = routes.find((r) => r.path.replace(/\/\*$/, '') === menuPath);
  if (!route) return true;
  return !route.minRole || hasRole(role, route.minRole);
}
