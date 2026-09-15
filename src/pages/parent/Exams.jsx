/**
 * Parent → Aptitude Exams.
 *
 * One child at a time, with a switch when there is more than one — this page
 * used to show only the first child's results. For the chosen child: how their
 * results stand, their scores exam by exam (and a trend of them), what they
 * have coming up or running now, and what they have sat that is still waiting
 * on results. A parent sees the score and how the answers split; the
 * question-by-question paper stays with the student.
 */
import React, { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getExams } from '../../api/parent.api';
import { Empty, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { Drawer } from '../admin/documentParts';
import {
  ExamHero, ExamStats, ExamStat, Panel, ExamMark, StagePill, ColumnChart, fmtExamDay, fmtClock, fmtEndClock, fmtShortDate,
} from '../admin/examParts';
import {
  DateBlock, Person, PctBar, Outcome, AttemptPill, ScoreRing, useNow, fmtGap, fmtStamp, plural,
} from '../exams/examShared';

export default function ParentExams() {
  const [child, setChild] = useState('');
  const { data, meta, loading, error } = useFetch(() => getExams(child ? { child } : undefined), [child]);
  const [open, setOpen] = useState(null);
  const now = useNow(30000);

  const results = Array.isArray(data) ? data : [];
  const children = meta?.children || [];
  const upcoming = meta?.upcoming || [];
  const pending = meta?.pending || [];
  const current = children.find((c) => String(c._id) === String(meta?.child)) || children[0];
  const first = current?.name?.split(/\s+/)[0] || 'Your child';

  if (loading && !meta) return <div className="loading-page"><Spinner /></div>;

  const sat = results.filter((e) => e.attempt);
  const avg = sat.length ? Math.round(sat.reduce((n, e) => n + e.attempt.percentage, 0) / sat.length) : null;
  const passed = sat.filter((e) => e.attempt.passed).length;
  const trend = [...sat].reverse().slice(-6).map((e) => ({
    key: e._id, label: e.title, value: e.attempt.percentage,
    title: `${e.title} (${fmtExamDay(e)}) — ${e.attempt.percentage}%, ${e.attempt.passed ? 'passed' : 'not passed'}`,
  }));

  return (
    <div className="page apxpg">
      <ExamHero title="Aptitude Exams" subtitle={current ? `${first}’s aptitude exams — what’s coming up and every result` : 'Your children’s aptitude exams and results'} />

      {children.length > 1 && (
        <div className="apxkids" role="tablist" aria-label="Choose a child">
          {children.map((c) => {
            const on = String(c._id) === String(meta?.child);
            return (
              <button key={c._id} type="button" role="tab" aria-selected={on}
                className={`apxkids__kid${on ? ' is-on' : ''}`} onClick={() => setChild(String(c._id))}>
                <Person name={c.name} photo={c.photo} sub={[c.className, c.rollNumber && `Roll ${c.rollNumber}`].filter(Boolean).join(' · ') || 'No class yet'} size={36} />
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="apxwarn"><Icon name="alert" size={15} />{error}</p>}

      {!children.length ? (
        <div className="card"><Empty icon="👨‍👩‍👧" title="No children linked" message="Once the school links your child to your account, their exams appear here." /></div>
      ) : (
        <>
          <ExamStats>
            <ExamStat icon="fileCheck" tone="indigo" label="Exams Taken" value={sat.length}
              chip={{ text: `${results.length - sat.length} not attempted`, tone: results.length - sat.length ? 'warn' : 'flat' }} />
            <ExamStat icon="trophy" tone="violet" label="Average Score" value={avg == null ? '—' : `${avg}%`}
              chip={{ text: sat.length ? `over ${plural(sat.length, 'exam')}` : 'no results yet', tone: 'flat' }} />
            <ExamStat icon="checkCircle" tone="green" label="Passed" value={sat.length ? `${passed} / ${sat.length}` : '—'}
              chip={{ text: sat.length ? `${Math.round((passed / sat.length) * 100)}% pass rate` : '—', tone: sat.length && passed === sat.length ? 'up' : 'flat' }} />
            <ExamStat icon="calendar" tone="blue" label="Upcoming" value={upcoming.length}
              chip={upcoming.some((e) => e.stage === 'live') ? { text: 'one is live now', tone: 'up' } : upcoming[0] ? { text: `next ${fmtShortDate(upcoming[0].opensAt)}`, tone: 'flat' } : { text: 'nothing scheduled', tone: 'flat' }} />
          </ExamStats>

          <div className="apxparent">
            <Panel icon="trophy" title="Results" subtitle={`${first}’s published results, newest first`} className="apxparent__main">
              {loading ? <div className="apxloading"><Spinner /></div> : results.length === 0 ? (
                <Empty icon="🏆" title="No results yet" message={`Results appear here once ${first}’s teachers publish them.`} />
              ) : (
                <ul className="apxcards">
                  {results.map((e) => (
                    <li key={e._id} className={`apxcardrow${e.attempt ? ' apxcardrow--result' : ''}`}>
                      <ExamMark exam={{ title: e.title, subjectName: e.subject?.subjectName }} size={44} />
                      <div className="apxcardrow__main">
                        <strong>{e.title}</strong>
                        <small>{e.subject?.subjectName || 'General Aptitude'} · {fmtExamDay(e)}</small>
                      </div>
                      {e.attempt ? (
                        <>
                          <div className="apxcardrow__score">
                            <span><b>{e.attempt.score}</b> / {e.totalMarks}</span>
                            <PctBar value={e.attempt.percentage} />
                          </div>
                          <Outcome passed={e.attempt.passed} />
                          <button type="button" className="btn btn-secondary apxup__btn" onClick={() => setOpen(e)}>Details</button>
                        </>
                      ) : (
                        <span className="apxcardrow__side apxcardrow__side--row"><AttemptPill status="missed" /><span className="apxmuted">Did not sit this exam</span></span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <div className="apxparent__rail">
              <Panel icon="calendar" title="Coming up" subtitle={upcoming.length ? `${plural(upcoming.length, 'exam')} scheduled` : 'Nothing scheduled'}>
                {upcoming.length === 0 ? <p className="apxempty">No upcoming exams for {first}.</p> : (
                  <ul className="apxmini">
                    {upcoming.map((e) => (
                      <li key={e._id}>
                        <DateBlock exam={e} tone={e.stage === 'live' ? 'green' : 'indigo'} />
                        <span className="apxmini__text">
                          <strong title={e.title}>{e.title}</strong>
                          <small>{fmtClock(e.startTime)} – {fmtEndClock(e)} · {plural(e.questionCount, 'question')} · {e.totalMarks} marks</small>
                        </span>
                        {e.stage === 'live'
                          ? <StagePill stage="live" />
                          : <span className="apxmini__when">in {fmtGap(new Date(e.opensAt) - now)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              {pending.length > 0 && (
                <Panel icon="clock" title="Waiting for results" subtitle="Sat, not yet published">
                  <ul className="apxmini">
                    {pending.map((e) => (
                      <li key={e._id}>
                        <ExamMark exam={{ title: e.title, subjectName: e.subject?.subjectName }} size={36} />
                        <span className="apxmini__text">
                          <strong title={e.title}>{e.title}</strong>
                          <small>
                            {e.attemptStatus && ['submitted', 'auto_submitted'].includes(e.attemptStatus)
                              ? e.resultPublishDate ? `Results on ${fmtShortDate(e.resultPublishDate)}` : 'Submitted · results pending'
                              : 'Not attempted'}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              <Panel icon="trending" title="Score trend" subtitle="Last six results, oldest first">
                <div className="apxov__chart">
                  <ColumnChart items={trend} ariaLabel={`${first}’s percentage in each of the last ${trend.length} exams`}
                    empty={`A trend appears once ${first} has results.`} format={(v) => `${v}%`} />
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}

      {open && (
        <Drawer open onClose={() => setOpen(null)}>
          <div className="docdrawer__head">
            <ExamMark exam={{ title: open.title, subjectName: open.subject?.subjectName }} size={46} />
            <div className="docdrawer__id">
              <h3>{open.title}</h3>
              <div className="docdrawer__tags"><span className="apxchip">{open.subject?.subjectName || 'General Aptitude'}</span><Outcome passed={open.attempt.passed} /></div>
            </div>
            <button type="button" className="docact" onClick={() => setOpen(null)} aria-label="Close"><Icon name="close" size={16} /></button>
          </div>
          <div className="docdrawer__body">
            <div className="apxpaper">
              <ScoreRing value={open.attempt.percentage} size={110} stroke={10}>
                <strong>{open.attempt.percentage}%</strong><small>{open.attempt.score} / {open.totalMarks}</small>
              </ScoreRing>
              <div className="apxpaper__facts">
                <ul>
                  <li><b>{open.attempt.correct}</b> correct</li>
                  <li><b>{open.attempt.incorrect}</b> incorrect</li>
                  <li><b>{open.attempt.unanswered}</b> not answered</li>
                </ul>
                <small>Pass mark {open.passMark} of {open.totalMarks}</small>
              </div>
            </div>
            <section className="docdrawer__sec">
              <h4>The exam</h4>
              <dl>
                <div className="docfield"><dt>Date</dt><dd>{fmtExamDay(open)}, {fmtClock(open.startTime)} – {fmtEndClock(open)}</dd></div>
                <div className="docfield"><dt>Paper</dt><dd>{plural(open.questionCount, 'question')} · {open.totalMarks} marks · {open.duration} min</dd></div>
                <div className="docfield"><dt>Submitted</dt><dd>{fmtStamp(open.attempt.submittedAt)}{open.attempt.status === 'auto_submitted' ? ' (automatically)' : ''}</dd></div>
                {open.attempt.violationCount > 0 && (
                  <div className="docfield"><dt>Tab switches</dt><dd>{open.attempt.violationCount} recorded during the exam</dd></div>
                )}
              </dl>
            </section>
            <p className="apxform__hint">{first} can open the full question-by-question review from their own account.</p>
          </div>
        </Drawer>
      )}
    </div>
  );
}
