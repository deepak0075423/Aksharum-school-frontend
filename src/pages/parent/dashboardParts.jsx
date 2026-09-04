/**
 * The parent dashboard's own panels.
 *
 * Everything about the child's marks is shared with the student dashboard
 * (components/dashboard/studentParts) — same numbers, same meaning. What lives
 * here is what only a parent has: choosing between children, and the weekly
 * attendance picture of the one they picked.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import Icon from '../../components/ui/icons';
import { Panel, AttendanceRing } from '../../components/dashboard/parts';
import { VIZ } from '../analytics/viz';

// ── Child picker ─────────────────────────────────────────────────────────────
/**
 * Only rendered for a parent with more than one child at the school. With one
 * child it would be a control with a single option — noise, not a choice.
 */
export const ChildPicker = ({ children = [], value, onChange }) => {
  if (children.length < 2) return null;
  return (
    <div className="pkid" role="group" aria-label="Choose a child">
      {children.map(c => {
        const on = String(c._id) === String(value);
        return (
          <button
            key={c._id}
            type="button"
            className={`pkid__btn${on ? ' on' : ''}`}
            onClick={() => onChange(c._id)}
            aria-pressed={on}
          >
            <span className="pkid__avatar">{(c.name || '?')[0].toUpperCase()}</span>
            <span className="pkid__text">
              <span className="pkid__name">{c.name}</span>
              <span className="pkid__sub">
                {[c.className, c.sectionName].filter(Boolean).join(' — ') || 'No section'}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ── Attendance overview ──────────────────────────────────────────────────────
const RANGES = [
  { key: '4',  label: 'Last 4 Weeks' },
  { key: '8',  label: 'Last 8 Weeks' },
];

const weekLabel = (iso) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

function WeekTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const start = new Date(`${d.weekStart}T00:00:00.000Z`);
  const end   = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  const fmt = (x) => x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <div className="dtip">
      <div className="dtip__head">Week of {fmt(start)} – {fmt(end)}</div>
      {d.marked ? (
        <>
          <div className="dtip__row"><span>Attendance</span><strong>{d.percentage}%</strong></div>
          <div className="dtip__row"><span>Present</span><strong>{d.present}</strong></div>
          <div className="dtip__row"><span>Absent</span><strong>{d.absent}</strong></div>
          <div className="dtip__row"><span>Days marked</span><strong>{d.total}</strong></div>
        </>
      ) : (
        <div className="dtip__row dtip__row--muted">No attendance marked</div>
      )}
    </div>
  );
}

/**
 * Weekly, not daily: on any one day a child is simply present or absent, so a
 * daily line is a square wave between 0% and 100%. A week is the smallest
 * window where "how are they doing" has an answer. Weeks nobody marked are
 * gaps rather than zeros, so a holiday week does not read as an absence.
 */
export function AttendanceOverview({ weeks = [], month, to }) {
  const [range, setRange] = React.useState('4');
  const span = Number(range);

  const rows = React.useMemo(
    () => weeks.slice(-span).map(w => ({
      ...w,
      label: weekLabel(w.weekStart),
      percentage: w.marked ? w.percentage : null,
    })),
    [weeks, span],
  );
  const marked = rows.filter(r => r.marked);

  return (
    <Panel
      className="dpanel--chart"
      title="Attendance Overview"
      subtitle={marked.length
        ? `${marked.length} week${marked.length === 1 ? '' : 's'} recorded`
        : 'No attendance marked in this period'}
      action={(
        <select className="dselect" value={range} onChange={e => setRange(e.target.value)}
          aria-label="Attendance range">
          {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      )}
    >
      <div className="attgrid">
        <div className="attgrid__chart">
          {marked.length === 0 ? (
            <div className="attgrid__empty">
              <Icon name="checkSquare" size={26} />
              <p>No attendance marked yet.</p>
              <span>Weeks appear here as the school records them.</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pAttFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={VIZ.accent} stopOpacity={0.26} />
                    <stop offset="100%" stopColor={VIZ.accent} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={VIZ.grid} strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} dy={6}
                  tick={{ fontSize: 11, fill: VIZ.muted }} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={44}
                  tickFormatter={v => `${v}%`} tickLine={false} axisLine={false}
                  tick={{ fontSize: 11, fill: VIZ.muted }} />
                <Tooltip content={<WeekTooltip />}
                  cursor={{ stroke: VIZ.accent, strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Area
                  type="monotone" dataKey="percentage" name="Attendance"
                  connectNulls={false}
                  stroke={VIZ.accent} strokeWidth={2} fill="url(#pAttFill)"
                  dot={{ r: 4, fill: '#fff', stroke: VIZ.accent, strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: VIZ.accent, stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="attgrid__ring">
          {/* The ring reports the calendar month, which is the figure the
              highlight card above it quotes — the chart beside it is weeks. */}
          <AttendanceRing
            today={month ? { ...month, marked: true } : { marked: false }}
            caption="This Month"
            totalLabel="Days Marked"
          />
          {to && (
            <Link to={to} className="dpanel__link attgrid__more">
              Open attendance <Icon name="chevronRight" size={14} />
            </Link>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ── Wide announcement banner ─────────────────────────────────────────────────
export const AnnouncementBanner = ({ notice, to }) => {
  if (!notice) return null;
  const n = notice.notification || notice;
  return (
    <section className="pann">
      <span className="pann__icon"><Icon name="megaphone" size={22} /></span>
      <div className="pann__body">
        <p className="pann__title">{n.title}</p>
        {n.body && <p className="pann__text">{n.body}</p>}
      </div>
      <Link to={to} className="pann__link">
        View All Announcements <Icon name="arrowRight" size={15} />
      </Link>
    </section>
  );
};
