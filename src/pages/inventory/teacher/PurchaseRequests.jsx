import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/inventory.api';
import { PageHeader, Table, Button, Modal, Confirm, Badge, Spinner } from '../../../components/ui/index';

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
const STATUS = {
  pending: 'warning', approved: 'success', rejected: 'danger',
  converted: 'primary', fulfilled_from_stock: 'info', cancelled: 'muted',
};
const STATUS_LABEL = {
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
  converted: 'Ordered', fulfilled_from_stock: 'Issued from Stock', cancelled: 'Cancelled',
};
const blankLine = () => ({ item: '', itemName: '', quantity: 1, unit: 'Nos', estimatedPrice: 0 });

export default function TeacherPurchaseRequests() {
  const { data: meta } = useFetch(api.getTeacherMeta);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [create, setCreate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [cancelRow, setCancelRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.getMyRequests(); setRows(res.data ?? res); }
    catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = meta?.items || [];
  const depts = meta?.departments || [];

  const openCreate = () => setCreate({ department: '', reason: '', priority: 'normal', lines: [blankLine()] });
  const setLine = (i, k, v) => setCreate(c => ({ ...c, lines: c.lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l) }));
  const pickItem = (i, id) => {
    const it = items.find(x => x._id === id);
    setCreate(c => ({ ...c, lines: c.lines.map((l, idx) => idx === i ? { ...l, item: id, itemName: it?.name || l.itemName, unit: it?.unit || l.unit, estimatedPrice: it?.purchasePrice ?? l.estimatedPrice } : l) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const valid = create.lines.filter(l => l.itemName && Number(l.quantity) > 0);
    if (!valid.length) return toast.error('Add at least one item');
    setSaving(true);
    try {
      await api.createMyRequest({
        department: create.department || null, reason: create.reason, priority: create.priority,
        items: valid.map(l => ({ item: l.item || null, itemName: l.itemName, quantity: Number(l.quantity), unit: l.unit, estimatedPrice: Number(l.estimatedPrice) || 0 })),
      });
      toast.success('Request submitted'); setCreate(null); load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const openDetail = async (row) => {
    setDetail({ loading: true });
    try { const res = await api.getMyRequest(row._id); setDetail(res.data ?? res); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const doCancel = async () => {
    try { await api.cancelMyRequest(cancelRow._id); toast.success('Request cancelled'); setCancelRow(null); load(); }
    catch (err) { toast.error(err.message); setCancelRow(null); }
  };

  const columns = [
    { key: 'requestNumber', label: 'Request #', render: r => <strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.requestNumber}</strong> },
    { key: 'items', label: 'Items', render: r => `${r.items?.length || 0} line(s)` },
    { key: 'department', label: 'Department', render: r => r.department?.name || '—' },
    { key: 'estimatedTotal', label: 'Est. Total', render: r => fmt(r.estimatedTotal) },
    { key: 'status', label: 'Status', render: r => <Badge variant={STATUS[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
    { key: 'createdAt', label: 'Date', render: r => new Date(r.createdAt).toLocaleDateString() },
    { key: 'actions', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>View</Button>
        {r.status === 'pending' && <Button size="sm" variant="danger" onClick={() => setCancelRow(r)}>Cancel</Button>}
      </div>
    )},
  ];

  const d = detail && !detail.loading ? detail : null;

  return (
    <div className="page">
      <PageHeader title="My Purchase Requests" subtitle="Request items from the inventory department"
        action={<Button onClick={openCreate}>+ New Request</Button>} />

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="📝" emptyTitle="No requests yet" />
      </div></div>

      {/* Create */}
      <Modal open={!!create} onClose={() => setCreate(null)} title="New Purchase Request" maxWidth={680}
        footer={<>
          <Button variant="secondary" onClick={() => setCreate(null)}>Cancel</Button>
          <Button form="pr-form" type="submit" loading={saving}>Submit</Button>
        </>}>
        {create && (
          <form id="pr-form" onSubmit={submit}>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Department</label>
                <select className="form-control" value={create.department} onChange={e => setCreate(c => ({ ...c, department: e.target.value }))}>
                  <option value="">— None —</option>{depts.map(x => <option key={x._id} value={x._id}>{x.name}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Priority</label>
                <select className="form-control" value={create.priority} onChange={e => setCreate(c => ({ ...c, priority: e.target.value }))}>
                  <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                </select></div>
            </div>

            <div style={{ fontSize: '.8rem', fontWeight: 600, margin: '8px 0 4px' }}>Requested Items</div>
            <div className="table-wrap">
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th style={{ minWidth: 160 }}>Item</th><th>Qty</th><th>Est. Price</th><th></th></tr></thead>
                <tbody>{create.lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select className="form-control" value={l.item} onChange={e => pickItem(i, e.target.value)} style={{ marginBottom: 4 }}>
                        <option value="">— Or type below —</option>{items.map(it => <option key={it._id} value={it._id}>{it.name}</option>)}
                      </select>
                      <input className="form-control" placeholder="Item name" value={l.itemName} onChange={e => setLine(i, 'itemName', e.target.value)} />
                    </td>
                    <td><input type="number" min="1" className="form-control" style={{ width: 70 }} value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value)} /></td>
                    <td><input type="number" className="form-control" style={{ width: 90 }} value={l.estimatedPrice} onChange={e => setLine(i, 'estimatedPrice', e.target.value)} /></td>
                    <td>{create.lines.length > 1 && <button type="button" className="btn-icon" onClick={() => setCreate(c => ({ ...c, lines: c.lines.filter((_, idx) => idx !== i) }))}>✕</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreate(c => ({ ...c, lines: [...c.lines, blankLine()] }))}>+ Add line</Button>

            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Reason / Justification</label>
              <textarea className="form-control" rows={2} value={create.reason} onChange={e => setCreate(c => ({ ...c, reason: e.target.value }))} />
            </div>
          </form>
        )}
      </Modal>

      {/* Detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={d ? `Request ${d.requestNumber}` : 'Request'} maxWidth={560}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : d && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Badge variant={STATUS[d.status]}>{STATUS_LABEL[d.status]}</Badge>
              {d.department?.name && <Badge variant="info">{d.department.name}</Badge>}
              <Badge variant="muted">Priority: {d.priority}</Badge>
              {d.purchaseOrder?.poNumber && <Badge variant="primary">PO {d.purchaseOrder.poNumber}</Badge>}
            </div>
            {d.reason && <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>{d.reason}</p>}
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Item</th><th>Qty</th><th>Est. Price</th></tr></thead>
              <tbody>{d.items.map(it => (
                <tr key={it._id}><td>{it.itemName}</td><td>{it.quantity} {it.unit}</td><td>{fmt(it.estimatedPrice)}</td></tr>
              ))}</tbody>
            </table>
            <div style={{ textAlign: 'right', fontWeight: 600, marginTop: 6 }}>Total: {fmt(d.estimatedTotal)}</div>

            {(d.approvals || []).length > 0 && (
              <>
                <div style={{ fontSize: '.8rem', fontWeight: 600, margin: '12px 0 4px' }}>Approval Trail</div>
                {d.approvals.map(a => (
                  <div key={a._id} style={{ fontSize: '.8rem', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <strong>{a.stage}</strong> — {a.action} {a.comment && <em style={{ color: 'var(--text-muted)' }}>“{a.comment}”</em>}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </Modal>

      <Confirm open={!!cancelRow} onClose={() => setCancelRow(null)} onConfirm={doCancel}
        title="Cancel request" message={`Cancel request ${cancelRow?.requestNumber}?`} />
    </div>
  );
}
