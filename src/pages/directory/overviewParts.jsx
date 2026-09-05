/**
 * The pieces the Employee Directory overview is built from.
 *
 * Kept beside the page, like parts.jsx — none of it is general. The charts here
 * are hand-drawn from divs and one SVG ring rather than pulled from a charting
 * library: three small figures do not justify shipping recharts on a page that
 * otherwise renders in a few kilobytes, and the app's chart palette
 * (pages/analytics/viz.jsx) already answers what colour anything may be.
 */
import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { VIZ } from '../analytics/palette';
import { Avatar, STATUS_LABEL, STATUS_TONE, fmtDate } from './parts';

// ── Palette ──────────────────────────────────────────────────────────────────
//
// CATEGORICAL — identity, for the staff split (which group is which). The eight
// slots below are the data-viz reference theme, assigned in fixed order and
// never cycled. Re-validated against THIS app's surface (#ffffff) before being
// written down: lightness band, chroma floor, adjacent-pair CVD separation
// (worst ΔE 9.1 protan) and the normal-vision floor (worst ΔE 19.6) all pass.
// Contrast against white warns for three of the eight, which obligates relief —
// so every segment is direct-labelled in the legend, with its count and share.
export const SERIES = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
];

// ORDINAL — position in a sequence, for profile completion. Not started → in
// progress → complete is an order, so it reads as one hue getting darker rather
// than three identities. Three steps of the app's existing validated band ramp,
// picked on measured OKLab lightness (0.753 / 0.540 / 0.398) so the steps are
// even and each clears the 0.06 minimum.
export const COMPLETION_STEPS = [VIZ.bands[0], VIZ.bands[2], VIZ.bands[3]];

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

// ── Page furniture ───────────────────────────────────────────────────────────

/** A panel with a title and, usually, a way out of it. */
export const Panel = ({ title, action, children, className = '' }) => (
  <section className={`edo-panel ${className}`.trim()}>
    <header className="edo-panel__head">
      <h2>{title}</h2>
      {action}
    </header>
    {children}
  </section>
);

export const PanelLink = ({ to, children = 'View All' }) => (
  <Link to={to} className="edo-panel__link">{children} ›</Link>
);

/**
 * One headcount tile.
 *
 * The caption is where the number is put in proportion — "64% of total" answers
 * the question the raw 7 raises — and it is the only place a share appears, so
 * the figure itself is never a percentage pretending to be a count.
 */
export const StatTile = ({ icon, tone, value, label, caption, captionTone, to }) => {
  const body = (
    <>
      <span className={`edo-stat__icon tint-${tone}`}>{icon}</span>
      <span className="edo-stat__body">
        <span className="edo-stat__value">{value ?? 0}</span>
        <span className="edo-stat__label">{label}</span>
        {caption ? <span className={`edo-stat__cap${captionTone ? ` is-${captionTone}` : ''}`}>{caption}</span> : null}
      </span>
    </>
  );
  return to
    ? <Link to={to} className="edo-stat edo-stat--link">{body}</Link>
    : <div className="edo-stat">{body}</div>;
};

// ── Part-to-whole ────────────────────────────────────────────────────────────

/**
 * A share of the staff, as one horizontal stacked bar.
 *
 * Deliberately NOT a donut. The default split is two groups, and a two-slice pie
 * is a stat tile drawn the long way round; worse, the selector above it swaps in
 * Department and Designation, where a ring turns into eight wedges nobody can
 * compare. One bar reads the same at two categories or eight, keeps every
 * segment against a common baseline, and leaves room for the count and the share
 * to be written next to each label rather than guessed from an arc.
 *
 * Segments are separated by a 2px surface gap so touching fills stay distinct
 * for a reader who cannot tell the two hues apart.
 */
export function ShareBar({ parts, total, empty = 'Nothing to show yet' }) {
  const rows = parts.filter((p) => p.count > 0);
  if (!rows.length || !total) return <p className="edo-empty">{empty}</p>;

  return (
    <div className="edo-share">
      <div className="edo-share__bar" role="img"
        aria-label={rows.map((r) => `${r.label}: ${r.count}, ${pct(r.count, total)} percent`).join('. ')}>
        {rows.map((r) => (
          <span key={r.label} className="edo-share__seg"
            style={{ flexGrow: r.count, background: r.color }} title={`${r.label} — ${r.count}`} />
        ))}
      </div>
      <ul className="edo-share__key">
        {rows.map((r) => (
          <li key={r.label}>
            <span className="edo-share__dot" style={{ background: r.color }} aria-hidden />
            <span className="edo-share__name" title={r.label}>{r.label}</span>
            <span className="edo-share__num">{r.count}</span>
            <span className="edo-share__pct">{pct(r.count, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The one number a panel leads with.
 *
 * A single ratio against a limit is a meter, not a ring — so the average sits at
 * full size with a track under it, and the ring the mock drew is spent instead on
 * the three buckets, which is the part that actually needs a shape.
 */
export const Hero = ({ value, unit = '%', label, sub, tone = VIZ.accent }) => (
  <div className="edo-hero">
    <div className="edo-hero__fig">
      <span className="edo-hero__val">{value}</span>
      <span className="edo-hero__unit">{unit}</span>
    </div>
    <div className="edo-hero__label">{label}</div>
    <div className="edo-meter"><i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone }} /></div>
    {sub ? <div className="edo-hero__sub">{sub}</div> : null}
  </div>
);

/**
 * Magnitude across departments.
 *
 * One hue for every bar, on purpose: the bar's length already says how many, and
 * spending a different colour on each department would re-encode that in the one
 * channel reserved for identity — while implying the departments are a palette
 * rather than a list. The largest sets the scale, so the rows stay comparable.
 */
export function RankedBars({ items, max, hrefFor, empty = 'Nothing recorded yet' }) {
  if (!items.length) return <p className="edo-empty">{empty}</p>;
  const top = Math.max(1, max ?? Math.max(...items.map((i) => i.count)));
  return (
    <ul className="edo-rank">
      {items.map((it) => (
        <li key={it.label}>
          <span className="edo-rank__name" title={it.label}>
            {hrefFor ? <Link to={hrefFor(it)}>{it.label}</Link> : it.label}
          </span>
          <span className="edo-rank__num">{it.count}</span>
          <span className="edo-rank__track">
            <i style={{ width: `${(it.count / top) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The dimension the share bar is grouped by. */
export const GroupPicker = ({ value, onChange, options }) => {
  const id = useId();
  return (
    <select id={id} className="form-control edo-picker" value={value}
      onChange={(e) => onChange(e.target.value)} aria-label="Group the staff split by">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
};

// ── Lists ────────────────────────────────────────────────────────────────────

/** The newest arrivals. Only people with a joining date on file can be here. */
export const RecentList = ({ items, base, empty }) => (
  items.length
    ? (
      <ul className="edo-recent">
        {items.map((e) => (
          <li key={e._id}>
            <Avatar name={e.name} src={e.profileImage} size={36} />
            <div className="edo-recent__who">
              <Link to={`${base}/employees/${e._id}`} className="edo-recent__name">{e.name}</Link>
              <span className="edo-recent__role">
                {[e.designation, e.department].filter(Boolean).join(' · ') || 'No designation on file'}
              </span>
            </div>
            <span className="edo-recent__when">{fmtDate(e.joiningDate)}</span>
            <span className={`badge badge-${STATUS_TONE[e.employmentStatus] || 'muted'}`}>
              {STATUS_LABEL[e.employmentStatus] || e.employmentStatus}
            </span>
          </li>
        ))}
      </ul>
    )
    : <p className="edo-empty">{empty}</p>
);

/**
 * The work the directory is asking for.
 *
 * Every row is a real queue with a real count, and every row is a link to the
 * screen that clears it — a number an admin cannot act on does not belong here.
 * Rows at zero stay, greyed: "nothing pending" is the answer to the question.
 */
export const PendingList = ({ items }) => (
  <ul className="edo-pending">
    {items.map((it) => (
      <li key={it.label} className={it.count ? '' : 'is-clear'}>
        <Link to={it.to}>
          <span className={`edo-pending__icon tint-${it.tone}`}>{it.icon}</span>
          <span className="edo-pending__text">
            <span className="edo-pending__label">{it.label}</span>
            <span className="edo-pending__sub">{it.count ? it.sub : 'Nothing pending'}</span>
          </span>
          <span className={`edo-pending__count${it.count ? '' : ' is-zero'}`}>{it.count}</span>
        </Link>
      </li>
    ))}
  </ul>
);

/** The six things an admin comes to this page to start. */
export const ActionGrid = ({ items }) => (
  <div className="edo-actions">
    {items.map((it) => {
      const inner = (
        <>
          <span className={`edo-actions__icon tint-${it.tone}`}>{it.icon}</span>
          <span>{it.label}</span>
        </>
      );
      return it.to
        ? <Link key={it.label} to={it.to} className="edo-actions__tile">{inner}</Link>
        : <button key={it.label} type="button" className="edo-actions__tile" onClick={it.onClick}>{inner}</button>;
    })}
  </div>
);

// ── Table fallback ───────────────────────────────────────────────────────────

/**
 * The same numbers as a table, one disclosure away.
 *
 * Three of the eight categorical hues sit under 3:1 against white. The palette
 * check allows that only with relief, and this is the second half of it: the
 * legend labels every segment, and anyone who still cannot separate the colours
 * can read the figures straight.
 */
export function FigureTable({ caption, rows, total }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="edo-table">
      <button type="button" className="edo-table__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? 'Hide' : 'Show'} the numbers
      </button>
      {open && (
        <table className="table">
          <thead><tr><th>{caption}</th><th>Staff</th><th>Share</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.count}</td>
                <td>{pct(r.count, total)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export { pct };
