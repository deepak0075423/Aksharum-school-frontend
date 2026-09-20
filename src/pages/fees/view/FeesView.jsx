/**
 * Fees, as a family sees them — the student's own, and the parent's per child.
 *
 * One screen with three tabs, because it is one question asked three ways:
 * what do I owe (Fee Schedule), what have I paid (Payment History), and what
 * can I show for it (Receipts). The parent screen is the same screen with a
 * child picker; a class belongs to one child, so there is no combined view.
 *
 * Months are paid oldest first — that is how the ledger settles money — so
 * ticking a month ticks every unpaid month before it, here and in the rail
 * and on the server. Nothing lets a family buy a gap.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as feesApi from '../../../api/fees.api';
import { useAuth } from '../../../contexts/AuthContext';
import { loadRazorpay } from '../../../utils/razorpay';
import { Modal } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  Btn, Card, Tile, Tiles, Select, Search, UnderTabs, Check, Pager, Badge, StatusBadge, Glyph, IconBtn,
  money, fmtDate, fmtDateTime, isoDay, DateRange, rangePresets, Empty, Loading, saveFile, toCsv, plural,
} from '../admin/feeUI';
import { Donut } from '../admin/feeCharts';
import {
  Crumbs, ViewHead, Promo, Note, RailCard, SelectedMonths, PaymentMethods, SecureNote, RecentPayment,
  ReceiptPreview, ModeCell, modeLook, monthsCovered, payableMonths, pendingMonths, summarise,
} from './viewParts';

const TABS = [
  { key: 'schedule', label: <><Icon name="calendar" size={16} /> Fee Schedule</> },
  { key: 'history', label: <><Icon name="clock" size={16} /> Payment History</> },
  { key: 'receipts', label: <><Icon name="fileDoc" size={16} /> Receipts</> },
];
const TAB_TITLE = { schedule: 'Fees Management', history: 'Payment History', receipts: 'Receipts' };
const TAB_SUB = {
  schedule: '',
  history: 'View all your fee payments, download receipts and track your transactions',
  receipts: 'Download and manage all your fee payment receipts.',
};
const PER_PAGE = 7;
const INK = { paid: '#16a34a', pending: '#f472b6' };

export default function FeesView({ role = 'student' }) {
  const { user } = useAuth();
  const isParent = role === 'parent';

  const [children, setChildren] = useState([]);
  const [childId, setChildId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [tab, setTab] = useState('schedule');
  const [count, setCount] = useState(0);        // unpaid months ticked, oldest first
  const [page, setPage] = useState(1);
  const [pay, setPay] = useState(null);         // 'online' | 'offline'
  const [receipt, setReceipt] = useState(null);

  // Payment-history filters.
  const [hf, setHf] = useState({ from: '', to: '', mode: '', status: '' });
  // Receipt filters.
  const [rf, setRf] = useState({ q: '', month: '', mode: '' });

  /* ── Loading ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!isParent) return;
    feesApi.getMyChildren()
      .then(res => {
        const kids = res?.data || [];
        setChildren(kids);
        if (kids.length) setChildId(String(kids[0]._id));
        else { setLoading(false); setError('No child is linked to your account yet. The school office can link one for you.'); }
      })
      .catch(e => { setLoading(false); setError(e.message || 'Could not load your children'); });
  }, [isParent]);

  const load = React.useCallback(async () => {
    if (isParent && !childId) return;
    setLoading(true); setError(null);
    try {
      const res = isParent ? await feesApi.getChildFees(childId) : await feesApi.getMyFees();
      setData(res?.data || null);
    } catch (e) { setError(e.message || 'Could not load fees'); }
    finally { setLoading(false); }
  }, [isParent, childId]);
  useEffect(() => { load(); }, [load]);
  // A different child is a different fee book: nothing ticked carries over.
  useEffect(() => { setCount(0); setPage(1); setReceipt(null); }, [childId]);

  const api = useMemo(() => (isParent ? {
    payNow: (b) => feesApi.parentPayNow(childId, b),
    createOrder: (b) => feesApi.parentCreateRazorpayOrder(childId, b),
    verify: (b) => feesApi.parentVerifyRazorpay(childId, b),
    download: (id) => feesApi.downloadChildReceipt(childId, id),
  } : {
    payNow: feesApi.payNow,
    createOrder: feesApi.createRazorpayOrder,
    verify: feesApi.verifyRazorpay,
    download: feesApi.downloadMyReceipt,
  }), [isParent, childId]);

  /* ── What the fee book says ──────────────────────────────────────────── */
  const sym = data?.currencySymbol || '₹';
  const months = data?.monthlySchedule || [];
  const payments = data?.payments || [];
  const otherDue = data?.otherDue || 0;
  const unpaid = payableMonths(months);
  const pending = pendingMonths(months);
  const sums = summarise(months);
  const picked = unpaid.slice(0, count);
  const online = data?.gateway && data.gateway !== 'none';
  const totalCharged = data?.totalCharged || 0;
  const paidPct = totalCharged > 0 ? Math.min(100, Math.round((data.totalPaid / totalCharged) * 100)) : 0;
  const completed = payments.filter(p => p.paymentStatus === 'completed');
  const lastPayment = completed[0] || null;
  const whose = isParent ? (data?.child?.name || children.find(c => String(c._id) === childId)?.name || '') : '';

  useEffect(() => { setPage(1); }, [tab]);

  /* ── Paying ──────────────────────────────────────────────────────────── */
  const payMonths = picked.map(m => m.monthKey);
  const payTotal = otherDue + picked.reduce((s, m) => s + (m.payable != null ? m.payable : m.amountDue), 0);

  const payOnline = async () => {
    if (payTotal <= 0) return toast.error('Tick at least one month');
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load the payment gateway');
      const order = await api.createOrder({ amount: payTotal, months: payMonths });
      // The server prices the months itself — check out exactly what it ordered.
      const { orderId, keyId, currency, amount: paise } = order.data;
      const amount = paise ? paise / 100 : payTotal;
      const rzp = new window.Razorpay({
        key: keyId, amount: Math.round(amount * 100), currency: currency || 'INR',
        name: data?.school?.name || 'School Fees', description: 'Fee payment', order_id: orderId,
        prefill: { name: user?.name || '' },
        handler: async (r) => {
          try {
            const v = await api.verify({ ...r, amount, months: payMonths });
            toast.success(`Payment successful — receipt ${v.data.receiptNumber}`);
            setPay(null); setCount(0); load();
          } catch (e) { toast.error(e.message || 'We could not confirm that payment'); }
        },
      });
      rzp.on('payment.failed', (r) => toast.error(r.error?.description || 'Payment failed'));
      rzp.open();
    } catch (e) { toast.error(e.message); }
  };

  const openReceipt = async (p, how = 'download') => {
    if (p.paymentStatus !== 'completed') return toast.error('A receipt is issued once the office approves the payment');
    try {
      const blob = await api.download(p._id);
      const file = new Blob([blob], { type: 'application/pdf' });
      if (how === 'share' && navigator.share) {
        const f = new File([file], `receipt-${p.receiptNumber || p._id}.pdf`, { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [f] })) return navigator.share({ files: [f], title: `Receipt ${p.receiptNumber || ''}` });
      }
      const url = URL.createObjectURL(file);
      if (how === 'print') { window.open(url, '_blank'); return; }
      const a = document.createElement('a');
      a.href = url; a.download = `receipt-${p.receiptNumber || p._id}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e.message || 'Could not fetch that receipt'); }
  };

  /* ── Filtered lists ──────────────────────────────────────────────────── */
  const history = payments.filter(p => {
    const d = p.paymentDate ? isoDay(p.paymentDate) : '';
    if (hf.from && d < hf.from) return false;
    if (hf.to && d > hf.to) return false;
    if (hf.mode && p.paymentMode !== hf.mode) return false;
    if (hf.status && p.paymentStatus !== hf.status) return false;
    return true;
  });
  const receipts = completed.filter(p => {
    const term = rf.q.trim().toLowerCase();
    if (rf.mode && p.paymentMode !== rf.mode) return false;
    if (rf.month && !(p.months || []).includes(rf.month)) return false;
    if (term && !`${p.receiptNumber || ''} ${p.transactionRef || ''} ${p.amount} ${monthsCovered(p)}`.toLowerCase().includes(term)) return false;
    return true;
  });
  const slice = (rows) => rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const pagesOf = (rows) => Math.max(1, Math.ceil(rows.length / PER_PAGE));

  /* ── Chrome ──────────────────────────────────────────────────────────── */
  const head = (
    <>
      <Crumbs trail={[
        { label: 'Home', onClick: () => window.history.back() },
        ...(tab === 'schedule' ? [{ label: 'Fees' }] : [{ label: 'Fees', onClick: () => setTab('schedule') }, { label: TAB_TITLE[tab] }]),
      ]} />
      <ViewHead title={TAB_TITLE[tab]} subtitle={TAB_SUB[tab] || (whose ? `${whose}'s fees` : '')}>
        {isParent && children.length > 1 ? (
          <Select label="" value={childId} onChange={setChildId} options={children.map(c => ({ value: String(c._id), label: c.name }))} />
        ) : null}
        <Select label="" value={data?.activeYear?._id || ''} onChange={() => {}}
          options={data?.activeYear ? [{ value: data.activeYear._id, label: data.activeYear.yearName }] : [{ value: '', label: '—' }]} />
        {tab === 'history' ? <Btn variant="outline" icon="download" onClick={() => exportHistory(history, sym, data)}>Download Statement</Btn> : null}
        {tab === 'receipts' ? <Btn variant="outline" icon="download" onClick={() => exportHistory(receipts, sym, data, 'receipts')}>Download All Receipts</Btn> : null}
        {tab === 'schedule' ? <Promo>Invest in your learning today for a brighter tomorrow!</Promo> : null}
      </ViewHead>
    </>
  );

  if (loading && !data) {
    return <div className="fe-page">{head}<Card><Loading rows={6} /></Card></div>;
  }
  if (error) {
    return (
      <div className="fe-page">{head}
        <Card><Empty title="Fees are not available yet" hint={error} /></Card>
      </div>
    );
  }

  return (
    <div className="fe-page">
      {head}

      {tab === 'schedule' ? (
        <Tiles n={4}>
          <Tile glyph="wallet" tone="indigo" label="Total Fees" value={money(totalCharged, { sym, space: true })}
            caption={months.length ? `For ${plural(months.length, 'month')}` : 'Nothing charged yet'} />
          <Tile glyph="checkCircle" tone="green" label="Total Paid" value={money(data?.totalPaid, { sym, space: true })}
            share={{ pct: paidPct, color: '#16a34a', text: 'completed' }} />
          <Tile glyph="clockRing" tone="red" label="Balance Due" value={money(data?.dueTotal, { sym, space: true })}
            caption={pending.length ? `${plural(pending.length, 'month')} pending` : 'Nothing overdue'} />
          <Tile glyph="calendar" tone="blue" label="Next Due Date"
            value={data?.nextDue?.date ? fmtDate(`${data.nextDue.date}T00:00:00`) : (data?.nextDue ? data.nextDue.monthLabel : 'Nothing due')}
            caption={data?.nextDue ? `${money(data.nextDue.amount, { sym, space: true })} · ${data.nextDue.monthLabel}` : 'You are fully paid up'} />
        </Tiles>
      ) : null}

      {tab === 'history' ? (
        <Tiles n={4}>
          <Tile glyph="rupee" tone="green" label="Total Paid" value={money(data?.totalPaid, { sym, space: true })}
            caption={`in ${plural(completed.length, 'transaction')}`} />
          <Tile glyph="calendar" tone="indigo" label="Months Paid" value={plural(sums.paid, 'Month')} caption={sums.paidRange} />
          <Tile glyph="card" tone="purple" label="Last Payment" value={lastPayment ? money(lastPayment.amount, { sym, space: true }) : '—'}
            caption={lastPayment ? fmtDate(lastPayment.paymentDate) : 'No payments yet'} />
          <Tile glyph="clockRing" tone="red" label="Pending Months" value={plural(sums.pending, 'Month')} caption={sums.pendingRange} />
        </Tiles>
      ) : null}

      {tab === 'receipts' ? (
        <Tiles n={4}>
          <Tile glyph="docFill" tone="green" label="Total Receipts" value={completed.length}
            caption={months.length ? `Out of ${plural(months.length, 'month')}` : ''} />
          <Tile glyph="wallet" tone="indigo" label="Total Amount Paid" value={money(data?.totalPaid, { sym, space: true })} caption="Till now" />
          <Tile glyph="calendar" tone="purple" label="Last Payment" value={lastPayment ? fmtDate(lastPayment.paymentDate) : '—'}
            caption={lastPayment ? `${money(lastPayment.amount, { sym, space: true })} · ${modeLook(lastPayment.paymentMode).label}` : 'No payments yet'} />
          <Tile glyph="receipt" tone="amber" label="Next Due"
            value={data?.nextDue?.date ? fmtDate(`${data.nextDue.date}T00:00:00`) : '—'}
            caption={data?.nextDue ? money(data.nextDue.amount, { sym, space: true }) : 'Nothing due'} />
        </Tiles>
      ) : null}

      {tab === 'schedule' && unpaid.length > 1 ? (
        <Note title="Multiple Month Payment" glyph="info"
          action={<Btn variant="outline" onClick={() => toast('Tick the months you want, then use Proceed to Pay. Months are settled oldest first, so ticking one includes the unpaid months before it.', { icon: 'ℹ️', duration: 7000 })}>How it works?</Btn>}>
          You can select and pay for one month or several at once.
        </Note>
      ) : null}

      <UnderTabs items={TABS} value={tab} onChange={setTab} />

      <div className="fv-cols">
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Fee Schedule ─────────────────────────────────────────── */}
          {tab === 'schedule' ? (
            <>
              {pending.length ? (
                <Note tone="due" glyph="bang" title={`You have ${plural(pending.length, 'month')} pending`}
                  action={<Btn variant="outline" onClick={() => setCount(pending.length)}>Select All Pending</Btn>}>
                  Select one or more months below and click on Proceed to Pay.
                </Note>
              ) : null}
              <Card>
                <div className="fe-tablewrap">
                  <table className="fe-table fe-table--caps fe-table--roomy">
                    <thead>
                      <tr>
                        <th className="fe-w-check" />
                        <th>Month</th><th>Amount</th><th>Status</th><th>Due Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice(months).map((m) => {
                        const idx = unpaid.findIndex(u => u.monthKey === m.monthKey);
                        const on = idx > -1 && idx < count;
                        const owed = m.payable != null ? m.payable : m.amountDue;
                        return (
                          <tr key={m.monthKey} className={on ? 'is-sel' : ''}>
                            <td>
                              {idx > -1 ? (
                                <Check checked={on} label={`Pay ${m.monthLabel}`} onChange={() => setCount(on ? idx : idx + 1)} />
                              ) : null}
                            </td>
                            <td>
                              <b>{m.monthLabel}</b>{m.isCurrentMonth ? <> <Badge tone="indigo">Current</Badge></> : null}
                              <span className="fv-sub">{[...new Set((m.items || []).filter(i => !i.cancelled).map(i => i.name))].join(', ') || '—'}</span>
                            </td>
                            <td className="fe-num fv-strong">{money(m.totalAmount, { sym, space: true })}</td>
                            <td>
                              <StatusBadge status={m.payStatus} map={MONTH_STATUS} />
                              {m.amountPaid > 0 && owed > 0 ? <span className="fv-sub">{money(m.amountPaid, { sym, space: true })} paid</span> : null}
                            </td>
                            <td className="fe-num">{m.dueDate ? fmtDate(`${m.dueDate}T00:00:00`) : <span className="fe-muted">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!months.length ? <Empty title="No fees have been charged yet" hint="The school has not charged this academic year yet. Nothing is owed." /> : null}
                </div>
                <Pager page={page} pages={pagesOf(months)} total={months.length} limit={PER_PAGE} count={slice(months).length}
                  noun="months" onPage={setPage} />
              </Card>
            </>
          ) : null}

          {/* ── Payment History ──────────────────────────────────────── */}
          {tab === 'history' ? (
            <>
              <Card className="fe-filters">
                <div className="fe-frow" style={{ gridTemplateColumns: 'minmax(190px, 1.2fr) repeat(2, minmax(0, 1fr)) auto' }}>
                  <label className="fe-field">
                    <span className="fe-field__label">Date Range</span>
                    <DateRange from={hf.from} to={hf.to} presets={rangePresets(data?.activeYear)}
                      onChange={v => { setHf(f => ({ ...f, ...v })); setPage(1); }} />
                  </label>
                  <Select label="Payment Mode" value={hf.mode} onChange={v => { setHf(f => ({ ...f, mode: v })); setPage(1); }}
                    all="All Payment Modes" options={MODE_OPTIONS} />
                  <Select label="Status" value={hf.status} onChange={v => { setHf(f => ({ ...f, status: v })); setPage(1); }}
                    all="All Status" options={[
                      { value: 'completed', label: 'Success' }, { value: 'pending', label: 'Awaiting approval' },
                      { value: 'failed', label: 'Failed' }, { value: 'refunded', label: 'Cancelled' }]} />
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                    <Btn variant="outline" icon="refresh" onClick={() => { setHf({ from: '', to: '', mode: '', status: '' }); setPage(1); }}>Reset</Btn>
                  </div>
                </div>
              </Card>
              <Card>
                <div className="fe-cardhead"><h3>Payment Transactions ({history.length})</h3></div>
                <div className="fe-tablewrap">
                  <table className="fe-table fe-table--caps fe-table--dense">
                    <thead>
                      <tr><th>#</th><th>Date &amp; Time</th><th>Payment For</th><th>Months Covered</th><th>Amount</th>
                        <th>Payment Mode</th><th>Transaction ID</th><th>Status</th><th>Receipt</th></tr>
                    </thead>
                    <tbody>
                      {slice(history).map((p, i) => (
                        <tr key={p._id}>
                          <td className="fe-w-idx">{(page - 1) * PER_PAGE + i + 1}</td>
                          <td>{fmtDate(p.paymentDate)}<span className="fv-sub">{new Date(p.paymentDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></td>
                          <td>{(p.lines || []).map(l => l.feeName).filter(Boolean)[0] || 'Fee payment'}</td>
                          <td>{monthsCovered(p)}</td>
                          <td className="fe-num fv-strong">{money(p.amount, { sym, space: true })}</td>
                          <td><ModeCell mode={p.paymentMode} /></td>
                          <td className="fe-muted">{p.transactionRef || '—'}</td>
                          <td><StatusBadge status={p.paymentStatus} /></td>
                          <td>
                            {p.paymentStatus === 'completed' ? (
                              <Btn variant="soft" icon="eye" size="fit" onClick={() => { setReceipt(p); setTab('receipts'); }}>View</Btn>
                            ) : <span className="fe-muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!history.length ? <Empty title="No payments here" hint={payments.length ? 'Nothing matches these filters.' : 'Payments will appear here once one is made.'} /> : null}
                </div>
                <Pager page={page} pages={pagesOf(history)} total={history.length} limit={PER_PAGE} count={slice(history).length}
                  noun="transactions" onPage={setPage} />
              </Card>
            </>
          ) : null}

          {/* ── Receipts ─────────────────────────────────────────────── */}
          {tab === 'receipts' ? (
            <>
              <Card className="fe-filters">
                <div className="fe-frow" style={{ gridTemplateColumns: 'minmax(220px, 1.6fr) repeat(2, minmax(0, 1fr)) auto' }}>
                  <label className="fe-field">
                    <span className="fe-field__label">Search</span>
                    <Search value={rf.q} onChange={v => { setRf(f => ({ ...f, q: v })); setPage(1); }}
                      placeholder="Search by month, transaction ID or amount..." />
                  </label>
                  <Select label="Month" value={rf.month} onChange={v => { setRf(f => ({ ...f, month: v })); setPage(1); }}
                    all="All Months" options={months.map(m => ({ value: m.monthKey, label: m.monthLabel }))} />
                  <Select label="Payment Mode" value={rf.mode} onChange={v => { setRf(f => ({ ...f, mode: v })); setPage(1); }}
                    all="All Payment Modes" options={MODE_OPTIONS} />
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                    <Btn variant="outline" icon="refresh" onClick={() => { setRf({ q: '', month: '', mode: '' }); setPage(1); }}>Reset</Btn>
                  </div>
                </div>
              </Card>
              <Card>
                <div className="fe-cardhead"><h3>Receipts ({receipts.length})</h3></div>
                <div className="fe-tablewrap">
                  <table className="fe-table fe-table--caps fe-table--dense">
                    <thead>
                      <tr><th>#</th><th>Month / Payment For</th><th>Amount</th><th>Payment Mode</th>
                        <th>Payment Date</th><th>Receipt No.</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {slice(receipts).map((p, i) => (
                        <tr key={p._id} className={receipt?._id === p._id ? 'is-sel' : ''}>
                          <td className="fe-w-idx">{(page - 1) * PER_PAGE + i + 1}</td>
                          <td>
                            <b>{monthsCovered(p)}</b>
                            <span className="fv-sub">{[...new Set((p.lines || []).map(l => l.feeName).filter(n => n && n !== 'Fee Payment'))].join(', ') || 'Fee payment'}</span>
                          </td>
                          <td className="fe-num fv-strong">{money(p.amount, { sym, space: true })}</td>
                          <td><ModeCell mode={p.paymentMode} /></td>
                          <td>{fmtDate(p.paymentDate)}<span className="fv-sub">{new Date(p.paymentDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></td>
                          <td className="fe-muted">{p.receiptNumber || '—'}</td>
                          <td>
                            <span className="fe-acts">
                              <Btn variant="soft" icon="eye" size="fit" onClick={() => setReceipt(p)}>View</Btn>
                              <IconBtn icon="download" label="Download receipt" bordered onClick={() => openReceipt(p)} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!receipts.length ? <Empty title="No receipts yet" hint={completed.length ? 'Nothing matches these filters.' : 'A receipt is issued for every approved payment.'} /> : null}
                </div>
                <Pager page={page} pages={pagesOf(receipts)} total={receipts.length} limit={PER_PAGE} count={slice(receipts).length}
                  noun="receipts" onPage={setPage} />
              </Card>
            </>
          ) : null}
        </div>

        {/* ── The rail ───────────────────────────────────────────────── */}
        <aside className="fv-rail">
          {tab === 'schedule' ? (
            <>
              <SelectedMonths months={picked} otherDue={otherDue} sym={sym}
                onDrop={(i) => setCount(i)} onClear={() => setCount(0)}
                onPay={() => setPay(online ? 'online' : 'offline')} />
              <PaymentMethods online={online} onPay={() => setPay('online')} onOffline={() => setPay('offline')} />
              <SecureNote gateway={data?.gateway} />
            </>
          ) : null}

          {tab === 'history' ? (
            <>
              <RailCard title="Payment Summary">
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Donut size={150} thickness={20} unit="count" sym={sym}
                    slices={[
                      { label: 'Paid Months', value: sums.paid, color: INK.paid },
                      { label: 'Pending Months', value: sums.pending, color: INK.pending },
                    ]}
                    center={[`${sums.paid} / ${sums.total}`, 'Months Paid']} />
                </div>
                <ul className="fv-legend">
                  <li><i style={{ background: INK.paid }} /><span>Paid Months</span><b>{sums.paid}</b><em>{money(sums.paidAmount, { sym, space: true })}</em></li>
                  <li><i style={{ background: INK.pending }} /><span>Pending Months</span><b>{sums.pending}</b><em>{money(sums.pendingAmount, { sym, space: true })}</em></li>
                </ul>
              </RailCard>
              <RecentPayment payment={lastPayment} sym={sym} onOpen={lastPayment ? () => { setReceipt(lastPayment); setTab('receipts'); } : null} />
              <RailCard title="Download Options">
                <button type="button" className="fv-method" onClick={() => lastPayment ? openReceipt(lastPayment) : toast.error('No receipt to download yet')}>
                  <span className="fv-method__i" style={{ background: '#eef2ff', color: '#4f46e5' }}><Glyph name="receipt" size={19} /></span>
                  <span className="fv-method__b"><strong>Download receipt</strong><span>The most recent payment</span></span>
                  <Icon name="chevronRight" size={16} />
                </button>
                <button type="button" className="fv-method" onClick={() => exportHistory(history, sym, data)}>
                  <span className="fv-method__i" style={{ background: '#ecfdf5', color: '#059669' }}><Glyph name="docFill" size={19} /></span>
                  <span className="fv-method__b"><strong>Download statement</strong><span>Every payment, as a spreadsheet</span></span>
                  <Icon name="chevronRight" size={16} />
                </button>
              </RailCard>
            </>
          ) : null}

          {tab === 'receipts' ? (
            receipt ? (
              <ReceiptPreview payment={receipt} student={data?.student} school={data?.school} year={data?.activeYear} sym={sym}
                onClose={() => setReceipt(null)}
                onOpen={() => openReceipt(receipt)}
                onPrint={() => openReceipt(receipt, 'print')}
                onShare={() => openReceipt(receipt, 'share')} />
            ) : (
              <RailCard title="Receipt Preview">
                <p className="fe-form__hint" style={{ margin: 0 }}>Choose a receipt on the left to see what it says before you download it.</p>
              </RailCard>
            )
          ) : null}
        </aside>
      </div>

      <PayDialog open={!!pay} kind={pay} onClose={() => setPay(null)} sym={sym} months={picked} otherDue={otherDue}
        total={payTotal} online={online} onOnline={payOnline}
        onOffline={async (form) => {
          try {
            const res = await api.payNow({ ...form, amount: payTotal, months: payMonths });
            toast.success(res.message || 'Sent to the office — they will confirm it shortly');
            setPay(null); setCount(0); load();
          } catch (e) { toast.error(e.message); }
        }} />
    </div>
  );
}

/* A month's state, said the way a family would say it. */
const MONTH_STATUS = {
  paid: ['green', 'Paid'], partial: ['amber', 'Part paid'], due: ['red', 'Due'],
  upcoming: ['slate', 'Upcoming'], awaiting: ['amber', 'Awaiting approval'], cancelled: ['slate', 'Cancelled'],
};
const MODE_OPTIONS = [
  { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'online', label: 'Online' },
  { value: 'bank_transfer', label: 'Net Banking' }, { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' }, { value: 'dd', label: 'Demand Draft' },
];

function exportHistory(rows, sym, data, what = 'statement') {
  if (!rows.length) return toast.error('Nothing to download yet');
  saveFile(toCsv([
    { label: 'Date', value: r => fmtDateTime(r.paymentDate) },
    { label: 'Receipt No.', value: r => r.receiptNumber || '' },
    { label: 'Months Covered', value: r => monthsCovered(r) },
    { label: `Amount (${sym})`, value: r => r.amount },
    { label: 'Payment Mode', value: r => (r.paymentMode || '').replace('_', ' ') },
    { label: 'Transaction ID', value: r => r.transactionRef || '' },
    { label: 'Status', value: r => r.paymentStatus },
  ], rows), `fees-${what}-${data?.activeYear?.yearName || ''}.csv`);
}

/**
 * Paying. Online goes straight to the gateway's own checkout, which is where
 * card, UPI and net banking all actually live. An offline payment is a
 * message to the office — it is not money, and says so.
 */
function PayDialog({ open, kind, onClose, sym, months, otherDue, total, online, onOnline, onOffline }) {
  const [form, setForm] = useState({ paymentMode: 'upi', transactionRef: '', remarks: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setForm({ paymentMode: 'upi', transactionRef: '', remarks: '' }); setBusy(false); } }, [open]);
  const offline = kind === 'offline' || !online;
  return (
    <Modal open={open} onClose={onClose} maxWidth={520}
      title={offline ? 'Tell the office about a payment' : 'Pay fees'}
      footer={
        <>
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          {offline ? (
            <Btn variant="primary" disabled={busy || total <= 0} onClick={async () => { setBusy(true); await onOffline(form); setBusy(false); }}>
              {busy ? 'Sending…' : 'Send to the office'}
            </Btn>
          ) : (
            <Btn variant="primary" disabled={total <= 0} onClick={onOnline}>Pay {money(total, { sym, space: true })}</Btn>
          )}
        </>
      }>
      <div className="fe-form">
        <div className="fe-impact">
          <div><small>Months</small><b>{months.length ? months.map(m => m.monthLabel).join(', ') : 'None ticked'}</b></div>
          <div><small>Total</small><b>{money(total, { sym, space: true })}</b></div>
        </div>
        {otherDue > 0 ? (
          <p className="fe-form__hint" style={{ margin: 0 }}>
            {money(otherDue, { sym, space: true })} of fines and other charges is included — those are always settled first.
          </p>
        ) : null}

        {offline ? (
          <>
            <label className="fe-field">
              <span className="fe-field__label">How was it paid?</span>
              <Select value={form.paymentMode} onChange={v => setForm(f => ({ ...f, paymentMode: v }))} options={MODE_OPTIONS} />
            </label>
            <label className="fe-field">
              <span className="fe-field__label">Reference / UTR number</span>
              <input className="fe-input" value={form.transactionRef} onChange={e => setForm(f => ({ ...f, transactionRef: e.target.value }))}
                placeholder="So the office can match it against the bank" />
            </label>
            <label className="fe-field">
              <span className="fe-field__label">Anything the office should know</span>
              <input className="fe-input" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
            </label>
            <div className="fe-note fe-note--amber">
              <span className="fe-note__i"><Glyph name="alertTri" size={24} /></span>
              <div><strong>This does not take any money</strong>
                <div className="fe-note__b">It tells the office you have paid. The months stay marked as awaiting approval until someone there confirms it, and only then is a receipt issued.</div></div>
            </div>
          </>
        ) : (
          <div className="fe-note fe-note--blue">
            <span className="fe-note__i"><Glyph name="shield" size={24} /></span>
            <div><strong>You will be taken to the secure checkout</strong>
              <div className="fe-note__b">Card, UPI and net banking are all offered there. Your receipt is issued the moment the payment goes through.</div></div>
          </div>
        )}
      </div>
    </Modal>
  );
}
