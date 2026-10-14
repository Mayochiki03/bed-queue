# 04 — TypeScript ที่ต้องรู้ในโปรเจกต์นี้ (5 เรื่อง)

TypeScript = JavaScript + "ป้ายบอกชนิดข้อมูล" ที่ editor ใช้เตือนเรา **ก่อนรัน** ไม่ต้องเก่งก็ใช้ได้ เพราะส่วนใหญ่ก๊อปจากหน้าตัวอย่าง

## 1. ป้ายชนิดหลังชื่อตัวแปร
```ts
const name: string = 'abc';      // ข้อความ
function add(a: number, b: number): number { return a + b; }   // รับตัวเลข 2 ตัว คืนตัวเลข
```
ส่วนใหญ่ไม่ต้องเขียนเอง — TS เดาให้จากค่า (`const n = 5` รู้เองว่าเป็น number)

## 2. `type` = หน้าตาของ object
```ts
export type Hospital = { id: number; code: string; email: string };
```
ถ้าเพิ่มฟิลด์ใหม่ในข้อมูล → เพิ่มใน `type` ด้วย (ไฟล์ `api/xxxApi.ts`) แล้ว editor จะช่วยเตือนทุกที่ที่ลืมแก้

## 3. `?` และ `| null` = อาจไม่มีค่า
```ts
note?: string          // ใส่หรือไม่ใส่ก็ได้
data: Hospital | null    // เป็น Hospital หรือ null
```
ก่อนใช้ค่าที่อาจเป็น `null` ต้องเช็คก่อน: `if (res.data) { ... res.data.name ... }` ไม่เช็ค = ขีดแดง (กันแอปพังตอนค่าว่าง)

## 4. `<...>` (generic) — อ่านผ่านได้เลย
```ts
api.post<Hospital>('/hospital/get', { id: 1 })   // "ขอข้อมูลที่หน้าตาเป็น Hospital"
useForm<HospitalInput>()          // "ฟอร์มนี้มีฟิลด์ตาม HospitalInput"
```
ไม่ต้องเข้าใจที่มา แค่ก๊อปรูปแบบแล้วเปลี่ยนชื่อ type

## 5. อ่านเส้นแดง (สำคัญที่สุด)
- เอาเมาส์ชี้เส้นแดง → editor บอกว่าผิดอะไร (ข้อความอังกฤษ ก๊อปไปถาม AI ได้เลย)
- `npm run check` = ตรวจทั้งโปรเจกต์ที่เดียว (CI ก็รันตัวนี้)

| ข้อความที่เจอบ่อย | แปลว่า | ทางแก้ |
|---|---|---|
| `Property 'xxx' does not exist on type ...` | พิมพ์ชื่อฟิลด์ผิด หรือยังไม่ได้ใส่ใน `type` | แก้ชื่อ / เพิ่มใน `type` |
| `'x' is possibly 'null'` | ค่าอาจว่าง | เช็ค `if (x) {...}` ก่อนใช้ |
| `Type 'string' is not assignable to type 'number'` | ส่งชนิดผิด (ข้อความแทนตัวเลข) | แปลงด้วย `Number(x)` |
| `Cannot find module` | import ผิดที่ / ชื่อไฟล์ผิด | ตรวจ path และตัวพิมพ์เล็ก-ใหญ่ |

**ทางหนีไฟ:** ติดจริง ๆ ใส่ `as any` หรือ `// @ts-expect-error เหตุผล` ชั่วคราวได้ แต่ควรกลับมาแก้ — ถ้ามีเยอะแสดงว่า type ของข้อมูลยังไม่ตรงกับความจริง
