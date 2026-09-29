/**
 * Inventory → Items.
 *
 * The item MASTER: one row per thing the school buys, with its live stock
 * beside it. The five figures above the table and the Status column are the
 * same five buckets the dashboard donut draws, computed once on the server —
 * an item is low, out, under repair, tracked or not, and never two of those.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import * as api from '../../../api/inventory.api';
import {
  Hero, YearBar, Tiles, Tile, Card, Filters, FilterEnd, Field, Search, Select, Btn, IconBtn,
  KebabMenu, MenuBtn, TableBar, DataTable, Pager, Badge, StatusBadge, ItemCell, Empty, Loading, LoadError,
  Confirm, Rail, Rows, Row, Block, Facts, Fact, Minis, Mini, SkeletonRows, Note,
  useBoard, useDebounced, useInvMeta, useMarks, useSort, count, money, fmtDate, fmtDateTime,
  words, toCsv, saveFile,
} from './invUI';
import { ItemForm, BulkItemsForm, AdjustStockForm } from './invForms';
import { ImportItemsDialog } from './invImport';
import { Art } from './invArt';

export default function InventoryItems() {
  const [params, setParams] = useSearchParams();
  const { meta, activeYear } = useInvMeta(api.getFormMeta);

  const [q, setQ] = useState(params.get('search') || '');
  const [category, setCategory] = useState(params.get('category') || '');
  const [state, setState] = useState(params.get('state') || '');
  const [warehouse, setWarehouse] = useState(params.get('warehouse') || '');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const { sort, dir, onSort } = useSort('name', 'asc');
  const search = useDebounced(q);

  const [form, setForm] = useState(null);       // { item } | null
  const [bulk, setBulk] = useState(null);       // 'activate' | …
  const [importing, setImporting] = useState(false);
  const [adjust, setAdjust] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);
  const [pickTab, setPickTab] = useState('overview');
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const load = useCallback(
    () => api.getItemBoard({ search, category, state, warehouse, sort, dir, page, limit }),
    [search, category, state, warehouse, sort, dir, page, limit],
  );
  const { data, loading, error, reload } = useBoard(load, [search, category, state, warehouse, sort, dir, page, limit]);

  const d = data || {};
  const rows = d.rows || [];
  const t = d.tiles || {};
  const marks = useMarks(rows);

  // The item master finally has a detail view of its own: where its stock
  // sits, what has moved it, what it is on order for and who has it out.
  useEffect(() => {
    if (!picked) { setDetail(null); return undefined; }
    let alive = true;
    setDetailBusy(true);
    api.getItemDetail(picked)
      .then((r) => { if (alive) setDetail(r?.data ?? r); })
      .catch((e) => { if (alive) { toast.error(e?.message || 'That item could not be loaded'); setPicked(null); } })
      .finally(() => { if (alive) setDetailBusy(false); });
    return () => { alive = false; };
  }, [picked, data]);

  // A filter change that leaves the page number alone strands you on page 7 of
  // a three-page result, which reads as "no items".
  const setFilter = (fn) => (v) => { fn(v); setPage(1); marks.clear(); };
  const reset = () => {
    setQ(''); setCategory(''); setState(''); setWarehouse(''); setPage(1);
    setParams({}, { replace: true });
    marks.clear();
  };
  const filtered = !!(search || category || state || warehouse);

  const exportCsv = () => {
    saveFile(`inventory-items-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['itemCode', 'Code'], ['name', 'Item'], ['description', 'Description'],
      ['category', 'Category', (r) => r.category?.name || ''],
      ['current', 'Current Stock'], ['reorderLevel', 'Reorder Level'], ['unit', 'Unit'],
      ['state', 'Status', (r) => r.state.replace(/_/g, ' ')],
      ['warehouse', 'Location', (r) => r.warehouse?.name || ''],
      ['value', 'Stock Value'],
    ], rows));
    toast.success('Exported the items on this page');
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteItem(del._id);
      toast.success(`${del.name} deleted`);
      setDel(null); reload();
    } catch (e) { toast.error(e?.message || 'That item could not be deleted'); }
    finally { setBusy(false); }
  };

  const columns = useMemo(() => [
    {
      key: 'name', label: 'Item', sortable: true, primary: true,
      cell: (r) => <ItemCell image={r.image} icon={r.category?.icon || 'box'} name={r.name} sub={r.description} />,
    },
    { key: 'itemCode', label: 'Code', sortable: true, nowrap: true, cell: (r) => <span className="inv-num">{r.itemCode}</span> },
    {
      key: 'category', label: 'Category', sortable: true,
      cell: (r) => (r.category ? <Badge tone="indigo" square>{r.category.name}</Badge> : <span className="inv-dim">—</span>),
    },
    {
      key: 'current', label: 'Current Stock', sortable: true, align: 'num',
      cell: (r) => <span className={r.current <= 0 ? 'inv-danger' : 'inv-strong'}>{count(r.current)}</span>,
    },
    { key: 'reorderLevel', label: 'Reorder Level', sortable: true, align: 'num', cell: (r) => count(r.reorderLevel) },
    { key: 'unit', label: 'Unit', sortable: true, nowrap: true },
    { key: 'state', label: 'Status', sortable: true, cell: (r) => <StatusBadge value={r.state} noIcon /> },
    {
      key: 'warehouse', label: 'Location', sortable: true,
      cell: (r) => (r.warehouse
        ? <span className="inv-trunc">{r.warehouse.name}{r.locations > 1 ? ` +${r.locations - 1}` : ''}</span>
        : <span className="inv-dim">Not stored</span>),
    },
  ], []);

  if (error && !data) return <div className="inv-page"><LoadError error={error} onRetry={reload} /></div>;
  if (loading && !data) return <div className="inv-page"><Loading tiles={5} /></div>;

  return (
    <div className="inv-page">
      <YearBar year={activeYear} />

      <Hero
        icon="package" tone="brown" title="Inventory Items"
        subtitle="Manage all items, supplies and consumables used across your school."
        art={<Art name="items" />}
        promises={['Organize items by category', 'Track stock levels in real time', 'Link to vendors and budgets']}
      />

      <Tiles cols={5}>
        <Tile icon="package" tone="indigo" value={count(t.total?.value)} label="Total Items"
          delta={t.total?.delta} deltaNote="from last month" />
        <Tile icon="boxes" tone="green" value={count(t.inStock?.value)} label="In Stock"
          note={`${t.inStock?.pct ?? 0}% of total`} onClick={() => setFilter(setState)('in_stock')} />
        <Tile icon="alert" tone="amber" value={count(t.lowStock?.value)} label="Low Stock"
          note="Needs reordering" onClick={() => setFilter(setState)('low_stock')} />
        <Tile icon="x" tone="red" value={count(t.outOfStock?.value)} label="Out of Stock"
          note="Currently unavailable" onClick={() => setFilter(setState)('out_of_stock')} />
        <Tile icon="wrench" tone="violet" value={count(t.underRepair?.value)} label="Under Repair"
          note="In maintenance" onClick={() => setFilter(setState)('under_repair')} />
      </Tiles>

      <Filters>
        <Field grow>
          <Search value={q} onChange={setFilter(setQ)} placeholder="Search items by name, code or category…" />
        </Field>
        <Field label="Category" pick>
          <Select value={category} onChange={setFilter(setCategory)} options={d.filters?.categories || []} placeholder="All categories" />
        </Field>
        <Field label="Stock Status" pick>
          <Select value={state} onChange={setFilter(setState)} placeholder="All items" options={[
            { value: 'in_stock', label: 'In Stock' }, { value: 'low_stock', label: 'Low Stock' },
            { value: 'out_of_stock', label: 'Out of Stock' }, { value: 'under_repair', label: 'Under Repair' },
            { value: 'not_tracked', label: 'Not Tracked' },
          ]} />
        </Field>
        <Field label="Warehouse" pick>
          <Select value={warehouse} onChange={setFilter(setWarehouse)} options={d.filters?.warehouses || []} placeholder="All warehouses" />
        </Field>
        <FilterEnd>
          {filtered ? <Btn icon="refresh" onClick={reset}>Reset</Btn> : null}
          <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Add Item</Btn>
        </FilterEnd>
      </Filters>

      <Card>
        <TableBar count={marks.count} total={d.matched ?? d.total ?? 0} noun="items">
          <MenuBtn
            label="Bulk Actions"
            items={marks.count ? [
              { head: `${count(marks.count)} selected` },
              { label: 'Activate', icon: 'checkCircle', onClick: () => setBulk('activate') },
              { label: 'Deactivate', icon: 'closeCircle', onClick: () => setBulk('deactivate') },
              { label: 'Move to category', icon: 'folder', onClick: () => setBulk('category') },
              { label: 'Move to store', icon: 'hotel', onClick: () => setBulk('warehouse') },
              { sep: true },
              { label: 'Delete', icon: 'trash', danger: true, onClick: () => setBulk('delete') },
            ] : [{ head: 'Select rows first' }, { label: 'Nothing selected', disabled: true }]}
          />
          <Btn icon="upload" onClick={() => setImporting(true)}>Import</Btn>
          <Btn icon="download" onClick={exportCsv}>Export</Btn>
          <IconBtn icon="sliders" label="Column settings"
            onClick={() => toast('Every column on this screen is already shown; on a narrow screen the rows become cards.', { icon: 'ℹ️' })} />
        </TableBar>

        <DataTable
          columns={columns} rows={rows} loading={loading && !rows.length}
          sort={sort} dir={dir} onSort={(k) => { onSort(k); setPage(1); }}
          marked={marks.marked} onMark={marks.toggle} onMarkAll={marks.toggleAll}
          pickedId={picked} onRowClick={(r) => { setPicked(r._id); setPickTab('overview'); }}
          actions={(r) => (
            <>
            <IconBtn icon="eye" label="Open details" onClick={() => { setPicked(r._id); setPickTab('overview'); }} />
            <KebabMenu items={[
              { label: 'Edit item', icon: 'pencil', onClick: () => setForm({ item: r }) },
              { label: 'Adjust stock', icon: 'sliders', onClick: () => setAdjust({ itemId: r._id, warehouseId: r.warehouseId }) },
              { sep: true },
              { label: 'Delete item', icon: 'trash', danger: true, onClick: () => setDel(r) },
            ]} />
            </>
          )}
          empty={
            <Empty icon="package" title={filtered ? 'No items match those filters' : 'The item master is empty'}
              action={filtered
                ? <Btn icon="refresh" onClick={reset}>Clear the filters</Btn>
                : <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Add your first item</Btn>}>
              {filtered
                ? 'Try a different category or stock status.'
                : 'Every physical thing the school buys is created here once, then purchased, issued and audited against this one row.'}
            </Empty>
          }
        />

        <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="items"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
      </Card>


      {picked ? (
        <Rail
          image={detail?.item?.image} icon={detail?.item?.category?.icon || 'package'} iconTone="brown"
          title={detail?.item?.name || 'Loading…'}
          sub={detail?.item ? [detail.item.itemCode, detail.item.description].filter(Boolean).join(' · ') : null}
          badge={detail?.item ? <StatusBadge value={detail.item.state} noIcon /> : null}
          onClose={() => setPicked(null)}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'stock', label: 'Stock', count: detail?.stock?.length },
            { value: 'moves', label: 'Movements', count: detail?.movements?.length },
            { value: 'history', label: 'History' },
          ]}
          tab={pickTab} onTab={setPickTab}
          foot={detail?.item ? (
            <>
              <Btn icon="sliders" onClick={() => { setAdjust({ itemId: detail.item._id, warehouseId: detail.item.warehouse?._id }); setPicked(null); }}>
                Adjust stock
              </Btn>
              <Btn kind="primary" icon="pencil" onClick={() => { setForm({ item: { ...detail.item, categoryId: detail.item.category?._id, warehouseId: detail.item.warehouse?._id } }); setPicked(null); }}>
                Edit item
              </Btn>
            </>
          ) : null}
        >
          {detailBusy && !detail ? <SkeletonRows rows={6} /> : !detail ? null : (
            <>
              {pickTab === 'overview' ? (
                <>
                  <Block>
                    <Minis>
                      <Mini icon="boxes" tone="indigo" value={count(detail.stats.onHand)} label={`On hand (${detail.item.unit})`} />
                      <Mini icon="rupee" tone="amber" value={money(detail.stats.value)} label="Stock value" />
                      <Mini icon="alert" tone="red" value={count(detail.stats.reorderLevel)} label="Reorder level" />
                      <Mini icon="send" tone="teal" value={count(detail.stats.issuedOut)} label="Out with people" />
                    </Minis>
                  </Block>
                  <Block title="The item">
                    <Facts>
                      <Fact k="Code" v={detail.item.itemCode} />
                      <Fact k="Category" v={detail.item.category?.name} />
                      <Fact k="Unit" v={detail.item.unit} />
                      <Fact k="Purchase price" v={money(detail.item.purchasePrice, { dec: 2 })} />
                      <Fact k="GST" v={detail.item.gst ? `${detail.item.gst}%` : '—'} />
                      <Fact k="HSN" v={detail.item.hsnCode} />
                      <Fact k="Default store" v={detail.item.warehouse?.name} />
                      <Fact k="Filed at" v={[detail.item.rack, detail.item.shelf, detail.item.bin].filter(Boolean).join(' / ')} />
                    </Facts>
                  </Block>
                  {detail.item.state === 'not_tracked' ? (
                    <Block>
                      <Note tone="info" title="Never stocked">
                        Nothing has ever been received or counted for this item, so it has no balance to report.
                      </Note>
                    </Block>
                  ) : null}
                </>
              ) : null}

              {pickTab === 'stock' ? (
                <Block title="Where it sits">
                  {detail.stock.length ? (
                    <Rows>
                      {detail.stock.map(w => (
                        <Row key={w._id} icon="hotel" iconTone="green" title={w.warehouse?.name}
                          sub={w.warehouse?.code}
                          end={`${count(w.quantity)} ${detail.item.unit}`}
                          endSub={<StatusBadge value={w.state} noIcon />} />
                      ))}
                    </Rows>
                  ) : <Empty icon="boxes" title="Not held anywhere" sm>Receive or adjust some in and it will appear here.</Empty>}
                </Block>
              ) : null}

              {pickTab === 'moves' ? (
                <Block title="Recent movements">
                  {detail.movements.length ? (
                    <Rows>
                      {detail.movements.map(mv => (
                        <Row key={mv._id}
                          icon={mv.quantity > 0 ? 'plus' : 'minus'} iconTone={mv.quantity > 0 ? 'green' : 'red'}
                          title={mv.label}
                          sub={[mv.warehouse, mv.by?.name, mv.note].filter(Boolean).join(' · ')}
                          end={`${mv.quantity > 0 ? '+' : ''}${count(mv.quantity)}`}
                          endSub={fmtDateTime(mv.at)} />
                      ))}
                    </Rows>
                  ) : <Empty icon="history" title="Nothing has moved" sm>This item has no entries on the stock ledger.</Empty>}
                </Block>
              ) : null}

              {pickTab === 'history' ? (
                <>
                  <Block title={`Purchase orders (${count(detail.orders.length)})`}>
                    {detail.orders.length ? (
                      <Rows>
                        {detail.orders.map(o => (
                          <Row key={o._id} icon="fileDoc" iconTone="violet" title={o.poNumber}
                            sub={[o.vendor, fmtDate(o.date)].filter(Boolean).join(' · ')}
                            end={count(o.quantity)} endSub={<StatusBadge value={o.state} noIcon />} />
                        ))}
                      </Rows>
                    ) : <Empty icon="fileDoc" title="Never ordered" sm>No purchase order has included this item.</Empty>}
                  </Block>
                  <Block title={`Issued (${count(detail.issues.length)})`}>
                    {detail.issues.length ? (
                      <Rows>
                        {detail.issues.map(i => (
                          <Row key={i._id} icon="send" iconTone="blue" title={i.issueNumber}
                            sub={[i.to, fmtDate(i.date)].filter(Boolean).join(' · ')}
                            end={count(i.quantity)}
                            endSub={i.outstanding ? `${count(i.outstanding)} still out` : 'All back'} />
                        ))}
                      </Rows>
                    ) : <Empty icon="send" title="Never issued" sm>Nobody has taken this item out of a store.</Empty>}
                  </Block>
                  {detail.assets.length ? (
                    <Block title={`Tracked as assets (${count(detail.assets.length)})`}>
                      <Rows>
                        {detail.assets.map(a => (
                          <Row key={a._id} icon="monitor" iconTone="pink" title={a.name} sub={a.assetCode}
                            endSub={<StatusBadge value={a.state} noIcon />} />
                        ))}
                      </Rows>
                    </Block>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </Rail>
      ) : null}

      <ItemForm open={!!form} item={form?.item} meta={meta} onClose={() => setForm(null)} onDone={reload} />
      <ImportItemsDialog open={importing} onClose={() => setImporting(false)} onDone={reload} />
      <BulkItemsForm open={!!bulk} action={bulk} ids={marks.selected} meta={meta}
        onClose={() => setBulk(null)} onDone={() => { marks.clear(); reload(); }} />
      <AdjustStockForm open={!!adjust} preset={adjust} meta={meta} onClose={() => setAdjust(null)} onDone={reload} />
      <Confirm
        open={!!del} onClose={() => setDel(null)} onConfirm={remove} busy={busy} tone="danger"
        confirmLabel="Delete item" title={del ? `Delete ${del.name}?` : ''}
        message={del
          ? `${del.itemCode} will be removed from the item master. Its past orders, issues and ledger entries stay — but an item that still holds stock cannot be deleted${del.current > 0 ? `, and this one holds ${count(del.current)} ${del.unit}.` : '.'}`
          : ''}
      />
    </div>
  );
}
