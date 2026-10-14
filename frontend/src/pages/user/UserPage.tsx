/** UserPage — route ย่อยของฟีเจอร์ผู้ใช้งาน: / (รายการ)  /add  /edit  /password (ตั้งรหัสผ่านใหม่ให้ผู้ใช้อื่น) — รับ id ทาง state */
import { Navigate, Route, Routes } from 'react-router';
import UserEditor from './UserEditor';
import UserPassword from './UserPassword';
import UserTable from './UserTable';

export default function UserPage() {
  return (
    <Routes>
      <Route index element={<UserTable />} />
      <Route path="add" element={<UserEditor mode="add" />} />
      <Route path="edit" element={<UserEditor mode="edit" />} />
      <Route path="password" element={<UserPassword />} />
      <Route path="*" element={<Navigate to="/user" replace />} />
    </Routes>
  );
}
