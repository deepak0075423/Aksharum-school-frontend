import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Button, Modal, Confirm, Badge, Pagination } from '../../../components/ui/index';

const empty = {
  staffType: 'driver', name: '', employeeId: '', phone: '', gender: '', dateOfJoining: '', address: '',
  licenseNumber: '', licenseType: '', licenseExpiry: '', experienceYears: '', medicalCertExpiry: '',
  policeVerification: { status: '' },
  emergencyContact: { name: '', phone: '', relation: '' }, status: 'active',
};
const di = (v) => v ? new Date(v).toISOString().slice(0, 10) : '';
const STATUS = { active: 'success', inactive: 'muted', on_leave: 'warning' };
const expBadge = (v) => { if (!v) return null; const d = Math.ceil((new Date(v) - Date.now()) / 864e5); return d < 0 ? <Badge variant="danger">Expired</Badge> : d <= 30 ? <Badge variant="warning">{d}d</Badge> : null; };

export default function TransportStaff() {
  const [rows, setRows] = useState([]);
  const [pg, setPg]     = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try { const res = await api.getStaff({ page, limit: 20, search, staffType: type }); const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total }); }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [search, type]);
  useEffect(() => { load(1); }, [type]); // eslint-disable-line

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setN = (grp, k, v) => setForm(f => ({ ...f, [grp]: { ...f[grp], [k]: v } }));
  const open = (row) => {
    if (row) setEditId(row._id), setForm({ ...empty, ...row, dateOfJoining: di(row.dateOfJoining), licenseExpiry: di(row.licenseExpiry),
      medicalCertExpiry: di(row.medicalCertExpiry), policeVerification: { ...empty.policeVerification, ...(row.policeVerification || {}) },
      emergencyContact: { ...empty.emergencyContact, ...(row.emergencyContact || {}) } });
    else setEditId(null), setForm(empty);
    setModal(true);
  };
  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { const p = { ...form, experienceYears: +form.experienceYears || 0 };
      if (editId) await api.updateStaff(editId, p); else await api.createStaff(p);
      toast.success('Saved'); setModal(false); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const remove = async () => { try { await api.deleteStaff(del._id); toast.success('Removed'); setDel(null); load(pg.page); } catch (err) { toast.error(err.message); setDel(null); } };

  const columns = [
    { key: 'name', label: 'Name', render: r => <div><strong>{r.name}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.employeeId} · {r.phone || 'no phone'}</div></div> },
    { key: 'type', label: 'Role', render: r => <Badge variant={r.staffType === 'driver' ? 'info' : 'muted'}>{r.staffType}</Badge> },
    { key: 'lic', label: 'Licence', render: r => r.staffType === 'driver'
      ? <div style={{ fontSize: '.8rem' }}>{r.licenseNumber || '—'} {expBadge(r.licenseExpiry)}</div> : '—' },
    { key: 'perf', label: 'Performance', render: r => r.staffType === 'driver'
      ? <div style={{ fontSize: '.78rem' }}>🚦 {r.performance?.drivingScore ?? 100} · ⭐ {r.avgRating || 0} · {r.performance?.totalTrips || 0} trips</div> : '—' },
    { key: 'status', label: 'Status', render: r => <Badge variant={STATUS[r.status] || 'muted'}>{r.status?.replace('_', ' ')}</Badge> },
    { key: 'a', label: '', render: r => <div style={{ display: 'flex', gap: 6 }}>
      <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
      <Button size="sm" variant="danger" onClick={() => setDel(r)}>Remove</Button></div> },
  ];

  const isDriver = form.staffType === 'driver';
  return (
    <div className="page">
      <PageHeader title="Drivers & Crew" subtitle="Driver and bus-attendant records, licences & performance"
        action={<Button onClick={() => open()}>+ Add Staff</Button>} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="form-control" style={{ maxWidth: 300 }} placeholder="🔍 Search name / ID / phone…"
          value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)} />
        <select className="form-control" style={{ maxWidth: 180 }} value={type} onChange={e => setType(e.target.value)}>
          <option value="">All roles</option><option value="driver">Drivers</option><option value="attendant">Attendants</option>
        </select>
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🧑‍✈️" emptyTitle="No staff yet" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Staff' : 'Add Staff'} maxWidth={680}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="staff-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="staff-form" onSubmit={save}>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Role</label>
              <select className="form-control" value={form.staffType} onChange={e => set('staffType', e.target.value)}>
                <option value="driver">Driver</option><option value="attendant">Bus Attendant</option></select></div>
            <div className="form-group"><label className="form-label">Employee ID</label><input className="form-control" value={form.employeeId} onChange={e => set('employeeId', e.target.value)} placeholder="auto if blank" /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Full Name</label><input className="form-control" required value={form.name} onChange={e => set('name', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Joining Date</label><input type="date" className="form-control" value={form.dateOfJoining} onChange={e => set('dateOfJoining', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={e => set('status', e.target.value)}>{Object.keys(STATUS).map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}</select></div>
          </div>
          {isDriver && <>
            <div style={{ fontSize: '.8rem', fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-muted)' }}>Driving Licence</div>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Licence No.</label><input className="form-control" value={form.licenseNumber} onChange={e => set('licenseNumber', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Type (LMV/HMV)</label><input className="form-control" value={form.licenseType} onChange={e => set('licenseType', e.target.value)} /></div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Licence Expiry</label><input type="date" className="form-control" value={form.licenseExpiry} onChange={e => set('licenseExpiry', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Experience (yrs)</label><input type="number" className="form-control" value={form.experienceYears} onChange={e => set('experienceYears', e.target.value)} /></div>
            </div>
          </>}
          <div style={{ fontSize: '.8rem', fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-muted)' }}>Safety & Verification</div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Medical Cert. Expiry</label><input type="date" className="form-control" value={form.medicalCertExpiry} onChange={e => set('medicalCertExpiry', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Police Verification</label>
              <select className="form-control" value={form.policeVerification.status} onChange={e => setN('policeVerification', 'status', e.target.value)}>
                <option value="">— Not set —</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></div>
          </div>
          <div style={{ fontSize: '.8rem', fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-muted)' }}>Emergency Contact</div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Name</label><input className="form-control" value={form.emergencyContact.name} onChange={e => setN('emergencyContact', 'name', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.emergencyContact.phone} onChange={e => setN('emergencyContact', 'phone', e.target.value)} /></div>
          </div>
        </form>
      </Modal>
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Remove staff" message={`Remove "${del?.name}"?`} />
    </div>
  );
}
