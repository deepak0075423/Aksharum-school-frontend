/**
 * The app's phone-number box. Every phone field uses it.
 *
 * The platform is India-only, so a phone number is a 10-digit mobile number
 * with no country code: the box takes digits and nothing else, and never more
 * than ten of them —
 *
 *   typing    a key that is not a digit (e, E, +, -, ., a space, a letter) is
 *             refused before it reaches the box, on a phone's on-screen
 *             keyboard too, where keydown cannot tell which key was pressed
 *   pasting   the digits are kept and the rest dropped; a whole number with
 *             +91 or a leading 0 ("+91 98765 43210") pastes as its ten digits
 *   anything  else that changes the value (autofill, drag and drop, an input
 *             method) is cleaned the same way before the form sees it
 *
 * It is a drop-in for <input>: the same props, the kit's own className, and
 * onChange still receives the event, with e.target.value already cleaned. A
 * stored value from before the rule ("+91 98765 43210") shows as its ten
 * digits. The browser's own validity agrees with the rule — a number that is
 * not a 10-digit mobile is invalid, with that as its message — which the
 * hostel forms check before moving on, and any <form> without noValidate.
 */
import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { PHONE_LENGTH, PHONE_HINT, isPhone, phoneInputValue } from '../../utils/validators';

const setNativeValue = (el, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const PhoneInput = forwardRef(function PhoneInput(
  { value, onChange, onKeyDown, onPaste, onDrop, ...rest }, ref,
) {
  const box = useRef(null);
  const shown = phoneInputValue(value);
  const setRef = useCallback((el) => {
    box.current = el;
    if (typeof ref === 'function') ref(el); else if (ref) ref.current = el;
  }, [ref]);

  useLayoutEffect(() => {
    box.current?.setCustomValidity(shown && !isPhone(shown) ? PHONE_HINT : '');
  }, [shown]);

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const guard = (e) => { if (e.inputType === 'insertText' && e.data && /\D/.test(e.data)) e.preventDefault(); };
    el.addEventListener('beforeinput', guard);
    return () => el.removeEventListener('beforeinput', guard);
  }, []);

  // Text arriving in one piece goes in at the caret, then through the same rule.
  const insert = (el, text) => {
    const from = el.selectionStart ?? el.value.length;
    const to = el.selectionEnd ?? el.value.length;
    const next = phoneInputValue(el.value.slice(0, from) + text + el.value.slice(to), el.value);
    const caret = Math.min(from + text.replace(/\D/g, '').length, next.length);
    setNativeValue(el, next);
    try { el.setSelectionRange(caret, caret); } catch { /* not focused */ }
  };

  return (
    <input
      {...rest}
      ref={setRef}
      type="tel"
      inputMode="numeric"
      maxLength={PHONE_LENGTH}
      value={shown}
      onKeyDown={(e) => {
        if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
        onKeyDown?.(e);
      }}
      onPaste={(e) => {
        onPaste?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        insert(e.currentTarget, e.clipboardData.getData('text'));
      }}
      onDrop={(e) => {
        onDrop?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        e.currentTarget.focus();
        insert(e.currentTarget, e.dataTransfer.getData('text'));
      }}
      onChange={(e) => {
        const clean = phoneInputValue(e.target.value, shown);
        if (e.target.value !== clean) e.target.value = clean;
        onChange?.(e);
      }}
    />
  );
});

export default PhoneInput;
