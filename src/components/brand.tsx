import Link from "next/link";
import { LogoMark } from "./logo-mark";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 font-display text-[22px] leading-none font-bold tracking-[0.02em] text-flap">
      <LogoMark size={30} />
      Price Tracker
    </Link>
  );
}
