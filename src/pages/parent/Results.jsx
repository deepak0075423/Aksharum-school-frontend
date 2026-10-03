/**
 * Parent → Results — one child at a time, picked with the switch every parent
 * page uses. One page with the student's: pages/results/family/FamilyResults.jsx
 * — and each child's report card under it.
 *
 *   /parent/results               results and class tests
 *   /parent/results/report-card   the report card, as the school prints it
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import FamilyResults from '../results/family/FamilyResults';
import FamilyReportCard from '../results/reportCards/FamilyReportCard';

export default function ParentResults() {
  return (
    <Routes>
      <Route index element={<FamilyResults parent />} />
      <Route path="report-card" element={<FamilyReportCard parent />} />
      <Route path="*" element={<Navigate to="/parent/results" replace />} />
    </Routes>
  );
}
