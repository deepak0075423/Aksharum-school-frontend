/**
 * Admin → Attendance.
 *
 * The header scopes the four figures under it (academic year, class) and opens
 * a register; the tabs hold the admin's own attendance with today's school-wide
 * register, direct corrections, the staff request queue, and reports.
 *
 * Notifications link here with ?tab=my-attendance or ?tab=requests (plus
 * &focus=<id> for a request), so the tab keys are part of the URL contract.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getAttendanceOverview } from '../../api/admin.api';
import Icon from '../../components/ui/icons';
import {
  AttHeader, AttStat, HeadSelect, SideLinks, UnderTabs, fmtDay, todayKey,
} from './attendanceParts';
import MyAttendance, { ClockControl } from './attendance/MyAttendance';
import TodayAttendance from './attendance/TodayAttendance';
import MarkAttendanceDialog from './attendance/MarkAttendanceDialog';
import Regularise from './attendance/Regularise';
import Requests from './attendance/Requests';
import Reports from './attendance/Reports';

const TABS = [
  { value: 'my-attendance', label: 'My Attendance' },
  { value: 'regularise',    label: 'Regularise Attendance' },
  { value: 'requests',      label: 'Regularization Requests' },
  { value: 'reports',       label: 'Reports' },
];

export default function AdminAttendance() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const wanted = params.get('tab');
  const [tab, setTabState] = useState(TABS.some((t) => t.value === wanted) ? wanted : 'my-attendance');
  const [yearId, setYearId] = useState('');
  const [cls, setCls]       = useState('');
  const [register, setRegister] = useState(null);   // { section?, date? } while the dialog is open
  // Two refresh signals: the admin's own attendance, and the school's registers.
  // Marking a class does not need the admin's calendar fetched again.
  const [selfVersion, setSelfVersion]     = useState(0);
  const [schoolVersion, setSchoolVersion] = useState(0);
  const bumpSelf   = useCallback(() => setSelfVersion((v) => v + 1), []);
  const bumpSchool = useCallback(() => setSchoolVersion((v) => v + 1), []);

  const setTab = (value, extra = {}) => {
    setTabState(value);
    setParams({ tab: value, ...extra }, { replace: true });
  };

  const { data: ov, loading } = useFetch(
    () => getAttendanceOverview({ academicYear: yearId || undefined, class: cls || undefined }),
    [yearId, cls, schoolVersion, selfVersion],
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
          { label: 'Attendance Settings', icon: 'settings', onClick: () => navigate('/admin/school-settings?section=days') },
        ]} />
      </div>

      <UnderTabs tabs={tabs} value={tab} onChange={(v) => setTab(v)}>
        {tab === 'my-attendance' && <ClockControl version={selfVersion} onChanged={bumpSelf} />}
      </UnderTabs>

      {tab === 'my-attendance' && (
        <MyAttendance selfVersion={selfVersion} schoolVersion={schoolVersion}
          onChanged={bumpSelf} onActivity={openActivity}
          today={
            <TodayAttendance defaultClass={running ? cls : ''} version={schoolVersion}
              onChanged={bumpSchool} onOpenRegister={openRegister} />
          } />
      )}
      {tab === 'regularise' && <Regularise onChanged={() => { bumpSchool(); bumpSelf(); }} />}
      {tab === 'requests' && <Requests onChanged={bumpSchool} />}
      {tab === 'reports' && <Reports year={year} defaultClass={cls} onOpenRegister={openRegister} />}

      <MarkAttendanceDialog open={!!register} initial={register}
        onClose={() => setRegister(null)} onSaved={bumpSchool} />
    </div>
  );
}
