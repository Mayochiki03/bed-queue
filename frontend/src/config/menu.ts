/**
 * config/menu.ts — เมนูด้านซ้าย (เขียนมือ) — เพิ่มหน้าใหม่ = เพิ่มบรรทัดที่นี่ + เพิ่ม route ที่ config/routes.tsx
 * สิทธิ์ดูจาก routes.tsx — เมนูของหน้าที่ role นั้นเข้าไม่ได้จะถูกซ่อนเอง
 */
import { Database, Home, Settings, type LucideIcon } from 'lucide-react';

export type MenuItem = { label: string; path: string };
export type MenuGroup = { label: string; icon: LucideIcon; path?: string; children?: MenuItem[] };

export const menu: MenuGroup[] = [
  { label: 'หน้าหลัก', icon: Home, path: '/' },
  {
    label: 'ข้อมูลหลัก',
    icon: Database,
    children: [
      { label: 'โรงพยาบาล', path: '/hospital' },
      { label: 'สี / สารเสพติด / เหตุผล', path: '/lookup' },
    ],
  },
  {
    label: 'ระบบ',
    icon: Settings,
    children: [
      { label: 'ผู้ใช้งาน', path: '/user' },
      { label: 'ตั้งค่าระบบ', path: '/setting' },
      { label: 'บันทึกการใช้งาน', path: '/log' },
      { label: 'เปลี่ยนรหัสผ่าน', path: '/account' },
    ],
  },
];

/** ชื่อหน้าสำหรับแสดงบนแถบหัว (Header) — หาจากเมนูที่ path ตรงกับ URL ปัจจุบัน */
export function titleOf(pathname: string): string {
  const items: MenuItem[] = menu.flatMap((g) => (g.path ? [{ label: g.label, path: g.path }] : (g.children ?? [])));
  const hit = items.find((i) => (i.path === '/' ? pathname === '/' : pathname === i.path || pathname.startsWith(`${i.path}/`)));
  return hit?.label ?? '';
}
