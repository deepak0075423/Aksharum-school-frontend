import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Button, Modal, Confirm, Badge, Pagination, Spinner } from '../../../components/ui/index';

const empty = {
  name: '', routeCode: '', shift: 'both', routeType: 'regular', vehicle: '', driver: '', backupDriver: '', attendant: '',
  startPoint: '', endPoint: 'School', distanceKm: '', estimatedDurationMin: '', geofenceRadiusM: 150, status: 'active', stops: [],
};
const newStop = () => ({ name: '', arrivalTime: '', eveningTime: '', landmark: '', latitude: '', longitude: '', distanceFromStart: '', maxStudents: '' });

export default function TransportRoutes() {
  const { data: meta } = useFetch(api.getMeta);
  const [rows, setRows] = useState([]);
  const [pg, setPg]     = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const [detail, setDetail] = useState(null);
  const vehicles = meta?.vehicles || [], drivers = meta?.drivers || [], attendants = meta?.attendants || [];

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try { const res = await api.getRoutes({ page, limit: 20, search }); const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total }); }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [search]);
  useEffect(() => { load(1); }, []); // eslint-disable-line

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setStop = (i, k, v) => setForm(f => ({ ...f, stops: f.stops.map((s, j) => j === i ? { ...s, [k]: v } : s) }));
  const addStop = () => setForm(f => ({ ...f, stops: [...f.stops, newStop()] }));
  const rmStop  = (i) => setForm(f => ({ ...f, stops: f.stops.filter((_, j) => j !== i) }));

  const open = (row) => {
    if (row) setEditId(row._id), setForm({ ...empty, ...row,
      vehicle: row.vehicle?._id || row.vehicle || '', driver: row.driver?._id || row.driver || '',
      backupDriver: row.backupDriver || '', attendant: row.attendant?._id || row.attendant || '',
      stops: (row.stops || []).map(s => ({ ...newStop(), ...s })) });
    else setEditId(null), setForm({ ...empty, stops: [newStop()] });
    setModal(true);
  };
  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const p = { ...form, distanceKm: +form.distanceKm || 0, estimatedDurationMin: +form.estimatedDurationMin || 0,
        vehicle: form.vehicle || null, driver: form.driver || null, backupDriver: form.backupDriver || null, attendant: form.attendant || null,
        stops: form.stops.filter(s => s.name).map((s, i) => ({ ...s, sequence: i + 1,
          latitude: s.latitude === '' ? null : +s.latitude, longitude: s.longitude === '' ? null : +s.longitude,
          distanceFromStart: +s.distanceFromStart || 0, maxStudents: +s.maxStudents || 0 })) };
      if (editId) await api.updateRoute(editId, p); else await api.createRoute(p);
      toast.success('Route saved'); setModal(false); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const remove = async () => { try { await api.deleteRoute(del._id); toast.success('Deleted'); setDel(null); load(pg.page); } catch (err) { toast.error(err.message); setDel(null); } };
  const optimize = async (id) => { try { await api.optimizeRoute(id); toast.success('Stops re-ordered by distance'); } catch (err) { toast.error(err.message); } };
  const openDetail = async (row) => { setDetail({ loading: true }); try { const r = await api.getRoute(row._id); setDetail(r.data ?? r); } catch (err) { toast.error(err.message); setDetail(null); } };

  const columns = [
    { key: 'name', label: 'Route', render: r => <div><strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.name}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.routeCode} · {r.stops?.length || 0} stops</div></div> },
    { key: 'shift', label: 'Shift', render: r => <Badge variant="info">{r.shift}</Badge> },
    { key: 'vehicle', label: 'Vehicle', render: r => r.vehicle?.vehicleNumber || <span style={{ color: 'var(--warning,#f59e0b)' }}>Unassigned</span> },
    { key: 'driver', label: 'Driver', render: r => r.driver?.name || '—' },
    { key: 'students', label: 'Students', render: r => <Badge variant={r.vehicle && r.studentCount >= r.vehicle.capacity ? 'warning' : 'muted'}>{r.studentCount || 0}{r.vehicle ? `/${r.vehicle.capacity}` : ''}</Badge> },
    { key: 'status', label: 'Status', render: r => <Badge variant={r.status === 'active' ? 'success' : 'muted'}>{r.status}</Badge> },
    { key: 'a', label: '', render: r => <div style={{ display: 'flex', gap: 6 }}>
      <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
      <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button></div> },
  ];

  return (
    <div className="page">
      <PageHeader title="Route Management" subtitle="Stops, timings, crew & vehicle assignment"
        action={<Button onClick={() => open()}>+ Create Route</Button>} />
      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <input className="form-control" placeholder="🔍 Search route name / code…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)} />
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🛣️" emptyTitle="No routes yet" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Route' : 'Create Route'} maxWidth={820}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="rt-form" type="submit" loading={saving}>Save Route</Button></>}>
        <form id="rt-form" onSubmit={save}>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Route Name</label><input className="form-control" required value={form.name} onChange={e => set('name', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Route Code</label><input className="form-control" value={form.routeCode} onChange={e => set('routeCode', e.target.value)} placeholder="auto if blank" /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Shift</label>
              <select className="form-control" value={form.shift} onChange={e => set('shift', e.target.value)}>{['morning','evening','both'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Route Type</label>
              <select className="form-control" value={form.routeType} onChange={e => set('routeType', e.target.value)}>{['regular','holiday','temporary','alternative'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Vehicle</label>
              <select className="form-control" value={form.vehicle} onChange={e => set('vehicle', e.target.value)}>
                <option value="">— Unassigned —</option>{vehicles.map(v => <option key={v._id} value={v._id}>{v.vehicleNumber} ({v.capacity} seats)</option>)}</select></div>
            <div className="form-group"><label className="form-label">Driver</label>
              <select className="form-control" value={form.driver} onChange={e => set('driver', e.target.value)}>
                <option value="">— None —</option>{drivers.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}</select></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Attendant</label>
              <select className="form-control" value={form.attendant} onChange={e => set('attendant', e.target.value)}>
                <option value="">— None —</option>{attendants.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Distance (km)</label><input type="number" step="0.1" className="form-control" value={form.distanceKm} onChange={e => set('distanceKm', e.target.value)} /></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 6px' }}>
            <div style={{ fontSize: '.85rem', fontWeight: 700 }}>Stops ({form.stops.length})</div>
            <Button size="sm" variant="secondary" type="button" onClick={addStop}>+ Add Stop</Button>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {form.stops.length === 0 && <div style={{ padding: 14, fontSize: '.8rem', color: 'var(--text-muted)' }}>No stops added yet.</div>}
            {form.stops.map((s, i) => (
              <div key={i} style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '20px 1.6fr .9fr .9fr .8fr .8fr 24px', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</span>
                <input className="form-control" placeholder="Stop name" value={s.name} onChange={e => setStop(i, 'name', e.target.value)} style={{ padding: '6px 8px', fontSize: '.8rem' }} />
                <input className="form-control" placeholder="AM 07:15" value={s.arrivalTime} onChange={e => setStop(i, 'arrivalTime', e.target.value)} style={{ padding: '6px 8px', fontSize: '.8rem' }} />
                <input className="form-control" placeholder="PM 15:20" value={s.eveningTime} onChange={e => setStop(i, 'eveningTime', e.target.value)} style={{ padding: '6px 8px', fontSize: '.8rem' }} />
                <input className="form-control" placeholder="km" value={s.distanceFromStart} onChange={e => setStop(i, 'distanceFromStart', e.target.value)} style={{ padding: '6px 8px', fontSize: '.8rem' }} />
                <input className="form-control" placeholder="max" value={s.maxStudents} onChange={e => setStop(i, 'maxStudents', e.target.value)} style={{ padding: '6px 8px', fontSize: '.8rem' }} />
                <button type="button" onClick={() => rmStop(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger,#ef4444)' }}>✕</button>
              </div>
            ))}
          </div>
        </form>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name || 'Route'} maxWidth={720}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : detail && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
              <Badge variant="primary">{detail.routeCode}</Badge>
              <Badge variant="info">{detail.shift}</Badge>
              {detail.vehicle && <Badge variant="muted">{detail.vehicle.vehicleNumber}</Badge>}
              {detail.driver && <Badge variant="muted">👨‍✈️ {detail.driver.name}</Badge>}
              <Badge variant="success">{detail.studentCount} students</Badge>
              <Button size="sm" variant="secondary" onClick={() => optimize(detail._id)} style={{ marginLeft: 'auto' }}>⚡ Optimize order</Button>
            </div>
            <div style={{ fontSize: '.8rem', fontWeight: 600, margin: '6px 0 4px' }}>Stops</div>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>#</th><th>Stop</th><th>AM</th><th>PM</th><th>km</th></tr></thead>
              <tbody>{[...(detail.stops || [])].sort((a,b)=>a.sequence-b.sequence).map(s => (
                <tr key={s._id} data-focus-id={s._id}><td>{s.sequence}</td><td>{s.name}</td><td>{s.arrivalTime || '—'}</td><td>{s.eveningTime || '—'}</td><td>{s.distanceFromStart || 0}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete route" message={`Delete "${del?.name}"?`} />
    </div>
  );
}
