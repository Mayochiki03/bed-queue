/**
 * hooks/useLookups.ts — โหลด "ข้อมูลหลัก" (สี/สารเสพติด/เหตุผล) ครั้งเดียวแล้วแคชไว้ทั้งแอป
 *   const { colors, label, colorOf } = useLookups();
 *   label('SUBSTANCE', 'METH') -> "ยาบ้า"      colorOf('RED') -> "#DC2626"
 * ค่าที่ปิดใช้งานแล้วยังแปลงชื่อได้ (ประวัติเก่าไม่หาย) · reload() เมื่อแก้ข้อมูลหลักแล้วต้องการค่าใหม่
 */
import { useCallback, useEffect, useState } from 'react';
import { lookupApi, type Lookup, type LookupOptions, type LookupType } from '../api/lookupApi';

let cache: LookupOptions | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

async function load() {
  const res = await lookupApi.options();
  if (res.ok && res.data) cache = res.data;
  listeners.forEach((fn) => fn());
}

export function useLookups() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    if (!cache && !pending) pending = load().finally(() => (pending = null));
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const list = useCallback((type: LookupType): Lookup[] => cache?.[type] ?? [], []);
  const label = useCallback((type: LookupType, code: string | null | undefined) => (code ? (cache?.[type].find((l) => l.code === code)?.label ?? code) : '-'), []);
  const colorOf = useCallback((code: string | null | undefined) => cache?.COLOR.find((l) => l.code === code)?.color ?? '#6B7280', []);
  return { ready: !!cache, colors: list('COLOR'), substances: list('SUBSTANCE'), reasons: list('REASON'), label, colorOf, reload: load };
}
