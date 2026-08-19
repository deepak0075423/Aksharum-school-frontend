import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import {
  PageHeader, Table, Button, Modal, Badge, Pagination, Card, Spinner, Alert,
} from '../../../components/ui/index';
import { StatusBadge, Filters, Field, FieldGrid, Attachments, fileUrl, label, dd, dt } from '../shared';

const CATEGORIES = ['room', 'mess', 'cleaning', 'security', 'maintenance', 'staff', 'food', 'facilities', 'internet', 'other'];
const STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'reopened', 'closed', 'rejected'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const empty = { hostel: '', room: '', student: '', category: 'other', priority: 'medium', subject: '', description: '', attachments: [] };

export default function Complaints() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [byStatus, setByStatus] = useState({});
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ status: params.get('status') || '', category: '', priority: '' });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [act, setAct] = useState(null);
  const [actForm, setActForm] = useState({ comment: '', assignedTo: '', resolution: '', priority: '', internal: true });
  const [busy, setBusy] = useState(false);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const rooms = (meta?.rooms || []).filter((r) => !form.hostel || String(r.hostel) === form.hostel);
  const staff = meta?.staff || [];

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const r = await api.getComplaints({ page, limit: 20, ...filters });
      const d = r.data ?? r;
      setRows(d.data || []); setByStatus(d.byStatus || {});
      setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters]);
  useEffect(() => { load(1); }, [filters]); // eslint-disable-line

  const setFilter = (k, v) => {
    setFilters((f) => ({ ...f, [k]: v }));
    if (k === 'status') { if (v) setParams({ status: v }); else setParams({}); }
  };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'hostel' ? { room: '' } : {}) }));

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.createComplaint({ ...form, room: form.room || null, student: form.student || null });
      toast.success('Complaint raised'); setModal(false); load(1);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const openDetail = async (row) => {
    setDetail({ loading: true });
    try { const r = await api.getComplaint(row._id); setDetail(r.data ?? r); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const submitAct = async () => {
    setBusy(true);
    try {
      await api.actOnComplaint(act.row._id, {
        action: act.action,
        comment: actForm.comment,
        assignedTo: actForm.assignedTo || null,
        resolution: actForm.resolution,
        priority: actForm.priority || null,
        internal: actForm.internal,
      });
      toast.success(`Complaint ${label(act.action)}`);
      setAct(null); load(pg.page);
      if (detail?._id === act.row._id) openDetail(act.row);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const escalateAll = async () => {
    try {
      const r = await api.escalateComplaints();
      const d = r.data ?? r;
      toast.success(d.message || `${d.escalated} complaint(s) escalated`);
      load(pg.page);
    } catch (err) { toast.error(err.message); }
  };

  const overdue = (r) => r.dueAt && new Date(r.dueAt) < new Date() && !['resolved', 'closed', 'rejected'].includes(r.status);

  const columns = [
    { key: 'ticket', label: 'Ticket', render: (r) => (
      <div>
        <strong style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>{r.ticketNumber}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{dd(r.createdAt)}</div>
      </div>
    ) },
    { key: 'what', label: 'Complaint', render: (r) => (
      <div style={{ maxWidth: 280 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
          <Badge variant="muted">{label(r.category)}</Badge>
          <Badge variant={r.priority === 'urgent' ? 'danger' : r.priority === 'high' ? 'warning' : 'info'}>{r.priority}</Badge>
          {r.escalationLevel > 0 && <Badge variant="danger">L{r.escalationLevel}</Badge>}
        </div>
        <div style={{ fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.subject || r.description}
        </div>
      </div>
    ) },
    { key: 'from', label: 'From', render: (r) => (
      <div style={{ fontSize: '.82rem' }}>
        {r.student?.name || '—'}
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
          {r.hostel?.name}{r.room?.roomNumber ? ` · Room ${r.room.roomNumber}` : ''}
        </div>
      </div>
    ) },
    { key: 'assigned', label: 'Assigned', render: (r) => r.assignedTo?.name || <span className="text-muted">unassigned</span> },
    { key: 'sla', label: 'SLA', render: (r) => overdue(r)
      ? <Badge variant="danger">breached</Badge>
      : r.dueAt ? <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{dd(r.dueAt)}</span> : '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>Open</Button>
        {!['closed', 'rejected'].includes(r.status) && (
          <Button size="sm" onClick={() => { setAct({ row: r, action: r.status === 'resolved' ? 'close' : 'resolve' }); setActForm({ comment: '', assignedTo: '', resolution: '', priority: '', internal: true }); }}>
            {r.status === 'resolved' ? 'Close' : 'Resolve'}
          </Button>
        )}
      </div>
    ) },
  ];

  const ACTIONS = (status) => [
    ['assign', 'Assign'], ['start', 'Start work'], ['resolve', 'Resolve'],
    ['escalate', 'Escalate'], ['prioritize', 'Change priority'], ['comment', 'Comment'],
    ...(status === 'resolved' || status === 'closed' ? [['reopen', 'Reopen'], ['close', 'Close']] : []),
    ['reject', 'Reject'],
  ];

  return (
    <div className="page">
      <PageHeader title="Hostel Complaints" subtitle="Room, mess, cleaning, security and facilities tickets with SLA escalation"
        action={<div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={escalateAll}>Escalate breached</Button>
          <Button onClick={() => { setForm(empty); setModal(true); }}>+ Raise Complaint</Button>
        </div>} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {STATUSES.map((s) => (
          <button key={s} type="button" onClick={() => setFilter('status', filters.status === s ? '' : s)}
            className={`btn btn-sm ${filters.status === s ? 'btn-primary' : 'btn-secondary'}`}>
            {label(s)} <strong>{byStatus[s] || 0}</strong>
          </button>
        ))}
      </div>

      <Filters>
        <select className="form-control" style={{ maxWidth: 180 }} value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 160 }} value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
        </select>
      </Filters>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="📣" emptyTitle="No complaints" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} maxWidth={600} title="Raise a Complaint"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="cp-form" type="submit" loading={saving}>Raise</Button></>}>
        <form id="cp-form" onSubmit={save}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Hostel</label>
              <select className="form-control" required value={form.hostel} onChange={(e) => set('hostel', e.target.value)}>
                <option value="">— select —</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Room</label>
              <select className="form-control" value={form.room} onChange={(e) => set('room', e.target.value)}>
                <option value="">— none —</option>
                {rooms.map((r) => <option key={r._id} value={r._id}>Room {r.roomNumber}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={form.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-control" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Subject</label>
            <input className="form-control" value={form.subject} onChange={(e) => set('subject', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label required">Description</label>
            <textarea className="form-control" rows={4} required value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <Attachments value={form.attachments} onChange={(v) => set('attachments', v)}
            upload={api.uploadAttachment} entityType="HostelComplaint" />
        </form>
      </Modal>

      {/* ── Detail with the action ladder ─────────────────────────────────── */}
      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth={760} title={detail?.ticketNumber || 'Complaint'}>
        {detail?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : detail && (
          <div style={{ display: 'grid', gap: 16 }}>
            {detail.escalationLevel > 0 && (
              <Alert variant="warning">Escalated to level {detail.escalationLevel} on {dd(detail.escalatedAt)}.</Alert>
            )}
            <FieldGrid>
              <Field label="Category">{label(detail.category)}</Field>
              <Field label="Priority">{label(detail.priority)}</Field>
              <Field label="Status"><StatusBadge value={detail.status} /></Field>
              <Field label="Raised by">{detail.student?.name || label(detail.raisedByRole)}</Field>
              <Field label="Hostel">{detail.hostel?.name}</Field>
              <Field label="Room">{detail.room?.roomNumber}</Field>
              <Field label="Assigned to">{detail.assignedTo?.name}</Field>
              <Field label="Raised">{dt(detail.createdAt)}</Field>
              <Field label="SLA due">{dt(detail.dueAt)}</Field>
              <Field label="Resolved">{dt(detail.resolutionDate)}</Field>
              <Field label="Reopened">{detail.reopenCount || 0} time(s)</Field>
              <Field label="Rating">{detail.rating ? '⭐'.repeat(detail.rating) : '—'}</Field>
            </FieldGrid>
            <Field label="Description" wide>{detail.description}</Field>
            {detail.resolution && <Field label="Resolution" wide>{detail.resolution}</Field>}
            {!!detail.attachmentUrls?.length && (
              <div>
                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Attachments</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(detail.attachments || []).map((f) => (
                    <a key={f} href={fileUrl(f)} target="_blank" rel="noreferrer"
                      style={{ fontSize: '.8rem', color: 'var(--primary)', textDecoration: 'none',
                               border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px' }}>
                      📎 {f.length > 24 ? `${f.slice(0, 24)}…` : f}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ACTIONS(detail.status).map(([action, text]) => (
                <Button key={action} size="sm" variant={action === 'reject' ? 'danger' : 'secondary'}
                  onClick={() => { setAct({ row: detail, action }); setActForm({ comment: '', assignedTo: detail.assignedTo?._id || '', resolution: detail.resolution || '', priority: detail.priority, internal: true }); }}>
                  {text}
                </Button>
              ))}
            </div>

            {!!detail.comments?.length && (
              <Card title="Conversation">
                {detail.comments.map((c) => (
                  <div key={c._id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', color: 'var(--text-muted)' }}>
                      <span>{c.byName} · {label(c.byRole)}{c.internal ? ' · internal' : ''}</span>
                      <span>{dt(c.at)}</span>
                    </div>
                    <div style={{ fontSize: '.85rem', marginTop: 2 }}>{c.text}</div>
                  </div>
                ))}
              </Card>
            )}
            {!!detail.maintenance?.length && (
              <Card title="Linked maintenance">
                {detail.maintenance.map((m) => (
                  <div key={m._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '.83rem' }}>
                    <span>{m.requestNumber} · {label(m.category)}</span><StatusBadge value={m.status} />
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!act} onClose={() => setAct(null)} maxWidth={520}
        title={act ? `${label(act.action)} — ${act.row.ticketNumber}` : ''}
        footer={<><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button>
          <Button loading={busy} variant={act?.action === 'reject' ? 'danger' : 'primary'} onClick={submitAct}>Confirm</Button></>}>
        {act && <>
          {['assign', 'escalate'].includes(act.action) && (
            <div className="form-group">
              <label className="form-label">{act.action === 'assign' ? 'Assign to' : 'Escalate to'}</label>
              <select className="form-control" value={actForm.assignedTo} onChange={(e) => setActForm((f) => ({ ...f, assignedTo: e.target.value }))}>
                <option value="">{act.action === 'escalate' ? 'Configured escalation owner' : '— select —'}</option>
                {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {act.action === 'prioritize' && (
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-control" value={actForm.priority} onChange={(e) => setActForm((f) => ({ ...f, priority: e.target.value }))}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
              </select>
            </div>
          )}
          {['resolve', 'reject'].includes(act.action) && (
            <div className="form-group">
              <label className="form-label">{act.action === 'reject' ? 'Reason' : 'Resolution'}</label>
              <textarea className="form-control" rows={3} value={actForm.resolution} onChange={(e) => setActForm((f) => ({ ...f, resolution: e.target.value }))} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Comment</label>
            <textarea className="form-control" rows={2} value={actForm.comment} onChange={(e) => setActForm((f) => ({ ...f, comment: e.target.value }))} />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.84rem' }}>
            <input type="checkbox" checked={actForm.internal} onChange={(e) => setActForm((f) => ({ ...f, internal: e.target.checked }))} />
            Internal note — hidden from the student
          </label>
        </>}
      </Modal>
    </div>
  );
}
