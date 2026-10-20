/**
 * App.tsx — ตัดสินว่าจะแสดงหน้า Login หรือระบบ (เมนู + หน้าต่าง ๆ จาก config/routes.tsx)
 */
import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/layout/Layout';
import { Spinner } from './components/Spinner';
import { routes } from './config/routes';
import { hasRole, useSession } from './lib/session';
import Forbidden from './pages/Forbidden';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import PublicOverview from './pages/PublicOverview';

/** หน้าที่เปิดได้โดยไม่ล็อกอิน (ผู้ดูแลต้องเปิดสวิตช์ + เฉพาะวงเครือข่ายภายใน — เซิร์ฟเวอร์เป็นคนตัดสิน) · ที่เหลือต้องล็อกอินทั้งหมด */
export default function App() {
  return (
    <Routes>
      <Route path="/overview" element={<PublicOverview />} />
      <Route path="*" element={<StaffApp />} />
    </Routes>
  );
}

function StaffApp() {
  const { ready, user } = useSession();

  if (!ready) return <Spinner />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        {routes.map((r) => (
          <Route key={r.path} path={r.path} element={!r.minRole || hasRole(user.role, r.minRole) ? r.element : <Forbidden />} />
        ))}
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
