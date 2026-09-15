/**
 * Student → sitting an aptitude exam.
 *
 * The rules this screen enforces are unchanged: the countdown is the server's
 * `serverEndTime` and submits at zero; leaving the tab is reported and the
 * server auto-submits past the limit; every choice is saved the moment it is
 * made. What changed is how it reads while a student is under time pressure:
 *
 *   • one question at a time, options as large tiles lettered by POSITION —
 *     options arrive shuffled per student, so showing each option's stored id
 *     ("C." first) used to look like a mistake;
 *   • a palette that tells answered, marked-for-review and untouched apart by
 *     shape as well as colour, with counts;
 *   • Clear response, Mark for review, and ← / → keys between questions;
 *   • a saving indicator, and a submit dialog that lists what is unanswered
 *     or still marked, each a jump back to that question.
 *
 * "Marked for review" is the student's own note to themselves — kept in this
 * tab's session storage, never sent to the server or scored.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/student.api';
import { Spinner, Button, Modal } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { ExamMark, QUESTION_TYPE_LABEL } from '../../admin/examParts';
import { BackLink, plural } from '../../exams/examShared';

function fmtTimer(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? `${String(h).padStart(2, '0')}:` : '') + `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

const letter = (i) => String.fromCharCode(65 + i);

const readMarks = (id) => {
  try { return new Set(JSON.parse(sessionStorage.getItem(`apx-review-${id}`) || '[]')); } catch { return new Set(); }
};
const writeMarks = (id, set) => {
  try { sessionStorage.setItem(`apx-review-${id}`, JSON.stringify([...set])); } catch { /* private mode — the marks just don't survive a refresh */ }
};

export default function StudentExamAttempt() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [answers, setAnswers] = useState({});      // questionId → [optionIds]
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(null);
  const [violations, setViolations] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState(() => readMarks(id));
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | failed

  const submittedRef = useRef(false);
  const pendingRef   = useRef(0);

  // ── Load attempt ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await api.getAttempt(id);
        const d = res.data;
        setData(d);
        setViolations(d.violationCount || 0);
        const saved = {};
        (d.savedAnswers || []).forEach(a => { saved[String(a.question)] = a.selectedOptions || []; });
        setAnswers(saved);
      } catch (err) {
        setError(err.message || 'Could not load exam');
      } finally { setLoading(false); }
    })();
  }, [id]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const doSubmit = useCallback(async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      await api.submitExam(id);
      toast.success(auto ? 'Time up — exam auto-submitted' : 'Exam submitted successfully');
    } catch (err) {
      // Already auto-submitted server-side is fine — anything else, surface it
      if (!/no active attempt/i.test(err.message || '')) toast.error(err.message);
    } finally {
      try { sessionStorage.removeItem(`apx-review-${id}`); } catch { /* ignore */ }
      navigate('/student/exams', { replace: true });
    }
  }, [id, navigate]);

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!data?.serverEndTime) return;
    const end = new Date(data.serverEndTime).getTime();
    const tick = () => {
      const left = end - Date.now();
      setRemaining(left);
      if (left <= 0) doSubmit(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data?.serverEndTime, doSubmit]);

  // ── Anti-cheat: tab switch / blur ─────────────────────────────────────────
  useEffect(() => {
    if (!data) return;
    const report = async () => {
      if (submittedRef.current || document.visibilityState === 'visible') return;
      try {
        const res = await api.logViolation(id);
        setViolations(res.violationCount ?? 0);
        if (res.autoSubmitted) {
          submittedRef.current = true;
          toast.error('Too many violations — exam auto-submitted');
          navigate('/student/exams', { replace: true });
        } else {
          toast.error(`Tab switch detected — violation ${res.violationCount} of ${data.exam.maxViolations}`, { duration: 5000 });
        }
      } catch { /* attempt may already be closed */ }
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') report(); };
    document.addEventListener('visibilitychange', onVisibility);
    const onContext = (e) => e.preventDefault();
    document.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('contextmenu', onContext);
    };
  }, [data, id, navigate]);

  // ── Answer selection (saves immediately) ──────────────────────────────────
  const persist = async (qid, next) => {
    pendingRef.current += 1;
    setSaveState('saving');
    try {
      await api.saveAnswer(id, { questionId: qid, selectedOptions: next });
      setSaveState(pendingRef.current > 1 ? 'saving' : 'saved');
    } catch (err) {
      if (/auto submitted|time ended/i.test(err.message || '')) {
        toast.error('Time is up — exam submitted');
        navigate('/student/exams', { replace: true });
      } else {
        setSaveState('failed');
        toast.error('Could not save answer — check your connection');
      }
    } finally { pendingRef.current -= 1; }
  };

  const select = (q, optionId) => {
    const qid = String(q._id);
    let next;
    if (q.questionType === 'mcq_multiple') {
      const cur = answers[qid] || [];
      next = cur.includes(optionId) ? cur.filter(x => x !== optionId) : [...cur, optionId];
    } else {
      next = [optionId];
    }
    setAnswers(a => ({ ...a, [qid]: next }));
    persist(qid, next);
  };

  const clear = (q) => {
    const qid = String(q._id);
    if (!(answers[qid] || []).length) return;
    setAnswers(a => ({ ...a, [qid]: [] }));
    persist(qid, []);
  };

  const toggleReview = (q) => setReview((prev) => {
    const next = new Set(prev);
    const qid = String(q._id);
    if (next.has(qid)) next.delete(qid); else next.add(qid);
    writeMarks(id, next);
    return next;
  });

  // ← / → between questions.
  useEffect(() => {
    if (!data) return undefined;
    const onKey = (e) => {
      if (confirmSubmit || e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowRight') setCurrent((c) => Math.min(data.questions.length - 1, c + 1));
      if (e.key === 'ArrowLeft') setCurrent((c) => Math.max(0, c - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [data, confirmSubmit]);

  // ── Render states ─────────────────────────────────────────────────────────
  if (loading) return <div className="loading-page"><Spinner /></div>;
  if (error) {
    return (
      <div className="page apxpg">
        <BackLink to="/student/exams">My Aptitude Exams</BackLink>
        <div className="card apxqe__empty">
          <Icon name="alert" size={32} />
          <h3>This exam can’t be opened</h3>
          <p>{error}</p>
          <Button variant="secondary" onClick={() => navigate('/student/exams')}>Back to my exams</Button>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const { exam, questions } = data;
  const q = questions[current];
  const qid = String(q._id);
  const isAnswered = (x) => (answers[String(x._id)] || []).length > 0;
  const answeredCount = questions.filter(isAnswered).length;
  const marked = questions.filter((x) => review.has(String(x._id)));
  const unanswered = questions.map((x, i) => ({ x, i })).filter(({ x }) => !isAnswered(x));
  const timeTone = remaining === null ? '' : remaining < 60 * 1000 ? ' is-critical' : remaining < 5 * 60 * 1000 ? ' is-low' : '';
  const last = current === questions.length - 1;

  return (
    <div className="page apxpg apxsit" style={{ userSelect: 'none' }}>
      <header className="card apxsit__bar">
        <ExamMark exam={{ title: exam.title, subjectName: exam.subjectName }} size={42} />
        <div className="apxsit__title">
          <strong>{exam.title}</strong>
          <small>{exam.subjectName || 'General Aptitude'} · {exam.totalMarks} marks</small>
        </div>
        <div className="apxsit__progress" aria-label={`${answeredCount} of ${questions.length} answered`}>
          <span><b>{answeredCount}</b> of {questions.length} answered</span>
          <span className="apxsit__track"><span style={{ width: `${(answeredCount / questions.length) * 100}%` }} /></span>
        </div>
        <span className={`apxsit__save is-${saveState}`} aria-live="polite">
          {saveState === 'saving' && <><Spinner size="sm" /> Saving…</>}
          {saveState === 'saved' && <><Icon name="checkCircle" size={15} /> Saved</>}
          {saveState === 'failed' && <><Icon name="alert" size={15} /> Not saved</>}
        </span>
        <span className={`apxsit__timer${timeTone}`} role="timer" aria-label="Time remaining">
          <Icon name="clock" size={18} />{remaining === null ? '—' : fmtTimer(remaining)}
        </span>
        <Button variant="danger" onClick={() => setConfirmSubmit(true)} loading={submitting}>Submit</Button>
      </header>

      <div className="apxsit__layout">
        <section className="card apxsit__q">
          <div className="apxsit__qhead">
            <span className="apxsit__qnum">Question {current + 1} <small>of {questions.length}</small></span>
            <span className="apxchip">{QUESTION_TYPE_LABEL[q.questionType]}</span>
            <span className="apxchip">{plural(q.marks, 'mark')}</span>
            <button type="button" className={`apxsit__flag${review.has(qid) ? ' is-on' : ''}`} onClick={() => toggleReview(q)}
              aria-pressed={review.has(qid)}>
              <Icon name="star" size={15} /> {review.has(qid) ? 'Marked for review' : 'Mark for review'}
            </button>
          </div>

          <p className="apxsit__text">{q.questionText}</p>
          {q.questionType === 'mcq_multiple' && <p className="apxsit__hint">Select all that apply — it scores only if every correct option is chosen.</p>}

          <div className="apxsit__opts" role={q.questionType === 'mcq_multiple' ? 'group' : 'radiogroup'}>
            {(q.options || []).map((o, i) => {
              const sel = (answers[qid] || []).includes(o.optionId);
              return (
                <button key={o.optionId} type="button"
                  role={q.questionType === 'mcq_multiple' ? 'checkbox' : 'radio'} aria-checked={sel}
                  className={`apxsit__opt${sel ? ' is-on' : ''}${q.questionType === 'mcq_multiple' ? ' is-multi' : ''}`}
                  onClick={() => select(q, o.optionId)}>
                  <span className="apxsit__letter">{q.questionType === 'true_false' ? (o.optionId === 'true' ? 'T' : 'F') : letter(i)}</span>
                  <span className="apxsit__optText">{o.text}</span>
                  <span className="apxsit__tick">{sel && <Icon name="checkCircle" size={20} />}</span>
                </button>
              );
            })}
          </div>

          <footer className="apxsit__nav">
            <Button variant="secondary" disabled={current === 0} onClick={() => setCurrent(c => c - 1)}>
              <Icon name="chevronLeft" size={16} /> Previous
            </Button>
            <button type="button" className="apxinline" disabled={!(answers[qid] || []).length} onClick={() => clear(q)}>Clear response</button>
            <span className="apxsit__spacer" />
            {last
              ? <Button onClick={() => setConfirmSubmit(true)}>Review &amp; submit <Icon name="checkCircle" size={16} /></Button>
              : <Button onClick={() => setCurrent(c => c + 1)}>Next <Icon name="chevronRight" size={16} /></Button>}
          </footer>
        </section>

        <aside className="apxsit__rail">
          <section className="card apxsit__palette">
            <strong>Questions</strong>
            <div className="apxsit__grid">
              {questions.map((x, i) => {
                const done = isAnswered(x);
                const flag = review.has(String(x._id));
                return (
                  <button key={x._id} type="button" onClick={() => setCurrent(i)}
                    className={`apxsit__cell${done ? ' is-done' : ''}${flag ? ' is-flag' : ''}${i === current ? ' is-current' : ''}`}
                    aria-label={`Question ${i + 1}${done ? ', answered' : ', not answered'}${flag ? ', marked for review' : ''}`}
                    aria-current={i === current ? 'step' : undefined}>
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <ul className="apxsit__legend">
              <li><span className="apxsit__cell is-done" aria-hidden />Answered <b>{answeredCount}</b></li>
              <li><span className="apxsit__cell" aria-hidden />Not answered <b>{questions.length - answeredCount}</b></li>
              <li><span className="apxsit__cell is-flag" aria-hidden />Marked for review <b>{marked.length}</b></li>
            </ul>
          </section>

          <section className={`card apxsit__rules${violations ? ' has-violations' : ''}`}>
            <strong><Icon name="alert" size={16} /> Stay on this page</strong>
            <p>Switching tabs or windows is recorded. At {exam.maxViolations} your exam is submitted automatically.</p>
            <div className="apxsit__viol">
              {Array.from({ length: exam.maxViolations }, (_, i) => <span key={i} className={i < violations ? 'is-used' : ''} />)}
              <small>{violations} of {exam.maxViolations} used</small>
            </div>
          </section>
        </aside>
      </div>

      <Modal open={confirmSubmit} onClose={() => setConfirmSubmit(false)} maxWidth={520}
        title={
          <span className="apxdlg__head">
            <span className="apxdlg__mark"><Icon name="checkCircle" size={20} /></span>
            <span>Submit your exam?<small>You can’t change answers after submitting.</small></span>
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSubmit(false)}>Keep working</Button>
            <Button onClick={() => { setConfirmSubmit(false); doSubmit(false); }} loading={submitting}>Submit exam</Button>
          </>
        }>
        <div className="apxsubmit">
          <div className="apxsubmit__counts">
            <span className="is-done"><b>{answeredCount}</b>answered</span>
            <span className={unanswered.length ? 'is-warn' : ''}><b>{unanswered.length}</b>not answered</span>
            <span className={marked.length ? 'is-flag' : ''}><b>{marked.length}</b>marked</span>
            <span><b>{remaining === null ? '—' : fmtTimer(remaining)}</b>left</span>
          </div>
          {unanswered.length > 0 && (
            <div className="apxsubmit__jump">
              <small>Not answered — tap to go back:</small>
              <div>
                {unanswered.map(({ i }) => (
                  <button key={i} type="button" className="apxsit__cell" onClick={() => { setCurrent(i); setConfirmSubmit(false); }}>{i + 1}</button>
                ))}
              </div>
            </div>
          )}
          {marked.length > 0 && (
            <div className="apxsubmit__jump">
              <small>Marked for review:</small>
              <div>
                {marked.map((x) => {
                  const i = questions.indexOf(x);
                  return <button key={x._id} type="button" className="apxsit__cell is-flag" onClick={() => { setCurrent(i); setConfirmSubmit(false); }}>{i + 1}</button>;
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
