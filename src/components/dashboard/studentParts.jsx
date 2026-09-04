/**
 * Panels about ONE student's figures.
 *
 * Shared by the student dashboard (about themselves) and the parent dashboard
 * (about their child) — the same numbers with the same meaning, so the same
 * components draw them. Generic shapes (Panel, RowLink, Note) come from
 * ./parts; anything shaped by one screen alone stays in that page's own file.
 *
 * Chart colours come from pages/analytics/viz.jsx, whose palette was validated
 * against this app's light surface. Marks are a magnitude, so the bars are one
 * hue — the status trio is reserved for state and never reused as "series N".
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import Icon, { TrophyScene } from '../ui/icons';
import { Panel } from './parts';
import { VIZ } from '../../pages/analytics/viz';

// ── Highlight card — the three figures the page leads with ───────────────────
/**
 * `meter` draws the value as a share of 100; `delta` is the change on the
 * previous month, shown only when there IS a previous month to compare with.
 */
export const Highlight = ({ icon, tone, label, value, valueTone, sub, meter, delta, to, linkLabel }) => (
  <div className="shl">
    <div className="shl__top">
      <span className={`shl__icon tint-${tone}`}><Icon name={icon} size={22} /></span>
      <span className="shl__label">{label}</span>
    </div>

    <div className={`shl__value${valueTone ? ` shl__value--${valueTone}` : ''}`}>{value}</div>

    {delta != null && (
      <div className={`shl__delta${delta > 0 ? ' up' : delta < 0 ? ' down' : ''}`}>
        {delta === 0
          ? <><span className="stile__flat" />Same as last month</>
          : <><Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} size={13} />
              {Math.abs(delta)}% from last month</>}
      </div>
    )}

    {sub && <div className="shl__sub">{sub}</div>}

    {meter != null && (
      <div className="shl__meter" role="img" aria-label={`${meter}% of 100`}>
        <span style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
      </div>
    )}

    {to && <Link to={to} className="shl__link">{linkLabel} <Icon name="chevronRight" size={14} /></Link>}
  </div>
);

// ── Quick access ─────────────────────────────────────────────────────────────
export const QuickTile = ({ to, icon, tone, label, sub }) => (
  <Link to={to} className={`sqt${sub ? ' sqt--sub' : ''}`}>
    <span className={`sqt__icon tint-${tone}`}><Icon name={icon} size={22} /></span>
    <span className="sqt__label">{label}</span>
    {sub && <span className="sqt__sub">{sub} <Icon name="arrowRight" size={12} /></span>}
    {!sub && <Icon name="chevronRight" size={14} className="sqt__chev" />}
  </Link>
);

// ── Performance over time ────────────────────────────────────────────────────
const TYPE_LABEL = { UNIT_TEST: 'Unit Test', MID_TERM: 'Mid Term', FINAL: 'Final' };

const FILTERS = [
  { key: 'ALL',       label: 'All Exams' },
  { key: 'UNIT_TEST', label: 'Unit Tests' },
  { key: 'MID_TERM',  label: 'Mid Term' },
  { key: 'FINAL',     label: 'Final' },
];

function MarkTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="dtip">
      <div className="dtip__head">{d.title}</div>
      <div className="dtip__row"><span>Score</span><strong>{d.percentage}%</strong></div>
      {d.grade && <div className="dtip__row"><span>Grade</span><strong>{d.grade}</strong></div>}
      <div className="dtip__row"><span>Exam</span><strong>{TYPE_LABEL[d.examType] || d.examType}</strong></div>
      <div className="dtip__row"><span>Held</span><strong>{d.when}</strong></div>
    </div>
  );
}

export function PerformanceOverview({ trend = [], to }) {
  const [filter, setFilter] = React.useState('ALL');

  const rows = React.useMemo(() => (
    trend
      .filter(t => filter === 'ALL' || t.examType === filter)
      .map(t => ({
        ...t,
        label: new Date(t.date).toLocaleDateString('en-IN', { month: 'short' }),
        when:  new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      }))
  ), [trend, filter]);

  const best = rows.length ? Math.max(...rows.map(r => r.percentage)) : null;
  const avg  = rows.length
    ? Math.round(rows.reduce((a, r) => a + r.percentage, 0) / rows.length)
    : null;

  return (
    <Panel
      className="dpanel--chart"
      title="Performance Overview"
      subtitle={rows.length
        ? `${rows.length} exam${rows.length === 1 ? '' : 's'} · ${avg}% average · best ${best}%`
        : 'No published results in this selection'}
      action={(
        <select className="dselect" value={filter} onChange={e => setFilter(e.target.value)}
          aria-label="Filter results by exam type">
          {FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      )}
    >
      {rows.length === 0 ? (
        <div className="attgrid__empty">
          <Icon name="chart" size={26} />
          <p>Nothing published yet.</p>
          <span>Results appear here once your school releases them.</span>
        </div>
      ) : (
        <>
          <div className="chartbox chartbox--perf">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 14, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={VIZ.grid} strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} dy={6}
                tick={{ fontSize: 11, fill: VIZ.muted }} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={44}
                tickFormatter={v => `${v}%`}
                tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: VIZ.muted }} />
              <Tooltip content={<MarkTooltip />}
                cursor={{ stroke: VIZ.accent, strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Line
                type="monotone" dataKey="percentage" name="Score"
                stroke={VIZ.accent} strokeWidth={2}
                dot={{ r: 4, fill: '#fff', stroke: VIZ.accent, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: VIZ.accent, stroke: '#fff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
          {to && (
            <Link to={to} className="dpanel__link sperf__more">
              View detailed report <Icon name="chevronRight" size={14} />
            </Link>
          )}
        </>
      )}
    </Panel>
  );
}

// ── Subject-wise marks ───────────────────────────────────────────────────────
/**
 * Bars, not a donut: this compares magnitudes across subjects. One hue, sorted
 * high to low, with every value written beside its bar — nobody should have to
 * measure a bar against an axis to read their own marks.
 */
export function SubjectMarks({ subjects = [], examTitle, to }) {
  return (
    <Panel
      title="Subject Wise Marks"
      subtitle={examTitle || undefined}
      className="dpanel--subjects"
    >
      {subjects.length === 0 ? (
        <div className="dnote"><Icon name="bookOpen" size={17} />No subject marks published yet.</div>
      ) : (
        <>
          <ul className="sbars">
            {subjects.map(s => (
              <li key={s.name} className="sbar">
                <div className="sbar__head">
                  <span className="sbar__name" title={s.name}>{s.name}</span>
                  <span className="sbar__val">{s.percentage}%</span>
                </div>
                <div className="sbar__track">
                  <span className="sbar__fill" style={{ width: `${Math.max(0, Math.min(100, s.percentage))}%` }} />
                </div>
                <span className="sbar__raw">{s.marksObtained} / {s.maxMarks}{s.grade ? ` · ${s.grade}` : ''}</span>
              </li>
            ))}
          </ul>
          {to && (
            <Link to={to} className="dpanel__link sbars__more">
              View detailed report <Icon name="chevronRight" size={14} />
            </Link>
          )}
        </>
      )}
    </Panel>
  );
}

// ── Encouragement card ───────────────────────────────────────────────────────
/** The one figure worth celebrating, next to the trophy. Real marks only. */
export const ResultHighlight = ({ name, latest, to }) => {
  const pct = latest?.percentage ?? null;
  const line = pct == null ? null
    : pct >= 85 ? 'Outstanding work.'
    : pct >= 70 ? "You're doing great."
    : pct >= 50 ? 'Solid progress — keep going.'
    : 'Every exam is a fresh start.';

  return (
    <div className="scheer">
      <TrophyScene className="scheer__art" />
      <div className="scheer__body">
        <p className="scheer__title">Keep it up, {name}!</p>
        {line && <p className="scheer__sub">{line}</p>}
        {pct != null && (
          <p className="scheer__stat">
            <strong>{pct}%</strong>
            <span>
              in {latest.title}
              {latest.grade ? ` · grade ${latest.grade}` : ''}
              {latest.rank ? ` · rank ${latest.rank}` : ''}
            </span>
          </p>
        )}
        {to && <Link to={to} className="scheer__btn">View All Results</Link>}
      </div>
    </div>
  );
};

// ── Upcoming event row, with the date as a chip ──────────────────────────────
export const EventRow = ({ to, day, month, title, sub, tone = 'indigo' }) => (
  <Link to={to} className="sevent">
    <span className={`sevent__date tint-${tone}`}>
      <strong>{day}</strong>
      <span>{month}</span>
    </span>
    <span className="sevent__text">
      <span className="sevent__title">{title}</span>
      {sub && <span className="sevent__sub">{sub}</span>}
    </span>
    <Icon name="calendarDays" size={17} className="sevent__chev" />
  </Link>
);
