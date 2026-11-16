import { formatMoney } from "@/lib/price";

export function RangeBar({
  low,
  high,
  current,
  target,
  currency,
}: {
  low: number | null;
  high: number | null;
  current: number | null;
  target: number | null;
  currency: string | null;
}) {
  if (low == null || high == null || current == null) return <span className="text-muted">—</span>;
  const span = high - low;
  const pos = (v: number) => (span ? Math.min(100, Math.max(0, ((v - low) / span) * 100)) : 50);
  return (
    <div className="w-[150px]">
      <div className="relative h-1.5 rounded-[3px] bg-track" aria-hidden>
        {target != null && (
          <i className="absolute -top-1 h-3.5 w-0.5 bg-target" style={{ left: `calc(${pos(target)}% - 1px)` }} />
        )}
        <i className="absolute -top-1 h-3.5 w-[3px] rounded-[1px] bg-ink" style={{ left: `calc(${pos(current)}% - 1.5px)` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-muted">
        <span>
          <span className="sr-only">Lowest </span>
          {formatMoney(low, currency)}
        </span>
        <span>
          <span className="sr-only">Highest </span>
          {formatMoney(high, currency)}
        </span>
      </div>
    </div>
  );
}
