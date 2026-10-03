/**
 * Student → My Results, and Parent → Results (Oct 2026 redesign, on the
 * Results kit). One page for both:
 *
 *   GET /student/results/overview
 *   GET /parent/results/overview?childId=   one of the parent's own children
 *
 * Who it is about; the promotion, when a final exam moved them up; four
 * figures; the year's overall result, where the school counts exams towards
 * one; progress across exams against the class average; how each subject is
 * going; then every result as a scorecard and every class test. The year's
 * report card is a page of its own (Report Card, in the head). A parent
 * picks the child first, with the switch every parent page uses (?child=) —
 * every child they have, at this school and at any other they are a parent at
 * (the school is named when there is more than one), each read from their own
 * school.
 *
 * A notice opens this page with `?focus=<exam or class test>` (and `?tab=tests`
 * for a class test). With no child named, the server answers for the child
 * that record is about — it used to open on the first child by name — and the
 * switch shows whichever child the answer is for.
 *
 * Results are listed by student, so one promoted on the day a final's results
 * came out still finds that final here — it used to vanish with the move. The
 * rank shows only where the exam shows it.
 *
 * Since Oct 2026: a withheld result is listed as withheld, with the school's
 * reason, and nothing else of it; grades are coloured by the scale they are
 * on; the rank across the whole class shows beside the section's; each
 * re-exam paper has its own day; and a paper can be sent for a re-check from
 * the scorecard while the school's window is open.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as studentApi from '../../../api/student.api';
import * as parentApi from '../../../api/parent.api';
import { ChildSwitch, useChild } from '../../../components/parent/ChildSwitch';
import { PageHead, Tiles, Tile, LineTabs, Btn, Badge, Empty, Ico, KidSchool, plural, fmtDay, fmtStamp, useBoard } from '../rsUI';
import { Trend, Share } from '../rsCharts';
import { gradeTone, classLine } from '../resultMeta';
import Scorecard, { promotedTo, moveText, reExamLine } from './Scorecard';

/** One decimal, the way every figure on this page reads; the scorecard gives the exact one. */
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(Number(v) * 10) / 10}%`);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthOf = (d) => { const x = d ? new Date(d) : null; return x && !Number.isNaN(x.getTime()) ? `${MON[x.getUTCMonth()]} ${String(x.getUTCFullYear()).slice(2)}` : ''; };
const shortName = (t) => (t.length > 14 ? `${t.slice(0, 13)}…` : t);

/**
 * The year's overall result: the exams the school counts towards it, added up
 * by marks, as far as they have reached the family. Until every one has, it is
 * "so far".
 */
function YearOverall({ o }) {
  const whole = o.final || o.exams.length >= o.of;
  const result = whole ? (o.isPassed ? 'Passed' : 'Not passed') : (o.isPassed ? 'Passing so far' : 'Not passing so far');
  const how = o.method === 'weighted' ? 'weighed as the school\'s rule sets' : 'added up by marks';
  const classWide = o.classRank && o.classOutOf && o.classOutOf > (o.outOf || 0);
  return (
    <section className="rs-acard rs-fam__overall" aria-label="Overall result">
      <header className="rs-acard__head">
        <div>
          <h2>Overall Result · {o.year.yearName}</h2>
          <p>
            {whole
              ? `The ${plural(o.exams.length, 'exam')} the school counts towards the year, ${how}`
              : `${o.exams.length} of the ${plural(o.of, 'exam')} the school counts so far — it changes as the rest are published`}
          </p>
        </div>
      </header>
      <div className="rs-fam__ov">
        <span className="rs-fam__ovpct"><strong>{o.percentage}%</strong><small>{o.marks} / {o.max} marks</small></span>
        <span><small>Grade</small><Badge tone={gradeTone(o.grade, o.scale)} dot={false}>{o.grade}</Badge></span>
        <span><small>Result</small><Badge tone={o.isPassed ? 'green' : 'red'} dot={false}>{result}</Badge></span>
        {o.rank ? <span><small>Rank in section</small><strong>{o.rank} of {o.outOf}</strong></span> : null}
        {classWide ? <span><small>Rank in class</small><strong>{o.classRank} of {o.classOutOf}</strong></span> : null}
      </div>
      <ul className="rs-fam__ovexams">
        {o.exams.map((e) => (
          <li key={e._id}>
            <span>{e.title}<small>{e.examTypeLabel}</small></span>
            <strong className={e.isPassed ? undefined : 'is-low'}>{e.percentage}%</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function FamilyResults({ parent = false }) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const wanted = parent ? params.get('child') || '' : '';
  // Read once: the app takes ?focus= off the address as soon as it has flashed
  // the row, and the page must not refetch for a different child when it does.
  const [focus] = useState(() => params.get('focus') || '');
  const fetcher = useMemo(() => (parent ? (q) => parentApi.getResultsOverview(q.child, q.focus) : () => studentApi.getResultsOverview()), [parent]);
  const { body, loading, error, reload } = useBoard(fetcher, { child: wanted, focus: wanted ? '' : focus });
  const d = body?.data;
  const children = d?.children || [];
  const { child: asked, pick } = useChild(children);
  // The child the answer is about — the one asked for, or the one a notice concerned.
  const child = children.find((c) => c._id === d?.child) || asked;
  const [tab, setTab] = useState(() => (params.get('tab') === 'tests' ? 'tests' : 'exams'));
  const [open, setOpen] = useState(null);

  const s = d?.stats;
  const who = d?.student;
  const exams = d?.exams || [];
  const tests = d?.classTests || [];
  const promoted = d?.promotion;
  const promotedBy = promoted ? exams.find((e) => String(e.exam._id) === String(promoted.exam)) : null;
  const trend = (d?.trend || []).map((x) => ({
    key: x._id, title: x.title, label: x.code || shortName(x.title), sub: monthOf(x.date), value: x.percentage, ref: x.classAvgPct,
  }));

  const subtitle = parent
    ? (who ? `${who.name}'s published exam results and class tests${d?.multiSchool && d.school?.name ? ` at ${d.school.name}` : ''}.` : 'Your child\'s published exam results and class tests.')
    : (who ? [classLine(who) !== '—' ? classLine(who) : '', who.rollNumber ? `Roll ${who.rollNumber}` : '', who.yearName].filter(Boolean).join(' · ') || 'Your published exam results and class tests.' : 'Your published exam results and class tests.');

  return (
    <div className="rs-page rs-fam">
      {parent ? (
        <ChildSwitch children={children} child={child} onPick={pick} label="Whose results"
          badge={d?.multiSchool ? (c) => <KidSchool name={c.schoolName} /> : undefined} />
      ) : null}
      <PageHead title={parent ? 'Results' : 'My Results'} subtitle={subtitle}>
        {who && exams.length ? (
          <Btn kind="tint" size="lg" icon="printer"
            onClick={() => nav(parent ? `/parent/results/report-card${child?._id ? `?child=${child._id}` : ''}` : '/student/results/report-card')}>Report Card</Btn>
        ) : null}
      </PageHead>

      {!d && loading ? <div className="rs-acard rs-loading" role="status">Loading results…</div> : null}
      {!d && error ? <div className="rs-acard"><Empty title="Results could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty></div> : null}
      {d && parent && !children.length ? (
        <div className="rs-acard"><Empty title="No children linked">Ask the school office to link your children to your account.</Empty></div>
      ) : null}
      {d && parent && children.length && d.resultsOn === false ? (
        <div className="rs-acard"><Empty title="No results here">{d.school?.name || 'This school'} does not use the Results module, so it has no results to show for {child?.name || 'this child'}.</Empty></div>
      ) : null}

      {d && who ? (
        <div className={`rs-abody${loading ? ' is-loading' : ''}`} aria-busy={loading || undefined}>
          {promoted ? (
            <div className="rs-promo" role="status">
              <span className="rs-promo__mark" aria-hidden><Ico name="gradCap" size={24} /></span>
              <span className="rs-promo__text">
                <strong>{moveText(promoted)} {promotedTo(promoted)}{promoted.to.yearName ? ` for ${promoted.to.yearName}` : ''}</strong>
                <small>
                  {fmtStamp(promoted.at)}{promotedBy ? `, following ${promotedBy.exam.title}` : ''}
                  {promoted.from.className ? ` — from ${[promoted.from.className, promoted.from.sectionName].filter(Boolean).join(' – ')}` : ''}.
                  {promoted.to.sectionName ? '' : ' The school will give the section.'}
                </small>
              </span>
            </div>
          ) : null}

          <Tiles>
            <Tile tone="indigo" icon="sheet" iconSize={40} value={s.exams} label="Exams Published" quietLabel
              caption={s.exams ? `${s.passed} passed` : 'None published yet'} />
            <Tile tone="blue" icon="target" iconSize={30} value={pct(s.avgPct)} label="Average Score" caption="Across every exam" />
            <Tile tone="green" icon="trophy" iconSize={30} value={s.best ? pct(s.best.percentage) : '—'} label="Best Result"
              caption={s.best ? `${s.best.title} · ${s.best.grade}` : 'No result yet'} />
            <Tile tone="amber" icon="clipboard" iconSize={30} value={s.tests} label="Class Tests"
              caption={s.testAvgPct !== null ? `Average ${s.testAvgPct}%` : 'No marks yet'} />
          </Tiles>

          {d.overall ? <YearOverall o={d.overall} /> : null}

          {exams.length ? (
            <div className="rs-agrid rs-fam__grid">
              <section className="rs-acard">
                <header className="rs-acard__head"><div><h2>Progress</h2><p>{parent ? `${who.name}'s` : 'Your'} percentage in each exam, against the class average</p></div></header>
                <Trend data={trend} height={300} label="Percentage in each exam against the class average" valueName={parent ? who.name.split(' ')[0] : 'You'} />
              </section>
              <section className="rs-acard">
                <header className="rs-acard__head"><div><h2>Subjects</h2><p>Average across every exam, best first</p></div></header>
                <ul className="rs-fam__subjects">
                  {d.subjects.map((x) => (
                    <li key={x.subjectName}>
                      <span><strong>{x.subjectName}</strong><small>{x.sat < x.papers ? `${x.sat} of ${plural(x.papers, 'paper')} sat · ` : ''}passed {x.passed} of {x.papers}</small></span>
                      <Share value={x.avgPct} />
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}

          <section className="rs-card" aria-label="Results">
            <div className="rs-card__top">
              <LineTabs value={tab} onChange={setTab} label="Results"
                items={[{ key: 'exams', label: 'Exam Results', count: exams.length || undefined }, { key: 'tests', label: 'Class Tests', count: tests.length || undefined }]} />
            </div>
            <div className="rs-tablearea rs-tablearea--tight">
              {tab === 'exams' ? (
                exams.length ? (
                  <div className="rs-scards">
                    {exams.map((r) => {
                      const e = r.exam;
                      if (r.withheld) {
                        return (
                          <article key={r._id} className="rs-scard rs-scard--held" data-focus-id={e._id}>
                            <header>
                              <div>
                                <h3>{e.title}</h3>
                                <p>{[e.examTypeLabel, e.code, classLine(e), e.yearName].filter(Boolean).join(' · ')}</p>
                              </div>
                              <Badge tone="amber" dot={false}>Withheld</Badge>
                            </header>
                            <p className="rs-scard__held"><Ico name="lock" size={16} />
                              <span>The school is holding this result back for now{r.withheld.reason ? ` — ${r.withheld.reason}` : ''}. Please contact the school office.</span>
                            </p>
                            <footer><span>Published {e.publishedOn ? fmtStamp(e.publishedOn) : ''}</span></footer>
                          </article>
                        );
                      }
                      const ahead = r.classFigures.avgPct !== null ? Math.round((r.percentage - r.classFigures.avgPct) * 10) / 10 : null;
                      const classWide = r.classRank && r.classOutOf && r.classOutOf > (r.outOf || 0);
                      return (
                        <article key={r._id} className="rs-scard" data-focus-id={e._id}>
                          <header>
                            <div>
                              <h3>{e.title}</h3>
                              <p>{[e.examTypeLabel, e.code, classLine(e), e.yearName].filter(Boolean).join(' · ')}</p>
                            </div>
                            <Badge tone={r.isPassed ? 'green' : 'red'} dot={false}>{r.isPassed ? 'Pass' : 'Fail'}</Badge>
                          </header>
                          <div className="rs-scard__score">
                            <strong>{pct(r.percentage)}</strong>
                            <span>
                              <Badge tone={gradeTone(r.grade, r.scale)} dot={false}>Grade {r.grade}</Badge>
                              <small>{r.totalMarks} / {r.totalMaxMarks} marks</small>
                            </span>
                          </div>
                          <dl className="rs-scard__facts">
                            {r.rank ? <div><dt>Rank</dt><dd>{r.rank} <i>of {r.outOf}</i></dd></div> : null}
                            {classWide ? <div><dt>In class</dt><dd>{r.classRank} <i>of {r.classOutOf}</i></dd></div> : null}
                            <div><dt>Class average</dt><dd>{pct(r.classFigures.avgPct)}</dd></div>
                            <div><dt>Highest</dt><dd>{pct(r.classFigures.topPct)}</dd></div>
                          </dl>
                          {ahead !== null ? (
                            <p className={`rs-scard__vs${ahead >= 0 ? ' is-up' : ' is-down'}`}>
                              <Ico name={ahead >= 0 ? 'arrowUp' : 'arrowDown'} size={13} />
                              {ahead === 0 ? 'Level with the class average' : `${Math.abs(ahead)} points ${ahead > 0 ? 'above' : 'below'} the class average`}
                            </p>
                          ) : null}
                          {r.promotion ? <p className="rs-scard__promo"><Ico name="gradCap" size={15} />{moveText(r.promotion)} {promotedTo(r.promotion)}</p> : null}
                          {r.reExamDue ? <p className="rs-scard__promo rs-scard__promo--due"><Ico name="calendar" size={15} />{reExamLine(r.reExamDue)}</p> : null}
                          {r.subjects.some((x) => x.recheck?.status === 'open') ? <p className="rs-scard__promo rs-scard__promo--due"><Ico name="search" size={15} />A re-check is being looked at</p> : null}
                          <footer>
                            <span>Published {e.publishedOn ? fmtStamp(e.publishedOn) : ''}</span>
                            <Btn size="sm" icon="eye" onClick={() => setOpen(r)}>Scorecard</Btn>
                          </footer>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <Empty title="No results published yet">
                    {parent ? `When the school publishes ${who.name}'s results, each exam's scorecard appears here.` : 'When the school publishes your results, each exam\'s scorecard appears here.'}
                  </Empty>
                )
              ) : (
                tests.length ? (
                  <div className="rs-tablescroll">
                    <table className="rs-table rs-table--rows rs-table--compact">
                      <thead><tr><th>Test</th><th>Subject</th><th>Date</th><th>Score</th><th>Grade</th><th>Result</th><th>Class average</th><th>Highest</th></tr></thead>
                      <tbody>
                        {tests.map((x) => (
                          <tr key={x._id} data-focus-id={x._id}>
                            <td><span className="rs-name rs-name--static"><strong>{x.title}</strong>{x.topic ? <span className="rs-sub">{x.topic}</span> : null}</span></td>
                            <td data-label="Subject">{x.subjectName}<span className="rs-sub">{classLine(x)}</span></td>
                            <td data-label="Date">{fmtDay(x.testDate)}</td>
                            <td data-label="Score">
                              {!x.mine ? <span className="rs-muted">No mark</span>
                                : x.mine.isAbsent ? <Badge tone="slate" dot={false}>Absent</Badge>
                                  : <><strong className="rs-strong">{x.mine.marksObtained}</strong> / {x.maxMarks}<span className="rs-sub">{pct(x.mine.percentage)}</span></>}
                            </td>
                            <td data-label="Grade">{x.mine?.grade ? <Badge tone={gradeTone(x.mine.grade, x.scale)} dot={false}>{x.mine.grade}</Badge> : '—'}</td>
                            <td data-label="Result">{x.mine && !x.mine.isAbsent && x.mine.marksObtained !== null
                              ? <Badge tone={x.mine.isPassed ? 'green' : 'red'} dot={false}>{x.mine.isPassed ? 'Pass' : 'Not passed'}</Badge> : '—'}</td>
                            <td data-label="Class average">{x.classFigures.average !== null && x.classFigures.average !== undefined ? `${x.classFigures.average} / ${x.maxMarks}` : '—'}</td>
                            <td data-label="Highest">{x.classFigures.highest !== null && x.classFigures.highest !== undefined ? `${x.classFigures.highest} / ${x.maxMarks}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="No class tests yet">Class tests appear here once their marks have been approved by the class teacher.</Empty>
                )
              )}
            </div>
          </section>
        </div>
      ) : null}

      <Scorecard result={open} student={who} onClose={() => setOpen(null)}
        onRecheck={async (body) => {
          if (parent) await parentApi.requestRecheck({ ...body, childId: d?.child || undefined });
          else await studentApi.requestRecheck(body);
          setOpen(null);
          reload();
        }} />
    </div>
  );
}
