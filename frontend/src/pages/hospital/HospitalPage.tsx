/** HospitalPage — route ย่อยของฟีเจอร์โรงพยาบาล: / (รายการ)  /add  /edit (รับ id ทาง state)  /import (นำเข้า Excel) */
import { Navigate, Route, Routes } from 'react-router';
import HospitalEditor from './HospitalEditor';
import HospitalImport from './HospitalImport';
import HospitalTable from './HospitalTable';

export default function HospitalPage() {
  return (
    <Routes>
      <Route index element={<HospitalTable />} />
      <Route path="add" element={<HospitalEditor mode="add" />} />
      <Route path="edit" element={<HospitalEditor mode="edit" />} />
      <Route path="import" element={<HospitalImport />} />
      <Route path="*" element={<Navigate to="/hospital" replace />} />
    </Routes>
  );
}
