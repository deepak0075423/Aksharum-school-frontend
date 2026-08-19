import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import {
  PageHeader, Button, Modal, Confirm, Badge, Pagination, Spinner, Empty, Card,
} from '../../../components/ui/index';
import { StatusBadge, Filters, Field, FieldGrid, BedTile, BedLegend, label, dd } from '../shared';

const emptyRoom = {
  roomNumber: '', code: '', floor: '', roomType: 'double', capacity: 2,
  gender: '', facilities: '', description: '', status: 'available', generateBeds: true,
};
const ROOM_TYPES = ['single', 'double', 'triple', 'four_bed', 'dormitory', 'custom'];
const ROOM_STATUS = ['available', 'partially_occupied', 'full', 'reserved', 'maintenance', 'inactive'];
const BED_STATES = ['available', 'reserved', 'maintenance', 'inactive'];
const TYPE_CAPACITY = { single: 1, double: 2, triple: 3, four_bed: 4, dormitory: 8 };

/**
 * Rooms are shown as cards with their beds drawn in, rather than as a plain
 * table: the question a warden actually asks is "which bed is free in 204?",
 * and a grid answers it at a glance (spec §32).
 */
export default function Rooms() {
  const [rows, setRows]    = useState([]);
  const [pg, setPg]        = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ hostel: '', building: '', floor: '', status: '', roomType: '', search: '' });
  const [modal, setModal]  = useState(false);
  const [form, setForm]    = useState(emptyRoom);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel]      = useState(null);
  const [detail, setDetail] = useState(null);
  const [bedModal, setBedModal] = useState(null);   // { bed, room }
  const [bedBusy, setBedBusy] = useState(false);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const buildings = (meta?.buildings || []).filter((b) => !filters.hostel || String(b.hostel) === filters.hostel);
  const floors = (meta?.floors || []).filter((f) => !filters.building || String(f.building) === filters.building);
  const allFloors = meta?.floors || [];

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const res = await api.getRooms({ page, limit: 24, ...filters });
      const d = res.data ?? res;
      setRows(d.data || []);
      setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters]);
  useEffect(() => { load(1); }, [filters.hostel, filters.building, filters.floor, filters.status, filters.roomType]); // eslint-disable-line

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setFilter = (k, v) => setFilters((f) => ({
    ...f, [k]: v,
    ...(k === 'hostel' ? { building: '', floor: '' } : {}),
    ...(k === 'building' ? { floor: '' } : {}),
  }));

  const open = (row) => {
    if (row) {
      setEditId(row._id);
      setForm({ ...emptyRoom, ...row, floor: row.floor?._id || row.floor, facilities: (row.facilities || []).join(', ') });
    } else { setEditId(null); setForm({ ...emptyRoom, floor: filters.floor || '' }); }
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const p = {
        ...form,
        capacity: Number(form.capacity) || 1,
        facilities: String(form.facilities).split(',').map((s) => s.trim()).filter(Boolean),
      };
      if (editId) await api.updateRoom(editId, p); else await api.createRoom(p);
      toast.success(editId ? 'Room updated' : 'Room created');
      setModal(false); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    try { await api.deleteRoom(del._id); toast.success('Room deactivated'); setDel(null); load(pg.page); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const openDetail = async (row) => {
    setDetail({ loading: true });
    try { const r = await api.getRoom(row._id); setDetail(r.data ?? r); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const addBeds = async (room) => {
    try {
      const r = await api.generateBeds(room._id, {});
      toast.success(`${(r.data ?? r).length} bed(s) added`);
      load(pg.page);
      if (detail?._id === room._id) openDetail(room);
    } catch (err) { toast.error(err.message); }
  };

  const changeBedState = async (status) => {
    setBedBusy(true);
    try {
      await api.setBedState(bedModal.bed._id, { status, remarks: bedModal.remarks || '' });
      toast.success(`Bed marked ${label(status)}`);
      setBedModal(null); load(pg.page);
      if (detail?._id) openDetail({ _id: detail._id });
    } catch (err) { toast.error(err.message); } finally { setBedBusy(false); }
  };

  return (
    <div className="page">
      <PageHeader title="Rooms & Beds" subtitle={`${pg.total} room(s) — click a bed to reserve it or send it for maintenance`}
        action={<Button onClick={() => open()} disabled={!allFloors.length}>+ Add Room</Button>} />

      <Filters>
        <input className="form-control" style={{ maxWidth: 220 }} placeholder="🔍 Room number…"
          value={filters.search} onChange={(e) => setFilter('search', e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(1)} />
        <select className="form-control" style={{ maxWidth: 200 }} value={filters.hostel} onChange={(e) => setFilter('hostel', e.target.value)}>
          <option value="">All hostels</option>
          {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 180 }} value={filters.building} onChange={(e) => setFilter('building', e.target.value)}>
          <option value="">All buildings</option>
          {buildings.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 160 }} value={filters.floor} onChange={(e) => setFilter('floor', e.target.value)}>
          <option value="">All floors</option>
          {floors.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 160 }} value={filters.roomType} onChange={(e) => setFilter('roomType', e.target.value)}>
          <option value="">All types</option>
          {ROOM_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 180 }} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {ROOM_STATUS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </Filters>

      <div style={{ marginBottom: 14 }}><BedLegend /></div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>
      ) : !rows.length ? (
        <Empty icon="🚪" title="No rooms yet" message="Add a floor first, then create rooms on it." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {rows.map((r) => (
            <div key={r._id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }} onClick={() => openDetail(r)}>
                    Room {r.roomNumber}
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                    {r.hostel?.name} · {r.building?.name} · {r.floor?.name}
                  </div>
                </div>
                <StatusBadge value={r.status} />
              </div>

              <div style={{ display: 'flex', gap: 6, margin: '10px 0 8px', flexWrap: 'wrap' }}>
                <Badge variant="muted">{label(r.roomType)}</Badge>
                <Badge variant="info">{r.occupiedBeds || 0}/{r.capacity} filled</Badge>
                {r.gender && <Badge variant="primary">{label(r.gender)}</Badge>}
              </div>

              {r.beds?.length ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {r.beds.map((b) => (
                    <BedTile key={b._id} bed={b} compact
                      onClick={(bed) => bed.status === 'occupied'
                        ? toast(`${bed.student?.name || 'Occupied'} — release from Allocations`, { icon: '🛏' })
                        : setBedModal({ bed, room: r })} />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: '6px 0 10px' }}>
                  No beds laid out yet.
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>Details</Button>
                <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
                {(r.beds?.length || 0) < r.capacity && (
                  <Button size="sm" onClick={() => addBeds(r)}>+ Beds</Button>
                )}
                <Button size="sm" variant="danger" onClick={() => setDel(r)}>Deactivate</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      {/* ── Room form ─────────────────────────────────────────────────────── */}
      <Modal open={modal} onClose={() => setModal(false)} maxWidth={640}
        title={editId ? `Edit Room ${form.roomNumber}` : 'Add Room'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="room-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="room-form" onSubmit={save}>
          {!editId && (
            <div className="form-group">
              <label className="form-label required">Floor</label>
              <select className="form-control" required value={form.floor} onChange={(e) => set('floor', e.target.value)}>
                <option value="">— select —</option>
                {allFloors.map((f) => <option key={f._id} value={f._id}>{f.name} (level {f.floorNumber})</option>)}
              </select>
            </div>
          )}
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Room Number</label>
              <input className="form-control" required value={form.roomNumber} onChange={(e) => set('roomNumber', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Code</label>
              <input className="form-control" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="auto (RM-…)" />
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Room Type</label>
              <select className="form-control" value={form.roomType}
                onChange={(e) => {
                  set('roomType', e.target.value);
                  if (TYPE_CAPACITY[e.target.value]) set('capacity', TYPE_CAPACITY[e.target.value]);
                }}>
                {ROOM_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Capacity</label>
              <input className="form-control" type="number" min="1" required value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Gender</label>
              <select className="form-control" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Inherit from hostel</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="any">Any</option>
              </select>
            </div>
          </div>
          {editId && (
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {ROOM_STATUS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
              <div className="form-hint">Occupancy statuses are maintained automatically; set maintenance or inactive by hand.</div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Facilities</label>
            <input className="form-control" value={form.facilities} onChange={(e) => set('facilities', e.target.value)}
              placeholder="attached bathroom, balcony, AC" />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-control" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          {!editId && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem' }}>
              <input type="checkbox" checked={form.generateBeds} onChange={(e) => set('generateBeds', e.target.checked)} />
              Lay out {form.capacity || 0} bed(s) automatically
            </label>
          )}
        </form>
      </Modal>

      {/* ── Room detail ───────────────────────────────────────────────────── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth={720} title={detail?.roomNumber ? `Room ${detail.roomNumber}` : 'Room'}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : detail && (
          <div style={{ display: 'grid', gap: 18 }}>
            <FieldGrid>
              <Field label="Hostel">{detail.hostel?.name}</Field>
              <Field label="Building">{detail.building?.name}</Field>
              <Field label="Floor">{detail.floor?.name}</Field>
              <Field label="Type">{label(detail.roomType)}</Field>
              <Field label="Capacity">{detail.capacity}</Field>
              <Field label="Status"><StatusBadge value={detail.status} /></Field>
            </FieldGrid>

            <div>
              <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Beds</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(detail.beds || []).map((b) => <BedTile key={b._id} bed={b} />)}
                {!detail.beds?.length && <span className="text-muted" style={{ fontSize: '.83rem' }}>No beds laid out.</span>}
              </div>
            </div>

            {!!detail.assets?.length && (
              <Card title={`Assets in this room (${detail.assets.length})`}>
                {detail.assets.map((a) => (
                  <div key={a._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '.84rem' }}>{a.name} × {a.quantity}</span>
                    <StatusBadge value={a.status} />
                  </div>
                ))}
              </Card>
            )}
            {!!detail.complaints?.length && (
              <Card title={`Recent complaints (${detail.complaints.length})`}>
                {detail.complaints.map((c) => (
                  <div key={c._id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '.83rem' }}>{c.ticketNumber} · {label(c.category)}</span>
                    <StatusBadge value={c.status} />
                  </div>
                ))}
              </Card>
            )}
            {!!detail.maintenance?.length && (
              <Card title={`Maintenance (${detail.maintenance.length})`}>
                {detail.maintenance.map((m) => (
                  <div key={m._id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '.83rem' }}>{m.requestNumber} · {label(m.category)}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{dd(m.createdAt)}</span>
                      <StatusBadge value={m.status} />
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}
      </Modal>

      {/* ── Bed state ─────────────────────────────────────────────────────── */}
      <Modal open={!!bedModal} onClose={() => setBedModal(null)} maxWidth={440}
        title={bedModal ? `Bed ${bedModal.bed.bedNumber} — Room ${bedModal.room.roomNumber}` : ''}>
        {bedModal && (
          <div>
            <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: 0 }}>
              Currently <strong>{label(bedModal.bed.status)}</strong>. Pick the new state:
            </p>
            <div className="form-group">
              <label className="form-label">Remark</label>
              <input className="form-control" value={bedModal.remarks || ''}
                onChange={(e) => setBedModal((m) => ({ ...m, remarks: e.target.value }))}
                placeholder="Optional — kept on the bed and in the audit log" />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {BED_STATES.filter((s) => s !== bedModal.bed.status).map((s) => (
                <Button key={s} size="sm" loading={bedBusy}
                  variant={s === 'available' ? 'primary' : s === 'inactive' ? 'danger' : 'secondary'}
                  onClick={() => changeBedState(s)}>
                  Mark {label(s)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title="Deactivate room"
        message={`Deactivate room ${del?.roomNumber}? Occupied beds block this.`} />
    </div>
  );
}
