/**
 * The academic year this person is looking at (Nov 2026).
 *
 * Every screen shows one academic year's data — the school's active year,
 * unless the year switcher in the header is on another one. The choice travels
 * with every read as the `X-Academic-Year` header (api/axios.js) and the server
 * works out the rest (school-backend/services/yearScope.js).
 *
 * Kept for the browser tab only, per school: looking back at last year is
 * something you do for a while, not a setting — a new tab, or signing in
 * again, opens on the school's current year.
 */
const KEY = 'viewYear';

function read() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') || null; } catch { return null; }
}

/** The year id being looked at for this school, or '' for the school's active year. */
export function viewYear(schoolId) {
  const v = read();
  if (!v || !v.year) return '';
  if (schoolId && String(v.school) !== String(schoolId)) return '';
  return v.year;
}

/** What every request sends: the stored year, whichever school it was chosen for. */
export function viewYearHeader() {
  return read()?.year || '';
}

/** Look at `yearId` (pass '' to go back to the school's active year). */
export function setViewYear(schoolId, yearId) {
  try {
    if (yearId) sessionStorage.setItem(KEY, JSON.stringify({ school: String(schoolId || ''), year: String(yearId) }));
    else sessionStorage.removeItem(KEY);
  } catch { /* storage off: the switcher simply does not stick */ }
  window.dispatchEvent(new CustomEvent('viewyear:changed', { detail: { year: yearId || '' } }));
}

/** Run `fn` whenever the year being looked at changes; returns the unsubscribe. */
export function onViewYearChange(fn) {
  const handler = (e) => fn(e.detail?.year || '');
  window.addEventListener('viewyear:changed', handler);
  return () => window.removeEventListener('viewyear:changed', handler);
}
