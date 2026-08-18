import React from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getDashboard } from '../../api/employeeDirectory.api';
import { PageHeader, StatCard, Empty } from '../../components/ui/index';
import { Section, Skeleton, ErrorState, Meter, useDirectoryBase } from './parts';

// Every number here is counted from the employee records the ERP already
// holds — accounts, profiles, assignments, approved leave. Nothing is seeded
// or estimated: an empty school shows zeros.

const Bar = ({ label, count, max, to }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.83rem', marginBottom: 4 }}>
      {to ? <Link to={to} style={{ fontWeight: 500 }}>{label}</Link> : <span style={{ fontWeight: 500 }}>{label}</span>}
      <span className="text-muted">{count}</span>
    </div>
    <Meter value={max ? (count / max) * 100 : 0} tone="var(--primary)" />
  </div>
);

export default function DirectoryDashboard() {
  const { base } = useDirectoryBase();
  const { data, loading, error, refetch } = useFetch(getDashboard, []);

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="Employee Directory" subtitle="Loading…" />
        <style>{'@keyframes edPulse{0%,100%{opacity:1}50%{opacity:.45}}'}</style>
        <div className="stat-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="stat-card"><Skeleton h={54} /></div>
          ))}
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        <PageHeader title="Employee Directory" />
        <ErrorState error={error} onRetry={refetch} title="Could not load the dashboard" />
      </div>
    );
  }

  const t = data?.totals || {};
  const maxDep = Math.max(1, ...(data?.byDepartment || []).map((d) => d.count));
  const maxDes = Math.max(1, ...(data?.byDesignation || []).map((d) => d.count));

  return (
    <div className="page">
      <PageHeader
        title="Employee Directory"
        subtitle={data?.academicYear ? `Academic year ${data.academicYear}` : 'Staff overview for your school'}
        action={<Link className="btn btn-primary" to={`${base}/employees`}>View all employees</Link>}
      />

      <div className="stat-grid">
        <StatCard icon="👥" color="blue"   label="Total Employees"   value={t.employees ?? 0} />
        <StatCard icon="✅" color="green"  label="Active"            value={t.active ?? 0} />
        <StatCard icon="🚫" color="red"    label="Inactive"          value={t.inactive ?? 0} />
        <StatCard icon="🏖️" color="orange" label="On Leave Today"    value={t.onLeave ?? 0} />
        <StatCard icon="👨‍🏫" color="purple" label="Teaching Staff"    value={t.teaching ?? 0} />
        <StatCard icon="🧰" color="teal"   label="Non-Teaching"      value={t.nonTeaching ?? 0} />
        <StatCard icon="🏛️" color="blue"   label="Class Teachers"    value={t.classTeachers ?? 0} />
        <StatCard icon="🆕" color="green"  label="Joined (3 months)" value={t.newJoiners ?? 0} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginTop: 16 }}>
        <div className="stat-grid" style={{ gridTemplateColumns: '1fr', gap: 12 }}>
          <Link to={`${base}/employees?completion=incomplete`} style={{ textDecoration: 'none' }}>
            <StatCard icon="📝" color="orange" label="Incomplete Profiles" value={t.incompleteProfiles ?? 0} />
          </Link>
          <Link to={`${base}/verification`} style={{ textDecoration: 'none' }}>
            <StatCard icon="🔎" color="purple" label="Pending Verification" value={t.pendingVerification ?? 0} />
          </Link>
          <Link to={`${base}/employees?completion=incomplete`} style={{ textDecoration: 'none' }}>
            <StatCard icon="📄" color="red" label="Documents Need Attention" value={t.documentsNeedAttention ?? 0} />
          </Link>
        </div>

        <Section title="Profile completion" subtitle="Measured against the fields the teacher intake form requires">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: '2rem', fontWeight: 700 }}>{data?.averageCompletion ?? 0}%</span>
            <span className="text-muted text-sm">average across {t.employees ?? 0} employees</span>
          </div>
          <Meter value={data?.averageCompletion ?? 0} />
          <div style={{ marginTop: 16 }}>
            <div className="text-muted text-sm" style={{ marginBottom: 8, fontWeight: 600 }}>Needs the most work</div>
            {(data?.lowestCompletion || []).length === 0
              ? <span className="text-muted text-sm">Every profile is complete.</span>
              : (data.lowestCompletion).map((e) => (
                <div key={e._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '.85rem' }}>
                  <Link to={`${base}/employees/${e._id}`}>{e.name}{e.employeeId ? ` · ${e.employeeId}` : ''}</Link>
                  <span className="text-muted">{e.percent}%</span>
                </div>
              ))}
          </div>
        </Section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginTop: 16 }}>
        <Section title="By department" subtitle="Read from each employee record">
          {(data?.byDepartment || []).length === 0
            ? <Empty icon="🏢" title="No departments yet" message="Assign a department on an employee's Employment tab and it will appear here." />
            : data.byDepartment.map((d) => (
              <Bar key={d.label} label={d.label} count={d.count} max={maxDep}
                to={`${base}/employees?department=${encodeURIComponent(d.label === 'Unassigned' ? '' : d.label)}`} />
            ))}
        </Section>
        <Section title="By designation" subtitle="The school's designation list">
          {(data?.byDesignation || []).length === 0
            ? <Empty icon="🎫" title="No designations yet" />
            : data.byDesignation.map((d) => (
              <Bar key={d.label} label={d.label} count={d.count} max={maxDes}
                to={`${base}/employees?designation=${encodeURIComponent(d.label === 'Unassigned' ? '' : d.label)}`} />
            ))}
        </Section>
      </div>
    </div>
  );
}
