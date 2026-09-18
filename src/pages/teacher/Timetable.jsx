/**
 * Teacher → Timetable.
 *
 * Three views of the same week, in the order a teacher needs them:
 *   My Schedule  every period I take, across every class — the duty roster
 *   My Class     the full week of a section I am class or vice class teacher of
 *   Colleague    somebody else's week, for planning around them
 *
 * Cover runs through all of it. A teacher's real Tuesday is their timetable
 * plus whatever they have been asked to cover minus whatever somebody is
 * covering for them, and a screen that shows only the first of those three is
 * the reason people end up in the wrong room.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getTimetable, downloadTimetable, getClassTimetable } from '../../api/teacher.api';
import { Button } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  TtHead, TtTabs, Card, Body, Seg, Stats, Stat, Panel, Note, Chip, Loading, Field,
  Person, plural, toneFor, fmtDay,
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

export default function TeacherTimetable() {
  // My Section links here with the section it wants the grid for, so the page
  // opens on that class rather than on whichever one the server would pick.
  const [params] = useSearchParams();
  const wantedSection = params.get('section');

  const [tab, setTab]         = useState(wantedSection ? 'class' : 'mine');
  const [view, setView]       = useState('week');
  const [day, setDay]         = useState(() => todayName());
  const [lookAt, setLookAt]   = useState('');          // a colleague's id
  const [yearId, setYearId]   = useState('');
  const [query, setQuery]     = useState({});
  const [sectionId, setSectionId] = useState(wantedSection || '');
  const [busy, setBusy]       = useState(false);

  const { data: mineRaw,  loading: l1 } = useFetch(() => getTimetable(query), [query]);
  const { data: classRaw, loading: l2 } = useFetch(
    () => getClassTimetable(sectionId ? { section: sectionId } : undefined), [sectionId]);

  const mine       = mineRaw || {};
  const entries    = useMemo(() => mine.entries || [], [mine.entries]);
  const periods    = mine.periodsStructure || [];
  const days       = mine.days?.length ? mine.days : DAYS.slice(0, 5);
  const teacher    = mine.teacher;
  const years      = mine.years || [];
  const colleagues = mine.allTeachers || [];
  const duties     = mine.coverDuties || [];
  const handed     = mine.handedOver || [];

  const klass        = classRaw || {};
  const mySection    = klass.section;
  const mySections   = klass.sections || [];
  const classTt      = klass.timetable;
  const classEntries = useMemo(() => klass.entries || [], [klass.entries]);
  const classDays    = klass.days?.length ? klass.days : DAYS.slice(0, 5);

  useEffect(() => {
    if (mine.selectedYearId && !yearId) setYearId(String(mine.selectedYearId));
  }, [mine.selectedYearId]); // eslint-disable-line react-hooks/exhaustive-deps

  const viewingSelf = !lookAt;

  /* ── My own week ───────────────────────────────────────────────────────── */
  const bySlot = useMemo(() => {
    const map = new Map();
    for (const e of entries) map.set(`${e.dayOfWeek}#${e.periodNumber}`, e);
    return map;
  }, [entries]);

  // Duties land on the grid as extra periods. Keyed by weekday so they sit in
  // the same week the timetable is drawn in.
  const dutyIndex = useMemo(() => coverIndex(duties), [duties]);
  const handedIndex = useMemo(() => coverIndex(handed), [handed]);

  const cellForMine = (d, periodNumber) => {
    const key = `${d}#${periodNumber}`;
    const e = bySlot.get(key);
    const duty = dutyIndex.get(key);
    const gone = handedIndex.get(key);

    if (!e && duty) {
      // A period that is not normally theirs at all: the cover IS the lesson.
      // The class stays on its own line — a cover that deleted it left a
      // lesson with no room attached to it.
      return {
        title: duty.subject || 'Cover',
        tone: 'amber',
        sub: duty.sectionLabel,
        keepSub: true,
        cover: { from: duty.originalTeacher, to: 'You' },
      };
    }
    if (!e) return null;

    const name = e.subject?.subjectName || e.subject?.name || 'Subject';
    return {
      title: name,
      tone: toneFor(e.subject?._id || name),
      sub: [e.className, e.sectionName].filter(Boolean).join(' – ') || 'Class',
      keepSub: true,
      extras: [],
      // Their own period, taken by somebody else this week.
      cover: gone ? { from: 'You', to: gone.substituteTeacher } : null,
    };
  };

  /* ── A class's full week ───────────────────────────────────────────────── */
  const byClassSlot = useMemo(() => {
    const map = new Map();
    for (const e of classEntries) map.set(`${e.dayOfWeek}#${e.periodNumber}`, e);
    return map;
  }, [classEntries]);

  const cellForClass = (d, periodNumber) => {
    const e = byClassSlot.get(`${d}#${periodNumber}`);
    if (!e) return null;
    const name = e.subject?.subjectName || e.subject?.name || 'Subject';
    return {
      title: name,
      tone: toneFor(e.subject?._id || name),
      sub: e.teacher?.name || 'No teacher assigned',
      extras: (e.additionalSubjects || []).filter((a) => a.subject).map((a) => (
        `${a.subject?.subjectName || a.subject?.name}${a.teacher?.name ? ` · ${a.teacher.name}` : ''}`
      )),
    };
  };

  const shape = weekShape(periods, days, entries.length);

  const subjects = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      const id = e.subject?._id || e.subject?.subjectName || 'x';
      const name = e.subject?.subjectName || e.subject?.name || 'Subject';
      if (!map.has(id)) map.set(id, { key: id, name, sub: '', periods: 0, sections: new Set() });
      const row = map.get(id);
      row.periods += 1;
      const label = [e.className, e.sectionName].filter(Boolean).join(' – ');
      if (label) row.sections.add(label);
    }
    return [...map.values()]
      .map((r) => ({ ...r, sub: [...r.sections].join(', ') }))
      .sort((a, b) => b.periods - a.periods);
  }, [entries]);

  const classCount = useMemo(
    () => new Set(entries.map((e) => [e.className, e.sectionName].filter(Boolean).join('–')).filter(Boolean)).size,
    [entries],
  );

  const download = async () => {
    setBusy(true);
    try {
      const res = await downloadTimetable();
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/pdf' });
      blobDownload(blob, 'my-timetable.pdf');
    } catch (e) { toast.error(e?.data?.message || 'That download failed'); }
    finally { setBusy(false); }
  };

  if (l1 || l2) return <div className="page tt-page"><Loading label="Loading your week…" /></div>;

  const TABS = [
    { key: 'mine', label: 'My Schedule', icon: 'calendarDays' },
    ...(mySection ? [{
      key: 'class',
      label: mySections.length > 1 ? 'My Classes' : 'My Class',
      icon: 'users',
      count: mySections.length > 1 ? mySections.length : undefined,
    }] : []),
    { key: 'other', label: 'Another Teacher', icon: 'search' },
  ];

  return (
    <div className="page tt-page">
      <TtHead icon="calendar" title="Timetable"
        subtitle={viewingSelf
          ? 'Every period you take, the classes you look after, and this week’s cover'
          : `Viewing ${teacher?.name || 'a colleague'}’s week`}>
        {viewingSelf && entries.length > 0 && (
          <Button variant="secondary" onClick={download} loading={busy}>
            <Icon name="download" size={16} /> Download PDF
          </Button>
        )}
      </TtHead>

      <TtTabs tabs={TABS} value={tab} onChange={setTab} />

      {/* ══ My schedule ════════════════════════════════════════════════════ */}
      {tab === 'mine' && (
        !entries.length && !duties.length ? (
          <Card icon="calendar" title="Nothing timetabled yet">
            <Body>
              <Note tone="info">
                No periods have been assigned to you for this academic year. Once the school
                publishes a timetable your week appears here.
              </Note>
            </Body>
          </Card>
        ) : (
          <>
            <NowNext periods={periods} days={days} cellFor={cellForMine} />

            <Stats cols={4}>
              <Stat icon="calendarDays" tone="indigo" value={entries.length} label="Periods a week"
                cap={`${shape.perDay} slots a day`} />
              <Stat icon="users" tone="violet" value={classCount} label="Classes you take" />
              <Stat icon="book" tone="green" value={subjects.length} label="Subjects" />
              <Stat icon="repeat" tone={duties.length ? 'amber' : 'slate'} value={duties.length}
                label="Cover duties" cap="this week" />
            </Stats>

            {duties.length > 0 && (
              <Note tone="warn">
                You are covering {plural(duties.length, 'period')} for a colleague this week. They
                are marked <strong>Cover</strong> on the grid.
              </Note>
            )}

            <div className="tt-split tt-split--wide">
              <Card icon="calendarDays"
                title={view === 'week' ? 'Your week' : day}
                subtitle={view === 'week'
                  ? 'Each period shows the class you are taking it with.'
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
                    ? <WeekGrid periods={periods} days={days} cellFor={cellForMine} highlightDay />
                    : <DayList periods={periods} day={day} cellFor={cellForMine} showNow />}
                </Body>
              </Card>

              <div className="tt-rail">
                <Panel icon="calendarDays" title="Today"
                  right={<Chip tone="indigo">{DAY_SHORT[todayName()]}</Chip>}>
                  {days.includes(todayName())
                    ? <DayList periods={periods} day={todayName()} cellFor={cellForMine} showNow />
                    : <Note tone="quiet">{todayName()} is not a working day.</Note>}
                </Panel>

                {(duties.length > 0 || handed.length > 0) && (
                  <Panel icon="repeat" title="Cover this week">
                    {duties.length > 0 && (
                      <>
                        <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                          You are covering
                        </span>
                        <CoverList rows={duties} mode="duty" emptyText="Nothing to cover." />
                      </>
                    )}
                    {handed.length > 0 && (
                      <>
                        <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                          Being covered for you
                        </span>
                        <CoverList rows={handed} mode="class" emptyText="Nothing." />
                      </>
                    )}
                  </Panel>
                )}

                <Panel icon="book" title="What you teach">
                  <SubjectList rows={subjects} total={entries.length}
                    emptyText="Nothing timetabled yet." />
                </Panel>
              </div>
            </div>
          </>
        )
      )}

      {/* ══ My class ═══════════════════════════════════════════════════════ */}
      {tab === 'class' && mySection && (
        <>
          <Card icon="users"
            title={`${mySection.className} · Section ${mySection.sectionName}`}
            subtitle={`The full week of a class you are ${mySection.role} of.`}
            actions={mySections.length > 1 && (
              <Field label="Section" fix>
                <select className="form-control" value={String(mySection._id)}
                  onChange={(e) => setSectionId(e.target.value)}>
                  {mySections.map((s) => (
                    <option key={s._id} value={s._id}>{s.className} · {s.sectionName} ({s.role})</option>
                  ))}
                </select>
              </Field>
            )}>
            {!classTt || !(classTt.periodsStructure || []).some(isTeachingPeriod) ? (
              <Body>
                <Note tone="info">
                  No timetable has been set up for {mySection.className} · Section {mySection.sectionName} yet.
                </Note>
              </Body>
            ) : (
              <Body>
                <WeekGrid periods={classTt.periodsStructure} days={classDays}
                  cellFor={cellForClass} highlightDay />
              </Body>
            )}
          </Card>
        </>
      )}

      {/* ══ Somebody else's week ═══════════════════════════════════════════ */}
      {tab === 'other' && (
        <>
          <Card icon="search" title="Another teacher’s week"
            subtitle="For planning around a colleague — what they are teaching, and when they are free.">
            <Body>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Field label="Teacher" fix>
                  <select className="form-control" value={lookAt}
                    onChange={(e) => setLookAt(e.target.value)}>
                    <option value="">My own timetable</option>
                    {colleagues.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </select>
                </Field>
                {!lookAt && years.length > 0 && (
                  <Field label="Academic Year" fix>
                    <select className="form-control" value={yearId}
                      onChange={(e) => setYearId(e.target.value)}>
                      {years.map((y) => (
                        <option key={y._id} value={y._id}>
                          {y.yearName}{y.status === 'active' ? ' (Current)' : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Button onClick={() => setQuery(lookAt
                  ? { teacherId: lookAt }
                  : (yearId ? { yearId } : {}))}>
                  <Icon name="eye" size={15} /> View
                </Button>
                {!viewingSelf && (
                  <Button variant="secondary" onClick={() => { setLookAt(''); setQuery({}); }}>
                    Back to mine
                  </Button>
                )}
              </div>
            </Body>
          </Card>

          <Card icon="calendarDays"
            title={viewingSelf ? 'Your week' : `${teacher?.name || 'Their'} week`}
            subtitle={viewingSelf
              ? 'Pick a colleague above to see theirs instead.'
              : 'Each period shows the class they are taking it with.'}>
            <Body>
              {!entries.length
                ? <Note tone="quiet">No periods are assigned for this selection.</Note>
                : <WeekGrid periods={periods} days={days} cellFor={cellForMine} highlightDay />}
            </Body>
          </Card>
        </>
      )}
    </div>
  );
}
