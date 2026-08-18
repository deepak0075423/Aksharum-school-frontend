import React from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getOrgStructure } from '../../api/employeeDirectory.api';
import { PageHeader, Empty, Alert, Badge } from '../../components/ui/index';
import { SkeletonRows, ErrorState, Avatar, useDirectoryBase, STATUS_TONE, STATUS_LABEL } from './parts';

// Two views of the same staff: the reporting tree when reporting managers have
// been set, and the department → designation grouping the ERP always has.

function Node({ n, base, depth = 0 }) {
  return (
    <div style={{ marginLeft: depth ? 22 : 0, borderLeft: depth ? '2px solid var(--border)' : 'none', paddingLeft: depth ? 14 : 0 }}>
      <Link to={`${base}/employees/${n._id}`}
        style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', textDecoration: 'none', color: 'inherit' }}>
        <Avatar name={n.name} src={n.profileImage} size={32} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: '.9rem' }}>{n.name}</span>
          <span className="text-muted text-sm" style={{ display: 'block' }}>
            {[n.designation, n.department].filter(Boolean).join(' · ') || 'No designation'}
          </span>
        </span>
        <Badge variant={STATUS_TONE[n.employmentStatus]}>{STATUS_LABEL[n.employmentStatus]}</Badge>
      </Link>
      {n.children.map((c) => <Node key={c._id} n={c} base={base} depth={depth + 1} />)}
    </div>
  );
}

export default function OrgStructure() {
  const { base } = useDirectoryBase();
  const { data, loading, error, refetch } = useFetch(getOrgStructure, []);

  if (loading) return <div className="page"><PageHeader title="Organization Structure" /><SkeletonRows rows={8} cols={2} /></div>;
  if (error)   return <div className="page"><PageHeader title="Organization Structure" /><ErrorState error={error} onRetry={refetch} /></div>;

  const tree = data?.tree || [];
  const byDep = data?.byDepartment || [];

  return (
    <div className="page">
      <PageHeader title="Organization Structure" subtitle="Built from the reporting lines, departments and designations already on the employee records" />

      {!data?.hasReportingLines && (
        <Alert variant="info">
          No reporting manager has been set yet, so everyone sits at the top level.
          Set one on an employee's <strong>Employment</strong> tab to build the tree.
        </Alert>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginTop: 16 }}>
        <div className="card">
          <div className="card-header"><h2>Reporting Structure</h2></div>
          <div className="card-body">
            {tree.length === 0
              ? <Empty icon="🏗️" title="No employees found." />
              : tree.map((n) => <Node key={n._id} n={n} base={base} />)}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>By Department &amp; Designation</h2></div>
          <div className="card-body">
            {byDep.length === 0
              ? <Empty icon="🏢" title="No departments yet" />
              : byDep.map((d) => (
                <div key={d.department} style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: '.92rem', marginBottom: 6 }}>
                    {d.department} <span className="text-muted" style={{ fontWeight: 400 }}>({d.total})</span>
                  </div>
                  {d.designations.map((g) => (
                    <div key={g.designation} style={{ marginLeft: 14, borderLeft: '2px solid var(--border)', paddingLeft: 12, marginBottom: 8 }}>
                      <div className="text-sm" style={{ fontWeight: 600 }}>{g.designation}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        {g.members.map((m) => (
                          <Link key={m._id} to={`${base}/employees/${m._id}`} className="badge badge-muted" style={{ textDecoration: 'none' }}>
                            {m.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
