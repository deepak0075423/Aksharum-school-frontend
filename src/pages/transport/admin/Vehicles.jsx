import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Button, Modal, Confirm, Badge, Pagination, Spinner } from '../../../components/ui/index';

const empty = {
  vehicleNumber: '', registrationNumber: '', busName: '', vehicleType: 'bus', capacity: '',
  fuelType: 'diesel', manufacturer: '', modelYear: '', odometer: '', mileage: '',
  engineNumber: '', chassisNumber: '', gpsDeviceId: '', rfidDeviceId: '',
  purchaseDate: '', purchaseCost: '', status: 'active',
  insuranceExpiry: '', fitnessExpiry: '', permitExpiry: '', roadTaxExpiry: '', pollutionExpiry: '',
};
const STATUS = { active: 'success', inactive: 'muted', maintenance: 'warning', retired: 'danger' };
const di = (v) => v ? new Date(v).toISOString().slice(0, 10) : '';
const soonBadge = (v) => {
  if (!v) return null;
  const days = Math.ceil((new Date(v) - Date.now()) / 864e5);
  if (days < 0)  return <Badge variant="danger">Expired</Badge>;
  if (days <= 30) return <Badge variant="warning">{days}d left</Badge>;
  return null;
};

export default function TransportVehicles() {
  const [rows, setRows]     = useState([]);
  const [pg, setPg]         = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad]  = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel]       = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const res = await api.getVehicles({ page, limit: 20, search, status });
      const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [search, status]);
  useEffect(() => { load(1); }, [status]); // eslint-disable-line

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const open = (row) => {
    if (row) setEditId(row._id), setForm({ ...empty, ...row,
      purchaseDate: di(row.purchaseDate), insuranceExpiry: di(row.insuranceExpiry), fitnessExpiry: di(row.fitnessExpiry),
      permitExpiry: di(row.permitExpiry), roadTaxExpiry: di(row.roadTaxExpiry), pollutionExpiry: di(row.pollutionExpiry) });
    else setEditId(null), setForm(empty);
    setModal(true);
  };
  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const p = { ...form, capacity: +form.capacity || 0, purchaseCost: +form.purchaseCost || 0,
        odometer: +form.odometer || 0, mileage: +form.mileage || 0, modelYear: +form.modelYear || null };
      if (editId) await api.updateVehicle(editId, p); else await api.createVehicle(p);
      toast.success(editId ? 'Vehicle updated' : 'Vehicle added'); setModal(false); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const remove = async () => {
    try { await api.deleteVehicle(del._id); toast.success('Retired'); setDel(null); load(pg.page); }
    catch (err) { toast.error(err.message); setDel(null); }
  };
  const openDetail = async (row) => {
    setDetail({ loading: true });
    try { const r = await api.getVehicle(row._id); setDetail(r.data ?? r); } catch (err) { toast.error(err.message); setDetail(null); }
  };

  const columns = [
    { key: 'v', label: 'Vehicle', render: r => (
      <div><strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.vehicleNumber}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.registrationNumber}{r.busName ? ` · ${r.busName}` : ''}</div></div>
    )},
    { key: 'type', label: 'Type', render: r => <span style={{ textTransform: 'capitalize' }}>{r.vehicleType?.replace('_', ' ')}</span> },
    { key: 'cap', label: 'Occupancy', render: r => <Badge variant={r.currentOccupancy >= r.capacity && r.capacity ? 'warning' : 'info'}>{r.currentOccupancy || 0}/{r.capacity || 0}</Badge> },
    { key: 'compliance', label: 'Compliance', render: r => {
      const nearest = [r.insuranceExpiry, r.fitnessExpiry, r.permitExpiry, r.pollutionExpiry].filter(Boolean).sort((a,b) => new Date(a)-new Date(b))[0];
      return soonBadge(nearest) || <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>OK</span>;
    }},
    { key: 'status', label: 'Status', render: r => <Badge variant={STATUS[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'a', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>View</Button>
        <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel(r)}>Retire</Button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Fleet — Vehicles" subtitle="Buses, vans & their compliance documents"
        action={<Button onClick={() => open()}>+ Add Vehicle</Button>} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="form-control" style={{ maxWidth: 320 }} placeholder="🔍 Search number / registration…"
          value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)} />
        <select className="form-control" style={{ maxWidth: 180 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(STATUS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🚌" emptyTitle="No vehicles yet" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Vehicle' : 'Add Vehicle'} maxWidth={760}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="veh-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="veh-form" onSubmit={save}>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Fleet Number</label><input className="form-control" value={form.vehicleNumber} onChange={e => set('vehicleNumber', e.target.value)} placeholder="auto (VH-…) if blank" /></div>
            <div className="form-group"><label className="form-label required">Registration No.</label><input className="form-control" required value={form.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Bus Name</label><input className="form-control" value={form.busName} onChange={e => set('busName', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Type</label>
              <select className="form-control" value={form.vehicleType} onChange={e => set('vehicleType', e.target.value)}>
                {['bus','mini_bus','van','car','tempo','other'].map(t => <option key={t} value={t}>{t.replace('_',' ')}</option>)}
              </select></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Seating Capacity</label><input type="number" className="form-control" value={form.capacity} onChange={e => set('capacity', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Fuel Type</label>
              <select className="form-control" value={form.fuelType} onChange={e => set('fuelType', e.target.value)}>
                {['diesel','petrol','cng','electric','hybrid'].map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">GPS Device ID</label><input className="form-control" value={form.gpsDeviceId} onChange={e => set('gpsDeviceId', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">RFID Reader ID</label><input className="form-control" value={form.rfidDeviceId} onChange={e => set('rfidDeviceId', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Engine No.</label><input className="form-control" value={form.engineNumber} onChange={e => set('engineNumber', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Chassis No.</label><input className="form-control" value={form.chassisNumber} onChange={e => set('chassisNumber', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Odometer (km)</label><input type="number" className="form-control" value={form.odometer} onChange={e => set('odometer', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>
                {Object.keys(STATUS).map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <div style={{ fontSize: '.8rem', fontWeight: 700, margin: '10px 0 6px', color: 'var(--text-muted)' }}>Compliance expiry dates</div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Insurance</label><input type="date" className="form-control" value={form.insuranceExpiry} onChange={e => set('insuranceExpiry', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Fitness</label><input type="date" className="form-control" value={form.fitnessExpiry} onChange={e => set('fitnessExpiry', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Permit</label><input type="date" className="form-control" value={form.permitExpiry} onChange={e => set('permitExpiry', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Pollution (PUC)</label><input type="date" className="form-control" value={form.pollutionExpiry} onChange={e => set('pollutionExpiry', e.target.value)} /></div>
          </div>
        </form>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.vehicleNumber || 'Vehicle'} maxWidth={720}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : detail && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Badge variant="primary">{detail.registrationNumber}</Badge>
              <Badge variant={STATUS[detail.status]}>{detail.status}</Badge>
              <Badge variant="info">{detail.currentOccupancy || 0}/{detail.capacity} seats</Badge>
              <Badge variant="muted">{detail.fuelType} · {detail.mileage || 0} km/l</Badge>
            </div>
            <MiniTable title="Assigned Routes" rows={detail.history?.routes} cols={[['name','Route'],['routeCode','Code'],['shift','Shift']]} empty="No routes" />
            <MiniTable title="Recent Fuel" rows={detail.history?.fuel} cols={[['date','Date',v=>new Date(v).toLocaleDateString()],['litres','Litres'],['totalCost','Cost',v=>`₹${v}`],['mileage','km/l']]} empty="No fuel logs" />
            <MiniTable title="Maintenance" rows={detail.history?.maintenance} cols={[['title','Job'],['category','Category'],['status','Status'],['cost','Cost',v=>`₹${v}`]]} empty="No maintenance" />
            <MiniTable title="Incidents" rows={detail.history?.incidents} cols={[['incidentCode','Code'],['type','Type'],['severity','Severity'],['status','Status']]} empty="No incidents" />
          </div>
        )}
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Retire vehicle" message={`Retire "${del?.vehicleNumber}"? It will be removed from active fleet.`} />
    </div>
  );
}

function MiniTable({ title, rows = [], cols, empty }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: '.8rem', fontWeight: 600, margin: '10px 0 4px' }}>{title}</div>
      {(rows || []).length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{empty}</div> : (
        <table className="table" style={{ width: '100%' }}>
          <thead><tr>{cols.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={r._id || i}>{cols.map(c => <td key={c[0]}>{c[2] ? c[2](r[c[0]]) : (r[c[0]] ?? '—')}</td>)}</tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
