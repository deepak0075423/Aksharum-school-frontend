/**
 * Admin → Attendance → Reports.
 *
 * One filter row scopes everything under it (period, class, section), then
 * either the students' picture — the rate over time, the status split, every
 * section and the students below the line — or the staff's, derived from their
 * punches, leave and holidays the same way their own calendars are.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getAttendanceReports } from '../../../api/admin.api';
import { Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Avatar, IconAction, RowActions } from '../listParts';
import {
  Card, DayRange, EmptyNote, Meter, ROLE_LABEL, RateColumns, Segmented, StatusSplit,
  addDays, addMonths, downloadCsv, fmtDay, monthEnd, monthStart, plural, todayKey,
} from '../attendanceParts';

function presetRange(preset, year) {
  const today = todayKey();
  switch (preset) {
    case 'last-month': { const m = addMonths(today, -1); return { from: monthStart(m), to: monthEnd(m) }; }
    case 'last-30':    return { from: addDays(today, -29), to: today };
    case 'year':       return year
      ? { from: year.startDate, to: year.endDate < today ? year.endDate : today }
      : { from: `${today.slice(0, 4)}-01-01`, to: today };
    default:           return { from: monthStart(today), to: today };
  }
}

const Stat = ({ tone, icon, value, label, caption }) => (
  <div className={`atn-rstat atn-rstat--${tone}`}>
    <span className="atn-rstat__icon"><Icon name={icon} size={20} /></span>
    <span>
      <b>{value}</b>
      <span className="atn-rstat__label">{label}</span>
      {caption ? <small>{caption}</small> : null}
    </span>
  </div>
);

export default function Reports({ year, defaultClass = '', onOpenRegister }) {
  const running = year && year.startDate <= todayKey() && todayKey() <= year.endDate;
  const [view, setView]       = useState('students');
  const [preset, setPreset]   = useState(running || !year ? 'this-month' : 'year');
  const [custom, setCustom]   = useState(() => presetRange('this-month'));
  const [cls, setCls]         = useState(defaultClass);
  const [section, setSection] = useState('');

  useEffect(() => { setCls(defaultClass); setSection(''); }, [defaultClass]);
  // A year that is not running has no "this month" — open it whole.
  useEffect(() => { setPreset(year && !running ? 'year' : 'this-month'); }, [year?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const range = preset === 'custom' ? custom : presetRange(preset, year);
  const { data, loading, error } = useFetch(
    () => getAttendanceReports({
      view, from: range.from, to: range.to, academicYear: year?._id,
      class: cls || undefined, section: section || undefined,
    }),
    [view, range.from, range.to, year?._id, cls, section],
  );

  const classes  = data?.classes || [];
  const sections = useMemo(() => classes.find((c) => c._id === cls)?.sections || [], [classes, cls]);
  const period   = `${fmtDay(range.from)} – ${fmtDay(range.to)}`;
  const isStudents = view === 'students' && data?.view === 'students';
  const isStaff    = view === 'staff' && data?.view === 'staff';

  const exportSections = () => downloadCsv(`attendance-sections_${range.from}_${range.to}.csv`,
    ['Class', 'Section', 'Students', 'Days marked', 'Present', 'Late', 'Half-Day', 'Absent', 'Attendance %', 'Last marked'],
    data.sections.map((s) => [s.className, s.sectionName, s.students, s.days, s.present, s.late, s.halfDay || 0, s.absent, s.percentage ?? '', s.lastMarked || '']));
  const exportStudents = () => downloadCsv(`attendance-below-${data.threshold}_${range.from}_${range.to}.csv`,
    ['Student', 'Roll', 'Class', 'Section', 'Present', 'Late', 'Half-Day', 'Absent', 'Marks', 'Attendance %'],
    data.students.map((s) => [s.name, s.rollNumber || '', s.className, s.sectionName, s.present, s.late, s.halfDay || 0, s.absent, s.total, s.percentage]));
  const exportStaff = () => downloadCsv(`staff-attendance_${range.from}_${range.to}.csv`,
    ['Name', 'Role', 'Designation', 'Department', 'Working days', 'Present', 'Half-day leave', 'Leave', 'Absent', 'Attendance %'],
    data.staff.map((s) => [s.name, ROLE_LABEL[s.role] || s.role, s.designation || '', s.department || '', s.working, s.present, s.halfDay, s.leave, s.absent, s.percentage ?? '']));

  return (
    <div className="atn-reports">
      <div className="atn-filterbar">
        <Segmented label="Report" value={view} onChange={setView}
          options={[{ value: 'students', label: 'Students', icon: 'student' }, { value: 'staff', label: 'Staff', icon: 'teacher' }]} />
        <select className="atn-mini-select" value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Period">
          <option value="this-month">This month</option>
          <option value="last-month">Last month</option>
          <option value="last-30">Last 30 days</option>
          <option value="year">{year ? `Academic year ${year.yearName}` : 'This year'}</option>
          <option value="custom">Custom range</option>
        </select>
        {preset === 'custom' && (
          <DayRange from={custom.from} to={custom.to} max={todayKey()} what="Report"
            onFrom={(v) => v && setCustom((c) => ({ ...c, from: v }))}
            onTo={(v) => v && setCustom((c) => ({ ...c, to: v }))} />
        )}
        {view === 'students' && (
          <>
            <select className="atn-mini-select" value={cls} onChange={(e) => { setCls(e.target.value); setSection(''); }} aria-label="Class">
              <option value="">All classes</option>
              {classes.map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}
            </select>
            <select className="atn-mini-select" value={section} disabled={!cls} onChange={(e) => setSection(e.target.value)} aria-label="Section">
              <option value="">All sections</option>
              {sections.map((s) => <option key={s._id} value={s._id}>Section {s.sectionName}</option>)}
            </select>
          </>
        )}
        <span className="atn-filterbar__period">{period}{loading && <Spinner size="sm" />}</span>
        <button type="button" className="atn-btn-ghost" disabled={!data || loading}
          onClick={isStaff ? exportStaff : exportSections}>
          <Icon name="download" size={16} /> Export CSV
        </button>
      </div>

      {error && <Card><EmptyNote icon="alert" title="The report could not be built">{error}</EmptyNote></Card>}

      {isStudents && (
        <div className={loading ? 'atn-dim' : ''}>
          <div className="atn-rstats">
            <Stat tone="green" icon="checkCircle" label="Average attendance"
              value={data.totals.percentage == null ? '—' : `${data.totals.percentage}%`}
              caption={`${data.totals.total.toLocaleString('en-IN')} marks · late counts as attended, a half day as half`} />
            <Stat tone="indigo" icon="clipboard" label="Registers taken" value={data.totals.registers.toLocaleString('en-IN')}
              caption={`across ${plural(data.totals.days, 'school day')}`} />
            <Stat tone="red" icon="closeCircle" label="Absences recorded" value={data.totals.absent.toLocaleString('en-IN')}
              caption={`${data.totals.late.toLocaleString('en-IN')} late arrivals`} />
            <Stat tone="amber" icon="alert" label={`Below ${data.threshold}%`} value={data.totals.below.toLocaleString('en-IN')}
              caption={`of ${plural(data.totals.studentsMarked, 'student')} with marks`} />
          </div>

          <div className="atn-charts">
            <Card title="Attendance rate" sub={`${{ day: 'Daily', week: 'Weekly', month: 'Monthly' }[data.bucket]} · the dashed line is ${data.threshold}% · unmarked ${data.bucket}s are gaps`}>
              <RateColumns series={data.trend} bucket={data.bucket} threshold={data.threshold} />
            </Card>
            <Card title="Status split" sub={`${data.totals.total.toLocaleString('en-IN')} marks in the period`}>
              <StatusSplit present={data.totals.present} late={data.totals.late} absent={data.totals.absent} halfDay={data.totals.halfDay || 0} />
            </Card>
          </div>

          <Card title="Section-wise attendance" sub="Every section in scope, including those with no register in the period.">
            {data.sections.length === 0 ? <EmptyNote icon="layers" title="No sections in scope" /> : (
              <div className="table-wrap">
                <table className="atn-table">
                  <thead>
                    <tr>
                      <th>Class</th><th>Section</th><th className="num">Students</th><th className="num">Days marked</th>
                      <th className="num">Present</th><th className="num">Late</th><th className="num">Half-Day</th><th className="num">Absent</th>
                      <th>Attendance</th><th>Last marked</th><th className="atn-table__act" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.sections.map((s) => (
                      <tr key={s._id}>
                        <td><b>{s.className}</b></td>
                        <td>{s.sectionName}</td>
                        <td className="num">{s.students}</td>
                        <td className="num">{s.days || <span className="atn-muted">0</span>}</td>
                        <td className="num">{s.present}</td>
                        <td className="num">{s.late}</td>
                        <td className="num">{s.halfDay || 0}</td>
                        <td className="num">{s.absent}</td>
                        <td><Meter value={s.percentage} low={data.threshold} /></td>
                        <td>{s.lastMarked ? fmtDay(s.lastMarked) : <span className="atn-muted">Never</span>}</td>
                        <td className="atn-table__act">
                          <RowActions>
                            <IconAction icon="clipboard" label="Open register"
                              onClick={() => onOpenRegister(s._id, s.lastMarked && s.lastMarked <= range.to ? s.lastMarked : todayKey())} />
                          </RowActions>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={`Students below ${data.threshold}%`}
            sub={data.totals.below > data.students.length
              ? `The ${data.students.length} lowest of ${data.totals.below}, lowest first.`
              : 'Lowest first. Students with no marks in the period are left out.'}
            actions={data.students.length ? (
              <button type="button" className="atn-btn-ghost" onClick={exportStudents}><Icon name="download" size={16} /> Export</button>
            ) : null}>
            {data.students.length === 0 ? (
              <EmptyNote icon="checkCircle" title={`No one is below ${data.threshold}%`}>Everyone with marks in this period is at or above the line.</EmptyNote>
            ) : (
              <div className="table-wrap">
                <table className="atn-table">
                  <thead>
                    <tr>
                      <th>Student</th><th>Class</th><th className="num">Present</th><th className="num">Late</th>
                      <th className="num">Half-Day</th><th className="num">Absent</th><th>Attendance</th><th className="atn-table__act" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((s) => (
                      <tr key={s._id} data-focus-id={s._id}>
                        <td>
                          <span className="atn-who">
                            <Avatar name={s.name} src={s.photo} size={32} />
                            <span><b>{s.name}</b>{s.rollNumber ? <small>Roll {s.rollNumber}</small> : null}</span>
                          </span>
                        </td>
                        <td>{s.className} {s.sectionName}</td>
                        <td className="num">{s.present}</td>
                        <td className="num">{s.late}</td>
                        <td className="num">{s.halfDay || 0}</td>
                        <td className="num">{s.absent}</td>
                        <td><Meter value={s.percentage} low={data.threshold} /></td>
                        <td className="atn-table__act">
                          <Link className="lact" to={`/admin/student-analytics/${s._id}`} title="Student analytics" aria-label={`Analytics for ${s.name}`}>
                            <Icon name="chart" size={16} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {isStaff && (
        <div className={loading ? 'atn-dim' : ''}>
          <div className="atn-rstats">
            <Stat tone="indigo" icon="users" label="Staff" value={data.totals.staff} caption="active teachers and admins" />
            <Stat tone="green" icon="checkCircle" label="Average attendance"
              value={data.totals.percentage == null ? '—' : `${data.totals.percentage}%`}
              caption={`${data.totals.present.toLocaleString('en-IN')} present days`} />
            <Stat tone="red" icon="closeCircle" label="Absent days" value={data.totals.absent.toLocaleString('en-IN')}
              caption="working days with no clock-in" />
            <Stat tone="amber" icon="umbrella" label="Leave days" value={(data.totals.leave + data.totals.halfDay).toLocaleString('en-IN')}
              caption={`${plural(data.totals.halfDay, 'half day')} among them`} />
          </div>
          <Card title="Staff attendance"
            sub={`${period}${data.window.until < data.window.to ? ` (counted to ${fmtDay(data.window.until)})` : ''} · from each person's joining date; weekends and holidays are left out.`}>
            {data.staff.length === 0 ? <EmptyNote icon="users" title="No staff" /> : (
              <div className="table-wrap">
                <table className="atn-table">
                  <thead>
                    <tr>
                      <th>Staff</th><th className="num">Working days</th><th className="num">Present</th>
                      <th className="num">Half-day</th><th className="num">Leave</th><th className="num">Absent</th><th>Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.staff].sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101) || a.name.localeCompare(b.name)).map((s) => (
                      <tr key={s._id} data-focus-id={s._id}>
                        <td>
                          <span className="atn-who">
                            <Avatar name={s.name} src={s.photo} size={32} />
                            <span>
                              <b>{s.name}</b>
                              <small>{[s.designation || ROLE_LABEL[s.role], s.department, s.employeeId].filter(Boolean).join(' · ')}</small>
                            </span>
                          </span>
                        </td>
                        <td className="num">{s.working}</td>
                        <td className="num">{s.present}</td>
                        <td className="num">{s.halfDay}</td>
                        <td className="num">{s.leave}</td>
                        <td className="num">{s.absent}</td>
                        <td><Meter value={s.percentage} low={75} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {!data && loading && <div className="atn-center"><Spinner /></div>}
    </div>
  );
}
