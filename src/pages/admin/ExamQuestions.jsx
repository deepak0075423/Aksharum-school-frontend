/**
 * Admin → Aptitude Exams → one exam's questions.
 *
 * The exam's header over the shared question editor (pages/exams/QuestionEditor.jsx),
 * pointed at the admin routes. Edit exam and Import reuse the landing page's
 * own dialogs.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getAptitudeExam, getAptitudeExamMeta, updateAptitudeExam, publishAptitudeExam, aptitudeQuestionApi,
} from '../../api/admin.api';
import { Spinner } from '../../components/ui/index';
import { ExamMark, StagePill, Audience, fmtExamDay, fmtClock, fmtEndClock, fmtClockRange } from './examParts';
import { BackLink, Facts, plural } from '../exams/examShared';
import QuestionEditor from '../exams/QuestionEditor';
import ExamForm from './ExamForm';
import ImportQuestions from './ImportQuestions';

const unwrap = (res) => res?.data ?? res;
const errText = (err) => err?.data?.message || err?.message || 'Something went wrong';

export default function AdminExamQuestions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [meta, setMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  const load = useCallback(async () => {
    try { setExam(unwrap(await getAptitudeExam(id))); setError(''); }
    catch (err) { setError(errText(err)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const openEdit = async () => {
    setFormOpen(true);
    if (!meta) { try { setMeta(unwrap(await getAptitudeExamMeta())); } catch (err) { toast.error(errText(err)); } }
  };

  const save = async (body) => {
    setSaving(true);
    try { await updateAptitudeExam(id, body); toast.success('Exam updated'); setFormOpen(false); await load(); }
    catch (err) { toast.error(errText(err)); }
    finally { setSaving(false); }
  };

  if (error) return <div className="page apxpg"><BackLink to="/admin/exams">Aptitude Exams</BackLink><p className="apxwarn">{error}</p></div>;
  if (!exam) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page apxpg">
      <BackLink to="/admin/exams">Aptitude Exams</BackLink>
      <header className="card apxws">
        <div className="apxws__top">
          <ExamMark exam={exam} size={54} />
          <div className="apxws__id">
            <h1>{exam.title}</h1>
            <p><StagePill stage={exam.stage} /> <span>{exam.subjectName || 'General Aptitude'}</span> <span>· Questions</span></p>
          </div>
        </div>
        <Facts items={[
          { icon: 'calendar', label: 'Date', value: fmtExamDay(exam) },
          { icon: 'clock', label: 'Time', value: fmtClockRange(exam), title: `${fmtClock(exam.startTime)} – ${fmtEndClock(exam)}` },
          { icon: 'layers', label: 'Classes', value: <Audience exam={exam} chip />, title: exam.audience?.items?.join(', ') },
          { icon: 'list', label: 'Questions', value: `${exam.questionCount} of ${exam.totalQuestions}` },
          { icon: 'trophy', label: 'Total marks', value: exam.totalMarks },
          { icon: 'users', label: 'Students', value: plural(exam.eligible, 'student') },
        ]} />
      </header>

      <QuestionEditor key={editorKey} exam={exam} canManage
        api={{ ...aptitudeQuestionApi, publishExam: publishAptitudeExam }}
        onChanged={load}
        onPublished={() => navigate('/admin/exams')}
        onEditExam={exam.status === 'draft' ? openEdit : undefined}
        onImport={() => setImporting(true)} />

      <ExamForm open={formOpen} editing={exam} meta={meta} metaLoading={formOpen && !meta}
        saving={saving} onClose={() => setFormOpen(false)} onSave={save} />
      <ImportQuestions open={importing} examId={id} onClose={() => setImporting(false)}
        onImported={async () => { await load(); setEditorKey((k) => k + 1); }} />
    </div>
  );
}
