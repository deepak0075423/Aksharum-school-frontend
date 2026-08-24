import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import { PageHeader, Table, Button, Modal, Badge, Spinner } from '../../../components/ui/index';

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
const STATUS = {
  pending: 'warning', approved: 'success', rejected: 'danger',
  converted: 'primary', fulfilled_from_stock: 'info', cancelled: 'muted',
};
const STATUS_LABEL = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
  converted: 'Converted to PO', fulfilled_from_stock: 'Issued from Stock', cancelled: 'Cancelled',
};

export default function AdminPurchaseRequests() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [acting, setActing] = useState(false);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.getRequests({ status: filter || undefined }); setRows(res.data ?? res); }
    catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (row) => {
    setDetail({ loading: true }); setComment('');
    try { const res = await api.getRequest(row._id); setDetail(res.data ?? res); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const act = async (action) => {
    setActing(true);
    try {
      await api.actOnRequest(detail._id, { action, comment, stage: 'Admin', signature: 'Admin' });
      toast.success(`Request ${action}`);
      setDetail(null); load();
    } catch (err) { toast.error(err.message); }
    finally { setActing(false); }
  };

  const fulfil = async () => {
    setActing(true);
    try { await api.fulfilRequest(detail._id); toast.success('Marked as issued from stock'); setDetail(null); load(); }
    catch (err) { toast.error(err.message); }
    finally { setActing(false); }
  };

  const columns = [
    { key: 'requestNumber', label: 'Request #', render: r => <strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.requestNumber}</strong> },
    { key: 'requestedBy', label: 'By', render: r => r.requestedBy?.name || '—' },
    { key: 'department', label: 'Department', render: r => r.department?.name || '—' },
    { key: 'items', label: 'Items', render: r => `${r.items?.length || 0} line(s)` },
    { key: 'estimatedTotal', label: 'Est. Total', render: r => fmt(r.estimatedTotal) },
    { key: 'checks', label: 'Checks', render: r => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {r.checks?.stockAvailable && <Badge variant="info">In stock</Badge>}
        {r.checks?.budgetOk === false && <Badge variant="danger">Over budget</Badge>}
        {r.checks?.possibleDuplicate && <Badge variant="warning">Dup?</Badge>}
      </div>
    )},
    { key: 'status', label: 'Status', render: r => <Badge variant={STATUS[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
    { key: 'actions', label: '', render: r => <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>View</Button> },
  ];

  const d = detail && !detail.loading ? detail : null;

  return (
    <div className="page">
      <PageHeader title="Purchase Requests" subtitle="Review, approve & convert department requests" />

      <div style={{ marginBottom: 12 }}>
        <select className="form-control" style={{ maxWidth: 220 }} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_LABEL).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="📝" emptyTitle="No purchase requests" />
      </div></div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={d ? `Request ${d.requestNumber}` : 'Request'} maxWidth={640}
        footer={d && d.status === 'pending' ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="secondary" onClick={() => act('hold')} loading={acting}>Hold</Button>
            <Button variant="secondary" onClick={() => act('changes_requested')} loading={acting}>Request Changes</Button>
            <Button variant="danger" onClick={() => act('rejected')} loading={acting}>Reject</Button>
            {d.checks?.stockAvailable && <Button variant="secondary" onClick={fulfil} loading={acting}>Issue from Stock</Button>}
            <Button onClick={() => act('approved')} loading={acting}>Approve</Button>
          </div>
        ) : d && d.status === 'approved' ? (
          <Button onClick={() => nav(`/admin/inventory/orders?fromRequest=${d._id}`)}>Convert to Purchase Order →</Button>
        ) : null}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : d && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Badge variant={STATUS[d.status]}>{STATUS_LABEL[d.status]}</Badge>
              <Badge variant="muted">By {d.requestedBy?.name}</Badge>
              {d.department?.name && <Badge variant="info">{d.department.name}</Badge>}
              <Badge variant="muted">Priority: {d.priority}</Badge>
            </div>
            {d.reason && <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>{d.reason}</p>}

            {/* System checks */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
              {d.checks?.stockAvailable && <Badge variant="info">✓ Stock available — consider issuing existing stock</Badge>}
              {d.checks?.budgetOk === false && <Badge variant="danger">⚠ Exceeds department budget</Badge>}
              {d.checks?.possibleDuplicate && <Badge variant="warning">⚠ Possible duplicate request</Badge>}
            </div>

            <table className="table" style={{ width: '100%', marginTop: 8 }}>
              <thead><tr><th>Item</th><th>Qty</th><th>Est. Price</th></tr></thead>
              <tbody>{d.items.map(it => (
                <tr key={it._id} data-focus-id={it._id}><td>{it.itemName}</td><td>{it.quantity} {it.unit}</td><td>{fmt(it.estimatedPrice)}</td></tr>
              ))}</tbody>
            </table>
            <div style={{ textAlign: 'right', fontWeight: 600, marginTop: 6 }}>Total: {fmt(d.estimatedTotal)}</div>

            {/* Approval trail */}
            {(d.approvals || []).length > 0 && (
              <>
                <div style={{ fontSize: '.8rem', fontWeight: 600, margin: '12px 0 4px' }}>Approval Trail</div>
                {d.approvals.map(a => (
                  <div key={a._id} style={{ fontSize: '.8rem', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <strong>{a.stage}</strong> — {a.action} {a.actor?.name ? `by ${a.actor.name}` : ''} {a.comment && <em style={{ color: 'var(--text-muted)' }}>“{a.comment}”</em>}
                  </div>
                ))}
              </>
            )}

            {d.status === 'pending' && (
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Comment (optional)</label>
                <input className="form-control" value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a note with your decision…" />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
