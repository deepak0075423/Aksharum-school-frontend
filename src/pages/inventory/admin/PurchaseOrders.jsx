/**
 * Inventory → Purchase Orders.
 *
 * The six tabs are one lifecycle: pending approval → approved → in transit →
 * delivered, with cancelled off to the side. `ordered`, which is what every PO
 * raised before this redesign was stamped with, means "placed with the vendor"
 * and is counted under In Transit, so old rows still read correctly.
 */
import React, { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import {
  Hero, YearBar, Tiles, Tile, Card, TabStrip, Filters, FilterEnd, Field, Search, Select,
  DateRange, Btn, IconBtn, KebabMenu, DataTable, Pager, Badge, StatusBadge, Avatar, ThumbStack,
  Rail, Rows, Row, Facts, Fact, Block, Note, Empty, Loading, LoadError, Confirm,
  useBoard, useDebounced, useInvMeta, useSort, count, money, fmtDate, words, toCsv, saveFile, Cell2,
  openHtmlWindow,
} from './invUI';
import { OrderForm, ReceiveForm } from './invForms';
import { Art } from './invArt';

export default function InventoryPurchaseOrders() {
  const { meta, activeYear } = useInvMeta(api.getFormMeta);

  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [vendor, setVendor] = useState('');
  const [status, setStatus] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { sort, dir, onSort } = useSort('createdAt', 'desc');
  const search = useDebounced(q);

  const [form, setForm] = useState(false);
  // The order being edited, loaded in full — the board row carries only what
  // the table shows, not the lines, terms or delivery address.
  const [edit, setEdit] = useState(null);
  const [receive, setReceive] = useState(null);
  const [view, setView] = useState(null);
  const [viewTab, setViewTab] = useState('overview');
  const [cancel, setCancel] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api.getOrderBoard({ tab, search, vendor, status, from: range.from, to: range.to, sort, dir, page, limit }),
    [tab, search, vendor, status, range.from, range.to, sort, dir, page, limit],
  );
  const { data, loading, error, reload } = useBoard(load,
    [tab, search, vendor, status, range.from, range.to, sort, dir, page, limit]);

  const d = data || {};
  const rows = d.rows || [];
  const t = d.tiles || {};
  const tabs = d.tabs || {};

  const setFilter = (fn) => (v) => { fn(v); setPage(1); };
  const reset = () => { setQ(''); setVendor(''); setStatus(''); setRange({ from: '', to: '' }); setPage(1); };
  const filtered = !!(search || vendor || status || range.from || range.to);

  // The vendor's copy and the storekeeper's copy. Both open in their own tab
  // and print from there — see services/inventoryDocs on the server.
  const openEdit = async (r) => {
    try { setEdit(await api.getOrder(r._id)); }
    catch (e) { toast.error(e?.message || 'That order could not be opened'); }
  };

  const printOrder = (r) => openHtmlWindow(() => api.getOrderPrint(r._id))
    .catch((e) => toast.error(e?.message || 'That order could not be prepared for printing'));
  const printGrn = (r) => openHtmlWindow(() => api.getOrderGrn(r._id))
    .catch((e) => toast.error(e?.message || 'No goods received note could be prepared'));

  const exportCsv = () => {
    saveFile(`purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['poNumber', 'PO Number'],
      ['date', 'Date', (r) => fmtDate(r.date)],
      ['vendor', 'Vendor', (r) => r.vendor?.name || ''],
      ['itemCount', 'Items'], ['total', 'Total Amount'],
      ['expectedDelivery', 'Expected Delivery', (r) => fmtDate(r.expectedDelivery, '')],
      ['state', 'Status', (r) => words(r.state)],
    ], rows));
    toast.success('Exported the orders on this page');
  };

  const act = async (fn, r, ok) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setCancel(null);
      reload();
    } catch (e) { toast.error(e?.message || 'That could not be done'); }
    finally { setBusy(false); }
  };

  const columns = useMemo(() => [
    { key: 'poNumber', label: 'PO Number', sortable: true, nowrap: true, primary: true, cell: (r) => <span className="inv-strong inv-num">{r.poNumber}</span> },
    { key: 'date', label: 'Date', sortable: true, nowrap: true, cell: (r) => fmtDate(r.date) },
    {
      key: 'vendor', label: 'Vendor', sortable: true,
      cell: (r) => (r.vendor
        ? (
          <span className="inv-cellrow">
            <Avatar name={r.vendor.name} src={r.vendor.logo} id={r.vendor._id} size="sm" square />
            <span className="inv-trunc">{r.vendor.name}</span>
          </span>
        )
        : <span className="inv-dim">—</span>),
    },
    {
      key: 'items', label: 'Items', sortable: true,
      cell: (r) => (
        <span className="inv-cellrow">
          <span className="inv-trunc" style={{ minWidth: 52 }}>{count(r.itemCount)} items</span>
          <ThumbStack items={r.lines} />
        </span>
      ),
    },
    { key: 'total', label: 'Total Amount (₹)', sortable: true, align: 'num', cell: (r) => <span className="inv-strong">{money(r.total)}</span> },
    {
      key: 'expectedDelivery', label: 'Expected Delivery', sortable: true, nowrap: true,
      cell: (r) => (r.expectedDelivery
        ? <span className={r.late ? 'inv-danger' : undefined}>{fmtDate(r.expectedDelivery)}</span>
        : <span className="inv-dim">—</span>),
    },
    { key: 'status', label: 'Status', sortable: true, cell: (r) => <StatusBadge value={r.state} /> },
  ], []);

  if (error && !data) return <div className="inv-page"><LoadError error={error} onRetry={reload} /></div>;
  if (loading && !data) return <div className="inv-page"><Loading tiles={5} /></div>;

  return (
    <div className="inv-page">
      <YearBar year={activeYear} />

      <Hero
        icon="invoice" tone="violet" title="Purchase Orders"
        subtitle="Create, track and manage purchase orders for school supplies and equipment."
        art={<Art name="orders" />}
        promises={['Raise purchase orders for required items', 'Track approval and delivery status', 'Manage vendors and budgets']}
      >
        <Btn kind="primary" icon="plus" onClick={() => setForm(true)}>Create Purchase Order</Btn>
      </Hero>

      <Tiles cols={5}>
        <Tile icon="doc" tone="blue" value={count(t.total?.value)} label="Total POs"
          delta={t.total?.delta} deltaNote="from last month" spark={t.total?.series} sparkTone="violet" />
        <Tile icon="clock" tone="amber" value={count(t.pending?.value)} label="Pending Approval"
          spark={t.pending?.series} sparkTone="amber" onClick={() => setTab('pending')} />
        <Tile icon="check" tone="green" value={count(t.approved?.value)} label="Approved"
          spark={t.approved?.series} sparkTone="green" onClick={() => setTab('approved')} />
        <Tile icon="truck" tone="sky" value={count(t.transit?.value)} label="In Transit"
          spark={t.transit?.series} sparkTone="sky" onClick={() => setTab('transit')} />
        <Tile icon="package" tone="rose" value={count(t.delivered?.value)} label="Delivered"
          spark={t.delivered?.series} sparkTone="rose" onClick={() => setTab('delivered')} />
      </Tiles>

      <Card>
        <TabStrip
          value={tab} onChange={(v) => { setTab(v); setPage(1); }}
          items={[
            { value: 'all', label: 'All POs', count: tabs.all },
            { value: 'pending', label: 'Pending Approval', count: tabs.pending },
            { value: 'approved', label: 'Approved', count: tabs.approved },
            { value: 'transit', label: 'In Transit', count: tabs.transit },
            { value: 'delivered', label: 'Delivered', count: tabs.delivered },
            { value: 'cancelled', label: 'Cancelled', count: tabs.cancelled },
          ]}
        />

        <Filters inner>
          <Field grow>
            <Search value={q} onChange={setFilter(setQ)} placeholder="Search by PO number, vendor, item or purpose…" />
          </Field>
          <Field label="Vendor" pick>
            <Select value={vendor} onChange={setFilter(setVendor)} options={d.filters?.vendors || []} placeholder="All vendors" />
          </Field>
          <Field label="Status" pick>
            <Select value={status} onChange={setFilter(setStatus)} placeholder="All statuses" options={[
              { value: 'pending_approval', label: 'Pending Approval' }, { value: 'approved', label: 'Approved' },
              { value: 'in_transit', label: 'In Transit' }, { value: 'partially_received', label: 'Partly Delivered' },
              { value: 'delivered', label: 'Delivered' }, { value: 'cancelled', label: 'Cancelled' },
            ]} />
          </Field>
          <Field label="Date Range" pick>
            <DateRange from={range.from} to={range.to} onChange={(r) => { setRange(r); setPage(1); }} />
          </Field>
          <FilterEnd>
            <Btn kind={filtered ? 'soft' : 'ghost'} icon="filter" onClick={reset}>{filtered ? 'Clear filters' : 'Filters'}</Btn>
            <KebabMenu items={[
              { label: 'Export this page', icon: 'download', onClick: exportCsv },
              { label: 'Create purchase order', icon: 'plus', onClick: () => setForm(true) },
            ]} />
          </FilterEnd>
        </Filters>

        <DataTable
          columns={columns} rows={rows} loading={loading && !rows.length}
          sort={sort} dir={dir} onSort={(k) => { onSort(k); setPage(1); }}
          actions={(r) => (
            <>
              <IconBtn icon="eye" label="View order" onClick={() => { setView(r); setViewTab('overview'); }} />
              {r.state === 'pending_approval'
                ? <IconBtn icon="check" kind="primary" label="Approve"
                    onClick={() => act(() => api.approveOrder(r._id), r, `${r.poNumber} approved`)} />
                : <IconBtn icon="package" kind="primary" label="Receive goods"
                    disabled={!['approved', 'in_transit', 'partially_received'].includes(r.state)}
                    onClick={() => setReceive(r)} />}
              <KebabMenu items={[
                { label: 'Approve', icon: 'checkCircle', disabled: r.state !== 'pending_approval', onClick: () => act(() => api.approveOrder(r._id), r, `${r.poNumber} approved`) },
                { label: 'Mark as dispatched', icon: 'truck', disabled: r.state !== 'approved', onClick: () => act(() => api.dispatchOrder(r._id, {}), r, `${r.poNumber} is in transit`) },
                { label: 'Receive goods', icon: 'package', disabled: !['approved', 'in_transit', 'partially_received'].includes(r.state), onClick: () => setReceive(r) },
                { sep: true },
                { label: 'Edit order', icon: 'edit',
                  disabled: !['draft', 'pending_approval'].includes(r.state), onClick: () => openEdit(r) },
                { label: 'Print order', icon: 'printer', onClick: () => printOrder(r) },
                { label: 'Print goods received note', icon: 'fileDoc',
                  disabled: !['partially_received', 'received'].includes(r.state), onClick: () => printGrn(r) },
                { sep: true },
                { label: 'Cancel order', icon: 'closeCircle', danger: true, disabled: ['delivered', 'cancelled'].includes(r.state), onClick: () => setCancel(r) },
              ]} />
            </>
          )}
          empty={
            <Empty icon="invoice" title={filtered || tab !== 'all' ? 'No orders match' : 'No purchase orders yet'}
              action={filtered || tab !== 'all'
                ? <Btn icon="refresh" onClick={() => { reset(); setTab('all'); }}>Clear the filters</Btn>
                : <Btn kind="primary" icon="plus" onClick={() => setForm(true)}>Create the first order</Btn>}>
              {filtered || tab !== 'all' ? 'Try another tab, vendor or date range.' : 'An order is raised as pending approval; nothing is committed to the vendor until someone approves it.'}
            </Empty>
          }
        />

        <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="purchase orders"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} limits={[10, 25, 50]} />
      </Card>

      <OrderForm open={form} meta={meta} onClose={() => setForm(false)} onDone={reload} />
      <OrderForm open={!!edit} order={edit} meta={meta} onClose={() => setEdit(null)} onDone={reload} />
      <ReceiveForm open={!!receive} order={receive} onClose={() => setReceive(null)} onDone={reload} />
      <Confirm
        open={!!cancel} onClose={() => setCancel(null)} tone="danger" busy={busy}
        confirmLabel="Cancel order" title={cancel ? `Cancel ${cancel.poNumber}?` : ''}
        message={cancel ? `The order will be marked cancelled and the ${money(cancel.total)} it reserved goes back to ${cancel.department?.name || 'the department'}'s allowance. Goods already received stay in stock.` : ''}
        onConfirm={() => act(() => api.cancelOrder(cancel._id), cancel, `${cancel.poNumber} cancelled`)}
      />

      {view ? (
        <Rail
          icon="invoice" iconTone="violet"
          title={view.poNumber}
          sub={`${view.vendor?.name || 'No vendor'} · raised ${fmtDate(view.date)}`}
          badge={<StatusBadge value={view.state} />}
          onClose={() => setView(null)}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'items', label: 'Items', count: view.itemCount },
            { value: 'money', label: 'Totals' },
          ]}
          tab={viewTab} onTab={setViewTab}
          foot={
            view.state === 'pending_approval' ? (
              <Btn kind="primary" icon="checkCircle"
                onClick={() => { act(() => api.approveOrder(view._id), view, `${view.poNumber} approved`); setView(null); }}>
                Approve order
              </Btn>
            ) : ['approved', 'in_transit', 'partially_received'].includes(view.state) ? (
              <Btn kind="primary" icon="package" onClick={() => { setReceive(view); setView(null); }}>Receive goods</Btn>
            ) : null
          }
        >
          {viewTab === 'overview' ? (
            <>
              <Block title="Order">
                <Facts>
                  <Fact k="Vendor" v={view.vendor?.name} />
                  <Fact k="Department" v={view.department?.name} />
                  <Fact k="Receiving store" v={view.warehouse?.name} />
                  <Fact k="Raised" v={fmtDate(view.date)} />
                  <Fact k="Expected delivery" v={view.expectedDelivery ? fmtDate(view.expectedDelivery) : '—'} />
                  <Fact k="Approved" v={view.approvedAt ? fmtDate(view.approvedAt) : 'Not yet'} />
                  <Fact k="Received" v={view.receivedAt ? fmtDate(view.receivedAt) : 'Not yet'} />
                </Facts>
              </Block>
              {view.late ? (
                <Block>
                  <Note tone="warn" title="Past its expected delivery date">
                    It was due {fmtDate(view.expectedDelivery)} and nothing has been received against it yet.
                  </Note>
                </Block>
              ) : null}
              {view.terms ? (
                <Block title="Terms">
                  <p style={{ margin: 0, color: 'var(--inv-ink-2)', lineHeight: 1.6, fontSize: '.86rem' }}>{view.terms}</p>
                </Block>
              ) : null}
            </>
          ) : null}

          {viewTab === 'items' ? (
            <Block title={`Items (${count(view.itemCount)})`}>
              <Rows>
                {view.lines.map((l, i) => (
                  <Row key={i} image={l.image} icon={l.icon} title={l.name}
                    sub={`${count(l.quantity)} ${l.unit} at ${money(l.unitPrice, { dec: 2 })}${l.gst ? ` + ${l.gst}% GST` : ''}`}
                    end={money(l.quantity * l.unitPrice * (1 + l.gst / 100))}
                    endSub={l.receivedQty ? `${count(l.receivedQty)} received` : 'Nothing received'} />
                ))}
              </Rows>
            </Block>
          ) : null}

          {viewTab === 'money' ? (
            <Block title="Totals">
              <Facts>
                <Fact k="Sub total" v={money(view.subTotal, { dec: 2 })} />
                <Fact k="GST" v={money(view.taxTotal, { dec: 2 })} />
                {view.discount ? <Fact k="Discount" v={`−${money(view.discount, { dec: 2 })}`} /> : null}
                <Fact k="Grand total" v={<strong>{money(view.total, { dec: 2 })}</strong>} />
                {view.invoice?.number ? <Fact k="Invoice" v={`${view.invoice.number} · ${money(view.invoice.amount)}`} /> : null}
              </Facts>
            </Block>
          ) : null}
        </Rail>
      ) : null}
    </div>
  );
}
