/**
 * The steps an exam can take from the admin screens, and the one dialog that
 * asks before taking them.
 *
 * Every step is confirmed, because every step tells somebody something or
 * closes something off: opening mark entry notifies teachers and fixes the
 * subjects, publishing shows results to families. The dialog says what will
 * happen in those terms rather than "Are you sure?".
 *
 * Whether a step is ALLOWED is not decided here — each row arrives with `can`
 * from the server, and the server refuses anything else regardless.
 *
 * A step may also ask which of something it applies to (`pick`): withdrawing
 * or reopening an exam asks which subjects need correcting, so the others stay
 * submitted rather than every teacher submitting again.
 */
import React, { useEffect, useState } from 'react';
import * as api from '../../../api/admin.api';
import { Modal } from '../../../components/ui/index';
import { Btn, Check, Ico, fmtDay, plural } from '../rsUI';
import { classLine } from '../resultMeta';

const Where = ({ r }) => <><strong>{r.title}</strong> ({classLine(r)})</>;

/** The exam's subjects, for a step that asks which of them it is about. */
const subjectsOf = (r) => (Array.isArray(r.subjects) && r.subjects[0]?.subject?.subjectName
  ? Promise.resolve(r.subjects)
  : api.getFormalExam(r._id).then((res) => (res.data ?? res).subjects || []))
  .then((list) => list.map((s) => ({ value: s.subject._id, label: s.subject.subjectName, note: s.sheet?.status === 'SUBMITTED' ? '' : 'not submitted' })));
const PICK_SUBJECTS = (r) => ({
  label: 'Which subjects need correcting?',
  hint: 'Tick only the ones that are wrong — the others stay as submitted. Tick none to reopen every subject.',
  load: () => subjectsOf(r),
});

/** step → what the dialog says and what it calls. `r` is a board row or a detail. */
export const STEPS = {
  open: (r) => ({
    title: 'Open Mark Entry', icon: 'unlock', tone: 'indigo', confirm: 'Open Mark Entry',
    body: <>
      <p>Open mark entry for <Where r={r} />?</p>
      <ul>
        <li>Subject teachers are notified and can start entering marks.</li>
        <li>The subjects and their maximum marks are fixed from here on; dates can still move.</li>
      </ul>
    </>,
    run: () => api.openFormalExamMarks(r._id),
    done: 'Mark entry is open — the subject teachers have been told',
  }),
  draft: (r) => ({
    title: 'Move Back to Draft', icon: 'undo', tone: 'slate', confirm: 'Move to Draft',
    body: <p>Close mark entry for <Where r={r} /> and make it a draft again? No marks have been entered, so nothing is lost.</p>,
    run: () => api.draftFormalExam(r._id),
    done: 'Moved back to draft',
  }),
  validate: (r) => ({
    title: 'Validate Marks', icon: 'shieldCheck', tone: 'blue', confirm: 'Validate Marks',
    body: <>
      <p>Validate the marks for <Where r={r} /> on the class teacher's behalf?</p>
      <ul>
        <li>{r.hasClassTeacher ? `${r.classTeacher || 'The class teacher'} would normally do this.` : 'This section has no class teacher, so only the office can.'}</li>
        <li>Once validated, the results are ready for you to publish.</li>
      </ul>
    </>,
    run: () => api.validateFormalExam(r._id, {}),
    done: 'Marks validated — the results are ready to publish',
  }),
  publish: (r) => {
    const o = r.options || {};
    const shown = o.showInPortal !== false;
    const told = shown && o.notifyOnPublish !== false;
    const when = r.releaseAhead ? <>on <strong>{fmtDay(r.publishDate)}</strong></> : 'straight away';
    return {
    title: 'Publish Results', icon: 'checkCircle', tone: 'green', confirm: 'Publish Results',
    body: <>
      <p>Publish the results of <Where r={r} />?</p>
      <ul>
        <li>Every student's total, percentage, grade and rank is worked out from the validated marks.</li>
        {/* `releaseAhead` is the server's: the result date is a day on the
            school's clock, which the browser's own clock cannot be trusted to read.
            What families are told follows the exam's own switches (bug 20 of the
            Oct 2026 audit: this used to promise a notice the settings had turned off). */}
        <li>{!shown
          ? 'The exam is kept off the student portal: students and parents will not see these results, and nobody is told. Switch “Show in student portal” on to show them.'
          : r.releaseAhead
            ? <>Students and parents will see them from <strong>{fmtDay(r.publishDate)}</strong>, the result date set on this exam — which can still be moved until then.{told ? ' They are told that day.' : ' No notice is sent.'}</>
            : told ? 'Students and parents are notified and can see them straight away.' : 'Students and parents can see them straight away. No notice is sent.'}</li>
        {r.withheldCount ? <li>{plural(r.withheldCount, 'student')}’s results stay withheld: their families see that, not the marks.</li> : null}
        {o.promoteOnPass ? (
          <li>Students who pass move up to the next class{o.promoteSection === 'none' ? ', without a section' : ', into the same section'} — {when}.</li>
        ) : null}
        {o.promoteOnPass ? (
          <li>{o.failedPlacement === 'repeat'
            ? <>Students who do not pass are placed to repeat the class next year — {when}. A re-exam pass moves them up after all.</>
            : 'Students who do not pass stay where they are, for the school to place.'}</li>
        ) : null}
        <li>Its marks can then only be changed by withdrawing the results, or correcting one mark in place; its name can still be corrected.</li>
      </ul>
    </>,
    run: () => api.approveFormalExam(r._id, {}),
    done: (res) => {
      const p = res?.promotion;
      const up = p?.promoted ? `${plural(p.promoted, 'student')} promoted${p.target?.class ? ` to ${p.target.class.className}` : ''}` : '';
      const wait = p?.wait ? `${plural(p.wait, 'student')} will move up once next year's class is set up` : '';
      const moved = p && (p.state === 'done' || p.state === 'waiting')
        ? [up, wait].filter(Boolean).map((x, i) => (i ? `, ${x}` : ` — ${x}`)).join('')
        : p?.state === 'scheduled' ? ` — promotion set for ${fmtDay(p.dueAt)}` : '';
      return `Results published for ${plural(res?.results ?? r.roster, 'student')}${moved}`;
    },
  };
  },
  reject: (r) => ({
    title: 'Reject Marks', icon: 'closeCircle', tone: 'red', confirm: 'Reject Marks', danger: true,
    body: <p>Send the marks for <Where r={r} /> back? The exam stays rejected until you reopen it for the teachers to correct.</p>,
    reason: { label: 'Reason', required: true, placeholder: 'What is wrong with the marks? The teachers will see this.' },
    run: (reason) => api.rejectFormalExam(r._id, { reason }),
    done: 'Marks rejected',
  }),
  reopen: (r) => (r.status === 'FINAL_APPROVED' ? {
    title: 'Withdraw Published Results', icon: 'undo', tone: 'red', confirm: 'Withdraw Results', danger: true,
    body: <>
      <p>Withdraw the published results of <Where r={r} />?</p>
      <ul>
        <li>Students and parents stop seeing these results at once{r.resultsVisible ? ', and are told they are being corrected' : ''}.</li>
        {r.promotion && ['done', 'waiting'].includes(r.promotion.state)
          ? <li>The students this exam promoted go back to their class — except anyone moved again since, who stays where they were put.</li>
          : r.promotion?.state === 'scheduled' ? <li>The promotion set for the result date is called off.</li> : null}
        <li>Mark entry reopens for the subjects you tick: their teachers correct the marks and submit again, then the marks are validated and published afresh.</li>
        <li>For one wrong mark, <em>Correct a mark</em> under the exam's Results changes it in place, without withdrawing anything.</li>
      </ul>
    </>,
    pick: PICK_SUBJECTS(r),
    reason: { label: 'Reason', required: true, placeholder: 'Why are the results being withdrawn? The teachers will see this.' },
    run: (reason, subjects) => api.reopenFormalExam(r._id, { reason, subjects }),
    done: 'Results withdrawn — mark entry is open again',
  } : {
    title: 'Reopen for Correction', icon: 'refresh', tone: 'amber', confirm: 'Reopen Exam',
    body: <>
      <p>Reopen <Where r={r} /> so its marks can be corrected?</p>
      <ul>
        <li>The sheets of the subjects you tick go back to draft, with the marks already entered kept.</li>
        <li>Their teachers are notified, correct what was wrong and submit again.</li>
      </ul>
      {r.rejectionReason ? <p className="rs-ask__quote">Rejected because: {r.rejectionReason}</p> : null}
    </>,
    pick: PICK_SUBJECTS(r),
    reason: { label: 'Note for the teachers', placeholder: 'Optional' },
    run: (reason, subjects) => api.reopenFormalExam(r._id, { reason, subjects }),
    done: 'Exam reopened — the teachers have been told',
  }),
  archive: (r) => ({
    title: 'Archive Exam', icon: 'archive', tone: 'slate', confirm: 'Archive',
    body: <>
      <p>Archive <Where r={r} />?</p>
      <ul>
        <li>It leaves the working tabs and every teacher's queue, and can be restored at any time.</li>
        {r.status === 'FINAL_APPROVED'
          ? <li>Its published results stay visible to students and parents.</li>
          : <li>It keeps its place: restored, it is back at “{r.statusLabel || 'this step'}”.</li>}
      </ul>
    </>,
    run: () => api.archiveFormalExam(r._id),
    done: 'Exam archived',
  }),
  restore: (r) => ({
    title: 'Restore Exam', icon: 'restore', tone: 'indigo', confirm: 'Restore',
    body: <p>Bring <Where r={r} /> back from the archive? It returns to the step it had reached.</p>,
    run: () => api.restoreFormalExam(r._id),
    done: 'Exam restored',
  }),
  delete: (r) => ({
    title: 'Delete Exam', icon: 'trash', tone: 'red', confirm: 'Delete Exam', danger: true,
    body: <p>Delete the draft <Where r={r} />? This cannot be undone.</p>,
    run: () => api.deleteFormalExam(r._id),
    done: 'Draft deleted',
  }),
};

/** The same, for several ticked rows at once. `n` is how many the action applies to. */
export const BULK = {
  open:    (n) => ({ title: 'Open Mark Entry', icon: 'unlock', tone: 'indigo', confirm: `Open ${plural(n, 'Exam')}`,
    body: <p>Open mark entry for {plural(n, 'draft exam')}? Their subject teachers are notified, and subjects and maximum marks are fixed from here on.</p>,
    verb: 'opened for mark entry' }),
  publish: (n) => ({ title: 'Publish Results', icon: 'checkCircle', tone: 'green', confirm: `Publish ${plural(n, 'Exam')}`,
    body: <p>Publish the results of {plural(n, 'validated exam')}? Students and parents are notified; each exam's own result date decides when they see them.</p>,
    verb: 'published' }),
  archive: (n) => ({ title: 'Archive Exams', icon: 'archive', tone: 'slate', confirm: `Archive ${plural(n, 'Exam')}`,
    body: <p>Archive {plural(n, 'exam')}? They leave the working tabs and teachers' queues and can be restored. Published results stay visible to families.</p>,
    verb: 'archived' }),
  restore: (n) => ({ title: 'Restore Exams', icon: 'restore', tone: 'indigo', confirm: `Restore ${plural(n, 'Exam')}`,
    body: <p>Bring {plural(n, 'exam')} back from the archive, each to the step it had reached?</p>,
    verb: 'restored' }),
  delete:  (n) => ({ title: 'Delete Drafts', icon: 'trash', tone: 'red', confirm: `Delete ${plural(n, 'Draft')}`, danger: true,
    body: <p>Delete {plural(n, 'draft exam')}? This cannot be undone.</p>,
    verb: 'deleted' }),
};

/**
 * Ask, then do. `ask` is a STEPS / BULK entry with a `run`; the dialog stays up
 * while it runs and closes only when it worked, so a refusal is read against
 * the question that caused it.
 */
export function ActionDialog({ ask, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  useEffect(() => {
    setReason(''); setError(''); setBusy(false); setOptions(null); setPicked(new Set());
    if (!ask?.pick) return undefined;
    let alive = true;
    ask.pick.load().then((list) => { if (alive) setOptions(list); }).catch(() => { if (alive) setOptions([]); });
    return () => { alive = false; };
  }, [ask]);
  if (!ask) return null;

  const needs = ask.reason?.required && !reason.trim();
  const toggle = (v) => setPicked((s) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  const go = async () => {
    if (needs) { setError(`${ask.reason.label} is required`); return; }
    setBusy(true); setError('');
    try {
      const res = await ask.run(reason.trim(), [...picked]);
      onDone(res, ask);
    } catch (e) {
      setError(e.message || 'That did not work');
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={500}
      title={<span className={`rs-ask__title rs-t-${ask.tone || 'indigo'}`}><i><Ico name={ask.icon} size={18} /></i>{ask.title}</span>}
      footer={<>
        <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn kind={ask.danger ? 'danger-solid' : 'primary'} busy={busy} onClick={go}>{ask.confirm}</Btn>
      </>}>
      <div className="rs-ask">
        {ask.body}
        {ask.pick ? (
          <fieldset className="rs-ask__pick">
            <legend>{ask.pick.label}</legend>
            {!options ? <p className="rs-loading">Loading…</p> : (
              <div className="rs-ask__picks">
                {options.map((o) => (
                  <label key={o.value}>
                    <Check checked={picked.has(o.value)} disabled={busy} onChange={() => toggle(o.value)} label={o.label} />
                    <span>{o.label}{o.note ? <small> · {o.note}</small> : null}</span>
                  </label>
                ))}
              </div>
            )}
            <small>{picked.size ? `${plural(picked.size, 'subject')} reopened; the rest stay as submitted.` : ask.pick.hint}</small>
          </fieldset>
        ) : null}
        {ask.reason ? (
          <label className="rs-ask__reason">
            <span>{ask.reason.label}{ask.reason.required ? <b aria-hidden> *</b> : null}</span>
            <textarea rows={3} maxLength={500} value={reason} autoFocus placeholder={ask.reason.placeholder}
              onChange={(e) => { setReason(e.target.value); if (error) setError(''); }} aria-required={ask.reason.required || undefined} />
          </label>
        ) : null}
        {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
      </div>
    </Modal>
  );
}
