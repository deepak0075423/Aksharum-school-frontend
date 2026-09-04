/**
 * The pieces every dashboard is built from.
 *
 * Extracted when the student dashboard needed the same panel, row and empty-note
 * shapes the admin one had grown — one definition beats two that drift. Anything
 * shaped by a single screen's data stays in that page's own parts file.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../ui/icons';
import { VIZ } from '../../pages/analytics/viz';

// ── Panel ────────────────────────────────────────────────────────────────────
export const Panel = ({ title, subtitle, action, children, className = '', bodyClass = '' }) => (
  <section className={`dpanel ${className}`}>
    {(title || action) && (
      <header className="dpanel__head">
        <div>
          {title && <h2 className="dpanel__title">{title}</h2>}
          {subtitle && <p className="dpanel__sub">{subtitle}</p>}
        </div>
        {action}
      </header>
    )}
    <div className={`dpanel__body ${bodyClass}`}>{children}</div>
  </section>
);

/** The "View All →" affordance a panel header carries. */
export const PanelLink = ({ to, children = 'View All' }) => (
  <Link to={to} className="dpanel__link">{children}</Link>
);

// ── Row link (queues, events, lists) ─────────────────────────────────────────
export const RowLink = ({ to, icon, tone = 'indigo', title, sub, right }) => (
  <Link to={to} className="drow">
    <span className={`drow__icon tint-${tone}`}><Icon name={icon} size={19} /></span>
    <span className="drow__text">
      <span className="drow__title">{title}</span>
      {sub && <span className="drow__sub">{sub}</span>}
    </span>
    {right || <Icon name="chevronRight" size={16} className="drow__chev" />}
  </Link>
);

// ── Empty note inside a panel ────────────────────────────────────────────────
export const Note = ({ icon = 'checkCircle', children }) => (
  <div className="dnote"><Icon name={icon} size={17} />{children}</div>
);

// ── Attendance ring ──────────────────────────────────────────────────────────
/**
 * A ring, not a two-slice pie: this is one ratio against a 100% track, which is
 * a meter drawn round. The counts sit beside it as text — the contrast relief
 * the palette check requires, and the thing anyone actually reads off it.
 */
export function AttendanceRing({ today, caption = "Today's Attendance", totalLabel = 'Students Marked' }) {
  const pct   = today?.marked ? today.percentage : 0;
  const tone  = !today?.marked ? VIZ.muted : pct >= 75 ? VIZ.good : pct >= 50 ? VIZ.warn : VIZ.bad;
  const R     = 52;
  const C     = 2 * Math.PI * R;
  const dash  = (C * Math.min(100, Math.max(0, pct))) / 100;

  const present = (today?.present || 0) + (today?.late || 0);
  const absent  = today?.absent || 0;
  const total   = today?.total  || 0;

  return (
    <div className="ring">
      <div className="ring__dial">
        <svg width="136" height="136" viewBox="0 0 136 136" role="img"
          aria-label={today?.marked ? `${caption}: ${pct} percent` : `${caption}: not marked`}>
          <circle cx="68" cy="68" r={R} fill="none" stroke="#eef1f6" strokeWidth="13" />
          {pct > 0 && (
            <circle cx="68" cy="68" r={R} fill="none" stroke={tone} strokeWidth="13"
              strokeLinecap="round" strokeDasharray={`${dash} ${C - dash}`}
              transform="rotate(-90 68 68)" />
          )}
        </svg>
        <div className="ring__center">
          <span className="ring__cap">{caption}</span>
          <span className="ring__pct">{today?.marked ? `${pct}%` : '—'}</span>
          <span className="ring__word">{today?.marked ? 'Present' : 'Not marked'}</span>
        </div>
      </div>

      <ul className="ring__legend">
        <li>
          <span className="ring__dot" style={{ background: VIZ.good }} />
          <span className="ring__k">Present</span>
          <span className="ring__v">{today?.marked ? `${pct}% (${present})` : '—'}</span>
        </li>
        <li>
          <span className="ring__dot" style={{ background: VIZ.bad }} />
          <span className="ring__k">Absent</span>
          <span className="ring__v">{today?.marked ? `${100 - pct}% (${absent})` : '—'}</span>
        </li>
        <li>
          <span className="ring__dot ring__dot--hollow" />
          <span className="ring__k">{totalLabel}</span>
          <span className="ring__v">{total}</span>
        </li>
      </ul>
    </div>
  );
}
