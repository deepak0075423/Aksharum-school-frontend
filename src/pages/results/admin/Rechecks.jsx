/**
 * Admin → Results → Re-check Requests (Oct 2026): a student, or a parent for
 * their child, asks for one paper of a published result to be checked again —
 * within the days the school allows (Settings) — and the office answers
 * (school-backend services/resultRecheck).
 *
 * Three answers: the marks stand; they were wrong — corrected in place, the
 * result and ranks worked out again, the change kept in the sheet's history;
 * or the request is declined, with the reason the family reads. The paper's
 * subject teacher was told when it was asked, so the office can ask them.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/admin.api';
import { Modal } from '../../../components/ui/index';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { PageHead, Btn, Badge, Empty, Ico, LineTabs, fmtStamp, useBoard } from '../rsUI';
import { classLine } from '../resultMeta';

const TABS = [
  { key: 'open', label: 'Waiting for an Answer' },
  { key: 'resolved', label: 'Answered' },
  { key: 'declined', label: 'Declined' },
  { key: '', label: 'All' },
];
const OUTCOME = { unchanged: 'Marks stand', changed: 'Marks corrected' };
const paperNow = (p) => (!p ? '—' : p.isAbsent ? 'Absent' : p.gradeOnly ? `Grade ${p.grade}` : `${p.marksObtained} / ${p.maxMarks}`);

function Answer({ rc, onClose, onDone }) {
  const p = rc.paper;
  const [action, setAction] = useState('unchanged');
  const [marks, setMarks] = useState(p && !p.isAbsent && !p.gradeOnly && !p.components ? String(p.marksObtained) : '');
  const [parts, setParts] = useState(() => Object.fromEntries((p?.components || []).map((c) => [c.key, c.marks === null || c.marks === undefined ? '' : String(c.marks)])));
  const [grade, setGrade] = useState(p?.gradeOnly && p.grade !== 'AB' ? p.grade : '');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    if (action !== 'unchanged' && !response.trim()) { setError('Say why — the family reads it'); return; }
    setBusy(true); setError('');
    try {
      const body = { action, response: response.trim() };
      if (action === 'change') {
        if (p?.gradeOnly) body.grade = grade;
        else if (p?.components) body.parts = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v === '' ? null : Number(v)]));
        else body.marksObtained = marks === '' ? null : Number(marks);
      }
      await api.resolveRecheck(rc._id, body);
      toast.success(action === 'change' ? 'Mark corrected — the result has been worked out again and the family told'
        : action === 'unchanged' ? 'Answered — the family has been told the marks stand' : 'Declined — the family has been told why');
      onDone();
    } catch (e) { setError(e.message || 'That did not work'); setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={560}
      title={<span className="rs-ask__title rs-t-indigo"><i><Ico name="search" size={18} /></i><span>Re-check: {rc.subject.subjectName}<small>{rc.student.name} · {rc.exam.title}</small></span></span>}
      footer={<>
        <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn kind={action === 'decline' ? 'danger-solid' : 'primary'} busy={busy} onClick={go}>
          {action === 'change' ? 'Correct the Mark' : action === 'decline' ? 'Decline' : 'Marks Stand'}
        </Btn>
      </>}>
      <div className="rs-ask">
        <p className="rs-ask__quote">“{rc.reason}” — {rc.requestedBy || 'the family'}{rc.requestedByRole ? ` (${rc.requestedByRole})` : ''}, {fmtStamp(rc.createdAt)}</p>
        <p>The paper now: <strong>{paperNow(p)}</strong>{p?.components ? ` (${p.components.map((c) => `${c.label} ${c.marks ?? '—'}/${c.maxMarks}`).join(', ')})` : ''}.</p>
        <div className="rs-rx__rules rs-rc__answers" role="radiogroup" aria-label="Answer">
          {[['unchanged', 'The marks stand', 'Checked again; nothing was wrong'], ['change', 'Correct the mark', 'The result is worked out again'], ['decline', 'Decline', 'Not taken up — say why']].map(([v, label, hint]) => (
            <label key={v} className={`rsf-radio${action === v ? ' is-on' : ''}`}>
              <input type="radio" name="rc-action" value={v} checked={action === v} disabled={v === 'change' && !rc.exam.published} onChange={() => { setAction(v); setError(''); }} />
              <span className="rsf-radio__dot" aria-hidden />
              <span><strong>{label}</strong><small>{v === 'change' && !rc.exam.published ? 'The results have been withdrawn — correct the sheet instead' : hint}</small></span>
            </label>
          ))}
        </div>
        {action === 'change' ? (
          <div className="rs-correct">
            {p?.gradeOnly ? (
              <label><span>Grade</span>
                <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                  <option value="">Choose…</option>
                  {(rc.grades || []).map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
            ) : p?.components ? (
              <div className="rs-correct__parts">
                {p.components.map((c) => (
                  <label key={c.key}><span>{c.label} <i>/ {c.maxMarks}</i></span>
                    <input type="number" min="0" max={c.maxMarks} step="any" value={parts[c.key] ?? ''} onChange={(e) => setParts((x) => ({ ...x, [c.key]: e.target.value }))} />
                  </label>
                ))}
              </div>
            ) : (
              <label><span>Corrected marks <i>/ {p?.maxMarks}</i></span>
                <input type="number" min="0" max={p?.maxMarks} step="any" value={marks} onChange={(e) => setMarks(e.target.value)} />
              </label>
            )}
          </div>
        ) : null}
        <label className="rs-ask__reason">
          <span>{action === 'unchanged' ? 'Note for the family' : 'Why'}{action === 'unchanged' ? <i> optional</i> : <b aria-hidden> *</b>}</span>
          <textarea rows={3} maxLength={500} value={response} placeholder={action === 'change' ? 'e.g. Question 6 was not added to the total' : action === 'decline' ? 'e.g. The paper was re-totalled at the time of checking' : 'e.g. Re-totalled; every answer was marked'}
            onChange={(e) => { setResponse(e.target.value); if (error) setError(''); }} />
        </label>
        {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
      </div>
    </Modal>
  );
}

export default function Rechecks() {
  const nav = useNavigate();
  usePageCrumbs([{ label: 'Re-check Requests' }]);
  const [tab, setTab] = useState('open');
  const [answering, setAnswering] = useState(null);
  const query = useMemo(() => (tab ? { status: tab } : {}), [tab]);
  const { body, loading, error, reload } = useBoard(api.getRechecks, query);
  const rows = body?.data || [];
  const counts = body?.counts || { open: 0, all: 0 };

  return (
    <div className="rs-page">
      <PageHead title="Re-check Requests" subtitle="Families' requests to have a paper checked again. Answer each — the marks stand, are corrected, or the request is declined; the family is told.">
        <Btn size="lg" icon="arrowLeft" onClick={() => nav('/admin/results')}>Back to Results</Btn>
        <Btn size="lg" icon="settings" onClick={() => nav('/admin/results/settings')}>Re-check Window</Btn>
      </PageHead>

      <section className="rs-card" aria-label="Re-check requests">
        <div className="rs-card__top">
          <LineTabs value={tab} onChange={setTab} label="Requests by state"
            items={TABS.map((t) => ({ ...t, count: t.key === 'open' ? counts.open : t.key === '' ? counts.all : undefined }))} />
        </div>
        <div className="rs-tablearea">
          <div className={`rs-tablebox${loading && body ? ' is-loading' : ''}`} aria-busy={loading || undefined}>
            {rows.length ? (
              <div className="rs-tablescroll">
                <table className="rs-table rs-table--rows">
                  <thead><tr><th>Student</th><th>Paper</th><th>Now</th><th>Asked</th><th>Status</th><th className="is-right rs-table__acts">Actions</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r._id}>
                        <td>
                          <span className="rs-name rs-name--static">
                            <strong>{r.student.name}</strong>
                            <span className="rs-sub">{classLine(r)}</span>
                          </span>
                        </td>
                        <td data-label="Paper"><strong className="rs-strong">{r.subject.subjectName}</strong><span className="rs-sub">{r.exam.title}</span></td>
                        <td data-label="Now" className="rs-num">
                          {paperNow(r.paper)}
                          {r.status === 'resolved' && r.outcome === 'changed' && r.before ? <span className="rs-sub">was {r.before.isAbsent ? 'absent' : r.before.marksObtained ?? r.before.grade}</span> : null}
                        </td>
                        <td data-label="Asked">
                          <span className="rs-rc__reason" title={r.reason}>“{r.reason.length > 70 ? `${r.reason.slice(0, 69)}…` : r.reason}”</span>
                          <span className="rs-sub">{[r.requestedBy, fmtStamp(r.createdAt)].filter(Boolean).join(' · ')}</span>
                        </td>
                        <td data-label="Status">
                          {r.status === 'open' ? <Badge tone="amber">Waiting</Badge>
                            : r.status === 'declined' ? <Badge tone="slate">Declined</Badge>
                              : <Badge tone={r.outcome === 'changed' ? 'green' : 'blue'}>{OUTCOME[r.outcome] || 'Answered'}</Badge>}
                          {r.status !== 'open' ? <span className="rs-sub" title={r.response}>{[r.resolvedBy, fmtStamp(r.resolvedAt)].filter(Boolean).join(' · ')}</span> : null}
                        </td>
                        <td className="is-right rs-table__acts">
                          {r.status === 'open' ? <Btn size="sm" kind="primary" icon="reply" onClick={() => setAnswering(r)}>Answer</Btn> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : !body && loading ? <div className="rs-loading" role="status">Loading requests…</div>
              : error && !body ? <Empty title="Requests could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty>
                : (
                  <Empty title={tab === 'open' ? 'Nothing waiting' : 'No requests'}>
                    {tab === 'open' ? 'Every re-check request has been answered.' : 'Families can ask for a paper to be checked again from their scorecard, within the days set under Result Settings.'}
                  </Empty>
                )}
          </div>
        </div>
      </section>

      {answering ? <Answer rc={answering} onClose={() => setAnswering(null)} onDone={() => { setAnswering(null); reload(); }} /> : null}
    </div>
  );
}
