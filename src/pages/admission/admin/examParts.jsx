/**
 * Entrance exams — the pieces shared by the office's exam screens and a
 * teacher's marking page: the exam's form, the question editor, and the
 * results board (marks entry, evaluation of written answers, and the
 * submit → approve → publish steps, each allowed or not by the server).
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { admin, openProtected } from '../../../api/admission.api';
import {
  Panel, Btn, Chip, ResultsChip, Table, Empty, ErrorBox, Spin, Dialog, ConfirmDialog, Field, Input, TextArea, Select, Toggle, Check, Note,
  IconBtn, KV, useLoad,
} from '../admUI';
import { fmtDateTime, errMsg, toLocalInput } from '../meta';
import { useAdmission, StaffChecks } from './parts';

export const QUESTION_TYPES = [
  ['single', 'One correct option'], ['multiple', 'Several correct options'], ['true_false', 'True or false'],
  ['numeric', 'A number'], ['short', 'A short answer'], ['descriptive', 'A written answer (marked by hand)'],
];
const ELIGIBLE_STATUSES = ['submitted', 'under_review', 'verified', 'eligible', 'exam_completed', 'interview_completed', 'evaluated', 'waitlisted'];
const iso = (local) => (local ? new Date(local).toISOString() : null);

/* ── The exam's form ──────────────────────────────────────────────────────── */

export function emptyExam(round = '') {
  return {
    name: '', round, mode: 'offline', classes: [], description: '', instructions: '', requiredItems: '',
    subjects: [{ key: 's1', name: '', maxMarks: 50, passMarks: 0 }], passMarks: 0, gradeBands: [],
    startsAt: '', endsAt: '', durationMinutes: 60, reportingTime: '', venue: { name: '', room: '', address: '' },
    eligibility: { statuses: null, requireDocsVerified: false, requireApplicationFeePaid: false },
    settings: { negativeMarking: false, negativeFraction: 0.25, randomizeQuestions: true, randomizeOptions: true, attemptsAllowed: 1, showScoreOnSubmit: false },
    admitCard: { enabled: true, releaseAt: '', instructions: '' }, evaluators: [], approvalRequired: true, resultPublishAt: '',
  };
}

export function examToForm(e) {
  return {
    ...emptyExam(), ...e,
    classes: (e.classes || []).map(String),
    subjects: (e.subjects || []).map((s) => ({ ...s })),
    gradeBands: (e.gradeBands || []).map((b) => ({ ...b })),
    startsAt: toLocalInput(e.startsAt), endsAt: toLocalInput(e.endsAt),
    venue: { name: '', room: '', address: '', ...(e.venue || {}) },
    eligibility: { statuses: e.eligibility?.statuses || null, requireDocsVerified: !!e.eligibility?.requireDocsVerified, requireApplicationFeePaid: !!e.eligibility?.requireApplicationFeePaid },
    settings: { ...emptyExam().settings, ...(e.settings || {}) },
    admitCard: { enabled: !!e.admitCard?.enabled, releaseAt: toLocalInput(e.admitCard?.releaseAt), instructions: e.admitCard?.instructions || '' },
    evaluators: (e.evaluators || []).map(String),
    resultPublishAt: toLocalInput(e.resultPublishAt),
  };
}

export function formToExam(f) {
  return {
    ...f,
    subjects: f.subjects.filter((s) => s.name.trim()).map((s, i) => ({
      key: s.key || `s${i + 1}`, name: s.name.trim(), maxMarks: Number(s.maxMarks), passMarks: Number(s.passMarks) || 0,
      ...(f.mode === 'online' ? { minutes: Number(s.minutes) || 0, draw: Number(s.draw) || 0 } : {}),
    })),
    gradeBands: f.gradeBands.filter((b) => String(b.grade).trim()).map((b) => ({ min: Number(b.min) || 0, grade: String(b.grade).trim() })),
    passMarks: Number(f.passMarks) || 0,
    durationMinutes: Number(f.durationMinutes) || 60,
    startsAt: iso(f.startsAt), endsAt: iso(f.endsAt), resultPublishAt: iso(f.resultPublishAt),
    eligibility: { ...f.eligibility, statuses: f.eligibility.statuses || undefined },
    settings: { ...f.settings, negativeFraction: Number(f.settings.negativeFraction) || 0, attemptsAllowed: Number(f.settings.attemptsAllowed) || 1, drawCount: Number(f.settings.drawCount) || 0, retakePolicy: f.settings.retakePolicy || 'latest' },
    admitCard: { ...f.admitCard, releaseAt: iso(f.admitCard.releaseAt) },
  };
}

/** Everything about an exam. `locked`: scheduled — the mode and round stay. */
export function ExamForm({ f, setF, locked, compact }) {
  const adm = useAdmission();
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setIn = (k, sub, v) => setF((x) => ({ ...x, [k]: { ...x[k], [sub]: v } }));
  const round = adm.roundOf(f.round);
  const roundClasses = (round?.classes || []).map((c) => String(c.class));
  const statuses = f.eligibility.statuses || (f.mode === 'interview' ? ['exam_completed', 'evaluated', 'verified', 'eligible'] : ['verified', 'eligible']);
  const online = f.mode === 'online';
  const subjectsMax = f.subjects.reduce((s, x) => s + (Number(x.maxMarks) || 0), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="adm-grid2">
        <Field label="Name" required><Input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={100} data-text="title" placeholder="Entrance test — Class 5" /></Field>
        <Field label="Kind" required>
          <Select value={f.mode} disabled={locked} onChange={(e) => set('mode', e.target.value)}>
            <option value="offline">Written exam at the school</option>
            <option value="online">Online exam on the portal</option>
            <option value="interview">Interview</option>
          </Select>
        </Field>
        <Field label="Admission round" required>
          <Select value={f.round} disabled={locked} onChange={(e) => setF((x) => ({ ...x, round: e.target.value, classes: [] }))}>
            <option value="">Choose a round</option>
            {(adm.rounds || []).map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Classes" required hint={round ? '' : 'Choose the round first'}>
          <div className="adm-choices">
            {roundClasses.map((id) => (
              <label key={id} className={`adm-choice ${f.classes.includes(id) ? 'is-on' : ''}`}>
                <input type="checkbox" checked={f.classes.includes(id)} onChange={(e) => set('classes', e.target.checked ? [...f.classes, id] : f.classes.filter((x) => x !== id))} />{adm.className(id)}
              </label>
            ))}
          </div>
        </Field>
      </div>
      <div className="adm-grid3">
        <Field label={online ? 'Opens' : 'Starts'} required><Input type="datetime-local" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field>
        <Field label={online ? 'Closes' : 'Ends'} required={online}><Input type="datetime-local" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></Field>
        <Field label="Duration (minutes)" hint={online ? 'Each applicant\'s own clock, within the window' : ''}><Input type="number" min="5" max="600" step="5" value={f.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} /></Field>
      </div>
      {!online ? (
        <div className="adm-grid3">
          <Field label="Reporting time"><Input type="time" value={f.reportingTime} onChange={(e) => set('reportingTime', e.target.value)} /></Field>
          <Field label="Venue"><Input value={f.venue.name} onChange={(e) => setIn('venue', 'name', e.target.value)} maxLength={120} data-text="title" placeholder="Main building" /></Field>
          <Field label="Room"><Input value={f.venue.room} onChange={(e) => setIn('venue', 'room', e.target.value)} maxLength={60} data-text="code" /></Field>
          <Field label="Address" className="adm-span2"><Input value={f.venue.address} onChange={(e) => setIn('venue', 'address', e.target.value)} maxLength={300} /></Field>
        </div>
      ) : null}

      <Field label={online ? 'Subjects (optional — questions can be tagged with one)' : 'Subjects or scoring areas'} required={!online} hint={!online ? `Marks are entered against each. Total: ${subjectsMax}` : ''}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {f.subjects.map((s, i) => (
            <div key={i} className="adm-row" style={{ flexWrap: 'nowrap' }}>
              <Input value={s.name} placeholder={f.mode === 'interview' ? 'e.g. Communication' : 'e.g. Mathematics'} maxLength={60} data-text="title"
                onChange={(e) => set('subjects', f.subjects.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input type="number" min="0.5" step="0.5" style={{ width: 110 }} value={s.maxMarks} aria-label="Maximum marks" title="Maximum marks"
                onChange={(e) => set('subjects', f.subjects.map((x, j) => (j === i ? { ...x, maxMarks: e.target.value } : x)))} />
              <Input type="number" min="0" step="0.5" style={{ width: 110 }} value={s.passMarks} aria-label="Pass marks" title="Pass marks (0: none)"
                onChange={(e) => set('subjects', f.subjects.map((x, j) => (j === i ? { ...x, passMarks: e.target.value } : x)))} />
              {online ? (
                <>
                  <Input type="number" min="0" max="300" step="1" style={{ width: 96 }} value={s.minutes ?? 0} aria-label="Minutes (0: not a timed section)" title="Minutes — a timed section (0: none)"
                    onChange={(e) => set('subjects', f.subjects.map((x, j) => (j === i ? { ...x, minutes: e.target.value } : x)))} />
                  <Input type="number" min="0" max="500" step="1" style={{ width: 96 }} value={s.draw ?? 0} aria-label="Questions drawn (0: all)" title="Questions drawn at random for each candidate (0: all)"
                    onChange={(e) => set('subjects', f.subjects.map((x, j) => (j === i ? { ...x, draw: e.target.value } : x)))} />
                </>
              ) : null}
              <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => set('subjects', f.subjects.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => set('subjects', [...f.subjects, { key: `s${Date.now().toString(36)}`, name: '', maxMarks: 25, passMarks: 0 }])}>Add a subject</Btn>
          {online ? <p className="adm-muted" style={{ fontSize: '.78rem', margin: 0 }}>Columns: name · maximum · pass · minutes (a timed section, taken in order — 0: none) · drawn (questions picked at random for each candidate — 0: all; a drawn subject&rsquo;s questions must carry equal marks).</p> : null}
        </div>
      </Field>

      {compact ? null : (
        <>
          <div className="adm-grid2">
            <Field label="Qualifying marks (total)" hint="0: no overall cut-off"><Input type="number" min="0" step="0.5" value={f.passMarks} onChange={(e) => set('passMarks', e.target.value)} /></Field>
            <Field label="Grades" hint="Lowest percentage for each grade, highest first">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {f.gradeBands.map((b, i) => (
                  <div key={i} className="adm-row" style={{ flexWrap: 'nowrap' }}>
                    <Input type="number" min="0" max="100" style={{ width: 100 }} value={b.min} aria-label="From %" onChange={(e) => set('gradeBands', f.gradeBands.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} />
                    <span className="adm-muted">% and above →</span>
                    <Input style={{ width: 90 }} value={b.grade} maxLength={10} aria-label="Grade" data-text="code" onChange={(e) => set('gradeBands', f.gradeBands.map((x, j) => (j === i ? { ...x, grade: e.target.value } : x)))} />
                    <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => set('gradeBands', f.gradeBands.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => set('gradeBands', [...f.gradeBands, { min: 0, grade: '' }])}>Add a grade</Btn>
              </div>
            </Field>
          </div>
          <Field label="Instructions for applicants"><TextArea rows={4} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} maxLength={5000} /></Field>
          {!online ? <Field label="Things to bring"><TextArea rows={2} value={f.requiredItems} onChange={(e) => set('requiredItems', e.target.value)} maxLength={1000} /></Field> : null}

          <Field label="Who can be scheduled" hint="Applications in these statuses, of the chosen classes">
            <div className="adm-choices">
              {ELIGIBLE_STATUSES.map((s) => (
                <label key={s} className={`adm-choice ${statuses.includes(s) ? 'is-on' : ''}`}>
                  <input type="checkbox" checked={statuses.includes(s)} onChange={(e) => setIn('eligibility', 'statuses', e.target.checked ? [...statuses, s] : statuses.filter((x) => x !== s))} />{adm.statusOf(s).label}
                </label>
              ))}
            </div>
          </Field>
          <div className="adm-grid2">
            <Toggle checked={f.eligibility.requireDocsVerified} onChange={(v) => setIn('eligibility', 'requireDocsVerified', v)} label="Only with documents verified" />
            <Toggle checked={f.eligibility.requireApplicationFeePaid} onChange={(v) => setIn('eligibility', 'requireApplicationFeePaid', v)} label="Only with the application fee paid" />
          </div>

          {online ? (
            <Panel title="Online exam" icon="sliders">
              <div className="adm-grid2">
                <Toggle checked={f.settings.randomizeQuestions} onChange={(v) => setIn('settings', 'randomizeQuestions', v)} label="Shuffle the questions" sub="Each applicant gets their own order" />
                <Toggle checked={f.settings.randomizeOptions} onChange={(v) => setIn('settings', 'randomizeOptions', v)} label="Shuffle the options" />
                <Toggle checked={f.settings.negativeMarking} onChange={(v) => setIn('settings', 'negativeMarking', v)} label="Wrong answers lose marks" />
                <Field label="Marks lost per wrong answer (fraction of the question)"><Input type="number" min="0" max="1" step="0.05" disabled={!f.settings.negativeMarking} value={f.settings.negativeFraction} onChange={(e) => setIn('settings', 'negativeFraction', e.target.value)} /></Field>
                <Field label="Attempts allowed"><Input type="number" min="1" max="3" step="1" value={f.settings.attemptsAllowed} onChange={(e) => setIn('settings', 'attemptsAllowed', e.target.value)} /></Field>
                <Field label="With more than one attempt, what counts">
                  <Select value={f.settings.retakePolicy || 'latest'} disabled={Number(f.settings.attemptsAllowed) <= 1} onChange={(e) => setIn('settings', 'retakePolicy', e.target.value)}>
                    <option value="latest">The latest attempt</option><option value="best">The best attempt</option><option value="average">The average of the attempts</option>
                  </Select>
                </Field>
                <Field label="Questions drawn for each candidate" hint="From the whole exam when no subject draws its own — 0: every question"><Input type="number" min="0" max="500" step="1" value={f.settings.drawCount ?? 0} onChange={(e) => setIn('settings', 'drawCount', e.target.value)} /></Field>
                <Toggle checked={f.settings.showScoreOnSubmit} onChange={(v) => setIn('settings', 'showScoreOnSubmit', v)} label="Show the objective score on submitting" sub="Never shown while written answers are unmarked" />
              </div>
            </Panel>
          ) : null}

          <Panel title="Admit cards" icon="idCard">
            <div className="adm-grid2">
              <Toggle checked={f.admitCard.enabled} onChange={(v) => setIn('admitCard', 'enabled', v)} label="Applicants download an admit card" />
              <Field label="Available from" hint="Empty: as soon as they are scheduled"><Input type="datetime-local" disabled={!f.admitCard.enabled} value={f.admitCard.releaseAt} onChange={(e) => setIn('admitCard', 'releaseAt', e.target.value)} /></Field>
            </div>
            <Field label="Printed on the card" className="adm-mt"><TextArea rows={2} disabled={!f.admitCard.enabled} value={f.admitCard.instructions} onChange={(e) => setIn('admitCard', 'instructions', e.target.value)} maxLength={1500} /></Field>
          </Panel>

          <Panel title="Marking and results" icon="clipboard">
            <Field label="Evaluators" hint="Staff who enter marks and evaluate written answers. Administrators always can.">
              <StaffChecks value={f.evaluators} onChange={(v) => set('evaluators', v)} max={30} />
            </Field>
            <div className="adm-grid2 adm-mt">
              <Toggle checked={f.approvalRequired} onChange={(v) => set('approvalRequired', v)} label="Results need an administrator's approval" sub="Evaluators submit; an administrator approves before publishing" />
              <Field label="Publish results automatically at" hint="Once approved. Empty: publish by hand."><Input type="datetime-local" value={f.resultPublishAt} onChange={(e) => set('resultPublishAt', e.target.value)} /></Field>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

/* ── A question ───────────────────────────────────────────────────────────── */

function blankQuestion() {
  return { type: 'single', text: '', options: ['', '', '', ''], correct: [], value: '', tolerance: 0, answers: '', marks: 1, negativeMarks: '', subjectKey: '', explanation: '', difficulty: '', tags: '' };
}
function toEditor(q) {
  if (!q) return blankQuestion();
  return {
    type: q.type, text: q.text,
    options: ['single', 'multiple'].includes(q.type) ? (q.options || []).map((o) => o.text) : ['', '', '', ''],
    correct: ['single', 'multiple'].includes(q.type) ? (q.correct || []).map((c) => (q.options || []).findIndex((o) => o.id === c)).filter((i) => i >= 0) : q.type === 'true_false' ? [String(q.correct?.[0] || 'true')] : [],
    value: q.type === 'numeric' ? q.correct?.value ?? '' : '', tolerance: q.type === 'numeric' ? q.correct?.tolerance ?? 0 : 0,
    answers: q.type === 'short' ? (q.correct?.answers || []).join('\n') : '',
    marks: q.marks, negativeMarks: q.negativeMarks ?? '', subjectKey: q.subjectKey || '', explanation: q.explanation || '', difficulty: q.difficulty || '', tags: (q.tags || []).join(', '),
  };
}
function fromEditor(e) {
  const out = { type: e.type, text: e.text.trim(), marks: Number(e.marks) || 1, negativeMarks: e.negativeMarks === '' ? null : Number(e.negativeMarks), subjectKey: e.subjectKey, explanation: e.explanation.trim(), difficulty: e.difficulty, tags: e.tags.split(',').map((t) => t.trim()).filter(Boolean) };
  if (['single', 'multiple'].includes(e.type)) {
    const opts = e.options.map((o) => o.trim());
    const kept = opts.map((o, i) => ({ o, i })).filter((x) => x.o);
    out.options = kept.map((x) => x.o);
    out.correct = e.correct.map((i) => kept.findIndex((x) => x.i === i)).filter((i) => i >= 0);
  } else if (e.type === 'true_false') out.correct = [e.correct[0] || 'true'];
  else if (e.type === 'numeric') out.correct = { value: Number(e.value), tolerance: Number(e.tolerance) || 0 };
  else if (e.type === 'short') out.correct = { answers: e.answers.split('\n').map((a) => a.trim()).filter(Boolean) };
  return out;
}

/** Add or edit a question — of an exam (`examId`) or of the question bank. */
export function QuestionDialog({ open, onClose, question, examId, subjects = [], onDone }) {
  const [e, setE] = useState(blankQuestion());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setE(toEditor(question)); }, [open, question]);
  const set = (k, v) => setE((x) => ({ ...x, [k]: v }));
  const choice = ['single', 'multiple'].includes(e.type);
  const go = async () => {
    setBusy(true);
    try {
      const body = fromEditor(e);
      if (question?._id) await admin.updateQuestion(question._id, body);
      else if (examId) await admin.addQuestion(examId, body);
      else await admin.addToBank(body);
      toast.success(question?._id ? 'Question saved' : 'Question added');
      onClose();
      onDone?.();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={question?._id ? 'Edit question' : 'Add a question'} width={680}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!e.text.trim()} onClick={go}>Save</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-grid2">
          <Field label="Answer type"><Select value={e.type} onChange={(ev) => setE((x) => ({ ...x, type: ev.target.value, correct: ev.target.value === 'true_false' ? ['true'] : [] }))}>{QUESTION_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <div className="adm-row" style={{ flexWrap: 'nowrap' }}>
            <Field label="Marks"><Input type="number" min="0.5" max="100" step="0.5" value={e.marks} onChange={(ev) => set('marks', ev.target.value)} /></Field>
            <Field label="Lost if wrong" hint="Empty: the exam's rule"><Input type="number" min="0" max="100" step="0.25" value={e.negativeMarks} onChange={(ev) => set('negativeMarks', ev.target.value)} disabled={e.type === 'descriptive'} /></Field>
          </div>
        </div>
        <Field label="Question" required><TextArea rows={3} value={e.text} onChange={(ev) => set('text', ev.target.value)} maxLength={3000} /></Field>
        {choice ? (
          <Field label="Options" hint={e.type === 'single' ? 'Tick the correct option' : 'Tick every correct option'}>
            <div className="adm-opts">
              {e.options.map((o, i) => (
                <div key={i} className="adm-opts__row">
                  <input type={e.type === 'single' ? 'radio' : 'checkbox'} name="correct" aria-label={`Option ${String.fromCharCode(65 + i)} is correct`}
                    checked={e.correct.includes(i)} onChange={(ev) => set('correct', e.type === 'single' ? [i] : ev.target.checked ? [...e.correct, i] : e.correct.filter((x) => x !== i))} />
                  <span className="adm-muted" style={{ width: 16 }}>{String.fromCharCode(65 + i)}</span>
                  <Input value={o} maxLength={500} onChange={(ev) => set('options', e.options.map((x, j) => (j === i ? ev.target.value : x)))} />
                  <IconBtn icon="trash" kind="danger" label="Remove option" disabled={e.options.length <= 2} onClick={() => setE((x) => ({ ...x, options: x.options.filter((_, j) => j !== i), correct: x.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)) }))} />
                </div>
              ))}
              {e.options.length < 8 ? <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => set('options', [...e.options, ''])}>Add an option</Btn> : null}
            </div>
          </Field>
        ) : e.type === 'true_false' ? (
          <Field label="Correct answer"><Select value={e.correct[0] || 'true'} onChange={(ev) => set('correct', [ev.target.value])}><option value="true">True</option><option value="false">False</option></Select></Field>
        ) : e.type === 'numeric' ? (
          <div className="adm-grid2">
            <Field label="Correct number" required><Input type="number" step="any" value={e.value} onChange={(ev) => set('value', ev.target.value)} /></Field>
            <Field label="Accepted either side" hint="0: exactly"><Input type="number" min="0" step="any" value={e.tolerance} onChange={(ev) => set('tolerance', ev.target.value)} /></Field>
          </div>
        ) : e.type === 'short' ? (
          <Field label="Accepted answers" required hint="One per line. Compared without regard to capitals or extra spaces."><TextArea rows={3} value={e.answers} onChange={(ev) => set('answers', ev.target.value)} /></Field>
        ) : <Note icon="pencil">Written answers are marked by an evaluator after the exam.</Note>}
        <div className="adm-grid3">
          <Field label="Subject"><Select value={e.subjectKey} onChange={(ev) => set('subjectKey', ev.target.value)}><option value="">None</option>{subjects.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</Select></Field>
          <Field label="Difficulty"><Select value={e.difficulty} onChange={(ev) => set('difficulty', ev.target.value)}><option value="">—</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></Select></Field>
          <Field label="Tags" hint="Comma separated"><Input value={e.tags} onChange={(ev) => set('tags', ev.target.value)} maxLength={300} data-text="words" /></Field>
        </div>
        <Field label="Explanation (staff only)"><TextArea rows={2} value={e.explanation} onChange={(ev) => set('explanation', ev.target.value)} maxLength={1000} /></Field>
      </div>
    </Dialog>
  );
}

/** One question as a line: its text, the key and the marks. */
export function QuestionLine({ q, n }) {
  const key = ['single', 'multiple'].includes(q.type)
    ? (q.options || []).filter((o) => (q.correct || []).includes(o.id)).map((o) => o.text).join(' · ')
    : q.type === 'true_false' ? (q.correct?.[0] === 'true' ? 'True' : 'False')
    : q.type === 'numeric' ? `${q.correct?.value}${q.correct?.tolerance ? ` ± ${q.correct.tolerance}` : ''}`
    : q.type === 'short' ? (q.correct?.answers || []).join(' / ') : 'Marked by hand';
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ whiteSpace: 'pre-line' }}>{n ? <b>{n}. </b> : null}{q.text}</div>
      <div className="adm-muted" style={{ fontSize: '.76rem', marginTop: 2 }}>{QUESTION_TYPES.find(([k]) => k === q.type)?.[1]} · Answer: {key}</div>
    </div>
  );
}

/* ── Results: marks, evaluation, approval, publication ────────────────────── */

/**
 * The results board of one exam. `isAdmin` comes back from the server with the
 * board — evaluators see the marking, administrators also approve, publish
 * and correct.
 */
const SIGNAL = { tab_hidden: 'left the page', window_blur: 'switched window', fullscreen_exit: 'left full screen', copy: 'copied', paste: 'pasted', context_menu: 'right-clicked', other: 'other' };
/** The exam page's signals as words — "left the page 2×, left full screen 1×". Evidence, never a mark. */
const signalText = (sig = {}) => Object.entries(sig || {}).map(([k, n]) => `${SIGNAL[k] || k} ${n}×`).join(', ');

export function ResultsBoard({ examId, onChanged, showName = false }) {
  const { data, loading, error, reload } = useLoad(() => admin.results(examId), [examId]);
  const [rows, setRows] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [review, setReview] = useState(null);
  const [correct, setCorrect] = useState(null);
  const [publishAt, setPublishAt] = useState('');
  const [step, setStep] = useState(null);   // 'submit' | 'approve' | 'publish'

  useEffect(() => {
    if (!data) return;
    setRows(Object.fromEntries(data.board.map((b) => [b.candidateId, { marks: { ...(b.marks || {}) }, absent: !!b.absent, remarks: b.remarks || '' }])));
    setDirty(false);
  }, [data]);

  const exam = data?.exam;
  const locked = exam && ['approved', 'published'].includes(exam.resultsStatus);
  const offline = exam && exam.mode !== 'online';
  const refresh = () => { reload(); onChanged?.(); };

  const saveMarks = async () => {
    setBusy('save');
    try {
      const list = data.board.filter((b) => !b.resultStatus || !['approved', 'published'].includes(b.resultStatus)).map((b) => ({ candidate: b.candidateId, ...rows[b.candidateId] }));
      const r = await admin.marks(examId, list);
      if (r.data.problems?.length) r.data.problems.slice(0, 4).forEach((p) => toast.error(p));
      toast.success(`${r.data.saved} saved`);
      refresh();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const act = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'submit') await admin.submitResults(examId);
      if (kind === 'approve') await admin.approveResults(examId);
      if (kind === 'publish') {
        const r = await admin.publishResults(examId, publishAt ? new Date(publishAt).toISOString() : null);
        toast.success(r.data?.scheduled ? 'Results will be published at the time set' : `${r.data?.published ?? 0} result(s) published — families are told`);
      } else toast.success(kind === 'submit' ? 'Results submitted for approval' : 'Results approved');
      setStep(null);
      refresh();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const mark = (cid, patch) => { setRows((x) => ({ ...x, [cid]: { ...x[cid], ...patch } })); setDirty(true); };
  const exportAs = (format) => openProtected(admin.resultsExportUrl(examId, format), { download: true, filename: `results.${format}` }).catch((e) => toast.error(e.message));

  if (loading && !data) return <Spin />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const subjects = exam.subjects || [];
  const outdated = data.board.filter((b) => b.published?.outdated).length;
  const actions = [
    offline && !locked ? <Btn key="save" kind="primary" icon="save" busy={busy === 'save'} disabled={!dirty} onClick={saveMarks}>Save marks</Btn> : null,
    ['none', 'in_progress'].includes(exam.resultsStatus) && exam.approvalRequired && !data.panelOnly ? <Btn key="submit" icon="send" busy={busy === 'submit'} disabled={dirty} onClick={() => setStep('submit')}>Submit for approval</Btn> : null,
    data.isAdmin && (exam.resultsStatus === 'submitted' || (!exam.approvalRequired && ['in_progress', 'submitted'].includes(exam.resultsStatus))) ? <Btn key="approve" kind="success" icon="checkCircle" busy={busy === 'approve'} disabled={dirty} onClick={() => setStep('approve')}>Approve results</Btn> : null,
    data.isAdmin && (exam.resultsStatus === 'approved' || (exam.resultsStatus === 'published' && outdated)) ? <Btn key="publish" kind="primary" icon="megaphone" busy={busy === 'publish'} onClick={() => setStep('publish')}>{exam.resultsStatus === 'published' ? 'Publish corrections' : 'Publish results'}</Btn> : null,
  ].filter(Boolean);
  const notes = [
    data.panelOnly ? <Note key="panel" icon="users">You see the candidates whose interview panel you sit on. The exam's evaluators submit the results.</Note> : null,
    data.missing.length && !locked ? <Note key="missing" tone="amber" icon="alert"><b>Still to do ({data.missing.length}):</b> {data.missing.slice(0, 6).join('; ')}{data.missing.length > 6 ? '…' : ''}</Note> : null,
    outdated ? <Note key="outdated" tone="amber" icon="history">{outdated} published result(s) were corrected since — publish again to show families the correction.</Note> : null,
    exam.resultPublishAt && exam.resultsStatus === 'approved' ? <Note key="at" icon="calendar">Results will be published on {fmtDateTime(exam.resultPublishAt)}.</Note> : null,
  ].filter(Boolean);

  return (
    <>
      <Panel pad={!!(actions.length || notes.length)} title={showName ? exam.name : 'Results'} icon="clipboard" sub={`${showName ? `${exam.mode === 'interview' ? 'Interview' : exam.mode === 'online' ? 'Online exam' : 'Written exam'} · ` : ''}${data.board.length} candidate(s)`}
        right={<><ResultsChip status={exam.resultsStatus} />{data.isAdmin ? <><Btn size="sm" icon="download" onClick={() => exportAs('xlsx')}>Excel</Btn><Btn size="sm" icon="download" onClick={() => exportAs('csv')}>CSV</Btn></> : null}</>}>
        {notes.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{notes}</div> : null}
        {actions.length ? <div className={`adm-row${notes.length ? ' adm-mt' : ''}`}>{actions}</div> : null}
      </Panel>
      <Panel pad={false}>
        <Table rows={data.board} rowKey={(b) => b.candidateId}
          empty={<Empty icon="users" title="No candidates yet">Schedule candidates first.</Empty>}
          columns={[
            { key: 'roll', label: 'Roll no.', render: (b) => <span className="adm-num">{b.rollNumber}</span> },
            { key: 'student', label: 'Student', render: (b) => <><b>{b.studentName}</b><div className="adm-muted" style={{ fontSize: '.74rem' }}>{b.applicationNumber}</div></> },
            ...(offline ? [
              { key: 'absent', label: 'Absent', render: (b) => <input type="checkbox" aria-label="Absent" disabled={locked || ['approved', 'published'].includes(b.resultStatus)} checked={!!rows[b.candidateId]?.absent} onChange={(e) => mark(b.candidateId, { absent: e.target.checked })} /> },
              ...subjects.map((s) => ({
                key: s.key, label: `${s.name} /${s.maxMarks}`, render: (b) => (
                  <Input type="number" min="0" max={s.maxMarks} step="0.5" style={{ width: 84, height: 34 }} aria-label={`${s.name} marks`}
                    disabled={locked || rows[b.candidateId]?.absent || ['approved', 'published'].includes(b.resultStatus)}
                    value={rows[b.candidateId]?.marks?.[s.key] ?? ''}
                    onChange={(e) => mark(b.candidateId, { marks: { ...rows[b.candidateId].marks, [s.key]: e.target.value } })} />
                ),
              })),
              { key: 'remarks', label: 'Remarks', render: (b) => (
                <Input style={{ minWidth: 140, height: 34 }} maxLength={500} aria-label="Remarks" placeholder="Staff only"
                  disabled={locked || ['approved', 'published'].includes(b.resultStatus)} value={rows[b.candidateId]?.remarks ?? ''}
                  onChange={(e) => mark(b.candidateId, { remarks: e.target.value })} />
              ) },
            ] : [
              { key: 'attempt', label: 'Attempt', render: (b) => (b.attemptId ? <><Chip tone={b.attemptStatus === 'in_progress' ? 'blue' : 'green'}>{b.attemptStatus.replace('_', ' ')}</Chip>{signalText(b.signals) ? <div className="adm-muted" style={{ fontSize: '.72rem' }} title="What the exam page noticed — for the evaluator to weigh; it never changes the score">{signalText(b.signals)}</div> : null}{b.extraMinutes ? <div className="adm-muted" style={{ fontSize: '.72rem' }}>+{b.extraMinutes} min extra time</div> : null}</> : <Chip tone={b.candidateStatus === 'absent' ? 'red' : 'gray'}>{b.candidateStatus === 'absent' ? 'Absent' : 'Not started'}</Chip>) },
              { key: 'auto', label: 'Objective', align: 'right', render: (b) => b.autoScore ?? '—' },
              { key: 'manual', label: 'Written', align: 'right', render: (b) => (Number(b.manualPending) ? <Chip tone="amber">{b.manualPending} to mark</Chip> : b.manualScore ?? '—') },
            ]),
            { key: 'total', label: 'Total', align: 'right', render: (b) => (b.absent ? 'AB' : b.total ?? '—') },
            { key: 'pct', label: '%', align: 'right', render: (b) => (b.percentage ?? '—') },
            { key: 'grade', label: 'Grade', render: (b) => b.grade || '—' },
            { key: 'passed', label: 'Result', render: (b) => (b.passed == null || b.absent ? '—' : <Chip tone={b.passed ? 'green' : 'red'}>{b.passed ? 'Qualified' : 'Not qualified'}</Chip>) },
            { key: 'act', label: '', render: (b) => (
              <div className="adm-row" style={{ gap: 4, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                {!offline && b.attemptId && b.attemptStatus !== 'in_progress' ? <Btn size="sm" onClick={() => setReview(b.attemptId)}>{Number(b.manualPending) ? 'Evaluate' : 'Review'}</Btn> : null}
                {data.isAdmin && b.resultId && ['approved', 'published'].includes(b.resultStatus) ? <Btn size="sm" kind="ghost" icon="pencil" onClick={() => setCorrect(b)}>Correct</Btn> : null}
              </div>
            ) },
          ]} />
      </Panel>
      {offline && !locked ? (
        <span className="adm-muted" style={{ fontSize: '.8rem' }}>Remarks are kept with the result and never shown to families.</span>
      ) : null}
      <AttemptReview attemptId={review} onClose={() => setReview(null)} onDone={refresh} locked={locked} />
      <CorrectResult row={correct} exam={exam} onClose={() => setCorrect(null)} onDone={refresh} />
      <ConfirmDialog open={step === 'submit'} onClose={() => setStep(null)} tone="primary" title="Submit the results for approval?" confirmLabel="Submit"
        message="Marks are checked for every candidate first. Changing a mark afterwards sends the results back to marking." onConfirm={() => act('submit')} />
      <ConfirmDialog open={step === 'approve'} onClose={() => setStep(null)} tone="success" title="Approve these results?" confirmLabel="Approve"
        message="Approved results are locked: later changes are corrections, recorded with a reason." onConfirm={() => act('approve')} />
      <Dialog open={step === 'publish'} onClose={() => setStep(null)} title="Publish the results" width={460}
        footer={<><Btn onClick={() => setStep(null)}>Cancel</Btn><Btn kind="primary" busy={busy === 'publish'} onClick={() => act('publish')}>{publishAt ? 'Schedule' : 'Publish now'}</Btn></>}>
        <p className="adm-muted">Each family sees their child's result on the portal and gets an email. Internal remarks are never shown.</p>
        <Field label="Publish at" hint="Empty: now" className="adm-mt"><Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} /></Field>
      </Dialog>
    </>
  );
}

function AttemptReview({ attemptId, onClose, onDone, locked }) {
  const [d, setD] = useState(null);
  const [marks, setMarks] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!attemptId) return;
    setD(null);
    admin.attemptReview(attemptId).then((r) => {
      setD(r.data);
      setMarks(Object.fromEntries(r.data.questions.filter((q) => q.type === 'descriptive').map((q) => [String(q._id), { marks: q.manual?.marks ?? '', remark: q.manual?.remark || '' }])));
    }).catch((e) => { toast.error(errMsg(e)); onClose(); });
  }, [attemptId]); // eslint-disable-line react-hooks/exhaustive-deps
  const written = d ? d.questions.filter((q) => q.type === 'descriptive') : [];
  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(marks).filter(([, v]) => v.marks !== '' && v.marks != null).map(([k, v]) => [k, { marks: Number(v.marks), remark: v.remark }]));
      const r = await admin.evaluate(attemptId, body);
      toast.success(r.data.manualPending ? `${r.data.manualPending} answer(s) still to mark` : 'Evaluation saved');
      onClose();
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const show = (q) => {
    const a = q.answer;
    if (!a) return <i className="adm-muted">Not answered</i>;
    if (a.selected) return (q.options || []).filter((o) => a.selected.includes(o.id)).map((o) => o.text).join(', ') || <i className="adm-muted">Not answered</i>;
    if (a.value != null) return String(a.value);
    return <span style={{ whiteSpace: 'pre-line' }}>{a.text || <i className="adm-muted">Not answered</i>}</span>;
  };
  return (
    <Dialog open={!!attemptId} onClose={onClose} title={d ? `${d.application?.studentName} — ${d.application?.applicationNumber}` : 'Attempt'} width={820}
      footer={<><Btn onClick={onClose}>Close</Btn>{written.length && !locked ? <Btn kind="primary" busy={busy} onClick={save}>Save marks</Btn> : null}</>}>
      {!d ? <Spin /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <KV cols={4} items={[['Status', d.attempt.status.replace('_', ' ')], ['Started', fmtDateTime(d.attempt.startedAt)], ['Submitted', fmtDateTime(d.attempt.submittedAt)], ['Objective score', d.attempt.autoScore ?? '—']]} />
          {d.attempt.violations?.length ? <Note tone="amber" icon="alert">The exam page noticed: {signalText(d.attempt.violations.reduce((m, v) => ({ ...m, [v.type]: (m[v.type] || 0) + 1 }), {}))} — recorded for the evaluator to weigh; it does not change the score.</Note> : null}
          {d.questions.map((q) => (
            <div key={q._id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
              <div className="adm-row adm-row--between" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}><b>{q.number}.</b> <span style={{ whiteSpace: 'pre-line' }}>{q.text}</span></div>
                <Chip tone="gray">{q.marks} mark{q.marks === 1 ? '' : 's'}</Chip>
              </div>
              <div className="adm-mt" style={{ fontSize: '.88rem' }}><span className="adm-muted">Answer: </span>{show(q)}</div>
              {q.type === 'descriptive' ? (
                <div className="adm-row adm-mt" style={{ flexWrap: 'nowrap' }}>
                  <Input type="number" min="0" max={q.marks} step="0.5" style={{ width: 100 }} disabled={locked} aria-label="Marks given"
                    value={marks[String(q._id)]?.marks ?? ''} onChange={(e) => setMarks((x) => ({ ...x, [String(q._id)]: { ...x[String(q._id)], marks: e.target.value } }))} />
                  <Input placeholder="Remark (staff only)" disabled={locked} maxLength={300}
                    value={marks[String(q._id)]?.remark || ''} onChange={(e) => setMarks((x) => ({ ...x, [String(q._id)]: { ...x[String(q._id)], remark: e.target.value } }))} />
                </div>
              ) : q.result ? (
                <div className="adm-mt"><Chip tone={q.result.marks > 0 ? 'green' : q.result.marks < 0 ? 'red' : 'gray'}>{q.result.marks > 0 ? `+${q.result.marks}` : q.result.marks}</Chip></div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function CorrectResult({ row, exam, onClose, onDone }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (row) setF({ marks: { ...(row.marks || {}) }, absent: !!row.absent, autoScore: row.autoScore ?? '', manualScore: row.manualScore ?? '', reason: '' }); }, [row]);
  const go = async () => {
    setBusy(true);
    try {
      const body = exam.mode === 'online'
        ? { absent: f.absent, autoScore: f.autoScore === '' ? undefined : Number(f.autoScore), manualScore: f.manualScore === '' ? undefined : Number(f.manualScore), reason: f.reason.trim() }
        : { marks: f.marks, absent: f.absent, reason: f.reason.trim() };
      await admin.correctResult(row.resultId, body);
      toast.success('Result corrected');
      onClose();
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const subjects = exam?.subjects || [];
  return (
    <Dialog open={!!row} onClose={onClose} title={`Correct the result — ${row?.studentName || ''}`} width={520}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!f.reason?.trim()} onClick={go}>Save correction</Btn></>}>
      {row ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Note icon="history">The result before and after, who changed it and why are kept with the result.{row.resultStatus === 'published' ? ' Families see the correction once the results are published again.' : ''}</Note>
          <Check checked={f.absent} onChange={(v) => setF({ ...f, absent: v })}>Absent</Check>
          {exam.mode === 'online' ? (
            <div className="adm-grid2">
              <Field label="Objective score"><Input type="number" step="0.5" value={f.autoScore} onChange={(e) => setF({ ...f, autoScore: e.target.value })} /></Field>
              <Field label="Written score"><Input type="number" step="0.5" value={f.manualScore} onChange={(e) => setF({ ...f, manualScore: e.target.value })} /></Field>
            </div>
          ) : (
            <div className="adm-grid2">
              {subjects.map((s) => <Field key={s.key} label={`${s.name} (/${s.maxMarks})`}><Input type="number" min="0" max={s.maxMarks} step="0.5" disabled={f.absent} value={f.marks?.[s.key] ?? ''} onChange={(e) => setF({ ...f, marks: { ...f.marks, [s.key]: e.target.value } })} /></Field>)}
            </div>
          )}
          <Field label="Reason" required><TextArea rows={2} value={f.reason || ''} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={300} /></Field>
        </div>
      ) : null}
    </Dialog>
  );
}

/** Attendance for an offline exam or interview, one candidate at a time. */
export function useAttendance(examId, onDone) {
  return useMemo(() => async (candidateId, present) => {
    try { await admin.attendance(examId, candidateId, present); toast.success(present ? 'Marked present' : 'Marked absent'); onDone?.(); } catch (e) { toast.error(errMsg(e)); }
  }, [examId, onDone]);
}
