/**
 * api/client.ts — ตัวเรียก API กลาง (แต่ละหน้ามีไฟล์ api ของตัวเองในโฟลเดอร์นี้ เช่น hospitalApi.ts)
 *
 * กฎ: ไม่ส่งข้อมูล/id ผ่าน URL — ทุก API เป็น POST และส่งข้อมูลใน body (get ใช้เฉพาะ /app และ /auth/me)
 *
 * ไม่ throw: ได้ผลลัพธ์รูปแบบเดียวเสมอ → เช็คแบบเดียวกันได้ทุกหน้า
 *   const res = await hospitalApi.add(body);
 *   if (res.ok) ... else if (res.status === 'DUPLICATE') ... else popup.error(res.message)
 */
export type ApiStatus = 'SUCCESS' | 'DUPLICATE' | 'VALIDATION' | 'NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'ERROR' | 'NETWORK';

export type ApiResult<T> = {
  ok: boolean;
  status: ApiStatus;
  message: string;
  data: T | null;
  /** ช่องที่ผิด (ชื่อช่อง → ข้อความ) ใช้กับ setError ของฟอร์ม */
  fields?: Record<string, string>;
};

/** รายการแบ่งหน้าที่ API ตอบกลับ */
export type PageResult<T> = { resultList: T[]; pageNo: number; pageSize: number; totalRow: number; totalPage: number; rowsPerPageOption: number[] };

const EXPIRED_EVENT = 'app:session-expired';
export const onSessionExpired = (fn: () => void) => {
  window.addEventListener(EXPIRED_EVENT, fn);
  return () => window.removeEventListener(EXPIRED_EVENT, fn);
};

async function request<T>(method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api${url}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
    const json = (await res.json().catch(() => null)) as { status?: ApiStatus; message?: string; data?: T; fields?: Record<string, string> } | null;
    if (!json) return { ok: false, status: 'ERROR', message: `เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (${res.status}) — ตรวจว่า API รันอยู่`, data: null };
    if (res.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/mfa')) window.dispatchEvent(new Event(EXPIRED_EVENT));
    return {
      ok: res.ok && json.status === 'SUCCESS',
      status: json.status ?? 'ERROR',
      message: json.message ?? '',
      data: json.data ?? null,
      fields: json.fields,
    };
  } catch {
    return { ok: false, status: 'NETWORK', message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจว่า API รันอยู่', data: null };
  }
}

/**
 * ดาวน์โหลดไฟล์ที่ API ตอบกลับเป็นไฟล์ (เช่น Excel) — ส่งข้อมูลใน body (POST) เหมือน API อื่น ไม่ใส่ข้อมูลใน URL
 * สำเร็จ = เบราว์เซอร์บันทึกไฟล์ให้ · ผิดพลาด = ได้ ApiResult ที่มีข้อความเหมือน API ปกติ
 */
async function download(url: string, body: unknown, fallbackName: string): Promise<ApiResult<null>> {
  try {
    const res = await fetch(`/api${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}), credentials: 'same-origin' });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { status?: ApiStatus; message?: string } | null;
      if (res.status === 401) window.dispatchEvent(new Event(EXPIRED_EVENT));
      return { ok: false, status: json?.status ?? 'ERROR', message: json?.message ?? `ดาวน์โหลดไม่สำเร็จ (${res.status})`, data: null };
    }
    const cd = res.headers.get('Content-Disposition') ?? '';
    const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const filename = star ? decodeURIComponent(star[1]!) : fallbackName;
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return { ok: true, status: 'SUCCESS', message: '', data: null };
  } catch {
    return { ok: false, status: 'NETWORK', message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจว่า API รันอยู่', data: null };
  }
}

export const api = {
  download,
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
};
