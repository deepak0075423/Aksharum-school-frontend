import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Button, Modal, Badge, Pagination } from '../../../components/ui/index';

const empty = { vehicle: '', driver: '', date: new Date().toISOString().slice(0, 10), type: 'accident', severity: 'minor',
  description: '', location: { address: '' }, repairCost: '', status: 'reported', actionsTaken: '',
  policeReport: { filed: false, firNumber: '' }, insuranceClaim: { status: 'none', amount: '' } };
const SEV = { minor: 'info', major: 'warning', critical: 'danger' };
const ST  = { reported: 'warning', investigating: 'info', resolved: 'success', closed: 'muted' };

export default function TransportIncidents() {
  const { data: meta } = useFetch(api.getMeta);
  const [rows, setRows] = useState([]);
  const [pg, setPg]     = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const vehicles = meta?.vehicles || [], drivers = meta?.drivers || [];

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try { const res = await api.getIncidents({ page, limit: 20, status }); const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total }); }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [status]);
  useEffect(() => { load(1); }, [status]); // eslint-disable-line

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setN = (g, k, v) => setForm(f => ({ ...f, [g]: { ...f[g], [k]: v } }));
  const open = (row) => {
    if (row) setEditId(row._id), setForm({ ...empty, ...row, date: row.date ? new Date(row.date).toISOString().slice(0,10) : '',
      vehicle: row.vehicle?._id || row.vehicle || '', driver: row.driver?._id || row.driver || '',
      location: { ...empty.location, ...(row.location || {}) }, policeReport: { ...empty.policeReport, ...(row.policeReport || {}) }, insuranceClaim: { ...empty.insuranceClaim, ...(row.insuranceClaim || {}) } });
    else setEditId(null), setForm(empty);
    setModal(true);
  };
  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { const p = { ...form, repairCost: +form.repairCost || 0, vehicle: form.vehicle || null, driver: form.driver || null,
      insuranceClaim: { ...form.insuranceClaim, amount: +form.insuranceClaim.amount || 0 } };
      if (editId) await api.updateIncident(editId, p); else await api.createIncident(p);
      toast.success('Saved'); setModal(false); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const columns = [
    { key: 'code', label: 'Incident', render: r => <div><strong>{r.incidentCode}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{new Date(r.date).toLocaleDateString()} · {r.vehicle?.vehicleNumber || '—'}</div></div> },
    { key: 'type', label: 'Type', render: r => <span style={{ textTransform: 'capitalize' }}>{r.type}</span> },
    { key: 'sev', label: 'Severity', render: r => <Badge variant={SEV[r.severity]}>{r.severity}</Badge> },
    { key: 'cost', label: 'Repair', render: r => `₹${(r.repairCost || 0).toLocaleString()}` },
    { key: 'status', label: 'Status', render: r => <Badge variant={ST[r.status]}>{r.status}</Badge> },
    { key: 'a', label: '', render: r => <Button size="sm" variant="secondary" onClick={() => open(r)}>Open</Button> },
  ];

  return (
    <div className="page">
      <PageHeader title="Accident & Incident Management" subtitle="Report, investigate & resolve incidents"
        action={<Button onClick={() => open()}>+ Report Incident</Button>} />
      <div style={{ marginBottom: 16 }}>
        <select className="form-control" style={{ maxWidth: 200 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>{Object.keys(ST).map(s => <option key={s} value={s}>{s}</option>)}</select>
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="⚠️" emptyTitle="No incidents reported" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? `Incident ${form.incidentCode || ''}` : 'Report Incident'} maxWidth={640}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button form="inc-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="inc-form" onSubmit={save}>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Vehicle</label>
              <select className="form-control" value={form.vehicle} onChange={e => set('vehicle', e.target.value)}><option value="">— Select —</option>{vehicles.map(v => <option key={v._id} value={v._id}>{v.vehicleNumber}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Driver</label>
              <select className="form-control" value={form.driver} onChange={e => set('driver', e.target.value)}><option value="">— Select —</option>{drivers.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}</select></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-control" value={form.date} onChange={e => set('date', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Type</label>
              <select className="form-control" value={form.type} onChange={e => set('type', e.target.value)}>{['accident','breakdown','medical','safety','fire','other'].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Severity</label>
              <select className="form-control" value={form.severity} onChange={e => set('severity', e.target.value)}>{Object.keys(SEV).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>{Object.keys(ST).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <div className="form-group"><label className="form-label">Location</label><input className="form-control" value={form.location.address} onChange={e => setN('location', 'address', e.target.value)} /></div>
          <div className="form-group"><label className="form-label required">Description</label><textarea className="form-control" rows={3} required value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Repair Cost (₹)</label><input type="number" className="form-control" value={form.repairCost} onChange={e => set('repairCost', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">FIR Number</label><input className="form-control" value={form.policeReport.firNumber} onChange={e => setN('policeReport', 'firNumber', e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Actions Taken</label><textarea className="form-control" rows={2} value={form.actionsTaken} onChange={e => set('actionsTaken', e.target.value)} /></div>
        </form>
      </Modal>
    </div>
  );
}
