/** LookupPage — route ย่อยของฟีเจอร์ข้อมูลหลัก: / (รายการ)  /add  /edit (รับ id ทาง state) */
import { Navigate, Route, Routes } from 'react-router';
import LookupEditor from './LookupEditor';
import LookupTable from './LookupTable';

export default function LookupPage() {
  return (
    <Routes>
      <Route index element={<LookupTable />} />
      <Route path="add" element={<LookupEditor mode="add" />} />
      <Route path="edit" element={<LookupEditor mode="edit" />} />
      <Route path="*" element={<Navigate to="/lookup" replace />} />
    </Routes>
  );
}
