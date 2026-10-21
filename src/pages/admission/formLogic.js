/**
 * The browser's half of the application form's rules — which questions apply
 * (class, round, conditions) and the quick checks that save a round trip.
 * The server (services/admission/formEngine.js) is the judge: everything here
 * mirrors it so the applicant sees the same answer sooner, never a different one.
 */
import { isEmail, isPhone } from '../../utils/validators';

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function testRule(rule, answers) {
  const v = answers[rule.field];
  switch (rule.op) {
    case 'eq': return String(v ?? '') === String(rule.value ?? '');
    case 'neq': return String(v ?? '') !== String(rule.value ?? '');
    case 'in': return Array.isArray(v) ? v.some((x) => (rule.value || []).includes(String(x))) : (rule.value || []).includes(String(v ?? ''));
    case 'not_in': return Array.isArray(v) ? !v.some((x) => (rule.value || []).includes(String(x))) : !(rule.value || []).includes(String(v ?? ''));
    case 'checked': return v === true;
    case 'not_checked': return v !== true;
    case 'filled': return !isEmpty(v);
    case 'empty': return isEmpty(v);
    case 'gt': return !isEmpty(v) && (typeof rule.value === 'string' ? String(v) > rule.value : Number(v) > rule.value);
    case 'lt': return !isEmpty(v) && (typeof rule.value === 'string' ? String(v) < rule.value : Number(v) < rule.value);
    case 'gte': return !isEmpty(v) && (typeof rule.value === 'string' ? String(v) >= rule.value : Number(v) >= rule.value);
    case 'lte': return !isEmpty(v) && (typeof rule.value === 'string' ? String(v) <= rule.value : Number(v) <= rule.value);
    default: return true;
  }
}

export const conditionHolds = (cond, answers) => {
  if (!cond?.rules?.length) return true;
  const r = cond.rules.map((x) => testRule(x, answers));
  return cond.mode === 'any' ? r.some(Boolean) : r.every(Boolean);
};

const scoped = (item, { classId, roundId } = {}) =>
  (!item.classes?.length || (classId && item.classes.includes(String(classId))))
  && (!item.rounds?.length || (roundId && item.rounds.includes(String(roundId))));

/** Sections that apply, each with only its fields that apply right now. */
export function visibleSections(schema, answers = {}, scope = {}) {
  return (schema?.sections || [])
    .filter((s) => scoped(s, scope) && conditionHolds(s.visibleIf, answers))
    .map((s) => ({ ...s, fields: (s.fields || []).filter((f) => scoped(f, scope) && conditionHolds(f.visibleIf, answers)) }))
    .filter((s) => s.fields.length);
}

// School IDs the server checks too (formEngine ID_KINDS): UDISE+ code, PEN, APAAR ID.
const ID_DIGITS = { udise: 11, pen: 11, apaar: 12 };

/** Quick check of one answer — null when fine. */
export function quickCheck(f, v) {
  if (f.type === 'info' || f.type === 'file') return null;
  if (isEmpty(v) || v === false) {
    if (!f.required) return null;
    if (f.type === 'declaration') return `Please accept: ${f.label}`;
    if (f.type === 'checkbox') return `${f.label} must be ticked`;
    return `${f.label} is required`;
  }
  const val = f.validation || {};
  switch (f.type) {
    case 'text': case 'textarea': {
      const t = String(v).trim();
      if (val.minLength && t.length < val.minLength) return `${f.label} must be at least ${val.minLength} characters`;
      if (val.maxLength && t.length > val.maxLength) return `${f.label} must be at most ${val.maxLength} characters`;
      if (ID_DIGITS[val.kind] && !new RegExp(`^\\d{${ID_DIGITS[val.kind]}}$`).test(t)) return `${f.label} must be ${ID_DIGITS[val.kind]} digits`;
      if (val.kind === 'pincode' && !/^[1-9]\d{5}$/.test(t)) return `${f.label} must be a 6-digit PIN code`;
      return null;
    }
    case 'number': {
      const n = Number(v);
      if (!Number.isFinite(n)) return `${f.label} must be a number`;
      if (val.integer && !Number.isInteger(n)) return `${f.label} must be a whole number`;
      if (val.min != null && n < val.min) return `${f.label} must be at least ${val.min}`;
      if (val.max != null && n > val.max) return `${f.label} must be at most ${val.max}`;
      return null;
    }
    case 'email': return isEmail(v) ? null : `${f.label} must be a valid email address`;
    case 'phone': return isPhone(v) ? null : `${f.label} must be a valid 10-digit mobile number`;
    case 'multiselect':
      if (val.min && v.length < val.min) return `${f.label}: choose at least ${val.min}`;
      if (val.max && v.length > val.max) return `${f.label}: choose at most ${val.max}`;
      return null;
    default: return null;
  }
}

/** Every quick problem in the fields that apply — keyed by field. */
export function quickErrors(schema, answers, scope, { docsUploaded = {} } = {}) {
  const out = {};
  for (const sec of visibleSections(schema, answers, scope)) {
    for (const f of sec.fields) {
      if (f.type === 'file') {
        if (f.required && !docsUploaded[f.docType]) out[f.key] = `${f.label} — upload the document`;
        continue;
      }
      const e = quickCheck(f, answers[f.key]);
      if (e) out[f.key] = e;
    }
  }
  return out;
}

/**
 * What a draft save may send: a phone number only once it is complete — the
 * platform refuses half a number in any request (middleware/phoneFields), and
 * an autosave mid-typing must not fail for that.
 */
export function savable(schema, answers) {
  const phoneKeys = new Set((schema?.sections || []).flatMap((s) => s.fields || []).filter((f) => f.type === 'phone').map((f) => f.key));
  const out = {};
  for (const [k, v] of Object.entries(answers || {})) {
    if (phoneKeys.has(k) && v && !isPhone(v)) continue;
    out[k] = v;
  }
  return out;
}
