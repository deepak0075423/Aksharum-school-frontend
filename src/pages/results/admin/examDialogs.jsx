/**
 * The exam drawer's own dialogs (Oct 2026, the second audit):
 *
 *   SendBack      one subject's marks back to its teacher, the rest staying
 *                 in — or, once published, the results withdrawn for that
 *                 paper alone (POST …/return-subject)
 *   CorrectMark   one paper of a published result corrected in place: the
 *                 result and the ranks are worked out again, the family told
 *                 (POST …/correct)
 *   Withhold      results held back from families, with the reason they
 *                 read; the students with an unpaid fee balance offered in
 *                 one go (PUT …/withheld, GET …/fee-dues)
 *   Decide        a final exam's promotion decided by hand for a student —
 *                 promoted on condition, or kept back (PUT …/promotion-decision)
 *
 * Each asks before it acts, says what will happen in those terms, and stays up
 * on a refusal so the reason is read against the question that caused it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/admin.api';
import { Modal } from '../../../components/ui/index';
import { Btn, Check, Ico, plural } from '../rsUI';
import { classLine } from '../resultMeta';

function Frame({ title, icon, tone = 'indigo', busy, error, onClose, confirm, danger, onConfirm, disabled, children, wide }) {
  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={wide ? 600 : 500}
      title={<span className={`rs-ask__title rs-t-${tone}`}><i><Ico name={icon} size={18} /></i>{title}</span>}
      footer={<>
        <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn kind={danger ? 'danger-solid' : 'primary'} busy={busy} disabled={disabled} onClick={onConfirm}>{confirm}</Btn>
      </>}>
      <div className="rs-ask">
        {children}
        {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
      </div>
    </Modal>
  );
}

/** Send one subject's marks back for correction. */
export function SendBack({ exam, subject, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const published = exam.status === 'FINAL_APPROVED';
  const go = async () => {
    if (!reason.trim()) { setError('Say what is wrong — the subject teacher reads it'); return; }
    setBusy(true); setError('');
    try {
      await api.returnExamSubject(exam._id, { subjectId: subject.subject._id, reason: reason.trim() });
      toast.success(published ? `Results withdrawn for ${subject.subject.subjectName} — its teacher has been told` : `${subject.subject.subjectName} marks sent back to its teacher`);
      onDone();
    } catch (e) { setError(e.message || 'That did not work'); setBusy(false); }
  };
  return (
    <Frame title={published ? `Withdraw for ${subject.subject.subjectName}` : `Send ${subject.subject.subjectName} back`} icon="undo" tone={published ? 'red' : 'amber'}
      busy={busy} error={error} onClose={onClose} confirm={published ? 'Withdraw Results' : 'Send Back'} danger={published} onConfirm={go}>
      <p>{published
        ? <>Withdraw the published results of <strong>{exam.title}</strong> ({classLine(exam)}) so the <strong>{subject.subject.subjectName}</strong> marks can be corrected?</>
        : <>Send the <strong>{subject.subject.subjectName}</strong> marks of <strong>{exam.title}</strong> ({classLine(exam)}) back to {subject.teachers.length ? subject.teachers.map((t) => t.name).join(', ') : 'its teacher'}?</>}</p>
      <ul>
        <li>Only this subject's sheet goes back to draft; every other subject's marks stay as they were submitted.</li>
        {published ? <li>Families stop seeing the results until they are published again; a promotion they caused is taken back.</li> : null}
        {['SUBMITTED', 'CLASS_APPROVED'].includes(exam.status) ? <li>Once it is submitted again, the class teacher validates the marks afresh.</li> : null}
        <li>For a single wrong mark in published results, <em>Correct a mark</em> under Results changes it in place instead.</li>
      </ul>
      <label className="rs-ask__reason">
        <span>What is wrong<b aria-hidden> *</b></span>
        <textarea rows={3} maxLength={500} value={reason} autoFocus placeholder="e.g. Question 4 was not totalled on several papers"
          onChange={(e) => { setReason(e.target.value); if (error) setError(''); }} />
      </label>
    </Frame>
  );
}

/** Correct one paper of a published result in place. */
export function CorrectMark({ exam, row, subjects, scale, onClose, onDone }) {
  const papers = (subjects || []).filter((s) => row.subjects.some((x) => x.subject._id === s._id));
  const [subjectId, setSubjectId] = useState(papers[0]?._id || '');
  const cfg = papers.find((s) => s._id === subjectId);
  const now = row.subjects.find((x) => x.subject._id === subjectId);
  const [marks, setMarks] = useState('');
  const [parts, setParts] = useState({});
  const [grade, setGrade] = useState('');
  const [absent, setAbsent] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setAbsent(!!now?.isAbsent && !now?.reExam);
    setMarks(now && !now.isAbsent && !now.gradeOnly ? String(now.reExam?.original?.marksObtained ?? now.marksObtained - (now.graceMarks || 0)) : '');
    setParts(Object.fromEntries((cfg?.components || []).map((c) => [c.key, String((now?.components || []).find((x) => x.key === c.key)?.marks ?? '')])));
    setGrade(now?.gradeOnly && now.grade !== 'AB' ? now.grade : '');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  const go = async () => {
    if (!reason.trim()) { setError('Say why the mark is being corrected — it is kept in the history'); return; }
    setBusy(true); setError('');
    try {
      const body = { student: row.student._id, subject: subjectId, reason: reason.trim(), isAbsent: absent };
      if (!absent) {
        if (cfg?.gradeOnly) body.grade = grade;
        else if (cfg?.components) body.parts = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v === '' ? null : Number(v)]));
        else body.marksObtained = marks === '' ? null : Number(marks);
      }
      const res = await api.correctPublishedMark(exam._id, body);
      const c = res.data?.change;
      toast.success(c ? `${row.student.name}: ${c.before} → ${c.after} — the result has been worked out again` : 'Mark corrected');
      onDone();
    } catch (e) { setError(e.message || 'The mark could not be corrected'); setBusy(false); }
  };
  return (
    <Frame title={`Correct a mark — ${row.student.name}`} icon="pencil" busy={busy} error={error} onClose={onClose} confirm="Correct Mark" onConfirm={go} wide>
      <p>The paper's mark changes on its sheet, the result is worked out again — ranks too — and {row.student.name.split(' ')[0]}'s family is told. Every change is kept in the sheet's history.</p>
      <div className="rs-correct">
        <label><span>Paper</span>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {papers.map((s) => <option key={s._id} value={s._id}>{s.subjectName}</option>)}
          </select>
        </label>
        <p className="rs-correct__now">Now: <strong>{now ? (now.isAbsent ? 'Absent' : now.gradeOnly ? now.grade : `${now.marksObtained} / ${now.maxMarks}`) : '—'}</strong>
          {now?.reExam ? ' (a re-exam mark — this corrects the first sitting)' : ''}{now?.graceMarks ? ` (incl. ${now.graceMarks} grace)` : ''}</p>
        <label className="rs-correct__check">
          <Check checked={absent} onChange={(e) => setAbsent(e.target.checked)} label="Absent from this paper" />
          <span>Absent from this paper</span>
        </label>
        {!absent ? (
          cfg?.gradeOnly ? (
            <label><span>Grade</span>
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="">Choose…</option>
                {(scale || []).map((g) => <option key={g.grade} value={g.grade}>{g.grade}{g.pass === false ? ' (not a pass)' : ''}</option>)}
              </select>
            </label>
          ) : cfg?.components ? (
            <div className="rs-correct__parts">
              {cfg.components.map((c) => (
                <label key={c.key}><span>{c.label} <i>/ {c.maxMarks}</i></span>
                  <input type="number" min="0" max={c.maxMarks} step="any" value={parts[c.key] ?? ''} onChange={(e) => setParts((p) => ({ ...p, [c.key]: e.target.value }))} />
                </label>
              ))}
            </div>
          ) : (
            <label><span>Marks <i>/ {cfg?.maxMarks}</i></span>
              <input type="number" min="0" max={cfg?.maxMarks} step="any" value={marks} onChange={(e) => setMarks(e.target.value)} />
            </label>
          )
        ) : null}
      </div>
      <label className="rs-ask__reason">
        <span>Why<b aria-hidden> *</b></span>
        <textarea rows={2} maxLength={300} value={reason} placeholder="e.g. Page 3 was not added to the total" onChange={(e) => { setReason(e.target.value); if (error) setError(''); }} />
      </label>
    </Frame>
  );
}

/**
 * Hold results back from families, or release them. Withholding lists the
 * exam's results not held now (`rows`, else fetched); releasing lists the ones
 * that are (`exam.withheld`). `only` ticks one student to start with — the
 * row the office opened it from. The office may tick students by hand, or
 * take those with an unpaid fee balance in one go.
 */
export function Withhold({ exam, rows: given, release = false, only = null, onClose, onDone }) {
  const held = useMemo(() => exam.withheld || [], [exam.withheld]);
  const heldIds = useMemo(() => new Set(held.map((w) => String(w.student))), [held]);
  const [rows, setRows] = useState(given || null);
  useEffect(() => {
    if (release || given) return undefined;
    let alive = true;
    api.getFormalExamResults(exam._id).then((res) => { if (alive) setRows(res.data || []); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [exam._id, release, given]);
  const candidates = useMemo(() => (release
    ? held.map((w) => ({ id: String(w.student), name: w.name, sub: w.reason ? `Withheld — ${w.reason}` : 'Withheld' }))
    : (rows || []).filter((r) => !heldIds.has(String(r.student._id)))
      .map((r) => ({ id: String(r.student._id), name: r.student.name, sub: r.student.rollNumber ? `Roll ${r.student.rollNumber}` : '' }))),
  [release, held, rows, heldIds]);
  const [picked, setPicked] = useState(() => new Set(only ? [String(only)] : release ? held.map((w) => String(w.student)) : []));
  const [reason, setReason] = useState('');
  const [dues, setDues] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const loadDues = async () => {
    try {
      const res = await api.getExamFeeDues(exam._id);
      const list = res.data || [];
      setDues(new Map(list.map((x) => [String(x.student), x.due])));
      const owing = list.map((x) => String(x.student)).filter((id) => candidates.some((c) => c.id === id));
      setPicked(new Set(owing));
      if (owing.length && !reason) setReason('Fees due — please contact the school office');
      if (!owing.length) toast(list.length ? 'Everyone with an unpaid balance is withheld already' : 'Nobody in this exam has an unpaid fee balance');
    } catch (e) { toast.error(e.message || 'The fee balances could not be read'); }
  };
  const go = async () => {
    if (!picked.size) { setError('Tick at least one student'); return; }
    if (!release && !reason.trim()) { setError('Say why — the family sees the reason'); return; }
    setBusy(true); setError('');
    try {
      const res = await api.setResultsWithheld(exam._id, { students: [...picked], withhold: !release, reason: reason.trim() });
      const n = res.data?.changed ?? picked.size;
      toast.success(release ? `${plural(n, 'result')} released to families` : `${plural(n, 'result')} withheld`);
      onDone();
    } catch (e) { setError(e.message || 'That did not work'); setBusy(false); }
  };
  const notice = exam.options?.showInPortal !== false && exam.options?.notifyOnPublish !== false;
  return (
    <Frame title={release ? 'Release Withheld Results' : 'Withhold Results'} icon={release ? 'unlock' : 'lock'} tone={release ? 'green' : 'amber'}
      busy={busy} error={error} onClose={onClose} disabled={!release && !rows}
      confirm={`${release ? 'Release' : 'Withhold'}${picked.size ? ` ${picked.size}` : ''}`} onConfirm={go} wide>
      <p>{release
        ? `These students and their parents see the results again${notice ? ', and are told' : ''}.`
        : `The students and their parents see that the result is withheld, and why — not the marks${notice ? '; they are told' : ''}. The school still sees everything, and nothing about the result itself changes.`}</p>
      {!release ? <Btn size="sm" icon="wallet" disabled={!rows} onClick={loadDues}>Tick those with unpaid fees</Btn> : null}
      {!release && !rows ? <p className="rs-loading">Loading the results…</p> : (
        <ul className="rs-pick">
          {candidates.map((c) => (
            <li key={c.id}>
              <Check checked={picked.has(c.id)} onChange={() => toggle(c.id)} label={c.name} />
              <span><strong>{c.name}</strong><small>{[c.sub, dues?.has(c.id) ? `owes ₹${dues.get(c.id).toLocaleString('en-IN')}` : ''].filter(Boolean).join(' · ')}</small></span>
            </li>
          ))}
          {!candidates.length ? <li className="rs-muted">{release ? 'No result is withheld.' : 'Every result is withheld already.'}</li> : null}
        </ul>
      )}
      {!release ? (
        <label className="rs-ask__reason">
          <span>Reason the family reads<b aria-hidden> *</b></span>
          <input type="text" maxLength={200} value={reason} placeholder="e.g. Fees due — please contact the school office" onChange={(e) => { setReason(e.target.value); if (error) setError(''); }} />
        </label>
      ) : null}
    </Frame>
  );
}

/** A final exam's promotion decided by hand for one student. */
export function Decide({ exam, onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [student, setStudent] = useState('');
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const decided = new Map((exam.promotionDecisions || []).map((d) => [String(d.student), d]));
  useEffect(() => {
    api.getFormalExamResults(exam._id).then((res) => setRows(res.data || [])).catch(() => setRows([]));
  }, [exam._id]);
  const pickedRow = (rows || []).find((r) => String(r.student._id) === student);
  useEffect(() => { if (pickedRow) setDecision(pickedRow.isPassed ? 'detain' : 'promote'); }, [student]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    if (!student) { setError('Choose the student'); return; }
    if (!reason.trim()) { setError('Say why — it is kept with the promotion'); return; }
    setBusy(true); setError('');
    try {
      await api.setPromotionDecision(exam._id, { student, decision, reason: reason.trim() });
      toast.success(decision === 'promote' ? `${pickedRow?.student.name || 'The student'} will be promoted on condition` : `${pickedRow?.student.name || 'The student'} will be kept back`);
      onDone();
    } catch (e) { setError(e.message || 'That did not work'); setBusy(false); }
  };
  return (
    <Frame title="Decide a Student's Promotion" icon="gradCap" busy={busy} error={error} onClose={onClose} confirm="Save Decision" onConfirm={go} disabled={!rows} wide>
      <p>Over what the result says: promote a student who did not pass (on condition — a medical absence, say), or keep back one who did. Where the promotion has already run, the student moves now.</p>
      {!rows ? <p className="rs-loading">Loading the results…</p> : rows.length ? (
        <>
          <label className="rs-correct"><span>Student</span>
            <select value={student} onChange={(e) => setStudent(e.target.value)}>
              <option value="">Choose…</option>
              {rows.map((r) => (
                <option key={r.student._id} value={r.student._id} disabled={decided.has(String(r.student._id))}>
                  {r.student.name} — {r.isPassed ? 'passed' : 'did not pass'}{decided.has(String(r.student._id)) ? ' (decided)' : ''}
                </option>
              ))}
            </select>
          </label>
          {pickedRow ? (
            <p className="rs-dnote">{pickedRow.isPassed
              ? <>{pickedRow.student.name} passed. Keeping them back means they {exam.promotion?.placement === 'repeat' ? 'repeat the class next year' : 'stay where they are'}.</>
              : <>{pickedRow.student.name} did not pass. Promoting them on condition moves them up with the others.</>}</p>
          ) : null}
          <label className="rs-ask__reason">
            <span>Why<b aria-hidden> *</b></span>
            <input type="text" maxLength={200} value={reason} placeholder={decision === 'detain' ? 'e.g. Attendance below 75%' : 'e.g. Absent through illness — re-exam in June'} onChange={(e) => { setReason(e.target.value); if (error) setError(''); }} />
          </label>
        </>
      ) : <p className="rs-dnote">Publish the results first — decisions are made against them.</p>}
    </Frame>
  );
}
