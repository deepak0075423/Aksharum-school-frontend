import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { PageHeader, Table, Button, Modal, Badge, Pagination, StatCard, Card } from '../../../components/ui/index';
import { StatusBadge, Filters, Field, FieldGrid, Attachments, label, dd, dt, money, di } from '../shared';

const CATEGORIES = ['electrical', 'plumbing', 'furniture', 'fan', 'ac', 'internet', 'cleaning', 'room', 'bathroom', 'common_area', 'other'];
const STATUSES = ['open', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const empty = {
  hostel: '', room: '', category: 'other', maintenanceType: 'corrective', priority: 'medium',
  title: '', description: '', estimatedCost: '', scheduledDate: '', recurEveryDays: '', attachments: [],
};

export default function Maintenance() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [totalCost, setTotalCost] = useState(0);
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ status: params.get('status') || '', category: '', maintenanceType: '', priority: '' });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [act, setAct] = useState(null);
  const [actForm, setActForm] = useState({ technicianName: '', vendorName: '', cost: '', resolution: '', comment: '', scheduledDate: '' });
  const [busy, setBusy] = useState(false);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const rooms = (meta?.rooms || []).filter((r) => !form.hostel || String(r.hostel) === form.hostel);

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const r = await api.getMaintenance({ page, limit: 20, ...filters });
      const d = r.data ?? r;
      setRows(d.data || []); setTotalCost(d.totalCost || 0);
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
      await api.createMaintenance({
        ...form, room: form.room || null,
        estimatedCost: Number(form.estimatedCost) || 0,
        recurEveryDays: Number(form.recurEveryDays) || 0,
        scheduledDate: form.scheduledDate || null,
      });
      toast.success('Work order raised'); setModal(false); load(1);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const submitAct = async () => {
    setBusy(true);
    try {
      const r = await api.actOnMaintenance(act.row._id, {
        action: act.action,
        technicianName: actForm.technicianName, vendorName: actForm.vendorName,
        cost: actForm.cost === '' ? null : Number(actForm.cost),
        resolution: actForm.resolution, comment: actForm.comment,
        scheduledDate: actForm.scheduledDate || null,
      });
      const d = r.data ?? r;
      toast.success(`Work order ${label(act.action)}`);
      if (d.nextScheduled) toast(`Next preventive job scheduled for ${dd(d.nextScheduled.scheduledDate)}`, { icon: '🔁' });
      setAct(null); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'no', label: 'Request', render: (r) => (
      <div>
        <strong style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>{r.requestNumber}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{dd(r.createdAt)}</div>
      </div>
    ) },
    { key: 'what', label: 'Work', render: (r) => (
      <div style={{ maxWidth: 280 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
          <Badge variant="muted">{label(r.category)}</Badge>
          <Badge variant={r.maintenanceType === 'preventive' ? 'info' : r.maintenanceType === 'scheduled' ? 'primary' : 'muted'}>
            {label(r.maintenanceType)}
          </Badge>
          <Badge variant={r.priority === 'urgent' ? 'danger' : r.priority === 'high' ? 'warning' : 'info'}>{r.priority}</Badge>
        </div>
        <div style={{ fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.title || r.description}
        </div>
      </div>
    ) },
    { key: 'where', label: 'Where', render: (r) => (
      <div style={{ fontSize: '.82rem' }}>
        {r.hostel?.name}
        {r.room?.roomNumber && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Room {r.room.roomNumber}</div>}
      </div>
    ) },
    { key: 'tech', label: 'Technician', render: (r) => r.technicianName || r.vendorName || <span className="text-muted">unassigned</span> },
    { key: 'sched', label: 'Scheduled', render: (r) => dd(r.scheduledDate) },
    { key: 'cost', label: 'Cost', render: (r) => r.actualCost ? money(r.actualCost) : r.estimatedCost ? <span className="text-muted">~{money(r.estimatedCost)}</span> : '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {r.status === 'open' && <Button size="sm" onClick={() => { setAct({ row: r, action: 'assign' }); setActForm({ technicianName: '', vendorName: '', cost: '', resolution: '', comment: '', scheduledDate: '' }); }}>Assign</Button>}
        {['assigned', 'on_hold'].includes(r.status) && <Button size="sm" onClick={() => { setAct({ row: r, action: 'start' }); setActForm({ technicianName: '', vendorName: '', cost: '', resolution: '', comment: '', scheduledDate: '' }); }}>Start</Button>}
        {['assigned', 'in_progress', 'on_hold'].includes(r.status) && (
          <Button size="sm" onClick={() => { setAct({ row: r, action: 'complete' }); setActForm({ technicianName: r.technicianName || '', vendorName: r.vendorName || '', cost: String(r.estimatedCost || ''), resolution: '', comment: '', scheduledDate: '' }); }}>Complete</Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => setDetail(r)}>View</Button>
      </div>
    ) },
  ];

  const openCount = rows.filter((r) => ['open', 'assigned', 'in_progress', 'on_hold'].includes(r.status)).length;

  return (
    <div className="page">
      <PageHeader title="Maintenance" subtitle="Corrective, scheduled and preventive work orders"
        action={<Button onClick={() => { setForm(empty); setModal(true); }}>+ Work Order</Button>} />

      <div className="stats-grid">
        <StatCard icon="🔧" color="orange" label="Open on this page" value={openCount} />
        <StatCard icon="📋" color="blue"   label="Total requests"    value={pg.total} />
        <StatCard icon="💰" color="green"  label="Completed cost"    value={money(totalCost)} />
      </div>

      <Filters>
        <select className="form-control" style={{ maxWidth: 170 }} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 180 }} value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 170 }} value={filters.maintenanceType} onChange={(e) => setFilter('maintenanceType', e.target.value)}>
          <option value="">All types</option>
          {['corrective', 'preventive', 'scheduled'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 150 }} value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
        </select>
      </Filters>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🔧" emptyTitle="No work orders" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} maxWidth={640} title="New Work Order"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="mt-form" type="submit" loading={saving}>Raise</Button></>}>
        <form id="mt-form" onSubmit={save}>
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
                <option value="">Common area / not room specific</option>
                {rooms.map((r) => <option key={r._id} value={r._id}>Room {r.roomNumber}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-control" value={form.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={form.maintenanceType} onChange={(e) => set('maintenanceType', e.target.value)}>
                {['corrective', 'preventive', 'scheduled'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
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
            <label className="form-label">Title</label>
            <input className="form-control" value={form.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label required">Description</label>
            <textarea className="form-control" rows={3} required value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Estimated cost</label>
              <input className="form-control" type="number" min="0" value={form.estimatedCost} onChange={(e) => set('estimatedCost', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Scheduled date</label>
              <input className="form-control" type="date" value={form.scheduledDate} onChange={(e) => set('scheduledDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Repeat every (days)</label>
              <input className="form-control" type="number" min="0" value={form.recurEveryDays} onChange={(e) => set('recurEveryDays', e.target.value)} />
              <div className="form-hint">Completing rolls the next one forward</div>
            </div>
          </div>
          <Attachments value={form.attachments} onChange={(v) => set('attachments', v)}
            upload={api.uploadAttachment} entityType="HostelMaintenance" />
        </form>
      </Modal>

      <Modal open={!!act} onClose={() => setAct(null)} maxWidth={520}
        title={act ? `${label(act.action)} — ${act.row.requestNumber}` : ''}
        footer={<><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button>
          <Button loading={busy} onClick={submitAct}>Confirm</Button></>}>
        {act && <>
          {act.action === 'assign' && (
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Technician</label>
                <input className="form-control" value={actForm.technicianName} onChange={(e) => setActForm((f) => ({ ...f, technicianName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Vendor</label>
                <input className="form-control" value={actForm.vendorName} onChange={(e) => setActForm((f) => ({ ...f, vendorName: e.target.value }))} />
              </div>
            </div>
          )}
          {act.action === 'complete' && <>
            <div className="form-group">
              <label className="form-label">Actual cost</label>
              <input className="form-control" type="number" min="0" value={actForm.cost} onChange={(e) => setActForm((f) => ({ ...f, cost: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Resolution</label>
              <textarea className="form-control" rows={3} value={actForm.resolution} onChange={(e) => setActForm((f) => ({ ...f, resolution: e.target.value }))} />
              <div className="form-hint">A linked complaint is resolved automatically.</div>
            </div>
          </>}
          {act.action === 'schedule' && (
            <div className="form-group">
              <label className="form-label">Scheduled date</label>
              <input className="form-control" type="date" value={actForm.scheduledDate} onChange={(e) => setActForm((f) => ({ ...f, scheduledDate: e.target.value }))} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Comment</label>
            <textarea className="form-control" rows={2} value={actForm.comment} onChange={(e) => setActForm((f) => ({ ...f, comment: e.target.value }))} />
          </div>
        </>}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth={680} title={detail?.requestNumber || 'Work order'}>
        {detail && <div style={{ display: 'grid', gap: 16 }}>
          <FieldGrid>
            <Field label="Category">{label(detail.category)}</Field>
            <Field label="Type">{label(detail.maintenanceType)}</Field>
            <Field label="Priority">{label(detail.priority)}</Field>
            <Field label="Status"><StatusBadge value={detail.status} /></Field>
            <Field label="Hostel">{detail.hostel?.name}</Field>
            <Field label="Room">{detail.room?.roomNumber}</Field>
            <Field label="Technician">{detail.technicianName}</Field>
            <Field label="Vendor">{detail.vendorName}</Field>
            <Field label="Scheduled">{dd(detail.scheduledDate)}</Field>
            <Field label="Started">{dt(detail.startedAt)}</Field>
            <Field label="Completed">{dt(detail.completedAt)}</Field>
            <Field label="Cost">{money(detail.actualCost)}</Field>
          </FieldGrid>
          <Field label="Description" wide>{detail.description}</Field>
          {detail.resolution && <Field label="Resolution" wide>{detail.resolution}</Field>}
          {!!detail.updates?.length && (
            <Card title="Updates">
              {detail.updates.map((u) => (
                <div key={u._id} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{u.byName} · {dt(u.at)}</div>
                  <div style={{ fontSize: '.85rem' }}>{u.text}</div>
                </div>
              ))}
            </Card>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['assign', 'Assign'], ['start', 'Start'], ['hold', 'Hold'], ['complete', 'Complete'], ['schedule', 'Schedule'], ['comment', 'Comment'], ['cancel', 'Cancel']]
              .map(([action, text]) => (
                <Button key={action} size="sm" variant={action === 'cancel' ? 'danger' : 'secondary'}
                  onClick={() => { setAct({ row: detail, action }); setActForm({ technicianName: detail.technicianName || '', vendorName: detail.vendorName || '', cost: '', resolution: '', comment: '', scheduledDate: di(detail.scheduledDate) }); }}>
                  {text}
                </Button>
              ))}
          </div>
        </div>}
      </Modal>
    </div>
  );
}
