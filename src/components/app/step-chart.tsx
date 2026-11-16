import { formatMoney } from "@/lib/price";

type Point = { t: number; cents: number };

/** Step chart: a price holds until the next change. */
export function StepChart({
  points,
  target,
  currency,
  now,
  low,
  high,
}: {
  points: Point[];
  target: number | null;
  currency: string | null;
  now: number;
  low: number | null;
  high: number | null;
}) {
  if (points.length === 0) return null;
  if (points.length === 1 && (low == null || low === high)) {
    return (
      <p className="border-y border-rule py-6 text-[15px] text-muted">
        One reading so far: {formatMoney(points[0].cents, currency)}. The line starts when the price moves.
      </p>
    );
  }
  const W = 800;
  const H = 200;
  const values = points
    .map((p) => p.cents)
    .concat(target != null ? [target] : [], low != null ? [low] : [], high != null ? [high] : []);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo = Math.round(lo * 0.9);
    hi = Math.round(hi * 1.1);
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const t0 = points[0].t;
  const t1 = Math.max(now, t0 + 3600_000);
  const x = (t: number) => ((t - t0) / (t1 - t0)) * W;
  const y = (c: number) => H - ((c - lo) / (hi - lo)) * H;

  let d = `M ${x(points[0].t)} ${y(points[0].cents)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H ${x(points[i].t)} V ${y(points[i].cents)}`;
  }
  d += ` H ${W}`;
  const last = points[points.length - 1];
  const max = Math.max(high ?? 0, ...points.map((p) => p.cents));
  const min = Math.min(low ?? Infinity, ...points.map((p) => p.cents));

  return (
    <figure className="relative">
      <div className="flex justify-between text-[12px] text-muted">
        <span>High {formatMoney(max, currency)}</span>
        {target != null && <span className="font-semibold text-target">Target {formatMoney(target, currency)}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-1 h-[200px] w-full overflow-visible" role="img" aria-label={`Price history: ${points.length} readings, low ${formatMoney(min, currency)}, high ${formatMoney(max, currency)}`}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--color-rule)" vectorEffect="non-scaling-stroke" />
        ))}
        {target != null && (
          <line x1={0} x2={W} y1={y(target)} y2={y(target)} stroke="var(--color-target)" strokeDasharray="6 5" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}
        <path d={d} fill="none" stroke="var(--color-ink)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <line x1={x(last.t)} x2={x(last.t)} y1={y(last.cents) - 8} y2={y(last.cents) + 8} stroke="var(--color-ink)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[12px] text-muted">
        <span>Low {formatMoney(min, currency)}</span>
        <span>now</span>
      </figcaption>
    </figure>
  );
}
