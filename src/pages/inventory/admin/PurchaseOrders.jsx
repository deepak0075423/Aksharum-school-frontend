import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/inventory.api';
import { PageHeader, Table, Button, Modal, Badge, Spinner } from '../../../components/ui/index';

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const STATUS = { ordered: 'warning', partially_received: 'info', received: 'success', cancelled: 'muted' };
const STATUS_LABEL = { ordered: 'Ordered', partially_received: 'Partially Received', received: 'Received', cancelled: 'Cancelled' };

const blankLine = () => ({ item: '', itemName: '', quantity: 1, unit: 'Nos', unitPrice: 0, gst: 0 });

export default function AdminPurchaseOrders() {
  const [params, setParams] = useSearchParams();
  const { data: meta } = useFetch(api.getMeta);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [create, setCreate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [recv, setRecv] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.getOrders(); setRows(res.data ?? res); }
    catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const vendors = meta?.vendors || [];
  const depts   = meta?.departments || [];
  const whs     = meta?.warehouses || [];
  const items   = meta?.items || [];

  // Prefill create form from an approved request (?fromRequest=id)
  useEffect(() => {
    const rid = params.get('fromRequest');
    if (!rid) return;
    (async () => {
      try {
        const res = await api.getRequest(rid);
        const r = res.data ?? res;
        setCreate({
          vendor: '', department: r.department?._id || '', warehouse: '', discount: 0,
          deliveryAddress: '', terms: '', expectedDelivery: '', purchaseRequest: r._id,
          lines: (r.items || []).map(it => ({ item: it.item?._id || it.item || '', itemName: it.itemName, quantity: it.quantity, unit: it.unit, unitPrice: it.estimatedPrice || 0, gst: 0 })),
        });
      } catch (err) { toast.error(err.message); }
      finally { const p = new URLSearchParams(params); p.delete('fromRequest'); setParams(p, { replace: true }); }
    })();
  }, [params]); // eslint-disable-line

  const openCreate = () => setCreate({ vendor: '', department: '', warehouse: '', discount: 0, deliveryAddress: '', terms: '', expectedDelivery: '', purchaseRequest: null, lines: [blankLine()] });

  const setLine = (i, k, v) => setCreate(c => ({ ...c, lines: c.lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l) }));
  const pickItem = (i, id) => {
    const it = items.find(x => x._id === id);
    setCreate(c => ({ ...c, lines: c.lines.map((l, idx) => idx === i ? { ...l, item: id, itemName: it?.name || l.itemName, unit: it?.unit || l.unit, unitPrice: it?.purchasePrice ?? l.unitPrice } : l) }));
  };

  const totals = create ? create.lines.reduce((acc, l) => {
    const line = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
    acc.sub += line; acc.tax += line * ((Number(l.gst) || 0) / 100); return acc;
  }, { sub: 0, tax: 0 }) : { sub: 0, tax: 0 };
  const grand = Math.max(0, totals.sub + totals.tax - (Number(create?.discount) || 0));

  const submitCreate = async (e) => {
    e.preventDefault();
    const valid = create.lines.filter(l => l.itemName && Number(l.quantity) > 0);
    if (!create.vendor) return toast.error('Select a vendor');
    if (!valid.length) return toast.error('Add at least one item');
    setSaving(true);
    try {
      await api.createOrder({
        vendor: create.vendor, department: create.department || null, warehouse: create.warehouse || null,
        purchaseRequest: create.purchaseRequest || null,
        discount: Number(create.discount) || 0,
        deliveryAddress: create.deliveryAddress, terms: create.terms,
        expectedDelivery: create.expectedDelivery || null,
        items: valid.map(l => ({ item: l.item || null, itemName: l.itemName, quantity: Number(l.quantity), unit: l.unit, unitPrice: Number(l.unitPrice) || 0, gst: Number(l.gst) || 0 })),
      });
      toast.success('Purchase order created'); setCreate(null); load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const openDetail = async (row) => {
    setDetail({ loading: true });
    try { const res = await api.getOrder(row._id); setDetail(res.data ?? res); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const openReceive = (po) => setRecv({
    po,
    lines: po.items.filter(i => i.receivedQty < i.quantity).map(i => ({ itemId: i._id, name: i.itemName, remaining: i.quantity - i.receivedQty, receivedQty: i.quantity - i.receivedQty, batchNumber: '', expiryDate: '' })),
    invoiceNumber: po.invoice?.number || '',
  });

  const submitReceive = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.receiveOrder(recv.po._id, {
        lines: recv.lines.map(l => ({ itemId: l.itemId, receivedQty: Number(l.receivedQty) || 0, batchNumber: l.batchNumber, expiryDate: l.expiryDate || null })),
        invoice: recv.invoiceNumber ? { number: recv.invoiceNumber } : undefined,
      });
      toast.success('Goods received — stock updated'); setRecv(null); setDetail(null); load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const cancel = async (po) => {
    try { await api.cancelOrder(po._id); toast.success('PO cancelled'); setDetail(null); load(); }
    catch (err) { toast.error(err.message); }
  };

  const columns = [
    { key: 'poNumber', label: 'PO #', render: r => <strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.poNumber}</strong> },
    { key: 'vendor', label: 'Vendor', render: r => r.vendor?.name || '—' },
    { key: 'items', label: 'Items', render: r => `${r.items?.length || 0} line(s)` },
    { key: 'grandTotal', label: 'Total', render: r => fmt(r.grandTotal) },
    { key: 'status', label: 'Status', render: r => <Badge variant={STATUS[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
    { key: 'createdAt', label: 'Date', render: r => new Date(r.createdAt).toLocaleDateString() },
    { key: 'actions', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>View</Button>
        {['ordered', 'partially_received'].includes(r.status) && <Button size="sm" onClick={() => openReceive(r)}>Receive</Button>}
      </div>
    )},
  ];

  const d = detail && !detail.loading ? detail : null;

  return (
    <div className="page">
      <PageHeader title="Purchase Orders" subtitle="Generate POs & receive goods (GRN)"
        action={<Button onClick={openCreate}>+ New PO</Button>} />

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🧾" emptyTitle="No purchase orders" />
      </div></div>

      {/* Create modal */}
      <Modal open={!!create} onClose={() => setCreate(null)} title="New Purchase Order" maxWidth={820}
        footer={<>
          <Button variant="secondary" onClick={() => setCreate(null)}>Cancel</Button>
          <Button form="po-form" type="submit" loading={saving}>Create PO</Button>
        </>}>
        {create && (
          <form id="po-form" onSubmit={submitCreate}>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label required">Vendor</label>
                <select className="form-control" required value={create.vendor} onChange={e => setCreate(c => ({ ...c, vendor: e.target.value }))}>
                  <option value="">— Select —</option>{vendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Department (budget)</label>
                <select className="form-control" value={create.department} onChange={e => setCreate(c => ({ ...c, department: e.target.value }))}>
                  <option value="">— None —</option>{depts.map(x => <option key={x._id} value={x._id}>{x.name}</option>)}
                </select></div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Receiving Warehouse</label>
                <select className="form-control" value={create.warehouse} onChange={e => setCreate(c => ({ ...c, warehouse: e.target.value }))}>
                  <option value="">— Select (required to receive) —</option>{whs.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Expected Delivery</label>
                <input type="date" className="form-control" value={create.expectedDelivery} onChange={e => setCreate(c => ({ ...c, expectedDelivery: e.target.value }))} /></div>
            </div>

            <div style={{ fontSize: '.8rem', fontWeight: 600, margin: '8px 0 4px' }}>Items</div>
            <div className="table-wrap">
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th style={{ minWidth: 160 }}>Item</th><th>Qty</th><th>Unit Price</th><th>GST%</th><th>Line</th><th></th></tr></thead>
                <tbody>
                  {create.lines.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <select className="form-control" value={l.item} onChange={e => pickItem(i, e.target.value)} style={{ marginBottom: 4 }}>
                          <option value="">— Free text —</option>{items.map(it => <option key={it._id} value={it._id}>{it.name}</option>)}
                        </select>
                        <input className="form-control" placeholder="Item name" value={l.itemName} onChange={e => setLine(i, 'itemName', e.target.value)} />
                      </td>
                      <td><input type="number" min="1" className="form-control" style={{ width: 70 }} value={l.quantity} onChange={e => setLine(i, 'quantity', e.target.value)} /></td>
                      <td><input type="number" className="form-control" style={{ width: 90 }} value={l.unitPrice} onChange={e => setLine(i, 'unitPrice', e.target.value)} /></td>
                      <td><input type="number" className="form-control" style={{ width: 60 }} value={l.gst} onChange={e => setLine(i, 'gst', e.target.value)} /></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmt((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (1 + (Number(l.gst) || 0) / 100))}</td>
                      <td>{create.lines.length > 1 && <button type="button" className="btn-icon" onClick={() => setCreate(c => ({ ...c, lines: c.lines.filter((_, idx) => idx !== i) }))}>✕</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreate(c => ({ ...c, lines: [...c.lines, blankLine()] }))}>+ Add line</Button>

            <div className="form-row form-row-2" style={{ marginTop: 12 }}>
              <div className="form-group"><label className="form-label">Discount (₹)</label>
                <input type="number" className="form-control" value={create.discount} onChange={e => setCreate(c => ({ ...c, discount: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Delivery Address</label>
                <input className="form-control" value={create.deliveryAddress} onChange={e => setCreate(c => ({ ...c, deliveryAddress: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label className="form-label">Terms</label>
              <input className="form-control" value={create.terms} onChange={e => setCreate(c => ({ ...c, terms: e.target.value }))} /></div>

            <div style={{ textAlign: 'right', fontSize: '.85rem', lineHeight: 1.7 }}>
              <div>Sub-total: {fmt(totals.sub)}</div>
              <div>Tax: {fmt(totals.tax)}</div>
              <div>Discount: −{fmt(Number(create.discount) || 0)}</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>Grand Total: {fmt(grand)}</div>
            </div>
          </form>
        )}
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={d ? d.poNumber : 'Purchase Order'} maxWidth={680}
        footer={d && ['ordered', 'partially_received'].includes(d.status) ? (
          <>
            <Button variant="danger" onClick={() => cancel(d)}>Cancel PO</Button>
            <Button onClick={() => openReceive(d)}>Receive Goods</Button>
          </>
        ) : null}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : d && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Badge variant={STATUS[d.status]}>{STATUS_LABEL[d.status]}</Badge>
              <Badge variant="muted">{d.vendor?.name}</Badge>
              {d.department?.name && <Badge variant="info">{d.department.name}</Badge>}
              {d.warehouse?.name && <Badge variant="muted">→ {d.warehouse.name}</Badge>}
            </div>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Item</th><th>Ordered</th><th>Received</th><th>Unit ₹</th><th>GST%</th></tr></thead>
              <tbody>{d.items.map(it => (
                <tr key={it._id} data-focus-id={it._id}><td>{it.itemName}</td><td>{it.quantity} {it.unit}</td><td>{it.receivedQty}</td><td>{fmt(it.unitPrice)}</td><td>{it.gst}%</td></tr>
              ))}</tbody>
            </table>
            <div style={{ textAlign: 'right', marginTop: 8, fontSize: '.85rem', lineHeight: 1.6 }}>
              <div>Sub-total: {fmt(d.subTotal)} · Tax: {fmt(d.taxTotal)} · Discount: −{fmt(d.discount)}</div>
              <div style={{ fontWeight: 700 }}>Grand Total: {fmt(d.grandTotal)}</div>
            </div>
            {d.invoice?.number && <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 6 }}>Invoice: {d.invoice.number}</div>}
          </div>
        )}
      </Modal>

      {/* Receive (GRN) modal */}
      <Modal open={!!recv} onClose={() => setRecv(null)} title={`Receive Goods — ${recv?.po?.poNumber || ''}`} maxWidth={640}
        footer={<>
          <Button variant="secondary" onClick={() => setRecv(null)}>Cancel</Button>
          <Button form="recv-form" type="submit" loading={saving}>Confirm Receipt</Button>
        </>}>
        {recv && (
          <form id="recv-form" onSubmit={submitReceive}>
            {!recv.po.warehouse && <div className="alert alert-warning" style={{ marginBottom: 10 }}>This PO has no receiving warehouse set — receipt cannot update stock. Recreate the PO with a warehouse.</div>}
            {recv.lines.length === 0 ? <p>All items already received.</p> : (
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>Item</th><th>Remaining</th><th>Receive</th><th>Batch</th><th>Expiry</th></tr></thead>
                <tbody>{recv.lines.map((l, i) => (
                  <tr key={l.itemId}>
                    <td>{l.name}</td>
                    <td>{l.remaining}</td>
                    <td><input type="number" min="0" max={l.remaining} className="form-control" style={{ width: 70 }} value={l.receivedQty} onChange={e => setRecv(r => ({ ...r, lines: r.lines.map((x, idx) => idx === i ? { ...x, receivedQty: e.target.value } : x) }))} /></td>
                    <td><input className="form-control" style={{ width: 90 }} value={l.batchNumber} onChange={e => setRecv(r => ({ ...r, lines: r.lines.map((x, idx) => idx === i ? { ...x, batchNumber: e.target.value } : x) }))} /></td>
                    <td><input type="date" className="form-control" value={l.expiryDate} onChange={e => setRecv(r => ({ ...r, lines: r.lines.map((x, idx) => idx === i ? { ...x, expiryDate: e.target.value } : x) }))} /></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <div className="form-group" style={{ marginTop: 10 }}>
              <label className="form-label">Invoice Number (optional)</label>
              <input className="form-control" value={recv.invoiceNumber} onChange={e => setRecv(r => ({ ...r, invoiceNumber: e.target.value }))} />
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
