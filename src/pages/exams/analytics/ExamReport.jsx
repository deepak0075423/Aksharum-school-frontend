/**
 * One aptitude exam in depth — shared by the admin's exam analytics page and
 * the teacher workspace's Analytics tab. `load` fetches the role's
 * `/exams/:id/report`.
 *
 * Reads top to bottom the way a teacher reviews a paper: the headline figures,
 * what stands out, how the marks spread and how each section did, which
 * questions worked (difficulty, discrimination, the options students chose),
 * and every student's result — searchable, sortable and exportable.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { saveFile } from '../../../utils/downloadFile';
import { Panel, ExamStats, ExamStat, ColumnChart, countScale, QUESTION_TYPE_LABEL } from '../../admin/examParts';
import { AttemptPill, Person, PctBar, Pills, fmtSpent, plural } from '../examShared';

const unwrap = (res) => res?.data ?? res;
const errText = (err) => err?.data?.message || err?.message || 'Something went wrong';

const TONE_ICON = { good: 'checkCircle', warn: 'alert', bad: 'closeCircle', info: 'info' };

/** Discrimination as a word, with the number beside it. */
function discrimination(d) {
  if (d == null) return { label: '—', tone: 'none', hint: 'Needs at least 4 submissions' };
  if (d < 0) return { label: 'Negative', tone: 'bad', hint: 'Stronger students got it wrong more often — check the key' };
  if (d < 0.1) return { label: 'Poor', tone: 'warn', hint: 'Barely separates stronger from weaker students' };
  if (d < 0.3) return { label: 'Fair', tone: 'info', hint: 'Separates students somewhat' };
  return { label: 'Good', tone: 'good', hint: 'Clearly separates stronger from weaker students' };
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function ExamReport({ load, examTitle }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setData(null);
    load().then((r) => { if (live) setData(unwrap(r)); }).catch((err) => { if (live) setError(errText(err)); });
    return () => { live = false; };
  }, [load]);

  if (error) return <p className="apxwarn"><Icon name="alert" size={15} />{error}</p>;
  if (!data) return <div className="apxloading"><Spinner /></div>;

  const { exam, kpis: k } = data;
  const opened = ['live', 'completed'].includes(exam?.stage);
  if (!opened) {
    return (
      <div className="card apxqe__empty">
        <Icon name="chart" size={32} />
        <h3>Analytics appear once the exam opens</h3>
        <p>{exam?.status === 'draft' ? 'This exam is still a draft.' : 'Results fill in here as students submit.'}</p>
      </div>
    );
  }

  const scale = countScale(Math.max(1, ...data.distribution.map((b) => b.count)));

  return (
    <div className="apxrep">
      <ExamStats>
        <ExamStat icon="users" tone="indigo" label="Completion" value={k.completion == null ? '—' : `${k.completion}%`}
          chip={{ text: `${k.submitted} of ${k.eligible} submitted`, tone: k.notAttempted ? 'warn' : 'up' }}
          note={k.notAttempted ? `${k.notAttempted} not attempted` : null} />
        <ExamStat icon="trophy" tone="violet" label="Average Score" value={k.average == null ? '—' : `${k.average}%`}
          chip={{ text: k.averageScore == null ? '—' : `${k.averageScore} / ${k.totalMarks}`, tone: 'flat' }}
          note={k.median != null ? `median ${k.median}%` : null} />
        <ExamStat icon="checkCircle" tone="green" label="Pass Rate" value={k.passRate == null ? '—' : `${k.passRate}%`}
          chip={{ text: `${k.passed} of ${k.submitted} passed`, tone: k.passRate >= 50 ? 'up' : 'warn' }}
          note={`pass mark ${k.passMark}`} />
        <ExamStat icon="arrowUp" tone="blue" label="Highest / Lowest" value={k.highest == null ? '—' : `${k.highest} / ${k.lowest}`}
          chip={{ text: `out of ${k.totalMarks}`, tone: 'flat' }}
          note={k.stdDev != null ? `spread ±${k.stdDev}%` : null} />
        <ExamStat icon="clock" tone="amber" label="Average Time" value={fmtSpent(k.averageTime)}
          chip={{ text: `of ${k.duration} min`, tone: 'flat' }}
          note={k.fastest != null ? `${fmtSpent(k.fastest)} – ${fmtSpent(k.slowest)}` : null} />
      </ExamStats>

      <div className="apxrep__grid">
        <Panel icon="sparkle" title="What stands out" subtitle="Worked out from this exam’s results">
          <ul className="apxinsights">
            {data.insights.map((it, i) => (
              <li key={i} className={`is-${it.tone}`}>
                <Icon name={TONE_ICON[it.tone] || 'info'} size={17} />
                <span>{it.text}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel icon="activity" title="At a glance">
          <dl className="apxglance">
            <div><dt>Submitted</dt><dd>{k.submitted - k.autoSubmitted} on time · {k.autoSubmitted} auto-submitted</dd></div>
            <div><dt>Still in progress</dt><dd>{k.inProgress}</dd></div>
            <div><dt>Not attempted</dt><dd>{k.notAttempted}</dd></div>
            <div><dt>Median / spread</dt><dd>{k.median ?? '—'}% · ±{k.stdDev ?? '—'}%</dd></div>
            <div><dt>Tab switches</dt><dd>{k.violations} by {plural(k.studentsWithViolations, 'student')}</dd></div>
            <div><dt>Paper</dt><dd>{plural(k.questions, 'question')} · {k.totalMarks} marks · {k.duration} min</dd></div>
            {data.subjectContext && (
              <div>
                <dt>{data.subjectContext.subjectName} this year</dt>
                <dd>{data.subjectContext.average}% across {plural(data.subjectContext.exams, 'other exam')}</dd>
              </div>
            )}
          </dl>
          {data.types.length > 0 && (
            <div className="apxtypesplit">
              {data.types.map((t) => (
                <div key={t.type}>
                  <small>{QUESTION_TYPE_LABEL[t.type]}</small>
                  <strong>{t.successRate == null ? '—' : `${t.successRate}%`}</strong>
                  <span>{plural(t.questions, 'question')} · {t.marks} marks</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="apxrep__grid">
        <Panel icon="chart" title="Marks distribution" subtitle="Students in each 10% band of the total marks">
          <div className="apxov__chart">
            <ColumnChart
              items={data.distribution.map((b) => ({ key: b.label, label: b.label, value: b.count, title: `${b.label}: ${plural(b.count, 'student')}` }))}
              max={scale.max} ticks={scale.ticks} ariaLabel="Students in each score band" empty="No scores yet." />
          </div>
        </Panel>

        <Panel icon="layers" title="Section-wise results" subtitle="How each class section did">
          <div className="table-wrap">
            <table className="table apxtable apxtable--compact">
              <thead><tr><th>Section</th><th>Submitted</th><th>Average</th><th>High / Low</th><th>Pass rate</th></tr></thead>
              <tbody>
                {data.sections.map((s) => (
                  <tr key={s._id}>
                    <td><strong>{s.label}</strong></td>
                    <td className="apxnowrap">{s.submitted} / {s.eligible}<small className="apxsub">{s.completion ?? '—'}%</small></td>
                    <td><PctBar value={s.average} /></td>
                    <td className="apxnowrap">{s.highest == null ? '—' : `${s.highest}% / ${s.lowest}%`}</td>
                    <td className="apxnowrap">{s.passRate == null ? '—' : `${s.passRate}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <QuestionAnalysis questions={data.questions} />
      <StudentResults students={data.students} sections={data.sections} kpis={k} title={examTitle || exam.title} />
    </div>
  );
}

// ── Questions ────────────────────────────────────────────────────────────────

function QuestionAnalysis({ questions }) {
  const [order, setOrder] = useState('number');
  const [open, setOpen] = useState(null);

  const sorted = useMemo(() => [...questions].sort((a, b) => {
    if (order === 'hardest') return (a.successRate ?? 101) - (b.successRate ?? 101);
    if (order === 'discrimination') return (a.discrimination ?? 9) - (b.discrimination ?? 9);
    return a.number - b.number;
  }), [questions, order]);

  return (
    <Panel icon="list" title="Question analysis" className="apxall"
      subtitle="Difficulty is the share who got each question fully right; discrimination is whether it separates stronger from weaker students"
      action={
        <select className="form-control apxperiod" value={order} onChange={(e) => setOrder(e.target.value)} aria-label="Order questions">
          <option value="number">Paper order</option>
          <option value="hardest">Hardest first</option>
          <option value="discrimination">Weakest discrimination first</option>
        </select>
      }>
      <div className="table-wrap">
        <table className="table apxtable">
          <thead>
            <tr><th>#</th><th>Question</th><th>Right</th><th>Correct · Wrong · Blank</th><th>Discrimination</th><th>Most chosen wrong answer</th><th /></tr>
          </thead>
          <tbody>
            {sorted.map((q) => {
              const d = discrimination(q.discrimination);
              const isOpen = open === q._id;
              return (
                <React.Fragment key={q._id}>
                  <tr className={isOpen ? 'is-open' : ''}>
                    <td><span className="apxqr__num">Q{q.number}</span></td>
                    <td className="apxqcell">
                      <strong title={q.questionText}>{q.questionText}</strong>
                      <small>{QUESTION_TYPE_LABEL[q.questionType]} · {plural(q.marks, 'mark')}</small>
                    </td>
                    <td><PctBar value={q.successRate} /></td>
                    <td className="apxnowrap apxcounts"><b className="is-ok">{q.correct}</b> · <b className="is-bad">{q.incorrect}</b> · <b>{q.unanswered}</b></td>
                    <td>
                      <span className={`apxdisc apxdisc--${d.tone}`} title={d.hint}>
                        {d.label}{q.discrimination != null && <small>{q.discrimination.toFixed(2)}</small>}
                      </span>
                    </td>
                    <td className="apxmuted">
                      {q.commonWrong ? <><b>{q.commonWrong.letter}</b> “{q.commonWrong.text}” · {q.commonWrong.chosen}</> : '—'}
                    </td>
                    <td>
                      <button type="button" className="apxact" onClick={() => setOpen(isOpen ? null : q._id)}
                        aria-expanded={isOpen} title={isOpen ? 'Hide options' : 'Show what students chose'}>
                        <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={16} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="apxopts-row">
                      <td />
                      <td colSpan={6}>
                        <p className="apxopts__text">{q.questionText}</p>
                        <ul className="apxopts">
                          {q.options.map((o) => {
                            const share = q.answered + q.unanswered ? Math.round((o.chosen / (q.answered + q.unanswered)) * 100) : 0;
                            return (
                              <li key={o.optionId} className={o.isKey ? 'is-key' : ''}>
                                <span className="apxqr__letter">{o.letter}</span>
                                <span className="apxopts__label">{o.text}{o.isKey && <em>Correct</em>}</span>
                                <span className="apxopts__bar"><span style={{ width: `${share}%` }} /></span>
                                <span className="apxopts__n">{o.chosen} · {share}%</span>
                              </li>
                            );
                          })}
                          <li className="is-blank">
                            <span className="apxqr__letter">–</span>
                            <span className="apxopts__label">Left blank</span>
                            <span className="apxopts__bar"><span style={{ width: `${q.answered + q.unanswered ? Math.round((q.unanswered / (q.answered + q.unanswered)) * 100) : 0}%` }} /></span>
                            <span className="apxopts__n">{q.unanswered}</span>
                          </li>
                        </ul>
                        {q.questionType === 'mcq_multiple' && <small className="apxmuted">Multiple choice: a student can pick several options, so the shares add up to more than 100%.</small>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── Students ─────────────────────────────────────────────────────────────────

function StudentResults({ students, sections, kpis, title }) {
  const [filter, setFilter] = useState('all');
  const [section, setSection] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('rank');

  const done = students.filter((s) => s.score != null);
  const count = {
    all: students.length,
    passed: done.filter((s) => s.passed).length,
    failed: done.filter((s) => !s.passed).length,
    absent: students.filter((s) => s.score == null).length,
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = students
      .filter((s) => filter === 'all' || (filter === 'passed' ? s.passed === true : filter === 'failed' ? s.passed === false : s.score == null))
      .filter((s) => !section || s.section === section)
      .filter((s) => !q || s.name.toLowerCase().includes(q) || String(s.rollNumber || '').includes(q));
    const by = {
      rank: (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      time: (a, b) => (a.timeTaken ?? 1e12) - (b.timeTaken ?? 1e12),
      low: (a, b) => (a.score ?? 1e9) - (b.score ?? 1e9),
    };
    return [...list].sort(by[sort]);
  }, [students, filter, section, search, sort]);

  const exportCsv = () => {
    const head = ['Rank', 'Student', 'Roll no', 'Section', 'Status', 'Score', 'Out of', 'Percentage', 'Result', 'Correct', 'Incorrect', 'Not answered', 'Time (min)', 'Tab switches'];
    const rows = shown.map((s) => [
      s.rank ?? '', s.name, s.rollNumber, s.className, s.status.replace('_', ' '), s.score ?? '', kpis.totalMarks, s.percentage ?? '',
      s.passed == null ? '' : s.passed ? 'Passed' : 'Not passed', s.correct ?? '', s.incorrect ?? '', s.unanswered ?? '',
      s.timeTaken == null ? '' : Math.round(s.timeTaken / 60000), s.violations,
    ]);
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    saveFile(csv, `${String(title || 'exam').replace(/[^\w-]+/g, '_')}_results.csv`, 'text/csv;charset=utf-8');
    toast.success(`Exported ${plural(rows.length, 'student')}`);
  };

  return (
    <Panel icon="users" title="Student results" className="apxall"
      subtitle={`${done.length} scored · pass mark ${kpis.passMark} of ${kpis.totalMarks}`}
      action={
        <div className="apxtools">
          <div className="docsearch">
            <Icon name="search" size={17} />
            <input className="form-control" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or roll no…" aria-label="Search students" />
          </div>
          {sections.length > 1 && (
            <select className="form-control docsel" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section">
              <option value="">All sections</option>
              {sections.map((s) => <option key={s._id} value={s._id}>{s.label}</option>)}
            </select>
          )}
          <select className="form-control docsel" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort students">
            <option value="rank">By rank</option>
            <option value="low">Lowest first</option>
            <option value="name">By name</option>
            <option value="time">Fastest first</option>
          </select>
          <button type="button" className="btn btn-secondary apxup__btn" onClick={exportCsv} disabled={!shown.length}>
            <Icon name="download" size={15} /> Export CSV
          </button>
        </div>
      }>
      <div className="apxsubbar">
        <Pills label="Filter students" value={filter} onChange={setFilter} items={[
          { value: 'all', label: 'All', count: count.all },
          { value: 'passed', label: 'Passed', count: count.passed },
          { value: 'failed', label: 'Not passed', count: count.failed },
          { value: 'absent', label: 'Not scored', count: count.absent },
        ]} />
      </div>
      {shown.length === 0 ? <p className="apxempty">No students match.</p> : (
        <div className="table-wrap">
          <table className="table apxtable">
            <thead>
              <tr><th>Rank</th><th>Student</th><th>Status</th><th>Score</th><th>Correct · Wrong · Blank</th><th>Time</th><th>Tab switches</th></tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s._id}>
                  <td>{s.rank ? <span className={`apxrank${s.rank <= 3 ? ` apxrank--${s.rank}` : ''}`}>{s.rank}</span> : <span className="apxmuted">—</span>}</td>
                  <td><Person name={s.name} photo={s.photo} sub={[s.rollNumber && `Roll ${s.rollNumber}`, s.className].filter(Boolean).join(' · ')} /></td>
                  <td>
                    {s.score != null
                      ? <span className={`apxpill apxpill--${s.passed ? 'green' : 'red'}`}>{s.passed ? 'Passed' : 'Not passed'}</span>
                      : <AttemptPill status={s.status} />}
                  </td>
                  <td>
                    {s.score != null ? (
                      <span className="apxscore"><strong>{s.score} / {kpis.totalMarks}</strong><PctBar value={s.percentage} /></span>
                    ) : <span className="apxmuted">—</span>}
                  </td>
                  <td className="apxnowrap apxcounts">
                    {s.correct != null ? <><b className="is-ok">{s.correct}</b> · <b className="is-bad">{s.incorrect}</b> · <b>{s.unanswered}</b></> : '—'}
                  </td>
                  <td className="apxnowrap">{fmtSpent(s.timeTaken)}{s.status === 'auto_submitted' && <small className="apxsub">auto-submitted</small>}</td>
                  <td>{s.violations > 0 ? <span className="apxviol"><Icon name="alert" size={14} />{s.violations}</span> : <span className="apxmuted">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
