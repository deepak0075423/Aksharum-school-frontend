/**
 * Admin → Results → Merit List (Oct 2026): a class's students in order of
 * their results, across every section of the class — for one exam (all its
 * sections' papers, ranked together) or for the year's overall result
 * (school-backend resultBoard.meritList).
 *
 * A rank used to exist only within a section; a school with three sections of
 * Class 10 had no way to see its toppers. Ties share a rank, by the exact
 * percentage. A withheld result is listed for the office with its badge —
 * families never see this page.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../../api/admin.api';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { PageHead, Btn, Badge, Empty, Ico, SelectField, downloadCsv, plural, useBoard } from '../rsUI';
import { gradeTone } from '../resultMeta';

const LIMITS = [10, 25, 50, 100, 500];

export default function MeritList() {
  const nav = useNavigate();
  usePageCrumbs([{ label: 'Merit List' }]);
  const [year, setYear] = useState('');
  const [cls, setCls] = useState('');
  const [exam, setExam] = useState('');
  const [limit, setLimit] = useState(25);
  const query = useMemo(() => ({
    limit, ...(year ? { academicYear: year } : null), ...(cls !== '' ? { classNumber: cls } : null), ...(exam ? { exam } : null),
  }), [year, cls, exam, limit]);
  const { body, loading, error, reload } = useBoard(api.getMeritList, query);
  const b = body?.data || null;
  const rows = b?.rows || [];
  const className = b?.filters?.classes.find((c) => c.classNumber === b?.classNumber)?.className || '';
  const examName = b?.exam === 'overall' ? 'Overall result' : b?.exams.find((x) => x.key === b?.exam)?.title || '';
  const distinction = b?.distinctionPercent ?? 75;

  const exportCsv = () => downloadCsv(
    `Merit list - ${className} - ${examName} - ${b?.year?.yearName || ''}.csv`.replace(/[\\/:*?"<>|]/g, ' '),
    ['Rank', 'Student', 'Roll No', 'Admission No', 'Section', 'Section rank', 'Marks', 'Out of', 'Percentage', 'Grade', 'Result', 'Withheld'],
    rows.map((r) => [r.rank, r.student.name, r.student.rollNumber, r.student.admissionNumber, r.sectionName, r.sectionRank,
      r.marks, r.max, r.percentage, r.grade, r.isPassed ? 'Pass' : 'Fail', r.withheld ? 'Yes' : '']),
  );

  return (
    <div className="rs-page">
      <PageHead title="Merit List" subtitle="A class's students in order of their results, across all its sections — for one exam, or for the year.">
        <Btn size="lg" icon="arrowLeft" onClick={() => nav('/admin/results')}>Back to Results</Btn>
        <Btn kind="tint" size="lg" icon="download" disabled={!rows.length} onClick={exportCsv}>Export CSV</Btn>
      </PageHead>

      <section className="rs-card" aria-label="Merit list">
        <div className="rs-filters">
          <SelectField label="Academic Year" width={190} value={year || String(b?.year?._id || '')} onChange={(v) => { setYear(v); setExam(''); }}
            options={(b?.filters?.years || []).map((y) => ({ value: String(y._id), label: `${y.yearName}${y.current ? ' (Current)' : ''}` }))} />
          <SelectField label="Class" width={170} value={cls !== '' ? cls : b?.classNumber !== null && b?.classNumber !== undefined ? String(b.classNumber) : ''} onChange={(v) => { setCls(v); setExam(''); }}
            options={(b?.filters?.classes || []).map((c) => ({ value: String(c.classNumber), label: c.className }))} />
          <SelectField label="Exam" width={260} value={exam || b?.exam || ''} onChange={setExam}
            options={[...(b?.exams || []).map((x) => ({ value: x.key, label: `${x.title}${x.sections > 1 ? ` · ${x.sections} sections` : ''}` })), { value: 'overall', label: 'The year’s overall result' }]} />
          <SelectField label="Show" width={130} value={String(limit)} onChange={(v) => setLimit(Number(v))}
            options={LIMITS.map((n) => ({ value: String(n), label: n === 500 ? 'Everyone' : `Top ${n}` }))} />
        </div>

        <div className="rs-tablearea">
          <div className={`rs-tablebox${loading && body ? ' is-loading' : ''}`} aria-busy={loading || undefined}>
            {rows.length ? (
              <div className="rs-tablescroll">
                <table className="rs-table rs-table--rows">
                  <thead>
                    <tr><th className="rs-num">Rank</th><th>Student</th><th>Section</th><th className="rs-num">Marks</th><th className="rs-num">Percentage</th><th>Grade</th><th>Result</th><th className="rs-num">In section</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.student._id}>
                        <td className="rs-num" data-label="Rank"><span className={`rs-merit__rank${r.rank <= 3 ? ' is-top' : ''}`}>{r.rank}</span></td>
                        <td>
                          <span className="rs-name rs-name--static">
                            <strong>{r.student.name}</strong>
                            <span className="rs-sub">{[r.student.rollNumber ? `Roll ${r.student.rollNumber}` : '', r.student.admissionNumber].filter(Boolean).join(' · ')}</span>
                          </span>
                        </td>
                        <td data-label="Section">{r.sectionName || <span className="rs-muted">—</span>}</td>
                        <td className="rs-num" data-label="Marks">{r.marks} / {r.max}</td>
                        <td className="rs-num" data-label="Percentage">
                          <strong className="rs-strong">{r.percentage}%</strong>
                          {r.percentage >= distinction && r.isPassed ? <Badge tone="violet" dot={false} title={`${distinction}% and above`}>Distinction</Badge> : null}
                        </td>
                        <td data-label="Grade"><Badge tone={gradeTone(r.grade)} dot={false}>{r.grade}</Badge></td>
                        <td data-label="Result">
                          <Badge tone={r.isPassed ? 'green' : 'red'}>{r.isPassed ? 'Pass' : 'Fail'}</Badge>
                          {r.withheld ? <Badge tone="amber" dot={false} title="Withheld from the family">Withheld</Badge> : null}
                        </td>
                        <td className="rs-num" data-label="Section rank">{r.sectionRank || <span className="rs-muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : !b && loading ? <div className="rs-loading" role="status">Loading the merit list…</div>
              : error && !b ? <Empty title="The merit list could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty>
                : (
                  <Empty title="Nobody to list">
                    {!b?.year ? 'There is no academic year yet.'
                      : b?.exam === 'overall' ? 'No exam of this class counts in the overall result yet — mark exams “Include in overall result” to count them.'
                        : 'This class has no published results this year.'}
                  </Empty>
                )}
          </div>
          {rows.length ? (
            <p className="rs-pagenote">
              <Ico name="info" size={14} />
              {plural(rows.length, 'student')}{b?.total > rows.length ? ` of ${b.total}` : ''} in {className}, {examName.toLowerCase() === 'overall result' ? 'on the year’s overall result' : examName}. Equal percentages share a rank.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
