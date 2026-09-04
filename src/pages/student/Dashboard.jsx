import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useFetch from '../../hooks/useFetch';
import { getDashboard, getModules, getHolidays, getSchoolConfig, getMyAttendance } from '../../api/student.api';
import { getInbox } from '../../api/notifications.api';
import { Spinner, MiniCalendar } from '../../components/ui/index';
import Icon, { SchoolScene } from '../../components/ui/icons';
import { Panel, PanelLink, Note } from '../../components/dashboard/parts';
import { useQuickAccess, CustomizeButton, QuickAccessPicker } from '../../components/dashboard/quickAccess';
import {
  Highlight, QuickTile, PerformanceOverview, SubjectMarks, ResultHighlight, EventRow,
} from './dashboardParts';

/**
 * Every tile a student can put on Quick Access, in the order they appear before
 * anyone customises. Filtered by the module map first, so the picker only ever
 * offers what this school actually runs.
 */
const ALL_QUICK_LINKS = [
  { key: 'my-class',    to: '/student/my-class',      icon: 'building',    tone: 'indigo', label: 'My Class' },
  { key: 'timetable',   to: '/student/timetable',     icon: 'clock',       tone: 'green',  label: 'Timetable',        module: 'timetable' },
  { key: 'attendance',  to: '/student/attendance',    icon: 'checkSquare', tone: 'amber',  label: 'My Attendance',    module: 'attendance' },
  { key: 'exams',       to: '/student/exams',         icon: 'fileCheck',   tone: 'purple', label: 'Exams',            module: 'aptitudeExam' },
  { key: 'results',     to: '/student/results',       icon: 'chart',       tone: 'blue',   label: 'Results',          module: 'result' },
  { key: 'fees',        to: '/student/fees',          icon: 'wallet',      tone: 'green',  label: 'My Fees',          module: 'fees' },
  { key: 'library',     to: '/student/library',       icon: 'bookOpen',    tone: 'indigo', label: 'Library',          module: 'library' },
  { key: 'documents',   to: '/student/documents',     icon: 'folder',      tone: 'pink',   label: 'Documents',        module: 'document' },
  { key: 'chat',        to: '/chat',                  icon: 'chat',        tone: 'teal',   label: 'Chat',             module: 'chat' },
  { key: 'notices',     to: '/student/notifications', icon: 'megaphone',   tone: 'blue',   label: 'Notice Board',     module: 'notification' },
  { key: 'holidays',    to: '/student/holidays',      icon: 'party',       tone: 'teal',   label: 'Holidays',         module: 'holiday' },
  { key: 'transport',   to: '/student/transport',     icon: 'bus',         tone: 'amber',  label: 'Transport',        module: 'transport' },
  { key: 'hostel',      to: '/student/hostel',        icon: 'hotel',       tone: 'orange', label: 'Hostel',           module: 'hostel' },
  { key: 'videos',      to: '/student/videos',        icon: 'video',       tone: 'pink',   label: 'Video Learning',   module: 'videoLibrary' },
  { key: 'feedback',    to: '/student/feedback',      icon: 'star',        tone: 'purple', label: 'Teacher Feedback', module: 'feedback' },
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

function ago(iso) {
  if (!iso) return '';
  const mins = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function StudentDashboard() {
  const { user }                               = useAuth();
  const { data: dash, loading: dashLoading }   = useFetch(getDashboard);
  const { data: modules, loading: modLoading } = useFetch(getModules);
  const { data: schoolConfig }                 = useFetch(getSchoolConfig);
  const [holidays, setHolidays]                = useState([]);
  const [attDays,  setAttDays]                 = useState([]);
  const [notices,  setNotices]                 = useState([]);

  const userId = user?._id || user?.id;

  useEffect(() => {
    if (!modules) return;
    if (!modules.holiday) { setHolidays([]); return; }
    getHolidays().then(r => setHolidays(r.data ?? r ?? [])).catch(() => {});
  }, [modules]);

  useEffect(() => {
    if (!modules?.attendance) { setAttDays([]); return; }
    const n = new Date();
    getMyAttendance({ month: n.getMonth() + 1, year: n.getFullYear() })
      .then(r => setAttDays(Array.isArray(r.data ?? r) ? (r.data ?? r) : []))
      .catch(() => {});
  }, [modules]);

  useEffect(() => {
    if (!modules?.notification) { setNotices([]); return; }
    getInbox()
      .then(r => setNotices((r.data ?? r ?? []).slice(0, 4)))
      .catch(() => {});
  }, [modules]);

  // Holidays that have not finished yet, nearest first.
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
  const quick = useQuickAccess({ scope: 'student', userId, available });

  if (dashLoading || modLoading) return <div className="loading-page"><Spinner /></div>;

  const saturdayConfig = schoolConfig
    ? { working: schoolConfig.saturdayWorking, mode: schoolConfig.saturdayMode, halfDay: schoolConfig.saturdayHalfDay }
    : modules?.saturdayConfig;

  const section    = dash?.profile?.currentSection;
  const attendance = dash?.attendance;
  const attPrev    = dash?.attendancePrev;
  const feeBalance = dash?.feeBalance ?? 0;
  const exams      = dash?.upcomingExams || [];
  const perf       = dash?.performance;

  const firstName = user?.name?.split(' ')[0] || 'there';
  const classLine = section
    ? `${section.class?.className ? `${section.class.className} — ` : ''}${section.sectionName}`
    : null;

  const attDelta = (attendance?.percentage != null && attPrev?.percentage != null)
    ? attendance.percentage - attPrev.percentage
    : null;

  return (
    <div className="page dash dash--student">
      <div className="dashboard-layout">
        {/* ── Main column ──────────────────────────────────────────────── */}
        <div className="dash__main">

          {/* Greeting */}
          <section className="hero shero">
            <div className="shero__text">
              <h1>{greeting()}, {firstName}! <span className="hero__wave">👋</span></h1>
              <p>Here&rsquo;s what&rsquo;s happening today.</p>
              {(classLine || dash?.profile?.rollNumber) && (
                <div className="shero__meta">
                  {classLine && (
                    <span className="shero__chip"><Icon name="building" size={14} />{classLine}</span>
                  )}
                  {dash?.profile?.rollNumber && (
                    <span className="shero__chip"><Icon name="badge" size={14} />Roll {dash.profile.rollNumber}</span>
                  )}
                </div>
              )}
            </div>
            <SchoolScene className="shero__art" />
          </section>

          {/* The three figures that matter today */}
          <div className="shl-grid">
            {modules?.attendance && (
              <Highlight
                icon="checkSquare" tone="indigo"
                label="Attendance (This Month)"
                value={attendance?.percentage != null ? `${attendance.percentage}%` : '—'}
                valueTone={attendance?.percentage == null ? null
                  : attendance.percentage >= 75 ? 'good' : attendance.percentage >= 50 ? 'warn' : 'bad'}
                sub={attendance
                  ? `${attendance.present} of ${attendance.total} classes attended`
                  : 'Nothing marked this month yet'}
                meter={attendance?.percentage ?? null}
                delta={attDelta}
                to="/student/attendance" linkLabel="View attendance"
              />
            )}

            {modules?.aptitudeExam && (
              <Highlight
                icon="fileCheck" tone="purple"
                label="Upcoming Exams"
                value={exams.length}
                sub={exams.length
                  ? exams.map(e => e.title).join(', ')
                  : 'Nothing scheduled right now'}
                to="/student/exams" linkLabel="View exams"
              />
            )}

            {modules?.fees && (
              <Highlight
                icon="wallet" tone={feeBalance > 0 ? 'amber' : 'green'}
                label="Fees Due"
                value={feeBalance > 0 ? fmtMoney(feeBalance) : '✓ Clear'}
                valueTone={feeBalance > 0 ? 'bad' : 'good'}
                sub={feeBalance > 0 ? 'Payable now' : 'Nothing outstanding'}
                to="/student/fees" linkLabel={feeBalance > 0 ? 'Pay now' : 'View receipt'}
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
                <QuickTile key={l.key} to={l.to} icon={l.icon} tone={l.tone} label={l.label} />
              ))}
            </Panel>
          )}

          {/* Marks */}
          {modules?.result && (
            <div className="dash__split dash__split--marks">
              {/* The trend and the cheer card ride together on the left so the
                  two columns end at roughly the same place — the subject list
                  is the taller of the two and sets the height. */}
              <div className="smarks">
                <PerformanceOverview trend={perf?.trend || []} to="/student/results" />
                {perf?.latest && (
                  <ResultHighlight name={firstName} latest={perf.latest} to="/student/results" />
                )}
              </div>

              <SubjectMarks
                subjects={perf?.subjects || []}
                examTitle={perf?.latest?.title}
                to="/student/results"
              />
            </div>
          )}
        </div>

        {/* ── Right rail ───────────────────────────────────────────────── */}
        <aside className="dash__rail">
          <MiniCalendar
            title="Calendar"
            holidays={holidays}
            attendance={attDays}
            holidayListPath={modules?.holiday ? '/student/holidays' : ''}
            saturdayConfig={saturdayConfig}
          />

          {modules?.holiday && (
            <Panel title="Upcoming Events"
              action={<PanelLink to="/student/holidays">View Calendar</PanelLink>}>
              {upcoming.length === 0
                ? <Note icon="calendar">No events scheduled ahead.</Note>
                : upcoming.map((h, i) => {
                  const multi = h._end > h._start;
                  return (
                    <EventRow
                      key={h._id || i}
                      to="/student/holidays"
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

          {modules?.notification && (
            <Panel title="Announcements"
              action={<PanelLink to="/student/notifications" />}>
              {notices.length === 0
                ? <Note icon="megaphone">Nothing announced yet.</Note>
                : notices.map(r => {
                  const n = r.notification || r;
                  return (
                    <Link key={r._id} to="/student/notifications" className="dann dann--link">
                      <span className="dann__icon tint-indigo"><Icon name="megaphone" size={17} /></span>
                      <span className="dann__body">
                        <span className="dann__title">{n.title}</span>
                        {n.body && <span className="dann__text">{n.body}</span>}
                        <span className="dann__meta">
                          <span>{n.senderRole ? n.senderRole.replace('_', ' ') : 'School'}</span>
                          <span>{ago(r.createdAt || n.createdAt)}</span>
                        </span>
                      </span>
                    </Link>
                  );
                })}
            </Panel>
          )}
        </aside>
      </div>

      <footer className="dash__foot">
        <span>© {new Date().getFullYear()} {user?.school?.name || 'Aksharum'}. All rights reserved.</span>
        <span className="dash__foot-brand">
          <Icon name="sparkle" size={14} /> Powered by Aksharum ERP
        </span>
      </footer>

      <QuickAccessPicker state={quick} available={available} />
    </div>
  );
}
