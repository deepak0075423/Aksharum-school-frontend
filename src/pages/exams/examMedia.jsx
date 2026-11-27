/**
 * Pictures and maths in aptitude questions (Nov 2026).
 *
 *   • A question — and each option — may carry a picture: a screenshot, a
 *     diagram. It is uploaded the moment it is chosen, dropped or PASTED
 *     (Ctrl/⌘+V of a screenshot straight into the field), and the question
 *     then holds its address like any other field.
 *   • Text is any language, and exponents are typed with the x² / x₂ buttons:
 *     select "2" and press x² for "²", or press x² first and keep typing — a
 *     space ends the raised run. Unicode superscripts, so "x²", "10⁻³" and
 *     "aⁿ⁺¹" read the same on the web, on the phone and in a spreadsheet,
 *     with nothing to render.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import Icon from '../../components/ui/icons';

// Uploads are served from the backend root; VITE_API_URL points at /api.
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');

/** A stored picture address → something an <img> can load. */
export function examImageUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

// ── Pictures ─────────────────────────────────────────────────────────────────

/** Full-size view of one picture. Escape, ✕ or a click outside closes it. */
function Lightbox({ src, alt, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="apxlight" role="dialog" aria-modal="true" aria-label={alt || 'Picture'} onClick={onClose}>
      <img src={src} alt={alt || ''} onClick={(e) => e.stopPropagation()} />
      <button type="button" className="apxlight__close" onClick={onClose} aria-label="Close picture">
        <Icon name="close" size={20} />
      </button>
    </div>,
    document.body,
  );
}

/**
 * A question's or an option's picture. `zoom` makes it open full size on a
 * click (off inside an answer tile, where a click picks the answer).
 */
export function ExamPicture({ src, alt = 'Question picture', size = 'question', zoom = true }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  if (!src) return null;
  const url = examImageUrl(src);
  if (broken) return <span className={`apxpic apxpic--${size} is-broken`}><Icon name="alert" size={14} /> Picture could not load</span>;
  const img = <img src={url} alt={alt} draggable={false} onError={() => setBroken(true)} />;
  if (!zoom) return <span className={`apxpic apxpic--${size}`}>{img}</span>;
  return (
    <>
      <button type="button" className={`apxpic apxpic--${size} is-zoom`} onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Open the picture full size" aria-label={`${alt} — open full size`}>
        {img}
        <span className="apxpic__zoom" aria-hidden><Icon name="search" size={13} /></span>
      </button>
      {open && <Lightbox src={url} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The image a paste or drop carries, if any. */
export function imageFrom(dataTransfer) {
  const items = [...(dataTransfer?.items || [])];
  const hit = items.find((it) => it.kind === 'file' && /^image\//.test(it.type));
  if (hit) return hit.getAsFile();
  return [...(dataTransfer?.files || [])].find((f) => /^image\//.test(f.type)) || null;
}

const PICTURE_TYPES = /^image\/(png|jpeg|webp|gif)$/;
const MAX_BYTES = 5 * 1024 * 1024;

/** Why a file cannot be a question picture, or null. */
export function pictureProblem(file) {
  if (!file) return 'Choose a picture';
  if (!PICTURE_TYPES.test(file.type)) return 'Use a PNG, JPG, WebP or GIF picture';
  if (file.size > MAX_BYTES) return 'That picture is over 5 MB — crop it or save it smaller';
  return null;
}

/**
 * "Add picture" — or the picture itself, with Replace / Remove. `upload(file)`
 * resolves to the stored address; `busy` shows while one is on its way.
 */
export function PictureField({ value, onChange, upload, busy, compact = false, label = 'Add picture', alt }) {
  const input = useRef(null);
  const pick = async (file) => {
    const why = pictureProblem(file);
    if (why) { toast.error(why); return; }
    const url = await upload(file);
    if (url) onChange(url);
  };
  const chooser = (
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f); }} />
  );

  if (compact) {
    return (
      <>
        {chooser}
        <button type="button" className={`apxact${value ? ' is-on' : ''}`} disabled={busy}
          title={value ? 'Replace the picture' : 'Add a picture (or paste a screenshot into the box)'}
          aria-label={value ? 'Replace picture' : 'Add picture'} onClick={() => input.current?.click()}>
          {busy ? <span className="apxspin" aria-hidden /> : <Icon name="image" size={15} />}
        </button>
      </>
    );
  }

  return (
    <div className="apxpicfield"
      onDragOver={(e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); }}
      onDrop={(e) => { const f = imageFrom(e.dataTransfer); if (f) { e.preventDefault(); pick(f); } }}>
      {chooser}
      {value ? (
        <div className="apxpicfield__have">
          <ExamPicture src={value} alt={alt} size="edit" />
          <div className="apxpicfield__acts">
            <button type="button" className="apxinline" disabled={busy} onClick={() => input.current?.click()}>
              <Icon name="refresh" size={14} /> Replace
            </button>
            <button type="button" className="apxinline apxinline--danger" disabled={busy} onClick={() => onChange('')}>
              <Icon name="trash" size={14} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="apxpicfield__add" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <span className="apxspin" aria-hidden /> : <Icon name="image" size={16} />}
          <span>{busy ? 'Uploading…' : label}</span>
          <small>or paste a screenshot into the box · drop one here</small>
        </button>
      )}
    </div>
  );
}

// ── Exponents and symbols ────────────────────────────────────────────────────

const RAISE = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ',
  n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
};
const LOWER = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ',
  r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
};
const SCRIPT = { sup: RAISE, sub: LOWER };
const convert = (text, kind) => [...text].map((ch) => SCRIPT[kind][ch] ?? SCRIPT[kind][ch.toLowerCase()] ?? ch).join('');

const SYMBOLS = ['√', '∛', 'π', 'θ', '°', '±', '×', '÷', '≠', '≈', '≤', '≥', '∞', '∠', '△', '½'];

/**
 * The fields a question dialog types maths into, and the one toolbar that
 * serves them all — it acts on whichever field was focused last.
 *
 *   const m = useMathFields();
 *   <textarea {...m.field('q', f.questionText, set)} />
 *   <MathBar m={m} />
 */
export function useMathFields() {
  const els = useRef({});
  const setters = useRef({});
  const [active, setActive] = useState(null);
  const [mode, setModeState] = useState(null);       // 'sup' | 'sub' | null
  const modeRef = useRef(null);
  const setMode = (m) => { modeRef.current = m; setModeState(m); };

  // The box is written and its caret placed NOW, before React renders the
  // same value — React then leaves the box alone. Restoring the caret a frame
  // later lost keystrokes typed in between.
  const put = (key, value, caret) => {
    const el = els.current[key];
    if (el) {
      el.value = value;
      try { el.setSelectionRange(caret, caret); } catch { /* not a text box */ }
    }
    setters.current[key]?.(value);
    if (el && document.activeElement !== el) {
      requestAnimationFrame(() => {
        el.focus({ preventScroll: true });
        try { el.setSelectionRange(caret, caret); } catch { /* not a text box */ }
      });
    }
  };

  const field = useCallback((key, value, set) => {
    setters.current[key] = set;
    return {
      ref: (el) => { if (el) els.current[key] = el; else delete els.current[key]; },
      value,
      'data-text': 'any',          // any language — utils/textGuard leaves it alone
      lang: 'mul',
      spellCheck: true,
      onFocus: () => setActive(key),
      onChange: (e) => {
        const el = e.target;
        let next = el.value;
        const kind = modeRef.current;
        const grew = next.length - String(value ?? '').length;
        if (kind && grew > 0 && el.selectionStart != null) {
          const end = el.selectionStart;
          const start = end - grew;
          const typed = next.slice(start, end);
          // A space ends the raised (or lowered) run and goes in as itself.
          if (/\s/.test(typed)) setMode(null);
          const run = typed.replace(/\s.*$/s, '');
          next = next.slice(0, start) + convert(run, kind) + typed.slice(run.length) + next.slice(end);
          if (next !== el.value) { put(key, next, end); return; }
        }
        set(next);
      },
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** x² / x₂: convert the selection, or switch the mode on for what comes next. */
  const script = (kind) => {
    const el = els.current[active];
    if (!el) { toast('Click into the question or an option first'); return; }
    const { selectionStart: a, selectionEnd: b, value } = el;
    if (a != null && b != null && b > a) {
      const done = convert(value.slice(a, b), kind);
      put(active, value.slice(0, a) + done + value.slice(b), a + done.length);
      setMode(null);
      return;
    }
    setMode(modeRef.current === kind ? null : kind);
    el.focus({ preventScroll: true });
  };

  const insert = (text) => {
    const el = els.current[active];
    if (!el) { toast('Click into the question or an option first'); return; }
    const a = el.selectionStart ?? el.value.length;
    const b = el.selectionEnd ?? a;
    const max = Number(el.getAttribute('maxlength')) || Infinity;
    if (el.value.length - (b - a) + text.length > max) return;
    put(active, el.value.slice(0, a) + text + el.value.slice(b), a + text.length);
  };

  return { field, script, insert, mode, active, setMode };
}

/** The toolbar over the question dialog. Buttons never take focus from the field. */
export function MathBar({ m }) {
  const keep = (e) => e.preventDefault();      // the field keeps its caret
  return (
    <div className="apxmath" role="toolbar" aria-label="Exponents and symbols">
      <button type="button" className={`apxmath__btn apxmath__btn--script${m.mode === 'sup' ? ' is-on' : ''}`}
        onMouseDown={keep} onClick={() => m.script('sup')} aria-pressed={m.mode === 'sup'}
        title="Exponent — select text and press, or press and type (a space ends it)">
        x<sup>2</sup>
      </button>
      <button type="button" className={`apxmath__btn apxmath__btn--script${m.mode === 'sub' ? ' is-on' : ''}`}
        onMouseDown={keep} onClick={() => m.script('sub')} aria-pressed={m.mode === 'sub'}
        title="Subscript — select text and press, or press and type (a space ends it)">
        x<sub>2</sub>
      </button>
      <span className="apxmath__sep" aria-hidden />
      {SYMBOLS.map((s) => (
        <button key={s} type="button" className="apxmath__btn" onMouseDown={keep} onClick={() => m.insert(s)} title={`Insert ${s}`}>
          {s}
        </button>
      ))}
      {m.mode && (
        <span className="apxmath__note" aria-live="polite">
          {m.mode === 'sup' ? 'Typing raised' : 'Typing lowered'} — space or the button to stop
        </span>
      )}
    </div>
  );
}
