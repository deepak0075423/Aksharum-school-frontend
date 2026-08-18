import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getDepartments } from '../../api/employeeDirectory.api';
import { PageHeader, Empty, Badge } from '../../components/ui/index';
import { SkeletonCards, ErrorState, Avatar, Chips, useDirectoryBase } from './parts';

// Departments are the distinct values already stored on the employee records.
// There is no department master table: renaming one means editing the employees
// in it, which happens on the Employment tab of a profile.

export default function Departments() {
  const { base } = useDirectoryBase();
  const { data, loading, error, refetch } = useFetch(getDepartments, []);
  const [open, setOpen] = useState('');

  if (loading) return <div className="page"><PageHeader title="Departments" /><SkeletonCards count={6} /></div>;
  if (error)   return <div className="page"><PageHeader title="Departments" /><ErrorState error={error} onRetry={refetch} /></div>;

  const list = data?.departments || [];
  if (!list.length) {
    return (
      <div className="page">
        <PageHeader title="Departments" />
        <Empty icon="🏢" title="No employees found." message="Departments appear once employees have one set on their record." />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Departments" subtitle="Grouped from the department field on each employee record" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
        {list.map((d) => (
          <div key={d.name} className="card">
            <div className="card-header">
              <h2>{d.name}</h2>
              <Badge variant={d.name === 'Unassigned' ? 'muted' : 'primary'}>{d.total}</Badge>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', gap: 14, fontSize: '.82rem', marginBottom: 12 }}>
                <span><strong>{d.active}</strong> <span className="text-muted">active</span></span>
                <span><strong>{d.teaching}</strong> <span className="text-muted">teaching</span></span>
                <span><strong>{d.nonTeaching}</strong> <span className="text-muted">non-teaching</span></span>
              </div>
              <Chips items={d.designations} max={4} empty="No designations" />
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setOpen(open === d.name ? '' : d.name)}>
                  {open === d.name ? 'Hide members' : `Show ${d.members.length} members`}
                </button>
              </div>
              {open === d.name && (
                <div style={{ marginTop: 10 }}>
                  {d.members.map((m) => (
                    <Link key={m._id} to={`${base}/employees/${m._id}`}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                      <Avatar name={m.name} size={26} />
                      <span style={{ flex: 1, fontSize: '.85rem' }}>{m.name}</span>
                      <span className="text-muted text-sm">{m.designation || '—'}</span>
                    </Link>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <Link className="btn btn-secondary btn-sm"
                  to={`${base}/employees?department=${encodeURIComponent(d.name === 'Unassigned' ? '' : d.name)}`}>
                  Open in directory →
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
