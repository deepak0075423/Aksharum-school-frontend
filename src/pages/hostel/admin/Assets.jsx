import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { PageHeader, Table, Button, Modal, Badge, Pagination, Alert } from '../../../components/ui/index';
import { StatusBadge, Filters, label, dd, money } from '../shared';

const CATEGORIES = ['bed', 'mattress', 'table', 'chair', 'cupboard', 'fan', 'ac', 'electronics', 'fire_safety', 'kitchen', 'other'];
const STATUSES = ['in_room', 'issued', 'under_repair', 'returned', 'damaged', 'replaced', 'disposed'];
const CONDITIONS = ['new', 'good', 'fair', 'damaged', 'scrapped'];
const empty = {
  hostel: '', room: '', name: '', assetCode: '', category: 'other', quantity: 1,
  condition: 'good', inventoryAsset: '', remarks: '',
};

export default function Assets() {
  const [rows, setRows] = useState([]);
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ hostel: '', room: '', category: '', status: '' });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [act, setAct] = useState(null);
  const [actForm, setActForm] = useState({ student: '', room: '', note: '', damageCharge: '', condition: 'good' });
  const [busy, setBusy] = useState(false);
  const [invAssets, setInvAssets] = useState([]);
  const [residents, setResidents] = useState([]);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const allRooms = meta?.rooms || [];
  const formRooms = allRooms.filter((r) => !form.hostel || String(r.hostel) === form.hostel);
  const filterRooms = allRooms.filter((r) => !filters.hostel || String(r.hostel) === filters.hostel);

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const r = await api.getAssets({ page, limit: 20, ...filters });
      const d = r.data ?? r;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters]);
  useEffect(() => { load(1); }, [filters]); // eslint-disable-line

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'hostel' ? { room: '' } : {}) }));

  const open = async (row) => {
    if (row) {
      setEditId(row._id);
      setForm({ ...empty, ...row, hostel: row.hostel?._id || row.hostel, room: row.room?._id || row.room || '', inventoryAsset: row.inventoryAsset?._id || row.inventoryAsset || '' });
    } else { setEditId(null); setForm({ ...empty, hostel: filters.hostel || hostels[0]?._id || '' }); }
    setModal(true);
    try { const r = await api.getInventoryAssets(); setInvAssets(r.data ?? r); } catch { setInvAssets([]); }
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const p = { ...form, room: form.room || null, inventoryAsset: form.inventoryAsset || null, quantity: Number(form.quantity) || 1 };
      if (editId) await api.updateAsset(editId, p); else await api.createAsset(p);
      toast.success('Saved'); setModal(false); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const openAct = async (row, action) => {
    setAct({ row, action });
    setActForm({ student: '', room: '', note: '', damageCharge: '', condition: row.condition || 'good' });
    if (action === 'issue') {
      try {
        const r = await api.getAllocations({ status: 'active', limit: 300 });
        setResidents((r.data ?? r).data || []);
      } catch { setResidents([]); }
    }
  };

  const submitAct = async () => {
    setBusy(true);
    try {
      const r = await api.actOnAsset(act.row._id, {
        action: act.action,
        student: actForm.student || null,
        room: actForm.room || null,
        note: actForm.note,
        damageCharge: actForm.damageCharge === '' ? null : Number(actForm.damageCharge),
        condition: actForm.condition || null,
      });
      const d = r.data ?? r;
      toast.success(`Asset ${label(act.action)}`);
      if (d.fine) toast(`A damage charge of ${money(d.fine.netAmount)} was billed`, { icon: '💳', duration: 6000 });
      setAct(null); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'name', label: 'Asset', render: (r) => (
      <div>
        <strong>{r.name}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
          {r.assetCode || '—'}{r.inventoryAsset ? ' · linked to Inventory' : ''}
        </div>
      </div>
    ) },
    { key: 'category', label: 'Category', render: (r) => <Badge variant="muted">{label(r.category)}</Badge> },
    { key: 'where', label: 'Location', render: (r) => (
      <div style={{ fontSize: '.82rem' }}>
        {r.hostel?.name}
        {r.room?.roomNumber && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Room {r.room.roomNumber}</div>}
      </div>
    ) },
    { key: 'qty', label: 'Qty', render: (r) => r.quantity },
    { key: 'condition', label: 'Condition', render: (r) => (
      <Badge variant={['damaged', 'scrapped'].includes(r.condition) ? 'danger' : r.condition === 'fair' ? 'warning' : 'success'}>
        {label(r.condition)}
      </Badge>
    ) },
    { key: 'issued', label: 'Issued to', render: (r) => r.issuedTo?.name || <span className="text-muted">—</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {r.status === 'in_room' && <Button size="sm" onClick={() => openAct(r, 'issue')}>Issue</Button>}
        {r.status === 'issued' && <Button size="sm" onClick={() => openAct(r, 'return')}>Return</Button>}
        <Button size="sm" variant="secondary" onClick={() => openAct(r, 'transfer')}>Move</Button>
        <Button size="sm" variant="danger" onClick={() => openAct(r, 'damage')}>Damage</Button>
        <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Hostel Inventory & Assets" subtitle="Room- and student-wise mapping over the school's inventory"
        action={<Button onClick={() => open()}>+ Add Asset</Button>} />

      <Alert variant="info">
        Expensive tracked items stay in the Inventory module — link one here and this row records
        where it sits and who holds it. Bulk furniture the school never entered into Inventory can be
        added directly.
      </Alert>

      <div style={{ marginTop: 16 }}>
        <Filters>
          <select className="form-control" style={{ maxWidth: 200 }} value={filters.hostel} onChange={(e) => setFilters((f) => ({ ...f, hostel: e.target.value, room: '' }))}>
            <option value="">All hostels</option>
            {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
          </select>
          <select className="form-control" style={{ maxWidth: 160 }} value={filters.room} onChange={(e) => setFilters((f) => ({ ...f, room: e.target.value }))}>
            <option value="">All rooms</option>
            {filterRooms.map((r) => <option key={r._id} value={r._id}>Room {r.roomNumber}</option>)}
          </select>
          <select className="form-control" style={{ maxWidth: 170 }} value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
          </select>
          <select className="form-control" style={{ maxWidth: 170 }} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </Filters>

        <div className="card"><div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={rows} loading={loading} emptyIcon="📦" emptyTitle="No assets recorded" />
        </div></div>
        <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} maxWidth={620}
        title={editId ? 'Edit Asset' : 'Add Hostel Asset'}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="as-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="as-form" onSubmit={save}>
          {!editId && (
            <div className="form-group">
              <label className="form-label">Link to an Inventory asset</label>
              <select className="form-control" value={form.inventoryAsset}
                onChange={(e) => {
                  const inv = invAssets.find((a) => a._id === e.target.value);
                  setForm((f) => ({ ...f, inventoryAsset: e.target.value, name: inv?.name || f.name, assetCode: inv?.assetCode || f.assetCode }));
                }}>
                <option value="">Not tracked in Inventory</option>
                {invAssets.map((a) => <option key={a._id} value={a._id}>{a.name} ({a.assetCode})</option>)}
              </select>
            </div>
          )}
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Hostel</label>
              <select className="form-control" required value={form.hostel} onChange={(e) => set('hostel', e.target.value)}>
                <option value="">— select —</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Room</label>
              <select className="form-control" value={form.room} onChange={(e) => set('room', e.target.value)}>
                <option value="">Common area</option>
                {formRooms.map((r) => <option key={r._id} value={r._id}>Room {r.roomNumber}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Name</label>
              <input className="form-control" required value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Asset Code</label>
              <input className="form-control" value={form.assetCode} onChange={(e) => set('assetCode', e.target.value)} />
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={form.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input className="form-control" type="number" min="1" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Condition</label>
              <select className="form-control" value={form.condition} onChange={(e) => set('condition', e.target.value)}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Remarks</label>
            <input className="form-control" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </div>
        </form>
      </Modal>

      <Modal open={!!act} onClose={() => setAct(null)} maxWidth={480}
        title={act ? `${label(act.action)} — ${act.row.name}` : ''}
        footer={<><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button>
          <Button loading={busy} variant={act?.action === 'damage' ? 'danger' : 'primary'} onClick={submitAct}>Confirm</Button></>}>
        {act && <>
          {act.action === 'issue' && (
            <div className="form-group">
              <label className="form-label required">Issue to</label>
              <select className="form-control" value={actForm.student} onChange={(e) => setActForm((f) => ({ ...f, student: e.target.value }))}>
                <option value="">— select a resident —</option>
                {residents.map((a) => (
                  <option key={a._id} value={a.student?._id || a.student}>{a.student?.name} · Room {a.room?.roomNumber}</option>
                ))}
              </select>
            </div>
          )}
          {act.action === 'transfer' && (
            <div className="form-group">
              <label className="form-label required">Move to room</label>
              <select className="form-control" value={actForm.room} onChange={(e) => setActForm((f) => ({ ...f, room: e.target.value }))}>
                <option value="">— select —</option>
                {allRooms.map((r) => <option key={r._id} value={r._id}>Room {r.roomNumber}</option>)}
              </select>
            </div>
          )}
          {['return', 'replace'].includes(act.action) && (
            <div className="form-group">
              <label className="form-label">Condition on return</label>
              <select className="form-control" value={actForm.condition} onChange={(e) => setActForm((f) => ({ ...f, condition: e.target.value }))}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
          )}
          {act.action === 'damage' && (
            <div className="form-group">
              <label className="form-label">Damage charge</label>
              <input className="form-control" type="number" min="0" value={actForm.damageCharge} onChange={(e) => setActForm((f) => ({ ...f, damageCharge: e.target.value }))} />
              <div className="form-hint">A charge above zero is billed to the holder as a hostel fine.</div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Note</label>
            <textarea className="form-control" rows={2} value={actForm.note} onChange={(e) => setActForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
        </>}
      </Modal>
    </div>
  );
}
