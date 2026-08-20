import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getFineSummary, createFineOrder, confirmFinePayment, listMyReceipts, fineReceiptPath,
} from '../../api/library.api';
import { openCheckout } from '../../utils/razorpay';
import api from '../../api/axios';
import { Table, Badge, Button, Spinner, Alert, Empty } from '../ui/index';

// Library fines for the person who owes them — and for a parent paying on a
// child's behalf. One component serves both; the server decides whose fines
// the caller may see, so `forUserId` is a request, not a claim.
//
// Receipts appear here whether the fine was paid at the counter or online, so a
// parent who handed over cash has the same document as one who tapped a card.

const fmtDate = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—');
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const TYPE_LABEL = { late_return: 'Late return', lost: 'Lost book', damaged: 'Damaged book' };

/** Opens an authenticated receipt in a new tab — a plain link carries no token. */
async function openReceipt(receiptNumber) {
  const tab = window.open('', '_blank');
  try {
    const res = await fetch(`${api.defaults.baseURL}${fineReceiptPath(receiptNumber)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || 'Could not open the receipt');
    }
    const html = await res.text();
    if (!tab) return toast.error('Allow pop-ups to view the receipt');
    tab.document.write(html);
    tab.document.close();
  } catch (err) {
    tab?.close();
    toast.error(err?.message || 'Could not open the receipt');
  }
}

export default function FinePayments({ forUserId, payerName, title = 'Library fines' }) {
  const [data,     setData]     = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [paying,   setPaying]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, rcpts] = await Promise.all([
        getFineSummary(forUserId),
        listMyReceipts(forUserId).catch(() => ({ data: [] })),
      ]);
      setData(summary?.data || null);
      setReceipts(rcpts?.data || []);
    } catch (err) {
      toast.error(err?.message || 'Could not load fines');
      setData(null);
    } finally { setLoading(false); }
  }, [forUserId]);

  useEffect(() => { load(); }, [load]);

  const pay = async () => {
    setPaying(true);
    try {
      const orderRes = await createFineOrder({ userId: forUserId });
      const order = orderRes?.data;

      await openCheckout({
        order,
        amount: order.payable,
        name: 'Library fine',
        description: `${order.fineIds.length} fine(s)`,
        prefillName: payerName,
        onDismiss: () => setPaying(false),
        onError: (err) => { toast.error(err.message); setPaying(false); },
        onVerify: async (response) => {
          try {
            const v = await confirmFinePayment({
              ...response, userId: forUserId, fineIds: order.fineIds,
            });
            toast.success(`Paid — receipt ${v.data.receiptNumber}`);
            await load();
            openReceipt(v.data.receiptNumber);
          } catch (err) {
            // The money may well have left; never imply otherwise.
            toast.error(err?.message || 'We could not confirm the payment — please contact the school office.');
          } finally { setPaying(false); }
        },
      });
    } catch (err) {
      toast.error(err?.message || 'Could not start the payment');
      setPaying(false);
    }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>;
  if (!data) return null;

  const canPayOnline = data.gateway?.enabled && data.outstanding > 0;

  const pendingCols = [
    { key: 'what',   label: 'Charge', render: r => (
      <div>
        <div style={{ fontWeight: 600 }}>{TYPE_LABEL[r.fineType] || r.fineType}</div>
        {r.description && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.description}</div>}
      </div>
    )},
    { key: 'raised', label: 'Raised', render: r => fmtDate(r.createdAt) },
    { key: 'charged', label: 'Charged', render: r => (
      r.waivedAmount
        ? <span>
            <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>{money(r.amount)}</span>
            <div style={{ fontSize: '.72rem', color: 'var(--success)' }}>{money(r.waivedAmount)} waived</div>
          </span>
        : money(r.amount)
    )},
    // What is actually left to pay after any waiver — the figure that matters.
    { key: 'amount', label: 'To pay', render: r => <strong>{money(r.outstanding ?? r.amount)}</strong> },
  ];

  const receiptCols = [
    { key: 'no',     label: 'Receipt',  render: r => <strong>{r.receiptNumber}</strong> },
    { key: 'date',   label: 'Paid on',  render: r => fmtDate(r.paidAt) },
    { key: 'mode',   label: 'Paid by',  render: r => (
      <Badge variant={r.paymentMode === 'online' ? 'info' : 'muted'}>
        {r.paymentMode === 'online' ? 'Online' : 'Cash at the library'}
      </Badge>
    )},
    { key: 'amount', label: 'Amount',   render: r => money(r.amount) },
    { key: 'action', label: '', render: r => (
      <Button size="sm" variant="secondary" onClick={() => openReceipt(r.receiptNumber)}>
        View receipt
      </Button>
    )},
  ];

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ marginRight: 'auto' }}>{title}</h2>
          {data.outstanding > 0 && (
            <>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--danger)' }}>
                {money(data.outstanding)} outstanding
              </span>
              {canPayOnline && <Button onClick={pay} loading={paying}>Pay now</Button>}
            </>
          )}
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {data.pending.length === 0
            ? <Empty icon="✅" title="Nothing outstanding" message="No library fines to pay." />
            : <Table columns={pendingCols} data={data.pending} />}
        </div>
        {data.outstanding > 0 && !canPayOnline && (
          <div className="card-footer">
            <Alert variant="info">
              Online payment is not available for library fines at this school — please pay at the
              library counter. You will get a receipt either way.
            </Alert>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header"><h2>Receipts</h2></div>
        <div className="card-body" style={{ padding: 0 }}>
          {receipts.length === 0
            ? <Empty icon="🧾" title="No receipts yet" message="Receipts appear here once a fine is paid." />
            : <Table columns={receiptCols} data={receipts} />}
        </div>
      </div>
    </>
  );
}
