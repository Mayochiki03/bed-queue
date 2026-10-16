# Rich Menu ของ LINE OA

- `rich-menu.png` ภาพเมนู 2500x843 px (3 ปุ่ม: คำขอของฉัน / ส่งคำขอเตียง / ข้อมูลของฉัน) — สร้างใหม่ได้ด้วย `node scripts/make-rich-menu.mjs`
- `rich-menu.json` ตำแหน่งปุ่มสำหรับ LINE Messaging API (แทน `LIFF_ID` ด้วย LIFF ID จริง)

วิธีตั้งใน LINE Official Account Manager: แชท > Rich menu > สร้างใหม่ > ขนาดเล็ก > อัปโหลด `rich-menu.png` > แบ่งเป็น 3 ช่องเท่ากัน > ใส่ลิงก์ LIFF ของแต่ละช่อง > ตั้งวันที่ใช้งาน

หมายเหตุ: หน้าผู้ขอผ่าน LIFF ยังไม่เสร็จ (ดู CHANGELOG) ตอนนี้ลิงก์ในปุ่มจึงยังเป็นตัวอย่าง


## Webhook (v0.4.0)
- Webhook URL = `<Public URL>/api/line/webhook` (หน้า "การเชื่อมต่อ LINE" มีกล่องให้คัดลอก)
- LINE Developers → Messaging API → Webhook settings: วาง URL → เปิด Use webhook → Verify ต้องขึ้น Success (ต้องบันทึก Channel Secret ในระบบก่อน)
- ปิด "Auto-reply messages" ใน LINE Official Account Manager ไม่ให้ตอบซ้อนกับระบบ
- ผู้ขอพิมพ์ "สถานะ" ดูคิวได้ · การ์ดเรียกคิวมีปุ่มยืนยัน/ไม่ยืนยัน · ปิด/เปิดได้ที่ตั้งค่าระบบ หมวด LINE

## หน้าผู้ขอใน LINE (LIFF) — v0.5.0
- LIFF Endpoint URL = Public URL (ราก `/`) · scope ติ๊ก `openid` และ `profile` (+ `chat_message.write` ถ้าจะใช้) · Channel ID ของ LINE Login ต้องตรงกับเลขหน้าขีดของ LIFF ID
- ต้อง `npm run build` ก่อน (สร้าง `frontend/dist-liff`) — ยังไม่ build = พอร์ต 4003 ขึ้นหน้าชั่วคราว
- ลิงก์ Rich Menu: `https://liff.line.me/<LIFF ID>?tab=mine` (คำขอของฉัน) · `?tab=submit` (ส่งคำขอ) · `?tab=profile` (ข้อมูลของฉัน)
- ผู้ขอใหม่จะเห็นหน้าเลือกประเภทก่อน: หน่วยงานราชการ/โรงพยาบาล (ใช้งานได้) · บุคคลทั่วไป (กำลังพัฒนา)
