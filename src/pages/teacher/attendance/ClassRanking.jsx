/**
 * Teacher → Attendance → Class Ranking.
 *
 * A section's attendance over a period: today's figures, the class average
 * against the period before, the top three, how the class is spread across
 * attendance bands, and every student ranked.
 *
 * Percentages count marks — Late as attended, a Half-Day as half
 * (services/studentAttendance.js) — so a subject-wise school ranks by subject
 * registers attended, which the "days" / "classes" wording follows.
 */
import React, { useMemo, useRef, useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import { getAttendanceRanking } from '../../../api/teacher.api';
import { Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  Card, Change, Empty, Frame, MenuButton, MenuRow, PillSelect, SoftAvatar, Tile, downloadCsv, num,
} from '../../../components/attendance/parts';

const PERIODS = [
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'this-year',  label: 'This Academic Year' },
];

const SORTS = [
  { value: 'rank',  label: 'Rank' },
  { value: 'name',  label: 'Name' },
  { value: 'roll',  label: 'Roll number' },
  { value: 'low',   label: 'Lowest attendance first' },
];

// Band colours as the mockup draws them. Each bar is also named on the axis and
// carries its count above it, so colour is never the only way to tell them apart.
const BAND = { 95: '#22c55e', 90: '#3b82f6', 80: '#fbbf24', 0: '#ef4444' };
const pctTone = (p) => (p == null ? 'muted' : p >= 90 ? 'green' : p >= 80 ? 'blue' : 'red');
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '0%');

const SUBTITLE = 'Take attendance, track student presence and manage corrections.';

export default function ClassRanking({ tab, onTab, initialSection = '' }) {
  const [period, setPeriod]   = useState('this-month');
  // An attendance alert links here naming the section (?section=) and flags the student (?focus=).
  const [section, setSection] = useState(initialSection);
  const [query, setQuery]     = useState('');
  const [sort, setSort]       = useState('rank');
  const tableRef = useRef(null);

  const { data, loading, error } = useFetch(
    () => getAttendanceRanking({ period, section: section || undefined }), [period, section]);

  const periodLabel = PERIODS.find((p) => p.value === period)?.label || 'This Month';
  const unit = data?.unit || 'days';
  const today = data?.today;
  const vs = data?.period?.previous ? `vs ${period === 'last-month' ? 'the month before' : 'last month'}` : periodLabel;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = (data?.rows || []).filter((r) => !q
      || r.student.name.toLowerCase().includes(q) || String(r.student.rollNumber).toLowerCase().includes(q));
    const roll = (r) => Number.parseFloat(r.student.rollNumber) || Infinity;
    if (sort === 'name') list = [...list].sort((a, b) => a.student.name.localeCompare(b.student.name));
    if (sort === 'roll') list = [...list].sort((a, b) => roll(a) - roll(b));
    if (sort === 'low')  list = [...list].sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101));
    return list;
  }, [data, query, sort]);

  const download = () => downloadCsv(
    `class-ranking-${(data?.section?.label || 'section').replace(/[^\w]+/g, '-').toLowerCase()}-${period}.csv`,
    ['Rank', 'Student', 'Roll No', 'Present', 'Absent', 'Late', 'Half-Day', `Marked ${unit}`, 'Attendance %', 'Trend (points)'],
    (data?.rows || []).map((r) => [r.rank ?? '', r.student.name, r.student.rollNumber, r.present, r.absent, r.late,
      r.halfDay, r.total, r.percentage ?? '', r.trend ?? '']));

  // A teacher holding more than one section chooses which to rank; with one
  // section there is nothing to choose and the header shows only the period.
  const actions = (
    <>
      {(data?.sections || []).length > 1 && (
        <PillSelect icon="building" value={data?.section?._id || ''} onChange={setSection} className="tat-pillselect--head">
          {data.sections.map((s) => <option key={s._id} value={s._id}>{s.label}</option>)}
        </PillSelect>
      )}
      <PillSelect icon="calendar" value={period} onChange={setPeriod} className="tat-pillselect--head">
        {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </PillSelect>
    </>
  );

  if (loading && !data) {
    return <Frame tab={tab} onTab={onTab} actions={actions} subtitle={SUBTITLE}><div className="tat-center"><Spinner /></div></Frame>;
  }

  return (
    <Frame tab={tab} onTab={onTab} actions={actions} subtitle={SUBTITLE}>
      {error ? <Empty icon="alert" title="The ranking could not be loaded">{error}</Empty>
        : !data?.section ? (
          <Empty icon="trophy" title="No class to rank">
            You are not taking attendance for any section this year.
          </Empty>
        ) : (
          <div className={`tat-rankpage${loading ? ' tat-dim' : ''}`}>
            {data.scopeNote ? <p className="tat-scopenote"><Icon name="info" size={15} />{data.scopeNote}</p> : null}
            <div className="tat-tiles tat-tiles--5">
              <Tile layout="card" icon="users" tone="green" value={today?.students ?? 0} label="Total Students" />
              <Tile layout="card" icon="shieldCheck" solid tone="green" value={today?.present ?? 0} label="Present Today"
                caption={today?.marked ? `${pct(today.present, today.students)} Attendance` : 'Not marked yet'}
                captionTone={today?.marked ? 'green' : undefined} />
              <Tile layout="card" icon="users" tone="red" value={today?.absent ?? 0} label="Absent Today"
                caption={today?.marked ? pct(today.absent, today.students) : '—'} captionTone={today?.marked ? 'red' : undefined} />
              <Tile layout="card" icon="gauge" tone="amber" value={today?.late ?? 0} label="Late Today"
                caption={today?.marked ? pct(today.late, today.students) : '—'} captionTone={today?.marked ? 'amber' : undefined}
                title={today?.halfDay ? `${today.halfDay} on a half day today` : undefined} />
              <Tile layout="card" icon="chart" tone="indigo" value={data.average?.value == null ? '—' : `${data.average.value}%`}
                label="Class Average" caption={vs}
                trail={data.period.previous && data.average?.change != null ? <Change value={data.average.change} /> : null} />
            </div>

            <div className="tat-rankgrid">
              <Card className="tat-podiumcard" icon="trophy" iconTone="gold" bareIcon title="Top 3 Students"
                sub={`Based on attendance percentage (${periodLabel})`}
                actions={(
                  <button type="button" className="tat-btn tat-btn--soft"
                    onClick={() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                    View Full Ranking <Icon name="arrowRight" size={16} />
                  </button>
                )}>
                {data.top.length === 0
                  ? <Empty icon="trophy" title="Nothing marked yet">The podium fills as registers are taken this period.</Empty>
                  : <Podium top={data.top} unit={unit} />}
              </Card>

              <Card className="tat-distcard" icon="chart" iconTone="green" bareIcon title="Attendance Distribution"
                sub={`Overview of class attendance (${periodLabel})`}
                actions={<span className="tat-chip">{periodLabel}</span>}>
                <Distribution bands={data.distribution} />
              </Card>
            </div>

            <div ref={tableRef}>
              <Card className="tat-rankcard" icon="listDots" iconTone="indigo" bareIcon title="Complete Class Ranking"
                sub={`Students ranked by attendance percentage (${periodLabel})`}
                actions={(
                  <>
                    <label className="tat-search">
                      <Icon name="search" size={17} />
                      <input value={query} placeholder="Search by name or roll number..." aria-label="Search students"
                        onChange={(e) => setQuery(e.target.value)} />
                    </label>
                    <button type="button" className="tat-btn" onClick={download}><Icon name="download" size={18} /> Download</button>
                    <MenuButton icon="sliders" caret={false} className="tat-iconbtn" align="right" title="Sort">
                      {SORTS.map((s) => (
                        <MenuRow key={s.value} icon={sort === s.value ? 'check' : 'list'} onClick={() => setSort(s.value)}>{s.label}</MenuRow>
                      ))}
                    </MenuButton>
                  </>
                )}>
                {rows.length === 0 ? <Empty icon="users" title={query ? 'No student matches' : 'No students in this section'} /> : (
                  <div className="tat-tablewrap">
                    <table className="tat-table tat-table--rank">
                      <thead>
                        <tr>
                          <th>#</th><th>Student Name</th><th>Roll No</th><th className="num">Present</th>
                          <th className="num">Absent</th><th className="num">Late</th><th className="num">Half-Day</th>
                          <th>Attendance %</th><th>Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.student._id} data-focus-id={r.student._id}>
                            <td><span className={`tat-rank${r.rank && r.rank <= 3 ? ` tat-rank--${r.rank}` : ''}`}>{r.rank ?? '—'}</span></td>
                            <td><span className="tat-who"><SoftAvatar name={r.student.name} src={r.student.photo} size={34} /><b>{r.student.name}</b></span></td>
                            <td>{r.student.rollNumber || '—'}</td>
                            <td className="num">{r.present}</td>
                            <td className="num">{r.absent}</td>
                            <td className="num">{r.late}</td>
                            <td className="num">{r.halfDay}</td>
                            <td>
                              <span className={`tat-pct tat-pct--${pctTone(r.percentage)}`}
                                title={r.total ? `${num(r.attended)} of ${r.total} ${unit} attended` : 'Nothing marked this period'}>
                                {r.percentage == null ? '—' : `${r.percentage}%`}
                              </span>
                            </td>
                            <td>{data.period.previous ? <Change value={r.trend} /> : <span className="tat-muted">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
    </Frame>
  );
}

// ── Podium ───────────────────────────────────────────────────────────────────

const MEDAL = {
  1: { disc: '#f5a300', rim: '#ffcf4d', ribbon: '#e05d44' },
  2: { disc: '#94a3b8', rim: '#cbd5e1', ribbon: '#4f7fe0' },
  3: { disc: '#d9772b', rim: '#f1a468', ribbon: '#4f7fe0' },
};

/** A ribbon medal with the place on it. */
const Medal = ({ place }) => {
  const m = MEDAL[place];
  return (
    <svg className="tat-podium__medal" viewBox="0 0 26 30" aria-hidden>
      <path d="M7 0h5l3 8H10z" fill={m.ribbon} />
      <path d="M19 0h-5l-3 8h5z" fill={m.ribbon} opacity=".8" />
      <circle cx="13" cy="18" r="11" fill={m.rim} />
      <circle cx="13" cy="18" r="8.6" fill={m.disc} />
      <text x="13" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" fontFamily="inherit">{place}</text>
    </svg>
  );
};

const Crown = () => (
  <svg className="tat-podium__crown" viewBox="0 0 34 26" aria-hidden>
    <path d="M3 7.5 10 13 17 3l7 10 7-5.5-3 15.5H6z" fill="#f5b400" stroke="#e39b00" strokeWidth="1.2" strokeLinejoin="round" />
    <rect x="6" y="21" width="22" height="3.5" rx="1.2" fill="#e39b00" />
    <circle cx="17" cy="3" r="2" fill="#ffd54d" /><circle cx="3" cy="7.5" r="1.8" fill="#ffd54d" /><circle cx="31" cy="7.5" r="1.8" fill="#ffd54d" />
  </svg>
);

/** Second, first, third — the first place stands tallest in the middle. */
export function Podium({ top, unit }) {
  const order = [top[1], top[0], top[2]];
  const place = [2, 1, 3];
  return (
    <div className="tat-podium">
      {order.map((r, i) => (r ? (
        <div key={r.student._id} className={`tat-podium__step tat-podium__step--${place[i]}`}>
          <span className="tat-podium__confetti" aria-hidden><i /><i /><i /><i /></span>
          <span className="tat-podium__head">
            {place[i] === 1 && <Crown />}
            <SoftAvatar name={r.student.name} src={r.student.photo} size={60} />
            <Medal place={place[i]} />
          </span>
          <b className="tat-podium__name">{r.student.name}</b>
          <span className="tat-podium__pct">{r.percentage}%</span>
          <span className="tat-podium__cap">Attendance</span>
          <small>({num(r.attended)}/{r.total} {unit})</small>
        </div>
      ) : <div key={`empty-${place[i]}`} className={`tat-podium__step tat-podium__step--${place[i]} is-empty`} />))}
    </div>
  );
}

// ── Distribution ─────────────────────────────────────────────────────────────

/** The axis top: the next even step above the tallest bar, so the tallest bar never touches the frame. */
function axisTop(max) {
  const step = max <= 4 ? 1 : max <= 12 ? 2 : Math.ceil(max / 6 / 5) * 5 || 5;
  return { step, top: Math.max(step, Math.ceil((max + 1) / step) * step) };
}

/**
 * Students per attendance band. Bars sit on one baseline with rounded tops, a
 * count above each, a quiet grid, and a tooltip per bar.
 */
function Distribution({ bands = [] }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(0, ...bands.map((b) => b.count));
  const { step, top } = axisTop(max);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const total = bands.reduce((n, b) => n + b.count, 0);

  return (
    <div className="tat-dist">
      <span className="tat-dist__ylabel">Number of Students</span>
      <div className="tat-dist__plot">
        <div className="tat-dist__grid" aria-hidden>
          {ticks.map((t) => <span key={t} style={{ bottom: `${(t / top) * 100}%` }}><em>{t}</em></span>)}
        </div>
        <div className="tat-dist__bars" role="img"
          aria-label={bands.map((b) => `${b.label}: ${b.count} students`).join('; ')}>
          {bands.map((b) => (
            <div key={b.key} className="tat-dist__col"
              onMouseEnter={() => setHover(b.key)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(b.key)} onBlur={() => setHover(null)} tabIndex={0}>
              <div className="tat-dist__bar" style={{ height: `${(b.count / top) * 100}%`, background: BAND[b.key] }}>
                <b>{b.count}</b>
              </div>
              {hover === b.key && (
                <span className="tat-dist__tip" role="tooltip">
                  <i style={{ background: BAND[b.key] }} />{b.label}<b>{b.count} of {total} students</b>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="tat-dist__xlabels">{bands.map((b) => <span key={b.key}>{b.label}</span>)}</div>
      <span className="tat-dist__xtitle">Attendance Percentage</span>
    </div>
  );
}
