/**
 * Inventory → Issue / Return.
 *
 * The table lists TRANSACTIONS, not issues: a row when something goes out and
 * another row when part of it comes back. Returns used to be folded into the
 * issue record as one quantity and one date, so a second partial return
 * overwrote the first one's condition — each return is now its own numbered
 * event, which is what makes the Returns tab real.
 *
 * "Overdue" is derived, never stored: still outstanding, with an expected
 * return date in the past. A consumable is marked as not coming back at all,
 * so it stops counting as a pending return forever.
 */
import React, { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import {
  Hero, YearBar, Tiles, Tile, Card, TabStrip, Filters, FilterEnd, Field, Search, Select,
  DateRange, Btn, IconBtn, KebabMenu, DataTable, Pager, Badge, StatusBadge, ItemCell, Who,
  Rail, Facts, Fact, Block, Note, Empty, Loading, LoadError, useBoard, useDebounced,
  useInvMeta, useSort, count, fmtDate, words, toCsv, saveFile, USER_TYPE, Ico, openHtmlWindow,
} from './invUI';
import { IssueForm, ReturnForm } from './invForms';
import { Art } from './invArt';

export default function InventoryIssues() {
  const { meta, activeYear } = useInvMeta(api.getFormMeta);

  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [userType, setUserType] = useState('');
  const [category, setCategory] = useState('');
  const [user, setUser] = useState('');
  const [department, setDepartment] = useState('');
  const [condition, setCondition] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const { sort, dir, onSort } = useSort('date', 'desc');
  const search = useDebounced(q);

  const [issue, setIssue] = useState(null);
  const [ret, setRet] = useState(null);
  const [view, setView] = useState(null);

  const load = useCallback(
    () => api.getIssueBoard({
      tab, search, type, status, userType, category, user, department, condition,
      from: range.from, to: range.to, sort, dir, page, limit,
    }),
    [tab, search, type, status, userType, category, user, department, condition, range.from, range.to, sort, dir, page, limit],
  );
  const { data, loading, error, reload } = useBoard(load,
    [tab, search, type, status, userType, category, user, department, condition, range.from, range.to, sort, dir, page, limit]);

  const d = data || {};
  const rows = d.rows || [];
  const t = d.tiles || {};
  const tabs = d.tabs || {};

  const setFilter = (fn) => (v) => { fn(v); setPage(1); };
  const reset = () => {
    setQ(''); setType(''); setStatus(''); setUserType(''); setCategory('');
    setUser(''); setDepartment(''); setCondition(''); setRange({ from: '', to: '' }); setPage(1);
  };
  const filtered = !!(search || type || status || userType || category || user || department || condition || range.from || range.to);

  // The slip the person taking the stock signs — theirs to produce again when
  // they bring it back. Rendered by services/inventoryDocs on the server.
  const printSlip = (r) => openHtmlWindow(() => api.getIssueSlip(r.issueId || r._id))
    .catch((e) => toast.error(e?.message || 'That slip could not be prepared'));

  const exportCsv = () => {
    saveFile(`issue-return-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['txnNumber', 'Txn No.'],
      ['date', 'Date', (r) => fmtDate(r.date)],
      ['kind', 'Type', (r) => words(r.kind)],
      ['item', 'Item', (r) => r.item?.name || ''],
      ['code', 'Code', (r) => r.item?.itemCode || ''],
      ['user', 'User', (r) => r.user?.name || ''],
      ['place', 'Department/Class'],
      ['quantity', 'Qty'],
      ['condition', 'Condition', (r) => words(r.condition)],
      ['expectedReturn', 'Expected Return', (r) => fmtDate(r.expectedReturn, '')],
      ['state', 'Status', (r) => words(r.state)],
    ], rows));
    toast.success('Exported the transactions on this page');
  };

  const columns = useMemo(() => [
    { key: 'txnNumber', label: 'Txn No.', sortable: true, nowrap: true, cell: (r) => <span className="inv-strong inv-num">{r.txnNumber}</span> },
    { key: 'date', label: 'Date', sortable: true, nowrap: true, cell: (r) => fmtDate(r.date) },
    {
      key: 'kind', label: 'Type', sortable: true,
      cell: (r) => (r.kind === 'issue'
        ? <Badge tone="blue" icon="arrowRight">Issue</Badge>
        : <Badge tone="violet" icon="reply">Return</Badge>),
    },
    {
      key: 'item', label: 'Item', primary: true,
      cell: (r) => <ItemCell image={r.item?.image} icon={r.item?.category?.icon || 'box'} name={r.item?.name} sub={r.item?.itemCode} />,
    },
    {
      key: 'user', label: 'User', sortable: true,
      cell: (r) => <Who name={r.user?.name} sub={r.userType === 'class' ? `${r.place} (Class Group)` : USER_TYPE[r.userType] || ''} src={r.user?.photo} id={r.user?._id} size="sm" />,
    },
    { key: 'place', label: 'Department/Class', cell: (r) => r.place || <span className="inv-dim">—</span> },
    { key: 'quantity', label: 'Qty', sortable: true, align: 'num', cell: (r) => `${count(r.quantity)} ${r.item?.unit || ''}`.trim() },
    { key: 'condition', label: 'Condition', sortable: true, cell: (r) => <StatusBadge value={r.condition} square noIcon /> },
    {
      key: 'expectedReturn', label: 'Expected Return', sortable: true, nowrap: true,
      cell: (r) => (r.expectedReturn
        ? <span className={r.state === 'overdue' ? 'inv-danger' : undefined}>{fmtDate(r.expectedReturn)}</span>
        : <span className="inv-dim">–</span>),
    },
    { key: 'state', label: 'Status', sortable: true, cell: (r) => <StatusBadge value={r.state} /> },
  ], []);

  if (error && !data) return <div className="inv-page"><LoadError error={error} onRetry={reload} /></div>;
  if (loading && !data) return <div className="inv-page"><Loading tiles={4} /></div>;

  return (
    <div className="inv-page">
      <YearBar year={activeYear} />

      <Hero
        icon="swap" tone="violet" title="Issue / Return Management"
        subtitle="Track item issues to users and process returns with full history and stock updates."
        art={<Art name="issues" />}
        promises={['Issue items to students, teachers or staff', 'Process item returns and condition check', 'Automatic stock update and audit trail']}
      >
        <Btn kind="primary" icon="send" onClick={() => setIssue({})}>Issue Item</Btn>
        <Btn icon="reply" onClick={() => {
          const first = rows.find(r => r.kind === 'issue' && r.outstanding > 0);
          if (first) setRet(first);
          else toast('Nothing is outstanding — open the Pending Returns tab to see what is still out.', { icon: 'ℹ️' });
        }}>Return Item</Btn>
      </Hero>

      <Tiles cols={4}>
        <Tile icon="send" tone="indigo" value={count(t.issues?.value)} label="Total Issues"
          delta={t.issues?.delta} deltaNote="from last month" spark={t.issues?.series} sparkKind="bar" sparkTone="indigo" />
        <Tile icon="undo" tone="rose" value={count(t.returns?.value)} label="Total Returns"
          delta={t.returns?.delta} deltaNote="from last month" spark={t.returns?.series} sparkKind="bar" sparkTone="rose" />
        <Tile icon="clock" tone="amber" value={count(t.pending?.value)} label="Pending Returns"
          note="Items not yet returned" onClick={() => setTab('pending')} />
        <Tile icon="alert" tone="red" value={count(t.overdue?.value)} label="Overdue Returns"
          note="Past expected date" onClick={() => setTab('overdue')} />
      </Tiles>

      <Card>
        <TabStrip
          value={tab} onChange={(v) => { setTab(v); setPage(1); }}
          items={[
            { value: 'all', label: 'All Transactions', count: tabs.all },
            { value: 'issues', label: 'Issues', count: tabs.issues },
            { value: 'returns', label: 'Returns', count: tabs.returns },
            { value: 'pending', label: 'Pending Returns', count: tabs.pending },
            { value: 'overdue', label: 'Overdue', count: tabs.overdue },
          ]}
        />

        <Filters inner>
          <Field grow>
            <Search value={q} onChange={setFilter(setQ)} placeholder="Search by item name, code, user name, request no.…" />
          </Field>
          <Field label="Transaction Type" pick>
            <Select value={type} onChange={setFilter(setType)} placeholder="All types"
              options={[{ value: 'issue', label: 'Issue' }, { value: 'return', label: 'Return' }]} />
          </Field>
          <Field label="Status" pick>
            <Select value={status} onChange={setFilter(setStatus)} placeholder="All statuses" options={[
              { value: 'pending_return', label: 'Pending Return' }, { value: 'returned', label: 'Returned' },
              { value: 'overdue', label: 'Overdue' }, { value: 'consumed', label: 'Consumed' },
            ]} />
          </Field>
          <Field label="User Type" pick>
            <Select value={userType} onChange={setFilter(setUserType)} placeholder="All users"
              options={Object.entries(USER_TYPE).map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field label="Date Range" pick>
            <DateRange from={range.from} to={range.to} onChange={(r) => { setRange(r); setPage(1); }} />
          </Field>
        </Filters>

        <Filters inner>
          <Field label="Item Category" pick>
            <Select value={category} onChange={setFilter(setCategory)} options={d.filters?.categories || []} placeholder="All categories" />
          </Field>
          <Field label="User" pick>
            <Select value={user} onChange={setFilter(setUser)} options={d.filters?.users || []} placeholder="All users" />
          </Field>
          <Field label="Department / Class" pick>
            <Select value={department} onChange={setFilter(setDepartment)} options={d.filters?.departments || []} placeholder="All departments" />
          </Field>
          <Field label="Condition" pick>
            <Select value={condition} onChange={setFilter(setCondition)} placeholder="All conditions" options={[
              { value: 'good', label: 'Good' }, { value: 'used', label: 'Used' },
              { value: 'partially_used', label: 'Partially Used' }, { value: 'damaged', label: 'Damaged' },
              { value: 'lost', label: 'Lost' }, { value: 'repair_needed', label: 'Repair Needed' },
            ]} />
          </Field>
          <FilterEnd>
            <Btn kind={filtered ? 'soft' : 'ghost'} icon="filter" onClick={reset}>{filtered ? 'Clear filters' : 'Filters'}</Btn>
            <KebabMenu items={[
              { label: 'Issue an item', icon: 'send', onClick: () => setIssue({}) },
              { label: 'Export this page', icon: 'download', onClick: exportCsv },
            ]} />
            <Btn icon="download" onClick={exportCsv}>Export</Btn>
          </FilterEnd>
        </Filters>

        <DataTable
          className="inv-table--dense"
          columns={columns} rows={rows} loading={loading && !rows.length}
          sort={sort} dir={dir} onSort={(k) => { onSort(k); setPage(1); }}
          actions={(r) => (
            <>
              <IconBtn icon="eye" label="View transaction" onClick={() => setView(r)} />
              <IconBtn icon="reply" kind="primary" label="Record a return"
                disabled={r.kind !== 'issue' || r.outstanding <= 0}
                onClick={() => setRet(r)} />
              <KebabMenu items={[
                { label: 'Record a return', icon: 'reply', disabled: r.kind !== 'issue' || r.outstanding <= 0, onClick: () => setRet(r) },
                { label: 'Issue the same item again', icon: 'send', onClick: () => setIssue({ item: r.item, warehouse: r.warehouse }) },
                { sep: true },
                { label: 'Print issue slip', icon: 'printer', onClick: () => printSlip(r) },
              ]} />
            </>
          )}
          empty={
            <Empty icon="swap" title={filtered || tab !== 'all' ? 'No transactions match' : 'Nothing has been issued yet'}
              action={filtered || tab !== 'all'
                ? <Btn icon="refresh" onClick={() => { reset(); setTab('all'); }}>Clear the filters</Btn>
                : <Btn kind="primary" icon="send" onClick={() => setIssue({})}>Issue the first item</Btn>}>
              {filtered || tab !== 'all' ? 'Try another tab, user or date range.' : 'Issuing takes units out of a store and records who has them, so they can be chased when they are due back.'}
            </Empty>
          }
        />

        <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="transactions"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
      </Card>

      <IssueForm open={!!issue} preset={issue} meta={meta} onClose={() => setIssue(null)} onDone={reload} />
      <ReturnForm open={!!ret} txn={ret} meta={meta} onClose={() => setRet(null)} onDone={reload} />

      {view ? (
        <Rail
          icon={view.kind === 'return' ? 'undo' : 'send'}
          iconTone={view.kind === 'return' ? 'violet' : 'blue'}
          title={view.txnNumber}
          sub={`${words(view.kind)} · ${fmtDate(view.date)}`}
          badge={<StatusBadge value={view.state} />}
          onClose={() => setView(null)}
          foot={view.kind === 'issue' && view.outstanding > 0 ? (
            <Btn kind="primary" icon="reply" onClick={() => { setRet(view); setView(null); }}>Record a return</Btn>
          ) : null}
        >
          <Block title="Item">
            <Facts>
              <Fact k="Item" v={view.item?.name} />
              <Fact k="Code" v={view.item?.itemCode} />
              <Fact k="Category" v={view.item?.category?.name} />
              <Fact k="Quantity" v={`${count(view.quantity)} ${view.item?.unit || ''}`} />
              <Fact k="Store" v={view.warehouse?.name} />
              <Fact k="Condition" v={<StatusBadge value={view.condition} square noIcon />} />
            </Facts>
          </Block>

          <Block title="Who has it">
            <Facts>
              <Fact k="Name" v={view.user?.name} />
              <Fact k="Kind of recipient" v={USER_TYPE[view.userType] || words(view.userType)} />
              <Fact k="Department / class" v={view.place} />
            </Facts>
          </Block>

          {view.kind === 'issue' ? (
            <Block title="Return">
              <Facts>
                <Fact k="Expected back" v={view.expectedReturn ? fmtDate(view.expectedReturn) : 'Not returnable'} />
                <Fact k="Still out" v={`${count(view.outstanding)} ${view.item?.unit || ''}`} />
              </Facts>
              {view.state === 'overdue' ? (
                <div style={{ marginTop: 14 }}>
                  <Note tone="danger" title="This is past its return date">
                    {count(view.outstanding)} {view.item?.unit || 'units'} were due back on {fmtDate(view.expectedReturn)}.
                  </Note>
                </div>
              ) : null}
            </Block>
          ) : null}

          {view.note ? (
            <Block title="Note">
              <p style={{ margin: 0, color: 'var(--inv-ink-2)', fontSize: '.86rem', lineHeight: 1.6 }}>{view.note}</p>
            </Block>
          ) : null}
        </Rail>
      ) : null}
    </div>
  );
}
