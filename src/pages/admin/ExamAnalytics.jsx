/**
 * Admin → Aptitude Exams → Analytics.
 *
 * The school-wide overview (/admin/exams/analytics) and one exam's full report
 * (/admin/exams/:id/analytics), both built on pages/exams/analytics/.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getExamAnalytics, getExamReport, getAptitudeExam } from '../../api/admin.api';
import { ExamMark, StagePill, Audience, fmtExamDay, fmtClock, fmtEndClock, fmtClockRange } from './examParts';
import { BackLink, Facts, plural } from '../exams/examShared';
import AnalyticsOverview from '../exams/analytics/AnalyticsOverview';
import ExamReport from '../exams/analytics/ExamReport';

const unwrap = (res) => res?.data ?? res;

export default function AdminExamAnalytics() {
  return (
    <AnalyticsOverview api={getExamAnalytics} backTo="/admin/exams"
      reportPath={(id) => `/admin/exams/${id}/analytics`} scopeNote="every exam in the school" />
  );
}

export function AdminExamReport() {
  const { id } = useParams();
  const [exam, setExam] = useState(null);
  useEffect(() => { getAptitudeExam(id).then((r) => setExam(unwrap(r))).catch(() => {}); }, [id]);
  const load = useCallback(() => getExamReport(id), [id]);

  return (
    <div className="page apxpg">
      <BackLink to="/admin/exams/analytics">Exam Analytics</BackLink>
      {exam && (
        <header className="card apxws">
          <div className="apxws__top">
            <ExamMark exam={exam} size={54} />
            <div className="apxws__id">
              <h1>{exam.title}</h1>
              <p><StagePill stage={exam.stage} /> <span>{exam.subjectName || 'General Aptitude'}</span> <span>· Analytics</span></p>
            </div>
          </div>
          <Facts items={[
            { icon: 'calendar', label: 'Date', value: fmtExamDay(exam) },
            { icon: 'clock', label: 'Time', value: fmtClockRange(exam), title: `${fmtClock(exam.startTime)} – ${fmtEndClock(exam)}` },
            { icon: 'layers', label: 'Classes', value: <Audience exam={exam} chip />, title: exam.audience?.items?.join(', ') },
            { icon: 'list', label: 'Questions', value: exam.totalQuestions },
            { icon: 'trophy', label: 'Total marks', value: exam.totalMarks },
            { icon: 'user', label: 'Written by', value: exam.createdBy?.name || '—' },
            { icon: 'users', label: 'Students', value: plural(exam.eligible, 'student') },
          ]} />
        </header>
      )}
      <ExamReport load={load} examTitle={exam?.title} />
    </div>
  );
}
