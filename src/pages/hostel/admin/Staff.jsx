import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { PageHeader, Table, Button, Modal, Badge, Confirm, Alert } from '../../../components/ui/index';
import { StatusBadge, Filters, label, dd } from '../shared';

const ROLES = ['warden', 'assistant_warden', 'caretaker', 'security', 'housekeeping', 'mess_staff', 'maintenance', 'floor_supervisor'];
const SHIFTS = ['morning', 'evening', 'night', 'general', 'rotational'];
const empty = {
  staff: '', hostel: '', building: '', floor: '', role: 'warden', shift: 'general',
  shiftStart: '', shiftEnd: '', responsibilities: '', fromDate: '', remarks: '',
};

export default function Staff() {
  const [rows, setRows] = useState([]);
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ hostel: '', role: '' });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const staffPool = meta?.staff || [];
  const buildings = (meta?.buildings || []).filter((b) => !form.hostel || String(b.hostel) === form.hostel);
  const floors = (meta?.floors || []).filter((f) => !form.building || String(f.building) === form.building);

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const r = await api.getStaff({ ...filters });
      setRows(r.data ?? r);
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({
    ...f, [k]: v,
    ...(k === 'hostel' ? { building: '', floor: '' } : {}),
    ...(k === 'building' ? { floor: '' } : {}),
  }));

  const open = (row) => {
    if (row) {
      setEditId(row._id);
      setForm({
        ...empty, ...row,
        staff: row.staff?._id || row.staff,
        hostel: row.hostel?._id || row.hostel,
        building: row.building?._id || row.building || '',
        floor: row.floor?._id || row.floor || '',
        responsibilities: (row.responsibilities || []).join(', '),
        fromDate: row.fromDate ? String(row.fromDate).slice(0, 10) : '',
      });
    } else { setEditId(null); setForm({ ...empty, hostel: filters.hostel || hostels[0]?._id || '' }); }
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const p = {
        ...form,
        building: form.building || null,
        floor: form.floor || null,
        responsibilities: String(form.responsibilities).split(',').map((s) => s.trim()).filter(Boolean),
      };
      if (editId) await api.updateStaff(editId, p); else await api.assignStaff(p);
      toast.success(editId ? 'Assignment updated' : 'Staff assigned');
      setModal(false); load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const end = async () => {
    try { await api.endStaff(del._id); toast.success('Assignment ended'); setDel(null); load(); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const columns = [
    { key: 'staff', label: 'Employee', render: (r) => (
      <div>
        <strong>{r.staff?.name || '—'}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{[r.staff?.email, r.staff?.phone].filter(Boolean).join(' · ')}</div>
      </div>
    ) },
    { key: 'role', label: 'Role', render: (r) => <Badge variant="primary">{label(r.role)}</Badge> },
    { key: 'where', label: 'Covers', render: (r) => (
      <div style={{ fontSize: '.82rem' }}>
        {r.hostel?.name}
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
          {[r.building?.name, r.floor?.name].filter(Boolean).join(' · ') || 'whole hostel'}
        </div>
      </div>
    ) },
    { key: 'shift', label: 'Shift', render: (r) => (
      <div style={{ fontSize: '.82rem' }}>
        {label(r.shift)}
        {r.shiftStart && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.shiftStart} – {r.shiftEnd}</div>}
      </div>
    ) },
    { key: 'from', label: 'Since', render: (r) => dd(r.fromDate) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel(r)}>End</Button>
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Warden & Hostel Staff" subtitle="Assignments over existing employees — no separate staff records"
        action={<Button onClick={() => open()}>+ Assign Staff</Button>} />

      <Alert variant="info">
        Everyone here is an existing employee from the school's staff records. Assigning a warden or
        assistant warden also sets them on the hostel itself.
      </Alert>

      <div style={{ marginTop: 16 }}>
        <Filters>
          <select className="form-control" style={{ maxWidth: 220 }} value={filters.hostel} onChange={(e) => setFilters((f) => ({ ...f, hostel: e.target.value }))}>
            <option value="">All hostels</option>
            {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
          </select>
          <select className="form-control" style={{ maxWidth: 200 }} value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}>
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
          </select>
        </Filters>

        <div className="card"><div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={rows} loading={loading} emptyIcon="🧑‍✈️" emptyTitle="No staff assigned" />
        </div></div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} maxWidth={640}
        title={editId ? 'Edit Assignment' : 'Assign Hostel Staff'}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="hs-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="hs-form" onSubmit={save}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Employee</label>
              <select className="form-control" required value={form.staff} onChange={(e) => set('staff', e.target.value)} disabled={!!editId}>
                <option value="">— select —</option>
                {staffPool.map((s) => <option key={s._id} value={s._id}>{s.name} ({s.role === 'school_admin' ? 'admin' : 'teacher'})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Role</label>
              <select className="form-control" required value={form.role} onChange={(e) => set('role', e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label required">Hostel</label>
              <select className="form-control" required value={form.hostel} onChange={(e) => set('hostel', e.target.value)} disabled={!!editId}>
                <option value="">— select —</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Building</label>
              <select className="form-control" value={form.building} onChange={(e) => set('building', e.target.value)}>
                <option value="">Whole hostel</option>
                {buildings.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Floor</label>
              <select className="form-control" value={form.floor} onChange={(e) => set('floor', e.target.value)}>
                <option value="">All floors</option>
                {floors.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Shift</label>
              <select className="form-control" value={form.shift} onChange={(e) => set('shift', e.target.value)}>
                {SHIFTS.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Shift Start</label>
              <input className="form-control" type="time" value={form.shiftStart} onChange={(e) => set('shiftStart', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Shift End</label>
              <input className="form-control" type="time" value={form.shiftEnd} onChange={(e) => set('shiftEnd', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Responsibilities</label>
            <input className="form-control" value={form.responsibilities} onChange={(e) => set('responsibilities', e.target.value)}
              placeholder="night rounds, gate register, mess supervision" />
            <div className="form-hint">Comma separated</div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">From</label>
              <input className="form-control" type="date" value={form.fromDate} onChange={(e) => set('fromDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Remarks</label>
              <input className="form-control" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
            </div>
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={end}
        title="End assignment"
        message={`End ${del?.staff?.name}'s ${label(del?.role)} assignment? The record is kept in history.`} />
    </div>
  );
}
