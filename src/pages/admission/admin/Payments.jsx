/**
 * Every application and admission fee taken — online through the school's
 * gateway, or at the counter — with its receipt. Cancelled receipts stay
 * listed, marked so; money refunded on a payment shows under its amount.
 */
import React from 'react';
import { admin } from '../../../api/admission.api';
import { Page, Head, Panel, Chip, Table, Toolbar, Select, Pager, Empty, ErrorBox, Spin, IconBtn, Person, Tiles, Tile, useLoad } from '../admUI';
import { fmtDate, money, PAY_MODES } from '../meta';
import { useQueryState, openFile } from './parts';
import BackgroundExport from './ExportJobs';

const BASE = '/admin/admissions';
const KIND = { application_fee: 'Application fee', admission_fee: 'Admission fee' };

export default function Payments() {
  const [q, setQ] = useQueryState({ kind: '', status: '', page: '1' });
  const params = { kind: q.kind, status: q.status, page: q.page, limit: 30 };
  const { data, meta, loading, error, reload } = useLoad(() => admin.payments(params), [JSON.stringify(params)]);
  return (
    <Page>
      <Head eyebrow="Admissions" title="Payments" subtitle="Application and admission fees, online and at the counter. Fees are recorded on each application.">
        <BackgroundExport kind="payments" params={{ kind: q.kind, status: q.status }} label="Export…" />
      </Head>
      <Tiles>
        <Tile icon="wallet" tone="green" label={q.status === 'void' ? 'Cancelled receipts' : 'Collected (these filters)'} value={money(meta?.amount || 0)} sub={`${(meta?.total || 0).toLocaleString('en-IN')} receipts`} />
        {meta?.refunded > 0 ? <Tile icon="reply" tone="amber" label="Refunded on these" value={money(meta.refunded)} sub={`${money((meta.amount || 0) - meta.refunded)} kept`} /> : null}
      </Tiles>
      <Panel pad={false}>
        <Toolbar>
          <Select value={q.kind} onChange={(e) => setQ({ kind: e.target.value })} aria-label="Fee">
            <option value="">Both fees</option><option value="application_fee">Application fees</option><option value="admission_fee">Admission fees</option>
          </Select>
          <Select value={q.status} onChange={(e) => setQ({ status: e.target.value })} aria-label="Status">
            <option value="">Paid and cancelled</option><option value="paid">Paid</option><option value="void">Cancelled</option><option value="failed">Failed online</option>
          </Select>
        </Toolbar>
        {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
          <>
            <Table rows={data || []} empty={<Empty icon="wallet" title="No payments yet" />}
              columns={[
                { key: 'r', label: 'Receipt', render: (p) => <span className="adm-num">{p.receiptNumber || '—'}</span> },
                { key: 's', label: 'Student', render: (p) => <Person name={p.studentName} sub={p.applicationNumber} to={`${BASE}/applications/${p.applicationId}`} /> },
                { key: 'k', label: 'For', render: (p) => KIND[p.kind] },
                { key: 'a', label: 'Amount', align: 'right', render: (p) => <><b>{money(p.amount)}</b>{p.refunded > 0 ? <div className="adm-muted" style={{ fontSize: '.74rem' }}>{money(p.refunded)} refunded</div> : null}</> },
                { key: 'm', label: 'Mode', render: (p) => <>{p.mode === 'online' ? 'Online' : PAY_MODES.find((m) => m.value === p.mode)?.label || p.mode}{p.reference ? <div className="adm-muted" style={{ fontSize: '.74rem' }}>{p.reference}</div> : null}</> },
                { key: 'd', label: 'Date', render: (p) => fmtDate(p.paidAt) },
                { key: 'st', label: 'Status', render: (p) => <Chip tone={p.status === 'paid' ? 'green' : p.status === 'void' ? 'gray' : 'red'} title={p.voidReason}>{p.status === 'void' ? 'Cancelled' : p.status}</Chip> },
                { key: 'x', label: '', render: (p) => (['paid', 'void'].includes(p.status) ? <IconBtn icon="eye" label="Receipt" onClick={() => openFile(admin.receiptUrl(p.applicationId, p._id))} /> : null) },
              ]} />
            <Pager page={Number(q.page) || 1} pages={Math.max(1, Math.ceil((meta?.total || 0) / 30))} total={meta?.total || 0} onPage={(p) => setQ({ page: p }, { keepPage: true })} label="payments" />
          </>
        )}
      </Panel>
    </Page>
  );
}
