/**
 * hooks/useEditId.ts — หน้าแก้ไขรับ id ผ่าน state ของ router (navigate('/xxx/edit', { state: { id } }))
 * ไม่ใส่ id ใน URL — เปิดหน้าตรง ๆ โดยไม่มี id จะคืน undefined (ให้หน้าเด้งกลับรายการ)
 */
import { useLocation } from 'react-router';

export const useEditId = () => (useLocation().state as { id?: number } | null)?.id;
