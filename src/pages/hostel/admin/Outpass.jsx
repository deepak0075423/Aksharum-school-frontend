import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import { PageHeader, Table, Button, Modal, Badge, Pagination, Alert, Card } from '../../../components/ui/index';
import { StatusBadge, Filters, Field, FieldGrid, PassQr, label, dd, dt, today } from '../shared';

const TYPES = ['day', 'night', 'medical', 'emergency', 'academic', 'market', 'other'];
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'active', 'returned', 'overdue'];
const empty = {
  student: '', outpassType: 'day', purpose: '', destination: '',
  departureDate: today(), expectedDepartureTime: '', expectedReturnTime: '',
  guardianName: '', guardianPhone: '', emergencyContact: '', remarks: '',
};

export default function Outpass() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ status: params.get('status') || '', outpassType: '', date: '' });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [act, setAct] = useState(null);
  const [remark, setRemark] = useState('');
  const [detail, setDetail] = useState(null);
  const [residents, setResidents] = useState([]);
  const [gate, setGate] = useState(false);
  const [gateToken, setGateToken] = useState('');
  const [gateFound, setGateFound] = useState(null);
  const [showPass, setShowPass] = useState(null);

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const r = await api.getOutpasses({ page, limit: 20, ...filters });
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
    try { await api.createOutpass(form); toast.success('Outpass requested'); setModal(false); load(1); }
    catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const submitAct = async () => {
    setBusy(true);
    try {
      const r = await api.actOnOutpass(act.row._id, { action: act.action, remark });
      const d = r.data ?? r;
      toast.success(`Outpass ${label(act.action)}d`);
      // An approval mints the pass — show it at once so it can be handed over.
      if (act.action === 'approve' && d?.qrImage) {
        setShowPass({ ...d, outpassNumber: act.row.outpassNumber, student: act.row.student });
      }
      setAct(null); setRemark(''); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const lookup = async () => {
    if (!gateToken.trim()) return;
    try {
      const r = await api.verifyOutpass(gateToken.trim());
      setGateFound(r.data ?? r);
    } catch (err) { toast.error(err.message); setGateFound(null); }
  };

  const record = async (direction) => {
    setBusy(true);
    try {
      const r = await api.gateScan({ token: gateToken.trim(), direction, gate: 'Main Gate' });
      const d = r.data ?? r;
      toast.success(direction === 'out' ? 'Departure recorded' : 'Return recorded');
      if (d.lateMinutes > 0) toast(`${d.lateMinutes} minute(s) late${d.fine ? ' — a late fee was raised' : ''}`, { icon: '⏰', duration: 6000 });
      setGateToken(''); setGateFound(null); load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const sweep = async () => {
    try {
      const r = await api.sweepOverdue();
      const d = r.data ?? r;
      toast.success(`${d.outpasses} outpass(es) and ${d.leaves} leave(s) marked overdue`);
      load(pg.page);
    } catch (err) { toast.error(err.message); }
  };

  const columns = [
    { key: 'no', label: 'Outpass', render: (r) => (
      <div>
        <strong style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>{r.outpassNumber}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{label(r.outpassType)}</div>
      </div>
    ) },
    { key: 'student', label: 'Student', render: (r) => (
      <div>{r.student?.name}<div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.hostel?.name}</div></div>
    ) },
    { key: 'purpose', label: 'Purpose', render: (r) => (
      <div style={{ fontSize: '.82rem' }}>
        {r.purpose}
        {r.destination && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>→ {r.destination}</div>}
      </div>
    ) },
    { key: 'when', label: 'Out / back', render: (r) => (
      <div style={{ fontSize: '.8rem' }}>
        {dd(r.departureDate)}
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
          {r.expectedDepartureTime || '—'} → {r.expectedReturnTime || '—'}
        </div>
      </div>
    ) },
    { key: 'late', label: 'Late', render: (r) => r.lateReturnMinutes > 0
      ? <Badge variant="danger">{r.lateReturnMinutes} min</Badge>
      : <span className="text-muted">—</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {r.status === 'pending' && <>
          <Button size="sm" onClick={() => { setAct({ row: r, action: 'approve' }); setRemark(''); }}>Approve</Button>
          <Button size="sm" variant="danger" onClick={() => { setAct({ row: r, action: 'reject' }); setRemark(''); }}>Reject</Button>
        </>}
        {r.status === 'approved' && <>
          <Button size="sm" variant="secondary" onClick={() => { setGate(true); setGateToken(r.qrToken || ''); setGateFound(null); }}>Gate</Button>
          <Button size="sm" variant="secondary" onClick={() => { setAct({ row: r, action: 'cancel' }); setRemark(''); }}>Cancel</Button>
        </>}
        {['active', 'overdue'].includes(r.status) && (
          <Button size="sm" onClick={() => { setGate(true); setGateToken(r.qrToken || ''); setGateFound(null); }}>Record return</Button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Outpass" subtitle="Short exits with QR gate verification and late-return tracking"
        action={<div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={sweep}>Sweep overdue</Button>
          <Button variant="secondary" onClick={() => { setGate(true); setGateToken(''); setGateFound(null); }}>🔎 Gate</Button>
          <Button onClick={open}>+ New Outpass</Button>
        </div>} />

      <Filters>
        <select className="form-control" style={{ maxWidth: 180 }} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 160 }} value={filters.outpassType} onChange={(e) => setFilter('outpassType', e.target.value)}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
        <input className="form-control" style={{ maxWidth: 170 }} type="date" value={filters.date} onChange={(e) => setFilter('date', e.target.value)} />
      </Filters>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🎫" emptyTitle="No outpasses" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      {/* ── New outpass ───────────────────────────────────────────────────── */}
      <Modal open={modal} onClose={() => setModal(false)} maxWidth={640} title="New Outpass"
        footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="op-form" type="submit" loading={saving}>Request</Button></>}>
        <form id="op-form" onSubmit={save}>
          <div className="form-row form-row-2">
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
              <label className="form-label">Type</label>
              <select className="form-control" value={form.outpassType} onChange={(e) => set('outpassType', e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label required">Purpose</label>
            <input className="form-control" required value={form.purpose} onChange={(e) => set('purpose', e.target.value)} />
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label required">Departure Date</label>
              <input className="form-control" type="date" required value={form.departureDate} onChange={(e) => set('departureDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Expected Departure</label>
              <input className="form-control" type="time" value={form.expectedDepartureTime} onChange={(e) => set('expectedDepartureTime', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Expected Return</label>
              <input className="form-control" type="time" value={form.expectedReturnTime} onChange={(e) => set('expectedReturnTime', e.target.value)} />
              <div className="form-hint">A time before departure rolls to the next day</div>
            </div>
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

      {/* ── Gate ──────────────────────────────────────────────────────────── */}
      <Modal open={gate} onClose={() => { setGate(false); setGateFound(null); }} maxWidth={540} title="Gate Verification">
        <Alert variant="info">
          Scan or paste the pass token. The pass is resolved from the token itself, so a student
          cannot present someone else's pass id.
        </Alert>
        <div className="form-group" style={{ marginTop: 14 }}>
          <label className="form-label">Pass token</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-control" value={gateToken} onChange={(e) => setGateToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookup()} placeholder="Paste the QR token…" />
            <Button variant="secondary" onClick={lookup}>Look up</Button>
          </div>
        </div>
        {gateFound && (
          <Card title={gateFound.outpassNumber}>
            <FieldGrid cols={2}>
              <Field label="Student">{gateFound.student?.name}</Field>
              <Field label="Room">{gateFound.room?.roomNumber}</Field>
              <Field label="Purpose">{gateFound.purpose}</Field>
              <Field label="Destination">{gateFound.destination}</Field>
              <Field label="Expected back">{dt(gateFound.expectedReturnAt)}</Field>
              <Field label="Status"><StatusBadge value={gateFound.status} /></Field>
            </FieldGrid>
            {gateFound.qrImage && (
              <div style={{ marginBottom: 14 }}>
                <PassQr image={gateFound.qrImage} size={160} caption="Compare against the pass the student is showing" />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {gateFound.expectedAction === 'out' && <Button loading={busy} onClick={() => record('out')}>Record departure</Button>}
              {gateFound.expectedAction === 'in' && <Button loading={busy} onClick={() => record('in')}>Record return</Button>}
              {!gateFound.valid && <span className="text-muted" style={{ fontSize: '.84rem' }}>This pass is not usable.</span>}
            </div>
          </Card>
        )}
      </Modal>

      <Modal open={!!act} onClose={() => setAct(null)} maxWidth={440}
        title={act ? `${label(act.action)} — ${act.row.outpassNumber}` : ''}
        footer={<><Button variant="secondary" onClick={() => setAct(null)}>Cancel</Button>
          <Button loading={busy} variant={act?.action === 'reject' ? 'danger' : 'primary'} onClick={submitAct}>Confirm</Button></>}>
        {act && (
          <div className="form-group">
            <label className="form-label">{act.action === 'reject' ? 'Reason' : 'Remark'}</label>
            <textarea className="form-control" rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
        )}
      </Modal>

      <Modal open={!!showPass} onClose={() => setShowPass(null)} maxWidth={420} title="Gate Pass"
        footer={<>
          <Button variant="secondary" onClick={() => setShowPass(null)}>Close</Button>
          <Button onClick={() => window.open(api.outpassQrUrl(showPass._id), '_blank')}>Open PNG</Button>
        </>}>
        {showPass && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{showPass.outpassNumber}</div>
            <div style={{ fontSize: '.84rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              {showPass.student?.name}
            </div>
            <PassQr image={showPass.qrImage} caption={`Back by ${dt(showPass.expectedReturnAt)}`} />
          </div>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth={620} title={detail?.outpassNumber || 'Outpass'}>
        {detail && (
          <FieldGrid>
            <Field label="Student">{detail.student?.name}</Field>
            <Field label="Type">{label(detail.outpassType)}</Field>
            <Field label="Status"><StatusBadge value={detail.status} /></Field>
            <Field label="Purpose" wide>{detail.purpose}</Field>
            <Field label="Destination">{detail.destination}</Field>
            <Field label="Departure date">{dd(detail.departureDate)}</Field>
            <Field label="Expected out">{detail.expectedDepartureTime}</Field>
            <Field label="Expected back">{dt(detail.expectedReturnAt)}</Field>
            <Field label="Actual departure">{dt(detail.actualDepartureAt)}</Field>
            <Field label="Actual return">{dt(detail.actualReturnAt)}</Field>
            <Field label="Late by">{detail.lateReturnMinutes ? `${detail.lateReturnMinutes} min` : '—'}</Field>
            <Field label="Guardian">{detail.guardianName} {detail.guardianPhone}</Field>
          </FieldGrid>
        )}
      </Modal>
    </div>
  );
}
