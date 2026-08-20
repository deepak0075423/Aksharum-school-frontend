import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getParentOverview } from '../../../api/library.api';
import { PageHeader, Table, Badge, Spinner } from '../../../components/ui/index';
import { useAuth } from '../../../contexts/AuthContext';
import FinePayments from '../../../components/library/FinePayments';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function LibraryParentOverview() {
  const { user } = useAuth();
  const { data, loading } = useFetch(getParentOverview);
  const children = data?.children || [];

  const now = new Date();
  const issuanceColor = (r) => {
    if (r.status === 'returned') return 'muted';
    if (r.isOverdue || (r.status === 'issued' && now > new Date(r.dueDate))) return 'danger';
    return 'success';
  };
  const issuanceLabel = (r) => {
    if (r.status === 'returned') return 'Returned';
    if (r.isOverdue || (r.status === 'issued' && now > new Date(r.dueDate))) return 'Overdue';
    return 'Issued';
  };


  const bookColumns = [
    { key: 'book',    label: 'Book',     render: r => <div><div style={{ fontWeight:600 }}>{r.book?.title||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{(r.book?.authors||[]).join(', ')}</div></div> },
    { key: 'issued',  label: 'Issued',   render: r => fmtDate(r.issueDate) },
    { key: 'due',     label: 'Due Date', render: r => {
      const overdue = r.status === 'issued' && now > new Date(r.dueDate);
      return <span style={{ color: overdue ? 'var(--danger)' : 'inherit', fontWeight: overdue ? 600 : 400 }}>{fmtDate(r.dueDate)}</span>;
    }},
    { key: 'status',  label: 'Status',   render: r => <Badge variant={issuanceColor(r)}>{issuanceLabel(r)}</Badge> },
  ];


  return (
    <div className="page">
      <PageHeader title="Library Overview" subtitle="Child's library activity" />
      {loading ? (
        <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
      ) : children.length === 0 ? (
        <div className="card"><div className="card-body" style={{ textAlign:'center', color:'var(--text-muted)', padding:48 }}>No library data available</div></div>
      ) : children.map((child) => {
        const pendingFines = (child.fines||[]).filter(f => f.status === 'pending');
        const totalDue = pendingFines.reduce((s, f) => s + (f.amount||0), 0);
        return (
          <div key={child.childId?._id || child.childId} style={{ marginBottom:32 }}>
            <h3 style={{ marginBottom:12 }}>{child.childId?.name || 'Child'}</h3>

            <div style={{ marginBottom:16 }}>
              <h4 style={{ marginBottom:8, fontSize:'.95rem', color:'var(--text-muted)' }}>Books Borrowed</h4>
              <div className="card">
                <div className="card-body" style={{ padding:0 }}>
                  <Table columns={bookColumns} data={child.issuances||[]} emptyIcon="📚" emptyTitle="No books borrowed" />
                </div>
              </div>
            </div>
            <div>
              {/* Same component the child sees, scoped to this child — a parent
                  can settle the fine here and open the receipt afterwards. */}
              <FinePayments
                forUserId={child.childId?._id || child.childId}
                payerName={user?.name}
                title={`Fines — ${child.childId?.name || 'child'}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
