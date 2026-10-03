/**
 * Re-exams, in the exam drawer (Oct 2026) — school-backend services/resultExams
 * reExamBoard / saveReExam.
 *
 * Every student the published results failed is listed with each paper they
 * did not pass: the first sitting's marks, and a box for the re-exam's. Above
 * them, the re-exam's date (the students still to sit are told it) and how a
 * re-exam pass counts — as scored, or at exactly the pass mark.
 *
 * Saving rewrites only the results that change; the rank stays the exam's own.
 * A student who passes now is told, and — when this final promotes and has
 * already moved the others — moves up too, even from a repeat placement.
 *
 * A subject teacher sees the same panel for their own subjects' papers
 * (`load`/`save` over the teacher endpoints): the date and how a pass counts
 * are the office's, shown but not changeable (`board.office` is false).
 *
 * Since Oct 2026 each paper may have its own sitting — a day and times — over
 * the re-exam's one date (`board.papers`); the students who sit it are told
 * when it is set or moved. Where the school allows a re-exam in at most so many
 * papers, a student who failed more is shown as not eligible, without boxes.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/admin.api';
import { DrawerSection } from '../../../components/ui/Drawer';
import { Btn, Badge, Ico, fmtDay, inputDay, plural } from '../rsUI';

const RULES = [
  ['scored', 'As scored', 'The re-exam marks replace the first sitting\'s.'],
  ['pass', 'At the pass mark', 'A pass counts as exactly the pass mark; a fail as scored.'],
];
const keyOf = (sid, sub) => `${sid}:${sub}`;
const sittingKey = (x) => (x ? `${inputDay(x.date)}|${x.startTime || ''}|${x.endTime || ''}` : '||');
const sittingText = (x) => (x?.date ? `${fmtDay(x.date)}${x.startTime ? `, ${x.startTime}${x.endTime ? `–${x.endTime}` : ''}` : ''}` : '');

export default function ReExamPanel({
  examId, stamp, onChanged,
  load: loadBoard = () => api.getReExam(examId),
  save: saveBoard = (body) => api.saveReExam(examId, body),
}) {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({});          // key → { marks: '', absent: false }
  const [meta, setMeta] = useState({ rule: 'scored', date: '', note: '' });
  const [papers, setPapers] = useState({});        // subject → { date, startTime, endTime }
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState({});

  const load = () => {
    setError('');
    loadBoard().then((res) => {
      const b = res.data ?? res;
      setBoard(b);
      setMeta({ rule: b.rule, date: inputDay(b.date), note: b.note || '' });
      setPapers(Object.fromEntries((b.papers || []).map((x) => [x.subject, { date: inputDay(x.date), startTime: x.startTime || '', endTime: x.endTime || '' }])));
      const d = {};
      b.students.forEach((s) => s.papers.forEach((p) => {
        d[keyOf(s._id, p.subject)] = { marks: p.reExam && !p.reExam.isAbsent ? String(p.reExam.marksObtained) : '', absent: !!p.reExam?.isAbsent };
      }));
      setDraft(d); setBad({});
    }).catch((e) => setError(e.message || 'The re-exam could not be loaded'));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [examId, stamp]);

  /** What differs from what is saved: entries to send, and the settings that moved. */
  const changes = useMemo(() => {
    if (!board) return { entries: [], settings: {} };
    const entries = [];
    board.students.forEach((s) => s.papers.forEach((p) => {
      const now = draft[keyOf(s._id, p.subject)] || { marks: '', absent: false };
      const was = p.reExam;
      if (now.absent) { if (!was?.isAbsent) entries.push({ student: s._id, subject: p.subject, isAbsent: true }); return; }
      if (now.marks === '') { if (was) entries.push({ student: s._id, subject: p.subject, clear: true }); return; }
      if (!was || was.isAbsent || Number(now.marks) !== Number(was.marksObtained)) entries.push({ student: s._id, subject: p.subject, marksObtained: Number(now.marks), max: p.maxMarks, name: p.subjectName, who: s.name });
    }));
    const settings = {};
    if (!board.office) return { entries, settings };
    if (meta.rule !== board.rule) settings.rule = meta.rule;
    if (meta.date !== inputDay(board.date)) settings.date = meta.date || null;
    if (meta.note.trim() !== (board.note || '')) settings.note = meta.note.trim();
    const moved = (board.papers || []).filter((x) => sittingKey(papers[x.subject]) !== sittingKey(x))
      .map((x) => ({ subject: x.subject, date: papers[x.subject]?.date || null, startTime: papers[x.subject]?.startTime || '', endTime: papers[x.subject]?.endTime || '' }));
    if (moved.length) settings.papers = moved;
    return { entries, settings };
  }, [board, draft, meta, papers]);
  const dirty = changes.entries.length > 0 || Object.keys(changes.settings).length > 0;

  const save = async () => {
    // The server's checks, first here, so a slip is named beside its box.
    const wrong = {};
    changes.entries.forEach((e) => {
      if (e.marksObtained === undefined) return;
      if (!Number.isFinite(e.marksObtained) || e.marksObtained < 0 || e.marksObtained > e.max) wrong[keyOf(e.student, e.subject)] = `0 to ${e.max}`;
    });
    setBad(wrong);
    if (Object.keys(wrong).length) { toast.error('Some re-exam marks are out of range'); return; }
    setBusy(true);
    try {
      const res = await saveBoard({
        ...(board.office ? changes.settings : null),
        entries: changes.entries.map(({ max, name, who, ...e }) => e),
      });
      const b = res.data ?? res;
      const before = board.counts.passedNow;
      toast.success(b.counts.passedNow > before ? `Saved — ${plural(b.counts.passedNow - before, 'more student')} now ${b.counts.passedNow - before === 1 ? 'passes' : 'pass'}` : 'Re-exam saved');
      onChanged();
      load();
    } catch (e) { toast.error(e.message || 'The re-exam could not be saved'); }
    finally { setBusy(false); }
  };

  if (error) return <p className="rs-dnote rs-dnote--warn">{error}</p>;
  if (!board) return <div className="rs-loading" role="status">Loading…</div>;
  if (!board.students.length) return <p className="rs-dnote">Everybody passed every paper, so there is nothing to sit again.</p>;

  const c = board.counts;
  const bar = (
    <div className="rs-rx__save">
      <span>{dirty ? `${plural(changes.entries.length, 'change')} to marks${Object.keys(changes.settings).length ? ', and the re-exam\'s details' : ''}` : 'Everything is saved'}</span>
      <Btn kind="primary" icon="save" busy={busy} disabled={!dirty} onClick={save}>Save Re-exam</Btn>
    </div>
  );
  return (
    <>
      <div className="rs-dstats rs-rx__stats">
        <div><strong>{c.students}</strong><span>Did not pass</span></div>
        <div><strong>{c.papers}</strong><span>Papers to sit</span></div>
        <div><strong>{c.entered}</strong><span>Marks entered</span></div>
        <div><strong>{c.passedNow}</strong><span>Pass now</span></div>
      </div>
      {c.notEligible ? (
        <p className="rs-dnote rs-dnote--warn">{plural(c.notEligible, 'student')} failed more than {board.maxSubjects} {board.maxSubjects === 1 ? 'paper' : 'papers'} — the school allows a re-exam in at most {board.maxSubjects} (Result Settings).</p>
      ) : null}
      {bar}

      {!board.office ? (
        <DrawerSection title="The re-exam">
          <p className="rs-dnote">
            {board.date ? <>Sat on <strong>{fmtDay(board.date)}</strong>{board.note ? ` — ${board.note}` : ''}. </> : 'The office has not set a date yet. '}
            A re-exam pass counts {board.rule === 'pass' ? 'as exactly the pass mark' : 'as scored'}. The office sets the date and how a pass counts; you enter the marks for your subject.
          </p>
          {(board.papers || []).some((x) => x.date) ? (
            <ul className="rs-dpromo__list">
              {board.papers.filter((x) => x.date).map((x) => <li key={x.subject}><strong>{x.subjectName}</strong><span>{sittingText(x)}</span></li>)}
            </ul>
          ) : null}
        </DrawerSection>
      ) : null}
      {board.office ? (
      <DrawerSection title="The re-exam">
        <div className="rs-rx__meta">
          <label className="rs-ask__reason">
            <span>Date <i>optional</i></span>
            <input type="date" value={meta.date} onChange={(e) => setMeta((m) => ({ ...m, date: e.target.value }))} />
          </label>
          <label className="rs-ask__reason">
            <span>Note for families <i>optional</i></span>
            <input value={meta.note} maxLength={300} placeholder="e.g. Hall 2, 9 am" onChange={(e) => setMeta((m) => ({ ...m, note: e.target.value }))} />
          </label>
        </div>
        <p className="rs-dnote">Students with papers still to sit — and their parents — are told the date when you set it.</p>
        {(board.papers || []).length ? (
          <div className="rs-rx__sittings">
            <p className="rs-dpromo__sub">Each paper's own sitting <i>optional — over the date above</i></p>
            {board.papers.map((x) => {
              const v = papers[x.subject] || { date: '', startTime: '', endTime: '' };
              const set = (k, val) => setPapers((all) => ({ ...all, [x.subject]: { ...v, [k]: val } }));
              return (
                <div key={x.subject} className="rs-rx__sitting">
                  <strong>{x.subjectName}</strong>
                  <input type="date" value={v.date} aria-label={`${x.subjectName}: re-exam day`} onChange={(e) => set('date', e.target.value)} />
                  <input type="time" value={v.startTime} aria-label={`${x.subjectName}: starts at`} onChange={(e) => set('startTime', e.target.value)} />
                  <input type="time" value={v.endTime} aria-label={`${x.subjectName}: ends at`} onChange={(e) => set('endTime', e.target.value)} />
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="rs-rx__rules" role="radiogroup" aria-label="How a re-exam pass counts">
          {RULES.map(([v, label, hint]) => (
            <label key={v} className={`rsf-radio${meta.rule === v ? ' is-on' : ''}`}>
              <input type="radio" name="rx-rule" value={v} checked={meta.rule === v} onChange={() => setMeta((m) => ({ ...m, rule: v }))} />
              <span className="rsf-radio__dot" aria-hidden />
              <span><strong>{label}</strong><small>{hint}</small></span>
            </label>
          ))}
        </div>
      </DrawerSection>
      ) : null}

      <DrawerSection title={`Marks · ${plural(c.students, 'student')}`}>
        <ul className="rs-rx__list">
          {board.students.map((s) => (
            <li key={s._id}>
              <div className="rs-rx__who">
                <strong>{s.name}</strong>
                <small>{[s.rollNumber ? `Roll ${s.rollNumber}` : '', s.admissionNumber, s.isActive ? '' : 'account switched off'].filter(Boolean).join(' · ')}</small>
                {s.eligible === false
                  ? <Badge tone="slate" dot={false} title={s.notEligibleReason}>Not eligible</Badge>
                  : <Badge tone={s.passedNow ? 'green' : 'red'} dot={false}>{s.passedNow ? 'Passes now' : 'Not passed'}</Badge>}
              </div>
              {s.eligible === false ? <p className="rs-dnote">{s.notEligibleReason}</p> : null}
              {s.eligible === false ? null : s.papers.map((p) => {
                const k = keyOf(s._id, p.subject);
                const v = draft[k] || { marks: '', absent: false };
                return (
                  <div key={p.subject} className={`rs-rx__paper${bad[k] ? ' is-bad' : ''}`}>
                    <span className="rs-rx__sub">
                      <strong>{p.subjectName}</strong>
                      <small>First: {p.first.isAbsent ? 'absent' : `${p.first.marksObtained} / ${p.maxMarks}`} · pass {p.passingMarks}{p.sitting?.date ? ` · sits ${sittingText(p.sitting)}` : ''}</small>
                    </span>
                    <input type="number" min="0" max={p.maxMarks} step="0.5" value={v.absent ? '' : v.marks} disabled={v.absent || busy}
                      placeholder="—" aria-label={`${s.name}: re-exam marks in ${p.subjectName}, out of ${p.maxMarks}`}
                      onChange={(e) => setDraft((d) => ({ ...d, [k]: { marks: e.target.value, absent: false } }))} />
                    <label className="rs-rx__ab">
                      <input type="checkbox" checked={v.absent} disabled={busy} onChange={(e) => setDraft((d) => ({ ...d, [k]: { marks: '', absent: e.target.checked } }))} />
                      Absent
                    </label>
                    {p.reExam ? <Ico name={p.passedNow ? 'checkCircle' : 'closeCircle'} size={16} className={p.passedNow ? 'rs-rx__ok' : 'rs-rx__no'} /> : <span />}
                    {bad[k] ? <p className="rsf-err">{p.subjectName}: {bad[k]}</p> : null}
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      </DrawerSection>

      {/* A long list gets its save at the foot too; a short one has it in view. */}
      {board.students.length > 3 ? bar : null}
    </>
  );
}
