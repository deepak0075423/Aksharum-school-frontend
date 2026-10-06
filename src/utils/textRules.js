/**
 * What text a field takes (Oct 2026): English only, and never markup. Same
 * rules as the server (school-backend/utils/textRules.js), which refuses
 * what breaks them; here they are applied while a person types
 * (utils/textGuard), so a field never holds what would be refused.
 *
 * A field says what it is with `data-text` (inputs and textareas without one
 * are `text`):
 *   text     anything written in English — letters A–Z, digits, punctuation,
 *            symbols (₹ ° · – ’ …) — but no other script, no accents, no emoji
 *   name     a person or a place: English letters, spaces and . ' -
 *   letters  English letters and spaces only
 *   email    letters, digits and @ . _ % + - '
 *   any      any language and emoji (chat; a notice written in Hindi on purpose)
 * Every kind refuses markup: "<" followed by a letter, "/", "!" or "?" is how
 * a browser starts a tag (<script, </b, <!--), so that "<" is dropped.
 */
export const MARKUP = /<(?=[A-Za-z!/?])/g;
// A letter, a mark or a digit from outside English. µ stays: it is a unit (µg).
const FOREIGN = /(?![A-Za-zµ])\p{L}|\p{M}|(?![0-9])\p{Nd}/gu;
const EMOJI = /(?![©®™])\p{Extended_Pictographic}|[‍️]/gu;

const KEEP = {
  name:    /[^A-Za-z .'-]/g,
  letters: /[^A-Za-z ]/g,
  email:   /[^A-Za-z0-9@._%+'-]/g,
};

/** `value` with what a field of `kind` does not take removed. */
export function cleanText(value, kind = 'text') {
  let v = String(value ?? '');
  if (kind === 'any') return v.replace(MARKUP, '');
  v = v.replace(FOREIGN, '').replace(EMOJI, '');
  if (KEEP[kind]) v = v.replace(KEEP[kind], '');
  return v.replace(MARKUP, '');
}

const RULE_MSG = {
  name:    (l) => `${l} can only have English letters, spaces and . ' -`,
  letters: (l) => `${l} can only have English letters and spaces`,
};

/** The first thing wrong with `value` as a field of `kind`, or null — for a form's own check before saving. */
export function textError(value, label = 'This field', kind = 'text') {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (new RegExp(MARKUP.source).test(v)) return `${label} must not contain HTML or script tags`;
  if (new RegExp(FOREIGN.source, 'u').test(v)) return `${label} must be in English`;
  if (kind === 'name' && !/^[A-Za-z][A-Za-z .'-]*$/.test(v)) return RULE_MSG.name(label);
  if (kind === 'letters' && !/^[A-Za-z ]+$/.test(v)) return RULE_MSG.letters(label);
  return null;
}
