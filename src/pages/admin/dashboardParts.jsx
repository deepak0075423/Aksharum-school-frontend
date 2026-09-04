/**
 * The admin dashboard's panels.
 *
 * Kept beside the page rather than in components/ui because every one of them is
 * shaped by this screen's data — a stat tile that knows about month-on-month
 * growth, an attendance panel that knows a day can be unmarked. They follow the
 * same file convention as pages/directory/parts.jsx.
 *
 * Chart colours come from pages/analytics/viz.jsx, whose palette was run through
 * the data-viz validator against this app's light surface. The status greens and
 * reds sit under 3:1 contrast, which obligates *relief* — so every chart here
 * ships the numbers as text beside the mark, never colour alone.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import Icon from '../../components/ui/icons';
import { VIZ } from '../analytics/viz';
import { Panel, PanelLink, RowLink, Note, AttendanceRing } from '../../components/dashboard/parts';

// Re-exported so this page's imports stay in one place.
export { Panel, PanelLink, RowLink, Note, AttendanceRing };

// ── Stat tile ────────────────────────────────────────────────────────────────
/**
 * `delta` is this month's new records. Zero is shown, not hidden: "0 this month"
 * is an answer, and a tile that silently drops its footer makes the row ragged.
 */
export const StatTile = ({ icon, tone, label, value, caption, delta, to }) => {
  const Wrap = to ? Link : 'div';
  return (
    <Wrap {...(to ? { to } : {})} className="stile">
      <div className="stile__top">
        <span className={`stile__icon tint-${tone}`}><Icon name={icon} size={22} /></span>
        <span className="stile__label">{label}</span>
      </div>
      <div className="stile__value">{value ?? '—'}</div>
      <div className="stile__caption">{caption}</div>
      {delta != null && (
        <div className={`stile__delta${delta > 0 ? ' up' : ''}`}>
          {delta > 0
            ? <><Icon name="arrowUp" size={14} />{delta} this month</>
            : <><span className="stile__flat" />No change this month</>}
        </div>
      )}
    </Wrap>
  );
};

// ── Attendance overview ──────────────────────────────────────────────────────
const RANGES = [
  { key: '7',  label: 'This Week' },
  { key: '14', label: 'Last 14 Days' },
  { key: '30', label: 'Last 30 Days' },
];

const dayLabel = (iso, span) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return span <= 7
    ? d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="dtip">
      <div className="dtip__head">
        {new Date(`${d.date}T00:00:00.000Z`).toLocaleDateString('en-IN',
          { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}
      </div>
      {d.marked ? (
        <>
          <div className="dtip__row"><span>Attendance</span><strong>{d.percentage}%</strong></div>
          <div className="dtip__row"><span>Present</span><strong>{d.present}</strong></div>
          {d.late   > 0 && <div className="dtip__row"><span>Late</span><strong>{d.late}</strong></div>}
          <div className="dtip__row"><span>Absent</span><strong>{d.absent}</strong></div>
          <div className="dtip__row"><span>Marked</span><strong>{d.total}</strong></div>
        </>
      ) : (
        <div className="dtip__row dtip__row--muted">Attendance not marked</div>
      )}
    </div>
  );
}

export function AttendanceOverview({ trend = [], today, to }) {
  const [range, setRange] = React.useState('7');
  const span = Number(range);

  // An unmarked day is a gap, not a zero. Plotting it as 0% draws a holiday or a
  // Sunday as a total collapse in attendance; `null` + connectNulls={false}
  // leaves the line broken there, which is what actually happened.
  const rows = React.useMemo(
    () => trend.slice(-span).map(d => ({
      ...d,
      label: dayLabel(d.date, span),
      percentage: d.marked ? d.percentage : null,
    })),
    [trend, span],
  );

  const marked = rows.filter(r => r.marked);
  // The average is over days that were actually marked — folding unmarked days
  // in as 0% would report a holiday week as a collapse in attendance.
  const avg = marked.length
    ? Math.round(marked.reduce((a, r) => a + r.percentage, 0) / marked.length)
    : null;

  return (
    <Panel
      className="dpanel--chart"
      title="Attendance Overview"
      subtitle={avg == null
        ? 'No attendance marked in this period'
        : `${RANGES.find(r => r.key === range).label} · ${avg}% average across ${marked.length} marked ${marked.length === 1 ? 'day' : 'days'}`}
      action={(
        <select className="dselect" value={range} onChange={e => setRange(e.target.value)}
          aria-label="Attendance date range">
          {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      )}
    >
      <div className="attgrid">
        <div className="attgrid__chart">
          {marked.length === 0 ? (
            // A line pinned to 0% would read as "nobody came in"; nothing was
            // recorded, which is a different answer.
            <div className="attgrid__empty">
              <Icon name="checkSquare" size={26} />
              <p>No attendance has been marked in this period.</p>
              <span>Days appear here as sections record them.</span>
            </div>
          ) : (
          <div className="chartbox chartbox--att">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="attFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={VIZ.accent} stopOpacity={0.26} />
                  <stop offset="100%" stopColor={VIZ.accent} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={VIZ.grid} strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false}
                tick={{ fontSize: 11, fill: VIZ.muted }} dy={6}
                interval={span > 14 ? 4 : span > 7 ? 1 : 0} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
                tickFormatter={v => `${v}%`} tickLine={false} axisLine={false}
                tick={{ fontSize: 11, fill: VIZ.muted }} width={44} />
              <Tooltip content={<TrendTooltip />}
                cursor={{ stroke: VIZ.accent, strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Area
                type="monotone" dataKey="percentage" name="Attendance"
                connectNulls={false}
                stroke={VIZ.accent} strokeWidth={2} fill="url(#attFill)"
                // Point markers only while they can be aimed at; across a month
                // they crowd into a dotted rope. The hover layer still answers
                // for every day either way.
                dot={span <= 14 ? { r: 4, fill: '#fff', stroke: VIZ.accent, strokeWidth: 2 } : false}
                activeDot={{ r: 6, fill: VIZ.accent, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
          </div>
          )}
        </div>

        <div className="attgrid__ring">
          <AttendanceRing today={today} />
          {to && <Link to={to} className="dpanel__link attgrid__more">
            Open attendance <Icon name="chevronRight" size={14} />
          </Link>}
        </div>
      </div>
    </Panel>
  );
}

// ── Quick access tile ────────────────────────────────────────────────────────
/**
 * Stacked rather than a row: a module name plus what it does needs two lines,
 * and standing the icon above them fits six across instead of three — which is
 * what makes this a launcher rather than another list.
 */
export const QuickTile = ({ to, icon, tone, label, sub }) => (
  <Link to={to} className="qtile">
    <span className={`qtile__icon tint-${tone}`}><Icon name={icon} size={21} /></span>
    <span className="qtile__label">{label}</span>
    {sub && <span className="qtile__sub">{sub}</span>}
    <Icon name="chevronRight" size={15} className="qtile__chev" />
  </Link>
);
