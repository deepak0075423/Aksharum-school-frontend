/**
 * Inventory → Requests.
 *
 * What staff have asked for, and where each ask has got to. The five tabs are
 * the request lifecycle, counted on the server so a tab's number and its
 * contents cannot disagree; `cancelled` and `fulfilled_from_stock` are real
 * outcomes with no tab of their own and appear under All.
 */
import React, { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import {
  Hero, YearBar, Tiles, Tile, Card, TabStrip, Filters, FilterEnd, Field, Search, Select,
  DateRange, Btn, IconBtn, KebabMenu, DataTable, Pager, Badge, StatusBadge, ItemCell, Who,
  Rail, Rows, Row, Facts, Fact, Empty, Loading, LoadError, useBoard, useDebounced, useInvMeta,
  useSort, count, money, fmtDate, fmtDateTime, words, toCsv, saveFile, Cell2, Note, Block,
} from './invUI';
import { RequestForm, RequestActionForm } from './invForms';
import { Art } from './invArt';

const PRIORITY_TONE = { urgent: 'red', high: 'orange', normal: 'slate', low: 'slate' };

export default function InventoryRequests() {
  const { meta, activeYear } = useInvMeta(api.getFormMeta);

  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { sort, dir, onSort } = useSort('createdAt', 'desc');
  const search = useDebounced(q);

  const [form, setForm] = useState(false);
  const [act, setAct] = useState(null);          // { request, action }
  const [view, setView] = useState(null);
  const [viewTab, setViewTab] = useState('overview');

  const load = useCallback(
    () => api.getRequestBoard({ tab, search, department, status, from: range.from, to: range.to, sort, dir, page, limit }),
    [tab, search, department, status, range.from, range.to, sort, dir, page, limit],
  );
  const { data, loading, error, reload } = useBoard(load,
    [tab, search, department, status, range.from, range.to, sort, dir, page, limit]);

  const d = data || {};
  const rows = d.rows || [];
  const t = d.tiles || {};
  const tabs = d.tabs || {};

  const setFilter = (fn) => (v) => { fn(v); setPage(1); };
  const reset = () => { setQ(''); setDepartment(''); setStatus(''); setRange({ from: '', to: '' }); setPage(1); };
  const filtered = !!(search || department || status || range.from || range.to);

  const exportCsv = () => {
    saveFile(`inventory-requests-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['requestNumber', 'Request No.'],
      ['date', 'Date', (r) => fmtDate(r.date)],
      ['items', 'Items', (r) => r.lines.map(l => `${l.name} ×${l.quantity}`).join('; ')],
      ['department', 'Department', (r) => r.department?.name || ''],
      ['requestedBy', 'Requested By', (r) => r.requestedBy?.name || ''],
      ['totalQty', 'Quantity'], ['purpose', 'Purpose'],
      ['status', 'Status', (r) => words(r.status)],
      ['estimatedTotal', 'Estimated Total'],
    ], rows));
    toast.success('Exported the requests on this page');
  };

  const fulfil = async (r) => {
    try {
      await api.fulfilRequest(r._id);
      toast.success(`${r.requestNumber} fulfilled from stock`);
      reload();
    } catch (e) { toast.error(e?.message || 'That request could not be fulfilled from stock'); }
  };

  const columns = useMemo(() => [
    { key: 'requestNumber', label: 'Request No.', sortable: true, nowrap: true, cell: (r) => <span className="inv-strong inv-num">{r.requestNumber}</span> },
    { key: 'date', label: 'Date', sortable: true, nowrap: true, cell: (r) => fmtDate(r.date) },
    {
      key: 'lines', label: 'Item(s)', primary: true,
      cell: (r) => (r.lines.length
        ? (
          <ItemCell
            image={r.lines[0].image} icon={r.lines[0].category?.icon || 'box'}
            name={r.lines[0].name}
            sub={r.lines.length > 1 ? `${r.lines[0].itemCode || ''} +${r.lines.length - 1} more`.trim() : r.lines[0].itemCode}
          />
        )
        : <span className="inv-dim">No items</span>),
    },
    {
      key: 'department', label: 'Department', sortable: true,
      cell: (r) => (r.department ? <Badge tone="teal" square>{r.department.name}</Badge> : <span className="inv-dim">—</span>),
    },
    {
      key: 'requestedBy', label: 'Requested By', sortable: true,
      cell: (r) => <Who name={r.requestedBy?.name} sub={words(r.requestedBy?.role === 'school_admin' ? 'admin staff' : r.requestedBy?.role)} src={r.requestedBy?.photo} id={r.requestedBy?._id} size="sm" />,
    },
    {
      key: 'quantity', label: 'Quantity', sortable: true, align: 'num',
      cell: (r) => <Cell2 top={count(r.totalQty)} sub={r.unit || (r.lines.length > 1 ? `${r.lines.length} lines` : '')} />,
    },
    { key: 'purpose', label: 'Purpose', cell: (r) => <span className="inv-clamp2">{r.purpose || <span className="inv-dim">—</span>}</span> },
    { key: 'status', label: 'Status', sortable: true, cell: (r) => <StatusBadge value={r.status} /> },
  ], []);

  if (error && !data) return <div className="inv-page"><LoadError error={error} onRetry={reload} /></div>;
  if (loading && !data) return <div className="inv-page"><Loading tiles={5} /></div>;

  return (
    <div className="inv-page">
      <YearBar year={activeYear} />

      <Hero
        icon="request" tone="blue" title="Inventory Requests"
        subtitle="Track, approve and manage item requests from different departments."
        art={<Art name="requests" />}
        promises={['Manage requests from staff and teachers', 'Approve or reject with stock validation', 'Convert approved requests to purchase orders']}
      >
        <Btn kind="primary" icon="plus" onClick={() => setForm(true)}>New Request</Btn>
      </Hero>

      <Tiles cols={5}>
        <Tile icon="doc" tone="blue" value={count(t.total?.value)} label="Total Requests"
          delta={t.total?.delta} deltaNote="from last month" spark={t.total?.series} sparkTone="blue" />
        <Tile icon="clock" tone="amber" value={count(t.pending?.value)} label="Pending Approval"
          spark={t.pending?.series} sparkTone="amber" onClick={() => setTab('pending')} />
        <Tile icon="check" tone="green" value={count(t.approved?.value)} label="Approved"
          spark={t.approved?.series} sparkTone="green" onClick={() => setTab('approved')} />
        <Tile icon="x" tone="red" value={count(t.rejected?.value)} label="Rejected"
          spark={t.rejected?.series} sparkTone="red" onClick={() => setTab('rejected')} />
        <Tile icon="truck" tone="violet" value={count(t.converted?.value)} label="Converted to PO"
          spark={t.converted?.series} sparkTone="violet" onClick={() => setTab('converted')} />
      </Tiles>

      <Card>
        <TabStrip
          value={tab} onChange={(v) => { setTab(v); setPage(1); }}
          items={[
            { value: 'all', label: 'All Requests', count: tabs.all },
            { value: 'pending', label: 'Pending', count: tabs.pending },
            { value: 'approved', label: 'Approved', count: tabs.approved },
            { value: 'rejected', label: 'Rejected', count: tabs.rejected },
            { value: 'converted', label: 'Converted to PO', count: tabs.converted },
          ]}
        />

        <Filters inner>
          <Field grow>
            <Search value={q} onChange={setFilter(setQ)} placeholder="Search by request no., item name, requester…" />
          </Field>
          <Field label="Department" pick>
            <Select value={department} onChange={setFilter(setDepartment)} options={d.filters?.departments || []} placeholder="All departments" />
          </Field>
          <Field label="Status" pick>
            <Select value={status} onChange={setFilter(setStatus)} placeholder="All statuses" options={[
              { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' }, { value: 'converted', label: 'Converted to PO' },
              { value: 'fulfilled_from_stock', label: 'Fulfilled from stock' }, { value: 'cancelled', label: 'Cancelled' },
            ]} />
          </Field>
          <Field label="Date Range" pick>
            <DateRange from={range.from} to={range.to} onChange={(r) => { setRange(r); setPage(1); }} />
          </Field>
          <FilterEnd>
            <Btn kind={filtered ? 'soft' : 'ghost'} icon="filter" onClick={reset}>{filtered ? 'Clear filters' : 'Filters'}</Btn>
            <KebabMenu items={[
              { label: 'Export this page', icon: 'download', onClick: exportCsv },
              { label: 'New request', icon: 'plus', onClick: () => setForm(true) },
            ]} />
          </FilterEnd>
        </Filters>

        <DataTable
          columns={columns} rows={rows} loading={loading && !rows.length}
          sort={sort} dir={dir} onSort={(k) => { onSort(k); setPage(1); }}
          actions={(r) => (
            <>
              <IconBtn icon="eye" label="View request" onClick={() => { setView(r); setViewTab('overview'); }} />
              <IconBtn icon="check" kind="primary" label="Approve" disabled={r.status !== 'pending'}
                onClick={() => setAct({ request: r, action: 'approved' })} />
              <KebabMenu items={[
                { label: 'Approve', icon: 'checkCircle', disabled: r.status !== 'pending', onClick: () => setAct({ request: r, action: 'approved' }) },
                { label: 'Reject', icon: 'closeCircle', disabled: r.status !== 'pending', onClick: () => setAct({ request: r, action: 'rejected' }) },
                { label: 'Put on hold', icon: 'clock', disabled: r.status !== 'pending', onClick: () => setAct({ request: r, action: 'hold' }) },
                { sep: true },
                { label: 'Fulfil from stock', icon: 'package', disabled: r.status !== 'approved', onClick: () => fulfil(r) },
                { label: 'Raise a purchase order', icon: 'fileDoc', disabled: r.status !== 'approved', to: '/admin/inventory/orders' },
              ]} />
            </>
          )}
          empty={
            <Empty icon="request" title={filtered || tab !== 'all' ? 'No requests match' : 'No requests yet'}
              action={filtered || tab !== 'all'
                ? <Btn icon="refresh" onClick={() => { reset(); setTab('all'); }}>Clear the filters</Btn>
                : <Btn kind="primary" icon="plus" onClick={() => setForm(true)}>Raise the first request</Btn>}>
              {filtered || tab !== 'all' ? 'Try another tab or a wider date range.' : 'Teachers and staff raise requests from their own portal; you can also raise one on their behalf.'}
            </Empty>
          }
        />

        <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="requests"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} limits={[10, 25, 50]} />
      </Card>

      <RequestForm open={form} meta={meta} onClose={() => setForm(false)} onDone={reload} />
      <RequestActionForm open={!!act} request={act?.request} action={act?.action}
        onClose={() => setAct(null)} onDone={reload} />

      {/* The whole request, in the module's own drawer — the same panel the
          master screens use, not a dialog of its own. */}
      {view ? (
        <Rail
          icon="request" iconTone="blue"
          title={view.requestNumber}
          sub={`Raised ${fmtDate(view.date)} by ${view.requestedBy?.name || 'unknown'}`}
          badge={<StatusBadge value={view.status} />}
          onClose={() => setView(null)}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'items', label: 'Items', count: view.lines.length },
            { value: 'trail', label: 'Approvals', count: view.approvals?.length },
          ]}
          tab={viewTab} onTab={setViewTab}
          foot={view.status === 'pending' ? (
            <>
              <Btn icon="closeCircle" onClick={() => { setAct({ request: view, action: 'rejected' }); setView(null); }}>Reject</Btn>
              <Btn kind="primary" icon="checkCircle" onClick={() => { setAct({ request: view, action: 'approved' }); setView(null); }}>Approve</Btn>
            </>
          ) : view.status === 'approved' ? (
            <Btn kind="primary" icon="package" onClick={() => { fulfil(view); setView(null); }}>Fulfil from stock</Btn>
          ) : null}
        >
          {viewTab === 'overview' ? (
            <>
              <Block title="Request">
                <Facts>
                  <Fact k="Department" v={view.department?.name} />
                  <Fact k="Requested by" v={view.requestedBy?.name} />
                  <Fact k="Priority" v={<Badge tone={PRIORITY_TONE[view.priority] || 'slate'}>{words(view.priority)}</Badge>} />
                  <Fact k="Raised" v={fmtDate(view.date)} />
                  <Fact k="Estimated total" v={money(view.estimatedTotal)} />
                  <Fact k="Purpose" v={view.purpose} />
                </Facts>
              </Block>
              {view.checks?.stockAvailable ? (
                <Block>
                  <Note tone="warn" title="These items are already in stock">
                    Fulfilling from stock avoids a purchase and takes the units straight out of the store.
                  </Note>
                </Block>
              ) : null}
              {view.purchaseOrder ? (
                <Block>
                  <Note tone="ok" title="Converted to a purchase order">
                    This request has been turned into an order; it is tracked on the Purchase Orders screen from here.
                  </Note>
                </Block>
              ) : null}
            </>
          ) : null}

          {viewTab === 'items' ? (
            <Block title={`Items (${count(view.lines.length)})`}>
              <Rows>
                {view.lines.map((l, i) => (
                  <Row key={i} image={l.image} icon={l.category?.icon || 'box'} title={l.name}
                    sub={[l.itemCode, l.category?.name].filter(Boolean).join(' · ')}
                    end={`${count(l.quantity)} ${l.unit}`}
                    endSub={l.estimatedPrice ? money(l.quantity * l.estimatedPrice) : null} />
                ))}
              </Rows>
            </Block>
          ) : null}

          {viewTab === 'trail' ? (
            <Block title="Approval trail">
              {view.approvals?.length ? (
                <Rows>
                  {view.approvals.map((a, i) => (
                    <Row key={i} icon={a.action === 'approved' ? 'check' : a.action === 'rejected' ? 'x' : 'clock'}
                      iconTone={a.action === 'approved' ? 'green' : a.action === 'rejected' ? 'red' : 'amber'}
                      title={a.stage} sub={a.comment || words(a.action)}
                      endSub={a.actedAt ? fmtDateTime(a.actedAt) : 'Waiting'} />
                  ))}
                </Rows>
              ) : <Empty icon="clock" title="Nobody has acted yet" sm>The first approval step will appear here.</Empty>}
            </Block>
          ) : null}
        </Rail>
      ) : null}
    </div>
  );
}
