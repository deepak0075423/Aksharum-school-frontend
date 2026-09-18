/**
 * Parent → Timetable.
 *
 * One child's week at a time. A parent with two children at the school has two
 * different timetables, and a screen that quietly answers for the first of them
 * is worse than no screen — it is confidently wrong on alternate days. So the
 * child switch is a row of cards at the top, the chosen child rides in `?child=`
 * so a refresh or a shared link keeps it, and the server always names the child
 * it answered for.
 *
 * What a parent actually wants from a timetable: what their child is doing now,
 * what they need packed for tomorrow, and whether a different teacher is taking
 * a lesson this week.
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getTimetable, downloadTimetable } from '../../api/parent.api';
import { Button } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  TtHead, Card, Body, Seg, Stats, Stat, Panel, Note, Chip, Loading, Field, Avatar,
  plural, toneFor,
} from '../timetable/admin/ttUI';
import {
  WeekGrid, DayList, NowNext, SubjectList, CoverList, DAYS, DAY_SHORT,
  todayName, weekShape, coverIndex, isTeachingPeriod,
} from '../timetable/view/viewParts';

function blobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ParentTimetable() {
  // The child rides in the URL, not in component state alone: a parent who
  // refreshes, or sends the link to the other parent, keeps the child they were
  // looking at instead of silently reverting to the eldest.
  const [params, setParams] = useSearchParams();
  const childId = params.get('child') || '';

  const { data, loading } = useFetch(() => getTimetable(childId ? { child: childId } : {}), [childId]);
  const [view, setView] = useState('week');
  const [day, setDay]   = useState(() => todayName());
  const [busy, setBusy] = useState(false);

  const payload  = data || {};
  const children = payload.children || [];
  const child    = payload.child;
  const tt       = payload.timetable;
  const section  = payload.section;
  const entries  = useMemo(() => payload.entries || [], [payload.entries]);
  const days     = payload.days?.length ? payload.days : DAYS.slice(0, 5);
  const periods  = tt?.periodsStructure || [];
  const covers   = useMemo(() => coverIndex(payload.covers), [payload.covers]);

  // The server picks a child when the URL names none. Put its answer back in
  // the URL so every later read asks for the same one.
  useEffect(() => {
    if (child && !childId) setParams({ child: String(child._id) }, { replace: true });
  }, [child, childId, setParams]);

  const pickChild = useCallback((id) => setParams({ child: String(id) }), [setParams]);

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
      extras: (e.additionalSubjects || []).filter((a) => a.subject).map((a) => (
        `${a.subject?.subjectName || a.subject?.name}${a.teacher?.name ? ` · ${a.teacher.name}` : ''}`
      )),
      // The line under the title is the teacher, so a cover replaces it.
      cover: (() => {
        const c = covers.get(`${d}#${periodNumber}`);
        return c ? { from: c.originalTeacher || e.teacher?.name || '', to: c.substituteTeacher } : null;
      })(),
    };
  };

  const shape = weekShape(periods, days, entries.length);

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
      const res = await downloadTimetable(child ? { child: String(child._id) } : {});
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/pdf' });
      blobDownload(blob, `${String(child?.name || 'child').replace(/\s+/g, '-').toLowerCase()}-timetable.pdf`);
    } catch (e) { toast.error(e?.data?.message || 'That download failed'); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="page tt-page"><Loading label="Loading the week…" /></div>;

  if (!children.length) {
    return (
      <div className="page tt-page">
        <TtHead icon="calendar" title="Timetable" subtitle="Your child’s weekly class schedule" />
        <Card icon="users" title="No child linked yet">
          <Body>
            <Note tone="info">
              No student is linked to this account, so there is no timetable to show. The school
              office can link your child to it.
            </Note>
          </Body>
        </Card>
      </div>
    );
  }

  const ready = !!tt && periods.some(isTeachingPeriod);
  const firstName = String(child?.name || '').split(' ')[0] || 'your child';

  return (
    <div className="page tt-page">
      <TtHead icon="calendar" title="Timetable"
        subtitle={child
          ? `${child.name}${section?.className ? ` · ${section.className} · Section ${section.sectionName}` : ''}${payload.activeYear ? ` · ${payload.activeYear.yearName}` : ''}`
          : 'Your child’s weekly class schedule'}>
        {ready && (
          <Button variant="secondary" onClick={download} loading={busy}>
            <Icon name="download" size={16} /> Download PDF
          </Button>
        )}
      </TtHead>

      {/* A class is one per child — there is no "both children" week to show,
          so this is a switch and never a filter. */}
      {children.length > 1 && (
        <Card>
          <Body className="tt-card__body" >
            <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 10, paddingTop: 18 }}>
              Whose timetable
            </span>
            <div className="tt-kids">
              {children.map((k) => (
                <button key={k._id} type="button"
                  className={`tt-kid${String(k._id) === String(child?._id) ? ' is-on' : ''}`}
                  onClick={() => pickChild(k._id)}>
                  <Avatar name={k.name} lg />
                  <span style={{ minWidth: 0 }}>
                    <span className="tt-kid__name">{k.name}</span>
                    <span className="tt-kid__class">
                      {k.className ? `${k.className}${k.sectionName ? ` · ${k.sectionName}` : ''}` : 'No class yet'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Body>
        </Card>
      )}

      {!ready ? (
        <Card icon="calendar" title="No timetable yet">
          <Body>
            <Note tone="info">
              {section?.className
                ? `A timetable has not been set up for ${section.className} · Section ${section.sectionName} yet. The school will publish one.`
                : `${child?.name || 'This child'} is not in a section yet, so there is no timetable to show.`}
            </Note>
          </Body>
        </Card>
      ) : (
        <>
          <NowNext periods={periods} days={days} cellFor={cellFor} label={firstName} />

          <Stats cols={4}>
            <Stat icon="calendarDays" tone="indigo" value={entries.length} label="Periods a week"
              cap={`${shape.perDay} a day · ${plural(shape.days, 'day')}`} />
            <Stat icon="book" tone="violet" value={subjects.length} label="Subjects" />
            <Stat icon="clock" tone="green" value={shape.dayLabel} label="School day"
              cap={`${shape.taughtLabel} taught`} />
            <Stat icon="repeat" tone={payload.covers?.length ? 'amber' : 'slate'}
              value={payload.covers?.length || 0} label="Covered periods" cap="this week" />
          </Stats>

          <div className="tt-split tt-split--wide">
            <Card icon="calendarDays"
              title={view === 'week' ? `${firstName}’s week` : day}
              subtitle={view === 'week'
                ? 'Every period, across the days the class runs.'
                : `What ${firstName} has on, in order.`}
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

              {payload.covers?.length > 0 && (
                <Panel icon="repeat" title="Different teacher this week">
                  <CoverList rows={payload.covers.map((c) => ({ ...c, sectionLabel: section?.className || '' }))}
                    mode="class"
                    emptyText="Nobody is covering a lesson this week." />
                </Panel>
              )}

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
