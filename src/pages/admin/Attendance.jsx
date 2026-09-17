/**
 * Admin → Attendance.
 *
 * The header scopes the four figures under it (academic year, class) and opens
 * a register; the tabs hold today's school-wide register with recent activity,
 * direct corrections, the staff request queue, and reports.
 *
 * An admin has no attendance of their own here: clock in, clock out and
 * regularization requests belong to the teacher role, decided by the post the
 * session is signed in as. Someone who is also a teacher at this school is
 * pointed at that post (TeacherPostNote).
 *
 * Notifications link here with ?tab=requests (plus &focus=<id> for a request),
 * so the tab keys are part of the URL contract. The old ?tab=my-attendance still
 * opens — on the overview that replaced it.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { useAuth } from '../../contexts/AuthContext';
import { getAttendanceOverview } from '../../api/admin.api';
import { Button } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  AttHeader, AttStat, HeadSelect, SideLinks, UnderTabs, fmtDay, todayKey,
} from './attendanceParts';
import Overview from './attendance/Overview';
import TodayAttendance from './attendance/TodayAttendance';
import MarkAttendanceDialog from './attendance/MarkAttendanceDialog';
import Regularise from './attendance/Regularise';
import Requests from './attendance/Requests';
import Reports from './attendance/Reports';
import AttendanceSettings from './attendance/Settings';

const TABS = [
  { value: 'overview',   label: 'Overview' },
  { value: 'regularise', label: 'Regularise Attendance' },
  { value: 'requests',   label: 'Regularization Requests' },
  { value: 'reports',    label: 'Reports' },
  { value: 'settings',   label: 'Settings' },
];
// Tab keys that were renamed, so bookmarks and old links still land somewhere.
const TAB_ALIASES = { 'my-attendance': 'overview' };

/**
 * Where an admin's own attendance lives now. Shown only to someone who also
 * holds a teacher post at this school — switching lands on the teacher
 * dashboard, whose clock card is the first thing on it. Everyone else has no
 * attendance to clock and sees nothing.
 */
function TeacherPostNote() {
  const { user, accounts, switchTo } = useAuth();
  const [busy, setBusy] = useState(false);
  const here = String(user?.school?._id || user?.school || '');
  const post = (accounts || []).find((a) => a.role === 'teacher' && !a.current
    && String(a.school?._id || '') === here);
  if (!post) return null;

  const go = async () => {
    setBusy(true);
    try {
      await switchTo(post.id);   // full reload on success
    } catch (e) {
      toast.error(e?.message || 'Could not switch to your teacher account');
      setBusy(false);
    }
  };

  return (
    <span className="atn-tabnote">
      <Icon name="info" size={15} />Clock in from your teacher account
      <Button size="sm" variant="secondary" loading={busy} onClick={go}>
        <Icon name="repeat" size={15} /> Switch to Teacher
      </Button>
    </span>
  );
}

export default function AdminAttendance() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const wanted = TAB_ALIASES[params.get('tab')] || params.get('tab');
  const [tab, setTabState] = useState(TABS.some((t) => t.value === wanted) ? wanted : 'overview');
  const [yearId, setYearId] = useState('');
  const [cls, setCls]       = useState('');
  const [register, setRegister] = useState(null);   // { section?, date? } while the dialog is open
  const [schoolVersion, setSchoolVersion] = useState(0);
  const bumpSchool = useCallback(() => setSchoolVersion((v) => v + 1), []);

  const setTab = (value, extra = {}) => {
    setTabState(value);
    setParams({ tab: value, ...extra }, { replace: true });
  };

  const { data: ov, loading } = useFetch(
    () => getAttendanceOverview({ academicYear: yearId || undefined, class: cls || undefined }),
    [yearId, cls, schoolVersion],
  );
  const year    = ov?.year || null;
  const tiles   = ov?.tiles;
  const today   = todayKey();
  const running = !!year && year.startDate <= today && today <= year.endDate;
  const className = ov?.classes?.find((c) => c._id === cls)?.className;

  const scopeText = `${className || 'all classes'}${year ? `, ${year.yearName}` : ''}`;
  const windowText = ov?.window
    ? `${fmtDay(ov.window.from)} – ${fmtDay(ov.window.to)}, against ${fmtDay(ov.window.previous.from)} – ${fmtDay(ov.window.previous.to)}`
    : '';

  const openActivity = (item) => {
    if (item.kind === 'request' || item.kind === 'reviewed') {
      setTab('requests', { focus: item.requestId });
    } else if (item.kind === 'streak') {
      navigate(`/admin/student-analytics/${item.studentId}`);
    } else if (item.kind === 'marked' || item.kind === 'updated') {
      setRegister({ section: item.section, date: item.date });
    } else {
      setTab('regularise');
    }
  };

  const openRegister = useCallback((section, date) => setRegister({ section, date }), []);

  const figure = (v, fmt = (x) => x.toLocaleString('en-IN')) => (loading && !tiles ? '—' : v == null ? '—' : fmt(v));

  const tabs = useMemo(() => TABS.map((t) => (
    t.value === 'requests' && tiles?.pending?.value ? { ...t, count: tiles.pending.value } : t
  )), [tiles]);

  return (
    <div className="page atnpg">
      <AttHeader title="Attendance"
        subtitle="Track attendance, manage regularization requests and monitor school-wide statistics.">
        <HeadSelect label="Academic year" value={yearId || year?._id || ''}
          onChange={(v) => { setYearId(v); setCls(''); }}>
          {(ov?.years || []).map((y) => (
            <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? '' : ` (${y.status})`}</option>
          ))}
          {!ov?.years?.length && <option value="">No academic year</option>}
        </HeadSelect>
        <HeadSelect label="Class" value={cls} onChange={setCls} wide>
          <option value="">All classes</option>
          {(ov?.classes || []).map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}
        </HeadSelect>
        <button type="button" className="btn btn-primary atn-head__cta" onClick={() => setRegister({})}>
          <Icon name="plus" size={18} /> Mark Attendance
        </button>
      </AttHeader>

      <div className="atn-stats">
        <AttStat icon="users" tone="green" label="Total Students"
          value={figure(tiles?.students.value)} change={tiles?.students.change}
          title={`Active students placed in a section — ${scopeText}. The change counts those who were already enrolled on ${fmtDay(ov?.window?.from)}.`} />
        <AttStat icon="clock" tone="indigo" label="Average Attendance"
          value={figure(tiles?.average.value, (x) => `${x}%`)} change={tiles?.average.change}
          title={`Present or late, over every mark taken ${windowText} — ${scopeText}. The change is in percentage points.`}
          onClick={() => setTab('reports')} />
        <AttStat icon="user" tone="red" label="Total Absentees" good="down"
          value={figure(tiles?.absentees.value)} change={tiles?.absentees.change}
          title={`Students marked absent at least once, ${windowText} — ${scopeText}.`}
          onClick={() => setTab('reports')} />
        <AttStat icon="clock" tone="amber" label="Pending Requests" good="down"
          value={figure(tiles?.pending.value)} change={tiles?.pending.change}
          title="Staff regularization requests waiting for a decision, against how many were waiting a month ago. Not narrowed by class."
          onClick={() => setTab('requests')} />
        <SideLinks items={[
          { label: 'Generate Report', icon: 'fileDoc', onClick: () => setTab('reports') },
          { label: 'Attendance Settings', icon: 'settings', onClick: () => setTab('settings') },
        ]} />
      </div>

      <UnderTabs tabs={tabs} value={tab} onChange={(v) => setTab(v)}>
        {tab === 'overview' && <TeacherPostNote />}
      </UnderTabs>

      {tab === 'overview' && (
        <Overview version={schoolVersion} onActivity={openActivity}
          today={
            <TodayAttendance defaultClass={running ? cls : ''} version={schoolVersion}
              onChanged={bumpSchool} onOpenRegister={openRegister} />
          } />
      )}
      {tab === 'regularise' && <Regularise onChanged={bumpSchool} />}
      {tab === 'requests' && <Requests onChanged={bumpSchool} />}
      {tab === 'reports' && <Reports year={year} defaultClass={cls} onOpenRegister={openRegister} />}
      {tab === 'settings' && <AttendanceSettings />}

      <MarkAttendanceDialog open={!!register} initial={register}
        onClose={() => setRegister(null)} onSaved={bumpSchool} />
    </div>
  );
}
