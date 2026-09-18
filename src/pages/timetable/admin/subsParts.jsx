/**
 * Shared vocabulary and dialogs for the four substitution screens.
 *
 * The board, the manual form, the workload roll-up and the settings all speak
 * about the same three things — a period that needs covering, a teacher who
 * could cover it, and whether the cover is agreed — so those live here rather
 * than being spelled three slightly different ways.
 */
import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Modal, Button, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/substitute.api';
import {
  Chip, Note, Person, Avatar, Field, Search, Loading, Pager,
  fmtDay, timeRange, plural, toneFor,
} from './ttUI';

export const unwrap = (res) => res?.data ?? res;

/* ── Coverage state ────────────────────────────────────────────────────────
   Three words, and they have to mean the same thing on every screen:

   covered    a substitute is on the hook and has been told
   pending    the period is open but nobody is being chased yet — a half-day
              absence the system cannot place, or a leave still unapproved
   uncovered  nobody is on it and nobody has flagged why

   `needsReview` is what separates the last two: it is set exactly when the
   system declined to auto-assign because a human has to decide first. */
export function statusOf(row) {
  if (row.status === 'cancelled') return 'cancelled';
  if (row.status === 'assigned') return 'covered';
  return row.needsReview ? 'pending' : 'uncovered';
}

export const STATUS_META = {
  covered:   { label: 'Covered',   tone: 'green',  dot: '#10b981' },
  pending:   { label: 'Pending',   tone: 'amber',  dot: '#f59e0b' },
  uncovered: { label: 'Uncovered', tone: 'red',    dot: '#ef4444' },
  cancelled: { label: 'Cancelled', tone: 'slate',  dot: '#94a3b8' },
};

export const REASON_META = {
  absent: { label: 'Absent',        tone: 'red' },
  leave:  { label: 'Leave',         tone: 'amber' },
  manual: { label: 'Manual',        tone: 'indigo' },
};

export const REASON_OPTIONS = [
  ['absent', 'Absent'],
  ['leave', 'On leave'],
  ['manual', 'Official duty / other'],
];

export const StatusChip = ({ state }) => {
  const m = STATUS_META[state] || STATUS_META.uncovered;
  return <Chip tone={m.tone} dot>{m.label}</Chip>;
};

/* ── The date the board is about ───────────────────────────────────────────
   A day at a time, with yesterday and tomorrow one click away — the two days
   an admin moves between most, and typing a date to see yesterday is absurd. */
export function DateStepper({ value, onChange, today }) {
  const shift = (days) => {
    const d = new Date(`${value}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    onChange(d.toISOString().slice(0, 10));
  };
  const isToday = value === today;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', paddingRight: 10 }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => shift(-1)} aria-label="Previous day">
        <Icon name="chevronLeft" size={15} />
      </button>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px',
        border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-card)', cursor: 'pointer',
      }}>
        <Icon name="calendar" size={16} />
        <span style={{ fontSize: '.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {fmtDay(value, { weekday: 'long' })}
        </span>
        <input type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)}
          style={{ width: 0, opacity: 0, padding: 0, border: 0, position: 'absolute' }} />
      </label>
      {!isToday && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(today)}>Today</button>
      )}
      {isToday && <Chip tone="indigo">Today</Chip>}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => shift(1)} aria-label="Next day">
        <Icon name="chevronRight" size={15} />
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Choosing a substitute for one period
══════════════════════════════════════════════════════════════════════════ */

export function CandidateModal({ assignment, onClose, onDone }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState(assignment?.remarks || '');
  const [saving, setSaving] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getCandidates(assignment._id)
      .then((res) => { if (alive) setData(unwrap(res)); })
      .catch((e) => toast.error(e.message || 'Could not load the free teachers'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [assignment._id]);

  const commit = async (teacherId, force) => {
    setSaving(teacherId);
    try {
      await api.assign(assignment._id, teacherId, remarks, force);
      toast.success('Assigned — the substitute has been told');
      onDone();
    } catch (e) {
      const msg = e.message || 'Could not assign';
      // 409 is the eligibility guard, not a failure: offer the override rather
      // than making the admin guess why nothing happened.
      if (/not available/i.test(msg) && !force) {
        if (window.confirm(`${msg}\n\nAssign them anyway?`)) return commit(teacherId, true);
      } else toast.error(msg);
    } finally { setSaving(''); }
  };

  const current = assignment.substituteTeacher;
  const all = data?.candidates || [];
  const candidates = search
    ? all.filter((c) => c.teacher.name.toLowerCase().includes(search.toLowerCase()))
    : all;

  return (
    <Modal open onClose={onClose} maxWidth={720}
      title={`Period ${assignment.periodNumber} · ${assignment.section?.label || ''}`}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip tone={toneFor(assignment.subject?._id)}>{assignment.subject?.name || 'Subject'}</Chip>
          <span style={{ fontSize: '.84rem', color: 'var(--text-muted)' }}>
            {timeRange(assignment.startTime, assignment.endTime)} · covering for{' '}
            <strong style={{ color: 'var(--text)' }}>{assignment.originalTeacher?.name}</strong>
          </span>
        </div>

        {current && (
          <Note tone="info">
            <strong>{current.name}</strong> has this period. Choosing someone else moves it to them
            and tells both teachers.
          </Note>
        )}

        <Field label="Instructions for whoever covers it (optional)">
          <textarea className="form-control" rows={2} value={remarks} maxLength={200}
            placeholder="e.g. carry on from exercise 4.2 — the worksheets are on my desk"
            onChange={(e) => setRemarks(e.target.value)} />
        </Field>

        {loading ? <Loading label="Working out who is free…" /> : !all.length ? (
          <Note tone="warn">
            Nobody is free for this period. Everyone else is teaching, away, already covering
            another class, or at their limit for the day. Relax the rules in Settings, or assign
            from the full staff list on the Manual Assignment tab.
          </Note>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '.88rem' }}>
                {plural(all.length, 'teacher')} free at this time
              </strong>
              {data.ineligibleCount > 0 && (
                <span className="tt-count">{data.ineligibleCount} others unavailable</span>
              )}
              <div style={{ marginLeft: 'auto', minWidth: 200 }}>
                <Search value={search} onChange={setSearch} placeholder="Search teachers…" />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
              {candidates.map((c, i) => {
                const isCurrent = current && String(current._id) === String(c.teacher._id);
                return (
                  <div key={c.teacher._id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px',
                    border: `1px solid ${isCurrent ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-lg)',
                    background: i === 0 && !isCurrent ? 'var(--bg)' : 'transparent',
                  }}>
                    <Avatar name={c.teacher.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '.88rem' }}>{c.teacher.name}</strong>
                        {i === 0 && !isCurrent && <Chip tone="green">Fairest pick</Chip>}
                        {isCurrent && <Chip tone="indigo">Assigned</Chip>}
                        {c.subjectMatch && <Chip tone="blue">Teaches this subject</Chip>}
                        {c.sameSection && <Chip tone="slate">Knows this class</Chip>}
                      </div>
                      <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {c.workload.subsToday} cover{c.workload.subsToday === 1 ? '' : 's'} today ·
                        {' '}{c.workload.subsWeek} this week ·
                        {' '}{c.workload.normalToday} own period{c.workload.normalToday === 1 ? '' : 's'} today
                      </div>
                    </div>
                    <Button size="sm" variant={isCurrent ? 'secondary' : 'primary'}
                      loading={saving === c.teacher._id} disabled={isCurrent}
                      onClick={() => commit(c.teacher._id, false)}>
                      {isCurrent ? 'Current' : 'Assign'}
                    </Button>
                  </div>
                );
              })}
              {!candidates.length && (
                <span style={{ fontSize: '.84rem', color: 'var(--text-muted)' }}>No free teacher matches that.</span>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Covering several periods at once
══════════════════════════════════════════════════════════════════════════ */

/**
 * Bulk assignment. Every open period of the day, each with the teacher the
 * ranking would pick, all confirmed in one press.
 *
 * The picks are worked out per period as the dialog opens — an admin changing
 * one row should not silently invalidate the rest, so each row carries its own
 * candidate list and the server still refuses a clash it does not know about.
 */
export function BulkModal({ rows, date, onClose, onDone }) {
  const [choice, setChoice] = useState({});
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const opts = {};
      const picks = {};
      for (const row of rows) {
        try {
          const d = unwrap(await api.getCandidates(row._id));
          opts[row._id] = d.candidates || [];
          if (d.candidates?.length) picks[row._id] = d.candidates[0].teacher._id;
        } catch { opts[row._id] = []; }
      }
      if (!alive) return;
      setOptions(opts);
      setChoice(picks);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [rows]);

  const chosen = Object.entries(choice).filter(([, v]) => v);

  const run = async () => {
    setSaving(true);
    try {
      const res = unwrap(await api.bulkAssign({
        date,
        items: chosen.map(([id, substituteTeacherId]) => ({ id, substituteTeacherId })),
      }));
      if (res.assigned) toast.success(`${plural(res.assigned, 'period')} covered`);
      if (res.failed?.length) {
        toast.error(`${plural(res.failed.length, 'period')} could not be covered — ${res.failed[0].message}`);
      }
      onDone();
    } catch (e) { toast.error(e.message || 'Could not assign'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} maxWidth={720} title="Cover every open period"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={run} loading={saving} disabled={loading || !chosen.length}>
          Assign {plural(chosen.length, 'period')}
        </Button>
      </>}>
      {loading ? <Loading label="Ranking the free teachers for each period…" /> : !rows.length ? (
        <Note tone="good">Every period is already covered.</Note>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Note tone="info">
            Each row starts on the teacher the fairness ranking would choose. Change any of them,
            or set one to “Leave open” to skip it.
          </Note>
          <div className="tt-tablewrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table className="tt-table">
              <thead>
                <tr><th>Period</th><th>Class</th><th>Covering for</th><th>Substitute</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id}>
                    <td><span className="tt-period">{row.periodNumber}</span></td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.section?.label}</div>
                      <div className="tt-table__muted" style={{ fontSize: '.76rem' }}>{row.subject?.name}</div>
                    </td>
                    <td className="tt-nowrap">{row.originalTeacher?.name}</td>
                    <td>
                      <select className="form-control" value={choice[row._id] || ''}
                        onChange={(e) => setChoice((c) => ({ ...c, [row._id]: e.target.value }))}>
                        <option value="">Leave open</option>
                        {(options[row._id] || []).map((c) => (
                          <option key={c.teacher._id} value={c.teacher._id}>
                            {c.teacher.name}{c.subjectMatch ? ' — teaches it' : ''}
                          </option>
                        ))}
                      </select>
                      {!(options[row._id] || []).length && (
                        <span style={{ fontSize: '.75rem', color: 'var(--danger)' }}>Nobody is free</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The history of one day, cancellations included
══════════════════════════════════════════════════════════════════════════ */

export function HistoryModal({ date, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.getHistory(date)
      .then((res) => setRows(unwrap(res)?.rows || []))
      .catch((e) => { toast.error(e.message); setRows([]); });
  }, [date]);

  return (
    <Modal open onClose={onClose} maxWidth={720} title={`Everything that happened on ${fmtDay(date)}`}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {!rows ? <Loading /> : !rows.length ? (
        <Note tone="quiet">Nothing was substituted on this day.</Note>
      ) : (
        <div className="tt-tablewrap" style={{ maxHeight: 440, overflowY: 'auto' }}>
          <table className="tt-table">
            <thead>
              <tr><th>Period</th><th>Class</th><th>Away</th><th>Covered by</th><th>State</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td><span className="tt-period">{r.periodNumber}</span></td>
                  <td>{r.section?.label}</td>
                  <td>{r.originalTeacher?.name}</td>
                  <td>{r.substituteTeacher?.name || <span className="tt-table__muted">Nobody</span>}</td>
                  <td><StatusChip state={statusOf(r)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Recent activity — the same table on two screens
══════════════════════════════════════════════════════════════════════════ */

export function RecentTable({ rows, loading, columns = 'day', onOpen, onViewAll }) {
  if (loading) return <Loading label="Loading recent activity…" />;
  if (!rows.length) {
    return <Note tone="quiet">Nothing substituted recently.</Note>;
  }
  return (
    <div className="tt-tablewrap">
      <table className="tt-table">
        <thead>
          {columns === 'day' ? (
            <tr><th>Date</th><th>Teacher</th><th>Reason</th><th>Status</th><th /></tr>
          ) : (
            <tr>
              <th>Date</th><th>Period</th><th>Class</th><th>Subject</th>
              <th>Absent teacher</th><th>Substitute</th><th>Reason</th><th>Assigned by</th>
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((r) => (columns === 'day' ? (
            <tr key={r._id}>
              <td className="tt-nowrap">{fmtDay(r.date)}</td>
              <td><Person name={r.originalTeacher?.name} /></td>
              <td><Chip tone={(REASON_META[r.reason] || REASON_META.manual).tone}>
                {(REASON_META[r.reason] || REASON_META.manual).label}
              </Chip></td>
              <td><StatusChip state={statusOf(r)} /></td>
              <td>
                <Button size="sm" variant="secondary" onClick={() => onOpen?.(r)}>View</Button>
              </td>
            </tr>
          ) : (
            <tr key={r._id}>
              <td className="tt-nowrap">{fmtDay(r.date)}</td>
              <td><span className="tt-period">{r.periodNumber}</span></td>
              <td className="tt-nowrap">{r.section?.label}</td>
              <td><Chip tone={toneFor(r.subject?._id)}>{r.subject?.name || '—'}</Chip></td>
              <td className="tt-nowrap">{r.originalTeacher?.name}</td>
              <td className="tt-nowrap">{r.substituteTeacher?.name || <span className="tt-table__muted">—</span>}</td>
              <td><Chip tone={(REASON_META[r.reason] || REASON_META.manual).tone}>
                {(REASON_META[r.reason] || REASON_META.manual).label}
              </Chip></td>
              <td className="tt-nowrap tt-table__muted">{r.assignedBy?.name || 'System'}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </div>
  );
}
