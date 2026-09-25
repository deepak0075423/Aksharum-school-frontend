/**
 * Transport → Invoices.
 *
 * Status is recomputed on read: a stored "pending" that fell due yesterday is
 * shown as overdue, because a money screen that under-reports arrears is worse
 * than no screen. The stored value is left alone — only the display is honest.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search,
  Filters, FilterEnd, TableWrap, Cell2, Who, Badge, StatusBadge, Chip, Pager, Rows, Row, QuickActions,
  Loading, Empty, Note, Confirm, Check, DateChip, RouteBadge, count, money, compactMoney, fmtDate,
  words, useBoard, useDebounced, toCsv, saveFile, openHtml,
} from './trUI';
import { StackedBars, Donut, DonutLegend, DonutRow, RankBars, STATUS_INK } from './trCharts';
import { GenerateInvoicesModal, PaymentModal, RemindModal } from './trForms';

export default function TransportInvoices() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [route, setRoute] = useState('');
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [gen, setGen] = useState(false);
  const [pay, setPay] = useState(null);
  const [remind, setRemind] = useState(false);
  const [cancel, setCancel] = useState(null);
  const [marked, setMarked] = useState([]);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(
    () => api.getInvoiceBoard({ search, status, route, month, page, limit }),
    [search, status, route, month, page, limit],
  );
  const d = data || {};
  const t = d.tiles || {};
  const rows = d.data || [];

  const reset = () => { setQ(''); setStatus(''); setRoute(''); setMonth(''); setPage(1); };
  const exportCsv = () => {
    saveFile(`transport-invoices-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['invoiceNumber', 'Invoice No.'], ['student', 'Student', (r) => r.student?.name || ''],
      ['class', 'Class', (r) => r.student?.classLabel || ''],
      ['route', 'Route', (r) => (r.route ? `${r.route.tag} — ${r.route.name}` : '')],
      ['period', 'Period', (r) => r.period?.label || ''],
      ['netAmount', 'Amount (₹)'], ['paidAmount', 'Paid (₹)'], ['due', 'Due (₹)'],
      ['liveStatus', 'Status', (r) => words(r.liveStatus)],
      ['dueDate', 'Due Date', (r) => fmtDate(r.dueDate)],
    ], rows));
    toast.success('Exported the invoices on this page');
  };
  const receipt = async (inv) => {
    try {
      const res = await api.getInvoiceReceipt(inv._id);
      const html = typeof res === 'string' ? res : (res?.data ?? '');
      if (!openHtml(html, inv.invoiceNumber)) toast.error('Allow pop-ups to open the receipt');
    } catch (e) { toast.error(e?.message || 'Could not open the receipt'); }
  };
  const doCancel = async () => {
    try { await api.cancelInvoice(cancel._id); toast.success('Invoice cancelled'); setCancel(null); reload(); }
    catch (e) { toast.error(e?.message || 'Could not cancel it'); setCancel(null); }
  };

  if (loading && !data) return <div className="tr-page"><Loading /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load invoices">{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={`${fmtDate(d.range?.from)} – ${fmtDate(d.range?.to)}`} icon="calendar" />
        <Btn kind="primary" icon="plus" onClick={() => setGen(true)}>Create Invoice</Btn>
      </TopBar>

      <TrHead icon="invoice" iconTone="blue" title="Transport Invoices"
              subtitle="Generate, manage and track transport fee invoices with ease.">
        <Btn icon="copy" onClick={() => setGen(true)}>Bulk Generate</Btn>
        <Btn icon="download" onClick={exportCsv}>Export Report</Btn>
      </TrHead>

      <Tiles>
        <Tile icon="invoice" tone="blue" value={money(t.invoiced, { space: true })} label="Total Invoiced"
              delta={t.invoicedDelta} deltaNote="vs. last period" />
        <Tile icon="check" tone="green" value={money(t.paid, { space: true })} label="Paid Amount"
              sub={`${t.collectionRate || 0}% collection rate`} />
        <Tile icon="clock" tone="amber" value={money(t.pending, { space: true })} label="Pending Amount"
              sub={`${t.pendingPct || 0}% of total`} />
        <Tile icon="x" tone="red" value={money(t.overdue, { space: true })} label="Overdue Amount"
              sub={`${t.overduePct || 0}% of total`} />
        <Tile icon="doc" tone="indigo" value={count(t.generated)} label="Invoices Generated"
              sub={`${fmtDate(d.range?.from)} – ${fmtDate(d.range?.to)}`} />
      </Tiles>

      <div className="tr-grid tr-grid--chart3">
        <Card>
          <CardHead title="Invoice Collection Trend" right={<Badge tone="slate">Last 6 Months</Badge>} />
          <CardBody>
            {d.trend?.length ? (
              <StackedBars data={d.trend} height={214} rateKey="rate" rateLabel="Collection Rate" series={[
                { key: 'paid', label: 'Paid', color: '#16a34a' },
                { key: 'pending', label: 'Pending', color: '#d97706' },
                { key: 'overdue', label: 'Overdue', color: '#dc2626' },
              ]} />
            ) : <Empty icon="chart" sm title="Nothing billed yet" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Invoice Status Distribution" />
          <CardBody fill>
            {t.generated ? (
              <DonutRow>
                <div className="tr-donutwrap__chart">
                  <Donut size={150} thickness={23} total={t.generated} sub="Invoices" data={[
                    { label: 'Paid', value: d.distribution?.find((x) => x.key === 'paid')?.count, color: STATUS_INK.good },
                    { label: 'Pending', value: d.distribution?.find((x) => x.key === 'pending')?.count, color: STATUS_INK.warn },
                    { label: 'Overdue', value: d.distribution?.find((x) => x.key === 'overdue')?.count, color: STATUS_INK.bad },
                  ]} />
                </div>
                <DonutLegend right={(x) => {
                  const row = d.distribution?.find((r) => r.label === x.label);
                  return `${row?.pct || 0}% (${count(row?.count)})`;
                }} data={[
                  { label: 'Paid', value: d.distribution?.find((x) => x.key === 'paid')?.count, color: STATUS_INK.good },
                  { label: 'Pending', value: d.distribution?.find((x) => x.key === 'pending')?.count, color: STATUS_INK.warn },
                  { label: 'Overdue', value: d.distribution?.find((x) => x.key === 'overdue')?.count, color: STATUS_INK.bad },
                ]} />
              </DonutRow>
            ) : <Empty icon="chart" sm title="No invoices yet" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Top Routes by Invoice Amount" />
          <CardBody>
            {d.topRoutes?.length ? (
              <RankBars nameWidth={92} fmt={(v) => compactMoney(v)}
                        data={d.topRoutes.map((r) => ({
                          key: r._id, label: r.zone || r.name, value: r.amount, color: r.color,
                          lead: <RouteBadge route={r} sm />,
                        }))} />
            ) : <Empty icon="route" sm title="Nothing billed by route yet" />}
          </CardBody>
        </Card>
      </div>

      <Filters>
        <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search invoices by number, student name, route…" />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All Status"
                options={['paid', 'pending', 'partial', 'overdue', 'cancelled'].map((v) => ({ value: v, label: words(v) }))} />
        <Select value={route} onChange={(v) => { setRoute(v); setPage(1); }} placeholder="All Routes" options={d.filters?.routes || []} />
        <Select value={month} onChange={(v) => { setMonth(v); setPage(1); }} placeholder="All Months"
                options={(d.filters?.months || []).map((m) => ({ value: String(m.value), label: m.label }))} />
        <Btn onClick={reset}>Reset</Btn>
        <FilterEnd>
          {marked.length ? <Btn kind="soft" icon="bell" onClick={() => setRemind(true)}>Remind {marked.length}</Btn> : null}
          <Btn icon="upload" onClick={exportCsv}>Export</Btn>
        </FilterEnd>
      </Filters>

      <div className="tr-split">
        <Card>
          <CardHead title={`Invoice Records (${count(d.total)})`}
                    right={marked.length ? <Badge tone="indigo">{marked.length} selected</Badge> : null} />
          <CardBody flush>
            <TableWrap>
              <table className="tr-table">
                <thead>
                  <tr>
                    <th className="tr-table__pick">
                      <Check checked={marked.length === rows.length && rows.length > 0}
                             indeterminate={marked.length > 0 && marked.length < rows.length}
                             onChange={(v) => setMarked(v ? rows.map((r) => r._id) : [])} />
                    </th>
                    <th className="tr-table__idx">#</th>
                    <th>Invoice No.</th><th>Student Name</th><th>Route</th><th>Invoice Period</th>
                    <th className="tr-r">Amount (₹)</th><th>Status</th><th>Due Date</th><th className="tr-table__acts">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r._id}>
                      <td><Check checked={marked.includes(r._id)}
                                 onChange={(v) => setMarked((m) => (v ? [...m, r._id] : m.filter((x) => x !== r._id)))} /></td>
                      <td className="tr-table__idx">{(d.page - 1) * limit + i + 1}</td>
                      <td className="tr-num" style={{ fontWeight: 600 }}>{r.invoiceNumber}</td>
                      <td><Cell2 top={r.student?.name || '—'} sub={r.student?.classLabel} /></td>
                      <td>{r.route ? <Chip color={r.route.color}>{r.route.tag} - {r.route.zone || r.route.name}</Chip> : '—'}</td>
                      <td>{r.period?.label || '—'}</td>
                      <td className="tr-r tr-num">
                        {count(r.netAmount)}
                        {r.due > 0 && r.paidAmount > 0 ? <div style={{ fontSize: '.7rem', color: '#d97706' }}>{money(r.due)} due</div> : null}
                      </td>
                      <td><StatusBadge value={r.liveStatus} /></td>
                      <td style={{ color: r.liveStatus === 'overdue' ? '#dc2626' : undefined, fontWeight: r.liveStatus === 'overdue' ? 600 : 400 }}>
                        {fmtDate(r.dueDate)}
                      </td>
                      <td className="tr-table__acts">
                        <div>
                          <IconBtn icon="eye" label="Receipt" onClick={() => receipt(r)} />
                          {r.liveStatus !== 'paid' && r.liveStatus !== 'cancelled'
                            ? <IconBtn icon="rupee" kind="primary" label="Record payment" onClick={() => setPay(r)} /> : null}
                          <IconBtn icon="download" label="Download" onClick={() => receipt(r)} />
                          {r.liveStatus !== 'cancelled'
                            ? <IconBtn icon="close" kind="danger" label="Cancel" onClick={() => setCancel(r)} /> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {!rows.length ? (
              <Empty icon="invoice" title="No invoices here"
                     action={<Btn kind="soft" icon="copy" onClick={() => setGen(true)}>Generate this month's invoices</Btn>} />
            ) : null}
            <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="records"
                   onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
          </CardBody>
        </Card>

        <div className="tr-rail">
          <Panel title="Upcoming Due Invoices" right={<Badge tone="amber">{d.upcomingDue?.length || 0}</Badge>} flush>
            {d.upcomingDue?.length ? (
              <Rows>
                {d.upcomingDue.map((g, i) => (
                  <Row key={i} avatar={<DateChip day={g.day} month={g.month} tone="indigo" />}
                       title={`${count(g.count)} invoice${g.count === 1 ? '' : 's'}`} sub={money(g.amount, { space: true })}
                       badge={<IconBtn icon="chevronRight" kind="plain" label="Open" />} />
                ))}
              </Rows>
            ) : (
              <div style={{ padding: 16 }}>
                <Note tone="good" title="Nothing is coming due">Every invoice in this window is settled or already overdue.</Note>
              </div>
            )}
          </Panel>

          <Panel title="Quick Actions">
            <QuickActions items={[
              { icon: 'plus', label: 'Create Invoice', onClick: () => setGen(true) },
              { icon: 'copy', label: 'Bulk Generate', onClick: () => setGen(true) },
              { icon: 'send', label: 'Send Reminders', onClick: () => setRemind(true) },
              { icon: 'download', label: 'Download Report', onClick: exportCsv },
            ]} />
          </Panel>
        </div>
      </div>

      <GenerateInvoicesModal open={gen} onClose={() => setGen(false)} onSaved={() => { setGen(false); reload(); }} />
      {pay ? <PaymentModal open onClose={() => setPay(null)} invoice={pay} onSaved={() => { setPay(null); reload(); }} /> : null}
      <RemindModal open={remind} onClose={() => setRemind(false)} picked={marked}
                   onSaved={() => { setRemind(false); setMarked([]); reload(); }} />
      <Confirm open={!!cancel} onClose={() => setCancel(null)} onConfirm={doCancel} tone="danger"
               title="Cancel this invoice?" confirmLabel="Cancel invoice"
               message={`${cancel?.invoiceNumber} stops counting towards what is owed. Payments already recorded against it are kept.`} />
    </div>
  );
}
