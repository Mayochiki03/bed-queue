import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** รวม className ของ Tailwind (ตัวหลังชนะตัวก่อน) — cn('p-2', cond && 'p-4') */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
