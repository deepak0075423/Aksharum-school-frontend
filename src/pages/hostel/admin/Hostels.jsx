import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import {
  PageHeader, Table, Button, Modal, Confirm, Badge, Pagination, Card, Spinner,
} from '../../../components/ui/index';
import { StatusBadge, Filters, Field, FieldGrid, label } from '../shared';

const empty = {
  name: '', code: '', hostelType: 'boys', gender: 'male', capacity: '',
  address: '', city: '', state: '', pincode: '', contactNumber: '', email: '',
  warden: '', assistantWarden: '', description: '',
  entryTime: '06:00', exitTime: '21:00', curfewTime: '22:00',
  facilities: '', rules: '', status: 'active',
};

const TYPES = ['boys', 'girls', 'staff', 'other'];
const GENDERS = ['male', 'female', 'co_ed', 'any'];
const STATUSES = ['active', 'inactive', 'under_construction'];

export default function Hostels() {
  const [rows, setRows]     = useState([]);
  const [pg, setPg]         = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad]  = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType]     = useState('');
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel]       = useState(null);
  const [detail, setDetail] = useState(null);

  const { data: meta } = useFetch(api.getMeta, []);
  const staff = meta?.staff || [];

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const res = await api.getHostels({ page, limit: 20, search, status, hostelType: type });
      const d = res.data ?? res;
      setRows(d.data || []);
      setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [search, status, type]);
  useEffect(() => { load(1); }, [status, type]); // eslint-disable-line

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const open = (row) => {
    if (row) {
      setEditId(row._id);
      setForm({
        ...empty, ...row,
        warden: row.warden?._id || row.warden || '',
        assistantWarden: row.assistantWarden?._id || row.assistantWarden || '',
        facilities: (row.facilities || []).join(', '),
        rules: (row.rules || []).join('\n'),
      });
    } else { setEditId(null); setForm(empty); }
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        capacity: Number(form.capacity) || 0,
        warden: form.warden || null,
        assistantWarden: form.assistantWarden || null,
        facilities: form.facilities.split(',').map((s) => s.trim()).filter(Boolean),
        rules: form.rules.split('\n').map((s) => s.trim()).filter(Boolean),
      };
      if (editId) await api.updateHostel(editId, payload);
      else await api.createHostel(payload);
      toast.success(editId ? 'Hostel updated' : 'Hostel created');
      setModal(false);
      load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    try {
      await api.deleteHostel(del._id);
      toast.success('Hostel deactivated');
      setDel(null); load(pg.page);
    } catch (err) { toast.error(err.message); setDel(null); }
  };

  const openDetail = async (row) => {
    setDetail({ loading: true });
    try { const r = await api.getHostel(row._id); setDetail(r.data ?? r); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const columns = [
    { key: 'name', label: 'Hostel', render: (r) => (
      <div>
        <strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.name}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.code} · {label(r.hostelType)}</div>
      </div>
    ) },
    { key: 'gender', label: 'For', render: (r) => <Badge variant="info">{label(r.gender)}</Badge> },
    { key: 'occ', label: 'Occupancy', render: (r) => {
      const pct = r.totalBeds ? Math.round((r.occupiedBeds / r.totalBeds) * 100) : 0;
      return (
        <div style={{ minWidth: 120 }}>
          <div style={{ fontSize: '.78rem' }}>{r.occupiedBeds || 0} / {r.totalBeds || 0} beds</div>
          <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, marginTop: 4 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? '#ef4444' : '#4f46e5', borderRadius: 3 }} />
          </div>
        </div>
      );
    } },
    { key: 'rooms', label: 'Rooms', render: (r) => r.totalRooms || 0 },
    { key: 'warden', label: 'Warden', render: (r) => r.warden?.name || <span className="text-muted">Not assigned</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>View</Button>
        <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel(r)}>Deactivate</Button>
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Hostels" subtitle="Buildings, wardens, timings and house rules"
        action={<Button onClick={() => open()}>+ Add Hostel</Button>} />

      <Filters>
        <input className="form-control" style={{ maxWidth: 300 }} placeholder="🔍 Search name or code…"
          value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1)} />
        <select className="form-control" style={{ maxWidth: 170 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 190 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </Filters>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🏨"
          emptyTitle="No hostels yet" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      {/* ── Create / edit ─────────────────────────────────────────────────── */}
      <Modal open={modal} onClose={() => setModal(false)} maxWidth={820}
        title={editId ? 'Edit Hostel' : 'Add Hostel'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="hostel-form" type="submit" loading={saving}>Save</Button>
        </>}>
        <form id="hostel-form" onSubmit={save}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Hostel Name</label>
              <input className="form-control" required value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Code</label>
              <input className="form-control" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="auto (HL-…) if blank" />
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={form.hostelType} onChange={(e) => set('hostelType', e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Gender restriction</label>
              <select className="form-control" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                {GENDERS.map((g) => <option key={g} value={g}>{label(g)}</option>)}
              </select>
              <div className="form-hint">Enforced at allocation time</div>
            </div>
            <div className="form-group">
              <label className="form-label">Capacity</label>
              <input className="form-control" type="number" min="0" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Warden</label>
              <select className="form-control" value={form.warden} onChange={(e) => set('warden', e.target.value)}>
                <option value="">— none —</option>
                {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Assistant Warden</label>
              <select className="form-control" value={form.assistantWarden} onChange={(e) => set('assistantWarden', e.target.value)}>
                <option value="">— none —</option>
                {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Entry Time</label>
              <input className="form-control" type="time" value={form.entryTime} onChange={(e) => set('entryTime', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Exit Time</label>
              <input className="form-control" type="time" value={form.exitTime} onChange={(e) => set('exitTime', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Curfew</label>
              <input className="form-control" type="time" value={form.curfewTime} onChange={(e) => set('curfewTime', e.target.value)} />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Contact Number</label>
              <input className="form-control" value={form.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-control" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <input className="form-control" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">City</label>
              <input className="form-control" value={form.city} onChange={(e) => set('city', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">State</label>
              <input className="form-control" value={form.state} onChange={(e) => set('state', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Pincode</label>
              <input className="form-control" value={form.pincode} onChange={(e) => set('pincode', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Facilities</label>
            <input className="form-control" value={form.facilities} onChange={(e) => set('facilities', e.target.value)}
              placeholder="wifi, laundry, gym, reading room" />
            <div className="form-hint">Comma separated</div>
          </div>
          <div className="form-group">
            <label className="form-label">Hostel Rules</label>
            <textarea className="form-control" rows={4} value={form.rules} onChange={(e) => set('rules', e.target.value)}
              placeholder="One rule per line" />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-control" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Detail ────────────────────────────────────────────────────────── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth={760} title={detail?.name || 'Hostel'}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : detail && (
          <div style={{ display: 'grid', gap: 18 }}>
            <div className="stats-grid" style={{ gap: 10 }}>
              {[
                ['Buildings', detail.stats?.buildings], ['Rooms', detail.stats?.rooms],
                ['Beds', detail.stats?.totalBeds], ['Occupied', detail.stats?.occupiedBeds],
                ['Available', detail.stats?.availableBeds], ['Residents', detail.stats?.residents],
              ].map(([l, v]) => (
                <div key={l} className="card" style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{v ?? 0}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{l}</div>
                </div>
              ))}
            </div>
            <FieldGrid>
              <Field label="Code">{detail.code}</Field>
              <Field label="Type">{label(detail.hostelType)}</Field>
              <Field label="Gender">{label(detail.gender)}</Field>
              <Field label="Capacity">{detail.capacity || '—'}</Field>
              <Field label="Warden">{detail.warden?.name}</Field>
              <Field label="Assistant Warden">{detail.assistantWarden?.name}</Field>
              <Field label="Entry / Exit">{detail.entryTime || '—'} – {detail.exitTime || '—'}</Field>
              <Field label="Curfew">{detail.curfewTime}</Field>
              <Field label="Contact">{detail.contactNumber}</Field>
              <Field label="Address" wide>{[detail.address, detail.city, detail.state, detail.pincode].filter(Boolean).join(', ')}</Field>
            </FieldGrid>
            {!!detail.facilities?.length && (
              <div>
                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Facilities</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {detail.facilities.map((f) => <Badge key={f} variant="muted">{f}</Badge>)}
                </div>
              </div>
            )}
            {!!detail.rules?.length && (
              <div>
                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Rules</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: '.83rem' }}>
                  {detail.rules.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {!!detail.staff?.length && (
              <Card title="Assigned staff">
                {detail.staff.map((s) => (
                  <div key={s._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '.85rem' }}>{s.staff?.name}</span>
                    <Badge variant="muted">{label(s.role)}</Badge>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title="Deactivate hostel"
        message={`Deactivate ${del?.name}? Its history is kept — a hostel with residents cannot be deactivated.`} />
    </div>
  );
}
