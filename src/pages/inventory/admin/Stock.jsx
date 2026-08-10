import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/inventory.api';
import { PageHeader, Table, Button, Modal, Badge } from '../../../components/ui/index';

const ADJUST_TYPES = [
  { v: 'purchase', l: 'Stock In (purchase)' },
  { v: 'adjustment', l: 'Adjustment (+/-)' },
  { v: 'damage', l: 'Damage (out)' },
  { v: 'scrap', l: 'Scrap (out)' },
];

export default function InventoryStock() {
  const [params, setParams] = useSearchParams();
  const { data: meta } = useFetch(api.getMeta);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const lowOnly = params.get('lowOnly') === 'true';

  const [adj, setAdj] = useState(null);       // adjust modal form
  const [xfer, setXfer] = useState(null);     // transfer modal form
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getStock({ lowOnly: lowOnly ? 'true' : undefined });
      setRows(res.data ?? res);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [lowOnly]);

  useEffect(() => { load(); }, [load]);

  const items = meta?.items || [];
  const whs   = meta?.warehouses || [];

  const submitAdjust = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.adjustStock({
        item: adj.item, warehouse: adj.warehouse, type: adj.type,
        quantity: Number(adj.quantity), unitCost: Number(adj.unitCost) || 0,
        direction: adj.direction, note: adj.note,
      });
      toast.success('Stock updated'); setAdj(null); load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const submitTransfer = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.transferStock({
        item: xfer.item, fromWarehouse: xfer.fromWarehouse, toWarehouse: xfer.toWarehouse,
        quantity: Number(xfer.quantity), note: xfer.note,
      });
      toast.success('Transferred'); setXfer(null); load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const columns = [
    { key: 'item', label: 'Item', render: r => <div><strong>{r.item?.name}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.item?.itemCode}</div></div> },
    { key: 'warehouse', label: 'Warehouse', render: r => <span>{r.warehouse?.name}<div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.warehouse?.campus}</div></span> },
    { key: 'quantity', label: 'On Hand', render: r => r.quantity },
    { key: 'reserved', label: 'Reserved', render: r => r.reserved },
    { key: 'available', label: 'Available', render: r => <strong>{r.available}</strong> },
    { key: 'status', label: 'Status', render: r => r.quantity <= 0 ? <Badge variant="danger">Out</Badge> : r.low ? <Badge variant="warning">Low</Badge> : <Badge variant="success">OK</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Stock" subtitle="Live balances across warehouses"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setXfer({ item: '', fromWarehouse: '', toWarehouse: '', quantity: '', note: '' })}>🔁 Transfer</Button>
            <Button onClick={() => setAdj({ item: '', warehouse: '', type: 'purchase', quantity: '', unitCost: '', direction: 'in', note: '' })}>± Adjust Stock</Button>
          </div>
        } />

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '.85rem' }}>
          <input type="checkbox" checked={lowOnly} onChange={e => { const p = new URLSearchParams(params); if (e.target.checked) p.set('lowOnly', 'true'); else p.delete('lowOnly'); setParams(p); }} />
          Show low-stock only
        </label>
      </div>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="📊" emptyTitle="No stock records" />
      </div></div>

      {/* Adjust modal */}
      <Modal open={!!adj} onClose={() => setAdj(null)} title="Adjust Stock"
        footer={<>
          <Button variant="secondary" onClick={() => setAdj(null)}>Cancel</Button>
          <Button form="adj-form" type="submit" loading={saving}>Save</Button>
        </>}>
        {adj && (
          <form id="adj-form" onSubmit={submitAdjust}>
            <div className="form-group"><label className="form-label required">Item</label>
              <select className="form-control" required value={adj.item} onChange={e => setAdj(a => ({ ...a, item: e.target.value }))}>
                <option value="">— Select —</option>{items.map(i => <option key={i._id} value={i._id}>{i.name} ({i.itemCode})</option>)}
              </select></div>
            <div className="form-group"><label className="form-label required">Warehouse</label>
              <select className="form-control" required value={adj.warehouse} onChange={e => setAdj(a => ({ ...a, warehouse: e.target.value }))}>
                <option value="">— Select —</option>{whs.map(w => <option key={w._id} value={w._id}>{w.name} ({w.campus})</option>)}
              </select></div>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Type</label>
                <select className="form-control" value={adj.type} onChange={e => setAdj(a => ({ ...a, type: e.target.value }))}>
                  {ADJUST_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label required">Quantity</label>
                <input type="number" min="1" className="form-control" required value={adj.quantity} onChange={e => setAdj(a => ({ ...a, quantity: e.target.value }))} /></div>
            </div>
            {adj.type === 'adjustment' && (
              <div className="form-group"><label className="form-label">Direction</label>
                <select className="form-control" value={adj.direction} onChange={e => setAdj(a => ({ ...a, direction: e.target.value }))}>
                  <option value="in">Increase (+)</option><option value="out">Decrease (−)</option>
                </select></div>
            )}
            {adj.type === 'purchase' && (
              <div className="form-group"><label className="form-label">Unit Cost (₹)</label>
                <input type="number" className="form-control" value={adj.unitCost} onChange={e => setAdj(a => ({ ...a, unitCost: e.target.value }))} /></div>
            )}
            <div className="form-group"><label className="form-label">Note</label>
              <input className="form-control" value={adj.note} onChange={e => setAdj(a => ({ ...a, note: e.target.value }))} /></div>
          </form>
        )}
      </Modal>

      {/* Transfer modal */}
      <Modal open={!!xfer} onClose={() => setXfer(null)} title="Transfer Stock"
        footer={<>
          <Button variant="secondary" onClick={() => setXfer(null)}>Cancel</Button>
          <Button form="xfer-form" type="submit" loading={saving}>Transfer</Button>
        </>}>
        {xfer && (
          <form id="xfer-form" onSubmit={submitTransfer}>
            <div className="form-group"><label className="form-label required">Item</label>
              <select className="form-control" required value={xfer.item} onChange={e => setXfer(x => ({ ...x, item: e.target.value }))}>
                <option value="">— Select —</option>{items.map(i => <option key={i._id} value={i._id}>{i.name} ({i.itemCode})</option>)}
              </select></div>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label required">From</label>
                <select className="form-control" required value={xfer.fromWarehouse} onChange={e => setXfer(x => ({ ...x, fromWarehouse: e.target.value }))}>
                  <option value="">— Select —</option>{whs.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label required">To</label>
                <select className="form-control" required value={xfer.toWarehouse} onChange={e => setXfer(x => ({ ...x, toWarehouse: e.target.value }))}>
                  <option value="">— Select —</option>{whs.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                </select></div>
            </div>
            <div className="form-group"><label className="form-label required">Quantity</label>
              <input type="number" min="1" className="form-control" required value={xfer.quantity} onChange={e => setXfer(x => ({ ...x, quantity: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Note</label>
              <input className="form-control" value={xfer.note} onChange={e => setXfer(x => ({ ...x, note: e.target.value }))} /></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
