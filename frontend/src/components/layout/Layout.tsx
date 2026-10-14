/**
 * components/layout/Layout.tsx — โครงหน้าเมื่อล็อกอินแล้ว: Sidebar ซ้าย + Header บน + เนื้อหา + Footer
 * (มือถือ: Sidebar เป็นลิ้นชักที่เปิดจากปุ่มเมนูบน Header)
 */
import { useState, type ReactNode } from 'react';
import { Footer } from './Footer';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function Layout({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r border-border bg-card lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-card shadow-xl">
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-col">
        <Header drawerOpen={drawer} onToggleDrawer={() => setDrawer((v) => !v)} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
