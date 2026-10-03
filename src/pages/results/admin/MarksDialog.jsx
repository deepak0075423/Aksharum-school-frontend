/**
 * One subject's marks sheet, as the office sees it — the shared grid
 * (pages/results/MarksSheet) over the admin endpoints.
 *
 * The office may enter marks while mark entry is open and correct a sheet
 * after it has gone forward for validation; the server says which
 * (GET /admin/results/exams/:id/marks/:subjectId → editable, correcting).
 */
import React from 'react';
import * as api from '../../../api/admin.api';
import MarksSheet from '../MarksSheet';

export default function MarksDialog({ open, examId, subjectId, onClose, onSaved }) {
  return (
    <MarksSheet open={open} sheetKey={`${examId}:${subjectId}`} onClose={onClose} onSaved={onSaved}
      load={() => api.getFormalExamMarks(examId, subjectId)}
      save={(body) => api.saveFormalExamMarks(examId, subjectId, body)} readFile={api.readMarksFile}
      history={() => api.getSheetHistory(examId, subjectId)} />
  );
}
