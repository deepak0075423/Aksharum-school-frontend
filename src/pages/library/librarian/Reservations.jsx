import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getReservations, markReservationReady, cancelReservation, issueBook } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Spinner, Pagination, Modal, Alert } from '../../../components/ui/index';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function LibraryReservations() {
  // All by default — the queue is only half the story; expired and collected
  // rows are what a librarian checks when someone asks what happened.
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const { data, meta, loading, refetch } = useFetch(
    () => getReservations({ status: statusFilter || undefined, page, limit: 20 }),
    [statusFilter, page],
  );
  const reservations = Array.isArray(data) ? data : [];

  const [cancelItem, setCancelItem] = useState(null);
  const [cancelLoad, setCancelLoad] = useState(false);
  const [actLoad,    setActLoad]    = useState(null);

  const handleReady = async (id) => {
    setActLoad(id);
    try { await markReservationReady(id); toast.success('Marked as ready'); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setActLoad(null); }
  };

  // Handing over a held book is the whole point of this queue, and it used to
  // mean going to Circulation and re-finding the same book and the same person.
  // The row already knows both, and the server names the copy to give out.
  const [issueItem, setIssueItem] = useState(null);
  const [issueLoad, setIssueLoad] = useState(false);

  const handleIssue = async () => {
    setIssueLoad(true);
    try {
      await issueBook({
        bookId: issueItem.book?._id || issueItem.book,
        copyId: issueItem.availableCopy._id,
        userId: issueItem.reservedBy?._id || issueItem.reservedBy,
      });
      toast.success(`${issueItem.availableCopy.uniqueCode} issued to ${issueItem.reservedBy?.name}`);
      setIssueItem(null);
      refetch();
    } catch (err) { toast.error(err?.message || 'Could not issue the book'); }
    finally { setIssueLoad(false); }
  };

  // The member is told their reservation was cancelled, so the reason is worth
  // collecting — it is the difference between a useful notice and a bare one.
  const [cancelReason, setCancelReason] = useState('');

  const handleCancel = async () => {
    setCancelLoad(true);
    try {
      await cancelReservation(cancelItem._id, cancelReason.trim() || undefined);
      toast.success('Reservation cancelled — the member has been notified');
      setCancelItem(null); setCancelReason(''); refetch();
    } catch (err) { toast.error(err?.message || 'Could not cancel the reservation'); }
    finally { setCancelLoad(false); }
  };

  // Matches the LibraryReservation enum — 'fulfilled' was never a status the
  // server writes, so those rows rendered with the fallback badge.
  const statusColor = { pending: 'warning', ready: 'success', collected: 'muted', cancelled: 'danger', expired: 'danger' };

  const columns = [
    { key: 'book',     label: 'Book',     render: r => <div><div style={{ fontWeight:600 }}>{r.book?.title||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{r.book?.isbn||''}</div></div> },
    { key: 'member',   label: 'Reserved By', render: r => r.reservedBy?.name || '—' },
    { key: 'queue',    label: 'Queue #',   render: r => `#${r.queuePosition||1}` },
    { key: 'date',     label: 'Date',      render: r => fmtDate(r.reservedAt || r.createdAt) },
    { key: 'ready',    label: 'Ready At',  render: r => r.readyAt ? fmtDate(r.readyAt) : '—' },
    { key: 'expires',  label: 'Expires',   render: r => r.expiresAt ? fmtDate(r.expiresAt) : '—' },
    { key: 'status',   label: 'Status',    render: r => <Badge variant={statusColor[r.status]||'muted'}>{r.status}</Badge> },
    { key: 'copy',     label: 'Copy to give', render: r => (
      r.availableCopy
        ? <span><strong style={{ fontSize:'.82rem' }}>{r.availableCopy.uniqueCode}</strong>
            {r.availableCopy.rackLocation && <div style={{ fontSize:'.72rem', color:'var(--text-muted)' }}>{r.availableCopy.rackLocation}</div>}
          </span>
        : <span className="text-muted text-sm">{['collected','cancelled','expired'].includes(r.status) ? '—' : 'none free'}</span>
    )},
    { key: 'actions',  label: '', render: r => (
      <div style={{ display:'flex', gap:4 }}>
        {(r.status === 'ready' || r.status === 'pending') && r.availableCopy && (
          <Button size="sm" onClick={() => setIssueItem(r)}>Issue</Button>
        )}
        {r.status === 'pending' && (
          <Button size="sm" variant="secondary" loading={actLoad === r._id} onClick={() => handleReady(r._id)}>Mark Ready</Button>
        )}
        {(r.status === 'pending' || r.status === 'ready') && (
          <button className="btn btn-danger btn-sm" onClick={() => setCancelItem(r)}>Cancel</button>
        )}
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Reservations" subtitle="Book reservation queue" />
      <div className="card">
        <div className="card-header" style={{ display:'flex', gap:8 }}>
          <select className="form-control" style={{ width:160 }} value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="ready">Ready to collect</option>
            <option value="collected">Collected</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={reservations} emptyIcon="🔖" emptyTitle="No reservations found" />}
        </div>
        {meta?.pages > 1 && <div className="card-footer"><Pagination page={page} pages={meta.pages} total={meta.total} onPage={setPage} /></div>}
      </div>

      <Modal open={!!issueItem} onClose={() => setIssueItem(null)} maxWidth={460} title="Hand over the book"
        footer={<>
          <Button variant="secondary" onClick={() => setIssueItem(null)}>Cancel</Button>
          <Button onClick={handleIssue} loading={issueLoad}>Issue it</Button>
        </>}>
        <p style={{ color:'var(--text-muted)' }}>
          Give <strong>{issueItem?.availableCopy?.uniqueCode}</strong>
          {issueItem?.availableCopy?.rackLocation ? ` (${issueItem.availableCopy.rackLocation})` : ''} of
          {' '}<strong>{issueItem?.book?.title}</strong> to <strong>{issueItem?.reservedBy?.name}</strong>.
        </p>
        {issueItem?.status === 'pending' && (
          <Alert variant="warning">
            This reservation was still queued rather than called up. Issuing it now serves them
            ahead of anyone marked ready before them.
          </Alert>
        )}
        <p className="text-muted text-sm" style={{ marginTop: 10 }}>
          The loan period comes from the library policy, and the reservation closes as collected.
        </p>
      </Modal>

      <Modal open={!!cancelItem} onClose={() => { setCancelItem(null); setCancelReason(''); }} maxWidth={460}
        title="Cancel Reservation"
        footer={<>
          <Button variant="secondary" onClick={() => { setCancelItem(null); setCancelReason(''); }}>Keep it</Button>
          <Button variant="danger" onClick={handleCancel} loading={cancelLoad}>Cancel reservation</Button>
        </>}>
        <p style={{ color:'var(--text-muted)' }}>
          Cancel <strong>{cancelItem?.reservedBy?.name}</strong>'s reservation for
          {' '}<strong>{cancelItem?.book?.title}</strong>?
        </p>
        <div className="form-group">
          <label className="form-label">Reason (optional)</label>
          <input className="form-control" value={cancelReason} placeholder="e.g. copy withdrawn for rebinding"
            onChange={e => setCancelReason(e.target.value)} />
          <div className="form-hint">Included in the notification the member receives.</div>
        </div>
      </Modal>
    </div>
  );
}
