import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../api/admin.api';
import { Modal, Button, Spinner } from './ui/index';

/**
 * Delete / Deactivate a teacher, with what still points at them shown first.
 *
 * The account is the last thing to go, not the first: a section whose class
 * teacher has been deleted has nobody in charge of it, and a library copy booked
 * out to a deleted user can never be returned. So the dialog asks the server
 * what is still attached, lists it, and only offers the action once it is clear.
 *
 * The server enforces exactly the same rule on the write itself — this screen is
 * the explanation, never the enforcement. If it is somehow out of date, the
 * refusal comes back as a 409 carrying a fresh report, which is rendered in
 * place of the stale one.
 *
 * Timetable periods are the one thing that can be cleared for the admin, because
 * an unassigned period is a state the grid already shows as an open slot. That
 * is Force Deactivate, and it is only offered when the timetable is all that is
 * left in the way.
 */
export default function TeacherDependencyDialog({ open, teacher, action, onClose, onDone }) {
  const [report, setReport]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);

  const verb     = action === 'delete' ? 'Delete' : 'Deactivate';
  const verbPast = action === 'delete' ? 'deleted' : 'deactivated';

  useEffect(() => {
    if (!open || !teacher?._id) return;
    let alive = true;
    setLoading(true); setError(null); setReport(null);
    api.getTeacherDependencies(teacher._id)
      .then((res) => { if (alive) setReport(res?.data ?? res); })
      .catch((err) => { if (alive) setError(err.message || 'Could not check this teacher'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, teacher?._id]);

  const run = async (force = false) => {
    setBusy(true);
    try {
      const res = action === 'delete'
        ? await api.deleteTeacher(teacher._id, force)
        : await api.toggleTeacher(teacher._id, force);
      const cleared = res?.data?.clearedPeriods ?? 0;
      toast.success(cleared
        ? `${teacher.name} ${verbPast} — ${cleared} timetable period(s) unassigned`
        : `${teacher.name} ${verbPast}`);
      onDone?.();
      onClose();
    } catch (err) {
      // The server re-checked and found something the dialog had not: show what
      // it found rather than a bare error, so the admin can act on it.
      if (err.status === 409 && err.data?.data) {
        setReport(err.data.data);
        toast.error(err.message);
      } else {
        toast.error(err.message || `Could not ${verb.toLowerCase()} this teacher`);
      }
    } finally { setBusy(false); }
  };

  const a = report?.assignments;
  const blocked  = !!report?.blocked;
  const canForce = !!report?.canForce;

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose}
      title={`${verb} ${teacher?.name || 'Teacher'}`} maxWidth={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          {canForce && (
            <Button variant="warning" onClick={() => run(true)} loading={busy}>
              Force {verb}
            </Button>
          )}
          <Button
            variant={action === 'delete' ? 'danger' : 'primary'}
            onClick={() => run(false)}
            loading={busy}
            disabled={loading || blocked || !!error}
          >
            {verb}
          </Button>
        </>
      }>

      {loading && (
        <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      )}

      {!loading && error && (
        <div style={{ background: 'var(--danger-light,#fef2f2)', border: '1px solid var(--danger)', borderRadius: 8, padding: '12px 14px', color: 'var(--danger)', fontSize: '.85rem' }}>
          {error}
        </div>
      )}

      {!loading && report && !blocked && (
        <p style={{ margin: 0, lineHeight: 1.7, color: 'var(--text-muted)' }}>
          Nothing is assigned to <strong style={{ color: 'var(--text)' }}>{teacher?.name}</strong> —
          no classes, no subjects{report.library.enabled ? ', no books on loan' : ''}
          {report.timetable.enabled ? ' and no timetable periods' : ''}.
          {action === 'delete'
            ? ' Deleting the account cannot be undone.'
            : ' They will not be able to sign in until reactivated.'}
        </p>
      )}

      {!loading && report && blocked && (
        <div>
          <div style={{ background: 'var(--danger-light,#fef2f2)', border: '1px solid var(--danger)', borderRadius: 8, padding: '11px 14px', marginBottom: 16, fontSize: '.84rem', color: 'var(--danger)', lineHeight: 1.6 }}>
            <strong>{teacher?.name} cannot be {verbPast} yet.</strong> Reassign or clear
            everything below first — each item is still pointing at this account.
          </div>

          <Group title="Class Teacher" rows={a.classTeacher}
            render={(r) => `${r.className}${r.sectionName ? ` – ${r.sectionName}` : ''}`}
            to={(r) => `/admin/sections/${r.sectionId}`}
            hint="Set another class teacher on the section." />

          <Group title="Vice Class Teacher" rows={a.viceClassTeacher}
            render={(r) => `${r.className}${r.sectionName ? ` – ${r.sectionName}` : ''}`}
            to={(r) => `/admin/sections/${r.sectionId}`}
            hint="Set another vice class teacher on the section." />

          <Group title="Subjects taught" rows={a.subjects}
            render={(r) => r.subjectName + (r.subjectCode ? ` (${r.subjectCode})` : '')}
            to={() => '/admin/subjects'}
            hint="Remove this teacher from the subject on the Subjects page." />

          <Group title="Subject Teacher" rows={a.subjectTeacher}
            render={(r) => `${r.className}${r.sectionName ? ` – ${r.sectionName}` : ''} · ${r.subjectName}`}
            to={(r) => `/admin/sections/${r.sectionId}`}
            hint="Assign another subject teacher on the section." />

          {report.library.enabled && (
            <Group title="Books on loan" rows={report.library.books}
              render={(r) => (
                <>
                  {r.title}
                  {r.copyCode ? <span style={{ color: 'var(--text-muted)' }}> · {r.copyCode}</span> : null}
                  {r.dueDate ? <span style={{ color: r.overdue ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {' · due '}{new Date(r.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {r.overdue ? ' (overdue)' : ''}
                  </span> : null}
                </>
              )}
              to={() => '/admin/library/circulation'}
              hint="Every copy has to come back before the account goes." />
          )}

          {report.timetable.enabled && (
            <Group title="Timetable periods" rows={report.timetable.periods} limit={12}
              render={(r) => (
                <>
                  {r.dayOfWeek} · P{r.periodNumber}
                  {r.startTime ? <span style={{ color: 'var(--text-muted)' }}> · {r.startTime}–{r.endTime}</span> : null}
                  {' · '}{r.className}{r.sectionName ? ` – ${r.sectionName}` : ''}
                  {r.subjectName ? ` · ${r.subjectName}` : ''}
                </>
              )}
              to={() => '/admin/timetable'}
              hint={canForce
                ? 'Reassign these in the timetable, or use Force ' + verb + ' to empty them all at once.'
                : 'Reassign these in the timetable.'} />
          )}

          {canForce && (
            <div style={{ background: 'var(--warning-light,#fffbeb)', border: '1px solid var(--warning)', borderRadius: 8, padding: '11px 14px', marginTop: 4, fontSize: '.82rem', lineHeight: 1.65 }}>
              <strong>Force {verb}</strong> removes {teacher?.name} from
              all {report.timetable.count} period{report.timetable.count !== 1 ? 's' : ''} above and
              {action === 'delete' ? ' then deletes the account' : ' then deactivates the account'}.
              The periods stay in the grid as open slots, ready for another teacher — the subject
              and time are not changed. This cannot be undone.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** One dependency family. Renders nothing when the family is clear. */
function Group({ title, rows, render, to, hint, limit = 8 }) {
  if (!rows?.length) return null;
  const shown = rows.slice(0, limit);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: '.85rem' }}>{title}</strong>
        <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{rows.length}</span>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
        {shown.map((r, i) => (
          <div key={i} style={{
            padding: '7px 12px', fontSize: '.82rem',
            borderBottom: i < shown.length - 1 ? '1px solid var(--border)' : 'none',
            display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center',
          }}>
            <span>{render(r)}</span>
            {to && <Link to={to(r)} style={{ fontSize: '.75rem', whiteSpace: 'nowrap' }}>Open</Link>}
          </div>
        ))}
        {rows.length > shown.length && (
          <div style={{ padding: '7px 12px', fontSize: '.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            …and {rows.length - shown.length} more
          </div>
        )}
      </div>
      {hint && <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', margin: '5px 0 0' }}>{hint}</p>}
    </div>
  );
}
