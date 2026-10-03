/**
 * Teacher → Results & Marks (Oct 2026 redesign, on the Results kit).
 *
 * One board (GET /teacher/results/board), four tabs:
 *
 *   Mark Entry   a line for every subject this teacher teaches on a live exam:
 *                how far its sheet has got, and the way in — what is waiting
 *                on them first
 *   Validation   as class teacher: exams whose every sheet is in, reviewed in
 *                a full marks matrix before validating; class tests submitted
 *                for approval
 *   Class Tests  the tests they set — create, enter, submit, reopen, delete
 *   Published    the results of the sections they teach or look after
 *   Re-exams     once the office has set up a re-exam, the papers of their
 *                subjects that were not passed — their marks to enter
 *
 * The tab is in the URL (?tab=), so a notification can open the right one.
 * Every step goes through the existing endpoints, whose rules are the server's.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/teacher.api';
import { Modal } from '../../../components/ui/index';
import { PageHead, Tiles, Tile, LineTabs, Btn, Badge, Meter, Empty, Ico, count, plural, fmtDay, fmtRange, fmtStamp, useBoard } from '../rsUI';
import { Share } from '../rsCharts';
import { classLine, statusOf } from '../resultMeta';
import MarksSheet from '../MarksSheet';
import ReviewDialog from './ReviewDialog';
import ClassTestForm from './ClassTestForm';
import SectionResults from './SectionResults';
import ReExamPanel from '../admin/ReExamPanel';

const TABS = [
  { key: 'marks', label: 'Mark Entry' },
  { key: 'validation', label: 'Validation' },
  { key: 'tests', label: 'Class Tests' },
  { key: 'published', label: 'Published' },
  { key: 'reexams', label: 'Re-exams' },
];
const SHEET = {
  NOT_STARTED: { label: 'Not started', tone: 'slate' },
  DRAFT: { label: 'In progress', tone: 'amber' },
  SUBMITTED: { label: 'Submitted', tone: 'green' },
};
const TEST_TONE = { DRAFT: 'slate', SUBMITTED: 'blue', FINAL_APPROVED: 'green', REJECTED: 'red', REOPENED: 'amber' };
/** Where an exam is, said for the teacher whose sheet is in it. */
const EXAM_NOTE = {
  SUBMITTED: 'With the class teacher for validation',
  CLASS_APPROVED: 'Validated — waiting to be published',
  REJECTED: 'Sent back — the office will reopen it for correction',
};
const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

export default function TeacherResults() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'marks';
  const goTab = (k) => { const n = new URLSearchParams(params); n.set('tab', k); n.delete('focus'); setParams(n, { replace: true }); };

  const { body, loading, error, reload } = useBoard(api.getResultBoard, {});
  const b = body?.data;
  const [options, setOptions] = useState([]);
  useEffect(() => { api.getTestOptions().then((r) => setOptions(r.data ?? r ?? [])).catch(() => setOptions([])); }, []);

  const [sheet, setSheet] = useState(null);         // { exam, subject } | { test }
  const [review, setReview] = useState(null);       // an exam waiting for validation
  const [testReview, setTestReview] = useState(null);
  const [rejectTest, setRejectTest] = useState(null);
  const [newTest, setNewTest] = useState(false);
  const [editTest, setEditTest] = useState(null);   // a class test whose details are being corrected
  const [results, setResults] = useState(null);
  const [reExam, setReExam] = useState(null);        // an exam whose re-exam marks are being entered
  const [ask, setAsk] = useState(null);             // { title, body, confirm, tone, run }

  const marksRows = useMemo(() => (b?.marks || []).flatMap((e) => e.subjects.map((s) => ({ exam: e, subject: s }))), [b]);
  const t = b?.tiles || {};
  const counts = {
    marks: t.toEnter || undefined,
    validation: t.toValidate || undefined,
    tests: b?.tests?.length || undefined,
    published: b?.published?.length || undefined,
    reexams: t.reExamsOwed || undefined,
  };
  // The Re-exams tab is there while the office has a re-exam open on a paper of theirs.
  const tabs = TABS.filter((x) => x.key !== 'reexams' || b?.reExams?.length || tab === 'reexams');

  const confirmThen = async () => {
    const a = ask;
    setAsk((x) => ({ ...x, busy: true }));
    try {
      await a.run();
      toast.success(a.done);
      setAsk(null);
      reload();
    } catch (e) {
      setAsk((x) => ({ ...x, busy: false, error: e.message }));
    }
  };

  const first = !b && loading;
  return (
    <div className="rs-page">
      <PageHead title="Results & Marks" subtitle="Enter your subjects' marks, validate your class's results and run your class tests.">
        {b?.classTeacherOf?.length ? <Btn size="lg" icon="users" onClick={() => nav('/teacher/results/electives')}>Electives</Btn> : null}
        {b?.classTeacherOf?.length ? <Btn kind="tint" size="lg" icon="printer" onClick={() => nav('/teacher/results/report-cards')}>Report Cards</Btn> : null}
        {options.length ? <Btn kind="primary" size="lg" icon="plus" iconSize={20} onClick={() => setNewTest(true)}>New Class Test</Btn> : null}
      </PageHead>

      <Tiles>
        <Tile tone="indigo" icon="sheet" iconSize={40} value={t.toEnter ?? 0} label="Marks to Enter" quietLabel
          caption={b ? `${plural((b.marks || []).length, 'exam')} with your subjects` : '…'} onClick={() => goTab('marks')} on={tab === 'marks'} />
        <Tile tone="blue" icon="shieldCheck" iconSize={32} value={t.toValidate ?? 0} label="Awaiting Validation"
          caption={b ? (b.classTeacherOf?.length ? `Class teacher of ${b.classTeacherOf.join(', ')}` : 'You are not a class teacher') : '…'}
          onClick={() => goTab('validation')} on={tab === 'validation'} />
        <Tile tone="amber" icon="clipboard" iconSize={32} value={t.tests ?? 0} label="Class Tests"
          caption={t.testsOpen ? `${t.testsOpen} need your attention` : 'Set by you'} onClick={() => goTab('tests')} on={tab === 'tests'} />
        <Tile tone="green" icon="checkDisc" value={t.published ?? 0} label="Published Results" caption="In the sections you teach"
          onClick={() => goTab('published')} on={tab === 'published'} />
      </Tiles>

      <section className="rs-card" aria-label="Results and marks">
        <div className="rs-card__top">
          <LineTabs value={tab} onChange={goTab} label="Results and marks" items={tabs.map((x) => ({ ...x, count: counts[x.key] }))} />
        </div>

        <div className="rs-tablearea rs-tablearea--tight">
          {first ? <div className="rs-loading" role="status">Loading…</div> : null}
          {!b && error ? <Empty title="This page could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty> : null}

          {/* ── Mark Entry ───────────────────────────────────────────────── */}
          {b && tab === 'marks' ? (
            marksRows.length ? (
              <div className="rs-tablescroll">
                <table className="rs-table rs-table--rows rs-table--compact">
                  <thead>
                    <tr><th>Exam</th><th>Class / Section</th><th>Subject</th><th>Sheet</th><th>Entered</th><th>Marks due</th><th className="is-right rs-table__acts">Action</th></tr>
                  </thead>
                  <tbody>
                    {marksRows.map(({ exam: e, subject: s }) => {
                      const st = SHEET[s.sheet.status] || SHEET.NOT_STARTED;
                      const owed = e.open && s.sheet.status !== 'SUBMITTED';
                      return (
                        <tr key={`${e._id}:${s._id}`} data-focus-id={e._id}>
                          <td>
                            <span className="rs-name rs-name--static">
                              <strong>{e.title}</strong>
                              <span className="rs-sub">{[e.code, e.examTypeLabel].filter(Boolean).join(' · ')}</span>
                            </span>
                          </td>
                          <td data-label="Class / Section">{classLine(e)}<span className="rs-sub">{e.yearName}</span></td>
                          <td data-label="Subject"><strong className="rs-strong">{s.subjectName}</strong><span className="rs-sub">{s.gradeOnly ? 'Graded — no marks' : `${s.inParts ? 'In parts · ' : ''}Max ${s.maxMarks} · pass ${s.passingMarks}`}{s.examDate ? ` · ${fmtDay(s.examDate)}` : ''}</span></td>
                          <td data-label="Sheet">
                            <Badge tone={st.tone}>{st.label}</Badge>
                            {EXAM_NOTE[e.status] ? <span className={`rs-need${e.status === 'REJECTED' ? ' rs-need--red' : ''}`} title={e.rejectionReason || undefined}>{EXAM_NOTE[e.status]}</span>
                              : e.status === 'REOPENED' ? <span className="rs-need" title={e.rejectionReason || undefined}>Reopened for correction</span> : null}
                          </td>
                          <td data-label="Entered"><Meter value={s.sheet.entered} total={s.sheet.total} color={s.sheet.status === 'SUBMITTED' ? '#3fbf61' : undefined} /></td>
                          <td data-label="Marks due">
                            {e.marksDueDate ? fmtDay(e.marksDueDate) : <span className="rs-muted">—</span>}
                            {e.late && owed ? <span className="rs-need rs-need--red">Overdue</span> : null}
                            {e.endDate ? <span className="rs-sub">Exam ends {fmtDay(e.endDate)}</span> : null}
                          </td>
                          <td className="is-right rs-table__acts">
                            <Btn size="sm" kind={owed ? 'primary' : 'outline'} icon={e.open ? 'pencil' : 'eye'} onClick={() => setSheet({ exam: e, subject: s })}>
                              {!e.open ? 'View' : s.sheet.status === 'SUBMITTED' ? 'Correct' : s.sheet.status === 'DRAFT' ? 'Continue' : 'Enter Marks'}
                            </Btn>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No marks to enter">
                When the office opens mark entry for an exam with a subject you teach, it appears here — with its sheet ready for you.
              </Empty>
            )
          ) : null}

          {/* ── Validation ───────────────────────────────────────────────── */}
          {b && tab === 'validation' ? (
            b.validation.exams.length || b.validation.tests.length ? (
              <>
                {b.validation.exams.length ? (
                  <>
                    <h3 className="rs-subhead">Exams <span>Every subject's marks are in — review them, then validate or send them back.</span></h3>
                    <div className="rs-tablescroll">
                      <table className="rs-table rs-table--rows rs-table--compact">
                        <thead><tr><th>Exam</th><th>Class / Section</th><th>Subjects</th><th>Students</th><th>Marks in</th><th className="is-right rs-table__acts">Action</th></tr></thead>
                        <tbody>
                          {b.validation.exams.map((e) => (
                            <tr key={e._id} data-focus-id={e._id}>
                              <td><span className="rs-name rs-name--static"><strong>{e.title}</strong><span className="rs-sub">{[e.code, e.examTypeLabel, fmtRange(e.startDate, e.endDate)].filter(Boolean).join(' · ')}</span></span></td>
                              <td data-label="Class / Section">{classLine(e)}<span className="rs-sub">{e.yearName}</span></td>
                              <td className="rs-num" data-label="Subjects">{e.subjectCount}</td>
                              <td className="rs-num" data-label="Students">{e.roster}</td>
                              <td data-label="Marks in">{e.inAt ? fmtStamp(e.inAt) : '—'}</td>
                              <td className="is-right rs-table__acts"><Btn size="sm" kind="primary" icon="shieldCheck" onClick={() => setReview(e)}>Review Marks</Btn></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
                {b.validation.tests.length ? (
                  <>
                    <h3 className="rs-subhead">Class tests <span>Submitted by their teachers for your approval.</span></h3>
                    <div className="rs-tablescroll">
                      <table className="rs-table rs-table--rows rs-table--compact">
                        <thead><tr><th>Test</th><th>Subject</th><th>Class / Section</th><th>Set by</th><th>Date</th><th>Average</th><th className="is-right rs-table__acts">Action</th></tr></thead>
                        <tbody>
                          {b.validation.tests.map((x) => (
                            <tr key={x._id} data-focus-id={x._id}>
                              <td><span className="rs-name rs-name--static"><strong>{x.title}</strong>{x.topic ? <span className="rs-sub">{x.topic}</span> : null}</span></td>
                              <td data-label="Subject">{x.subjectName}</td>
                              <td data-label="Class / Section">{classLine(x)}</td>
                              <td data-label="Set by">{x.setBy || '—'}</td>
                              <td data-label="Date">{fmtDay(x.testDate)}</td>
                              <td data-label="Average">{x.stats?.average !== null && x.stats?.average !== undefined ? `${x.stats.average} / ${x.maxMarks}` : '—'}</td>
                              <td className="is-right rs-table__acts"><Btn size="sm" kind="primary" icon="eye" onClick={() => setTestReview(x)}>Review</Btn></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <Empty title="Nothing waiting for you">
                {b.classTeacherOf?.length
                  ? `When every subject's marks are in for ${b.classTeacherOf.join(', ')}, or a class test there is submitted, it comes here for you to validate.`
                  : 'Exams and class tests come here for their class teacher to validate. You are not the class teacher of a section this year.'}
              </Empty>
            )
          ) : null}

          {/* ── Class Tests ──────────────────────────────────────────────── */}
          {b && tab === 'tests' ? (
            b.tests.length ? (
              <div className="rs-tablescroll">
                <table className="rs-table rs-table--rows rs-table--compact">
                  <thead><tr><th>Test</th><th>Subject</th><th>Class / Section</th><th>Date</th><th>Status</th><th>Entered</th><th>Average</th><th className="is-right rs-table__acts">Actions</th></tr></thead>
                  <tbody>
                    {b.tests.map((x) => {
                      const open = ['DRAFT', 'REOPENED'].includes(x.status);
                      return (
                        <tr key={x._id} data-focus-id={x._id}>
                          <td><span className="rs-name rs-name--static"><strong>{x.title}</strong>{x.topic ? <span className="rs-sub">{x.topic}</span> : null}</span></td>
                          <td data-label="Subject">{x.subjectName}<span className="rs-sub">Max {x.maxMarks} · pass {x.passingMarks}</span></td>
                          <td data-label="Class / Section">{classLine(x)}</td>
                          <td data-label="Date">{fmtDay(x.testDate)}</td>
                          <td data-label="Status">
                            <Badge tone={TEST_TONE[x.status] || 'slate'}>{x.statusLabel}</Badge>
                            {x.status === 'REJECTED' && x.rejectionReason ? <span className="rs-need rs-need--red" title={x.rejectionReason}>“{x.rejectionReason}”</span> : null}
                          </td>
                          <td data-label="Entered"><Meter value={x.entered} total={x.roster} color={x.status === 'FINAL_APPROVED' ? '#3fbf61' : undefined} /></td>
                          <td data-label="Average">{x.stats?.average !== null && x.stats?.average !== undefined ? <>{x.stats.average}<span className="rs-sub">pass {pct(x.stats.passPercent)}</span></> : '—'}</td>
                          <td className="is-right rs-table__acts">
                            <span className="rs-acts">
                              {x.status === 'REJECTED' ? (
                                <Btn size="sm" kind="primary" icon="refresh" onClick={() => setAsk({
                                  title: 'Reopen to correct', confirm: 'Reopen', tone: 'amber', icon: 'refresh',
                                  body: <p>Reopen <strong>{x.title}</strong> so you can correct its marks and submit them again?</p>,
                                  run: () => api.reopenClassTest(x._id), done: 'Reopened — correct the marks and submit them again',
                                })}>Reopen</Btn>
                              ) : null}
                              {/* An approved test with a wrong mark in it: reopened by its own teacher. */}
                              {x.status === 'FINAL_APPROVED' ? (
                                <Btn size="sm" kind="ghost" icon="refresh" onClick={() => setAsk({
                                  title: 'Correct approved marks', confirm: 'Reopen to Correct', tone: 'amber', icon: 'refresh',
                                  body: <>
                                    <p>Reopen <strong>{x.title}</strong> to correct its marks?</p>
                                    <ul><li>Students stop seeing it until it has been approved again.</li><li>Submit it again when the marks are right.</li></ul>
                                  </>,
                                  run: () => api.reopenClassTest(x._id), done: 'Reopened — correct the marks and submit them again',
                                })}>Correct</Btn>
                              ) : null}
                              <Btn size="sm" kind={open ? 'primary' : 'outline'} icon={open ? 'pencil' : 'eye'} onClick={() => setSheet({ test: x })}>
                                {open ? (x.entered ? 'Continue' : 'Enter Marks') : 'View'}
                              </Btn>
                              {open ? (
                                <Btn size="sm" kind="ghost" icon="pencil" aria-label={`Edit ${x.title}`} title="Edit name, date and marks" onClick={() => setEditTest(x)} />
                              ) : null}
                              {x.status === 'DRAFT' ? (
                                <Btn size="sm" kind="ghost" icon="trash" aria-label={`Delete ${x.title}`} onClick={() => setAsk({
                                  title: 'Delete class test', confirm: 'Delete', tone: 'red', icon: 'trash',
                                  body: <p>Delete <strong>{x.title}</strong>? It is a draft; nothing about it has gone to anyone.</p>,
                                  run: () => api.deleteClassTest(x._id), done: 'Class test deleted',
                                })} />
                              ) : null}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No class tests yet"
                action={options.length ? <Btn kind="primary" size="lg" icon="plus" iconSize={20} onClick={() => setNewTest(true)}>New Class Test</Btn> : null}>
                {options.length
                  ? 'Set a short test in a subject you teach, enter its marks, and the class teacher approves them for students to see.'
                  : 'You can set a class test once you are assigned a subject in a section.'}
              </Empty>
            )
          ) : null}

          {/* ── Re-exams ─────────────────────────────────────────────────── */}
          {b && tab === 'reexams' ? (
            b.reExams?.length ? (
              <div className="rs-tablescroll">
                <table className="rs-table rs-table--rows rs-table--compact">
                  <thead><tr><th>Exam</th><th>Class / Section</th><th>Re-exam</th><th>Your subjects</th><th className="is-right rs-table__acts">Action</th></tr></thead>
                  <tbody>
                    {b.reExams.map((e) => {
                      const owed = e.subjects.reduce((n, x) => n + x.owed, 0);
                      return (
                        <tr key={e._id} data-focus-id={e._id}>
                          <td><span className="rs-name rs-name--static"><strong>{e.title}</strong><span className="rs-sub">{[e.code, e.examTypeLabel].filter(Boolean).join(' · ')}</span></span></td>
                          <td data-label="Class / Section">{classLine(e)}<span className="rs-sub">{e.yearName}</span></td>
                          <td data-label="Re-exam">{e.date ? fmtDay(e.date) : <span className="rs-muted">Date not set</span>}{e.note ? <span className="rs-sub">{e.note}</span> : null}</td>
                          <td data-label="Your subjects">
                            {e.subjects.map((x) => (
                              <span key={x._id} className="rs-sub rs-mysub"><b>{x.subjectName}</b> {x.owed ? `${x.owed} to enter` : 'all entered'}{x.entered ? ` · ${x.entered} entered` : ''}</span>
                            ))}
                          </td>
                          <td className="is-right rs-table__acts">
                            <Btn size="sm" kind={owed ? 'primary' : 'outline'} icon="clipboard" onClick={() => setReExam(e)}>{owed ? 'Enter Marks' : 'View'}</Btn>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No re-exams">When the office sets up a re-exam for papers of your subjects, they appear here for you to enter the marks.</Empty>
            )
          ) : null}

          {/* ── Published ────────────────────────────────────────────────── */}
          {b && tab === 'published' ? (
            b.published.length ? (
              <div className="rs-tablescroll">
                <table className="rs-table rs-table--rows rs-table--compact">
                  <thead><tr><th>Exam</th><th>Class / Section</th><th>Published</th><th>Students</th><th>Pass rate</th><th>Average</th><th>Your subjects</th><th className="is-right rs-table__acts">Action</th></tr></thead>
                  <tbody>
                    {b.published.map((e) => (
                      <tr key={e._id} data-focus-id={e._id}>
                        <td><span className="rs-name rs-name--static"><strong>{e.title}</strong><span className="rs-sub">{[e.code, e.examTypeLabel].filter(Boolean).join(' · ')}{e.classTeacher ? ' · your class' : ''}</span></span></td>
                        <td data-label="Class / Section">{classLine(e)}<span className="rs-sub">{e.yearName}</span></td>
                        <td data-label="Published">{e.publishedOn ? fmtStamp(e.publishedOn) : '—'}</td>
                        <td className="rs-num" data-label="Students">{count(e.students)}</td>
                        <td data-label="Pass rate"><Share value={e.passPct} tone="quiet" /></td>
                        <td data-label="Average"><Share value={e.avgPct} /></td>
                        <td data-label="Your subjects">
                          {e.mySubjects.length ? e.mySubjects.map((m) => (
                            <span key={m.subjectName} className="rs-sub rs-mysub"><b>{m.subjectName}</b> {pct(m.avgPct)} avg · {pct(m.passPct)} pass</span>
                          )) : <span className="rs-muted">—</span>}
                        </td>
                        <td className="is-right rs-table__acts"><Btn size="sm" icon="trophy" onClick={() => setResults(e)}>Results</Btn></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No published results yet">
                Results of the sections you teach appear here once the office publishes them.
              </Empty>
            )
          ) : null}
        </div>
      </section>

      {/* The re-exam marks of an exam, for this teacher's subjects. */}
      <Modal open={!!reExam} onClose={() => setReExam(null)} maxWidth={760}
        title={reExam ? (
          <span className="rs-ask__title rs-t-indigo">
            <i><Ico name="refresh" size={18} /></i>
            <span>Re-exam — {reExam.title}<small>{[classLine(reExam), reExam.yearName].filter(Boolean).join(' · ')}</small></span>
          </span>
        ) : null}>
        {reExam ? (
          <div className="rs-drawer rs-rx-modal">
            <ReExamPanel examId={reExam._id} stamp={0} onChanged={reload}
              load={() => api.getReExam(reExam._id)} save={(body) => api.saveReExam(reExam._id, body)} />
          </div>
        ) : null}
      </Modal>

      {/* An exam subject's sheet, or a class test's. */}
      <MarksSheet open={!!sheet} sheetKey={sheet ? (sheet.test ? `t:${sheet.test._id}` : `${sheet.exam._id}:${sheet.subject._id}`) : 'none'}
        onClose={() => setSheet(null)} onSaved={reload}
        load={() => (sheet.test ? api.getTestSheet(sheet.test._id) : api.getTeacherSheet(sheet.exam._id, sheet.subject._id))}
        save={(body) => (sheet.test
          ? api.saveTestMarks(sheet.test._id, { marks: body.entries, submit: body.submit })
          : api.saveMarks(sheet.exam._id, sheet.subject._id, body))}
        history={sheet && !sheet.test ? () => api.getSheetHistory(sheet.exam._id, sheet.subject._id) : undefined}
        submitLabel={sheet?.test ? 'Submit for Approval' : 'Submit Marks'}
        readFile={api.readMarksFile}
        // A test is approved as it goes in when nobody else could approve it —
        // its teacher is the class teacher, or the section has none.
        submittedText={sheet?.test
          ? (res) => (res?.autoApproved ? 'Submitted and approved — students can see their marks now'
            : 'Submitted — the class teacher approves the marks before students see them')
          : 'Marks submitted'}
        lockedText={sheet?.test ? ({
          SUBMITTED: 'These marks are with the class teacher for approval.',
          FINAL_APPROVED: 'This test is approved — students can see their marks.',
          REJECTED: 'These marks were rejected. Reopen the test to correct them.',
        })[sheet.test.status] : undefined} />

      {/* A class test opened by its class teacher to approve. */}
      <MarksSheet open={!!testReview} sheetKey={testReview ? `r:${testReview._id}` : 'none'} onClose={() => setTestReview(null)}
        load={() => api.getTestSheet(testReview._id)} save={async () => {}}
        lockedText="Read the marks, then approve them for students to see — or send them back with a reason."
        actions={testReview ? (
          <>
            <Btn kind="danger" icon="undo" onClick={() => { setRejectTest(testReview); setTestReview(null); }}>Reject…</Btn>
            <Btn kind="primary" icon="checkCircle" onClick={async () => {
              try {
                await api.approveClassTest(testReview._id, {});
                toast.success('Approved — students can now see their marks');
                setTestReview(null); reload();
              } catch (e) { toast.error(e.message); }
            }}>Approve</Btn>
          </>
        ) : null} />

      <RejectTest test={rejectTest} onClose={() => setRejectTest(null)} onDone={() => { setRejectTest(null); reload(); }} />

      {review ? <ReviewDialog exam={review} onClose={() => setReview(null)} onDone={() => { setReview(null); reload(); }} /> : null}
      {results ? <SectionResults exam={results} onClose={() => setResults(null)} /> : null}
      <ClassTestForm open={newTest || !!editTest} test={editTest} options={options} onClose={() => { setNewTest(false); setEditTest(null); }}
        onCreated={() => { setNewTest(false); setEditTest(null); reload(); goTab('tests'); }} />

      <Modal open={!!ask} onClose={ask?.busy ? () => {} : () => setAsk(null)} maxWidth={460}
        title={ask ? <span className={`rs-ask__title rs-t-${ask.tone}`}><i><Ico name={ask.icon} size={18} /></i><span>{ask.title}</span></span> : ''}
        footer={ask ? (
          <span className="rs-form__foot">
            <Btn onClick={() => setAsk(null)} disabled={ask.busy}>Cancel</Btn>
            <Btn kind={ask.tone === 'red' ? 'danger-solid' : 'primary'} busy={ask.busy} onClick={confirmThen}>{ask.confirm}</Btn>
          </span>
        ) : null}>
        {ask ? (
          <div className="rs-ask">
            {ask.body}
            {ask.error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{ask.error}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/** "Why are these marks going back?" — required, and the teacher sees it. */
function RejectTest({ test, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setReason(''); setError(''); setBusy(false); }, [test]);
  if (!test) return null;
  const send = async () => {
    if (!reason.trim()) { setError('Say what needs correcting — the teacher will see it'); return; }
    setBusy(true);
    try {
      await api.rejectClassTest(test._id, { reason: reason.trim() });
      toast.success('Sent back to the teacher to correct');
      onDone();
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={500}
      title={<span className="rs-ask__title rs-t-red"><i><Ico name="undo" size={18} /></i><span>Send back {test.title}<small>{[test.subjectName, classLine(test)].filter(Boolean).join(' · ')}</small></span></span>}
      footer={(
        <span className="rs-form__foot">
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind="danger-solid" busy={busy} onClick={send}>Send Back</Btn>
        </span>
      )}>
      <div className="rs-ask">
        <p>{test.setBy || 'The teacher'} will see your reason, reopen the test and submit the marks again.</p>
        <label className="rs-ask__reason">
          <span>What needs correcting <b aria-hidden>*</b></span>
          <textarea rows={3} maxLength={500} value={reason} autoFocus onChange={(e) => { setReason(e.target.value); setError(''); }} />
        </label>
        {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
      </div>
    </Modal>
  );
}
