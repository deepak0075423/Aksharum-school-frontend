/**
 * One exam's scorecard, as a student or a parent reads it — every subject's
 * marks, grade and result, the totals, the rank when the exam shows it, the
 * class's own figures beside them, and the promotion a final exam led to.
 * A paper sat again shows the re-exam's marks, with the first sitting beside
 * them; a re-exam the school has dated is said above the marks.
 * Print gives just the card: the page around it is hidden while printing.
 *
 * Since Oct 2026: a paper in parts shows its parts; a graded paper its grade
 * alone; the subject teacher's remark sits under the subject; each subject
 * has the class's average and highest; the rank across the whole class; each
 * re-exam paper its own day; grades are coloured by the exam's own scale; and,
 * within the days the school allows, a paper can be sent back to be checked
 * again (`onRecheck`) — with the answer shown once the school gives it.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui/index';
import { Btn, Badge, Ico, fmtDay, fmtRange, fmtStamp } from '../rsUI';
import { gradeTone, classLine } from '../resultMeta';

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
export const promotedTo = (p) => (p ? [p.to.className, p.to.sectionName].filter(Boolean).join(' – ') : '');
/** "Promoted to Class 7 – A", or — for a student placed to repeat — "Continues in Class 6 – A". */
export const moveText = (p) => (p?.kind === 'repeated' ? 'Continues in' : p?.kind === 'passedOut' ? 'Passed out of' : 'Promoted to');
/** A re-exam paper's day and time. */
export const sittingText = (x) => (x?.date ? `${fmtDay(x.date)}${x.startTime ? `, ${x.startTime}${x.endTime ? `–${x.endTime}` : ''}` : ''}` : 'date to be given');
/** "Re-exam on 12 Jun: Maths, Science" — or each paper on its own day. */
export function reExamLine(due) {
  if (!due) return '';
  const papers = due.papers?.length ? due.papers : due.subjects.map((subjectName) => ({ subjectName, date: due.date }));
  const days = new Set(papers.map((p) => `${p.date || ''}|${p.startTime || ''}`));
  return days.size <= 1
    ? `Re-exam ${papers[0]?.date ? `on ${sittingText(papers[0])}` : '(date to be given)'}: ${papers.map((p) => p.subjectName).join(', ')}`
    : `Re-exam: ${papers.map((p) => `${p.subjectName} ${sittingText(p)}`).join(' · ')}`;
}

const RECHECK = {
  open: ['amber', 'Re-check asked'],
  resolved: ['blue', 'Re-checked'],
  declined: ['slate', 'Re-check declined'],
};

/** Ask for one paper to be checked again. */
function AskRecheck({ result, subject, onClose, onSend }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    if (!reason.trim()) { setError('Say what should be checked — a total, a question, a page'); return; }
    setBusy(true); setError('');
    try { await onSend({ examId: result.exam._id, subjectId: subject._id, reason: reason.trim() }); }
    catch (e) { setError(e.message || 'The request could not be sent'); setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={480}
      title={<span className="rs-ask__title rs-t-indigo"><i><Ico name="search" size={18} /></i><span>Ask for a re-check<small>{subject.subjectName} · {result.exam.title}</small></span></span>}
      footer={<>
        <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn kind="primary" busy={busy} onClick={go}>Send Request</Btn>
      </>}>
      <div className="rs-ask">
        <p>The school checks the paper again — re-totals it, or looks at an answer again — and tells you what it found. If a mark was wrong it is corrected, and the result with it.</p>
        {result.recheck?.until ? <p className="rs-muted">Requests can be made until {fmtDay(result.recheck.until)}.</p> : null}
        <label className="rs-ask__reason">
          <span>What should be checked<b aria-hidden> *</b></span>
          <textarea rows={3} maxLength={500} value={reason} autoFocus placeholder="e.g. Question 4 may not have been added to the total"
            onChange={(e) => { setReason(e.target.value); if (error) setError(''); }} />
        </label>
        {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
      </div>
    </Modal>
  );
}

export default function Scorecard({ result: r, student, onClose, onRecheck }) {
  const [asking, setAsking] = useState(null);
  if (!r) return null;
  const e = r.exam;
  const tone = (g) => gradeTone(g, r.scale);
  const figures = r.subjects.some((x) => x.classFigures);
  const classWide = r.classRank && r.classOutOf && r.classOutOf > (r.outOf || 0);
  const canAsk = !!onRecheck && !!r.recheck?.open;
  const print = () => {
    document.body.classList.add('rs-printing');
    const done = () => { document.body.classList.remove('rs-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  };
  const send = async (body) => {
    await onRecheck(body);
    toast.success('Re-check asked — the school will tell you what it finds');
    setAsking(null);
  };
  return (
    <Modal open onClose={asking ? () => {} : onClose} maxWidth={900}
      title={(
        <span className="rs-ask__title rs-t-indigo">
          <i><Ico name="sheet" size={18} /></i>
          <span>{e.title}<small>{[e.examTypeLabel, e.code, classLine(e), e.yearName, e.termLabel].filter(Boolean).join(' · ')}</small></span>
        </span>
      )}
      footer={(
        <span className="rs-form__foot">
          <Btn icon="printer" onClick={print}>Print</Btn>
          <Btn kind="primary" onClick={onClose}>Close</Btn>
        </span>
      )}>
      <div className="rs-scorecard">
        <header className="rs-scorecard__head">
          <div>
            <h3>{student?.name}</h3>
            <p>{[classLine(e), student?.rollNumber ? `Roll ${student.rollNumber}` : '', student?.admissionNumber].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="rs-scorecard__exam">
            <strong>{e.title}</strong>
            <span>{[e.yearName, e.startDate ? fmtRange(e.startDate, e.endDate) : ''].filter(Boolean).join(' · ')}</span>
          </div>
        </header>

        <div className="rs-scorecard__sum">
          <span><small>Total</small><strong>{r.totalMarks}<i> / {r.totalMaxMarks}</i></strong></span>
          <span><small>Percentage</small><strong>{r.percentage}%</strong></span>
          <span><small>Grade</small><strong><Badge tone={tone(r.grade)} dot={false}>{r.grade}</Badge></strong></span>
          <span><small>Result</small><strong><Badge tone={r.isPassed ? 'green' : 'red'} dot={false}>{r.isPassed ? 'Pass' : 'Fail'}</Badge></strong></span>
          {r.rank ? <span><small>Rank in section</small><strong>{r.rank}<i> of {r.outOf}</i></strong></span> : null}
          {classWide ? <span><small>Rank in class</small><strong>{r.classRank}<i> of {r.classOutOf}</i></strong></span> : null}
        </div>

        {r.reExamDue ? (
          <p className="rs-scorecard__due"><Ico name="calendar" size={16} />
            <span>{reExamLine(r.reExamDue)}{r.reExamDue.note ? ` — ${r.reExamDue.note}` : ''}</span>
          </p>
        ) : null}

        <table className="rs-scorecard__table">
          <thead>
            <tr>
              <th>Subject</th><th className="is-num">Marks</th><th className="is-num">Out of</th><th className="is-num">Pass mark</th><th>Grade</th><th>Result</th>
              {figures ? <th className="is-num">Class avg · top</th> : null}
              {canAsk || r.subjects.some((x) => x.recheck) ? <th><span className="sr-only">Re-check</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {r.subjects.map((x) => {
              const rc = x.recheck ? RECHECK[x.recheck.status] : null;
              return (
                <tr key={x._id} className={x.isAbsent ? 'is-absent' : !x.gradeOnly && !x.isPassed ? 'is-below' : undefined}>
                  <th scope="row">
                    {x.subjectName}{x.subjectCode ? <small>{x.subjectCode}</small> : null}
                    {x.remarks ? <small className="rs-scorecard__remark">“{x.remarks}”</small> : null}
                  </th>
                  {x.gradeOnly ? (
                    <>
                      <td className="is-num rs-muted" colSpan={3}>{x.isAbsent ? 'Absent' : 'Graded'}</td>
                      <td>{x.isAbsent ? 'AB' : <Badge tone={tone(x.grade)} dot={false}>{x.grade}</Badge>}</td>
                      <td className="rs-muted">—</td>
                    </>
                  ) : (
                    <>
                      <td className="is-num">
                        {x.isAbsent ? 'Absent' : x.marksObtained}
                        {!x.isAbsent && x.components?.length ? (
                          <small className="rs-scorecard__parts">{x.components.map((c) => `${c.label} ${c.marks ?? '—'}/${c.maxMarks}`).join(' · ')}</small>
                        ) : null}
                        {x.graceMarks ? <small className="rs-scorecard__grace">incl. {x.graceMarks} grace</small> : null}
                        {x.reExam ? (
                          <small className="rs-scorecard__grace">
                            Re-exam{x.reExam.original ? ` · first ${x.reExam.original.isAbsent ? 'absent' : x.reExam.original.marksObtained}` : ''}
                            {!x.reExam.isAbsent && x.reExam.marksObtained !== null && x.reExam.marksObtained !== x.marksObtained ? ` · scored ${x.reExam.marksObtained}` : ''}
                          </small>
                        ) : null}
                      </td>
                      <td className="is-num">{x.maxMarks}</td>
                      <td className="is-num">{x.passingMarks}</td>
                      <td>{x.isAbsent ? 'AB' : <Badge tone={tone(x.grade)} dot={false}>{x.grade}</Badge>}</td>
                      <td>{x.isAbsent ? <span className="rs-muted">Absent</span> : x.isPassed ? 'Pass' : <strong className="rs-scorecard__fail">Not passed</strong>}</td>
                    </>
                  )}
                  {figures ? <td className="is-num rs-scorecard__fig">{x.classFigures ? `${pct(x.classFigures.avgPct)} · ${pct(x.classFigures.topPct)}` : '—'}</td> : null}
                  {canAsk || r.subjects.some((y) => y.recheck) ? (
                    <td className="rs-scorecard__rc">
                      {rc ? (
                        <span title={x.recheck.response || undefined}>
                          <Badge tone={rc[0]} dot={false}>{x.recheck.status === 'resolved' ? (x.recheck.outcome === 'changed' ? 'Mark corrected' : 'Marks stand') : rc[1]}</Badge>
                          {x.recheck.response ? <small>{x.recheck.response}</small> : null}
                        </span>
                      ) : canAsk ? <button type="button" className="rs-link" onClick={() => setAsking(x)}>Re-check</button> : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th><td className="is-num">{r.totalMarks}</td><td className="is-num">{r.totalMaxMarks}</td><td />
              <td><Badge tone={tone(r.grade)} dot={false}>{r.grade}</Badge></td><td>{r.isPassed ? 'Pass' : 'Fail'}</td>
              {figures ? <td /> : null}
              {canAsk || r.subjects.some((x) => x.recheck) ? <td /> : null}
            </tr>
          </tfoot>
        </table>

        <p className="rs-scorecard__class">
          <Ico name="users" size={15} />
          Class: average {pct(r.classFigures.avgPct)} · highest {pct(r.classFigures.topPct)} · {pct(r.classFigures.passPct)} passed
          {r.grace ? ` · this card includes ${r.grace} grace mark${r.grace === 1 ? '' : 's'}` : ''}
        </p>
        {r.subjects.some((x) => x.gradeOnly) ? <p className="rs-scorecard__note">A graded subject is given a grade only; it is not part of the total.</p> : null}
        {r.reExam ? <p className="rs-scorecard__note">This result includes a re-exam. The rank is the exam's own, from before it.</p> : null}
        {canAsk ? <p className="rs-scorecard__note">Think a paper was marked wrongly? Ask for a re-check by {fmtDay(r.recheck.until)}.</p> : null}
        {r.promotion ? (
          <p className="rs-scorecard__promo"><Ico name="gradCap" size={17} />
            {moveText(r.promotion)} <strong>{promotedTo(r.promotion)}</strong>{r.promotion.kind !== 'passedOut' && r.promotion.to.yearName ? ` for ${r.promotion.to.yearName}` : ''}
            {r.promotion.kind !== 'passedOut' && !r.promotion.to.sectionName ? ' — the school will give the section' : ''} · {fmtStamp(r.promotion.at)}
          </p>
        ) : null}
        {e.description ? <p className="rs-scorecard__note">{e.description}</p> : null}
        <p className="rs-scorecard__foot">Published {e.publishedOn ? fmtStamp(e.publishedOn) : ''}</p>
      </div>
      {asking ? <AskRecheck result={r} subject={asking} onClose={() => setAsking(null)} onSend={send} /> : null}
    </Modal>
  );
}
