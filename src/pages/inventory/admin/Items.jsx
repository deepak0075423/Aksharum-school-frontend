import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/inventory.api';
import { PageHeader, Table, Button, Modal, Confirm, Badge, Pagination, Spinner } from '../../../components/ui/index';

const empty = {
  name: '', description: '', category: '', brand: '', model: '',
  itemCode: '', barcode: '', unit: 'Nos',
  purchasePrice: '', gst: '', hsnCode: '', reorderLevel: '',
  warehouse: '', rack: '', shelf: '', bin: '',
  trackSerial: false, trackBatch: false, hasExpiry: false, warrantyMonths: '', isAsset: false,
};

export default function InventoryItems() {
  const { data: meta } = useFetch(api.getMeta);
  const [items, setItems]   = useState([]);
  const [pageData, setPage] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel]       = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async (page = 1, q = search) => {
    setLoading(true);
    try {
      const res = await api.getItems({ page, limit: 20, search: q });
      const d = res.data ?? res;
      setItems(d.items || []);
      setPage({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(1, ''); }, []); // eslint-disable-line

  const cats = meta?.categories || [];
  const whs  = meta?.warehouses || [];
  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const open = (row) => {
    if (row) { setEditId(row._id); setForm({ ...empty, ...row, category: row.category?._id || row.category || '', warehouse: row.warehouse?._id || row.warehouse || '' }); }
    else { setEditId(null); setForm(empty); }
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        purchasePrice: Number(form.purchasePrice) || 0,
        gst: Number(form.gst) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        warrantyMonths: Number(form.warrantyMonths) || 0,
        category: form.category || null,
        warehouse: form.warehouse || null,
      };
      if (editId) await api.updateItem(editId, payload);
      else await api.createItem(payload);
      toast.success(editId ? 'Item updated' : 'Item created');
      setModal(false); load(pageData.page);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await api.deleteItem(del._id); toast.success('Deleted'); setDel(null); load(pageData.page); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const openDetail = async (row) => {
    setDetail({ loading: true });
    try { const res = await api.getItem(row._id); setDetail(res.data ?? res); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const columns = [
    { key: 'name', label: 'Item', render: r => (
      <div><strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.name}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.itemCode}{r.brand ? ` · ${r.brand}` : ''}</div></div>
    )},
    { key: 'category', label: 'Category', render: r => r.category?.name || '—' },
    { key: 'onHand', label: 'On Hand', render: r => {
      const low = r.reorderLevel > 0 && r.onHand <= r.reorderLevel;
      return <Badge variant={r.onHand <= 0 ? 'danger' : low ? 'warning' : 'success'}>{r.onHand} {r.unit}</Badge>;
    }},
    { key: 'purchasePrice', label: 'Price', render: r => `₹${(r.purchasePrice || 0).toLocaleString()}` },
    { key: 'isAsset', label: 'Type', render: r => r.isAsset ? <Badge variant="info">Asset</Badge> : <Badge variant="muted">Consumable</Badge> },
    { key: 'actions', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>View</Button>
        <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Item Master" subtitle="Every inventory item, created once"
        action={<Button onClick={() => open()}>+ Add Item</Button>} />

      <div style={{ marginBottom: 16, maxWidth: 340 }}>
        <input className="form-control" placeholder="🔍 Search by name / code / barcode…"
          value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(1)} />
      </div>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={items} loading={loading} emptyIcon="📦" emptyTitle="No items yet" />
      </div></div>
      <Pagination page={pageData.page} pages={pageData.pages} total={pageData.total} onPage={p => load(p)} />

      {/* Create / Edit */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Item' : 'Add Item'} maxWidth={720}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="item-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="item-form" onSubmit={save}>
          <div className="form-group">
            <label className="form-label required">Item Name</label>
            <input className="form-control" required value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Category</label>
              <select className="form-control" value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">— None —</option>
                {cats.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Unit</label>
              <input className="form-control" value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="Nos, Kg, Ltr…" /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Brand</label><input className="form-control" value={form.brand} onChange={e => set('brand', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Model</label><input className="form-control" value={form.model} onChange={e => set('model', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Item Code</label><input className="form-control" value={form.itemCode} onChange={e => set('itemCode', e.target.value)} placeholder="auto-generated if blank" /></div>
            <div className="form-group"><label className="form-label">Barcode</label><input className="form-control" value={form.barcode} onChange={e => set('barcode', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Purchase Price (₹)</label><input type="number" className="form-control" value={form.purchasePrice} onChange={e => set('purchasePrice', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">GST (%)</label><input type="number" className="form-control" value={form.gst} onChange={e => set('gst', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">HSN Code</label><input className="form-control" value={form.hsnCode} onChange={e => set('hsnCode', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Reorder Level</label><input type="number" className="form-control" value={form.reorderLevel} onChange={e => set('reorderLevel', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Default Warehouse</label>
              <select className="form-control" value={form.warehouse} onChange={e => set('warehouse', e.target.value)}>
                <option value="">— None —</option>
                {whs.map(w => <option key={w._id} value={w._id}>{w.name} ({w.campus})</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Warranty (months)</label><input type="number" className="form-control" value={form.warrantyMonths} onChange={e => set('warrantyMonths', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Rack</label><input className="form-control" value={form.rack} onChange={e => set('rack', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Shelf / Bin</label><input className="form-control" value={form.shelf} onChange={e => set('shelf', e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 4 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.85rem' }}><input type="checkbox" checked={form.trackSerial} onChange={e => set('trackSerial', e.target.checked)} /> Track Serial</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.85rem' }}><input type="checkbox" checked={form.trackBatch} onChange={e => set('trackBatch', e.target.checked)} /> Track Batch</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.85rem' }}><input type="checkbox" checked={form.hasExpiry} onChange={e => set('hasExpiry', e.target.checked)} /> Has Expiry</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.85rem' }}><input type="checkbox" checked={form.isAsset} onChange={e => set('isAsset', e.target.checked)} /> Track as Asset</label>
          </div>
        </form>
      </Modal>

      {/* Detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name || 'Item'} maxWidth={680}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : detail && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Badge variant="primary">{detail.itemCode}</Badge>
              {detail.category?.name && <Badge variant="info">{detail.category.name}</Badge>}
              {detail.isAsset && <Badge variant="muted">Asset</Badge>}
            </div>
            {detail.description && <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{detail.description}</p>}
            <div style={{ fontSize: '.8rem', fontWeight: 600, margin: '10px 0 4px' }}>Stock by Warehouse</div>
            {(detail.stock || []).length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>No stock recorded.</div> : (
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>Warehouse</th><th>On Hand</th><th>Reserved</th><th>Available</th></tr></thead>
                <tbody>{detail.stock.map(s => (
                  <tr key={s._id}><td>{s.warehouse?.name}</td><td>{s.quantity}</td><td>{s.reserved}</td><td><strong>{s.available}</strong></td></tr>
                ))}</tbody>
              </table>
            )}
            <div style={{ fontSize: '.8rem', fontWeight: 600, margin: '14px 0 4px' }}>Recent Movements</div>
            {(detail.transactions || []).length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>No movements.</div> : (
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>Type</th><th>Qty</th><th>Balance</th><th>When</th></tr></thead>
                <tbody>{detail.transactions.map(t => (
                  <tr key={t._id}><td>{t.type}</td><td style={{ color: t.quantity < 0 ? 'var(--danger,#ef4444)' : 'var(--success,#22c55e)' }}>{t.quantity > 0 ? '+' : ''}{t.quantity}</td><td>{t.balanceAfter}</td><td style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{new Date(t.createdAt).toLocaleDateString()}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title="Delete item" message={`Delete "${del?.name}"?`} />
    </div>
  );
}
