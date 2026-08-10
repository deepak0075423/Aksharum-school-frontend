import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/inventory.api';
import { PageHeader, Table, Button, Modal, Badge } from '../../../components/ui/index';

const STATUS = { issued: 'warning', partially_returned: 'info', returned: 'success' };
const STATUS_LABEL = { issued: 'Issued', partially_returned: 'Partially Returned', returned: 'Returned' };

export default function InventoryIssues() {
  const { data: meta } = useFetch(api.getMeta);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [create, setCreate] = useState(null);
  const [ret, setRet] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.getIssues(); setRows(res.data ?? res); }
    catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = meta?.items || [];
  const whs   = meta?.warehouses || [];
  const depts = meta?.departments || [];

  const submitCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createIssue({
        item: create.item, warehouse: create.warehouse, quantity: Number(create.quantity),
        issuedToName: create.issuedToName, department: create.department || null,
        expectedReturn: create.expectedReturn || null, conditionOut: create.conditionOut, note: create.note,
      });
      toast.success('Item issued — stock updated'); setCreate(null); load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const submitReturn = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.returnIssue(ret.issue._id, { returnQty: Number(ret.returnQty), condition: ret.condition, restock: ret.condition === 'good' || ret.condition === 'repair_needed' });
      toast.success('Return recorded'); setRet(null); load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns = [
    { key: 'issueNumber', label: 'Issue #', render: r => <strong>{r.issueNumber}</strong> },
    { key: 'item', label: 'Item', render: r => r.item?.name || '—' },
    { key: 'quantity', label: 'Qty', render: r => `${r.returnedQty}/${r.quantity}` },
    { key: 'issuedTo', label: 'Issued To', render: r => r.issuedToUser?.name || r.issuedToName || r.department?.name || '—' },
    { key: 'expectedReturn', label: 'Due', render: r => {
      if (!r.expectedReturn) return '—';
      const overdue = r.status !== 'returned' && new Date(r.expectedReturn) < new Date();
      return <span style={{ color: overdue ? 'var(--danger,#ef4444)' : 'inherit' }}>{new Date(r.expectedReturn).toLocaleDateString()}{overdue ? ' ⚠' : ''}</span>;
    }},
    { key: 'status', label: 'Status', render: r => <Badge variant={STATUS[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
    { key: 'actions', label: '', render: r => r.status !== 'returned'
      ? <Button size="sm" variant="secondary" onClick={() => setRet({ issue: r, returnQty: r.quantity - r.returnedQty, condition: 'good' })}>Return</Button>
      : '—' },
  ];

  return (
    <div className="page">
      <PageHeader title="Issue & Return" subtitle="Issue stock to staff / departments and track returns"
        action={<Button onClick={() => setCreate({ item: '', warehouse: '', quantity: 1, issuedToName: '', department: '', expectedReturn: '', conditionOut: 'Good', note: '' })}>+ Issue Item</Button>} />

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="📤" emptyTitle="No issues yet" />
      </div></div>

      {/* Issue modal */}
      <Modal open={!!create} onClose={() => setCreate(null)} title="Issue Item"
        footer={<>
          <Button variant="secondary" onClick={() => setCreate(null)}>Cancel</Button>
          <Button form="issue-form" type="submit" loading={saving}>Issue</Button>
        </>}>
        {create && (
          <form id="issue-form" onSubmit={submitCreate}>
            <div className="form-group"><label className="form-label required">Item</label>
              <select className="form-control" required value={create.item} onChange={e => setCreate(c => ({ ...c, item: e.target.value }))}>
                <option value="">— Select —</option>{items.map(i => <option key={i._id} value={i._id}>{i.name} ({i.itemCode})</option>)}
              </select></div>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label required">Warehouse</label>
                <select className="form-control" required value={create.warehouse} onChange={e => setCreate(c => ({ ...c, warehouse: e.target.value }))}>
                  <option value="">— Select —</option>{whs.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label required">Quantity</label>
                <input type="number" min="1" className="form-control" required value={create.quantity} onChange={e => setCreate(c => ({ ...c, quantity: e.target.value }))} /></div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Issued To (name)</label>
                <input className="form-control" value={create.issuedToName} onChange={e => setCreate(c => ({ ...c, issuedToName: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Department</label>
                <select className="form-control" value={create.department} onChange={e => setCreate(c => ({ ...c, department: e.target.value }))}>
                  <option value="">— None —</option>{depts.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select></div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Expected Return</label>
                <input type="date" className="form-control" value={create.expectedReturn} onChange={e => setCreate(c => ({ ...c, expectedReturn: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Condition</label>
                <input className="form-control" value={create.conditionOut} onChange={e => setCreate(c => ({ ...c, conditionOut: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label className="form-label">Note</label>
              <input className="form-control" value={create.note} onChange={e => setCreate(c => ({ ...c, note: e.target.value }))} /></div>
          </form>
        )}
      </Modal>

      {/* Return modal */}
      <Modal open={!!ret} onClose={() => setRet(null)} title={`Return — ${ret?.issue?.issueNumber || ''}`}
        footer={<>
          <Button variant="secondary" onClick={() => setRet(null)}>Cancel</Button>
          <Button form="ret-form" type="submit" loading={saving}>Record Return</Button>
        </>}>
        {ret && (
          <form id="ret-form" onSubmit={submitReturn}>
            <div className="form-group"><label className="form-label required">Return Quantity</label>
              <input type="number" min="1" max={ret.issue.quantity - ret.issue.returnedQty} className="form-control" required value={ret.returnQty} onChange={e => setRet(r => ({ ...r, returnQty: e.target.value }))} />
              <div className="form-hint">Outstanding: {ret.issue.quantity - ret.issue.returnedQty}</div>
            </div>
            <div className="form-group"><label className="form-label">Condition</label>
              <select className="form-control" value={ret.condition} onChange={e => setRet(r => ({ ...r, condition: e.target.value }))}>
                <option value="good">Good — back to stock</option>
                <option value="repair_needed">Repair needed — back to stock</option>
                <option value="damaged">Damaged — write off</option>
                <option value="lost">Lost — write off</option>
              </select></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
