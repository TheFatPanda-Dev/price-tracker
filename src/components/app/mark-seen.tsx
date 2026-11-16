"use client";

import { useEffect } from "react";

/** Calls a server action once, after the flips have played. */
export function MarkSeen({ action, delay = 2500 }: { action: () => Promise<void>; delay?: number }) {
  useEffect(() => {
    const t = setTimeout(() => void action(), delay);
    return () => clearTimeout(t);
  }, [action, delay]);
  return null;
}
