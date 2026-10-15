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
import ConnectionPage from '../pages/connection/ConnectionPage';
import HospitalPage from '../pages/hospital/HospitalPage';
import DevPage from '../pages/dev/DevPage';
import HistoryPage from '../pages/history/HistoryPage';
import Home from '../pages/Home';
import LogPage from '../pages/log/LogPage';
import LookupPage from '../pages/lookup/LookupPage';
import NotificationPage from '../pages/notification/NotificationPage';
import QueuePage from '../pages/queue/QueuePage';
import SettingPage from '../pages/setting/SettingPage';
import SystemPage from '../pages/system/SystemPage';
import UserPage from '../pages/user/UserPage';

export type AppRoute = { path: string; element: ReactElement; minRole?: Role };

export const routes: AppRoute[] = [
  { path: '/', element: <Home /> },
  { path: '/account/*', element: <AccountPage /> }, // บัญชีของฉัน (เปิดจากเมนูผู้ใช้มุมขวาบน)

  { path: '/queue/*', element: <QueuePage /> }, // บอร์ดคิว + เพิ่ม/แก้คำขอ
  { path: '/history/*', element: <HistoryPage /> }, // ประวัติ/ค้นหาคำขอ

  { path: '/hospital/*', element: <HospitalPage />, minRole: 'ADMIN' },
  { path: '/lookup/*', element: <LookupPage />, minRole: 'ADMIN' },
  { path: '/user/*', element: <UserPage />, minRole: 'ADMIN' },
  { path: '/setting/*', element: <SettingPage />, minRole: 'ADMIN' },
  { path: '/notification/*', element: <NotificationPage />, minRole: 'ADMIN' }, // ข้อความแจ้งเตือน LINE
  { path: '/log/*', element: <LogPage />, minRole: 'ADMIN' },
  { path: '/connection/*', element: <ConnectionPage />, minRole: 'DEV' }, // เมนูนักพัฒนา: เชื่อมต่อ LINE
  { path: '/dev/*', element: <DevPage />, minRole: 'DEV' }, // เมนูนักพัฒนา: ผู้ขอจำลอง
  { path: '/system/*', element: <SystemPage />, minRole: 'DEV' }, // เมนูนักพัฒนา: ระบบและเครื่องมือ
];

/** role นี้เข้าหน้าของเมนู path นี้ได้ไหม (ใช้กรองเมนู) — เมนู '/hospital' เทียบกับ route '/hospital/*' */
export function canAccess(menuPath: string, role: Role | undefined): boolean {
  const route = routes.find((r) => r.path.replace(/\/\*$/, '') === menuPath);
  if (!route) return true;
  return !route.minRole || hasRole(role, route.minRole);
}
