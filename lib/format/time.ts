export function fmtTimeRange(startIso: string, endIso: string) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${t(s)} – ${t(e)}`;
}

export function durationH(startIso: string, endIso: string) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return `${(ms / 3600000).toFixed(ms % 3600000 === 0 ? 0 : 1)}h`;
}

// "Mon, Apr 28"
export function fmtDateShort(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// "Monday, April 28"
export function fmtDateLong(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

// "Mon, Apr 28, 3:00 PM" — server-side email / notification strings
export function fmtDateTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// "3:00 PM"
export function fmtTimeOnly(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// "Apr 28" — compact date without weekday
export function fmtDateMonthDay(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// "APR" — month abbreviation, uppercased (date card layout)
export function fmtMonthAbbr(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
}

// "Mon" — short weekday name (date card layout)
export function fmtDayOfWeek(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

// "Wednesday" — full weekday name (shift proximity label for days 2–6 out)
export function fmtDayOfWeekLong(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { weekday: 'long' });
}

// "YYYY-MM-DD" in the browser's local timezone — used for same-day comparisons
// that must not drift when the server renders in UTC. Never use getTime() math
// across a midnight boundary; use this key for equality checks instead.
export function localDateKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
