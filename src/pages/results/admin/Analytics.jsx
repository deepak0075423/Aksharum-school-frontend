/**
 * Admin → Results → Result Analytics.
 *
 * Published results, summed — from GET /admin/results/analytics, which counts
 * RESULTS (one student in one exam). Only published exams are in it; an exam
 * that is still being marked, or whose results were withdrawn, has nothing to
 * analyse yet. Archived exams are included: putting one away does not
 * unpublish it.
 *
 * One row of filters scopes everything below it, so the figures, the chart and
 * the tables always describe the same slice. Most of the page is figures and
 * tables on purpose — "how many exams", "what share passed" and "which section
 * did best" are numbers and rankings, not shapes. The one distribution on the
 * page (results by grade) is the one chart, and it has a table twin.
 *
 * The overall result (GET /admin/results/overall) is the one part that is not
 * a sum of every published exam: it adds up only the exams marked "Include in
 * overall result", by marks, for one academic year — the chosen one, or the
 * current one — so it follows the year and class filters and no other.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../../api/admin.api';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { PageHead, Tiles, Tile, Btn, SelectField, Badge, Empty, Ico, useBoard, count, downloadCsv, fmtDay, fmtStamp, plural } from '../rsUI';
import { Columns, Share } from '../rsCharts';
import { gradeTone, gradeRange, classLine } from '../resultMeta';

const NONE = { academicYear: '', classNumber: '', examType: '', examId: '' };
const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

const Card = ({ title, sub, right, children, className = '' }) => (
  <section className={`rs-acard ${className}`}>
    <header className="rs-acard__head">
      <div><h2>{title}</h2>{sub ? <p>{sub}</p> : null}</div>
      {right}
    </header>
    {children}
  </section>
);

export default function ResultAnalytics() {
  const nav = useNavigate();
  usePageCrumbs([{ label: 'Result Analytics' }]);
  const [f, setF] = useState(NONE);
  const [asTable, setAsTable] = useState(false);

  const query = useMemo(() => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')), [f]);
  const { body, loading, error, reload } = useBoard(api.getResultAnalytics, query);
  const d = body?.data;
  const filters = d?.filters || { years: [], classes: [], examTypes: [], exams: [] };
  const narrowed = Object.values(f).some((v) => v !== '');
  // Changing the slice may leave the chosen exam outside it, so it is dropped with it.
  const set = (k, v) => setF((s) => ({ ...s, [k]: v, ...(k === 'examId' ? null : { examId: '' }) }));

  // Low to high, left to right — a distribution reads the way a number line does.
  const grades = useMemo(() => (d?.grades || []).slice().reverse().map((g) => ({
    key: g.grade, label: g.grade, sub: gradeRange(g), value: g.count, share: g.pct,
  })), [d]);

  const exportExams = () => downloadCsv(
    'result-analytics-exams.csv',
    ['Exam', 'Class', 'Section', 'Academic year', 'Type', 'Published on', 'Students', 'Passed', 'Pass rate %', 'Average %', 'Highest %', 'Rank 1'],
    (d?.exams || []).map((e) => [e.title, e.className, e.sectionName, e.yearName, e.examTypeLabel, e.publishedOn ? fmtStamp(e.publishedOn) : '',
      e.students, e.passed, e.passPct, e.avgPct, e.topPct, e.toppers > 1 ? `${e.topper} (+${e.toppers - 1})` : e.topper]),
  );

  const k = d?.kpis || {};
  const empty = d && !k.results;

  const overallQuery = useMemo(() => Object.fromEntries(Object.entries({ academicYear: f.academicYear, classNumber: f.classNumber }).filter(([, v]) => v !== '')), [f.academicYear, f.classNumber]);
  const overall = useBoard(api.getResultOverall, overallQuery);

  return (
    <div className="rs-page">
      <PageHead title="Result Analytics" subtitle="How students did in the exams whose results are published.">
        <Btn size="lg" icon="arrowLeft" onClick={() => nav('/admin/results')}>Back to Results</Btn>
        <Btn kind="tint" size="lg" icon="download" onClick={exportExams} disabled={!d?.exams?.length}>Export CSV</Btn>
      </PageHead>

      {/* One row, above everything it scopes. */}
      <div className="rs-afilters">
        <SelectField label="Academic Year" width={200} value={f.academicYear} onChange={(v) => set('academicYear', v)} all="All Years"
          options={filters.years.map((y) => ({ value: y._id, label: `${y.yearName}${y.current ? ' (Current)' : ''}` }))} />
        <SelectField label="Class" width={190} value={f.classNumber} onChange={(v) => set('classNumber', v)} all="All Classes"
          options={filters.classes.map((c) => ({ value: String(c.classNumber), label: c.className }))} />
        <SelectField label="Exam Type" width={190} value={f.examType} onChange={(v) => set('examType', v)} all="All Types" options={filters.examTypes} />
        <SelectField label="Exam" width={300} value={f.examId} onChange={(v) => set('examId', v)} all="All Published Exams"
          options={filters.exams.map((e) => ({ value: e._id, label: `${e.title} — ${classLine(e)}` }))} />
        <Btn className="rs-filters__reset" icon="reset" iconSize={19} onClick={() => setF(NONE)} disabled={!narrowed}>Reset</Btn>
      </div>

      {!d && loading ? <div className="rs-acard rs-loading" role="status">Loading analytics…</div> : null}
      {!d && error ? (
        <div className="rs-acard"><Empty title="Analytics could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty></div>
      ) : null}

      {empty ? (
        <div className="rs-acard">
          <Empty title={narrowed ? 'No published results match' : 'No published results yet'}
            action={narrowed
              ? <Btn size="lg" icon="reset" onClick={() => setF(NONE)}>Reset Filters</Btn>
              : <Btn kind="primary" size="lg" icon="arrowLeft" onClick={() => nav('/admin/results')}>Back to Results</Btn>}>
            {narrowed ? 'No exam under these filters has published results. Try a wider selection.'
              : 'Analytics appear here once an exam\'s results are published.'}
          </Empty>
        </div>
      ) : null}

      {d && !empty ? (
        // While a new slice loads, the last one stays in place, dimmed — no jump, no flash.
        <div className={`rs-abody${loading ? ' is-loading' : ''}`} aria-busy={loading || undefined}>
          <Tiles>
            <Tile tone="indigo" icon="sheet" iconSize={40} value={k.exams} label="Exams Published" quietLabel
              caption={`${plural(k.results, 'result')} in all`} />
            <Tile tone="blue" icon="users" iconSize={30} value={k.students} label="Students Assessed"
              caption={k.students ? `${Math.round((k.results / k.students) * 10) / 10} exams each, on average` : 'No students yet'} />
            <Tile tone="amber" icon="target" iconSize={30} value={pct(k.avgPct)} label="Average Score"
              caption={`Highest ${pct(k.topPct)}`} />
            <Tile tone="green" icon="checkDisc" value={pct(k.passPct)} label="Pass Rate"
              caption={`${count(k.passed)} of ${plural(k.results, 'result')} passed`} />
          </Tiles>

          <div className="rs-agrid">
            <Card title="Results by grade" sub={`${plural(k.results, 'result')} · ${count(k.distinctions)} at ${k.distinctionPercent ?? 75}% or above`}
              right={(
                <Btn size="sm" icon={asTable ? 'bars' : 'list'} onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
                  {asTable ? 'Chart' : 'Table'}
                </Btn>
              )}>
              {asTable ? (
                <div className="rs-atable">
                  <table>
                    <thead><tr><th>Grade</th><th>Score</th><th className="is-right">Results</th><th className="is-right">Share</th></tr></thead>
                    <tbody>
                      {d.grades.map((g) => (
                        <tr key={g.grade}>
                          <td><Badge tone={gradeTone(g.grade, d.grades)} dot={false}>{g.grade}</Badge></td>
                          <td>{gradeRange(g) || '—'}</td>
                          <td className="is-right rs-num">{count(g.count)}</td>
                          <td className="is-right rs-num">{g.pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Columns data={grades} unit="result" height={312} label="Number of results in each grade" />}
            </Card>

            <Card title="Subject performance" sub="Average score of those who sat each paper, best first">
              <div className="rs-atable">
                <table>
                  <thead><tr><th>Subject</th><th>Average</th><th>Pass rate</th><th className="is-right">Sat</th><th className="is-right">Highest</th></tr></thead>
                  <tbody>
                    {d.subjects.map((s) => (
                      <tr key={s.subjectName}>
                        <td><strong>{s.subjectName}</strong>{s.absent ? <small>{plural(s.absent, 'absence')}</small> : null}</td>
                        <td><Share value={s.avgPct} /></td>
                        <td className="rs-num">{pct(s.passPct)}</td>
                        <td className="is-right rs-num">{count(s.appeared)}</td>
                        <td className="is-right rs-num">{pct(s.topPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card title="Classes and sections" sub="Each section's published results, taken together">
            <div className="rs-atable">
              <table>
                <thead><tr><th>Class / Section</th><th>Academic year</th><th className="is-right">Exams</th><th className="is-right">Students</th><th>Average</th><th>Pass rate</th><th className="is-right">Highest</th></tr></thead>
                <tbody>
                  {d.sections.map((s) => (
                    <tr key={s._id}>
                      <td><strong>{classLine(s)}</strong></td>
                      <td>{s.yearName}</td>
                      <td className="is-right rs-num">{count(s.exams)}</td>
                      <td className="is-right rs-num">{count(s.students)}</td>
                      <td><Share value={s.avgPct} /></td>
                      <td><Share value={s.passPct} tone="quiet" /></td>
                      <td className="is-right rs-num">{pct(s.topPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <OverallCard state={overall} classNumber={f.classNumber} scale={d.grades} />

          <div className="rs-agrid rs-agrid--even">
            <Card title="Top performers" sub="Highest percentages in this selection">
              <ul className="rs-alist">
                {d.top.map((x, i) => (
                  <li key={x._id}>
                    <i className={i < 3 ? 'is-top' : undefined}>{i + 1}</i>
                    <span className="rs-alist__who"><strong>{x.name}</strong><small>{classLine(x)} · {x.title}</small></span>
                    <span className="rs-alist__score"><strong>{x.percentage}%</strong><small>{x.totalMarks}/{x.totalMaxMarks}</small></span>
                    <Badge tone={gradeTone(x.grade, d.grades)} dot={false}>{x.grade}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Needs support" sub="Results that did not pass, lowest first">
              {d.support.length ? (
                <ul className="rs-alist">
                  {d.support.map((x) => (
                    <li key={x._id}>
                      <i className="is-low"><Ico name="alert" size={15} /></i>
                      <span className="rs-alist__who"><strong>{x.name}</strong><small>{classLine(x)} · {x.title}</small></span>
                      <span className="rs-alist__score"><strong>{x.percentage}%</strong><small>{plural(x.failedSubjects, 'paper')} not passed</small></span>
                      <Badge tone={gradeTone(x.grade, d.grades)} dot={false}>{x.grade}</Badge>
                    </li>
                  ))}
                </ul>
              ) : <p className="rs-dnote">Every result in this selection is a pass.</p>}
            </Card>
          </div>

          <Card title="Exams" sub={`${plural(d.exams.length, 'published exam')}, newest first`}>
            <div className="rs-atable">
              <table>
                <thead>
                  <tr><th>Exam</th><th>Class / Section</th><th>Type</th><th>Published on</th><th className="is-right">Students</th><th>Average</th><th>Pass rate</th><th className="is-right">Highest</th><th>Rank 1</th></tr>
                </thead>
                <tbody>
                  {d.exams.map((e) => (
                    <tr key={e._id}>
                      <td>
                        <button type="button" className="rs-name" onClick={() => nav(`/admin/results?exam=${e._id}`)} title="Open this exam">
                          <strong>{e.title}</strong>
                        </button>
                        {e.archived ? <small>Archived</small> : null}
                      </td>
                      <td>{classLine(e)}<small>{e.yearName}</small></td>
                      <td>{e.examTypeLabel}</td>
                      <td>{e.publishedOn ? (e.publishedOn === e.publishDate ? fmtDay(e.publishedOn) : fmtStamp(e.publishedOn)) : '—'}</td>
                      <td className="is-right rs-num">{count(e.students)}</td>
                      <td><Share value={e.avgPct} /></td>
                      <td><Share value={e.passPct} tone="quiet" /></td>
                      <td className="is-right rs-num">{pct(e.topPct)}</td>
                      <td>{e.topper || '—'}{e.toppers > 1 ? <small>+{e.toppers - 1} tied</small> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The year's overall result: every published exam marked "Include in overall
 * result", worked out by the school's rule (Result Settings, services/
 * resultOverall on the server) — by marks, so an exam weighs what it is out
 * of, or by weighted parts with best-of; passed on every exam, or on each
 * subject's aggregate. Ranks are within the section, and across the class.
 */
function ruleLine(rule) {
  if (!rule) return 'added up by marks';
  const how = rule.method === 'weighted' && rule.partLabels?.length
    ? `weighted — ${rule.partLabels.map((x) => `${x.label} ${x.weight}%${x.best ? ` (best ${x.best})` : ''}`).join(', ')}`
    : 'added up by marks';
  const terms = (rule.terms || []).some((t) => t.weight !== null) ? `; terms ${rule.terms.map((t) => `${t.label} ${t.weight ?? '—'}%`).join(', ')}` : '';
  const pass = rule.passRule === 'aggregate' ? `; passed at ${rule.passPercent}% in each subject over the year` : '; passed by passing every exam';
  return `${how}${terms}${pass}`;
}
function OverallCard({ state, classNumber, scale }) {
  const [all, setAll] = useState(false);
  const o = state.body?.data;
  if (!o) return state.loading ? <div className="rs-acard rs-loading" role="status">Loading the overall result…</div> : null;
  const year = o.year ? `${o.year.yearName}${o.year.current ? ' (current year)' : ''}` : '';
  const cls = classNumber ? o.filters.classes.find((c) => String(c.classNumber) === String(classNumber))?.className : '';
  const rows = all ? o.students : o.students.slice(0, 25);
  const pending = o.exams.filter((e) => e.published < e.sections);
  const exportCsv = () => downloadCsv(
    `overall-result-${o.year?.yearName || 'year'}.csv`,
    ['Class', 'Section', 'Rank in section', 'Rank in class', 'Roll No', 'Student', 'Admission No', 'Exams counted', 'Out of', 'Marks', 'Maximum', 'Percentage', 'Grade', 'Result', 'Withheld'],
    o.students.map((r) => [r.className, r.sectionName, r.rank, r.classRank || '', r.rollNumber, r.name, r.admissionNumber, r.exams, r.of, r.marks, r.max, r.pct, r.grade, r.passed ? 'Pass' : 'Fail', r.withheld ? 'Yes' : '']),
  );
  return (
    <Card className="rs-overall" title="Overall result"
      sub={`${year || 'No academic year'}${cls ? ` · ${cls}` : ''} · the exams marked “Include in overall result”, ${ruleLine(o.rule)}`}
      right={o.students.length ? <Btn size="sm" icon="download" onClick={exportCsv}>Export CSV</Btn> : null}>
      <div className="rs-overall__exams">
        {o.exams.length ? o.exams.map((e) => (
          <span key={`${e.title}${e.examType}`} className="rs-overall__exam">
            <Ico name="checkCircle" size={14} />{e.title}
            <small>{e.examTypeLabel}{e.published < e.sections ? ` · ${e.published} of ${plural(e.sections, 'section')} published` : ` · ${plural(e.sections, 'section')}`}</small>
          </span>
        )) : <p className="rs-dnote">No exam in {o.year?.yearName || 'this year'} counts towards the overall result yet. Tick “Include in overall result” when creating an exam, or in an exam’s settings.</p>}
      </div>
      {o.excluded.length ? (
        <p className="rs-overall__left">Not counted: {o.excluded.map((e) => `${e.title} (${plural(e.sections, 'section')})`).join(', ')} — published, but not marked “Include in overall result”.</p>
      ) : null}
      {pending.length ? (
        <p className="rs-overall__left">Still to come: {pending.map((e) => e.title).join(', ')} — figures will change as the remaining sections are published.</p>
      ) : null}
      {o.students.length ? (
        <>
          <p className="rs-overall__sum">
            {plural(o.totals.students, 'student')} · {count(o.totals.passed)} passed ({o.totals.passPct}%) · average {o.totals.avgPct}% · highest {o.totals.topPct}%
          </p>
          <div className="rs-atable">
            <table>
              <thead>
                <tr><th className="is-right">Rank</th><th className="is-right">In class</th><th>Student</th><th>Class / Section</th><th className="is-right">Exams</th><th className="is-right">Marks</th><th>Percentage</th><th>Grade</th><th>Result</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id}>
                    <td className="is-right rs-num">{r.rank}</td>
                    <td className="is-right rs-num" title={r.classOutOf ? `Of ${r.classOutOf} in the class` : undefined}>{r.classRank || '—'}</td>
                    <td><strong>{r.name}</strong>{r.rollNumber ? <small>Roll {r.rollNumber}</small> : null}</td>
                    <td>{classLine(r)}</td>
                    <td className="is-right rs-num" title={r.exams < r.of ? 'Missed one of the exams counted' : undefined}>{r.exams}{r.exams < r.of ? ` of ${r.of}` : ''}</td>
                    <td className="is-right rs-num">{r.marks}/{r.max}</td>
                    <td><Share value={r.pct} /></td>
                    <td><Badge tone={gradeTone(r.grade, scale)} dot={false}>{r.grade}</Badge></td>
                    <td>
                      <Badge tone={r.passed ? 'green' : 'red'} dot={false}>{r.passed ? 'Pass' : 'Fail'}</Badge>
                      {r.withheld ? <Badge tone="amber" dot={false} title="Withheld from the family in an exam counted">Withheld</Badge> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {o.students.length > 25 ? (
            <button type="button" className="rs-link rs-overall__more" onClick={() => setAll((x) => !x)}>
              {all ? 'Show the first 25' : `Show all ${count(o.students.length)} students`}
            </button>
          ) : null}
        </>
      ) : o.exams.length ? <p className="rs-dnote">None of the counted exams has published results yet.</p> : null}
    </Card>
  );
}
