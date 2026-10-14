/**
 * TrendChart — กราฟเส้น 2 เส้น (ส่งคำขอ / ยืนยันส่งตัว) รายวัน เขียนด้วย SVG ล้วน ไม่พึ่งไลบรารี
 * - ปรับขนาดตามความกว้าง (viewBox) · เมาส์/นิ้วแตะเลื่อนดูค่าแต่ละวัน (เส้นแนวตั้ง + กล่องค่า)
 * - เส้นหนา 2px, เส้นตารางจาง, ป้ายค่าล่าสุดที่ปลายเส้น, ชื่อเส้นอยู่ใน legend ด้านบน (ไม่พึ่งสีอย่างเดียว)
 */
import { useEffect, useRef, useState } from 'react';
import type { DashboardSummary } from '../../api/dashboardApi';

type Props = { data: DashboardSummary['trend'] };
const H = 210;
const L = 30;
const T = 10;
const B = 36;
export const SERIES = { submitted: '#2a78d6', confirmed: '#1baf7a' } as const;

const niceMax = (v: number) => (v <= 4 ? 4 : v <= 8 ? 8 : v <= 12 ? 12 : Math.ceil(v / 10) * 10);
const fmt = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

export function TrendChart({ data }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  // วัดความกว้างจริงแล้ววาดที่ขนาดนั้น (ตัวอักษรจึงอ่านได้ทุกขนาดจอ ไม่ถูกย่อตาม viewBox)
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(700);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(280, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);
  const R = W < 480 ? 34 : 60;
  if (data.length === 0) return null;
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.submitted, d.confirmed])));
  const x = (i: number) => L + (data.length === 1 ? 0 : (i * (W - L - R)) / (data.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const line = (k: 'submitted' | 'confirmed') => data.map((d, i) => `${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(' ');
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  const labelEvery = Math.max(1, Math.ceil(data.length / (W < 480 ? 4 : 7)));
  const last = data[data.length - 1]!;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  }
  const h = hover === null ? null : data[hover]!;

  return (
    <div ref={box} className="relative">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="กราฟเส้นจำนวนคำขอและการยืนยันส่งตัวรายวัน" className="block touch-pan-y" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R + 10} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--faint)">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text key={d.date} x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="var(--faint)">
              {fmt(d.date)}
            </text>
          ) : null,
        )}
        {(['submitted', 'confirmed'] as const).map((k) => (
          <polyline key={k} points={line(k)} fill="none" stroke={SERIES[k]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {(['submitted', 'confirmed'] as const).map((k) => (
          <g key={`end-${k}`}>
            <circle cx={x(data.length - 1)} cy={y(last[k])} r="4" fill={SERIES[k]} stroke="var(--card)" strokeWidth="2" />
            <text x={x(data.length - 1) + 10} y={y(last[k]) + 4} fontSize="12" fill="var(--foreground)">
              {last[k]}
            </text>
          </g>
        ))}
        {hover !== null && h && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--faint)" strokeWidth="1" strokeDasharray="3 3" />
            {(['submitted', 'confirmed'] as const).map((k) => (
              <circle key={k} cx={x(hover)} cy={y(h[k])} r="4.5" fill={SERIES[k]} stroke="var(--card)" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && h && (
        <div className="pointer-events-none absolute top-1 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md" style={{ left: `${Math.min(70, Math.max(2, (x(hover) / W) * 100 + 2))}%` }}>
          <div className="mb-1 font-semibold text-foreground">{fmt(h.date)}</div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <i className="inline-block h-0.5 w-3" style={{ background: SERIES.submitted }} />
            ส่งคำขอ <b className="ml-auto pl-3 text-foreground">{h.submitted}</b>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <i className="inline-block h-0.5 w-3" style={{ background: SERIES.confirmed }} />
            ยืนยันส่งตัว <b className="ml-auto pl-3 text-foreground">{h.confirmed}</b>
          </div>
        </div>
      )}
    </div>
  );
}
