/** liff/main.tsx — จุดเริ่มของหน้าผู้ขอที่เปิดใน LINE (LIFF) · แยกจากหน้าเจ้าหน้าที่ (main.tsx) คนละ bundle */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PopupProvider } from '../components/Popup';
import '../index.css';
import LiffApp from './LiffApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PopupProvider>
      <LiffApp />
    </PopupProvider>
  </StrictMode>,
);
