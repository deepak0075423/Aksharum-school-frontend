/**
 * Timetable Reports — everything except the Overview tab.
 *
 * All seven tabs read the LIVE published week, not a draft: these answer "what
 * is actually happening", and a report drawn from an unpublished version would
 * describe a school that does not exist yet.
 *
 * Each tab owns its fetch. A screen with seven tabs that loaded all seven up
 * front would spend a second and a half producing six tables nobody looked at.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { Button } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  Card, Body, Panel, KV, Chip, Note, Person, Bar, Stats, Stat, Search, Pick, Filters,
  Loading, Pager, Donut, Pie, Columns, Legend, Rank, plural, pct, toneFor,
  TONE_INK, TONE_BG,
} from './ttUI';
import { DAY_SHORT } from './shared';

const unwrap = (res) => res?.data ?? res;
const PAGE = 12;

/** Every tab loads the same way: one call, one payload, one error message. */
function useReport(fetcher, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(unwrap(await fetcher())); }
    catch (e) { toast.error(e?.data?.message || e.message); setData(null); }
    finally { setLoading(false); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

/** A week's worth of per-day counts, as a row of small bars. */
function DaySpread({ byDay, days }) {
  const max = Math.max(1, ...days.map((d) => byDay[d] || 0));
  return (
    <span style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 24 }}>
      {days.map((d) => {
        const n = byDay[d] || 0;
        return (
          <span key={d} title={`${d}: ${plural(n, 'period')}`} style={{
            width: 9, height: `${Math.max(3, (n / max) * 24)}px`, borderRadius: 2,
            background: n ? 'var(--primary)' : 'var(--border)',
          }} />
        );
      })}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Teaching Load
══════════════════════════════════════════════════════════════════════════ */

export function TeachingLoadTab({ yearId, onRows }) {
  const { data, loading } = useReport(() => api.getTeacherWorkload(yearId || undefined), [yearId]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const days = data?.days || [];
  const rows = useMemo(() => (data?.teachers || []).filter((t) => !q
    || t.name.toLowerCase().includes(q.toLowerCase())
    || t.bySubject.some((s) => s.subjectName.toLowerCase().includes(q.toLowerCase()))), [data, q]);

  useEffect(() => {
    onRows(() => [
      ['Teacher', 'Periods', 'Cap', 'Free', 'Sections', 'Heaviest day', 'Subjects'],
      ...rows.map((r) => [r.name, r.periods, r.cap || '', r.freePeriods, r.sections,
        r.busiestDay, r.bySubject.map((s) => `${s.subjectName} ${s.periods}`).join(' / ')]),
    ]);
  }, [rows, onRows]);

  if (loading) return <Card><Loading label="Adding up the week…" /></Card>;
  if (!data) return <Card><Body><Note tone="warn">Nothing to report on yet.</Note></Body></Card>;

  const s = data.summary;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <>
      <Stats cols={5}>
        <Stat icon="users" tone="indigo" value={s.teaching} label="Teaching" cap="have at least one period" />
        <Stat icon="userCircle" tone="slate" value={s.idle} label="Nothing timetabled" />
        <Stat icon="chart" tone="blue" value={`${s.average}`} label="Average load" cap="periods a week" />
        <Stat icon="arrowUp" tone="amber" value={s.busiest} label="Busiest" cap="periods a week" />
        <Stat icon="alert" tone="red" value={s.overCap} label="Over their cap" />
      </Stats>

      <Card flush>
        <Filters>
          <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search teachers or subjects…" />
        </Filters>
        <div className="tt-tablewrap">
          <table className="tt-table">
            <thead>
              <tr>
                <th>Teacher</th><th>Periods</th><th>Free</th><th>Sections</th>
                <th>Heaviest day</th><th>Across the week</th><th>Subjects</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r._id}>
                  <td><Person name={r.name} /></td>
                  <td>
                    <strong className={r.overCap ? '' : undefined}
                      style={{ color: r.overCap ? 'var(--danger)' : 'inherit' }}>
                      {r.periods}
                    </strong>
                    {r.cap > 0 && <span className="tt-table__muted"> / {r.cap}</span>}
                  </td>
                  <td className="tt-num">{r.freePeriods}</td>
                  <td className="tt-num">{r.sections}</td>
                  <td>{r.busiestDay ? <Chip tone="indigo">{DAY_SHORT[r.busiestDay] || r.busiestDay}</Chip>
                    : <span className="tt-table__muted">—</span>}</td>
                  <td><DaySpread byDay={r.byDay} days={days} /></td>
                  <td>
                    <span className="tt-chiprow">
                      {r.bySubject.slice(0, 3).map((x) => (
                        <Chip key={x.subjectName} tone={toneFor(x.subjectName)}>
                          {x.subjectName} {x.periods}
                        </Chip>
                      ))}
                      {r.bySubject.length > 3 && <Chip tone="slate">+{r.bySubject.length - 3}</Chip>}
                      {!r.bySubject.length && <span className="tt-table__muted">—</span>}
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={7}>
                  <div className="tt-table__empty">
                    <strong>Nothing published yet</strong>
                    <span>Publish a timetable and every teacher’s load appears here.</span>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="tt-card__foot">
          <span className="tt-count">{plural(rows.length, 'teacher')}</span>
          <Pager page={page} pages={pages} onPage={setPage} />
        </div>
      </Card>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Room Use
══════════════════════════════════════════════════════════════════════════ */

export function RoomUseTab({ yearId, onRows }) {
  const { data, loading } = useReport(() => api.getRoomUtilisation(yearId || undefined), [yearId]);
  const [q, setQ] = useState('');

  const rows = useMemo(() => (data?.rooms || []).filter((r) => !q
    || `${r.roomName} ${r.roomType}`.toLowerCase().includes(q.toLowerCase())), [data, q]);

  useEffect(() => {
    onRows(() => [
      ['Room', 'Type', 'Periods used', 'Free', 'Utilisation %', 'Sections'],
      ...rows.map((r) => [r.roomName, r.roomType, r.periods, r.freeSlots, r.utilisation, r.sections]),
    ]);
  }, [rows, onRows]);

  if (loading) return <Card><Loading label="Measuring the rooms…" /></Card>;
  if (!data) return <Card><Body><Note tone="warn">Nothing to report on yet.</Note></Body></Card>;

  const s = data.summary;
  return (
    <>
      <Stats cols={4}>
        <Stat icon="building" tone="indigo" value={s.total} label="Rooms" />
        <Stat icon="checkCircle" tone="green" value={s.used} label="In use" />
        <Stat icon="closeCircle" tone="amber" value={s.idle} label="Never used" />
        <Stat icon="alert" tone="red" value={s.periodsWithoutARoom} label="Periods with no room" />
      </Stats>

      {s.idle > 0 && (
        <Note tone="info">
          {plural(s.idle, 'room is', 'rooms are')} not used by the timetable at all. Either nothing
          needs them, or no subject is set to require that room type.
        </Note>
      )}

      <Card flush>
        <Filters>
          <Search value={q} onChange={setQ} placeholder="Search rooms…" />
        </Filters>
        <div className="tt-tablewrap">
          <table className="tt-table">
            <thead>
              <tr><th>Room</th><th>Type</th><th>Periods used</th><th>Free</th>
                <th style={{ minWidth: 170 }}>Utilisation</th><th>Sections</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td style={{ fontWeight: 600 }}>{r.roomName}</td>
                  <td><Chip tone={/lab/i.test(r.roomType) ? 'violet' : 'green'}>{r.roomType}</Chip></td>
                  <td className="tt-num">{r.periods}</td>
                  <td className="tt-num">{r.freeSlots}</td>
                  <td>
                    <Bar value={r.utilisation} max={100}
                      tone={r.utilisation > 85 ? 'bad' : r.utilisation > 0 ? 'good' : 'warn'} />
                  </td>
                  <td className="tt-num">{r.sections}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={6}>
                  <div className="tt-table__empty"><strong>No rooms configured</strong>
                    <span>Add them under Rooms &amp; Labs.</span></div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Subject Distribution
══════════════════════════════════════════════════════════════════════════ */

export function SubjectSplitTab({ yearId, onRows }) {
  const { data, loading } = useReport(() => api.getSubjectSplit(yearId || undefined), [yearId]);
  const [open, setOpen] = useState('');

  useEffect(() => {
    onRows(() => [
      ['Subject', 'Periods a week', 'Share %', 'Sections', 'Teachers', 'Least in a section', 'Most in a section'],
      ...(data?.subjects || []).map((s) => [s.name, s.periods, s.share, s.sectionCount, s.teachers,
        s.perSectionMin, s.perSectionMax]),
    ]);
  }, [data, onRows]);

  if (loading) return <Card><Loading label="Splitting the week by subject…" /></Card>;
  if (!data) return <Card><Body><Note tone="warn">Nothing to report on yet.</Note></Body></Card>;

  const top = data.subjects.slice(0, 7);
  const rest = data.subjects.slice(7).reduce((n, s) => n + s.periods, 0);
  const segments = [
    ...top.map((s) => ({ label: s.name, value: s.periods, colour: TONE_INK[toneFor(s._id)] })),
    ...(rest ? [{ label: 'Others', value: rest, colour: '#cbd5e1' }] : []),
  ];
  const uneven = data.subjects.filter((s) => s.uneven);

  return (
    <div className="tt-split tt-split--wide">
      <Card flush>
        <div className="tt-tablewrap">
          <table className="tt-table">
            <thead>
              <tr><th>Subject</th><th>Periods a week</th><th style={{ minWidth: 150 }}>Share</th>
                <th>Sections</th><th>Teachers</th><th>Per section</th><th style={{ width: 40 }} /></tr>
            </thead>
            <tbody>
              {data.subjects.map((s) => (
                <React.Fragment key={s._id}>
                  <tr className="is-pick" onClick={() => setOpen(open === s._id ? '' : s._id)}>
                    <td><Chip tone={toneFor(s._id)}>{s.name}</Chip></td>
                    <td className="tt-num"><strong>{s.periods}</strong></td>
                    <td><Bar value={s.share} max={100} tone="good" /></td>
                    <td className="tt-num">{s.sectionCount}</td>
                    <td className="tt-num">{s.teachers}</td>
                    <td>
                      {s.uneven
                        ? <Chip tone="amber">{s.perSectionMin}–{s.perSectionMax} — uneven</Chip>
                        : <span className="tt-table__muted">{s.perSectionMax} each</span>}
                    </td>
                    <td><Icon name={open === s._id ? 'chevronDown' : 'chevronRight'} size={15} /></td>
                  </tr>
                  {open === s._id && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--bg)' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0' }}>
                          {s.sections.map((x) => (
                            <Chip key={x._id} tone={x.periods === s.perSectionMax ? 'green' : 'amber'}>
                              {x.label}: {x.periods}
                            </Chip>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {!data.subjects.length && (
                <tr><td colSpan={7}>
                  <div className="tt-table__empty"><strong>Nothing published yet</strong></div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="tt-rail">
        <Panel icon="chart" title="How the week divides">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Pie segments={segments} size={118} />
            <div className="tt-chart__legend">
              {segments.map((x) => (
                <div key={x.label}>
                  <i style={{ background: x.colour }} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.label}</span>
                  <b>{pct(x.value, data.total)}%</b>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {uneven.length > 0 && (
          <Panel icon="alert" title="Taught unevenly">
            <Note tone="warn">
              These subjects get a different number of periods in different sections. That is
              usually a requirement set on one section and not the rest.
            </Note>
            {uneven.map((s) => (
              <KV key={s._id} icon="book" k={s.name} v={`${s.perSectionMin}–${s.perSectionMax} a week`} />
            ))}
          </Panel>
        )}

        {data.notTimetabled.length > 0 && (
          <Panel icon="closeCircle" title="Never timetabled">
            <Note tone="quiet">
              These subjects exist but appear nowhere in the published week.
            </Note>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {data.notTimetabled.map((s) => <Chip key={s._id} tone="slate">{s.name}</Chip>)}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Free Periods
══════════════════════════════════════════════════════════════════════════ */

export function FreePeriodsTab({ yearId, onRows }) {
  const { data, loading } = useReport(() => api.getFreePeriods(yearId || undefined), [yearId]);
  const [side, setSide] = useState('teachers');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const rows = side === 'teachers' ? (data?.teachers || []) : (data?.sections || []);
    if (!q) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => (r.name || r.label || '').toLowerCase().includes(needle));
  }, [data, side, q]);

  useEffect(() => {
    onRows(() => (side === 'teachers'
      ? [['Teacher', 'Periods', 'Free', 'Heaviest day'],
        ...(data?.teachers || []).map((t) => [t.name, t.periods, t.free, t.busiestDay])]
      : [['Section', 'Slots', 'Filled', 'Free'],
        ...(data?.sections || []).map((s) => [s.label, s.slots, s.filled, s.free])]));
  }, [data, side, onRows]);

  if (loading) return <Card><Loading label="Finding the holes…" /></Card>;
  if (!data) return <Card><Body><Note tone="warn">Nothing to report on yet.</Note></Body></Card>;

  const s = data.summary;
  const days = data.days || [];

  return (
    <>
      <Stats cols={4}>
        <Stat icon="clock" tone="blue" value={s.teacherFree} label="Free teacher periods" cap="across the week" />
        <Stat icon="grid" tone="amber" value={s.sectionFree} label="Empty class periods" cap="slots nothing fills" />
        <Stat icon="checkCircle" tone="green" value={s.fullyBooked} label="Fully booked teachers" />
        <Stat icon="userCircle" tone="slate" value={s.unused} label="Teachers with no periods" />
      </Stats>

      <Card flush>
        <Filters>
          <div className="tt-field tt-field--fix">
            <label>Look at</label>
            <select className="form-control" value={side} onChange={(e) => setSide(e.target.value)}>
              <option value="teachers">Teachers</option>
              <option value="sections">Classes</option>
            </select>
          </div>
          <Search value={q} onChange={setQ} placeholder={side === 'teachers' ? 'Search teachers…' : 'Search classes…'} />
        </Filters>

        <div className="tt-tablewrap">
          <table className="tt-table">
            <thead>
              {side === 'teachers' ? (
                <tr>
                  <th>Teacher</th><th>Timetabled</th><th>Free</th><th>Heaviest day</th>
                  {days.map((d) => <th key={d}>{DAY_SHORT[d] || d.slice(0, 3)}</th>)}
                </tr>
              ) : (
                <tr>
                  <th>Class</th><th>Slots</th><th>Filled</th><th>Free</th>
                  {days.map((d) => <th key={d}>{DAY_SHORT[d] || d.slice(0, 3)}</th>)}
                </tr>
              )}
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r._id}>
                  <td>{side === 'teachers' ? <Person name={r.name} /> : <strong>{r.label}</strong>}</td>
                  {side === 'teachers' ? (
                    <>
                      <td className="tt-num">{r.periods}</td>
                      <td className="tt-num"><strong>{r.free}</strong></td>
                      <td>{r.busiestDay ? <Chip tone="indigo">{DAY_SHORT[r.busiestDay] || r.busiestDay}</Chip>
                        : <span className="tt-table__muted">—</span>}</td>
                    </>
                  ) : (
                    <>
                      <td className="tt-num">{r.slots}</td>
                      <td className="tt-num">{r.filled}</td>
                      <td className="tt-num">
                        <strong style={{ color: r.free ? 'var(--warning)' : 'inherit' }}>{r.free}</strong>
                      </td>
                    </>
                  )}
                  {days.map((d) => (
                    <td key={d} className="tt-num tt-table__muted">{r.byDay[d] ?? 0}</td>
                  ))}
                </tr>
              ))}
              {!list.length && (
                <tr><td colSpan={days.length + 4}>
                  <div className="tt-table__empty"><strong>Nothing to show</strong></div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Conflicts
══════════════════════════════════════════════════════════════════════════ */

const CONFLICT_LABEL = {
  TEACHER_CLASH: 'Teacher double-booked',
  ROOM_CLASH: 'Room double-booked',
  CLASS_CLASH: 'Two lessons at once',
  WEEKLY_LIMIT_EXCEEDED: 'Over the weekly ceiling',
  EMPTY_SLOTS: 'Empty periods',
};

export function ConflictsTab({ yearId, onRows }) {
  const { data, loading, reload } = useReport(() => api.getLiveConflicts(yearId || undefined), [yearId]);
  const [type, setType] = useState('');

  const rows = useMemo(() => (data?.conflicts || []).filter((c) => !type || c.type === type), [data, type]);

  useEffect(() => {
    onRows(() => [
      ['Severity', 'Type', 'Day', 'Period', 'What is wrong', 'Detail'],
      ...rows.map((c) => [c.severity, CONFLICT_LABEL[c.type] || c.type, c.dayOfWeek || '',
        c.periodNumber || '', c.message, c.detail || '']),
    ]);
  }, [rows, onRows]);

  if (loading) return <Card><Loading label="Checking the published week…" /></Card>;
  if (!data) return <Card><Body><Note tone="warn">Nothing to check yet.</Note></Body></Card>;

  const s = data.summary;

  return (
    <>
      <Stats cols={3}>
        <Stat icon="alert" tone="red" value={s.errors} label="Clashes" cap="two things in one place" />
        <Stat icon="info" tone="amber" value={s.warnings} label="Worth a look" cap="limits and gaps" />
        {/* A third tile that reads "0 clean areas" says nothing. Where there is
            something to fix, the honest figure is how much of it there is. */}
        <Stat icon={s.total ? 'list' : 'checkCircle'} tone={s.total ? 'slate' : 'green'}
          value={s.total || 'All clear'} label={s.total ? 'Findings' : 'Nothing to fix'}
          cap={s.total ? 'across the published week' : 'the week holds together'} />
      </Stats>

      {!s.total ? (
        <Card><Body>
          <Note tone="good">
            The published week holds together: nobody is in two rooms at once, no room takes two
            classes, and every section’s slots are filled.
          </Note>
        </Body></Card>
      ) : (
        <Card flush>
          <Filters>
            <Pick label="Kind" value={type} onChange={setType} allLabel="Everything">
              {(data.byType || []).map((t) => (
                <option key={t.type} value={t.type}>
                  {CONFLICT_LABEL[t.type] || t.type} ({t.count})
                </option>
              ))}
            </Pick>
            <div style={{ marginLeft: 'auto' }}>
              <Button variant="secondary" onClick={reload}>
                <Icon name="refresh" size={15} /> Re-check
              </Button>
            </div>
          </Filters>

          <div className="tt-tablewrap">
            <table className="tt-table">
              <thead>
                <tr><th style={{ width: 110 }}>Severity</th><th>Kind</th><th style={{ width: 130 }}>When</th>
                  <th>What is wrong</th></tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={i}>
                    <td><Chip tone={c.severity === 'error' ? 'red' : 'amber'} dot>
                      {c.severity === 'error' ? 'Clash' : 'Warning'}
                    </Chip></td>
                    <td className="tt-nowrap">{CONFLICT_LABEL[c.type] || c.type}</td>
                    <td className="tt-nowrap tt-table__muted">
                      {c.dayOfWeek ? `${DAY_SHORT[c.dayOfWeek] || c.dayOfWeek} P${c.periodNumber}` : '—'}
                    </td>
                    <td>
                      <div>{c.message}</div>
                      {c.detail && (
                        <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: 2 }}>{c.detail}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tt-card__foot">
            <span className="tt-count">{plural(rows.length, 'finding')}</span>
            <Legend items={[['#ef4444', 'Clash'], ['#f59e0b', 'Warning']]} />
          </div>
        </Card>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Year Comparison
══════════════════════════════════════════════════════════════════════════ */

export function YearComparisonTab({ yearId, onRows }) {
  const [against, setAgainst] = useState('');
  const { data, loading } = useReport(
    () => api.getYearComparison(yearId || undefined, against || undefined), [yearId, against],
  );

  useEffect(() => {
    if (!data?.current) return;
    const keys = [
      ['Sections', 'sections'], ['Teachers', 'teachers'], ['Teaching', 'teachersTeaching'],
      ['Subjects', 'subjects'], ['Rooms', 'rooms'], ['Periods scheduled', 'scheduled'],
      ['Slots in the week', 'slots'], ['Utilisation %', 'utilisation'],
      ['Average load', 'averageLoad'], ['Busiest load', 'busiestLoad'],
    ];
    onRows(() => [
      ['Measure', data.current.yearName, data.compare?.yearName || '—'],
      ...keys.map(([label, k]) => [label, data.current[k], data.compare ? data.compare[k] : '']),
    ]);
  }, [data, onRows]);

  if (loading) return <Card><Loading label="Comparing years…" /></Card>;
  if (!data?.current) return <Card><Body><Note tone="warn">Nothing to compare yet.</Note></Body></Card>;

  const a = data.current;
  const b = data.compare;

  const rows = [
    ['Sections', 'sections', 'grid'],
    ['Teachers', 'teachers', 'users'],
    ['Teachers with periods', 'teachersTeaching', 'teacher'],
    ['Subjects timetabled', 'subjects', 'book'],
    ['Rooms in service', 'rooms', 'building'],
    ['Periods scheduled', 'scheduled', 'calendarDays'],
    ['Slots in the week', 'slots', 'layers'],
    ['Utilisation', 'utilisation', 'percent'],
    ['Average teacher load', 'averageLoad', 'chart'],
    ['Busiest teacher', 'busiestLoad', 'trending'],
  ];

  const delta = (k) => {
    if (!b) return null;
    const d = (Number(a[k]) || 0) - (Number(b[k]) || 0);
    if (!d) return <Chip tone="slate">no change</Chip>;
    return <Chip tone={d > 0 ? 'green' : 'red'}>{d > 0 ? '+' : ''}{Math.round(d * 10) / 10}</Chip>;
  };

  return (
    <>
      <Card icon="copy" title="Year Comparison"
        subtitle="This year’s published week beside another year’s">
        <Filters>
          <div className="tt-field tt-field--fix">
            <label>Compare against</label>
            <select className="form-control" value={against} onChange={(e) => setAgainst(e.target.value)}>
              <option value="">Pick a year…</option>
              {(data.years || []).filter((y) => y._id !== a._id).map((y) => (
                <option key={y._id} value={y._id}>{y.yearName}</option>
              ))}
            </select>
          </div>
        </Filters>
        {!b && (
          <Body>
            <Note tone="quiet">
              Only one year has a published timetable, so there is nothing to compare it with yet.
            </Note>
          </Body>
        )}
      </Card>

      {b && (
        <div className="tt-split tt-split--wide">
          <Card flush>
            <div className="tt-tablewrap">
              <table className="tt-table">
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th>{a.yearName}{a.status === 'active' ? ' (Active)' : ''}</th>
                    <th>{b.yearName}</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, k, icon]) => (
                    <tr key={k}>
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon name={icon} size={15} /> {label}
                        </span>
                      </td>
                      <td className="tt-num"><strong>{a[k]}{k === 'utilisation' ? '%' : ''}</strong></td>
                      <td className="tt-num tt-table__muted">{b[k]}{k === 'utilisation' ? '%' : ''}</td>
                      <td>{delta(k)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="tt-rail">
            <Panel icon="chart" title={`Subjects — ${a.yearName}`}>
              {a.subjectSplit.map((x, i) => (
                <Rank key={x.name} n={i + 1} name={x.name} value={plural(x.periods, 'period')}
                  tone={toneFor(x.name)} />
              ))}
              {!a.subjectSplit.length && <Note tone="quiet">Nothing published.</Note>}
            </Panel>
            <Panel icon="chart" title={`Subjects — ${b.yearName}`}>
              {b.subjectSplit.map((x, i) => (
                <Rank key={x.name} n={i + 1} name={x.name} value={plural(x.periods, 'period')}
                  tone={toneFor(x.name)} />
              ))}
              {!b.subjectSplit.length && <Note tone="quiet">Nothing published.</Note>}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
