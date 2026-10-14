import { Link } from 'react-router';
import { PageCard } from '../components/PageCard';

export default function NotFound() {
  return (
    <PageCard title="ไม่พบหน้านี้">
      <p className="mb-3 text-muted-foreground">ลิงก์อาจผิด หรือหน้านี้ถูกย้ายไปแล้ว</p>
      <Link to="/" className="text-primary underline">
        กลับหน้าหลัก
      </Link>
    </PageCard>
  );
}
