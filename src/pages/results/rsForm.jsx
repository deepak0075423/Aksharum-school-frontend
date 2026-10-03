/**
 * The Results module's popup form (Oct 2026, to the user's "Create Formal
 * Exam" mockup): a header with its icon tile, a numbered rail of steps on the
 * left, the steps' cards in one scrolling pane, Cancel / Back / Next below.
 *
 * It keeps the hostel wizard's conventions (pages/hostel/admin/hsForm.jsx) in
 * this module's own kit: the steps are one scrolling form, as the mockup draws
 * Step 1 with the next sections waiting below it; the rail follows the scroll
 * and a click on a step goes to it; Next checks the step before moving on, and
 * the last step's button checks every step again before it submits.
 *
 * One difference: the checks are the form's own. `check(stepKey)` returns
 * whether the step is fine (and shows its own errors); most of what this form
 * must refuse — a class with no section ticked, a pass mark above the
 * maximum, a result date before the exam ends — is not something the
 * browser's own validity can express.
 *
 *   StepModal  the frame
 *   Card       one card of the pane: a tinted head with its tile, then a body
 *   Field      a label, the control (with its leading icon or chevron), the
 *              error or hint under it, and the "0/500" inside a text area
 *   TagSelect  a select whose closed face is a coloured tag ("● Active")
 *   CheckRow   a checkbox with its sentence and the grey line under it
 *   SumList    the summary's "Label : value" rows, each with its icon
 *   Note       the blue note with its (i)
 *   Review     the last step's list of everything, with a way back to each part
 */
import React, { Children, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ico } from './rsUI';

/* ── The page behind holds still while the form is up ─────────────────────── */
let locks = 0; let before = '';
function useScrollLock(on) {
  useEffect(() => {
    if (!on) return undefined;
    if (locks === 0) { before = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    locks += 1;
    return () => { locks -= 1; if (locks === 0) document.body.style.overflow = before; };
  }, [on]);
}

/**
 * The frame.
 *   steps        [{ key, title, sub, icon }]
 *   check(key)   true when that step may be left; shows its own errors when not
 *   onSubmit     called once every step has passed
 *   submitLabel  the last step's button ("Create Exam")
 *   banner       a refusal from the server, shown above the first card
 *   navRef       filled with goTo(i), for the form's own "Edit" and "Change" links
 */
export function StepModal({
  open, onClose, icon = 'sheet', title, subtitle, steps, check, busy, onSubmit, submitLabel = 'Save',
  submitIcon, banner, navRef, children,
}) {
  useScrollLock(open);
  const [at, setAt] = useState(0);
  const [done, setDone] = useState(() => new Set());
  const main = useRef(null);
  const quiet = useRef(0);           // while a programmatic scroll runs, the rail keeps still
  const titleId = useId();

  // Each time the form opens it starts at the top, on its first step, with the
  // first field ready to type in.
  useLayoutEffect(() => {
    if (!open) return undefined;
    setAt(0); setDone(new Set());
    if (main.current) main.current.scrollTop = 0;
    const t = setTimeout(() => main.current?.querySelector('input:not([type="checkbox"]):not([disabled]), textarea')?.focus({ preventScroll: true }), 40);
    return () => clearTimeout(t);
  }, [open]);

  // Escape closes the form — not while it is saving.
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [open, busy, onClose]);

  const sectionsOf = useCallback((key) => (main.current ? [...main.current.querySelectorAll(`[data-step="${key}"]`)] : []), []);

  const goTo = useCallback((i) => {
    setAt(i);
    const el = sectionsOf(steps[i]?.key)[0];
    if (el && main.current) {
      quiet.current = Date.now();
      main.current.scrollTo({ top: el.offsetTop - 14, behavior: 'smooth' });
    }
  }, [sectionsOf, steps]);

  useEffect(() => { if (navRef) navRef.current = goTo; }, [navRef, goTo]);

  // The first field a check refused, brought into view once it shows as refused.
  const showBad = (key) => setTimeout(() => {
    const bad = sectionsOf(key).map((s) => s.querySelector('[data-bad="true"]')).find(Boolean);
    if (!bad) return;
    quiet.current = Date.now();
    bad.scrollIntoView({ block: 'center', behavior: 'smooth' });
    bad.querySelector('input:not([disabled]), select:not([disabled]), textarea')?.focus({ preventScroll: true });
  }, 40);

  const next = () => {
    const key = steps[at].key;
    if (!check(key)) { showBad(key); return; }
    setDone((d) => new Set(d).add(key));
    goTo(Math.min(at + 1, steps.length - 1));
  };

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    if (at < steps.length - 1) { next(); return; }
    // Every step again, in order: the first one refused is where the reader goes.
    for (let i = 0; i < steps.length; i += 1) {
      if (!check(steps[i].key)) { setAt(i); showBad(steps[i].key); return; }
    }
    onSubmit();
  };

  // The rail follows the reader: the step whose section is at the top of the
  // pane, or the last one once the pane is scrolled to its end.
  const onScroll = () => {
    if (Date.now() - quiet.current < 700) return;
    const pane = main.current; if (!pane) return;
    const top = pane.scrollTop + 40;
    let current = 0;
    steps.forEach((s, i) => { const el = sectionsOf(s.key)[0]; if (el && el.offsetTop <= top) current = i; });
    if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 4) current = steps.length - 1;
    setAt(current);
  };

  // A refusal from the server is shown at the top of the pane; take the reader there.
  useEffect(() => {
    if (!banner || !main.current) return;
    quiet.current = Date.now();
    setAt(0);
    main.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [banner]);

  if (!open) return null;
  const last = at === steps.length - 1;
  return createPortal(
    <div className="rsf-overlay">
      <form className="rsf" noValidate onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="rsf__head">
          <span className="rsf__mark" aria-hidden><Ico name={icon} size={30} /></span>
          <div className="rsf__titles">
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="rsf__close" aria-label="Close" onClick={onClose} disabled={busy}><Ico name="close" size={27} /></button>
        </header>

        <div className="rsf__body">
          <nav className="rsf__rail" aria-label="Steps">
            <ol>
              {steps.map((s, i) => {
                const ok = done.has(s.key) && i !== at;
                return (
                  <li key={s.key} className={i === at ? 'is-on' : ok ? 'is-done' : undefined}>
                    <button type="button" onClick={() => goTo(i)} aria-current={i === at ? 'step' : undefined}>
                      <span className="rsf__num">{ok ? <Ico name="check" size={15} /> : i + 1}</span>
                      <span className="rsf__sico"><Ico name={s.icon} size={24} /></span>
                      <span className="rsf__stext"><strong>{s.title}</strong><span>{s.sub}</span></span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          <div className="rsf__main" ref={main} onScroll={onScroll}>
            {banner ? <p className="rsf-banner" role="alert"><Ico name="alert" size={16} />{banner}</p> : null}
            {children}
            <div className="rsf__tail" aria-hidden />
          </div>
        </div>

        <footer className="rsf__foot">
          <button type="button" className="rsf-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <span className="rsf__gap" />
          <button type="button" className="rsf-btn rsf-btn--soft" disabled={at === 0 || busy} onClick={() => goTo(at - 1)}>Back</button>
          <button type="submit" className={`rsf-btn rsf-btn--primary${busy ? ' is-busy' : ''}`} disabled={busy}>
            {last ? (busy ? 'Saving…' : submitLabel) : 'Next'}
            {last ? (submitIcon ? <Ico name={submitIcon} size={17} /> : null) : <Ico name="arrowRight" size={18} />}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

/* ── The pane's pieces ────────────────────────────────────────────────────── */

/** One card. `step` ties it to the rail; `tone` 'solid' paints the tile (the summary's). */
export function Card({ step, icon, tone, title, sub, size, className = '', extra, children, bodyClass = '' }) {
  return (
    <section className={`rsf-card${size ? ` rsf-card--${size}` : ''} ${className}`} data-step={step}>
      <header className="rsf-card__head">
        <span className={`rsf-card__tile${tone ? ` is-${tone}` : ''}`} aria-hidden><Ico name={icon} size={size === 'lg' ? 27 : 25} /></span>
        <div className="rsf-card__titles"><h3>{title}</h3>{sub ? <p>{sub}</p> : null}</div>
        {extra ? <span className="rsf-card__extra">{extra}</span> : null}
      </header>
      <div className={`rsf-card__body ${bodyClass}`}>{children}</div>
    </section>
  );
}

/**
 * A field. The control is the child — an <input>, <select> or <textarea> —
 * given the kit's look and tied to its label and error.
 *   icon     the dark glyph inside it on the left (the calendar)
 *   select   draws the chevron on the right
 *   count    [length, max] — the "0/500" in a text area's corner
 *   wide     spans the whole grid row
 */
export function Field({ label, required, optional, error, hint, icon, select, count, wide, className = '', children }) {
  const auto = useId();
  const child = Children.only(children);
  const native = React.isValidElement(child) && typeof child.type === 'string';
  const id = (native && child.props.id) || auto;
  const control = native
    ? React.cloneElement(child, {
      id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-err` : undefined,
      className: `rsf-in ${child.props.className || ''}`,
    })
    : child;
  return (
    <div className={`rsf-fld${wide ? ' rsf-fld--wide' : ''} ${className}`} data-bad={error ? 'true' : undefined}>
      {label ? (
        <label className="rsf-fld__label" htmlFor={id}>
          {label}{required ? <i aria-hidden> *</i> : null}{optional ? <small> (Optional)</small> : null}
        </label>
      ) : null}
      <div className={`rsf-ctl${icon ? ' has-icon' : ''}${select ? ' is-select' : ''}${count ? ' has-count' : ''}`}>
        {icon ? <span className="rsf-ctl__icon" aria-hidden><Ico name={icon} size={21} /></span> : null}
        {control}
        {select ? <span className="rsf-ctl__chev" aria-hidden><Ico name="chevronDown" size={17} /></span> : null}
        {count ? <span className="rsf-ctl__count" aria-live="polite">{count[0]}/{count[1]}</span> : null}
      </div>
      {error ? <p className="rsf-err" id={`${id}-err`}>{error}</p> : hint ? <p className="rsf-hint">{hint}</p> : null}
    </div>
  );
}

/**
 * A select whose closed face is a tag — "Active" in green with its mark —
 * as the mockup draws Status. The real <select> lies over the box, unseen,
 * so the list, the keyboard and the screen reader are the browser's own.
 *   options  [{ value, label, tone, icon, option }]  `option` is the longer
 *            text the opened list shows
 */
export function TagSelect({ id, value, onChange, options, label, disabled, error }) {
  const cur = options.find((o) => o.value === value) || options[0];
  return (
    <div className={`rsf-ctl is-select rsf-tagsel${disabled ? ' is-disabled' : ''}`} data-bad={error ? 'true' : undefined}>
      <span className={`rsf-tag rs-t-${cur?.tone || 'slate'}`} aria-hidden>
        {cur?.icon ? <Ico name={cur.icon} size={14} /> : null}{cur?.label}
      </span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.option || o.label}</option>)}
      </select>
      {disabled ? null : <span className="rsf-ctl__chev" aria-hidden><Ico name="chevronDown" size={17} /></span>}
    </div>
  );
}

/** A checkbox with its sentence, and the grey line under it. */
export function CheckRow({ checked, onChange, label, hint, disabled, className = '' }) {
  return (
    <label className={`rsf-check${disabled ? ' is-disabled' : ''} ${className}`}>
      <input type="checkbox" className="rsf-box" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="rsf-check__text"><span>{label}</span>{hint ? <small>{hint}</small> : null}</span>
    </label>
  );
}

/** "Label : value" rows, each with its icon; an empty value shows `empty` or a dash. */
export function SumList({ rows }) {
  return (
    <dl className="rsf-sumlist">
      {rows.map(([icon, k, v, empty]) => (
        <div key={k} className={v ? undefined : 'is-empty'}>
          <dt><span className="rsf-sumlist__ico" aria-hidden><Ico name={icon} size={16} /></span>{k}</dt>
          <dd><span aria-hidden className="rsf-sumlist__colon">:</span><span className="rsf-sumlist__val" title={typeof v === 'string' ? v : undefined}>{v || empty || '-'}</span></dd>
        </div>
      ))}
    </dl>
  );
}

export function Note({ children, tone = 'blue', className = '' }) {
  return (
    <div className={`rsf-note rsf-note--${tone} ${className}`} role="note">
      <span className="rsf-note__ico" aria-hidden><Ico name={tone === 'amber' ? 'alertTri' : 'infoDisc'} size={25} /></span>
      <p>{children}</p>
    </div>
  );
}

/** The last step: everything entered, part by part, with a way back to each. */
export function Review({ groups, onEdit }) {
  return (
    <div className="rsf-review">
      {groups.filter((g) => g.rows.length).map((g) => (
        <section key={g.title}>
          <header>
            <h4>{g.title}</h4>
            {onEdit && g.step !== undefined ? <button type="button" className="rsf-link" onClick={() => onEdit(g.step)}>Edit</button> : null}
          </header>
          <dl>
            {g.rows.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length) ? '—' : v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
