import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useFetch from '../../hooks/useFetch';
import { getDashboard, getModules, getMyHolidays, getSchoolSettings, getMyAttendance, clockIn, clockOut } from '../../api/admin.api';
import { Spinner, MiniCalendar } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import ClockCard from '../../components/attendance/ClockCard';
import {
  Panel, PanelLink, StatTile, AttendanceOverview, RowLink, QuickTile, Note,
} from './dashboardParts';
import { useQuickAccess, CustomizeButton, QuickAccessPicker } from '../../components/dashboard/quickAccess';

/**
 * Every module the school can switch on, with the tile it gets under Quick
 * Access. Filtered by the effective module map, so a tile appears exactly when
 * the admin can actually open what it points at.
 */
const ALL_MODULES = [
  { key: 'fees',              to: '/admin/fees/dashboard',                 icon: 'wallet',      tone: 'blue',   label: 'Fees Management', sub: 'Collections & receipts' },
  { key: 'payroll',           to: '/admin/payroll/dashboard',              icon: 'banknote',    tone: 'green',  label: 'Payroll',         sub: 'Salaries & payslips' },
  { key: 'library',           to: '/admin/library/dashboard',              icon: 'bookOpen',    tone: 'indigo', label: 'Library',         sub: 'Manage books & resources' },
  { key: 'leave',             to: '/admin/leave',                          icon: 'umbrella',    tone: 'purple', label: 'Leave Management', sub: 'Apply & approve leaves' },
  { key: 'attendance',        to: '/admin/attendance',                     icon: 'checkSquare', tone: 'green',  label: 'Attendance',      sub: 'Mark & view attendance' },
  { key: 'timetable',         to: '/admin/timetable',                      icon: 'clock',       tone: 'amber',  label: 'Timetable',       sub: 'View class schedules' },
  { key: 'result',            to: '/admin/results',                        icon: 'chart',       tone: 'teal',   label: 'Results',         sub: 'Marks & report cards' },
  { key: 'aptitudeExam',      to: '/admin/exams',                          icon: 'fileCheck',   tone: 'pink',   label: 'Aptitude Exams',  sub: 'Papers & attempts' },
  { key: 'inventory',         to: '/admin/inventory/dashboard',            icon: 'package',     tone: 'orange', label: 'Inventory',       sub: 'Stock, assets & orders' },
  { key: 'transport',         to: '/admin/transport/dashboard',            icon: 'bus',         tone: 'amber',  label: 'Transport',       sub: 'Routes & vehicles' },
  { key: 'hostel',            to: '/admin/hostel/dashboard',               icon: 'hotel',       tone: 'teal',   label: 'Hostel',          sub: 'Rooms & allocations' },
  { key: 'videoLibrary',      to: '/admin/videos/browse',                  icon: 'video',       tone: 'pink',   label: 'Video Learning',  sub: 'Lessons & assignments' },
  { key: 'feedback',          to: '/admin/feedback/dashboard',             icon: 'star',        tone: 'purple', label: 'Teacher Feedback', sub: 'Campaigns & reports' },
  { key: 'employeeDirectory', to: '/admin/employee-directory/dashboard',   icon: 'folder',      tone: 'indigo', label: 'Employee Directory', sub: 'Staff records' },
  { key: 'document',          to: '/admin/documents',                      icon: 'files',       tone: 'orange', label: 'Documents',       sub: 'Files & certificates' },
  { key: 'holiday',           to: '/admin/holidays',                       icon: 'party',       tone: 'teal',   label: 'Holidays',        sub: 'Calendar & closures' },
  { key: 'notification',      to: '/admin/notifications',                  icon: 'megaphone',   tone: 'blue',   label: 'Notice Board',    sub: 'Create & manage notices' },
  { key: 'chat',              to: '/chat',                                 icon: 'chat',        tone: 'indigo', label: 'Chat',            sub: 'Message staff & parents' },
];

// Pending queues that need the admin's attention
const PENDING_ITEMS = [
  { key: 'regularizations', module: 'attendance', to: '/admin/attendance',    icon: 'userCircle',  tone: 'pink',   one: 'Attendance regularization', many: 'Attendance regularizations', sub: 'Pending review' },
  { key: 'leaves',          module: 'leave',      to: '/admin/leave',         icon: 'umbrella',    tone: 'amber',  one: 'Leave application',         many: 'Leave applications',         sub: 'Awaiting approval' },
  { key: 'examsToPublish',  module: 'result',     to: '/admin/results',       icon: 'chart',       tone: 'indigo', one: 'Result ready to publish',   many: 'Results ready to publish',   sub: 'Requires approval' },
  { key: 'payments',        module: 'fees',       to: '/admin/fees/payments', icon: 'creditCard',  tone: 'blue',   one: 'Fee payment to verify',     many: 'Fee payments to verify',     sub: 'Action required' },
];

const EVENT_TONES = ['indigo', 'green', 'purple', 'amber'];

const greeting = (d = new Date()) => {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

/** A UTC-midnight date from the server, read as the local calendar day it means. */
const serverDay = (iso) => {
  const d = new Date(iso);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const dayMonth = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** "2 days ago" — close enough for a feed, and shorter than a timestamp. */
function ago(iso) {
  if (!iso) return '';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const mins = Math.floor(secs / 60);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function AdminDashboard() {
  const { user }                                   = useAuth();
  const { data: stats,   loading: statsLoading  }  = useFetch(getDashboard);
  const { data: modules, loading: modulesLoading } = useFetch(getModules);
  const { data: schoolData }                       = useFetch(getSchoolSettings);
  const [holidays, setHolidays]                    = useState([]);
  const [attDays,  setAttDays]                     = useState([]);

  const loadAttendance = () => {
    const n = new Date();
    getMyAttendance({ month: n.getMonth() + 1, year: n.getFullYear() })
      .then(r => setAttDays((r.data ?? r)?.days || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (!modules?.attendance) { setAttDays([]); return; }
    loadAttendance();
  }, [modules]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!modules) return;
    if (!modules.holiday) { setHolidays([]); return; }
    getMyHolidays().then(r => setHolidays(r.data ?? r ?? [])).catch(() => {});
  }, [modules]);

  // Holidays that have not finished yet, nearest first — the rail's event list.
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

  // The modules this admin can actually open, and the subset they have chosen
  // to keep on the panel. Both are computed before the loading gate so the hook
  // order stays the same on every render.
  const enabledModules = useMemo(
    () => ALL_MODULES.filter(m => modules?.[m.key]),
    [modules],
  );
  const quick = useQuickAccess({
    scope: 'admin',
    userId: user?._id || user?.id,
    available: enabledModules,
  });

  if (statsLoading || modulesLoading) return <div className="loading-page"><Spinner /></div>;

  const ls             = schoolData?.leaveSettings;
  const saturdayConfig = ls
    ? { working: ls.saturdayWorking !== false, mode: ls.saturdayMode || 'all', halfDay: !!ls.saturdayHalfDay }
    : modules?.saturdayConfig;

  const pendingItems = PENDING_ITEMS
    .filter(p => (!p.module || modules?.[p.module]) && (stats?.pending?.[p.key] || 0) > 0);
  const pendingTotal = pendingItems.reduce((a, p) => a + stats.pending[p.key], 0);

  const schoolName    = user?.school?.name || 'your school';
  const year          = stats?.academicYear;
  const growth        = stats?.growth;
  const announcements = stats?.recentNotifications || [];

  return (
    <div className="page dash">
      <div className="dashboard-layout">
        {/* ── Main column ──────────────────────────────────────────────── */}
        <div className="dash__main">

          {/* Greeting + academic year + today's clock */}
          <section className="hero">
            <div className="hero__row">
              <div className="hero__greet">
                <h1>{greeting()}, {user?.name} <span className="hero__wave">👋</span></h1>
                <p>Here's what's happening at {schoolName} today.</p>
              </div>

              {year && (
                <Link to="/admin/academic-years" className="hero__year">
                  <span className="hero__year-icon"><Icon name="school" size={22} /></span>
                  <span className="hero__year-text">
                    <span className="hero__year-cap">Current Academic Year</span>
                    <span className="hero__year-val">
                      {year.yearName}
                      <span className="badge badge-success">Active</span>
                    </span>
                  </span>
                  <Icon name="chevronRight" size={16} className="hero__year-chev" />
                </Link>
              )}
            </div>

            {modules?.attendance && (
              <ClockCard
                variant="strip"
                api={{ getMyAttendance, clockIn, clockOut }}
                linkTo="/admin/attendance"
                onChanged={loadAttendance}
              />
            )}
          </section>

          {/* Headcounts */}
          <div className="stat-grid">
            <StatTile icon="teacher"  tone="indigo" label="Teachers" value={stats?.teachers ?? 0}
              caption="Active Teachers"   delta={growth?.teachers} to="/admin/teachers" />
            <StatTile icon="student"  tone="green"  label="Students" value={stats?.students ?? 0}
              caption="Enrolled Students" delta={growth?.students} to="/admin/students" />
            <StatTile icon="users"    tone="amber"  label="Parents"  value={stats?.parents ?? 0}
              caption="Registered Parents" delta={growth?.parents} />
            <StatTile icon="building" tone="purple" label="Sections" value={stats?.sections ?? 0}
              caption="Total Sections"    delta={growth?.sections} to="/admin/classes" />
          </div>

          {/* Attendance + attention */}
          <div className="dash__split">
            {modules?.attendance && (
              <AttendanceOverview
                trend={stats?.attendance?.trend || []}
                today={stats?.attendance?.today}
                to="/admin/attendance"
              />
            )}

            <Panel
              title="Needs your attention"
              className="dpanel--attention"
              action={pendingTotal > 0
                ? <span className="dchip">{pendingTotal} pending</span>
                : null}
            >
              {pendingItems.length === 0
                ? <Note>Nothing is waiting on you right now.</Note>
                : pendingItems.map(p => {
                  const n = stats.pending[p.key];
                  return (
                    <RowLink key={p.key} to={p.to} icon={p.icon} tone={p.tone}
                      title={`${n} ${n === 1 ? p.one : p.many}`} sub={p.sub} />
                  );
                })}
            </Panel>
          </div>

          {/* Quick access */}
          {enabledModules.length > 0 && (
            <Panel
              title="Quick Access"
              subtitle="Jump straight into a module"
              bodyClass="qgrid"
              action={<CustomizeButton onClick={quick.open} />}
            >
              {quick.tiles.map(m => (
                <QuickTile key={m.to} to={m.to} icon={m.icon} tone={m.tone}
                  label={m.label} sub={m.sub} />
              ))}
            </Panel>
          )}
        </div>

        {/* ── Right rail ───────────────────────────────────────────────── */}
        <aside className="dash__rail">
          <MiniCalendar
            title="Today's Schedule"
            holidays={holidays}
            attendance={attDays}
            holidayListPath={modules?.holiday ? '/admin/holidays' : ''}
            saturdayConfig={saturdayConfig}
          />

          {modules?.holiday && (
            <Panel title="Upcoming Events" action={<PanelLink to="/admin/holidays">View Calendar</PanelLink>}>
              {upcoming.length === 0
                ? <Note icon="calendar">No events scheduled ahead.</Note>
                : upcoming.map((h, i) => {
                  const multi = h._end > h._start;
                  return (
                    <RowLink
                      key={h._id || i}
                      to="/admin/holidays"
                      icon="calendarDays"
                      tone={EVENT_TONES[i % EVENT_TONES.length]}
                      title={h.name}
                      sub={multi
                        ? `${dayMonth(h._start)} – ${dayMonth(h._end)}`
                        : `${dayMonth(h._start)}${h.type ? ` · ${h.type}` : ''}`}
                    />
                  );
                })}
              <Link to="/admin/holidays" className="dadd">
                <Icon name="plus" size={15} /> Add Event
              </Link>
            </Panel>
          )}

          <Panel title="Announcements"
            action={modules?.notification ? <PanelLink to="/admin/notifications" /> : null}>
            {announcements.length === 0
              ? <Note icon="megaphone">Nothing has been announced yet.</Note>
              : announcements.map(n => (
                <div key={n._id} className="dann">
                  <span className="dann__icon tint-indigo"><Icon name="megaphone" size={17} /></span>
                  <div className="dann__body">
                    <p className="dann__title">{n.title}</p>
                    <div className="dann__meta">
                      <span>{n.recipientCount ?? 0} recipient{n.recipientCount === 1 ? '' : 's'}</span>
                      <span>{ago(n.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
          </Panel>
        </aside>
      </div>

      <QuickAccessPicker
        state={quick}
        available={enabledModules}
        note="Choose the modules you want on your dashboard. This is saved on this device."
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
