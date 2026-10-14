# database — เตรียมฐานข้อมูลก่อนรันระบบ

ระบบนี้ใช้ **MariaDB** (รองรับ MySQL และ PostgreSQL ด้วย — ดูท้ายไฟล์) และ **ไม่มีฐานข้อมูลสำรองให้อัตโนมัติ**
ต้องมี MariaDB รันอยู่ก่อน แล้วค่อย `npm install` → `npm run dev`

โฟลเดอร์นี้มี 2 ไฟล์:

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `init.sql` | สร้างฐานข้อมูล `bed_queue` (ข้อมูลจริง), `bed_queue_test` (ใช้ตอน `npm test`) และผู้ใช้ `app` |
| `docker-compose.yml` | เปิด MariaDB ด้วย Docker คำสั่งเดียว (ใช้ `init.sql` ให้เอง) |

> ตารางไม่ต้องสร้างเอง — ระบบสร้างให้ตอนรัน `npm run dev` (หรือ `npm run migrate`)

## ค่าที่ระบบใช้ตั้งต้น (ตรงกับ `init.sql` และค่าเริ่มต้นใน `.env`)

| ค่า | ตั้งต้น |
|---|---|
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` |
| `DB_NAME` | `bed_queue` |
| `DB_USER` / `DB_PASSWORD` | `app` / `app_password` |

ใช้ค่าเหล่านี้ตามนี้ได้เลย **ไม่ต้องมีไฟล์ `.env`** ถ้าอยากเปลี่ยน ให้แก้ทั้งใน `init.sql` และ `.env` ให้ตรงกัน

## วิธีที่ 1 — Docker (ง่ายสุด ถ้าเครื่องมี Docker)

```powershell
docker compose -f database/docker-compose.yml up -d
```

รอสัก 10–20 วินาทีตอนครั้งแรก แล้วไปต่อที่ `npm install` / `npm run dev` ได้เลย

## วิธีที่ 2 — ติดตั้ง MariaDB บน Windows

1. ดาวน์โหลดตัวติดตั้ง (รุ่น LTS เช่น 10.11 หรือ 11.4) จาก <https://mariadb.org/download/> แล้วติดตั้ง
   ตั้งรหัสผ่าน `root` ตอนติดตั้ง (จดไว้) และเปิดให้ใช้ UTF-8 เป็นค่าเริ่มต้น
2. เปิดโปรแกรม **HeidiSQL** (มากับตัวติดตั้ง) → เชื่อมต่อด้วยผู้ใช้ `root`
3. เมนู **File → Run SQL file…** → เลือก `database/init.sql` → รัน
   (หรือเปิดไฟล์นั้นแล้วคัดลอกไปวางในหน้า Query แล้วกด ▶)
4. กลับมาที่โปรเจกต์: `npm install` → `npm run dev`

ถ้าชอบใช้บรรทัดคำสั่ง (ต้องมีโปรแกรม `mariadb` อยู่ใน PATH):

```powershell
mariadb -u root -p < database/init.sql
```

## วิธีที่ 3 — มีเซิร์ฟเวอร์ฐานข้อมูลอยู่แล้ว (เช่นของโรงพยาบาล)

ขอผู้ดูแลสร้างให้ 1 ฐานข้อมูล + 1 ผู้ใช้ที่มีสิทธิ์เต็มบนฐานข้อมูลนั้น (charset `utf8mb4`) แล้วตั้งใน `.env`:

```
DB_HOST=...
DB_PORT=3306
DB_NAME=...
DB_USER=...
DB_PASSWORD=...
```

สำหรับ `npm test` ให้ขอฐานข้อมูลเพิ่มอีกอัน ชื่อ **ลงท้ายด้วย `_test`** (เช่น `ชื่อเดิม_test`) แล้วรันด้วย `TEST_DB_NAME=ชื่อเดิม_test`

## ตรวจว่าใช้ได้ไหม

```powershell
npm run migrate:status
```

ถ้าต่อได้จะเห็นรายการ migration ถ้าต่อไม่ได้ ระบบจะบอกสาเหตุเป็นภาษาไทย (ยังไม่เปิดฐานข้อมูล / รหัสผ่านไม่ตรง / ยังไม่มีฐานข้อมูลชื่อนั้น)

## ความปลอดภัย

- `app_password` มีไว้ตอนพัฒนาเท่านั้น — โหมด production (`NODE_ENV=production`) **ระบบไม่ยอมเริ่ม** ถ้ายังใช้รหัสนี้
- `npm test` ใช้ฐานข้อมูล `bed_queue_test` เท่านั้น และ **ลบตารางทั้งหมดทุกครั้งที่รัน** — จึงไม่แตะ `bed_queue`
- `npm run db:reset` ลบข้อมูลใน `bed_queue` ทั้งหมด ต้องใส่ `-- --yes` กำกับเอง ไม่ให้เผลอรัน
- ข้อมูลผู้ป่วยเป็นข้อมูลส่วนบุคคลที่อ่อนไหว: ตั้งรหัสผ่านฐานข้อมูลให้แข็งแรง จำกัดเครื่องที่ต่อได้ และมีแผนสำรองข้อมูล (ดูหัวข้อถัดไป)

## สำรอง / กู้ข้อมูล (MariaDB)

เก็บไฟล์สำรองไว้ที่ `database/backups/` (สร้างโฟลเดอร์นี้เอง) — `.gitignore` ตั้งไว้แล้วว่า **ไม่ขึ้น GitHub** ทั้งโฟลเดอร์ `database/` ยกเว้น `init.sql`, `docker-compose.yml`, `README.md` และไฟล์ `*.sql` อื่นทั้งหมด

```powershell
# สำรอง
mariadb-dump -u app -p bed_queue > database/backups/backup-2026-10-14.sql
# กู้คืน (ลงฐานข้อมูลที่ว่างอยู่)
mariadb -u app -p bed_queue < database/backups/backup-2026-10-14.sql
```

บน MySQL ใช้ `mysqldump` / `mysql` แทน — การสำรองอัตโนมัติรายวันเป็นหน้าที่ของเซิร์ฟเวอร์จริง (ตั้ง Task Scheduler / cron เอง)

## ใช้ MySQL หรือ PostgreSQL แทน

- **MySQL**: ตั้ง `DB_CLIENT=mysql` — `init.sql` ใช้ได้เหมือนกัน (ยังไม่ได้ทดสอบกับ MySQL 8 จริง)
- **PostgreSQL**: ตั้ง `DB_CLIENT=postgres` และ `DB_PORT=5432` — `init.sql` ใช้ไม่ได้ (ไวยากรณ์ต่างกัน) ให้สร้างเองด้วย `CREATE DATABASE bed_queue; CREATE USER app WITH PASSWORD '...'; ALTER DATABASE bed_queue OWNER TO app;`
