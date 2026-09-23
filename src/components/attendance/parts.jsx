/**
 * Attendance pages — the pieces the teacher's four tabs, the student's page and
 * the parent's page share.
 *
 * The teacher tabs were built to user mockups, prefixed `tat-` in global.css
 * (block TEACHER ATTENDANCE). Status colours, pills and date helpers come from
 * the admin attendance screen (pages/admin/attendanceParts.jsx) — one palette,
 * validated once, for every attendance screen.
 */
import React, { useEffect, useRef, useState } from 'react';
import Icon from '../ui/icons';
import { fileUrl } from '../../pages/admin/listParts';
import {
  STATUS, addDays, addMonths, dateOf, fmtMonth, monthEnd, monthStart, todayKey,
} from '../../pages/admin/attendanceParts';

export {
  STATUS, StatusPill, Dot, plural, todayKey, dateOf, addDays, addMonths, monthStart, monthEnd,
  fmtMonth, fmtClock, fmtTime, workedFor, downloadCsv,
} from '../../pages/admin/attendanceParts';
import Tabs from '../ui/Tabs';

// Short month names spelled out: current ICU writes September as "Sept" in both
// en-IN and en-GB, and the design reads "Sep".
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthShort = (d) => MON[d.getMonth()];
/** "17 Sep 2026" */
export const fmtDay = (key) => {
  if (!key) return '';
  const d = dateOf(String(key).slice(0, 10));
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
};
/** "16 Sep 2026, 10:30 AM" from a timestamp. */
export const fmtStamp = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
};
/** "Sep 2026" from 'YYYY-MM'. */
export const fmtMonthYear = (ym) => { const d = dateOf(`${ym}-01`); return `${MON[d.getMonth()]} ${d.getFullYear()}`; };

export const TABS = [
  { value: 'mark',        label: 'Mark Students',       icon: 'calendar' },
  { value: 'ranking',     label: 'Class Ranking',       icon: 'trophy' },
  { value: 'mine',        label: 'My Attendance',       icon: 'chart' },
  { value: 'corrections', label: 'Student Corrections', icon: 'history' },
];

/** The marks a teacher gives a student, in the order the register shows them. */
export const MARKS = ['present', 'absent', 'late', 'half-day'];

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Wednesday, 17 Sep 2026" */
export const fmtLongDay = (key) => `${dateOf(key).toLocaleDateString('en-GB', { weekday: 'long' })}, ${fmtDay(key)}`;

/** 40.5 → "40.5", 41 → "41": a half day is half a day, not a rounding error. */
export const num = (n) => (n == null ? '—' : Number.isInteger(n) ? String(n) : n.toFixed(1));

// ── Frame ────────────────────────────────────────────────────────────────────

/**
 * Header, tab row, body — and a rail beside the body when the tab has one.
 *
 * Each tab follows its own mockup, and the four do not agree: Mark Students
 * draws the tabs as a boxed row of pills, the others as an underlined row; the
 * rail starts level with the tabs on Mark Students and My Attendance, and level
 * with the figures under them on Student Corrections. `tabStyle`, `railAlign`
 * and `railWidth` carry those differences.
 */
export function Frame({
  tab, onTab, subtitle, actions, rail, children, counts = {},
  tabStyle = 'underline', railAlign = 'tabs', railWidth = 'md',
  title = 'Attendance', tabs = TABS, banner,
}) {
  return (
    <div className="page tatpg">
      <header className="tat-head">
        <span className="tat-head__badge"><Icon name="calendar" size={32} /></span>
        <div className="tat-head__text">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="tat-head__acts">{actions}</div>
      </header>
      {banner}
      <div className={['tat-body', rail && 'tat-body--rail', rail && `tat-body--rail-${railWidth}`,
        rail && railAlign === 'content' && 'tat-body--rail-low'].filter(Boolean).join(' ')}>
        <div className="tat-main">
          <Tabs
            variant={tabStyle === 'pill' ? 'pill' : 'line'}
            label="Attendance"
            value={tab}
            onChange={onTab}
            items={tabs.map((t) => ({ ...t, count: counts[t.value] || undefined }))}
          />
          {children}
        </div>
        {rail ? <aside className="tat-rail">{rail}</aside> : null}
      </div>
    </div>
  );
}

// ── Cards and figures ────────────────────────────────────────────────────────

/** `bareIcon` draws the heading icon on its own, without the tinted square. */
export function Card({ title, sub, icon, iconTone = 'indigo', bareIcon, actions, children, className = '', bodyClass = '' }) {
  return (
    <section className={`tat-card ${className}`}>
      {(title || actions) && (
        <header className="tat-card__head">
          {icon ? (bareIcon
            ? <span className={`tat-card__bareicon tat-ink--${iconTone}`}><Icon name={icon} size={26} /></span>
            : <span className={`tat-card__icon tat-t--${iconTone}`}><Icon name={icon} size={20} /></span>) : null}
          <div className="tat-card__title">
            {title ? <h2>{title}</h2> : null}
            {sub ? <p>{sub}</p> : null}
          </div>
          {actions ? <div className="tat-card__acts">{actions}</div> : null}
        </header>
      )}
      <div className={`tat-card__body ${bodyClass}`}>{children}</div>
    </section>
  );
}

/**
 * One figure, in the layout its mockup draws:
 *   inline  (Mark Students)       value / label ··· note
 *   stack   (My Attendance)       value / label / note ··· trail / ··· caption
 *   corner  (Student Corrections) value / label / caption, note in the corner
 *   card    (Class Ranking)       white card: value / label / caption, trail top-right
 * `solid` fills the icon square (Present); `solid="circle"` draws a filled check
 * disc inside it (Approved).
 */
export function Tile({
  icon, tone, value, label, note, noteTone, caption, captionTone, trail, title, layout = 'inline', solid,
}) {
  const hasNote = note != null && note !== '';
  const noteEl = hasNote ? <span className={`tat-tile__note tat-ink--${noteTone || tone}`}>{note}</span> : null;
  return (
    <div className={`tat-tile tat-tile--${tone} tat-tile--${layout}`} title={title}>
      <span className={`tat-tile__icon${solid === true ? ' is-solid' : ''}`}>
        {solid === 'circle'
          ? <span className="tat-tile__disc"><Icon name="check" size={17} strokeWidth={3} /></span>
          : <Icon name={icon} size={layout === 'card' ? 28 : 24} strokeWidth={solid ? 2.2 : 1.9} />}
      </span>
      <div className="tat-tile__body">
        <b className="tat-tile__value">{value}</b>
        {layout === 'inline'
          ? <span className="tat-tile__row"><span className="tat-tile__label">{label}</span>{noteEl}</span>
          : <span className="tat-tile__label">{label}</span>}
        {layout === 'stack' && (
          <>
            <span className="tat-tile__row">{noteEl || <span />}{trail ? <span className="tat-tile__trail">{trail}</span> : null}</span>
            {caption ? <small className="tat-tile__caption is-right">{caption}</small> : null}
          </>
        )}
        {(layout === 'corner' || layout === 'card') && caption
          ? <small className={`tat-tile__caption${captionTone ? ` tat-ink--${captionTone}` : ''}`}>{caption}</small> : null}
      </div>
      {layout === 'corner' && noteEl ? <span className="tat-tile__corner">{noteEl}</span> : null}
      {layout === 'card' && trail ? <span className="tat-tile__corner tat-tile__corner--top">{trail}</span> : null}
    </div>
  );
}

/** "+5%" with an arrow, green when it is good news. `good` says which way that is. */
export function Change({ value, good = 'up', unit = '%' }) {
  if (value == null) return <span className="tat-change tat-change--flat">—</span>;
  if (value === 0) return <span className="tat-change tat-change--flat">±0{unit}</span>;
  const up = value > 0;
  const fine = good === 'up' ? up : !up;
  return (
    <span className={`tat-change tat-change--${fine ? 'good' : 'bad'}`}>
      <Icon name={up ? 'arrowUpRight' : 'arrowDownRight'} size={16} strokeWidth={2.4} />
      {up ? '+' : ''}{value}{unit}
    </span>
  );
}

const SOFT = ['indigo', 'pink', 'teal', 'violet', 'amber', 'sky', 'green', 'rose'];
const toneOf = (name) => SOFT[[...String(name || '')].reduce((n, c) => n + c.charCodeAt(0), 0) % SOFT.length];

/** Initials on a soft tint — the photo when there is one. */
export function SoftAvatar({ name, src, size = 34 }) {
  const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const style = { width: size, height: size, fontSize: size * 0.36 };
  if (src) return <img className="tat-av" src={fileUrl(src)} alt="" style={style} loading="lazy" />;
  return <span className={`tat-av tat-av--${toneOf(name)}`} style={style} aria-hidden>{initials || '?'}</span>;
}

/**
 * A labelled select dressed as one of the mockup's pill controls. `iconRight`
 * puts the icon where the chevron would be (the month picker's calendar).
 */
export function PillSelect({ icon, iconRight, label, value, onChange, children, className = '', disabled }) {
  return (
    <label className={`tat-pillselect ${className}${disabled ? ' is-disabled' : ''}`}>
      {icon ? <Icon name={icon} size={18} /> : null}
      <span className="tat-pillselect__text">
        {label ? <small>{label}</small> : null}
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled}>{children}</select>
      </span>
      <Icon name={iconRight || 'chevronDown'} size={iconRight ? 18 : 16} />
    </label>
  );
}

/** A small menu under a button — Bulk Actions, New Correction ▾, the table options. */
export function MenuButton({ label, icon, children, className = 'tat-btn', align = 'left', caret = true, title }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="tat-menu" ref={ref}>
      <button type="button" className={className} aria-expanded={open} title={title} aria-label={title || undefined}
        onClick={() => setOpen((o) => !o)}>
        {icon ? <Icon name={icon} size={17} /> : null}
        {label}
        {caret ? <Icon name="chevronDown" size={15} /> : null}
      </button>
      {open && (
        <div className={`tat-menu__panel tat-menu__panel--${align}`} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </span>
  );
}

export const MenuRow = ({ icon, children, onClick, disabled, tone }) => (
  <button type="button" role="menuitem" className={`tat-menu__item${tone ? ` tat-ink--${tone}` : ''}`} onClick={onClick} disabled={disabled}>
    {icon ? <Icon name={icon} size={16} /> : null}{children}
  </button>
);

export const Empty = ({ icon = 'info', title, children }) => (
  <div className="tat-empty">
    <span className="tat-empty__icon"><Icon name={icon} size={22} /></span>
    <b>{title}</b>
    {children ? <p>{children}</p> : null}
  </div>
);

// ── Month calendar ───────────────────────────────────────────────────────────

/**
 * A month grid with one dot per day. `days` maps 'YYYY-MM-DD' → { state, title }
 * where state is a STATUS key; `selected` is ringed; days after `max` are inert.
 */
export function MonthCalendar({ month, onMonth, days = {}, selected, onSelect, legend = [], max = todayKey(), loading }) {
  const first = monthStart(month);
  const last  = monthEnd(month);
  const lead  = dateOf(first).getDay();
  const keys  = [];
  for (let k = first; k <= last; k = addDays(k, 1)) keys.push(k);

  return (
    <div className={`tat-mcal${loading ? ' is-loading' : ''}`}>
      <div className="tat-mcal__nav">
        <button type="button" className="tat-iconbtn tat-iconbtn--bare" aria-label="Previous month" onClick={() => onMonth(addMonths(month, -1))}>
          <Icon name="chevronLeft" size={18} />
        </button>
        <b>{fmtMonth(month)}</b>
        <button type="button" className="tat-iconbtn tat-iconbtn--bare" aria-label="Next month" onClick={() => onMonth(addMonths(month, 1))}>
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
      <div className="tat-mcal__grid">
        {WEEKDAYS.map((w) => <span key={w} className="tat-mcal__dow">{w}</span>)}
        {Array.from({ length: lead }).map((_, i) => <span key={`b${i}`} />)}
        {keys.map((k) => {
          const d = days[k] || {};
          const dot = d.state && STATUS[d.state] && !['weekend', 'holiday'].includes(d.state) ? STATUS[d.state].dot : null;
          const cls = ['tat-mcal__day', k === selected && 'is-on', k === todayKey() && 'is-today', k > max && 'is-future',
            (d.state === 'weekend' || d.state === 'holiday') && 'is-off'].filter(Boolean).join(' ');
          return (
            <button key={k} type="button" className={cls} disabled={k > max || !onSelect}
              title={d.title} onClick={() => onSelect?.(k)}>
              <span>{dateOf(k).getDate()}</span>
              <i style={dot ? { background: dot } : undefined} className={dot ? '' : 'is-none'} />
            </button>
          );
        })}
      </div>
      {legend.length ? (
        <ul className="tat-legend">
          {legend.map((l) => <li key={l.key}><i style={{ background: STATUS[l.key]?.dot || l.dot }} />{l.label}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
