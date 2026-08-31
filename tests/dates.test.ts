import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familyLocalToday, resolveRelativePhrase } from '../supabase/functions/_shared/dates.ts';

// Reference "today" used across these tests: Monday 2026-08-31 (this
// session's actual current date, conveniently a Monday).
const TODAY = '2026-08-31';

test('familyLocalToday resolves against the family timezone, not the server clock', () => {
  // 2026-08-31T23:30:00Z is already 2026-09-01 in Singapore (UTC+8).
  assert.equal(familyLocalToday('2026-08-31T23:30:00Z', 'Asia/Singapore'), '2026-09-01');
  assert.equal(familyLocalToday('2026-08-31T23:30:00Z', 'UTC'), '2026-08-31');
  // And still 2026-08-31 in US/Pacific at that same instant.
  assert.equal(familyLocalToday('2026-08-31T23:30:00Z', 'America/Los_Angeles'), '2026-08-31');
});

test('today / tomorrow / tonight / yesterday', () => {
  assert.deepEqual(resolveRelativePhrase('today', TODAY), { date: '2026-08-31' });
  assert.deepEqual(resolveRelativePhrase('tomorrow', TODAY), { date: '2026-09-01' });
  assert.deepEqual(resolveRelativePhrase('tonight', TODAY), { date: '2026-08-31' });
  assert.deepEqual(resolveRelativePhrase('yesterday', TODAY), { date: '2026-08-30' });
});

test('"this <weekday>" is the nearest occurrence on/after today', () => {
  // today is Monday; "this Sunday" is 6 days away (this coming Sunday).
  assert.deepEqual(resolveRelativePhrase('this sunday', TODAY), { date: '2026-09-06' });
  // "this Monday" when today IS Monday resolves to today.
  assert.deepEqual(resolveRelativePhrase('this monday', TODAY), { date: '2026-08-31' });
});

test('"next <weekday>" always skips the current week (the documented rule)', () => {
  // today is Monday 2026-08-31. Nearest Monday is today; "next Monday"
  // must NOT be today — it must be the Monday of the following week.
  assert.deepEqual(resolveRelativePhrase('next monday', TODAY), { date: '2026-09-07' });
  // Nearest Wednesday is in 2 days (2026-09-02); "next Wednesday" skips
  // past that to the following week's Wednesday.
  assert.deepEqual(resolveRelativePhrase('next wednesday', TODAY), { date: '2026-09-09' });
});

test('weekend phrases', () => {
  assert.deepEqual(resolveRelativePhrase('this weekend', TODAY), { date: '2026-09-05', endDate: '2026-09-06' });
  assert.deepEqual(resolveRelativePhrase('next weekend', TODAY), { date: '2026-09-12', endDate: '2026-09-13' });
});

test('next month / in N weeks / in two weeks (word form)', () => {
  assert.deepEqual(resolveRelativePhrase('next month', TODAY), { date: '2026-09-30' });
  assert.deepEqual(resolveRelativePhrase('in 2 weeks', TODAY), { date: '2026-09-14' });
  assert.deepEqual(resolveRelativePhrase('in two weeks', TODAY), { date: '2026-09-14' });
  assert.deepEqual(resolveRelativePhrase('in a week', TODAY), { date: '2026-09-07' });
});

test('"the Nth" resolves to the nearest future occurrence, rolling into next month when passed', () => {
  // today is the 31st — "the 15th" has already passed this month.
  assert.deepEqual(resolveRelativePhrase('the 15th', TODAY), { date: '2026-09-15' });
  // "the 31st" — today IS the 31st, which counts as on/after today.
  assert.deepEqual(resolveRelativePhrase('the 31st', TODAY), { date: '2026-08-31' });
});

test('"the Nth" clamps into a shorter next month rather than overflowing', () => {
  // From Jan 31st, "the 31st" has already passed (today counts as passed
  // only if strictly before; here it equals today so it resolves to
  // today). Use Jan 1st instead, asking for "the 31st": January has 31
  // days so it should stay in January.
  assert.deepEqual(resolveRelativePhrase('the 31st', '2026-01-01'), { date: '2026-01-31' });
  // From Feb 1st, "the 31st" doesn't exist in February — rolls to March
  // and clamps to the last valid day if needed (March has 31, so exact).
  assert.deepEqual(resolveRelativePhrase('the 31st', '2026-02-01'), { date: '2026-03-31' });
});

test('named holidays resolve to the next future occurrence', () => {
  assert.deepEqual(resolveRelativePhrase('christmas', TODAY), { date: '2026-12-25' });
  // After Dec 25 of a given year, "christmas" should roll to next year.
  assert.deepEqual(resolveRelativePhrase('christmas', '2026-12-26'), { date: '2027-12-25' });
  assert.deepEqual(resolveRelativePhrase("new year's day", TODAY), { date: '2027-01-01' });
});

test('unrecognized phrases return null rather than a guess', () => {
  assert.equal(resolveRelativePhrase('sometime in spring', TODAY), null);
  assert.equal(resolveRelativePhrase('school holidays', TODAY), null);
  assert.equal(resolveRelativePhrase('soon', TODAY), null);
});
