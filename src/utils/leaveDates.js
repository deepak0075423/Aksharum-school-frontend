/**
 * Date bounds for a leave application, derived from the type's policy.
 *
 * Shared by the teacher's own apply form and the admin's apply-on-behalf form
 * so a date the calendar offers is never one the server will reject. The same
 * rules are enforced in leavePolicyService.validateApplication — this is the
 * calendar's copy of them, not a second opinion.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` in local time — what an <input type="date"> expects. */
export const toDateInput = (d) => {
  const x = new Date(d);
  const tz = x.getTimezoneOffset() * 60 * 1000;
  return new Date(x.getTime() - tz).toISOString().slice(0, 10);
};

const shift = (days) => toDateInput(new Date(Date.now() + days * DAY_MS));

/**
 * @param policy   effective leave policy (allowBackdated, backdatedWithinDays,
 *                 advanceNoticeDays). A leave type from /admin/leave/types
 *                 carries these fields too.
 * @param onBehalf true when an admin files for someone else. Back-dating still
 *                 binds them; the notice period does not, because that is the
 *                 employee's obligation rather than the admin's.
 * @returns { minFrom, maxFrom } as date-input strings, either possibly ''.
 */
export function leaveDateBounds(policy, { onBehalf = false } = {}) {
  if (!policy) return { minFrom: '', maxFrom: '' };

  let minFrom = '';
  if (!policy.allowBackdated) {
    // No past dates at all. A notice period pushes the earliest date further
    // out still — but only for the person who owes the notice.
    const notice = !onBehalf && policy.advanceNoticeDays > 0 ? policy.advanceNoticeDays : 0;
    minFrom = shift(notice);
  } else if (policy.backdatedWithinDays > 0) {
    minFrom = shift(-policy.backdatedWithinDays);
  }
  // allowBackdated with no window = no lower bound at all.

  return { minFrom, maxFrom: '' };
}

/** One line explaining the bound, or '' when the dates are unrestricted. */
export function leaveDateHint(policy, { onBehalf = false } = {}) {
  if (!policy) return '';
  if (!policy.allowBackdated) {
    const notice = !onBehalf && policy.advanceNoticeDays > 0 ? policy.advanceNoticeDays : 0;
    return notice
      ? `Past dates are not allowed, and this type needs ${notice} day(s) advance notice.`
      : 'Past dates are not allowed for this leave type.';
  }
  if (policy.backdatedWithinDays > 0) {
    return `Back-dated applications are allowed within ${policy.backdatedWithinDays} day(s).`;
  }
  return '';
}
