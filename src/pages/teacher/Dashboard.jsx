import { useState, useEffect, useMemo } from 'react';
import useFetch from '../../hooks/useFetch';
import {
  getDashboard, getModules, getHolidays, getMyLeaves, getSchoolConfig,
  getMyAttendance, clockIn, clockOut,
} from '../../api/teacher.api';
import { getInbox } from '../../api/notifications.api';
import { Spinner, MiniCalendar } from '../../components/ui/index';
import { useAuth } from '../../contexts/AuthContext';
import Icon, { SchoolScene } from '../../components/ui/icons';
import ClockCard from '../../components/attendance/ClockCard';
import { Panel, PanelLink, RowLink, Note } from '../../components/dashboard/parts';
import { useQuickAccess, CustomizeButton, QuickAccessPicker } from '../../components/dashboard/quickAccess';
import { Highlight, QuickTile, EventRow } from '../../components/dashboard/studentParts';
import { TodaySchedule, SectionCard, ClassPerformance } from './dashboardParts';

/**
 * Every shortcut a teacher can keep on Quick Access, filtered by the module map
 * so the picker only offers what this school actually runs.
 */
const ALL_QUICK_LINKS = [
  { key: 'section',     to: '/teacher/my-section',       icon: 'building',    tone: 'indigo', label: 'My Section',      sub: 'Students & info' },
  { key: 'attendance',  to: '/teacher/attendance',       icon: 'checkSquare', tone: 'green',  label: 'Attendance',      sub: 'Mark & review',    module: 'attendance' },
  { key: 'timetable',   to: '/teacher/timetable',        icon: 'clock',       tone: 'amber',  label: 'My Timetable',    sub: 'Weekly schedule',  module: 'timetable' },
  { key: 'subs',        to: '/teacher/substitutions',    icon: 'repeat',      tone: 'orange', label: 'Substitutions',   sub: 'Cover duties',     module: 'timetable' },
  { key: 'exams',       to: '/teacher/exams',            icon: 'fileCheck',   tone: 'purple', label: 'Aptitude Exams',  sub: 'Papers & attempts', module: 'aptitudeExam' },
  { key: 'results',     to: '/teacher/results',          icon: 'chart',       tone: 'blue',   label: 'Results',         sub: 'Marks & validation', module: 'result' },
  { key: 'analytics',   to: '/teacher/student-analytics', icon: 'compass',    tone: 'teal',   label: 'Student Analytics', sub: 'Per-student view' },
  { key: 'leave',       to: '/teacher/leave',            icon: 'umbrella',    tone: 'pink',   label: 'My Leave',        sub: 'Apply & track',    module: 'leave' },
  { key: 'documents',   to: '/teacher/documents',        icon: 'files',       tone: 'orange', label: 'Documents',       sub: 'Files & uploads',  module: 'document' },
  { key: 'payroll',     to: '/teacher/payroll/ctc',      icon: 'banknote',    tone: 'green',  label: 'My Salary',       sub: 'CTC & payslips',   module: 'payroll' },
  { key: 'library',     to: '/teacher/library',          icon: 'bookOpen',    tone: 'indigo', label: 'Library',         sub: 'Borrow & return',  module: 'library' },
  { key: 'videos',      to: '/teacher/videos/catalog',   icon: 'video',       tone: 'pink',   label: 'Video Learning',  sub: 'Lessons',          module: 'videoLibrary' },
  { key: 'feedback',    to: '/teacher/feedback/dashboard', icon: 'star',      tone: 'purple', label: 'My Feedback',     sub: 'What students say', module: 'feedback' },
  { key: 'holidays',    to: '/teacher/holidays',         icon: 'party',       tone: 'teal',   label: 'Holidays',        sub: 'School calendar',  module: 'holiday' },
  { key: 'notices',     to: '/teacher/notifications',    icon: 'megaphone',   tone: 'blue',   label: 'Notice Board',    sub: 'School notices',   module: 'notification' },
  { key: 'chat',        to: '/chat',                     icon: 'chat',        tone: 'indigo', label: 'Chat',            sub: 'Message staff',    module: 'chat' },
];

// Queues waiting on this teacher.
const PENDING_ITEMS = [
  { key: 'corrections', module: 'attendance', to: '/teacher/attendance', icon: 'userCircle', tone: 'pink',
    one: 'Attendance correction request', many: 'Attendance correction requests', sub: 'Awaiting your review' },
  { key: 'validation',  module: 'result',     to: '/teacher/results',    icon: 'chart',      tone: 'indigo',
    one: 'Exam awaiting marks validation', many: 'Exams awaiting marks validation', sub: 'Action required' },
];

const EVENT_TONES = ['indigo', 'green', 'purple', 'amber'];

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const serverDay = (iso) => {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

function ago(iso) {
  if (!iso) return '';
  const m = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * A month of self-attendance as a percentage of the days that counted.
 *
 * The summary counts holidays and approved leave separately from present and
 * absent; neither is a day the teacher failed to turn up for, so the divisor is
 * present + absent + half-days rather than the length of the month.
 */
function selfPercent(summary) {
  if (!summary) return null;
  const half    = summary['half-day'] || 0;
  const present = (summary.present || 0) + half * 0.5;
  const counted = (summary.present || 0) + (summary.absent || 0) + half;
  if (!counted) return null;
  return { percentage: Math.round((present / counted) * 100), present: summary.present || 0, counted };
}

export default function TeacherDashboard() {
  const { user }                                 = useAuth();
  const { data: dash, loading: dashLoading }     = useFetch(getDashboard);
  const { data: modules, loading: modLoading }   = useFetch(getModules);
  const { data: schoolConfig }                   = useFetch(getSchoolConfig);
  const [holidays, setHolidays] = useState([]);
  const [leaves,   setLeaves]   = useState([]);
  const [attDays,  setAttDays]  = useState([]);
  const [attSum,   setAttSum]   = useState(null);
  const [attPrev,  setAttPrev]  = useState(null);
  const [notices,  setNotices]  = useState([]);

  const loadAttendance = () => {
    const n = new Date();
    getMyAttendance({ month: n.getMonth() + 1, year: n.getFullYear() })
      .then(r => {
        const d = r.data ?? r;
        setAttDays(d?.days || []);
        setAttSum(d?.summary || null);
      })
      .catch(() => {});
    // Last month too, so this month's figure can be compared with something.
    const prev = new Date(n.getFullYear(), n.getMonth() - 1, 1);
    getMyAttendance({ month: prev.getMonth() + 1, year: prev.getFullYear() })
      .then(r => setAttPrev((r.data ?? r)?.summary || null))
      .catch(() => {});
  };

  useEffect(() => {
    if (!modules?.attendance) { setAttDays([]); setAttSum(null); setAttPrev(null); return; }
    loadAttendance();
  }, [modules]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!modules) return;
    if (!modules.holiday) { setHolidays([]); return; }
    getHolidays().then(r => setHolidays(r.data ?? r ?? [])).catch(() => {});
  }, [modules]);

  useEffect(() => {
    if (!modules) return;
    if (!modules.leave) { setLeaves([]); return; }
    getMyLeaves().then(r => {
      const data = r.data ?? r ?? [];
      setLeaves(Array.isArray(data)
        ? data.filter(l => ['approved', 'pending'].includes(l.status))
        : []);
    }).catch(() => {});
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
    scope: 'teacher',
    userId: user?._id || user?.id,
    available,
  });

  if (dashLoading || modLoading) return <div className="loading-page"><Spinner /></div>;

  const saturdayConfig = schoolConfig
    ? { working: schoolConfig.saturdayWorking, mode: schoolConfig.saturdayMode, halfDay: schoolConfig.saturdayHalfDay }
    : modules?.saturdayConfig;

  const section       = dash?.mySection;
  const todayPeriods  = dash?.todayPeriods || [];
  const substitutions = dash?.substitutions || [];
  const pending       = dash?.pending || {};
  const classPerf     = dash?.classPerformance || [];

  const att     = selfPercent(attSum);
  const prev    = selfPercent(attPrev);
  const attDelta = (att && prev) ? att.percentage - prev.percentage : null;

  const pendingItems = PENDING_ITEMS
    .filter(p => (!p.module || modules?.[p.module]) && (pending?.[p.key] || 0) > 0);
  const pendingTotal = pendingItems.reduce((a, p) => a + pending[p.key], 0);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const totalToday = todayPeriods.length + substitutions.length;

  return (
    <div className="page dash dash--student dash--teacher">
      <div className="dashboard-layout">
        {/* ── Main column ──────────────────────────────────────────────── */}
        <div className="dash__main">

          {/* Greeting + today's clock */}
          <section className="hero shero">
            <div className="shero__row">
              <div className="shero__text">
                <h1>{greeting()}, {firstName}! <span className="hero__wave">👋</span></h1>
                <p>
                  {totalToday
                    ? <>You have {totalToday} class{totalToday === 1 ? '' : 'es'} today.</>
                    : <>Here&rsquo;s what&rsquo;s happening today.</>}
                </p>
                {(section || dash?.profile?.designation) && (
                  <div className="shero__meta">
                    {section && (
                      <span className="shero__chip">
                        <Icon name="building" size={14} />
                        {[section.className, section.sectionName].filter(Boolean).join(' — ')}
                      </span>
                    )}
                    {dash?.profile?.designation && (
                      <span className="shero__chip">
                        <Icon name="badge" size={14} />{dash.profile.designation}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <SchoolScene className="shero__art" />
            </div>

            {modules?.attendance && (
              <ClockCard
                variant="strip"
                api={{ getMyAttendance, clockIn, clockOut }}
                linkTo="/teacher/attendance"
                onChanged={loadAttendance}
              />
            )}
          </section>

          {/* The figures that matter today */}
          <div className="shl-grid">
            <Highlight
              icon="clock" tone="amber"
              label="Classes Today"
              value={totalToday}
              sub={substitutions.length
                ? `${todayPeriods.length} of your own · ${substitutions.length} covering`
                : totalToday ? 'On your timetable today' : 'Nothing scheduled today'}
              to={modules?.timetable ? '/teacher/timetable' : undefined}
              linkLabel="View timetable"
            />

            {modules?.attendance && (
              <Highlight
                icon="checkSquare" tone="indigo"
                label="My Attendance (This Month)"
                value={att ? `${att.percentage}%` : '—'}
                valueTone={!att ? null
                  : att.percentage >= 90 ? 'good' : att.percentage >= 75 ? 'warn' : 'bad'}
                sub={att
                  ? `${att.present} of ${att.counted} working days present`
                  : 'Nothing marked this month yet'}
                meter={att?.percentage ?? null}
                delta={attDelta}
                to="/teacher/attendance" linkLabel="View attendance"
              />
            )}

            {modules?.leave && (
              <Highlight
                icon="umbrella" tone="green"
                label="Leave Balance"
                value={`${dash?.leaveRemaining ?? 0}`}
                sub={`day${(dash?.leaveRemaining ?? 0) === 1 ? '' : 's'} remaining across all types`}
                to="/teacher/leave" linkLabel="Apply for leave"
              />
            )}
          </div>

          {/* My section */}
          {section && <SectionCard section={section} to="/teacher/my-section" />}

          {/* Today's classes + what is waiting on this teacher */}
          <div className="dash__split dash__split--marks">
            {modules?.timetable
              ? <TodaySchedule periods={todayPeriods} substitutions={substitutions}
                  to="/teacher/timetable" />
              : <TodaySchedule periods={todayPeriods} substitutions={substitutions} />}

            <Panel
              title="Needs your attention"
              action={pendingTotal > 0 ? <span className="dchip">{pendingTotal} pending</span> : null}
            >
              {pendingItems.length === 0
                ? <Note>Nothing is waiting on you right now.</Note>
                : pendingItems.map(p => {
                  const n = pending[p.key];
                  return (
                    <RowLink key={p.key} to={p.to} icon={p.icon} tone={p.tone}
                      title={`${n} ${n === 1 ? p.one : p.many}`} sub={p.sub} />
                  );
                })}
            </Panel>
          </div>

          {/* How the classes this teacher takes are actually doing */}
          {modules?.result && (
            <ClassPerformance classes={classPerf} to="/teacher/student-analytics" />
          )}

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
        </div>

        {/* ── Right rail ───────────────────────────────────────────────── */}
        <aside className="dash__rail">
          <MiniCalendar
            title="My Calendar"
            holidays={holidays}
            leaves={leaves}
            attendance={attDays}
            holidayListPath={modules?.holiday ? '/teacher/holidays' : ''}
            saturdayConfig={saturdayConfig}
          />

          {modules?.holiday && (
            <Panel title="Upcoming Events"
              action={<PanelLink to="/teacher/holidays">View Calendar</PanelLink>}>
              {upcoming.length === 0
                ? <Note icon="calendar">No events scheduled ahead.</Note>
                : upcoming.map((h, i) => {
                  const multi = h._end > h._start;
                  return (
                    <EventRow
                      key={h._id || i}
                      to="/teacher/holidays"
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
            <Panel title="Announcements" action={<PanelLink to="/teacher/notifications" />}>
              {notices.length === 0
                ? <Note icon="megaphone">Nothing announced yet.</Note>
                : notices.map(r => {
                  const n = r.notification || r;
                  return (
                    <RowLink
                      key={r._id}
                      to="/teacher/notifications"
                      icon="megaphone"
                      tone="indigo"
                      title={n.title}
                      sub={ago(r.createdAt || n.createdAt)}
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
