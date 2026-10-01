/**
 * Hostel → Fees: the six views — Invoices, Fee Plans, Rate Cards, Collections,
 * Outstanding and Refunds.
 *
 * Each has its own board. What can be DONE to an invoice (collect, concession,
 * refund, cancel) lives in Fees.jsx, which hands every view the same `act`
 * object, so an invoice is collected by the same form whichever list it was
 * found in. `refreshKey` changes whenever one of those forms saved.
 */
import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import { words, count } from './hsUI';
import {
  FilterBar, FSearch, FSelect, FDateRange, LineTabs, Btn, Kebab, Popover, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, TwoLine, useListState, useBoardData, exportCsv, fmtDate, fmtTime, rupees,
} from './hsList';
import { StudentCell, roomTight } from './hsPeople';
import { occupantOf, occupantLabel } from './hsForm';
import { openHostelReceipt } from '../shared';
import { ROOM_TYPES, roomTypeLabel } from './hsRoom';

export const FEE_TYPE = {
  monthly: ['Hostel Fee', 'blue', 'Hostel fee — monthly'], quarterly: ['Hostel Fee', 'blue', 'Hostel fee — quarterly'],
  annual: ['Hostel Fee', 'blue', 'Hostel fee — annual'], mess: ['Mess Charges', 'amber'], admission: ['Admission Fee', 'violet'],
  security_deposit: ['Security Deposit', 'teal'], laundry: ['Laundry', 'sky'], electricity: ['Electricity', 'sky'],
  maintenance: ['Maintenance', 'slate'], fine: ['Fine', 'red'], late_fee: ['Late Fee', 'red'], other: ['Other', 'slate'],
};
export const feeTypeOptions = (only) => Object.entries(FEE_TYPE).filter(([k]) => !only || only.includes(k))
  .map(([value, [label, , long]]) => ({ value, label: long || label }));
export const FeeType = ({ value }) => {
  const [text, tone, long] = FEE_TYPE[value] || [words(value), 'slate'];
  return <Badge tone={tone} size="lg" title={long}>{text}</Badge>;
};
export const INVOICE_STATUS = {
  paid: ['Paid', 'green'], pending: ['Pending', 'amber'], overdue: ['Overdue', 'red'], partial: ['Partial', 'blue'],
  cancelled: ['Cancelled', 'slate'], refunded: ['Refunded', 'violet'],
};
export const InvoiceStatus = ({ value }) => {
  const [text, tone] = INVOICE_STATUS[value] || [words(value), 'slate'];
  return <Badge tone={tone} size="lg" glyph={value === 'paid' ? 'checkCircle' : undefined}>{text}</Badge>;
};
export const MODES = { cash: 'Cash', cheque: 'Cheque', online: 'Online', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer' };
const periodOf = (r) => r.period?.label || '—';
const roomCell = (r) => <TwoLine top={r.hostelName || '—'} sub={roomTight(r).replace('-', ' - ')} />;
const stamp = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '');
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthRange = () => { const n = new Date(); return { from: isoDay(new Date(n.getFullYear(), n.getMonth(), 1)), to: isoDay(new Date(n.getFullYear(), n.getMonth() + 1, 0)) }; };

/** Refetch when the shell says something was saved. */
function useRefresh(reload, refreshKey) {
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } reload(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** What may be done with an invoice, for a row's ⋮ and the drawer. */
export const invoiceSteps = (r, act) => [
  !['paid', 'cancelled', 'refunded'].includes(r.status) && { label: 'Collect payment', icon: 'wallet', onClick: () => act.collect(r) },
  !['cancelled', 'refunded'].includes(r.status) && { label: 'Concession / waiver', icon: 'percent', onClick: () => act.concession(r) },
  r.paidAmount > (r.refundedAmount || 0) && { label: 'Refund', icon: 'repeat', onClick: () => act.refund(r) },
  r.paidAmount === 0 && r.status !== 'cancelled' && '-',
  r.paidAmount === 0 && r.status !== 'cancelled' && { label: 'Cancel invoice', icon: 'trash', danger: true, onClick: () => act.cancel(r) },
];

const invoiceCsv = (name, list) => exportCsv(name, [
  { label: 'Invoice no.', value: (r) => r.invoiceNumber }, { label: 'Student', value: (r) => r.studentName }, { label: 'Roll', value: (r) => r.studentRoll },
  { label: 'Class', value: (r) => r.studentClass }, { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room', value: (r) => r.roomNumber },
  { label: 'Fee type', value: (r) => (FEE_TYPE[r.feeType] || [r.feeType])[0] }, { label: 'Period', value: (r) => r.period?.label || '' },
  { label: 'Amount', value: (r) => r.amount }, { label: 'Discount', value: (r) => r.discount }, { label: 'Late fee', value: (r) => r.lateFee },
  { label: 'Net', value: (r) => r.netAmount }, { label: 'Paid', value: (r) => r.paidAmount }, { label: 'Refunded', value: (r) => r.refundedAmount },
  { label: 'Balance', value: (r) => r.balance }, { label: 'Due date', value: (r) => fmtDate(r.dueDate) }, { label: 'Status', value: (r) => (INVOICE_STATUS[r.status] || [r.status])[0] },
], list);

/* ═══════════════════════════════════════════════════════════════════════════
 *  Invoices
 * ═══════════════════════════════════════════════════════════════════════════ */
export function Invoices({ meta, act, refreshKey, startStatus }) {
  // Opens on this month's invoices, as the mockup does — unless a link asked
  // for a status, which must not be hidden behind a month it did not ask for.
  const initial = startStatus ? { from: '', to: '' } : monthRange();
  const { state, set, setPage, reset } = useListState({ limit: 10, hostel: '', feeType: '', status: startStatus || '', class: '', discounted: '', ...initial }, { fromUrl: [] });
  const { data, loading, reload } = useBoardData((q) => api.getBoard('fees', q), state);
  useRefresh(reload, refreshKey);
  const [selected, setSelected] = useState(new Set());
  const [more, setMore] = useState(false);
  const moreBtn = useRef(null);
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const extra = (state.class ? 1 : 0) + (state.discounted ? 1 : 0);

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'student', label: 'Student', render: (r) => <StudentCell r={r} /> },
    { key: 'class', label: 'Class', render: (r) => r.studentClass || '—', nowrap: true },
    { key: 'room', label: 'Hostel / Room', render: roomCell },
    { key: 'type', label: 'Fee Type', render: (r) => <FeeType value={r.feeType} /> },
    { key: 'period', label: 'Period', render: periodOf, nowrap: true },
    { key: 'amount', label: 'Amount', render: (r) => (
      <span className="hs-stack">{rupees(r.netAmount)}{r.discount > 0 || r.lateFee > 0 ? (
        <small>{rupees(r.amount)}{r.discount > 0 ? ` − ${rupees(r.discount)}` : ''}{r.lateFee > 0 ? ` + ${rupees(r.lateFee)} late` : ''}</small>
      ) : null}</span>
    ) },
    { key: 'status', label: 'Status', render: (r) => (
      <span className="hs-stack"><InvoiceStatus value={r.status} />{r.status === 'partial' ? <small>{rupees(r.balance)} due</small> : null}</span>
    ) },
    { key: 'due', label: 'Due Date', render: (r) => fmtDate(r.dueDate), nowrap: true },
  ];
  const exportAll = async () => {
    try { const res = await api.getBoard('fees', { ...state, page: 1, limit: 5000 }); invoiceCsv('hostel-invoices.csv', (res.data ?? res).rows || []); }
    catch (err) { toast.error(err.message); }
  };

  return (
    <>
      <FilterBar>
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={(meta?.hostels || []).map((h) => ({ value: h._id, label: h.name }))} grow={0} width="146px" />
        <FSelect value={state.feeType} onChange={(v) => set({ feeType: v })} all="All fee types" options={feeTypeOptions()} grow={0} width="148px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={Object.entries(INVOICE_STATUS).map(([value, [label]]) => ({ value, label }))} grow={0} width="132px" />
        <FDateRange from={state.from} to={state.to} onChange={(v) => set(v)} grow={0} width="246px" icon={false} />
        <FSearch compact value={state.search} onChange={(v) => set({ search: v })} placeholder="Search by student name, roll no. or invoice no..." grow={1} width="240px" />
        <Btn ref={moreBtn} icon="filter" aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((o) => !o)}>Filter{extra ? ` · ${extra}` : ''}</Btn>
        <Popover anchor={moreBtn} open={more} onClose={() => setMore(false)} label="More filters">
          <div className="hs-menu2" role="menu">
            <button type="button" role="menuitemradio" aria-checked={!state.class} className={`hs-menu2__item${!state.class ? ' is-on' : ''}`} onClick={() => { set({ class: '' }); setMore(false); }}><span>All classes</span></button>
            {(meta?.classes || []).map((c) => (
              <button key={c._id} type="button" role="menuitemradio" aria-checked={state.class === c._id} className={`hs-menu2__item${state.class === c._id ? ' is-on' : ''}`}
                onClick={() => { set({ class: c._id }); setMore(false); }}><span>{c.className}</span></button>
            ))}
            <div className="hs-menu2__rule" role="separator" />
            <button type="button" role="menuitemcheckbox" aria-checked={!!state.discounted} className={`hs-menu2__item${state.discounted ? ' is-on' : ''}`}
              onClick={() => { set({ discounted: state.discounted ? '' : '1' }); setMore(false); }}><span>With a concession only</span></button>
            <button type="button" role="menuitem" className="hs-menu2__item" onClick={() => { set({ from: '', to: '' }); setMore(false); }}><span>Any date</span></button>
            <div className="hs-menu2__rule" role="separator" />
            <button type="button" role="menuitem" className="hs-menu2__item" onClick={() => { exportAll(); setMore(false); }}><span>Export this list (CSV)</span></button>
          </div>
        </Popover>
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
      </FilterBar>
      <ListCard>
        <BulkBar count={selected.size} noun="invoice" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => invoiceCsv('hostel-invoices.csv', rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable columns={columns} rows={rows} loading={loading} pad={7} headPad={12} dense selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" icon="eye" onClick={() => act.view(r)}>View</Btn>
              <Kebab label={`Actions for ${r.invoiceNumber}`} items={[{ label: 'View invoice', icon: 'eye', onClick: () => act.view(r) }, ...invoiceSteps(r, act)]} />
            </>
          )}
          empty={(
            <EmptyRows icon="wallet" title="No invoice matches"
              action={state.from || state.to ? <Btn icon="calendar" onClick={() => set({ from: '', to: '' })}>Show any date</Btn> : <Btn icon="refresh" onClick={reset}>Reset filters</Btn>}>
              {state.from || state.to ? `Nothing falls due between ${fmtDate(`${state.from || state.to}T00:00:00`)} and ${fmtDate(`${state.to || state.from}T00:00:00`)}.` : 'Raise an invoice, or bill every resident from a fee plan.'}
            </EmptyRows>
          )} />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'invoice' : 'invoices'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Fee Plans  ·  Rate Cards
 * ═══════════════════════════════════════════════════════════════════════════ */
function usePlans(refreshKey) {
  const [q, setQ] = useState({ search: '', hostel: '', feeType: '', limit: 200 });
  const { data, loading, reload } = useBoardData((p) => api.getBoard('fee-plans', p), q);
  useRefresh(reload, refreshKey);
  return { q, setQ, rows: data?.rows || [], loading };
}
const PlanFilters = ({ q, setQ, meta }) => (
  <FilterBar>
    <FSelect value={q.hostel} onChange={(v) => setQ((s) => ({ ...s, hostel: v }))} all="All hostels" options={(meta?.hostels || []).map((h) => ({ value: h._id, label: h.name }))} grow={0} width="170px" />
    <FSelect value={q.feeType} onChange={(v) => setQ((s) => ({ ...s, feeType: v }))} all="All fee types" options={feeTypeOptions(Object.keys(FEE_TYPE).filter((k) => !['fine', 'late_fee'].includes(k)))} grow={0} width="190px" />
    <FSearch value={q.search} onChange={(v) => setQ((s) => ({ ...s, search: v }))} placeholder="Search plan name..." grow={0} width="256px" />
    <span className="hs-filters__spacer" />
    <Btn icon="refresh" onClick={() => setQ((s) => ({ ...s, search: '', hostel: '', feeType: '' }))}>Reset</Btn>
  </FilterBar>
);

export function Plans({ meta, act, refreshKey }) {
  const { q, setQ, rows, loading } = usePlans(refreshKey);
  const columns = [
    { key: 'name', label: 'Plan', render: (r) => <TwoLine top={r.name} sub={r.description} strong /> },
    { key: 'type', label: 'Fee Type', render: (r) => <FeeType value={r.feeType} /> },
    { key: 'hostel', label: 'Hostel', render: (r) => r.hostelName || 'All hostels' },
    { key: 'for', label: 'Bills', render: (r) => <Badge tone={occupantOf(r, 'appliesTo') === 'student' ? 'slate' : 'violet'}>{occupantLabel(r, 'appliesTo')}</Badge> },
    { key: 'freq', label: 'Frequency', render: (r) => <TwoLine top={words(r.frequency)} sub={r.frequency === 'one_time' ? '' : `Due on day ${r.dueDayOfMonth}`} /> },
    { key: 'basis', label: 'Basis', render: (r) => (r.basis === 'room_type' ? <Badge tone="violet">By room type</Badge> : <Badge tone="slate">Flat</Badge>) },
    { key: 'amount', label: 'Amount', render: (r) => (
      <span className="hs-stack"><strong>{rupees(r.amount)}</strong>{r.basis === 'room_type' ? <small>fallback · {(r.roomTypeRates || []).length} band{(r.roomTypeRates || []).length === 1 ? '' : 's'}</small> : null}</span>
    ) },
    { key: 'billed', label: 'Billed So Far', render: (r) => <TwoLine top={rupees(r.billed)} sub={`${count(r.invoices)} invoice${r.invoices === 1 ? '' : 's'}`} /> },
    { key: 'refund', label: 'Refundable', render: (r) => (r.isRefundable ? <Badge tone="teal">Yes</Badge> : <span className="hs-muted">No</span>) },
  ];
  return (
    <>
      <PlanFilters q={q} setQ={setQ} meta={meta} />
      <ListCard>
        <DataTable select={false} columns={columns} rows={rows} loading={loading} pad={10} headPad={12} dense
          actions={(r) => (
            <>
              <Btn size="sm" kind="success" icon="wallet" onClick={() => act.bill(r)}>Bill</Btn>
              <Btn size="sm" icon="pencil" onClick={() => act.editPlan(r)}>Edit</Btn>
              <Kebab label={`Actions for ${r.name}`} items={[{ label: 'Deactivate', icon: 'trash', danger: true, onClick: () => act.removePlan(r) }]} />
            </>
          )}
          empty={(
            <EmptyRows icon="tag" title={q.search || q.hostel || q.feeType ? 'No plan matches' : 'No fee plans yet'} action={<Btn kind="primary" icon="plus" onClick={() => act.editPlan()}>Fee Plan</Btn>}>
              A fee plan is what gets billed: a monthly hostel fee, mess charges, a security deposit.
            </EmptyRows>
          )} />
      </ListCard>
    </>
  );
}

/** What a resident pays under each plan, by the room they are in. */
export function RateCards({ meta, act, refreshKey }) {
  const { q, setQ, rows, loading } = usePlans(refreshKey);
  const types = ROOM_TYPES.filter(([k]) => k !== 'custom');
  const rate = (r, type) => {
    if (r.basis !== 'room_type') return { value: r.amount, flat: true };
    const band = (r.roomTypeRates || []).find((z) => z.roomType === type);
    return band ? { value: Number(band.amount) } : { value: r.amount, fallback: true };
  };
  const columns = [
    { key: 'name', label: 'Plan', render: (r) => <TwoLine top={r.name} sub={`${r.hostelName || 'All hostels'} · ${words(r.frequency)}`} strong /> },
    { key: 'type', label: 'Fee Type', render: (r) => <FeeType value={r.feeType} /> },
    ...types.map(([k, label]) => ({
      key: k, label, align: 'right', render: (r) => {
        const x = rate(r, k);
        return <span className={x.flat || x.fallback ? 'hs-muted' : 'hs-rate'} title={x.flat ? 'A flat plan — the same for every room' : x.fallback ? 'No band for this room type — the fallback amount applies' : undefined}>{rupees(x.value)}</span>;
      },
    })),
  ];
  return (
    <>
      <PlanFilters q={q} setQ={setQ} meta={meta} />
      <ListCard>
        <DataTable select={false} columns={columns} rows={rows} loading={loading} pad={11} headPad={12} dense
          actions={(r) => <Btn size="sm" icon="pencil" onClick={() => act.editPlan(r)}>Edit rates</Btn>}
          empty={<EmptyRows icon="tag" title="No rate cards yet" action={<Btn kind="primary" icon="plus" onClick={() => act.editPlan()}>Fee Plan</Btn>}>Add a fee plan priced by room type to build a rate card.</EmptyRows>} />
      </ListCard>
      <p className="hs-roll__saved">
        Amounts in grey are not a band of their own: the plan is flat, or it has no rate for that room type and its fallback amount applies.
        {' '}{types.map(([k]) => roomTypeLabel(k)).join(', ')} are the room types a plan can price.
      </p>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Collections
 * ═══════════════════════════════════════════════════════════════════════════ */
export function Collections({ meta, act, refreshKey }) {
  const { state, set, setPage, reset } = useListState({ limit: 10, hostel: '', mode: '', feeType: '', from: '', to: '' }, { fromUrl: [] });
  const { data, loading, reload } = useBoardData((q) => api.getBoard('fee-collections', q), state);
  useRefresh(reload, refreshKey);
  const rows = data?.rows || [];
  const sum = data?.summary || { byMode: [], total: 0, receipts: 0 };
  const columns = [
    { key: 'at', label: 'Received On', render: (r) => <TwoLine top={fmtDate(r.paidAt)} sub={fmtTime(r.paidAt)} />, nowrap: true },
    { key: 'receipt', label: 'Receipt No.', nowrap: true, render: (r) => (r.receiptNumber
      ? <button type="button" className="hs-linkbtn" title="Open the receipt" onClick={(e) => { e.stopPropagation(); openHostelReceipt(r.receiptNumber, r.invoiceId); }}>{r.receiptNumber}</button> : '—') },
    { key: 'student', label: 'Student', render: (r) => <StudentCell r={r} /> },
    { key: 'room', label: 'Hostel / Room', render: roomCell },
    { key: 'invoice', label: 'Invoice', render: (r) => <TwoLine top={r.invoiceNumber} sub={periodOf(r) === '—' ? '' : periodOf(r)} /> },
    { key: 'type', label: 'Fee Type', render: (r) => <FeeType value={r.feeType} /> },
    { key: 'mode', label: 'Mode', render: (r) => <TwoLine top={MODES[r.mode] || words(r.mode)} sub={r.reference} /> },
    { key: 'by', label: 'Received By', render: (r) => r.receivedByName || (r.mode === 'online' ? <TwoLine top="Paid online" sub={r.paidByName ? `by ${r.paidByName}` : ''} /> : '—') },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <strong>{rupees(r.amount)}</strong> },
  ];
  const exportAll = async () => {
    try {
      const res = await api.getBoard('fee-collections', { ...state, page: 1, limit: 5000 });
      exportCsv('hostel-collections.csv', [
        { label: 'Received on', value: (r) => stamp(r.paidAt) }, { label: 'Receipt no.', value: (r) => r.receiptNumber }, { label: 'Student', value: (r) => r.studentName },
        { label: 'Roll', value: (r) => r.studentRoll }, { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Invoice', value: (r) => r.invoiceNumber },
        { label: 'Fee type', value: (r) => (FEE_TYPE[r.feeType] || [r.feeType])[0] }, { label: 'Mode', value: (r) => MODES[r.mode] || r.mode },
        { label: 'Reference', value: (r) => r.reference }, { label: 'Amount', value: (r) => r.amount }, { label: 'Received by', value: (r) => r.receivedByName || (r.mode === 'online' ? `Online${r.paidByName ? ` (${r.paidByName})` : ''}` : '') },
      ], (res.data ?? res).rows || []);
    } catch (err) { toast.error(err.message); }
  };
  return (
    <>
      <FilterBar>
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={(meta?.hostels || []).map((h) => ({ value: h._id, label: h.name }))} grow={0} width="146px" />
        <FSelect value={state.mode} onChange={(v) => set({ mode: v })} all="All modes" options={Object.entries(MODES).map(([value, label]) => ({ value, label }))} grow={0} width="140px" />
        <FSelect value={state.feeType} onChange={(v) => set({ feeType: v })} all="All fee types" options={feeTypeOptions()} grow={0} width="148px" />
        <FDateRange from={state.from} to={state.to} onChange={(v) => set(v)} grow={0} width="262px" icon={false} />
        <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search student, receipt, invoice or reference..." grow={1} width="240px" />
        <Btn icon="download" onClick={exportAll}>Export</Btn>
        <Btn icon="refresh" onClick={reset}>Reset</Btn>
      </FilterBar>
      <ul className="hs-catcards" aria-label="Received by mode">
        <li className="is-total"><strong>{rupees(sum.total)}</strong><span>{count(sum.receipts)} receipt{sum.receipts === 1 ? '' : 's'}{state.from || state.to ? ' in this period' : ''}</span></li>
        {sum.byMode.map((m) => (
          <li key={m.mode}>
            <button type="button" className={state.mode === m.mode ? 'is-on' : ''} aria-pressed={state.mode === m.mode} onClick={() => set({ mode: state.mode === m.mode ? '' : m.mode })}>
              <strong>{rupees(m.total)}</strong><span>{MODES[m.mode] || words(m.mode)} · {count(m.n)}</span>
            </button>
          </li>
        ))}
      </ul>
      <ListCard>
        <DataTable select={false} columns={columns} rows={rows} loading={loading} pad={7} headPad={12} dense
          actions={(r) => <Btn size="sm" icon="eye" onClick={() => act.view({ _id: r.invoiceId })}>Invoice</Btn>}
          empty={<EmptyRows icon="wallet" title="No payments found" action={<Btn icon="refresh" onClick={reset}>Reset filters</Btn>}>Every payment recorded against an invoice is listed here, one line per receipt.</EmptyRows>} />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'receipt' : 'receipts'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Outstanding
 * ═══════════════════════════════════════════════════════════════════════════ */
export function Outstanding({ meta, act, refreshKey }) {
  const { state, set, setPage, reset } = useListState({ limit: 10, hostel: '', feeType: '', class: '' }, { fromUrl: [] });
  const { data, loading, reload } = useBoardData((q) => api.getBoard('fee-outstanding', q), state);
  useRefresh(reload, refreshKey);
  const [selected, setSelected] = useState(new Set());
  const rows = data?.rows || [];
  const tabs = data?.tabs || {};
  const s = data?.summary || {};
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const tab = ['overdue', 'upcoming', 'partial'].includes(state.tab) ? state.tab : 'all';
  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'student', label: 'Student', render: (r) => <StudentCell r={r} /> },
    { key: 'class', label: 'Class', render: (r) => r.studentClass || '—', nowrap: true },
    { key: 'room', label: 'Hostel / Room', render: roomCell },
    { key: 'type', label: 'Fee Type', render: (r) => <FeeType value={r.feeType} /> },
    { key: 'period', label: 'Period', render: periodOf, nowrap: true },
    { key: 'net', label: 'Billed', render: (r) => rupees(r.netAmount) },
    { key: 'paid', label: 'Paid', render: (r) => rupees(r.paidAmount) },
    { key: 'bal', label: 'Balance', render: (r) => <strong className="hs-allergy">{rupees(r.balance)}</strong> },
    { key: 'due', label: 'Due Date', render: (r) => (
      <span className="hs-stack">{fmtDate(r.dueDate)}{r.daysOverdue > 0 ? <small className="is-bad">{r.daysOverdue} day{r.daysOverdue === 1 ? '' : 's'} overdue</small> : null}</span>
    ), nowrap: true },
  ];
  return (
    <>
      <ul className="hs-catcards" aria-label="Outstanding by age">
        <li className="is-total"><strong>{rupees(s.total)}</strong><span>owed by {count(s.students ?? 0)} student{s.students === 1 ? '' : 's'}</span></li>
        <li className="is-total is-plain"><strong>{rupees(s.notDue)}</strong><span>Not yet due</span></li>
        <li className="is-total is-plain"><strong>{rupees(s.d30)}</strong><span>Up to 30 days late</span></li>
        <li className="is-total is-plain"><strong>{rupees(s.d60)}</strong><span>31 – 60 days late</span></li>
        <li className="is-total is-plain"><strong>{rupees(s.older)}</strong><span>Over 60 days late</span></li>
      </ul>
      <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Outstanding by state"
        items={[
          { key: 'all', label: 'All Outstanding', count: tabs.all ?? 0 }, { key: 'overdue', label: 'Overdue', count: tabs.overdue ?? 0, tone: 'bad' },
          { key: 'upcoming', label: 'Not Yet Due', count: tabs.upcoming ?? 0 }, { key: 'partial', label: 'Part Paid', count: tabs.partial ?? 0 },
        ]} />
      <FilterBar>
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={(meta?.hostels || []).map((h) => ({ value: h._id, label: h.name }))} grow={0} width="160px" />
        <FSelect value={state.class} onChange={(v) => set({ class: v })} all="All classes" options={(meta?.classes || []).map((c) => ({ value: c._id, label: c.className }))} grow={0} width="150px" />
        <FSelect value={state.feeType} onChange={(v) => set({ feeType: v })} all="All fee types" options={feeTypeOptions()} grow={0} width="170px" />
        <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search by student name, roll no. or invoice no..." grow={1} width="260px" />
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
      </FilterBar>
      <ListCard>
        <BulkBar count={selected.size} noun="invoice" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => invoiceCsv('hostel-outstanding.csv', rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable columns={columns} rows={rows} loading={loading} pad={7} headPad={12} dense selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" kind="success" icon="wallet" onClick={() => act.collect(r)}>Collect</Btn>
              <Kebab label={`Actions for ${r.invoiceNumber}`} items={[{ label: 'View invoice', icon: 'eye', onClick: () => act.view(r) }, ...invoiceSteps(r, act).slice(1)]} />
            </>
          )}
          empty={<EmptyRows icon="checkCircle" title="Nothing is outstanding">Every invoice raised has been paid, cancelled or refunded.</EmptyRows>} />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'invoice' : 'invoices'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Refunds
 * ═══════════════════════════════════════════════════════════════════════════ */
export function Refunds({ meta, act, refreshKey }) {
  const { state, set, setPage, reset } = useListState({ limit: 10, hostel: '', feeType: '', from: '', to: '' }, { fromUrl: [] });
  const { data, loading, reload } = useBoardData((q) => api.getBoard('fee-refunds', q), state);
  useRefresh(reload, refreshKey);
  const rows = data?.rows || [];
  const s = data?.summary || {};
  const columns = [
    { key: 'at', label: 'Refunded On', render: (r) => fmtDate(r.refundedAt), nowrap: true },
    { key: 'student', label: 'Student', render: (r) => <StudentCell r={r} /> },
    { key: 'room', label: 'Hostel / Room', render: roomCell },
    { key: 'invoice', label: 'Invoice', render: (r) => <TwoLine top={r.invoiceNumber} sub={periodOf(r) === '—' ? '' : periodOf(r)} /> },
    { key: 'type', label: 'Fee Type', render: (r) => <FeeType value={r.feeType} /> },
    { key: 'paid', label: 'Paid', render: (r) => rupees(r.paidAmount) },
    { key: 'refunded', label: 'Refunded', render: (r) => <strong>{rupees(r.refundedAmount)}</strong> },
    { key: 'ref', label: 'Reference', render: (r) => r.refundReference || '—' },
    { key: 'status', label: 'Status', render: (r) => <InvoiceStatus value={r.status} /> },
  ];
  return (
    <>
      <ul className="hs-catcards" aria-label="Refund totals">
        <li className="is-total"><strong>{rupees(s.total)}</strong><span>Refunded in all</span></li>
        <li className="is-total is-plain"><strong>{rupees(s.deposits)}</strong><span>of it security deposits</span></li>
        <li className="is-total is-plain"><strong>{count(s.invoices ?? 0)}</strong><span>Invoice{s.invoices === 1 ? '' : 's'} refunded</span></li>
      </ul>
      <FilterBar>
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={(meta?.hostels || []).map((h) => ({ value: h._id, label: h.name }))} grow={0} width="160px" />
        <FSelect value={state.feeType} onChange={(v) => set({ feeType: v })} all="All fee types" options={feeTypeOptions()} grow={0} width="170px" />
        <FDateRange from={state.from} to={state.to} onChange={(v) => set(v)} grow={0} width="262px" icon={false} />
        <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search by student name, roll no. or invoice no..." grow={1} width="260px" />
        <Btn icon="refresh" onClick={reset}>Reset</Btn>
      </FilterBar>
      <ListCard>
        <DataTable select={false} columns={columns} rows={rows} loading={loading} pad={8} headPad={12} dense
          actions={(r) => <Btn size="sm" icon="eye" onClick={() => act.view(r)}>View</Btn>}
          empty={<EmptyRows icon="refund" title="No refunds">A refund is made from a paid invoice — a security deposit returned, an overpayment handed back.</EmptyRows>} />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'refund' : 'refunds'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>
    </>
  );
}

/* ── Online payments ─────────────────────────────────────────────────────── */

const ORDER_STATE = { created: ['Not confirmed', 'amber'], paid: ['Paid', 'green'], expired: ['Never paid', 'slate'] };

/**
 * Every online checkout, for the fee desk: the ones that went through, the
 * ones nobody confirmed (the money may or may not have moved) and money the
 * gateway took that could not be placed. Unconfirmed ones are asked about
 * automatically every half hour; "Check" asks now.
 */
export function OnlinePayments({ refreshKey, onChanged }) {
  const [tab, setTab] = useState('open');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState('');
  const load = async (t = tab) => {
    setLoading(true);
    try { const r = await api.getOnlinePayments({ tab: t }); setData(r.data ?? r); }
    catch (err) { toast.error(err.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(tab); }, [tab, refreshKey]); // eslint-disable-line

  const check = async (row) => {
    setChecking(row.orderId);
    try {
      const r = await api.checkOnlinePayment(row.orderId);
      const d = r.data ?? r;
      if (d.status === 'paid') toast.success(`Paid — recorded as receipt ${d.receiptNumber}`);
      else if (d.status === 'expired') toast('No payment was made on this checkout. It has been closed.', { icon: 'ℹ️' });
      else toast('The gateway has no payment for this checkout yet.', { icon: 'ℹ️' });
      await load(); onChanged?.();
    } catch (err) { toast.error(err.message); } finally { setChecking(''); }
  };

  const rows = data?.rows || [];
  const c = data?.counts || {};
  const columns = [
    { key: 'at', label: 'Started', render: (r) => <TwoLine top={fmtDate(r.createdAt)} sub={fmtTime(r.createdAt)} />, nowrap: true },
    { key: 'student', label: 'Resident', render: (r) => <StudentCell r={r} /> },
    { key: 'by', label: 'Opened By', render: (r) => <TwoLine top={r.openedByName || '—'} sub={words(r.openedByRole)} /> },
    { key: 'for', label: 'Invoices', render: (r) => <span className="hs-clip">{(r.lines || []).map((l) => l.invoiceNumber).join(', ') || '—'}</span> },
    { key: 'order', label: 'Gateway Order', render: (r) => <TwoLine top={r.orderId} sub={r.paymentId || ''} /> },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <strong>{rupees(r.amount)}</strong> },
    { key: 'status', label: 'Status', render: (r) => {
      const [text, tone] = ORDER_STATE[r.status] || [words(r.status), 'slate'];
      return (
        <span className="hs-stack">
          <Badge tone={tone} size="lg">{text}</Badge>
          {r.unapplied > 0 ? <small className="is-bad">{rupees(r.unapplied)} not applied — refund or adjust</small> : null}
          {r.status === 'paid' && r.confirmedBy === 'reconcile' ? <small>Found by checking the gateway</small> : null}
          {r.status === 'created' && r.lastCheckedAt ? <small>Checked {fmtDate(r.lastCheckedAt)}, {fmtTime(r.lastCheckedAt)}</small> : null}
        </span>
      );
    } },
  ];
  return (
    <>
      <ul className="hs-catcards" aria-label="Online payment totals">
        <li><button type="button" className={tab === 'open' ? 'is-on' : ''} aria-pressed={tab === 'open'} onClick={() => setTab('open')}>
          <strong>{count((c.unconfirmed || 0) + (c.unapplied || 0))}</strong><span>Need attention</span></button></li>
        <li><button type="button" className={tab === 'paid' ? 'is-on' : ''} aria-pressed={tab === 'paid'} onClick={() => setTab('paid')}>
          <strong>{count(c.paid || 0)}</strong><span>Paid online</span></button></li>
        <li><button type="button" className={tab === 'expired' ? 'is-on' : ''} aria-pressed={tab === 'expired'} onClick={() => setTab('expired')}>
          <strong>{count(c.expired || 0)}</strong><span>Never paid</span></button></li>
      </ul>
      <ListCard>
        <DataTable select={false} columns={columns} rows={rows} loading={loading} pad={8} headPad={12} dense rowKey="orderId"
          actions={(r) => (
            <>
              {r.status === 'created' ? <Btn size="sm" icon="refresh" disabled={checking === r.orderId} onClick={() => check(r)}>{checking === r.orderId ? 'Checking…' : 'Check with gateway'}</Btn> : null}
              {r.receiptNumber ? <Btn size="sm" icon="oReceipt" onClick={() => openHostelReceipt(r.receiptNumber)}>Receipt</Btn> : null}
            </>
          )}
          empty={<EmptyRows icon="checkCircle" title={tab === 'open' ? 'Nothing needs attention' : 'Nothing here'}>
            {tab === 'open'
              ? 'Every online checkout has either been paid and recorded, or was never paid. Unconfirmed ones are checked with the gateway every half hour.'
              : 'Online payments made by residents and parents are listed here.'}
          </EmptyRows>} />
      </ListCard>
    </>
  );
}
