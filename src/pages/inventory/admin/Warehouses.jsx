/**
 * Inventory → Warehouses.
 *
 * Current Usage is summed from the stock actually held in each store, and
 * "Low Capacity" is that usage against the percentage the school itself set on
 * the store — not a threshold picked here. A store with no capacity recorded
 * reports no usage rather than a misleading 0%.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import * as api from '../../../api/inventory.api';
import {
  Hero, YearBar, Tiles, Tile, Card, SplitView, Rail, Filters, FilterEnd, Field, Search, Select,
  Btn, IconBtn, KebabMenu, DataTable, Pager, Badge, StatusBadge, Thumb, BarRow, Bar, Rows, Row,
  Block, Facts, Fact, Lines, Line, Minis, Mini, Empty, Loading, LoadError, Confirm, SkeletonRows,
  useBoard, useDebounced, useInvMeta, useSort, count, money, fmtDate, fmtDateTime, words,
  toCsv, saveFile, Cell2, WAREHOUSE_TYPE, Ico,
} from './invUI';
import { WarehouseForm, TransferStockForm } from './invForms';
import { Art } from './invArt';

const RAIL_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'stock', label: 'Stock' },
  { value: 'spots', label: 'Locations' },
  { value: 'activity', label: 'Activity' },
];
const TYPE_TONE = { main: 'indigo', department: 'sky', secondary: 'slate' };

export default function InventoryWarehouses() {
  const nav = useNavigate();
  const { meta, activeYear } = useInvMeta(api.getFormMeta);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { sort, dir, onSort } = useSort('name', 'asc');
  const search = useDebounced(q);

  const [tab, setTab] = useState('overview');
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api.getWarehouseBoard({ search, status, location, type, sort, dir, page, limit }),
    [search, status, location, type, sort, dir, page, limit],
  );
  const { data, loading, error, reload } = useBoard(load, [search, status, location, type, sort, dir, page, limit]);

  const d = data || {};
  const rows = d.rows || [];
  const t = d.tiles || {};

  const [picked, setPicked] = useState(null);

  useEffect(() => {
    if (!picked) { setDetail(null); return undefined; }
    let alive = true;
    setDetailBusy(true);
    api.getWarehouseDetail(picked)
      .then((r) => { if (alive) setDetail(r?.data ?? r); })
      .catch((e) => { if (alive) { toast.error(e?.message || 'That store could not be loaded'); setPicked(null); } })
      .finally(() => { if (alive) setDetailBusy(false); });
    return () => { alive = false; };
  }, [picked, data]);

  const setFilter = (fn) => (v) => { fn(v); setPage(1); };
  const reset = () => { setQ(''); setStatus(''); setLocation(''); setType(''); setPage(1); };
  const filtered = !!(search || status || location || type);

  const exportCsv = () => {
    saveFile(`warehouses-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['name', 'Warehouse'], ['code', 'Code'],
      ['type', 'Type', (r) => WAREHOUSE_TYPE[r.type] || r.type],
      ['location', 'Location'], ['capacity', 'Capacity'], ['used', 'Used'],
      ['usage', 'Usage %', (r) => (r.usage == null ? '' : r.usage)],
      ['itemCount', 'Items'], ['value', 'Stock Value'],
      ['state', 'Status', (r) => words(r.state)],
    ], rows));
    toast.success('Exported the warehouses on this page');
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteWarehouse(del._id);
      toast.success(`${del.name} deleted`);
      if (String(picked) === String(del._id)) setPicked(null);
      setDel(null); reload();
    } catch (e) { toast.error(e?.message || 'That store could not be deleted'); }
    finally { setBusy(false); }
  };

  const columns = useMemo(() => [
    {
      key: 'name', label: 'Warehouse Details', sortable: true, primary: true,
      cell: (r) => (
        <span className="inv-cellrow">
          <Thumb src={r.image} icon="warehouse" tone="green" lg />
          <Cell2 top={r.name} sub={r.description} />
        </span>
      ),
    },
    { key: 'code', label: 'Code', sortable: true, secondary: true, nowrap: true, cell: (r) => <span className="inv-num">{r.code || '—'}</span> },
    { key: 'type', label: 'Type', sortable: true, secondary: true, cell: (r) => <Badge tone={TYPE_TONE[r.type] || 'slate'} square>{WAREHOUSE_TYPE[r.type] || words(r.type)}</Badge> },
    {
      key: 'location', label: 'Location', sortable: true,
      cell: (r) => (r.location
        ? <span className="inv-cellrow"><Ico name="mapPin" size={14} aria-hidden /><span className="inv-trunc">{r.location}</span></span>
        : <span className="inv-dim">—</span>),
    },
    {
      key: 'capacity', label: 'Capacity', sortable: true, secondary: true, align: 'num',
      cell: (r) => (r.capacity ? `${count(r.capacity)} units` : <span className="inv-dim">No limit</span>),
    },
    {
      key: 'usage', label: 'Current Usage', sortable: true,
      cell: (r) => (r.usage == null
        ? <span className="inv-dim">{count(r.used)} units held</span>
        : <BarRow value={r.used} max={r.capacity} />),
    },
    { key: 'state', label: 'Status', sortable: true, cell: (r) => <StatusBadge value={r.state} noIcon /> },
  ], []);

  const w = detail?.warehouse;
  const s = detail?.stats || {};

  const rail = picked ? (
    <Rail
      image={w?.image} icon="warehouse" iconTone="green"
      title={w?.name || 'Loading…'} sub={w?.code}
      badge={w ? <StatusBadge value={w.state} noIcon /> : null}
      actions={w ? (
        <KebabMenu items={[
          { label: 'Edit store', icon: 'pencil', onClick: () => setForm({ warehouse: w }) },
          { label: 'Transfer stock out', icon: 'repeat', onClick: () => setTransfer({ warehouseId: w._id }) },
          { sep: true },
          { label: 'Delete store', icon: 'trash', danger: true, onClick: () => setDel(w) },
        ]} />
      ) : null}
      onClose={() => setPicked(null)}
      tabs={RAIL_TABS.map(x => (x.value === 'stock' ? { ...x, count: s.items } : x))}
      tab={tab} onTab={setTab}
      foot={w ? (
        <>
          <Btn icon="grid" onClick={() => nav(`/admin/inventory/stock?warehouse=${w._id}`)}>View Stock</Btn>
          <Btn kind="primary" icon="repeat" onClick={() => setTransfer({ warehouseId: w._id })}>Transfer Stock</Btn>
        </>
      ) : null}
    >
      {detailBusy && !detail ? <SkeletonRows rows={6} /> : !detail ? null : (
        <>
          {tab === 'overview' ? (
            <>
              <Block title="Warehouse Information" right={<IconBtn icon="pencil" kind="bare" label="Edit" onClick={() => setForm({ warehouse: w })} />}>
                <Lines>
                  <Line icon="warehouse">{w.name}</Line>
                  <Line icon="idCard">{w.code || <span className="inv-dim">No code</span>}</Line>
                  <Line icon="info">{w.description || <span className="inv-dim">No description</span>}</Line>
                  <Line icon="mapPin">{[w.location, w.campus].filter(Boolean).join(', ') || <span className="inv-dim">No location</span>}</Line>
                  <Line icon="layers">{w.capacity ? `${count(w.capacity)} units (Total Capacity)` : 'No capacity limit recorded'}</Line>
                  {w.contactPerson ? <Line icon="user">{w.contactPerson}{w.phone ? ` · ${w.phone}` : ''}</Line> : null}
                </Lines>
              </Block>

              <Block title="Capacity Usage">
                {s.capacity ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <strong style={{ fontSize: '.92rem' }}>{count(s.units)} / {count(s.capacity)} units</strong>
                      <strong style={{ fontSize: '.92rem' }}>{s.usage}%</strong>
                    </div>
                    <Bar value={s.units} max={s.capacity} lg
                      color={s.usage >= 100 ? '#ef4444' : s.usage >= 85 ? '#f59e0b' : '#22c55e'} />
                    <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: '.8rem', color: 'var(--inv-muted)', flexWrap: 'wrap' }}>
                      <span><i className="inv-dot inv-dot--green" /> Used ({count(s.units)} units)</span>
                      <span><i className="inv-dot inv-dot--slate" /> Available ({count(s.available)} units)</span>
                    </div>
                  </>
                ) : (
                  <p style={{ margin: 0, color: 'var(--inv-muted)', fontSize: '.85rem' }}>
                    No capacity has been recorded for this store, so usage cannot be reported as a percentage.
                    It currently holds <strong>{count(s.units)}</strong> units across {count(s.items)} items.
                  </p>
                )}
              </Block>

              <Block>
                <Minis>
                  <Mini icon="package" tone="indigo" value={count(s.items)} label="Items Held" />
                  <Mini icon="rupee" tone="amber" value={money(s.value)} label="Stock Value" />
                  <Mini icon="alert" tone="red" value={count(s.lowStock)} label="Needs Attention" />
                </Minis>
              </Block>
            </>
          ) : null}

          {tab === 'stock' ? (
            <Block title={`Stock held (${count(detail.stock.length)})`}>
              {detail.stock.length ? (
                <Rows>
                  {detail.stock.map(it => (
                    <Row key={it._id} image={it.image} icon={it.category?.icon || 'box'} title={it.name}
                      sub={`${it.itemCode} · ${count(it.quantity)} ${it.unit}`}
                      end={money(it.value)} endSub={<StatusBadge value={it.state} noIcon />} />
                  ))}
                </Rows>
              ) : <Empty icon="boxes" title="Nothing held here" sm>This store is empty.</Empty>}
            </Block>
          ) : null}

          {tab === 'spots' ? (
            <Block title="Racks, shelves and bins">
              {detail.spots.length ? (
                <Rows>
                  {detail.spots.map((p, i) => (
                    <Row key={i} icon="layers" iconTone="slate" title={p.name}
                      sub={`${count(p.items)} items`} end={count(p.quantity)} endSub="units" />
                  ))}
                </Rows>
              ) : <Empty icon="layers" title="Nothing filed by place" sm>Set a rack, shelf or bin on an item and its place is listed here.</Empty>}
            </Block>
          ) : null}

          {tab === 'activity' ? (
            <Block title="Recent movements">
              {detail.activity.length ? (
                <Rows>
                  {detail.activity.map(a => (
                    <Row key={a._id} icon={a.quantity > 0 ? 'plus' : 'minus'} iconTone={a.quantity > 0 ? 'green' : 'red'}
                      title={a.item?.name || 'Deleted item'}
                      sub={`${words(a.type)}${a.by?.name ? ` · ${a.by.name}` : ''}`}
                      end={`${a.quantity > 0 ? '+' : ''}${count(a.quantity)}`}
                      endSub={fmtDateTime(a.at)} />
                  ))}
                </Rows>
              ) : <Empty icon="history" title="No movements yet" sm>Receipts, issues and transfers through this store appear here.</Empty>}
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
        icon="warehouse" tone="green" title="Warehouse Management"
        subtitle="Manage your school's storage locations, track stock across warehouses and control access, capacity and item movement."
        art={<Art name="warehouses" />}
        promises={['Create multiple warehouses and locations', 'Track stock across all warehouses', 'Set capacity and access control', 'Monitor stock movement and transfers']}
      >
        <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Add Warehouse</Btn>
      </Hero>

      <Tiles cols={4}>
        <Tile icon="warehouse" tone="indigo" value={count(t.total?.value)} label="Total Warehouses"
          delta={t.total?.delta} deltaNote="from last month" spark={t.total?.series} sparkKind="bar" sparkTone="indigo" />
        <Tile icon="check" tone="green" value={count(t.active?.value)} label="Active Warehouses"
          note={`${t.active?.pct ?? 0}% of total`} onClick={() => setFilter(setStatus)('active')} />
        <Tile icon="boxes" tone="amber" value={count(t.low?.value)} label="Low Capacity"
          note={`${t.low?.pct ?? 0}% of total`} onClick={() => setFilter(setStatus)('low_capacity')} />
        <Tile icon="alert" tone="red" value={count(t.inactive?.value)} label="Inactive Warehouse"
          note={`${t.inactive?.pct ?? 0}% of total`} onClick={() => setFilter(setStatus)('inactive')} />
      </Tiles>

      <SplitView rail={rail}>
        <Card>
          <Filters inner>
            <Field grow>
              <Search value={q} onChange={setFilter(setQ)} placeholder="Search warehouses by name, code, location…" />
            </Field>
            <Field label="Status" pick>
              <Select value={status} onChange={setFilter(setStatus)} placeholder="All statuses" options={[
                { value: 'active', label: 'Active' }, { value: 'low_capacity', label: 'Low Capacity' }, { value: 'inactive', label: 'Inactive' },
              ]} />
            </Field>
            <Field label="Location" pick>
              <Select value={location} onChange={setFilter(setLocation)} options={d.filters?.locations || []} placeholder="All locations" />
            </Field>
            <Field label="Type" pick>
              <Select value={type} onChange={setFilter(setType)} placeholder="All types"
                options={Object.entries(WAREHOUSE_TYPE).map(([value, label]) => ({ value, label }))} />
            </Field>
            <FilterEnd>
              <Btn kind={filtered ? 'soft' : 'ghost'} icon="filter" onClick={reset}>{filtered ? 'Clear filters' : 'Filters'}</Btn>
              <Btn icon="download" onClick={exportCsv}>Export</Btn>
              <KebabMenu items={[
                { label: 'Add warehouse', icon: 'plus', onClick: () => setForm({}) },
                { label: 'Transfer stock', icon: 'repeat', onClick: () => setTransfer({}) },
                { label: 'Export this page', icon: 'download', onClick: exportCsv },
              ]} />
            </FilterEnd>
          </Filters>

          <DataTable
            columns={columns} rows={rows} loading={loading && !rows.length}
            sort={sort} dir={dir} onSort={(k) => { onSort(k); setPage(1); }}
            pickedId={picked} onRowClick={(r) => { setPicked(r._id); setTab('overview'); }}
            actions={(r) => (
              <>
                <IconBtn icon="eye" label="Open details" onClick={() => { setPicked(r._id); setTab('overview'); }} />
                <IconBtn icon="pencil" label="Edit store" onClick={() => setForm({ warehouse: r })} />
                <KebabMenu items={[
                  { label: 'View its stock', icon: 'grid', onClick: () => nav(`/admin/inventory/stock?warehouse=${r._id}`) },
                  { label: 'Transfer stock out', icon: 'repeat', onClick: () => setTransfer({ warehouseId: r._id }) },
                  { sep: true },
                  { label: 'Delete store', icon: 'trash', danger: true, onClick: () => setDel(r) },
                ]} />
              </>
            )}
            empty={
              <Empty icon="warehouse" title={filtered ? 'No warehouses match' : 'No warehouses yet'}
                action={filtered
                  ? <Btn icon="refresh" onClick={reset}>Clear the filters</Btn>
                  : <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Add the first warehouse</Btn>}>
                {filtered ? 'Try another status, location or type.' : 'Stock is always held somewhere — a store is where a receipt lands and an issue comes from.'}
              </Empty>
            }
          />

          <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="warehouses"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} limits={[10, 25, 50]} />
        </Card>
      </SplitView>

      <WarehouseForm open={!!form} warehouse={form?.warehouse} meta={meta} onClose={() => setForm(null)} onDone={reload} />
      <TransferStockForm open={!!transfer} preset={transfer} meta={meta} onClose={() => setTransfer(null)} onDone={reload} />
      <Confirm
        open={!!del} onClose={() => setDel(null)} onConfirm={remove} busy={busy} tone="danger"
        confirmLabel="Delete warehouse" title={del ? `Delete ${del.name}?` : ''}
        message={del ? `A store that still holds stock cannot be deleted — move the stock out first, or mark the store inactive to keep it out of new receipts and issues.` : ''}
      />
    </div>
  );
}
