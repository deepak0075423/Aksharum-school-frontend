/**
 * Teacher → one aptitude exam.
 *
 * One page instead of five: the exam's header and facts stay put while the
 * tabs underneath switch between Overview, Questions, Submissions, Analytics
 * and Results. Each tab has its own address (/teacher/exams/:id/:tab), so the
 * old links keep working and a refresh stays where it was.
 *
 * What a teacher may do depends on how they relate to the exam — the author
 * edits, fills and publishes it; a class teacher of one of its sections sees it
 * and gives the final results approval. The server says which (`canManage`,
 * `isClassTeacher`, `task`) and enforces it again on every write.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/teacher.api';
import { Button, Confirm, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { ExamMark, StagePill, Audience, fmtExamDay, fmtClock, fmtEndClock, fmtClockRange, ExamStats, ExamStat, Panel } from '../../admin/examParts';
import ExamForm from '../../admin/ExamForm';
import ImportQuestions from '../../admin/ImportQuestions';
import { BackLink, Facts, Tabs, PublishButton, ReadinessPanel, plural, fmtStamp } from '../../exams/examShared';
import QuestionEditor from '../../exams/QuestionEditor';
import { SubmissionsTab, ResultsTab } from './workspaceTabs';
import ExamReport from '../../exams/analytics/ExamReport';
import { TEACHER_IMPORT_API } from './List';

const unwrap = (res) => res?.data ?? res;
const errText = (err) => err?.data?.message || err?.message || 'Something went wrong';
const TABS = ['overview', 'questions', 'submissions', 'analytics', 'results'];

const QUESTION_API = {
  getQuestions: api.getQuestions,
  addQuestion: api.addQuestion,
  updateQuestion: api.updateQuestion,
  deleteQuestion: api.deleteQuestion,
  publishExam: api.publishExam,
};

export default function TeacherExamWorkspace({ tab: forcedTab }) {
  const { id, tab: routeTab, studentId } = useParams();
  const navigate = useNavigate();
  const tab = TABS.includes(forcedTab || routeTab) ? (forcedTab || routeTab) : 'overview';

  const [exam, setExam] = useState(null);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [meta, setMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    try { setExam(unwrap(await api.getExam(id))); setError(''); }
    catch (err) { setError(err?.status === 404 ? 'This exam was not found, or it is not one of yours.' : errText(err)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const loadReport = useCallback(() => api.getExamReport(id), [id]);
  const go = (t) => navigate(`/teacher/exams/${id}${t === 'overview' ? '' : `/${t}`}`);

  const openEdit = async () => {
    setFormOpen(true);
    if (!meta) { try { setMeta(unwrap(await api.getExamMeta())); } catch (err) { toast.error(errText(err)); } }
  };
  const save = async (body) => {
    setSaving(true);
    try { await api.updateExam(id, body); toast.success('Exam updated'); setFormOpen(false); await load(); }
    catch (err) { toast.error(errText(err)); }
    finally { setSaving(false); }
  };
  const publish = async () => {
    setPublishing(true);
    try { await api.publishExam(id); toast.success('Exam published'); setConfirmPublish(false); await load(); }
    catch (err) { toast.error(errText(err)); await load(); }
    finally { setPublishing(false); }
  };

  if (error) {
    return (
      <div className="page apxpg">
        <BackLink to="/teacher/exams">Aptitude Exams</BackLink>
        <div className="card apxqe__empty"><Icon name="alert" size={30} /><h3>Can’t open this exam</h3><p>{error}</p></div>
      </div>
    );
  }
  if (!exam) return <div className="loading-page"><Spinner /></div>;

  const isDraft = exam.status === 'draft';
  const opened = ['live', 'completed'].includes(exam.stage);
  const role = exam.isAuthor ? 'Written by you' : exam.isClassTeacher ? 'Your class · by ' + (exam.createdBy?.name || 'another teacher') : '';

  return (
    <div className="page apxpg">
      <BackLink to="/teacher/exams">Aptitude Exams</BackLink>

      <header className="card apxws">
        <div className="apxws__top">
          <ExamMark exam={exam} size={56} />
          <div className="apxws__id">
            <h1>{exam.title}</h1>
            <p>
              <StagePill stage={exam.stage} />
              <span>{exam.subjectName || 'General Aptitude'}</span>
              {role && <span className="apxtag">{role}</span>}
            </p>
          </div>
          <div className="apxws__acts">
            {isDraft && exam.canManage && (
              <>
                <Button variant="secondary" onClick={openEdit}><Icon name="pencil" size={15} /> Edit exam</Button>
                <PublishButton readiness={exam.readiness} onPublish={() => setConfirmPublish(true)} busy={publishing} />
              </>
            )}
            {exam.task && tab !== 'results' && (
              <Button onClick={() => go('results')}><Icon name="checkCircle" size={15} /> Review results</Button>
            )}
          </div>
        </div>
        <Facts items={[
          { icon: 'calendar', label: 'Date', value: fmtExamDay(exam) },
          { icon: 'clock', label: 'Time', value: fmtClockRange(exam), title: `${fmtClock(exam.startTime)} – ${fmtEndClock(exam)}` },
          { icon: 'layers', label: 'Classes', value: <Audience exam={exam} chip />, title: exam.audience?.items?.join(', ') },
          { icon: 'list', label: 'Questions', value: `${exam.questionCount} of ${exam.totalQuestions}` },
          { icon: 'trophy', label: 'Total marks', value: exam.totalMarks },
          { icon: 'users', label: opened ? 'Submitted' : 'Students', value: opened ? `${exam.submitted} of ${exam.eligible}` : exam.eligible },
        ]} />
        <Tabs value={tab} onChange={go} tabs={[
          { value: 'overview', label: 'Overview', icon: 'home' },
          { value: 'questions', label: 'Questions', icon: 'list', badge: isDraft && !exam.readiness?.ready ? '!' : null },
          { value: 'submissions', label: 'Submissions', icon: 'users', badge: opened ? exam.submitted : null },
          { value: 'analytics', label: 'Analytics', icon: 'chart' },
          { value: 'results', label: 'Results', icon: 'checkCircle', badge: exam.task ? '1' : null },
        ]} />
      </header>

      {tab === 'overview' && <OverviewTab exam={exam} go={go} onPublish={() => setConfirmPublish(true)} publishing={publishing} />}
      {tab === 'questions' && (
        <QuestionEditor key={editorKey} exam={exam} api={QUESTION_API} canManage={exam.canManage}
          onChanged={load} onPublished={load}
          onEditExam={isDraft && exam.canManage ? openEdit : undefined}
          onImport={isDraft && exam.canManage ? () => setImporting(true) : undefined} />
      )}
      {tab === 'submissions' && <SubmissionsTab exam={exam} studentId={studentId} />}
      {tab === 'analytics' && <ExamReport load={loadReport} examTitle={exam.title} />}
      {tab === 'results' && <ResultsTab exam={exam} onChanged={load} go={go} />}

      <ExamForm open={formOpen} editing={exam} meta={meta} metaLoading={formOpen && !meta}
        saving={saving} onClose={() => setFormOpen(false)} onSave={save} />
      <ImportQuestions open={importing} examId={id} api={TEACHER_IMPORT_API} onClose={() => setImporting(false)}
        onImported={async () => { await load(); setEditorKey((k) => k + 1); }} />
      <Confirm open={confirmPublish} onClose={() => setConfirmPublish(false)} onConfirm={publish} loading={publishing}
        title="Publish exam" confirmLabel="Publish"
        message={`Publish “${exam.title}”? ${plural(exam.eligible, 'student')} will see it, and it opens on ${fmtExamDay(exam)} at ${fmtClock(exam.startTime)}. Its questions lock once published.`} />
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab({ exam, go, onPublish, publishing }) {
  const [stats, setStats] = useState(null);
  const opened = ['live', 'completed'].includes(exam.stage);

  useEffect(() => {
    if (!opened) return;
    api.getAnalytics(exam._id).then((r) => setStats(unwrap(r))).catch(() => setStats(null));
  }, [exam._id, opened]);

  const details = (
    <Panel icon="info" title="Exam details" className="apxov__details">
      <dl className="apxov__dl">
        <div className="docfield"><dt>Schedule</dt><dd>{fmtExamDay(exam)}, {fmtClock(exam.startTime)} – {fmtEndClock(exam)} ({exam.duration} min)</dd></div>
        <div className="docfield"><dt>Sections</dt><dd>{exam.audience?.items?.join(', ') || '—'}</dd></div>
        <div className="docfield"><dt>Students</dt><dd>{plural(exam.eligible, 'student')}</dd></div>
        <div className="docfield"><dt>Paper</dt><dd>{plural(exam.totalQuestions, 'question')} · {exam.totalMarks} marks · pass mark {exam.passMark}</dd></div>
        <div className="docfield"><dt>Anti-cheat</dt><dd>Auto-submits after {plural(exam.maxViolations || 3, 'tab switch', 'tab switches')}</dd></div>
        <div className="docfield"><dt>Written by</dt><dd>{exam.createdBy?.name || '—'}</dd></div>
      </dl>
    </Panel>
  );

  if (exam.status === 'draft') {
    return (
      <div className="apxov">
        <ReadinessPanel readiness={exam.readiness} title="Before you publish">
          <div className="apxreadypanel__foot">
            {exam.canManage && <PublishButton readiness={exam.readiness} onPublish={onPublish} busy={publishing} align="left" />}
            <Button variant="secondary" onClick={() => go('questions')}><Icon name="list" size={15} /> {exam.canManage ? 'Go to questions' : 'View questions'}</Button>
          </div>
        </ReadinessPanel>
        {details}
      </div>
    );
  }

  const a = stats;
  const passRate = a?.submitted ? Math.round((a.passed / a.submitted) * 100) : null;
  return (
    <div className="apxov apxov--open">
      {opened ? (
        <ExamStats>
          <ExamStat icon="users" tone="indigo" label="Submitted" value={`${exam.submitted} / ${exam.eligible}`}
            chip={{ text: exam.eligible ? `${Math.round((exam.submitted / exam.eligible) * 100)}% of the class` : '—', tone: 'flat' }} />
          <ExamStat icon="trophy" tone="violet" label="Average Score" value={a?.averagePct == null ? '—' : `${a.averagePct}%`}
            chip={{ text: a ? `${a.avgScore} of ${exam.totalMarks} marks` : '…', tone: 'flat' }} />
          <ExamStat icon="arrowUp" tone="green" label="Highest" value={a?.submitted ? `${a.highest}/${exam.totalMarks}` : '—'}
            chip={{ text: a?.submitted ? `lowest ${a.lowest}` : 'no scores yet', tone: 'flat' }} />
          <ExamStat icon="checkCircle" tone="blue" label="Pass Rate" value={passRate == null ? '—' : `${passRate}%`}
            chip={{ text: `pass mark ${exam.passMark}`, tone: 'flat' }} />
          <ExamStat icon="clock" tone="amber" label={exam.stage === 'live' ? 'Closes' : 'Closed'} value={fmtEndClock(exam)}
            chip={{ text: fmtExamDay(exam), tone: 'flat' }} />
        </ExamStats>
      ) : (
        <Panel icon="calendar" title="Scheduled" subtitle={`Opens ${fmtStamp(exam.startsAt)} for ${plural(exam.eligible, 'student')}`}>
          <p className="apxov__lead">
            Students see this exam in their list now and can start it once it opens. Submissions and analytics fill in
            from then; results can be reviewed after it closes at {fmtEndClock(exam)}.
          </p>
        </Panel>
      )}
      <div className="apxov__grid">
        {details}
        <Panel icon="checkCircle" title="Results" subtitle={exam.stage === 'completed' ? 'Two-step approval before students see scores' : 'Opens once the exam closes'}>
          <div className="apxov__results">
            <p>
              {exam.results?.state === 'released' ? 'Results are out — students and parents can see their scores.'
                : exam.results?.state === 'scheduled' ? 'Approved — results publish on the date set.'
                  : exam.results?.state === 'withheld' ? 'Results were rejected at final approval.'
                    : exam.stage === 'completed' ? 'Scores are ready and waiting for approval.'
                      : 'Nothing to approve until the exam closes.'}
            </p>
            <Button variant={exam.task ? 'primary' : 'secondary'} onClick={() => go('results')}>
              {exam.task ? 'Review results' : 'Open results'} <Icon name="arrowRight" size={15} />
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
