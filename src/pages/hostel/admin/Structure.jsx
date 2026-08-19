import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { PageHeader, Table, Button, Modal, Confirm, Card } from '../../../components/ui/index';
import { StatusBadge, Filters, label } from '../shared';

// Buildings and floors are one screen: a floor only makes sense inside a
// building, and a warden setting up a block does both in the same sitting.
const emptyBuilding = { name: '', code: '', hostel: '', floorCount: '', capacity: '', description: '', status: 'active' };
const emptyFloor    = { name: '', building: '', floorNumber: '', capacity: '', supervisor: '', facilities: '', status: 'active' };
const STATUSES = ['active', 'inactive', 'maintenance'];

export default function Structure() {
  const [tab, setTab] = useState('buildings');
  const [hostel, setHostel] = useState('');
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [loading, setLoad] = useState(true);
  const [modal, setModal] = useState(null);        // 'building' | 'floor'
  const [form, setForm] = useState(emptyBuilding);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const staff = meta?.staff || [];

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const [b, f] = await Promise.all([
        api.getBuildings({ hostel: hostel || undefined }),
        api.getFloors({ hostel: hostel || undefined }),
      ]);
      setBuildings(b.data ?? b);
      setFloors(f.data ?? f);
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [hostel]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openBuilding = (row) => {
    setModal('building');
    if (row) { setEditId(row._id); setForm({ ...emptyBuilding, ...row, hostel: row.hostel?._id || row.hostel }); }
    else { setEditId(null); setForm({ ...emptyBuilding, hostel: hostel || hostels[0]?._id || '' }); }
  };
  const openFloor = (row) => {
    setModal('floor');
    if (row) {
      setEditId(row._id);
      setForm({
        ...emptyFloor, ...row,
        building: row.building?._id || row.building,
        supervisor: row.supervisor?._id || row.supervisor || '',
        facilities: (row.facilities || []).join(', '),
      });
    } else { setEditId(null); setForm({ ...emptyFloor, building: buildings[0]?._id || '' }); }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'building') {
        const p = { ...form, floorCount: Number(form.floorCount) || 0, capacity: Number(form.capacity) || 0 };
        if (editId) await api.updateBuilding(editId, p); else await api.createBuilding(p);
        toast.success(editId ? 'Building updated' : 'Building added');
      } else {
        const p = {
          ...form,
          floorNumber: Number(form.floorNumber) || 0,
          capacity: Number(form.capacity) || 0,
          supervisor: form.supervisor || null,
          facilities: String(form.facilities).split(',').map((s) => s.trim()).filter(Boolean),
        };
        if (editId) await api.updateFloor(editId, p); else await api.createFloor(p);
        toast.success(editId ? 'Floor updated' : 'Floor added');
      }
      setModal(null); load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    try {
      if (del.kind === 'building') await api.deleteBuilding(del.row._id);
      else await api.deleteFloor(del.row._id);
      toast.success('Deactivated');
      setDel(null); load();
    } catch (err) { toast.error(err.message); setDel(null); }
  };

  const occCell = (r) => (
    <span style={{ fontSize: '.8rem' }}>
      {r.occupiedBeds || 0} / {r.totalBeds || 0}
      <span style={{ color: 'var(--text-muted)' }}> · {r.availableBeds || 0} free</span>
    </span>
  );

  const buildingColumns = [
    { key: 'name', label: 'Building', render: (r) => (
      <div><strong>{r.name}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.code}</div></div>
    ) },
    { key: 'hostel', label: 'Hostel', render: (r) => r.hostel?.name || '—' },
    { key: 'floors', label: 'Floors', render: (r) => r.floors || 0 },
    { key: 'beds', label: 'Beds', render: occCell },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => openBuilding(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel({ kind: 'building', row: r })}>Deactivate</Button>
      </div>
    ) },
  ];

  const floorColumns = [
    { key: 'name', label: 'Floor', render: (r) => (
      <div><strong>{r.name}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Level {r.floorNumber}</div></div>
    ) },
    { key: 'building', label: 'Building', render: (r) => r.building?.name || '—' },
    { key: 'hostel', label: 'Hostel', render: (r) => r.hostel?.name || '—' },
    { key: 'rooms', label: 'Rooms', render: (r) => r.totalRooms || 0 },
    { key: 'beds', label: 'Beds', render: occCell },
    { key: 'sup', label: 'Supervisor', render: (r) => r.supervisor?.name || <span className="text-muted">—</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => openFloor(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel({ kind: 'floor', row: r })}>Deactivate</Button>
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Buildings & Floors" subtitle="The physical structure each room hangs off"
        action={<div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => openBuilding()}>+ Building</Button>
          <Button onClick={() => openFloor()} disabled={!buildings.length}>+ Floor</Button>
        </div>} />

      <Filters>
        <select className="form-control" style={{ maxWidth: 260 }} value={hostel} onChange={(e) => setHostel(e.target.value)}>
          <option value="">All hostels</option>
          {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
        </select>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={`tab${tab === 'buildings' ? ' active' : ''}`} onClick={() => setTab('buildings')}>
            Buildings ({buildings.length})
          </button>
          <button className={`tab${tab === 'floors' ? ' active' : ''}`} onClick={() => setTab('floors')}>
            Floors ({floors.length})
          </button>
        </div>
      </Filters>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        {tab === 'buildings'
          ? <Table columns={buildingColumns} data={buildings} loading={loading} emptyIcon="🏗" emptyTitle="No buildings yet" />
          : <Table columns={floorColumns} data={floors} loading={loading} emptyIcon="🪜" emptyTitle="No floors yet" />}
      </div></div>

      <Modal open={!!modal} onClose={() => setModal(null)} maxWidth={620}
        title={`${editId ? 'Edit' : 'Add'} ${modal === 'building' ? 'Building' : 'Floor'}`}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button form="struct-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="struct-form" onSubmit={save}>
          {modal === 'building' ? (
            <>
              <div className="form-group">
                <label className="form-label required">Hostel</label>
                <select className="form-control" required value={form.hostel} onChange={(e) => set('hostel', e.target.value)} disabled={!!editId}>
                  <option value="">— select —</option>
                  {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
                </select>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label required">Building Name</label>
                  <input className="form-control" required value={form.name} onChange={(e) => set('name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Code</label>
                  <input className="form-control" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="auto (BLD-…)" />
                </div>
              </div>
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label className="form-label">Number of Floors</label>
                  <input className="form-control" type="number" min="0" value={form.floorCount} onChange={(e) => set('floorCount', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Capacity</label>
                  <input className="form-control" type="number" min="0" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-control" value={form.description} onChange={(e) => set('description', e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label required">Building</label>
                <select className="form-control" required value={form.building} onChange={(e) => set('building', e.target.value)} disabled={!!editId}>
                  <option value="">— select —</option>
                  {buildings.map((b) => <option key={b._id} value={b._id}>{b.name} · {b.hostel?.name || ''}</option>)}
                </select>
              </div>
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label className="form-label required">Floor Name</label>
                  <input className="form-control" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ground / First" />
                </div>
                <div className="form-group">
                  <label className="form-label required">Floor Number</label>
                  <input className="form-control" type="number" required value={form.floorNumber} onChange={(e) => set('floorNumber', e.target.value)} />
                  <div className="form-hint">Unique per building</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Capacity</label>
                  <input className="form-control" type="number" min="0" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Floor Supervisor</label>
                  <select className="form-control" value={form.supervisor} onChange={(e) => set('supervisor', e.target.value)}>
                    <option value="">— none —</option>
                    {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Facilities</label>
                <input className="form-control" value={form.facilities} onChange={(e) => set('facilities', e.target.value)}
                  placeholder="common room, water cooler" />
                <div className="form-hint">Comma separated</div>
              </div>
            </>
          )}
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title={`Deactivate ${del?.kind}`}
        message={`Deactivate ${del?.row?.name}? Occupied beds block this — release the students first.`} />
    </div>
  );
}
