/**
 * Parent → Exam Schedule — one child at a time, at whichever school they
 * study. One page with the student's: pages/results/schedule/FamilySchedule.jsx.
 */
import React from 'react';
import FamilySchedule from '../results/schedule/FamilySchedule';

export default function ParentExamSchedule() {
  return <FamilySchedule parent />;
}
