import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import {
  PageHeader, Table, Button, Modal, Badge, Pagination, Confirm, Alert, StatCard, Card,
} from '../../../components/ui/index';
import { StatusBadge, Filters, Field, FieldGrid, label, dd, dt, money, di, today } from '../shared';

const FEE_TYPES = ['admission', 'monthly', 'quarterly', 'annual', 'mess', 'laundry', 'electricity',
                   'maintenance', 'security_deposit', 'fine', 'late_fee', 'other'];
const PLAN_TYPES = FEE_TYPES.filter((t) => !['fine', 'late_fee'].includes(t));
const ROOM_TYPES = ['single', 'double', 'triple', 'four_bed', 'dormitory'];
const MODES = ['cash', 'cheque', 'online', 'upi', 'card', 'bank_transfer'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const emptyPlan = {
  name: '', hostel: '', feeType: 'monthly', basis: 'flat', amount: '',
  frequency: 'monthly', dueDayOfMonth: 10, isRefundable: false, description: '', roomTypeRates: [],
};

export default function Fees() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('invoices');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ status: params.get('status') || '', feeType: '', hostel: '' });
  const [plans, setPlans] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyPlan);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const [target, setTarget] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', mode: 'cash', reference: '', note: '' });
  const [genForm, setGenForm] = useState({ feePlan: '', hostel: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), dueDate: '' });
  const [discForm, setDiscForm] = useState({ discount: '', reason: '' });
  const [refundForm, setRefundForm] = useState({ amount: '', reference: '', reason: '' });
  const [detail, setDetail] = useState(null);
  const [residents, setResidents] = useState([]);
  const [invForm, setInvForm] = useState({ student: '', feeType: 'other', amount: '', dueDate: '', remarks: '' });

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];

  const loadInvoices = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const r = await api.getInvoices({ page, limit: 20, ...filters });
      const d = r.data ?? r;
      setRows(d.data || []); setSummary(d.summary || {});
      setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters]);

  const loadPlans = useCallback(async () => {
    try { const r = await api.getFeePlans(); setPlans(r.data ?? r); }
    catch (err) { toast.error(err.message); }
  }, []);

  useEffect(() => { if (tab === 'invoices') loadInvoices(1); else loadPlans(); }, [tab, loadInvoices, loadPlans]);
  useEffect(() => { loadPlans(); }, [loadPlans]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setFilter = (k, v) => {
    setFilters((f) => ({ ...f, [k]: v }));
    if (k === 'status') { if (v) setParams({ status: v }); else setParams({}); }
  };

  const openPlan = (row) => {
    setModal('plan');
    if (row) { setEditId(row._id); setForm({ ...emptyPlan, ...row, hostel: row.hostel?._id || row.hostel || '' }); }
    else { setEditId(null); setForm(emptyPlan); }
  };

  const openInvoice = async () => {
    setModal('invoice');
    setInvForm({ student: '', feeType: 'other', amount: '', dueDate: '', remarks: '' });
    try {
      const r = await api.getAllocations({ status: 'active', limit: 300 });
      setResidents((r.data ?? r).data || []);
    } catch { setResidents([]); }
  };

  const savePlan = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const p = {
        ...form,
        hostel: form.hostel || null,
        amount: Number(form.amount) || 0,
        dueDayOfMonth: Number(form.dueDayOfMonth) || 10,
        roomTypeRates: (form.roomTypeRates || []).map((z) => ({ roomType: z.roomType, amount: Number(z.amount) || 0 })),
      };
      if (editId) await api.updateFeePlan(editId, p); else await api.createFeePlan(p);
      toast.success('Fee plan saved'); setModal(null); loadPlans();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const saveInvoice = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.createInvoice({ ...invForm, amount: Number(invForm.amount) || 0 });
      toast.success('Invoice raised'); setModal(null); loadInvoices(1);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const generate = async () => {
    setSaving(true);
    try {
      const r = await api.generateInvoices({ ...genForm, hostel: genForm.hostel || null });
      const d = r.data ?? r;
      toast.success(`${d.created} invoice(s) generated, ${d.skipped} already billed`);
      setModal(null); setTab('invoices'); loadInvoices(1);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const pay = async () => {
    setSaving(true);
    try {
      const r = await api.payInvoice(target._id, { ...payForm, amount: Number(payForm.amount) || 0 });
      const d = r.data ?? r;
      toast.success(`Payment recorded — receipt ${d.receiptNumber}`);
      setModal(null); loadInvoices(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const discount = async () => {
    setSaving(true);
    try {
      await api.discountInvoice(target._id, { discount: Number(discForm.discount) || 0, reason: discForm.reason });
      toast.success('Concession applied'); setModal(null); loadInvoices(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const refund = async () => {
    setSaving(true);
    try {
      await api.refundInvoice(target._id, { ...refundForm, amount: Number(refundForm.amount) || 0 });
      toast.success('Refund processed'); setModal(null); loadInvoices(pg.page);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const cancel = async () => {
    try { await api.cancelInvoice(del._id); toast.success('Invoice cancelled'); setDel(null); loadInvoices(pg.page); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const runLateFees = async () => {
    try {
      const r = await api.applyLateFees();
      const d = r.data ?? r;
      toast.success(d.message || `${d.updated} invoice(s) updated`);
      loadInvoices(pg.page);
    } catch (err) { toast.error(err.message); }
  };

  const invoiceColumns = [
    { key: 'no', label: 'Invoice', render: (r) => (
      <div>
        <strong style={{ cursor: 'pointer' }} onClick={() => setDetail(r)}>{r.invoiceNumber}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{label(r.feeType)}{r.period?.label ? ` · ${r.period.label}` : ''}</div>
      </div>
    ) },
    { key: 'student', label: 'Student', render: (r) => (
      <div>{r.student?.name}<div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.hostel?.name}</div></div>
    ) },
    { key: 'amount', label: 'Amount', render: (r) => (
      <div style={{ fontSize: '.83rem' }}>
        <strong>{money(r.netAmount)}</strong>
        {(r.discount > 0 || r.lateFee > 0) && (
          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
            {money(r.amount)}{r.discount > 0 ? ` − ${money(r.discount)}` : ''}{r.lateFee > 0 ? ` + ${money(r.lateFee)} late` : ''}
          </div>
        )}
      </div>
    ) },
    { key: 'paid', label: 'Paid', render: (r) => (
      <div style={{ fontSize: '.83rem' }}>
        {money(r.paidAmount)}
        {r.netAmount - r.paidAmount > 0 && (
          <div style={{ fontSize: '.7rem', color: '#b91c1c' }}>{money(r.netAmount - r.paidAmount)} due</div>
        )}
      </div>
    ) },
    { key: 'due', label: 'Due date', render: (r) => dd(r.dueDate) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {!['paid', 'cancelled', 'refunded'].includes(r.status) && (
          <Button size="sm" onClick={() => { setTarget(r); setPayForm({ amount: String(Math.max(0, r.netAmount - r.paidAmount)), mode: 'cash', reference: '', note: '' }); setModal('pay'); }}>
            Collect
          </Button>
        )}
        {!['cancelled', 'refunded'].includes(r.status) && (
          <Button size="sm" variant="secondary" onClick={() => { setTarget(r); setDiscForm({ discount: String(r.discount || ''), reason: r.discountReason || '' }); setModal('discount'); }}>
            Concession
          </Button>
        )}
        {r.paidAmount > (r.refundedAmount || 0) && (
          <Button size="sm" variant="secondary" onClick={() => { setTarget(r); setRefundForm({ amount: String(r.paidAmount - (r.refundedAmount || 0)), reference: '', reason: '' }); setModal('refund'); }}>
            Refund
          </Button>
        )}
        {r.paidAmount === 0 && r.status !== 'cancelled' && (
          <Button size="sm" variant="danger" onClick={() => setDel(r)}>Cancel</Button>
        )}
      </div>
    ) },
  ];

  const planColumns = [
    { key: 'name', label: 'Plan', render: (r) => (
      <div><strong>{r.name}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{label(r.feeType)} · {label(r.frequency)}</div></div>
    ) },
    { key: 'hostel', label: 'Hostel', render: (r) => r.hostel?.name || <span className="text-muted">All hostels</span> },
    { key: 'basis', label: 'Basis', render: (r) => (
      <div style={{ fontSize: '.82rem' }}>
        {label(r.basis)}
        {r.basis === 'room_type' && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{(r.roomTypeRates || []).length} band(s)</div>}
      </div>
    ) },
    { key: 'amount', label: 'Amount', render: (r) => <strong>{money(r.amount)}</strong> },
    { key: 'refund', label: 'Refundable', render: (r) => r.isRefundable ? <Badge variant="info">yes</Badge> : <span className="text-muted">no</span> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" onClick={() => { setGenForm((g) => ({ ...g, feePlan: r._id, hostel: r.hostel?._id || r.hostel || '' })); setModal('generate'); }}>Bill</Button>
        <Button size="sm" variant="secondary" onClick={() => openPlan(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => api.deleteFeePlan(r._id).then(() => { toast.success('Deactivated'); loadPlans(); }).catch((e) => toast.error(e.message))}>Deactivate</Button>
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader title="Hostel Fees" subtitle="Rate cards, billing, collection and refunds — posted to the school fee ledger"
        action={<div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={runLateFees}>Apply late fees</Button>
          <Button variant="secondary" onClick={() => openPlan()}>+ Fee Plan</Button>
          <Button onClick={openInvoice}>+ Invoice</Button>
        </div>} />

      <div className="stats-grid">
        <StatCard icon="🧾" color="blue"   label="Billed"      value={money(summary.billed)} />
        <StatCard icon="✅" color="green"  label="Collected"   value={money(summary.collected)} />
        <StatCard icon="⏳" color="orange" label="Outstanding" value={money(summary.outstanding)} />
        <StatCard icon="↩️" color="purple" label="Refunded"    value={money(summary.refunded)} />
      </div>

      <div className="tabs" style={{ marginTop: 18 }}>
        <button className={`tab${tab === 'invoices' ? ' active' : ''}`} onClick={() => setTab('invoices')}>Invoices</button>
        <button className={`tab${tab === 'plans' ? ' active' : ''}`} onClick={() => setTab('plans')}>Fee plans</button>
      </div>

      {tab === 'invoices' ? (
        <>
          <Filters>
            <select className="form-control" style={{ maxWidth: 170 }} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">All statuses</option>
              {['pending', 'partial', 'paid', 'overdue', 'cancelled', 'refunded'].map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth: 190 }} value={filters.feeType} onChange={(e) => setFilter('feeType', e.target.value)}>
              <option value="">All fee types</option>
              {FEE_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
            <select className="form-control" style={{ maxWidth: 200 }} value={filters.hostel} onChange={(e) => setFilter('hostel', e.target.value)}>
              <option value="">All hostels</option>
              {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
            </select>
          </Filters>

          <div className="card"><div className="card-body" style={{ padding: 0 }}>
            <Table columns={invoiceColumns} data={rows} loading={loading} emptyIcon="💳" emptyTitle="No invoices yet" />
          </div></div>
          <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={loadInvoices} />
        </>
      ) : (
        <div className="card"><div className="card-body" style={{ padding: 0 }}>
          <Table columns={planColumns} data={plans} emptyIcon="🏷" emptyTitle="No fee plans yet" />
        </div></div>
      )}

      {/* ── Fee plan ──────────────────────────────────────────────────────── */}
      <Modal open={modal === 'plan'} onClose={() => setModal(null)} maxWidth={680}
        title={editId ? 'Edit Fee Plan' : 'New Fee Plan'}
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button form="plan-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="plan-form" onSubmit={savePlan}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Plan Name</label>
              <input className="form-control" required value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Hostel</label>
              <select className="form-control" value={form.hostel} onChange={(e) => set('hostel', e.target.value)}>
                <option value="">All hostels</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Fee Type</label>
              <select className="form-control" value={form.feeType} onChange={(e) => set('feeType', e.target.value)}>
                {PLAN_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Frequency</label>
              <select className="form-control" value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
                {['one_time', 'monthly', 'quarterly', 'half_yearly', 'annual'].map((f) => <option key={f} value={f}>{label(f)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Due day of month</label>
              <input className="form-control" type="number" min="1" max="28" value={form.dueDayOfMonth} onChange={(e) => set('dueDayOfMonth', e.target.value)} />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Basis</label>
              <select className="form-control" value={form.basis} onChange={(e) => set('basis', e.target.value)}>
                <option value="flat">Flat — same for everyone</option>
                <option value="room_type">By room type</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">{form.basis === 'room_type' ? 'Fallback amount' : 'Amount'}</label>
              <input className="form-control" type="number" min="0" required value={form.amount} onChange={(e) => set('amount', e.target.value)} />
            </div>
          </div>
          {form.basis === 'room_type' && (
            <div className="form-group">
              <label className="form-label">Rate bands</label>
              {ROOM_TYPES.map((rt) => {
                const band = (form.roomTypeRates || []).find((z) => z.roomType === rt);
                return (
                  <div key={rt} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ width: 110, fontSize: '.83rem' }}>{label(rt)}</span>
                    <input className="form-control" type="number" min="0" style={{ maxWidth: 160 }}
                      value={band?.amount ?? ''}
                      onChange={(e) => {
                        const rest = (form.roomTypeRates || []).filter((z) => z.roomType !== rt);
                        set('roomTypeRates', e.target.value === '' ? rest : [...rest, { roomType: rt, amount: e.target.value }]);
                      }} />
                  </div>
                );
              })}
            </div>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem' }}>
            <input type="checkbox" checked={form.isRefundable} onChange={(e) => set('isRefundable', e.target.checked)} />
            Refundable (security deposit)
          </label>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Description</label>
            <input className="form-control" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
        </form>
      </Modal>

      {/* ── Generate invoices ─────────────────────────────────────────────── */}
      <Modal open={modal === 'generate'} onClose={() => setModal(null)} maxWidth={520} title="Bill Every Resident"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button loading={saving} onClick={generate}>Generate</Button></>}>
        <Alert variant="info">
          Idempotent per student, plan and period — re-running a month cannot double-charge anyone.
        </Alert>
        <div className="form-group" style={{ marginTop: 14 }}>
          <label className="form-label required">Fee Plan</label>
          <select className="form-control" value={genForm.feePlan} onChange={(e) => setGenForm((g) => ({ ...g, feePlan: e.target.value }))}>
            <option value="">— select —</option>
            {plans.map((p) => <option key={p._id} value={p._id}>{p.name} ({money(p.amount)})</option>)}
          </select>
        </div>
        <div className="form-row form-row-3">
          <div className="form-group">
            <label className="form-label">Hostel</label>
            <select className="form-control" value={genForm.hostel} onChange={(e) => setGenForm((g) => ({ ...g, hostel: e.target.value }))}>
              <option value="">Plan's hostel</option>
              {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Month</label>
            <select className="form-control" value={genForm.month} onChange={(e) => setGenForm((g) => ({ ...g, month: e.target.value }))}>
              <option value="">Annual (no month)</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Year</label>
            <input className="form-control" type="number" value={genForm.year} onChange={(e) => setGenForm((g) => ({ ...g, year: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Due date override</label>
          <input className="form-control" type="date" value={genForm.dueDate} onChange={(e) => setGenForm((g) => ({ ...g, dueDate: e.target.value }))} />
        </div>
      </Modal>

      {/* ── Ad-hoc invoice ────────────────────────────────────────────────── */}
      <Modal open={modal === 'invoice'} onClose={() => setModal(null)} maxWidth={560} title="Raise an Invoice"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button form="inv-form" type="submit" loading={saving}>Raise</Button></>}>
        <form id="inv-form" onSubmit={saveInvoice}>
          <div className="form-group">
            <label className="form-label required">Student</label>
            <select className="form-control" required value={invForm.student} onChange={(e) => setInvForm((f) => ({ ...f, student: e.target.value }))}>
              <option value="">— select a resident —</option>
              {residents.map((a) => (
                <option key={a._id} value={a.student?._id || a.student}>{a.student?.name} · Room {a.room?.roomNumber}</option>
              ))}
            </select>
          </div>
          <div className="form-row form-row-3">
            <div className="form-group">
              <label className="form-label">Fee Type</label>
              <select className="form-control" value={invForm.feeType} onChange={(e) => setInvForm((f) => ({ ...f, feeType: e.target.value }))}>
                {FEE_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Amount</label>
              <input className="form-control" type="number" min="0" required value={invForm.amount} onChange={(e) => setInvForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Due date</label>
              <input className="form-control" type="date" value={invForm.dueDate} onChange={(e) => setInvForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Remarks</label>
            <input className="form-control" value={invForm.remarks} onChange={(e) => setInvForm((f) => ({ ...f, remarks: e.target.value }))} />
          </div>
        </form>
      </Modal>

      {/* ── Collect / concession / refund ─────────────────────────────────── */}
      <Modal open={modal === 'pay'} onClose={() => setModal(null)} maxWidth={480}
        title={target ? `Collect — ${target.invoiceNumber}` : ''}
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button loading={saving} onClick={pay}>Record payment</Button></>}>
        {target && <>
          <p style={{ fontSize: '.86rem', marginTop: 0 }}>
            <strong>{target.student?.name}</strong> — outstanding {money(target.netAmount - target.paidAmount)}
          </p>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Amount</label>
              <input className="form-control" type="number" min="0" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Mode</label>
              <select className="form-control" value={payForm.mode} onChange={(e) => setPayForm((f) => ({ ...f, mode: e.target.value }))}>
                {MODES.map((m) => <option key={m} value={m}>{label(m)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Reference</label>
            <input className="form-control" value={payForm.reference} onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Cheque / UPI / txn reference" />
          </div>
          <div className="form-group">
            <label className="form-label">Note</label>
            <input className="form-control" value={payForm.note} onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
        </>}
      </Modal>

      <Modal open={modal === 'discount'} onClose={() => setModal(null)} maxWidth={460}
        title={target ? `Concession — ${target.invoiceNumber}` : ''}
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button loading={saving} onClick={discount}>Apply</Button></>}>
        {target && <>
          <p style={{ fontSize: '.86rem', marginTop: 0 }}>Billed {money(target.amount)}, already paid {money(target.paidAmount)}.</p>
          <div className="form-group">
            <label className="form-label">Concession / scholarship / waiver</label>
            <input className="form-control" type="number" min="0" max={target.amount} value={discForm.discount} onChange={(e) => setDiscForm((f) => ({ ...f, discount: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <textarea className="form-control" rows={2} value={discForm.reason} onChange={(e) => setDiscForm((f) => ({ ...f, reason: e.target.value }))} />
            <div className="form-hint">Every fee change is audited with its before and after amount.</div>
          </div>
        </>}
      </Modal>

      <Modal open={modal === 'refund'} onClose={() => setModal(null)} maxWidth={460}
        title={target ? `Refund — ${target.invoiceNumber}` : ''}
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button loading={saving} onClick={refund}>Refund</Button></>}>
        {target && <>
          <div className="form-group">
            <label className="form-label">Amount</label>
            <input className="form-control" type="number" min="0" value={refundForm.amount} onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Reference</label>
            <input className="form-control" value={refundForm.reference} onChange={(e) => setRefundForm((f) => ({ ...f, reference: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <input className="form-control" value={refundForm.reason} onChange={(e) => setRefundForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Security deposit return" />
          </div>
        </>}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth={640} title={detail?.invoiceNumber || 'Invoice'}>
        {detail && <div style={{ display: 'grid', gap: 16 }}>
          <FieldGrid>
            <Field label="Student">{detail.student?.name}</Field>
            <Field label="Hostel">{detail.hostel?.name}</Field>
            <Field label="Fee type">{label(detail.feeType)}</Field>
            <Field label="Period">{detail.period?.label}</Field>
            <Field label="Amount">{money(detail.amount)}</Field>
            <Field label="Discount">{money(detail.discount)}</Field>
            <Field label="Late fee">{money(detail.lateFee)}</Field>
            <Field label="Net">{money(detail.netAmount)}</Field>
            <Field label="Paid">{money(detail.paidAmount)}</Field>
            <Field label="Refunded">{money(detail.refundedAmount)}</Field>
            <Field label="Due">{dd(detail.dueDate)}</Field>
            <Field label="Status"><StatusBadge value={detail.status} /></Field>
          </FieldGrid>
          {!!detail.payments?.length && (
            <Card title="Payments">
              {detail.payments.map((p) => (
                <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.83rem' }}>
                  <span>{p.receiptNumber} · {label(p.mode)}{p.reference ? ` · ${p.reference}` : ''}</span>
                  <span><strong>{money(p.amount)}</strong> <span style={{ color: 'var(--text-muted)' }}>{dt(p.paidAt)}</span></span>
                </div>
              ))}
            </Card>
          )}
        </div>}
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={cancel}
        title="Cancel invoice" message={`Cancel ${del?.invoiceNumber}? A reversing entry is posted to the fee ledger.`} />
    </div>
  );
}
