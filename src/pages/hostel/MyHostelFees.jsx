/**
 * A resident's hostel bills — for the student or teacher who owes them, and
 * for a parent paying on a child's behalf. The server decides whose bills the
 * caller may see, so `student` is a request, not a claim.
 *
 * Two ways to pay, offered side by side:
 *   · online, through the school's gateway — one order for the invoices ticked,
 *     priced by the server, confirmed only once the gateway vouches for it;
 *   · at the hostel office — cash, cheque, UPI, card or a transfer, recorded by
 *     the fee desk.
 * Either way the payment gets a receipt, and every receipt is listed here.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getMyFeeSummary, createFeeOrder, confirmFeePayment } from '../../api/hostel.api';
import { openCheckout } from '../../utils/razorpay';
import { Spinner } from '../../components/ui/index';
import { money, openHostelReceipt } from './shared';
import { Glyph, Mark, words } from './admin/hsUI';
import { Btn, TwoLine, Kpis, Kpi, DataTable, ListCard, EmptyRows, fmtDate, fmtTime } from './admin/hsList';
import { FormModal, FormSection, RadioCards, InfoNote } from './admin/hsForm';
import { Status } from './residentParts';

const MODE = { cash: 'Cash', cheque: 'Cheque', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer', online: 'Online' };
const rupees = (n) => `₹${money(n)}`;
const what = (i) => `${words(i.feeType)}${i.period?.label ? ` · ${i.period.label}` : ''}`;
const Head = ({ icon, title, count, children }) => (
  <>
    <span className="hsr-lhead"><Mark name={icon} tone="indigo" size={34} glyph={19} /><h3>{title}<small>{count}</small></h3></span>
    {children}
  </>
);

export default function MyHostelFees({ student, payerName, who = 'you', hideWhenEmpty = false, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState('online');
  const [picked, setPicked] = useState(new Set());
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await getMyFeeSummary(student); setData(r.data ?? r); }
    catch (err) { toast.error(err?.message || 'Could not load the hostel fees'); setData(null); }
    finally { setLoading(false); }
  }, [student]);
  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => data?.pending || [], [data]);
  const online = !!data?.gateway?.enabled;
  const total = pending.filter((i) => picked.has(i._id)).reduce((s, i) => s + (i.outstanding || 0), 0);

  const openPay = (only) => {
    setPicked(new Set(only ? [only] : pending.map((i) => i._id)));
    setMethod(online ? 'online' : 'offline');
    setPayOpen(true);
  };
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const payOnline = async () => {
    if (!picked.size) { toast.error('Tick at least one invoice to pay'); return; }
    setPaying(true);
    try {
      const res = await createFeeOrder({ student, invoiceIds: [...picked] });
      const order = res.data ?? res;
      setPayOpen(false);                       // the gateway's own sheet takes over from here
      await openCheckout({
        order,
        amount: order.payable,
        name: 'Hostel fees',
        description: `${order.invoiceIds.length} invoice${order.invoiceIds.length === 1 ? '' : 's'}`,
        prefillName: payerName,
        onDismiss: () => setPaying(false),
        onError: (err) => { toast.error(err.message); setPaying(false); },
        onVerify: async (response) => {
          try {
            const v = await confirmFeePayment({ ...response, student });
            const d = v.data ?? v;
            if (d.unapplied > 0) toast(`₹${money(d.unapplied)} could not be applied — the hostel office has been told and will refund or adjust it.`, { duration: 9000 });
            if (d.receiptNumber) {
              toast.success(`Paid — receipt ${d.receiptNumber}`);
              openHostelReceipt(d.receiptNumber);
            }
            await load();
            onChanged?.();                     // the page's headline figures moved too
          } catch (err) {
            // The money may well have left; never imply otherwise.
            toast.error(err?.message || 'We could not confirm the payment — please contact the hostel office.');
          } finally { setPaying(false); }
        },
      });
    } catch (err) {
      toast.error(err?.message || 'Could not start the payment');
      setPaying(false);
    }
  };

  if (loading && !data) return hideWhenEmpty ? null : <div className="hsr-loading"><Spinner /></div>;
  if (!data) return null;
  // Shown under "not a resident" only when there is something to show.
  if (hideWhenEmpty && !data.pending?.length && !data.settled?.length) return null;

  const receipts = data.receipts || [];
  return (
    <div className="hsr-stack">
      <Kpis cols={4} size="xs">
        <Kpi tone="blue" icon="oReceipt" value={rupees(data.billed)} label="Billed" />
        <Kpi tone="green" icon="checkCircle" value={rupees(data.paid)} label="Paid" />
        <Kpi tone={data.outstanding > 0 ? 'amber' : 'green'} icon="hourglass" value={rupees(data.outstanding)} label="Outstanding" />
        <Kpi tone={data.overdue ? 'red' : 'violet'} icon="alertTri" value={data.overdue || 0} label="Overdue Invoices" />
      </Kpis>

      {data.freeForStaff ? (
        <div className="hsr-banner"><Glyph name="checkCircle" size={18} /><span>The hostel is free for teachers at this school, so no hostel fee is billed to you. A one-off charge raised by the hostel office would appear below.</span></div>
      ) : null}
      {data.pendingOrders > 0 ? (
        <div className="hsr-banner is-warn"><Glyph name="alertTri" size={18} /><span>
          <b>An online payment was started and has not been confirmed yet.</b> It is checked with the payment gateway automatically — if money left your account, the receipt appears here within half an hour. Do not pay again in the meantime.
        </span></div>
      ) : null}

      <ListCard head={(
        <Head icon="wallet" title="To Pay" count={pending.length}>
          {pending.length ? <Btn kind="primary" icon="creditCard" onClick={() => openPay()} disabled={paying}>Pay {rupees(data.outstanding)}</Btn> : null}
        </Head>
      )}>
        <DataTable select={false} rows={pending} columns={[
          { key: 'no', label: 'Invoice', render: (r) => <TwoLine top={r.invoiceNumber} sub={what(r)} strong /> },
          { key: 'net', label: 'Amount', render: (r) => <TwoLine top={rupees(r.netAmount)} sub={r.lateFee > 0 ? `incl. ${rupees(r.lateFee)} late fee` : r.discount > 0 ? `after ${rupees(r.discount)} concession` : ''} /> },
          { key: 'paid', label: 'Paid', render: (r) => rupees(r.paidAmount), hideNarrow: true },
          { key: 'out', label: 'Outstanding', render: (r) => <strong>{rupees(r.outstanding)}</strong> },
          { key: 'due', label: 'Due', render: (r) => (r.dueDate ? fmtDate(r.dueDate) : '—'), nowrap: true },
          { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
        ]} actions={(r) => <Btn size="sm" onClick={() => openPay(r._id)}>Pay</Btn>}
          empty={<EmptyRows icon="checkCircle" title="Nothing to pay">{who === 'you' ? 'You are' : `${who} is`} all settled.</EmptyRows>} />
      </ListCard>

      <ListCard head={<Head icon="oReceipt" title="Receipts" count={receipts.length} />}>
        <DataTable select={false} rows={receipts} rowKey="receiptNumber" columns={[
          { key: 'no', label: 'Receipt', render: (r) => <strong>{r.receiptNumber}</strong>, nowrap: true },
          { key: 'at', label: 'Paid On', render: (r) => <TwoLine top={fmtDate(r.paidAt)} sub={fmtTime(r.paidAt)} />, nowrap: true },
          { key: 'mode', label: 'Paid By', render: (r) => <TwoLine top={r.mode === 'online' ? 'Online' : `${MODE[r.mode] || words(r.mode)} at the office`} sub={r.reference} /> },
          { key: 'for', label: 'For', render: (r) => <span className="hsr-clip">{r.lines.join(', ')}</span>, hideNarrow: true },
          { key: 'amt', label: 'Amount', render: (r) => <strong>{rupees(r.amount)}</strong> },
        ]} actions={(r) => <Btn size="sm" icon="oReceipt" onClick={() => openHostelReceipt(r.receiptNumber, r.invoice)}>View Receipt</Btn>}
          empty={<EmptyRows icon="oReceipt" title="No payments yet">Every payment — online or at the hostel office — gets a receipt that is listed here.</EmptyRows>} />
      </ListCard>

      {data.refunds?.length ? (
        <ListCard head={<Head icon="refresh" title="Refunds" count={data.refunds.length} />}>
          <DataTable select={false} rows={data.refunds} rowKey="voucherNumber" columns={[
            { key: 'no', label: 'Voucher', render: (r) => <strong>{r.voucherNumber || '—'}</strong>, nowrap: true },
            { key: 'at', label: 'Refunded On', render: (r) => <TwoLine top={fmtDate(r.refundedAt)} sub={fmtTime(r.refundedAt)} />, nowrap: true },
            { key: 'how', label: 'Returned By', render: (r) => <TwoLine top={r.mode === 'gateway' ? 'Back to the online payment' : 'Cash / transfer from the office'} sub={r.reference} /> },
            { key: 'for', label: 'For', render: (r) => <span className="hsr-clip">{[r.label, r.reason].filter(Boolean).join(' · ')}</span>, hideNarrow: true },
            { key: 'amt', label: 'Amount', render: (r) => <strong>{rupees(r.amount)}</strong> },
          ]} actions={(r) => (r.voucherNumber ? <Btn size="sm" icon="oReceipt" onClick={() => openRefundVoucher(r.voucherNumber)}>View Voucher</Btn> : null)} />
        </ListCard>
      ) : null}

      {data.settled?.length ? (
        <ListCard head={<Head icon="checkCircle" title="Settled Invoices" count={data.settled.length} />}>
          <DataTable select={false} rows={data.settled} columns={[
            { key: 'no', label: 'Invoice', render: (r) => <TwoLine top={r.invoiceNumber} sub={what(r)} strong /> },
            { key: 'net', label: 'Amount', render: (r) => rupees(r.netAmount) },
            { key: 'paid', label: 'Paid', render: (r) => rupees(r.paidAmount) },
            { key: 'ref', label: 'Refunded', render: (r) => (r.refundedAmount > 0 ? rupees(r.refundedAmount) : <span className="hs-muted">—</span>), hideNarrow: true },
            { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
          ]} />
        </ListCard>
      ) : null}

      {/* ── Pay: online, or at the office ─────────────────────────────────── */}
      <FormModal open={payOpen} onClose={() => setPayOpen(false)} busy={paying} width={640}
        icon="wallet" iconTone="green" title="Pay Hostel Fees"
        subtitle={who === 'you' ? 'Choose what to pay and how.' : `Pay hostel fees for ${who}.`}
        onSubmit={method === 'online' ? payOnline : () => setPayOpen(false)}
        submitLabel={method === 'online' ? `Pay ${rupees(total)}` : 'Done'} submitIcon={method === 'online' ? 'arrowRight' : 'check'}>
        <FormSection icon="creditCard" title="How to Pay" sub="Both ways give you a receipt on this page.">
          <RadioCards value={method} onChange={setMethod} options={[
            ['online', 'Pay online', online ? 'Card, UPI or net banking — instant receipt' : 'Not switched on for hostel fees'],
            ['offline', 'Pay at the hostel office', (data.offlineModes || []).join(', ')],
          ]} />
          {method === 'online' && !online ? (
            <InfoNote tone="amber">Online payment is not switched on for hostel fees at this school yet. Please pay at the hostel office.</InfoNote>
          ) : null}
          {method === 'offline' ? (
            <InfoNote title="Paying at the office">
              Take {rupees(total)} to the hostel office and quote the invoice number{picked.size === 1 ? '' : 's'} below.
              The fee desk records the payment and its receipt appears here straight away.
            </InfoNote>
          ) : null}
        </FormSection>
        <FormSection icon="oReceipt" title="What to Pay" sub={method === 'online' ? 'Untick an invoice to leave it for later.' : 'The invoices you intend to settle.'}>
          <div className="hsf-checklist">
            {pending.map((i) => (
              <label key={i._id}>
                <input type="checkbox" className="hs-check" checked={picked.has(i._id)} onChange={() => toggle(i._id)} />
                <span><strong>{i.invoiceNumber}</strong> · {what(i)}{i.dueDate ? <small> — due {fmtDate(i.dueDate)}</small> : null}</span>
                <b>{rupees(i.outstanding)}</b>
              </label>
            ))}
          </div>
          <div className="hsf-paytotal"><span>Total</span><strong>{rupees(total)}</strong></div>
        </FormSection>
      </FormModal>
    </div>
  );
}
