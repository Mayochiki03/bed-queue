# app-core-kit — ตัวกลางสำหรับเว็บภายในองค์กร

ชุดเริ่มต้นสำหรับสร้างระบบเว็บภายใน (ตาราง/ฟอร์ม, รายงาน/log, งานตั้งเวลา, หน้าที่มี logic เฉพาะ ฯลฯ) ใช้ได้กับงานหลายแบบ
**ไม่ผูกกับระบบจอง** — "หน้า" แต่ละหน้าเป็นหน่วยอิสระ ก๊อปหน้าที่ใกล้เคียงแล้วแก้ ก็ได้หน้าใหม่

- **TypeScript** ทั้งหน้าเว็บและหลังบ้าน (editor ขีดแดงเมื่อพิมพ์ผิด)
- **React + Tailwind** ธีมสีเปลี่ยนที่ไฟล์เดียว (`frontend/src/theme.css`)
- **Express + knex** ใช้ **MariaDB** เป็นหลัก (สลับเป็น MySQL / PostgreSQL ได้) — **ไม่มี SQLite ต้องมีฐานข้อมูลจริงเสมอ** เตรียมได้ในโฟลเดอร์ `database/`
- login + สิทธิ์ตาม role + **audit log อัตโนมัติ** (ใครทำอะไร ที่หน้าไหน เมื่อไร)

## เริ่มใช้

**1) เตรียมฐานข้อมูล MariaDB ก่อน (ครั้งเดียว)** — ดูวิธีทีละขั้นที่ [database/README.md](database/README.md)
(ถ้ามี Docker: `docker compose -f database/docker-compose.yml up -d` จบในคำสั่งเดียว)

**2) รันระบบ**

```powershell
npm install
npm run dev
```

เปิด http://localhost:5173 — เข้าสู่ระบบด้วย `admin` / `ChangeMe!123`
(ไม่ต้องสร้าง `.env` ถ้าใช้ค่าตั้งต้นของ `database/init.sql` — ระบบสร้างตารางและแอดมินคนแรกให้เอง ถ้าต่อฐานข้อมูลไม่ได้จะบอกสาเหตุเป็นภาษาไทย)

อยากเปลี่ยนชื่อระบบ/ธีม/ฐานข้อมูล: `npm run setup` แล้วแก้ไฟล์ `.env`

## โครงสร้าง (อ่านสั้น ๆ)

```
backend/src/
  core/                      ตัวกลาง: config, db, auth, audit, http (ปกติไม่ต้องแก้)
  pages/                     ← ที่ทีมทำงาน: 1 โฟลเดอร์ = 1 หน้า แยกเป็นชั้นแบบ Spring Boot
    hospital/                  (ตัวอย่าง CRUD)
      Hospital.ts              Entity (หน้าตาข้อมูล)
      HospitalDto.ts           ข้อมูลที่รับเข้า + กติกาตรวจ
      HospitalController.ts    รับ request / ส่ง response
      HospitalService.ts       กติกาธุรกิจ
      HospitalRepository.ts    คุยกับฐานข้อมูล
      HospitalMigration.ts     สร้างตาราง
      index.ts               ประกอบชั้นเข้าด้วยกัน + ลงทะเบียนหน้า
    log/                     (ตัวอย่างอ่านอย่างเดียว)
    index.ts                 รายชื่อหน้าทั้งหมด (เขียนมือ)
frontend/src/
  api/                       ไฟล์เรียก API: client.ts (กลาง) + hospitalApi.ts, logApi.ts ...
  components/                ชุด component กลาง: Button, PageCard, Fields, DataTable, Pagination, Popup, SelectModal
    layout/                  Layout, Header, Sidebar (ออกจากระบบอยู่มุมซ้ายล่าง), Footer
  hooks/                     useTableData (โหลด+แบ่งหน้า+กรอง)
  config/                    routes.tsx (1 ฟีเจอร์ = 1 บรรทัด) และ menu.ts (เมนูซ้าย) — เขียนมือ
  pages/                     ← ที่ทีมทำงาน
    hospital/
      HospitalPage.tsx         หน้าหลักของฟีเจอร์ ถือ route ย่อย (list / add / edit)
      HospitalTable.tsx        กรอง + ตาราง (รายการ)
      HospitalAdd.tsx  HospitalEdit.tsx  HospitalForm.tsx
      modal/                 modal ของหน้านี้ (เช่น HospitalPickModal เลือกจากตาราง)
    log/
```

**กติกาความปลอดภัย:** ไม่ส่ง id หรือข้อมูลใด ๆ ทาง URL (path / query) — ทุก API เป็น POST ส่งข้อมูลใน body และหน้าแก้ไขรับ id ผ่าน state ของ router

## คู่มือ (อ่านตามลำดับ)

| ไฟล์ | เนื้อหา |
|---|---|
| [docs/01-เริ่มต้นใช้งาน.md](docs/01-เริ่มต้นใช้งาน.md) | รัน, สลับฐานข้อมูล, ขึ้นใช้งานจริง, แก้ปัญหาที่เจอบ่อย |
| [docs/02-อ่านโค้ดทีละขั้น.md](docs/02-อ่านโค้ดทีละขั้น.md) | กด "บันทึก" 1 ครั้ง โค้ดวิ่งผ่านไฟล์ไหนบ้าง |
| [docs/03-ทำหน้าใหม่.md](docs/03-ทำหน้าใหม่.md) | ก๊อปหน้าตัวอย่างเป็นหน้าใหม่ทีละขั้น |
| [docs/04-typescript-ที่ต้องรู้.md](docs/04-typescript-ที่ต้องรู้.md) | TS ที่ต้องรู้ในโปรเจกต์นี้ (5 เรื่อง) |
| [docs/05-เทียบกับ-spring-boot.md](docs/05-เทียบกับ-spring-boot.md) | สำหรับคนมาจาก Spring Boot: อะไรตรงกับอะไร |

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | รันหลังบ้าน + หน้าเว็บ (รีโหลดเอง) |
| `npm run check` | ตรวจ TypeScript ทั้งสองฝั่ง (ควรรันก่อน commit) |
| `npm test` | ทดสอบ API (ใช้ฐานข้อมูล `bed_queue_test` ที่ `init.sql` สร้างไว้ — ไม่แตะข้อมูลจริง) |
| `npm run build` / `npm start` | build หน้าเว็บ / รันแบบ production (หลังบ้านเสิร์ฟหน้าเว็บให้) |
| `npm run migrate` / `migrate:status` | สร้าง/ดูสถานะตาราง |
| `npm run db:reset -- --yes` | ลบข้อมูลทั้งหมดแล้วสร้างตารางใหม่ (ต้องใส่ `--yes` เอง) |

## สิ่งที่ยังไม่ได้ทำ / ข้อควรรู้ (พูดตรง ๆ)

- ขั้นนี้มีหน้าตัวอย่าง 2 แบบ: **CRUD (hospital)** และ **อ่านอย่างเดียว (log)** — ตัวอย่าง Scheduler, หน้า Logic เฉพาะ, Dashboard และคำสั่งก๊อปหน้าอัตโนมัติ (`copy:page`) อยู่ในขั้นถัดไป
- ทดสอบแล้วกับ MariaDB 10.11 และ PostgreSQL 16 (เทสต์ 13 ข้อผ่าน) — **MySQL 8 และ `docker-compose.yml` ยังไม่ได้ทดสอบจริง** (เครื่องที่ผมใช้ทดสอบไม่มี Docker)
- โฟลเดอร์ `database/` ขึ้น GitHub เฉพาะ `init.sql`, `docker-compose.yml`, `README.md` — ไฟล์สำรองและข้อมูลถูก `.gitignore` กันไว้
- ยังไม่มีหน้าจัดการผู้ใช้ (เพิ่มผู้ใช้ตอนนี้ทำผ่านฐานข้อมูล/seed) และยังไม่มีหน้าเปลี่ยนรหัสผ่าน (มี API แล้ว: `POST /api/auth/change-password`)
- `/api/auth/login` ยังรับค่าใน body ตามปกติ แต่ปุ่ม refresh หน้าแก้ไขอาศัย state ของ router ในแท็บเดิม — เปิดลิงก์ `/hospital/edit` ตรง ๆ ในแท็บใหม่จะกลับหน้ารายการ (ตั้งใจ เพราะไม่มี id ใน URL)
- ข้อความบนหน้าจอเป็นภาษาไทยภาษาเดียว รวมไว้ที่ `frontend/src/lib/messages.ts` เผื่อแปลภายหลัง

---

## สถานะการพัฒนา (ระบบคิวขอเตียง)

- **รอบ 1 (ชุดนี้)**: โครงระบบ — สิทธิ์ 3 ระดับ (เจ้าหน้าที่ < ผู้ดูแล < นักพัฒนา), ผู้ใช้งาน, โรงพยาบาล (รหัส 5 หลัก), ข้อมูลหลัก (สี/สารเสพติด/เหตุผล), ตั้งค่าระบบในฐานข้อมูล (ค่าลับเข้ารหัส AES-256-GCM), เปลี่ยนรหัสผ่าน, ตารางคำขอ/ผู้ขอ (เบอร์ 2 เบอร์ รองรับ "ต่อ")
- รอบ 2: บอร์ดคิว (รวม/แยกสี) · รอบ 3: Dashboard + Excel นำเข้า/ส่งออก · รอบ 4: หน้าผู้ขอ (LIFF) + LINE + เมนู dev
- เอกสารใน `docs/` ยังใช้ตัวอย่างหน้า "hospital" แทนหน้าตัวอย่างเดิม (แก้ชื่ออัตโนมัติ อาจมีบางประโยคที่ยังพูดถึงฟิลด์ของตัวอย่างเก่า)
