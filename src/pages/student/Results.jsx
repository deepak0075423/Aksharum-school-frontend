/**
 * Student → My Results. One page with the parent's, on the Results kit:
 * pages/results/family/FamilyResults.jsx — and the year's report card under it.
 *
 *   /student/results               results and class tests
 *   /student/results/report-card   the report card, as the school prints it
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import FamilyResults from '../results/family/FamilyResults';
import FamilyReportCard from '../results/reportCards/FamilyReportCard';

export default function StudentResults() {
  return (
    <Routes>
      <Route index element={<FamilyResults />} />
      <Route path="report-card" element={<FamilyReportCard />} />
      <Route path="*" element={<Navigate to="/student/results" replace />} />
    </Routes>
  );
}
