/** components/layout/Footer.tsx — แถบล่างของทุกหน้า (แก้ข้อความ/ลิงก์ได้ที่นี่ที่เดียว) */
import { useSession } from '../../lib/session';

export function Footer() {
  const { app } = useSession();
  return (
    <footer className="border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
      © {new Date().getFullYear()} {app.name}
    </footer>
  );
}
