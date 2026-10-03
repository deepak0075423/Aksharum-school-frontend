/**
 * Student → Exam Schedule, and Parent → Exam Schedule (Oct 2026, Results kit).
 *
 *   GET /student/results/schedule
 *   GET /parent/results/schedule?childId=
 *
 * The papers of the exams the office creates in the Result module: a student
 * sees their own section's; a parent picks a child and sees theirs. One person
 * can be a parent at several schools, so the switch lists every child they
 * have — at this school and the others — with the school named when there is
 * more than one, and each child's schedule is read from their own school.
 *
 * It leads with the next paper to be sat, then each exam that is under way or
 * still to come with its papers in sitting order; exams already over are
 * folded away underneath. "Add to Calendar" saves the papers still ahead as a
 * calendar file.
 */
import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { savePdf } from '../reportCards/savePdf';
import * as studentApi from '../../../api/student.api';
import * as parentApi from '../../../api/parent.api';
import { ChildSwitch, useChild } from '../../../components/parent/ChildSwitch';
import { PageHead, Btn, Badge, Empty, Ico, KidSchool, plural, fmtRange, useBoard } from '../rsUI';
import { classLine } from '../resultMeta';
import { NextPaper, shortDay, relDay, timeRange, duration, downloadIcs } from './scheduleParts';

const WHEN = {
  ongoing: { label: 'Under way', tone: 'green' },
  upcoming: { label: 'Upcoming', tone: 'indigo' },
  completed: { label: 'Completed', tone: 'slate' },
};

export default function FamilySchedule({ parent = false }) {
  const [params] = useSearchParams();
  const wanted = parent ? params.get('child') || '' : '';
  const fetcher = useMemo(() => (parent ? (q) => parentApi.getExamSchedule(q.child) : () => studentApi.getExamSchedule()), [parent]);
  const { body, loading, error, reload } = useBoard(fetcher, { child: wanted });
  const d = body?.data;
  const children = d?.children || [];
  const { child, pick } = useChild(children);
  const [showPast, setShowPast] = useState(false);

  const who = d?.student;
  const today = d?.today;
  const exams = d?.exams || [];
  const live = exams.filter((e) => e.when !== 'completed');
  const past = exams.filter((e) => e.when === 'completed');
  const ahead = live.flatMap((e) => e.papers.filter((p) => p.date && !p.done).map((p) => ({ exam: e, ...p })));
  const resultsPath = parent ? `/parent/results${child ? `?child=${child._id}` : ''}` : '/student/results';

  // The seat on each paper, from the school's published exam day plans.
  const seats = useMemo(() => new Map((d?.seats || []).map((x) => [`${x.exam}:${x.subject}`, x])), [d]);

  // The student's admit card for an exam: the school's own PDF.
  const admitCard = async (e) => {
    try {
      await savePdf(() => (parent ? parentApi.getAdmitCard(child?._id || wanted || undefined, e._id) : studentApi.getAdmitCard(e._id)),
        `admit card ${who?.name || ''} ${e.title}.pdf`.replace(/[\\/:*?"<>|]/g, ' '));
    } catch (err) { toast.error(err.message || 'The admit card could not be made'); }
  };

  const toCalendar = () => downloadIcs(
    `exam-schedule${who ? `-${who.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}.ics`,
    ahead.map((p) => ({
      uid: `${p.exam._id}-${p.subjectId}@exam-schedule`,
      title: `${p.subjectName} — ${p.exam.title}`,
      date: p.date, startTime: p.startTime, endTime: p.endTime,
      description: [`${p.exam.title}${p.exam.code ? ` (${p.exam.code})` : ''}`, classLine(p.exam), `Maximum marks: ${p.maxMarks}`, p.exam.description].filter(Boolean).join('\n'),
    })),
  );

  const subtitle = !who ? (parent ? 'When your child\'s exam papers are sat.' : 'When your exam papers are sat.')
    : [parent ? who.name : '', classLine(who) !== '—' ? classLine(who) : '', who.rollNumber ? `Roll ${who.rollNumber}` : '', who.yearName,
      parent && d?.multiSchool ? d.school?.name : ''].filter(Boolean).join(' · ');

  return (
    <div className="rs-page rs-fam">
      {parent ? (
        <ChildSwitch children={children} child={child} onPick={pick} label="Whose exam schedule"
          badge={d?.multiSchool ? (c) => <KidSchool name={c.schoolName} /> : undefined} />
      ) : null}
      <PageHead title="Exam Schedule" subtitle={subtitle}>
        {ahead.length ? <Btn kind="tint" size="lg" icon="calendarDays" iconSize={19} onClick={toCalendar}>Add to Calendar</Btn> : null}
      </PageHead>

      {!d && loading ? <div className="rs-acard rs-loading" role="status">Loading the schedule…</div> : null}
      {!d && error ? <div className="rs-acard"><Empty title="The schedule could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty></div> : null}
      {d && parent && !children.length ? (
        <div className="rs-acard"><Empty title="No children linked">Ask the school office to link your children to your account.</Empty></div>
      ) : null}
      {d && parent && children.length && d.resultsOn === false ? (
        <div className="rs-acard"><Empty title="No exam schedule here">{d.school?.name || 'This school'} does not use the Results module, so it has no exam schedule to show for {child?.name || 'this child'}.</Empty></div>
      ) : null}

      {d && who ? (
        <div className={`rs-abody${loading ? ' is-loading' : ''}`} aria-busy={loading || undefined}>
          <NextPaper next={d.next} today={today} />

          {live.length ? (
            <div className="rs-xcards">
              {live.map((e) => <ExamCard key={e._id} exam={e} today={today} nextKey={d.next ? `${d.next.exam._id}:${d.next.subjectId}` : ''} resultsPath={resultsPath} onAdmitCard={admitCard} seats={seats} />)}
            </div>
          ) : (
            <div className="rs-acard">
              <Empty title="No exams scheduled">
                {parent ? `When the school sets an exam for ${who.name}'s class, its papers appear here with their dates and times.`
                  : 'When the school sets an exam for your class, its papers appear here with their dates and times.'}
              </Empty>
            </div>
          )}

          {past.length ? (
            <section className="rs-past">
              <button type="button" className="rs-past__toggle" aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>
                <Ico name={showPast ? 'chevronDown' : 'chevronRight'} size={16} />
                Past exams <span>{past.length}</span>
              </button>
              {showPast ? (
                <div className="rs-xcards">
                  {past.map((e) => <ExamCard key={e._id} exam={e} today={today} resultsPath={resultsPath} />)}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One exam: what it is, when, and its papers in the order they are sat. */
export function ExamCard({ exam: e, today, nextKey = '', resultsPath, onAdmitCard, seats }) {
  const w = WHEN[e.when];
  const undated = e.papers.length - e.dated;
  const chip = e.when === 'upcoming' && e.startDate ? `Starts ${relDay(e.startDate, today).toLowerCase()}` : w.label;
  return (
    <article className={`rs-xcard is-${e.when}`} data-focus-id={e._id}>
      <header>
        <div>
          <h3>{e.title}</h3>
          <p>{[e.examTypeLabel, e.code, classLine(e) !== '—' ? classLine(e) : '', e.yearName].filter(Boolean).join(' · ')}</p>
        </div>
        <Badge tone={w.tone}>{chip}</Badge>
      </header>
      <p className="rs-xcard__dates">
        <Ico name="calendar" size={15} />
        {e.startDate ? fmtRange(e.startDate, e.endDate) : 'Dates to be announced'}
        <span>· {plural(e.papers.length, 'paper')}{undated ? ` · ${undated} still to be dated` : ''}</span>
      </p>
      {e.description ? <p className="rs-xcard__note"><Ico name="info" size={14} />{e.description}</p> : null}

      <div className="rs-xtable">
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Subject</th><th className="is-num">Max marks</th></tr></thead>
          <tbody>
            {e.papers.map((p) => {
              const isNext = nextKey === `${e._id}:${p.subjectId}`;
              return (
                <tr key={p.subjectId} className={p.done ? 'is-done' : p.today ? 'is-today' : isNext ? 'is-next' : undefined}>
                  <td data-label="Date">
                    {p.date ? (
                      <>
                        <strong>{shortDay(p.date)}</strong>
                        <small>{p.today ? 'Today' : p.done ? 'Done' : relDay(p.date, today)}</small>
                      </>
                    ) : <span className="rs-muted">To be announced</span>}
                  </td>
                  <td data-label="Time">
                    {p.startTime ? <>{timeRange(p.startTime, p.endTime)}{duration(p.startTime, p.endTime) ? <small>{duration(p.startTime, p.endTime)}</small> : null}</> : <span className="rs-muted">—</span>}
                  </td>
                  <td data-label="Subject">
                    <strong>{p.subjectName}</strong>{p.subjectCode ? <small>{p.subjectCode}</small> : null}
                    {seats?.get(`${e._id}:${p.subjectId}`) ? (() => {
                      const x = seats.get(`${e._id}:${p.subjectId}`);
                      return <small className="xd-seat"><Ico name="mapPin" size={12} />{x.roomName}{x.roomNumber && x.roomNumber !== x.roomName ? ` (${x.roomNumber})` : ''}{x.building ? `, ${x.building}` : ''} · seat {x.seat}</small>;
                    })() : null}
                  </td>
                  <td className="is-num" data-label="Max marks">{p.maxMarks}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {e.results?.visible && resultsPath ? (
        <footer><Ico name="trophy" size={15} />Results are out<Link className="rs-link" to={resultsPath}>View results</Link></footer>
      ) : e.results?.published ? (
        <footer><Ico name="clockRing" size={15} />Results are being released by the school.</footer>
      ) : onAdmitCard && e.when !== 'completed' ? (
        <footer><Ico name="idCard" size={15} />Bring the admit card to every paper<button type="button" className="rs-link" onClick={() => onAdmitCard(e)}>Download admit card</button></footer>
      ) : null}
    </article>
  );
}
