/**
 * The ID Card module's own UI kit (Oct 2026), in the app's design language —
 * the sizes and tones of the redesigned admin screens — but its own classes
 * (`ic-`, styles/idcards.css), so a change here never restyles another
 * module. Borrowed, not copied: the app's Tabs, Drawer, Modal and icons.
 *
 * The page root `.ic-page` is NOT a size container: menus and dialogs portal
 * to <body> anyway, and a container would trap anything fixed inside it.
 */
import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon, { ICON_NAMES } from '../../components/ui/icons';
import Tabs from '../../components/ui/Tabs';
import { STATUS, KIND, count, plural, fileUrl, initials } from './icMeta';
import '../../styles/idcards.css';

/* ── Glyphs the shared registry does not have ─────────────────────────────── */

const GLYPHS = {
  qr: <>
    <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <path d="M14 14h2.6v2.6H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18.6v1.9h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <rect x="5.9" y="5.9" width="1.7" height="1.7" fill="currentColor" /><rect x="16.4" y="5.9" width="1.7" height="1.7" fill="currentColor" /><rect x="5.9" y="16.4" width="1.7" height="1.7" fill="currentColor" />
  </>,
  scan: <>
    <path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <path d="M7 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </>,
  flip: <>
    <path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <path d="M18.2 3.4v3.4h-3.4M5.8 20.6v-3.4h3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  printer: <>
    <path d="M7 8.5V4.2A1.2 1.2 0 0 1 8.2 3h7.6A1.2 1.2 0 0 1 17 4.2v4.3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
    <rect x="3.2" y="8.5" width="17.6" height="8.6" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <path d="M7 14h10v6.8H7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="var(--ic-paper, #fff)" />
    <circle cx="17.2" cy="11.4" r="1" fill="currentColor" />
  </>,
  regen: <>
    <path d="M20 11a8 8 0 0 0-14.3-4.8L4 8M4 13a8 8 0 0 0 14.3 4.8L20 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    <path d="M4 4v4h4M20 20v-4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  ban: <>
    <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <path d="m6 6 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </>,
  lanyard: <>
    <path d="M8 2.5 12 10l4-7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <rect x="6" y="10" width="12" height="11.5" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <circle cx="12" cy="14.2" r="1.8" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M9.4 18.6a2.8 2.8 0 0 1 5.2 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  </>,
  cardStack: <>
    <rect x="6.5" y="3.5" width="12" height="15.5" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" opacity=".55" />
    <rect x="4" y="6" width="12" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" fill="var(--ic-paper, #fff)" />
    <circle cx="10" cy="11.2" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M7.4 16.4a2.8 2.8 0 0 1 5.2 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
  </>,
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  palette: <>
    <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-1.3-1-1.6-1-2.7 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <circle cx="7.6" cy="11" r="1.3" fill="currentColor" /><circle cx="10" cy="7.2" r="1.3" fill="currentColor" /><circle cx="14.6" cy="7.4" r="1.3" fill="currentColor" />
  </>,
  checkDisc: <>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="m7.5 12.3 3.1 3.1 5.9-6.2" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>,
  crossDisc: <>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="m8.4 8.4 7.2 7.2M15.6 8.4l-7.2 7.2" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" fill="none" />
  </>,
  alertTri: <>
    <path d="M10.2 3.6a2.1 2.1 0 0 1 3.6 0l8 13.8a2.1 2.1 0 0 1-1.8 3.2H4a2.1 2.1 0 0 1-1.8-3.2z" fill="currentColor" />
    <path d="M12 8.8v4.6" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" />
    <circle cx="12" cy="16.9" r="1.3" fill="#fff" />
  </>,
  hourglass: <>
    <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
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
    className={`ic-btn ic-btn--${kind}${size ? ` ic-btn--${size}` : ''}${busy ? ' is-busy' : ''} ${className}`}
    {...(As === 'button' ? { type: rest.type || 'button', disabled: rest.disabled || busy } : null)}
    {...rest}
  >
    {icon ? <Ico name={icon} size={iconSize || (size === 'sm' ? 15 : size === 'lg' ? 18 : 16)} /> : null}
    {children}
  </As>
));
Btn.displayName = 'Btn';

export const IconBtn = forwardRef(({ icon, label, size = 16, kind, className = '', ...rest }, ref) => (
  <button ref={ref} type="button" className={`ic-ibtn${kind ? ` ic-ibtn--${kind}` : ''} ${className}`} aria-label={label} title={label} {...rest}>
    <Ico name={icon} size={size} />
  </button>
));
IconBtn.displayName = 'IconBtn';

/* ── Page frame ───────────────────────────────────────────────────────────── */

export const Page = ({ children, className = '' }) => <div className={`ic-page ${className}`}>{children}</div>;

export const PageHead = ({ title, subtitle, children, eyebrow }) => (
  <header className="ic-head">
    <div className="ic-head__text">
      {eyebrow ? <div className="ic-head__eyebrow">{eyebrow}</div> : null}
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children ? <div className="ic-head__acts">{children}</div> : null}
  </header>
);

export const Panel = ({ title, sub, right, children, className = '', pad = true, icon, tone }) => (
  <section className={`ic-panel ${className}`}>
    {(title || right) ? (
      <div className="ic-panel__head">
        <div className="ic-panel__title">
          {icon ? <span className={`ic-panel__mark ic-t-${tone || 'indigo'}`}><Ico name={icon} size={18} /></span> : null}
          <div>
            {title ? <h2>{title}</h2> : null}
            {sub ? <p>{sub}</p> : null}
          </div>
        </div>
        {right ? <div className="ic-panel__right">{right}</div> : null}
      </div>
    ) : null}
    <div className={pad ? 'ic-panel__body' : 'ic-panel__flush'}>{children}</div>
  </section>
);

/* ── Figures ──────────────────────────────────────────────────────────────── */

export const Tiles = ({ children, cols }) => <div className={`ic-tiles${cols ? ` ic-tiles--${cols}` : ''}`}>{children}</div>;

/**
 * One figure: a tinted mark, the number, its label and a caption. With
 * `of`, a thin bar shows how far the number is towards it.
 */
export function Tile({ tone = 'indigo', icon, value, label, caption, of, onClick, on }) {
  const pct = of ? Math.max(0, Math.min(100, Math.round((Number(value) / Math.max(1, Number(of))) * 100))) : null;
  const body = (
    <>
      <span className="ic-tile__mark" aria-hidden><Ico name={icon} size={26} /></span>
      <span className="ic-tile__text">
        <span className="ic-tile__fig">
          <strong>{typeof value === 'number' ? count(value) : (value ?? 0)}</strong>
          {of !== undefined && of !== null ? <em>/ {count(of)}</em> : null}
        </span>
        <span className="ic-tile__label">{label}</span>
        {pct !== null ? <span className="ic-tile__bar" role="presentation"><i style={{ width: `${pct}%` }} /></span> : null}
        {caption ? <span className="ic-tile__cap">{caption}</span> : null}
      </span>
    </>
  );
  if (!onClick) return <div className={`ic-tile ic-tile--static ic-t-${tone}`}>{body}</div>;
  return (
    <button type="button" className={`ic-tile ic-t-${tone}`} onClick={onClick} aria-pressed={on ? 'true' : undefined}>
      {body}
    </button>
  );
}

/* ── Cells ────────────────────────────────────────────────────────────────── */

export const Badge = ({ tone = 'slate', dot = true, children, title, size }) => (
  <span className={`ic-badge ic-t-${tone}${dot ? '' : ' ic-badge--plain'}${size ? ` ic-badge--${size}` : ''}`} title={title}>
    {dot ? <i /> : null}{children}
  </span>
);

export const StatusBadge = ({ status, size, children }) => {
  const s = STATUS[status] || { label: status, tone: 'slate', hint: '' };
  return <Badge tone={s.tone} size={size} title={s.hint}>{children || s.label}</Badge>;
};

export const KindChip = ({ kind }) => {
  const k = KIND[kind];
  if (!k) return null;
  return <span className={`ic-kind ic-t-${k.tone}`}><Ico name={k.icon} size={13} />{k.label}</span>;
};

/** A person's photo, else their initials on a tint. */
export function Avatar({ name, photo, size = 38, tone = 'indigo', square }) {
  const [broken, setBroken] = useState(false);
  const url = !broken && photo ? fileUrl(photo) : '';
  return (
    <span className={`ic-avatar ic-t-${tone}${square ? ' ic-avatar--sq' : ''}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {url ? <img src={url} alt="" onError={() => setBroken(true)} /> : initials(name)}
    </span>
  );
}

export const Person = ({ name, photo, sub, size = 38, tone, children, strong = true }) => (
  <span className="ic-person">
    <Avatar name={name} photo={photo} size={size} tone={tone} />
    <span className="ic-person__text">
      {strong ? <strong>{name}</strong> : <span>{name}</span>}
      {sub ? <em>{sub}</em> : null}
      {children}
    </span>
  </span>
);

export const Meter = ({ value, total, tone = 'indigo' }) => {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <span className={`ic-meter ic-t-${tone}`}>
      <span className="ic-meter__bar"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>
      <b>{count(value)} / {count(total)}</b>
    </span>
  );
};

/* ── Controls ─────────────────────────────────────────────────────────────── */

export const LineTabs = ({ items, value, onChange, label = 'Show' }) => (
  <Tabs
    variant="line" className="ic-tabs" label={label} value={value} onChange={onChange} wrap={false}
    items={items.map((t) => ({ key: t.key, label: t.label, count: t.count ? t.count : undefined }))}
  />
);

export function SearchBox({ value, onChange, placeholder, label = 'Search', autoFocus, onKeyDown }) {
  return (
    <label className={`ic-search${value ? ' has-value' : ''}`}>
      <Ico name="search" size={17} />
      <input type="search" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} autoFocus={autoFocus} onKeyDown={onKeyDown} />
      {value ? (
        <button type="button" className="ic-search__clear" onClick={() => onChange('')} aria-label="Clear search">
          <Ico name="close" size={14} />
        </button>
      ) : null}
    </label>
  );
}

export function Select({ value, onChange, all, options = [], label, disabled, width }) {
  return (
    <span className={`ic-select${value ? ' is-set' : ''}`} style={width ? { width } : undefined}>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled}>
        {all !== undefined ? <option value="">{all}</option> : null}
        {options.map((o) => (typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>))}
      </select>
      <Ico name="chevronDown" size={15} />
    </span>
  );
}

export const Field = ({ label, hint, children, error, className = '', htmlFor }) => (
  <div className={`ic-field ${className}`}>
    {label ? <label className="ic-field__label" htmlFor={htmlFor}>{label}</label> : null}
    {children}
    {error ? <div className="ic-field__error">{error}</div> : hint ? <div className="ic-field__hint">{hint}</div> : null}
  </div>
);

export const Check = forwardRef(({ checked, indeterminate, onChange, label, disabled }, ref) => (
  <input
    type="checkbox" className="ic-check" checked={!!checked} disabled={disabled} aria-label={label}
    ref={(el) => { if (el) el.indeterminate = !!indeterminate && !checked; if (typeof ref === 'function') ref(el); else if (ref) ref.current = el; }}
    onChange={onChange}
  />
));
Check.displayName = 'Check';

/** An on/off switch with its words beside it. */
export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`ic-switch${disabled ? ' is-disabled' : ''}`}>
      <span className="ic-switch__text">
        <span className="ic-switch__label">{label}</span>
        {hint ? <span className="ic-switch__hint">{hint}</span> : null}
      </span>
      <input type="checkbox" role="switch" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="ic-switch__track" aria-hidden><span /></span>
    </label>
  );
}

/** Two to four choices side by side. */
export function Segmented({ value, onChange, options, label, size }) {
  return (
    <div className={`ic-seg${size ? ` ic-seg--${size}` : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.icon ? <Ico name={o.icon} size={15} /> : null}{o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Floating menu ────────────────────────────────────────────────────────── */

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
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchor]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose(); };
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
    <div ref={ref} className="ic-pop" role="menu" aria-label={label}
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}>
      {children}
    </div>,
    document.body,
  );
}

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
        ? <div key={`r${i}`} className="ic-menu__rule" role="separator" />
        : (
          <button key={it.label} type="button" role="menuitem" disabled={it.disabled} title={it.title}
            className={`ic-menu__item${it.danger ? ' is-danger' : ''}`} onClick={() => { onPick(); it.onClick?.(); }}>
            {it.icon ? <Ico name={it.icon} size={16} /> : null}
            <span>{it.label}</span>
            {it.hint ? <em>{it.hint}</em> : null}
          </button>
        )))}
    </div>
  );
}

const tidy = (items) => {
  const list = items.filter(Boolean);
  return list.filter((it, i) => it !== '-' || (i > 0 && i < list.length - 1 && list[i - 1] !== '-'));
};

export function Kebab({ items = [], label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const list = tidy(items);
  const close = useCallback(() => setOpen(false), []);
  if (!list.length) return null;
  return (
    <>
      <IconBtn ref={btn} icon="dotsV" label={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} />
      <Popover anchor={btn} open={open} onClose={close} label={label}>
        <MenuList items={list} onPick={close} />
      </Popover>
    </>
  );
}

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

export function Pager({ page = 1, pages = 1, total = 0, limit = 20, noun = 'card', many, onPage, sizes, onLimit }) {
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
    <div className="ic-pager">
      <span>Showing {count(from)} to {count(to)} of {plural(total, noun, many)}</span>
      <span className="ic-pager__side">
        {sizes && onLimit ? (
          <label className="ic-pager__size">
            Rows per page
            <Select value={String(limit)} onChange={(v) => onLimit(Number(v))} label="Rows per page"
              options={sizes.map((s) => ({ value: String(s), label: String(s) }))} />
          </label>
        ) : null}
        {pages > 1 ? (
          <span className="ic-pager__pages" role="navigation" aria-label="Pages">
            <button type="button" className="ic-pgbtn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><Ico name="chevronLeft" size={15} /></button>
            {list.map((n) => (typeof n === 'number'
              ? <button key={n} type="button" className={`ic-pgbtn${n === page ? ' is-on' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => n !== page && onPage(n)}>{n}</button>
              : <span key={n} className="ic-pgbtn is-gap">…</span>))}
            <button type="button" className="ic-pgbtn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><Ico name="chevronRight" size={15} /></button>
          </span>
        ) : null}
      </span>
    </div>
  );
}

/* ── Nothing to show ──────────────────────────────────────────────────────── */

/** A stack of cards on a lanyard — the module's empty-state drawing. */
export function EmptyArt({ tone = '#4f46e5' }) {
  return (
    <svg className="ic-empty__art" viewBox="0 0 160 112" aria-hidden focusable="false">
      <circle cx="80" cy="58" r="46" fill="#f4f5fd" />
      <ellipse cx="80" cy="106" rx="42" ry="4.5" fill="#e9ecf7" />
      <path d="M68 2 80 30 92 2" fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round" opacity=".85" />
      <rect x="58" y="34" width="46" height="66" rx="6" fill="#e6e9f6" transform="rotate(8 81 67)" />
      <rect x="54" y="32" width="46" height="66" rx="6" fill="#fff" stroke="#e1e5f3" />
      <rect x="54" y="32" width="46" height="16" rx="6" fill={tone} />
      <rect x="54" y="42" width="46" height="6" fill={tone} />
      <rect x="73" y="35" width="8" height="2.6" rx="1.3" fill="#fff" opacity=".9" />
      <rect x="68" y="53" width="18" height="20" rx="3" fill="#eef0fb" stroke="#dde1f3" />
      <circle cx="77" cy="60.5" r="3.6" fill="#c5cbe8" />
      <path d="M71.5 70a5.6 5.6 0 0 1 11 0" fill="#c5cbe8" />
      <rect x="63" y="79" width="28" height="3.6" rx="1.8" fill="#7a85a9" />
      <rect x="67" y="85" width="20" height="3" rx="1.5" fill="#c3cade" />
      <rect x="54" y="93" width="46" height="5" fill={tone} opacity=".25" />
      <circle cx="122" cy="42" r="15" fill="#fff" stroke="#e1e5f3" />
      <path d="m115.5 42.5 4.4 4.4 8.4-8.6" fill="none" stroke="#22a55a" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m20 70 3 3.6-3 3.6-3-3.6z" fill="#cdd2f4" />
      <path d="m142 76 2.6 3.2-2.6 3.2-2.6-3.2z" fill="#d7dbf6" />
      <circle cx="30" cy="40" r="1.8" fill="#dfe2f7" />
      <circle cx="136" cy="18" r="1.4" fill="#dfe2f7" />
    </svg>
  );
}

export const Empty = ({ title, children, action, compact }) => (
  <div className={`ic-empty${compact ? ' ic-empty--compact' : ''}`}>
    <EmptyArt />
    <h3>{title}</h3>
    {children ? <p>{children}</p> : null}
    {action}
  </div>
);

export const Spin = ({ label = 'Loading…' }) => <div className="ic-spin" role="status"><span />{label}</div>;

export const Note = ({ tone = 'indigo', icon = 'info', children, action }) => (
  <div className={`ic-note ic-t-${tone}`}>
    <Ico name={icon} size={18} />
    <div className="ic-note__text">{children}</div>
    {action ? <div className="ic-note__act">{action}</div> : null}
  </div>
);

/* ── Data ─────────────────────────────────────────────────────────────────── */

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * Fetch for the query in force; the last answer stays on screen while the next
 * loads, and a slow reply to an old query never overwrites a newer one.
 */
export function useLoad(fetcher, query) {
  const key = JSON.stringify(query ?? null);
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    seq.current += 1;
    const mine = seq.current;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve().then(() => fetcher(JSON.parse(key)))
      .then((res) => { if (mine === seq.current) setState({ data: res?.data ?? res, loading: false, error: null }); })
      .catch((e) => { if (mine === seq.current) setState((s) => ({ ...s, loading: false, error: e })); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
