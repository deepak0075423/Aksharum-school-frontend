import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import List      from './exams/List';
import Workspace from './exams/Workspace';
import TeacherExamAnalytics from './exams/Analytics';

/**
 * Teacher → Aptitude Exams.
 *
 * The landing page, and one workspace per exam whose tabs are addressable, so
 * the old deep links (…/questions, …/submissions/:studentId, …/analytics,
 * …/approval) still land on the right view.
 */
const LegacyApproval = () => {
  const { id } = useParams();
  return <Navigate to={`/teacher/exams/${id}/results`} replace />;
};

export default function TeacherExams() {
  return (
    <Routes>
      <Route index element={<List />} />
      <Route path="analytics" element={<TeacherExamAnalytics />} />
      <Route path=":id" element={<Workspace />} />
      <Route path=":id/approval" element={<LegacyApproval />} />
      <Route path=":id/submissions/:studentId" element={<Workspace tab="submissions" />} />
      <Route path=":id/:tab" element={<Workspace />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
}
