// Fixed timetable slots: multiples of the interval counted from local midnight
// (TZ env), so 6 h -> 00:00, 06:00, 12:00, 18:00.
export function nextSlot(intervalHours: number, from: Date = new Date()): Date {
  const h = Math.max(1, Math.min(24, Math.round(intervalHours)));
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  while (d.getTime() <= from.getTime()) d.setHours(d.getHours() + h);
  return d;
}
