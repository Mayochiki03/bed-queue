# Rich Menu ของ LINE OA

- `rich-menu.png` ภาพเมนู 2500x843 px (3 ปุ่ม: คำขอของฉัน / ส่งคำขอเตียง / ข้อมูลของฉัน) — สร้างใหม่ได้ด้วย `node scripts/make-rich-menu.mjs`
- `rich-menu.json` ตำแหน่งปุ่มสำหรับ LINE Messaging API (แทน `LIFF_ID` ด้วย LIFF ID จริง)

วิธีตั้งใน LINE Official Account Manager: แชท > Rich menu > สร้างใหม่ > ขนาดเล็ก > อัปโหลด `rich-menu.png` > แบ่งเป็น 3 ช่องเท่ากัน > ใส่ลิงก์ LIFF ของแต่ละช่อง > ตั้งวันที่ใช้งาน

หมายเหตุ: หน้าผู้ขอผ่าน LIFF ยังไม่เสร็จ (ดู CHANGELOG) ตอนนี้ลิงก์ในปุ่มจึงยังเป็นตัวอย่าง
