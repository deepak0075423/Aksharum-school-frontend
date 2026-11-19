/**
 * Aptitude exam analytics across a year — the admin's (every exam in the
 * school) and a teacher's (the exams they wrote or class-teach). `api` is the
 * role's `getExamAnalytics`; `reportPath(id)` is where one exam's report lives.
 *
 * Filters are academic year, subject and class. Everything below them follows
 * the filters: the headline figures, subject-wise and class-wise performance,
 * the trend across exams, the spread of scores, every exam with its results,
 * and the students doing best and those who need support.
 *
 * No table here scrolls sideways: each is drawn as cards where it cannot fit
 * (always on a phone). Exam-wise results also offers List / Card itself, and
 * pages ten exams at a time.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Picker } from '../../admin/documentParts';
import {
  ExamHero, ExamStats, ExamStat, Panel, ColumnChart, countScale, ExamMark, StagePill, Audience, fmtExamDay,
  TableOrCards, StatCard, CardGrid, CardFact, ViewSwitch, ExamFoot, useRoomy,
} from '../../admin/examParts';
import { BackLink, PctBar, Person, YearPicker, fmtSpent, plural } from '../examShared';

const unwrap = (res) => res?.data ?? res;
const errText = (err) => err?.data?.message || err?.message || 'Something went wrong';

/** The narrowest box each table reads well in; below it, cards. */
const SUBJECT_TABLE_MIN = 400;
const CLASS_TABLE_MIN = 400;
const EXAM_TABLE_MIN = 940;
const EXAMS_PER_PAGE = 10;

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
                <TableOrCards min={SUBJECT_TABLE_MIN}
                  table={() => (
                    <div className="table-wrap apxhalf">
                      <table className="table apxtable apxtable--compact apxtable--fit">
                        <thead><tr><th>Subject</th><th className="apxc-n">Exams</th><th>Average</th><th>Pass rate</th><th>Best exam</th></tr></thead>
                        <tbody>
                          {data.subjects.map((s) => (
                            <tr key={s.name}>
                              <td>
                                <strong>{s.name}</strong>
                                <small className="apxsub">{plural(s.attempts, 'paper')}<span className="apxfold apxfold--n"> · {plural(s.exams, 'exam')}</span></small>
                              </td>
                              <td className="apxc-n">{s.exams}</td>
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
                  cards={() => (
                    <CardGrid>
                      {data.subjects.map((s) => (
                        <StatCard key={s.name} title={s.name} sub={plural(s.attempts, 'paper')} facts={[
                          { label: 'Average', value: <PctBar value={s.average} />, wide: true },
                          { label: 'Exams', value: s.exams },
                          { label: 'Pass rate', value: s.passRate == null ? '—' : `${s.passRate}%` },
                          { label: 'Best exam', wide: true, value: s.best
                            ? <button type="button" className="apxlink apxlink--sm" onClick={() => navigate(reportPath(s.best._id))}>{s.best.title} · {s.best.average}%</button>
                            : '—' },
                        ]} />
                      ))}
                    </CardGrid>
                  )} />
              )}
            </Panel>

            <Panel icon="layers" title="Class-wise performance" subtitle="By the section each student sat the exam in">
              {data.classes.length === 0 ? <p className="apxempty">No submissions yet.</p> : (
                <TableOrCards min={CLASS_TABLE_MIN}
                  table={() => (
                    <div className="table-wrap apxhalf">
                      <table className="table apxtable apxtable--compact apxtable--fit">
                        <thead><tr><th>Class</th><th className="apxc-n">Students</th><th>Average</th><th>Pass rate</th><th>High / Low</th></tr></thead>
                        <tbody>
                          {data.classes.map((c) => (
                            <tr key={c.key}>
                              <td>
                                <strong>{c.label}</strong>
                                <small className="apxsub">{plural(c.attempts, 'paper')}<span className="apxfold apxfold--n"> · {plural(c.students, 'student')}</span></small>
                              </td>
                              <td className="apxc-n">{c.students}</td>
                              <td><PctBar value={c.average} /></td>
                              <td className="apxnowrap">{c.passRate == null ? '—' : `${c.passRate}%`}</td>
                              <td className="apxnowrap">{c.highest == null ? '—' : `${c.highest}% / ${c.lowest}%`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  cards={() => (
                    <CardGrid>
                      {data.classes.map((c) => (
                        <StatCard key={c.key} title={c.label} sub={`${plural(c.students, 'student')} · ${plural(c.attempts, 'paper')}`} facts={[
                          { label: 'Average', value: <PctBar value={c.average} />, wide: true },
                          { label: 'Pass rate', value: c.passRate == null ? '—' : `${c.passRate}%` },
                          { label: 'High / Low', value: c.highest == null ? '—' : `${c.highest}% / ${c.lowest}%` },
                        ]} />
                      ))}
                    </CardGrid>
                  )} />
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

          <ExamResults exams={data.exams} open={(id) => navigate(reportPath(id))} />

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

// ── Exam-wise results ────────────────────────────────────────────────────────

const hasReport = (e) => ['live', 'completed'].includes(e.stage);
const highLow = (e) => (e.highest == null ? '—' : `${e.highest}% / ${e.lowest}%`);

/**
 * Every exam in the selection with its results — as a table or as cards, ten
 * to a page. The cards are the only view where the table cannot fit (a phone,
 * a tablet): there is no List / Card switch there. The table folds "High /
 * Low" under the average as its card narrows (global.css, `apxres`), rather
 * than scrolling sideways.
 */
function ExamResults({ exams, open }) {
  const [view, setView] = useState('list');
  const [page, setPage] = useState(1);
  const [box, roomy] = useRoomy(EXAM_TABLE_MIN);

  // A new selection (year, subject, class) starts again at its first page.
  useEffect(() => { setPage(1); }, [exams]);

  const pages = Math.max(1, Math.ceil(exams.length / EXAMS_PER_PAGE));
  const at = Math.min(page, pages);
  const shown = exams.slice((at - 1) * EXAMS_PER_PAGE, at * EXAMS_PER_PAGE);
  const cards = !roomy || view === 'grid';

  const reportButton = (e, extra = '') => (
    <button type="button" className={`btn btn-secondary apxup__btn${extra}`} onClick={() => open(e._id)}
      disabled={!hasReport(e)} title={hasReport(e) ? 'Open the full report' : 'The report opens once the exam does'}>
      <Icon name="chart" size={15} /> Report
    </button>
  );

  return (
    <Panel icon="fileDoc" title="Exam-wise results" subtitle="Open any exam for its full report" className="apxall"
      action={roomy && exams.length > 0 ? <ViewSwitch value={view} onChange={setView} /> : null}>
      <div ref={box} className="apxtoc">
        {exams.length === 0 ? <p className="apxempty">No exams in this selection.</p> : cards ? (
          <div className="apxgrid">
            {shown.map((e) => (
              <article key={e._id} className="apxcard">
                <header className="apxcard__head">
                  <ExamMark exam={e} size={40} />
                  <StagePill stage={e.stage} />
                </header>
                <button type="button" className="apxcard__title" onClick={() => open(e._id)}>{e.title}</button>
                <p className="apxcard__sub">{e.subjectName || 'General Aptitude'}</p>
                <dl className="apxcard__meta">
                  <CardFact label="Date">{fmtExamDay(e)}</CardFact>
                  <CardFact label="Classes" title={e.audience?.items?.join(', ')}><Audience exam={e} chip /></CardFact>
                  <CardFact label="Submitted">{e.submitted} / {e.eligible}{e.completion != null && <small className="apxsub">{e.completion}%</small>}</CardFact>
                  <CardFact label="Pass rate">{e.passRate == null ? '—' : `${e.passRate}%`}</CardFact>
                  <CardFact label="Average">{e.average == null ? <span className="apxmuted">—</span> : <PctBar value={e.average} />}</CardFact>
                  <CardFact label="High / Low">{highLow(e)}</CardFact>
                </dl>
                <footer className="apxcard__foot">{reportButton(e, ' apxcard__cta')}</footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="table-wrap apxlist">
            <table className="table apxtable apxtable--fit apxtable--tight">
              <thead>
                <tr>
                  <th>Exam</th><th>Date</th><th>Classes</th><th>Submitted</th><th>Average</th>
                  <th className="apxc-hl">High / Low</th><th>Pass rate</th><th>Status</th><th><span className="sr-only">Report</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e._id}>
                    <td>
                      <button type="button" className="apxtitle" onClick={() => open(e._id)}>
                        <ExamMark exam={e} size={34} />
                        <span>{e.title}<small className="apxsub">{e.subjectName || 'General Aptitude'}</small></span>
                      </button>
                    </td>
                    <td className="apxnowrap">{fmtExamDay(e)}</td>
                    <td className="apxc-classes"><Audience exam={e} /></td>
                    <td className="apxnowrap">{e.submitted} / {e.eligible}<small className="apxsub">{e.completion == null ? '—' : `${e.completion}%`}</small></td>
                    <td>
                      {e.average == null ? <span className="apxmuted">—</span> : <PctBar value={e.average} />}
                      {e.highest != null && <small className="apxsub apxfold apxfold--hl">high {e.highest}% · low {e.lowest}%</small>}
                    </td>
                    <td className="apxc-hl apxnowrap">{highLow(e)}</td>
                    <td className="apxnowrap">{e.passRate == null ? '—' : `${e.passRate}%`}</td>
                    <td><StagePill stage={e.stage} /></td>
                    <td>{reportButton(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {exams.length > 0 && (
        <ExamFoot page={at} pages={pages} total={exams.length} limit={EXAMS_PER_PAGE} count={shown.length} onPage={setPage} />
      )}
    </Panel>
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
