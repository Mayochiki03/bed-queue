/** HBars — แท่งแนวนอนสีเดียว (เทียบค่าเดียวหลายรายการ เช่น เฉลี่ยกี่วันตามสารเสพติด) ฐานแท่งชิดซ้าย ปลายขวามน 4px */
export type HBarRow = { key: string; label: string; value: number; text: string };

export function HBars({ rows, color = '#2a78d6' }: { rows: HBarRow[]; color?: string }) {
  const max = Math.max(0.0001, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2.5 text-sm">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2.5">
          <span className="w-20 shrink-0 truncate" title={r.label}>
            {r.label}
          </span>
          <div className="min-w-0 flex-1">
            <div title={`${r.label}: ${r.text}`} className="h-4 rounded-r" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
          </div>
          <span className="w-16 shrink-0 text-right font-semibold">{r.text}</span>
        </div>
      ))}
    </div>
  );
}
