import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type Props = { title?: string; actions?: ReactNode; children: ReactNode; className?: string };

/** การ์ดมาตรฐานของทุกหน้า: หัวข้อ + ปุ่มด้านขวา + เนื้อหา */
export function PageCard({ title, actions, children, className }: Props) {
  return (
    <section className={cn('rounded-lg border border-border bg-card p-5 shadow-sm', className)}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** หัวข้อหน้า (ไว้ด้านบนสุดของแต่ละหน้า) */
export function PageTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold text-foreground">{children}</h1>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
