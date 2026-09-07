/**
 * What reports this school actually has, and how one is drawn.
 *
 * There is no reports engine here: every entry is a real screen somewhere else
 * in the app, which is the whole point of the page — an admin looking for "what
 * did we collect this term" should not have to remember that it lives three
 * clicks inside Fees. So the catalogue is a hand-kept list of destinations that
 * exist, each gated on the module that owns it, and nothing is listed that a
 * school cannot open.
 *
 * Same file convention as settingsParts.jsx and subjectParts.jsx.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';

export const GROUPS = [
  { key: 'academic',   label: 'Academic',   icon: 'chart',    tone: 'indigo',
    blurb: 'What is being taught, who turned up, and how they did.' },
  { key: 'finance',    label: 'Finance',    icon: 'wallet',   tone: 'green',
    blurb: 'Money in and money out, by term and by head.' },
  { key: 'people',     label: 'People',     icon: 'users',    tone: 'amber',
    blurb: 'Staff records, leave and the feedback students give.' },
  { key: 'operations', label: 'Operations', icon: 'package',  tone: 'blue',
    blurb: 'The library, the stores, the buses and the hostel.' },
];

/**
 * Every report screen this app has, with the module that owns it.
 *
 * `module: null` means the page is part of the admin core rather than a module,
 * so it is always available. Anything else is hidden unless the school runs
 * that module AND the signed-in admin reaches it — both of which `isEnabled`
 * already answers together.
 */
export const REPORTS = [
  // ── Academic ───────────────────────────────────────────────────────────────
  { group: 'academic', module: 'result', icon: 'chart', to: '/admin/results',
    label: 'Exam results',
    desc: 'Formal exam status, marks under review and what has been published.' },
  { group: 'academic', module: 'aptitudeExam', icon: 'fileCheck', to: '/admin/exams',
    label: 'Aptitude exams',
    desc: 'Every exam across the school, with attempt and result status.' },
  { group: 'academic', module: 'attendance', icon: 'checkSquare', to: '/admin/attendance',
    label: 'Attendance',
    desc: 'Daily marking, section summaries and the teacher regularisation queue.' },
  { group: 'academic', module: 'timetable', icon: 'clock', to: '/admin/timetable/reports',
    label: 'Timetable reports',
    desc: 'Period load per class and per teacher, and where the gaps are.' },
  { group: 'academic', module: null, icon: 'activity', to: '/admin/student-analytics',
    label: 'Student analytics',
    desc: 'One student at a time — attendance, marks, fees and behaviour together.' },

  // ── Finance ────────────────────────────────────────────────────────────────
  { group: 'finance', module: 'fees', icon: 'trending', to: '/admin/fees/reports',
    label: 'Fee collection & dues',
    desc: 'Collection summaries, outstanding dues and concessions granted.' },
  { group: 'finance', module: 'fees', icon: 'wallet', to: '/admin/fees/dashboard',
    label: 'Fees overview',
    desc: 'Collection progress against the term, and recent transactions.' },
  { group: 'finance', module: 'payroll', icon: 'banknote', to: '/admin/payroll/dashboard',
    label: 'Payroll summary',
    desc: 'Run totals — gross, deductions and net paid out.' },
  { group: 'finance', module: 'payroll', icon: 'files', to: '/admin/payroll/runs',
    label: 'Payroll runs',
    desc: 'Every run, its approval state and the payslips it produced.' },
  { group: 'finance', module: 'library', icon: 'creditCard', to: '/admin/library/fines',
    label: 'Library fines',
    desc: 'Overdue and damage charges, paid and outstanding.' },
  { group: 'finance', module: 'transport', icon: 'files', to: '/admin/transport/invoices',
    label: 'Transport invoices',
    desc: 'Route fees raised against students, and what has been settled.' },

  // ── People ─────────────────────────────────────────────────────────────────
  { group: 'people', module: 'leave', icon: 'umbrella', to: '/admin/leave',
    label: 'Leave reports',
    desc: 'Leave taken and left per teacher, with an Excel export.' },
  { group: 'people', module: 'employeeDirectory', icon: 'folder', to: '/admin/employee-directory/reports',
    label: 'Employee reports',
    desc: 'Headcount, departments, verification status and joining trends.' },
  { group: 'people', module: 'feedback', icon: 'star', to: '/admin/feedback/reports',
    label: 'Teacher feedback',
    desc: 'Campaign results per teacher, within the privacy threshold.' },
  { group: 'people', module: 'feedback', icon: 'trending', to: '/admin/feedback/trends',
    label: 'Feedback trends',
    desc: 'How scores have moved across campaigns and departments.' },

  // ── Operations ─────────────────────────────────────────────────────────────
  { group: 'operations', module: 'library', icon: 'bookOpen', to: '/admin/library/dashboard',
    label: 'Library overview',
    desc: 'Circulation, overdue books, reservations and fines at a glance.' },
  { group: 'operations', module: 'library', icon: 'chart', to: '/admin/library/reports',
    label: 'Library reports',
    desc: 'Issues and returns over time, popular titles and dormant stock.' },
  { group: 'operations', module: 'inventory', icon: 'package', to: '/admin/inventory/dashboard',
    label: 'Inventory overview',
    desc: 'Stock on hand, low-stock items, and what is out on issue.' },
  { group: 'operations', module: 'inventory', icon: 'clipboard', to: '/admin/inventory/audit',
    label: 'Stock audit',
    desc: 'Counted against recorded, and every adjustment made since.' },
  { group: 'operations', module: 'transport', icon: 'bus', to: '/admin/transport/reports',
    label: 'Transport reports',
    desc: 'Trips run, fuel and maintenance spend, incidents and complaints.' },
  { group: 'operations', module: 'hostel', icon: 'hotel', to: '/admin/hostel/dashboard',
    label: 'Hostel overview',
    desc: 'Occupancy, room allocation, mess charges and pending requests.' },
];

/** The catalogue narrowed to what this school runs, grouped in display order. */
export const catalogue = (isEnabled) => GROUPS
  .map((g) => ({
    ...g,
    reports: REPORTS.filter((r) => r.group === g.key && (!r.module || isEnabled(r.module))),
  }))
  .filter((g) => g.reports.length > 0);

// ── Cards ────────────────────────────────────────────────────────────────────

/** One report: what it answers, and one click to it. */
export const ReportCard = ({ report, tone }) => (
  <Link to={report.to} className="repcard">
    <span className={`repcard__icon tint-${tone}`}><Icon name={report.icon} size={19} /></span>
    <span className="repcard__body">
      <span className="repcard__label">{report.label}</span>
      <span className="repcard__desc">{report.desc}</span>
    </span>
    <Icon name="chevronRight" size={16} />
  </Link>
);

/** A titled set of reports — the heading says what the whole group is for. */
export const ReportGroup = ({ group }) => (
  <section className="repgroup">
    <header className="repgroup__head">
      <span className={`repgroup__icon tint-${group.tone}`}><Icon name={group.icon} size={18} /></span>
      <div>
        <h2>{group.label} reports</h2>
        <p>{group.blurb}</p>
      </div>
      <span className="repgroup__count">{group.reports.length}</span>
    </header>
    <div className="repgroup__grid">
      {group.reports.map((r) => <ReportCard key={r.to + r.label} report={r} tone={group.tone} />)}
    </div>
  </section>
);

/**
 * The figure, and how much of it is new this month.
 *
 * `growth` counts rows created since the 1st — it is an intake figure, not a
 * net change, so it is only ever shown as an addition and never as a trend.
 */
export const HeadCount = ({ icon, tone, value, label, added, caption }) => (
  <div className="lstat">
    <span className={`lstat__icon tint-${tone}`}><Icon name={icon} size={24} /></span>
    <span className="lstat__body">
      <span className="lstat__value">{value ?? 0}</span>
      <span className="lstat__label">{label}</span>
      <span className="lstat__cap">
        {added > 0
          ? <span className="repup"><Icon name="arrowUp" size={11} /> {added} joined this month</span>
          : caption}
      </span>
    </span>
  </div>
);

/** Where the reports that are not here have gone. */
export const MissingPanel = ({ hidden }) => (
  <section className="lpanel lhelp">
    <span className="lhelp__mark"><Icon name="lifebuoy" size={22} /></span>
    <div className="lhelp__body">
      <h2>Not finding a report?</h2>
      <p>
        Every report here lives inside the module that owns it — this page is the shortest way to it,
        not a copy of it, so what you open is always the live screen.
        {hidden > 0
          ? ` ${hidden} report${hidden === 1 ? '' : 's'} ${hidden === 1 ? 'is' : 'are'} hidden because your school does not run the module behind ${hidden === 1 ? 'it' : 'them'}.`
          : ' Every module your school runs is represented above.'}
      </p>
      <Link to="/chat" className="btn btn-secondary">
        Ask for a report <Icon name="arrowRight" size={15} />
      </Link>
    </div>
  </section>
);
