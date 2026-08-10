import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Badge, StatCard } from '../../../components/ui/index';
import { useChildPicker } from './_shared';

const ST = { pending: 'warning', partial: 'info', paid: 'success', overdue: 'danger', cancelled: 'muted' };
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

export default function ParentFees() {
  const { studentId, picker } = useChildPicker();
  const [rows, setRows] = useState([]);
  const [loading, setLoad] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    setLoad(true);
    api.parentInvoices({ studentId }).then(r => setRows(r.data ?? r)).catch(e => toast.error(e.message)).finally(() => setLoad(false));
  }, [studentId]);

  const due = rows.reduce((s, r) => s + Math.max(0, (r.netAmount || 0) - (r.paidAmount || 0)) * (r.status === 'cancelled' ? 0 : 1), 0);
  const paid = rows.reduce((s, r) => s + (r.paidAmount || 0), 0);

  const columns = [
    { key: 'inv', label: 'Invoice', render: r => <div><strong>{r.invoiceNumber}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.period?.label}</div></div> },
    { key: 'net', label: 'Amount', render: r => fmt(r.netAmount) },
    { key: 'paid', label: 'Paid', render: r => fmt(r.paidAmount) },
    { key: 'due', label: 'Due', render: r => fmt(Math.max(0, r.netAmount - r.paidAmount)) },
    { key: 'status', label: 'Status', render: r => <Badge variant={ST[r.status]}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Transport Fees" subtitle="Invoices, dues & payment status" action={picker} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14, marginBottom: 16 }}>
        <StatCard label="Total Paid" value={fmt(paid)} icon="💰" color="green" />
        <StatCard label="Outstanding" value={fmt(due)} icon="⏳" color="orange" />
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="💳" emptyTitle="No transport invoices yet" />
      </div></div>
      <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 12 }}>To pay, visit the school office or use the online fee payment link shared by the school.</p>
    </div>
  );
}
