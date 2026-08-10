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

export const isEmail   = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? '').trim());
export const isPhone   = (v) => /^\+?[\d\s\-()]{7,15}$/.test(String(v ?? '').trim()) && /^\d{7,15}$/.test(String(v ?? '').replace(/[\s\-+()]/g, ''));
export const isURL     = (v) => /^https?:\/\/.+\..+/.test(String(v ?? '').trim());
export const isPincode = (v) => /^\d{4,10}$/.test(String(v ?? '').trim());
export const isTime    = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v ?? '').trim());
export const isDate    = (v) => !Number.isNaN(new Date(v).getTime());

const TYPE_CHECKS = {
  email:   { check: isEmail,   msg: (l) => `${l} must be a valid email address` },
  phone:   { check: isPhone,   msg: (l) => `${l} must be a valid phone number` },
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

// Password strength shared by auth + user management: 8+ chars with letters and digits.
export function passwordError(pw) {
  const v = String(pw ?? '');
  if (v.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Password must contain both letters and numbers';
  return null;
}
