import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getMyBooks, getTeacherMyBooks, renewMyBook, renewTeacherBook } from '../../../api/library.api';
import { PageHeader, Table, Badge, Spinner, Button } from '../../../components/ui/index';
import { useAuth } from '../../../contexts/AuthContext';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function LibraryMyBooks() {
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const { data, loading, refetch } = useFetch(isTeacher ? getTeacherMyBooks : getMyBooks, [isTeacher]);
  const books = Array.isArray(data) ? data : [];
  const [renewing, setRenewing] = useState(null);

  // Extending a loan with nobody queued behind it never needed a trip to the
  // desk — the rules are the same either way, the server just had no route for
  // the member to ask.
  const renew = async (id) => {
    setRenewing(id);
    try {
      const res = await (isTeacher ? renewTeacherBook(id) : renewMyBook(id));
      toast.success(res?.message || 'Renewed');
      refetch();
    } catch (err) { toast.error(err?.message || 'Could not renew'); }
    finally { setRenewing(null); }
  };

  const now = new Date();
  const statusColor = (r) => {
    if (r.status === 'returned') return 'muted';
    if (r.isOverdue || (r.status === 'issued' && now > new Date(r.dueDate))) return 'danger';
    return 'success';
  };
  const statusLabel = (r) => {
    if (r.status === 'returned') return 'Returned';
    if (r.isOverdue || (r.status === 'issued' && now > new Date(r.dueDate))) return 'Overdue';
    return 'Issued';
  };

  const columns = [
    { key: 'book',     label: 'Book',     render: r => <div><div style={{ fontWeight:600 }}>{r.book?.title||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{(r.book?.authors||[]).join(', ')}</div></div> },
    { key: 'isbn',     label: 'ISBN',     render: r => r.book?.isbn || '—' },
    { key: 'copy',     label: 'Copy',     render: r => r.bookCopy?.uniqueCode || '—' },
    { key: 'issued',   label: 'Issued',   render: r => fmtDate(r.issueDate) },
    { key: 'due',      label: 'Due Date', render: r => {
      const overdue = r.status === 'issued' && now > new Date(r.dueDate);
      return <span style={{ color: overdue ? 'var(--danger)' : 'inherit', fontWeight: overdue ? 600 : 400 }}>{fmtDate(r.dueDate)}</span>;
    }},
    { key: 'status',   label: 'Status',   render: r => <Badge variant={statusColor(r)}>{statusLabel(r)}</Badge> },
    { key: 'renewals', label: 'Renewals', render: r => r.renewalCount ?? 0 },
    { key: 'actions',  label: '', render: r => (
      r.status === 'returned' || r.status === 'lost' ? null : (
        <Button size="sm" variant="secondary" loading={renewing === r._id} onClick={() => renew(r._id)}>
          Renew
        </Button>
      )
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="My Books" subtitle="Currently borrowed and past books" />
      <div className="card">
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={books} emptyIcon="📚" emptyTitle="No books borrowed" />}
        </div>
      </div>
    </div>
  );
}
