/**
 * The pieces of the Student Analytics landing page.
 *
 * One rule shapes all of it: the payload carries **distributions and
 * shortlists, not time series** — attendance arrives as four bands and a
 * "lowest" list, results as an average with toppers and strugglers, fees as
 * collected against outstanding. So the panels here are part-to-whole bars and
 * ranked lists, which is what that data is. A monthly line would have to be
 * invented, and an invented line is worse than no chart.
 *
 * Colours come from the module's validated palette (./palette): the ordered
 * attendance bands use the single-hue ramp, and anything carrying a status
 * meaning uses the status trio with its label and its number beside it — those
 * three sit under 3:1 against the page, which obligates that relief.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Badge } from '../../components/ui/index';
import { VIZ, toneColor, toneForPercent } from './palette';
import { fmtMoney } from './viz';

// ── Frame ────────────────────────────────────────────────────────────────────

export const Crumbs = ({ home = '/admin/dashboard' }) => (
  <div className="breadcrumb">
    <Link to={home}>Dashboard</Link>
    <span aria-hidden>›</span>
    <span>Student Analytics</span>
  </div>
);

export const Hero = ({ scope, sections }) => (
  <header className="anhero">
    <div className="anhero__id">
      <h1>Student Analytics</h1>
      <p>
        {scope?.canSeeAll
          ? 'Every student in the school — attendance, results, fees and engagement in one place.'
          : `The ${sections} section${sections === 1 ? '' : 's'} you teach — attendance, results and engagement for the students in them.`}
      </p>
    </div>
    {scope?.academicYear && (
      <div className="anhero__year">
        <Icon name="calendar" size={15} />
        <span><small>Academic year</small><b>{scope.academicYear.yearName}</b></span>
      </div>
    )}
  </header>
);

// ── Tiles ────────────────────────────────────────────────────────────────────

/**
 * A headline figure.
 *
 * `value` is deliberately allowed to be null: "no attendance marked yet" is a
 * different answer from 0%, and a tile that prints 0 for the first would have
 * every reader believe the school never turned up.
 */
export const Tile = ({ icon, tone, value, unit, label, caption, empty }) => (
  <div className="antile">
    <span className={`antile__icon tint-${tone}`}><Icon name={icon} size={22} /></span>
    <div className="antile__body">
      {value == null
        ? <span className="antile__none">{empty || 'No data yet'}</span>
        : <span className="antile__value">{value}{unit ? <small>{unit}</small> : null}</span>}
      <span className="antile__label">{label}</span>
      {caption ? <span className="antile__cap">{caption}</span> : null}
    </div>
  </div>
);

// ── Panels ───────────────────────────────────────────────────────────────────

export const Panel = ({ icon, tone = 'indigo', title, subtitle, to, children }) => (
  <section className="card anpanel">
    <header className="anpanel__head">
      <span className={`anpanel__icon tint-${tone}`}><Icon name={icon} size={18} /></span>
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {to ? <Link to={to}>View <Icon name="chevronRight" size={14} /></Link> : null}
    </header>
    <div className="anpanel__body">{children}</div>
  </section>
);

/** Nothing recorded is not zero — say which one it is. */
export const NoData = ({ icon, title, hint }) => (
  <div className="annone">
    <Icon name={icon} size={24} />
    <p>{title}</p>
    <span>{hint}</span>
  </div>
);

/**
 * A part-to-whole bar with every segment named and counted.
 *
 * A 2px gap between segments rather than a border: the surface showing through
 * separates two fills without introducing a third colour.
 */
export const Split = ({ segments }) => {
  const total = segments.reduce((n, s) => n + (s.value || 0), 0);
  if (!total) return null;
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div className="ansplit">
      <div className="ansplit__bar">
        {shown.map((s) => (
          <span key={s.label} style={{ flex: s.value, background: s.color }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <ul className="ansplit__key">
        {segments.map((s) => (
          <li key={s.label}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{s.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** A ranked shortlist — names carry the meaning, so this is a list, not a chart. */
export const RankList = ({ rows, base, value, tone, empty = 'Nothing to show.' }) => {
  if (!rows?.length) return <p className="anmuted">{empty}</p>;
  return (
    <ol className="anrank">
      {rows.map((r) => (
        <li key={r._id}>
          <Link to={`${base}/${r._id}`}>
            <span className="anrank__name">{r.name}</span>
            <span className="anrank__where">{r.className} {r.sectionName}</span>
          </Link>
          <b style={{ color: toneColor[tone(r)] }}>{value(r)}</b>
        </li>
      ))}
    </ol>
  );
};

// ── The roster ───────────────────────────────────────────────────────────────

export const StudentCell = ({ row: r, base }) => (
  <Link to={`${base}/${r._id}`} className="anwho">
    <span className="anwho__mark">{(r.name || '?').charAt(0).toUpperCase()}</span>
    <span style={{ minWidth: 0 }}>
      <span className="anwho__name">{r.name}</span>
      <span className="anwho__sub">{r.admissionNumber || r.email || 'No admission number'}</span>
    </span>
  </Link>
);

/**
 * A percentage with its bar.
 *
 * `null` means not measured — an unmarked register or an unassessed student —
 * and reads as such rather than as a zero, which would be a different claim.
 */
export const PercentCell = ({ value, sub, empty = '—' }) => {
  if (value == null) return <span className="ed-none">{empty}</span>;
  const tone = toneForPercent(value);
  return (
    <div className="anpc">
      <div className="anpc__top">
        <b style={{ color: toneColor[tone] }}>{value}%</b>
        {sub ? <small>{sub}</small> : null}
      </div>
      <div className="anpc__bar">
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: toneColor[tone] }} />
      </div>
    </div>
  );
};

export const FeeCell = ({ row: r }) => (
  r.feeBalance > 0
    ? <Badge variant="danger">{fmtMoney(r.feeBalance)} due</Badge>
    : <Badge variant="success">Clear</Badge>
);

export const LibraryCell = ({ row: r }) => {
  if (!r.booksOut) return <span className="ed-none">—</span>;
  return (
    <span className="anlib">
      <b>{r.booksOut}</b> out
      {r.booksOverdue ? <em style={{ color: VIZ.bad }}>{r.booksOverdue} overdue</em> : null}
    </span>
  );
};

// ── Filters ──────────────────────────────────────────────────────────────────

export const Chip = ({ label, onClear }) => (
  <span className="anchip">
    {label}
    <button type="button" onClick={onClear} aria-label={`Remove ${label}`}>
      <Icon name="close" size={12} />
    </button>
  </span>
);
