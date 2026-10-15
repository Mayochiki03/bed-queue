/**
 * components/layout/Sidebar.tsx — เมนูด้านซ้าย: ชื่อระบบ + เมนูพับได้ (ผู้ใช้/ออกจากระบบอยู่มุมขวาบน ดู UserMenu.tsx)
 * เมนูมาจาก config/menu.ts และซ่อนหน้าที่ role นี้เข้าไม่ได้
 */
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router';
import { menu } from '../../config/menu';
import { canAccess } from '../../config/routes';
import { cn } from '../../lib/cn';
import { useSession } from '../../lib/session';

type Props = { onNavigate?: () => void };

export function Sidebar({ onNavigate }: Props) {
  const { user, app } = useSession();
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn('block rounded-md px-3 py-2 text-sm', isActive ? 'bg-primary-soft font-semibold text-primary-ink' : 'text-muted-foreground hover:bg-muted');

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-4 font-display text-lg font-bold text-primary-ink">{app.name}</div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {menu.map((group) => {
          const Icon = group.icon;
          if (group.path) {
            return (
              <NavLink key={group.label} to={group.path} end onClick={onNavigate} className={(s) => cn(linkClass(s), 'flex items-center gap-2')}>
                <Icon className="size-4" />
                {group.label}
              </NavLink>
            );
          }
          const items = (group.children ?? []).filter((c) => canAccess(c.path, user?.role));
          if (items.length === 0) return null;
          const open = !closed[group.label]; // เมนูกลุ่มเปิดไว้เป็นค่าเริ่มต้น กดหัวกลุ่มเพื่อพับ
          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => setClosed((s) => ({ ...s, [group.label]: open }))}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                <Icon className="size-4" />
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown className={cn('size-4 transition-transform', !open && '-rotate-90')} />
              </button>
              {open && (
                <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-border pl-2">
                  {items.map((c) => (
                    <NavLink key={c.path} to={c.path} onClick={onNavigate} className={linkClass}>
                      {c.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
