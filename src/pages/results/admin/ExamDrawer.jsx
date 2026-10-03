/**
 * One exam, opened beside the list.
 *
 * A slide-over rather than a page: the admin filtered their way to this row
 * and should still have the list when they are done with it. Four views —
 *
 *   Overview    where the exam stands, and what it is waiting for;
 *   Mark Entry  each subject's sheet: who teaches it, how far it has got, and
 *               the way in to enter or correct its marks;
 *   Results     once published: the summary, then every student in rank order;
 *   Re-exam     once published, for the students who did not pass: the papers
 *               they sit again, and the marks (ReExamPanel);
 *   Activity    who did what, newest first.
 *
 * Under Overview, the settings that still mean something once results are out
 * — the student portal, the overall result, the rank, the notice — are
 * switches that take effect at once (PUT …/options), at any step and archived
 * or not; so is sharing the timetable with families, until the results are
 * out. Grace marks change the results themselves, so they are set through
 * Edit and are fixed once the results are published.
 *
 * Since the second audit (Oct 2026) the drawer also sends one subject back to
 * its teacher (the rest staying in), corrects one mark of a published result
 * in place, and withholds results from families — with the reason they read —
 * or releases them (examDialogs.jsx). While any of its dialogs is up, Escape
 * and the backdrop belong to the dialog, not to the drawer underneath.
 *
 * The buttons in the footer are the steps this exam may take now (`exam.can`),
 * the same ones the row's menu offers; the page that owns the list confirms
 * and runs them, then bumps `stamp` so this refetches.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/admin.api';
import Tabs from '../../../components/ui/Tabs';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { Btn, Badge, Check, Ico, Kebab, Meter, downloadCsv, fmtDay, fmtRange, fmtStamp, fmtTime, plural } from '../rsUI';
import { ATTENTION, gradeTone, statusOf, examTypeText, classLine } from '../resultMeta';
import MarksDialog from './MarksDialog';
import PromotionPanel from './PromotionPanel';
import ReExamPanel from './ReExamPanel';
import { CorrectMark, SendBack, Withhold } from './examDialogs';
import { savePdf } from '../reportCards/savePdf';

const FLOW = [['draft', 'Draft'], ['marks', 'Mark Entry'], ['validation', 'Validation'], ['published', 'Published']];
const SHEET = {
  NOT_STARTED: { label: 'Not started', tone: 'slate' },
  DRAFT: { label: 'In progress', tone: 'amber' },
  SUBMITTED: { label: 'Submitted', tone: 'green' },
};
const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const stay = () => {};

/** The switches under Overview: [option, label, what it means now]. */
const LIVE = [
  ['showInPortal', 'Show in student portal', (e, on) => (e.status === 'FINAL_APPROVED'
    ? (on ? 'Students and parents can see these results' : 'Hidden from students and parents')
    : (on ? 'Students and parents see the results once they are published' : 'Students and parents will not see the results'))],
  ['includeInOverall', 'Include in overall result', (e, on) => (on ? 'Counted in the year’s overall result, under Analytics' : 'Not counted in the overall result')],
  ['showRank', 'Show rank on the scorecard', (e, on) => (on ? 'Families see the student’s place in the section' : 'Families see marks and grades, but no rank')],
  ['notifyOnPublish', 'Notify on publishing', (e, on) => (!e.options?.showInPortal ? 'Nobody is told while the exam is kept off the portal'
    : on ? 'Students and parents get a notice when the results are published' : 'Results are published without a notice')],
  // Not one of the exam's options: its own column, read off the exam itself.
  ['timetableShared', 'Share the timetable with families', (e, on) => (on
    ? 'Students and parents see the exam dates, and are told when they change'
    : 'Kept from students and parents until it is shared — teachers still see it')],
];
const OPTION_SAID = {
  showInPortal: (on, published) => (on ? (published ? 'Results are now visible to students and parents' : 'The exam will be shown in the student portal') : 'Results hidden from students and parents'),
  includeInOverall: (on) => (on ? 'Counted in the overall result' : 'Taken out of the overall result'),
  showRank: (on) => (on ? 'The rank shows on the scorecard' : 'The rank is hidden from families'),
  notifyOnPublish: (on) => (on ? 'Families will be told when results are published' : 'Results will be published without a notice'),
  timetableShared: (on) => (on ? 'Timetable shared — families have been told the dates' : 'Timetable hidden from families'),
};
/** How a paper is marked, in a few words. */
const markedAs = (s) => (s.gradeOnly ? 'Graded — no marks'
  : s.components ? s.components.map((c) => `${c.label} ${c.maxMarks}`).join(' + ')
    : `Max ${s.maxMarks} · Pass ${s.passingMarks}`);
/** One paper of a result, as the rank list's row shows it. */
const paperText = (s) => (s.gradeOnly ? (s.isAbsent ? 'Absent' : `Grade ${s.grade}`)
  : s.isAbsent ? 'Absent' : `${s.marksObtained} / ${s.maxMarks}`);

export default function ExamDrawer({ open, examId, tab: firstTab, stamp, locked, onClose, onStep, onEdit, onChanged }) {
  const [exam, setExam] = useState(null);
  const [tab, setTab] = useState('overview');
  const [results, setResults] = useState(null);
  const [sheetFor, setSheetFor] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving] = useState(null);       // the option being switched
  const [dialog, setDialog] = useState(null);       // { kind: 'sendBack' | 'correct' | 'withhold' | 'release', … }
  const [promoAsk, setPromoAsk] = useState(false);  // the promotion panel's own dialog is up

  useEffect(() => { if (open) { setTab(firstTab || 'overview'); setExpanded(null); } }, [open, examId, firstTab]);

  useEffect(() => {
    if (!open || !examId) return undefined;
    let alive = true;
    // Keep what is showing while the same exam refetches; blank it for another.
    setExam((e) => (e && e._id === examId ? e : null));
    api.getFormalExam(examId)
      .then((res) => { if (alive) setExam(res.data ?? res); })
      .catch((e) => { if (alive) { toast.error(e.message); onClose(); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, examId, stamp]);

  const hasResults = !!exam?.can?.results;
  // Somebody did not pass — or papers have been sat again already.
  const hasReExam = exam?.status === 'FINAL_APPROVED' && ((exam.summary && exam.summary.failed > 0) || (exam.reExam?.entered || 0) > 0);
  useEffect(() => {
    if (!open || tab !== 'results' || !hasResults) return undefined;
    let alive = true;
    api.getFormalExamResults(examId).then((res) => { if (alive) setResults(res); }).catch((e) => toast.error(e.message));
    return () => { alive = false; };
  }, [open, tab, examId, hasResults, stamp]);
  useEffect(() => { setResults(null); }, [examId]);

  const st = statusOf(exam?.status);
  const need = exam && !exam.archived && exam.attention ? ATTENTION[exam.attention] : null;
  const at = FLOW.findIndex(([k]) => k === st.stage);
  const can = exam?.can || {};
  const go = (name) => (name === 'marks' ? setTab('marks') : onStep(name, exam));
  const opts = exam?.options || {};

  const setOption = async (key, on) => {
    setSaving(key);
    try {
      await api.setFormalExamOptions(exam._id, { [key]: on });
      setExam((e) => (key === 'timetableShared' ? { ...e, timetableShared: on } : { ...e, options: { ...e.options, [key]: on } }));
      toast.success(OPTION_SAID[key](on, exam.status === 'FINAL_APPROVED'));
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(null);
    }
  };

  const exportCsv = () => {
    if (!results?.data?.length) return;
    const subs = results.subjects || [];
    const ranked = results.data.some((r) => r.classOutOf && r.classOutOf > results.data.length);
    downloadCsv(
      `${exam.title} - ${classLine(exam)} - results.csv`.replace(/[\\/:*?"<>|]/g, ' '),
      ['Rank', ...(ranked ? ['Class rank'] : []), 'Roll No', 'Student', 'Admission No',
        ...subs.map((s) => (s.gradeOnly ? `${s.subjectName} (grade)` : `${s.subjectName} (${s.maxMarks})`)),
        'Total', 'Out of', 'Percentage', 'Grade', 'Result', 'Grace marks', 'Withheld'],
      results.data.map((r) => {
        const by = new Map(r.subjects.map((s) => [s.subject._id, s]));
        return [r.rank, ...(ranked ? [r.classRank || ''] : []), r.student.rollNumber, r.student.name, r.student.admissionNumber,
          ...subs.map((s) => { const m = by.get(s._id); return !m ? '—' : m.isAbsent ? 'AB' : m.gradeOnly ? m.grade : m.marksObtained; }),
          r.totalMarks, r.totalMaxMarks, r.percentage, r.grade, r.isPassed ? 'Pass' : 'Fail',
          r.subjects.reduce((t, s) => t + (Number(s.graceMarks) || 0), 0) || '', r.withheld ? `Yes — ${r.withheld.reason}` : ''];
      }),
    );
  };
  const reload = () => { onChanged(); };
  // Printed from the exam: the marks register (Excel) and admit cards (PDF).
  const download = async (kind) => {
    const name = `${exam.title} ${classLine(exam)}`.replace(/[\\/:*?"<>|]/g, ' ');
    try {
      if (kind === 'register') await savePdf(() => api.getMarksRegister(exam._id), `${name} marks register.xlsx`);
      else await savePdf(() => api.getAdmitCards(exam._id), `${name} admit cards.pdf`);
    } catch (e) { toast.error(e.message || 'The file could not be made'); }
  };
  const closeDialog = () => setDialog(null);
  const afterDialog = () => { setDialog(null); setResults(null); reload(); };

  const more = exam ? [
    can.rename && { label: 'Rename', icon: 'pencil', onClick: () => go('rename') },
    can.resultDate && { label: 'Change result date', icon: 'calendar', onClick: () => go('resultDate') },
    can.toDraft && { label: 'Move back to draft', icon: 'undo', onClick: () => go('draft') },
    can.reject && { label: 'Reject marks', icon: 'closeCircle', onClick: () => go('reject') },
    can.reopen && exam.status === 'FINAL_APPROVED' && { label: 'Withdraw results', icon: 'undo', onClick: () => go('reopen') },
    '-',
    { label: 'Marks register (Excel)', icon: 'fileSheet', onClick: () => download('register') },
    !exam.archived && exam.subjectCount > 0 && { label: 'Admit cards (PDF)', icon: 'filePdf', onClick: () => download('admit') },
    '-',
    can.archive && { label: 'Archive', icon: 'archive', onClick: () => go('archive') },
    can.delete && { label: 'Delete draft', icon: 'trash', danger: true, onClick: () => go('delete') },
  ] : [];

  return (
    <>
      {/* The drawer answers Escape itself. While a dialog is up over it, that
          key belongs to the dialog, not to the drawer underneath. */}
      <Drawer open={open} onClose={locked || sheetFor || dialog || promoAsk ? stay : onClose} label="Exam details">
        <div className="rs-drawer">
          <DrawerHead
            mark={<span className={`rs-dmark rs-t-${st.tone}`}><Ico name="sheet" size={26} /></span>}
            name={exam?.title || 'Loading…'}
            sub={exam ? [classLine(exam), exam.yearName, examTypeText(exam), exam.code].filter(Boolean).join(' · ') : ''}
            tags={exam ? <>
              <Badge tone={st.tone}>{st.label}</Badge>
              {exam.archived ? <Badge tone="slate" dot={false}>Archived</Badge> : null}
              {exam.overdue ? <Badge tone="red" dot={false}>Marks overdue</Badge> : null}
              {exam.withheldCount ? <Badge tone="amber" dot={false}>{exam.withheldCount} withheld</Badge> : null}
            </> : null}
            onClose={onClose}
          />

          {exam ? (
            <Tabs variant="line" size="sm" className="uitabs--inset rs-dtabs" label="Exam views" value={tab} onChange={setTab} wrap={false}
              items={[
                { key: 'overview', label: 'Overview' },
                { key: 'marks', label: 'Mark Entry', count: exam.status === 'DRAFT' ? undefined : `${exam.sheetsSubmitted}/${exam.subjectCount}` },
                { key: 'results', label: 'Results' },
                ...(hasReExam ? [{ key: 'reexam', label: 'Re-exam', count: exam.summary?.failed || undefined }] : []),
                { key: 'activity', label: 'Activity' },
              ]} />
          ) : null}

          <DrawerBody>
            {!exam ? <div className="rs-loading" role="status">Loading…</div> : null}

            {exam && tab === 'overview' ? (
              <>
                {need ? (
                  <div className={`rs-dneed rs-t-${need.red ? 'red' : 'amber'}`}>
                    <Ico name="alertTri" size={18} />
                    <span><strong>Waiting on you</strong>{need.why}{exam.rejectionReason && exam.status === 'REJECTED' ? ` Reason given: “${exam.rejectionReason}”` : ''}</span>
                  </div>
                ) : exam.status === 'REJECTED' && exam.rejectionReason ? (
                  <div className="rs-dneed rs-t-red"><Ico name="alertTri" size={18} /><span><strong>Rejected</strong>{exam.rejectionReason}</span></div>
                ) : null}

                <ol className="rs-flow" aria-label="Where this exam stands">
                  {FLOW.map(([k, label], i) => (
                    <li key={k} className={i < at ? 'is-done' : i === at ? 'is-now' : undefined} aria-current={i === at ? 'step' : undefined}>
                      <i>{i < at || (i === at && k === 'published') ? <Ico name="check" size={13} /> : i + 1}</i>
                      <span>{label}</span>
                    </li>
                  ))}
                </ol>

                {exam.summary ? (
                  <DrawerSection title="Results at a glance" right={<button type="button" className="rs-link" onClick={() => setTab('results')}>All results</button>}>
                    <div className="rs-dstats">
                      <div><strong>{exam.summary.students}</strong><span>Students</span></div>
                      <div><strong>{pct(exam.summary.passPct)}</strong><span>Passed</span></div>
                      <div><strong>{pct(exam.summary.avgPct)}</strong><span>Average</span></div>
                      <div><strong>{pct(exam.summary.topPct)}</strong><span>Highest</span></div>
                    </div>
                    {exam.summary.toppers?.length ? (
                      <p className="rs-dtop"><Ico name="trophy" size={15} />{exam.summary.toppers.map((x) => x.name).join(', ')} — rank 1 with {exam.summary.toppers[0].totalMarks}/{exam.summary.toppers[0].totalMaxMarks}</p>
                    ) : null}
                  </DrawerSection>
                ) : null}

                <DrawerSection title="Exam">
                  <DrawerFields fields={[
                    ['Code', exam.code],
                    ['Term', exam.termLabel],
                    ['Dates', fmtRange(exam.startDate, exam.endDate)],
                    ['Marks due by', exam.marksDueDate ? <>{fmtDay(exam.marksDueDate)}{exam.overdue ? <Badge tone="red" dot={false}>Overdue</Badge> : null}</> : ''],
                    ['Result date', <>
                      {exam.publishDate ? fmtDay(exam.publishDate) : 'As soon as published'}
                      {can.resultDate ? <button type="button" className="rs-link rs-dchange" onClick={() => go('resultDate')}>Change</button> : null}
                    </>],
                    ['Students', plural(exam.roster, 'student')],
                    ['Subjects', `${plural(exam.subjectCount, 'subject')} · ${exam.subjects.reduce((t, s) => t + s.maxMarks, 0)} marks in all`],
                    ['Class teacher', exam.classTeacher || 'Not assigned'],
                    ['Created', [exam.createdBy?.name, fmtStamp(exam.createdAt)].filter(Boolean).join(' · ')],
                    ['Validated', exam.approvals.classApprovedAt ? [exam.approvals.classApprovedBy, fmtStamp(exam.approvals.classApprovedAt)].filter(Boolean).join(' · ') : ''],
                    ['Published', exam.approvals.finalApprovedAt ? [exam.approvals.finalApprovedBy, fmtStamp(exam.approvals.finalApprovedAt)].filter(Boolean).join(' · ') : ''],
                    ['Visible to families', opts.showInPortal === false ? 'Not shown in the student portal' : exam.publishedOn && !exam.resultsVisible ? `From ${fmtDay(exam.publishedOn)}` : ''],
                    ['Timetable', exam.status !== 'FINAL_APPROVED' && exam.timetableShared === false ? 'Not shared with families yet' : ''],
                    ['Description', exam.description],
                  ]} />
                </DrawerSection>

                <DrawerSection title="Settings" right={can.edit ? <button type="button" className="rs-link" onClick={() => onEdit(exam)}>Edit exam</button> : null}>
                  <ul className="rs-dopts">
                    {LIVE.filter(([key]) => !['notifyOnPublish', 'timetableShared'].includes(key) || exam.status !== 'FINAL_APPROVED').map(([key, label, say]) => {
                      const on = key === 'timetableShared' ? exam.timetableShared !== false
                        : key === 'notifyOnPublish' ? opts.showInPortal !== false && !!opts[key] : !!opts[key];
                      const off = saving === key || (key === 'notifyOnPublish' && opts.showInPortal === false) || (key === 'timetableShared' && exam.archived);
                      return (
                        <li key={key}>
                          <label className={off ? 'is-off' : undefined}>
                            <Check checked={on} disabled={off} label={label} onChange={(e) => setOption(key, e.target.checked)} />
                            <span><strong>{label}</strong><small>{say(exam, on)}</small></span>
                          </label>
                        </li>
                      );
                    })}
                    <li className="rs-dopts__fixed">
                      <Ico name="sliders" size={16} />
                      <span>
                        <strong>Grace marks</strong>
                        <small>
                          {opts.allowGraceMarks ? `Up to ${opts.grace?.perSubject} marks in at most ${plural(opts.grace?.maxSubjects || 0, 'subject')}` : 'Not allowed'}
                          {exam.status === 'FINAL_APPROVED' ? ' · fixed once results are published' : can.edit ? ' · change it under Edit' : ''}
                        </small>
                      </span>
                    </li>
                  </ul>
                </DrawerSection>

                {exam.withheld?.length ? (
                  <DrawerSection title={`Withheld from families · ${exam.withheld.length}`}
                    right={can.withhold ? <button type="button" className="rs-link" onClick={() => setDialog({ kind: 'release' })}>Release</button> : null}>
                    <ul className="rs-dpromo__list">
                      {exam.withheld.map((w) => (
                        <li key={w.student}><strong>{w.name}</strong><span>{w.reason || 'No reason given'}{w.by ? ` · ${w.by}` : ''}{w.at ? `, ${fmtStamp(w.at)}` : ''}</span></li>
                      ))}
                    </ul>
                  </DrawerSection>
                ) : null}

                {exam.promotion ? <PromotionPanel exam={exam} onChanged={onChanged} onDialog={setPromoAsk} /> : null}

                <DrawerSection title="Mark entry" right={<button type="button" className="rs-link" onClick={() => setTab('marks')}>Open sheets</button>}>
                  {exam.status === 'DRAFT'
                    ? <p className="rs-dnote">Mark entry has not been opened. Teachers see this exam once it is.</p>
                    : <Meter value={exam.sheetsSubmitted} total={exam.subjectCount} label={`${exam.sheetsSubmitted} of ${plural(exam.subjectCount, 'subject')} submitted`}
                      color={exam.sheetsSubmitted >= exam.subjectCount ? '#3fbf61' : undefined} />}
                </DrawerSection>
              </>
            ) : null}

            {exam && tab === 'marks' ? (
              <>
                {exam.status === 'DRAFT' ? (
                  <p className="rs-dnote">Mark entry has not been opened yet. These are the subjects teachers will be asked for.</p>
                ) : null}
                <ul className="rs-sheets">
                  {exam.subjects.map((s) => {
                    const sh = SHEET[s.sheet.status] || SHEET.NOT_STARTED;
                    const waiting = !s.teachers.length && s.sheet.status !== 'SUBMITTED' && can.marks;
                    // Back to its teacher: a submitted sheet, or any paper of published results.
                    const sendable = can.returnSubject && (exam.status === 'FINAL_APPROVED' || s.sheet.status === 'SUBMITTED');
                    return (
                      <li key={s.subject._id}>
                        <div className="rs-sheets__top">
                          <span className="rs-sheets__name"><strong>{s.subject.subjectName}</strong>{s.subject.subjectCode ? <small>{s.subject.subjectCode}</small> : null}</span>
                          <span className="rs-sheets__tags">
                            {s.elective ? <Badge tone="violet" dot={false}>Elective</Badge> : null}
                            {s.components ? <Badge tone="blue" dot={false}>In parts</Badge> : null}
                            {s.gradeOnly ? <Badge tone="blue" dot={false}>Graded</Badge> : null}
                            {s.sheet.overdue ? <Badge tone="red" dot={false}>Overdue</Badge> : null}
                            <Badge tone={sh.tone}>{sh.label}</Badge>
                          </span>
                        </div>
                        <p className="rs-sheets__meta">
                          <span>{markedAs(s)}</span>
                          {s.elective ? <span>{plural(s.sheet.total, 'student')} take it</span> : null}
                          {s.examDate ? <span>{fmtDay(s.examDate)}{s.startTime ? `, ${s.startTime}${s.endTime ? `–${s.endTime}` : ''}` : ''}</span> : null}
                          <span className={s.teachers.length ? undefined : 'rs-sheets__gap'}>
                            {s.teachers.length ? s.teachers.map((x) => x.name).join(', ') : 'No teacher assigned'}
                          </span>
                        </p>
                        <div className="rs-sheets__foot">
                          {exam.status === 'DRAFT' ? <span className="rs-muted">—</span> : (
                            <Meter value={s.sheet.entered} total={s.sheet.total} label={`${s.sheet.entered} of ${s.sheet.total} entered`}
                              color={s.sheet.status === 'SUBMITTED' ? '#3fbf61' : undefined} />
                          )}
                          {exam.status !== 'DRAFT' ? (
                            <span className="rs-sheets__acts">
                              {sendable ? (
                                <Btn size="sm" kind="ghost" icon="undo" onClick={() => setDialog({ kind: 'sendBack', subject: s })}>
                                  {exam.status === 'FINAL_APPROVED' ? 'Withdraw' : 'Send Back'}
                                </Btn>
                              ) : null}
                              <Btn size="sm" kind={waiting ? 'primary' : 'outline'} icon={can.marks ? 'pencil' : 'eye'} onClick={() => setSheetFor(s.subject._id)}>
                                {!can.marks ? 'View' : s.sheet.status === 'SUBMITTED' ? 'Correct' : 'Enter Marks'}
                              </Btn>
                            </span>
                          ) : null}
                        </div>
                        {s.sheet.status === 'SUBMITTED' && s.sheet.submittedBy ? (
                          <p className="rs-sheets__by">Submitted by {s.sheet.submittedBy}{s.sheet.submittedAt ? ` · ${fmtStamp(s.sheet.submittedAt)}` : ''}
                            {s.sheet.changes ? ` · ${plural(s.sheet.changes, 'mark')} changed since first given` : ''}</p>
                        ) : s.sheet.changes ? <p className="rs-sheets__by">{plural(s.sheet.changes, 'mark')} changed since first given</p> : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}

            {exam && tab === 'results' ? (
              !hasResults ? (
                <p className="rs-dnote">Results appear here once the exam is published. They are worked out from the validated marks: a total, a percentage, a grade and a rank for every student.</p>
              ) : !results ? <div className="rs-loading" role="status">Loading results…</div> : (
                <>
                  {results.summary ? (
                    <>
                      <div className="rs-dstats">
                        <div><strong>{results.summary.students}</strong><span>Students</span></div>
                        <div><strong>{results.summary.passed}</strong><span>Passed</span></div>
                        <div><strong>{pct(results.summary.passPct)}</strong><span>Pass rate</span></div>
                        <div><strong>{pct(results.summary.avgPct)}</strong><span>Average</span></div>
                      </div>
                      <div className="rs-grades" aria-label="Students by grade">
                        {results.summary.grades.map((g) => (
                          <span key={g.grade} className={`rs-t-${gradeTone(g.grade, results.summary?.grades)}${g.count ? '' : ' is-none'}`}><b>{g.grade}</b>{g.count}</span>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <DrawerSection title={`Rank list · ${plural(results.data.length, 'student')}`}
                    right={<span className="rs-dsec__acts">
                      {can.withhold ? <button type="button" className="rs-link" onClick={() => setDialog({ kind: 'withhold' })}><Ico name="lock" size={14} />Withhold…</button> : null}
                      <button type="button" className="rs-link" onClick={exportCsv}><Ico name="download" size={14} />Export CSV</button>
                    </span>}>
                    <ul className="rs-ranks">
                      {results.data.map((r) => {
                        const on = expanded === r._id;
                        // Ranked across the whole class only where it has more than this section.
                        const classWide = r.classOutOf && r.classOutOf > results.data.length;
                        return (
                          <li key={r._id} className={on ? 'is-open' : undefined}>
                            <button type="button" className="rs-ranks__row" onClick={() => setExpanded(on ? null : r._id)} aria-expanded={on}>
                              <i className={r.rank <= 3 ? 'is-top' : undefined}>{r.rank}</i>
                              <span className="rs-ranks__who"><strong>{r.student.name}</strong>
                                <small>{[r.student.rollNumber ? `Roll ${r.student.rollNumber}` : r.student.admissionNumber || '', classWide ? `class rank ${r.classRank} of ${r.classOutOf}` : ''].filter(Boolean).join(' · ')}</small>
                              </span>
                              <span className="rs-ranks__score"><strong>{r.percentage}%</strong><small>{r.totalMarks}/{r.totalMaxMarks}</small></span>
                              <Badge tone={gradeTone(r.grade, results.summary?.grades)} dot={false}>{r.grade}</Badge>
                              <Badge tone={r.isPassed ? 'green' : 'red'} dot={false}>{r.isPassed ? 'Pass' : 'Fail'}</Badge>
                              {r.withheld ? <Badge tone="amber" dot={false} title={r.withheld.reason}>Withheld</Badge> : null}
                              <Ico name="chevronDown" size={15} className="rs-ranks__chev" />
                            </button>
                            {on ? (
                              <>
                                <table className="rs-ranks__subs">
                                  <tbody>
                                    {r.subjects.map((s) => (
                                      <tr key={s.subject._id}>
                                        <th scope="row">
                                          {s.subject.subjectName}
                                          {s.components?.length ? <small className="rs-ranks__parts">{s.components.map((c) => `${c.label} ${c.marks ?? '—'}/${c.maxMarks}`).join(' · ')}</small> : null}
                                          {s.remarks ? <small className="rs-ranks__remark">“{s.remarks}”</small> : null}
                                        </th>
                                        <td>{paperText(s)}{s.graceMarks ? <small className="rs-ranks__grace">incl. {s.graceMarks} grace</small> : null}{s.reExam ? <small className="rs-ranks__grace">re-exam</small> : null}</td>
                                        <td>{s.gradeOnly ? '' : s.grade}</td>
                                        <td className={s.gradeOnly ? undefined : s.isPassed ? 'is-pass' : 'is-fail'}>{s.isAbsent || s.gradeOnly ? '—' : s.isPassed ? 'Pass' : 'Fail'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {r.withheld ? <p className="rs-dnote rs-dnote--warn">Withheld from the family — {r.withheld.reason || 'no reason given'}.</p> : null}
                                {can.correct || can.withhold ? (
                                  <div className="rs-ranks__acts">
                                    {can.correct ? <Btn size="sm" icon="pencil" onClick={() => setDialog({ kind: 'correct', row: r })}>Correct a Mark</Btn> : null}
                                    {can.withhold ? (r.withheld
                                      ? <Btn size="sm" icon="unlock" onClick={() => setDialog({ kind: 'release', only: r.student._id })}>Release Result</Btn>
                                      : <Btn size="sm" icon="lock" onClick={() => setDialog({ kind: 'withhold', only: r.student._id })}>Withhold Result</Btn>) : null}
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </DrawerSection>
                </>
              )
            ) : null}

            {exam && tab === 'reexam' ? (
              hasReExam && !exam.archived
                ? <ReExamPanel examId={exam._id} stamp={stamp} onChanged={onChanged} />
                : <p className="rs-dnote">{exam.archived ? 'Restore the exam to enter re-exam marks.' : 'A re-exam follows published results, for the students who did not pass.'}</p>
            ) : null}

            {exam && tab === 'activity' ? (
              exam.timeline.length ? (
                <ol className="rs-timeline">
                  {exam.timeline.map((a, i) => (
                    <li key={`${a.action}${a.at}${i}`}>
                      <strong>{a.label}</strong>
                      <span>{[a.by, `${fmtStamp(a.at)}, ${fmtTime(a.at)}`].filter(Boolean).join(' · ')}</span>
                      {a.notes ? <p>“{a.notes}”</p> : null}
                    </li>
                  ))}
                </ol>
              ) : <p className="rs-dnote">Nothing has been recorded for this exam yet.</p>
            ) : null}
          </DrawerBody>

          {exam ? (
            <DrawerFoot>
              <span className="rs-dfoot__more"><Kebab items={more} label="More actions" /></span>
              {can.edit ? <Btn icon="pencil" onClick={() => onEdit(exam)}>Edit</Btn> : null}
              {can.restore ? <Btn kind="primary" icon="restore" onClick={() => go('restore')}>Restore</Btn> : null}
              {can.open ? <Btn kind="primary" icon="unlock" onClick={() => go('open')}>Open Mark Entry</Btn> : null}
              {can.marks && tab !== 'marks' && ['MARKS_PENDING', 'REOPENED'].includes(exam.status) ? <Btn kind="soft" icon="clipboard" onClick={() => setTab('marks')}>Enter Marks</Btn> : null}
              {can.validate ? <Btn kind="primary" icon="shieldCheck" onClick={() => go('validate')}>Validate Marks</Btn> : null}
              {can.publish ? <Btn kind="primary" icon="checkCircle" onClick={() => go('publish')}>Publish Results</Btn> : null}
              {can.reopen && exam.status === 'REJECTED' ? <Btn kind="primary" icon="refresh" onClick={() => go('reopen')}>Reopen for Correction</Btn> : null}
              {can.results && tab !== 'results' ? <Btn kind="soft" icon="trophy" onClick={() => setTab('results')}>View Results</Btn> : null}
            </DrawerFoot>
          ) : null}
        </div>
      </Drawer>

      <MarksDialog open={!!sheetFor} examId={examId} subjectId={sheetFor} onClose={() => setSheetFor(null)} onSaved={onChanged} />
      {exam && dialog?.kind === 'sendBack' ? <SendBack exam={exam} subject={dialog.subject} onClose={closeDialog} onDone={afterDialog} /> : null}
      {exam && dialog?.kind === 'correct' ? (
        <CorrectMark exam={exam} row={dialog.row} subjects={results?.subjects} scale={results?.scale} onClose={closeDialog} onDone={afterDialog} />
      ) : null}
      {exam && (dialog?.kind === 'withhold' || dialog?.kind === 'release') ? (
        <Withhold exam={exam} rows={results?.data} release={dialog.kind === 'release'} only={dialog.only} onClose={closeDialog} onDone={afterDialog} />
      ) : null}
    </>
  );
}
