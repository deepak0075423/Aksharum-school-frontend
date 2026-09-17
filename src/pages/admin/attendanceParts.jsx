/**
 * The pieces the admin Attendance screen is built from.
 *
 * Its own design, not the listParts frame: a header whose filters sit beside
 * the title, four tinted figures with their month-on-month change and a card of
 * shortcuts, an underlined tab row, and a two-column body — the admin's own
 * calendar and today's register on the left, a summary ring and the activity
 * feed on the right. Classes are prefixed `atn` and reach nothing else.
 *
 * Borrowed: the slide-over, the row menu and the avatar from listParts; the
 * pager, search field and numbered form step from leaveParts. Those are the
 * same controls everywhere, and a second copy would only drift.
 */
import React, { useMemo, useState } from 'react';
import Icon from '../../components/ui/icons';

// ── Dates ────────────────────────────────────────────────────────────────────
// Attendance is kept per LOCAL calendar day as 'YYYY-MM-DD'. Keys are built
// from local date parts and turned back into dates at local midnight — never
// through toISOString(), which is UTC and moves the day for anyone east of it.

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' of a Date, in local time. */
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local midnight of a key. */
export const dateOf = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const todayKey = () => keyOf(new Date());
export const addDays = (key, n) => { const d = dateOf(key); d.setDate(d.getDate() + n); return keyOf(d); };
export const addMonths = (key, n) => { const d = dateOf(key); d.setDate(1); d.setMonth(d.getMonth() + n); return keyOf(d); };
export const monthStart = (key) => `${key.slice(0, 8)}01`;
export const monthEnd = (key) => { const d = dateOf(key); return keyOf(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };

/** "16 Sep 2026" */
export const fmtDay = (key) => (key
  ? dateOf(String(key).slice(0, 10)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  : '');
/** "Wed, 16 Sep" */
export const fmtDayShort = (key) => (key
  ? dateOf(key).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  : '');
/** "September 2026" */
export const fmtMonth = (key) => dateOf(key).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
/** "09:01 AM" from a timestamp. */
export const fmtTime = (iso) => (iso
  ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
  : '');
/** "09:01 AM" from a stored 'HH:mm'. */
export const fmtClock = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${pad(((h + 11) % 12) + 1)}:${pad(m || 0)} ${h < 12 ? 'AM' : 'PM'}`;
};
/** "8h 05m" between two 'HH:mm' punches; '' when either is missing. */
export const workedFor = (inAt, outAt) => {
  if (!inAt || !outAt) return '';
  const [ih, im] = inAt.split(':').map(Number);
  const [oh, om] = outAt.split(':').map(Number);
  const mins = (oh * 60 + om) - (ih * 60 + im);
  if (!(mins > 0)) return '';
  return `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`;
};

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const ROLE_LABEL = { student: 'Student', teacher: 'Teacher', school_admin: 'Admin' };

// ── Status ───────────────────────────────────────────────────────────────────
/*
 * One colour per state, across the calendar, the pills and the charts. These
 * are STATUS colours — every use carries the word as well — and they were run
 * through the dataviz validator as a set (all pairs): present #15803d, absent
 * #dc2626, leave/late #ca8a04, half-day #4f46e5 pass CVD and normal-vision
 * separation. #16a34a (the usual green) sat ΔE 5.0 from the red under
 * deuteranopia; #b45309 amber sat 9.9 from the red even with full colour
 * vision. The amber is under 3:1 on white, so it is never text: pills and
 * labels use a darker ink from the same hue. Holiday is slate on purpose — a
 * day off is not a state anyone is judged on.
 */
export const STATUS = {
  present:   { label: 'Present',    dot: '#15803d', tone: 'green' },
  absent:    { label: 'Absent',     dot: '#dc2626', tone: 'red' },
  late:      { label: 'Late',       dot: '#ca8a04', tone: 'amber' },
  leave:     { label: 'Leave',      dot: '#ca8a04', tone: 'amber' },
  'half-day':{ label: 'Half-Day',   dot: '#4f46e5', tone: 'indigo' },
  holiday:   { label: 'Holiday',    dot: '#64748b', tone: 'slate' },
  weekend:   { label: 'Weekend',    dot: '#cbd5e1', tone: 'muted' },
  pending:   { label: 'Not in yet', dot: '#94a3b8', tone: 'muted' },
  unmarked:  { label: 'Not marked', dot: '#94a3b8', tone: 'muted' },
  approved:  { label: 'Approved',   dot: '#15803d', tone: 'green' },
  rejected:  { label: 'Rejected',   dot: '#dc2626', tone: 'red' },
  waiting:   { label: 'Pending',    dot: '#ca8a04', tone: 'amber' },
};

export const StatusPill = ({ status, label }) => {
  const s = STATUS[status || 'unmarked'] || STATUS.unmarked;
  return <span className={`atn-pill atn-pill--${s.tone}`}>{label || s.label}</span>;
};

export const Dot = ({ status }) => (
  <i className="atn-dot" style={{ background: (STATUS[status] || STATUS.unmarked).dot }} aria-hidden />
);

// ── Header ───────────────────────────────────────────────────────────────────

export const AttHeader = ({ title, subtitle, children }) => (
  <header className="atn-head">
    <span className="atn-head__badge"><Icon name="calendar" size={28} /></span>
    <div className="atn-head__text">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
    <div className="atn-head__acts">{children}</div>
  </header>
);

export const HeadSelect = ({ value, onChange, children, label, wide }) => (
  <label className={`atn-select${wide ? ' atn-select--wide' : ''}`}>
    <span className="sr-only">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>{children}</select>
    <Icon name="chevronDown" size={16} />
  </label>
);

// ── Summary tiles ────────────────────────────────────────────────────────────

/**
 * One headline figure and how it moved.
 *
 * The chip is coloured by whether the move is GOOD, not by its direction:
 * twelve fewer absentees is a green arrow pointing down. `unit` is '%' for a
 * change in a count and ' pts' is spelled out in the tooltip for a rate, whose
 * change is in percentage points — "87% → 90%" is +3, not +3.4%.
 */
export const AttStat = ({ icon, tone, value, label, change, good = 'up', note = 'vs last month', title, onClick }) => {
  let chip;
  if (change === null || change === undefined) {
    chip = <span className="atn-chg atn-chg--flat" title="Nothing to compare with last month">New</span>;
  } else if (change === 0) {
    chip = <span className="atn-chg atn-chg--flat"><Icon name="arrowRight" size={12} />0%</span>;
  } else {
    const better = (change > 0) === (good === 'up');
    chip = (
      <span className={`atn-chg atn-chg--${better ? 'good' : 'bad'}`}>
        <Icon name={change > 0 ? 'arrowUp' : 'arrowDown'} size={12} />{Math.abs(change)}%
      </span>
    );
  }
  const body = (
    <>
      <span className="atn-stat__icon"><Icon name={icon} size={26} /></span>
      <span className="atn-stat__body">
        <span className="atn-stat__value">{value}</span>
        <span className="atn-stat__label">{label}</span>
        <span className="atn-stat__delta">{chip}<em>{note}</em></span>
      </span>
    </>
  );
  const cls = `atn-stat atn-stat--${tone}`;
  return onClick
    ? <button type="button" className={cls} onClick={onClick} title={title}>{body}</button>
    : <div className={cls} title={title}>{body}</div>;
};

export const SideLinks = ({ items }) => (
  <nav className="atn-links" aria-label="Attendance shortcuts">
    {items.map((it) => (
      <button key={it.label} type="button" className="atn-link" onClick={it.onClick}>
        <span className="atn-link__icon"><Icon name={it.icon} size={19} /></span>
        <span className="atn-link__label">{it.label}</span>
        <Icon name="chevronRight" size={17} />
      </button>
    ))}
  </nav>
);

// ── Tabs & cards ─────────────────────────────────────────────────────────────

export const UnderTabs = ({ tabs, value, onChange, children }) => (
  <div className="atn-tabrow">
    <div className="atn-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value}
          className={`atn-tab${value === t.value ? ' is-on' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count ? <span className="atn-tab__count">{t.count}</span> : null}
        </button>
      ))}
    </div>
    {children ? <div className="atn-tabrow__side">{children}</div> : null}
  </div>
);

export const Card = ({ title, sub, actions, children, className = '', bodyClass = '' }) => (
  <section className={`atn-card ${className}`}>
    {(title || actions) && (
      <header className="atn-card__head">
        <div className="atn-card__title">
          <h2>{title}</h2>
          {sub ? <div className="atn-card__sub">{sub}</div> : null}
        </div>
        {actions ? <div className="atn-card__acts">{actions}</div> : null}
      </header>
    )}
    <div className={`atn-card__body ${bodyClass}`}>{children}</div>
  </section>
);

export const Segmented = ({ options, value, onChange, label }) => (
  <div className="atn-seg" role="radiogroup" aria-label={label}>
    {options.map((o) => (
      <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
        className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
        {o.icon ? <Icon name={o.icon} size={15} /> : null}{o.label}
      </button>
    ))}
  </div>
);

/** A from–to pair of dates as one control (the leave page's look, attendance's words). */
export const DayRange = ({ from, to, onFrom, onTo, max, what = 'Days' }) => (
  <div className={`lvrange${from || to ? ' is-set' : ''}`}>
    <Icon name="calendar" size={16} />
    <input type="date" value={from} max={to || max || undefined}
      onChange={(e) => onFrom(e.target.value)} aria-label={`${what} from`} />
    <span aria-hidden>–</span>
    <input type="date" value={to} min={from || undefined} max={max || undefined}
      onChange={(e) => onTo(e.target.value)} aria-label={`${what} to`} />
  </div>
);

export const EmptyNote = ({ icon = 'info', title, children }) => (
  <div className="atn-empty">
    <span className="atn-empty__icon"><Icon name={icon} size={22} /></span>
    <b>{title}</b>
    {children ? <p>{children}</p> : null}
  </div>
);

/** A thin one-hue bar for a percentage in a table cell, with the number beside it. */
export const Meter = ({ value, low = 75 }) => (
  <span className="atn-meter">
    <span className="atn-meter__track" aria-hidden>
      {value > 0 && <i className={value < low ? 'is-low' : ''} style={{ width: `${Math.max(2, value)}%` }} />}
    </span>
    <b>{value == null ? '—' : `${value}%`}</b>
  </span>
);

// ── Activity ─────────────────────────────────────────────────────────────────

const ACTIVITY = {
  marked:   { icon: 'checkCircle', tone: 'green' },
  updated:  { icon: 'pencil',      tone: 'blue' },
  request:  { icon: 'clock',       tone: 'amber' },
  reviewed: { icon: 'checkCircle', tone: 'green' },
  streak:   { icon: 'closeCircle', tone: 'red' },
  staffFix: { icon: 'pencil',      tone: 'blue' },
};

/** Title and detail line for one feed item — composed here, not on the server. */
export function describeActivity(a) {
  const where = [a.className, a.sectionName].filter(Boolean).join(' ');
  switch (a.kind) {
    case 'marked':
      return {
        title: 'Attendance marked',
        detail: `${where}${a.subjectName ? ` • ${a.subjectName}` : ''} • ${fmtDay(a.date)} • ${plural(a.count, 'student')}${a.absent ? `, ${a.absent} absent` : ''}`,
        by: a.by,
      };
    case 'updated':
      return { title: 'Attendance updated', detail: `${where} • ${fmtDay(a.date)} • ${plural(a.count, 'mark')} changed`, by: a.by };
    case 'request':
      return { title: 'Regularization request', detail: `${a.name} (${ROLE_LABEL[a.role] || 'Staff'}) • for ${fmtDay(a.date)}` };
    case 'reviewed':
      return {
        title: `Regularization ${a.status === 'approved' ? 'approved' : 'rejected'}`,
        detail: `${a.name} • ${fmtDay(a.date)}`, by: a.by,
      };
    case 'streak':
      return { title: `Absent for ${a.count} consecutive days`, detail: `${a.name} (${where})` };
    case 'staffFix':
      return { title: 'Staff attendance regularised', detail: `${a.name} • ${fmtDay(a.date)}`, by: a.by };
    default:
      return { title: 'Attendance', detail: '' };
  }
}

export const ActivityRow = ({ item, onOpen, ago }) => {
  const look = item.kind === 'reviewed' && item.status === 'rejected'
    ? { icon: 'closeCircle', tone: 'red' }
    : ACTIVITY[item.kind] || ACTIVITY.marked;
  const { title, detail, by } = describeActivity(item);
  const inner = (
    <>
      <span className={`atn-act__icon atn-act__icon--${look.tone}`}><Icon name={look.icon} size={19} /></span>
      <span className="atn-act__text">
        <b>{title}</b>
        <small>{detail}{by ? ` • by ${by}` : ''}</small>
      </span>
      <time className="atn-act__when" dateTime={item.at} title={new Date(item.at).toLocaleString('en-IN')}>{ago(item.at)}</time>
    </>
  );
  return onOpen
    ? <button type="button" className="atn-act" onClick={() => onOpen(item)}>{inner}</button>
    : <div className="atn-act">{inner}</div>;
};

// ── Reports chart ────────────────────────────────────────────────────────────

const BUCKET_LABEL = {
  day:   (k) => fmtDayShort(k),
  week:  (k) => `Week of ${dateOf(k).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
  month: (k) => dateOf(k).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
};
const TICK_LABEL = {
  day:   (k) => String(dateOf(k).getDate()),
  week:  (k) => dateOf(k).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
  month: (k) => dateOf(k).toLocaleDateString('en-IN', { month: 'short' }),
};

/**
 * Attendance rate per day / week / month as columns on a fixed 0–100 scale.
 *
 * One series, so one hue and no legend — the card title names it. A bucket
 * nobody marked is a gap with a faint baseline tick, never a zero-height bar:
 * a Sunday is not a day the whole school stayed home. Each column is its own
 * hover and focus target (the full slot, not just the painted bar) and shows
 * the counts behind the rate.
 */
export function RateColumns({ series = [], bucket = 'day', threshold = 75 }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 220, L = 34, R = 8, T = 10, B = 26;
  const plotW = W - L - R, plotH = H - T - B;
  const n = Math.max(1, series.length);
  const slot = plotW / n;
  const bar = Math.max(3, Math.min(28, slot - 4));
  const y = (v) => T + plotH - (v / 100) * plotH;
  const everyNth = Math.ceil(n / 12);

  const tip = hover != null ? series[hover] : null;
  const tipLeft = hover != null ? ((L + slot * hover + slot / 2) / W) * 100 : 0;

  const anyMarked = useMemo(() => series.some((s) => s.marked), [series]);

  return (
    <div className="atn-cols">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Attendance rate by ${bucket}, ${series.filter((s) => s.marked).length} of ${series.length} marked`}>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className={g === 0 ? 'atn-cols__base' : 'atn-cols__grid'} />
            <text x={L - 8} y={y(g) + 4} textAnchor="end" className="atn-cols__axis">{g}%</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(threshold)} y2={y(threshold)} className="atn-cols__goal" />
        {series.map((s, i) => {
          const cx = L + slot * i + slot / 2;
          return (
            <g key={s.key}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
              aria-label={`${BUCKET_LABEL[bucket](s.key)}: ${s.marked ? `${s.percentage}%` : 'not marked'}`}>
              <rect x={L + slot * i} y={T} width={slot} height={plotH} fill="transparent" />
              {s.marked ? (
                <rect x={cx - bar / 2} y={y(s.percentage)} width={bar}
                  height={Math.max(2, plotH - (y(s.percentage) - T))} rx={Math.min(4, bar / 2)}
                  className={`atn-cols__bar${hover === i ? ' is-hover' : ''}`} />
              ) : (
                <line x1={cx - bar / 2} x2={cx + bar / 2} y1={y(0) - 1} y2={y(0) - 1} className="atn-cols__gap" />
              )}
              {(i % everyNth === 0) && (
                <text x={cx} y={H - 8} textAnchor="middle" className="atn-cols__axis">{TICK_LABEL[bucket](s.key)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="atn-tip" style={{ left: `${tipLeft}%` }} role="status">
          <b>{tip.marked ? `${tip.percentage}%` : 'Not marked'}</b>
          <span>{BUCKET_LABEL[bucket](tip.key)}</span>
          {tip.marked && (
            <span className="atn-tip__rows">
              {tip.present} present · {tip.late} late · {tip.absent} absent
            </span>
          )}
        </div>
      )}
      {!anyMarked && <div className="atn-cols__none">No attendance was marked in this period.</div>}
    </div>
  );
}

/**
 * Present / late / absent as one stacked bar with a labelled legend. Part to
 * whole of a single total, so a bar, not a pie; status colours, so every
 * segment is named with its count beside it.
 */
export const StatusSplit = ({ present = 0, late = 0, absent = 0, halfDay = 0 }) => {
  const total = present + late + absent + halfDay;
  const parts = [
    ['present', present], ['late', late], ['half-day', halfDay], ['absent', absent],
  ];
  return (
    <div className="atn-split">
      <div className="atn-split__bar" role="img"
        aria-label={`${present} present, ${late} late, ${halfDay} half-day, ${absent} absent`}>
        {total ? parts.filter(([, v]) => v > 0).map(([k, v]) => (
          <i key={k} style={{ width: `${(v / total) * 100}%`, background: STATUS[k].dot }}
            title={`${STATUS[k].label}: ${v} (${Math.round((v / total) * 100)}%)`} />
        )) : <i className="is-empty" />}
      </div>
      <ul className="atn-split__legend">
        {parts.map(([k, v]) => (
          <li key={k}>
            <Dot status={k} /><span>{STATUS[k].label}</span>
            <b>{v.toLocaleString('en-IN')}</b>
            <em>{total ? `${Math.round((v / total) * 100)}%` : '—'}</em>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Download rows as a CSV — built in the browser from what is on screen. */
export function downloadCsv(filename, header, rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
