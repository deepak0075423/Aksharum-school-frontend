/**
 * Student → My Timetable.
 *
 * A student opens this to answer one of two questions: "where am I meant to be
 * right now" and "what have I got on Thursday". So the screen leads with what
 * is running this minute, offers the day as a list and the week as a grid, and
 * marks any period a substitute is taking — the one thing on a timetable that
 * changes without warning.
 */
import React, { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getTimetable, downloadTimetable } from '../../api/student.api';
import { Button } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  TtHead, Card, Body, Seg, Stats, Stat, Panel, Note, Chip, Loading, Pick, Field,
  plural, toneFor,
} from '../timetable/admin/ttUI';
import {
  WeekGrid, DayList, NowNext, SubjectList, DAYS, DAY_SHORT,
  todayName, weekShape, coverIndex, isTeachingPeriod,
} from '../timetable/view/viewParts';

function blobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function StudentTimetable() {
  const { data, loading } = useFetch(() => getTimetable(), []);
  const [view, setView] = useState('week');
  const [day, setDay]   = useState(() => todayName());
  const [busy, setBusy] = useState(false);

  const payload  = data || {};
  const tt       = payload.timetable;
  const section  = payload.section;
  const entries  = useMemo(() => payload.entries || [], [payload.entries]);
  const days     = payload.days?.length ? payload.days : DAYS.slice(0, 5);
  const periods  = tt?.periodsStructure || [];
  const covers   = useMemo(() => coverIndex(payload.covers), [payload.covers]);

  /* A cell is looked up thousands of times across a render; build the index
     once rather than scanning the entry list per slot. */
  const bySlot = useMemo(() => {
    const map = new Map();
    for (const e of entries) map.set(`${e.dayOfWeek}#${e.periodNumber}`, e);
    return map;
  }, [entries]);

  const cellFor = (d, periodNumber) => {
    const e = bySlot.get(`${d}#${periodNumber}`);
    if (!e) return null;
    const name = e.subject?.subjectName || e.subject?.name || 'Subject';
    return {
      title: name,
      tone: toneFor(e.subject?._id || name),
      sub: e.teacher?.name || 'No teacher assigned',
      extras: [
        ...(e.additionalSubjects || []).filter((a) => a.subject).map((a) => (
          `${a.subject?.subjectName || a.subject?.name}${a.teacher?.name ? ` · ${a.teacher.name}` : ''}`
        )),
        ...((e.mergedSections || []).length
          ? [`with ${(e.mergedSections || []).map((m) => m.sectionName || m).join(', ')}`] : []),
      ],
      // The line under the title is the teacher, so a cover replaces it.
      cover: (() => {
        const c = covers.get(`${d}#${periodNumber}`);
        return c ? { from: c.originalTeacher || e.teacher?.name || '', to: c.substituteTeacher } : null;
      })(),
    };
  };

  const shape = weekShape(periods, days, entries.length);

  /* Which subjects the week is made of, and who takes them. The count is what
     a student checks against "we should have five maths a week". */
  const subjects = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      const id = e.subject?._id || e.subject?.subjectName || 'x';
      const name = e.subject?.subjectName || e.subject?.name || 'Subject';
      if (!map.has(id)) map.set(id, { key: id, name, sub: e.teacher?.name || 'No teacher', periods: 0 });
      map.get(id).periods += 1;
    }
    return [...map.values()].sort((a, b) => b.periods - a.periods);
  }, [entries]);

  const download = async () => {
    setBusy(true);
    try {
      const res = await downloadTimetable();
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/pdf' });
      blobDownload(blob, 'my-timetable.pdf');
    } catch (e) { toast.error(e?.data?.message || 'That download failed'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="page tt-page"><Loading label="Loading your week…" /></div>;

  const ready = !!tt && periods.some(isTeachingPeriod);

  return (
    <div className="page tt-page">
      <TtHead icon="calendar" title="My Timetable"
        subtitle={section?.className
          ? `${section.className} · Section ${section.sectionName}${payload.activeYear ? ` · ${payload.activeYear.yearName}` : ''}`
          : 'Your weekly class schedule'}>
        {ready && (
          <Button variant="secondary" onClick={download} loading={busy}>
            <Icon name="download" size={16} /> Download PDF
          </Button>
        )}
      </TtHead>

      {!ready ? (
        <Card icon="calendar" title="No timetable yet">
          <Body>
            <Note tone="info">
              {section?.className
                ? `A timetable has not been set up for ${section.className} · ${section.sectionName} yet. Your school will publish one — nothing is missing on your side.`
                : 'You are not in a section yet, so there is no timetable to show. Your school office can add you to one.'}
            </Note>
          </Body>
        </Card>
      ) : (
        <>
          <NowNext periods={periods} days={days} cellFor={cellFor} />

          <Stats cols={4}>
            <Stat icon="calendarDays" tone="indigo" value={entries.length} label="Periods a week"
              cap={`${shape.perDay} a day · ${plural(shape.days, 'day')}`} />
            <Stat icon="book" tone="violet" value={subjects.length} label="Subjects" />
            <Stat icon="clock" tone="green" value={shape.taughtLabel} label="Taught each day"
              cap={shape.dayLabel} />
            <Stat icon="sun" tone="amber" value={shape.breakLabel} label="Breaks each day" />
          </Stats>

          {payload.covers?.length > 0 && (
            <Note tone="warn">
              {plural(payload.covers.length, 'period')} this week
              {payload.covers.length === 1 ? ' is' : ' are'} being taken by a different teacher.
              They are marked <strong>Cover</strong> below.
            </Note>
          )}

          <div className="tt-split tt-split--wide">
            <Card icon="calendarDays"
              title={view === 'week' ? 'The week' : day}
              subtitle={view === 'week'
                ? 'Every period, across the days your class runs.'
                : 'Your day, in order.'}
              actions={<>
                {view === 'day' && (
                  <Field fix>
                    <select className="form-control" value={day} onChange={(e) => setDay(e.target.value)}>
                      {DAYS.filter((d) => days.includes(d)).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </Field>
                )}
                <Seg value={view} onChange={setView} options={[['week', 'Week'], ['day', 'Day']]} />
              </>}>
              <Body>
                {view === 'week'
                  ? <WeekGrid periods={periods} days={days} cellFor={cellFor} highlightDay />
                  : <DayList periods={periods} day={day} cellFor={cellFor} showNow />}
              </Body>
            </Card>

            <div className="tt-rail">
              <Panel icon="calendarDays" title="Today"
                right={<Chip tone="indigo">{DAY_SHORT[todayName()]}</Chip>}>
                {days.includes(todayName())
                  ? <DayList periods={periods} day={todayName()} cellFor={cellFor} showNow />
                  : <Note tone="quiet">{todayName()} is not a school day.</Note>}
              </Panel>

              <Panel icon="book" title="Subjects and teachers">
                <SubjectList rows={subjects} total={entries.length}
                  emptyText="No subjects are timetabled yet." />
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
