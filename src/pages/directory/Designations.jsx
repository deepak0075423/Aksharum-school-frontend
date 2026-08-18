import React from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getDesignations } from '../../api/employeeDirectory.api';
import { PageHeader, Empty, Badge } from '../../components/ui/index';
import { SkeletonRows, ErrorState, useDirectoryBase } from './parts';

// A read-only roll-up of the school's designations. The designations themselves
// — and the module permissions each one grants — are managed on
// Admin → Designations, which stays the single place they are edited.

export default function Designations() {
  const { base, isDirectoryAdmin } = useDirectoryBase();
  const { data, loading, error, refetch } = useFetch(getDesignations, []);

  if (loading) return <div className="page"><PageHeader title="Designations" /><SkeletonRows rows={6} cols={3} /></div>;
  if (error)   return <div className="page"><PageHeader title="Designations" /><ErrorState error={error} onRetry={refetch} /></div>;

  const list = data?.designations || [];
  return (
    <div className="page">
      <PageHeader
        title="Designations"
        subtitle="Headcount per designation. Permissions are managed under Designations in school settings."
        action={isDirectoryAdmin && <Link className="btn btn-secondary" to="/admin/designations">Manage permissions</Link>}
      />
      {list.length === 0
        ? <Empty icon="🎫" title="No employees found." message="Designations appear once employees have one assigned." />
        : (
          <div className="card"><div className="table-wrap">
            <table className="table">
              <thead><tr><th>Designation</th><th>Employees</th><th>Active</th><th>Members</th><th /></tr></thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.name}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td><Badge variant="primary">{d.total}</Badge></td>
                    <td>{d.active}</td>
                    <td style={{ fontSize: '.82rem' }}>
                      {d.members.slice(0, 4).map((m) => (
                        <Link key={m._id} to={`${base}/employees/${m._id}`} style={{ marginRight: 8 }}>{m.name}</Link>
                      ))}
                      {d.members.length > 4 && <span className="text-muted">+{d.members.length - 4} more</span>}
                    </td>
                    <td>
                      <Link className="btn btn-secondary btn-sm"
                        to={`${base}/employees?designation=${encodeURIComponent(d.name === 'Unassigned' ? '' : d.name)}`}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        )}
    </div>
  );
}
