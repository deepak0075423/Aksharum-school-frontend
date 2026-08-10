import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Badge, Button, Modal } from '../../../components/ui/index';
import { useChildPicker } from './_shared';

const ST = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'muted' };
const TYPES = { new_transport: 'New Transport', route_change: 'Route Change', stop_change: 'Stop Change',
  temporary_address: 'Temporary Address', cancellation: 'Cancellation' };

export default function ParentRequests() {
  const { children, studentId, picker } = useChildPicker();
  const [rows, setRows] = useState([]);
  const [loading, setLoad] = useState(false);
  const [modal, setModal] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [form, setForm] = useState({ requestType: 'new_transport', details: { route: '', reason: '', address: '', fromDate: '', toDate: '' } });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoad(true);
    try { const r = await api.parentRequests(); setRows(r.data ?? r); } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = async () => {
    setForm({ requestType: 'new_transport', details: { route: '', reason: '', address: '', fromDate: '', toDate: '' } });
    setModal(true);
    // best-effort route list for new-transport / route-change (parent has no meta endpoint; degrade gracefully)
  };
  const setD = (k, v) => setForm(f => ({ ...f, details: { ...f.details, [k]: v } }));
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await api.parentCreateRequest({ studentId, requestType: form.requestType, details: form.details });
      toast.success('Request submitted'); setModal(false); load(); }
    catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const columns = [
    { key: 'type', label: 'Request', render: r => <div><strong>{TYPES[r.requestType] || r.requestType}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.requestCode} · {r.student?.name}</div></div> },
    { key: 'detail', label: 'Detail', render: r => <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{r.details?.reason || r.details?.address || r.details?.route?.name || '—'}</span> },
    { key: 'when', label: 'Date', render: r => new Date(r.createdAt).toLocaleDateString() },
    { key: 'status', label: 'Status', render: r => <Badge variant={ST[r.status]}>{r.status}</Badge> },
  ];

  const needsAddress = ['temporary_address'].includes(form.requestType);
  return (
    <div className="page">
      <PageHeader title="Transport Requests" subtitle="Request changes & track approvals"
        action={<div style={{ display: 'flex', gap: 10 }}>{picker}<Button onClick={openNew}>+ New Request</Button></div>} />
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="📨" emptyTitle="No requests yet" />
      </div></div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Transport Request" maxWidth={480}
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button form="req-form" type="submit" loading={saving}>Submit</Button></>}>
        <form id="req-form" onSubmit={submit}>
          <div className="form-group"><label className="form-label">Child</label>
            <select className="form-control" value={studentId} disabled><option>{children.find(c => c.studentId === studentId)?.name}</option></select></div>
          <div className="form-group"><label className="form-label required">Request Type</label>
            <select className="form-control" value={form.requestType} onChange={e => setForm(f => ({ ...f, requestType: e.target.value }))}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          {needsAddress && <div className="form-group"><label className="form-label">Temporary Address</label><textarea className="form-control" rows={2} value={form.details.address} onChange={e => setD('address', e.target.value)} /></div>}
          {form.requestType === 'temporary_address' && (
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">From</label><input type="date" className="form-control" value={form.details.fromDate} onChange={e => setD('fromDate', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">To</label><input type="date" className="form-control" value={form.details.toDate} onChange={e => setD('toDate', e.target.value)} /></div>
            </div>
          )}
          <div className="form-group"><label className="form-label">Reason / Note</label><textarea className="form-control" rows={2} value={form.details.reason} onChange={e => setD('reason', e.target.value)} placeholder="Describe your request — the transport office will review it." /></div>
        </form>
      </Modal>
    </div>
  );
}
