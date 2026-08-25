import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Button, Modal, Badge, Pagination } from '../../../components/ui/index';
import useFocusTarget from '../../../hooks/useFocusTarget';

const ST = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'muted' };
const TYPE = { new_transport: 'New Transport', route_change: 'Route Change', stop_change: 'Stop Change',
  temporary_address: 'Temporary Address', permanent_address: 'Permanent Address', cancellation: 'Cancellation' };

export default function TransportRequests() {
  const [rows, setRows] = useState([]);
  const [pg, setPg]     = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [status, setStatus] = useState('pending');
  const [act, setAct] = useState(null);   // { row, action }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Following a notification: the server is told which request to show and
  // answers with the page holding it, instead of page 1 where it rarely is.
  const { focusId, release: releaseFocus } = useFocusTarget();

  const load = useCallback(async (page = 1, focus = null) => {
    setLoad(true);
    try {
      const res = await api.getRequests({ page, limit: 20, status, focus: focus || undefined });
      const d = res.data ?? res;
      setRows(d.data || []);
      setPg({ page: d.page, pages: d.pages, total: d.total });
      // The request exists but the status filter hides it — this list defaults
      // to "pending", so an approved one would otherwise never show.
      if (focus && d.focusFound === false && status) setStatus('');
    }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [status]);
  useEffect(() => { load(1, focusId); }, [status, focusId]); // eslint-disable-line

  // Paging or filtering by hand releases the notification's hold on the list.
  const onPage   = (p) => { releaseFocus(); load(p); };
  const onStatus = (v) => { releaseFocus(); setStatus(v); };

  const doAct = async () => {
    setBusy(true);
    try { await api.actOnRequest(act.row._id, { action: act.action, note }); toast.success(`Request ${act.action}d`); setAct(null); setNote(''); load(pg.page); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'code', label: 'Request', render: r => <div><strong>{TYPE[r.requestType] || r.requestType}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.requestCode} · {r.student?.name}</div></div> },
    { key: 'by', label: 'Requested By', render: r => <span style={{ fontSize: '.8rem' }}>{r.requestedBy?.name} ({r.requestedByRole || r.requestedBy?.role})</span> },
    { key: 'detail', label: 'Detail', render: r => <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.details?.route?.name || r.details?.address || r.details?.reason || '—'}</span> },
    { key: 'when', label: 'Date', render: r => new Date(r.createdAt).toLocaleDateString() },
    { key: 'status', label: 'Status', render: r => <Badge variant={ST[r.status]}>{r.status}</Badge> },
    { key: 'a', label: '', render: r => r.status === 'pending' ? <div style={{ display: 'flex', gap: 6 }}>
      <Button size="sm" onClick={() => { setNote(''); setAct({ row: r, action: 'approve' }); }}>Approve</Button>
      <Button size="sm" variant="danger" onClick={() => { setNote(''); setAct({ row: r, action: 'reject' }); }}>Reject</Button></div> : '—' },
  ];

  return (
    <div className="page">
      <PageHeader title="Transport Requests" subtitle="Route / stop / address change & cancellation approvals" />
      <div style={{ marginBottom: 16 }}>
        <select className="form-control" style={{ maxWidth: 200 }} value={status} onChange={e => onStatus(e.target.value)}>
          {['pending','approved','rejected','cancelled',''].map(s => <option key={s} value={s}>{s || 'All'}</option>)}</select>
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="📨" emptyTitle="No requests" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={onPage} />

      <Modal open={!!act} onClose={() => setAct(null)} title={`${act?.action === 'approve' ? 'Approve' : 'Reject'} Request`} maxWidth={480}
        footer={<><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button>
          <Button variant={act?.action === 'approve' ? 'primary' : 'danger'} onClick={doAct} loading={busy}>{act?.action === 'approve' ? 'Approve & Apply' : 'Reject'}</Button></>}>
        <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
          {act?.action === 'approve'
            ? 'Approving will automatically apply this change to the student’s transport assignment.'
            : 'The requester will see this request as rejected.'}
        </p>
        <div className="form-group"><label className="form-label">Note (optional)</label><textarea className="form-control" rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
      </Modal>
    </div>
  );
}
