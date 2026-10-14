/**
 * charts.tsx — กราฟของ widget (เขียนด้วย SVG/HTML ล้วน ไม่พึ่งไลบรารี): แท่งแนวตั้ง · แท่งแนวนอน · เส้น · วงกลม · ตาราง · ตัวเลข · การ์ดตัวเลข
 * ทุกกราฟรับ "ตารางผลลัพธ์" (WidgetResult) แบบเดียวกัน: แถว = กลุ่ม, คอลัมน์ = ค่าที่วัด (series) หรือส่วนที่ซ้อนสี (split)
 * หลักการอ่านง่าย: ป้ายค่าบนแท่ง/ปลายเส้น · legend ชื่อชุดข้อมูลเสมอเมื่อมีหลายชุด · ชี้เมาส์/แตะดูค่าได้ · เส้นตารางจาง
 */
import { useEffect, useRef, useState } from 'react';
import type { WidgetColumn, WidgetResult, WidgetRow } from '../../api/dashboardApi';
import { cn } from '../../lib/cn';
import { colorAt, fmtValue, niceMax, shortTime } from './palette';

const colColor = (c: WidgetColumn, i: number) => colorAt(i, c.color);

export function Legend({ columns }: { columns: WidgetColumn[] }) {
  if (columns.length < 2) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
      {columns.map((c, i) => (
        <span key={c.key} className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-[3px]" style={{ background: colColor(c, i) }} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

const Empty = ({ text = 'ยังไม่มีข้อมูลในช่วงเวลานี้' }: { text?: string }) => <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
const hasData = (r: WidgetResult) => r.rows.some((row) => row.values.some((v) => v !== null && v > 0));

/** แถวมีสีของตัวเอง (เช่น แยกตามสี) และมีชุดข้อมูลเดียว → ระบายตามสีของแถว */
const useRowColors = (r: WidgetResult) => r.columns.length === 1 && r.rows.some((row) => row.color);

// ---------------- ตัวเลข / การ์ดตัวเลข ----------------
export function NumberView({ result }: { result: WidgetResult }) {
  const row = result.rows[0];
  if (!row) return <Empty />;
  const [first, ...rest] = result.columns;
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[34px] font-bold leading-tight text-foreground">{fmtValue(row.values[0] ?? null, result.unit)}</span>
        <span className="text-sm text-muted-foreground">{result.unit}</span>
      </div>
      {rest.length > 0 && (
        <dl className="mt-1 grid gap-x-4 gap-y-1 text-sm">
          {rest.map((c, i) => (
            <div key={c.key} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{c.label}</dt>
              <dd className="font-semibold">{fmtValue(row.values[i + 1] ?? null, result.unit)}</dd>
            </div>
          ))}
          {first && <span className="sr-only">{first.label}</span>}
        </dl>
      )}
    </div>
  );
}

export function TilesView({ result }: { result: WidgetResult }) {
  if (result.rows.length === 0) return <Empty />;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
      {result.rows.map((row) => (
        <div key={row.key} className="rounded-xl bg-muted px-3.5 py-3" style={{ borderLeft: `6px solid ${row.color ?? 'var(--border)'}` }}>
          <div className="text-sm font-medium text-foreground">{row.label}</div>
          {result.columns.map((c, i) => (
            <div key={c.key} className="flex items-baseline justify-between gap-2">
              <span className="font-display text-[26px] font-bold leading-tight">{fmtValue(row.values[i] ?? null, result.unit)}</span>
              {result.columns.length > 1 ? <span className="truncate text-xs text-muted-foreground">{c.label}</span> : <span className="text-xs text-muted-foreground">{result.unit}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------- แท่งแนวนอน ----------------
export function HBarChart({ result }: { result: WidgetResult }) {
  if (result.rows.length === 0 || !hasData(result)) return <Empty />;
  const split = result.column_mode === 'split';
  const rowColored = useRowColors(result);
  const max = Math.max(0.0001, ...result.rows.map((r) => (split ? (r.total ?? 0) : Math.max(...r.values.map((v) => v ?? 0)))));
  return (
    <div>
      <Legend columns={result.columns} />
      <div className="flex flex-col gap-2.5 text-sm">
        {result.rows.map((row) => (
          <div key={row.key} className="flex items-start gap-2.5">
            <span className="w-24 shrink-0 truncate pt-px sm:w-28" title={row.label}>
              {shortRowLabel(row, result)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {split ? (
                <div className="flex h-[18px] gap-0.5" style={{ width: `${Math.max(2, ((row.total ?? 0) / max) * 100)}%` }}>
                  {result.columns.map((c, ci) => {
                    const v = row.values[ci] ?? 0;
                    return v > 0 ? <b key={c.key} title={`${row.label} · ${c.label}: ${v}`} className="block min-w-[3px] rounded-[3px]" style={{ flex: `${v} 1 0`, background: colColor(c, ci) }} /> : null;
                  })}
                </div>
              ) : (
                result.columns.map((c, ci) => (
                  <div key={c.key} title={`${row.label} · ${c.label}: ${fmtValue(row.values[ci] ?? null, result.unit)} ${result.unit}`} className="h-4 rounded-r" style={{ width: `${Math.max(1, ((row.values[ci] ?? 0) / max) * 100)}%`, background: rowColored ? colorAt(0, row.color) : colColor(c, ci) }} />
                ))
              )}
            </div>
            <span className="w-14 shrink-0 text-right font-semibold">
              {split ? row.total : result.columns.length === 1 ? fmtValue(row.values[0] ?? null, result.unit) : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const shortRowLabel = (row: WidgetRow, r: WidgetResult) => (r.time_group ? shortTime(row.key, r.time_group) : row.label);

// ---------------- แท่งแนวตั้ง ----------------
export function ColumnChart({ result }: { result: WidgetResult }) {
  if (result.rows.length === 0 || !hasData(result)) return <Empty />;
  const split = result.column_mode === 'split';
  const rowColored = useRowColors(result);
  const max = niceMax(Math.max(1, ...result.rows.map((r) => (split ? (r.total ?? 0) : Math.max(...r.values.map((v) => v ?? 0))))));
  const n = result.rows.length;
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const showValues = n <= 12 && result.columns.length <= 2;
  const H = 180;
  return (
    <div>
      <Legend columns={result.columns} />
      <div className="flex">
        <div className="flex w-8 shrink-0 flex-col justify-between pb-6 text-right text-[11px] text-faint" style={{ height: H + 24 }} aria-hidden="true">
          {[max, max / 2, 0].map((t) => (
            <span key={t}>{Number.isInteger(t) ? t : t.toFixed(1)}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: H }} aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="border-t border-border" />
            ))}
          </div>
          <div className="relative flex items-end gap-1" style={{ height: H + 24 }} role="img" aria-label="แผนภูมิแท่ง">
            {result.rows.map((row, ri) => (
              <div key={row.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                <div className="flex items-end justify-center gap-[2px]" style={{ height: H }}>
                  {split ? (
                    <div className="flex w-full max-w-10 flex-col-reverse gap-[2px]" style={{ height: `${((row.total ?? 0) / max) * 100}%` }} title={`${row.label}: ${row.total}`}>
                      {result.columns.map((c, ci) => {
                        const v = row.values[ci] ?? 0;
                        return v > 0 ? <b key={c.key} title={`${row.label} · ${c.label}: ${v}`} className="block w-full rounded-[3px]" style={{ flex: `${v} 1 0`, background: colColor(c, ci) }} /> : null;
                      })}
                    </div>
                  ) : (
                    result.columns.map((c, ci) => {
                      const v = row.values[ci] ?? 0;
                      return (
                        <div key={c.key} className="flex h-full w-full max-w-10 flex-col justify-end">
                          {showValues && v > 0 && <span className="mb-0.5 text-center text-[11px] font-semibold leading-none text-foreground">{fmtValue(row.values[ci] ?? null, result.unit)}</span>}
                          <b title={`${row.label} · ${c.label}: ${fmtValue(row.values[ci] ?? null, result.unit)} ${result.unit}`} className="block w-full rounded-t-[4px]" style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 2 : 0, background: rowColored ? colorAt(0, row.color) : colColor(c, ci) }} />
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="h-6 truncate pt-1.5 text-center text-[11px] text-muted-foreground" title={row.label}>
                  {ri % labelEvery === 0 || ri === n - 1 ? shortRowLabel(row, result) : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- กราฟเส้น ----------------
const LH = 200;
const LL = 30;
const LT = 10;
const LB = 34;

export function LineChart({ result }: { result: WidgetResult }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(Math.max(260, Math.round(el.clientWidth)));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  const { rows, columns } = result;
  if (rows.length === 0 || !hasData(result)) return <Empty />;
  const R = W < 480 ? 30 : 52;
  const max = niceMax(Math.max(1, ...rows.flatMap((r) => r.values.map((v) => v ?? 0))));
  const x = (i: number) => LL + (rows.length === 1 ? 0 : (i * (W - LL - R)) / (rows.length - 1));
  const y = (v: number) => LT + (LH - LT - LB) * (1 - v / max);
  const labelEvery = Math.max(1, Math.ceil(rows.length / (W < 480 ? 4 : 7)));
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];
  const last = rows[rows.length - 1]!;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.min(rows.length - 1, Math.max(0, Math.round(((px - LL) / (W - LL - R)) * (rows.length - 1)))));
  }
  const h = hover === null ? null : rows[hover]!;

  return (
    <div ref={box} className="relative">
      <Legend columns={columns} />
      <svg width={W} height={LH} viewBox={`0 0 ${W} ${LH}`} role="img" aria-label="กราฟเส้น" className="block touch-pan-y" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={LL} x2={W - R + 8} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={LL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--faint)">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {rows.map((row, i) =>
          i % labelEvery === 0 || i === rows.length - 1 ? (
            <text key={row.key} x={x(i)} y={LH - 12} textAnchor="middle" fontSize="11" fill="var(--faint)">
              {shortRowLabel(row, result)}
            </text>
          ) : null,
        )}
        {columns.map((c, ci) => (
          <polyline key={c.key} fill="none" stroke={colColor(c, ci)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={rows.map((row, i) => `${x(i).toFixed(1)},${y(row.values[ci] ?? 0).toFixed(1)}`).join(' ')} />
        ))}
        {columns.map((c, ci) => (
          <g key={`e-${c.key}`}>
            <circle cx={x(rows.length - 1)} cy={y(last.values[ci] ?? 0)} r="4" fill={colColor(c, ci)} stroke="var(--card)" strokeWidth="2" />
            <text x={x(rows.length - 1) + 9} y={y(last.values[ci] ?? 0) + 4} fontSize="12" fill="var(--foreground)">
              {fmtValue(last.values[ci] ?? null, result.unit)}
            </text>
          </g>
        ))}
        {hover !== null && h && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={LT} y2={LH - LB} stroke="var(--faint)" strokeWidth="1" strokeDasharray="3 3" />
            {columns.map((c, ci) => (
              <circle key={c.key} cx={x(hover)} cy={y(h.values[ci] ?? 0)} r="4.5" fill={colColor(c, ci)} stroke="var(--card)" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && h && (
        <div className="pointer-events-none absolute top-6 z-10 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md" style={{ left: `${Math.min(62, Math.max(2, (x(hover) / W) * 100 + 2))}%` }}>
          <div className="mb-1 font-semibold text-foreground">{h.label}</div>
          {columns.map((c, ci) => (
            <div key={c.key} className="flex items-center gap-2 text-muted-foreground">
              <i className="inline-block h-0.5 w-3" style={{ background: colColor(c, ci) }} />
              {c.label}
              <b className="ml-auto pl-3 text-foreground">{fmtValue(h.values[ci] ?? null, result.unit)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- วงกลม ----------------
export function DonutChart({ result }: { result: WidgetResult }) {
  const parts = result.rows.map((r, i) => ({ row: r, v: r.values[0] ?? 0, color: colorAt(i, r.color) })).filter((p) => p.v > 0);
  const total = parts.reduce((a, p) => a + p.v, 0);
  if (total === 0) return <Empty />;
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
      <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="แผนภูมิวงกลม" className="shrink-0">
        <g transform="rotate(-90 75 75)">
          {parts.map((p) => {
            const len = (p.v / total) * C;
            const el = <circle key={p.row.key} cx="75" cy="75" r={R} fill="none" stroke={p.color} strokeWidth="22" strokeDasharray={`${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}`} strokeDashoffset={-acc}><title>{`${p.row.label}: ${p.v}`}</title></circle>;
            acc += len;
            return el;
          })}
        </g>
        <text x="75" y="73" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--foreground)">
          {total}
        </text>
        <text x="75" y="92" textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
          {result.unit}
        </text>
      </svg>
      <ul className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.row.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <i className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
              <span className="truncate">{p.row.label}</span>
            </span>
            <span className="shrink-0">
              <b>{p.v}</b> <span className="text-muted-foreground">· {Math.round((p.v / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------- ตาราง ----------------
export function ResultTable({ result, headerLabel }: { result: WidgetResult; headerLabel: string }) {
  if (result.rows.length === 0) return <Empty />;
  const showTotal = result.unit === 'ราย' && result.columns.length > 1;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">{headerLabel}</th>
            {result.columns.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right font-semibold">
                {c.label}
              </th>
            ))}
            {showTotal && <th className="px-3 py-2 text-right font-semibold">รวม</th>}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.key} className="border-t border-border">
              <td className="px-3 py-1.5">
                <span className="inline-flex items-center gap-2">
                  {row.color && <i className="inline-block size-2.5 rounded-full" style={{ background: row.color }} />}
                  {row.label}
                </span>
              </td>
              {row.values.map((v, i) => (
                <td key={result.columns[i]!.key} className="px-3 py-1.5 text-right tabular-nums">
                  {fmtValue(v, result.unit)}
                </td>
              ))}
              {showTotal && <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{row.total}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const cx = cn;
