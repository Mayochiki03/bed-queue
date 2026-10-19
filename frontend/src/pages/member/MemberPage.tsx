/** MemberPage — route ของฟีเจอร์สมาชิก รพ.: / (รายการ + อนุมัติ) */
import { Navigate, Route, Routes } from 'react-router';
import MemberTable from './MemberTable';

export default function MemberPage() {
  return (
    <Routes>
      <Route index element={<MemberTable />} />
      <Route path="*" element={<Navigate to="/member" replace />} />
    </Routes>
  );
}
