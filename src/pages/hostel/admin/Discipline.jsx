import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import {
  PageHeader, Table, Button, Modal, Badge, Pagination, Alert, Card, Spinner,
} from '../../../components/ui/index';
import { StatusBadge, Filters, Field, FieldGrid, label, dd, money, today } from '../shared';

const ACTION_TYPES = ['verbal_warning', 'written_warning', 'fine', 'parent_notification',
                      'warden_action', 'principal_escalation', 'suspension', 'expulsion'];
const VIOLATION_TYPES = ['curfew', 'ragging', 'substance', 'property_damage', 'misbehaviour',
                         'unauthorized_absence', 'visitor_rule', 'mess_rule', 'other'];
const SEVERITY = ['minor', 'moderate', 'major'];
const empty = {
  student: '', hostel: '', violation: '', violationType: 'other', actionType: 'verbal_warning',
  severity: 'minor', description: '', date: today(), fineAmount: '',
  suspensionFrom: '', suspensionTo: '', remarks: '',
};

export default function Discipline() {
  const [rows, setRows] = useState([]);
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ actionType: '', severity: '', status: '' });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [residents, setResidents] = useState([]);
  const [record, setRecord] = useState(null);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const isFine = form.actionType === 'fine';
  const isSuspension = form.actionType === 'suspension';

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const r = await api.getDiscipline({ page, limit: 20, ...filters });
      const d = r.data ?? r;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters]);
  useEffect(() => { load(1); }, [filters]); // eslint-disable-line

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const open = async () => {
    setForm(empty); setModal(true);
    try {
      const r = await api.getAllocations({ status: 'active', limit: 300 });
      setResidents((r.data ?? r).data || []);
    } catch { setResidents([]); }
  };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await api.createDiscipline({
        ...form,
        hostel: form.hostel || null,
        fineAmount: Number(form.fineAmount) || 0,
        suspensionFrom: form.suspensionFrom || null,
        suspensionTo: form.suspensionTo || null,
      });
      const d = r.data ?? r;
      toast.success('Disciplinary action issued');
      if (d.fine) toast(`A fine of ${money(d.fine.netAmount)} was billed`, { icon: '💳', duration: 6000 });
      if (d.action?.isRepeatOffence) toast(`Repeat offence — ${d.action.priorCount} prior action(s)`, { icon: '⚠️', duration: 6000 });
      setModal(false); load(1);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const openRecord = async (studentId) => {
    setRecord({ loading: true });
    try { const r = await api.getStudentDiscipline(studentId); setRecord(r.data ?? r); }
    catch (err) { toast.error(err.message); setRecord(null); }
  };

  const columns = [
    { key: 'no', label: 'Action', render: (r) => (
      <div>
        <strong>{r.actionNumber}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{dd(r.date)}</div>
      </div>
    ) },
    { key: 'student', label: 'Student', render: (r) => (
      <div>
        <strong style={{ cursor: 'pointer' }} onClick={() => openRecord(r.student?._id || r.student)}>{r.student?.name}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.hostel?.name}</div>
      </div>
    ) },
    { key: 'violation', label: 'Violation', render: (r) => (
      <div style={{ maxWidth: 250 }}>
        <div style={{ fontSize: '.83rem' }}>{r.violation}</div>
        <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
          <Badge variant="muted">{label(r.violationType)}</Badge>
          {r.isRepeatOffence && <Badge variant="danger">repeat ×{r.priorCount}</Badge>}
        </div>
      </div>
    ) },
    { key: 'action', label: 'Action taken', render: (r) => (
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <Badge variant={['suspension', 'expulsion', 'principal_escalation'].includes(r.actionType) ? 'danger' : 'primary'}>
          {label(r.actionType)}
        </Badge>
        <Badge variant={r.severity === 'major' ? 'danger' : r.severity === 'moderate' ? 'warning' : 'muted'}>{r.severity}</Badge>
      </div>
    ) },
    { key: 'fine', label: 'Fine', render: (r) => r.fineAmount > 0
      ? <div><strong>{money(r.fineAmount)}</strong>{r.fineInvoice && <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>billed</div>}</div>
      : <span className="text-muted">—</span> },
    { key: 'parent', label: 'Parent', render: (r) => r.parentNotified ? <Badge variant="success">notified</Badge> : <span className="text-muted">—</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <Button size="sm" variant="secondary" onClick={() => openRecord(r.student?._id || r.student)}>Record</Button>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Discipline" subtitle="Warnings, fines, escalations and repeat-offence tracking"
        action={<Button onClick={open}>+ Issue Action</Button>} />

      <Filters>
        <select className="form-control" style={{ maxWidth: 200 }} value={filters.actionType} onChange={(e) => setFilters((f) => ({ ...f, actionType: e.target.value }))}>
          <option value="">All actions</option>
          {ACTION_TYPES.map((a) => <option key={a} value={a}>{label(a)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 150 }} value={filters.severity} onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}>
          <option value="">All severities</option>
          {SEVERITY.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 160 }} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          {['issued', 'acknowledged', 'served', 'revoked'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </Filters>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="⚖️" emptyTitle="No disciplinary actions" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={modal} onClose={() => setModal(false)} maxWidth={660} title="Issue Disciplinary Action"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="dp-form" type="submit" loading={saving}>Issue</Button></>}>
        <form id="dp-form" onSubmit={save}>
          <Alert variant="warning">
            The student and their parents are notified. Prior actions are counted automatically and a
            repeat offence is flagged on the record.
          </Alert>
          <div className="form-row form-row-2" style={{ marginTop: 14 }}>
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
              <label className="form-label">Hostel</label>
              <select className="form-control" value={form.hostel} onChange={(e) => set('hostel', e.target.value)}>
                <option value="">From the student's allocation</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label required">Violation</label>
            <input className="form-control" required value={form.violation} onChange={(e) => set('violation', e.target.value)}
              placeholder="Returned after curfew three nights running" />
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Violation Type</label>
              <select className="form-control" value={form.violationType} onChange={(e) => set('violationType', e.target.value)}>
                {VIOLATION_TYPES.map((v) => <option key={v} value={v}>{label(v)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Action</label>
              <select className="form-control" required value={form.actionType} onChange={(e) => set('actionType', e.target.value)}>
                {ACTION_TYPES.map((a) => <option key={a} value={a}>{label(a)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Severity</label>
              <select className="form-control" value={form.severity} onChange={(e) => set('severity', e.target.value)}>
                {SEVERITY.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Date</label>
              <input className="form-control" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fine amount</label>
              <input className="form-control" type="number" min="0" value={form.fineAmount} onChange={(e) => set('fineAmount', e.target.value)}
                disabled={!isFine && form.fineAmount === ''} />
              <div className="form-hint">{isFine ? 'Billed as a hostel invoice' : 'Optional — billed if above zero'}</div>
            </div>
          </div>
          {isSuspension && (
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Suspension from</label>
                <input className="form-control" type="date" value={form.suspensionFrom} onChange={(e) => set('suspensionFrom', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Suspension to</label>
                <input className="form-control" type="date" value={form.suspensionTo} onChange={(e) => set('suspensionTo', e.target.value)} />
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Remarks</label>
            <input className="form-control" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </div>
        </form>
      </Modal>

      <Modal open={!!record} onClose={() => setRecord(null)} maxWidth={700} title="Disciplinary Record">
        {record?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : record && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="stats-grid" style={{ gap: 10 }}>
              <div className="card" style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{record.total}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Total actions</div>
              </div>
              <div className="card" style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{money(record.totalFines)}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Total fines</div>
              </div>
              <div className="card" style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{record.repeatOffender ? 'Yes' : 'No'}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Repeat offender</div>
              </div>
            </div>
            {!!Object.keys(record.byType || {}).length && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(record.byType).map(([k, v]) => <Badge key={k} variant="muted">{label(k)}: {v}</Badge>)}
              </div>
            )}
            <Card title="History">
              {(record.actions || []).map((a) => (
                <div key={a._id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <strong style={{ fontSize: '.86rem' }}>{a.violation}</strong>
                    <span style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>{dd(a.date)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <Badge variant="primary">{label(a.actionType)}</Badge>
                    <Badge variant={a.severity === 'major' ? 'danger' : 'muted'}>{a.severity}</Badge>
                    {a.fineAmount > 0 && <Badge variant="warning">{money(a.fineAmount)}</Badge>}
                    {a.isRepeatOffence && <Badge variant="danger">repeat</Badge>}
                  </div>
                  {a.description && <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 4 }}>{a.description}</div>}
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
                    issued by {a.issuedByName || a.issuedBy?.name || '—'}
                  </div>
                </div>
              ))}
              {!record.actions?.length && <div className="text-muted" style={{ fontSize: '.85rem' }}>Clean record.</div>}
            </Card>
          </div>
        )}
      </Modal>
    </div>
  );
}
