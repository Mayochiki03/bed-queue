/** QueuePage — route ย่อยของฟีเจอร์คิวขอเตียง: / (บอร์ดคิว)  /add  /edit (รับ id ทาง state) */
import { Navigate, Route, Routes } from 'react-router';
import QueueBoard from './QueueBoard';
import RequestEditor from './RequestEditor';

export default function QueuePage() {
  return (
    <Routes>
      <Route index element={<QueueBoard />} />
      <Route path="add" element={<RequestEditor mode="add" />} />
      <Route path="edit" element={<RequestEditor mode="edit" />} />
      <Route path="*" element={<Navigate to="/queue" replace />} />
    </Routes>
  );
}
