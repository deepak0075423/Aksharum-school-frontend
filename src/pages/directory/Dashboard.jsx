/**
 * Employee Directory — the overview.
 *
 * The landing page answers three questions in order: how many staff and of what
 * kind, where the gaps are, and what to do next. It reads one endpoint
 * (/employee-directory/dashboard) and every number on it is counted from records
 * the ERP already holds — accounts, profiles, assignments, verifications.
 * Nothing is seeded or estimated: an empty school shows zeros.
 *
 * On the figures: a two-slice ring and a rainbow of departments were both traded
 * for forms that survive their own data — see the notes in overviewParts.jsx.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getDashboard } from '../../api/employeeDirectory.api';
import Icon from '../../components/ui/icons';
import { VIZ } from '../analytics/palette';
import { Skeleton, ErrorState, useDirectoryBase } from './parts';
import {
  ActionGrid, COMPLETION_STEPS, FigureTable, GroupPicker, Hero, Panel, PanelLink,
  PendingList, RankedBars, RecentList, SERIES, ShareBar, StatTile, pct,
} from './overviewParts';

const GROUPS = [
  { value: 'staffType',   label: 'By employment type' },
  { value: 'department',  label: 'By department' },
  { value: 'designation', label: 'By designation' },
  { value: 'status',      label: 'By status' },
];

// Past eight categories the palette is out of slots, and a ninth hue would be
// indistinguishable from one already on screen — so the tail folds into Other
// rather than being given a colour that lies about being separate.
const MAX_SLICES = 8;

function foldToSlices(list) {
  if (list.length <= MAX_SLICES) return list;
  const head = list.slice(0, MAX_SLICES - 1);
  const tail = list.slice(MAX_SLICES - 1);
  return [...head, { label: `Other (${tail.length})`, count: tail.reduce((s, x) => s + x.count, 0) }];
}

export default function DirectoryDashboard() {
  const { base } = useDirectoryBase();
  const { data, loading, error, refetch } = useFetch(getDashboard, []);
  const [group, setGroup] = useState('staffType');

  const t = data?.totals || {};
  const total = t.employees ?? 0;

  // Every grouping the picker offers, built from what one dashboard call
  // already returned — switching it costs no request.
  const slices = useMemo(() => {
    // Read the totals off `data` rather than the destructured `t`: that is a
    // fresh object every render, and depending on it would recompute always.
    const tt = data?.totals || {};
    const named = {
      staffType: [
        { label: 'Teaching Staff',     count: tt.teaching ?? 0 },
        { label: 'Non-Teaching Staff', count: tt.nonTeaching ?? 0 },
      ],
      status: [
        { label: 'Active',    count: tt.active ?? 0 },
        { label: 'On Leave',  count: tt.onLeave ?? 0 },
        { label: 'Inactive',  count: tt.inactive ?? 0 },
      ],
      department:  data?.byDepartment  || [],
      designation: data?.byDesignation || [],
    }[group] || [];
    return foldToSlices(named).map((s, i) => ({ ...s, color: SERIES[i % SERIES.length] }));
  }, [group, data]);

  if (loading) {
    return (
      <div className="page edo">
        <style>{'@keyframes edPulse{0%,100%{opacity:1}50%{opacity:.45}}'}</style>
        <Skeleton h={92} r={16} />
        <div className="edo-stats">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={94} r={16} />)}
        </div>
        <div className="edo-grid">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} h={300} r={16} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page edo">
        <h1 className="edo-title">Employee Directory</h1>
        <ErrorState error={error} onRetry={refetch} title="Could not load the overview" />
      </div>
    );
  }

  const buckets = data?.completionBuckets || {};
  const completionParts = [
    { label: 'Fully complete', count: buckets.complete   ?? 0, color: COMPLETION_STEPS[2] },
    { label: 'In progress',    count: buckets.inProgress ?? 0, color: COMPLETION_STEPS[1] },
    { label: 'Not started',    count: buckets.notStarted ?? 0, color: COMPLETION_STEPS[0] },
  ];
  const growth = data?.growthPct;

  return (
    <div className="page edo">
      <div className="breadcrumb">
        <Link to="/admin/dashboard">Dashboard</Link>
        <span aria-hidden>›</span>
        <Link to={`${base}/employees`}>Employee Directory</Link>
        <span aria-hidden>›</span>
        <span>Overview</span>
      </div>

      <header className="edo-head">
        <div className="edo-head__text">
          <h1 className="edo-title">Employee Directory</h1>
          <p>Manage your school’s staff, departments and access settings from one place.</p>
        </div>
        <blockquote className="edo-quote">
          <Icon name="users" size={22} />
          <p>Empowered educators build brighter futures.</p>
        </blockquote>
        {/* The directory only ever reports the active year, so this states which
            one rather than pretending to be a switcher for years it cannot load. */}
        <div className="edo-year">
          <Icon name="calendarDays" size={18} />
          <span>
            <small>Academic Year</small>
            {data?.academicYear || 'Not set'}
          </span>
        </div>
      </header>

      <div className="edo-stats">
        <StatTile icon={<Icon name="users" size={22} />} tone="indigo" value={total}
          label="Total Employees" to={`${base}/employees`}
          captionTone={growth > 0 ? 'up' : undefined}
          caption={growth == null ? 'On the books today' : `↑ ${growth}% joined this year`} />
        <StatTile icon={<Icon name="checkCircle" size={22} />} tone="green" value={t.active}
          label="Active Employees" caption={`${pct(t.active ?? 0, total)}% of total`}
          to={`${base}/employees?status=active`} />
        <StatTile icon={<Icon name="power" size={22} />} tone="pink" value={t.inactive}
          label="Inactive Employees" caption={`${pct(t.inactive ?? 0, total)}% of total`}
          to={`${base}/employees?status=inactive`} />
        <StatTile icon={<Icon name="teacher" size={22} />} tone="purple" value={t.teaching}
          label="Teaching Staff" caption={`${pct(t.teaching ?? 0, total)}% of total`}
          to={`${base}/employees?staffType=teaching`} />
        <StatTile icon={<Icon name="badge" size={22} />} tone="amber" value={t.nonTeaching}
          label="Non-Teaching Staff" caption={`${pct(t.nonTeaching ?? 0, total)}% of total`}
          to={`${base}/employees?staffType=non_teaching`} />
        <StatTile icon={<Icon name="userPlus" size={22} />} tone="blue" value={t.newThisYear}
          label="New Joiners" caption="This academic year"
          to={`${base}/employees?sortBy=joiningDate&sortDir=desc`} />
      </div>

      <div className="edo-grid">
        <Panel title="Employee Distribution"
          action={<GroupPicker value={group} onChange={setGroup} options={GROUPS} />}>
          <ShareBar parts={slices} total={slices.reduce((s, x) => s + x.count, 0)}
            empty="No staff on the books yet." />
          <FigureTable caption={GROUPS.find((g) => g.value === group).label.replace('By ', '')}
            rows={slices} total={slices.reduce((s, x) => s + x.count, 0)} />
        </Panel>

        <Panel title="Department-wise Staff" action={<PanelLink to={`${base}/departments`} />}>
          <RankedBars
            items={(data?.byDepartment || []).slice(0, 6)}
            hrefFor={(d) => `${base}/employees?department=${encodeURIComponent(d.label === 'Unassigned' ? '' : d.label)}`}
            empty="Assign a department on an employee's Employment tab and it will appear here." />
        </Panel>

        <Panel title="Recent Employees" action={<PanelLink to={`${base}/employees?sortBy=joiningDate&sortDir=desc`} />}>
          <RecentList items={data?.recentEmployees || []} base={base}
            empty="Nobody has a joining date on file yet, so there is nothing to order by." />
        </Panel>
      </div>

      <div className="edo-grid">
        <Panel title="Profile Completion"
          action={<PanelLink to={`${base}/employees?completion=incomplete`}>View Details</PanelLink>}>
          <Hero value={data?.averageCompletion ?? 0} label="Average completion"
            sub={`Across ${total} employee${total === 1 ? '' : 's'}`}
            tone={(data?.averageCompletion ?? 0) >= 75 ? VIZ.good : (data?.averageCompletion ?? 0) >= 50 ? VIZ.warn : VIZ.accent} />
          <ShareBar parts={completionParts} total={total} empty="No profiles to measure yet." />
          <p className="edo-note">
            <Icon name="alert" size={15} />
            Measured against the fields the teacher intake form requires. Encourage staff to finish
            their profiles so payroll, verification and the directory all read from complete records.
          </p>
        </Panel>

        <Panel title="Pending Items" action={<PanelLink to={`${base}/verification`} />}>
          <PendingList items={[
            {
              label: 'Pending Verifications', sub: 'Review employee documents', tone: 'amber',
              icon: <Icon name="fileCheck" size={18} />, count: t.pendingVerification ?? 0,
              to: `${base}/verification`,
            },
            {
              label: 'Incomplete Profiles', sub: 'Ask employees to complete', tone: 'orange',
              icon: <Icon name="clipboard" size={18} />, count: t.incompleteProfiles ?? 0,
              to: `${base}/employees?completion=incomplete`,
            },
            {
              label: 'New Joiners', sub: 'Complete onboarding', tone: 'blue',
              icon: <Icon name="userPlus" size={18} />, count: t.newThisYear ?? 0,
              to: `${base}/employees?sortBy=joiningDate&sortDir=desc`,
            },
            {
              label: 'Documents Need Attention', sub: 'Verify or re-upload documents', tone: 'pink',
              icon: <Icon name="files" size={18} />, count: t.documentsNeedAttention ?? 0,
              to: `${base}/employees?completion=incomplete`,
            },
          ]} />
        </Panel>

        <Panel title="Quick Actions" className="edo-panel--actions">
          <ActionGrid items={[
            { label: 'Add Employee',        tone: 'indigo', icon: <Icon name="userPlus" size={20} />, to: '/admin/teachers' },
            { label: 'Manage Departments',  tone: 'blue',   icon: <Icon name="building" size={20} />, to: `${base}/departments` },
            { label: 'Manage Designations', tone: 'green',  icon: <Icon name="badge" size={20} />,    to: '/admin/designations' },
            { label: 'Organization',        tone: 'amber',  icon: <Icon name="layers" size={20} />,   to: `${base}/org-structure` },
            { label: 'Verification',        tone: 'pink',   icon: <Icon name="fileCheck" size={20} />, to: `${base}/verification` },
            { label: 'View Reports',        tone: 'purple', icon: <Icon name="chart" size={20} />,    to: `${base}/reports` },
          ]} />
          <Link to={`${base}/employees`} className="btn btn-primary edo-actions__all">
            <Icon name="users" size={17} /> View All Employees <Icon name="arrowRight" size={15} />
          </Link>
        </Panel>
      </div>
    </div>
  );
}
