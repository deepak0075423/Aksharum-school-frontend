/**
 * Transport → Requests.
 *
 * The Student column works for the first time here: `TransportRequest.student`
 * was declared as a StudentProfile ref while the portal wrote a User id, so
 * every name resolved to nothing. The model now says User.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search,
  Filters, TableWrap, Cell2, Who, Badge, StatusBadge, Chip, Pager, Rows, Row, QuickActions, HelpCard,
  Loading, Empty, Note, Confirm, Bar, count, fmtDate, ago, words, useBoard, useDebounced, toCsv, saveFile,
} from './trUI';
import { Donut, DonutLegend, DonutRow, LineChart, toSlices, STATUS_INK } from './trCharts';
import { NewRequestModal } from './trForms';

const RANGES = [
  { value: '7', label: 'Last 7 Days' }, { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' }, { value: '365', label: 'Last 12 Months' },
];

export default function TransportRequests() {
  const [days, setDays] = useState('30');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [route, setRoute] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [form, setForm] = useState(false);
  const [act, setAct] = useState(null);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(
    () => api.getRequestBoard({ days, search, type, status, route, page, limit }),
    [days, search, type, status, route, page, limit],
  );
  const d = data || {};
  const t = d.tiles || {};
  const rows = d.data || [];

  const reset = () => { setQ(''); setType(''); setStatus(''); setRoute(''); setPage(1); };
  const exportCsv = () => {
    saveFile(`transport-requests-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['requestCode', 'Request ID'], ['student', 'Student', (r) => r.student?.name || ''],
      ['typeLabel', 'Type'], ['detailText', 'Details'],
      ['createdAt', 'Request Date', (r) => fmtDate(r.createdAt)],
      ['status', 'Status'], ['reviewNote', 'Review note'],
    ], rows));
    toast.success('Exported the requests on this page');
  };
  const decide = async (row, action) => {
    try {
      await api.actOnRequest(row._id, { action });
      toast.success(`Request ${action}d`);
      setAct(null); reload();
    } catch (e) { toast.error(e?.message || 'Could not do that'); setAct(null); }
  };
  const flag = async (row) => {
    try { await api.flagRequest(row._id, { requiresAction: !row.requiresAction }); reload(); }
    catch (e) { toast.error(e?.message || 'Could not flag it'); }
  };

  if (loading && !data) return <div className="tr-page"><Loading /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load requests">{error}</Note></div>;

  const summary = [
    { key: 'approved', label: 'Approved', value: t.approvedPct, color: STATUS_INK.good },
    { key: 'pending', label: 'Pending', value: t.pendingPct, color: STATUS_INK.warn },
    { key: 'rejected', label: 'Rejected', value: t.rejectedPct, color: STATUS_INK.bad },
    { key: 'action', label: 'Requires Action', value: t.total ? Math.round((t.requiresAction / t.total) * 100) : 0, color: STATUS_INK.info },
  ];

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={`${fmtDate(d.range?.from)} – ${fmtDate(d.range?.to)}`} icon="calendar" />
        <Btn kind="primary" icon="plus" onClick={() => setForm(true)}>New Request</Btn>
      </TopBar>

      <TrHead icon="request" iconTone="indigo" title="Transport Requests"
              subtitle="Manage pickup/drop changes, leave requests, special trips and other transport service requests.">
        <Btn icon="download" onClick={exportCsv}>Export Report</Btn>
      </TrHead>

      <Tiles>
        <Tile icon="doc" tone="indigo" value={count(t.total)} label="Total Requests"
              delta={t.totalDelta} deltaNote="vs. last period" />
        <Tile icon="check" tone="green" value={count(t.approved)} label="Approved" sub={`${t.approvedPct || 0}% of total`} />
        <Tile icon="clock" tone="amber" value={count(t.pending)} label="Pending" sub={`${t.pendingPct || 0}% of total`} />
        <Tile icon="x" tone="red" value={count(t.rejected)} label="Rejected" sub={`${t.rejectedPct || 0}% of total`} />
        <Tile icon="driver" tone="blue" value={count(t.requiresAction)} label="Requires Action"
              sub={t.requiresAction ? 'Waiting on the school' : 'Nothing is blocked'} />
      </Tiles>

      <div className="tr-grid tr-grid--chart3">
        <Card>
          <CardHead title="Requests Trend"
                    right={<Select value={days} onChange={(v) => { setDays(v); setPage(1); }} options={RANGES} width={150} />} />
          <CardBody>
            {d.trend?.length ? (
              <>
                <LineChart data={d.trend} height={196} fmt={count} series={[
                  { key: 'approved', label: 'Approved', color: '#16a34a' },
                  { key: 'pending', label: 'Pending', color: '#d97706' },
                  { key: 'rejected', label: 'Rejected', color: '#dc2626' },
                  { key: 'total', label: 'Total', color: '#7c3aed' },
                ]} />
                <div className="tr-legend" style={{ marginTop: 10 }}>
                  <span><i style={{ background: '#16a34a' }} />Approved</span>
                  <span><i style={{ background: '#d97706' }} />Pending</span>
                  <span><i style={{ background: '#dc2626' }} />Rejected</span>
                  <span><i style={{ background: '#7c3aed' }} />Total</span>
                </div>
              </>
            ) : <Empty icon="chart" sm title="Nothing to chart" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Requests by Type" />
          <CardBody fill>
            {d.types?.length ? (
              <DonutRow>
                <div className="tr-donutwrap__chart">
                  <Donut size={150} thickness={23} total={t.total} sub="Requests" data={toSlices(d.types)} />
                </div>
                <DonutLegend data={toSlices(d.types)}
                             right={(x) => {
                               const row = d.types.find((r) => r.label === x.label);
                               return `${row?.pct || 0}% (${row?.count || 0})`;
                             }} />
              </DonutRow>
            ) : <Empty icon="chart" sm title="Nothing to break down" />}
          </CardBody>
        </Card>

        <div className="tr-rail">
          <Panel title="Quick Actions">
            <QuickActions items={[
              { icon: 'plus', label: 'New Request', onClick: () => setForm(true) },
              { icon: 'history', label: 'Request History', onClick: () => { setStatus(''); setPage(1); } },
              { icon: 'download', label: 'Download Form', onClick: exportCsv },
              { icon: 'book', label: 'Request Guidelines', to: '/admin/transport/settings' },
            ]} />
          </Panel>
          <HelpCard title="Need Help?"
                    action={<Btn size="sm" kind="soft" as="a" href="/admin/transport/settings">View Guidelines →</Btn>}>
            <p>Check our transport request guidelines for faster approval.</p>
          </HelpCard>
        </div>
      </div>

      <Filters>
        <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by request ID, student name, type, or route…" />
        <Select value={type} onChange={(v) => { setType(v); setPage(1); }} placeholder="All Request Types" options={d.filters?.types || []} />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All Status"
                options={['pending', 'approved', 'rejected', 'cancelled'].map((v) => ({ value: v, label: words(v) }))} />
        <Select value={route} onChange={(v) => { setRoute(v); setPage(1); }} placeholder="All Routes" options={d.filters?.routes || []} />
        <Btn onClick={reset}>Reset</Btn>
      </Filters>

      <div className="tr-split">
        <Card>
          <CardHead title={`Request Records (${count(d.total)})`}
                    right={<Btn size="sm" icon="upload" onClick={exportCsv}>Export</Btn>} />
          <CardBody flush>
            <TableWrap>
              <table className="tr-table">
                <thead>
                  <tr>
                    <th className="tr-table__idx">#</th>
                    <th>Request ID</th><th>Student Name</th><th>Type</th><th>Details</th>
                    <th>Request Date</th><th>Status</th><th className="tr-table__acts">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r._id}>
                      <td className="tr-table__idx">{(d.page - 1) * limit + i + 1}</td>
                      <td className="tr-num" style={{ fontWeight: 600 }}>
                        {r.requestCode}
                        {r.requiresAction ? <div><Badge tone="blue">Action needed</Badge></div> : null}
                      </td>
                      <td><Cell2 top={r.student?.name || '—'} sub={r.student?.classLabel} /></td>
                      <td><Badge tone={r.tone} square>{r.typeLabel}</Badge></td>
                      <td style={{ maxWidth: 230 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.detailText}>{r.detailText}</div>
                      </td>
                      <td>{fmtDate(r.createdAt)}</td>
                      <td><StatusBadge value={r.status} /></td>
                      <td className="tr-table__acts">
                        <div>
                          {r.status === 'pending' ? (
                            <>
                              <IconBtn icon="checkCircle" kind="primary" label="Approve" onClick={() => setAct({ row: r, action: 'approve' })} />
                              <IconBtn icon="closeCircle" kind="danger" label="Reject" onClick={() => setAct({ row: r, action: 'reject' })} />
                              <IconBtn icon={r.requiresAction ? 'bellOff' : 'bell'}
                                       label={r.requiresAction ? 'Clear the flag' : 'Flag as needing action'}
                                       onClick={() => flag(r)} />
                            </>
                          ) : (
                            <IconBtn icon="eye" label="View" onClick={() => toast(r.reviewNote || `${words(r.status)} on ${fmtDate(r.reviewedAt)}`)} />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {!rows.length ? <Empty icon="request" title="No requests here">Nothing has been raised in this window.</Empty> : null}
            <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="records"
                   onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
          </CardBody>
        </Card>

        <div className="tr-rail">
          <Panel title="Recent Requests" flush>
            {d.recent?.length ? (
              <Rows>
                {d.recent.map((r) => (
                  <Row key={r._id} icon="request" iconTone={r.tone === 'slate' ? 'slate' : r.tone}
                       title={r.requestCode} sub={`${r.student?.name || ''} · ${r.typeLabel}`}
                       badge={<StatusBadge value={r.status} />} endSub={ago(r.createdAt)} />
                ))}
              </Rows>
            ) : <Empty icon="request" sm title="Nothing raised recently" />}
          </Panel>

          <Panel title="Request Status Summary">
            <div style={{ display: 'grid', gap: 12 }}>
              {summary.map((s) => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '.8rem' }}>
                  <span style={{ flex: '0 0 104px', color: 'var(--tr-ink-2)' }}>{s.label}</span>
                  <span className="tr-bar" style={{ flex: '1 1 auto' }}><i style={{ width: `${s.value || 0}%`, background: s.color }} /></span>
                  <b style={{ minWidth: 34, textAlign: 'right' }}>{s.value || 0}%</b>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <NewRequestModal open={form} onClose={() => setForm(false)} onSaved={() => { setForm(false); reload(); }} />
      <Confirm open={!!act} onClose={() => setAct(null)} onConfirm={() => decide(act.row, act.action)}
               tone={act?.action === 'reject' ? 'danger' : 'primary'}
               title={act?.action === 'reject' ? 'Reject this request?' : 'Approve this request?'}
               confirmLabel={act?.action === 'reject' ? 'Reject' : 'Approve'}
               message={act?.action === 'reject'
                 ? `${act?.row?.student?.name || 'The family'} is told it was turned down. Nothing about their transport changes.`
                 : `${act?.row?.detailText || 'The change'} is applied to ${act?.row?.student?.name || 'the student'}'s assignment straight away, and the family is told.`} />
    </div>
  );
}
