/**
 * Marking an exam or interview as one of its evaluators (or, for an
 * interview, a member of a candidate's panel — who sees only their own
 * candidates). The same results board the office uses; the server decides
 * which steps this person may take.
 */
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page, Head, Ico } from '../admUI';
import { ResultsBoard } from '../admin/examParts';

export default function MarkExam() {
  const { id } = useParams();
  return (
    <Page>
      <Link to="/teacher/admissions" className="adm-linkbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)' }}><Ico name="arrowLeft" size={14} />My admission duties</Link>
      <Head eyebrow="Admissions" title="Marks" subtitle="Enter marks, mark written answers, and submit when every candidate is done." />
      <ResultsBoard examId={id} showName />
    </Page>
  );
}
