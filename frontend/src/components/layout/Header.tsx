/**
 * components/layout/Header.tsx — แถบบน: ปุ่มเปิดเมนู (มือถือ) + ชื่อหน้าปัจจุบัน
 * ชื่อหน้าดึงจาก config/menu.ts (ฟังก์ชัน titleOf) · มุมขวาบน = เมนูผู้ใช้ (บัญชีของฉัน / ออกจากระบบ) — อยากใส่อย่างอื่น (แจ้งเตือน, ภาษา) เพิ่มก่อน <UserMenu />
 */
import { Menu as MenuIcon, X } from 'lucide-react';
import { useLocation } from 'react-router';
import { Button } from '../Button';
import { titleOf } from '../../config/menu';
import { UserMenu } from './UserMenu';

type Props = { drawerOpen: boolean; onToggleDrawer: () => void };

export function Header({ drawerOpen, onToggleDrawer }: Props) {
  const { pathname } = useLocation();
  return (
    <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
      <Button variant="ghost" size="sm" className="lg:hidden" aria-label="เมนู" onClick={onToggleDrawer}>
        {drawerOpen ? <X className="size-5" /> : <MenuIcon className="size-5" />}
      </Button>
      <h2 className="font-display text-base font-semibold text-foreground">{titleOf(pathname)}</h2>
      <UserMenu />
    </header>
  );
}
