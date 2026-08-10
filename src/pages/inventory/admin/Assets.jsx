import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/inventory.api';
import { PageHeader, Table, Button, Modal, Confirm, Badge, Spinner } from '../../../components/ui/index';

const STATUS = { in_store: 'muted', assigned: 'info', under_repair: 'warning', disposed: 'danger', lost: 'danger' };
const STATUS_LABEL = { in_store: 'In Store', assigned: 'Assigned', under_repair: 'Under Repair', disposed: 'Disposed', lost: 'Lost' };
const REPAIR_STATUS = ['reported', 'assigned', 'in_progress', 'completed', 'returned'];
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

const empty = {
  name: '', assetCode: '', serialNumber: '', item: '', warehouse: '', assignedName: '', location: '',
  purchaseDate: '', purchaseCost: '', warrantyExpiry: '', amcExpiry: '', insuranceExpiry: '', depreciationRate: '', status: 'in_store',
};

export default function InventoryAssets() {
  const [params, setParams] = useSearchParams();
  const { data: meta } = useFetch(api.getMeta);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const statusFilter = params.get('status') || '';
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [repair, setRepair] = useState(null);   // new repair form

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.getAssets({ status: statusFilter || undefined }); setRows(res.data ?? res); }
    catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const items = meta?.items || [];
  const whs   = meta?.warehouses || [];
  const set   = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const open = (row) => {
    if (row) setForm({ ...empty, ...row,
      item: row.item?._id || row.item || '', warehouse: row.warehouse?._id || row.warehouse || '',
      purchaseDate: row.purchaseDate?.slice(0, 10) || '', warrantyExpiry: row.warrantyExpiry?.slice(0, 10) || '',
      amcExpiry: row.amcExpiry?.slice(0, 10) || '', insuranceExpiry: row.insuranceExpiry?.slice(0, 10) || '' });
    else setForm(empty);
    setEditId(row?._id || null); setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, item: form.item || null, warehouse: form.warehouse || null,
        purchaseCost: Number(form.purchaseCost) || 0, depreciationRate: Number(form.depreciationRate) || 0,
        purchaseDate: form.purchaseDate || null, warrantyExpiry: form.warrantyExpiry || null,
        amcExpiry: form.amcExpiry || null, insuranceExpiry: form.insuranceExpiry || null };
      if (editId) await api.updateAsset(editId, payload);
      else await api.createAsset(payload);
      toast.success(editId ? 'Asset updated' : 'Asset created');
      setModal(false); load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await api.deleteAsset(del._id); toast.success('Deleted'); setDel(null); load(); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const openDetail = async (row) => {
    setDetail({ loading: true });
    try { const res = await api.getAsset(row._id); setDetail(res.data ?? res); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const addRepair = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.addRepair(detail._id, repair);
      setDetail(res.data ?? res); setRepair(null); toast.success('Repair logged'); load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const setRepairStatus = async (rid, status) => {
    try {
      const cost = status === 'completed' ? Number(prompt('Repair cost (₹)?', '0') || 0) : undefined;
      const res = await api.updateRepair(detail._id, rid, { status, ...(cost !== undefined && { cost }) });
      setDetail(res.data ?? res); toast.success('Repair updated'); load();
    } catch (err) { toast.error(err.message); }
  };

  const columns = [
    { key: 'name', label: 'Asset', render: r => <div><strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.name}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.assetCode}{r.serialNumber ? ` · SN ${r.serialNumber}` : ''}</div></div> },
    { key: 'assignedTo', label: 'Assigned', render: r => r.assignedTo?.name || r.assignedName || '—' },
    { key: 'warrantyExpiry', label: 'Warranty', render: r => r.warrantyExpiry ? new Date(r.warrantyExpiry).toLocaleDateString() : '—' },
    { key: 'status', label: 'Status', render: r => <Badge variant={STATUS[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
    { key: 'actions', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>View</Button>
        <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>
      </div>
    )},
  ];

  const d = detail && !detail.loading ? detail : null;

  return (
    <div className="page">
      <PageHeader title="Assets & Maintenance" subtitle="Track expensive items, warranty, AMC & repairs"
        action={<Button onClick={() => open()}>+ Add Asset</Button>} />

      <div style={{ marginBottom: 12 }}>
        <select className="form-control" style={{ maxWidth: 200 }} value={statusFilter}
          onChange={e => { const p = new URLSearchParams(params); if (e.target.value) p.set('status', e.target.value); else p.delete('status'); setParams(p); }}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_LABEL).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="💻" emptyTitle="No assets yet" />
      </div></div>

      {/* Create / Edit */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Asset' : 'Add Asset'} maxWidth={680}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="asset-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="asset-form" onSubmit={save}>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Asset Name</label><input className="form-control" required value={form.name} onChange={e => set('name', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Asset Code</label><input className="form-control" value={form.assetCode} onChange={e => set('assetCode', e.target.value)} placeholder="auto if blank" /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Serial Number</label><input className="form-control" value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Linked Item</label>
              <select className="form-control" value={form.item} onChange={e => set('item', e.target.value)}>
                <option value="">— None —</option>{items.map(i => <option key={i._id} value={i._id}>{i.name}</option>)}
              </select></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Warehouse</label>
              <select className="form-control" value={form.warehouse} onChange={e => set('warehouse', e.target.value)}>
                <option value="">— None —</option>{whs.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">Assigned To (name)</label><input className="form-control" value={form.assignedName} onChange={e => set('assignedName', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Purchase Date</label><input type="date" className="form-control" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Purchase Cost (₹)</label><input type="number" className="form-control" value={form.purchaseCost} onChange={e => set('purchaseCost', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Warranty Expiry</label><input type="date" className="form-control" value={form.warrantyExpiry} onChange={e => set('warrantyExpiry', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">AMC Expiry</label><input type="date" className="form-control" value={form.amcExpiry} onChange={e => set('amcExpiry', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Insurance Expiry</label><input type="date" className="form-control" value={form.insuranceExpiry} onChange={e => set('insuranceExpiry', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Depreciation Rate (%/yr)</label><input type="number" className="form-control" value={form.depreciationRate} onChange={e => set('depreciationRate', e.target.value)} /></div>
          </div>
        </form>
      </Modal>

      {/* Detail + repairs */}
      <Modal open={!!detail} onClose={() => { setDetail(null); setRepair(null); }} title={d?.name || 'Asset'} maxWidth={640}
        footer={d && !repair ? <Button onClick={() => setRepair({ complaint: '', technician: '', note: '' })}>+ Log Repair</Button> : null}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : d && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Badge variant="primary">{d.assetCode}</Badge>
              <Badge variant={STATUS[d.status]}>{STATUS_LABEL[d.status]}</Badge>
              {d.assignedTo?.name || d.assignedName ? <Badge variant="info">Assigned: {d.assignedTo?.name || d.assignedName}</Badge> : null}
            </div>
            <div style={{ fontSize: '.82rem', lineHeight: 1.8, color: 'var(--text-muted)' }}>
              {d.serialNumber && <div>Serial: {d.serialNumber}</div>}
              {d.purchaseCost ? <div>Cost: {fmt(d.purchaseCost)}</div> : null}
              {d.warrantyExpiry && <div>Warranty until {new Date(d.warrantyExpiry).toLocaleDateString()}</div>}
              {d.amcExpiry && <div>AMC until {new Date(d.amcExpiry).toLocaleDateString()}</div>}
            </div>

            {repair ? (
              <form onSubmit={addRepair} style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div className="form-group"><label className="form-label required">Complaint</label><input className="form-control" required value={repair.complaint} onChange={e => setRepair(r => ({ ...r, complaint: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Technician</label><input className="form-control" value={repair.technician} onChange={e => setRepair(r => ({ ...r, technician: e.target.value }))} /></div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Button type="button" variant="secondary" onClick={() => setRepair(null)}>Cancel</Button>
                  <Button type="submit" loading={saving}>Save Repair</Button>
                </div>
              </form>
            ) : (
              <>
                <div style={{ fontSize: '.8rem', fontWeight: 600, margin: '14px 0 4px' }}>Repair History</div>
                {(d.repairs || []).length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>No repairs logged.</div> : d.repairs.map(rp => (
                  <div key={rp._id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{rp.complaint}</strong>
                      <Badge variant={rp.status === 'completed' || rp.status === 'returned' ? 'success' : 'warning'}>{rp.status}</Badge>
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>{rp.technician && `Tech: ${rp.technician} · `}{rp.cost ? `Cost: ${fmt(rp.cost)} · ` : ''}{new Date(rp.reportedAt).toLocaleDateString()}</div>
                    {!['completed', 'returned'].includes(rp.status) && (
                      <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {REPAIR_STATUS.filter(s => s !== rp.status).map(s => (
                          <button key={s} className="btn btn-secondary btn-sm" onClick={() => setRepairStatus(rp._id, s)}>{s.replace('_', ' ')}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete asset" message={`Delete "${del?.name}"?`} />
    </div>
  );
}
