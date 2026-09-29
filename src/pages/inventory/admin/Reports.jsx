/**
 * Inventory → Reports.
 *
 * Every other screen in the module answers "what is happening now". None of
 * them answered the questions a school is actually asked at a budget meeting:
 * what is the stock worth, what did science spend last term, which items sit on
 * a shelf for a year, what do we need to buy.
 *
 * Six reports, one table. The server returns the same shape for all of them —
 * a title, a summary strip, typed columns and rows — so this screen renders
 * whichever is picked without knowing anything about it, and one export
 * function serves all six.
 */
import React, { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import {
  Hero, YearBar, Card, CardHead, CardBody, Filters, FilterEnd, Field, Select, DateRange,
  Btn, IconBtn, KebabMenu, DataTable, Badge, StatusBadge, Minis, Mini, Empty, Loading,
  LoadError, Note, useBoard, useInvMeta, count, money, fmtDate, words, toCsv, saveFile, Ico,
} from './invUI';
import { Art } from './invArt';

/** The six, in the order a storekeeper works through them. */
const TABS = [
  { key: 'valuation', label: 'Stock Valuation', icon: 'rupee', tone: 'green' },
  { key: 'movement', label: 'Stock Movement', icon: 'repeat', tone: 'blue' },
  { key: 'consumption', label: 'Consumption', icon: 'package', tone: 'orange' },
  { key: 'purchases', label: 'Purchases', icon: 'cart', tone: 'violet' },
  { key: 'reorder', label: 'Reorder List', icon: 'alert', tone: 'red' },
  { key: 'assets', label: 'Asset Register', icon: 'grid', tone: 'pink' },
];

/** Which filters each report can actually use. Offering the rest would be a lie. */
const USES = {
  valuation: ['category', 'warehouse'],
  movement: ['category', 'warehouse', 'dates'],
  consumption: ['category', 'warehouse', 'department', 'dates'],
  purchases: ['department', 'vendor', 'dates'],
  reorder: ['category'],
  assets: ['category', 'warehouse'],
};

export default function InventoryReports() {
  const { activeYear } = useInvMeta(api.getFormMeta);

  const [kind, setKind] = useState('valuation');
  const [category, setCategory] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [department, setDepartment] = useState('');
  const [vendor, setVendor] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });

  const load = useCallback(
    () => api.getReport(kind, { category, warehouse, department, vendor, from: range.from, to: range.to }),
    [kind, category, warehouse, department, vendor, range.from, range.to],
  );
  const { data, loading, error, reload } = useBoard(load,
    [kind, category, warehouse, department, vendor, range.from, range.to]);

  const d = data || {};
  const rows = d.rows || [];
  const uses = USES[kind] || [];
  const filtered = !!(category || warehouse || department || vendor || range.from || range.to);
  const reset = () => { setCategory(''); setWarehouse(''); setDepartment(''); setVendor(''); setRange({ from: '', to: '' }); };

  // Switching report keeps only the filters the new one understands, so a
  // category left over from the reorder list does not silently narrow the
  // purchase summary — which does not filter by category at all.
  const pick = (next) => {
    const keep = USES[next] || [];
    if (!keep.includes('category')) setCategory('');
    if (!keep.includes('warehouse')) setWarehouse('');
    if (!keep.includes('department')) setDepartment('');
    if (!keep.includes('vendor')) setVendor('');
    if (!keep.includes('dates')) setRange({ from: '', to: '' });
    setKind(next);
  };

  const cell = (col) => (r) => {
    const v = r[col.key];
    if (v === null || v === undefined || v === '') return <span className="inv-dim">—</span>;
    if (col.format === 'money') return money(v);
    if (col.format === 'num') return <span className="inv-num">{count(v)}</span>;
    if (col.format === 'date') return fmtDate(v);
    if (col.format === 'words') return <StatusBadge value={v} noIcon />;
    return v;
  };

  const columns = useMemo(
    () => (d.columns || []).map((c, i) => ({
      key: c.key, label: c.label,
      align: c.format === 'money' || c.format === 'num' ? 'num' : undefined,
      nowrap: c.format === 'date',
      primary: i === 0,
      cell: cell(c),
    })),
    [d.columns],
  );

  const exportCsv = () => {
    if (!rows.length) return toast.error('There is nothing to export');
    const cols = (d.columns || []).map(c => [c.key, c.label,
      c.format === 'date' ? (r) => (r[c.key] ? new Date(r[c.key]).toISOString().slice(0, 10) : '')
        : c.format === 'words' ? (r) => words(r[c.key]) : undefined]);
    const stamp = range.from || range.to ? `-${range.from || 'start'}_${range.to || 'today'}` : '';
    saveFile(`inventory-${kind}${stamp}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(cols, rows));
    toast.success(`Exported ${count(rows.length)} row${rows.length === 1 ? '' : 's'}`);
  };

  const print = () => {
    if (!rows.length) return toast.error('There is nothing to print');
    window.print();
  };

  if (error && !data) return <div className="inv-page"><LoadError error={error} onRetry={reload} /></div>;
  if (loading && !data) return <div className="inv-page"><Loading tiles={0} /></div>;

  return (
    <div className="inv-page">
      <YearBar year={activeYear} />

      <Hero
        icon="chart" tone="violet" kicker="Inventory"
        title="Reports"
        subtitle="What the stock is worth, what it cost, who used it and what needs buying."
        art={<Art name="dashboard" />}
        promises={[
          'Every figure is computed from the ledger, never stored',
          'Filter it, then take the same rows away as a CSV',
          'Six reports, one table — nothing to learn twice',
        ]}
      />

      {/* The report picker: a row of cards rather than a dropdown, because six
          named things a person chooses between should be visible at once. */}
      <div className="inv-reports__pick">
        {TABS.map(t => (
          <button
            key={t.key} type="button"
            className={`inv-reports__card${kind === t.key ? ' is-on' : ''}`}
            onClick={() => pick(t.key)}
            aria-pressed={kind === t.key}
          >
            <span className={`inv-mark inv-t-${t.tone} inv-mark--sm`} style={{ '--inv-mark': '34px' }}>
              <Ico name={t.icon} size={17} />
            </span>
            <span className="inv-reports__label">{t.label}</span>
          </button>
        ))}
      </div>

      <Card>
        <CardHead
          title={d.title || 'Report'} sub={d.blurb}
          icon={TABS.find(t => t.key === kind)?.icon || 'chart'}
          iconTone={TABS.find(t => t.key === kind)?.tone || 'indigo'}
          right={<>
            <Btn icon="printer" onClick={print}>Print</Btn>
            <Btn kind="primary" icon="download" onClick={exportCsv}>Export CSV</Btn>
            <KebabMenu items={[
              { label: 'Export CSV', icon: 'download', onClick: exportCsv },
              { label: 'Print', icon: 'printer', onClick: print },
              { sep: true },
              { label: 'Refresh', icon: 'refresh', onClick: reload },
            ]} />
          </>}
        />

        <CardBody>
          <Minis>
            {(d.summary || []).map((s, i) => (
              <Mini key={i} icon={TABS.find(t => t.key === kind)?.icon || 'chart'}
                tone={TABS.find(t => t.key === kind)?.tone || 'indigo'}
                value={s.money ? money(s.value) : count(s.value)} label={s.label} />
            ))}
          </Minis>
        </CardBody>

        <Filters inner>
          {uses.includes('category') ? (
            <Field label="Category" pick>
              <Select value={category} onChange={setCategory} options={d.filters?.categories || []} placeholder="All categories" />
            </Field>
          ) : null}
          {uses.includes('warehouse') ? (
            <Field label="Store" pick>
              <Select value={warehouse} onChange={setWarehouse} options={d.filters?.warehouses || []} placeholder="All stores" />
            </Field>
          ) : null}
          {uses.includes('department') ? (
            <Field label="Department" pick>
              <Select value={department} onChange={setDepartment} options={d.filters?.departments || []} placeholder="All departments" />
            </Field>
          ) : null}
          {uses.includes('vendor') ? (
            <Field label="Vendor" pick>
              <Select value={vendor} onChange={setVendor} options={d.filters?.vendors || []} placeholder="All vendors" />
            </Field>
          ) : null}
          {uses.includes('dates') ? (
            <Field label="Period" pick>
              <DateRange from={range.from} to={range.to} onChange={setRange} />
            </Field>
          ) : null}
          <FilterEnd>
            <Btn kind={filtered ? 'soft' : 'ghost'} icon="filter" onClick={reset}>
              {filtered ? 'Clear filters' : 'Filters'}
            </Btn>
          </FilterEnd>
        </Filters>

        {d.dated === false && (range.from || range.to) ? (
          <CardBody>
            <Note tone="info" title="This report is a snapshot">
              It shows what is true now, so a date range would not change it.
            </Note>
          </CardBody>
        ) : null}

        <DataTable
          columns={columns} rows={rows} loading={loading && !rows.length}
          empty={
            <Empty icon="chart" title={filtered ? 'Nothing matches those filters' : 'Nothing to report yet'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Clear the filters</Btn> : null}>
              {filtered
                ? 'Try a wider period, or clear the filters.'
                : 'Once stock moves through the module this report fills itself in.'}
            </Empty>
          }
        />

        {rows.length ? (
          <CardBody>
            <span className="inv-dim">
              {count(rows.length)} row{rows.length === 1 ? '' : 's'}
              {d.dated && (range.from || range.to)
                ? ` for ${range.from ? fmtDate(range.from) : 'the beginning'} – ${range.to ? fmtDate(range.to) : 'today'}`
                : ''}
              .
            </span>
          </CardBody>
        ) : null}
      </Card>
    </div>
  );
}
