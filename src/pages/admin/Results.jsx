/**
 * Admin → Results. The route is `results/*`; this is what sits under it.
 *
 *   /admin/results              the exams board (pages/results/admin/ResultsHome)
 *   /admin/results/analytics    published results, summed (…/Analytics)
 *   /admin/results/settings     grading scale, exam types, report cards, reminders
 *   /admin/results/report-cards a section's report cards: remarks, and printing
 *   /admin/results/class-tests  every class test in the school
 *   /admin/results/exam-schedule  every exam paper in the school, day by day
 *   /admin/results/merit        a class's merit list, across its sections
 *   /admin/results/electives    who takes which optional subject
 *   /admin/results/rechecks     families' requests to check a paper again
 *   /admin/results/activity     the module's school-wide trail
 *   /admin/results/exam-day     an exam day's seating and invigilation
 *
 * One exam opens in a drawer over the board rather than on a page of its own,
 * so an exam has no path — `?exam=<id>` on the board opens it.
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ResultsHome from '../results/admin/ResultsHome';
import ResultAnalytics from '../results/admin/Analytics';
import ResultSettings from '../results/admin/ResultSettings';
import ReportCards from '../results/reportCards/ReportCards';
import ClassTests from '../results/admin/ClassTests';
import ExamScheduleBoard from '../results/schedule/TeacherSchedule';
import MeritList from '../results/admin/MeritList';
import Electives from '../results/admin/Electives';
import Rechecks from '../results/admin/Rechecks';
import ResultActivity from '../results/admin/ResultActivity';
import ExamDay from '../results/admin/ExamDay';

export default function AdminResults() {
  return (
    <Routes>
      <Route index element={<ResultsHome />} />
      <Route path="analytics" element={<ResultAnalytics />} />
      <Route path="settings" element={<ResultSettings />} />
      <Route path="report-cards" element={<ReportCards role="admin" />} />
      <Route path="class-tests" element={<ClassTests />} />
      <Route path="exam-schedule" element={<ExamScheduleBoard office />} />
      <Route path="merit" element={<MeritList />} />
      <Route path="electives" element={<Electives role="admin" />} />
      <Route path="rechecks" element={<Rechecks />} />
      <Route path="activity" element={<ResultActivity />} />
      <Route path="exam-day" element={<ExamDay />} />
      <Route path="*" element={<Navigate to="/admin/results" replace />} />
    </Routes>
  );
}
