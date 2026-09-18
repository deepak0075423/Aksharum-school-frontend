/**
 * Admin → Timetable → Reports.
 *
 * What the published week actually looks like once it is running. Seven views
 * of one set of facts: the overview, then teaching load, room use, how the week
 * divides between subjects, where the holes are, what clashes, and how all of
 * that compares with another year.
 *
 * Every tab reads the LIVE timetable. A report drawn from a draft version would
 * describe a school that does not exist yet.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { getAcademicYears } from '../../../api/admin.api';
import { Button } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  TtHead, YearPicker, Seg, Card, Body, Stats, Stat, Panel, Chip, Note, Person, Bar,
  Search, Filters, Loading, Pager, Pie, Donut, Columns, plural, pct, toneFor, TONE_INK,
} from './ttUI';
import {
  TeachingLoadTab, RoomUseTab, SubjectSplitTab, FreePeriodsTab, ConflictsTab, YearComparisonTab,
} from './reportTabs';
import { downloadCsv } from './subsTabs';

const unwrap = (res) => res?.data ?? res;

const TABS = [
  ['overview', 'Overview'],
  ['load', 'Teaching Load'],
  ['rooms', 'Room Use'],
  ['subjects', 'Subject Distribution'],
  ['free', 'Free Periods'],
  ['conflicts', 'Conflicts'],
  ['years', 'Year Comparison'],
];

export default function TimetableReports() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab]   = useState(params.get('tab') || 'overview');
  const [years, setYears] = useState([]);
  const [yearId, setYearId] = useState('');

  // Each tab hands up the rows its own Export would write, so one button in the
  // header exports whatever is actually on screen.
  const exportRef = useRef(null);
  const setExport = useCallback((fn) => { exportRef.current = fn; }, []);

  useEffect(() => {
    getAcademicYears().then((res) => {
      const list = unwrap(res) || [];
      setYears(list);
      const active = list.find((y) => y.status === 'active') || list[0];
      if (active) setYearId(String(active._id));
    }).catch(() => {});
  }, []);

  const choose = (k) => {
    setTab(k);
    setParams(k === 'overview' ? {} : { tab: k }, { replace: true });
    exportRef.current = null;
  };

  const doExport = () => {
    const rows = exportRef.current?.();
    if (!rows?.length) return toast.error('Nothing on this tab to export yet');
    const name = TABS.find(([k]) => k === tab)?.[1] || 'report';
    downloadCsv(rows, `timetable-${name.toLowerCase().replace(/\s+/g, '-')}.csv`);
  };

  return (
    <div className="page tt-page">
      <TtHead icon="chart" title="Timetable Reports"
        subtitle="Insights into teaching load, room utilisation, subject distribution and more.">
        <YearPicker years={years} value={yearId} onChange={setYearId} />
        <Button variant="secondary" onClick={doExport}>
          <Icon name="download" size={16} /> Export Report
        </Button>
      </TtHead>

      <div style={{ overflowX: 'auto' }}>
        <Seg value={tab} onChange={choose} options={TABS} />
      </div>

      {!yearId ? <Card><Loading /></Card> : (
        <>
          {tab === 'overview'  && <OverviewTab yearId={yearId} onRows={setExport} onTab={choose} />}
          {tab === 'load'      && <TeachingLoadTab yearId={yearId} onRows={setExport} />}
          {tab === 'rooms'     && <RoomUseTab yearId={yearId} onRows={setExport} />}
          {tab === 'subjects'  && <SubjectSplitTab yearId={yearId} onRows={setExport} />}
          {tab === 'free'      && <FreePeriodsTab yearId={yearId} onRows={setExport} />}
          {tab === 'conflicts' && <ConflictsTab yearId={yearId} onRows={setExport} />}
          {tab === 'years'     && <YearComparisonTab yearId={yearId} onRows={setExport} />}
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Overview
══════════════════════════════════════════════════════════════════════════ */

const PAGE = 8;

function OverviewTab({ yearId, onRows, onTab }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getReportOverview(yearId)
      .then((res) => { if (alive) setData(unwrap(res)); })
      .catch((e) => { if (alive) { toast.error(e?.data?.message || e.message); setData(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [yearId]);

  const rows = useMemo(() => (data?.teachers || []).filter((t) => !q
    || t.name.toLowerCase().includes(q.toLowerCase())
    || t.subjects.some((s) => s.name.toLowerCase().includes(q.toLowerCase()))), [data, q]);

  useEffect(() => {
    onRows(() => [
      ['Teacher', 'Subjects', 'Periods a week', 'Cap', 'Free periods', 'Load %', 'Status'],
      ...rows.map((r) => [r.name, r.subjects.map((s) => s.name).join(' / '),
        r.periods, r.cap, r.freePeriods, r.loadPct, r.status]),
    ]);
  }, [rows, onRows]);

  if (loading) return <Card><Loading label="Reading the published week…" /></Card>;
  if (!data) return <Card><Body><Note tone="warn">Could not read the timetable for this year.</Note></Body></Card>;

  const s = data.summary;

  if (!data.hasTimetable) {
    return (
      <Card icon="chart" title="Nothing published yet">
        <Body>
          <Note tone="info">
            These reports describe the live timetable. Generate a version and publish it, and
            every figure on this screen fills in.
          </Note>
          <div style={{ marginTop: 12 }}>
            <Button onClick={() => { window.location.href = '/admin/timetable/generate'; }}>
              <Icon name="sparkle" size={15} /> Generate a timetable
            </Button>
          </div>
        </Body>
      </Card>
    );
  }

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  const topSubjects = data.subjects.slice(0, 4);
  const otherShare = data.subjects.slice(4).reduce((n, x) => n + x.periods, 0);
  const subjectSegments = [
    ...topSubjects.map((x) => ({ label: x.name, value: x.periods, colour: TONE_INK[toneFor(x._id)] })),
    ...(otherShare ? [{ label: 'Others', value: otherShare, colour: '#cbd5e1' }] : []),
  ];
  const scheduledTotal = data.subjects.reduce((n, x) => n + x.periods, 0);

  const roomSegments = [
    { label: 'In use', value: data.roomSplit.inUse, colour: TONE_INK.green },
    { label: 'Free', value: data.roomSplit.free, colour: '#e2e8f0' },
  ];

  return (
    <>
      <Stats cols={5}>
        <Stat icon="users" tone="indigo" value={s.teachers} label="Teachers"
          cap={`${s.teachersActive} active · ${s.teachersInactive} inactive`} />
        <Stat icon="book" tone="blue" value={s.totalSlots} label="Total Periods"
          cap={`${data.perSectionWeek} per section a week`} />
        <Stat icon="checkCircle" tone="green" value={`${s.utilisation}%`} label="Utilisation"
          cap={`${s.scheduled} of ${s.totalSlots} periods`} />
        <Stat icon="alert" tone="red" value={s.conflicts} label="Conflicts"
          cap={s.conflicts ? 'Need attention' : 'None found'} />
        <Stat icon="building" tone="violet" value={s.rooms} label="Rooms"
          cap={`${s.labs} labs · ${s.classrooms} classrooms`} />
      </Stats>

      <div className="tt-charts">
        <div className="tt-chart">
          <div className="tt-chart__head">
            <span className="tt-chart__icon"><Icon name="barsUp" size={17} /></span>
            <h3>Teaching Load Distribution</h3>
          </div>
          <Columns data={data.loadBands} height={150} />
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
            Teachers, by periods a week
          </div>
        </div>

        <div className="tt-chart">
          <div className="tt-chart__head">
            <span className="tt-chart__icon"><Icon name="target" size={17} /></span>
            <h3>Room Utilisation</h3>
          </div>
          <div className="tt-chart__body">
            <Donut size={124} segments={roomSegments}
              total={`${pct(data.roomSplit.inUse, data.roomSplit.slots)}%`} label="in use" />
            <div className="tt-chart__legend">
              <div><i style={{ background: TONE_INK.green }} />In use
                <b>{pct(data.roomSplit.inUse, data.roomSplit.slots)}% ({data.roomSplit.inUse})</b></div>
              <div><i style={{ background: '#e2e8f0' }} />Free
                <b>{pct(data.roomSplit.free, data.roomSplit.slots)}% ({data.roomSplit.free})</b></div>
              <div><i style={{ background: TONE_INK.amber }} />Rooms never used
                <b>{data.roomSplit.roomsIdle}</b></div>
            </div>
          </div>
        </div>

        <div className="tt-chart">
          <div className="tt-chart__head">
            <span className="tt-chart__icon"><Icon name="book" size={17} /></span>
            <h3>Subjects Overview</h3>
          </div>
          <div className="tt-chart__body">
            <Pie segments={subjectSegments} size={124} />
            <div className="tt-chart__legend">
              {subjectSegments.map((x) => (
                <div key={x.label}>
                  <i style={{ background: x.colour }} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.label}</span>
                  <b>{pct(x.value, scheduledTotal)}%</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {s.conflicts > 0 && (
        <Note tone="bad">
          The published week contains {plural(s.conflicts, 'clash', 'clashes')}
          {s.warnings ? ` and ${plural(s.warnings, 'thing')} worth a look` : ''}.{' '}
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => onTab('conflicts')}>
            See what is wrong
          </button>
        </Note>
      )}

      <Card icon="users" title="Teaching Load by Teacher"
        subtitle="See how many periods each teacher has, and whether they are over or under their target."
        flush>
        <Filters>
          <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search teachers…" />
          <div style={{ marginLeft: 'auto' }}>
            <Button variant="secondary" onClick={() => onTab('load')}>
              <Icon name="externalLink" size={15} /> Full teaching-load report
            </Button>
          </div>
        </Filters>

        <div className="tt-tablewrap">
          <table className="tt-table">
            <thead>
              <tr>
                <th>Teacher</th><th>Subjects</th><th>Periods / Week</th><th>Free Periods</th>
                <th style={{ minWidth: 170 }}>Load %</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r._id}>
                  <td><Person name={r.name} /></td>
                  <td>
                    <span className="tt-chiprow">
                      {r.subjects.slice(0, 2).map((x) => (
                        <Chip key={x.name} tone={toneFor(x.name)}>{x.name}</Chip>
                      ))}
                      {r.subjects.length > 2 && <Chip tone="slate">+{r.subjects.length - 2}</Chip>}
                      {!r.subjects.length && <span className="tt-table__muted">—</span>}
                    </span>
                  </td>
                  <td className="tt-num">
                    <strong>{r.periods}</strong>
                    {r.cap > 0 && <span className="tt-table__muted"> / {r.cap}</span>}
                  </td>
                  <td className="tt-num">{r.freePeriods}</td>
                  <td>
                    <Bar value={r.periods} max={r.cap || 1}
                      tone={r.status === 'over' ? 'bad' : r.status === 'under' ? 'warn' : 'good'} />
                  </td>
                  <td>
                    <Chip tone={r.status === 'over' ? 'red' : r.status === 'under' ? 'amber' : 'green'}>
                      {r.status === 'over' ? 'Overloaded' : r.status === 'under' ? 'Underloaded' : 'On target'}
                    </Chip>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={6}>
                  <div className="tt-table__empty"><strong>No teacher matches that</strong></div>
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
