// Shared form validation helpers (mirror of school-backend/utils/validators.js).
//
// `validate(form, rules)` returns an object of per-field error messages —
// empty object when the form is valid:
//
//   const errs = validate(form, {
//     name:  { label: 'Name', required: true, minLen: 2 },
//     email: { label: 'Email', required: true, type: 'email' },
//   });
//   if (Object.keys(errs).length) { setErrors(errs); toast.error(firstError(errs)); return; }

// Phone numbers are Indian mobile numbers — the platform is India-only: ten
// digits, the first 6–9, kept without +91 or a leading 0. normalizePhone()
// drops the formatting a person or an older record may carry ("+91 98765
// 43210", "098765-43210"), so the number itself is what is checked and stored.
// Anything else in it (a letter, an extension) is left alone for isPhone to refuse.
export const PHONE_LENGTH = 10;
export const PHONE_HINT   = 'Enter a 10-digit mobile number';
export function normalizePhone(v) {
  const s = String(v ?? '').trim();
  if (!/^[\d\s\-().+]+$/.test(s) || s.split('+').length > 2) return s;
  const d = s.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d;
}

export const isEmail   = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? '').trim());
export const isPhone   = (v) => /^[6-9]\d{9}$/.test(normalizePhone(v));
export const isURL     = (v) => /^https?:\/\/.+\..+/.test(String(v ?? '').trim());
export const isPincode = (v) => /^\d{4,10}$/.test(String(v ?? '').trim());
export const isTime    = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v ?? '').trim());
export const isDate    = (v) => !Number.isNaN(new Date(v).getTime());

const TYPE_CHECKS = {
  email:   { check: isEmail,   msg: (l) => `${l} must be a valid email address` },
  phone:   { check: isPhone,   msg: (l) => `${l} must be a valid 10-digit mobile number` },
  url:     { check: isURL,     msg: (l) => `${l} must be a valid URL starting with http:// or https://` },
  pincode: { check: isPincode, msg: (l) => `${l} must be 4-10 digits` },
  date:    { check: isDate,    msg: (l) => `${l} must be a valid date` },
  time:    { check: isTime,    msg: (l) => `${l} must be a valid time (HH:MM)` },
  number:  { check: (v) => !Number.isNaN(Number(v)) && String(v).trim() !== '', msg: (l) => `${l} must be a number` },
};

export function validate(form = {}, rules = {}) {
  const errors = {};
  for (const [field, rule] of Object.entries(rules)) {
    const label = rule.label || field;
    const raw   = form[field];
    const empty = raw === undefined || raw === null || String(raw).trim() === '';

    if (empty) {
      if (rule.required) errors[field] = `${label} is required`;
      continue;
    }
    const val = typeof raw === 'string' ? raw.trim() : raw;

    if (rule.type && TYPE_CHECKS[rule.type] && !TYPE_CHECKS[rule.type].check(val)) {
      errors[field] = TYPE_CHECKS[rule.type].msg(label);
    } else if (rule.enum && !rule.enum.includes(val)) {
      errors[field] = `${label} must be one of: ${rule.enum.join(', ')}`;
    } else if (rule.minLen !== undefined && String(val).length < rule.minLen) {
      errors[field] = `${label} must be at least ${rule.minLen} characters`;
    } else if (rule.maxLen !== undefined && String(val).length > rule.maxLen) {
      errors[field] = `${label} must be at most ${rule.maxLen} characters`;
    } else if (rule.min !== undefined && Number(val) < rule.min) {
      errors[field] = `${label} must be at least ${rule.min}`;
    } else if (rule.max !== undefined && Number(val) > rule.max) {
      errors[field] = `${label} must be at most ${rule.max}`;
    } else if (rule.regex && !rule.regex.test(String(val))) {
      errors[field] = rule.regexMsg || `${label} has an invalid format`;
    }
  }
  return errors;
}

export const firstError = (errors) => Object.values(errors)[0] || null;

/** The message for one phone field, or null when it is fine (or empty and optional). */
export function phoneError(v, label = 'Mobile number', { required = false } = {}) {
  if (!String(v ?? '').trim()) return required ? `${label} is required` : null;
  return isPhone(v) ? null : `${label} must be a valid 10-digit mobile number`;
}

/**
 * What a phone box holds: digits only, never more than ten typed or pasted.
 *
 * With one argument it is a stored value being shown: its ten digits when it
 * is a number written with +91 or a leading 0; anything longer is shown whole,
 * to be corrected — never shortened into a different number.
 *
 * With `prev` (what the box held) it is an edit: a whole number pasted or
 * filled in — with or without +91 or a leading 0 — replaces it; a key pressed
 * in a full box is refused rather than pushing a digit off the end; anything
 * else longer is cut to ten digits.
 */
export function phoneInputValue(next, prev) {
  const now = String(next ?? '');
  const digits = now.replace(/\D/g, '');
  if (digits.length <= PHONE_LENGTH) return digits;
  const norm = normalizePhone(digits);
  if (prev === undefined) return norm.length === PHONE_LENGTH ? norm : digits;
  const was = String(prev ?? '');
  let start = 0;
  while (start < was.length && start < now.length && was[start] === now[start]) start += 1;
  let end = 0;
  while (end < was.length - start && end < now.length - start && was[was.length - 1 - end] === now[now.length - 1 - end]) end += 1;
  const added = now.slice(start, now.length - end).replace(/\D/g, '');
  const wasDigits = was.replace(/\D/g, '');
  if (!added) return digits;                                       // a digit taken out of a stored number longer than ten
  if (added.length === 1 && wasDigits.length >= PHONE_LENGTH) return wasDigits;
  const whole = normalizePhone(added);
  if (whole.length === PHONE_LENGTH) return whole;
  return norm.slice(0, PHONE_LENGTH);
}

// Password strength shared by auth + user management: 8+ chars with letters and digits.
export function passwordError(pw) {
  const v = String(pw ?? '');
  if (v.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Password must contain both letters and numbers';
  return null;
}

/** Years of experience as a person reads them: "5" → "5 years"; anything older (typed as "5 years") as it was. */
export function experienceText(v) {
  const t = String(v ?? '').trim();
  return /^\d+(\.\d+)?$/.test(t) ? `${t} ${Number(t) === 1 ? 'year' : 'years'}` : v;
}
