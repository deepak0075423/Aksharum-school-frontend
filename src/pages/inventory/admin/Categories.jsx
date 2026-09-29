/**
 * Inventory → Categories.
 *
 * Categories exist to be counted through: the Items and Stock Value columns
 * roll a sub-category's figures up into its parent as well as counting them
 * for itself, because a parent that reported nothing while all of its items
 * sat in its children would be worse than no figure at all.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import * as api from '../../../api/inventory.api';
import {
  Hero, YearBar, Tiles, Tile, Card, SplitView, Rail, Filters, FilterEnd, Field, Search, Select,
  Btn, IconBtn, KebabMenu, DataTable, Pager, Badge, StatusBadge, Mark, Rows, Row, Block, Facts,
  Fact, Minis, Mini, Empty, Loading, LoadError, Confirm, SkeletonRows, ViewAll, useBoard,
  useDebounced, useInvMeta, useSort, count, money, fmtDate, words, toCsv, saveFile, Cell2,
} from './invUI';
import { CategoryForm } from './invForms';
import { Art } from './invArt';

const RAIL_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'items', label: 'Items' },
  { value: 'stock', label: 'Stock' },
  { value: 'history', label: 'Purchase History' },
];

export default function InventoryCategories() {
  const nav = useNavigate();
  const { meta, activeYear } = useInvMeta(api.getFormMeta);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [parent, setParent] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { sort, dir, onSort } = useSort('name', 'asc');
  const search = useDebounced(q);

  const [tab, setTab] = useState('overview');
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  // The sort control in the filter bar and the column headers are one state.
  const effectiveSort = sortBy === 'name' ? sort : sortBy;

  const load = useCallback(
    () => api.getCategoryBoard({ search, status, parent, sort: effectiveSort, dir, page, limit }),
    [search, status, parent, effectiveSort, dir, page, limit],
  );
  const { data, loading, error, reload } = useBoard(load, [search, status, parent, effectiveSort, dir, page, limit]);

  const d = data || {};
  const rows = d.rows || [];
  const t = d.tiles || {};

  const [picked, setPicked] = useState(null);

  useEffect(() => {
    if (!picked) { setDetail(null); return undefined; }
    let alive = true;
    setDetailBusy(true);
    api.getCategoryDetail(picked)
      .then((r) => { if (alive) setDetail(r?.data ?? r); })
      .catch((e) => { if (alive) { toast.error(e?.message || 'That category could not be loaded'); setPicked(null); } })
      .finally(() => { if (alive) setDetailBusy(false); });
    return () => { alive = false; };
  }, [picked, data]);

  const setFilter = (fn) => (v) => { fn(v); setPage(1); };
  const reset = () => { setQ(''); setStatus(''); setParent(''); setSortBy('name'); setPage(1); };
  const filtered = !!(search || status || parent);

  const exportCsv = () => {
    saveFile(`categories-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['name', 'Category Name'], ['description', 'Description'],
      ['parent', 'Parent Category', (r) => r.parent?.name || ''],
      ['items', 'Items'], ['value', 'Stock Value'], ['lowStock', 'Low Stock Items'],
      ['state', 'Status', (r) => words(r.state)],
    ], rows));
    toast.success('Exported the categories on this page');
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteCategory(del._id);
      toast.success(`${del.name} deleted`);
      if (String(picked) === String(del._id)) setPicked(null);
      setDel(null); reload();
    } catch (e) { toast.error(e?.message || 'That category could not be deleted'); }
    finally { setBusy(false); }
  };

  const columns = useMemo(() => [
    {
      key: 'name', label: 'Category Name', sortable: true, primary: true,
      cell: (r) => (
        <span className="inv-cellrow">
          <Mark name={r.icon} tone="indigo" size={34} glyph={17} />
          <Cell2 top={r.name} sub={r.children ? `${count(r.children)} sub-categories` : null} />
        </span>
      ),
    },
    { key: 'description', label: 'Description', secondary: true, cell: (r) => <span className="inv-clamp2">{r.description || <span className="inv-dim">—</span>}</span> },
    {
      key: 'parent', label: 'Parent Category', secondary: true,
      cell: (r) => (r.parent ? <Badge tone="slate" square>{r.parent.name}</Badge> : <span className="inv-dim">-</span>),
    },
    { key: 'items', label: 'Items', sortable: true, align: 'num', cell: (r) => count(r.items) },
    { key: 'value', label: 'Stock Value (₹)', sortable: true, align: 'num', cell: (r) => <span className="inv-strong">{money(r.value)}</span> },
    { key: 'state', label: 'Status', cell: (r) => <StatusBadge value={r.state} noIcon /> },
  ], []);

  const c = detail?.category;
  const s = detail?.stats || {};

  const rail = picked ? (
    <Rail
      icon={c?.icon || 'folder'} iconTone="sky"
      title={c?.name || 'Loading…'}
      badge={c ? <StatusBadge value={c.state} noIcon /> : null}
      actions={c ? (
        <KebabMenu items={[
          { label: 'Edit category', icon: 'pencil', onClick: () => setForm({ category: { ...c, parentId: c.parent?._id } }) },
          { label: 'View its items', icon: 'package', onClick: () => nav(`/admin/inventory/items?category=${c._id}`) },
          { sep: true },
          { label: 'Delete category', icon: 'trash', danger: true, onClick: () => setDel(c) },
        ]} />
      ) : null}
      onClose={() => setPicked(null)}
      tabs={RAIL_TABS.map(x => (x.value === 'items' ? { ...x, count: s.items } : x))}
      tab={tab} onTab={setTab}
      foot={c ? (
        <>
          <Btn kind="primary" icon="list" onClick={() => nav(`/admin/inventory/items?category=${c._id}`)}>View Items</Btn>
          <Btn icon="pencil" onClick={() => setForm({ category: { ...c, parentId: c.parent?._id } })}>Edit Category</Btn>
        </>
      ) : null}
    >
      {detailBusy && !detail ? <SkeletonRows rows={6} /> : !detail ? null : (
        <>
          {tab === 'overview' ? (
            <>
              <Block title="Description" right={<IconBtn icon="pencil" kind="bare" label="Edit description" onClick={() => setForm({ category: { ...c, parentId: c.parent?._id } })} />}>
                <p style={{ margin: 0, color: 'var(--inv-ink-2)', lineHeight: 1.6, fontSize: '.86rem' }}>
                  {c.description || <span className="inv-dim">No description yet.</span>}
                </p>
              </Block>

              <Block title="Parent Category" right={<IconBtn icon="pencil" kind="bare" label="Edit parent" onClick={() => setForm({ category: { ...c, parentId: c.parent?._id } })} />}>
                <p style={{ margin: 0, fontSize: '.86rem' }}>
                  {c.parent ? <Badge tone="slate" square>{c.parent.name}</Badge> : <span className="inv-dim">-</span>}
                </p>
              </Block>

              <Block>
                <Minis>
                  <Mini icon="package" tone="indigo" value={count(s.items)} label="Total Items" />
                  <Mini icon="rupee" tone="amber" value={money(s.value)} label="Stock Value" />
                  <Mini icon="alert" tone="red" value={count(s.lowStock)} label="Low Stock Items" />
                  <Mini icon="clock" tone="green" value={fmtDate(s.updatedAt)} label="Last Updated" />
                </Minis>
              </Block>

              {(c.defaultUnit || c.defaultGst || c.defaultHsnCode) ? (
                <Block title="Defaults for new items">
                  <Facts>
                    <Fact k="Unit" v={c.defaultUnit} />
                    <Fact k="GST" v={c.defaultGst ? `${c.defaultGst}%` : null} />
                    <Fact k="HSN code" v={c.defaultHsnCode} />
                  </Facts>
                </Block>
              ) : null}
            </>
          ) : null}

          {tab === 'items' ? (
            <Block title={`Items (${count(detail.items.length)})`}
              right={<ViewAll onClick={() => nav(`/admin/inventory/items?category=${c._id}`)} />}>
              {detail.items.length ? (
                <Rows>
                  {detail.items.map(it => (
                    <Row key={it._id} image={it.image} icon={c.icon || 'box'} title={it.name}
                      sub={`${it.itemCode} · ${count(it.current)} ${it.unit}`}
                      end={money(it.value)} endSub={<StatusBadge value={it.state} noIcon />} />
                  ))}
                </Rows>
              ) : <Empty icon="package" title="No items in this category" sm>Assign items to it and they appear here.</Empty>}
            </Block>
          ) : null}

          {tab === 'stock' ? (
            <Block title="Where this category's stock sits">
              {detail.stock.length ? (
                <Rows>
                  {detail.stock.map(w => (
                    <Row key={w._id} icon="warehouse" iconTone="green" title={w.name} sub={w.code}
                      end={count(w.quantity)} endSub={money(w.value)} />
                  ))}
                </Rows>
              ) : <Empty icon="warehouse" title="Nothing in stock" sm>None of this category's items are currently held anywhere.</Empty>}
            </Block>
          ) : null}

          {tab === 'history' ? (
            <Block title="Purchase history">
              {detail.history.length ? (
                <Rows>
                  {detail.history.map(o => (
                    <Row key={o._id} icon="invoice" iconTone="violet" title={o.poNumber}
                      sub={`${fmtDate(o.date)} · ${count(o.quantity)} units`}
                      end={money(o.value)} endSub={<StatusBadge value={o.state} noIcon />} />
                  ))}
                </Rows>
              ) : <Empty icon="invoice" title="Never purchased" sm>No purchase order has included an item from this category.</Empty>}
            </Block>
          ) : null}
        </>
      )}
    </Rail>
  ) : null;

  if (error && !data) return <div className="inv-page"><LoadError error={error} onRetry={reload} /></div>;
  if (loading && !data) return <div className="inv-page"><Loading tiles={4} /></div>;

  return (
    <div className="inv-page">
      <YearBar year={activeYear} />

      <Hero
        icon="folder" tone="sky" title="Item Categories"
        subtitle="Organize items into categories for better tracking, reporting and stock management."
        art={<Art name="categories" />}
        promises={['Create and manage item categories', 'Group similar items for easy tracking', 'Set default purchase and accounting preferences', 'View items and stock value by category']}
      >
        <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Add Category</Btn>
      </Hero>

      <Tiles cols={4}>
        <Tile icon="folder" tone="indigo" value={count(t.total?.value)} label="Total Categories"
          delta={t.total?.delta} deltaNote="from last month" spark={t.total?.series} sparkKind="bar" sparkTone="indigo" />
        <Tile icon="package" tone="green" value={count(t.items?.value)} label="Total Items"
          foot={<ViewAll onClick={() => nav('/admin/inventory/items')}>View all items</ViewAll>} />
        <Tile icon="coins" tone="amber" value={money(t.value?.value)} label="Total Stock Value" small
          foot={<ViewAll onClick={() => nav('/admin/inventory/stock')}>View valuation</ViewAll>} />
        <Tile icon="alert" tone="red" value={count(t.lowStock?.value)} label="Low Stock Items"
          foot={<ViewAll onClick={() => nav('/admin/inventory/items?state=low_stock')}>View items</ViewAll>} />
      </Tiles>

      <SplitView rail={rail}>
        <Card>
          <Filters inner>
            <Field grow>
              <Search value={q} onChange={setFilter(setQ)} placeholder="Search categories by name, description…" />
            </Field>
            <Field label="Status" pick>
              <Select value={status} onChange={setFilter(setStatus)} placeholder="All statuses"
                options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
            </Field>
            <Field label="Parent Category" pick>
              <Select value={parent} onChange={setFilter(setParent)} placeholder="All categories"
                options={[{ value: 'top', label: 'Top level only' }, ...(d.filters?.parents || [])]} />
            </Field>
            <Field label="Sort By" pick>
              <Select value={sortBy} onChange={setFilter(setSortBy)} options={[
                { value: 'name', label: 'Name (A - Z)' }, { value: 'name-desc', label: 'Name (Z - A)' },
                { value: 'items', label: 'Most items' }, { value: 'value', label: 'Highest stock value' },
                { value: 'recent', label: 'Recently added' },
              ]} />
            </Field>
            <FilterEnd>
              <Btn kind={filtered ? 'soft' : 'ghost'} icon="filter" onClick={reset}>{filtered ? 'Clear filters' : 'Filters'}</Btn>
              <Btn icon="download" onClick={exportCsv}>Export</Btn>
              <KebabMenu items={[
                { label: 'Add category', icon: 'plus', onClick: () => setForm({}) },
                { label: 'Export this page', icon: 'download', onClick: exportCsv },
              ]} />
            </FilterEnd>
          </Filters>

          <DataTable
            columns={columns} rows={rows} loading={loading && !rows.length}
            sort={sort} dir={dir} onSort={(k) => { setSortBy('name'); onSort(k); setPage(1); }}
            pickedId={picked} onRowClick={(r) => { setPicked(r._id); setTab('overview'); }}
            actions={(r) => (
              <>
                <IconBtn icon="eye" label="Open details" onClick={() => { setPicked(r._id); setTab('overview'); }} />
                <IconBtn icon="pencil" label="Edit category" onClick={() => setForm({ category: r })} />
                <KebabMenu items={[
                  { label: 'View its items', icon: 'package', onClick: () => nav(`/admin/inventory/items?category=${r._id}`) },
                  { sep: true },
                  { label: 'Delete category', icon: 'trash', danger: true, onClick: () => setDel(r) },
                ]} />
              </>
            )}
            empty={
              <Empty icon="folder" title={filtered ? 'No categories match' : 'No categories yet'}
                action={filtered
                  ? <Btn icon="refresh" onClick={reset}>Clear the filters</Btn>
                  : <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Add the first category</Btn>}>
                {filtered ? 'Try a different status or parent.' : 'Categories group items for tracking, reporting and budgets — and set the defaults a new item starts with.'}
              </Empty>
            }
          />

          <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="categories"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} limits={[10, 25, 50]} />
        </Card>
      </SplitView>

      <CategoryForm open={!!form} category={form?.category} meta={meta} onClose={() => setForm(null)} onDone={reload} />
      <Confirm
        open={!!del} onClose={() => setDel(null)} onConfirm={remove} busy={busy} tone="danger"
        confirmLabel="Delete category" title={del ? `Delete ${del.name}?` : ''}
        message={del ? `A category still used by items cannot be deleted — move those items first, or deactivate the category to keep it off new ones.` : ''}
      />
    </div>
  );
}
