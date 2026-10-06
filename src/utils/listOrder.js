/**
 * The order classes, sections and academic years are listed in — in every
 * list and every dropdown (Oct 2026). Same rules as the server
 * (school-backend/utils/listOrder.js), which already sends its lists in this
 * order; these are for lists a screen puts together itself.
 *
 *   classes   by class number, then name: Class 1, Class 2 … Class 10, and
 *             Class V before Class X, which an A–Z of the names would not give
 *   sections  A–Z, a number counted as a number: A, B, C … and A2 before A10
 *   years     A–Z by name: 2024-25, 2025-26, 2026-27
 *
 * A list's order is for reading: "the newest year" is `newestYear`, never the
 * first item of a list.
 */
export const natural = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true, sensitivity: 'base' });
const num  = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? Infinity : Number(v));
const time = (d) => { const t = d ? new Date(d).getTime() : NaN; return Number.isNaN(t) ? 0 : t; };
const yearName = (y) => y?.yearName ?? y?.name ?? y?.label ?? '';

export const byClass   = (a, b) => (num(a?.classNumber) - num(b?.classNumber) || 0) || natural(a?.className, b?.className);
export const bySection = (a, b) => natural(a?.sectionName, b?.sectionName);
export const byYear    = (a, b) => natural(yearName(a), yearName(b)) || time(a?.startDate) - time(b?.startDate);

/** The year that starts last (by its dates, else by its name) — whatever order the list is in. */
export const newestYear = (years = []) => (years || []).reduce((best, y) => {
  if (!best) return y;
  const later = y?.startDate && best?.startDate ? time(y.startDate) > time(best.startDate) : natural(yearName(y), yearName(best)) > 0;
  return later ? y : best;
}, null);

/** The nearest year that starts before `year` — whatever order the list is in. */
export const previousYear = (years = [], year) => (year?.startDate
  ? newestYear((years || []).filter((y) => y?.startDate && time(y.startDate) < time(year.startDate)))
  : null);
