import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import { PageHeader, Table, Button, Modal, Badge, Pagination, Confirm, Alert } from '../../../components/ui/index';
import { StatusBadge, Filters, Field, FieldGrid, label, dt, dd } from '../shared';

const ID_TYPES = ['aadhaar', 'pan', 'driving_license', 'voter_id', 'passport', 'other'];
const STATUSES = ['pending', 'approved', 'rejected', 'checked_in', 'checked_out', 'cancelled', 'blocked'];
const empty = {
  student: '', visitorName: '', mobile: '', relationship: '', purpose: '',
  idProofType: '', idProofNumber: '', visitorCount: 1, scheduledAt: '',
  isTemplate: false, listType: 'none',
};

export default function Visitors() {
  const [tab, setTab] = useState('visits');       // visits | lists
  const [rows, setRows] = useState([]);
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ status: '', date: '' });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [del, setDel] = useState(null);
  const [residents, setResidents] = useState([]);

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const r = await api.getVisitors({ page, limit: 20, list: tab === 'lists' ? 'true' : 'false', ...filters });
      const d = r.data ?? r;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [tab, filters]);
  useEffect(() => { load(1); }, [tab, filters]); // eslint-disable-line

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const open = async (asTemplate) => {
    setForm({ ...empty, isTemplate: asTemplate, listType: asTemplate ? 'authorized' : 'none' });
    setModal(true);
    try {
      const r = await api.getAllocations({ status: 'active', limit: 200 });
      setResidents((r.data ?? r).data || []);
    } catch { setResidents([]); }
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.createVisitor({ ...form, visitorCount: Number(form.visitorCount) || 1 });
      toast.success(form.isTemplate ? 'Added to the list' : 'Visitor registered');
      setModal(false); load(1);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const act = async (row, action) => {
    try {
      await api.actOnVisitor(row._id, { action });
      toast.success(`Visitor ${label(action)}`);
      load(pg.page);
    } catch (err) { toast.error(err.message); }
  };

  const remove = async () => {
    try { await api.deleteVisitor(del._id); toast.success('Removed'); setDel(null); load(pg.page); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const visitColumns = [
    { key: 'pass', label: 'Pass', render: (r) => (
      <div>
        <strong style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>{r.passNumber || '—'}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{dd(r.createdAt)}</div>
      </div>
    ) },
    { key: 'visitor', label: 'Visitor', render: (r) => (
      <div>
        <strong>{r.visitorName}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
          {[r.relationship, r.mobile].filter(Boolean).join(' · ')}
        </div>
      </div>
    ) },
    { key: 'student', label: 'Visiting', render: (r) => r.student?.name || '—' },
    { key: 'purpose', label: 'Purpose', render: (r) => <span style={{ fontSize: '.82rem' }}>{r.purpose || '—'}</span> },
    { key: 'times', label: 'In / out', render: (r) => (
      <div style={{ fontSize: '.78rem' }}>
        {r.entryTime ? dt(r.entryTime) : '—'}
        <div style={{ color: 'var(--text-muted)' }}>{r.exitTime ? dt(r.exitTime) : ''}</div>
      </div>
    ) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {r.status === 'pending' && <>
          <Button size="sm" onClick={() => act(r, 'approve')}>Approve</Button>
          <Button size="sm" variant="danger" onClick={() => act(r, 'reject')}>Reject</Button>
        </>}
        {r.status === 'approved' && <Button size="sm" onClick={() => act(r, 'entry')}>Check in</Button>}
        {r.status === 'checked_in' && <Button size="sm" onClick={() => act(r, 'exit')}>Check out</Button>}
        {!['checked_out', 'cancelled', 'blocked'].includes(r.status) && (
          <Button size="sm" variant="secondary" onClick={() => act(r, 'block')}>Block</Button>
        )}
      </div>
    ) },
  ];

  const listColumns = [
    { key: 'visitor', label: 'Visitor', render: (r) => (
      <div><strong>{r.visitorName}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{[r.relationship, r.mobile].filter(Boolean).join(' · ')}</div>
      </div>
    ) },
    { key: 'student', label: 'For student', render: (r) => r.student?.name || '—' },
    { key: 'list', label: 'List', render: (r) => (
      <Badge variant={r.listType === 'restricted' ? 'danger' : 'success'}>{label(r.listType)}</Badge>
    ) },
    { key: 'a', label: '', render: (r) => (
      <Button size="sm" variant="danger" onClick={() => setDel(r)}>Remove</Button>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Visitor Management" subtitle="Registration, approval, gate passes and standing visitor lists"
        action={<div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => open(true)}>+ List entry</Button>
          <Button onClick={() => open(false)}>+ Register Visitor</Button>
        </div>} />

      <div className="tabs">
        <button className={`tab${tab === 'visits' ? ' active' : ''}`} onClick={() => setTab('visits')}>Visits</button>
        <button className={`tab${tab === 'lists' ? ' active' : ''}`} onClick={() => setTab('lists')}>Authorized & restricted lists</button>
      </div>

      {tab === 'visits' && (
        <Filters>
          <select className="form-control" style={{ maxWidth: 180 }} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          <input className="form-control" style={{ maxWidth: 170 }} type="date" value={filters.date} onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))} />
        </Filters>
      )}

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={tab === 'visits' ? visitColumns : listColumns} data={rows} loading={loading}
          emptyIcon="👋" emptyTitle={tab === 'visits' ? 'No visitors yet' : 'No list entries'} />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} maxWidth={620}
        title={form.isTemplate ? 'Add to Visitor List' : 'Register Visitor'}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="vis-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="vis-form" onSubmit={save}>
          {form.isTemplate && (
            <Alert variant="info">
              An authorized visitor is approved automatically; a restricted one is refused at
              registration.
            </Alert>
          )}
          <div className="form-row form-row-2" style={{ marginTop: form.isTemplate ? 14 : 0 }}>
            <div className="form-group">
              <label className="form-label required">Student</label>
              <select className="form-control" required value={form.student} onChange={(e) => set('student', e.target.value)}>
                <option value="">— select a resident —</option>
                {residents.map((a) => (
                  <option key={a._id} value={a.student?._id || a.student}>{a.student?.name} · Room {a.room?.roomNumber}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Visitor Name</label>
              <input className="form-control" required value={form.visitorName} onChange={(e) => set('visitorName', e.target.value)} />
            </div>
          </div>
          {form.isTemplate ? (
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">List</label>
                <select className="form-control" value={form.listType} onChange={(e) => set('listType', e.target.value)}>
                  <option value="authorized">Authorized</option>
                  <option value="restricted">Restricted</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Relationship</label>
                <input className="form-control" value={form.relationship} onChange={(e) => set('relationship', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Mobile</label>
                <input className="form-control" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
              </div>
            </div>
          ) : (
            <>
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label className="form-label">Mobile</label>
                  <input className="form-control" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Relationship</label>
                  <input className="form-control" value={form.relationship} onChange={(e) => set('relationship', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Visitors</label>
                  <input className="form-control" type="number" min="1" value={form.visitorCount} onChange={(e) => set('visitorCount', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Purpose</label>
                <input className="form-control" value={form.purpose} onChange={(e) => set('purpose', e.target.value)} />
              </div>
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label className="form-label">ID Proof</label>
                  <select className="form-control" value={form.idProofType} onChange={(e) => set('idProofType', e.target.value)}>
                    <option value="">— none —</option>
                    {ID_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">ID Number</label>
                  <input className="form-control" value={form.idProofNumber} onChange={(e) => set('idProofNumber', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Scheduled At</label>
                  <input className="form-control" type="datetime-local" value={form.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} />
                  <div className="form-hint">Checked against visiting hours</div>
                </div>
              </div>
            </>
          )}
        </form>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth={600} title={detail?.visitorName || 'Visitor'}>
        {detail && (
          <FieldGrid>
            <Field label="Pass">{detail.passNumber}</Field>
            <Field label="Status"><StatusBadge value={detail.status} /></Field>
            <Field label="Visiting">{detail.student?.name}</Field>
            <Field label="Relationship">{detail.relationship}</Field>
            <Field label="Mobile">{detail.mobile}</Field>
            <Field label="Visitors">{detail.visitorCount}</Field>
            <Field label="ID Proof">{detail.idProofType ? `${label(detail.idProofType)} · ${detail.idProofNumber}` : '—'}</Field>
            <Field label="Scheduled">{dt(detail.scheduledAt)}</Field>
            <Field label="Entry">{dt(detail.entryTime)}</Field>
            <Field label="Exit">{dt(detail.exitTime)}</Field>
            <Field label="Purpose" wide>{detail.purpose}</Field>
            {detail.qrToken && <Field label="Pass token" wide><code style={{ fontSize: '.72rem' }}>{detail.qrToken}</code></Field>}
          </FieldGrid>
        )}
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title="Remove list entry" message={`Remove ${del?.visitorName} from the ${del?.listType} list?`} />
    </div>
  );
}
