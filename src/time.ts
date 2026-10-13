// Time-zone helpers built on Intl only (no dependency). Singapore has no DST, but we stay correct for any IANA zone.

export function tzOffsetMinutes(utcMs: number, tz: string): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(utcMs)).reduce<Record<string, number>>((a, x) => { if (x.type !== 'literal') a[x.type] = Number(x.value); return a; }, {});
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** Wall-clock `YYYY-MM-DD` + minutes-from-midnight in `tz` -> UTC epoch ms. */
export function zonedToUtcMs(date: string, minutes: number, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  let ms = naive - tzOffsetMinutes(naive, tz) * 60000;
  ms = naive - tzOffsetMinutes(ms, tz) * 60000; // second pass settles DST edges
  return ms;
}

export function localParts(utcMs: number, tz: string) {
  const off = tzOffsetMinutes(utcMs, tz);
  const d = new Date(utcMs + off * 60000);
  return {
    date: d.toISOString().slice(0, 10),
    weekday: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const hhmmToMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
export const iso = (ms: number) => new Date(ms).toISOString();

export function formatLocal(utcIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-SG', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(utcIso));
}
