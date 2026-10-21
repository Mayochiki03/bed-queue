/** กันไม่ให้ dialog ปิดเมื่อกด/โฟกัสในปฏิทินหรือรายการเลือกที่ลอยอยู่นอก dialog (portal ไป <body>) */
export function keepFloating(e: { target: EventTarget | null; preventDefault: () => void }) {
  const t = e.target as Element | null;
  if (t && typeof t.closest === 'function' && t.closest('[data-floating-popup]')) e.preventDefault();
}
