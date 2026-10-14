/**
 * StackedBars — แท่งแนวนอนซ้อนสี (เช่น โรงพยาบาล x สี) · ความยาวแท่งเทียบกับแถวที่ยาวสุด
 * ช่องไฟระหว่างช่วงสี 2px, ปลายแท่งมน 4px, ชี้เมาส์/แตะที่ช่วงสีเพื่อดูค่า (title) — ชื่อสีอยู่ใน legend ด้านบน ไม่พึ่งสีอย่างเดียว
 */
export type StackRow = { key: string | number; label: string; total: number; parts: { code: string; label: string; color: string; value: number }[] };

export function StackedBars({ rows }: { rows: StackRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="flex flex-col gap-2.5 text-sm">
      {rows.map((r) => {
        const parts = r.parts.filter((p) => p.value > 0);
        return (
          <div key={r.key} className="flex items-center gap-2.5">
            <span className="w-28 shrink-0 truncate" title={r.label}>
              {r.label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex h-[18px] gap-0.5" style={{ width: `${(r.total / max) * 100}%` }}>
                {parts.map((p, i) => (
                  <b key={p.code} title={`${r.label} · ${p.label}: ${p.value}`} className="block min-w-[3px]" style={{ flex: `${p.value} 1 0`, background: p.color, borderRadius: `${i === 0 ? 4 : 0}px ${i === parts.length - 1 ? 4 : 0}px ${i === parts.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px` }} />
                ))}
              </div>
            </div>
            <span className="w-7 shrink-0 text-right font-semibold">{r.total}</span>
          </div>
        );
      })}
    </div>
  );
}
