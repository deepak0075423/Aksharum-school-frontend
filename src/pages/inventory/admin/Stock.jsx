/**
 * Inventory → Stock.
 *
 * Where the Items screen lists the master, this one lists BALANCES: a row per
 * (item, store), which is why an item held in three places is three rows here
 * and one row there.
 *
 * The six-month trend is not a guess. The stock ledger is immutable and its
 * quantities are signed, so the balance at any past date is today's balance
 * minus everything that moved since — the server reconstructs it exactly.
 */
import React, { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import {
  PageHead, YearBar, Tiles, Tile, Strip, Card, CardHead, CardBody, Filters, FilterEnd, Field,
  Search, Select, DateRange, Btn, IconBtn, SplitBtn, KebabMenu, TabStrip, DataTable, Pager,
  Badge, StatusBadge, ItemCell, Rows, Row, Empty, Loading, LoadError, ViewAll, useBoard,
  useDebounced, useInvMeta, useSort, count, money, compactMoney, fmtDate, fmtTime,
  fmtDateTime, words, toCsv, saveFile, Cell2, Who,
} from './invUI';
import { Donut, AreaTrend, ChartLegend, STATE_COLOR } from './invCharts';
import { AdjustStockForm, TransferStockForm } from './invForms';

const TREND_SERIES = [
  { key: 'in_stock', label: 'In Stock', color: STATE_COLOR.in_stock },
  { key: 'low_stock', label: 'Low Stock', color: STATE_COLOR.low_stock },
  { key: 'out_of_stock', label: 'Out of Stock', color: STATE_COLOR.out_of_stock },
];

export default function InventoryStock() {
  const { meta, activeYear } = useInvMeta(api.getFormMeta);
  // Two views of the same stock: what is there now, and how it got there.
  const [view, setView] = useState('balances');

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [state, setState] = useState('');
  const [donutWarehouse, setDonutWarehouse] = useState('');
  const [months, setMonths] = useState(6);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const { sort, dir, onSort } = useSort('updatedAt', 'desc');
  const search = useDebounced(q);

  const [adjust, setAdjust] = useState(null);
  const [transfer, setTransfer] = useState(null);

  const [mvType, setMvType] = useState('');
  const [mvDir, setMvDir] = useState('');
  const [mvRange, setMvRange] = useState({ from: '', to: '' });
  const [mvPage, setMvPage] = useState(1);
  const [mvLimit, setMvLimit] = useState(25);

  const load = useCallback(
    () => api.getStockBoard({ search, category, warehouse, state, donutWarehouse, months, sort, dir, page, limit }),
    [search, category, warehouse, state, donutWarehouse, months, sort, dir, page, limit],
  );
  const { data, loading, error, reload } = useBoard(load,
    [search, category, warehouse, state, donutWarehouse, months, sort, dir, page, limit]);

  const loadLedger = useCallback(
    () => api.getLedgerBoard({
      search, warehouse, type: mvType, direction: mvDir,
      from: mvRange.from, to: mvRange.to, page: mvPage, limit: mvLimit,
    }),
    [search, warehouse, mvType, mvDir, mvRange.from, mvRange.to, mvPage, mvLimit],
  );
  const ledger = useBoard(
    view === 'ledger' ? loadLedger : () => Promise.resolve(null),
    [view, search, warehouse, mvType, mvDir, mvRange.from, mvRange.to, mvPage, mvLimit],
  );
  const lg = ledger.data || {};

  const d = data || {};
  const rows = d.rows || [];
  const t = d.tiles || {};

  const setFilter = (fn) => (v) => { fn(v); setPage(1); };
  const reset = () => { setQ(''); setCategory(''); setWarehouse(''); setState(''); setPage(1); };
  const filtered = !!(search || category || warehouse || state);

  const exportCsv = () => {
    saveFile(`inventory-stock-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['itemCode', 'Code'], ['name', 'Item'],
      ['category', 'Category', (r) => r.category?.name || ''],
      ['warehouse', 'Warehouse', (r) => r.warehouse?.name || ''],
      ['current', 'Current Stock'], ['reserved', 'Reserved'],
      ['available', 'Available', (r) => Math.max(0, (r.current || 0) - (r.reserved || 0))],
      ['reorderLevel', 'Reorder Level'], ['unit', 'Unit'],
      ['value', 'Stock Value'], ['state', 'Status', (r) => r.state.replace(/_/g, ' ')],
      ['updatedAt', 'Last Updated', (r) => (r.updatedAt ? new Date(r.updatedAt).toISOString() : '')],
    ], rows));
    toast.success('Exported the stock rows on this page');
  };

  const ledgerCols = useMemo(() => [
    {
      key: 'at', label: 'When', nowrap: true,
      cell: (r) => <Cell2 top={fmtDate(r.at)} sub={fmtTime(r.at)} />,
    },
    {
      key: 'item', label: 'Item', primary: true,
      cell: (r) => <ItemCell image={r.item.image} icon={r.item.category?.icon || 'box'} name={r.item.name} sub={r.item.itemCode} />,
    },
    {
      key: 'label', label: 'Movement',
      cell: (r) => (
        <Badge tone={r.direction === 'in' ? 'green' : 'red'} icon={r.direction === 'in' ? 'arrowDown' : 'arrowUp'} square>
          {r.label}
        </Badge>
      ),
    },
    { key: 'warehouse', label: 'Store', cell: (r) => r.warehouse?.name || <span className="inv-dim">—</span> },
    {
      key: 'quantity', label: 'Change', align: 'num',
      cell: (r) => (
        <strong className={r.quantity < 0 ? 'inv-danger' : 'inv-strong'}>
          {r.quantity > 0 ? '+' : ''}{count(r.quantity)} {r.item.unit}
        </strong>
      ),
    },
    { key: 'balanceAfter', label: 'Balance after', align: 'num', cell: (r) => count(r.balanceAfter) },
    { key: 'value', label: 'Value (₹)', align: 'num', secondary: true, cell: (r) => (r.value ? money(r.value) : <span className="inv-dim">—</span>) },
    {
      // A movement can carry a batch, a list of serials, or neither. Both are
      // searchable, so both have to be visible — a serial you cannot see is a
      // serial you cannot check against the thing in your hand.
      key: 'batchNumber', label: 'Batch / Serials', secondary: true,
      cell: (r) => {
        const serials = r.serialNumbers || [];
        if (!r.batchNumber && !serials.length) return <span className="inv-dim">—</span>;
        return (
          <Cell2
            top={r.batchNumber ? <span className="inv-num">{r.batchNumber}</span> : <span className="inv-dim">No batch</span>}
            sub={serials.length
              ? (serials.length > 2 ? `${serials.slice(0, 2).join(', ')} +${serials.length - 2} more` : serials.join(', '))
              : ''}
          />
        );
      },
    },
    { key: 'note', label: 'Why', secondary: true, cell: (r) => <span className="inv-clamp2">{r.note || <span className="inv-dim">—</span>}</span> },
    { key: 'by', label: 'By', cell: (r) => <Who name={r.by?.name} src={r.by?.photo} id={r.by?._id} size="sm" /> },
  ], []);

  const exportLedger = () => {
    saveFile(`stock-ledger-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['at', 'When', (r) => fmtDateTime(r.at)],
      ['item', 'Item', (r) => r.item.name], ['code', 'Code', (r) => r.item.itemCode],
      ['label', 'Movement'], ['warehouse', 'Store', (r) => r.warehouse?.name || ''],
      ['quantity', 'Change'], ['balanceAfter', 'Balance after'],
      ['unitCost', 'Unit cost'], ['value', 'Value'],
      ['batchNumber', 'Batch'], ['serials', 'Serial numbers', (r) => (r.serialNumbers || []).join(' ')],
      ['note', 'Why'], ['by', 'By', (r) => r.by?.name || ''],
    ], lg.rows || []));
    toast.success('Exported the movements on this page');
  };

  const columns = useMemo(() => [
    {
      key: 'name', label: 'Item', sortable: true, primary: true,
      // The code has its own column; repeating it under the name spends width
      // the eleven-column table does not have.
      cell: (r) => <ItemCell image={r.image} icon={r.category?.icon || 'box'} name={r.name} />,
    },
    { key: 'itemCode', label: 'Code', sortable: true, nowrap: true, cell: (r) => <span className="inv-num">{r.itemCode}</span> },
    {
      key: 'category', label: 'Category', sortable: true,
      cell: (r) => (r.category ? <Badge tone="indigo" square>{r.category.name}</Badge> : <span className="inv-dim">—</span>),
    },
    { key: 'warehouse', label: 'Warehouse', sortable: true, cell: (r) => r.warehouse?.name || <span className="inv-dim">—</span> },
    {
      key: 'current', label: 'Current Stock', sortable: true, align: 'num',
      // On hand is not the same as free to issue: approving a request holds
      // stock where it is, so the held part is called out under the balance
      // rather than hidden inside it.
      cell: (r) => {
        const qty = <span className={r.current <= 0 ? 'inv-danger' : 'inv-strong'}>{count(r.current)}</span>;
        if (!(r.reserved > 0)) return qty;
        return <Cell2 top={qty} sub={`${count(Math.max(0, r.current - r.reserved))} free · ${count(r.reserved)} reserved`} />;
      },
    },
    { key: 'reorderLevel', label: 'Reorder Level', sortable: true, align: 'num', cell: (r) => count(r.reorderLevel) },
    { key: 'unit', label: 'Unit', nowrap: true },
    { key: 'value', label: 'Stock Value (₹)', sortable: true, align: 'num', cell: (r) => money(r.value) },
    { key: 'state', label: 'Status', sortable: true, cell: (r) => <StatusBadge value={r.state} noIcon /> },
    {
      key: 'updatedAt', label: 'Last Updated', sortable: true, nowrap: true,
      cell: (r) => (r.updatedAt ? <Cell2 top={fmtDate(r.updatedAt)} sub={fmtTime(r.updatedAt)} /> : <span className="inv-dim">Never</span>),
    },
  ], []);

  if (error && !data) return <div className="inv-page"><LoadError error={error} onRetry={reload} /></div>;
  if (loading && !data) return <div className="inv-page"><Loading tiles={4} cards={3} /></div>;

  return (
    <div className="inv-page">
      <YearBar year={activeYear} />

      <PageHead icon="boxes" tone="brown" title="Stock Management"
        subtitle="Monitor stock levels across all items and warehouses in real time">
        <SplitBtn
          label="Adjust Stock" icon="plus" onClick={() => setAdjust({})}
          items={[
            { label: 'Adjust stock', icon: 'sliders', onClick: () => setAdjust({}) },
            { label: 'Transfer between stores', icon: 'repeat', onClick: () => setTransfer({}) },
            { sep: true },
            { label: 'Export this page', icon: 'download', onClick: exportCsv },
          ]}
        />
      </PageHead>

      <Tiles cols={4}>
        <Tile icon="boxes" tone="green" value={count(t.inStock?.value)} label="Items in Stock"
          delta={t.inStock?.delta} deltaNote="from last month" spark={t.inStock?.series} sparkTone="green" />
        <Tile icon="alert" tone="red" value={count(t.lowStock?.value)} label="Low Stock Items"
          note="needs reordering" spark={t.lowStock?.series} sparkKind="bar" sparkTone="red"
          onClick={() => setFilter(setState)('low_stock')} />
        <Tile icon="x" tone="violet" value={count(t.outOfStock?.value)} label="Out of Stock Items"
          note={`${t.outOfStock?.pct ?? 0}% availability`} spark={t.outOfStock?.series} sparkKind="bar" sparkTone="violet"
          onClick={() => setFilter(setState)('out_of_stock')} />
        <Tile icon="warehouse" tone="sky" value={count(t.warehouses?.value)} label="Warehouses"
          note={`${count(t.warehouses?.active)} active · ${count(t.warehouses?.inactive)} inactive`}
          spark={[2, 3, 3, 4, 4, t.warehouses?.value || 0]} sparkKind="bar" sparkTone="sky" />
      </Tiles>

      <Strip cols={3}>
        <Card>
          <CardHead
            title="Stock Distribution by Category"
            right={(
              <Select value={donutWarehouse} onChange={setDonutWarehouse}
                options={d.filters?.warehouses || []} placeholder="All Warehouses"
                style={{ height: 34, fontSize: '.78rem', minWidth: 128 }} />
            )}
          />
          <CardBody>
            {d.distribution?.total ? (
              <Donut slices={d.distribution.slices} total={d.distribution.total} unit="Items"
                onPick={(s) => (s.key !== 'others' && s.key !== 'none' ? setFilter(setCategory)(s.key) : null)} />
            ) : (
              <Empty icon="chart" title="No stock to group yet" sm>
                Receive goods or adjust stock in, and the split by category appears here.
              </Empty>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead
            title="Stock Status Trend"
            right={(
              <Select value={String(months)} onChange={(v) => setMonths(Number(v))}
                options={[{ value: '3', label: 'Last 3 months' }, { value: '6', label: 'Last 6 months' }, { value: '12', label: 'Last 12 months' }]}
                style={{ height: 34, fontSize: '.78rem', minWidth: 136 }} />
            )}
          />
          <CardBody>
            <ChartLegend series={TREND_SERIES} />
            <div style={{ marginTop: 12 }}>
              <AreaTrend data={d.trend || []} series={TREND_SERIES} height={186} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Top Items by Stock Value" right={<ViewAll onClick={() => { onSort('value'); setPage(1); }} />} />
          <CardBody tight>
            {d.topValue?.length ? (
              <Rows>
                {d.topValue.map(it => (
                  <Row key={it._id} image={it.image} icon={it.category?.icon || 'box'}
                    title={it.name} sub={`${count(it.qty)} in stock`} end={money(it.value)} />
                ))}
              </Rows>
            ) : <Empty icon="rupee" title="No stock value yet" sm>Record a purchase cost and the most valuable items are listed here.</Empty>}
          </CardBody>
        </Card>
      </Strip>

      <Card>
        <TabStrip
          value={view} onChange={setView}
          items={[
            { value: 'balances', label: 'Stock Balances', icon: 'boxes', count: d.total },
            { value: 'ledger', label: 'Stock Ledger', icon: 'history', count: lg.total },
          ]}
        />

        {view === 'ledger' ? (
          <>
            <Filters inner>
              <Field grow>
                <Search value={q} onChange={(v) => { setQ(v); setMvPage(1); }}
                  placeholder="Search by item, store, batch, serial number or reason…" />
              </Field>
              <Field label="Warehouse" pick>
                <Select value={warehouse} onChange={(v) => { setWarehouse(v); setMvPage(1); }}
                  options={d.filters?.warehouses || []} placeholder="All warehouses" />
              </Field>
              <Field label="Movement" pick>
                <Select value={mvType} onChange={(v) => { setMvType(v); setMvPage(1); }}
                  options={lg.filters?.types || []} placeholder="All movements" />
              </Field>
              <Field label="Direction" pick>
                <Select value={mvDir} onChange={(v) => { setMvDir(v); setMvPage(1); }} placeholder="In and out"
                  options={[{ value: 'in', label: 'Into stock' }, { value: 'out', label: 'Out of stock' }]} />
              </Field>
              <Field label="Date Range" pick>
                <DateRange from={mvRange.from} to={mvRange.to} onChange={(r2) => { setMvRange(r2); setMvPage(1); }} />
              </Field>
              <FilterEnd>
                <Btn icon="download" onClick={exportLedger}>Export</Btn>
              </FilterEnd>
            </Filters>

            <DataTable
              className="inv-table--dense"
              columns={ledgerCols} rows={lg.rows || []} loading={ledger.loading && !lg.rows}
              empty={
                <Empty icon="history" title="No movements in this window">
                  Every receipt, issue, return, transfer and correction is recorded here as it happens — nothing is ever edited or removed.
                </Empty>
              }
            />

            <Pager page={lg.page} pages={lg.pages} total={lg.total} limit={mvLimit} noun="movements"
              onPage={setMvPage} onLimit={(n) => { setMvLimit(n); setMvPage(1); }} limits={[25, 50, 100]} />
          </>
        ) : (
        <>
        <Filters inner>
          <Field grow>
            <Search value={q} onChange={setFilter(setQ)} placeholder="Search by item name, code or category…" />
          </Field>
          <Field label="Category" pick>
            <Select value={category} onChange={setFilter(setCategory)} options={d.filters?.categories || []} placeholder="All categories" />
          </Field>
          <Field label="Warehouse" pick>
            <Select value={warehouse} onChange={setFilter(setWarehouse)} options={d.filters?.warehouses || []} placeholder="All warehouses" />
          </Field>
          <Field label="Stock Status" pick>
            <Select value={state} onChange={setFilter(setState)} placeholder="All items" options={[
              { value: 'in_stock', label: 'In Stock' }, { value: 'low_stock', label: 'Low Stock' }, { value: 'out_of_stock', label: 'Out of Stock' },
            ]} />
          </Field>
          <FilterEnd>
            <Btn kind={filtered ? 'soft' : 'ghost'} icon="filter" onClick={reset}>
              {filtered ? 'Clear filters' : 'Filters'}
            </Btn>
            <KebabMenu items={[
              { label: 'Export this page', icon: 'download', onClick: exportCsv },
              { label: 'Adjust stock', icon: 'sliders', onClick: () => setAdjust({}) },
              { label: 'Transfer stock', icon: 'repeat', onClick: () => setTransfer({}) },
            ]} />
          </FilterEnd>
        </Filters>

        <DataTable
          className="inv-table--dense"
          columns={columns} rows={rows} loading={loading && !rows.length}
          sort={sort} dir={dir} onSort={(k) => { onSort(k); setPage(1); }}
          actions={(r) => (
            <KebabMenu items={[
              { label: 'Adjust this stock', icon: 'sliders', onClick: () => setAdjust({ itemId: r.itemId, warehouseId: r.warehouseId }) },
              { label: 'Transfer to another store', icon: 'repeat', onClick: () => setTransfer({ itemId: r.itemId, warehouseId: r.warehouseId }) },
            ]} />
          )}
          empty={
            <Empty icon="boxes" title={filtered ? 'No stock matches those filters' : 'Nothing is in stock yet'}
              action={filtered
                ? <Btn icon="refresh" onClick={reset}>Clear the filters</Btn>
                : <Btn kind="primary" icon="plus" onClick={() => setAdjust({})}>Record stock in</Btn>}>
              {filtered ? 'Try another store or a different status.' : 'Receive a purchase order, or record an opening balance, and the stock appears here.'}
            </Empty>
          }
        />

        <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="items"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
        </>
        )}
      </Card>

      <AdjustStockForm open={!!adjust} preset={adjust} meta={meta} onClose={() => setAdjust(null)} onDone={reload} />
      <TransferStockForm open={!!transfer} preset={transfer} meta={meta} onClose={() => setTransfer(null)} onDone={reload} />
    </div>
  );
}
