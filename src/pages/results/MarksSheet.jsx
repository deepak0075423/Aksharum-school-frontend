/**
 * One marks sheet — every student on the section's roll in roll order, a mark
 * or an absence against each. The one grid for the office (an exam subject,
 * entered or corrected on a teacher's behalf), the subject teacher (their own
 * subject's sheet) and the class test (a teacher's own test).
 *
 *   load()       → { exam, subject, config, teachers, sheet, editable, correcting, students }
 *                  (school-backend resultBoard.marksSheet; resultTeacher.testSheet
 *                  answers in the same shape)
 *   save(body)   body { submit, entries, version } → { examStatus? }
 *   history()    → { entries } — the sheet's saves and every mark changed (optional)
 *   actions      extra footer buttons, for a sheet opened to be approved
 *   readFile     (file) → { file, rows } — given, the sheet can be downloaded
 *                to fill in elsewhere and imported back (marksImport.js); the
 *                imported marks fill the grid, to be checked and saved as typed
 *   submitLabel  "Submit Marks" / "Submit for Approval"
 *   submittedText  what a submit says — a string, or (reply) => string when
 *                the reply decides it (a class test approved as it went in)
 *
 * The paper decides the columns (Oct 2026): a mark; a mark in each of its
 * parts (theory, practical…) with their total; or, for a graded paper, a grade
 * picked from the school's scale. An elective lists its takers only. A student
 * moved to another section, or gone from the school, after marks were entered
 * is still listed — marked so — and their marks are kept, but need not be
 * given for the sheet to go in.
 *
 * Three states, said by the server:
 *   · open        save a draft, or submit;
 *   · correcting  already submitted — a change is saved as submitted, so it
 *                 must leave no student blank;
 *   · read-only   anything else, with the reason given.
 * What is typed is checked here for the reader's sake and again by the server.
 * A save carries the version the sheet was opened at: one landing on top of
 * somebody else's newer changes is refused, and the sheet can be reloaded.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../components/ui/index';
import { Btn, Badge, Check, Ico, downloadCsv, fmtDay, fmtStamp, plural } from './rsUI';
import { classLine } from './resultMeta';
import { matchImport } from './marksImport';

const SHEET = {
  NOT_STARTED: { label: 'Not started', tone: 'slate' },
  DRAFT: { label: 'In progress', tone: 'amber' },
  SUBMITTED: { label: 'Submitted', tone: 'green' },
};

const LOCKED = {
  DRAFT: 'Mark entry has not been opened for this exam yet.',
  REJECTED: 'These marks were rejected. They can be corrected once the exam is reopened.',
  FINAL_APPROVED: 'These results are published and can no longer change here.',
  SUBMITTED: 'These marks are with the class teacher for validation.',
  CLASS_APPROVED: 'These marks have been validated and are waiting to be published.',
};

export default function MarksSheet({ open, sheetKey, ...rest }) {
  return open ? <Sheet key={sheetKey} {...rest} /> : null;
}

const asRow = (s) => ({
  ...s,
  marksObtained: s.marksObtained ?? '',
  parts: Object.fromEntries(Object.entries(s.parts || {}).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])),
  grade: s.grade || '',
});

function Sheet({ load, save, history, onClose, onSaved, actions, readFile, submitLabel = 'Submit Marks', submittedText, lockedText }) {
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState('');       // '' | 'draft' | 'submit'
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);      // somebody else saved since this was opened
  const [leaving, setLeaving] = useState(false);
  const [imported, setImported] = useState(null);   // { file, marks, absent, problems, untouched }
  const [reading, setReading] = useState(false);
  const [log, setLog] = useState(null);           // the sheet's history, once asked for
  const grid = useRef(null);
  const picker = useRef(null);

  const fetchSheet = useCallback(() => load().then((res) => {
    const d = res.data ?? res;
    setData(d);
    setRows(d.students.map(asRow));
    setDirty(false); setStale(false); setError(''); setImported(null);
  }), [load]);

  useEffect(() => {
    let alive = true;
    load().then((res) => {
      if (!alive) return;
      const d = res.data ?? res;
      setData(d);
      setRows(d.students.map(asRow));
    }).catch((e) => { toast.error(e.message); onClose(); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cfg = data?.config || {};
  const parts = Array.isArray(cfg.components) && cfg.components.length ? cfg.components : null;
  const graded = !!cfg.gradeOnly;
  const max = cfg.maxMarks ?? 0;
  const pass = cfg.passingMarks ?? 0;
  const editable = !!data?.editable;
  // A sheet that has been submitted is corrected, not drafted again: saving a
  // "draft" over it would quietly take it back out of the count of sheets in.
  const correcting = !!data?.correcting || (editable && data?.sheet.status === 'SUBMITTED');

  const setRow = (id, patch) => { setRows((list) => list.map((r) => (r._id === id ? { ...r, ...patch } : r))); setDirty(true); setError(''); };
  const outOf = (v, m) => v !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > m);
  const bad = (r) => {
    if (r.isAbsent || graded) return false;
    if (parts) return parts.some((c) => outOf(r.parts?.[c.key] ?? '', Number(c.maxMarks)));
    return outOf(r.marksObtained, max);
  };
  const partsTotal = (r) => (parts && parts.every((c) => (r.parts?.[c.key] ?? '') !== '')
    ? Math.round(parts.reduce((t, c) => t + Number(r.parts[c.key]), 0) * 100) / 100 : null);
  const answered = (r) => r.isAbsent || (graded ? !!r.grade : parts ? partsTotal(r) !== null : r.marksObtained !== '');
  const markOf = (r) => (parts ? partsTotal(r) : r.marksObtained === '' ? null : Number(r.marksObtained));
  const failsPart = (r) => parts && parts.some((c) => Number(c.passingMarks) > 0 && (r.parts?.[c.key] ?? '') !== '' && Number(r.parts[c.key]) < Number(c.passingMarks));
  // Owed: on the roll (an elective's roster); a student off the roll keeps their marks but owes none.
  const owed = rows.filter((r) => !r.offRoll);

  const tally = useMemo(() => {
    const sat = rows.filter((r) => !r.isAbsent && !graded && markOf(r) !== null && Number.isFinite(markOf(r)));
    return {
      entered: owed.filter(answered).length,
      absent: rows.filter((r) => r.isAbsent).length,
      below: sat.filter((r) => markOf(r) < pass || failsPart(r)).length,
      avg: sat.length ? sat.reduce((t, r) => t + markOf(r), 0) / sat.length : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, pass, graded, parts]);

  /** Enter or ↓ moves to the next student's box in the same column, ↑ to the one before. */
  const onKey = (e) => {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const col = e.currentTarget.dataset.col;
    const inputs = [...(grid.current?.querySelectorAll(`input[data-col="${col}"]:not(:disabled)`) || [])];
    const at = inputs.indexOf(e.currentTarget);
    const next = inputs[at + (e.key === 'ArrowUp' ? -1 : 1)];
    if (next) { next.focus(); next.select(); } else e.currentTarget.blur();
  };

  const run = async (submit) => {
    const wrong = rows.find(bad);
    if (wrong) { setError(`${wrong.name}: marks must be between 0 and the maximum`); return; }
    const final = submit || correcting;
    if (final) {
      const blank = owed.filter((r) => !answered(r)).length;
      if (blank) { setError(`Enter marks or mark absent for every student first — ${plural(blank, 'student')} still blank`); return; }
    }
    setSaving(final ? 'submit' : 'draft'); setError('');
    try {
      const res = await save({
        submit: final,
        version: data.sheet?.version,
        entries: rows.map((r) => ({
          student: r._id, isAbsent: !!r.isAbsent, remarks: r.remarks || '',
          marksObtained: r.isAbsent || parts || graded || r.marksObtained === '' ? null : Number(r.marksObtained),
          ...(parts ? { parts: Object.fromEntries(parts.map((c) => [c.key, r.isAbsent || (r.parts?.[c.key] ?? '') === '' ? null : Number(r.parts[c.key])])) } : {}),
          ...(graded ? { grade: r.isAbsent ? '' : r.grade } : {}),
        })),
      });
      const moved = res?.examStatus === 'SUBMITTED' && data.exam.status !== 'SUBMITTED';
      toast.success(correcting ? 'Correction saved'
        : final ? (moved ? 'Marks submitted — every subject is in, so the exam has gone to the class teacher'
          : (typeof submittedText === 'function' ? submittedText(res) : submittedText) || 'Marks submitted')
          : 'Draft saved');
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message || 'The marks could not be saved');
      if (e.data?.code === 'SHEET_CHANGED' || e.response?.data?.code === 'SHEET_CHANGED' || /changed .*after you opened/.test(e.message || '')) setStale(true);
      setSaving('');
    }
  };

  const close = () => { if (saving) return; if (dirty && editable) setLeaving(true); else onClose(); };

  /** The sheet as a file to fill in elsewhere — the same columns the import reads. */
  const download = () => {
    const name = `${data.subject.subjectName} - ${data.exam.title} - ${classLine(data.exam)}.csv`.replace(/[\\/:*?"<>|]/g, ' ');
    const own = rows.filter((r) => !r.offRoll);
    if (graded) {
      downloadCsv(name, ['Roll No', 'Admission No', 'Student', 'Grade', 'Absent', 'Remarks'],
        own.map((r) => [r.rollNumber, r.admissionNumber, r.name, r.isAbsent ? '' : r.grade, r.isAbsent ? 'AB' : '', r.remarks || '']));
    } else if (parts) {
      downloadCsv(name, ['Roll No', 'Admission No', 'Student', ...parts.map((c) => `${c.label} (out of ${c.maxMarks})`), 'Absent', 'Remarks'],
        own.map((r) => [r.rollNumber, r.admissionNumber, r.name, ...parts.map((c) => (r.isAbsent ? '' : r.parts?.[c.key] ?? '')), r.isAbsent ? 'AB' : '', r.remarks || '']));
    } else {
      downloadCsv(name, ['Roll No', 'Admission No', 'Student', `Marks (out of ${max})`, 'Absent', 'Remarks'],
        own.map((r) => [r.rollNumber, r.admissionNumber, r.name, r.isAbsent ? '' : r.marksObtained, r.isAbsent ? 'AB' : '', r.remarks || '']));
    }
  };
  /** A filled-in file: read on the server, matched here, written into the grid. */
  const importFile = async (file) => {
    if (!file) return;
    setReading(true); setError('');
    try {
      const res = await readFile(file);
      const d = res.data ?? res;
      const m = matchImport(d.rows || [], rows.filter((r) => !r.offRoll), max, { components: parts, gradeOnly: graded, grades: cfg.grades || [] });
      if (m.fill.size) {
        setRows((list) => list.map((r) => {
          const f = m.fill.get(r._id);
          return f ? { ...r, ...f, remarks: f.remarks || r.remarks } : r;
        }));
        setDirty(true);
      }
      setImported({ file: d.file || file.name, marks: m.marks, absent: m.absent, problems: m.problems, untouched: m.untouched });
    } catch (e) {
      setError(e.message || 'The file could not be read');
    } finally {
      setReading(false);
      if (picker.current) picker.current.value = '';
    }
  };
  const showHistory = async () => {
    if (log) { setLog(null); return; }
    try {
      const res = await history();
      setLog((res.data ?? res).entries || []);
    } catch (e) { toast.error(e.message || 'The history could not be loaded'); }
  };
  const sheet = SHEET[data?.sheet.status] || SHEET.NOT_STARTED;

  return (
    <>
      <Modal open onClose={close} maxWidth={parts ? 1040 : 900}
        title={(
          <span className="rs-ask__title rs-t-indigo">
            <i><Ico name="clipboard" size={18} /></i>
            <span>
              {data ? `${data.subject.subjectName} — ${data.exam.title}` : 'Marks'}
              <small>{data ? [classLine(data.exam), data.exam.yearName].filter(Boolean).join(' · ') : 'Loading…'}</small>
            </span>
          </span>
        )}
        footer={data ? (
          <>
            <span className="rs-marks__tally">
              {tally.entered} of {plural(owed.length, 'student')} entered
              {tally.absent ? ` · ${tally.absent} absent` : ''}
              {tally.below ? ` · ${tally.below} below pass` : ''}
              {tally.avg !== null ? ` · average ${Math.round(tally.avg * 10) / 10}` : ''}
            </span>
            <span className="rs-form__foot">
              <Btn onClick={close} disabled={!!saving}>{editable ? 'Cancel' : 'Close'}</Btn>
              {editable && !correcting ? <Btn busy={saving === 'draft'} disabled={!!saving || stale} onClick={() => run(false)}>Save Draft</Btn> : null}
              {editable ? (
                <Btn kind="primary" busy={saving === 'submit'} disabled={!!saving || stale || (correcting && !dirty)} onClick={() => run(true)}>
                  {correcting ? 'Save Correction' : submitLabel}
                </Btn>
              ) : actions}
            </span>
          </>
        ) : null}>
        {!data ? <div className="rs-loading" role="status">Loading the sheet…</div> : (
          <div className="rs-marks">
            <div className="rs-marks__facts">
              <span><small>Maximum</small><strong>{graded ? 'Graded' : max}</strong></span>
              {!graded ? <span><small>Pass mark</small><strong>{pass}</strong></span> : null}
              <span><small>{data.test ? 'Test date' : 'Paper date'}</small><strong>{cfg.examDate ? fmtDay(cfg.examDate) : '—'}</strong></span>
              <span><small>{data.test ? 'Set by' : 'Subject teacher'}</small><strong>{data.teachers.length ? data.teachers.join(', ') : 'Not assigned'}</strong></span>
              <span><small>Sheet</small><strong><Badge tone={sheet.tone}>{data.test ? data.exam.statusLabel : sheet.label}</Badge></strong></span>
              {history ? <span className="rs-marks__hist"><Btn size="sm" icon="history" onClick={showHistory}>{log ? 'Hide history' : 'History'}</Btn></span> : null}
            </div>

            {cfg.elective ? <p className="rs-form__hint"><Ico name="users" size={14} /> An elective: only the students who take it are listed.</p> : null}
            {parts ? (
              <p className="rs-form__hint">
                In parts: {parts.map((c) => `${c.label} out of ${c.maxMarks}${Number(c.passingMarks) > 0 ? ` (pass ${c.passingMarks})` : ''}`).join(' · ')} — every part with a pass mark must be passed.
              </p>
            ) : null}
            {data.test?.topic ? <p className="rs-form__hint">Topic: {data.test.topic}</p> : null}
            {data.test?.rejectionReason && data.exam.status !== 'FINAL_APPROVED' ? (
              <p className="rs-form__note rs-form__note--red"><Ico name="alertTri" size={15} />Rejected by the class teacher: “{data.test.rejectionReason}”</p>
            ) : null}
            {data.sheet.status === 'SUBMITTED' && data.sheet.submittedBy ? (
              <p className="rs-form__hint">Submitted by {data.sheet.submittedBy}{data.sheet.submittedAt ? ` on ${fmtStamp(data.sheet.submittedAt)}` : ''}.</p>
            ) : null}
            {correcting ? (
              <p className="rs-form__note"><Ico name="info" size={15} />{data.correcting
                ? (data.exam.status === 'CLASS_APPROVED'
                  ? 'These marks have been validated. A correction is saved as submitted, and sends them back to the class teacher to validate again.'
                  : 'These marks have gone forward for validation. A correction is saved as submitted, so no student can be left blank.')
                : 'This sheet has been submitted. A correction is saved as submitted, so no student can be left blank.'}</p>
            ) : !editable ? (
              <p className="rs-form__note"><Ico name="lock" size={15} />{lockedText
                || LOCKED[data.exam.status]
                || (data.exam.archived ? 'This exam is archived. Restore it to change its marks.' : 'These marks can no longer be changed.')}</p>
            ) : null}
            {error ? (
              <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}
                {stale ? <Btn size="sm" icon="refresh" onClick={() => fetchSheet().catch((e) => toast.error(e.message))}>Reload the sheet</Btn> : null}
              </p>
            ) : null}

            {log ? (
              <section className="rs-marks__log" aria-label="Sheet history">
                {log.length ? log.map((a, i) => (
                  <div key={`${a.at}${i}`} className="rs-marks__logrow">
                    <span><strong>{a.label}</strong>{a.by ? ` · ${a.by}` : ''}<small>{fmtStamp(a.at)}{a.notes ? ` · ${a.notes}` : ''}</small></span>
                    {a.changes.length ? (
                      <ul>{a.changes.map((c) => <li key={c.student}>{c.name}: {c.before} → <b>{c.after}</b></li>)}</ul>
                    ) : null}
                  </div>
                )) : <p className="rs-form__hint">Nothing has been saved on this sheet yet.</p>}
              </section>
            ) : null}

            {editable && readFile && rows.length ? (
              <div className="rs-marks__io">
                <span>Fill the marks in Excel? Download the sheet, enter the marks, and import it back — nothing is saved until you save here.</span>
                <Btn size="sm" icon="download" onClick={download}>Download Sheet</Btn>
                <Btn size="sm" icon="upload" busy={reading} onClick={() => picker.current?.click()}>Import from Excel</Btn>
                <input ref={picker} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => importFile(e.target.files?.[0])} />
              </div>
            ) : null}
            {imported ? (
              <div className={`rs-marks__imported${imported.problems.length ? ' has-problems' : ''}`} role="status">
                <p>
                  <Ico name={imported.problems.length ? 'alertTri' : 'checkCircle'} size={15} />
                  From {imported.file}: {plural(imported.marks, graded ? 'grade' : 'mark')}{imported.absent ? ` and ${plural(imported.absent, 'absence', 'absences')}` : ''} filled in.
                  {imported.untouched ? ` ${plural(imported.untouched, 'student')} left as they were.` : ''} Check them, then save.
                </p>
                {imported.problems.length ? (
                  <ul>
                    {imported.problems.slice(0, 8).map((x) => <li key={`${x.line}${x.text}`}>Row {x.line}: {x.text}</li>)}
                    {imported.problems.length > 8 ? <li>…and {imported.problems.length - 8} more</li> : null}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {rows.length ? (
              <div className={`rs-marks__grid${parts ? ' is-parts' : ''}${graded ? ' is-graded' : ''}`} ref={grid}>
                <table>
                  <thead>
                    <tr>
                      <th>Roll</th><th>Student</th>
                      {graded ? <th>Grade</th>
                        : parts ? <>{parts.map((c) => <th key={c.key}>{c.label} <i>/ {c.maxMarks}</i></th>)}<th>Total <i>/ {max}</i></th></>
                          : <th>Marks <i>/ {max}</i></th>}
                      <th>Absent</th><th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const m = markOf(r);
                      const low = !r.isAbsent && !graded && m !== null && !bad(r) && (m < pass || failsPart(r));
                      return (
                        <tr key={r._id} className={[r.isAbsent ? 'is-absent' : '', r.offRoll ? 'is-offroll' : ''].filter(Boolean).join(' ') || undefined}>
                          <td className="rs-num">{r.rollNumber || <span className="rs-muted">—</span>}</td>
                          <td>
                            <strong>{r.name}</strong>{r.admissionNumber ? <small>{r.admissionNumber}</small> : null}
                            {r.offRoll ? <small className="rs-marks__off"><Badge tone="slate" dot={false}>{r.offRollReason || 'Off the roll'}</Badge></small> : null}
                          </td>
                          {graded ? (
                            <td>
                              <select value={r.isAbsent ? '' : r.grade} disabled={!editable || r.isAbsent} aria-label={`Grade for ${r.name}`}
                                onChange={(e) => setRow(r._id, { grade: e.target.value })}>
                                <option value="">{r.isAbsent ? 'AB' : '—'}</option>
                                {(cfg.grades || []).map((g) => <option key={g.grade} value={g.grade}>{g.grade}</option>)}
                              </select>
                            </td>
                          ) : parts ? (
                            <>
                              {parts.map((c) => {
                                const v = r.parts?.[c.key] ?? '';
                                const wrong = outOf(v, Number(c.maxMarks));
                                const under = !wrong && v !== '' && Number(c.passingMarks) > 0 && Number(v) < Number(c.passingMarks);
                                return (
                                  <td key={c.key}>
                                    <input data-mark data-col={c.key} type="number" inputMode="decimal" min="0" max={c.maxMarks} step="any"
                                      value={r.isAbsent ? '' : v} disabled={!editable || r.isAbsent} placeholder={r.isAbsent ? 'AB' : '—'}
                                      className={wrong ? 'is-bad' : under ? 'is-low' : undefined} aria-invalid={wrong || undefined}
                                      aria-label={`${c.label} marks for ${r.name}`} onKeyDown={onKey}
                                      onChange={(e) => setRow(r._id, { parts: { ...(r.parts || {}), [c.key]: e.target.value } })} />
                                  </td>
                                );
                              })}
                              <td className="rs-num"><strong>{r.isAbsent ? 'AB' : m ?? '—'}</strong>{low ? <small className="rs-marks__low">Below pass</small> : null}</td>
                            </>
                          ) : (
                            <td>
                              <input data-mark data-col="marks" type="number" inputMode="decimal" min="0" max={max} step="any" value={r.isAbsent ? '' : r.marksObtained}
                                disabled={!editable || r.isAbsent} placeholder={r.isAbsent ? 'AB' : '—'}
                                className={bad(r) ? 'is-bad' : low ? 'is-low' : undefined} aria-invalid={bad(r) || undefined}
                                aria-label={`Marks for ${r.name}`} onKeyDown={onKey}
                                onChange={(e) => setRow(r._id, { marksObtained: e.target.value })} />
                              {low ? <small className="rs-marks__low">Below pass</small> : null}
                            </td>
                          )}
                          <td><Check checked={r.isAbsent} disabled={!editable} label={`${r.name} was absent`}
                            onChange={(e) => setRow(r._id, { isAbsent: e.target.checked, ...(e.target.checked ? { marksObtained: '', parts: {}, grade: '' } : {}) })} /></td>
                          <td><input type="text" maxLength={300} value={r.remarks} disabled={!editable} placeholder={editable ? 'Optional — families see it' : ''}
                            aria-label={`Remarks for ${r.name}`} onChange={(e) => setRow(r._id, { remarks: e.target.value })} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="rs-form__hint">{cfg.elective ? 'Nobody takes this elective yet — set who does under Results → Electives.' : 'No students are enrolled in this section, so there are no marks to enter.'}</p>}
          </div>
        )}
      </Modal>

      <Modal open={leaving} onClose={() => setLeaving(false)} maxWidth={420} title="Discard unsaved marks?"
        footer={<>
          <Btn onClick={() => setLeaving(false)}>Keep Editing</Btn>
          <Btn kind="danger-solid" onClick={onClose}>Discard</Btn>
        </>}>
        <div className="rs-ask"><p>The marks you changed on this sheet have not been saved.</p></div>
      </Modal>
    </>
  );
}
