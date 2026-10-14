/** HospitalPage — route ย่อยของฟีเจอร์โรงพยาบาล: / (รายการ)  /add  /edit (รับ id ทาง state) */
import { Navigate, Route, Routes } from 'react-router';
import HospitalEditor from './HospitalEditor';
import HospitalTable from './HospitalTable';

export default function HospitalPage() {
  return (
    <Routes>
      <Route index element={<HospitalTable />} />
      <Route path="add" element={<HospitalEditor mode="add" />} />
      <Route path="edit" element={<HospitalEditor mode="edit" />} />
      <Route path="*" element={<Navigate to="/hospital" replace />} />
    </Routes>
  );
}
