import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Button, Modal, Badge, Pagination, StatCard } from '../../../components/ui/index';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ST = { pending: 'warning', partial: 'info', paid: 'success', overdue: 'danger', cancelled: 'muted' };
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
const now = new Date();

export default function TransportInvoices() {
  const [rows, setRows] = useState([]);
  const [pg, setPg]     = useState({ page: 1, pages: 1, total: 0 });
  const [summary, setSum] = useState({ billed: 0, paid: 0, due: 0 });
  const [loading, setLoad] = useState(true);
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [genOpen, setGen] = useState(false);
  const [gen, setGenForm] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState(null);   // invoice being paid
  const [payForm, setPayForm] = useState({ amount: '', mode: 'cash', reference: '' });

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try { const res = await api.getInvoices({ page, limit: 20, status, month, year }); const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total }); setSum(d.summary || { billed: 0, paid: 0, due: 0 }); }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [status, month, year]);
  useEffect(() => { load(1); }, [status, month, year]); // eslint-disable-line

  const generate = async () => {
    setBusy(true);
    try { const res = await api.generateInvoices(gen); const d = res.data ?? res;
      toast.success(`${d.created} invoice(s) generated`); setGen(false); setMonth(gen.month); setYear(gen.year); load(1); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const openPay = (inv) => { setPay(inv); setPayForm({ amount: Math.max(0, (inv.netAmount || 0) - (inv.paidAmount || 0)), mode: 'cash', reference: '' }); };
  const doPay = async () => {
    try { await api.payInvoice(pay._id, { ...payForm, amount: +payForm.amount }); toast.success('Payment recorded'); setPay(null); load(pg.page); }
    catch (err) { toast.error(err.message); }
  };
  const cancel = async (inv) => { try { await api.cancelInvoice(inv._id); toast.success('Cancelled'); load(pg.page); } catch (err) { toast.error(err.message); } };

  const columns = [
    { key: 'inv', label: 'Invoice', render: r => <div><strong>{r.invoiceNumber}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.student?.name} · {r.period?.label}</div></div> },
    { key: 'amount', label: 'Net', render: r => fmt(r.netAmount) },
    { key: 'paid', label: 'Paid', render: r => fmt(r.paidAmount) },
    { key: 'due', label: 'Due', render: r => <strong style={{ color: (r.netAmount - r.paidAmount) > 0 ? 'var(--danger,#ef4444)' : 'inherit' }}>{fmt(Math.max(0, r.netAmount - r.paidAmount))}</strong> },
    { key: 'status', label: 'Status', render: r => <Badge variant={ST[r.status]}>{r.status}</Badge> },
    { key: 'a', label: '', render: r => <div style={{ display: 'flex', gap: 6 }}>
      {!['paid','cancelled'].includes(r.status) && <Button size="sm" onClick={() => openPay(r)}>Pay</Button>}
      {r.status !== 'cancelled' && r.paidAmount === 0 && <Button size="sm" variant="danger" onClick={() => cancel(r)}>Cancel</Button>}</div> },
  ];

  return (
    <div className="page">
      <PageHeader title="Transport Fee Invoices" subtitle="Billing, collection & dues"
        action={<Button onClick={() => setGen(true)}>⚙️ Generate Invoices</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14, marginBottom: 16 }}>
        <StatCard label="Billed" value={fmt(summary.billed)} icon="🧾" color="blue" />
        <StatCard label="Collected" value={fmt(summary.paid)} icon="💰" color="green" />
        <StatCard label="Outstanding" value={fmt(summary.due)} icon="⏳" color="orange" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-control" style={{ maxWidth: 160 }} value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{Object.keys(ST).map(s => <option key={s} value={s}>{s}</option>)}</select>
        <select className="form-control" style={{ maxWidth: 140 }} value={month} onChange={e => setMonth(e.target.value)}><option value="">All months</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <select className="form-control" style={{ maxWidth: 120 }} value={year} onChange={e => setYear(e.target.value)}>{[0,1,2].map(o => now.getFullYear() - o).map(y => <option key={y} value={y}>{y}</option>)}</select>
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="💳" emptyTitle="No invoices — click Generate Invoices" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={genOpen} onClose={() => setGen(false)} title="Generate Monthly Invoices" maxWidth={440}
        footer={<><Button variant="secondary" onClick={() => setGen(false)}>Cancel</Button><Button onClick={generate} loading={busy}>Generate</Button></>}>
        <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Creates one invoice per active assignment that has a fee plan, for the selected period. Existing invoices for the period are skipped.</p>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Month</label><select className="form-control" value={gen.month} onChange={e => setGenForm(f => ({ ...f, month: +e.target.value }))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Year</label><input type="number" className="form-control" value={gen.year} onChange={e => setGenForm(f => ({ ...f, year: +e.target.value }))} /></div>
        </div>
      </Modal>

      <Modal open={!!pay} onClose={() => setPay(null)} title={`Pay ${pay?.invoiceNumber || ''}`} maxWidth={440}
        footer={<><Button variant="secondary" onClick={() => setPay(null)}>Cancel</Button><Button onClick={doPay}>Record Payment</Button></>}>
        {pay && <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginBottom: 10 }}>{pay.student?.name} · {pay.period?.label} · Due {fmt(pay.netAmount - pay.paidAmount)}</div>}
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Amount (₹)</label><input type="number" className="form-control" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Mode</label><select className="form-control" value={payForm.mode} onChange={e => setPayForm(f => ({ ...f, mode: e.target.value }))}>{['cash','upi','online','card','cheque','bank_transfer'].map(m => <option key={m} value={m}>{m}</option>)}</select></div>
        </div>
        <div className="form-group"><label className="form-label">Reference</label><input className="form-control" value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} /></div>
      </Modal>
    </div>
  );
}
