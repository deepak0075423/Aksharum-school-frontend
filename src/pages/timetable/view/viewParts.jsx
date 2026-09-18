/**
 * The week, as the people who attend it read it.
 *
 * Students, parents and teachers all look at the same object — a grid of
 * periods across days — but for three different reasons: "where do I go next",
 * "what is my child doing today", "which classes am I taking". One kit, three
 * screens, so a change to how a period is drawn lands in all three.
 *
 * Everything here is presentational. Which cell belongs where is decided by the
 * `cellFor(day, periodNumber)` the screen passes in: the three roles fill a cell
 * from different payloads, and a component that knew about all three would be a
 * worse version of three components.
 */
import React, { useMemo } from 'react';
import Icon from '../../../components/ui/icons';
import {
  Chip, Note, Panel, KV, Bar, plural, timeRange, toMinutes, duration,
  toneFor, TONE_BG, TONE_INK,
} from '../admin/ttUI';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};

/** Today's weekday name, in the same vocabulary the timetable uses. */
export const todayName = () => DAYS[(new Date().getDay() + 6) % 7];

/** Minutes since midnight, local time — what "is this period on now" compares. */
export const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

export const isTeachingPeriod = (p) => !p.isRecess && (p.periodType || 'Teaching') === 'Teaching';

/** The period rows a grid should draw, ordered by the clock where it can be. */
export function orderPeriods(periods) {
  return [...(periods || [])].sort((a, b) => {
    const at = toMinutes(a.startTime);
    const bt = toMinutes(b.startTime);
    if (at != null && bt != null && at !== bt) return at - bt;
    return (a.periodNumber || 99) - (b.periodNumber || 99);
  });
}

/**
 * Where the day has got to: the period running now and the one after it.
 *
 * Returns nulls outside school hours rather than guessing — "next: Monday
 * period 1" on a Saturday evening is noise dressed up as help.
 */
export function useNowNext(periods, day) {
  return useMemo(() => {
    if (day !== todayName()) return { current: null, next: null, done: false };
    const now = nowMinutes();
    const rows = orderPeriods(periods).filter((p) => toMinutes(p.startTime) != null);
    if (!rows.length) return { current: null, next: null, done: false };

    const current = rows.find((p) => {
      const a = toMinutes(p.startTime);
      const b = toMinutes(p.endTime);
      return a != null && b != null && now >= a && now < b;
    }) || null;
    const next = rows.find((p) => toMinutes(p.startTime) > now) || null;
    const last = rows[rows.length - 1];
    return { current, next, done: !current && !next && now >= (toMinutes(last.endTime) ?? 0) };
  }, [periods, day]);
}

/* ══════════════════════════════════════════════════════════════════════════
   One period, drawn
══════════════════════════════════════════════════════════════════════════ */

/**
 * cell: { title, sub, extras[], tone, cover, keepSub }
 *
 * `cover` is { from, to } — who the period belongs to, and who is actually
 * taking it. "Who should have been here" is exactly what a parent asks when
 * they hear a different name at the school gate, so the original is kept and
 * struck through rather than replaced.
 *
 * `keepSub` decides whether the cover line REPLACES the line under the title or
 * sits beneath it. For a student the line under the title IS the teacher, so
 * the cover replaces it; for a teacher it is the class they are taking, which a
 * cover must not delete — that read as a lesson with no class attached.
 */
export const CoverShape = (from, to) => ({ from: from || '', to: to || '' });

export function PeriodCell({ cell, compact }) {
  if (!cell) {
    return <div className="tt-cell"><span className="tt-cell__empty">Free</span></div>;
  }
  const tone = cell.tone || toneFor(cell.title);
  const showSub = cell.sub && (!cell.cover || cell.keepSub);
  return (
    <div className={`tt-cell is-set${cell.cover ? ' tt-cell--cover' : ''}`}
      style={{ background: TONE_BG[tone], borderColor: `${TONE_INK[tone]}55`, color: TONE_INK[tone] }}>
      <span className="tt-cell__subject">{cell.title}</span>
      {showSub && <span className="tt-cell__teacher">{cell.sub}</span>}
      {cell.cover && (
        <span className="tt-cell__teacher">
          {cell.cover.from && <s style={{ opacity: .55 }}>{cell.cover.from}</s>}
          {cell.cover.from ? ' → ' : ''}
          <strong>{cell.cover.to || 'cover to be arranged'}</strong>
        </span>
      )}
      {!compact && (cell.extras || []).map((x, i) => (
        <span key={i} className="tt-cell__extra">{x}</span>
      ))}
      {cell.cover && <span className="tt-cell__flag">Cover</span>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The week
══════════════════════════════════════════════════════════════════════════ */

export function WeekGrid({ periods, days, cellFor, highlightDay }) {
  const rows = orderPeriods(periods);
  const cols = DAYS.filter((d) => days.includes(d));
  const today = todayName();

  if (!rows.length || !cols.length) return null;

  return (
    <div className="tt-tablewrap">
      <table className="tt-week">
        <thead>
          <tr>
            <th>Period</th>
            <th style={{ width: 104 }}>Time</th>
            {cols.map((d) => (
              <th key={d} className={highlightDay && d === today ? 'is-today' : undefined}>
                {DAY_SHORT[d]}
                {d === today && <span className="tt-week__today">Today</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (isTeachingPeriod(p) ? (
            <tr key={`p${p.periodNumber}-${i}`}>
              <td className="tt-week__rowhead"><span className="tt-period">{p.periodNumber}</span></td>
              <td className="tt-week__rowhead"><small>{timeRange(p.startTime, p.endTime)}</small></td>
              {cols.map((d) => (
                <td key={d} className={highlightDay && d === today ? 'is-today' : undefined}>
                  <PeriodCell cell={cellFor(d, p.periodNumber)} />
                </td>
              ))}
            </tr>
          ) : (
            <tr key={`b${i}`}>
              <td className="tt-week__rowhead tt-week__break-head"><Icon name="clock" size={16} /></td>
              <td className="tt-week__break">{timeRange(p.startTime, p.endTime)}</td>
              <td className="tt-week__break" colSpan={cols.length}>
                {p.recessName || p.label || p.periodType || 'Break'}
              </td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   One day, as a list
══════════════════════════════════════════════════════════════════════════ */

export function DayList({ periods, day, cellFor, showNow }) {
  const rows = orderPeriods(periods);
  const { current } = useNowNext(periods, day);
  const isToday = day === todayName();

  if (!rows.length) {
    return <Note tone="quiet">No periods are set up for {day}.</Note>;
  }

  return (
    <div className="tt-daylist">
      {rows.map((p, i) => {
        if (!isTeachingPeriod(p)) {
          return (
            <div key={`b${i}`} className="tt-dayrow tt-dayrow--break">
              <span className="tt-dayrow__time">{timeRange(p.startTime, p.endTime)}</span>
              <span className="tt-dayrow__break">
                <Icon name="clock" size={15} />{p.recessName || p.label || 'Break'}
              </span>
            </div>
          );
        }
        const cell = cellFor(day, p.periodNumber);
        const on = showNow && isToday && current && current.periodNumber === p.periodNumber;
        const tone = cell ? (cell.tone || toneFor(cell.title)) : 'slate';
        return (
          <div key={`p${p.periodNumber}-${i}`} className={`tt-dayrow${on ? ' is-now' : ''}`}>
            <span className="tt-period">{p.periodNumber}</span>
            <span className="tt-dayrow__time">{timeRange(p.startTime, p.endTime)}</span>
            <span className="tt-dayrow__body">
              {cell ? (
                <>
                  <Chip tone={tone}>{cell.title}</Chip>
                  <span className="tt-dayrow__sub">
                    {cell.sub && (!cell.cover || cell.keepSub) ? cell.sub : null}
                    {cell.sub && (!cell.cover || cell.keepSub) && cell.cover ? ' · ' : ''}
                    {cell.cover && (
                      <>
                        {cell.cover.from && <s style={{ opacity: .55 }}>{cell.cover.from}</s>}
                        {cell.cover.from ? ' → ' : ''}
                        <strong>{cell.cover.to || 'cover to be arranged'}</strong>
                      </>
                    )}
                  </span>
                </>
              ) : <span className="tt-dayrow__sub">Free period</span>}
            </span>
            {cell?.cover && <Chip tone="amber">Cover</Chip>}
            {on && <Chip tone="green" dot>Now</Chip>}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   What is on now
══════════════════════════════════════════════════════════════════════════ */

/**
 * The single most useful line on a timetable: what is happening right now, and
 * what comes after it. Only ever shown for today — on any other day the whole
 * grid below is the answer.
 */
export function NowNext({ periods, days, cellFor, label = 'you' }) {
  const day = todayName();
  const { current, next, done } = useNowNext(periods, day);
  const isSchoolDay = days.includes(day);

  if (!isSchoolDay) {
    return (
      <div className="tt-now tt-now--rest">
        <span className="tt-now__icon"><Icon name="sun" size={22} /></span>
        <div>
          <strong>No school today</strong>
          <span>{day} is not a working day. The week below is what runs.</span>
        </div>
      </div>
    );
  }
  if (done) {
    return (
      <div className="tt-now tt-now--rest">
        <span className="tt-now__icon"><Icon name="checkCircle" size={22} /></span>
        <div>
          <strong>That’s the day done</strong>
          <span>Every period for {day} has finished.</span>
        </div>
      </div>
    );
  }

  const cur = current ? cellFor(day, current.periodNumber) : null;
  const nxt = next ? cellFor(day, next.periodNumber) : null;

  return (
    <div className="tt-now">
      <span className="tt-now__icon"><Icon name="clock" size={22} /></span>
      <div className="tt-now__body">
        <div className="tt-now__slot">
          <span className="tt-now__cap">Now</span>
          {current ? (
            cur
              ? <><strong>{cur.title}</strong><span>{cur.sub} · {timeRange(current.startTime, current.endTime)}</span></>
              : <><strong>Free period</strong><span>{timeRange(current.startTime, current.endTime)}</span></>
          ) : <><strong>Between periods</strong><span>Nothing running this minute</span></>}
        </div>
        <div className="tt-now__slot">
          <span className="tt-now__cap">Next</span>
          {next ? (
            nxt
              ? <><strong>{nxt.title}</strong><span>{nxt.sub} · {timeRange(next.startTime, next.endTime)}</span></>
              : <><strong>Free period</strong><span>{timeRange(next.startTime, next.endTime)}</span></>
          ) : <><strong>Nothing left</strong><span>{label === 'you' ? 'You are' : `${label} is`} done for the day</span></>}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Subjects, and who teaches them
══════════════════════════════════════════════════════════════════════════ */

/** rows: [{ key, name, sub, periods }] — sorted by how much of the week they take. */
export function SubjectList({ rows, total, emptyText = 'Nothing timetabled yet.' }) {
  if (!rows.length) return <Note tone="quiet">{emptyText}</Note>;
  const max = Math.max(...rows.map((r) => r.periods), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => {
        const tone = toneFor(r.key || r.name);
        return (
          <div key={r.key || r.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: TONE_INK[tone], flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '.85rem', fontWeight: 600 }}>{r.name}</span>
              {r.sub && (
                <span style={{ display: 'block', fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.sub}</span>
              )}
            </span>
            <Bar value={r.periods} max={max} showPct={false} width={54} tone="good" />
            <Chip tone={tone}>{r.periods}{total ? `/${total}` : ''}</Chip>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Covers
══════════════════════════════════════════════════════════════════════════ */

/** rows: shaped by the server's teacherCoverWeek / coversForSections. */
export function CoverList({ rows, mode, emptyText }) {
  if (!rows.length) return <Note tone="quiet">{emptyText}</Note>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => (
        <div key={r._id} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        }}>
          <span className="tt-period">{r.periodNumber}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '.84rem', fontWeight: 600 }}>
              {r.sectionLabel || r.section} · {r.subject || 'Subject'}
            </span>
            <span style={{ display: 'block', fontSize: '.74rem', color: 'var(--text-muted)' }}>
              {r.date} · {timeRange(r.startTime, r.endTime)}
              {mode === 'duty'
                ? r.originalTeacher ? ` · for ${r.originalTeacher}` : ''
                : r.substituteTeacher ? ` · ${r.substituteTeacher} is taking it` : ' · nobody assigned yet'}
            </span>
          </span>
          <Chip tone={r.status === 'assigned' ? 'green' : 'amber'} dot>
            {r.status === 'assigned' ? 'Confirmed' : 'Open'}
          </Chip>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Shared arithmetic
══════════════════════════════════════════════════════════════════════════ */

/** How the week is shaped: teaching slots, filled slots, minutes taught. */
export function weekShape(periods, days, filledCount) {
  const teaching = (periods || []).filter(isTeachingPeriod);
  const cols = DAYS.filter((d) => (days || []).includes(d));
  const slots = teaching.length * cols.length;
  let taught = 0;
  let broken = 0;
  for (const p of periods || []) {
    const a = toMinutes(p.startTime);
    const b = toMinutes(p.endTime);
    if (a == null || b == null || b <= a) continue;
    if (isTeachingPeriod(p)) taught += b - a; else broken += b - a;
  }
  return {
    perDay: teaching.length,
    days: cols.length,
    slots,
    filled: filledCount,
    free: Math.max(0, slots - filledCount),
    taughtLabel: duration(taught),
    breakLabel: duration(broken),
    dayLabel: periods?.length
      ? timeRange(orderPeriods(periods)[0]?.startTime, orderPeriods(periods).slice(-1)[0]?.endTime)
      : '—',
  };
}

/** A cover index keyed the way a grid looks one up. */
export function coverIndex(covers) {
  const byDay = new Map();
  for (const c of covers || []) byDay.set(`${c.dayOfWeek}#${c.periodNumber}`, c);
  return byDay;
}
