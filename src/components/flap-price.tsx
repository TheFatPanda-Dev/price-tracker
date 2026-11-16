import { formatMoney } from "@/lib/price";

/**
 * A price that changed since the user's last visit is set in split-flap cells
 * (flipping once); otherwise it is plain type.
 */
export function FlapPrice({
  cents,
  currency,
  flip,
  size = "md",
}: {
  cents: number | null;
  currency: string | null;
  flip: boolean;
  size?: "md" | "lg";
}) {
  const text = formatMoney(cents, currency);
  const fs = size === "lg" ? "text-[44px] sm:text-[56px]" : "text-[22px]";
  if (!flip || cents == null) {
    return <span className={`font-display font-semibold whitespace-nowrap ${fs}`}>{text}</span>;
  }
  let i = 0;
  return (
    <span className={`inline-flex items-center gap-[2px] font-display leading-none font-semibold ${fs}`} aria-label={text}>
      {Array.from(text).map((ch, idx) =>
        /\d/.test(ch) ? (
          <span key={idx} aria-hidden className="flap" style={{ "--i": i++ } as React.CSSProperties}>
            <span>{ch}</span>
          </span>
        ) : (
          <span key={idx} aria-hidden className="px-[1px] text-ink">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
