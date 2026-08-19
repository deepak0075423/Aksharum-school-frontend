import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { PageHeader, Table, Button, Modal, Badge, Pagination, Alert } from '../../../components/ui/index';
import { StatusBadge, Filters, Field, FieldGrid, label, dd, dt } from '../shared';

const TYPES = ['short', 'weekend', 'holiday', 'medical', 'emergency', 'home', 'other'];
const STATUSES = ['pending', 'parent_approved', 'approved', 'rejected', 'cancelled', 'active', 'returned', 'overdue'];
const empty = {
  student: '', leaveType: 'home', fromDate: '', toDate: '', reason: '',
  destination: '', guardianName: '', guardianPhone: '', emergencyContact: '',
};

// Which actions make sense for a leave in each state — the buttons the warden
// sees are derived from this, so the UI can never offer an illegal transition.
const NEXT = {
  pending: [['parent_approve', 'Record parent consent', 'secondary'], ['approve', 'Approve', 'primary'], ['reject', 'Reject', 'danger']],
  parent_approved: [['approve', 'Approve', 'primary'], ['reject', 'Reject', 'danger']],
  approved: [['depart', 'Mark departed', 'primary'], ['cancel', 'Cancel', 'secondary']],
  active: [['return', 'Confirm return', 'primary'], ['cancel', 'Cancel', 'secondary']],
  overdue: [['return', 'Confirm return', 'primary']],
};

export default function Leave() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ status: params.get('status') || '', leaveType: '', from: '', to: '' });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [act, setAct] = useState(null);       // { row, action }
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [residents, setResidents] = useState([]);

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const r = await api.getLeaves({ page, limit: 20, ...filters });
      const d = r.data ?? r;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters]);
  useEffect(() => { load(1); }, [filters]); // eslint-disable-line

  const setFilter = (k, v) => {
    setFilters((f) => ({ ...f, [k]: v }));
    if (k === 'status') { if (v) setParams({ status: v }); else setParams({}); }
  };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const open = async () => {
    setForm(empty); setModal(true);
    try {
      const r = await api.getAllocations({ status: 'active', limit: 200 });
      setResidents((r.data ?? r).data || []);
    } catch { setResidents([]); }
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.createLeave(form);
      toast.success('Leave filed'); setModal(false); load(1);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const submitAct = async () => {
    setBusy(true);
    try {
      await api.actOnLeave(act.row._id, { action: act.action, remark });
      toast.success(`Leave ${label(act.action)}d`);
      setAct(null); setRemark(''); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'no', label: 'Leave', render: (r) => (
      <div>
        <strong style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>{r.leaveNumber}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{label(r.leaveType)}</div>
      </div>
    ) },
    { key: 'student', label: 'Student', render: (r) => (
      <div>{r.student?.name}<div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.hostel?.name}</div></div>
    ) },
    { key: 'dates', label: 'Dates', render: (r) => (
      <div style={{ fontSize: '.82rem' }}>
        {dd(r.fromDate)} – {dd(r.toDate)}
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.totalDays} day(s)</div>
      </div>
    ) },
    { key: 'reason', label: 'Reason', render: (r) => (
      <span style={{ fontSize: '.82rem', display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.reason}
      </span>
    ) },
    { key: 'consent', label: 'Parent', render: (r) => !r.parentApprovalRequired
      ? <span className="text-muted" style={{ fontSize: '.78rem' }}>not required</span>
      : r.parentApprovedAt ? <Badge variant="success">consented</Badge> : <Badge variant="warning">awaiting</Badge> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(NEXT[r.status] || []).map(([action, text, variant]) => (
          <Button key={action} size="sm" variant={variant} onClick={() => { setAct({ row: r, action }); setRemark(''); }}>
            {text}
          </Button>
        ))}
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Hostel Leave" subtitle="Home, weekend, medical and emergency leave with parent consent and return confirmation"
        action={<Button onClick={open}>+ File Leave</Button>} />

      <Filters>
        <select className="form-control" style={{ maxWidth: 190 }} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 170 }} value={filters.leaveType} onChange={(e) => setFilter('leaveType', e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
        <input className="form-control" style={{ maxWidth: 160 }} type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
        <input className="form-control" style={{ maxWidth: 160 }} type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
      </Filters>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🏖" emptyTitle="No leave requests" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} maxWidth={640} title="File Hostel Leave"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="lv-form" type="submit" loading={saving}>File</Button></>}>
        <form id="lv-form" onSubmit={save}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Student</label>
              <select className="form-control" required value={form.student} onChange={(e) => set('student', e.target.value)}>
                <option value="">— select a resident —</option>
                {residents.map((a) => (
                  <option key={a._id} value={a.student?._id || a.student}>
                    {a.student?.name} · Room {a.room?.roomNumber}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Leave Type</label>
              <select className="form-control" value={form.leaveType} onChange={(e) => set('leaveType', e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">From</label>
              <input className="form-control" type="date" required value={form.fromDate} onChange={(e) => set('fromDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label required">To</label>
              <input className="form-control" type="date" required value={form.toDate} onChange={(e) => set('toDate', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label required">Reason</label>
            <textarea className="form-control" rows={2} required value={form.reason} onChange={(e) => set('reason', e.target.value)} />
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Destination</label>
              <input className="form-control" value={form.destination} onChange={(e) => set('destination', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Guardian</label>
              <input className="form-control" value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Guardian Phone</label>
              <input className="form-control" value={form.guardianPhone} onChange={(e) => set('guardianPhone', e.target.value)} />
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={!!act} onClose={() => setAct(null)} maxWidth={460}
        title={act ? `${label(act.action)} — ${act.row.leaveNumber}` : ''}
        footer={<><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button>
          <Button loading={busy} variant={act?.action === 'reject' ? 'danger' : 'primary'} onClick={submitAct}>Confirm</Button></>}>
        {act && (
          <>
            <p style={{ fontSize: '.86rem', marginTop: 0 }}>
              <strong>{act.row.student?.name}</strong> — {dd(act.row.fromDate)} to {dd(act.row.toDate)}
            </p>
            {act.action === 'approve' && act.row.parentApprovalRequired && !act.row.parentApprovedAt && (
              <Alert variant="warning">Parent consent has not been recorded yet — approval will be refused.</Alert>
            )}
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">{act.action === 'reject' ? 'Reason' : 'Remark'}</label>
              <textarea className="form-control" rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} />
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth={620} title={detail?.leaveNumber || 'Leave'}>
        {detail && (
          <FieldGrid>
            <Field label="Student">{detail.student?.name}</Field>
            <Field label="Hostel">{detail.hostel?.name}</Field>
            <Field label="Type">{label(detail.leaveType)}</Field>
            <Field label="From">{dd(detail.fromDate)}</Field>
            <Field label="To">{dd(detail.toDate)}</Field>
            <Field label="Days">{detail.totalDays}</Field>
            <Field label="Status"><StatusBadge value={detail.status} /></Field>
            <Field label="Destination">{detail.destination}</Field>
            <Field label="Guardian">{detail.guardianName} {detail.guardianPhone}</Field>
            <Field label="Parent consent">{detail.parentApprovedAt ? dt(detail.parentApprovedAt) : 'Not recorded'}</Field>
            <Field label="Warden approval">{detail.wardenApprovedAt ? dt(detail.wardenApprovedAt) : '—'}</Field>
            <Field label="Departed">{detail.departedAt ? dt(detail.departedAt) : '—'}</Field>
            <Field label="Returned">{detail.returnedAt ? dt(detail.returnedAt) : '—'}</Field>
            <Field label="Reason" wide>{detail.reason}</Field>
            {detail.rejectionReason && <Field label="Rejection reason" wide>{detail.rejectionReason}</Field>}
          </FieldGrid>
        )}
      </Modal>
    </div>
  );
}
