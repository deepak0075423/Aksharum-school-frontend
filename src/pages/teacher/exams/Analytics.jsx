/**
 * Teacher → Aptitude Exams → Analytics: the exams this teacher wrote or
 * class-teaches, across a year. One exam's report is the workspace's Analytics tab.
 */
import React from 'react';
import { getExamAnalytics } from '../../../api/teacher.api';
import AnalyticsOverview from '../../exams/analytics/AnalyticsOverview';

export default function TeacherExamAnalytics() {
  return (
    <AnalyticsOverview api={getExamAnalytics} backTo="/teacher/exams"
      reportPath={(id) => `/teacher/exams/${id}/analytics`}
      scopeNote="exams you wrote and exams for the sections you class-teach" />
  );
}
