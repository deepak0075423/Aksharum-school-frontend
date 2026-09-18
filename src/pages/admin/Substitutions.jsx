/**
 * Admin → Timetable → Substitutions.
 *
 * Four views of one job — keeping every period taught when a teacher is away.
 *
 *   Today's Board      the day, period by period: who is away, what that leaves
 *                      uncovered, and who is on it. Opening the page runs
 *                      detection, so an absence marked five minutes ago is here.
 *   Manual Assignment  cover any period by hand. The whole workflow for a
 *                      school with neither attendance nor leave switched on,
 *                      and the escape hatch for everyone else.
 *   Workload           timetabled load beside cover taken on, against the
 *                      school's own thresholds.
 *   Settings           the rules the first three obey.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import * as api from '../../api/substitute.api';
import { getClassesWithSections, getSubjects } from '../../api/admin.api';
import {
  TtHead, TtTabs, Card, Body, Filters, Field, Pick, Search, Stats, Stat, Panel,
  Chip, Note, Person, Legend, Pager, Loading, QuickActions, plural, pct,
  fmtDay, timeRange, toneFor,
} from '../timetable/admin/ttUI';
import {
  unwrap, statusOf, StatusChip, STATUS_META, REASON_META, DateStepper,
  CandidateModal, BulkModal, HistoryModal, RecentTable,
} from '../timetable/admin/subsParts';
import { ManualTab, WorkloadTab, SettingsTab, downloadCsv } from '../timetable/admin/subsTabs';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const TABS = [
  { key: 'board',    label: 'Today’s Board',     icon: 'calendarDays' },
  { key: 'manual',   label: 'Manual Assignment', icon: 'pencil' },
  { key: 'workload', label: 'Workload',          icon: 'chart' },
  { key: 'settings', label: 'Settings',          icon: 'settings' },
];

export default function Substitutions() {
  // A substitution notice carries the day it is about. Without honouring it the
  // reader lands on today's board, which will never show the cover they were
  // told about — and the ?focus= highlight waits for a row that cannot come.
  const [params] = useSearchParams();
  const [tab, setTab]   = useState(params.get('tab') || 'board');
  const [date, setDate] = useState(() => params.get('date') || todayIso());
  const [classes, setClasses]   = useState([]);
  const [subjects, setSubjects] = useState([]);

  useEffect(() => {
    getClassesWithSections(true).then((r) => setClasses(unwrap(r) || [])).catch(() => {});
    getSubjects().then((r) => setSubjects(unwrap(r) || [])).catch(() => {});
  }, []);

  const onBoard = tab === 'board';

  return (
    <div className="page tt-page">
      <TtHead icon="repeat" title="Substitutions"
        subtitle="Manage teacher substitutions for absent periods, leaves and special cases.">
        {onBoard
          ? <Button onClick={() => setTab('manual')}>
              <Icon name="plus" size={16} /> Add Substitution
            </Button>
          : <Button variant="secondary" onClick={() => setTab('board')}>
              <Icon name="arrowLeft" size={16} /> Back to Substitutions
            </Button>}
      </TtHead>

      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TtTabs tabs={TABS} value={tab} onChange={setTab} />
        </div>
      </div>

      {tab === 'board' && (
        <BoardTab date={date} setDate={setDate} classes={classes}
          focusId={params.get('focus')} onSwitchTab={setTab} />
      )}
      {tab === 'manual' && (
        <ManualTab date={date} setDate={setDate} classes={classes}
          onBulk={() => setTab('board')} onSwitchTab={setTab} />
      )}
      {tab === 'workload' && (
        <WorkloadTab date={date} classes={classes} subjects={subjects} onSwitchTab={setTab} />
      )}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Today's Board
══════════════════════════════════════════════════════════════════════════ */

const PAGE = 12;

function BoardTab({ date, setDate, classes, focusId, onSwitchTab }) {
  const [board, setBoard]   = useState(null);
  const [loading, setLoad]  = useState(true);
  const [running, setRun]   = useState(false);
  const [picking, setPick]  = useState(null);
  const [bulk, setBulk]     = useState(false);
  const [history, setHist]  = useState(false);
  const [recent, setRecent] = useState({ rows: [], loading: true });
  const [page, setPage]     = useState(1);
  const [f, setF] = useState({ className: '', sectionName: '', teacher: '', substitute: '', status: '', q: '' });

  const load = useCallback(async () => {
    setLoad(true);
    try {
      setBoard(unwrap(await api.getBoard(date)));
      setPage(1);
    } catch (e) { toast.error(e.message || 'Could not load the board'); }
    finally { setLoad(false); }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setRecent((r) => ({ ...r, loading: true }));
    api.getRecent({ limit: 6 })
      .then((res) => setRecent({ rows: unwrap(res)?.rows || [], loading: false }))
      .catch(() => setRecent({ rows: [], loading: false }));
  }, [date]);

  const rows = board?.assignments || [];
  const live = rows.filter((r) => r.status !== 'cancelled');

  const teachers = useMemo(() => {
    const names = new Map();
    for (const r of live) if (r.originalTeacher?._id) names.set(String(r.originalTeacher._id), r.originalTeacher.name);
    return [...names.entries()].map(([_id, name]) => ({ _id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [live]);

  const substitutes = useMemo(() => {
    const names = new Map();
    for (const r of live) if (r.substituteTeacher?._id) names.set(String(r.substituteTeacher._id), r.substituteTeacher.name);
    return [...names.entries()].map(([_id, name]) => ({ _id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [live]);

  const filtered = useMemo(() => live.filter((r) => {
    if (f.className && r.section?.className !== f.className) return false;
    if (f.sectionName && r.section?.sectionName !== f.sectionName) return false;
    if (f.teacher && String(r.originalTeacher?._id) !== f.teacher) return false;
    if (f.substitute && String(r.substituteTeacher?._id) !== f.substitute) return false;
    if (f.status && statusOf(r) !== f.status) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      const hay = [r.subject?.name, r.originalTeacher?.name, r.substituteTeacher?.name,
        r.section?.label, r.remarks, (REASON_META[r.reason] || {}).label]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [live, f]);

  const klass = classes.find((c) => c.className === f.className);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);
  const open = live.filter((r) => r.status !== 'assigned');

  /* The day's grid, with each period's rows slotted into it. Breaks come from
     the same structure, so lunch sits between period 3 and period 4 instead of
     the table jumping straight past it. */
  const grid = useMemo(() => {
    const periods = board?.periods || [];
    const byPeriod = new Map();
    for (const r of shown) {
      const k = Number(r.periodNumber);
      if (!byPeriod.has(k)) byPeriod.set(k, []);
      byPeriod.get(k).push(r);
    }
    const out = [];
    const placed = new Set();
    for (const p of periods) {
      if (p.isBreak) { out.push({ kind: 'break', period: p }); continue; }
      const mine = byPeriod.get(p.periodNumber) || [];
      for (const r of mine) { out.push({ kind: 'row', row: r, period: p }); placed.add(r._id); }
    }
    // Anything whose period is not in the grid (a section on a different grid)
    // still has to appear — dropping it would hide an uncovered class.
    for (const r of shown) if (!placed.has(r._id)) out.push({ kind: 'row', row: r, period: null });
    return out;
  }, [board, shown]);

  const s = board?.summary || {};
  const sources = board?.sources || {};
  const manualOnly = board && !sources.attendance && !sources.leave;
  const canExport = board?.settings?.allowExport !== false;

  const fill = async () => {
    setRun(true);
    try {
      const r = unwrap(await api.runAutoAssign(date, true));
      setBoard(r.board);
      toast.success(r.assigned
        ? `${plural(r.assigned, 'period')} covered`
        : r.uncovered ? 'No free teacher could be found for the open periods'
        : 'Everything is already covered');
    } catch (e) { toast.error(e.message || 'Could not run auto-assign'); }
    finally { setRun(false); }
  };

  const cancel = async (r) => {
    if (!window.confirm(`Cancel ${r.substituteTeacher?.name}’s cover of period ${r.periodNumber}? They will be told.`)) return;
    try {
      await api.cancel(r._id, 'Cancelled by admin');
      toast.success('Cancelled — the teacher has been told');
      load();
    } catch (e) { toast.error(e.message || 'Could not cancel'); }
  };

  const exportCsv = () => {
    const head = ['Period', 'Time', 'Class & Section', 'Subject', 'Regular teacher', 'Reason', 'Substitute', 'Status'];
    const body = filtered.map((r) => [
      r.periodNumber, timeRange(r.startTime, r.endTime), r.section?.label, r.subject?.name,
      r.originalTeacher?.name, (REASON_META[r.reason] || {}).label || r.reason,
      r.substituteTeacher?.name || 'Not assigned', STATUS_META[statusOf(r)].label,
    ]);
    downloadCsv([head, ...body], `substitutions-${date}.csv`);
  };

  return (
    <>
      <Card icon="calendarDays" title={fmtDay(date, { weekday: 'long' })}
        subtitle={manualOnly
          ? 'Attendance and Leave are both off — cover periods from the Manual Assignment tab'
          : `Detecting absences from ${[sources.attendance && 'attendance', sources.leave && 'approved leave']
            .filter(Boolean).join(' and ') || 'nothing yet'}`}
        actions={<>
          <DateStepper value={date} onChange={setDate} today={todayIso()} />
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
            <Icon name="refresh" size={15} /> Refresh
          </Button>
          <Button size="sm" onClick={fill} loading={running} disabled={loading || !board?.isWorkingDay}>
            <Icon name="sparkle" size={15} /> Detect &amp; fill
          </Button>
        </>}>
        <Body>
          <Stats cols={4}>
            <Stat icon="calendarDays" tone="blue" value={s.total || 0} label="Total Periods" cap="Needing cover today" />
            <Stat icon="checkCircle" tone="green" value={s.assigned || 0} label="Covered"
              pct={pct(s.assigned, s.total)} />
            <Stat icon="clock" tone="amber" value={s.needsReview || 0} label="Pending"
              pct={pct(s.needsReview, s.total)} />
            <Stat icon="alert" tone="red" value={Math.max(0, (s.uncovered || 0) - (s.needsReview || 0))}
              label="Uncovered"
              pct={pct(Math.max(0, (s.uncovered || 0) - (s.needsReview || 0)), s.total)} />
          </Stats>
        </Body>

        <Filters>
          <Pick label="Class" value={f.className} allLabel="All Classes"
            onChange={(v) => { setF((x) => ({ ...x, className: v, sectionName: '' })); setPage(1); }}>
            {classes.map((c) => <option key={c._id} value={c.className}>{c.className}</option>)}
          </Pick>
          <Pick label="Section" value={f.sectionName} allLabel="All Sections" disabled={!f.className}
            onChange={(v) => { setF((x) => ({ ...x, sectionName: v })); setPage(1); }}>
            {(klass?.sections || []).map((x) => <option key={x._id} value={x.sectionName}>{x.sectionName}</option>)}
          </Pick>
          <Pick label="Regular teacher" value={f.teacher} allLabel="All Teachers"
            onChange={(v) => { setF((x) => ({ ...x, teacher: v })); setPage(1); }}>
            {teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </Pick>
          <Pick label="Substitute" value={f.substitute} allLabel="All Teachers"
            onChange={(v) => { setF((x) => ({ ...x, substitute: v })); setPage(1); }}>
            {substitutes.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </Pick>
          <Pick label="Status" value={f.status} allLabel="All Status"
            onChange={(v) => { setF((x) => ({ ...x, status: v })); setPage(1); }}>
            <option value="covered">Covered</option>
            <option value="pending">Pending</option>
            <option value="uncovered">Uncovered</option>
          </Pick>
          <Search value={f.q} onChange={(v) => { setF((x) => ({ ...x, q: v })); setPage(1); }}
            placeholder="Search by subject, teacher or reason…" />
          {canExport && (
            <Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}>
              <Icon name="download" size={15} /> Export
            </Button>
          )}
        </Filters>

        {loading ? <Loading label="Reading today’s register…" /> : !board?.hasTimetable ? (
          <Body>
            <Note tone="warn">
              No published timetable for the active academic year. Substitution works off the
              published week — publish one from the Versions tab first.
            </Note>
          </Body>
        ) : !board.isWorkingDay ? (
          <Body>
            <Note tone="quiet">
              {fmtDay(date, { weekday: 'long' })} is a holiday or a weekly off, so there is nothing to cover.
            </Note>
          </Body>
        ) : (
          <>
            <div className="tt-tablewrap">
              <table className="tt-table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Period</th>
                    <th style={{ width: 130 }}>Time</th>
                    <th>Class &amp; Section</th>
                    <th>Subject</th>
                    <th>Regular Teacher</th>
                    <th>Reason</th>
                    <th>Substitute Teacher</th>
                    <th>Status</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map((item, i) => (item.kind === 'break' ? (
                    <tr key={`b${i}`} className="is-break">
                      <td>—</td>
                      <td className="tt-nowrap">{timeRange(item.period.startTime, item.period.endTime)}</td>
                      <td colSpan={7}>
                        <span className="tt-break"><Icon name="clock" size={15} />{item.period.label}</span>
                      </td>
                    </tr>
                  ) : (
                    <BoardRow key={item.row._id} r={item.row} focused={focusId === String(item.row._id)}
                      onPick={setPick} onCancel={cancel} />
                  )))}
                  {!filtered.length && (
                    <tr><td colSpan={9}>
                      <div className="tt-table__empty">
                        <strong>
                          {live.length ? 'No period matches those filters' : 'Nobody is away today'}
                        </strong>
                        <span>
                          {live.length
                            ? 'Clear the filters to see the whole day.'
                            : 'No teacher is recorded absent, so no period needs covering.'}
                        </span>
                      </div>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="tt-card__foot">
              <Legend items={[
                [STATUS_META.covered.dot, 'Covered'],
                [STATUS_META.pending.dot, 'Pending'],
                [STATUS_META.uncovered.dot, 'Uncovered'],
              ]} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span className="tt-count">
                  Showing {filtered.length ? `${(page - 1) * PAGE + 1}–${Math.min(page * PAGE, filtered.length)}` : 0} of{' '}
                  {plural(filtered.length, 'period')}
                </span>
                <Pager page={page} pages={pages} onPage={setPage} />
              </div>
            </div>
          </>
        )}
      </Card>

      <div className="tt-split tt-split--half">
        <Card icon="history" title="Recent Substitution Requests"
          actions={<Button size="sm" variant="secondary" onClick={() => setHist(true)}>
            View All <Icon name="arrowRight" size={14} />
          </Button>}>
          <Body>
            <RecentTable rows={recent.rows} loading={recent.loading} columns="day"
              onOpen={(r) => setDate(r.date)} />
          </Body>
        </Card>

        <div>
          <Panel icon="sparkle" title="Quick Actions">
            <QuickActions items={[
              { icon: 'pencil', tone: 'indigo', title: 'Manual Assignment',
                hint: 'Assign a substitute to a period', onClick: () => onSwitchTab('manual') },
              { icon: 'wand', tone: 'violet', title: 'Auto Assign',
                hint: 'Let the system find the best match', onClick: fill, disabled: running || !board?.isWorkingDay },
              { icon: 'users', tone: 'green', title: 'Bulk Assignment',
                hint: `Cover ${plural(open.length, 'open period')}`, onClick: () => setBulk(true), disabled: !open.length },
              { icon: 'history', tone: 'amber', title: 'Substitution History',
                hint: 'Everything that happened today', onClick: () => setHist(true) },
            ]} />
          </Panel>
        </div>
      </div>

      {picking && (
        <CandidateModal assignment={picking} onClose={() => setPick(null)}
          onDone={() => { setPick(null); load(); }} />
      )}
      {bulk && (
        <BulkModal rows={open} date={date} onClose={() => setBulk(false)}
          onDone={() => { setBulk(false); load(); }} />
      )}
      {history && <HistoryModal date={date} onClose={() => setHist(false)} />}
    </>
  );
}

function BoardRow({ r, focused, onPick, onCancel }) {
  const state = statusOf(r);
  const reason = REASON_META[r.reason] || REASON_META.manual;
  const covered = r.status === 'assigned';
  return (
    // `data-focus-id` is the SubstituteAssignment, which is what a cover
    // notification names — so ?focus= can flag this exact period.
    <tr data-focus-id={r._id} className={focused ? 'is-on' : ''}>
      <td><span className="tt-period">{r.periodNumber}</span></td>
      <td className="tt-nowrap tt-table__muted">{timeRange(r.startTime, r.endTime)}</td>
      <td className="tt-nowrap">{r.section?.label || '—'}</td>
      <td><Chip tone={toneFor(r.subject?._id)}>{r.subject?.name || '—'}</Chip></td>
      <td><Person name={r.originalTeacher?.name} /></td>
      <td><Chip tone={reason.tone}>{reason.label}</Chip></td>
      <td>
        {covered
          ? <Person name={r.substituteTeacher?.name}
              sub={r.assignedVia === 'auto' ? 'Auto-assigned' : r.notifiedAt ? 'Notified' : undefined} />
          : <span className="tt-table__muted">Not Assigned</span>}
      </td>
      <td><StatusChip state={state} /></td>
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant={covered ? 'secondary' : 'primary'} onClick={() => onPick(r)}>
            {covered ? 'View' : 'Assign'}
          </Button>
          {covered && (
            <button type="button" className="btn btn-secondary btn-sm" title="Cancel this cover"
              onClick={() => onCancel(r)}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
