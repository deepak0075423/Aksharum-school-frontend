import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, Button, Badge, Spinner, Modal, Empty, Table,
  Input, Select, Textarea, Alert, StatCard,
} from '../../components/ui/index';
import * as api from '../../api/substitute.api';

/**
 * Substitute Subject Teacher — the admin surface.
 *
 * Board     one day at a time: who is away, every period they were due to
 *           teach, and who is covering it. Opening the page runs detection, so
 *           an absence marked five minutes ago is already here.
 * Manual    pick any teacher and cover their periods by hand. This is the whole
 *           workflow for a school with neither attendance nor leave enabled,
 *           and an escape hatch for everyone else.
 * Workload  normal load vs substitute load per teacher over a date range.
 * Settings  automation, eligibility rules, fairness weights, notifications.
 */

const todayIso = () => new Date().toISOString().slice(0, 10);

const fmtDay = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
};

const periodTime = (p) => (p.startTime ? `${p.startTime}${p.endTime ? `–${p.endTime}` : ''}` : '');

const REASON_META = {
  absent: { label: 'Absent',  variant: 'danger'  },
  leave:  { label: 'On leave', variant: 'warning' },
  manual: { label: 'Manual',  variant: 'primary' },
};

/* ── The six counts, spec §5 ───────────────────────────────────────────────── */
// Substitute load is shown first and emphasised: it is the number the admin is
// trying to keep level, while normal load is the context that makes it fair.
function WorkloadGrid({ w, compact }) {
  if (!w) return null;
  const cell = (label, value, strong) => (
    <div key={label} style={{ textAlign: 'center', minWidth: compact ? 44 : 58 }}>
      <div style={{
        fontSize: compact ? '.95rem' : '1.15rem', fontWeight: 700,
        color: strong && value > 0 ? 'var(--danger, #dc2626)' : 'var(--text-primary)',
      }}>{value}</div>
      <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
        {label}
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: compact ? 10 : 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2 }}>SUBSTITUTE</div>
        <div style={{ display: 'flex', gap: compact ? 6 : 10 }}>
          {cell('Today', w.subsToday, true)}
          {cell('Week',  w.subsWeek,  true)}
          {cell('Month', w.subsMonth, true)}
        </div>
      </div>
      <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: compact ? 10 : 16 }}>
        <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2 }}>NORMAL</div>
        <div style={{ display: 'flex', gap: compact ? 6 : 10 }}>
          {cell('Today', w.normalToday)}
          {cell('Week',  w.normalWeek)}
          {cell('Month', w.normalMonth)}
        </div>
      </div>
    </div>
  );
}

/* ── Choose a substitute for one period ────────────────────────────────────── */
function CandidateModal({ assignment, onClose, onDone }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState(assignment?.remarks || '');
  const [saving, setSaving]   = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getCandidates(assignment._id)
      .then((res) => { if (alive) setData(res?.data ?? res); })
      .catch((e) => toast.error(e.message || 'Could not load candidates'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [assignment._id]);

  const commit = async (teacherId, force) => {
    setSaving(teacherId);
    try {
      await api.assign(assignment._id, teacherId, remarks, force);
      toast.success('Substitute assigned — they have been notified');
      onDone();
    } catch (e) {
      // 409 means the server refused on an eligibility clash. Offer the override
      // rather than making the admin guess why nothing happened.
      const msg = e.message || 'Could not assign';
      if (/not available/i.test(msg) && !force) {
        if (window.confirm(`${msg}\n\nAssign anyway?`)) return commit(teacherId, true);
      } else toast.error(msg);
    } finally { setSaving(''); }
  };

  const current = assignment.substituteTeacher;
  const candidates = data?.candidates || [];

  return (
    <Modal open onClose={onClose} maxWidth={860}
      title={`Period ${assignment.periodNumber} · ${assignment.section?.label || ''}`}>
      <div style={{ marginBottom: 14, fontSize: '.85rem', color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>{assignment.subject?.name || 'Subject'}</strong>
        {periodTime(assignment) && ` · ${periodTime(assignment)}`}
        {' · covering for '}
        <strong style={{ color: 'var(--text-primary)' }}>{assignment.originalTeacher?.name}</strong>
      </div>

      {current && (
        <Alert variant="info">
          Currently assigned to <strong>{current.name}</strong>. Choosing someone else
          reassigns the period and notifies both teachers.
        </Alert>
      )}

      <Textarea label="Instructions for the substitute (optional)" rows={2} value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        placeholder="e.g. continue from exercise 4.2, worksheets are on my desk" />

      {loading ? (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : !candidates.length ? (
        <Empty icon="🚫" title="No teacher is free for this period"
          message="Everyone else is teaching, away, already covering another class, or at their daily limit. Adjust the limits in Settings, or assign from the full staff list in the Manual tab." />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '14px 0 8px' }}>
            <strong style={{ fontSize: '.85rem' }}>{candidates.length} teacher{candidates.length === 1 ? '' : 's'} free at this time</strong>
            {data?.ineligibleCount > 0 && (
              <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                {data.ineligibleCount} unavailable
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
            {candidates.map((c, i) => {
              const isCurrent = current && String(current._id) === String(c.teacher._id);
              return (
                <div key={c.teacher._id} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px',
                  border: `1px solid ${isCurrent ? 'var(--primary, #4f46e5)' : 'var(--border)'}`,
                  borderRadius: 10, background: i === 0 && !isCurrent ? 'var(--bg-secondary)' : 'transparent',
                }}>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {c.teacher.name}
                      {/* The top row is what auto-assign would pick. */}
                      {i === 0 && !isCurrent && <Badge variant="success">Fairest pick</Badge>}
                      {isCurrent && <Badge variant="primary">Assigned</Badge>}
                      {c.subjectMatch && <Badge variant="info">Teaches {assignment.subject?.name || 'subject'}</Badge>}
                      {c.sameSection && <Badge variant="muted">Knows this class</Badge>}
                    </div>
                  </div>
                  <WorkloadGrid w={c.workload} compact />
                  <Button size="sm" variant={isCurrent ? 'secondary' : 'primary'}
                    loading={saving === c.teacher._id} disabled={isCurrent}
                    onClick={() => commit(c.teacher._id, false)}>
                    {isCurrent ? 'Current' : 'Assign'}
                  </Button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ── One period row on the board ───────────────────────────────────────────── */
function PeriodRow({ p, onPick, onCancel }) {
  const covered = p.status === 'assigned';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
      borderTop: '1px solid var(--border)', flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 92 }}>
        <div style={{ fontWeight: 700 }}>Period {p.periodNumber}</div>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{periodTime(p) || '—'}</div>
      </div>
      <div style={{ flex: 1, minWidth: 170 }}>
        <div style={{ fontWeight: 600 }}>{p.section?.label || '—'}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{p.subject?.name || '—'}</div>
      </div>
      <div style={{ flex: 1, minWidth: 180 }}>
        {covered ? (
          <>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {p.substituteTeacher?.name}
              {p.assignedVia === 'auto' && <Badge variant="muted">Auto</Badge>}
              {p.notifiedAt && <span title="Substitute notified" style={{ fontSize: '.72rem' }}>🔔</span>}
            </div>
            {p.remarks && (
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>“{p.remarks}”</div>
            )}
          </>
        ) : (
          <Badge variant={p.needsReview ? 'warning' : 'danger'}>
            {p.needsReview ? 'Needs your decision' : 'Uncovered'}
          </Badge>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant={covered ? 'secondary' : 'primary'} onClick={() => onPick(p)}>
          {covered ? 'Change' : 'Assign'}
        </Button>
        {covered && (
          <Button size="sm" variant="danger" onClick={() => onCancel(p)}>Cancel</Button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Board
══════════════════════════════════════════════════════════════════════════ */
function BoardTab({ date, setDate }) {
  const [board, setBoard]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [picking, setPicking] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getBoard(date);
      setBoard(res?.data ?? res);
    } catch (e) { toast.error(e.message || 'Could not load the board'); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const fill = async () => {
    setRunning(true);
    try {
      const res = await api.runAutoAssign(date, true);
      const r = res?.data ?? res;
      setBoard(r.board);
      toast.success(r.assigned
        ? `${r.assigned} period${r.assigned === 1 ? '' : 's'} covered`
        : r.uncovered ? 'No free teacher could be found for the open periods'
        : 'Everything is already covered');
    } catch (e) { toast.error(e.message || 'Could not run auto-assign'); }
    finally { setRunning(false); }
  };

  const cancel = async (p) => {
    if (!window.confirm(`Cancel ${p.substituteTeacher?.name}'s substitute class for period ${p.periodNumber}? They will be notified.`)) return;
    try {
      await api.cancel(p._id, 'Cancelled by admin');
      toast.success('Cancelled — the teacher has been notified');
      load();
    } catch (e) { toast.error(e.message || 'Could not cancel'); }
  };

  const s = board?.summary || {};
  const sources = board?.sources || {};
  const manualOnly = board && !sources.attendance && !sources.leave;

  return (
    <>
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', padding: 4 }}>
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ maxWidth: 190 }} />
          <div style={{ flex: 1, minWidth: 180, paddingBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{fmtDay(date)}</div>
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
              {/* Say plainly where absences are being read from — with both
                  modules off this screen is manual-only, and that should not
                  look like a bug. */}
              {manualOnly
                ? 'Attendance and Leave are both off — assign substitutes from the Manual tab'
                : `Detecting from ${[sources.attendance && 'attendance', sources.leave && 'approved leave']
                    .filter(Boolean).join(' and ')}`}
            </div>
          </div>
          <Button onClick={fill} loading={running} disabled={loading || !board?.isWorkingDay}>
            ⚡ Detect &amp; fill uncovered
          </Button>
          <Button variant="secondary" onClick={load} disabled={loading}>Refresh</Button>
        </div>
      </Card>

      {loading ? (
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : !board?.hasTimetable ? (
        <Alert variant="warning">
          No published timetable for the active academic year. Substitution works off the
          published timetable — publish one from the Versions tab first.
        </Alert>
      ) : !board.isWorkingDay ? (
        <Empty icon="🌴" title="Not a school day"
          message={`${fmtDay(date)} is a holiday or weekly off, so there is nothing to cover.`} />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, margin: '16px 0' }}>
            <StatCard icon="📋" label="Periods needing cover" value={s.total || 0}      color="blue" />
            <StatCard icon="✅" label="Covered"               value={s.assigned || 0}   color="green" />
            <StatCard icon="⚠️" label="Uncovered"             value={s.uncovered || 0}  color="red" />
            <StatCard icon="👀" label="Needs your decision"   value={s.needsReview || 0} color="orange" />
          </div>

          {!board.absentTeachers.length ? (
            <Empty icon="🎉" title="Full attendance"
              message="No teacher is recorded away today, so no period needs covering." />
          ) : board.absentTeachers.map((a) => (
            <Card key={a.teacher._id} title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {a.teacher.name}
                <Badge variant={(REASON_META[a.reason] || {}).variant || 'muted'}>{a.label}</Badge>
                <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  {a.periods.length} period{a.periods.length === 1 ? '' : 's'} to cover
                </span>
              </span>
            }>
              {a.needsReview && (
                <Alert variant="warning">
                  This is a half-day absence — the system cannot tell which half, so it has
                  not assigned anyone automatically. Cover the periods that apply.
                </Alert>
              )}
              <div style={{ margin: '0 -16px -16px' }}>
                {a.periods.map((p) => (
                  <PeriodRow key={p._id} p={p} onPick={setPicking} onCancel={cancel} />
                ))}
              </div>
            </Card>
          ))}
        </>
      )}

      {picking && (
        <CandidateModal assignment={picking} onClose={() => setPicking(null)}
          onDone={() => { setPicking(null); load(); }} />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Manual — pick a teacher, cover their periods (spec §4)
══════════════════════════════════════════════════════════════════════════ */
function ManualTab({ date, setDate }) {
  const [teachers, setTeachers] = useState([]);
  const [teacherId, setTeacherId] = useState('');
  const [detail, setDetail]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [picking, setPicking]   = useState(null);
  const [opening, setOpening]   = useState('');

  useEffect(() => {
    api.getSchedulableTeachers(date)
      .then((res) => setTeachers((res?.data ?? res)?.teachers || []))
      .catch(() => setTeachers([]));
  }, [date]);

  const loadPeriods = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    setLoading(true);
    try {
      const res = await api.getTeacherPeriods(id, date);
      setDetail(res?.data ?? res);
    } catch (e) { toast.error(e.message || 'Could not load periods'); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { loadPeriods(teacherId); }, [teacherId, loadPeriods]);

  // Open a substitution for a period with no recorded absence, then go straight
  // into the candidate list — an admin doing this already knows who is away.
  const openAndPick = async (p) => {
    setOpening(p.timetableEntry);
    try {
      const res = await api.createManual({
        timetableEntryId: p.timetableEntry,
        originalTeacherId: teacherId,
        date,
      });
      const row = res?.data ?? res;
      await loadPeriods(teacherId);
      setPicking(row);
    } catch (e) { toast.error(e.message || 'Could not open this period'); }
    finally { setOpening(''); }
  };

  const cancel = async (row) => {
    if (!window.confirm('Cancel this substitution? Any assigned teacher will be notified.')) return;
    try {
      await api.cancel(row._id, 'Cancelled by admin');
      toast.success('Cancelled');
      loadPeriods(teacherId);
    } catch (e) { toast.error(e.message || 'Could not cancel'); }
  };

  return (
    <>
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', padding: 4 }}>
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ maxWidth: 190 }} />
          <Select label="Subject teacher to cover" value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="">Select a teacher…</option>
            {teachers.map((t) => (
              <option key={t._id} value={t._id}>{t.name} — {t.periods} period{t.periods === 1 ? '' : 's'}</option>
            ))}
          </Select>
        </div>
        <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', padding: '0 4px' }}>
          Only teachers with periods on {fmtDay(date)} are listed.
        </div>
      </Card>

      {loading ? (
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : !detail ? (
        <Empty icon="🧑‍🏫" title="Pick a teacher"
          message="Choose whose periods need covering. You can do this whether or not an absence has been recorded." />
      ) : !detail.periods.length ? (
        <Empty icon="📭" title={`${detail.teacher.name} has no periods on ${detail.dayOfWeek}`} />
      ) : (
        <Card title={`${detail.teacher.name} · ${detail.periods.length} period${detail.periods.length === 1 ? '' : 's'} on ${detail.dayOfWeek}`}>
          <div style={{ margin: '0 -16px -16px' }}>
            {detail.periods.map((p) => {
              const row = p.assignment;
              return (
                <div key={p.timetableEntry} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  borderTop: '1px solid var(--border)', flexWrap: 'wrap',
                }}>
                  <div style={{ minWidth: 92 }}>
                    <div style={{ fontWeight: 700 }}>Period {p.periodNumber}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{periodTime(p) || '—'}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 170 }}>
                    <div style={{ fontWeight: 600 }}>{p.sectionLabel}</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{p.subjectName || '—'}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    {row?.substituteTeacher
                      ? <span style={{ fontWeight: 600 }}>{row.substituteTeacher.name}</span>
                      : row ? <Badge variant="danger">Uncovered</Badge>
                      : <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>No substitution</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {row ? (
                      <>
                        <Button size="sm" onClick={() => setPicking(row)}>
                          {row.substituteTeacher ? 'Change' : 'Assign'}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => cancel(row)}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="secondary" loading={opening === p.timetableEntry}
                        onClick={() => openAndPick(p)}>
                        Cover this period
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {picking && (
        <CandidateModal assignment={picking} onClose={() => setPicking(null)}
          onDone={() => { setPicking(null); loadPeriods(teacherId); }} />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Workload & reporting (spec §8)
══════════════════════════════════════════════════════════════════════════ */
function WorkloadTab({ date }) {
  const monthStart = useMemo(() => `${date.slice(0, 7)}-01`, [date]);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo]     = useState(date);
  const [report, setReport] = useState(null);
  const [today, setToday]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, w] = await Promise.all([api.getReport(from, to), api.getWorkload(date)]);
      setReport(r?.data ?? r);
      setToday(w?.data ?? w);
    } catch (e) { toast.error(e.message || 'Could not load the report'); }
    finally { setLoading(false); }
  }, [from, to, date]);

  useEffect(() => { load(); }, [load]);

  const byId = useMemo(
    () => new Map((today?.teachers || []).map((t) => [String(t.teacher._id), t])),
    [today],
  );

  const columns = [
    { key: 'name', label: 'Teacher', render: (r) => r.teacher.name },
    { key: 'normal', label: 'Normal periods', render: (r) => r.normalPeriods },
    {
      key: 'subs', label: 'Substitutions taken',
      render: (r) => (
        <strong style={{ color: r.substitutesTaken ? 'var(--danger, #dc2626)' : 'inherit' }}>
          {r.substitutesTaken}
        </strong>
      ),
    },
    { key: 'given', label: 'Own periods covered by others', render: (r) => r.periodsHandedOver },
    { key: 'total', label: 'Periods actually taught', render: (r) => r.totalTaught },
    {
      key: 'todaycols', label: 'Substitutes today / week / month',
      render: (r) => {
        const w = byId.get(String(r.teacher._id));
        return w ? `${w.subsToday} / ${w.subsWeek} / ${w.subsMonth}` : '—';
      },
    },
  ];

  return (
    <>
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', padding: 4 }}>
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 180 }} />
          <Input label="To"   type="date" value={to}   onChange={(e) => setTo(e.target.value)}   style={{ maxWidth: 180 }} />
          <Button onClick={load} loading={loading}>Apply</Button>
          {report && (
            <div style={{ marginLeft: 'auto', paddingBottom: 8, fontSize: '.8rem', color: 'var(--text-muted)' }}>
              {report.schoolDays} school day{report.schoolDays === 1 ? '' : 's'} ·{' '}
              {report.totals.substitutions} substitution{report.totals.substitutions === 1 ? '' : 's'} ·{' '}
              {report.totals.teachersUsed} teacher{report.totals.teachersUsed === 1 ? '' : 's'} used
            </div>
          )}
        </div>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', padding: '0 4px' }}>
          Normal periods count the timetable across the school days actually in this range,
          so holidays and weekly offs are already excluded.
        </div>
      </Card>

      <Card title="Normal load vs substitute load">
        <div style={{ margin: '0 -16px -16px' }}>
          <Table columns={columns} data={report?.teachers || []} loading={loading}
            emptyIcon="📊" emptyTitle="No teachers to report on" />
        </div>
      </Card>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Settings
══════════════════════════════════════════════════════════════════════════ */
function SettingsTab() {
  const [s, setS] = useState(null);
  const [flags, setFlags] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    api.getSettings()
      .then((res) => {
        const d = res?.data ?? res;
        setS(d.settings); setFlags(d.moduleFlags || {});
      })
      .catch((e) => toast.error(e.message || 'Could not load settings'))
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked
      : e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    setS((p) => ({ ...p, [k]: v }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.saveSettings(s);
      setS(res?.data ?? res);
      toast.success('Settings saved');
    } catch (e) { toast.error(e.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  if (!s) return null;

  const Check = ({ k, label, hint, disabled }) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', opacity: disabled ? 0.55 : 1 }}>
      <input type="checkbox" checked={!!s[k]} onChange={set(k)} disabled={disabled} style={{ marginTop: 3 }} />
      <span>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{hint}</div>}
      </span>
    </label>
  );

  return (
    <>
      <Card title="Automation">
        <Check k="autoAssign" label="Assign substitutes automatically"
          hint="A background sweep covers each affected period with the fairest available teacher and notifies them. Turn this off to keep every assignment a manual decision — detection and ranking still run." />
        <Check k="useAttendance" label="Detect absences from teacher attendance"
          disabled={!flags.attendance}
          hint={flags.attendance
            ? 'Absent, Half-Day and Leave records, plus teachers who never marked after the cutoff below.'
            : 'The Attendance module is not enabled for this school.'} />
        <Check k="useLeave" label="Detect absences from approved leave"
          disabled={!flags.leave}
          hint={flags.leave
            ? 'Any approved leave application covering the date.'
            : 'The Leave module is not enabled for this school.'} />
        <div style={{ maxWidth: 240, marginTop: 8 }}>
          <Input label="Treat unmarked attendance as absent after" type="time"
            value={s.unmarkedAbsentAfter || '09:30'} onChange={set('unmarkedAbsentAfter')}
            hint="Before this time a teacher who hasn't marked is assumed to be on their way. Ignored entirely on days nobody marked attendance at all." />
        </div>
        <Check k="skipPeriodsAlreadyStarted" label="Don't auto-assign a period that has already started"
          hint="Nobody can act on a notification that arrives mid-class. You can still assign these by hand." />
      </Card>

      <Card title="Who may be offered">
        <Check k="respectAvailabilityBlocks" label="Respect teacher availability blocks"
          hint="The same blocked slots the timetable generator honours." />
        <Check k="respectDailyPeriodCap" label="Respect each teacher's maximum periods per day"
          hint="Counts normal periods and substitutions together against the cap set in Teacher Availability." />
        <Check k="requireSubjectMatch" label="Only offer teachers who teach this subject"
          hint="Off by default — covering a period is usually supervision, and a strict filter can leave periods with nobody at all. A subject match is still rewarded in the ranking." />
        <div style={{ maxWidth: 240 }}>
          <Input label="Maximum substitutions per teacher per day" type="number" min={0}
            value={s.maxSubstitutionsPerDay} onChange={set('maxSubstitutionsPerDay')}
            hint="0 means no limit." />
        </div>
      </Card>

      <Card title="Fairness weights">
        <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginTop: 0 }}>
          Candidates are ranked by score, lowest first. Weights push a teacher down the list
          as their load grows; bonuses lift a teacher who already knows the subject or the class.
          The defaults favour "hasn't covered anything today" above everything else.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          <Input label="Substitutions today"  type="number" min={0} value={s.weightSubsToday}   onChange={set('weightSubsToday')} />
          <Input label="Substitutions this week"  type="number" min={0} value={s.weightSubsWeek} onChange={set('weightSubsWeek')} />
          <Input label="Substitutions this month" type="number" min={0} value={s.weightSubsMonth} onChange={set('weightSubsMonth')} />
          <Input label="Normal periods today" type="number" min={0} value={s.weightNormalToday} onChange={set('weightNormalToday')} />
          <Input label="Bonus: teaches the subject" type="number" min={0} value={s.bonusSubjectMatch} onChange={set('bonusSubjectMatch')} />
          <Input label="Bonus: already teaches the class" type="number" min={0} value={s.bonusSameSection} onChange={set('bonusSameSection')} />
        </div>
      </Card>

      <Card title="Notifications">
        <Check k="notifySubstitute" label="Notify the substitute teacher"
          hint="Class, section, subject, date, period and time, the original teacher's name, and any instructions you added." />
        <Check k="notifyOriginalTeacher" label="Tell the absent teacher who is covering their class" />
        <Check k="notifyOnChange" label="Notify on change or cancellation"
          hint="A teacher moved off a period, or whose substitution is cancelled, is told." />
        <Check k="emailSubstitute" label="Also send by email"
          hint="Uses the school's own SMTP settings when configured." />
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Button onClick={save} loading={saving}>Save settings</Button>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
const TABS = [
  ['board',    '📋 Today’s board'],
  ['manual',   '✍️ Manual assignment'],
  ['workload', '📊 Workload'],
  ['settings', '⚙️ Settings'],
];

export default function Substitutions() {
  const [tab, setTab]   = useState('board');
  const [date, setDate] = useState(todayIso());

  return (
    <div className="page">
      <PageHeader title="Substitute Teachers"
        subtitle="Cover the periods of absent subject teachers, fairly and automatically" />

      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(([key, label]) => (
          <button key={key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'board'    && <BoardTab    date={date} setDate={setDate} />}
      {tab === 'manual'   && <ManualTab   date={date} setDate={setDate} />}
      {tab === 'workload' && <WorkloadTab date={date} />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
