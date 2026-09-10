/**
 * Class Info — a parent's view of a child's class.
 *
 * A parent can have more than one child and their classes genuinely differ, so
 * this page is told per child: a switch across the top picks whose class is on
 * screen and everything below belongs to that one child. There is deliberately
 * no "both children" view — a class is one per child, and merging two would
 * produce a roster and a class teacher that belong to nobody.
 *
 * The endpoint used to read the *first* child only, so a second child's class
 * was invisible and nothing said a second child existed.
 */
import React, { useMemo, useRef, useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { useModules } from '../../contexts/ModulesContext';
import { getChildClass } from '../../api/parent.api';
import { PageHeader, Spinner, Alert } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  ClassHero, Figure, Panel, ViewAll, InfoRow, PersonLine, QuickLinks, MateChip, Updates,
  NoSection, classTitle, initials,
} from '../student/classParts';

const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || 'your child';

export default function ParentChildClass() {
  const { data, loading } = useFetch(getChildClass);
  const { isEnabled } = useModules();
  const [who, setWho] = useState('');
  const updatesRef = useRef(null);

  const children = useMemo(() => data?.children || [], [data]);
  const child    = useMemo(
    () => children.find((c) => c._id === who) || children[0] || null,
    [children, who],
  );

  const teachers = useMemo(
    () => [
      { ...(child?.section?.classTeacher || {}), badge: 'Class Teacher', tone: 'indigo' },
      { ...(child?.section?.substituteTeacher || {}), badge: 'Vice Class Teacher', tone: 'blue' },
    ].filter((t) => t.name),
    [child],
  );

  if (loading) return <div className="loading-page"><Spinner /></div>;

  if (!children.length) {
    return (
      <div className="page">
        <PageHeader title="Class Info" subtitle="Your child's class, teachers and classmates" />
        <Alert variant="info">
          No child is linked to this account yet, so there is no class to show.
          Ask the school office to link your children.
        </Alert>
      </div>
    );
  }

  const section  = child.section;
  const mates    = child.classmates || [];
  const strength = section?.currentCount ?? mates.length;
  const capacity = section?.maxStudents;
  const year     = section?.academicYear?.yearName || '';
  const name     = firstName(child.name);

  /* One child needs no switch; two or more do, because their classes differ. */
  const Switch = children.length > 1 ? (
    <nav className="scls-kids" role="tablist" aria-label="Whose class">
      {children.map((c) => (
        <button key={c._id} type="button" role="tab" aria-selected={c._id === child._id}
          className={c._id === child._id ? 'is-on' : ''} onClick={() => setWho(c._id)}>
          <span className="scls-av scls-t--indigo">{initials(c.name)}</span>
          <span className="scls-kids__body">
            <strong>{c.name}</strong>
            <em>{c.className ? `${c.className}${c.sectionName ? ` — Section ${c.sectionName}` : ''}` : 'No class yet'}</em>
          </span>
        </button>
      ))}
    </nav>
  ) : (
    <p className="scls-onekid">
      <Icon name="user" size={14} />
      {child.name}{child.className ? ` · ${child.className}` : ''}
      {child.sectionName ? ` — Section ${child.sectionName}` : ''}
    </p>
  );

  if (!section) {
    return (
      <div className="page sclspg">
        <PageHeader title="Class Info" subtitle="Your child's class, teachers and classmates" />
        {Switch}
        <NoSection pendingClass={child.pendingClass} subject={child.name} possessive="Their" />
      </div>
    );
  }

  return (
    <div className="page sclspg">
      {Switch}

      <ClassHero
        kicker={`${child.name}${/s$/i.test(child.name) ? "'" : "'s"} class`}
        title={classTitle(section, child.pendingClass)}
        subtitle={year ? `Academic Year ${year}` : null}
        tagline={`Everything about ${name}${/s$/i.test(name) ? "'" : "'s"} class, in one place.`}
        quote="A better tomorrow starts with what you learn today." />

      <div className="scls-figs">
        <Figure icon="users" tone="violet" label="Class Strength"
          value={capacity ? `${strength} / ${capacity}` : strength}
          fill={capacity ? strength / capacity : null}
          caption={`${strength} student${strength === 1 ? '' : 's'} in this class`} />
        <Figure icon="user" tone="green" label="Classmates"
          value={mates.length} caption={`Friends ${name} learns with`} />
        <Figure icon="teacher" tone="pink" label="Class Teachers"
          value={teachers.length} caption="Guiding their journey" />
        <Figure icon="calendarDays" tone="blue" label="Academic Year"
          value={year || '—'} caption="Current academic year" />
      </div>

      <div className="scls-row3">
        <Panel icon="bookOpen" tone="indigo" title="Class Information">
          <InfoRow label="Student" value={child.name} />
          <InfoRow label="Class" value={section.class?.className} />
          <InfoRow label="Section" value={section.sectionName} />
          <InfoRow label="Roll number" value={child.rollNumber} />
          <InfoRow label="Admission number" value={child.admissionNo} />
          <InfoRow label="Class strength" value={capacity ? `${strength} / ${capacity}` : strength} />
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
              { to: isEnabled('attendance')   && '/parent/child-attendance', icon: 'checkSquare', label: 'Attendance', tone: 'green' },
              { to: isEnabled('aptitudeExam') && '/parent/exams',            icon: 'fileCheck',   label: 'Exams',      tone: 'pink' },
              { to: isEnabled('result')       && '/parent/results',          icon: 'chart',       label: 'Results',    tone: 'amber' },
              { to: isEnabled('fees')         && '/parent/child-fees',       icon: 'wallet',      label: 'Fees',       tone: 'blue' },
            ]}
            announcements={() => updatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
        </Panel>
      </div>

      <div className="scls-row2">
        <Panel icon="users" tone="violet" title="Classmates" count={mates.length}>
          {mates.length ? (
            <div className="scls-mates">
              {mates.map((c) => <MateChip key={c._id} mate={c} meLabel="Your child" />)}
            </div>
          ) : <p className="scls-none">{child.name} is the only student in this section so far.</p>}
        </Panel>

        <div ref={updatesRef}>
          <Panel icon="megaphone" tone="indigo" title="Class Updates"
            action={(child.announcements || []).length > 3 ? <ViewAll to="/parent/notifications" /> : null}>
            <Updates announcements={child.announcements || []} />
          </Panel>
        </div>
      </div>

      {((child.subjectTeachers || []).length > 0 || (child.subjects || []).length > 0
        || (child.monitors || []).length > 0) && (
        <div className="scls-row3">
          {(child.subjectTeachers || []).length > 0 && (
            <Panel icon="book" tone="green" title="Subject Teachers">
              {child.subjectTeachers.map((s, i) => (
                <InfoRow key={`${s.subject}-${i}`} label={s.subject} value={s.teacher} />
              ))}
            </Panel>
          )}
          {(child.subjects || []).length > 0 && (
            <Panel icon="layers" tone="blue" title="Subjects" count={child.subjects.length}>
              <div className="scls-tags">
                {child.subjects.map((s) => <span key={s._id} className="scls-tag">{s.name}</span>)}
              </div>
            </Panel>
          )}
          {(child.monitors || []).length > 0 && (
            <Panel icon="star" tone="amber" title="Class Monitors" count={child.monitors.length}>
              <div className="scls-mates">
                {child.monitors.map((m) => <MateChip key={m._id} mate={{ _id: m._id, name: m.name }} />)}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
