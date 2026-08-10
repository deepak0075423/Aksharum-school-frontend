import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Button, Modal, Confirm, Badge, Pagination } from '../../../components/ui/index';

const empty = { vehicle: '', maintenanceType: 'preventive', category: 'service', title: '', description: '',
  scheduledDate: '', cost: '', labourCost: '', vendor: '', odometer: '', status: 'scheduled', nextDueDate: '' };
const di = (v) => v ? new Date(v).toISOString().slice(0, 10) : '';
const ST = { scheduled: 'info', in_progress: 'warning', completed: 'success', cancelled: 'muted' };

export default function TransportMaintenance() {
  const { data: meta } = useFetch(api.getMeta);
  const [rows, setRows] = useState([]);
  const [pg, setPg]     = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const vehicles = meta?.vehicles || [];

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try { const res = await api.getMaintenance({ page, limit: 20, status }); const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total }); }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [status]);
  useEffect(() => { load(1); }, [status]); // eslint-disable-line

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const open = (row) => {
    if (row) setEditId(row._id), setForm({ ...empty, ...row, vehicle: row.vehicle?._id || row.vehicle, scheduledDate: di(row.scheduledDate), nextDueDate: di(row.nextDueDate) });
    else setEditId(null), setForm(empty);
    setModal(true);
  };
  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { const p = { ...form, cost: +form.cost || 0, labourCost: +form.labourCost || 0, odometer: +form.odometer || 0 };
      if (editId) await api.updateMaintenance(editId, p); else await api.createMaintenance(p);
      toast.success('Saved'); setModal(false); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const remove = async () => { try { await api.deleteMaintenance(del._id); toast.success('Deleted'); setDel(null); load(pg.page); } catch (err) { toast.error(err.message); setDel(null); } };
  const setStat = async (row, s) => { try { await api.updateMaintenance(row._id, { status: s }); toast.success(`Marked ${s.replace('_',' ')}`); load(pg.page); } catch (err) { toast.error(err.message); } };

  const columns = [
    { key: 'title', label: 'Job', render: r => <div><strong>{r.title}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.vehicle?.vehicleNumber} · {r.category?.replace('_',' ')}</div></div> },
    { key: 'type', label: 'Type', render: r => <Badge variant={r.maintenanceType === 'corrective' ? 'warning' : 'info'}>{r.maintenanceType}</Badge> },
    { key: 'sched', label: 'Scheduled', render: r => r.scheduledDate ? new Date(r.scheduledDate).toLocaleDateString() : '—' },
    { key: 'cost', label: 'Cost', render: r => `₹${(r.cost || 0).toLocaleString()}` },
    { key: 'status', label: 'Status', render: r => <Badge variant={ST[r.status]}>{r.status?.replace('_', ' ')}</Badge> },
    { key: 'a', label: '', render: r => <div style={{ display: 'flex', gap: 6 }}>
      {r.status === 'scheduled' && <Button size="sm" variant="secondary" onClick={() => setStat(r, 'in_progress')}>Start</Button>}
      {r.status === 'in_progress' && <Button size="sm" variant="primary" onClick={() => setStat(r, 'completed')}>Complete</Button>}
      <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
      <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button></div> },
  ];

  return (
    <div className="page">
      <PageHeader title="Vehicle Maintenance" subtitle="Preventive & corrective servicing, cost & reminders"
        action={<Button onClick={() => open()}>+ Log Maintenance</Button>} />
      <div style={{ marginBottom: 16 }}>
        <select className="form-control" style={{ maxWidth: 200 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>{Object.keys(ST).map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🔧" emptyTitle="No maintenance records" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Maintenance' : 'Log Maintenance'} maxWidth={620}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="mt-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="mt-form" onSubmit={save}>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Vehicle</label>
              <select className="form-control" required value={form.vehicle} onChange={e => set('vehicle', e.target.value)}>
                <option value="">— Select —</option>{vehicles.map(v => <option key={v._id} value={v._id}>{v.vehicleNumber}</option>)}</select></div>
            <div className="form-group"><label className="form-label required">Title</label><input className="form-control" required value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. 10,000 km service" /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Type</label>
              <select className="form-control" value={form.maintenanceType} onChange={e => set('maintenanceType', e.target.value)}>
                {['preventive','corrective','scheduled'].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Category</label>
              <select className="form-control" value={form.category} onChange={e => set('category', e.target.value)}>
                {['oil_change','tyres','battery','brakes','engine','ac','body','service','other'].map(t => <option key={t} value={t}>{t.replace('_',' ')}</option>)}</select></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Scheduled Date</label><input type="date" className="form-control" value={form.scheduledDate} onChange={e => set('scheduledDate', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>{Object.keys(ST).map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}</select></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Total Cost (₹)</label><input type="number" className="form-control" value={form.cost} onChange={e => set('cost', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Vendor / Garage</label><input className="form-control" value={form.vendor} onChange={e => set('vendor', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Odometer (km)</label><input type="number" className="form-control" value={form.odometer} onChange={e => set('odometer', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Next Due Date</label><input type="date" className="form-control" value={form.nextDueDate} onChange={e => set('nextDueDate', e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Notes</label><textarea className="form-control" rows={2} value={form.description} onChange={e => set('description', e.target.value)} /></div>
        </form>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete record" message={`Delete "${del?.title}"?`} />
    </div>
  );
}
