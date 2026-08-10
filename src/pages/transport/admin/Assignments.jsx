import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Button, Modal, Confirm, Badge, Pagination } from '../../../components/ui/index';

const empty = { student: '', route: '', pickupStop: '', dropStop: '', shift: 'both', seatNumber: '', feePlan: '', isTemporary: false, notes: '' };
const ST = { active: 'success', suspended: 'warning', cancelled: 'muted' };

export default function TransportAssignments() {
  const { data: meta } = useFetch(api.getMeta);
  const [rows, setRows] = useState([]);
  const [pg, setPg]     = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [search, setSearch] = useState('');
  const [route, setRoute] = useState('');
  const [status, setStatus] = useState('active');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [act, setAct] = useState(null);      // { row, status }
  const routes = meta?.routes || [], students = meta?.students || [], feePlans = meta?.feePlans || [];
  const selRoute = routes.find(r => r._id === form.route);
  const stops = selRoute?.stops || [];

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try { const res = await api.getAssignments({ page, limit: 20, search, route, status }); const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total }); }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [search, route, status]);
  useEffect(() => { load(1); }, [route, status]); // eslint-disable-line

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const open = (row) => {
    if (row) setEditId(row._id), setForm({ ...empty, ...row, student: row.student?._id || row.student,
      route: row.route?._id || row.route, feePlan: row.feePlan?._id || row.feePlan || '' });
    else setEditId(null), setForm(empty);
    setModal(true);
  };
  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { const p = { ...form, pickupStop: form.pickupStop || null, dropStop: form.dropStop || null, feePlan: form.feePlan || null };
      if (editId) await api.updateAssignment(editId, p); else await api.createAssignment(p);
      toast.success('Assignment saved'); setModal(false); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const doAct = async () => {
    try { await api.setAssignmentStatus(act.row._id, { status: act.status }); toast.success(`Marked ${act.status}`); setAct(null); load(pg.page); }
    catch (err) { toast.error(err.message); setAct(null); }
  };

  const columns = [
    { key: 'student', label: 'Student', render: r => <div><strong>{r.student?.name}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{[r.className, r.sectionName].filter(Boolean).join(' · ') || '—'}</div></div> },
    { key: 'route', label: 'Route', render: r => <div>{r.route?.name}<div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.vehicle?.vehicleNumber || '—'}</div></div> },
    { key: 'stops', label: 'Pickup → Drop', render: r => <span style={{ fontSize: '.8rem' }}>{r.pickupStopName || '—'} → {r.dropStopName || '—'}</span> },
    { key: 'seat', label: 'Seat', render: r => r.seatNumber || '—' },
    { key: 'fee', label: 'Fee Plan', render: r => r.feePlan?.name || '—' },
    { key: 'status', label: 'Status', render: r => <Badge variant={ST[r.status]}>{r.status}{r.isTemporary ? ' (temp)' : ''}</Badge> },
    { key: 'a', label: '', render: r => <div style={{ display: 'flex', gap: 6 }}>
      <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
      {r.status === 'active'
        ? <Button size="sm" variant="secondary" onClick={() => setAct({ row: r, status: 'suspended' })}>Suspend</Button>
        : <Button size="sm" variant="secondary" onClick={() => setAct({ row: r, status: 'active' })}>Resume</Button>}
      {r.status !== 'cancelled' && <Button size="sm" variant="danger" onClick={() => setAct({ row: r, status: 'cancelled' })}>Cancel</Button>}
    </div> },
  ];

  return (
    <div className="page">
      <PageHeader title="Student Transport Assignments" subtitle="Assign students to routes, stops & seats"
        action={<Button onClick={() => open()}>+ Assign Student</Button>} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="form-control" style={{ maxWidth: 260 }} placeholder="🔍 Search student…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)} />
        <select className="form-control" style={{ maxWidth: 220 }} value={route} onChange={e => setRoute(e.target.value)}>
          <option value="">All routes</option>{routes.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}</select>
        <select className="form-control" style={{ maxWidth: 160 }} value={status} onChange={e => setStatus(e.target.value)}>
          {['active','suspended','cancelled',''].map(s => <option key={s} value={s}>{s || 'All'}</option>)}</select>
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🎒" emptyTitle="No assignments yet" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Assignment' : 'Assign Student'} maxWidth={620}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="as-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="as-form" onSubmit={save}>
          <div className="form-group"><label className="form-label required">Student</label>
            <select className="form-control" required value={form.student} onChange={e => set('student', e.target.value)} disabled={!!editId}>
              <option value="">— Select student —</option>{students.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
          <div className="form-group"><label className="form-label required">Route</label>
            <select className="form-control" required value={form.route} onChange={e => { set('route', e.target.value); setForm(f => ({ ...f, pickupStop: '', dropStop: '' })); }}>
              <option value="">— Select route —</option>{routes.map(r => <option key={r._id} value={r._id}>{r.name} ({r.routeCode})</option>)}</select></div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Pickup Stop</label>
              <select className="form-control" value={form.pickupStop} onChange={e => set('pickupStop', e.target.value)}>
                <option value="">— Select —</option>{stops.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Drop Stop</label>
              <select className="form-control" value={form.dropStop} onChange={e => set('dropStop', e.target.value)}>
                <option value="">— Select —</option>{stops.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Shift</label>
              <select className="form-control" value={form.shift} onChange={e => set('shift', e.target.value)}>{['both','morning','evening'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Seat No.</label><input className="form-control" value={form.seatNumber} onChange={e => set('seatNumber', e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Fee Plan</label>
            <select className="form-control" value={form.feePlan} onChange={e => set('feePlan', e.target.value)}>
              <option value="">— None —</option>{feePlans.map(p => <option key={p._id} value={p._id}>{p.name} · {p.basis} · ₹{p.amount}/{p.frequency}</option>)}</select></div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.85rem', marginTop: 6 }}>
            <input type="checkbox" checked={form.isTemporary} onChange={e => set('isTemporary', e.target.checked)} /> Temporary assignment</label>
        </form>
      </Modal>
      <Confirm open={!!act} onClose={() => setAct(null)} onConfirm={doAct}
        title={`${act?.status === 'cancelled' ? 'Cancel' : act?.status === 'active' ? 'Resume' : 'Suspend'} assignment`}
        message={`Mark ${act?.row?.student?.name}'s transport as ${act?.status}?`} />
    </div>
  );
}
