// Pure date-resolution utilities — no Deno/Node-specific APIs beyond
// Intl/Date, so this module is imported unmodified by both the Edge
// Function runtime and the Node test suite in tests/.
//
// See docs/06-ai-extraction-architecture.md §6.8. Two responsibilities:
//   1. familyLocalToday(): compute "today" in the family's configured
//      timezone, fed into the extraction prompt as ground truth (never
//      let the model guess "today" from message metadata it doesn't have).
//   2. resolveRelativePhrase(): a small deterministic resolver for the
//      common relative-date phrases the brief lists explicitly (§8). This
//      exists as an independently-correct, independently-tested fallback
//      and sanity check — the model resolves most dates itself given
//      "today" in context, but this module is what proves the rules
//      (e.g. "next Monday always skips the current week") are actually
//      followed rather than left to the model's discretion.

export interface ResolvedDate {
  date: string; // YYYY-MM-DD
  endDate?: string;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const HOLIDAYS: Record<string, { month: number; day: number }> = {
  'christmas': { month: 12, day: 25 },
  'christmas day': { month: 12, day: 25 },
  'christmas eve': { month: 12, day: 24 },
  "new year's day": { month: 1, day: 1 },
  'new year day': { month: 1, day: 1 },
  "new year's eve": { month: 12, day: 31 },
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(iso: string): void {
  if (!ISO_DATE_RE.test(iso)) {
    throw new Error(`expected an ISO date (YYYY-MM-DD), got: ${iso}`);
  }
}

/** Parsed at UTC noon deliberately: we only ever do whole-calendar-day
 * arithmetic on an already-localized date string, so anchoring at noon
 * sidesteps any DST-boundary-at-midnight edge case entirely. */
function toUTCDate(iso: string): Date {
  assertIsoDate(iso);
  return new Date(`${iso}T12:00:00Z`);
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function addDays(iso: string, days: number): string {
  const d = toUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function addMonths(iso: string, months: number): string {
  const d = toUTCDate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInMonth));
  return toISODate(d);
}

export function weekdayIndex(iso: string): number {
  return toUTCDate(iso).getUTCDay(); // 0 = Sunday .. 6 = Saturday
}

/** The Sunday on/before the given date — used by the assistant (docs/06 §6.6)
 * to resolve "this week" / "next week" as a Sun-Sat range. */
export function startOfWeek(referenceISODate: string): string {
  return addDays(referenceISODate, -weekdayIndex(referenceISODate));
}

export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "Today" for a family, given a UTC instant and the family's IANA
 * timezone (docs/06 §6.8 — never hardcode a timezone or assume the
 * server's/device's local time). */
export function familyLocalToday(nowUtcISO: string, timezone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA formats as YYYY-MM-DD, which is exactly what we want.
  return dtf.format(new Date(nowUtcISO));
}

/**
 * Deterministically resolves the common relative-date phrases from the
 * brief (§8): today, tomorrow, tonight, this <weekday>, next <weekday>,
 * next weekend, next month, in N day(s)/week(s), "the Nth", and a small
 * set of named holidays. Anything it doesn't recognize returns null —
 * callers should not treat null as "no date", only as "this resolver
 * has no opinion" (the model may still resolve it from full sentence
 * context this function never sees).
 *
 * Rule (documented because it's the one genuinely ambiguous case):
 * "next <weekday>" ALWAYS skips the current week, even if the nearest
 * occurrence of that weekday is still several days away. e.g. if today
 * is Wednesday, "this Monday"/bare "Monday" means the Monday 5 days from
 * now; "next Monday" means the Monday 12 days from now.
 */
export function resolveRelativePhrase(rawPhrase: string, referenceISODate: string): ResolvedDate | null {
  assertIsoDate(referenceISODate);
  const phrase = rawPhrase.trim().toLowerCase().replace(/\s+/g, ' ');

  if (phrase === 'today') return { date: referenceISODate };
  if (phrase === 'tomorrow') return { date: addDays(referenceISODate, 1) };
  if (phrase === 'tonight') return { date: referenceISODate };
  if (phrase === 'yesterday') return { date: addDays(referenceISODate, -1) };

  if (phrase in HOLIDAYS) {
    const { month, day } = HOLIDAYS[phrase];
    const year = toUTCDate(referenceISODate).getUTCFullYear();
    let candidate = `${year}-${pad2(month)}-${pad2(day)}`;
    if (compareIsoDates(candidate, referenceISODate) < 0) {
      candidate = `${year + 1}-${pad2(month)}-${pad2(day)}`;
    }
    return { date: candidate };
  }

  const dayOfMonthMatch = phrase.match(/^the (\d{1,2})(st|nd|rd|th)$/);
  if (dayOfMonthMatch) {
    const targetDay = parseInt(dayOfMonthMatch[1], 10);
    if (targetDay >= 1 && targetDay <= 31) {
      const ref = toUTCDate(referenceISODate);
      const year = ref.getUTCFullYear();
      const month = ref.getUTCMonth() + 1; // 1-indexed
      const daysInThisMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const clampedThisMonthDay = Math.min(targetDay, daysInThisMonth);
      const candidateThisMonth = `${year}-${pad2(month)}-${pad2(clampedThisMonthDay)}`;
      if (targetDay <= daysInThisMonth && compareIsoDates(candidateThisMonth, referenceISODate) >= 0) {
        return { date: candidateThisMonth };
      }
      let nextMonth = month + 1;
      let nextYear = year;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      const daysInNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
      const day = Math.min(targetDay, daysInNextMonth);
      return { date: `${nextYear}-${pad2(nextMonth)}-${pad2(day)}` };
    }
  }

  const inNMatch = phrase.match(
    /^in (a|an|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) (day|days|week|weeks)$/,
  );
  if (inNMatch) {
    const n = NUMBER_WORDS[inNMatch[1]] ?? (inNMatch[1] === 'a' || inNMatch[1] === 'an' ? 1 : parseInt(inNMatch[1], 10));
    const unitDays = inNMatch[2].startsWith('week') ? 7 : 1;
    return { date: addDays(referenceISODate, n * unitDays) };
  }

  if (phrase === 'next month') {
    return { date: addMonths(referenceISODate, 1) };
  }

  const refWeekday = weekdayIndex(referenceISODate);
  const daysUntilSaturday = (6 - refWeekday + 7) % 7;

  if (phrase === 'this weekend') {
    const sat = addDays(referenceISODate, daysUntilSaturday);
    return { date: sat, endDate: addDays(sat, 1) };
  }
  if (phrase === 'next weekend') {
    const thisSat = addDays(referenceISODate, daysUntilSaturday);
    const nextSat = addDays(thisSat, 7);
    return { date: nextSat, endDate: addDays(nextSat, 1) };
  }

  const weekdayMatch = phrase.match(/^(this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (weekdayMatch) {
    const qualifier = weekdayMatch[1]?.trim();
    const targetIdx = WEEKDAYS.indexOf(weekdayMatch[2]);
    const nearestDelta = (targetIdx - refWeekday + 7) % 7; // 0..6, nearest occurrence incl. today
    const delta = qualifier === 'next' ? nearestDelta + 7 : nearestDelta;
    return { date: addDays(referenceISODate, delta) };
  }

  return null;
}
