import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Button, Modal, Confirm, Badge, Pagination } from '../../../components/ui/index';

const empty = { vehicle: '', date: new Date().toISOString().slice(0, 10), fuelType: 'diesel', litres: '', pricePerLitre: '', odometer: '', vendor: '', note: '' };
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

export default function TransportFuel() {
  const { data: meta } = useFetch(api.getMeta);
  const [rows, setRows] = useState([]);
  const [pg, setPg]     = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [vehicle, setVehicle] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const vehicles = meta?.vehicles || [];

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try { const res = await api.getFuel({ page, limit: 20, vehicle }); const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total }); }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [vehicle]);
  useEffect(() => { load(1); }, [vehicle]); // eslint-disable-line

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await api.createFuel({ ...form, litres: +form.litres || 0, pricePerLitre: +form.pricePerLitre || 0, odometer: +form.odometer || 0 });
      toast.success('Fuel entry added'); setModal(false); setForm(empty); load(1);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const remove = async () => { try { await api.deleteFuel(del._id); toast.success('Deleted'); setDel(null); load(pg.page); } catch (err) { toast.error(err.message); setDel(null); } };

  const columns = [
    { key: 'date', label: 'Date', render: r => new Date(r.date).toLocaleDateString() },
    { key: 'vehicle', label: 'Vehicle', render: r => r.vehicle?.vehicleNumber || '—' },
    { key: 'litres', label: 'Litres', render: r => `${r.litres} L` },
    { key: 'cost', label: 'Cost', render: r => fmt(r.totalCost) },
    { key: 'odo', label: 'Odometer', render: r => r.odometer ? `${r.odometer.toLocaleString()} km` : '—' },
    { key: 'mileage', label: 'Mileage', render: r => r.mileage ? <Badge variant={r.mileage < 3 ? 'danger' : r.mileage < 5 ? 'warning' : 'success'}>{r.mileage} km/l</Badge> : '—' },
    { key: 'vendor', label: 'Vendor', render: r => r.vendor || '—' },
    { key: 'a', label: '', render: r => <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button> },
  ];

  return (
    <div className="page">
      <PageHeader title="Fuel Management" subtitle="Fill-ups, mileage & fuel cost tracking"
        action={<Button onClick={() => { setForm(empty); setModal(true); }}>+ Add Fuel Entry</Button>} />
      <div style={{ marginBottom: 16 }}>
        <select className="form-control" style={{ maxWidth: 240 }} value={vehicle} onChange={e => setVehicle(e.target.value)}>
          <option value="">All vehicles</option>
          {vehicles.map(v => <option key={v._id} value={v._id}>{v.vehicleNumber}</option>)}
        </select>
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="⛽" emptyTitle="No fuel entries" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} title="Add Fuel Entry" maxWidth={560}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="fuel-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="fuel-form" onSubmit={save}>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Vehicle</label>
              <select className="form-control" required value={form.vehicle} onChange={e => set('vehicle', e.target.value)}>
                <option value="">— Select —</option>{vehicles.map(v => <option key={v._id} value={v._id}>{v.vehicleNumber}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-control" value={form.date} onChange={e => set('date', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Litres</label><input type="number" step="0.01" className="form-control" required value={form.litres} onChange={e => set('litres', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Price / Litre</label><input type="number" step="0.01" className="form-control" value={form.pricePerLitre} onChange={e => set('pricePerLitre', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Odometer (km)</label><input type="number" className="form-control" value={form.odometer} onChange={e => set('odometer', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Vendor / Pump</label><input className="form-control" value={form.vendor} onChange={e => set('vendor', e.target.value)} /></div>
          </div>
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Mileage is auto-computed from the odometer reading since the last fill-up.</div>
        </form>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete entry" message="Delete this fuel entry?" />
    </div>
  );
}
