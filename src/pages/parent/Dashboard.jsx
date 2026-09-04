import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import useFetch from '../../hooks/useFetch';
import { getDashboard, getModules, getHolidays, getSchoolConfig } from '../../api/parent.api';
import { getInbox } from '../../api/notifications.api';
import { Spinner, MiniCalendar } from '../../components/ui/index';
import Icon, { SchoolScene } from '../../components/ui/icons';
import { Panel, PanelLink, Note } from '../../components/dashboard/parts';
import { useQuickAccess, CustomizeButton, QuickAccessPicker } from '../../components/dashboard/quickAccess';
import {
  Highlight, QuickTile, PerformanceOverview, SubjectMarks, ResultHighlight, EventRow,
} from '../../components/dashboard/studentParts';
import { ChildPicker, AttendanceOverview, AnnouncementBanner } from './dashboardParts';

/**
 * Every shortcut a parent can keep on Quick Access, filtered by the module map
 * so the picker only offers what this school actually runs.
 */
const ALL_QUICK_LINKS = [
  { key: 'class',      to: '/parent/child-class',      icon: 'building',    tone: 'indigo', label: 'Class Info',   sub: 'View details' },
  { key: 'attendance', to: '/parent/child-attendance', icon: 'checkSquare', tone: 'green',  label: 'Attendance',   sub: 'View attendance', module: 'attendance' },
  { key: 'exams',      to: '/parent/exams',            icon: 'fileCheck',   tone: 'purple', label: 'Exams',        sub: 'View schedule',   module: 'aptitudeExam' },
  { key: 'results',    to: '/parent/results',          icon: 'chart',       tone: 'blue',   label: 'Results',      sub: 'View results',    module: 'result' },
  { key: 'fees',       to: '/parent/child-fees',       icon: 'wallet',      tone: 'amber',  label: 'Fees',         sub: 'Payment history', module: 'fees' },
  { key: 'documents',  to: '/parent/documents',        icon: 'folder',      tone: 'pink',   label: 'Documents',    sub: 'View documents',  module: 'document' },
  { key: 'holidays',   to: '/parent/holidays',         icon: 'party',       tone: 'teal',   label: 'Holidays',     sub: 'Holiday calendar', module: 'holiday' },
  { key: 'transport',  to: '/parent/transport/track',  icon: 'bus',         tone: 'amber',  label: 'Transport',    sub: 'Transport details', module: 'transport' },
  { key: 'hostel',     to: '/parent/hostel',           icon: 'hotel',       tone: 'orange', label: 'Hostel',       sub: 'Hostel info',     module: 'hostel' },
  { key: 'notices',    to: '/parent/notifications',    icon: 'megaphone',   tone: 'blue',   label: 'Notice Board', sub: 'School notices',  module: 'notification' },
  { key: 'chat',       to: '/chat',                    icon: 'chat',        tone: 'indigo', label: 'Chat',         sub: 'Message teachers', module: 'chat' },
];

const EVENT_TONES = ['indigo', 'green', 'purple', 'amber'];

const fmtMoney = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** A UTC-midnight date from the server, read as the local calendar day it means. */
const serverDay = (iso) => {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

export default function ParentDashboard() {
  const { user }                               = useAuth();
  const [childId, setChildId]                  = useState('');
  // Switching child refetches: the detail block is computed per child server-side.
  const { data, loading: dashLoading }         = useFetch(
    () => getDashboard(childId ? { childId } : undefined), [childId]);
  const { data: modules, loading: modLoading } = useFetch(getModules);
  const { data: schoolConfig }                 = useFetch(getSchoolConfig);
  const [holidays, setHolidays]                = useState([]);
  const [notices,  setNotices]                 = useState([]);

  useEffect(() => {
    if (!modules) return;
    if (!modules.holiday) { setHolidays([]); return; }
    getHolidays().then(r => setHolidays(r.data ?? r ?? [])).catch(() => {});
  }, [modules]);

  useEffect(() => {
    if (!modules?.notification) { setNotices([]); return; }
    getInbox().then(r => setNotices((r.data ?? r ?? []).slice(0, 4))).catch(() => {});
  }, [modules]);

  const upcoming = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return (holidays || [])
      .filter(h => h?.startDate)
      .map(h => ({ ...h, _start: serverDay(h.startDate), _end: serverDay(h.endDate || h.startDate) }))
      .filter(h => h._end >= midnight)
      .sort((a, b) => a._start - b._start)
      .slice(0, 4);
  }, [holidays]);

  const available = useMemo(
    () => ALL_QUICK_LINKS.filter(l => !l.module || modules?.[l.module]),
    [modules],
  );
  const quick = useQuickAccess({
    scope: 'parent',
    userId: user?._id || user?.id,
    available,
  });

  if (dashLoading || modLoading) return <div className="loading-page"><Spinner /></div>;

  const saturdayConfig = schoolConfig
    ? { working: schoolConfig.saturdayWorking, mode: schoolConfig.saturdayMode, halfDay: schoolConfig.saturdayHalfDay }
    : modules?.saturdayConfig;

  const children = data?.children || [];
  /**
   * `child` is the detail block this endpoint builds for the selected student.
   * A backend that predates it answers with the summary rows only — fall back
   * to the chosen row so the page still shows who the child is, their class,
   * attendance and fees, rather than rendering an empty column.
   */
  const child = data?.child
    || children.find(c => String(c._id) === String(childId))
    || children[0]
    || null;
  const selected = child?._id || '';

  const firstName  = user?.name?.split(' ')[0] || 'there';
  const childName  = child?.name?.split(' ')[0] || 'your child';
  // The detail block carries the full tally; the summary row carries only the
  // percentage. Either is enough to lead the card with.
  const attendance = child?.attendance
    || (child?.attendancePercentage != null ? { percentage: child.attendancePercentage } : null);
  const attPrev    = child?.attendancePrev;
  const exams      = child?.upcomingExams || [];
  const perf       = child?.performance;
  const feeBalance = child?.feeBalance ?? 0;

  const attDelta = (attendance?.percentage != null && attPrev?.percentage != null)
    ? attendance.percentage - attPrev.percentage
    : null;

  const classLine = child
    ? [child.className, child.sectionName].filter(Boolean).join(' — ')
    : '';

  return (
    <div className="page dash dash--student dash--parent">
      <div className="dashboard-layout">
        {/* ── Main column ──────────────────────────────────────────────── */}
        <div className="dash__main">

          {/* Greeting */}
          <section className="hero shero">
            <div className="shero__text">
              <h1>{greeting()}, {firstName}! <span className="hero__wave">👋</span></h1>
              <p>
                {child
                  ? <>Here&rsquo;s what&rsquo;s happening with {child.name} today.</>
                  : <>Here&rsquo;s what&rsquo;s happening today.</>}
              </p>
              {child && (classLine || child.rollNumber) && (
                <div className="shero__meta">
                  {classLine && (
                    <span className="shero__chip"><Icon name="building" size={14} />{classLine}</span>
                  )}
                  {child.rollNumber && (
                    <span className="shero__chip"><Icon name="badge" size={14} />Roll {child.rollNumber}</span>
                  )}
                </div>
              )}
            </div>
            <SchoolScene className="shero__art" />
          </section>

          {/* Which child, when there is more than one */}
          <ChildPicker children={children} value={selected} onChange={setChildId} />

          {children.length === 0 && (
            <Panel title="No child linked">
              <Note icon="alert">
                No student is linked to this account yet — your school office can connect one.
              </Note>
            </Panel>
          )}

          {child && (
            <>
              {/* The three figures that matter today */}
              <div className="shl-grid">
                {modules?.attendance && (
                  <Highlight
                    icon="checkSquare" tone="indigo"
                    label="Attendance (This Month)"
                    value={attendance?.percentage != null ? `${attendance.percentage}%` : '—'}
                    valueTone={attendance?.percentage == null ? null
                      : attendance.percentage >= 75 ? 'good' : attendance.percentage >= 50 ? 'warn' : 'bad'}
                    sub={attendance?.total != null
                      ? `${attendance.present} of ${attendance.total} days attended`
                      : attendance
                        ? 'Recorded this month'
                        : 'Nothing marked this month yet'}
                    meter={attendance?.percentage ?? null}
                    delta={attDelta}
                    to="/parent/child-attendance" linkLabel="View attendance"
                  />
                )}

                {modules?.aptitudeExam && (
                  <Highlight
                    icon="fileCheck" tone="purple"
                    label="Upcoming Exams"
                    value={exams.length}
                    sub={exams.length ? exams.map(e => e.title).join(', ') : 'Nothing scheduled right now'}
                    to="/parent/exams" linkLabel="View exams"
                  />
                )}

                {modules?.fees && (
                  <Highlight
                    icon="wallet" tone={feeBalance > 0 ? 'amber' : 'green'}
                    label="Fees Due"
                    value={feeBalance > 0 ? fmtMoney(feeBalance) : '✓ Clear'}
                    valueTone={feeBalance > 0 ? 'bad' : 'good'}
                    sub={feeBalance > 0 ? 'Payable now' : 'Nothing outstanding'}
                    to="/parent/child-fees" linkLabel={feeBalance > 0 ? 'Pay now' : 'View receipt'}
                  />
                )}
              </div>

              {/* Quick access */}
              {available.length > 0 && (
                <Panel
                  title="Quick Access"
                  bodyClass="sqt-grid"
                  action={<CustomizeButton onClick={quick.open} />}
                >
                  {quick.tiles.map(l => (
                    <QuickTile key={l.key} to={l.to} icon={l.icon} tone={l.tone}
                      label={l.label} sub={l.sub} />
                  ))}
                </Panel>
              )}

              {/* Attendance */}
              {modules?.attendance && (
                <AttendanceOverview
                  weeks={child.attendanceWeeks || []}
                  month={attendance}
                  to="/parent/child-attendance"
                />
              )}

              {/* Marks */}
              {modules?.result && (
                <div className="dash__split dash__split--marks">
                  <div className="smarks">
                    <PerformanceOverview trend={perf?.trend || []} to="/parent/results" />
                    {perf?.latest && (
                      <ResultHighlight name={childName} latest={perf.latest} to="/parent/results" />
                    )}
                  </div>

                  <SubjectMarks
                    subjects={perf?.subjects || []}
                    examTitle={perf?.latest?.title}
                    to="/parent/results"
                  />
                </div>
              )}

              {/* The latest notice, given the width it deserves */}
              {modules?.notification && notices.length > 0 && (
                <AnnouncementBanner notice={notices[0]} to="/parent/notifications" />
              )}
            </>
          )}
        </div>

        {/* ── Right rail ───────────────────────────────────────────────── */}
        <aside className="dash__rail">
          <MiniCalendar
            title="Calendar"
            holidays={holidays}
            holidayListPath={modules?.holiday ? '/parent/holidays' : ''}
            saturdayConfig={saturdayConfig}
          />

          {modules?.holiday && (
            <Panel title="Upcoming Events"
              action={<PanelLink to="/parent/holidays">View Calendar</PanelLink>}>
              {upcoming.length === 0
                ? <Note icon="calendar">No events scheduled ahead.</Note>
                : upcoming.map((h, i) => {
                  const multi = h._end > h._start;
                  return (
                    <EventRow
                      key={h._id || i}
                      to="/parent/holidays"
                      tone={EVENT_TONES[i % EVENT_TONES.length]}
                      day={h._start.toLocaleDateString('en-IN', { day: '2-digit' })}
                      month={h._start.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}
                      title={h.name}
                      sub={multi
                        ? `Until ${h._end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                        : h.type || 'Holiday'}
                    />
                  );
                })}
            </Panel>
          )}
        </aside>
      </div>

      <QuickAccessPicker
        state={quick}
        available={available}
        note="Choose the shortcuts you want on your dashboard. This is saved on this device."
      />

      <footer className="dash__foot">
        <span>© {new Date().getFullYear()} {user?.school?.name || 'Aksharum'}. All rights reserved.</span>
        <span className="dash__foot-brand">
          <Icon name="sparkle" size={14} /> Powered by Aksharum ERP
        </span>
      </footer>
    </div>
  );
}
