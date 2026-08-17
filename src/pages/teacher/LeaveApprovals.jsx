import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/teacher.api';
import { Table, Badge, Button, Modal, Spinner, Empty } from '../../components/ui/index';

// Leave sign-off queue for approvers picked by designation (e.g. a Principal).
// They are teachers, so they have no admin screen — this is where their queue
// lives. Mounted as a tab of pages/teacher/Leave.jsx, and only rendered when
// the server confirms this user approves at least one leave type.

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_VARIANT = {
  pending: 'warning', approved: 'success', rejected: 'danger',
  cancelled: 'muted', modification_requested: 'info',
};

export default function TeacherLeaveApprovals() {
  const [status, setStatus] = useState('pending');
  const { data, loading, refetch } = useFetch(
    () => api.getLeaveApprovals({ status: status || undefined }),
    [status],
  );

  const [action, setAction] = useState(null);   // { type, request }
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const { type, request } = action;
      if (type === 'approve') {
        const res = await api.approveLeaveRequest(request._id, { adminComment: comment });
        const left = res?.pendingLevels ?? 0;
        toast.success(left > 0
          ? `Approval recorded — ${left} more sign-off needed`
          : 'Leave approved');
      } else {
        await api.rejectLeaveRequest(request._id, { adminComment: comment });
        toast.success('Leave rejected');
      }
      setAction(null); setComment(''); refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'teacher', label: 'Employee', render: r => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.teacher?.name || '—'}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.teacher?.email || ''}</div>
      </div>
    )},
    { key: 'type', label: 'Type', render: r => r.leaveType?.name || '—' },
    { key: 'dates', label: 'Period', render: r => (
      <div>
        <div>{fmtDate(r.fromDate)} – {fmtDate(r.toDate)}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
          {r.totalDays} day(s) · {r.leaveMode?.replace('_', ' ')}
        </div>
      </div>
    )},
    { key: 'status', label: 'Status', render: r => (
      <div>
        <Badge variant={STATUS_VARIANT[r.status] || 'muted'}>{r.status?.replace('_', ' ')}</Badge>
        {r.approvalsRequired > 1 && r.status === 'pending' && (
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
            sign-off {r.approvalLevel || 0}/{r.approvalsRequired}
          </div>
        )}
      </div>
    )},
    { key: 'reason', label: 'Reason', render: r => <span style={{ fontSize: '.82rem' }}>{r.reason || '—'}</span> },
    { key: 'doc', label: 'Doc', render: r => r.document
      ? <a href={`/uploads/leave-docs/${r.document}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem' }}>📎 View</a>
      : '—' },
    { key: 'actions', label: '', render: r => r.status === 'pending' ? (
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-success btn-sm" onClick={() => { setComment(''); setAction({ type: 'approve', request: r }); }}>Approve</button>
        <button className="btn btn-danger btn-sm"  onClick={() => { setComment(''); setAction({ type: 'reject',  request: r }); }}>Reject</button>
      </div>
    ) : null },
  ];

  if (loading) return <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;

  if (data?.isApprover === false) {
    return (
      <div className="card"><div className="card-body">
        <Empty icon="✅" title="Nothing to approve"
          message="You are not set as an approver for any leave type." />
      </div></div>
    );
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select className="form-control" style={{ width: 180 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={data?.items || []} emptyIcon="✅" emptyTitle="Nothing waiting for you" />
      </div>

      <Modal open={!!action} onClose={() => setAction(null)}
        title={action?.type === 'approve' ? 'Approve Leave' : 'Reject Leave'}
        footer={<>
          <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
          <Button variant={action?.type === 'approve' ? 'success' : 'danger'} onClick={run} loading={busy}>
            {action?.type === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </>}>
        {action && (
          <div>
            <div style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '10px 14px', fontSize: '.85rem', marginBottom: 12 }}>
              <div><strong>{action.request.teacher?.name}</strong> — {action.request.leaveType?.name}</div>
              <div>{fmtDate(action.request.fromDate)} – {fmtDate(action.request.toDate)} ({action.request.totalDays} day(s))</div>
            </div>
            {action.type === 'approve' && action.request.approvalsRequired > 1
              && (action.request.approvalLevel || 0) + 1 < action.request.approvalsRequired && (
              <div className="alert alert-info" style={{ marginBottom: 12, fontSize: '.82rem' }}>
                This is the first of two sign-offs — the leave is not approved and no balance moves until the second one.
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Comment</label>
              <textarea className="form-control" rows={3} value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Optional note for the employee" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
