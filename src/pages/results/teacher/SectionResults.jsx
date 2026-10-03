/**
 * A published exam's results, for a teacher of that section — every student
 * in rank order with their marks in each subject (GET /teacher/results/exams
 * /:examId/result, the office's own read model). Staff see the rank whether or
 * not the exam shows it to families.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/teacher.api';
import { Modal } from '../../../components/ui/index';
import { Btn, Badge, Ico, downloadCsv, fmtStamp, plural } from '../rsUI';
import { savePdf } from '../reportCards/savePdf';
import { gradeTone, classLine } from '../resultMeta';

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

export default function SectionResults({ exam, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getSectionResults(exam._id).then((res) => { if (alive) setD(res); }).catch((e) => { toast.error(e.message); onClose(); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam._id]);

  const subjects = d?.subjects || [];
  const exportCsv = () => downloadCsv(
    `${exam.title} - ${classLine(exam)} - results.csv`.replace(/[\\/:*?"<>|]/g, ' '),
    ['Rank', 'Roll No', 'Student', ...subjects.map((s) => `${s.subjectName} (${s.maxMarks})`), 'Total', 'Out of', 'Percentage', 'Grade', 'Result'],
    (d?.data || []).map((r) => {
      const by = new Map(r.subjects.map((s) => [String(s.subject._id), s]));
      return [r.rank, r.student.rollNumber, r.student.name,
        ...subjects.map((s) => { const m = by.get(String(s._id)); return !m ? '' : m.isAbsent ? 'AB' : m.marksObtained; }),
        r.totalMarks, r.totalMaxMarks, r.percentage, r.grade, r.isPassed ? 'Pass' : 'Fail'];
    }),
  );

  const s = d?.summary;
  return (
    <Modal open onClose={onClose} maxWidth={1120}
      title={(
        <span className="rs-ask__title rs-t-green">
          <i><Ico name="trophy" size={18} /></i>
          <span>{exam.title}<small>{[classLine(exam), exam.yearName, exam.publishedOn ? `published ${fmtStamp(exam.publishedOn)}` : ''].filter(Boolean).join(' · ')}</small></span>
        </span>
      )}
      footer={(
        <span className="rs-form__foot">
          {exam.classTeacher ? (
            <Btn icon="fileSheet" onClick={async () => {
              try { await savePdf(() => api.getMarksRegister(exam._id), `${exam.title} ${classLine(exam)} marks register.xlsx`.replace(/[\\/:*?"<>|]/g, ' ')); }
              catch (e) { toast.error(e.message || 'The register could not be made'); }
            }}>Marks Register</Btn>
          ) : null}
          <Btn icon="download" onClick={exportCsv} disabled={!d?.data?.length}>Export CSV</Btn>
          <Btn kind="primary" onClick={onClose}>Close</Btn>
        </span>
      )}>
      {!d ? <div className="rs-loading" role="status">Loading results…</div> : (
        <div className="rs-review">
          {s ? (
            <>
              <div className="rs-marks__facts">
                <span><small>Students</small><strong>{s.students}</strong></span>
                <span><small>Passed</small><strong>{s.passed} ({pct(s.passPct)})</strong></span>
                <span><small>Class average</small><strong>{pct(s.avgPct)}</strong></span>
                <span><small>Highest</small><strong>{pct(s.topPct)}</strong></span>
                <span><small>Lowest</small><strong>{pct(s.lowPct)}</strong></span>
              </div>
              <div className="rs-grades" aria-label="Students by grade">
                {s.grades.map((g) => (
                  <span key={g.grade} className={`rs-t-${gradeTone(g.grade, s?.grades)}${g.count ? '' : ' is-none'}`}><b>{g.grade}</b>{g.count}</span>
                ))}
              </div>
            </>
          ) : null}
          <div className="rs-review__grid">
            <table>
              <thead>
                <tr>
                  <th className="rs-review__roll">Rank</th>
                  <th className="rs-review__who">Student</th>
                  {subjects.map((x) => <th key={x._id} className="is-num">{x.subjectName}<small>/ {x.maxMarks}</small></th>)}
                  <th className="is-num">Total</th>
                  <th className="is-num">%</th>
                  <th>Grade</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {d.data.map((r) => {
                  const by = new Map(r.subjects.map((x) => [String(x.subject._id), x]));
                  return (
                    <tr key={r._id}>
                      <td className="rs-review__roll rs-num"><strong>{r.rank}</strong></td>
                      <td className="rs-review__who"><strong>{r.student.name}</strong>{r.student.rollNumber ? <small>Roll {r.student.rollNumber}</small> : null}</td>
                      {subjects.map((x) => {
                        const m = by.get(String(x._id));
                        return (
                          <td key={x._id} className={`is-num${m?.isAbsent ? ' is-absent' : m && !m.isPassed ? ' is-below' : ''}`} title={m?.graceMarks ? `Includes ${m.graceMarks} grace` : undefined}>
                            {!m ? '—' : m.isAbsent ? 'AB' : m.marksObtained}{m?.graceMarks ? <sup>+{m.graceMarks}</sup> : null}
                          </td>
                        );
                      })}
                      <td className="is-num"><strong>{r.totalMarks}</strong><small>/ {r.totalMaxMarks}</small></td>
                      <td className="is-num">{r.percentage}</td>
                      <td><Badge tone={gradeTone(r.grade, s?.grades)} dot={false}>{r.grade}</Badge></td>
                      <td><Badge tone={r.isPassed ? 'green' : 'red'} dot={false}>{r.isPassed ? 'Pass' : 'Fail'}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="rs-form__hint">{plural(d.data.length, 'student')} with a result. <sup>+n</sup> marks a subject where grace marks were added.</p>
        </div>
      )}
    </Modal>
  );
}
