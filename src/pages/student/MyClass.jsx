/**
 * My Class — where a student sits, who teaches them, and who they sit with.
 *
 * The shapes come from classParts.jsx, which the parent's Class Info page uses
 * too: a parent looking at a child should see what the child sees.
 */
import React, { useMemo, useRef } from 'react';
import useFetch from '../../hooks/useFetch';
import { useModules } from '../../contexts/ModulesContext';
import { getMyClass } from '../../api/student.api';
import { PageHeader, Spinner } from '../../components/ui/index';
import {
  ClassHero, Figure, Panel, ViewAll, InfoRow, PersonLine, QuickLinks, MateChip, Updates,
  NoSection, classTitle,
} from './classParts';

export default function StudentMyClass() {
  const { data, loading } = useFetch(getMyClass);
  const { isEnabled } = useModules();
  const updatesRef = useRef(null);

  const {
    section, pendingClass, classmates = [], subjectTeachers = [], subjects = [],
    announcements = [], monitors = [], profile,
  } = data || {};

  const teachers = useMemo(
    () => [
      { ...(section?.classTeacher || {}), badge: 'Class Teacher', tone: 'indigo' },
      { ...(section?.substituteTeacher || {}), badge: 'Vice Class Teacher', tone: 'blue' },
    ].filter((t) => t.name),
    [section],
  );

  if (loading) return <div className="loading-page"><Spinner /></div>;

  if (!section) {
    return (
      <div className="page">
        <PageHeader title="My Class" subtitle="Current class and section info" />
        <NoSection pendingClass={pendingClass} />
      </div>
    );
  }

  const strength = section.currentCount ?? classmates.length;
  const capacity = section.maxStudents;
  const year     = section.academicYear?.yearName || '';

  return (
    <div className="page sclspg">
      <ClassHero
        kicker="Welcome to your class"
        title={classTitle(section, pendingClass)}
        subtitle={year ? `Academic Year ${year}` : null}
        tagline="Learn together, grow together, make it a great year!"
        quote="A better tomorrow starts with what you learn today." />

      <div className="scls-figs">
        <Figure icon="users" tone="violet" label="Class Strength"
          value={capacity ? `${strength} / ${capacity}` : strength}
          fill={capacity ? strength / capacity : null}
          caption={`${strength} student${strength === 1 ? '' : 's'} in your class`} />
        <Figure icon="user" tone="green" label="Classmates"
          value={classmates.length} caption="Friends to learn with" />
        <Figure icon="teacher" tone="pink" label="Class Teachers"
          value={teachers.length} caption="Guiding your journey" />
        <Figure icon="calendarDays" tone="blue" label="Academic Year"
          value={year || '—'} caption="Current academic year" />
      </div>

      <div className="scls-row3">
        <Panel icon="bookOpen" tone="indigo" title="Class Information">
          <InfoRow label="Class" value={section.class?.className} />
          <InfoRow label="Section" value={section.sectionName} />
          {profile?.rollNumber ? <InfoRow label="My roll number" value={profile.rollNumber} /> : null}
          <InfoRow label="Class strength" value={capacity ? `${strength} / ${capacity}` : strength} />
          <InfoRow label="Classmates" value={classmates.length} />
        </Panel>

        <Panel icon="user" tone="amber" title="Class Teachers">
          {teachers.length
            ? teachers.map((t) => (
              <PersonLine key={t.badge} name={t.name} email={t.email} badge={t.badge} tone={t.tone} />
            ))
            : <p className="scls-none">No class teacher has been assigned yet.</p>}
        </Panel>

        <Panel icon="compass" tone="blue" title="Quick Links">
          <QuickLinks
            links={[
              { to: isEnabled('timetable')    && '/student/timetable',  icon: 'clock',       label: 'Timetable',  tone: 'blue' },
              { to: isEnabled('attendance')   && '/student/attendance', icon: 'checkSquare', label: 'Attendance', tone: 'green' },
              { to: isEnabled('aptitudeExam') && '/student/exams',      icon: 'fileCheck',   label: 'Exams',      tone: 'pink' },
              { to: isEnabled('result')       && '/student/results',    icon: 'chart',       label: 'Results',    tone: 'amber' },
            ]}
            announcements={() => updatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
        </Panel>
      </div>

      <div className="scls-row2">
        <Panel icon="users" tone="violet" title="My Classmates" count={classmates.length}>
          {classmates.length ? (
            <div className="scls-mates">
              {classmates.map((c) => <MateChip key={c._id} mate={c} meLabel="You" />)}
            </div>
          ) : <p className="scls-none">You are the only student in this section so far.</p>}
        </Panel>

        <div ref={updatesRef}>
          <Panel icon="megaphone" tone="indigo" title="Class Updates"
            action={announcements.length > 3 ? <ViewAll to="/student/notifications" /> : null}>
            <Updates announcements={announcements} />
          </Panel>
        </div>
      </div>

      {(subjectTeachers.length > 0 || subjects.length > 0 || monitors.length > 0) && (
        <div className="scls-row3">
          {subjectTeachers.length > 0 && (
            <Panel icon="book" tone="green" title="Subject Teachers">
              {subjectTeachers.map((s, i) => (
                <InfoRow key={`${s.subject}-${i}`} label={s.subject} value={s.teacher} />
              ))}
            </Panel>
          )}
          {subjects.length > 0 && (
            <Panel icon="layers" tone="blue" title="Subjects" count={subjects.length}>
              <div className="scls-tags">
                {subjects.map((s) => <span key={s._id} className="scls-tag">{s.name}</span>)}
              </div>
            </Panel>
          )}
          {monitors.length > 0 && (
            <Panel icon="star" tone="amber" title="Class Monitors" count={monitors.length}>
              <div className="scls-mates">
                {monitors.map((m) => <MateChip key={m._id} mate={{ _id: m._id, name: m.name }} />)}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
