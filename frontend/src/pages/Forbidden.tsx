import { Link } from 'react-router';
import { PageCard } from '../components/PageCard';

export default function Forbidden() {
  return (
    <PageCard title="ไม่มีสิทธิ์เข้าหน้านี้">
      <p className="mb-3 text-muted-foreground">ติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม</p>
      <Link to="/" className="text-primary underline">
        กลับหน้าหลัก
      </Link>
    </PageCard>
  );
}
