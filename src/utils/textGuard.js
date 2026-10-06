/**
 * Every text box in the app follows utils/textRules while a person types
 * (Oct 2026) — installed once, in main.jsx, so no form has to remember it.
 *
 *   typing    a character a field does not take never reaches it (beforeinput,
 *             which a phone's keyboard fires too)
 *   pasting   the text goes in without what the field does not take
 *   anything  else — an input method, autofill, a "<" that becomes a tag when
 *             the next letter is typed — is cleaned on the input event, before
 *             React reads it, so onChange only ever sees the clean value
 *
 * A field's kind is its `data-text` attribute (textRules); without one a text
 * box is `text` and an email box `email`. Passwords, numbers, dates and phone
 * boxes (PhoneInput, its own rule) are left alone.
 */
import { cleanText } from './textRules';

const TEXT_TYPES = new Set(['text', 'search', 'email', 'url']);

function kindOf(el) {
  if (!el || el.readOnly || el.disabled) return null;
  if (el.tagName === 'TEXTAREA') return el.dataset.text || 'text';
  if (el.tagName !== 'INPUT') return null;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  if (!TEXT_TYPES.has(type)) return null;
  return el.dataset.text || (type === 'email' ? 'email' : 'text');
}

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

const INSERTS = /^insert(Text|ReplacementText|FromPaste|FromDrop|FromYank)$/;

function onBeforeInput(e) {
  const kind = kindOf(e.target);
  if (!kind || e.isComposing || !INSERTS.test(e.inputType || '')) return;
  const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
  if (!data) return;
  const ok = cleanText(data, kind);
  if (ok === data) return;
  e.preventDefault();
  if (ok) document.execCommand('insertText', false, ok);
}

function onInput(e) {
  const kind = kindOf(e.target);
  if (!kind || e.isComposing) return;
  clean(e.target, kind);
}

// An input method finishes a word: clean it, and tell React (it has already
// seen the composed text).
function onCompositionEnd(e) {
  const kind = kindOf(e.target);
  if (kind && clean(e.target, kind)) e.target.dispatchEvent(new Event('input', { bubbles: true }));
}

let installed = false;
export function installTextGuard() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('beforeinput', onBeforeInput, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('compositionend', onCompositionEnd, true);
}
