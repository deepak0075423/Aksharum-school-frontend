/**
 * Inventory → Assets.
 *
 * The register of things tracked one by one rather than by quantity: a laptop,
 * a projector, a bus. Where an item asks "how many are there", an asset asks
 * "where is this one, who has it, and what is due on it".
 *
 * "Due for renewal" is the soonest of a warranty, an AMC, an insurance policy
 * or a service date falling inside 60 days — one asset counted once, however
 * many of the four are due.
 */
import React, { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import {
  Hero, YearBar, Tiles, Tile, Strip, Card, CardHead, CardBody, Filters, FilterEnd, Field,
  Search, Select, Btn, IconBtn, SplitBtn, KebabMenu, DataTable, Pager, Badge, StatusBadge,
  Thumb, Rows, Row, Rail, Facts, Fact, Block, Empty, Loading, LoadError, Confirm, ViewAll, Note,
  useBoard, useDebounced, useInvMeta, useSort, count, money, fmtDate, words, toCsv, saveFile,
  Cell2, plural,
} from './invUI';
import { Donut, VBars, STATE_COLOR } from './invCharts';
import { AssetForm, AssetStateForm, RepairForm, RepairUpdateForm } from './invForms';
import { Art } from './invArt';

export default function InventoryAssets() {
  const { meta, activeYear } = useInvMeta(api.getFormMeta);

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('');
  const [condition, setCondition] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const { sort, dir, onSort } = useSort('assetCode', 'asc');
  const search = useDebounced(q);

  const [form, setForm] = useState(null);
  const [stateForm, setStateForm] = useState(null);
  const [repair, setRepair] = useState(null);        // asset to log a fault against
  const [repairEdit, setRepairEdit] = useState(null); // { asset, repair }
  const [view, setView] = useState(null);
  const [viewTab, setViewTab] = useState('overview');
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api.getAssetBoard({ search, category, location, status, condition, sort, dir, page, limit }),
    [search, category, location, status, condition, sort, dir, page, limit],
  );
  const { data, loading, error, reload } = useBoard(load, [search, category, location, status, condition, sort, dir, page, limit]);

  const d = data || {};
  const rows = d.rows || [];
  const t = d.tiles || {};

  const setFilter = (fn) => (v) => { fn(v); setPage(1); };
  const reset = () => { setQ(''); setCategory(''); setLocation(''); setStatus(''); setCondition(''); setPage(1); };
  const filtered = !!(search || category || location || status || condition);

  const exportCsv = () => {
    saveFile(`assets-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['assetCode', 'Asset Code'], ['name', 'Asset Name'],
      ['category', 'Category', (r) => r.category?.name || ''],
      ['location', 'Location'],
      ['assignedTo', 'Assigned To', (r) => r.assignedTo?.name || ''],
      ['purchaseDate', 'Purchase Date', (r) => fmtDate(r.purchaseDate, '')],
      ['currentValue', 'Value'],
      ['state', 'Status', (r) => words(r.state)],
      ['condition', 'Condition', (r) => words(r.condition)],
      ['nextMaintenance', 'Next Maintenance', (r) => fmtDate(r.nextMaintenance, '')],
    ], rows));
    toast.success('Exported the assets on this page');
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteAsset(del._id);
      toast.success(`${del.name} removed from the register`);
      setDel(null); reload();
    } catch (e) { toast.error(e?.message || 'That asset could not be removed'); }
    finally { setBusy(false); }
  };

  const columns = useMemo(() => [
    { key: 'assetCode', label: 'Asset Code', sortable: true, nowrap: true, cell: (r) => <span className="inv-strong inv-num">{r.assetCode}</span> },
    {
      key: 'name', label: 'Asset Name', sortable: true, primary: true,
      cell: (r) => (
        <span className="inv-cellrow">
          <Thumb src={r.image} icon={r.category?.icon || 'monitor'} tone="pink" />
          <Cell2 top={r.name} sub={r.serialNumber ? `SN ${r.serialNumber}` : null} />
        </span>
      ),
    },
    { key: 'category', label: 'Category', sortable: true, cell: (r) => r.category?.name || <span className="inv-dim">—</span> },
    { key: 'location', label: 'Location', sortable: true, cell: (r) => r.location || <span className="inv-dim">—</span> },
    {
      key: 'assignedTo', label: 'Assigned To', sortable: true,
      cell: (r) => (r.assignedTo?.name ? <span className="inv-trunc">{r.assignedTo.name}</span> : <span className="inv-dim">Not Assigned</span>),
    },
    { key: 'purchaseDate', label: 'Purchase Date', sortable: true, nowrap: true, cell: (r) => fmtDate(r.purchaseDate) },
    { key: 'value', label: 'Value (₹)', sortable: true, align: 'num', cell: (r) => money(r.currentValue) },
    { key: 'state', label: 'Status', sortable: true, cell: (r) => <StatusBadge value={r.state} noIcon /> },
    { key: 'condition', label: 'Condition', sortable: true, cell: (r) => <StatusBadge value={r.condition} square noIcon /> },
    {
      key: 'nextMaintenance', label: 'Next Maintenance', sortable: true, nowrap: true,
      cell: (r) => (r.nextMaintenance ? fmtDate(r.nextMaintenance) : <span className="inv-dim">–</span>),
    },
  ], []);

  if (error && !data) return <div className="inv-page"><LoadError error={error} onRetry={reload} /></div>;
  if (loading && !data) return <div className="inv-page"><Loading tiles={5} cards={3} /></div>;

  return (
    <div className="inv-page">
      <YearBar year={activeYear} />

      <Hero
        icon="monitor" tone="pink" title="Asset Management"
        subtitle="Track and manage all school assets like computers, furniture, lab equipment, vehicles, etc."
        art={<Art name="assets" />}
        promises={['Maintain asset details and location', 'Track status and assignments', 'Schedule maintenance and expiry', 'View complete asset history']}
      >
        <SplitBtn label="Add Asset" icon="plus" onClick={() => setForm({})} items={[
          { label: 'Add one asset', icon: 'plus', onClick: () => setForm({}) },
          { label: 'Export the register', icon: 'download', onClick: exportCsv },
        ]} />
      </Hero>

      <Tiles cols={5}>
        <Tile icon="boxes" tone="indigo" value={count(t.total?.value)} label="Total Assets"
          delta={t.total?.delta} deltaNote="from last month" spark={t.total?.series} sparkKind="bar" sparkTone="indigo" />
        <Tile icon="check" tone="green" value={count(t.inUse?.value)} label="In Use"
          note={`${t.inUse?.pct ?? 0}% of total`} spark={t.total?.series} sparkKind="bar" sparkTone="green"
          onClick={() => setFilter(setStatus)('in_use')} />
        <Tile icon="wrench" tone="amber" value={count(t.maintenance?.value)} label="Under Maintenance"
          note={`${t.maintenance?.pct ?? 0}% of total`} onClick={() => setFilter(setStatus)('under_maintenance')} />
        <Tile icon="alert" tone="red" value={count(t.outOfService?.value)} label="Out of Service"
          note={`${t.outOfService?.pct ?? 0}% of total`} onClick={() => setFilter(setStatus)('out_of_service')} />
        <Tile icon="clock" tone="violet" value={count(t.renewals?.value)} label="Due for Renewal"
          note={`${t.renewals?.pct ?? 0}% of total`} />
      </Tiles>

      <Strip cols={3}>
        <Card>
          <CardHead title="Asset Distribution by Category" />
          <CardBody>
            {d.distribution?.total ? (
              <Donut slices={d.distribution.slices} total={d.distribution.total} unit="Assets"
                onPick={(s) => (s.key !== 'others' && s.key !== 'none' ? setFilter(setCategory)(s.key) : null)} />
            ) : <Empty icon="monitor" title="No assets yet" sm>Add an asset and the split by category appears here.</Empty>}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Asset Status Overview" />
          <CardBody>
            <VBars bars={d.statusBars || []} height={196} />
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Upcoming Renewals / Maintenance" right={<ViewAll onClick={() => { onSort('nextMaintenance'); setPage(1); }} />} />
          <CardBody tight>
            {d.renewals?.length ? (
              <Rows>
                {d.renewals.map(a => (
                  <Row
                    key={a._id} image={a.image} icon={a.category?.icon || 'monitor'} iconTone="pink"
                    title={`${a.name} (${a.assetCode})`}
                    sub={<span className="inv-danger">{a.renewal.label} in {plural(a.renewal.days, 'day')}</span>}
                    endSub={<Badge tone={a.renewal.days <= 7 ? 'red' : 'sky'} square>{fmtDate(a.renewal.date)}</Badge>}
                    onClick={() => { setView(a); setViewTab('overview'); }}
                  />
                ))}
              </Rows>
            ) : <Empty icon="check" title="Nothing falls due soon" sm>No warranty, AMC, insurance or service date lands inside the next 60 days.</Empty>}
          </CardBody>
        </Card>
      </Strip>

      <Card>
        <Filters inner>
          <Field grow>
            <Search value={q} onChange={setFilter(setQ)} placeholder="Search assets by name, code, category, location…" />
          </Field>
          <Field label="Category" pick>
            <Select value={category} onChange={setFilter(setCategory)} options={d.filters?.categories || []} placeholder="All categories" />
          </Field>
          <Field label="Location" pick>
            <Select value={location} onChange={setFilter(setLocation)} options={d.filters?.locations || []} placeholder="All locations" />
          </Field>
          <Field label="Status" pick>
            <Select value={status} onChange={setFilter(setStatus)} placeholder="All status" options={[
              { value: 'in_use', label: 'In Use' }, { value: 'in_store', label: 'In Store' },
              { value: 'under_maintenance', label: 'Under Maintenance' },
              { value: 'out_of_service', label: 'Out of Service' }, { value: 'retired', label: 'Retired' },
            ]} />
          </Field>
          <Field label="Condition" pick>
            <Select value={condition} onChange={setFilter(setCondition)} placeholder="All conditions" options={[
              { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' },
              { value: 'poor', label: 'Poor' }, { value: 'damaged', label: 'Damaged' },
            ]} />
          </Field>
          <FilterEnd>
            <Btn kind={filtered ? 'soft' : 'ghost'} icon="filter" onClick={reset}>{filtered ? 'Clear filters' : 'Filters'}</Btn>
            <Btn icon="download" onClick={exportCsv}>Export</Btn>
            <KebabMenu items={[
              { label: 'Add asset', icon: 'plus', onClick: () => setForm({}) },
              { label: 'Export this page', icon: 'download', onClick: exportCsv },
            ]} />
          </FilterEnd>
        </Filters>

        <DataTable
          className="inv-table--dense"
          columns={columns} rows={rows} loading={loading && !rows.length}
          sort={sort} dir={dir} onSort={(k) => { onSort(k); setPage(1); }}
          actions={(r) => (
            <>
              <IconBtn icon="eye" label="View asset" onClick={() => setView(r)} />
              <KebabMenu items={[
                { label: 'Edit asset', icon: 'pencil', onClick: () => setForm({ asset: r }) },
                { label: 'Change status or holder', icon: 'sliders', onClick: () => setStateForm(r) },
                r.openRepair
                  ? { label: 'Update the open repair', icon: 'wrench', onClick: () => setRepairEdit({ asset: r, repair: r.openRepair }) }
                  : { label: 'Log a repair', icon: 'wrench', onClick: () => setRepair(r) },
                { sep: true },
                { label: 'Remove from register', icon: 'trash', danger: true, onClick: () => setDel(r) },
              ]} />
            </>
          )}
          empty={
            <Empty icon="monitor" title={filtered ? 'No assets match those filters' : 'The asset register is empty'}
              action={filtered
                ? <Btn icon="refresh" onClick={reset}>Clear the filters</Btn>
                : <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Add the first asset</Btn>}>
              {filtered ? 'Try another category, location or status.' : 'Anything expensive enough to be tracked one by one belongs here — a laptop, a projector, a bus.'}
            </Empty>
          }
        />

        <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="assets"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
      </Card>

      <AssetForm open={!!form} asset={form?.asset} meta={meta} onClose={() => setForm(null)} onDone={reload} />
      <AssetStateForm open={!!stateForm} asset={stateForm} meta={meta} onClose={() => setStateForm(null)} onDone={reload} />
      <RepairForm open={!!repair} asset={repair} onClose={() => setRepair(null)} onDone={reload} />
      <RepairUpdateForm open={!!repairEdit} asset={repairEdit?.asset} repair={repairEdit?.repair}
        onClose={() => setRepairEdit(null)} onDone={reload} />
      <Confirm
        open={!!del} onClose={() => setDel(null)} onConfirm={remove} busy={busy} tone="danger"
        confirmLabel="Remove asset" title={del ? `Remove ${del.name}?` : ''}
        message={del ? `${del.assetCode} will be deleted from the register along with its repair history. If it is simply no longer in use, marking it Retired keeps the record.` : ''}
      />

      {view ? (
        <Rail
          image={view.image} icon={view.category?.icon || 'monitor'} iconTone="pink"
          title={view.name}
          sub={`${view.assetCode}${view.serialNumber ? ` · SN ${view.serialNumber}` : ''}`}
          badge={<StatusBadge value={view.state} noIcon />}
          onClose={() => setView(null)}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'money', label: 'Money' },
            { value: 'cover', label: 'Cover & service' },
            { value: 'repairs', label: 'Repairs', count: view.repairs },
          ]}
          tab={viewTab} onTab={setViewTab}
          foot={
            <>
              <Btn icon="wrench" onClick={() => { setStateForm(view); setView(null); }}>Change status</Btn>
              <Btn kind="primary" icon="pencil" onClick={() => { setForm({ asset: view }); setView(null); }}>Edit asset</Btn>
            </>
          }
        >
          {viewTab === 'overview' ? (
            <Block title="Where it is">
              <Facts>
                <Fact k="Condition" v={<StatusBadge value={view.condition} square noIcon />} />
                <Fact k="Category" v={view.category?.name} />
                <Fact k="Location" v={view.location} />
                <Fact k="Store" v={view.warehouse?.name} />
                <Fact k="Assigned to" v={view.assignedTo?.name || 'Not assigned'} />
              </Facts>
            </Block>
          ) : null}

          {viewTab === 'money' ? (
            <Block title="Money">
              <Facts>
                <Fact k="Purchased" v={fmtDate(view.purchaseDate)} />
                <Fact k="Purchase cost" v={money(view.purchaseCost)} />
                <Fact k="Current value" v={money(view.currentValue)} />
              </Facts>
            </Block>
          ) : null}

          {viewTab === 'cover' ? (
            <>
              <Block title="Cover and service">
                <Facts>
                  <Fact k="Warranty expires" v={fmtDate(view.warrantyExpiry)} />
                  <Fact k="AMC expires" v={fmtDate(view.amcExpiry)} />
                  <Fact k="Insurance expires" v={fmtDate(view.insuranceExpiry)} />
                  <Fact k="Next maintenance" v={fmtDate(view.nextMaintenance)} />
                  <Fact k="Repairs logged" v={count(view.repairs)} />
                </Facts>
              </Block>
            </>
          ) : null}

          {viewTab === 'repairs' ? (
            <Block
              title={`Repairs (${count(view.repairs)})`}
              right={<Btn size="sm" icon="plus" onClick={() => { setRepair(view); setView(null); }}>Log a repair</Btn>}
            >
              {view.repairLog?.length ? (
                <>
                  <Rows>
                    {view.repairLog.map(rp => (
                      <Row
                        key={rp._id}
                        icon={rp.open ? 'wrench' : 'check'} iconTone={rp.open ? 'amber' : 'green'}
                        title={rp.complaint}
                        sub={[words(rp.status), rp.technician, fmtDate(rp.reportedAt)].filter(Boolean).join(' · ')}
                        end={rp.cost ? money(rp.cost) : null}
                        endSub={rp.open ? 'Open' : `Closed ${fmtDate(rp.completedAt)}`}
                        onClick={() => { setRepairEdit({ asset: view, repair: rp }); setView(null); }}
                      />
                    ))}
                  </Rows>
                  {view.repairSpend ? (
                    <div style={{ marginTop: 14 }}>
                      <Facts><Fact k="Spent on repairs" v={money(view.repairSpend)} /></Facts>
                    </div>
                  ) : null}
                </>
              ) : (
                <Empty icon="wrench" title="Never repaired" sm
                  action={<Btn kind="primary" icon="plus" onClick={() => { setRepair(view); setView(null); }}>Log a repair</Btn>}>
                  Logging a fault marks the asset under maintenance until the repair is closed.
                </Empty>
              )}
            </Block>
          ) : null}
        </Rail>
      ) : null}
    </div>
  );
}
