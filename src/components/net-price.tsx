import { formatMoney, formatPercent, netCents } from "@/lib/price";

/** Secondary "excl. VAT" line under a VAT-inclusive price. */
export function NetPrice({
  cents,
  currency,
  vat,
  showRate = false,
  className = "",
}: {
  cents: number | null;
  currency: string | null;
  vat: number;
  showRate?: boolean;
  className?: string;
}) {
  if (cents == null) return null;
  return (
    <span className={`block text-[13px] whitespace-nowrap text-muted ${className}`}>
      {formatMoney(netCents(cents, vat), currency)} excl. VAT
      {showRate && <> ({formatPercent(vat).replace(/^[+−]/, "")})</>}
    </span>
  );
}
