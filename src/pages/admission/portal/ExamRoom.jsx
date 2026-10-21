/**
 * Taking an online entrance exam.
 *
 * The clock shown is the SERVER's deadline, corrected for this computer's
 * clock (serverNow); the server refuses saves after it and submits the attempt
 * itself when time runs out. Answers are saved a moment after each change and
 * every few seconds while there is something unsaved; each save carries a
 * rising number so a late retry can never overwrite newer answers. Closing the
 * tab, losing the connection or reloading loses nothing that was saved —
 * opening the page again resumes the same attempt.
 *
 * Leaving the window, leaving full screen and copying or pasting are noted
 * and reported to the school as information — the evaluator weighs them, the
 * score never changes because of them; nothing here pretends a browser can
 * stop cheating.
 *
 * Timed sections (school-backend services/admission/examPlan.js): one section
 * is open at a time, on its own clock; when it ends — or the candidate
 * finishes it early — its answers close and the next section opens.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { portal as api } from '../../../api/admission.api';
import { Btn, Spin, ErrorBox, Ico, Note, Dialog, Input, TextArea, Chip } from '../admUI';
import { errMsg } from '../meta';

const fmtLeft = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export default function ExamRoom() {
  const { slug, id, attemptId } = useParams();
  const nav = useNavigate();
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({});
  const [i, setI] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState('saved');   // saved | dirty | saving | offline
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const seq = useRef(0);
  const dirty = useRef(false);
  const saveTimer = useRef(null);
  const autoSent = useRef(false);
  const sectionReload = useRef(-1);
  const latest = useRef(answers);
  latest.current = answers;

  const load = useCallback(async () => {
    try {
      const r = await api.attempt(id, attemptId);
      setView(r.data);
      setAnswers(r.data.answers || {});
      seq.current = Number(r.data.saveSeq) || 0;
      setOffset(new Date(r.data.serverNow).getTime() - Date.now());
    } catch (e) { setError(errMsg(e)); }
  }, [id, attemptId]);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async () => {
    if (!dirty.current || view?.status !== 'in_progress') return;
    dirty.current = false;
    seq.current += 1;
    setState('saving');
    try {
      const r = await api.saveAnswers(id, attemptId, { seq: seq.current, answers: latest.current });
      if (r.data?.serverNow) setOffset(new Date(r.data.serverNow).getTime() - Date.now());
      if (r.data?.stale && r.data?.saveSeq) seq.current = Math.max(seq.current, Number(r.data.saveSeq));
      if (r.data?.status && r.data.status !== 'in_progress') { await load(); return; }
      setState(dirty.current ? 'dirty' : 'saved');
    } catch (e) {
      dirty.current = true;
      if (e?.data?.code === 'SUBMITTED' || e?.data?.code === 'TIME_UP') { await load(); return; }
      setState('offline');
    }
  }, [id, attemptId, view?.status, load]);

  // Tick the clock; save whatever is pending every few seconds; retry when back online.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    const s = setInterval(() => { if (dirty.current) save(); }, 5000);
    const online = () => save();
    window.addEventListener('online', online);
    return () => { clearInterval(t); clearInterval(s); clearTimeout(saveTimer.current); window.removeEventListener('online', online); };
  }, [save]);

  // Leaving the window, leaving full screen, copying and pasting are reported, not prevented.
  useEffect(() => {
    if (view?.status !== 'in_progress') return undefined;
    const note = (type) => api.violation(id, attemptId, type).catch(() => {});
    const hide = () => { if (document.visibilityState === 'hidden') note('tab_hidden'); };
    let wasFull = !!document.fullscreenElement;
    const full = () => { if (wasFull && !document.fullscreenElement) note('fullscreen_exit'); wasFull = !!document.fullscreenElement; };
    const copy = () => note('copy');
    const paste = () => note('paste');
    document.addEventListener('visibilitychange', hide);
    document.addEventListener('fullscreenchange', full);
    document.addEventListener('copy', copy);
    document.addEventListener('paste', paste);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      document.removeEventListener('fullscreenchange', full);
      document.removeEventListener('copy', copy);
      document.removeEventListener('paste', paste);
    };
  }, [view?.status, id, attemptId]);

  const sections = view?.sections || [];
  const section = sections.length ? sections[view.currentSection] : null;
  const deadline = view ? new Date(section?.deadlineAt || view.deadlineAt).getTime() : 0;
  const left = deadline - (now + offset);
  const lastSection = !section || view.currentSection >= sections.length - 1;

  const submit = useCallback(async (auto = false) => {
    setBusy(true);
    try {
      seq.current += 1;
      const r = await api.submitExam(id, attemptId, { seq: seq.current, answers: latest.current });
      dirty.current = false;
      setTimedOut(auto);
      setView(r.data);
      setConfirm(false);
      if (!auto) toast.success('Your answers have been submitted');
    } catch (e) {
      if (auto) await load(); else toast.error(errMsg(e));
    } finally { setBusy(false); }
  }, [id, attemptId, load]);

  // At zero, hand in what is there — once (the server would do it anyway). A section that
  // is not the last one closes instead: the page asks the server for the next one.
  const timeUp = !!view && left <= 0;
  useEffect(() => {
    if (view?.status !== 'in_progress' || !timeUp) return;
    if (!lastSection) {
      if (sectionReload.current === view.currentSection) return;
      sectionReload.current = view.currentSection;
      // If the server's clock is a moment behind and the section is still open, ask again shortly.
      (async () => { if (dirty.current) await save(); await load(); setI(0); setTimeout(() => { sectionReload.current = -1; }, 3000); })();
      return;
    }
    if (!autoSent.current) { autoSent.current = true; submit(true); }
  }, [timeUp, view?.status, view?.currentSection, lastSection, submit, save, load]);

  // Finish the open section early: what is unsaved goes first — a closed section's answers cannot change.
  const [finishing, setFinishing] = useState(false);
  const nextSection = async () => {
    setBusy(true);
    try {
      if (dirty.current) await save();
      const r = await api.nextSection(id, attemptId);
      setView(r.data);
      setAnswers(r.data.answers || {});
      setI(0);
      setFinishing(false);
      toast.success(r.data.status === 'in_progress' ? 'On to the next section' : 'Your answers have been submitted');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const qs = view?.questions || [];
  const q = qs[i];
  const set = (qid, patch) => {
    setAnswers((a) => ({ ...a, [qid]: { ...(a[qid] || {}), ...patch } }));
    dirty.current = true;
    setState('dirty');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(), 800);
  };
  const answered = (x) => {
    const a = answers[String(x._id)];
    return a && ((a.selected && a.selected.length) || (a.value !== null && a.value !== undefined && a.value !== '') || (a.text && a.text.trim()));
  };
  const counts = useMemo(() => ({ answered: qs.filter(answered).length, flagged: qs.filter((x) => answers[String(x._id)]?.flagged).length }), [qs, answers]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="adm-exam"><div style={{ padding: 40 }}><ErrorBox error={error} onRetry={load} /></div></div>;
  if (!view) return <div className="adm-exam"><Spin label="Opening your exam…" /></div>;

  if (view.status !== 'in_progress') {
    return (
      <div className="adm-exam">
        <div style={{ maxWidth: 560, margin: '60px auto', padding: 20 }}>
          <div className="adm-authcard">
            <h1>{view.status === 'auto_submitted' || timedOut ? 'Time is up — your answers were submitted' : 'Exam submitted'}</h1>
            <p>{view.exam.name}. Your answers are saved with the school{view.score !== undefined ? ` — you scored ${view.score}` : ''}. The result will appear on your application when the school publishes it.</p>
            <Btn kind="primary" onClick={() => nav(`/${slug}/applications/${id}`)}>Back to the application</Btn>
          </div>
        </div>
      </div>
    );
  }

  const qid = String(q._id);
  const a = answers[qid] || {};
  return (
    <div className="adm-exam">
      <header className="adm-exam__bar">
        <div className="adm-exam__title">
          <strong>{view.exam.name}</strong>
          <span>{counts.answered} of {qs.length} answered{counts.flagged ? ` · ${counts.flagged} flagged` : ''}</span>
        </div>
        <span className={`adm-exam__save ${state === 'offline' ? 'is-off' : ''}`}>
          {state === 'saving' ? 'Saving…' : state === 'dirty' ? 'Unsaved' : state === 'offline' ? <><Ico name="wifiOff" size={13} />Offline — will retry</> : <><Ico name="checkCircle" size={13} />Saved</>}
        </span>
        <span className={`adm-exam__clock ${left < 5 * 60 * 1000 ? 'is-low' : ''}`} role="timer" aria-live="off" title={section ? `Time left in ${section.name}` : 'Time left'}>{fmtLeft(left)}</span>
        {lastSection ? <Btn kind="primary" onClick={() => setConfirm(true)}>Submit</Btn> : <Btn kind="primary" onClick={() => setFinishing(true)}>Finish this section</Btn>}
      </header>
      {sections.length ? (
        <nav className="adm-exam__sections" aria-label="Sections">
          {sections.map((x, n) => (
            <span key={x.key} className={`adm-exam__section is-${x.status}`} aria-current={x.status === 'open' ? 'step' : undefined}>
              {x.status === 'done' ? <Ico name="check" size={12} /> : <b>{n + 1}</b>} {x.name} · {Math.round(x.minutes)} min
            </span>
          ))}
        </nav>
      ) : null}
      {view.extraMinutes ? <div className="adm-exam__note">You have {view.extraMinutes} minutes&rsquo; extra time, added to {sections.length ? 'the sections' : 'the exam'}.</div> : null}
      <div className="adm-exam__body">
        <section className="adm-q" aria-labelledby={`q-${qid}`}>
          <div className="adm-q__head">
            <span>Question {i + 1} of {qs.length}{q.subject ? ` · ${q.subject}` : ''}</span>
            <span>{q.marks} mark{q.marks === 1 ? '' : 's'}{view.exam.negativeMarking && q.type !== 'descriptive' ? ' · wrong answers lose marks' : ''}</span>
          </div>
          <div className="adm-q__text" id={`q-${qid}`}>{q.text}</div>
          {['single', 'true_false', 'multiple'].includes(q.type) ? (
            <div className="adm-q__opts" role={q.type === 'multiple' ? 'group' : 'radiogroup'}>
              {q.type === 'multiple' ? <span className="adm-muted" style={{ fontSize: '.82rem' }}>Choose all that apply.</span> : null}
              {q.options.map((o) => {
                const on = (a.selected || []).includes(o.id);
                return (
                  <label key={o.id} className={`adm-q__opt ${on ? 'is-on' : ''}`}>
                    <input type={q.type === 'multiple' ? 'checkbox' : 'radio'} name={qid} checked={on}
                      onChange={(e) => set(qid, { selected: q.type === 'multiple' ? (e.target.checked ? [...(a.selected || []), o.id] : (a.selected || []).filter((x) => x !== o.id)) : [o.id] })} />
                    <span>{o.text}</span>
                  </label>
                );
              })}
              {(a.selected || []).length ? <button type="button" className="adm-linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => set(qid, { selected: [] })}>Clear my answer</button> : null}
            </div>
          ) : q.type === 'numeric' ? (
            <Input type="number" step="any" style={{ maxWidth: 240 }} value={a.value ?? ''} onChange={(e) => set(qid, { value: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Your answer" />
          ) : q.type === 'short' ? (
            <Input value={a.text || ''} maxLength={200} onChange={(e) => set(qid, { text: e.target.value })} aria-label="Your answer" />
          ) : (
            <TextArea rows={10} value={a.text || ''} maxLength={5000} onChange={(e) => set(qid, { text: e.target.value })} aria-label="Your answer" />
          )}
          <div className="adm-q__nav">
            <Btn icon="arrowLeft" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</Btn>
            <Btn kind="ghost" icon="target" onClick={() => set(qid, { flagged: !a.flagged })}>{a.flagged ? 'Unflag' : 'Flag for review'}</Btn>
            {i < qs.length - 1 ? <Btn kind="primary" onClick={() => setI(i + 1)}>Next<Ico name="arrowRight" size={15} /></Btn>
              : lastSection ? <Btn kind="primary" onClick={() => setConfirm(true)}>Finish</Btn> : <Btn kind="primary" onClick={() => setFinishing(true)}>Finish this section</Btn>}
          </div>
        </section>
        <aside className="adm-palette-q" aria-label="Questions">
          <strong style={{ fontSize: '.9rem' }}>Questions</strong>
          <div className="adm-palette-q__grid">
            {qs.map((x, n) => (
              <button key={String(x._id)} type="button" className={`${answered(x) ? 'is-answered' : ''} ${answers[String(x._id)]?.flagged ? 'is-flagged' : ''} ${n === i ? 'is-on' : ''}`}
                onClick={() => setI(n)} aria-label={`Question ${n + 1}${answered(x) ? ', answered' : ''}`}>{n + 1}</button>
            ))}
          </div>
          <div className="adm-legend">
            <span><i style={{ background: '#dcfce7', borderColor: '#86efac' }} />Answered</span>
            <span><i style={{ boxShadow: 'inset 0 -3px 0 #f59e0b' }} />Flagged</span>
          </div>
          {view.exam.instructions ? <details><summary style={{ cursor: 'pointer', fontSize: '.84rem', fontWeight: 650 }}>Instructions</summary><p className="adm-muted" style={{ fontSize: '.82rem', whiteSpace: 'pre-line', marginTop: 6 }}>{view.exam.instructions}</p></details> : null}
          <p className="adm-muted" style={{ fontSize: '.74rem', margin: 0 }}>This page notes when it is left, when full screen is left, and copying or pasting. The school sees these notes; they never change your score.</p>
        </aside>
      </div>
      <Dialog open={finishing} onClose={() => setFinishing(false)} title={`Finish ${section?.name || 'this section'}?`} width={440}
        footer={<><Btn onClick={() => setFinishing(false)}>Keep working</Btn><Btn kind="primary" busy={busy} onClick={nextSection}>Finish the section</Btn></>}>
        <p>You have answered <b>{counts.answered}</b> of <b>{qs.length}</b> questions in this section{counts.flagged ? <> and flagged <b>{counts.flagged}</b></> : null}.</p>
        <Note tone="amber" icon="alert">Once you move on, this section&rsquo;s answers cannot be changed. The next section starts its clock at once.</Note>
        <Chip tone="gray">{fmtLeft(left)} left in this section</Chip>
      </Dialog>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Submit your answers?" width={440}
        footer={<><Btn onClick={() => setConfirm(false)}>Keep working</Btn><Btn kind="primary" busy={busy} onClick={() => submit(false)}>Submit</Btn></>}>
        <p>You have answered <b>{counts.answered}</b> of <b>{qs.length}</b> questions{counts.flagged ? <> and flagged <b>{counts.flagged}</b></> : null}.</p>
        {counts.answered < qs.length ? <Note tone="amber" icon="alert">Unanswered questions score nothing.</Note> : null}
        <p className="adm-muted adm-mt">Once submitted, the answers cannot be changed.</p>
        <Chip tone="gray">{fmtLeft(left)} left</Chip>
      </Dialog>
    </div>
  );
}
