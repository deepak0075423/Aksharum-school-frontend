/**
 * Inventory → Vendors.
 *
 * A table beside a rail: pick a supplier and the panel answers what they have
 * actually supplied, what has been ordered and what has been paid. None of
 * those three figures is stored on the vendor — they are summed from that
 * vendor's purchase orders every time the rail opens, so they cannot drift
 * away from the orders themselves.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import {
  Hero, YearBar, Tiles, Tile, Card, SplitView, Rail, RailTabs, Filters, FilterEnd, Field,
  Search, Select, Btn, IconBtn, KebabMenu, DataTable, Pager, Badge, StatusBadge, Avatar, Who,
  Rows, Row, Block, Facts, Fact, Lines, Line, Minis, Mini, Empty, Loading, LoadError, Confirm,
  SkeletonRows, ViewAll, useBoard, useDebounced, useInvMeta, useSort, count, money, fmtDate,
  words, toCsv, saveFile, Cell2,
} from './invUI';
import { VendorForm } from './invForms';
import { Art } from './invArt';

const RAIL_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'items', label: 'Items' },
  { value: 'orders', label: 'Purchase Orders' },
  { value: 'payments', label: 'Payments' },
];

export default function InventoryVendors() {
  const { activeYear } = useInvMeta(api.getFormMeta);

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const { sort, dir, onSort } = useSort('name', 'asc');
  const search = useDebounced(q);

  const [tab, setTab] = useState('overview');
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api.getVendorBoard({ search, category, status, city, sort, dir, page, limit }),
    [search, category, status, city, sort, dir, page, limit],
  );
  const { data, loading, error, reload } = useBoard(load, [search, category, status, city, sort, dir, page, limit]);

  const d = data || {};
  const rows = d.rows || [];
  const t = d.tiles || {};

  const [picked, setPicked] = useState(null);

  // The rail follows the picked row. It is opened deliberately, not by landing
  // on the screen: on a narrow page it is a sheet over the table, and opening
  // one uninvited would hide the list the moment the screen loaded.
  useEffect(() => {
    if (!picked) { setDetail(null); return undefined; }
    let alive = true;
    setDetailBusy(true);
    api.getVendorDetail(picked)
      .then((r) => { if (alive) setDetail(r?.data ?? r); })
      .catch((e) => { if (alive) { toast.error(e?.message || 'That vendor could not be loaded'); setPicked(null); } })
      .finally(() => { if (alive) setDetailBusy(false); });
    return () => { alive = false; };
  }, [picked, data]);

  const setFilter = (fn) => (v) => { fn(v); setPage(1); };
  const reset = () => { setQ(''); setCategory(''); setStatus(''); setCity(''); setPage(1); };
  const filtered = !!(search || category || status || city);

  const exportCsv = () => {
    saveFile(`vendors-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['name', 'Vendor Name'], ['contactPerson', 'Contact Person'], ['phone', 'Phone'],
      ['email', 'Email'], ['vendorCategory', 'Category'], ['city', 'City'],
      ['itemsSupplied', 'Items Supplied'], ['totalOrders', 'Total Orders'], ['totalValue', 'Total Value'],
      ['gstNumber', 'GST'], ['state', 'Status', (r) => words(r.state)],
    ], rows));
    toast.success('Exported the vendors on this page');
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteVendor(del._id);
      toast.success(`${del.name} deleted`);
      if (String(picked) === String(del._id)) setPicked(null);
      setDel(null); reload();
    } catch (e) { toast.error(e?.message || 'That vendor could not be deleted'); }
    finally { setBusy(false); }
  };

  const columns = useMemo(() => [
    {
      key: 'name', label: 'Vendor Name', sortable: true, primary: true,
      cell: (r) => (
        <span className="inv-cellrow">
          <Avatar name={r.name} src={r.logo} id={r._id} square />
          <Cell2 top={r.name} sub={r.tagline} />
        </span>
      ),
    },
    {
      key: 'contactPerson', label: 'Contact Person', sortable: true,
      cell: (r) => <Cell2 top={r.contactPerson || '—'} sub={r.phone} />,
    },
    {
      key: 'vendorCategory', label: 'Category', secondary: true,
      cell: (r) => (r.vendorCategory ? <Badge tone="indigo" square>{r.vendorCategory}</Badge> : <span className="inv-dim">—</span>),
    },
    { key: 'city', label: 'City', sortable: true, secondary: true, cell: (r) => r.city || <span className="inv-dim">—</span> },
    { key: 'itemsSupplied', label: 'Items Supplied', sortable: true, align: 'num', cell: (r) => count(r.itemsSupplied) },
    { key: 'totalOrders', label: 'Total Orders', sortable: true, secondary: true, align: 'num', cell: (r) => count(r.totalOrders) },
    { key: 'totalValue', label: 'Total Value (₹)', sortable: true, align: 'num', cell: (r) => <span className="inv-strong">{money(r.totalValue)}</span> },
    { key: 'state', label: 'Status', sortable: true, cell: (r) => <StatusBadge value={r.state} icon={r.state === 'preferred' ? 'star' : null} noIcon={r.state !== 'preferred'} /> },
  ], []);

  const v = detail?.vendor;
  const s = detail?.stats || {};

  const rail = picked ? (
    <Rail
      image={v?.logo}
      icon="factory" iconTone="orange"
      title={v?.name || 'Loading…'}
      sub={v?.tagline || v?.vendorCategory}
      badge={v ? <StatusBadge value={v.state} noIcon={v.state !== 'preferred'} icon={v.state === 'preferred' ? 'star' : null} /> : null}
      actions={v ? (
        <KebabMenu items={[
          { label: 'Edit vendor', icon: 'pencil', onClick: () => setForm({ vendor: v }) },
          { label: v.preferred ? 'Remove from preferred' : 'Mark as preferred', icon: 'star',
            onClick: async () => {
              try {
                await api.updateVendor(v._id, { ...v, preferred: !v.preferred });
                toast.success(v.preferred ? `${v.name} is no longer preferred` : `${v.name} marked preferred`);
                reload();
              } catch (e) { toast.error(e?.message || 'That could not be saved'); }
            } },
          { sep: true },
          { label: 'Delete vendor', icon: 'trash', danger: true, onClick: () => setDel(v) },
        ]} />
      ) : null}
      onClose={() => setPicked(null)}
      tabs={RAIL_TABS.map(x => (x.value === 'items' ? { ...x, count: s.itemsSupplied } : x))}
      tab={tab} onTab={setTab}
      foot={v ? (
        <>
          <Btn icon="history" onClick={() => setTab('orders')}>View Purchase History</Btn>
          <Btn kind="primary" icon="pencil" onClick={() => setForm({ vendor: v })}>Edit Vendor</Btn>
        </>
      ) : null}
    >
      {detailBusy && !detail ? <SkeletonRows rows={6} /> : !detail ? null : (
        <>
          {tab === 'overview' ? (
            <>
              <Block title="Contact Information" right={<IconBtn icon="pencil" kind="bare" label="Edit contact" onClick={() => setForm({ vendor: v })} />}>
                <Lines>
                  <Line icon="user">{v.contactPerson || <span className="inv-dim">No contact recorded</span>}</Line>
                  <Line icon="phone">{v.phone || <span className="inv-dim">No phone recorded</span>}</Line>
                  <Line icon="mail">{v.email || <span className="inv-dim">No email recorded</span>}</Line>
                  <Line icon="mapPin">
                    {[v.address, v.city, v.pincode ? `${v.state || ''} ${v.pincode}`.trim() : v.state].filter(Boolean).join(', ')
                      || <span className="inv-dim">No address recorded</span>}
                  </Line>
                </Lines>
              </Block>

              <Block title="Business Details" right={<IconBtn icon="pencil" kind="bare" label="Edit business details" onClick={() => setForm({ vendor: v })} />}>
                <Facts>
                  <Fact k="GST Number" v={v.gstNumber} />
                  <Fact k="PAN Number" v={v.pan} />
                  <Fact k="Vendor Category" v={v.vendorCategory ? <Badge tone="indigo" square>{v.vendorCategory}</Badge> : null} />
                  <Fact k="Payment Terms" v={v.paymentTerms} />
                  {s.deliveredOrders ? <Fact k="On-time delivery" v={`${s.onTimePct}% of ${count(s.deliveredOrders)}`} /> : null}
                  {s.outstanding ? <Fact k="Outstanding" v={money(s.outstanding)} /> : null}
                </Facts>
              </Block>

              <Block>
                <Minis>
                  <Mini icon="package" tone="indigo" value={count(s.itemsSupplied)} label="Items Supplied" />
                  <Mini icon="doc" tone="green" value={count(s.totalOrders)} label="Total Orders" />
                  <Mini icon="rupee" tone="amber" value={money(s.totalValue)} label="Total Value" />
                </Minis>
              </Block>
            </>
          ) : null}

          {tab === 'items' ? (
            <Block title={`Items supplied (${count(detail.items.length)})`}>
              {detail.items.length ? (
                <Rows>
                  {detail.items.map((it, i) => (
                    <Row key={it._id || i} image={it.image} icon={it.category?.icon || 'box'}
                      title={it.name} sub={[it.itemCode, `${count(it.quantity)} ${it.unit}`].filter(Boolean).join(' · ')}
                      end={money(it.value)} endSub={it.lastPrice ? `last ${money(it.lastPrice, { dec: 2 })}` : null} />
                  ))}
                </Rows>
              ) : <Empty icon="package" title="Nothing supplied yet" sm>This vendor has not appeared on a purchase order.</Empty>}
            </Block>
          ) : null}

          {tab === 'orders' ? (
            <Block title={`Purchase orders (${count(detail.orders.length)})`}>
              {detail.orders.length ? (
                <Rows>
                  {detail.orders.map(o => (
                    <Row key={o._id} icon="invoice" iconTone="violet"
                      title={o.poNumber} sub={`${fmtDate(o.date)} · ${count(o.itemCount)} items`}
                      end={money(o.total)} endSub={<StatusBadge value={o.state} noIcon />} />
                  ))}
                </Rows>
              ) : <Empty icon="invoice" title="No orders yet" sm>Raise a purchase order against this vendor and it is listed here.</Empty>}
            </Block>
          ) : null}

          {tab === 'payments' ? (
            <Block title="Invoices and payments">
              {detail.payments.length ? (
                <>
                  <Facts>
                    <Fact k="Billed" v={money(s.totalValue)} />
                    <Fact k="Invoiced" v={money(s.paid)} />
                    <Fact k="Outstanding" v={<span className={s.outstanding ? 'inv-danger' : undefined}>{money(s.outstanding)}</span>} />
                  </Facts>
                  <div style={{ marginTop: 14 }}>
                    <Rows>
                      {detail.payments.map(p => (
                        <Row key={p._id} icon="rupee" iconTone={p.settled ? 'green' : 'amber'}
                          title={p.invoiceNumber} sub={`${p.poNumber} · ${fmtDate(p.date)}`}
                          end={money(p.amount)} endSub={p.settled ? 'Settled' : `of ${money(p.total)}`} />
                      ))}
                    </Rows>
                  </div>
                </>
              ) : <Empty icon="rupee" title="No invoices recorded" sm>Invoice details are captured when goods are received against an order.</Empty>}
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
        icon="factory" tone="orange" title="Vendor Management"
        subtitle="Manage suppliers, track performance, pricing, and purchase history."
        art={<Art name="vendors" />}
        promises={['Maintain complete vendor information', 'Track purchase history and outstanding payments', 'Evaluate vendor performance', 'Manage multiple contacts and addresses']}
      >
        <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Add Vendor</Btn>
      </Hero>

      <Tiles cols={4}>
        <Tile icon="users" tone="indigo" value={count(t.total?.value)} label="Total Vendors"
          delta={t.total?.delta} deltaNote="from last month" spark={t.total?.series} sparkKind="bar" sparkTone="indigo" />
        <Tile icon="check" tone="green" value={count(t.active?.value)} label="Active Vendors"
          note={`${t.active?.pct ?? 0}% of total`} spark={t.total?.series} sparkKind="bar" sparkTone="green"
          onClick={() => setFilter(setStatus)('active')} />
        <Tile icon="minus" tone="amber" value={count(t.inactive?.value)} label="Inactive Vendors"
          note={`${t.inactive?.pct ?? 0}% of total`} onClick={() => setFilter(setStatus)('inactive')} />
        <Tile icon="star" tone="violet" value={count(t.preferred?.value)} label="Preferred Vendors"
          note={`${t.preferred?.pct ?? 0}% of total`} onClick={() => setFilter(setStatus)('preferred')} />
      </Tiles>

      <SplitView rail={rail}>
        <Card>
          <Filters inner>
            <Field grow>
              <Search value={q} onChange={setFilter(setQ)} placeholder="Search by vendor name, contact, GST, city…" />
            </Field>
            <Field label="Category" pick>
              <Select value={category} onChange={setFilter(setCategory)} options={d.filters?.categories || []} placeholder="All categories" />
            </Field>
            <Field label="Status" pick>
              <Select value={status} onChange={setFilter(setStatus)} placeholder="All statuses" options={[
                { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'preferred', label: 'Preferred' },
              ]} />
            </Field>
            <Field label="City" pick>
              <Select value={city} onChange={setFilter(setCity)} options={d.filters?.cities || []} placeholder="All cities" />
            </Field>
            <FilterEnd>
              <Btn kind={filtered ? 'soft' : 'ghost'} icon="filter" onClick={reset}>{filtered ? 'Clear filters' : 'Filters'}</Btn>
              <Btn icon="download" onClick={exportCsv}>Export</Btn>
              <KebabMenu items={[
                { label: 'Add vendor', icon: 'plus', onClick: () => setForm({}) },
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
                <IconBtn icon="pencil" label="Edit vendor" onClick={() => setForm({ vendor: r })} />
                <KebabMenu items={[
                  { label: 'Purchase history', icon: 'history', onClick: () => { setPicked(r._id); setTab('orders'); } },
                  { label: 'Items supplied', icon: 'package', onClick: () => { setPicked(r._id); setTab('items'); } },
                  { sep: true },
                  { label: 'Delete vendor', icon: 'trash', danger: true, onClick: () => setDel(r) },
                ]} />
              </>
            )}
            empty={
              <Empty icon="factory" title={filtered ? 'No vendors match those filters' : 'No vendors yet'}
                action={filtered
                  ? <Btn icon="refresh" onClick={reset}>Clear the filters</Btn>
                  : <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Add the first vendor</Btn>}>
                {filtered ? 'Try another category or city.' : 'A vendor is who a purchase order is raised against; their delivery record builds itself as orders are received.'}
              </Empty>
            }
          />

          <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="vendors"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
        </Card>
      </SplitView>

      <VendorForm open={!!form} vendor={form?.vendor} onClose={() => setForm(null)} onDone={reload} />
      <Confirm
        open={!!del} onClose={() => setDel(null)} onConfirm={remove} busy={busy} tone="danger"
        confirmLabel="Delete vendor" title={del ? `Delete ${del.name}?` : ''}
        message={del ? `A vendor with purchase orders against them cannot be deleted — their orders are the record of what was bought. Deactivate them instead to keep them off new orders.` : ''}
      />
    </div>
  );
}
