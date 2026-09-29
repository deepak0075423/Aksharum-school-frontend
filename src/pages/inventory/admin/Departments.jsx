/**
 * Inventory → Budgets.
 *
 * A budget is its own record now, not a single number on a department:
 * `InventoryDepartment.annualBudget` could not express a Science Lab budget
 * and a Lab Consumables budget under the same department with different
 * periods. Each budget is scoped to a department, a category, or both.
 *
 * What a budget has SPENT is never stored. It is summed from the purchase
 * orders inside its scope and period on every load, so it cannot drift away
 * from the orders that caused it. The departments master is still here —
 * requests and orders are raised against it — behind "Manage departments".
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import * as api from '../../../api/inventory.api';
import {
  Hero, YearBar, Tiles, Tile, Card, CardHead, CardBody, SplitView, Rail, TabStrip, Filters,
  FilterEnd, Field, Search, Select, Btn, IconBtn, SplitBtn, KebabMenu, DataTable, Pager, Badge,
  StatusBadge, Mark, Bar, BarRow, Rows, Row, Block, Facts, Fact, Minis, Mini, Empty, Loading,
  LoadError, Confirm, SkeletonRows, ViewAll, Modal, useBoard, useDebounced, useInvMeta, useSort,
  count, money, compactMoney, fmtDate, words, toCsv, saveFile, Cell2, BUDGET_SCOPE,
} from './invUI';
import { BarLine } from './invCharts';
import { BudgetForm, DepartmentForm } from './invForms';
import { Art } from './invArt';

const RAIL_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'items', label: 'Items' },
  { value: 'history', label: 'History' },
];

export default function InventoryBudgets() {
  const nav = useNavigate();
  const { meta, activeYear } = useInvMeta(api.getFormMeta);

  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [department, setDepartment] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { sort, dir, onSort } = useSort('name', 'asc');
  const search = useDebounced(q);

  const [railTab, setRailTab] = useState('overview');
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [deptForm, setDeptForm] = useState(null);
  const [deptList, setDeptList] = useState(false);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api.getBudgetBoard({ tab, search, academicYear, department, category, status, sort, dir, page, limit }),
    [tab, search, academicYear, department, category, status, sort, dir, page, limit],
  );
  const { data, loading, error, reload } = useBoard(load,
    [tab, search, academicYear, department, category, status, sort, dir, page, limit]);

  const d = data || {};
  const rows = d.rows || [];
  const t = d.tiles || {};
  const tabs = d.tabs || {};

  const [picked, setPicked] = useState(null);

  useEffect(() => {
    if (!picked) { setDetail(null); return undefined; }
    let alive = true;
    setDetailBusy(true);
    api.getBudgetDetail(picked)
      .then((r) => { if (alive) setDetail(r?.data ?? r); })
      .catch((e) => { if (alive) { toast.error(e?.message || 'That budget could not be loaded'); setPicked(null); } })
      .finally(() => { if (alive) setDetailBusy(false); });
    return () => { alive = false; };
  }, [picked, data]);

  const setFilter = (fn) => (v) => { fn(v); setPage(1); };
  const reset = () => { setQ(''); setAcademicYear(''); setDepartment(''); setCategory(''); setStatus(''); setPage(1); };
  const filtered = !!(search || academicYear || department || category || status);

  const exportCsv = () => {
    saveFile(`budgets-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['name', 'Budget Name'], ['code', 'Code'],
      ['department', 'Department', (r) => r.department?.name || ''],
      ['category', 'Category', (r) => r.category?.name || ''],
      ['allocated', 'Allocated Amount'], ['spent', 'Spent Amount'], ['remaining', 'Remaining'],
      ['usage', 'Usage %'],
      ['state', 'Status', (r) => words(r.state)],
      ['period', 'Period', (r) => `${fmtDate(r.periodStart, '')} – ${fmtDate(r.periodEnd, '')}`],
    ], rows));
    toast.success('Exported the budgets on this page');
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteBudget(del._id);
      toast.success(`${del.name} deleted`);
      if (String(picked) === String(del._id)) setPicked(null);
      setDel(null); reload();
    } catch (e) { toast.error(e?.message || 'That budget could not be deleted'); }
    finally { setBusy(false); }
  };

  const period = (r) => (r.periodStart || r.periodEnd
    ? `${r.periodStart ? new Date(r.periodStart).toLocaleString('en-IN', { month: 'short', year: 'numeric' }) : 'Any'} - ${r.periodEnd ? new Date(r.periodEnd).toLocaleString('en-IN', { month: 'short', year: 'numeric' }) : 'Open'}`
    : 'No period set');

  const columns = useMemo(() => [
    {
      key: 'name', label: 'Budget Name', sortable: true, primary: true,
      cell: (r) => (
        <span className="inv-cellrow">
          <Mark name={r.icon} tone="rose" size={32} glyph={16} />
          <Cell2 top={r.name} sub={r.code} />
        </span>
      ),
    },
    { key: 'department', label: 'Department', sortable: true, cell: (r) => r.department?.name || <span className="inv-dim">—</span> },
    { key: 'category', label: 'Category', sortable: true, secondary: true, cell: (r) => r.category?.name || <span className="inv-dim">—</span> },
    { key: 'allocated', label: 'Allocated Amount (₹)', sortable: true, secondary: true, align: 'num', cell: (r) => money(r.allocated) },
    { key: 'spent', label: 'Spent Amount (₹)', sortable: true, align: 'num', cell: (r) => money(r.spent) },
    {
      key: 'remaining', label: 'Remaining (₹)', sortable: true, align: 'num',
      cell: (r) => (r.remaining < 0
        ? <Badge tone="red" square>{money(r.remaining)}</Badge>
        : <span className="inv-strong">{money(r.remaining)}</span>),
    },
    { key: 'usage', label: 'Usage', sortable: true, cell: (r) => <BarRow value={Math.min(r.usage, 100)} max={100} showPct={false} color={r.usage >= 100 ? '#ef4444' : r.usage >= 85 ? '#f59e0b' : '#22c55e'} /> },
    { key: 'state', label: 'Status', cell: (r) => <StatusBadge value={r.state} noIcon /> },
    { key: 'period', label: 'Period', nowrap: true, secondary: true, cell: (r) => <span className="inv-dim">{period(r)}</span> },
  ], []);

  const b = detail?.budget;
  const s = detail?.stats || {};

  const rail = picked ? (
    <Rail
      icon={b?.icon || 'wallet'} iconTone="rose"
      title={b?.name || 'Loading…'}
      sub={b ? `Budget Code ${b.code || '—'}` : null}
      badge={b ? <StatusBadge value={b.state} noIcon /> : null}
      actions={b ? (
        <KebabMenu items={[
          { label: 'Edit budget', icon: 'pencil', onClick: () => setForm({ budget: b }) },
          { label: 'View its orders', icon: 'fileDoc', onClick: () => nav('/admin/inventory/orders') },
          { sep: true },
          { label: 'Delete budget', icon: 'trash', danger: true, onClick: () => setDel(b) },
        ]} />
      ) : null}
      onClose={() => setPicked(null)}
      tabs={RAIL_TABS.map(x => (x.value === 'expenses' ? { ...x, count: s.orders } : x))}
      tab={railTab} onTab={setRailTab}
      foot={b ? (
        <>
          <Btn icon="invoice" onClick={() => setRailTab('expenses')}>View Expenses</Btn>
          <Btn kind="primary" icon="pencil" onClick={() => setForm({ budget: b })}>Edit Budget</Btn>
        </>
      ) : null}
    >
      {detailBusy && !detail ? <SkeletonRows rows={6} /> : !detail ? null : (
        <>
          {railTab === 'overview' ? (
            <>
              <Block title="Budget Information" right={<IconBtn icon="pencil" kind="bare" label="Edit" onClick={() => setForm({ budget: b })} />}>
                <Facts>
                  <Fact k="Department" v={b.department?.name} />
                  <Fact k="Category" v={b.category?.name} />
                  <Fact k="Covers" v={BUDGET_SCOPE[b.scope] || words(b.scope)} />
                  <Fact k="Academic Year" v={b.academicYear?.name} />
                  <Fact k="Period" v={`${fmtDate(b.periodStart)} - ${fmtDate(b.periodEnd)}`} />
                  <Fact k="Allocated Amount" v={money(b.allocated)} />
                  <Fact k="Description" v={b.description} />
                </Facts>
              </Block>

              <Block title="Budget Utilization" right={<strong style={{ fontSize: '.95rem' }}>{s.usage}%</strong>}>
                <Bar value={Math.min(s.usage, 100)} max={100} lg
                  color={s.usage >= 100 ? '#ef4444' : s.usage >= 85 ? '#f59e0b' : '#22c55e'} />
                <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: '.82rem', color: 'var(--inv-muted)', flexWrap: 'wrap' }}>
                  <span><i className="inv-dot inv-dot--green" /> Spent {money(s.spent)}</span>
                  <span><i className="inv-dot inv-dot--amber" /> Remaining {money(s.remaining)}</span>
                </div>
                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: '.88rem' }}>
                  <span style={{ color: 'var(--inv-muted)' }}>Total Budget</span>
                  <strong>{money(s.allocated)}</strong>
                </div>
              </Block>

              <Block title="Recent Expenses" right={<ViewAll onClick={() => setRailTab('expenses')} />}>
                {detail.expenses.length ? (
                  <Rows>
                    {detail.expenses.slice(0, 4).map(e => (
                      <Row key={e._id} icon="invoice" iconTone="violet" title={e.title}
                        sub={fmtDate(e.date)} end={money(e.amount)} />
                    ))}
                  </Rows>
                ) : <Empty icon="rupee" title="Nothing spent yet" sm>No purchase order has been charged to this budget.</Empty>}
              </Block>
            </>
          ) : null}

          {railTab === 'expenses' ? (
            <Block title={`Expenses (${count(detail.expenses.length)})`}>
              {detail.expenses.length ? (
                <Rows>
                  {detail.expenses.map(e => (
                    <Row key={e._id} icon="invoice" iconTone="violet" title={e.poNumber}
                      sub={[e.vendor, fmtDate(e.date), e.partial ? 'part of the order' : null].filter(Boolean).join(' · ')}
                      end={money(e.amount)} endSub={<StatusBadge value={e.state} noIcon />} />
                  ))}
                </Rows>
              ) : <Empty icon="invoice" title="No expenses" sm>Spend appears the moment an order inside this budget's scope and period is raised.</Empty>}
            </Block>
          ) : null}

          {railTab === 'items' ? (
            <Block title="What the money went on">
              {detail.items.length ? (
                <Rows>
                  {detail.items.map((it, i) => (
                    <Row key={it._id || i} image={it.image} icon={it.category?.icon || 'box'} title={it.name}
                      sub={`${count(it.quantity)} purchased`} end={money(it.amount)} />
                  ))}
                </Rows>
              ) : <Empty icon="package" title="Nothing purchased yet" sm>Items appear here once an order charged to this budget is raised.</Empty>}
            </Block>
          ) : null}

          {railTab === 'history' ? (
            <Block title="Spend by month">
              {detail.history.length ? (
                <Rows>
                  {detail.history.map(h => (
                    <Row key={h.month} icon="chart" iconTone="indigo" title={h.label} end={money(h.amount)} />
                  ))}
                </Rows>
              ) : <Empty icon="chart" title="No history yet" sm>Once orders are charged here, their months are listed.</Empty>}
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
        icon="wallet" tone="rose" title="Budget Management"
        subtitle="Plan, allocate and monitor inventory budgets across departments, categories and academic years with real-time tracking and variance analysis."
        art={<Art name="budgets" />}
        promises={['Set annual and department-wise budgets', 'Track actual vs budgeted expenses', 'Get alerts on budget overrun', 'Generate reports and export data']}
      >
        <SplitBtn label="Create Budget" icon="plus" onClick={() => setForm({})} items={[
          { label: 'Create a budget', icon: 'plus', onClick: () => setForm({}) },
          { label: 'Manage departments', icon: 'building', onClick: () => setDeptList(true) },
          { sep: true },
          { label: 'Export this page', icon: 'download', onClick: exportCsv },
        ]} />
      </Hero>

      <Tiles cols={4}>
        <Tile icon="bank" tone="indigo" value={money(t.allocated?.value)} label="Total Budget Allocation" small
          delta={t.allocated?.delta} deltaNote="from last year" spark={t.allocated?.series} sparkKind="bar" sparkTone="indigo" />
        <Tile icon="coins" tone="green" value={money(t.spent?.value)} label="Total Spent" small
          note={`${t.spent?.pct ?? 0}% of allocated`} spark={t.spent?.series} sparkKind="bar" sparkTone="green" />
        <Tile icon="wallet" tone="amber" value={money(t.remaining?.value)} label="Remaining Budget" small
          note={`${t.remaining?.pct ?? 0}% of allocated`} />
        <Tile icon="alert" tone="red" value={count(t.over?.value)} label="Over Budget Departments"
          foot={<ViewAll onClick={() => setFilter(setStatus)('over_budget')}>View details</ViewAll>} />
      </Tiles>

      <SplitView rail={rail}>
        <Card>
          <TabStrip
            value={tab} onChange={(v) => { setTab(v); setPage(1); }}
            items={[
              { value: 'all', label: 'All Budgets', count: tabs.all },
              { value: 'department', label: 'Department Budgets', count: tabs.department },
              { value: 'category', label: 'Category Budgets', count: tabs.category },
              { value: 'monthly', label: 'Monthly Overview' },
            ]}
          />

          {tab === 'monthly' ? (
            <CardBody>
              <BarLine
                data={d.monthly || []}
                bar={{ key: 'spent', label: 'Spent', color: '#4f46e5' }}
                line={{ key: 'allocated', label: 'Allocated (monthly share)', color: '#f59e0b' }}
                fmtLeft={compactMoney} fmtRight={compactMoney} height={260}
              />
            </CardBody>
          ) : (
            <>
              <Filters inner>
                <Field label="Academic Year" pick>
                  <Select value={academicYear} onChange={setFilter(setAcademicYear)} options={d.filters?.years || []} placeholder="All years" />
                </Field>
                <Field label="Department" pick>
                  <Select value={department} onChange={setFilter(setDepartment)} options={d.filters?.departments || []} placeholder="All departments" />
                </Field>
                <Field label="Category" pick>
                  <Select value={category} onChange={setFilter(setCategory)} options={d.filters?.categories || []} placeholder="All categories" />
                </Field>
                <Field label="Status" pick>
                  <Select value={status} onChange={setFilter(setStatus)} placeholder="All statuses" options={[
                    { value: 'active', label: 'Active' }, { value: 'near_limit', label: 'Near Limit' },
                    { value: 'over_budget', label: 'Over Budget' }, { value: 'closed', label: 'Closed' },
                  ]} />
                </Field>
                <Field grow>
                  <Search value={q} onChange={setFilter(setQ)} placeholder="Search budgets by name, department…" />
                </Field>
                <FilterEnd>
                  <Btn kind={filtered ? 'soft' : 'ghost'} icon="filter" onClick={reset}>{filtered ? 'Clear filters' : 'Filters'}</Btn>
                  <Btn icon="download" onClick={exportCsv}>Export</Btn>
                  <KebabMenu items={[
                    { label: 'Create budget', icon: 'plus', onClick: () => setForm({}) },
                    { label: 'Manage departments', icon: 'building', onClick: () => setDeptList(true) },
                  ]} />
                </FilterEnd>
              </Filters>

              <DataTable
                columns={columns} rows={rows} loading={loading && !rows.length}
                sort={sort} dir={dir} onSort={(k) => { onSort(k); setPage(1); }}
                pickedId={picked} onRowClick={(r) => { setPicked(r._id); setRailTab('overview'); }}
                actions={(r) => (
                  <>
                    <IconBtn icon="eye" label="Open details" onClick={() => { setPicked(r._id); setRailTab('overview'); }} />
                    <IconBtn icon="pencil" label="Edit budget" onClick={() => setForm({ budget: r })} />
                    <KebabMenu items={[
                      { label: 'View expenses', icon: 'fileDoc', onClick: () => { setPicked(r._id); setRailTab('expenses'); } },
                      { sep: true },
                      { label: 'Delete budget', icon: 'trash', danger: true, onClick: () => setDel(r) },
                    ]} />
                  </>
                )}
                empty={
                  <Empty icon="wallet" title={filtered || tab !== 'all' ? 'No budgets match' : 'No budgets yet'}
                    action={filtered || tab !== 'all'
                      ? <Btn icon="refresh" onClick={() => { reset(); setTab('all'); }}>Clear the filters</Btn>
                      : <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Create the first budget</Btn>}>
                    {filtered || tab !== 'all'
                      ? 'Try another year, department or status.'
                      : 'A budget is a pot of money scoped to a department, a category or both. What it has spent is summed from the purchase orders inside it.'}
                  </Empty>
                }
              />

              <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="budgets"
                onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} limits={[10, 25, 50]} />
            </>
          )}
        </Card>
      </SplitView>

      <BudgetForm open={!!form} budget={form?.budget} meta={meta} onClose={() => setForm(null)} onDone={reload} />
      <DepartmentForm open={!!deptForm} department={deptForm?.department} onClose={() => setDeptForm(null)} onDone={reload} />
      <Confirm
        open={!!del} onClose={() => setDel(null)} onConfirm={remove} busy={busy} tone="danger"
        confirmLabel="Delete budget" title={del ? `Delete ${del.name}?` : ''}
        message={del ? `A budget that purchase orders were charged to cannot be deleted — it is the only record of what they were charged against. Close it instead.` : ''}
      />

      {/* Departments are still the master requests and orders are raised
          against; the mockup has no screen for them, so they live here. */}
      <Modal
        open={deptList} onClose={() => setDeptList(false)} icon="building" iconTone="teal"
        title="Departments" sub="Requests and purchase orders are raised against these."
        foot={
          <>
            <Btn onClick={() => setDeptList(false)}>Close</Btn>
            <Btn kind="primary" icon="plus" onClick={() => setDeptForm({})}>Add department</Btn>
          </>
        }
      >
        {(meta.departments || []).length ? (
          <Rows>
            {meta.departments.map(dep => (
              <Row key={dep._id} icon="building" iconTone="teal" title={dep.name}
                sub={(() => {
                  const mine = rows.filter(b => b.departmentId === String(dep._id));
                  return mine.length
                    ? `${count(mine.length)} budget${mine.length === 1 ? '' : 's'} · ${money(mine.reduce((s2, b) => s2 + b.allocated, 0))} allocated`
                    : 'No budget covers this department yet';
                })()}
                onClick={() => setDeptForm({ department: dep })} />
            ))}
          </Rows>
        ) : <Empty icon="building" title="No departments yet" sm>Add one and it becomes available on requests, orders and budgets.</Empty>}
      </Modal>
    </div>
  );
}
