/**
 * The Results module's own UI kit (Oct 2026 redesign, to the user's mockup).
 *
 * One kit per module, as Hostel, Inventory and Transport have: a change for
 * this set of mockups cannot quietly restyle another module's screens. What is
 * genuinely app-wide is borrowed, not copied — the one Tabs component, the one
 * detail Drawer, the shared icon registry.
 *
 * Two things worth knowing before changing anything here:
 *
 *   · Glyphs. The tiles' icons in the mockup are solid shapes (a green disc
 *     with a tick, a red triangle), not the app's outline set, so the kit
 *     draws those few itself. `Ico` falls back to the shared registry by name;
 *     the shared `Icon` renders NOTHING for a name it does not know, which is
 *     how a button ends up an empty box.
 *   · `.rs-page` is a size container (styles/results.css), and a container is
 *     the containing block of its fixed descendants — so anything that floats
 *     (the row menu) is portalled to <body>.
 */
import React, { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon, { ICON_NAMES } from '../../components/ui/icons';
import Tabs from '../../components/ui/Tabs';
import '../../styles/results.css';

/* ── Numbers and dates ────────────────────────────────────────────────────── */

export const num = (v) => (Number.isFinite(+v) ? +v : 0);
export const count = (n) => num(n).toLocaleString('en-IN');
export const plural = (n, one, many) => `${count(n)} ${num(n) === 1 ? one : (many || `${one}s`)}`;

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const valid = (d) => { const x = d ? new Date(d) : null; return x && !Number.isNaN(x.getTime()) ? x : null; };

/**
 * A calendar day — an exam's dates, a paper's date, the result date. These are
 * stored at UTC midnight of the day they mean, so they are read back by their
 * UTC parts: read locally, a west-of-Greenwich browser shows the day before.
 */
export const fmtDay = (d) => {
  const x = valid(d);
  return x ? `${String(x.getUTCDate()).padStart(2, '0')} ${MON[x.getUTCMonth()]} ${x.getUTCFullYear()}` : '';
};
/** An instant — when something was done — on the reader's own calendar. */
export const fmtStamp = (d) => {
  const x = valid(d);
  return x ? `${String(x.getDate()).padStart(2, '0')} ${MON[x.getMonth()]} ${x.getFullYear()}` : '';
};
export const fmtTime = (d) => {
  const x = valid(d);
  return x ? x.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
};
/** "12 – 18 Oct 2026", the month and year named once when both ends share them. */
export const fmtRange = (a, b) => {
  const x = valid(a); const y = valid(b);
  if (!x || !y) return fmtDay(a || b);
  const sameYear = x.getUTCFullYear() === y.getUTCFullYear();
  const sameMonth = sameYear && x.getUTCMonth() === y.getUTCMonth();
  if (sameMonth && x.getUTCDate() === y.getUTCDate()) return fmtDay(a);
  const d = (v) => String(v.getUTCDate()).padStart(2, '0');
  if (sameMonth) return `${d(x)} – ${fmtDay(b)}`;
  if (sameYear) return `${d(x)} ${MON[x.getUTCMonth()]} – ${fmtDay(b)}`;
  return `${fmtDay(a)} – ${fmtDay(b)}`;
};
/** A stored day as the value of an <input type="date">. */
export const inputDay = (d) => { const x = valid(d); return x ? x.toISOString().slice(0, 10) : ''; };

/* ── Glyphs ───────────────────────────────────────────────────────────────── */

const W = '#fff';
const GLYPHS = {
  // Total Exams — a sheet with its corner folded and lines of writing.
  sheet: <>
    <path d="M7.2 3h6.6L19 8.2v10.6A2.2 2.2 0 0 1 16.8 21H7.2A2.2 2.2 0 0 1 5 18.8V5.2A2.2 2.2 0 0 1 7.2 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" fill="none" />
    <path d="M13.6 3.2v3.6a1.6 1.6 0 0 0 1.6 1.6h3.6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" fill="none" />
    <path d="M8.8 12.6h6.4M8.8 16.4h6.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </>,
  // Published — a disc with a tick.
  checkDisc: <>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="m7.5 12.3 3.1 3.1 5.9-6.2" stroke={W} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  // In progress — a clock, drawn as a ring.
  clockRing: <>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.3" fill="none" />
    <path d="M12 7.2v5.1l3.1 1.9" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  // Pending — a warning triangle.
  alertTri: <>
    <path d="M10.2 3.6a2.1 2.1 0 0 1 3.6 0l8 13.8a2.1 2.1 0 0 1-1.8 3.2H4a2.1 2.1 0 0 1-1.8-3.2z" fill="currentColor" />
    <path d="M12 8.8v4.6" stroke={W} strokeWidth="2.3" strokeLinecap="round" />
    <circle cx="12" cy="16.9" r="1.3" fill={W} />
  </>,
  // Result Analytics — three solid bars.
  bars: <>
    <rect x="1.6" y="11.8" width="5.6" height="10.6" rx="2" fill="currentColor" />
    <rect x="9.2" y="1.6" width="5.6" height="20.8" rx="2" fill="currentColor" />
    <rect x="16.8" y="7.4" width="5.6" height="15" rx="2" fill="currentColor" />
  </>,
  // Reset — one arrow, most of the way round, turning back (anticlockwise).
  reset: <g transform="translate(24 0) scale(-1 1)">
    <path d="M19.6 12.4a7.6 7.6 0 1 1-2.4-5.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" fill="none" />
    <path d="M19.9 3.8v4.5h-4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </g>,
  unlock: <>
    <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <path d="M8 10.5V7.4a4 4 0 0 1 7.6-1.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <path d="M12 14.6v2.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </>,
  restore: <>
    <rect x="3" y="4" width="18" height="4.5" rx="1.2" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <path d="M4.8 8.5V18a2 2 0 0 0 2 2h10.4a2 2 0 0 0 2-2V8.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <path d="M12 17v-5.4M9.6 13.8l2.4-2.4 2.4 2.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  undo: <path d="M8.2 4.6 4 8.8l4.2 4.2M4.4 8.8h9.2a6 6 0 1 1-5.3 8.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  ban: <>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <path d="m5.8 5.8 12.4 12.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </>,
  // The Create Exam form's own (rsForm.jsx).
  // The form's mark — the same sheet, drawn heavier, as the mockup has it.
  sheetBold: <>
    <path d="M7.3 2.9h6.5l5.1 5.1v10.9a2.2 2.2 0 0 1-2.2 2.2H7.3a2.2 2.2 0 0 1-2.2-2.2V5.1a2.2 2.2 0 0 1 2.2-2.2z" stroke="currentColor" strokeWidth="2.15" strokeLinejoin="round" fill="none" />
    <path d="M13.5 3.1v3.5a1.6 1.6 0 0 0 1.6 1.6h3.6" stroke="currentColor" strokeWidth="2.15" strokeLinejoin="round" fill="none" />
    <path d="M8.9 12.7h6.2M8.9 16.3h6.2" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" />
  </>,
  // Print — a printer with its sheet.
  printer: <>
    <path d="M7 8.5V4.2A1.2 1.2 0 0 1 8.2 3h7.6A1.2 1.2 0 0 1 17 4.2v4.3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    <rect x="3.2" y="8.5" width="17.6" height="8.6" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <path d="M7 14h10v6.8H7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="#fff" />
    <circle cx="17.2" cy="11.4" r="1" fill="currentColor" />
  </>,
  // Status: Active — the power mark, heavy.
  powerBold: <>
    <path d="M12 3.2v7.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M17.3 6.3a7.9 7.9 0 1 1-10.6 0" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none" />
  </>,
  // Marks & Grading — bars rising under a trend line.
  chartUp: <>
    <path d="M3.4 20.4h17.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    <path d="M6.2 17.2v-3.1M10.1 17.2v-4.9M14 17.2v-3.6M17.9 17.2v-6.4" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
    <path d="m4.8 11.2 4.4-4.3 3.3 2.7 5.9-5.4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M14.9 4.2h3.6v3.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  // Total Marks — a pen on a square.
  penSquare: <>
    <path d="M11.2 4.6H6.6a2 2 0 0 0-2 2v10.8a2 2 0 0 0 2 2h10.8a2 2 0 0 0 2-2v-4.6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" fill="none" />
    <path d="M17.7 3.7a1.9 1.9 0 0 1 2.7 2.7l-7.6 7.6-3.4.7.7-3.4z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" fill="none" />
  </>,
  // The date fields' calendar — a heavy band across the top, as drawn.
  calendarBold: <>
    <rect x="3.6" y="5" width="16.8" height="15.4" rx="2.6" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M6.2 5h11.6a2.6 2.6 0 0 1 2.6 2.6v2.6H3.6V7.6A2.6 2.6 0 0 1 6.2 5z" fill="currentColor" />
    <path d="M8.2 3v3.6M15.8 3v3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </>,
  // The summary's note — a solid disc with an i.
  infoDisc: <>
    <circle cx="12" cy="12" r="11.5" fill="currentColor" />
    <path d="M12 10.7v6.5" stroke={W} strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="12" cy="7.2" r="1.45" fill={W} />
  </>,
  // The summary card's mark — a page with lines of writing, drawn solid.
  docSolid: <>
    <path d="M7.4 2.6h6.4l5.2 5.2v11.4a2.2 2.2 0 0 1-2.2 2.2H7.4a2.2 2.2 0 0 1-2.2-2.2V4.8a2.2 2.2 0 0 1 2.2-2.2z" fill="currentColor" />
    <path d="M13.8 2.6v3.9a1.3 1.3 0 0 0 1.3 1.3H19z" fill="currentColor" opacity=".55" />
    <path d="M8.4 11.4h3.4M8.4 14.2h7.2M8.4 17h5.2" stroke="var(--rsf-tile, #5b6cf0)" strokeWidth="1.3" strokeLinecap="round" />
  </>,
};

/** A glyph from this kit, else the shared outline icon of that name. */
export function Ico({ name, size = 16, className }) {
  const g = GLYPHS[name];
  if (g) return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>{g}</svg>;
  if (ICON_NAMES.includes(name)) return <Icon name={name} size={size} className={className} />;
  return null;
}

/* ── Buttons ──────────────────────────────────────────────────────────────── */

export const Btn = forwardRef(({ kind = 'outline', size, icon, iconSize, busy, className = '', children, as: As = 'button', ...rest }, ref) => (
  <As
    ref={ref}
    className={`rs-btn rs-btn--${kind}${size ? ` rs-btn--${size}` : ''}${busy ? ' is-busy' : ''} ${className}`}
    {...(As === 'button' ? { type: rest.type || 'button', disabled: rest.disabled || busy } : null)}
    {...rest}
  >
    {icon ? <Ico name={icon} size={iconSize || (size === 'sm' ? 14 : size === 'lg' ? 18 : 16)} /> : null}
    {children}
  </As>
));
Btn.displayName = 'Btn';

export const IconBtn = forwardRef(({ icon, label, size = 16, className = '', ...rest }, ref) => (
  <button ref={ref} type="button" className={`rs-ibtn ${className}`} aria-label={label} title={label} {...rest}>
    <Ico name={icon} size={size} />
  </button>
));
IconBtn.displayName = 'IconBtn';

/* ── Page head and tiles ──────────────────────────────────────────────────── */

export const PageHead = ({ title, subtitle, children }) => (
  <header className="rs-head">
    <div className="rs-head__text">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children ? <div className="rs-head__acts">{children}</div> : null}
  </header>
);

export const Tiles = ({ children }) => <div className="rs-tiles">{children}</div>;

/**
 * One figure. Given an `onClick` a tile is also the quickest way to the rows
 * behind its number, so it is a button, and `on` marks the one whose view is
 * in force; without one it is just the figure.
 */
export const Tile = ({ tone, icon, iconSize = 36, value, label, caption, quietLabel, onClick, on }) => {
  const body = (
    <>
      <span className="rs-tile__mark" aria-hidden><Ico name={icon} size={iconSize} /></span>
      <span className="rs-tile__text">
        <strong>{typeof value === 'number' ? count(value) : (value ?? 0)}</strong>
        <span className={`rs-tile__label${quietLabel ? ' rs-tile__label--quiet' : ''}`}>{label}</span>
        <span className="rs-tile__cap">{caption}</span>
      </span>
    </>
  );
  if (!onClick) return <div className={`rs-tile rs-tile--static rs-t-${tone}`}>{body}</div>;
  return (
    <button type="button" className={`rs-tile rs-t-${tone}`} onClick={onClick} aria-pressed={on ? 'true' : undefined}
      title={`Show ${String(label).toLowerCase()}`}>
      {body}
    </button>
  );
};

/* ── The card's controls ──────────────────────────────────────────────────── */

/** The app's one Tabs component, in this screen's dress. A count shows once there is one. */
export const LineTabs = ({ items, value, onChange, label = 'Exams by stage' }) => (
  <Tabs
    variant="line" className="rs-tabs" label={label} value={value} onChange={onChange} wrap={false}
    items={items.map((t) => ({ key: t.key, label: t.label, count: t.count ? t.count : undefined, tone: t.tone }))}
  />
);

export function SearchBox({ value, onChange, placeholder, label = 'Search' }) {
  return (
    <label className={`rs-search${value ? ' has-value' : ''}`}>
      <Ico name="search" size={17} />
      <input type="search" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} />
      {value ? (
        <button type="button" className="rs-search__clear" onClick={() => onChange('')} aria-label="Clear search">
          <Ico name="close" size={14} />
        </button>
      ) : null}
    </label>
  );
}

/** A labelled native select. `all` is the option that means "no filter". */
export function SelectField({ label, value, onChange, all, options = [], width, disabled }) {
  return (
    <label className="rs-field" style={width ? { width } : undefined}>
      <span className="rs-field__label">{label}</span>
      <Select value={value} onChange={onChange} all={all} options={options} label={label} disabled={disabled} />
    </label>
  );
}

export function Select({ value, onChange, all, options = [], label, disabled, marked = true }) {
  return (
    <span className={`rs-select${marked && value !== '' && value !== undefined && value !== null && all ? ' is-set' : ''}`}>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled}>
        {all ? <option value="">{all}</option> : null}
        {options.map((o) => (typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>))}
      </select>
      <Ico name="chevronDown" size={15} />
    </span>
  );
}

/* ── Cells ────────────────────────────────────────────────────────────────── */

export const Badge = ({ tone = 'slate', dot = true, children, title }) => (
  <span className={`rs-badge rs-t-${tone}${dot ? '' : ' rs-badge--plain'}`} title={title}>
    {dot ? <i /> : null}{children}
  </span>
);

/**
 * Which school a child is at — on a parent's child switch, when their children
 * are not all at the school they are signed in to. The name is its own box so a
 * long one ends in an ellipsis; text cut by the flex row itself just stops.
 */
export const KidSchool = ({ name }) => (
  <span className="rs-kidschool" title={name}><Ico name="school" size={12} /><span>{name}</span></span>
);

export const Meter = ({ value, total, color, label }) => {
  const pct = num(total) ? Math.round((num(value) / num(total)) * 100) : 0;
  return (
    <span className="rs-meter">
      <span className="rs-meter__bar" role="presentation"><i style={{ '--pct': `${Math.max(0, Math.min(100, pct))}%`, ...(color ? { '--bar': color } : null) }} /></span>
      <b>{label ?? `${count(value)} / ${count(total)}`}</b>
    </span>
  );
};

export const Check = forwardRef(({ checked, indeterminate, onChange, label, disabled }, ref) => (
  <input
    type="checkbox" className="rs-check" checked={!!checked} disabled={disabled} aria-label={label}
    ref={(el) => { if (el) el.indeterminate = !!indeterminate && !checked; if (typeof ref === 'function') ref(el); else if (ref) ref.current = el; }}
    onChange={onChange}
  />
));
Check.displayName = 'Check';

/* ── Floating menu ────────────────────────────────────────────────────────── */

/**
 * A panel under (or over) its anchor, right edges aligned. Measured on the
 * frame after it renders — hidden until then — so a menu near the foot of the
 * window opens upward by its real height, never by a guess.
 */
function Popover({ anchor, open, onClose, children, label }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const m = ref.current;
      if (!a || !m) return;
      const mh = m.offsetHeight; const mw = m.offsetWidth;
      const below = a.bottom + 6 + mh <= window.innerHeight - 8 || a.top - 6 - mh < 8;
      setPos({
        top: Math.max(8, below ? a.bottom + 6 : a.top - 6 - mh),
        left: Math.max(8, Math.min(a.right - mw, window.innerWidth - mw - 8)),
      });
    };
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose(); };
    // Captured, and stopped: Escape closes the menu, not also the drawer the
    // menu was opened from (which listens for the same key on the document).
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); anchor.current?.focus(); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('touchstart', away);
      document.removeEventListener('keydown', key, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div ref={ref} className="rs-pop" role="menu" aria-label={label}
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}>
      {children}
    </div>,
    document.body,
  );
}

/** Items: { label, icon, onClick, danger, disabled } — or '-' for a rule. Falsy entries are skipped. */
function MenuList({ items, onPick }) {
  const box = useRef(null);
  useEffect(() => { box.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true }); }, []);
  const onKey = (e) => {
    const list = [...(box.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
    const at = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(at + 1) % list.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus(); }
    if (e.key === 'Tab') onPick();
  };
  return (
    <div ref={box} onKeyDown={onKey}>
      {items.map((it, i) => (it === '-'
        ? <div key={`r${i}`} className="rs-menu__rule" role="separator" />
        : (
          <button key={it.label} type="button" role="menuitem" disabled={it.disabled}
            className={`rs-menu__item${it.danger ? ' is-danger' : ''}`} onClick={() => { onPick(); it.onClick?.(); }}>
            {it.icon ? <Ico name={it.icon} size={16} /> : null}
            <span>{it.label}</span>
          </button>
        )))}
    </div>
  );
}

/** Rules that would open or close a menu, or sit next to another, are dropped. */
const tidy = (items) => {
  const list = items.filter(Boolean);
  return list.filter((it, i) => it !== '-' || (i > 0 && i < list.length - 1 && list[i - 1] !== '-'));
};

/** The row's ⋮ and its menu. Renders nothing when there is nothing in it. */
export function Kebab({ items = [], label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const list = tidy(items);
  const close = useCallback(() => setOpen(false), []);
  if (!list.length) return null;
  return (
    <>
      <IconBtn ref={btn} icon="dotsV" label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      <Popover anchor={btn} open={open} onClose={close} label={label}>
        <MenuList items={list} onPick={close} />
      </Popover>
    </>
  );
}

/** A button that opens a menu — the page head's "More", for the module's other pages. */
export function MenuBtn({ items = [], label, children, ...btn }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const list = tidy(items);
  const close = useCallback(() => setOpen(false), []);
  if (!list.length) return null;
  return (
    <>
      <Btn ref={ref} {...btn} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {children}<Ico name="chevronDown" size={15} />
      </Btn>
      <Popover anchor={ref} open={open} onClose={close} label={label || (typeof children === 'string' ? children : 'More')}>
        <MenuList items={list} onPick={close} />
      </Popover>
    </>
  );
}

/* ── Paging ───────────────────────────────────────────────────────────────── */

export function Pager({ page = 1, pages = 1, total = 0, limit = 10, noun = 'exam', many, onPage, sizes, onLimit }) {
  const from = total ? (page - 1) * limit + 1 : 0;
  const to = Math.min(total, page * limit);
  const list = [];
  if (pages <= 5) for (let n = 1; n <= pages; n += 1) list.push(n);
  else {
    list.push(1);
    if (page > 3) list.push('a');
    for (let n = Math.max(2, page - 1); n <= Math.min(pages - 1, page + 1); n += 1) list.push(n);
    if (page < pages - 2) list.push('b');
    list.push(pages);
  }
  return (
    <div className="rs-pager">
      <span>Showing {count(from)} to {count(to)} of {plural(total, noun, many)}</span>
      <span className="rs-pager__side">
        {sizes && onLimit ? (
          <label className="rs-pager__size">
            Rows per page
            <Select value={String(limit)} onChange={(v) => onLimit(Number(v))} label="Rows per page" marked={false}
              options={sizes.map((s) => ({ value: String(s), label: String(s) }))} />
          </label>
        ) : null}
        {pages > 1 ? (
          <span className="rs-pager__pages" role="navigation" aria-label="Pages">
            <button type="button" className="rs-pgbtn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><Ico name="chevronLeft" size={15} /></button>
            {list.map((n) => (typeof n === 'number'
              ? <button key={n} type="button" className={`rs-pgbtn${n === page ? ' is-on' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => n !== page && onPage(n)}>{n}</button>
              : <span key={n} className="rs-pgbtn is-gap">…</span>))}
            <button type="button" className="rs-pgbtn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><Ico name="chevronRight" size={15} /></button>
          </span>
        ) : null}
      </span>
    </div>
  );
}

/* ── Nothing to list ──────────────────────────────────────────────────────── */

/** The mockup's drawing: a sheet of results with a chart badge, and a few sparks. */
export function EmptyArt() {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="rs-empty__art" viewBox="0 0 156 108" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6f7fd" />
          <stop offset="1" stopColor="#e2e6f5" />
        </linearGradient>
      </defs>
      <circle cx="75" cy="54" r="45" fill="#f6f7fd" />
      <ellipse cx="75" cy="101" rx="40" ry="5" fill="#e9ecf7" opacity=".7" />
      <path d="M41 1.5h54.5L117 23v72a8 8 0 0 1-8 8H41a8 8 0 0 1-8-8V9.5a8 8 0 0 1 8-8z" fill={`url(#${id}p)`} stroke="#e6e9f6" />
      <path d="M95.5 1.5V15a8 8 0 0 0 8 8H117z" fill="#dfe3f3" />
      <rect x="47" y="19" width="32" height="5" rx="2.5" fill="#7a85a9" />
      <rect x="47" y="38" width="54" height="5" rx="2.5" fill="#b9c1d9" />
      <rect x="47" y="53" width="29" height="5" rx="2.5" fill="#c3cade" />
      <circle cx="111" cy="81" r="23.5" fill="#fff" />
      <circle cx="111" cy="81" r="22" fill="#4f46e5" />
      <rect x="101.5" y="81" width="5" height="10" rx="2" fill="#fff" />
      <rect x="108.5" y="71" width="5" height="20" rx="2" fill="#fff" />
      <rect x="115.5" y="77" width="5" height="14" rx="2" fill="#fff" />
      <path d="m5 71 3.2 3.9L5 78.8 1.8 74.9z" fill="#cdd2f4" />
      <path d="m151 37 3 3.7-3 3.7-3-3.7z" fill="#d7dbf6" />
      <path d="m134 8 2.6 3.2-2.6 3.2-2.6-3.2z" fill="none" stroke="#cfd4f3" strokeWidth="1.2" />
      <circle cx="9" cy="41" r="1.6" fill="#dfe2f7" />
      <circle cx="16" cy="25" r="1.2" fill="#e6e8f9" />
      <circle cx="152" cy="55" r="1.5" fill="#dfe2f7" />
    </svg>
  );
}

export const Empty = ({ title, children, action }) => (
  <div className="rs-empty">
    <EmptyArt />
    <h3>{title}</h3>
    {children ? <p>{children}</p> : null}
    {action}
  </div>
);

/* ── Data ─────────────────────────────────────────────────────────────────── */

/** Download rows as a CSV file: a header array, then arrays of cells. */
export function downloadCsv(filename, header, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  // The byte-order mark is what makes Excel read the file as UTF-8.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * Fetch for the query in force. The last answer stays on screen while the next
 * is fetched, and a slow reply to an old query is dropped rather than drawn
 * over a newer one. `body` is the whole reply: this list answers with its rows
 * beside their paging and tab counts, not under one `data` key.
 */
export function useBoard(fetcher, query) {
  const key = JSON.stringify(query);
  const [state, setState] = useState({ body: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    seq.current += 1;
    const mine = seq.current;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve().then(() => fetcher(JSON.parse(key)))
      .then((res) => { if (mine === seq.current) setState({ body: res, loading: false, error: null }); })
      .catch((e) => { if (mine === seq.current) setState((s) => ({ ...s, loading: false, error: e })); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
