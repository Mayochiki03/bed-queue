# 05 — เทียบกับ Spring Boot (สำหรับคนที่คุ้นกับ Java)

โครงสร้างหลังบ้านของตัวกลางนี้ตั้งใจให้ใกล้ Spring Boot ที่สุดเท่าที่ทำได้โดยไม่ใช้ของที่ซ่อนการทำงาน

| Spring Boot | ในโปรเจกต์นี้ | อยู่ที่ไหน |
|---|---|---|
| `@RestController` | Controller (Express router) | `pages/hospital/HospitalController.ts` |
| `@Service` | Service | `HospitalService.ts` |
| `JpaRepository` / DAO | Repository (knex query builder) | `HospitalRepository.ts` |
| `@Entity` | Entity (type) | `Hospital.ts` |
| DTO + `@Valid` | Dto (zod) | `HospitalDto.ts` |
| `@Autowired` / constructor injection | ต่อสายด้วยมือใน `index.ts` (`new Controller(new Service(new Repository()))`) | `pages/hospital/index.ts` |
| `@ControllerAdvice` | ตัวจัดการ error กลาง | `backend/src/app.ts` |
| Flyway / Liquibase | Migration (knex) | `HospitalMigration.ts` |
| `application.yml` | `.env` | ที่โฟลเดอร์นอกสุด |
| `pom.xml` | `package.json` | |
| Spring Security | `core/auth.ts` (JWT ใน cookie) + `roles` ของหน้า | |
| `@EnableJpaAuditing` | `core/audit.ts` (บันทึกอัตโนมัติ) | |

## กฎของชั้น (เหมือน Spring)

```
Controller  →  Service  →  Repository  →  ฐานข้อมูล
 (request)     (กติกา)      (query)
```

- Controller เรียกได้แค่ Service · Service เรียกได้แค่ Repository · **ห้ามข้ามชั้น**
- Controller ไม่มีกติกาธุรกิจ (แค่ตรวจ DTO → เรียก Service → ห่อผล) · Repository ไม่มีกติกาธุรกิจ (แค่ query)
- ข้อผิดพลาดโยนด้วย `throw conflict(...)`, `throw notFound(...)` ได้จากชั้นไหนก็ได้ ตัวจัดการกลางแปลงเป็นคำตอบให้เอง

## ต่างจาก Java ตรงไหน (ที่ควรรู้)

- ไม่มี decorator / annotation — ทุกอย่างเรียกกันตรง ๆ ค้นด้วยชื่อเจอเสมอ
- type ของ TypeScript หายไปตอนรัน (ไม่ใช่ class จริง) — ข้อมูลที่รับจากหน้าจอจึงต้องตรวจด้วย zod (Dto) ทุกครั้ง ไม่เชื่อ type อย่างเดียว
- `async` / `await` แทน thread — ฟังก์ชันที่คุยกับฐานข้อมูลต้องมี `await` เสมอ ลืม = ได้ Promise แทนข้อมูล
