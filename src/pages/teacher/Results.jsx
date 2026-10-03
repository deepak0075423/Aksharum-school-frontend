/**
 * Teacher → Results & Marks. The pages live with the module's other screens,
 * on the Results kit.
 *
 *   /teacher/results                 marks, validation, class tests, published
 *                                    (pages/results/teacher/TeacherResults.jsx)
 *   /teacher/results/report-cards    report cards of the sections they are class
 *                                    or vice class teacher of
 *   /teacher/results/electives       who takes which optional subject, in those
 *                                    same sections
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import TeacherResults from '../results/teacher/TeacherResults';
import ReportCards from '../results/reportCards/ReportCards';
import Electives from '../results/admin/Electives';

export default function TeacherResultsPages() {
  return (
    <Routes>
      <Route index element={<TeacherResults />} />
      <Route path="report-cards" element={<ReportCards role="teacher" />} />
      <Route path="electives" element={<Electives role="teacher" />} />
      <Route path="*" element={<Navigate to="/teacher/results" replace />} />
    </Routes>
  );
}
