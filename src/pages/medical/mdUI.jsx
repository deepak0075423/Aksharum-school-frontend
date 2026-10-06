/**
 * The Medical Room's UI kit (Oct 2026) — the app's design language as the
 * redesigned admin screens draw it (the same sizes and tones as the ID Card
 * kit), under this module's own `md-` classes in styles/medical.css, so a
 * change here never restyles another module. Borrowed, not copied: the app's
 * Tabs, Modal, Drawer and icons.
 *
 * The page root is not a size container — menus and dialogs portal to <body>,
 * and a container would trap anything fixed inside it. Tables and tile rows
 * are their own containers, which is how they fold for a phone.
 */
import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import Icon, { ICON_NAMES } from '../../components/ui/icons';
import Tabs from '../../components/ui/Tabs';
import { Modal } from '../../components/ui';
import { count, plural, fileUrl, initials, labelOf, toneOf, STATUS_MAPS } from './mdMeta';
import '../../styles/medical.css';

/* ── Glyphs the shared registry does not have ─────────────────────────────── */

const S = { stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
const GLYPHS = {
  stethoscope: <><path {...S} d="M6 3.5H4.5v5a4.5 4.5 0 0 0 9 0v-5H12" /><path {...S} d="M9 13v2.5a5 5 0 0 0 10 0V13" /><circle {...S} cx="19" cy="10.8" r="2.2" /></>,
  pill: <><rect {...S} x="3.2" y="8.6" width="17.6" height="6.8" rx="3.4" transform="rotate(-38 12 12)" /><path {...S} d="m9.3 8.2 5.4 7.6" /></>,
  syringe: <><path {...S} d="m18 2.8 3.2 3.2M19.6 4.4 15.8 8.2M15 4.6l4.4 4.4M13.6 6 6 13.6 4.2 19.8l6.2-1.8L18 10.4" /><path {...S} d="m8.6 11 1.8 1.8M11 8.6l1.8 1.8" /></>,
  bandage: <><rect {...S} x="2.6" y="8.2" width="18.8" height="7.6" rx="3.8" transform="rotate(-45 12 12)" /><path {...S} d="M10.4 10.4h.01M13.6 13.6h.01M13.6 10.4h.01M10.4 13.6h.01" strokeWidth="2.4" /></>,
  thermometer: <><path {...S} d="M14 14.5V5a2 2 0 1 0-4 0v9.5a4 4 0 1 0 4 0z" /><path {...S} d="M12 9v7" /></>,
  bed: <><path {...S} d="M3 18V6M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3" /><circle {...S} cx="7" cy="10" r="1.8" /></>,
  ambulance: <><path {...S} d="M2.5 16V8.5A1.5 1.5 0 0 1 4 7h9.5v9M13.5 10H18l3.5 3.5V16h-2" /><circle {...S} cx="7" cy="17" r="1.9" /><circle {...S} cx="17" cy="17" r="1.9" /><path {...S} d="M8.5 9v4M6.5 11h4M9 16h6" /></>,
  heartPulse: <><path {...S} d="M19.5 12.6 12 20l-7.5-7.4A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 7.5 6.3z" /><path {...S} d="M3.6 12h3.6l1.6-2.6 2.4 5 1.8-3.4h7.4" /></>,
  droplet: <path {...S} d="M12 3.2s6 6.4 6 10.6a6 6 0 0 1-12 0C6 9.6 12 3.2 12 3.2z" />,
  firstAid: <><rect {...S} x="3" y="6.5" width="18" height="13.5" rx="2.4" /><path {...S} d="M8.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v1.5M12 10.2v6M9 13.2h6" /></>,
  siren: <><path {...S} d="M7 18v-6a5 5 0 0 1 10 0v6M5 18h14v2.5H5zM12 2.5v2M4.2 5.6l1.4 1.4M19.8 5.6l-1.4 1.4" /></>,
  wrench: <path {...S} d="M14.6 6.4a4 4 0 0 0 5 5L21 13l-1 1-4.3-1.1L8 20.6a2 2 0 0 1-2.8-2.8l7.7-7.7L11.8 5.8l1-1 1.6 1.4" />,
  scale: <><path {...S} d="M12 3.5v17M6 20.5h12M5 7.5h14M8 7.5 5 14a3 3 0 0 0 6 0zM16 7.5 13 14a3 3 0 0 0 6 0z" /></>,
  hospital: <><path {...S} d="M4 20.5V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v14M2.5 20.5h19M10 20.5v-4h4v4M12 8v4M10 10h4" /></>,
  inbox: <><path {...S} d="M3.5 13.5 6 5.5h12l2.5 8V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z" /><path {...S} d="M3.5 13.5H8l1.4 2.5h5.2l1.4-2.5h4.5" /></>,
  checkDisc: <><circle cx="12" cy="12" r="10" fill="currentColor" /><path d="m7.5 12.3 3.1 3.1 5.9-6.2" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none" /></>,
  alertTri: <><path d="M10.2 3.6a2.1 2.1 0 0 1 3.6 0l8 13.8a2.1 2.1 0 0 1-1.8 3.2H4a2.1 2.1 0 0 1-1.8-3.2z" fill="currentColor" /><path d="M12 8.8v4.6" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" /><circle cx="12" cy="16.9" r="1.3" fill="#fff" /></>,
  hourglass: <path {...S} d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" />,
  printer: <><path {...S} d="M7 8.5V4.2A1.2 1.2 0 0 1 8.2 3h7.6A1.2 1.2 0 0 1 17 4.2v4.3" /><rect {...S} x="3.2" y="8.5" width="17.6" height="8.6" rx="2" /><path {...S} d="M7 14h10v6.8H7z" /></>,
  ruler: <><rect {...S} x="2.5" y="8" width="19" height="8" rx="1.5" transform="rotate(-45 12 12)" /><path {...S} d="m9.2 9.2 1.4 1.4M11.4 7l1.4 1.4M7 11.4l1.4 1.4M13.6 4.8l1.4 1.4" /></>,
  calendarCheck: <><rect {...S} x="3.5" y="5" width="17" height="15.5" rx="2.2" /><path {...S} d="M3.5 9.5h17M8 3v3.5M16 3v3.5M9 14.5l2 2 4-4" /></>,
};
export const MED_GLYPHS = Object.keys(GLYPHS);

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
    className={`md-btn md-btn--${kind}${size ? ` md-btn--${size}` : ''}${busy ? ' is-busy' : ''} ${className}`}
    {...(As === 'button' ? { type: rest.type || 'button', disabled: rest.disabled || busy } : null)}
    {...rest}
  >
    {icon ? <Ico name={icon} size={iconSize || (size === 'sm' ? 15 : size === 'lg' ? 18 : 16)} /> : null}
    {children}
  </As>
));
Btn.displayName = 'Btn';

export const IconBtn = forwardRef(({ icon, label, size = 16, kind, className = '', ...rest }, ref) => (
  <button ref={ref} type="button" className={`md-ibtn${kind ? ` md-ibtn--${kind}` : ''} ${className}`} aria-label={label} title={label} {...rest}>
    <Ico name={icon} size={size} />
  </button>
));
IconBtn.displayName = 'IconBtn';

/* ── Page frame ───────────────────────────────────────────────────────────── */

export const Page = ({ children, className = '' }) => <div className={`md-page ${className}`}>{children}</div>;

export const PageHead = ({ title, subtitle, children, eyebrow, icon, tone = 'rose' }) => (
  <header className="md-head">
    <div className="md-head__main">
      {icon ? <span className={`md-head__mark md-t-${tone}`}><Ico name={icon} size={24} /></span> : null}
      <div className="md-head__text">
        {eyebrow ? <div className="md-head__eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
    {children ? <div className="md-head__acts">{children}</div> : null}
  </header>
);

export const Panel = ({ title, sub, right, children, className = '', pad = true, icon, tone, id }) => (
  <section className={`md-panel ${className}`} id={id}>
    {(title || right) ? (
      <div className="md-panel__head">
        <div className="md-panel__title">
          {icon ? <span className={`md-panel__mark md-t-${tone || 'indigo'}`}><Ico name={icon} size={18} /></span> : null}
          <div>
            {title ? <h2>{title}</h2> : null}
            {sub ? <p>{sub}</p> : null}
          </div>
        </div>
        {right ? <div className="md-panel__right">{right}</div> : null}
      </div>
    ) : null}
    <div className={pad ? 'md-panel__body' : 'md-panel__flush'}>{children}</div>
  </section>
);

/* ── Figures ──────────────────────────────────────────────────────────────── */

// The outer box is the size container; the grid inside it is what the
// container queries re-flow (a query never matches the container itself).
export const Tiles = ({ children, cols }) => (
  <div className="md-tiles"><div className={`md-tiles__grid${cols ? ` md-tiles--${cols}` : ''}`}>{children}</div></div>
);

/** One figure: a tinted mark, the number, its label and a caption. */
export function Tile({ tone = 'indigo', icon, value, label, caption, onClick, on, alert }) {
  const body = (
    <>
      <span className="md-tile__mark" aria-hidden><Ico name={icon} size={24} /></span>
      <span className="md-tile__text">
        <span className="md-tile__fig"><strong>{typeof value === 'number' ? count(value) : (value ?? 0)}</strong></span>
        <span className="md-tile__label">{label}</span>
        {caption ? <span className="md-tile__cap">{caption}</span> : null}
      </span>
      {alert ? <span className="md-tile__pulse" aria-hidden /> : null}
    </>
  );
  if (!onClick) return <div className={`md-tile md-tile--static md-t-${tone}`}>{body}</div>;
  return <button type="button" className={`md-tile md-t-${tone}`} onClick={onClick} aria-pressed={on ? 'true' : undefined}>{body}</button>;
}

/* ── Cells ────────────────────────────────────────────────────────────────── */

export const Badge = ({ tone = 'slate', dot = true, children, title, size, icon }) => (
  <span className={`md-badge md-t-${tone}${dot && !icon ? '' : ' md-badge--plain'}${size ? ` md-badge--${size}` : ''}`} title={title}>
    {icon ? <Ico name={icon} size={12} /> : dot ? <i /> : null}{children}
  </span>
);

/** A status from one of the module's maps: <Status of="visit" value="sent_home" />. */
export const Status = ({ of, value, size, children, map }) => {
  const m = map || STATUS_MAPS[of] || {};
  if (!value) return null;
  return <Badge tone={toneOf(m, value)} size={size} title={m[value]?.hint}>{children || labelOf(m, value)}</Badge>;
};

/** A person's photo, else their initials on a tint. */
export function Avatar({ name, photo, size = 38, tone = 'indigo', square }) {
  const [broken, setBroken] = useState(false);
  const url = !broken && photo ? fileUrl(photo) : '';
  return (
    <span className={`md-avatar md-t-${tone}${square ? ' md-avatar--sq' : ''}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {url ? <img src={url} alt="" onError={() => setBroken(true)} /> : initials(name)}
    </span>
  );
}

export const Person = ({ name, photo, sub, size = 38, tone, children, strong = true, onClick, critical }) => {
  const inner = (
    <>
      <span className="md-person__av">
        <Avatar name={name} photo={photo} size={size} tone={tone} />
        {critical ? <span className="md-person__flag" title="Has a critical medical alert"><Ico name="alertTri" size={12} /></span> : null}
      </span>
      <span className="md-person__text">
        {strong ? <strong>{name}</strong> : <span>{name}</span>}
        {sub ? <em>{sub}</em> : null}
        {children}
      </span>
    </>
  );
  if (onClick) return <button type="button" className="md-person md-person--link" onClick={onClick}>{inner}</button>;
  return <span className="md-person">{inner}</span>;
};

/** "VIII – A · APS001" under a name. */
export const StudentCell = ({ row, size = 36, onClick, critical }) => (
  <Person name={row.studentName || row.name} photo={row.studentPhoto || row.photo} size={size} onClick={onClick} critical={critical}
    sub={[row.classLabel || [row.className, row.sectionName].filter(Boolean).join(' – '), row.admissionNumber].filter(Boolean).join(' · ')} />
);

/** Label/value pairs; empty values are dropped unless `keep`. */
export const KV = ({ items = [], cols = 2, keep }) => {
  const list = items.filter((it) => it && (keep || (it[1] !== null && it[1] !== undefined && it[1] !== '' && it[1] !== false)));
  if (!list.length) return null;
  return (
    <dl className={`md-kv md-kv--${cols}`}>
      {list.map(([k, v, wide]) => (
        <div key={k} className={wide ? 'is-wide' : ''}><dt>{k}</dt><dd>{v === null || v === undefined || v === '' ? <span className="md-none">—</span> : v}</dd></div>
      ))}
    </dl>
  );
};

/* ── Medical alerts ───────────────────────────────────────────────────────── */

const ALERT_ICON = { allergy: 'alertTri', condition: 'heartPulse', emergency_medication: 'syringe', medication: 'pill' };

/** The alert chips of a student — critical first. */
export const AlertChips = ({ alerts = [], max = 4, size }) => {
  if (!alerts.length) return null;
  const shown = alerts.slice(0, max);
  return (
    <span className={`md-achips${size ? ` md-achips--${size}` : ''}`}>
      {shown.map((a) => (
        <span key={`${a.kind}:${a.label}`} className={`md-achip is-${a.level}`} title={[a.detail, a.instructions].filter(Boolean).join(' — ')}>
          <Ico name={ALERT_ICON[a.kind] || 'alert'} size={12} /><span>{a.label}</span>
        </span>
      ))}
      {alerts.length > max ? <span className="md-achip is-more">+{alerts.length - max}</span> : null}
    </span>
  );
};

/**
 * The alert area at the top of a student's profile: what anyone caring for
 * them must see first, in red when it is critical.
 */
export function AlertArea({ alerts = [], instructions, compact }) {
  const critical = alerts.filter((a) => a.level === 'critical');
  const other = alerts.filter((a) => a.level !== 'critical');
  if (!alerts.length && !instructions) {
    return <div className="md-alertarea is-clear"><Ico name="checkDisc" size={20} /><span>No medical alerts on record.</span></div>;
  }
  return (
    <div className={`md-alertarea${critical.length ? ' is-critical' : ' is-warning'}${compact ? ' is-compact' : ''}`} role="region" aria-label="Medical alerts">
      <div className="md-alertarea__head">
        <Ico name="alertTri" size={20} />
        <strong>{critical.length ? `${plural(critical.length, 'critical medical alert')}` : 'Medical alerts'}</strong>
      </div>
      <ul className="md-alertarea__list">
        {[...critical, ...other].map((a) => (
          <li key={`${a.kind}:${a.label}`} className={`is-${a.level}`}>
            <span className="md-alertarea__ico"><Ico name={ALERT_ICON[a.kind] || 'alert'} size={16} /></span>
            <span className="md-alertarea__text">
              <b>{a.label}</b>
              {a.detail ? <em>{a.detail}</em> : null}
              {a.instructions ? <span className="md-alertarea__do"><Ico name="info" size={13} />{a.instructions}</span> : null}
              {a.medication && a.kind !== 'emergency_medication' ? <span className="md-alertarea__med"><Ico name="pill" size={13} />{a.medication}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {instructions ? <p className="md-alertarea__note"><Ico name="clipboard" size={14} /> {instructions}</p> : null}
    </div>
  );
}

/* ── Controls ─────────────────────────────────────────────────────────────── */

export const LineTabs = ({ items, value, onChange, label = 'Show', className = '' }) => (
  <Tabs
    variant="line" className={`md-tabs ${className}`} label={label} value={value} onChange={onChange} wrap={false}
    items={items.map((t) => ({ key: t.key, label: t.label, count: t.count ? t.count : undefined }))}
  />
);

export function SearchBox({ value, onChange, placeholder, label = 'Search', autoFocus, onKeyDown, onFocus }) {
  return (
    <label className={`md-search${value ? ' has-value' : ''}`}>
      <Ico name="search" size={17} />
      <input type="search" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} autoFocus={autoFocus} onKeyDown={onKeyDown} onFocus={onFocus} />
      {value ? (
        <button type="button" className="md-search__clear" onClick={() => onChange('')} aria-label="Clear search"><Ico name="close" size={14} /></button>
      ) : null}
    </label>
  );
}

export function Select({ value, onChange, all, options = [], label, disabled, width, className = '' }) {
  return (
    <span className={`md-select${value ? ' is-set' : ''} ${className}`} style={width ? { width } : undefined}>
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

export const Field = ({ label, hint, children, error, className = '', htmlFor, required, optional }) => (
  <div className={`md-field ${className}${error ? ' has-error' : ''}`}>
    {label ? <label className="md-field__label" htmlFor={htmlFor}>{label}{required ? <span className="md-req" aria-hidden> *</span> : null}{optional ? <em> (optional)</em> : null}</label> : null}
    {children}
    {error ? <div className="md-field__error" role="alert">{error}</div> : hint ? <div className="md-field__hint">{hint}</div> : null}
  </div>
);

export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`md-switch${disabled ? ' is-disabled' : ''}`}>
      <span className="md-switch__text">
        <span className="md-switch__label">{label}</span>
        {hint ? <span className="md-switch__hint">{hint}</span> : null}
      </span>
      <input type="checkbox" role="switch" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="md-switch__track" aria-hidden><span /></span>
    </label>
  );
}

export function Segmented({ value, onChange, options, label, size }) {
  return (
    <div className={`md-seg${size ? ` md-seg--${size}` : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`${value === o.value ? 'is-on' : ''}${o.tone ? ` md-seg--${o.tone}` : ''}`} onClick={() => onChange(o.value)}>
          {o.icon ? <Ico name={o.icon} size={15} /> : null}{o.label}
        </button>
      ))}
    </div>
  );
}

/** Quick-pick chips (visit reasons, locations). */
export function Chips({ options = [], value, onPick, multi }) {
  const on = (v) => (multi ? (value || []).includes(v) : value === v);
  return (
    <div className="md-chips">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        return <button key={v} type="button" className={on(v) ? 'is-on' : ''} aria-pressed={on(v)} onClick={() => onPick(v)}>{l}</button>;
      })}
    </div>
  );
}

/* ── Floating menu ────────────────────────────────────────────────────────── */

export function Popover({ anchor, open, onClose, children, label, className = '', match }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const m = ref.current;
      if (!a || !m) return;
      const mh = m.offsetHeight; const mw = match ? a.width : m.offsetWidth;
      const below = a.bottom + 6 + mh <= window.innerHeight - 8 || a.top - 6 - mh < 8;
      setPos({
        top: Math.max(8, below ? a.bottom + 6 : a.top - 6 - mh),
        left: match ? Math.max(8, Math.min(a.left, window.innerWidth - mw - 8)) : Math.max(8, Math.min(a.right - mw, window.innerWidth - mw - 8)),
        width: match ? a.width : undefined,
      });
    };
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchor, match]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); anchor.current?.focus?.(); } };
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
    <div ref={ref} className={`md-pop ${className}`} role="menu" aria-label={label}
      style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: 0, left: 0, visibility: 'hidden' }}>
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
        ? <div key={`r${i}`} className="md-menu__rule" role="separator" />
        : (
          <button key={it.label} type="button" role="menuitem" disabled={it.disabled} title={it.title}
            className={`md-menu__item${it.danger ? ' is-danger' : ''}`} onClick={() => { onPick(); it.onClick?.(); }}>
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
      <Popover anchor={btn} open={open} onClose={close} label={label}><MenuList items={list} onPick={close} /></Popover>
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

/* ── Tables ───────────────────────────────────────────────────────────────── */

/**
 * The module's one table. columns: [{ key, label, render(row), width, align,
 * className, primary }]. Below ~680px of its own width it folds every row into
 * a card — each cell keeps its column name — so a phone never scrolls sideways.
 */
export function Table({ columns, rows = [], rowKey = '_id', onRow, empty, loading, minWidth = 760, rowClass, focusId }) {
  return (
    <div className={`md-tablewrap${loading ? ' is-loading' : ''}`}>
      <table className="md-table" style={{ '--md-minw': `${minWidth}px` }}>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} style={c.width ? { width: c.width } : undefined} className={c.align ? `is-${c.align}` : ''}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[rowKey]} onClick={onRow ? () => onRow(r) : undefined}
              className={`${onRow ? 'is-link' : ''} ${rowClass ? rowClass(r) : ''} ${focusId && String(r[rowKey]) === String(focusId) ? 'is-focus' : ''}`}
              tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onRow(r); } : undefined}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.label} className={`${c.align ? `is-${c.align}` : ''} ${c.primary ? 'is-primary' : ''} ${c.className || ''}`}
                  onClick={c.stop ? (e) => e.stopPropagation() : undefined}>
                  {c.render ? c.render(r) : (r[c.key] ?? <span className="md-none">—</span>)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && !loading ? (empty || <Empty compact title="Nothing to show">Nothing matches what you are looking at.</Empty>) : null}
      {!rows.length && loading ? <Spin /> : null}
    </div>
  );
}

/* ── Paging ───────────────────────────────────────────────────────────────── */

export function Pager({ page = 1, pages = 1, total = 0, limit = 20, noun = 'record', many, onPage }) {
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
  if (!total) return null;
  return (
    <div className="md-pager">
      <span>Showing {count(from)}–{count(to)} of {plural(total, noun, many)}</span>
      {pages > 1 ? (
        <span className="md-pager__pages" role="navigation" aria-label="Pages">
          <button type="button" className="md-pgbtn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><Ico name="chevronLeft" size={15} /></button>
          {list.map((n) => (typeof n === 'number'
            ? <button key={n} type="button" className={`md-pgbtn${n === page ? ' is-on' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => n !== page && onPage(n)}>{n}</button>
            : <span key={n} className="md-pgbtn is-gap">…</span>))}
          <button type="button" className="md-pgbtn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><Ico name="chevronRight" size={15} /></button>
        </span>
      ) : null}
    </div>
  );
}

/* ── Nothing to show, loading, notes ──────────────────────────────────────── */

/** A medical cross on a clipboard — the module's empty-state drawing. */
export function EmptyArt({ tone = '#e11d48' }) {
  return (
    <svg className="md-empty__art" viewBox="0 0 160 112" aria-hidden focusable="false">
      <circle cx="80" cy="58" r="46" fill="#fdf2f5" />
      <ellipse cx="80" cy="106" rx="42" ry="4.5" fill="#f5e6ea" />
      <rect x="54" y="20" width="52" height="76" rx="7" fill="#fff" stroke="#f1d5dc" strokeWidth="2" />
      <rect x="68" y="14" width="24" height="12" rx="4" fill="#f9dbe2" stroke="#f1c6d0" strokeWidth="2" />
      <rect x="72" y="38" width="16" height="36" rx="3" fill={tone} opacity=".9" />
      <rect x="62" y="48" width="36" height="16" rx="3" fill={tone} opacity=".9" />
      <rect x="64" y="82" width="32" height="3.6" rx="1.8" fill="#e8c3cc" />
      <circle cx="124" cy="40" r="14" fill="#fff" stroke="#f1d5dc" strokeWidth="2" />
      <path d="m117.5 40.5 4.4 4.4 8.4-8.6" fill="none" stroke="#22a55a" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m24 70 3 3.6-3 3.6-3-3.6z" fill="#f6c8d3" />
      <path d="m140 78 2.6 3.2-2.6 3.2-2.6-3.2z" fill="#f9d6de" />
      <circle cx="32" cy="40" r="1.8" fill="#f6dbe1" />
    </svg>
  );
}

export const Empty = ({ title, children, action, compact }) => (
  <div className={`md-empty${compact ? ' md-empty--compact' : ''}`}>
    <EmptyArt />
    <h3>{title}</h3>
    {children ? <p>{children}</p> : null}
    {action}
  </div>
);

export const Spin = ({ label = 'Loading…' }) => <div className="md-spin" role="status"><span />{label}</div>;

export const Note = ({ tone = 'indigo', icon = 'info', children, action }) => (
  <div className={`md-note md-t-${tone}`}>
    <Ico name={icon} size={18} />
    <div className="md-note__text">{children}</div>
    {action ? <div className="md-note__act">{action}</div> : null}
  </div>
);

/** An error from a load, with a retry. */
export const LoadError = ({ error, onRetry, title = 'This could not be loaded' }) => (
  <Empty title={title} action={onRetry ? <Btn kind="primary" icon="refresh" onClick={onRetry}>Try again</Btn> : null}>
    {error?.data?.code === 'MEDICAL_STEP_UP' ? 'Your school asks the medical staff to confirm who they are with an emailed code. Press Try again to get one.'
      : error?.status === 403 ? 'You do not have access to this part of the Medical Room.' : (error?.message || 'Please check your connection and try again.')}
  </Empty>
);

/* ── Dialogs ──────────────────────────────────────────────────────────────── */

/** The shared Modal with a tinted mark beside its body — lifted over drawers. */
export const Dialog = ({ open, onClose, title, icon, tone = 'indigo', children, footer, width = 520 }) => (
  <Modal open={open} onClose={onClose} title={title} maxWidth={width} footer={footer}>
    <div className={`md-dialog md-t-${tone}`}>
      {icon ? <span className="md-dialog__mark"><Ico name={icon} size={22} /></span> : null}
      <div className="md-dialog__body">{children}</div>
    </div>
  </Modal>
);

/**
 * Ask before doing something. With `reason`, a reason must be given (and is
 * passed to onConfirm) — archiving a medical record always asks why.
 */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, reason, reasonLabel = 'Reason', reasonPlaceholder, icon, tone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setText(''); setErr(''); setBusy(false); } }, [open]);
  const go = async () => {
    if (reason && !text.trim()) { setErr(`${reasonLabel} is required`); return; }
    setBusy(true); setErr('');
    try { await onConfirm(text.trim()); } catch (e) { setErr(e?.message || 'That could not be done'); setBusy(false); return; }
    setBusy(false);
  };
  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title={title} icon={icon || (danger ? 'alertTri' : 'info')} tone={tone || (danger ? 'red' : 'indigo')} width={480}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind={danger ? 'danger-solid' : 'primary'} busy={busy} onClick={go}>{confirmLabel}</Btn></>}>
      {message ? <div className="md-dialog__lead">{message}</div> : null}
      {reason ? (
        <Field label={reasonLabel} required error={err}>
          <textarea className="md-textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={reasonPlaceholder} maxLength={300} autoFocus />
        </Field>
      ) : err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

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

/**
 * A list screen's query, kept in the URL — tab, page, search and filters — so
 * a reload, a link from a notification (?tab=follow_up&focus=…) or the back
 * button lands on exactly the same view.
 */
export function useQueryState(defaults = {}) {
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) ?? defaults[k] ?? '';
  const query = {};
  const keys = new Set([...Object.keys(defaults), ...params.keys()]);
  for (const k of keys) query[k] = get(k);
  const set = useCallback((patch, { keepPage } = {}) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === '' || v === null || v === undefined || v === defaults[k]) next.delete(k); else next.set(k, String(v));
      }
      if (!keepPage && !('page' in patch)) next.delete('page');
      next.delete('focus');
      return next;
    }, { replace: true });
  }, [setParams]); // eslint-disable-line react-hooks/exhaustive-deps
  return [query, set];
}

/* ── Small layout pieces ──────────────────────────────────────────────────── */

export const Toolbar = ({ children, className = '' }) => <div className={`md-toolbar ${className}`}>{children}</div>;
export const Spacer = () => <span className="md-spacer" />;

/** A section inside a drawer or a profile card. */
export const Section = ({ title, right, children, icon }) => (
  <section className="md-sec">
    {(title || right) ? (
      <div className="md-sec__head">
        <h4>{icon ? <Ico name={icon} size={15} /> : null}{title}</h4>
        {right}
      </div>
    ) : null}
    {children}
  </section>
);

/** A timeline of status steps: [{ status, at, byName, note }]. */
export const Steps = ({ steps = [], map }) => (
  <ol className="md-steps">
    {steps.map((s, i) => (
      <li key={`${s.status}-${i}`} className={i === steps.length - 1 ? 'is-now' : ''}>
        <span className={`md-steps__dot md-t-${toneOf(map, s.status)}`} />
        <span className="md-steps__text">
          <b>{labelOf(map, s.status)}</b>
          <em>{[s.at ? new Date(s.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' }) : '', s.byName].filter(Boolean).join(' · ')}</em>
          {s.note ? <span>{s.note}</span> : null}
        </span>
      </li>
    ))}
  </ol>
);
