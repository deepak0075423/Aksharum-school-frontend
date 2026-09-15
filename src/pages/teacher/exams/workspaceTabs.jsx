/**
 * The Submissions and Results tabs of the teacher's exam workspace. (Analytics
 * is the shared exam report — pages/exams/analytics/ExamReport.jsx.)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/teacher.api';
import { Button, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Drawer } from '../../admin/documentParts';
import { Panel, fmtExamDay, fmtEndClock } from '../../admin/examParts';
import {
  AttemptPill, Person, PctBar, Pills, ScoreRing, Outcome, QuestionReview, useReviewFilter,
  fmtSpent, fmtStamp, plural,
} from '../../exams/examShared';

const unwrap = (res) => res?.data ?? res;
const errText = (err) => err?.data?.message || err?.message || 'Something went wrong';

const NotOpenYet = ({ exam, what }) => (
  <div className="card apxqe__empty">
    <Icon name="calendar" size={32} />
    <h3>{what} appear once the exam opens</h3>
    <p>
      {exam.status === 'draft'
        ? 'This exam is still a draft. Finish its questions and publish it first.'
        : `It opens on ${fmtExamDay(exam)} and closes at ${fmtEndClock(exam)}.`}
    </p>
  </div>
);

// ── Submissions ──────────────────────────────────────────────────────────────

export function SubmissionsTab({ exam, studentId }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const opened = ['live', 'completed'].includes(exam.stage);

  useEffect(() => {
    if (!opened) return;
    let live = true;
    api.getSubmissions(exam._id).then((r) => { if (live) setData(r); }).catch((err) => toast.error(errText(err)));
    return () => { live = false; };
  }, [exam._id, opened]);

  // One list: every attempt, then everyone on the roster who never opened it.
  const rows = useMemo(() => {
    if (!data) return [];
    const closed = exam.stage === 'completed';
    return [
      ...(data.data || []),
      ...(data.notAttempted || []).map((s) => ({
        _id: `n-${s._id}`, student: s, status: closed ? 'missed' : 'not_started', score: null,
      })),
    ];
  }, [data, exam.stage]);

  if (!opened) return <NotOpenYet exam={exam} what="Submissions" />;
  if (!data) return <div className="apxloading"><Spinner /></div>;

  const n = (s) => rows.filter((r) => r.status === s).length;
  const q = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => filter === 'all' || r.status === filter || (filter === 'waiting' && ['not_started', 'missed'].includes(r.status)))
    .filter((r) => !q || (r.student?.name || '').toLowerCase().includes(q) || String(r.student?.rollNumber || '').includes(q));

  const openResponse = (r) => navigate(`/teacher/exams/${exam._id}/submissions/${r.student._id}`);

  return (
    <Panel icon="users" title="Submissions"
      subtitle={`${n('submitted') + n('auto_submitted')} of ${plural(rows.length, 'student')} submitted · pass mark ${data.passMark} of ${data.totalMarks}`}
      className="apxall"
      action={
        <div className="apxtools">
          <div className="docsearch">
            <Icon name="search" size={17} />
            <input className="form-control" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or roll no…" aria-label="Search students" />
          </div>
        </div>
      }>
      <div className="apxsubbar">
        <Pills label="Filter by status" value={filter} onChange={setFilter} items={[
          { value: 'all', label: 'All', count: rows.length },
          { value: 'submitted', label: 'Submitted', count: n('submitted') },
          { value: 'auto_submitted', label: 'Auto-submitted', count: n('auto_submitted') },
          { value: 'in_progress', label: 'In progress', count: n('in_progress') },
          { value: 'waiting', label: exam.stage === 'completed' ? 'Missed' : 'Not started', count: n('not_started') + n('missed') },
        ]} />
      </div>
      {shown.length === 0 ? (
        <p className="apxempty">No students match.</p>
      ) : (
        <div className="table-wrap">
          <table className="table apxtable">
            <thead>
              <tr><th>Student</th><th>Status</th><th>Started</th><th>Time taken</th><th>Answered</th><th>Violations</th><th>Score</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const done = r.score != null;
                return (
                  <tr key={r._id}>
                    <td>
                      <Person name={r.student?.name} photo={r.student?.profileImage || r.student?.photo}
                        sub={[r.student?.rollNumber && `Roll ${r.student.rollNumber}`, r.student?.className].filter(Boolean).join(' · ')} />
                    </td>
                    <td><AttemptPill status={r.status} /></td>
                    <td className="apxnowrap apxmuted">{r.startedAt ? fmtStamp(r.startedAt) : '—'}</td>
                    <td className="apxnowrap">{fmtSpent(r.timeTaken)}</td>
                    <td className="apxnowrap">{r.answered != null ? `${r.answered} / ${data.totalQuestions}` : '—'}</td>
                    <td>
                      {r.violationCount > 0
                        ? <span className="apxviol"><Icon name="alert" size={14} />{r.violationCount}</span>
                        : <span className="apxmuted">{r.violationCount === 0 ? '0' : '—'}</span>}
                    </td>
                    <td>
                      {done ? (
                        <span className="apxscore">
                          <strong>{r.score} / {data.totalMarks}</strong>
                          <PctBar value={r.percentage} label={r.passed ? 'Passed' : 'Below the pass mark'} />
                        </span>
                      ) : <span className="apxmuted">—</span>}
                    </td>
                    <td>
                      {done && (
                        <button type="button" className="btn btn-secondary apxup__btn" onClick={() => openResponse(r)}>
                          View paper
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ResponseDrawer exam={exam} studentId={studentId} onClose={() => navigate(`/teacher/exams/${exam._id}/submissions`)} />
    </Panel>
  );
}

/** One student's paper, marked, beside the list. */
function ResponseDrawer({ exam, studentId, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!studentId) { setData(null); return; }
    let live = true;
    setData(null);
    api.getStudentResponse(exam._id, studentId)
      .then((r) => { if (live) setData(unwrap(r)); })
      .catch((err) => { toast.error(errText(err)); onClose(); });
    return () => { live = false; };
  }, [exam._id, studentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const review = useReviewFilter(data?.questions);
  if (!studentId) return null;

  return (
    <Drawer open onClose={onClose}>
      <div className="docdrawer__head">
        {data ? (
          <Person name={data.student?.name} size={44}
            sub={[data.student?.rollNumber && `Roll ${data.student.rollNumber}`, exam.title].filter(Boolean).join(' · ')} />
        ) : <span className="docdrawer__id"><h3>Loading paper…</h3></span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="docact" onClick={onClose} aria-label="Close"><Icon name="close" size={16} /></button>
      </div>
      <div className="docdrawer__body">
        {!data ? <div className="apxloading"><Spinner /></div> : (
          <>
            <div className="apxpaper">
              <ScoreRing value={data.percentage} size={104} stroke={10}>
                <strong>{data.percentage}%</strong><small>{data.score} / {data.totalMarks}</small>
              </ScoreRing>
              <div className="apxpaper__facts">
                <Outcome passed={data.passed} />
                <ul>
                  <li><b>{data.correct}</b> correct</li>
                  <li><b>{data.incorrect}</b> incorrect</li>
                  <li><b>{data.unanswered}</b> not answered</li>
                </ul>
                <small>
                  {data.attempt?.status === 'auto_submitted' ? 'Auto-submitted' : 'Submitted'} {fmtStamp(data.attempt?.submittedAt)}
                  {' · '}{fmtSpent(data.timeTaken)}
                  {data.attempt?.violationCount ? ` · ${plural(data.attempt.violationCount, 'violation')}` : ''}
                </small>
              </div>
            </div>
            <Pills label="Filter questions" value={review.filter} onChange={review.setFilter} items={review.pills} />
            <div className="apxqe__list apxqe__list--drawer">
              {review.shown.map(({ q, i }) => <QuestionReview key={q._id} q={q} index={i} viewer="teacher" />)}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────

const Step = ({ n, state, title, children }) => (
  <li className={`apxstep apxstep--${state}`}>
    <span className="apxstep__dot">{state === 'done' ? <Icon name="checkCircle" size={18} /> : state === 'rejected' ? <Icon name="closeCircle" size={18} /> : n}</span>
    <div className="apxstep__body">
      <strong>{title}</strong>
      {children}
    </div>
  </li>
);

export function ResultsTab({ exam, onChanged, go }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [publishDate, setPublishDate] = useState('');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const load = () => api.getResultApproval(exam._id).then((r) => setData(unwrap(r))).catch((err) => toast.error(errText(err)));
  useEffect(() => { load(); }, [exam._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="apxloading"><Spinner /></div>;
  const p = data.permissions || {};
  const closed = data.stage === 'completed';
  const step1 = data.subjectTeacherApprovalStatus === 'approved';
  const step2 = data.resultApprovalStatus || 'pending';

  const act = async (fn, done) => {
    setBusy(true);
    try { await fn(); toast.success(done); setRejecting(false); await load(); onChanged?.(); }
    catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="apxov apxov--results">
      <Panel icon="checkCircle" title="Results approval"
        subtitle={p.needsSubjectStep ? 'Two steps: the teacher who wrote it confirms the scores, then the class teacher publishes them' : 'Set by the school office — the class teacher approves and publishes the results'}>
        <ol className="apxsteps">
          <Step n={1} state={closed ? 'done' : 'current'} title={closed ? 'Exam closed' : 'Waiting for the exam to close'}>
            <p>
              {closed
                ? `Closed ${fmtExamDay(exam)} at ${fmtEndClock(exam)} · ${data.submitted} of ${plural(data.eligible, 'student')} submitted${data.averageScore != null ? ` · class average ${data.averageScore}%` : ''}.`
                : `Closes ${fmtExamDay(exam)} at ${fmtEndClock(exam)}. Scores can be reviewed after that.`}
            </p>
            {closed && <Button variant="secondary" onClick={() => go('analytics')}>Check the analytics <Icon name="arrowRight" size={15} /></Button>}
          </Step>

          <Step n={2} state={!p.needsSubjectStep || step1 ? 'done' : closed ? 'current' : 'todo'} title="Subject teacher confirms the scores">
            {!p.needsSubjectStep ? <p>Not needed — this exam was set by the school office.</p>
              : step1 ? <p>Confirmed by {data.subjectTeacherApprovedBy?.name || '—'} · {fmtStamp(data.subjectTeacherApprovedAt)}</p>
                : p.canSubjectApprove ? (
                  <>
                    <p>Look over the submissions and question results. Confirming passes the scores to the class teacher to publish.</p>
                    <Button loading={busy} onClick={() => act(() => api.subjectApproveResults(exam._id), 'Scores confirmed')}>
                      <Icon name="checkCircle" size={15} /> Confirm scores
                    </Button>
                  </>
                ) : <p>{closed ? `Waiting for ${data.createdBy?.name || 'the teacher who wrote it'} to confirm.` : 'Opens once the exam closes.'}</p>}
          </Step>

          <Step n={3}
            state={step2 === 'approved' ? 'done' : step2 === 'rejected' ? 'rejected' : closed && (step1 || !p.needsSubjectStep) ? 'current' : 'todo'}
            title="Class teacher approves and publishes">
            {step2 === 'approved' && (
              <p>
                Approved by {data.resultApprovedBy?.name || '—'} · {fmtStamp(data.resultApprovedAt)}.{' '}
                {data.resultPublishDate && new Date(data.resultPublishDate) > new Date()
                  ? `Students see their scores from ${fmtStamp(data.resultPublishDate)}.`
                  : 'Students and parents can see their scores.'}
              </p>
            )}
            {step2 === 'rejected' && <p className="apxstep__reject">Rejected by {data.resultApprovedBy?.name || '—'}: “{data.resultRejectionReason || 'no reason given'}”</p>}
            {p.canFinalApprove ? (
              <div className="apxstep__form">
                <div className="form-row form-row-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="apx-pub-date">Publish on (optional)</label>
                    <input id="apx-pub-date" type="date" className="form-control" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
                    <small className="apxform__hint">Leave empty to publish as soon as you approve.</small>
                  </div>
                  {rejecting && (
                    <div className="form-group">
                      <label className="form-label required" htmlFor="apx-reject">Why reject?</label>
                      <textarea id="apx-reject" className="form-control" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Question 4’s key looks wrong — please re-check" />
                    </div>
                  )}
                </div>
                <div className="apxstep__acts">
                  <Button loading={busy} onClick={() => act(() => api.approveResults(exam._id, { action: 'approve', resultPublishDate: publishDate || undefined }), publishDate ? 'Results approved — they publish on the date set' : 'Results published')}>
                    <Icon name="checkCircle" size={15} /> Approve &amp; publish
                  </Button>
                  {!rejecting
                    ? <Button variant="secondary" onClick={() => setRejecting(true)}>Reject…</Button>
                    : <Button variant="danger" loading={busy} disabled={!reason.trim()}
                      onClick={() => act(() => api.approveResults(exam._id, { action: 'reject', reason }), 'Results rejected')}>Reject results</Button>}
                </div>
              </div>
            ) : step2 === 'pending' && (
              <p>
                {!closed ? 'Opens once the exam closes.'
                  : p.needsSubjectStep && !step1 ? 'Waiting for step 2.'
                    : p.isClassTeacher ? 'Nothing to do yet.' : 'Waiting for the class teacher of this exam’s section.'}
              </p>
            )}
          </Step>
        </ol>
      </Panel>
    </div>
  );
}
