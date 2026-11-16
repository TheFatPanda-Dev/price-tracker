import { ArrowDown, ArrowUp } from "lucide-react";
import { formatPercent } from "@/lib/price";

/** Direction is always carried by an arrow and a signed number, not colour alone. */
export function Change({ percent, className = "" }: { percent: number | null | undefined; className?: string }) {
  if (percent == null || percent === 0) {
    return <span className={`font-medium text-muted ${className}`}>no change</span>;
  }
  const down = percent < 0;
  const Icon = down ? ArrowDown : ArrowUp;
  return (
    <span className={`inline-flex items-center gap-1 font-display font-bold whitespace-nowrap ${down ? "text-drop" : "text-rise"} ${className}`}>
      <Icon aria-hidden className="size-[0.95em]" strokeWidth={3} />
      <span className="sr-only">{down ? "Dropped" : "Rose"} </span>
      {formatPercent(percent)}
    </span>
  );
}
