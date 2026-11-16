import "server-only";
import { env } from "@/lib/env";

const tz = () => env.tz;
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz(), ...o }).format(d);
const dayKey = (d: Date) => fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" });

export const hhmm = (d: Date) => fmt(d, { hour: "2-digit", minute: "2-digit", hour12: false });

export function isToday(d: Date, now = new Date()) {
  return dayKey(d) === dayKey(now);
}

export function daysAgo(d: Date, now = new Date()) {
  const a = new Date(dayKey(d).split("/").reverse().join("-"));
  const b = new Date(dayKey(now).split("/").reverse().join("-"));
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export type Group = "Today" | "This week" | "Earlier";
export function groupOf(d: Date): Group {
  const n = daysAgo(d);
  return n <= 0 ? "Today" : n < 7 ? "This week" : "Earlier";
}

/** Timetable label: 12:00 today, "Tue" this week, "2 Nov" earlier. */
export function boardTime(d: Date | null | undefined): string {
  if (!d) return "—";
  const n = daysAgo(d);
  if (n <= 0) return hhmm(d);
  if (n < 7) return fmt(d, { weekday: "short" });
  return fmt(d, { day: "numeric", month: "short", ...(n > 300 ? { year: "2-digit" } : {}) });
}

/** "12:00" today, "Mon 18:00" otherwise. */
export function checkedLabel(d: Date | null | undefined): string {
  if (!d) return "never";
  return isToday(d) ? hhmm(d) : `${boardTime(d)} ${hhmm(d)}`;
}

export function nextLabel(d: Date | null | undefined): string {
  if (!d) return "now";
  if (d.getTime() <= Date.now()) return "now";
  return isToday(d) ? hhmm(d) : `${fmt(d, { weekday: "short" })} ${hhmm(d)}`;
}

export function fullDate(d: Date): string {
  return fmt(d, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Request-time clock for server components (keeps render code free of Date.now). */
export const serverNow = () => Date.now();
