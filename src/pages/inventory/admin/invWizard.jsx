/**
 * The shell every Inventory form is built on (Sep 29 2026, to the user's
 * eleven pop-up mockups).
 *
 * One dialog, five parts: an icon header, a numbered step rail down the left,
 * a form of numbered sections in the middle, an optional preview panel on the
 * right, and a footer whose left slot holds Reset or a checkbox.
 *
 * THE RAIL IS A JUMP LIST, NOT A PAGER. Every mockup shows all of the sections
 * stacked in one scroll while the rail marks where you are, so the rail scrolls
 * the form and a scroll-spy lights the step you have reached. Two of them (Add
 * Vendor, Create budget) also drive the primary button through those sections
 * — that is the `nextFlow` prop, not a different layout.
 *
 * CSS is `.ivw*` in styles/inventory.css.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/ui/icons';
import { Btn, IconBtn, Ico, Mark, Glyph, Badge, money, num, count } from './invUI';

/* ── Scroll-spy ──────────────────────────────────────────────────────────── */

const StepCtx = createContext(null);

/**
 * Which section the form is looking at.
 *
 * An IntersectionObserver alone picks the section nearest the TOP of the
 * scroller, which flickers between two of them on a slow scroll and never
 * reaches the last one when it is shorter than the viewport. This measures
 * instead: the active step is the last section whose top has passed a line a
 * third of the way down, and always the last section once the form is scrolled
 * to the bottom.
 */
function useScrollSpy(ids, refs, open) {
  const [active, setActive] = useState(ids[0]);
  const lock = useRef(0);

  // WHICH element scrolls depends on the width.
  //
  // On a wide dialog the form column (`.ivw__main`) scrolls inside a fixed
  // body. Under 860px the rail becomes a strip across the top and the whole
  // BODY scrolls instead, with the column at its natural height. Watching only
  // the column left the spy reading a scrollHeight of zero there.
  const scrollerOf = useCallback(() => {
    const main = refs.main.current;
    const body = refs.body.current;
    if (main && main.scrollHeight > main.clientHeight + 4) return main;
    if (body && body.scrollHeight > body.clientHeight + 4) return body;
    return main || body || null;
  }, [refs]);

  useEffect(() => {
    // `open` is in the deps, and it has to be.
    //
    // The forms stay mounted with `open={false}`, so this effect first runs
    // while there is no dialog in the DOM: the refs are null, it bails, and —
    // without `open` here — it never runs again when the dialog appears. The
    // listener was never attached and the rail never moved.
    if (!open) return undefined;
    const main = refs.main.current;
    const body = refs.body.current;
    if (!main && !body) return undefined;

    let queued = false;
    const read = () => {
      queued = false;
      // A click on the rail owns the highlight until its smooth scroll lands.
      if (Date.now() < lock.current) return;
      const el = scrollerOf();
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const line = top + el.clientHeight / 3;
      let found = ids[0];
      for (const id of ids) {
        const sec = el.querySelector(`[data-sec="${id}"]`);
        if (sec && sec.getBoundingClientRect().top <= line) found = id;
      }
      // The last section is often shorter than the scroller, so its top never
      // crosses the line. Once the form is at the bottom, it is the one — but
      // only if there is a bottom to reach: on an element that does not scroll
      // this used to light the final step from the start and never move.
      const scrolls = el.scrollHeight > el.clientHeight + 8;
      if (scrolls && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
        found = ids[ids.length - 1];
      }
      setActive(found);
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(read);
    };

    setActive(ids[0]);
    read();
    // Both, because which one scrolls changes with the width.
    main?.addEventListener('scroll', onScroll, { passive: true });
    body?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // A section that grows or collapses (the Allocation fields swap with the
    // scope) moves every section under it — a scroll of the content that
    // nobody scrolled.
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onScroll);
      if (main) { ro.observe(main); if (main.firstElementChild) ro.observe(main.firstElementChild); }
      if (body) ro.observe(body);
    }
    return () => {
      main?.removeEventListener('scroll', onScroll);
      body?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      ro?.disconnect();
    };
  }, [ids, refs, open, scrollerOf]);

  const goTo = useCallback((id) => {
    const el = scrollerOf();
    const sec = el?.querySelector(`[data-sec="${id}"]`);
    if (!el || !sec) return;
    lock.current = Date.now() + 700;
    setActive(id);
    // Measured, not `offsetTop`: the section's offset parent is the form, which
    // is not the scroller when the body is the one moving.
    const top = sec.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 12;
    el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [scrollerOf]);

  return { active, goTo };
}

/** Keeps the lit step in view when the rail is a horizontal strip. */
function useStepInView(railRef, active) {
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth + 4) return;
    const on = rail.querySelector('.ivw__step.is-on');
    if (!on) return;
    rail.scrollTo({
      left: Math.max(0, on.offsetLeft - (rail.clientWidth - on.offsetWidth) / 2),
      behavior: 'smooth',
    });
  }, [railRef, active]);
}

/* ── The shell ───────────────────────────────────────────────────────────── */

/**
 * steps: [{ id, title, sub }]  — the rail, and the ids the sections carry
 * aside: the preview column, or nothing
 * asideSide: which side it sits on. 'left' is for a panel that is the SUBJECT
 *   of the form rather than a preview of it — the record being returned, which
 *   you read before you type anything.
 * railArt / railNote: the illustration and line of advice under the steps
 * nextFlow: the primary button walks the sections before it saves
 * left: what sits at the far left of the footer (Reset, a checkbox)
 */
export function Wizard({
  open, onClose, icon = 'box', iconTone = 'indigo', title, sub,
  steps = [], aside, asideSide = 'right', railArt, railNote, size,
  onSubmit, submitLabel = 'Save', submitIcon, submitting, nextFlow = false,
  left, children,
}) {
  const titleId = useId();
  const mainRef = useRef(null);
  const bodyRef = useRef(null);
  const railRef = useRef(null);
  const refs = useMemo(() => ({ main: mainRef, body: bodyRef }), []);
  const ids = useMemo(() => steps.map(s => s.id), [steps]);
  const { active, goTo } = useScrollSpy(ids, refs, open);
  useStepInView(railRef, active);

  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose?.(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', esc);
    };
  }, [open, onClose]);

  if (!open) return null;

  const at = ids.indexOf(active);
  const last = at >= ids.length - 1;
  const stepping = nextFlow && ids.length > 1 && !last;

  const primary = () => {
    if (stepping) { goTo(ids[at + 1]); return; }
    onSubmit?.();
  };

  return createPortal(
    <div className="inv-portal">
      <div className="inv-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
        <div
          className={`ivw${size ? ` ivw--${size}` : ''}`}
          role="dialog" aria-modal="true" aria-labelledby={titleId}
        >
          <header className="ivw__head">
            <Mark name={icon} tone={iconTone} size={48} glyph={23} />
            <div className="ivw__headtext">
              <h2 id={titleId}>{title}</h2>
              {sub ? <p>{sub}</p> : null}
            </div>
            <IconBtn icon="close" kind="bare" label="Close" onClick={onClose} />
          </header>

          <div className="ivw__body" ref={bodyRef}>
            {steps.length ? (
              <nav className="ivw__rail" ref={railRef} aria-label="Sections of this form">
                {steps.map((s, i) => (
                  <button
                    key={s.id} type="button"
                    className={`ivw__step${s.id === active ? ' is-on' : ''}${i < at ? ' is-done' : ''}`}
                    onClick={() => goTo(s.id)}
                    aria-current={s.id === active ? 'step' : undefined}
                  >
                    <span className="ivw__step__n">{i < at ? <Icon name="check" size={13} /> : i + 1}</span>
                    <span className="ivw__step__t">
                      <b>{s.title}</b>
                      {s.sub ? <span>{s.sub}</span> : null}
                    </span>
                  </button>
                ))}
                {(railArt || railNote) ? (
                  <div className="ivw__railfoot">
                    {railArt}
                    {railNote ? <p>{railNote}</p> : null}
                  </div>
                ) : null}
              </nav>
            ) : null}

            <StepCtx.Provider value={{ active, goTo }}>
              {aside && asideSide === 'left'
                ? <aside className="ivw__aside ivw__aside--left">{aside}</aside> : null}
              <div className="ivw__main" ref={mainRef}>
                <form
                  id="ivw-form"
                  onSubmit={(e) => { e.preventDefault(); primary(); }}
                >
                  {children}
                </form>
              </div>
              {aside && asideSide !== 'left'
                ? <aside className="ivw__aside">{aside}</aside> : null}
            </StepCtx.Provider>
          </div>

          <footer className="ivw__foot">
            {left}
            <div className="ivw__foot__end">
              <Btn onClick={onClose} disabled={submitting}>Cancel</Btn>
              <Btn
                kind="primary" type="submit" form="ivw-form" disabled={submitting}
                icon={stepping ? undefined : submitIcon}
                iconRight={stepping ? 'arrowRight' : undefined}
              >
                {submitting ? 'Saving…' : stepping ? 'Next' : submitLabel}
              </Btn>
            </div>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A numbered section. `id` must match the step that points at it. */
export const Sec = ({ id, n, title, sub, right, children }) => (
  <section className="ivw-sec" data-sec={id}>
    <div className="ivw-sec__head">
      <span className="ivw-sec__n">{n}</span>
      <div style={{ minWidth: 0 }}>
        <h3>{title}</h3>
        {sub ? <p>{sub}</p> : null}
      </div>
      {right ? <div className="ivw-sec__end">{right}</div> : null}
    </div>
    {children}
  </section>
);

/** The Reset button the footers carry on the left. */
export const ResetBtn = ({ onClick, disabled }) => (
  <Btn icon="refresh" onClick={onClick} disabled={disabled}>Reset</Btn>
);

/* ── Controls ────────────────────────────────────────────────────────────── */

/**
 * Wraps a control with a leading icon, a leading colour dot, a trailing unit,
 * or a combination. The dot is for a value that HAS a colour elsewhere — a
 * condition, a status — so the select agrees with the badge for the same word.
 */
export const Affix = ({ icon, dot, suffix, top, children }) => (
  <div className={`ivw-affix${icon || dot ? ' ivw-affix--ico' : ''}${suffix ? ' ivw-affix--suf' : ''}`}>
    {dot ? (
      <span className="ivw-affix__ico"><i className="inv-dot" style={{ background: dot }} /></span>
    ) : icon ? (
      <span className={`ivw-affix__ico${top ? ' ivw-affix__ico--top' : ''}`}>
        <Ico name={icon} size={16} aria-hidden />
      </span>
    ) : null}
    {children}
    {suffix ? <span className="ivw-affix__suf">{suffix}</span> : null}
  </div>
);

/** − value + . Never goes below `min`, and never emits a non-number. */
export function Stepper({ value, onChange, min = 0, max, step = 1, ...rest }) {
  const v = num(value);
  const set = (next) => {
    let x = Math.round(next / step) * step;
    if (min != null) x = Math.max(min, x);
    if (max != null) x = Math.min(max, x);
    onChange?.(x);
  };
  return (
    <div className="ivw-step-num">
      <button type="button" onClick={() => set(v - step)} disabled={min != null && v <= min} aria-label="Less">
        <Icon name="minus" size={16} />
      </button>
      <input
        type="number" value={value === '' ? '' : v} min={min} max={max}
        onChange={(e) => onChange?.(e.target.value === '' ? '' : Number(e.target.value))}
        onBlur={() => set(v)}
        {...rest}
      />
      <button type="button" onClick={() => set(v + step)} disabled={max != null && v >= max} aria-label="More">
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}

/** A figure shown where an input would be, when it cannot be typed. */
export const Readout = ({ icon, iconTone = 'indigo', value, unit }) => (
  <div className="ivw-readout">
    {icon ? <Mark name={icon} tone={iconTone} size={28} glyph={15} /> : null}
    <span>{value}{unit ? <small> {unit}</small> : null}</span>
  </div>
);

/** A row of read-only facts under a control. `items` is [label, value] pairs. */
export const Strip = ({ items = [] }) => (
  <dl className="ivw-strip" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
    {items.map(([k, v]) => (
      <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
    ))}
  </dl>
);

/** Icon tiles, one chosen. `items` is [{ value, label, icon, tone }]. */
export const TilePicker = ({ value, onChange, items = [], label }) => (
  <div className="ivw-tiles" style={{ '--n': items.length }} role="radiogroup" aria-label={label}>
    {items.map(it => {
      const on = String(value) === String(it.value);
      return (
        <button
          key={it.value} type="button" role="radio" aria-checked={on}
          className={`ivw-tile${on ? ' is-on' : ''}`}
          onClick={() => onChange?.(it.value)}
        >
          <span style={{ color: on ? 'var(--inv-primary)' : (it.tone || 'var(--inv-muted)'), display: 'inline-flex' }}>
            <Ico name={it.icon} size={20} aria-hidden />
          </span>
          <span>{it.label}</span>
        </button>
      );
    })}
  </div>
);

export const COLOURS = ['#4f46e5', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899', '#a78bfa', '#94a3b8'];

export const Swatches = ({ value, onChange, options = COLOURS }) => (
  <div className="ivw-swatches" role="radiogroup" aria-label="Colour">
    {options.map(c => (
      <button
        key={c} type="button" role="radio" aria-checked={value === c} aria-label={c}
        className={`ivw-swatch${value === c ? ' is-on' : ''}`}
        style={{ background: c, color: c }}
        onClick={() => onChange?.(c)}
      >
        {value === c ? <Icon name="check" size={13} /> : null}
      </button>
    ))}
  </div>
);

/** A textarea that says how much room is left. */
export const Counted = ({ value, onChange, maxLength = 500, ...rest }) => (
  <>
    <textarea
      className="inv-textarea" value={value ?? ''} maxLength={maxLength}
      onChange={(e) => onChange?.(e.target.value)} {...rest}
    />
    <span className="ivw-count">{(value || '').length}/{maxLength}</span>
  </>
);

/** A switch with its explanation, in a bordered row. */
export const SwitchRow = ({ checked, onChange, title, note, disabled, plain }) => (
  <label className={`ivw-switch${plain ? ' ivw-switch--plain' : ''}${disabled ? ' is-off' : ''}`}>
    <span className="inv-switch" style={{ marginTop: 1 }}>
      <input type="checkbox" checked={!!checked} disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)} />
      <span className="inv-switch__track" />
    </span>
    <span className="ivw-switch__t">
      <b>{title}</b>
      {note ? <span>{note}</span> : null}
    </span>
  </label>
);

/* ── The preview column ──────────────────────────────────────────────────── */

export const PCard = ({ title, right, children }) => (
  <section className="ivw-card">
    {(title || right) ? (
      <header className="ivw-card__head">
        {title ? <h4>{title}</h4> : null}
        {right}
      </header>
    ) : null}
    <div className="ivw-card__body">{children}</div>
  </section>
);

/** The centred name-and-chips block at the top of a preview. */
export const PHero = ({ icon, iconTone = 'indigo', image, name, sub, chips, round }) => (
  <div className="ivw-card__hero">
    {image
      ? <div className="ivw-card__img"><img src={image} alt="" /></div>
      : <Mark name={icon} tone={iconTone} size={58} glyph={28} round={round} />}
    <h5>{name}</h5>
    {sub ? <p>{sub}</p> : null}
    {chips ? <div className="ivw-card__chips">{chips}</div> : null}
  </div>
);

/** [label, value] rows. An empty value is kept — the preview is showing gaps. */
export const PRows = ({ rows = [] }) => (
  <dl className="ivw-rows">
    {rows.map(([k, v]) => (
      <div key={k}><dt>{k}</dt><dd>{v ?? '—'}</dd></div>
    ))}
  </dl>
);

/** Icon-led lines, for a preview that reads as a contact card. */
export const PLines = ({ lines = [] }) => (
  <div className="ivw-lines">
    {lines.map(([icon, text], i) => (
      <div key={i}><Ico name={icon} size={15} aria-hidden /><span style={{ minWidth: 0 }}>{text}</span></div>
    ))}
  </div>
);

export const HL = ({ tone, icon, children }) => (
  <div className={`ivw-hl${tone ? ` ivw-hl--${tone}` : ''}`}>
    {icon ? <Ico name={icon} size={17} aria-hidden /> : null}
    <span style={{ minWidth: 0 }}>{children}</span>
  </div>
);

/* ── Line items ──────────────────────────────────────────────────────────── */

/** cols: [{ key, label, width, cell }] */
export const ItemTable = ({ cols = [], rows = [], rowKey = (_, i) => i }) => (
  <div className="ivw-items">
    <table>
      <thead>
        <tr>{cols.map(c => <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={rowKey(r, i)}>
            {cols.map(c => (
              <td key={c.key} data-label={c.label} className={c.className}>{c.cell(r, i)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const AddItemRow = ({ onClick, children = 'Add another item' }) => (
  <button type="button" className="ivw-additem" onClick={onClick}>
    <Icon name="plus" size={16} /> {children}
  </button>
);

export const Totals = ({ rows = [], grand }) => (
  <div className="ivw-totals">
    {rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}
    {grand ? <div className="ivw-totals__grand"><span>{grand[0]}</span><b>{grand[1]}</b></div> : null}
  </div>
);

export const Grand = ({ label, value }) => (
  <div className="ivw-grand"><span>{label}</span><b>{value}</b></div>
);

/** The stock badge beside an item in a line-item row. */
export const StockChip = ({ qty, unit, low }) => (
  <Badge tone={num(qty) <= 0 ? 'red' : low ? 'amber' : 'green'} square>
    {count(qty)} {unit}
  </Badge>
);

/* ── The little scenes under the step rail ───────────────────────────────── */

export const RailArt = ({ name }) => {
  const P = { line: '#c7cbf5', fill: '#eef1ff', fill2: '#e0e7ff', accent: '#a5b4fc' };
  const art = {
    box: (
      <svg viewBox="0 0 120 96" fill="none" aria-hidden>
        <path d="M60 18 96 32v32L60 78 24 64V32z" fill={P.fill} stroke={P.line} strokeWidth="2" strokeLinejoin="round" />
        <path d="m24 32 36 14 36-14M60 46v32" stroke={P.line} strokeWidth="2" strokeLinejoin="round" />
        <path d="M46 26 82 40" stroke={P.accent} strokeWidth="2" strokeLinecap="round" />
        <circle cx="30" cy="16" r="3" fill={P.accent} /><circle cx="94" cy="20" r="2.4" fill={P.accent} opacity=".7" />
        <circle cx="102" cy="72" r="3" fill={P.accent} opacity=".5" />
      </svg>
    ),
    doc: (
      <svg viewBox="0 0 120 96" fill="none" aria-hidden>
        <rect x="34" y="12" width="52" height="72" rx="6" fill={P.fill} stroke={P.line} strokeWidth="2" />
        <path d="M46 30h28M46 44h28M46 58h18" stroke={P.line} strokeWidth="3" strokeLinecap="round" />
        <circle cx="86" cy="68" r="14" fill={P.fill2} stroke={P.accent} strokeWidth="2" />
        <path d="m80 68 4.5 4.5L93 64" stroke={P.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    store: (
      <svg viewBox="0 0 120 96" fill="none" aria-hidden>
        <path d="M22 40h76v44H22z" fill={P.fill} stroke={P.line} strokeWidth="2" />
        <path d="M18 40 30 20h60l12 20z" fill={P.fill2} stroke={P.line} strokeWidth="2" strokeLinejoin="round" />
        <path d="M40 56h40v28H40z" fill="#fff" stroke={P.line} strokeWidth="2" />
        <path d="M40 66h40M40 76h40M60 56v28" stroke={P.line} strokeWidth="1.6" />
      </svg>
    ),
    money: (
      <svg viewBox="0 0 120 96" fill="none" aria-hidden>
        <ellipse cx="60" cy="34" rx="26" ry="10" fill={P.fill2} stroke={P.line} strokeWidth="2" />
        <path d="M34 34v16c0 5.5 11.6 10 26 10s26-4.5 26-10V34" fill={P.fill} stroke={P.line} strokeWidth="2" />
        <path d="M34 50v16c0 5.5 11.6 10 26 10s26-4.5 26-10V50" fill={P.fill} stroke={P.line} strokeWidth="2" />
        <path d="M52 40h16M52 46h16M64 40c3 0 5 2 5 5s-2 5-5 5h-9l10 10" stroke={P.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    people: (
      <svg viewBox="0 0 120 96" fill="none" aria-hidden>
        <circle cx="46" cy="32" r="13" fill={P.fill2} stroke={P.line} strokeWidth="2" />
        <path d="M24 78c0-12 10-22 22-22s22 10 22 22z" fill={P.fill} stroke={P.line} strokeWidth="2" />
        <circle cx="82" cy="38" r="10" fill={P.fill} stroke={P.line} strokeWidth="2" />
        <path d="M68 78c0-9 6.3-16 14-16s14 7 14 16z" fill={P.fill2} stroke={P.line} strokeWidth="2" />
      </svg>
    ),
  };
  return art[name] || art.box;
};
