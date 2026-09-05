import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getMyBooks, getTeacherMyBooks, renewMyBook, renewTeacherBook } from '../../../api/library.api';
import { PageHeader, Table, Badge, Spinner, Button } from '../../../components/ui/index';
import { useAuth } from '../../../contexts/AuthContext';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const rupees  = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// LibraryIssuance.status: issued | returned | overdue | lost. 'lost' used to
// fall through the label ladder and come out as "Issued" — a student who had
// paid for a book they lost was still shown as holding it.
const STATUS = {
  issued:   { label: 'Issued',   variant: 'success' },
  overdue:  { label: 'Overdue',  variant: 'danger'  },
  returned: { label: 'Returned', variant: 'muted'   },
  lost:     { label: 'Lost',     variant: 'warning' },
};

// The fine on a loan, once every charge against it is added up.
const PAYMENT = {
  pending: { label: 'Unpaid',  variant: 'danger'  },
  paid:    { label: 'Paid',    variant: 'success' },
  waived:  { label: 'Waived',  variant: 'muted'   },
};

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
  // A loan the server has not swept to 'overdue' yet is still overdue to the
  // person holding it, so the due date decides the badge for an open loan.
  const statusOf = (r) => (
    (r.status === 'issued' && (r.isOverdue || now > new Date(r.dueDate))) ? 'overdue' : r.status
  );

  const columns = [
    { key: 'book',     label: 'Book',     render: r => <div><div style={{ fontWeight:600 }}>{r.book?.title||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{(r.book?.authors||[]).join(', ')}</div></div> },
    { key: 'copy',     label: 'Copy',     render: r => r.bookCopy?.uniqueCode || '—' },
    { key: 'issued',   label: 'Issued',   render: r => fmtDate(r.issueDate) },
    { key: 'due',      label: 'Due Date', render: r => {
      const overdue = statusOf(r) === 'overdue';
      return <span style={{ color: overdue ? 'var(--danger)' : 'inherit', fontWeight: overdue ? 600 : 400 }}>{fmtDate(r.dueDate)}</span>;
    }},
    { key: 'status',   label: 'Status',   render: r => {
      const st = STATUS[statusOf(r)] || { label: r.status || '—', variant: 'muted' };
      return <Badge variant={st.variant}>{st.label}</Badge>;
    }},
    // Losing a book is a money event as much as a stock one. Without these
    // three columns the only thing the member could see was that the loan had
    // ended, never what it cost or whether they had settled it.
    { key: 'fine',     label: 'Fine',     render: r => (
      r.fineSummary ? <span title={(r.fineSummary.types || []).join(', ')}>{rupees(r.fineSummary.charged)}</span> : '—'
    )},
    { key: 'paid',     label: 'Paid',     render: r => {
      const f = r.fineSummary;
      if (!f) return '—';
      return (
        <div>
          <div>{rupees(f.paid)}</div>
          {f.waived > 0 && <div style={{ fontSize:'.72rem', color:'var(--text-muted)' }}>{rupees(f.waived)} waived</div>}
        </div>
      );
    }},
    { key: 'payment',  label: 'Payment',  render: r => {
      const f = r.fineSummary;
      if (!f) return '—';
      const p = PAYMENT[f.status] || { label: f.status, variant: 'muted' };
      return (
        <div>
          <Badge variant={p.variant}>{p.label}</Badge>
          {f.outstanding > 0 && <div style={{ fontSize:'.72rem', color:'var(--danger)', marginTop:2 }}>{rupees(f.outstanding)} due</div>}
          {(f.receipts || []).length > 0 && (
            <div style={{ fontSize:'.68rem', color:'var(--text-muted)', marginTop:2 }}>{f.receipts.join(', ')}</div>
          )}
        </div>
      );
    }},
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
      <PageHeader title="My Books" subtitle="Currently borrowed, returned and written-off books" />
      <div className="card">
        <div className="card-body" style={{ padding:0, overflowX:'auto' }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={books} emptyIcon="📚" emptyTitle="No books borrowed" />}
        </div>
      </div>
    </div>
  );
}
