/**
 * The teacher dashboard's own panels.
 *
 * A teacher's day is a list of periods, so that is what this file is mostly
 * about. Generic shapes (Panel, RowLink, Note) come from
 * components/dashboard/parts.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, Cell,
} from 'recharts';
import Icon from '../../components/ui/icons';
import { Panel } from '../../components/dashboard/parts';
import { VIZ } from '../analytics/viz';

/** "09:00" → "9:00 AM". Times are stored as plain HH:MM strings. */
export function pretty(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const ampm = h < 12 ? 'AM' : 'PM';
  const hr   = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m || 0).padStart(2, '0')} ${ampm}`;
}

/** Minutes since midnight, for deciding which period is running. */
const mins = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return Number.isNaN(h) ? null : h * 60 + (m || 0);
};

/**
 * Today's teaching, in order — the teacher's own periods and any they are
 * covering for an absent colleague, merged into one list.
 *
 * Cover periods are flagged rather than hidden: they are the ones a teacher is
 * most likely to forget, because they are not on their own timetable.
 */
export function TodaySchedule({ periods = [], substitutions = [], to }) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const rows = React.useMemo(() => {
    const own = periods.map(p => ({ ...p, cover: false }));
    const sub = substitutions.map(p => ({ ...p, cover: true }));
    return [...own, ...sub].sort((a, b) => (a.periodNumber || 0) - (b.periodNumber || 0));
  }, [periods, substitutions]);

  // The period happening right now, so the list answers "where am I supposed
  // to be" without the reader doing arithmetic against the clock.
  const currentIndex = rows.findIndex(r => {
    const s = mins(r.startTime); const e = mins(r.endTime);
    return s != null && e != null && nowMins >= s && nowMins < e;
  });

  return (
    <Panel
      title="Today's Classes"
      subtitle={rows.length
        ? `${rows.length} period${rows.length === 1 ? '' : 's'}${
            substitutions.length ? ` · ${substitutions.length} covering` : ''}`
        : undefined}
      action={to && <Link to={to} className="dpanel__link">Full timetable</Link>}
    >
      {rows.length === 0 ? (
        <div className="dnote"><Icon name="clock" size={17} />No classes scheduled for today.</div>
      ) : (
        <ul className="tsched">
          {rows.map((p, i) => (
            <li key={`${p.cover ? 's' : 'p'}-${p.periodNumber}-${i}`}
              className={`tsched__row${i === currentIndex ? ' now' : ''}`}>
              <span className="tsched__slot">
                <strong>P{p.periodNumber}</strong>
                {p.startTime && <span>{pretty(p.startTime)}</span>}
              </span>
              <span className="tsched__body">
                <span className="tsched__subject">
                  {p.subject || 'Class'}
                  {p.cover && <span className="tsched__tag">Covering</span>}
                  {i === currentIndex && <span className="tsched__tag tsched__tag--now">Now</span>}
                </span>
                {/* Built from whatever is actually known. A timetable whose
                    section has since been deleted has no name to show, and
                    printing the word "Section" there would be worse than
                    printing nothing. */}
                {(() => {
                  const where = [
                    [p.className, p.section].filter(Boolean).join(' — '),
                    p.endTime ? `until ${pretty(p.endTime)}` : '',
                  ].filter(Boolean).join(' · ');
                  return where ? <span className="tsched__where">{where}</span> : null;
                })()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** The section a class teacher owns, with the way into it. */
export const SectionCard = ({ section, to }) => {
  if (!section) return null;
  return (
    <Link to={to} className="tsection">
      <span className="tsection__icon"><Icon name="building" size={22} /></span>
      <span className="tsection__body">
        <span className="tsection__cap">My Section</span>
        <span className="tsection__name">
          {[section.className, section.sectionName].filter(Boolean).join(' — ') || section.sectionName}
        </span>
        <span className="tsection__sub">
          {section.studentCount} student{section.studentCount === 1 ? '' : 's'} in your care
        </span>
      </span>
      <Icon name="chevronRight" size={16} className="tsection__chev" />
    </Link>
  );
};

// ── Student performance across the classes this teacher takes ────────────────
function ClassTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="dtip">
      <div className="dtip__head">{d.full}</div>
      <div className="dtip__row"><span>Class average</span><strong>{d.percentage}%</strong></div>
      <div className="dtip__row"><span>Students</span><strong>{d.students}</strong></div>
      {d.examTitle && <div className="dtip__row"><span>Exam</span><strong>{d.examTitle}</strong></div>}
    </div>
  );
}

/**
 * Columns, one hue: this compares magnitude across classes, which is the job a
 * bar does. The status trio stays reserved for state and is never spent on
 * "class 4" — the weakest class is found by reading the axis, not by hunting
 * for a red bar.
 *
 * Every column is labelled, because with a handful of classes the number IS the
 * point and nobody should measure a bar against a gridline to get it.
 */
export function ClassPerformance({ classes = [], to }) {
  const rows = React.useMemo(() => classes.map(c => ({
    ...c,
    label: c.className || c.sectionName || 'Class',
    full:  [c.className, c.sectionName].filter(Boolean).join(' — ') || 'Class',
  })), [classes]);

  const avg = rows.length
    ? Math.round(rows.reduce((a, r) => a + r.percentage, 0) / rows.length)
    : null;

  return (
    <Panel
      className="dpanel--chart"
      title="Student Performance"
      subtitle={rows.length
        ? `My classes · ${avg}% average across ${rows.length} ${rows.length === 1 ? 'class' : 'classes'}`
        : undefined}
      action={to && <Link to={to} className="dpanel__link">View details</Link>}
    >
      {rows.length === 0 ? (
        <div className="attgrid__empty">
          <Icon name="chart" size={26} />
          <p>No published results yet.</p>
          <span>Class averages appear once an exam is released.</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={252}>
          <BarChart data={rows} margin={{ top: 26, right: 12, left: 0, bottom: 0 }}
            barCategoryGap="28%">
            <defs>
              <linearGradient id="tClassBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={VIZ.accent} stopOpacity={0.95} />
                <stop offset="100%" stopColor={VIZ.accent} stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={VIZ.grid} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} dy={6}
              tick={{ fontSize: 11, fill: VIZ.muted }} interval={0} />
            <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} width={40}
              tickFormatter={v => `${v}%`} tickLine={false} axisLine={false}
              tick={{ fontSize: 11, fill: VIZ.muted }} />
            <Tooltip content={<ClassTooltip />} cursor={{ fill: 'rgba(79,70,229,.06)' }} />
            <Bar dataKey="percentage" name="Class average" radius={[6, 6, 0, 0]} maxBarSize={54}>
              {rows.map(r => <Cell key={r.sectionId} fill="url(#tClassBar)" />)}
              <LabelList dataKey="percentage" position="top" offset={9}
                formatter={v => `${v}%`}
                style={{ fontSize: 12, fontWeight: 700, fill: VIZ.ink }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
