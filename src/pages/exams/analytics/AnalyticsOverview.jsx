/**
 * Aptitude exam analytics across a year — the admin's (every exam in the
 * school) and a teacher's (the exams they wrote or class-teach). `api` is the
 * role's `getExamAnalytics`; `reportPath(id)` is where one exam's report lives.
 *
 * Filters are academic year, subject and class. Everything below them follows
 * the filters: the headline figures, subject-wise and class-wise performance,
 * the trend across exams, the spread of scores, every exam with its results,
 * and the students doing best and those who need support.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Picker } from '../../admin/documentParts';
import {
  ExamHero, ExamStats, ExamStat, Panel, ColumnChart, countScale, ExamMark, StagePill, Audience, fmtExamDay,
} from '../../admin/examParts';
import { BackLink, PctBar, Person, YearPicker, fmtSpent, plural } from '../examShared';

const unwrap = (res) => res?.data ?? res;
const errText = (err) => err?.data?.message || err?.message || 'Something went wrong';

export default function AnalyticsOverview({ api, reportPath, backTo, scopeNote }) {
  const navigate = useNavigate();
  const [year, setYear] = useState('');
  const [subject, setSubject] = useState('');
  const [klass, setKlass] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    api({ year: year || undefined, subject: subject || undefined, classNumber: klass || undefined })
      .then((r) => { if (live) { setData(unwrap(r)); setError(''); } })
      .catch((err) => { if (live) setError(errText(err)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [api, year, subject, klass]);

  const k = data?.kpis || {};
  const scale = countScale(Math.max(1, ...(data?.distribution || []).map((b) => b.count)));
  const yearName = year === 'all' ? 'every academic year'
    : (data?.academicYears || []).find((y) => (year ? y._id === year : y.current))?.name || 'this academic year';

  return (
    <div className="page apxpg">
      <BackLink to={backTo}>Aptitude Exams</BackLink>
      <ExamHero title="Exam Analytics" subtitle={`How aptitude exams went in ${yearName} — ${scopeNote}`} />

      <section className="card apxfilterbar">
        <Icon name="filter" size={17} />
        <YearPicker years={data?.academicYears} value={year} onChange={setYear} />
        <Picker value={subject} onChange={setSubject} all="All subjects" options={data?.options?.subjects || []} label="Filter by subject" />
        <Picker value={klass} onChange={setKlass} all="All classes" options={data?.options?.classes || []} label="Filter by class" />
        {(subject || klass || year) && (
          <button type="button" className="apxinline" onClick={() => { setYear(''); setSubject(''); setKlass(''); }}>Reset</button>
        )}
        {loading && data && <Spinner size="sm" />}
      </section>

      {error && <p className="apxwarn"><Icon name="alert" size={15} />{error}</p>}

      {!data ? <div className="apxloading"><Spinner /></div> : (
        <>
          <ExamStats>
            <ExamStat icon="fileCheck" tone="indigo" label="Exams Held" value={k.closed}
              chip={{ text: `${k.exams} in all`, tone: 'flat' }} note={k.upcoming ? `${k.upcoming} upcoming` : null} />
            <ExamStat icon="users" tone="blue" label="Students Assessed" value={k.students}
              chip={{ text: plural(k.attempts, 'paper'), tone: 'flat' }} note={k.averageTime ? `avg ${fmtSpent(k.averageTime)}` : null} />
            <ExamStat icon="trophy" tone="violet" label="Average Score" value={k.average == null ? '—' : `${k.average}%`}
              chip={{ text: k.median == null ? '—' : `median ${k.median}%`, tone: 'flat' }} />
            <ExamStat icon="checkCircle" tone="green" label="Pass Rate" value={k.passRate == null ? '—' : `${k.passRate}%`}
              chip={{ text: `pass mark ${k.passMark}%`, tone: k.passRate >= 50 ? 'up' : k.passRate == null ? 'flat' : 'warn' }} />
            <ExamStat icon="activity" tone="amber" label="Completion" value={k.completion == null ? '—' : `${k.completion}%`}
              chip={{ text: `${k.submitted} of ${k.eligible}`, tone: 'flat' }} note={k.autoSubmitted ? `${k.autoSubmitted} auto-submitted` : null} />
          </ExamStats>

          {!k.attempts && (
            <div className="card"><Empty icon="📊" title="No results to analyse yet"
              message="Figures appear here once exams in this selection close with submissions." /></div>
          )}

          <div className="apxrep__grid">
            <Panel icon="bookOpen" title="Subject-wise performance" subtitle="Every submitted paper, grouped by the exam’s subject">
              {data.subjects.length === 0 ? <p className="apxempty">No closed exams yet.</p> : (
                <div className="table-wrap">
                  <table className="table apxtable apxtable--compact">
                    <thead><tr><th>Subject</th><th>Exams</th><th>Average</th><th>Pass rate</th><th>Best exam</th></tr></thead>
                    <tbody>
                      {data.subjects.map((s) => (
                        <tr key={s.name}>
                          <td><strong>{s.name}</strong><small className="apxsub">{plural(s.attempts, 'paper')}</small></td>
                          <td>{s.exams}</td>
                          <td><PctBar value={s.average} /></td>
                          <td className="apxnowrap">{s.passRate == null ? '—' : `${s.passRate}%`}</td>
                          <td className="apxmuted">
                            {s.best ? <button type="button" className="apxlink apxlink--sm" onClick={() => navigate(reportPath(s.best._id))}>{s.best.title} · {s.best.average}%</button> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel icon="layers" title="Class-wise performance" subtitle="By the section each student sat the exam in">
              {data.classes.length === 0 ? <p className="apxempty">No submissions yet.</p> : (
                <div className="table-wrap">
                  <table className="table apxtable apxtable--compact">
                    <thead><tr><th>Class</th><th>Students</th><th>Average</th><th>Pass rate</th><th>High / Low</th></tr></thead>
                    <tbody>
                      {data.classes.map((c) => (
                        <tr key={c.key}>
                          <td><strong>{c.label}</strong><small className="apxsub">{plural(c.attempts, 'paper')}</small></td>
                          <td>{c.students}</td>
                          <td><PctBar value={c.average} /></td>
                          <td className="apxnowrap">{c.passRate == null ? '—' : `${c.passRate}%`}</td>
                          <td className="apxnowrap">{c.highest == null ? '—' : `${c.highest}% / ${c.lowest}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <div className="apxrep__grid">
            <Panel icon="trending" title="Average score by exam" subtitle="Closed exams in date order">
              <div className="apxov__chart">
                <ColumnChart items={data.trend.slice(-10).map((t) => ({ key: t._id, label: t.title, value: t.average, title: `${t.title} — ${t.average}% average · pass rate ${t.passRate}% · ${plural(t.attempts, 'paper')}` }))}
                  ariaLabel="Average score of each closed exam" empty="No closed exams with submissions yet." format={(v) => `${v}%`} />
              </div>
            </Panel>
            <Panel icon="chart" title="Marks distribution" subtitle="Every submitted paper, by share of the total marks">
              <div className="apxov__chart">
                <ColumnChart items={data.distribution.map((b) => ({ key: b.label, label: b.label, value: b.count, title: `${b.label}: ${plural(b.count, 'paper')}` }))}
                  max={scale.max} ticks={scale.ticks} ariaLabel="Papers in each score band" empty="No scores yet." />
              </div>
            </Panel>
          </div>

          <Panel icon="fileDoc" title="Exam-wise results" subtitle="Open any exam for its full report" className="apxall">
            {data.exams.length === 0 ? <p className="apxempty">No exams in this selection.</p> : (
              <div className="table-wrap">
                <table className="table apxtable">
                  <thead>
                    <tr><th>Exam</th><th>Date</th><th>Classes</th><th>Submitted</th><th>Average</th><th>High / Low</th><th>Pass rate</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {data.exams.map((e) => (
                      <tr key={e._id}>
                        <td>
                          <button type="button" className="apxtitle" onClick={() => navigate(reportPath(e._id))}>
                            <ExamMark exam={e} size={34} />
                            <span>{e.title}<small className="apxsub">{e.subjectName || 'General Aptitude'}</small></span>
                          </button>
                        </td>
                        <td className="apxnowrap">{fmtExamDay(e)}</td>
                        <td><Audience exam={e} /></td>
                        <td className="apxnowrap">{e.submitted} / {e.eligible}<small className="apxsub">{e.completion == null ? '—' : `${e.completion}%`}</small></td>
                        <td>{e.average == null ? <span className="apxmuted">—</span> : <PctBar value={e.average} />}</td>
                        <td className="apxnowrap">{e.highest == null ? '—' : `${e.highest}% / ${e.lowest}%`}</td>
                        <td className="apxnowrap">{e.passRate == null ? '—' : `${e.passRate}%`}</td>
                        <td><StagePill stage={e.stage} /></td>
                        <td>
                          <button type="button" className="btn btn-secondary apxup__btn" onClick={() => navigate(reportPath(e._id))}
                            disabled={!['live', 'completed'].includes(e.stage)}>
                            Report
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="apxrep__grid">
            <Panel icon="trophy" title="Top performers" subtitle="Highest average across exams in this selection">
              <StudentList list={data.topStudents} empty="No results yet." />
            </Panel>
            <Panel icon="lifebuoy" title="Needs support" subtitle={`Averaging below the ${k.passMark}% pass mark`}>
              <StudentList list={data.needsSupport} empty="Nobody is averaging below the pass mark." low />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

const StudentList = ({ list, empty, low }) => (
  list.length === 0 ? <p className="apxempty">{empty}</p> : (
    <ol className="apxleaders">
      {list.map((s, i) => (
        <li key={s._id}>
          <span className={`apxrank${!low && i < 3 ? ` apxrank--${i + 1}` : ''}`}>{i + 1}</span>
          <Person name={s.name} sub={[s.rollNumber && `Roll ${s.rollNumber}`, s.className].filter(Boolean).join(' · ')} />
          <span className="apxleaders__n">{plural(s.exams, 'exam')} · {s.passed} passed</span>
          <PctBar value={s.average} />
        </li>
      ))}
    </ol>
  )
);
