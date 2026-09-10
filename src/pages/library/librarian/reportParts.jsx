/**
 * The pieces of the reports screen.
 *
 * There is one table here, not eight. Every report answers on the same shape —
 * a list of columns saying what a value *is* (a date, a fine, an overdue count,
 * a member, a book) and rows carrying those values — so the rendering is
 * decided by the column's type rather than by which report is open. A report
 * added on the server appears here, correctly formatted, with no edit.
 *
 * Two things that look like decoration and are not:
 *
 *  • A date arrives as `YYYY-MM-DD` and is split by hand rather than parsed.
 *    `new Date('2026-09-04')` is midnight UTC, and west of Greenwich that
 *    renders as the 3rd — a register that quietly reports every loan a day
 *    early is worse than one that reports nothing.
 *
 *  • Days late and money are their own cell types. Overdue is the one number on
 *    this page somebody has to act on, and a right-aligned column of rupees is
 *    the difference between a ledger and a list.
 */
import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../../components/ui/icons';
import DropdownPanel, { isInsideDropdown } from '../../../components/ui/DropdownPanel';
import MemberPicker from '../../../components/library/MemberPicker';

// ── Formatting ───────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** The librarian's own calendar day, not the browser's idea of UTC. */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const startOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
};

/** "04 Sep 2026" — read off the string, so no time zone can shift the day. */
export const fmtDate = (v) => {
  if (!v) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(v);
};

export const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const count = (n) => Number(n || 0).toLocaleString('en-IN');

/** `late_return` → `Late return`. Server vocabulary, said in English. */
export const words = (v) => String(v || '')
  .replace(/_/g, ' ')
  .replace(/^./, (c) => c.toUpperCase());

// ── Statuses ─────────────────────────────────────────────────────────────────
//
//  Colour is never the only channel: every chip says the word as well.

const TONES = {
  available: 'ok',   returned: 'ok',   paid: 'ok',
  issued:    'info', reserved: 'info',
  damaged:   'warn', pending:  'warn',
  overdue:   'bad',  lost:     'bad',
  waived:    'mute', new: 'ok', good: 'ok', fair: 'warn',
};

const LABELS = {
  pending: 'Unpaid',
  waived: 'Written off',
  issued: 'Issued out',
};

export const StatusChip = ({ value }) => {
  if (!value) return <Blank />;
  const key = String(value).toLowerCase();
  return (
    <span className={`librep-chip is-${TONES[key] || 'mute'}`}>
      {LABELS[key] || words(value)}
    </span>
  );
};

export const RoleChip = ({ value }) => (value
  ? <span className={`librep-role is-${String(value).toLowerCase()}`}>{words(value)}</span>
  : <Blank />);

export const Blank = ({ children = '—' }) => <span className="lnone">{children}</span>;

// ── Cells ────────────────────────────────────────────────────────────────────

/** A book leads with its spine — the library has no cover art to show. */
const Spine = ({ title }) => (
  <span className="librep-spine" aria-hidden>{String(title || '?').trim().charAt(0).toUpperCase()}</span>
);

/**
 * One value, rendered by what the column says it is.
 *
 * `sub` folds a second column into this cell (an ISBN under a title, a class
 * under a name) — the spreadsheet still gets it as a column of its own, because
 * a sheet has no room for two lines in a box.
 */
export const Cell = ({ column, row }) => {
  const value = row[column.key];
  const sub   = column.sub ? row[column.sub] : '';
  const empty = column.empty || '—';

  if (value === '' || value === null || value === undefined) {
    // A zero is a fact — "0 loans ever" is the whole point of the dead-stock
    // report — so only genuinely absent values fall back to the dash.
    if (typeof value !== 'number') return <Blank>{empty}</Blank>;
  }

  switch (column.type) {
    case 'title':
      return (
        <div className="librep-book">
          <Spine title={value} />
          <span>
            <b>{value}</b>
            {sub ? <small>ISBN: {sub}</small> : null}
          </span>
        </div>
      );

    case 'person':
      return (
        <div className="librep-who">
          <b>{value}</b>
          {sub ? <small>{sub}</small> : null}
        </div>
      );

    case 'status':    return <StatusChip value={value} />;
    case 'role':      return <RoleChip value={value} />;
    case 'chip':      return value ? <span className="librep-chip is-soft">{words(value)}</span> : <Blank>{empty}</Blank>;
    case 'code':      return <span className="librep-code">{value}</span>;
    case 'date':      return value ? <span className="librep-date">{fmtDate(value)}</span> : <Blank>{empty}</Blank>;
    case 'money':     return <span className="librep-money">{money(value)}</span>;

    case 'days':
      return Number(value) > 0
        ? <span className="librep-late">{count(value)}</span>
        : <Blank>{column.empty || '0'}</Blank>;

    case 'num':
      return (
        <span className="librep-num">
          {column.decimals ? Number(value || 0).toFixed(column.decimals) : count(value)}
        </span>
      );

    default:
      return <span className="librep-text">{String(value)}</span>;
  }
};

// ── The rail ─────────────────────────────────────────────────────────────────

export const Rail = ({ reports, active, onPick }) => (
  <nav className="card librep-rail" aria-label="Report categories">
    <header className="librep-rail__head">
      <span className="librep-rail__mark tint-indigo"><Icon name="chart" size={16} /></span>
      <h2>Report categories</h2>
    </header>
    <ul>
      {reports.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            className={`librep-rail__item${active === r.key ? ' is-on' : ''}`}
            aria-current={active === r.key ? 'page' : undefined}
            onClick={() => onPick(r.key)}
          >
            <span className={`librep-rail__icon tint-${r.tone || 'indigo'}`}><Icon name={r.icon} size={15} /></span>
            <span className="librep-rail__text">
              <b>{r.name}</b>
              <small>{r.blurb}</small>
            </span>
            <Icon name="chevronRight" size={14} />
          </button>
        </li>
      ))}
    </ul>
  </nav>
);

// ── The figures above the table ──────────────────────────────────────────────

/** A summary figure, formatted by the same vocabulary the columns use. */
export const fmtStat = (s) => {
  if (s.type === 'money') return money(s.value);
  if (s.type === 'days')  return `${count(s.value)} day${Number(s.value) === 1 ? '' : 's'}`;
  return count(s.value);
};

export const SummaryStrip = ({ summary }) => {
  if (!summary?.length) return null;
  return (
    <div className="librep-sum">
      {summary.map((s) => (
        <div className="librep-sum__item" key={s.label}>
          <span className="librep-sum__value">{fmtStat(s)}</span>
          <span className="librep-sum__label">{s.label}</span>
          {s.caption ? <span className="librep-sum__cap">{s.caption}</span> : null}
        </div>
      ))}
    </div>
  );
};

// ── Date ranges ──────────────────────────────────────────────────────────────

export const PRESETS = [
  { key: 'month',   label: 'This month',     range: () => ({ from: startOfMonth(), to: today() }) },
  { key: 'last30',  label: 'Last 30 days',   range: () => ({ from: daysAgo(30),    to: today() }) },
  { key: 'last90',  label: 'Last 3 months',  range: () => ({ from: daysAgo(90),    to: today() }) },
  { key: 'last365', label: 'Last 12 months', range: () => ({ from: daysAgo(365),   to: today() }) },
  { key: 'year',    label: 'A year back',    range: () => ({ from: daysAgo(365),   to: today() }) },
  { key: 'all',     label: 'All time',       range: () => ({ from: '', to: '' }) },
];

export const rangeFor = (preset) => (PRESETS.find((p) => p.key === preset) || PRESETS[2]).range();

/**
 * The window the report covers: a preset, or two dates typed in.
 *
 * Portalled out to <body> rather than positioned inside the card. `.card` is
 * `overflow: hidden` — it has to be, or the table's corners escape the rounded
 * border — so a popover opened from the card's header would be sliced off at
 * the header's edge with nothing to scroll to.
 */
export const RangePicker = ({ from, to, onChange }) => {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const btn = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    // The panel is no longer a DOM descendant of the button, so "clicked
    // inside" has to account for the portal as well.
    const away = (e) => { if (!isInsideDropdown(e.target, box.current)) setOpen(false); };
    const esc  = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const label = !from && !to
    ? 'All time'
    : `${from ? fmtDate(from) : 'The beginning'} – ${to ? fmtDate(to) : 'today'}`;

  return (
    <div className="librep-range" ref={box}>
      <button ref={btn} type="button" className="librep-range__btn"
        onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon name="calendarDays" size={15} />
        <span>{label}</span>
        <Icon name="chevronDown" size={14} />
      </button>

      <DropdownPanel anchorRef={btn} open={open} maxHeight={360}>
        <div className="librep-range__pop">
          {PRESETS.filter((p) => p.key !== 'year').map((p) => (
            <button key={p.key} type="button" className="librep-range__preset"
              onClick={() => { onChange(p.range()); setOpen(false); }}>
              {p.label}
            </button>
          ))}
          <div className="librep-range__custom">
            <label>
              From
              <input type="date" className="form-control" value={from || ''} max={to || today()}
                onChange={(e) => onChange({ from: e.target.value, to })} />
            </label>
            <label>
              To
              <input type="date" className="form-control" value={to || ''} min={from || undefined} max={today()}
                onChange={(e) => onChange({ from, to: e.target.value })} />
            </label>
          </div>
        </div>
      </DropdownPanel>
    </div>
  );
};

// ── The filter bar ───────────────────────────────────────────────────────────

/**
 * One row of controls, built from what the report says it takes. `options`
 * carries the lists the server read out of the data — the classes that exist,
 * the racks that hold something — so a renamed shelf is never a stale choice.
 */
export const FilterBar = ({ filters, options, values, onChange, search, onSearch, children }) => {
  const selects = filters.filter((f) => f.type === 'select');
  const member  = filters.find((f) => f.type === 'member');
  const since   = filters.find((f) => f.type === 'date');
  const box     = filters.find((f) => f.type === 'search');

  return (
    <div className="librep-filters">
      {member && (
        <div className="librep-filters__member">
          <MemberPicker compact value={values.userId || ''} placeholder="Search for a member…"
            onChange={(id) => onChange(member.key, id)} />
        </div>
      )}

      {since && (
        <label className="librep-filters__date">
          <span>{since.label}</span>
          <input type="date" className="form-control" max={today()}
            value={values[since.key] || ''}
            onChange={(e) => onChange(since.key, e.target.value)} />
        </label>
      )}

      {selects.map((f) => (
        <select key={f.key} className="form-control librep-filters__select"
          aria-label={f.label}
          value={values[f.key] || ''}
          onChange={(e) => onChange(f.key, e.target.value)}
        >
          {f.all ? <option value="">{f.all}</option> : null}
          {(f.options || options[f.source] || []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}

      {box && (
        <div className="librep-search">
          <Icon name="search" size={15} />
          <input className="form-control" value={search} placeholder={box.placeholder || 'Search…'}
            onChange={(e) => onSearch(e.target.value)} aria-label="Search this report" />
          {search && (
            <button type="button" onClick={() => onSearch('')} aria-label="Clear search">
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
      )}

      <div className="librep-filters__acts">{children}</div>
    </div>
  );
};

/** What is narrowing the report right now, each one removable. */
export const Chip = ({ label, onClear }) => (
  <span className="librep-tag">
    {label}
    {onClear && (
      <button type="button" onClick={onClear} aria-label={`Remove ${label}`}>
        <Icon name="close" size={12} />
      </button>
    )}
  </span>
);

// ── Print ────────────────────────────────────────────────────────────────────

/**
 * The heading a printed report needs and the screen does not: what it is, what
 * was asked of it, and which slice of it this paper holds. Hidden on screen.
 */
export const PrintHead = ({ report, school, chips, shown, total }) => (
  <div className="librep-print">
    <h1>{report.name}</h1>
    <p className="librep-print__blurb">{report.blurb}</p>
    <p className="librep-print__meta">
      {school ? `${school} · ` : ''}Printed {fmtDate(today())}
      {total ? ` · ${shown} of ${count(total)} row${total === 1 ? '' : 's'}` : ''}
    </p>
    {chips.length ? <p className="librep-print__filters">Filtered by: {chips.join(' · ')}</p> : null}
  </div>
);
