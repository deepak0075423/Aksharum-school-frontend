/**
 * What a field takes (Oct 2026): English only, never markup, and only the
 * characters its purpose needs. Same rules as the server
 * (school-backend/utils/textRules.js) and the app (Nexora-Hives/utils/textRules.ts)
 * — keep the three in sync. Here they are applied while a person types
 * (utils/textGuard), so a field never holds what would be refused.
 *
 * A field says what it is with `data-text` (a text box without one is `text`,
 * an email box `email`, a web address box `token`):
 *
 *   text     anything written in English — letters A–Z, digits, punctuation,
 *            symbols (₹ ° · – ’ …) — but no other script, no accents, no emoji
 *   name     a person's name: English letters and spaces
 *   letters  English letters and spaces (a relation, a religion, a language)
 *   place    a city, district, state or country: English letters, spaces and
 *            . ' - ( ) — and the digits of a district that has them
 *            ("North 24 Parganas"), which the PIN lookup fills in but nobody types
 *   title    the name of a thing — a class, subject, fee, hostel, item, vendor:
 *            English letters, digits, spaces and . , - & ' ( ) / + : # %
 *   words    a label with no symbols at all (a leave type's name): English
 *            letters, digits and spaces, starting with a letter
 *   sentence a short line of description with no symbols (a leave type's
 *            description): English letters, digits, spaces and . , ' - ( ) /
 *   code     an ID or a number with letters — admission number, employee ID,
 *            room number, a reference: English letters, digits and - / _ .
 *   upper    capital letters and digits (a vehicle registration); small
 *            letters typed become capitals
 *   digits   digits only
 *   decimal  digits and one decimal point
 *   email    letters, digits and @ . _ % + - '
 *   token    printable English characters without spaces (a web address, an
 *            API key, a device ID)
 *   any      any language and emoji (chat; a notice written in Hindi on purpose)
 *
 * and the formats, where each position takes a letter or a digit and the
 * length is fixed:
 *   pincode  6 digits, the first not 0          aadhaar  12 digits
 *   pan      ABCDE1234F                         ifsc     HDFC0001234
 *   gstin    22ABCDE1234F1Z5                    account  a bank account, 9–18 digits
 *   uan      12 digits                          hsn      4, 6 or 8 digits
 *   otp      6 digits
 *   date     YYYY-MM-DD and time HH:MM, typed as digits — the - and : go in
 *            by themselves (where a date is typed rather than picked)
 *
 * Every kind refuses markup: "<" followed by a letter, "/", "!" or "?" is how
 * a browser starts a tag (<script, </b, <!--), so that "<" is dropped.
 */
export const MARKUP = /<(?=[A-Za-z!/?])/g;
// A letter, a mark or a digit from outside English. µ stays: it is a unit (µg).
const FOREIGN = /(?![A-Za-zµ])\p{L}|\p{M}|(?![0-9])\p{Nd}/gu;
const EMOJI = /(?![©®™])\p{Extended_Pictographic}|[‍️]/gu;

const L = /[A-Z]/, D = /[0-9]/, X = /[A-Z0-9]/;

/**
 * Each kind: `keep` drops what it does not take, `upper` turns small letters
 * into capitals first, `mask` is what each position takes (and so the length)
 * — a string there is a separator that goes in by itself, and `pad` gives a
 * lone digit its 0 —
 * `max` a length, `oneDot` keeps the first decimal point only; `ok` is what a
 * finished value looks like and `msg` the problem when it does not; `hint` is
 * what to enter, for a format.
 */
export const KINDS = {
  text:    {},
  any:     {},
  name:    { keep: /[^A-Za-z ]/g, ok: /^[A-Za-z][A-Za-z ]*$/, msg: (l) => `${l} can only have English letters and spaces` },
  letters: { keep: /[^A-Za-z ]/g, ok: /^[A-Za-z][A-Za-z ]*$/, msg: (l) => `${l} can only have English letters and spaces` },
  place:   { keep: /[^A-Za-z .'()-]/g, ok: /^[A-Za-z][A-Za-z0-9 .'()-]*$/, msg: (l) => `${l} can only have English letters, spaces and . ' - ( )` },
  title:   { keep: /[^A-Za-z0-9 .,&'()/+:#%-]/g, ok: /^[A-Za-z0-9 .,&'()/+:#%-]+$/, msg: (l) => `${l} can only have English letters, numbers, spaces and . , - & ' ( ) / + : # %` },
  words:   { keep: /[^A-Za-z0-9 ]/g, ok: /^[A-Za-z][A-Za-z0-9 ]*$/, msg: (l) => `${l} must start with a letter and can only have English letters, numbers and spaces` },
  sentence: { keep: /[^A-Za-z0-9 .,'()/-]/g, ok: /^[A-Za-z0-9][A-Za-z0-9 .,'()/-]*$/, msg: (l) => `${l} must start with a letter or a number and can only have English letters, numbers, spaces and . , ' - ( ) /` },
  code:    { keep: /[^A-Za-z0-9/._-]/g, ok: /^[A-Za-z0-9/._-]+$/, msg: (l) => `${l} can only have English letters, numbers and - / _ .` },
  upper:   { upper: true, keep: /[^A-Z0-9]/g, ok: /^[A-Z0-9]+$/, msg: (l) => `${l} can only have capital letters and numbers` },
  digits:  { keep: /[^0-9]/g, ok: /^[0-9]+$/, msg: (l) => `${l} can only have numbers` },
  decimal: { keep: /[^0-9.]/g, oneDot: true, ok: /^(\d+\.?\d*|\.\d+)$/, msg: (l) => `${l} must be a number` },
  email:   { keep: /[^A-Za-z0-9@._%+'-]/g },
  token:   { keep: /[^!-~]/g, ok: /^[!-~]+$/, msg: (l) => `${l} cannot have spaces` },
  pincode: { mask: [/[1-9]/, D, D, D, D, D], ok: /^[1-9]\d{5}$/, msg: (l) => `${l} must be a 6-digit PIN code`, hint: 'Enter a 6-digit PIN code' },
  aadhaar: { keep: /[^0-9]/g, max: 12, ok: /^\d{12}$/, msg: (l) => `${l} must be 12 digits`, hint: 'Enter the 12-digit Aadhaar number' },
  pan:     { upper: true, mask: [L, L, L, L, L, D, D, D, D, L], ok: /^[A-Z]{5}\d{4}[A-Z]$/, msg: (l) => `${l} must be 5 letters, 4 digits and a letter, like ABCDE1234F`, hint: 'Enter the PAN: 5 letters, 4 digits and a letter, like ABCDE1234F' },
  ifsc:    { upper: true, mask: [L, L, L, L, /0/, X, X, X, X, X, X], ok: /^[A-Z]{4}0[A-Z0-9]{6}$/, msg: (l) => `${l} must be 11 characters, like HDFC0001234`, hint: 'Enter the 11-character IFSC, like HDFC0001234' },
  gstin:   { upper: true, mask: [D, D, L, L, L, L, L, D, D, D, D, L, /[1-9A-Z]/, /Z/, X], ok: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[A-Z0-9]$/, msg: (l) => `${l} must be 15 characters, like 22ABCDE1234F1Z5`, hint: 'Enter the 15-character GSTIN, like 22ABCDE1234F1Z5' },
  account: { keep: /[^0-9]/g, max: 18, ok: /^\d{9,18}$/, msg: (l) => `${l} must be 9 to 18 digits`, hint: 'Enter a bank account number of 9 to 18 digits' },
  uan:     { keep: /[^0-9]/g, max: 12, ok: /^\d{12}$/, msg: (l) => `${l} must be 12 digits`, hint: 'Enter the 12-digit UAN' },
  hsn:     { keep: /[^0-9]/g, max: 8, ok: /^(\d{4}|\d{6}|\d{8})$/, msg: (l) => `${l} must be 4, 6 or 8 digits`, hint: 'Enter a 4, 6 or 8 digit HSN code' },
  otp:     { keep: /[^0-9]/g, max: 6, ok: /^\d{6}$/, msg: (l) => `${l} must be 6 digits`, hint: 'Enter the 6-digit code' },
  date:    { pad: true, mask: [/[12]/, D, D, D, '-', /[01]/, D, '-', /[0-3]/, D], ok: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, msg: (l) => `${l} must be a date as YYYY-MM-DD`, hint: 'Enter the date as YYYY-MM-DD' },
  time:    { pad: true, mask: [/[0-2]/, D, ':', /[0-5]/, D], ok: /^([01]\d|2[0-3]):[0-5]\d$/, msg: (l) => `${l} must be a time as HH:MM`, hint: 'Enter the time as HH:MM (24-hour)' },
};

/**
 * Each character kept only where the mask takes it; a separator goes in
 * before a character that fits after it; with `pad`, a digit that can only be
 * the second of a pair gets its 0 (9 → 09 for an hour, a month or a day).
 */
function fitMask(v, mask, pad) {
  let out = '';
  for (const c of v) {
    if (out.length === mask.length) break;
    const m = mask[out.length];
    const next = mask[out.length + 1];
    if (typeof m === 'string') {
      if (c === m) { out += c; continue; }
      if (next?.test?.(c)) out += m + c;
      continue;
    }
    const prev = mask[out.length - 1];
    if (m.test(c)) out += c;
    // "1-" in a date, "9:" in a time: the lone digit was the whole of its pair
    else if (pad && c === next && prev?.test?.('0') && m.test(out.slice(-1))) out = `${out.slice(0, -1)}0${out.slice(-1)}${c}`;
    else if (pad && m.test('0') && next?.test?.(c)) out += '0' + c;
  }
  return out;
}

/** `value` with what a field of `kind` does not take removed. */
export function cleanText(value, kind = 'text') {
  const rule = KINDS[kind] || KINDS.text;
  let v = String(value ?? '');
  if (kind === 'any') return v.replace(MARKUP, '');
  v = v.replace(FOREIGN, '').replace(EMOJI, '');
  if (rule.upper) v = v.toUpperCase();
  if (rule.keep) v = v.replace(rule.keep, '');
  if (rule.oneDot) {
    const i = v.indexOf('.');
    if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
  }
  if (rule.mask) v = fitMask(v, rule.mask, rule.pad);
  if (rule.max) v = v.slice(0, rule.max);
  return v.replace(MARKUP, '');
}

/** The first thing wrong with `value` as a field of `kind`, or null — for a form's own check before saving. */
export function textError(value, label = 'This field', kind = 'text') {
  let v = String(value ?? '').trim();
  if (!v) return null;
  if (new RegExp(MARKUP.source).test(v)) return `${label} must not contain HTML or script tags`;
  if (kind !== 'any' && new RegExp(FOREIGN.source, 'u').test(v)) return `${label} must be in English`;
  const rule = KINDS[kind];
  if (!rule?.ok) return null;
  if (rule.upper) v = v.toUpperCase();
  return rule.ok.test(v) ? null : rule.msg(label);
}

/** What to tell a person whose field of `kind` holds `value` — for the field's own bubble. */
export function textHint(value, kind) {
  const problem = textError(value, 'This field', kind);
  return problem ? (KINDS[kind]?.hint || problem) : null;
}
