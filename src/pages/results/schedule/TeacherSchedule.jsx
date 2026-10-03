/**
 * Teacher → Exam Schedule (Oct 2026, Results kit) — and, with `office`, the
 * office's (Admin → Results → More → Exam Schedule): every section's papers.
 *
 *   GET /teacher/results/schedule
 *   GET /admin/results/schedule     every section's exams, each with its
 *                                   status; a paper clashing with another
 *                                   exam's paper for the same class is marked
 *
 * The papers of every section this teacher teaches a subject in, or is class
 * teacher of — a class teacher sees their class's whole exam, a subject
 * teacher sees the timetable of each class they take, with their own papers
 * marked. Read as an agenda: one block per day, papers in the order they are
 * sat, so "what is on, and where am I needed" is one glance.
 *
 * "My subjects" narrows it to the papers in the subjects they teach; the class
 * picker to one section; Past shows what has already been sat.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { savePdf } from '../reportCards/savePdf';
import * as api from '../../../api/teacher.api';
import * as adminApi from '../../../api/admin.api';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { PageHead, Btn, Badge, Empty, Select, Ico, MenuBtn, plural, useBoard } from '../rsUI';
import { classLine, statusOf } from '../resultMeta';
import { NextPaper, DateLeaf, Segmented, longDay, shortDay, relDay, timeRange, duration, downloadIcs } from './scheduleParts';

/** The office's crumb; the teacher's page is a nav item of its own. */
function OfficeCrumb() { usePageCrumbs([{ label: 'Exam Schedule' }]); return null; }

export default function TeacherSchedule({ office = false }) {
  const nav = useNavigate();
  const { body, loading, error, reload } = useBoard(office ? adminApi.getExamScheduleAsOffice : api.getExamSchedule, {});
  const d = body?.data;
  const [scope, setScope] = useState('all');        // all | mine
  const [section, setSection] = useState('');
  const [when, setWhen] = useState('upcoming');     // upcoming | past

  const today = d?.today;
  const sections = d?.sections || [];
  const all = useMemo(() => (d?.exams || []).flatMap((e) => e.papers.map((p) => ({ exam: e, ...p }))), [d]);
  // A dated paper is past once its day is; one with no date goes by its exam.
  const isPast = (p) => (p.date ? p.done : p.exam.when === 'completed');
  const inClass = useMemo(() => all.filter((p) => !section || String(p.exam.sectionId) === section), [all, section]);
  const inScope = useMemo(() => inClass.filter((p) => scope === 'all' || p.mine), [inClass, scope]);
  const upcoming = inScope.filter((p) => !isPast(p));
  const past = inScope.filter(isPast);
  const shown = when === 'past' ? past : upcoming;
  // What "My subjects" would list in the view on screen.
  const mineCount = inClass.filter((p) => p.mine && isPast(p) === (when === 'past')).length;

  // One block per day; papers with no date yet come last.
  const days = useMemo(() => {
    const map = new Map();
    shown.forEach((p) => {
      const k = p.date || '';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    });
    const order = (a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99')
      || (a.exam.classNumber ?? 99) - (b.exam.classNumber ?? 99) || String(a.exam.sectionName).localeCompare(String(b.exam.sectionName));
    const keys = [...map.keys()].filter(Boolean).sort((a, b) => (when === 'past' ? b.localeCompare(a) : a.localeCompare(b)));
    const out = keys.map((k) => ({ date: k, papers: map.get(k).sort(order) }));
    if (map.has('')) out.push({ date: '', papers: map.get('').sort(order) });
    return out;
  }, [shown, when]);

  // This year's classes are what the page is about; the ones taught before are
  // still in the class picker, for their past papers.
  const mine = sections.some((x) => x.current) ? sections.filter((x) => x.current) : sections;
  const myClasses = [...new Set(mine.filter((x) => x.myClass).map((x) => classLine(x)))];
  const clashes = office ? upcoming.filter((p) => p.clash).length : 0;
  // The class teacher prints admit cards for their own class's exams ahead.
  const myExams = office ? [] : [...new Map(upcoming.filter((p) => p.exam.myClass).map((p) => [String(p.exam._id), p.exam])).values()];
  const admitCards = async (x) => {
    try { await savePdf(() => api.getAdmitCards(x._id), `${x.title} ${classLine(x)} admit cards.pdf`.replace(/[\\/:*?"<>|]/g, ' ')); }
    catch (e) { toast.error(e.message || 'The admit cards could not be made'); }
  };
  const toCalendar = () => downloadIcs('exam-schedule.ics', upcoming.filter((p) => p.date).map((p) => ({
    uid: `${p.exam._id}-${p.subjectId}@exam-schedule`,
    title: `${p.subjectName} — ${classLine(p.exam)}`,
    date: p.date, startTime: p.startTime, endTime: p.endTime,
    description: [`${p.exam.title}${p.exam.code ? ` (${p.exam.code})` : ''}`, p.mine ? 'Your subject' : '', p.exam.myClass ? 'Your class' : ''].filter(Boolean).join('\n'),
  })));

  return (
    <div className="rs-page">
      {office ? <OfficeCrumb /> : null}
      <PageHead title="Exam Schedule"
        subtitle={office
          ? 'Every exam paper in the school, day by day. Open a paper to change its exam\'s dates and times.'
          : d ? (sections.length
            ? `Exams of the ${plural(mine.length, 'class', 'classes')} you teach${myClasses.length ? ` — you are class teacher of ${myClasses.join(', ')}` : ''}.`
            : 'Exams of the classes you teach appear here.') : 'Exams of the classes you teach and the class you look after.'}>
        {office ? <Btn size="lg" icon="arrowLeft" onClick={() => nav('/admin/results')}>Back to Results</Btn> : null}
        {myExams.length ? (
          <MenuBtn size="lg" icon="filePdf" label="Admit cards for your class" items={myExams.map((x) => ({ label: `${x.title} · ${classLine(x)}`, icon: 'filePdf', onClick: () => admitCards(x) }))}>Admit Cards</MenuBtn>
        ) : null}
        {upcoming.some((p) => p.date) ? <Btn kind="tint" size="lg" icon="calendarDays" iconSize={19} onClick={toCalendar}>Add to Calendar</Btn> : null}
      </PageHead>
      {clashes ? (
        <p className="rs-dnote rs-dnote--warn rs-sched__clash" role="status">
          <Ico name="alert" size={15} /> {plural(clashes, 'paper')} ahead {clashes === 1 ? 'clashes' : 'clash'} with another exam's paper for the same class — marked below.
        </p>
      ) : null}

      {!office && d?.duties?.length ? (
        <section className="rs-acard xd-duties" aria-label="Your invigilation duties">
          <header className="rs-acard__head"><div><h2>Your Invigilation Duties</h2><p>From the school's published exam day plans</p></div></header>
          <ul>
            {d.duties.map((x, i) => (
              <li key={`${x.date}${x.startTime}${x.roomName}${i}`}>
                <strong>{shortDay(x.date)}{x.startTime ? ` · ${timeRange(x.startTime, x.endTime)}` : ''}</strong>
                <span>{x.roomName}{x.roomNumber && x.roomNumber !== x.roomName ? ` (${x.roomNumber})` : ''}{x.building ? ` · ${x.building}` : ''} · {plural(x.students, 'student')}</span>
                <small>{x.papers.map((p) => `${p.subjectName} ${classLine(p)}`).join(', ')}{x.with?.length ? ` · with ${x.with.join(', ')}` : ''}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!d && loading ? <div className="rs-acard rs-loading" role="status">Loading the schedule…</div> : null}
      {!d && error ? <div className="rs-acard"><Empty title="The schedule could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty></div> : null}

      {d ? (
        <div className={`rs-abody${loading ? ' is-loading' : ''}`} aria-busy={loading || undefined}>
          <NextPaper next={d.next} today={today} lead={office ? 'Next paper' : 'Your next paper'} />

          <section className="rs-card" aria-label="Exam schedule">
            <div className="rs-sched__bar">
              {office ? null : (
                <Segmented label="Which papers" value={scope} onChange={setScope}
                  options={[{ value: 'all', label: 'All papers' }, { value: 'mine', label: 'My subjects', count: mineCount || undefined }]} />
              )}
              <span className="rs-sched__class">
                <Select label="Class" value={section} onChange={setSection} all={office ? 'All classes' : 'All my classes'} marked={false}
                  options={sections.map((x) => ({
                    value: String(x._id),
                    label: `${classLine(x)}${x.current ? '' : ` (${x.yearName})`}${x.myClass ? ' · your class' : ''}`,
                  }))} />
              </span>
              <Segmented label="When" value={when} onChange={setWhen}
                options={[{ value: 'upcoming', label: 'Upcoming', count: upcoming.length || undefined }, { value: 'past', label: 'Past', count: past.length || undefined }]} />
            </div>

            <div className="rs-tablearea rs-tablearea--tight">
              {days.length ? days.map((day) => (
                <section key={day.date || 'tba'} className={`rs-day${day.date === today ? ' is-today' : ''}`}>
                  <header>
                    {day.date ? <DateLeaf iso={day.date} tone={day.date === today ? 'today' : undefined} /> : <span className="rs-leaf is-none" aria-hidden><b>?</b></span>}
                    <div>
                      <strong>{day.date ? longDay(day.date) : 'Date to be announced'}</strong>
                      <small>{day.date ? relDay(day.date, today) : 'The office has not dated these papers yet'}</small>
                    </div>
                    <span className="rs-day__n">{plural(day.papers.length, 'paper')}</span>
                  </header>
                  <ul>
                    {day.papers.map((p) => (
                      <li key={`${p.exam._id}:${p.subjectId}`} className={[p.mine ? 'is-mine' : '', office ? 'is-link' : ''].filter(Boolean).join(' ') || undefined}
                        data-focus-id={p.exam._id}
                        {...(office ? {
                          role: 'link', tabIndex: 0, title: 'Open this exam',
                          onClick: () => nav(`/admin/results?exam=${p.exam._id}`),
                          onKeyDown: (e) => { if (e.key === 'Enter') nav(`/admin/results?exam=${p.exam._id}`); },
                        } : null)}>
                        <span className="rs-day__time">
                          {p.startTime ? <><strong>{timeRange(p.startTime, p.endTime)}</strong>{duration(p.startTime, p.endTime) ? <small>{duration(p.startTime, p.endTime)}</small> : null}</>
                            : <span className="rs-muted">Time to be announced</span>}
                        </span>
                        <span className="rs-day__what">
                          <strong>{p.subjectName}</strong>
                          <small>{[p.exam.title, p.exam.code].filter(Boolean).join(' · ')}</small>
                        </span>
                        <span className="rs-day__where">{classLine(p.exam)}<small>{p.maxMarks} marks</small></span>
                        <span className="rs-day__tags">
                          {p.mine ? <Badge tone="indigo" dot={false}>Your subject</Badge> : null}
                          {p.exam.myClass ? <Badge tone="blue" dot={false}>Your class</Badge> : null}
                          {office && p.clash ? <Badge tone="red" dot={false} title={`Overlaps ${p.clash}`}>Clash</Badge> : null}
                          {office ? <Badge tone={statusOf(p.exam.status).tone}>{statusOf(p.exam.status).label}</Badge> : null}
                          {p.exam.timetableShared === false ? <Badge tone="amber" dot={false} title="Students and parents do not see these dates yet">Not shared with families</Badge> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )) : (
                <Empty title={when === 'past' ? 'No past papers' : 'No papers ahead'}>
                  {office && !sections.length ? 'No exam has been created yet. Create one under Results, and its papers appear here.'
                    : !sections.length ? 'You are not assigned a subject or a class yet, so there is no exam schedule to show.'
                    : scope === 'mine' ? 'None of your subjects has a paper here. Switch to “All papers” to see the whole schedule of your classes.'
                      : when === 'past' ? 'Papers that have been sat will be listed here.'
                        : 'When the office sets an exam for a class you teach, its papers appear here with their dates and times.'}
                </Empty>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
