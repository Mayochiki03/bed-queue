/**
 * components/layout/UserMenu.tsx — ชื่อผู้ใช้มุมขวาบน กดแล้วมีเมนู: บัญชีของฉัน (เปลี่ยนรหัสผ่าน/สถานะ 2FA) และออกจากระบบ
 * (ย้ายมาจากมุมซ้ายล่างของแถบเมนู เพื่อให้เจอง่ายและไม่ปะปนกับเมนูงาน)
 */
import { ChevronDown, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '../../lib/cn';
import { ROLE_LABEL, useSession } from '../../lib/session';
import { usePopup } from '../Popup';

export function UserMenu() {
  const { user, logout } = useSession();
  const popup = usePopup();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // กดข้างนอก หรือกด Esc = ปิดเมนู
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!user) return null;
  const initial = (user.full_name || user.username).trim().charAt(0).toUpperCase();

  async function signOut() {
    setOpen(false);
    if (await popup.confirm({ title: 'ออกจากระบบ', message: `ออกจากระบบของ ${user!.full_name}?\nครั้งถัดไปต้องกรอกรหัสผ่านและรหัสยืนยัน 2 ชั้นอีกครั้ง`, confirmText: 'ออกจากระบบ' })) await logout();
  }

  const item = 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted';
  return (
    <div ref={box} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="เมนูผู้ใช้"
        className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-2 pl-1 hover:bg-muted"
      >
        <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initial}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-40 truncate text-sm font-medium text-foreground">{user.full_name}</span>
          <span className="block text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-border bg-card p-1.5 shadow-lg">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-semibold text-foreground">{user.full_name}</div>
            <div className="text-xs text-muted-foreground">
              {user.username} · {ROLE_LABEL[user.role]}
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden />
              2FA {user.mfa_enabled ? 'เปิดใช้แล้ว' : 'ยังไม่ได้ผูกแอป'}
            </div>
          </div>
          <div className="my-1 border-t border-border" />
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); navigate('/account'); }}>
            <KeyRound className="size-4 text-muted-foreground" />
            บัญชีของฉัน / เปลี่ยนรหัสผ่าน
          </button>
          <button type="button" role="menuitem" className={cn(item, 'text-danger')} onClick={() => void signOut()}>
            <LogOut className="size-4" />
            ออกจากระบบ
          </button>
        </div>
      )}
    </div>
  );
}
