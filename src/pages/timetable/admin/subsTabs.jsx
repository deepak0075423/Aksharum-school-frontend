/**
 * Substitutions → Manual Assignment, Workload and Settings.
 *
 * The board (in Substitutions.jsx) answers "what needs covering today". These
 * three answer the questions around it: cover a period by hand, see who is
 * carrying how much, and set the rules the other two obey.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Button, Modal } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/substitute.api';
import {
  Card, Body, Filters, Field, Pick, Search, Seg, Stats, Stat, Panel, KV, Note, Chip,
  Person, Avatar, Bar, Donut, Rank, QuickActions, Pager, Loading, SetCard, SwitchRow,
  CheckRow, Weight, fmtDay, timeRange, plural, toneFor, TONE_INK,
} from './ttUI';
import {
  unwrap, REASON_OPTIONS, REASON_META, StatusChip, statusOf, RecentTable, CandidateModal,
} from './subsParts';

/* ══════════════════════════════════════════════════════════════════════════
   Manual Assignment
══════════════════════════════════════════════════════════════════════════ */

export function ManualTab({ date, setDate, classes, onBulk, onSwitchTab }) {
  const [classId, setClassId]     = useState('');
  const [sectionId, setSectionId] = useState('');
  const [period, setPeriod]       = useState('');
  const [slot, setSlot]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [teacherId, setTeacherId] = useState('');
  const [originalId, setOriginal] = useState('');
  const [reason, setReason]       = useState('absent');
  const [note, setNote]           = useState('');
  const [saving, setSaving]       = useState(false);
  const [availTab, setAvailTab]   = useState('available');
  const [search, setSearch]       = useState('');
  const [recent, setRecent]       = useState({ rows: [], loading: true });
  const [picking, setPicking]     = useState(null);

  const klass = classes.find((c) => String(c._id) === classId);
  const sections = klass?.sections || [];

  const loadRecent = useCallback(() => {
    setRecent((r) => ({ ...r, loading: true }));
    api.getRecent({ limit: 8, via: 'manual' })
      .then((res) => setRecent({ rows: unwrap(res)?.rows || [], loading: false }))
      .catch(() => setRecent({ rows: [], loading: false }));
  }, []);
  useEffect(() => { loadRecent(); }, [loadRecent]);

  /* The slot only exists once class, section and period are all chosen — until
     then there is nothing to show and nothing to ask the server. */
  useEffect(() => {
    if (!sectionId || !period) { setSlot(null); return undefined; }
    let alive = true;
    setLoading(true);
    setTeacherId('');
    api.getSlot({ date, sectionId, periodNumber: period })
      .then((res) => {
        if (!alive) return;
        const d = unwrap(res);
        setSlot(d);
        const first = d.teaching?.[0];
        setOriginal(first ? String(first.teacher._id) : '');
        // The recorded reason is the honest default; an admin covering a period
        // with no absence on file is doing something else and says so.
        if (first?.absence) setReason(first.absence.reason === 'leave' ? 'leave' : 'absent');
      })
      .catch((e) => { if (alive) { toast.error(e.message || 'Could not read that period'); setSlot(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [date, sectionId, period]);

  const teaching = slot?.teaching || [];
  const current = teaching.find((t) => String(t.teacher._id) === originalId) || teaching[0];
  const candidates = slot?.candidates || [];
  const unavailable = slot?.unavailable || [];
  const chosen = candidates.find((c) => String(c.teacher._id) === teacherId);

  const shown = useMemo(() => {
    const list = availTab === 'available' ? candidates
      : availTab === 'unavailable' ? unavailable
      : [...candidates, ...unavailable];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((x) => x.teacher.name.toLowerCase().includes(q));
  }, [availTab, candidates, unavailable, search]);

  const periodOptions = useMemo(() => {
    // Which periods this section actually teaches comes from the board's grid;
    // until one is picked, offer the full range the school runs.
    const n = 10;
    return Array.from({ length: n }, (_, i) => i + 1);
  }, []);

  const reset = () => {
    setClassId(''); setSectionId(''); setPeriod(''); setSlot(null);
    setTeacherId(''); setNote(''); setReason('absent');
  };

  const submit = async (force = false) => {
    if (!sectionId || !period) return toast.error('Choose a class, a section and a period');
    if (!teacherId) return toast.error('Choose who is covering it');
    setSaving(true);
    try {
      await api.assignSlot({
        date, sectionId, periodNumber: Number(period),
        originalTeacherId: originalId || undefined,
        substituteTeacherId: teacherId,
        reason, remarks: note, ...(force ? { force: true } : {}),
      });
      toast.success('Assigned — the substitute has been told');
      setTeacherId(''); setNote('');
      loadRecent();
      // Re-read the slot so the panel shows the cover that now exists.
      const res = await api.getSlot({ date, sectionId, periodNumber: period });
      setSlot(unwrap(res));
    } catch (e) {
      const msg = e?.data?.message || e.message || 'Could not assign';
      if (/not available/i.test(msg) && !force) {
        if (window.confirm(`${msg}\n\nAssign them anyway?`)) return submit(true);
      } else toast.error(msg);
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="tt-split tt-split--wide">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card icon="pencil" title="Manual Assignment"
            subtitle="Assign a substitute teacher for a specific period"
            actions={<Button size="sm" variant="secondary" onClick={onBulk}>
              <Icon name="users" size={15} /> Bulk Assignment
            </Button>}>
            <Body>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
                <Field label="Date" required>
                  <input type="date" className="form-control" value={date}
                    onChange={(e) => e.target.value && setDate(e.target.value)} />
                </Field>
                <Pick label="Class" required value={classId} allLabel="Choose a class…" fix={false}
                  onChange={(v) => { setClassId(v); setSectionId(''); setPeriod(''); }}>
                  {classes.map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}
                </Pick>
                <Pick label="Section" required value={sectionId} allLabel="Choose a section…" fix={false}
                  disabled={!classId} onChange={(v) => { setSectionId(v); setPeriod(''); }}>
                  {sections.map((s) => <option key={s._id} value={s._id}>{s.sectionName}</option>)}
                </Pick>

                <Pick label="Period" required value={period} allLabel="Choose a period…" fix={false}
                  disabled={!sectionId} onChange={setPeriod}>
                  {periodOptions.map((n) => <option key={n} value={n}>Period {n}</option>)}
                </Pick>
                <Field label="Subject">
                  <div className="form-control" style={{ display: 'flex', alignItems: 'center', height: 42 }}>
                    {loading ? <span className="tt-table__muted">Reading the timetable…</span>
                      : current
                        ? <Chip tone={toneFor(current.subject._id)}>{current.subject.name || 'Subject'}</Chip>
                        : <span className="tt-table__muted">
                            {slot ? 'Nothing timetabled here' : 'Pick a class and period'}
                          </span>}
                  </div>
                </Field>
                <Field label="Absent Teacher">
                  <div className="form-control" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42 }}>
                    {current ? (
                      <>
                        <Avatar name={current.teacher.name} />
                        <span style={{ fontWeight: 600, fontSize: '.85rem', minWidth: 0 }}>{current.teacher.name}</span>
                        {current.absence
                          ? <Chip tone={current.absence.reason === 'leave' ? 'amber' : 'red'}>{current.absence.label}</Chip>
                          : <Chip tone="slate">Not recorded away</Chip>}
                      </>
                    ) : <span className="tt-table__muted">—</span>}
                  </div>
                </Field>

                <Field label="Substitute Teacher" required>
                  <select className="form-control" value={teacherId} disabled={!slot || !candidates.length}
                    onChange={(e) => setTeacherId(e.target.value)}>
                    <option value="">
                      {!slot ? 'Pick a period first'
                        : candidates.length ? 'Choose a teacher…' : 'Nobody is free for this period'}
                    </option>
                    {candidates.map((c) => (
                      <option key={c.teacher._id} value={c.teacher._id}>
                        {c.teacher.name}{c.subjectMatch ? ' — teaches this subject' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <Pick label="Reason" required value={reason} onChange={setReason} fix={false}>
                  {REASON_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Pick>
                <Field label="Note (optional)" hint={`${note.length}/200`}>
                  <input className="form-control" maxLength={200} value={note}
                    placeholder="e.g. long leave, meeting, etc."
                    onChange={(e) => setNote(e.target.value)} />
                </Field>
              </div>

              {teaching.length > 1 && (
                <div style={{ marginTop: 14 }}>
                  <Field label="Which teacher is away?"
                    hint="This period is split between two subjects, so it has two teachers.">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {teaching.map((t) => (
                        <button key={t.teacher._id} type="button"
                          className={`btn btn-${String(t.teacher._id) === originalId ? 'primary' : 'secondary'} btn-sm`}
                          onClick={() => setOriginal(String(t.teacher._id))}>
                          {t.teacher.name} · {t.subject.name}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              )}

              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px' }}>
                  {!slot ? (
                    <Note tone="quiet">Choose a class, section and period to see who is free.</Note>
                  ) : !teaching.length ? (
                    <Note tone="warn">Nothing is timetabled for that class at that period.</Note>
                  ) : chosen ? (
                    <Note tone="info">
                      <strong>{chosen.teacher.name} is free for this period.</strong> The assignment is
                      saved against {fmtDay(date)} and shows on their timetable.
                    </Note>
                  ) : slot.existing?.length ? (
                    <Note tone="warn">
                      This period already has an open substitution
                      {slot.existing[0].substituteTeacher ? ` with ${slot.existing[0].substituteTeacher.name}` : ''}.
                      Assigning again moves it.
                    </Note>
                  ) : (
                    <Note tone="quiet">Pick whoever is covering it.</Note>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
                  <Button variant="secondary" onClick={reset}>Reset</Button>
                  <Button onClick={() => submit(false)} loading={saving} disabled={!teacherId}>
                    <Icon name="check" size={15} /> Assign Substitute
                  </Button>
                </div>
              </div>
            </Body>
          </Card>

          <Card icon="history" title="Recent Manual Assignments"
            actions={<Button size="sm" variant="secondary" onClick={() => onSwitchTab('board')}>
              View All <Icon name="arrowRight" size={14} />
            </Button>}>
            <Body className="tt-card__body">
              <RecentTable rows={recent.rows} loading={recent.loading} columns="full" />
            </Body>
          </Card>
        </div>

        <div className="tt-rail">
          <Panel icon="users" title="Teacher Availability"
            right={<Button size="sm" variant="secondary"
              onClick={() => setPeriod((p) => p)} aria-label="Refresh">
              <Icon name="refresh" size={14} /> Refresh
            </Button>}>
            <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
              {slot ? `${fmtDay(date)}, Period ${slot.periodNumber}` : 'Pick a period to see who is free'}
            </span>
            <Seg quiet value={availTab} onChange={setAvailTab} options={[
              ['available', `Available (${candidates.length})`],
              ['unavailable', `Unavailable (${unavailable.length})`],
              ['all', 'All Teachers'],
            ]} />
            <Search value={search} onChange={setSearch} placeholder="Search teachers…" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {!slot && <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>Nothing to show yet.</span>}
              {slot && !shown.length && (
                <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>Nobody here.</span>
              )}
              {shown.map((x) => {
                const free = !x.reason;
                const id = String(x.teacher._id);
                return (
                  <label key={id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                    borderRadius: 10, cursor: free ? 'pointer' : 'default',
                    background: teacherId === id ? '#eef2ff' : 'transparent',
                  }}>
                    <Avatar name={x.teacher.name} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '.84rem' }}>{x.teacher.name}</span>
                      <span style={{ display: 'block', fontSize: '.74rem', color: 'var(--text-muted)' }}>
                        {(x.subjects || []).join(', ') || 'No subjects recorded'}
                      </span>
                    </span>
                    <Chip tone={free ? 'green' : 'slate'}>{free ? 'Available' : x.reason}</Chip>
                    {free && (
                      <input type="checkbox" checked={teacherId === id} style={{ accentColor: 'var(--primary)' }}
                        onChange={() => setTeacherId(teacherId === id ? '' : id)} />
                    )}
                  </label>
                );
              })}
            </div>
          </Panel>

          <Panel icon="calendarDays" title="Today’s Period Details"
            right={<a href="/admin/timetable" style={{ fontSize: '.8rem' }}>View Full Timetable →</a>}>
            <KV icon="calendar" k="Date" v={fmtDay(date, { weekday: 'long' })} />
            <KV icon="clock" k="Period"
              v={slot ? `${slot.periodNumber} (${timeRange(slot.startTime, slot.endTime)})` : '—'} />
            <KV icon="users" k="Class & Section"
              v={klass && sectionId
                ? `${klass.className} - ${sections.find((s) => String(s._id) === sectionId)?.sectionName || ''}`
                : '—'} />
            <KV icon="book" k="Subject" v={current?.subject?.name || '—'} />
            <KV icon="user" k="Regular Teacher" v={current?.teacher?.name || '—'} />
            <KV icon="info" k="Reason"
              v={current?.absence
                ? <Chip tone={current.absence.reason === 'leave' ? 'amber' : 'red'}>{current.absence.label}</Chip>
                : <Chip tone="slate">None recorded</Chip>} />
          </Panel>
        </div>
      </div>

      {picking && (
        <CandidateModal assignment={picking} onClose={() => setPicking(null)}
          onDone={() => { setPicking(null); loadRecent(); }} />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Workload
══════════════════════════════════════════════════════════════════════════ */

const PAGE = 10;

export function WorkloadTab({ date, classes, subjects, onSwitchTab }) {
  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(true);
  const [draft, setDraft]   = useState({ className: '', sectionName: '', subjectId: '', teacherId: '', status: '' });
  const [applied, setApply] = useState(draft);
  const [page, setPage]     = useState(1);
  const [charts, setCharts] = useState(false);

  const load = useCallback(async (filters) => {
    setLoad(true);
    try {
      const res = await api.getWorkloadReport({ date, ...filters });
      setData(unwrap(res));
      setPage(1);
    } catch (e) { toast.error(e.message || 'Could not load the workload'); }
    finally { setLoad(false); }
  }, [date]);

  useEffect(() => { load(applied); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data?.teachers || [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const s = data?.summary || {};
  const th = data?.thresholds || { target: 0, overAt: 0, underAt: 0 };

  const klass = classes.find((c) => c.className === draft.className);

  const exportCsv = () => {
    const head = ['Teacher', 'Designation', 'Subjects', 'Assigned periods', 'Substitutions', 'Total load', 'Status'];
    const body = rows.map((r) => [
      r.teacher.name, r.designation, r.subjects.map((x) => x.name).join(' / '),
      r.assignedPeriods, r.substitutionPeriods, r.totalLoad, r.status,
    ]);
    downloadCsv([head, ...body], `teacher-workload-${date}.csv`);
  };

  return (
    <>
      <Card icon="chart" title="Teacher Workload"
        subtitle="View teaching load, extra assignments and substitution count"
        actions={<>
          <Button size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Icon name="download" size={15} /> Generate Report
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setCharts(true)} disabled={!rows.length}>
            <Icon name="barsUp" size={15} /> View Charts
          </Button>
        </>}>
        <Body>
          <Stats cols={5}>
            <Stat icon="users" tone="indigo" value={s.totalTeachers ?? '—'} label="Total Teachers" />
            <Stat icon="trending" tone="green" value={s.averagePerWeek ?? '—'} label="Average Periods/Week"
              cap={`Target: ${th.target}`} />
            <Stat icon="arrowUp" tone="red" value={s.overloaded ?? '—'} label="Overloaded Teachers"
              cap={`> ${th.overAt} periods`} />
            <Stat icon="checkCircle" tone="blue" value={s.balanced ?? '—'} label="Balanced Teachers"
              cap={`${th.underAt} – ${th.overAt} periods`} />
            <Stat icon="arrowDown" tone="amber" value={s.underloaded ?? '—'} label="Underloaded Teachers"
              cap={`< ${th.underAt} periods`} />
          </Stats>
        </Body>

        <Filters>
          <Pick label="Class" value={draft.className} allLabel="All Classes"
            onChange={(v) => setDraft((d) => ({ ...d, className: v, sectionName: '' }))}>
            {classes.map((c) => <option key={c._id} value={c.className}>{c.className}</option>)}
          </Pick>
          <Pick label="Section" value={draft.sectionName} allLabel="All Sections" disabled={!draft.className}
            onChange={(v) => setDraft((d) => ({ ...d, sectionName: v }))}>
            {(klass?.sections || []).map((x) => (
              <option key={x._id} value={x.sectionName}>{x.sectionName}</option>
            ))}
          </Pick>
          <Pick label="Subject" value={draft.subjectId} allLabel="All Subjects"
            onChange={(v) => setDraft((d) => ({ ...d, subjectId: v }))}>
            {subjects.map((x) => <option key={x._id} value={x._id}>{x.subjectName}</option>)}
          </Pick>
          <Pick label="Teacher" value={draft.teacherId} allLabel="All Teachers"
            onChange={(v) => setDraft((d) => ({ ...d, teacherId: v }))}>
            {rows.map((r) => <option key={r.teacher._id} value={r.teacher._id}>{r.teacher.name}</option>)}
          </Pick>
          <Pick label="Workload Status" value={draft.status} allLabel="All"
            onChange={(v) => setDraft((d) => ({ ...d, status: v }))}>
            <option value="overloaded">Overloaded</option>
            <option value="balanced">Balanced</option>
            <option value="underloaded">Underloaded</option>
          </Pick>
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            <Button variant="secondary"
              onClick={() => { const blank = { className: '', sectionName: '', subjectId: '', teacherId: '', status: '' }; setDraft(blank); setApply(blank); load(blank); }}>
              Reset
            </Button>
            <Button onClick={() => { setApply(draft); load(draft); }} loading={loading}>
              <Icon name="filter" size={15} /> Apply Filters
            </Button>
          </div>
        </Filters>
      </Card>

      <div className="tt-split tt-split--wide">
        <Card flush>
          {loading ? <Loading label="Adding up the week…" /> : (
            <>
              <div className="tt-tablewrap">
                <table className="tt-table tt-table--wrap">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>#</th>
                      <th>Teacher</th><th>Designation</th><th>Subjects</th>
                      <th>Assigned Periods</th>
                      <th>Substitution Periods</th><th>Total Load</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r, i) => (
                      <tr key={r.teacher._id}>
                        <td className="tt-num tt-table__muted">{(page - 1) * PAGE + i + 1}</td>
                        <td><Person name={r.teacher.name} /></td>
                        <td className="tt-table__muted tt-nowrap">{r.designation}</td>
                        <td>
                          <span className="tt-chiprow">
                            {r.subjects.slice(0, 2).map((x) => (
                              <Chip key={x._id} tone={toneFor(x._id)}>{x.name}</Chip>
                            ))}
                            {r.subjects.length > 2 && <Chip tone="slate">+{r.subjects.length - 2}</Chip>}
                            {!r.subjects.length && <span className="tt-table__muted">—</span>}
                          </span>
                        </td>
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <strong className="tt-num" style={{ width: 24 }}>{r.assignedPeriods}</strong>
                            <Bar value={r.assignedPeriods} max={th.target || 1} width={70}
                              tone={r.status === 'overloaded' ? 'bad' : r.status === 'underloaded' ? 'warn' : 'good'} />
                          </span>
                        </td>
                        <td className="tt-num">{r.substitutionPeriods}</td>
                        <td className="tt-num"><strong>{r.totalLoad}</strong></td>
                        <td>
                          <Chip tone={r.status === 'overloaded' ? 'red' : r.status === 'underloaded' ? 'amber' : 'green'}>
                            {r.status === 'overloaded' ? 'Overloaded' : r.status === 'underloaded' ? 'Underloaded' : 'Balanced'}
                          </Chip>
                        </td>
                      </tr>
                    ))}
                    {!rows.length && (
                      <tr><td colSpan={8}>
                        <div className="tt-table__empty">
                          <strong>No teacher matches those filters</strong>
                          <span>Clear them, or widen the class and subject.</span>
                        </div>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="tt-card__foot">
                <span className="tt-count">
                  {rows.length
                    ? `Showing ${(page - 1) * PAGE + 1} to ${Math.min(page * PAGE, rows.length)} of ${plural(rows.length, 'teacher')}`
                    : 'Nothing to show'}
                </span>
                <Pager page={page} pages={pages} onPage={setPage} />
              </div>
            </>
          )}
        </Card>

        <div className="tt-rail">
          <Panel icon="chart" title="Workload Summary">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Donut size={112} total={s.totalTeachers || 0} label="Teachers" segments={[
                { label: 'Overloaded', value: s.overloaded || 0, colour: TONE_INK.red },
                { label: 'Balanced', value: s.balanced || 0, colour: TONE_INK.green },
                { label: 'Underloaded', value: s.underloaded || 0, colour: TONE_INK.amber },
              ]} />
              <div className="tt-chart__legend">
                <div><i style={{ background: TONE_INK.red }} />Overloaded (&gt; {th.overAt})
                  <b>{s.overloaded || 0}</b></div>
                <div><i style={{ background: TONE_INK.green }} />Balanced ({th.underAt}–{th.overAt})
                  <b>{s.balanced || 0}</b></div>
                <div><i style={{ background: TONE_INK.amber }} />Underloaded (&lt; {th.underAt})
                  <b>{s.underloaded || 0}</b></div>
              </div>
            </div>
          </Panel>

          <Panel icon="trophy" title="Top 5 Workload"
            right={<span className="tt-count">Highest</span>}>
            {(data?.top || []).map((t, i) => (
              <Rank key={t.name} n={i + 1} name={t.name} value={plural(t.periods, 'period')}
                tone={i === 0 ? 'red' : i < 3 ? 'amber' : 'slate'} />
            ))}
            {!data?.top?.length && <Note tone="quiet">Nothing timetabled yet.</Note>}
          </Panel>

          <Panel icon="sparkle" title="Quick Actions">
            <QuickActions items={[
              { icon: 'search', tone: 'indigo', title: 'Find Substitute', hint: 'Cover an open period now',
                onClick: () => onSwitchTab('manual') },
              { icon: 'sliders', tone: 'violet', title: 'Balance Workload', hint: 'Open the timetable reports',
                onClick: () => { window.location.href = '/admin/timetable/reports'; } },
              { icon: 'download', tone: 'green', title: 'Export Report', hint: 'Download this table as CSV',
                onClick: exportCsv, disabled: !rows.length },
              { icon: 'history', tone: 'amber', title: 'View History', hint: 'Recent substitution activity',
                onClick: () => onSwitchTab('board') },
            ]} />
          </Panel>
        </div>
      </div>

      <Modal open={charts} onClose={() => setCharts(false)} maxWidth={760} title="Workload at a glance"
        footer={<Button variant="secondary" onClick={() => setCharts(false)}>Close</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Note tone="info">
            Every teacher’s total load against the school’s weekly target of {th.target}.
          </Note>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
            {rows.map((r) => (
              <div key={r.teacher._id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 150, fontSize: '.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.teacher.name}
                </span>
                <Bar value={r.totalLoad} max={th.target || 1}
                  tone={r.status === 'overloaded' ? 'bad' : r.status === 'underloaded' ? 'warn' : 'good'} />
                <span className="tt-num" style={{ width: 28, textAlign: 'right', fontSize: '.84rem' }}>{r.totalLoad}</span>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Quote every field — a teacher called "Kumar, R." must not become two columns. */
export function downloadCsv(rows, filename) {
  const csv = rows.map((r) => r.map((cell) => {
    const v = cell == null ? '' : String(cell);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════════════════════════════
   Settings
══════════════════════════════════════════════════════════════════════════ */

const DEFAULTS = {
  autoAssign: true, useAttendance: true, useLeave: true, skipPeriodsAlreadyStarted: true,
  unmarkedAbsentAfter: '09:30', halfDayAbsentAfter: '12:00',
  useUnapprovedLeave: false, useOnDuty: true,
  respectAvailabilityBlocks: true, respectDailyPeriodCap: true, requireSubjectMatch: false,
  allowCrossDepartment: true, excludeTeachersOnLeave: true,
  maxSubstitutionsPerDay: 2,
  weightSubsToday: 100, weightSubsWeek: 20, weightSubsMonth: 5, weightNormalToday: 8,
  bonusSubjectMatch: 30, bonusSameSection: 10,
  notifySubstitute: true, notifyOriginalTeacher: true, notifyOnChange: true, emailSubstitute: false,
  historyYears: 1, includeSubsInWorkload: true, showInTeacherTimetable: true, allowExport: true,
};

export function SettingsTab() {
  const [s, setS]         = useState(null);
  const [flags, setFlags] = useState({});
  const [loading, setLoad]= useState(true);
  const [saving, setSave] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(() => {
    setLoad(true);
    api.getSettings()
      .then((res) => {
        const d = unwrap(res);
        setS({ ...DEFAULTS, ...d.settings });
        setFlags(d.moduleFlags || {});
        setDirty(false);
      })
      .catch((e) => toast.error(e.message || 'Could not load the settings'))
      .finally(() => setLoad(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (v) => { setS((p) => ({ ...p, [k]: v })); setDirty(true); };
  const num = (k) => (e) => { setS((p) => ({ ...p, [k]: Number(e.target.value) })); setDirty(true); };

  const save = async () => {
    setSave(true);
    try {
      const res = await api.saveSettings(s);
      setS({ ...DEFAULTS, ...unwrap(res) });
      setDirty(false);
      toast.success('Settings saved');
    } catch (e) { toast.error(e.message || 'Could not save'); }
    finally { setSave(false); }
  };

  if (loading || !s) return <Card><Loading /></Card>;

  return (
    <Card icon="settings" title="Substitution Settings"
      subtitle="Configure how substitutions are detected, assigned and managed."
      actions={<Button size="sm" variant="secondary" onClick={() => { setS({ ...s, ...DEFAULTS }); setDirty(true); }}>
        <Icon name="refresh" size={15} /> Reset to Default
      </Button>}
      foot={<>
        <span className="tt-count">
          {dirty ? 'Unsaved changes' : 'Everything on this page is saved'}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={load} disabled={!dirty}>Cancel</Button>
          <Button onClick={save} loading={saving}>
            <Icon name="save" size={15} /> Save Settings
          </Button>
        </div>
      </>}>
      <Body>
        <div className="tt-setgrid tt-setgrid--trio">
          <SetCard tone="indigo" icon="wand" title="Automation"
            hint="Set when and how the system should automatically assign substitutes.">
            <SwitchRow lead checked={s.autoAssign} onChange={set('autoAssign')}
              title="Assign substitutes automatically"
              hint="A sweep covers each affected period with the fairest free teacher and tells them. Off keeps every assignment a decision — detection and ranking still run." />
            <SwitchRow lead checked={s.useAttendance} onChange={set('useAttendance')}
              disabled={!flags.attendance}
              title="Detect absences from teacher attendance"
              hint={flags.attendance
                ? 'Absent, Half-Day and Leave records, plus anyone who never marked after the cutoff.'
                : 'The Attendance module is off for this school.'} />
            <SwitchRow lead checked={s.useLeave} onChange={set('useLeave')} disabled={!flags.leave}
              title="Detect absences from approved leave"
              hint={flags.leave ? 'Any approved leave covering the date.' : 'The Leave module is off for this school.'} />
            <SwitchRow lead checked={s.skipPeriodsAlreadyStarted} onChange={set('skipPeriodsAlreadyStarted')}
              title="Don’t auto-assign started periods"
              hint="Nobody can act on a notification that arrives mid-class. These can still be assigned by hand." />
          </SetCard>

          <SetCard tone="violet" icon="clock" title="Absence Detection"
            hint="Define time and rules for considering a teacher absent.">
            <Field label="Mark as absent after"
              hint="Before this, a teacher who hasn’t marked is assumed to be on their way. Ignored on days nobody marked at all.">
              <input type="time" className="form-control" value={s.unmarkedAbsentAfter || '09:30'}
                onChange={(e) => set('unmarkedAbsentAfter')(e.target.value)} />
            </Field>
            <Field label="Consider half-day absent if absent after"
              hint="Where the register says “half day” without saying which half, periods from this time on are the ones covered.">
              <input type="time" className="form-control" value={s.halfDayAbsentAfter || '12:00'}
                onChange={(e) => set('halfDayAbsentAfter')(e.target.value)} />
            </Field>
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Include these in absence detection
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <CheckRow checked={s.useAttendance} onChange={set('useAttendance')} disabled={!flags.attendance}>
                  Teacher attendance
                </CheckRow>
                <CheckRow checked={s.useLeave} onChange={set('useLeave')} disabled={!flags.leave}>
                  Approved leaves
                </CheckRow>
                <CheckRow checked={s.useUnapprovedLeave} onChange={set('useUnapprovedLeave')} disabled={!flags.leave}>
                  Unapproved leaves
                </CheckRow>
                <CheckRow checked={s.useOnDuty} onChange={set('useOnDuty')} disabled={!flags.leave}>
                  On duty / official work
                </CheckRow>
              </div>
            </div>
          </SetCard>

          <SetCard tone="green" icon="users" title="Substitute Eligibility"
            hint="Define who can be offered as a substitute.">
            <SwitchRow lead checked={s.respectAvailabilityBlocks} onChange={set('respectAvailabilityBlocks')}
              title="Respect teacher availability blocks"
              hint="The same blocked slots the timetable generator honours." />
            <SwitchRow lead checked={s.respectDailyPeriodCap} onChange={set('respectDailyPeriodCap')}
              title="Respect maximum periods per day"
              hint="Counts normal periods and covers together against the teacher’s daily cap." />
            <SwitchRow lead checked={s.requireSubjectMatch} onChange={set('requireSubjectMatch')}
              title="Only offer teachers who teach this subject"
              hint="Off by default — covering is usually supervision, and a strict filter leaves periods with nobody at all. A match is still rewarded in the ranking." />
            <SwitchRow lead checked={s.allowCrossDepartment} onChange={set('allowCrossDepartment')}
              title="Allow cross-department substitutes"
              hint="Off restricts cover to the absent teacher’s own department. Teachers with no recorded department are never excluded by this." />
            <SwitchRow lead checked={s.excludeTeachersOnLeave} onChange={set('excludeTeachersOnLeave')}
              title="Exclude teachers with leave on the same day"
              hint="Never offer somebody who is themselves away — including the other half of a half day." />
          </SetCard>

          <SetCard tone="amber" icon="sliders" title="Limits & Fairness"
            hint="Set limits and weights for fair distribution.">
            <Field label="Maximum substitutions per teacher per day" hint="0 means no limit.">
              <input type="number" min="0" className="form-control" style={{ maxWidth: 160 }}
                value={s.maxSubstitutionsPerDay} onChange={num('maxSubstitutionsPerDay')} />
            </Field>
            <div>
              <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                Fairness weights (used in auto assignment)
              </span>
              <p style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 }}>
                Candidates are ranked lowest score first. Weights push a teacher down as their load
                grows; bonuses lift somebody who already knows the subject or the class.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 8 }}>
                <Field label="Substitutions today">
                  <input type="number" min="0" className="form-control" value={s.weightSubsToday} onChange={num('weightSubsToday')} />
                </Field>
                <Field label="Substitutions this week">
                  <input type="number" min="0" className="form-control" value={s.weightSubsWeek} onChange={num('weightSubsWeek')} />
                </Field>
                <Field label="Substitutions this month">
                  <input type="number" min="0" className="form-control" value={s.weightSubsMonth} onChange={num('weightSubsMonth')} />
                </Field>
                <Field label="Normal periods today">
                  <input type="number" min="0" className="form-control" value={s.weightNormalToday} onChange={num('weightNormalToday')} />
                </Field>
                <Field label="Bonus: teaches subject">
                  <input type="number" min="0" className="form-control" value={s.bonusSubjectMatch} onChange={num('bonusSubjectMatch')} />
                </Field>
                <Field label="Bonus: already teaches class">
                  <input type="number" min="0" className="form-control" value={s.bonusSameSection} onChange={num('bonusSameSection')} />
                </Field>
              </div>
            </div>
          </SetCard>

          <SetCard tone="blue" icon="bell" title="Notifications" hint="Choose who gets notified and how.">
            <SwitchRow lead checked={s.notifySubstitute} onChange={set('notifySubstitute')}
              title="Notify the substitute teacher"
              hint="Class, section, subject, date, period and time, the absent teacher’s name, and any instructions." />
            <SwitchRow lead checked={s.notifyOriginalTeacher} onChange={set('notifyOriginalTeacher')}
              title="Tell the absent teacher"
              hint="Inform them who is covering their class." />
            <SwitchRow lead checked={s.notifyOnChange} onChange={set('notifyOnChange')}
              title="Notify on change or cancellation"
              hint="A teacher moved off a period, or whose cover is cancelled, is told." />
            <SwitchRow lead checked={s.emailSubstitute} onChange={set('emailSubstitute')}
              title="Also send by email"
              hint="Uses the school’s own SMTP settings." />
            <Button size="sm" variant="secondary" onClick={() => { window.location.href = '/admin/school-settings'; }}>
              <Icon name="mail" size={15} /> Configure Email Settings
            </Button>
          </SetCard>

          <SetCard tone="teal" icon="chart" title="Reports & Records"
            hint="Configure data retention and reporting options.">
            <Field label="Keep substitution history for"
              hint="Older rows are never deleted — they simply stop being listed, so lengthening this brings them back.">
              <select className="form-control" value={s.historyYears}
                onChange={(e) => set('historyYears')(Number(e.target.value))}>
                {[1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>{n} Academic Year{n === 1 ? '' : 's'}</option>
                ))}
              </select>
            </Field>
            <SwitchRow lead checked={s.includeSubsInWorkload} onChange={set('includeSubsInWorkload')}
              title="Include substitutions in teacher workload"
              hint="Count covered periods in the workload reports." />
            <SwitchRow lead checked={s.showInTeacherTimetable} onChange={set('showInTeacherTimetable')}
              title="Show in teacher timetable"
              hint="Display the cover on the substitute’s own timetable." />
            <SwitchRow lead checked={s.allowExport} onChange={set('allowExport')}
              title="Allow export of substitution records"
              hint="Offer the CSV download on the board and the reports." />
          </SetCard>
        </div>
      </Body>
    </Card>
  );
}
