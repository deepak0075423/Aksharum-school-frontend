/**
 * Every text box in the app follows utils/textRules while a person types
 * (Oct 2026) — installed once, in main.jsx, so no form has to remember it.
 *
 *   typing    a character a field does not take never reaches it (beforeinput,
 *             which a phone's keyboard fires too); a format (a PIN code, a PAN)
 *             takes a letter or a digit only where one goes, and no more than
 *             its length
 *   pasting   the text goes in without what the field does not take
 *   anything  else — an input method, autofill, a "<" that becomes a tag when
 *             the next letter is typed — is cleaned on the input event, before
 *             React reads it, so onChange only ever sees the clean value
 *   saving    a format left unfinished (a 5-digit PIN code) stops the form with
 *             the field's own bubble — only for what the person typed, so a
 *             record saved before the rule can still be edited
 *
 * A field's kind is its `data-text` attribute (textRules); without one a text
 * box is `text`, an email box `email`, a web-address box `token`. Passwords,
 * dates and phone boxes (PhoneInput, its own rule) are left alone.
 *
 * Number boxes (<input type="number">) take digits, a minus sign only when
 * their `min` is below zero, and a decimal point only when their `step` has
 * one ("0.01", "any") — HTML's own meaning, where no step means whole numbers.
 * Never "e" or "+".
 */
import { KINDS, cleanText, textHint } from './textRules';

const TEXT_TYPES = new Set(['text', 'search', 'email', 'url']);

function kindOf(el) {
  if (!el || el.readOnly || el.disabled) return null;
  if (el.tagName === 'TEXTAREA') return el.dataset.text || 'text';
  if (el.tagName !== 'INPUT') return null;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  if (!TEXT_TYPES.has(type)) return null;
  return el.dataset.text || (type === 'email' ? 'email' : type === 'url' ? 'token' : 'text');
}

const isNumberBox = (el) => el?.tagName === 'INPUT' && el.type === 'number' && !el.readOnly && !el.disabled;

const valueSetter = (el) => Object.getOwnPropertyDescriptor(
  el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value',
).set;

/** Put the clean value in place through the prototype setter, so React still sees a change. */
function clean(el, kind) {
  const v = el.value;
  const next = cleanText(v, kind);
  if (next === v) return false;
  const at = el.selectionStart ?? v.length;
  const caret = Math.min(cleanText(v.slice(0, at), kind).length, next.length);
  valueSetter(el).call(el, next);
  try { el.setSelectionRange(caret, caret); } catch { /* not focusable now */ }
  return true;
}

/**
 * The part of `data` a field of `kind` takes when it replaces v[s, end):
 * within the length the rest of the field leaves, one decimal point between
 * them.
 */
function fits(v, s, end, data, kind) {
  const rule = KINDS[kind] || {};
  const rest = v.slice(0, s) + v.slice(end);
  let ok = cleanText(data, kind);
  if (rule.oneDot && rest.includes('.')) ok = ok.replace(/\./g, '');
  return rule.max ? ok.slice(0, Math.max(0, rule.max - rest.length)) : ok;
}

/**
 * A format (a PAN, a date): what is typed can change what is already there —
 * a capital for a small letter, "2026-1-" becoming "2026-01-" — so the field
 * takes the whole clean value, and React is told. A full one takes no more.
 */
function format(e, el, data, kind) {
  const v = el.value, s = el.selectionStart, end = el.selectionEnd ?? s;
  const before = v.slice(0, s), after = v.slice(end);
  e.preventDefault();
  if ((before + after).length >= KINDS[kind].mask.length) return;
  const next = cleanText(before + data + after, kind);
  if (next === v) return;
  const caret = Math.min(cleanText(before + data, kind).length, next.length);
  valueSetter(el).call(el, next);
  try { el.setSelectionRange(caret, caret); } catch { /* not focusable now */ }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const INSERTS = /^insert(Text|ReplacementText|FromPaste|FromDrop|FromYank)$/;

function onBeforeInput(e) {
  if (e.isComposing || !INSERTS.test(e.inputType || '')) return;
  const el = e.target;
  const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
  if (!data) return;
  if (isNumberBox(el)) { numberInput(e, el, data); return; }
  const kind = kindOf(el);
  if (!kind) return;
  if (KINDS[kind]?.mask && el.selectionStart != null) {
    const want = el.value.slice(0, el.selectionStart) + data + el.value.slice(el.selectionEnd ?? el.selectionStart);
    if (want.length <= KINDS[kind].mask.length && cleanText(want, kind) === want) return;
    format(e, el, data, kind);
    return;
  }
  // Email boxes have no caret position to read; their kind needs none.
  const ok = el.selectionStart == null ? cleanText(data, kind)
    : fits(el.value, el.selectionStart, el.selectionEnd ?? el.selectionStart, data, kind);
  if (ok === data) return;
  e.preventDefault();
  if (ok) document.execCommand('insertText', false, ok);
}

/** A number box: what its `min` and `step` allow, and a paste of "₹ 1,500" as 1500. */
function numberInput(e, el, data) {
  const min = parseFloat(el.getAttribute('min'));
  const step = (el.getAttribute('step') || '').trim().toLowerCase();
  const negative = Number.isFinite(min) && min < 0;
  const decimals = step === 'any' || (step !== '' && !Number.isInteger(Number(step)));
  const takes = new RegExp(`^[0-9${decimals ? '.' : ''}${negative ? '-' : ''}]+$`);
  if (takes.test(data)) return;
  e.preventDefault();
  if (e.inputType === 'insertText') return;   // a key the box does not take
  const number = data.replace(/[\s,₹]/g, '');
  if (new RegExp(`^${negative ? '-?' : ''}\\d+${decimals ? '(\\.\\d+)?' : ''}$`).test(number)) {
    document.execCommand('insertText', false, number);
  }
}

const typed = new WeakMap();   // a field → the value its person last typed
const ours = new WeakSet();    // fields whose bubble this guard set

function onInput(e) {
  const el = e.target;
  const kind = kindOf(el);
  if (!kind || e.isComposing) return;
  clean(el, kind);
  typed.set(el, el.value);
  if (ours.has(el)) { el.setCustomValidity(''); ours.delete(el); }
}

// An input method finishes a word: clean it, and tell React (it has already
// seen the composed text).
function onCompositionEnd(e) {
  const kind = kindOf(e.target);
  if (kind && clean(e.target, kind)) e.target.dispatchEvent(new Event('input', { bubbles: true }));
}

// A phone shows the keyboard a field needs: digits for a PIN code, capitals for a PAN.
const KEYBOARD = { digits: 'numeric', pincode: 'numeric', aadhaar: 'numeric', account: 'numeric', uan: 'numeric', hsn: 'numeric', otp: 'numeric', decimal: 'decimal' };
function onFocusIn(e) {
  const el = e.target;
  const kind = kindOf(el);
  if (!kind) return;
  if (KEYBOARD[kind] && !el.hasAttribute('inputmode')) el.setAttribute('inputmode', KEYBOARD[kind]);
  if (KINDS[kind]?.upper && !el.hasAttribute('autocapitalize')) el.setAttribute('autocapitalize', 'characters');
}

/**
 * A form is sent: a field its person typed into that is not finished (a PIN
 * code of five digits, half a PAN) stops it, with the field's own bubble —
 * before React's onSubmit runs. A field on a step not shown is left to the
 * form's own check: a bubble there would be one nobody can see.
 */
function onSubmit(e) {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  for (const el of form.elements) {
    const kind = kindOf(el);
    if (!kind || typed.get(el) !== el.value || !el.getClientRects().length) continue;
    const problem = textHint(el.value, kind);
    if (!problem) continue;
    e.preventDefault();
    e.stopImmediatePropagation();
    el.setCustomValidity(problem);
    ours.add(el);
    el.reportValidity();
    return;
  }
}

let installed = false;
export function installTextGuard() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('beforeinput', onBeforeInput, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('compositionend', onCompositionEnd, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('submit', onSubmit, true);
}
