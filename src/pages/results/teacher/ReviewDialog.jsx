/**
 * The class teacher's review of an exam's marks, before they go to the office.
 *
 * Every student against every subject, with the total, percentage, grade and
 * result they come to (GET /teacher/results/review/:examId). The old screen
 * listed the sheets — who submitted which subject — and not the marks on
 * them, so "approve" was a click made without seeing a single mark.
 *
 * Validate sends the marks to the office to publish; reject sends them back
 * with a reason the subject teachers see, and the office reopens the exam for
 * correction.
 *
 * The figures are the results exactly as publishing would work them out
 * (Oct 2026): grace included where the exam allows it, an elective counted
 * only for its takers ("n/a" for the rest), a paper in parts passed only when
 * each part is, and a graded paper shown by its grade and kept out of the
 * total. The cells are the marks as the teachers entered them.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/teacher.api';
import { Modal } from '../../../components/ui/index';
import { Btn, Badge, Ico, fmtRange, fmtStamp, plural } from '../rsUI';
import { gradeTone, classLine } from '../resultMeta';

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

export default function ReviewDialog({ exam, onClose, onDone }) {
  const [d, setD] = useState(null);
  const [mode, setMode] = useState('');           // '' | 'reject'
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [only, setOnly] = useState('');           // '' | 'below' | 'blank'

  useEffect(() => {
    let alive = true;
    api.getExamReview(exam._id).then((res) => { if (alive) setD(res.data ?? res); })
      .catch((e) => { toast.error(e.message); onClose(); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam._id]);

  const rows = useMemo(() => {
    const list = d?.students || [];
    if (only === 'below') return list.filter((s) => !s.passed && !s.blank);
    if (only === 'blank') return list.filter((s) => s.blank);
    return list;
  }, [d, only]);

  const validate = async () => {
    setBusy('validate'); setError('');
    try {
      await api.approveValidation(exam._id, { remarks: note.trim() });
      toast.success('Marks validated — the office can now publish the results');
      onDone();
    } catch (e) { setError(e.message); setBusy(''); }
  };
  const reject = async () => {
    if (!note.trim()) { setError('Say what needs correcting — the subject teachers will see it'); return; }
    setBusy('reject'); setError('');
    try {
      await api.rejectValidation(exam._id, { remarks: note.trim() });
      toast.success('Marks sent back — the office will reopen the exam for correction');
      onDone();
    } catch (e) { setError(e.message); setBusy(''); }
  };

  const s = d?.stats;
  const below = d ? d.students.filter((x) => !x.passed && !x.blank).length : 0;
  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={1180}
      title={(
        <span className="rs-ask__title rs-t-blue">
          <i><Ico name="shieldCheck" size={18} /></i>
          <span>
            Review Marks — {exam.title}
            <small>{[classLine(exam), exam.yearName, exam.startDate ? fmtRange(exam.startDate, exam.endDate) : ''].filter(Boolean).join(' · ')}</small>
          </span>
        </span>
      )}
      footer={d ? (
        <>
          <span className="rs-marks__tally">
            {plural(s.students, 'student')} · {s.passing} passing every subject{s.blank ? ` · ${plural(s.blank, 'blank entry', 'blank entries')}` : ''}
          </span>
          <span className="rs-form__foot">
            <Btn onClick={onClose} disabled={!!busy}>Close</Btn>
            {d.can.reject ? (
              mode === 'reject'
                ? <Btn kind="danger-solid" busy={busy === 'reject'} disabled={!!busy} onClick={reject}>Send Back</Btn>
                : <Btn kind="danger" icon="undo" disabled={!!busy} onClick={() => { setMode('reject'); setError(''); }}>Reject…</Btn>
            ) : null}
            {d.can.validate && mode !== 'reject' ? <Btn kind="primary" icon="shieldCheck" busy={busy === 'validate'} disabled={!!busy} onClick={validate}>Validate Marks</Btn> : null}
          </span>
        </>
      ) : null}>
      {!d ? <div className="rs-loading" role="status">Loading the marks…</div> : (
        <div className="rs-review">
          <div className="rs-marks__facts">
            <span><small>Students</small><strong>{s.students}</strong></span>
            <span><small>Subjects</small><strong>{d.subjects.length}</strong></span>
            <span><small>Class average</small><strong>{pct(s.avgPct)}</strong></span>
            <span><small>Highest</small><strong>{pct(s.topPct)}</strong></span>
            <span><small>Passing</small><strong>{s.passing} of {s.students}</strong></span>
          </div>

          {d.exam.options?.allowGraceMarks ? (
            <p className="rs-form__note"><Ico name="info" size={15} />This exam allows grace marks — up to {d.exam.options.grace.perSubject} in at most {plural(d.exam.options.grace.maxSubjects, 'subject')}. The totals and results below include them, as publishing will{s.graced ? ` — ${plural(s.graced, 'student')} ${s.graced === 1 ? 'is' : 'are'} carried over the line by grace (marked *)` : ''}.</p>
          ) : null}

          <div className="rs-review__subjects">
            {d.subjects.map((x) => (
              <span key={x._id}>
                <strong>{x.subjectName}</strong>
                <small>{x.teachers.length ? x.teachers.join(', ') : 'Entered by the office'}{x.sheet.submittedAt ? ` · in ${fmtStamp(x.sheet.submittedAt)}` : ''}</small>
              </span>
            ))}
          </div>

          <div className="rs-review__bar">
            <span className="rs-review__filters" role="group" aria-label="Show">
              <button type="button" className={!only ? 'is-on' : ''} onClick={() => setOnly('')}>All students</button>
              <button type="button" className={only === 'below' ? 'is-on' : ''} onClick={() => setOnly('below')} disabled={!below}>Not passing ({below})</button>
              <button type="button" className={only === 'blank' ? 'is-on' : ''} onClick={() => setOnly('blank')} disabled={!s.blank}>Blank entries</button>
            </span>
          </div>

          <div className="rs-review__grid">
            <table>
              <thead>
                <tr>
                  <th className="rs-review__roll">Roll</th>
                  <th className="rs-review__who">Student</th>
                  {d.subjects.map((x) => (
                    <th key={x._id} className="is-num">{x.subjectName}
                      <small>{x.gradeOnly ? 'graded' : `/ ${x.maxMarks} · pass ${x.passingMarks}`}{x.components ? ' · in parts' : ''}{x.elective ? ' · elective' : ''}</small>
                    </th>
                  ))}
                  <th className="is-num">Total<small>/ {d.subjects.filter((x) => !x.gradeOnly).reduce((t, x) => t + x.maxMarks, 0)}</small></th>
                  <th className="is-num">%</th>
                  <th>Grade</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((st) => (
                  <tr key={st._id}>
                    <td className="rs-review__roll rs-num">{st.rollNumber || '—'}</td>
                    <td className="rs-review__who"><strong>{st.name}</strong>{st.admissionNumber ? <small>{st.admissionNumber}</small> : null}</td>
                    {st.cells.map((c, i) => {
                      const sub = d.subjects[i];
                      const parts = c?.parts && sub.components ? sub.components.map((p) => `${p.label} ${c.parts[p.key] ?? '—'}/${p.maxMarks}`).join(', ') : '';
                      return (
                        <td key={sub._id} className={`is-num${!c ? ' is-blank' : c.na ? ' is-na' : c.absent ? ' is-absent' : c.below ? ' is-below' : ''}`} title={parts || undefined}>
                          {!c ? <span title="Nothing entered">—</span> : c.na ? <span title={`${st.name} does not take ${sub.subjectName}`}>n/a</span>
                            : c.absent ? 'AB' : c.grade !== undefined ? c.grade || '—' : c.marks}
                        </td>
                      );
                    })}
                    <td className="is-num"><strong>{st.total}</strong>{st.grace ? <sup title={`Includes ${st.grace} grace marks`}>*</sup> : null}</td>
                    <td className="is-num">{st.percentage}</td>
                    <td><Badge tone={gradeTone(st.grade, d.scale)} dot={false}>{st.grade}</Badge></td>
                    <td>{st.blank ? <Badge tone="amber" dot={false}>Incomplete</Badge> : <Badge tone={st.passed ? 'green' : 'red'} dot={false}>{st.passed ? 'Pass' : 'Fail'}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? <p className="rs-form__hint rs-review__none">No student matches.</p> : null}
          </div>

          {mode === 'reject' ? (
            <label className="rs-ask__reason">
              <span>What needs correcting <b aria-hidden>*</b></span>
              <textarea rows={3} maxLength={500} value={note} autoFocus placeholder="e.g. Science marks for roll 12–18 look entered out of 50, not 100"
                onChange={(e) => { setNote(e.target.value); setError(''); }} />
            </label>
          ) : d.can.validate ? (
            <label className="rs-ask__reason">
              <span>Note to the office <i>optional</i></span>
              <textarea rows={2} maxLength={500} value={note} placeholder="Anything the office should know before publishing"
                onChange={(e) => setNote(e.target.value)} />
            </label>
          ) : (
            <p className="rs-form__note"><Ico name="lock" size={15} />These marks are no longer waiting for validation.</p>
          )}
          {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
        </div>
      )}
    </Modal>
  );
}
