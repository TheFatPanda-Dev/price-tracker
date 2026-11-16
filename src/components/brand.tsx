import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 font-display text-[22px] leading-none font-bold tracking-[0.02em] text-flap">
      <span aria-hidden className="grid size-[26px] place-items-center rounded-[4px] bg-yellow">
        <span className="h-[2px] w-3.5 bg-board" />
      </span>
      Price Tracker
    </Link>
  );
}
