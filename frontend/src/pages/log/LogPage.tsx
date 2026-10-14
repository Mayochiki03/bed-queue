/** LogPage — หน้าหลักของฟีเจอร์ log (อ่านอย่างเดียว มีหน้าเดียว) — ถือ route ย่อยเหมือน HospitalPage */
import { Navigate, Route, Routes } from 'react-router';
import LogTable from './LogTable';

export default function LogPage() {
  return (
    <Routes>
      <Route index element={<LogTable />} />
      <Route path="*" element={<Navigate to="/log" replace />} />
    </Routes>
  );
}
