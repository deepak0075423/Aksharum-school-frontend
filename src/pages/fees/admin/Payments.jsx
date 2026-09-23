/**
 * Fees → Payments (mockup 3). Five tiles by payment mode, a filter rail on
 * the left, the monthly trend and the mode donut, then every payment with
 * receipts. Pending submissions from students and parents are approved or
 * rejected from each row's menu.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getPaymentList, getReceiptsHtml, approvePayment, rejectPayment } from '../../../api/fees.api';
import { Confirm } from '../../../components/ui/index';
import { RowMenu, MenuItem, MenuSep } from '../../admin/listParts';
import {
  FeHead, Btn, Card, CardHead, Tile, Tiles, Select, Search, PillTabs, StatusBadge, Avatar, IconBtn, Check, Pager, DateRange,
  money, fmtDateTime, MODE, MODE_LONG, yearOptions, Empty, Loading, saveFile, toCsv, openHtmlWindow, rangePresets, isoDay,
} from './feeUI';
import { ModeTrend, Legend, Donut, DonutLegend, GROUP_INK, INK } from './feeCharts';
import { RecordPaymentDialog, StudentDrawer, VoidPaymentDialog } from './feeForms';
import { useFeesMeta, classOptions, sectionOptions, useUrlState } from './feeData';

const DEFAULTS = { academicYearId: '', classId: '', sectionId: '', mode: '', status: '', from: '', to: '', q: '', group: '', page: '1', limit: '10' };
const DONUT_INK = { online: INK.green, cash: INK.blue, card: INK.amber, other: INK.purple };

export default function AdminPayments() {
  const [applied, setApplied] = useUrlState(DEFAULTS);
  const [draft, setDraft] = useState(applied);
  const [range, setRange] = useState('6');
  const [search, setSearch] = useState(applied.q);
  const [picked, setPicked] = useState(new Set());
  const [paying, setPaying] = useState(null);
  const [studentId, setStudentId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [hover, setHover] = useState(null);
  useEffect(() => { setDraft(applied); setSearch(applied.q); }, [JSON.stringify(applied)]); // eslint-disable-line react-hooks/exhaustive-deps

  const { meta } = useFeesMeta(applied.academicYearId);
  const { meta: draftMeta } = useFeesMeta(draft.academicYearId);
  const page = Number(applied.page) || 1, limit = Number(applied.limit) || 10;
  const query = Object.fromEntries(Object.entries({ ...applied, page, limit, range }).filter(([, v]) => v !== '' && v != null));
  const { data, meta: env, loading, refetch } = useFetch(() => getPaymentList(query), [JSON.stringify(query)]);
  useEffect(() => { setPicked(new Set()); }, [JSON.stringify(query)]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = data?.rows || [];
  const t = data?.tiles || {};
  const c = data?.counts || {};
  const sym = meta?.settings?.currencySymbol || '₹';
  const yearValue = draft.academicYearId || data?.year?._id || '';
  // The range the server used (the collection window by default) fills the pickers.
  const rFrom = applied.from || (data?.range?.from ? isoDay(data.range.from) : '');
  const rTo = applied.to || (data?.range?.to ? isoDay(data.range.to) : '');

  const setD = (k) => (v) => setDraft(d => ({ ...d, [k]: v, ...(k === 'classId' ? { sectionId: '' } : {}), ...(k === 'academicYearId' ? { classId: '', sectionId: '' } : {}) }));
  const apply = () => setApplied({ ...draft, page: '1' });
  const reset = () => { setDraft(DEFAULTS); setSearch(''); setApplied({ ...DEFAULTS }); };
  const allOn = rows.length > 0 && rows.every(r => picked.has(r._id));
  const receipts = (ids) => openHtmlWindow(() => getReceiptsHtml(ids)).catch(e => toast.error(e.message));
  const chosenWithReceipts = rows.filter(r => picked.has(r._id) && r.status === 'completed').map(r => r._id);

  const approve = async (p) => {
    try { const r = await approvePayment(p._id); toast.success(`Approved — receipt ${r?.data?.receiptNumber || ''}`); refetch(); }
    catch (e) { toast.error(e.message); }
  };
  const reject = async () => {
    try { await rejectPayment(rejecting._id); toast.success('Payment rejected'); setRejecting(null); refetch(); }
    catch (e) { toast.error(e.message); }
  };
  const exportCsv = async () => {
    try {
      const all = [];
      for (let p = 1; p <= 50; p++) {
        const res = await getPaymentList({ ...query, page: p, limit: 200 });
        all.push(...(res?.data?.rows || []));
        if (p >= (res?.pages || 1)) break;
      }
      const list = picked.size ? all.filter(r => picked.has(r._id)) : all;
      saveFile(toCsv([
        { label: 'Date', value: r => fmtDateTime(r.date) }, { key: 'receiptNumber', label: 'Receipt' },
        { label: 'Student', value: r => r.student.name }, { key: 'admissionNumber', label: 'Adm. No.' }, { key: 'classLabel', label: 'Class / Section' },
        { key: 'feeHead', label: 'Fee Head' }, { key: 'amount', label: 'Amount' }, { label: 'Payment Mode', value: r => MODE_LONG[r.mode] || r.mode },
        { key: 'transactionRef', label: 'Reference' }, { key: 'status', label: 'Status' },
      ], list), `payments-${rFrom}-to-${rTo}.csv`);
    } catch (e) { toast.error(e.message); }
  };

  const slices = ['online', 'cash', 'card', 'other'].map(k => ({
    label: k[0].toUpperCase() + k.slice(1), value: t[k]?.amount || 0, pct: t[k]?.share || 0, color: DONUT_INK[k],
  }));

  return (
    <div className="fe-page">
      <FeHead title="Payments" subtitle="Track and manage all fee payments made by students.">
        <div className="fe-head__stack">
          <div style={{ display: 'flex', gap: 14 }}>
            <Btn variant="outline" icon="download" onClick={() => (chosenWithReceipts.length ? receipts(chosenWithReceipts) : toast('Tick the payments whose receipts you want'))}
              title="Tick payments to print their receipts together">Download Receipt</Btn>
            <Btn variant="outline" icon="download" onClick={exportCsv}>Export</Btn>
            <Btn variant="primary" icon="plus" onClick={() => setPaying(true)} style={{ minWidth: 208 }}>Record Payment</Btn>
          </div>
          <DateRange compact from={rFrom} to={rTo} presets={rangePresets(data?.year)} onChange={v => setApplied({ from: v.from, to: v.to, page: '1' })} />
        </div>
      </FeHead>

      <Tiles n={5}>
        <Tile glyph="rupee" tone="green" label="Total Payments" value={money(t.total, { sym, space: true })} delta={{ pct: t.change, caption: 'vs last period', noSign: true }} />
        <Tile glyph="card" tone="blue" label="Online Payments" value={money(t.online?.amount, { sym, space: true })} share={{ pct: t.online?.share || 0, color: INK.blue }} />
        <Tile glyph="cash" tone="purple" label="Cash Payments" value={money(t.cash?.amount, { sym, space: true })} share={{ pct: t.cash?.share || 0, color: '#9333ea' }} />
        <Tile glyph="card" tone="amber" label="Card Payments" value={money(t.card?.amount, { sym, space: true })} share={{ pct: t.card?.share || 0, color: '#f97316' }} />
        <Tile glyph="dots" tone="pink" label="Other Payments" value={money(t.other?.amount, { sym, space: true })} share={{ pct: t.other?.share || 0, color: INK.purple }} />
      </Tiles>

      <div className="fe-pay">
        <Card className="fe-rfilters">
          <div className="fe-rfilters__head"><h3>Filters</h3><button type="button" className="fe-link" style={{ fontStyle: 'italic' }} onClick={reset}>Reset</button></div>
          <Select label="Academic Year" value={yearValue} onChange={setD('academicYearId')} options={yearOptions(draftMeta?.years || meta?.years)} />
          <Select label="Class" value={draft.classId} onChange={setD('classId')} all="All Classes" options={classOptions(draftMeta)} />
          <Select label="Section" value={draft.sectionId} onChange={setD('sectionId')} all="All Sections" options={sectionOptions(draftMeta, draft.classId)} disabled={!draft.classId} />
          <Select label="Payment Mode" value={draft.mode} onChange={setD('mode')} all="All Modes" options={Object.entries(MODE).map(([value, label]) => ({ value, label }))} />
          <Select label="Payment Status" value={draft.status} onChange={setD('status')} all="All Statuses"
            options={[{ value: 'completed', label: 'Success' }, { value: 'pending', label: 'Pending approval' }, { value: 'failed', label: 'Failed' }, { value: 'refunded', label: 'Cancelled' }]} />
          <label className="fe-field"><span className="fe-field__label">Date Range</span>
            <DateRange from={draft.from || rFrom} to={draft.to || rTo} presets={rangePresets(data?.year)} onChange={v => setDraft(d => ({ ...d, from: v.from, to: v.to }))} />
          </label>
          <label className="fe-field"><span className="fe-field__label">Student</span>
            <Search value={draft.q} onChange={setD('q')} onEnter={apply} placeholder="Search by name or admission no." />
          </label>
          <Btn variant="primary" className="fe-btn--block fe-btn--lg" onClick={apply}>Apply Filters</Btn>
        </Card>

        <div className="fe-pay__main">
          <div className="fe-pay__charts">
            <Card>
              <CardHead title="Payments Trend">
                <div style={{ width: 140 }}><Select value={range} onChange={setRange} compact options={[{ value: '6', label: 'Last 6 months' }, { value: '12', label: 'Last 12 months' }, { value: 'year', label: 'This academic year' }]} /></div>
              </CardHead>
              <div className="fe-cardbody" style={{ paddingBottom: 12 }}>
                <ModeTrend data={data?.trend || []} sym={sym} />
                <Legend items={[{ label: 'Online', color: GROUP_INK.online }, { label: 'Cash', color: GROUP_INK.cash }, { label: 'Card', color: GROUP_INK.card }, { label: 'Other', color: GROUP_INK.other }]} />
              </div>
            </Card>
            <Card>
              <CardHead title="Payments by Mode" />
              <div className="fe-cardbody" style={{ display: 'flex', alignItems: 'center', gap: 14, paddingRight: 14 }}>
                <Donut size={150} thickness={21} slices={slices} sym={sym} hover={hover} onHover={setHover}
                  center={[money(t.total, { sym, space: true }), 'Total']} />
                <DonutLegend rows={slices} amounts sym={sym} hover={hover} onHover={setHover} className="fe-dlegend--tight" />
              </div>
            </Card>
          </div>

          <div className="fe-pay__bar">
            <PillTabs className="uitabs--flush uitabs--sm" value={applied.group} onChange={g => setApplied({ group: g, page: '1' })} items={[
              { key: '', label: 'All Payments', count: c.all || 0, tone: 'slate' },
              { key: 'online', label: 'Online', count: c.online || 0, tone: 'slate' },
              { key: 'cash', label: 'Cash', count: c.cash || 0, tone: 'slate' },
              { key: 'card', label: 'Card', count: c.card || 0, tone: 'slate' },
              { key: 'other', label: 'Other', count: c.other || 0, tone: 'slate' },
            ]} />
            <Search value={search} onChange={setSearch} onEnter={() => setApplied({ q: search, page: '1' })} placeholder="Search payments..." />
          </div>

          <Card>
            <div className="fe-tablewrap">
              <table className="fe-table fe-table--dense fe-table--xdense">
                <thead>
                  <tr>
                    <th className="fe-w-check"><Check checked={allOn} indeterminate={!allOn && picked.size > 0} label="Select all"
                      onChange={() => setPicked(allOn ? new Set() : new Set(rows.map(r => r._id)))} /></th>
                    <th>#</th><th>Student Name</th><th>Adm. No.</th><th>Class / Section</th><th>Fee Head</th><th>Amount</th>
                    <th>Payment Mode</th><th>Date &amp; Time</th><th>Status</th><th>Receipt</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r._id} className={picked.has(r._id) ? 'is-sel' : ''}>
                      <td><Check checked={picked.has(r._id)} label="Select payment"
                        onChange={() => setPicked(p => { const n = new Set(p); if (n.has(r._id)) n.delete(r._id); else n.add(r._id); return n; })} /></td>
                      <td>{(page - 1) * limit + i + 1}</td>
                      <td><span className="fe-who"><Avatar name={r.student.name} size={28} /><span><b>{r.student.name}</b></span></span></td>
                      <td className="fe-muted">{r.admissionNumber || '—'}</td>
                      <td>{r.classLabel}</td>
                      <td className="fe-nowrap">{r.feeHead}</td>
                      <td className="fe-num">{money(r.amount, { sym, space: true })}</td>
                      <td>{MODE_LONG[r.mode] || r.mode}</td>
                      <td className="fe-num">{fmtDateTime(r.date)}</td>
                      <td><span title={r.voidReason ? `Cancelled: ${r.voidReason}` : undefined}><StatusBadge status={r.status} /></span></td>
                      <td><IconBtn icon="download" label={r.status === 'completed' ? `Receipt ${r.receiptNumber || ''}` : 'No receipt until approved'}
                        onClick={() => receipts([r._id])} disabled={r.status !== 'completed'} tone="primary" /></td>
                      <td>
                        <RowMenu>
                          {r.status === 'pending' ? (<>
                            <MenuItem icon="checkCircle" onClick={() => approve(r)}>Approve payment</MenuItem>
                            <MenuItem icon="closeCircle" danger onClick={() => setRejecting(r)}>Reject payment</MenuItem>
                            <MenuSep />
                          </>) : null}
                          <MenuItem icon="user" onClick={() => setStudentId(r.student._id)}>View student fees</MenuItem>
                          {r.status === 'completed' ? <MenuItem icon="download" onClick={() => receipts([r._id])}>Open receipt</MenuItem> : null}
                          {r.status === 'completed' ? (<>
                            <MenuSep />
                            <MenuItem icon="closeCircle" danger onClick={() => setVoiding(r)}>Cancel payment</MenuItem>
                          </>) : null}
                        </RowMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loading && !data ? <Loading rows={6} /> : null}
              {!loading && !rows.length ? <Empty title="No payments in this range" hint="Widen the date range or clear the filters." /> : null}
            </div>
            <Pager page={page} pages={env?.pages || 1} total={env?.total || 0} limit={limit} count={rows.length} noun="payments"
              onPage={p => setApplied({ page: String(p) })} onLimit={l => setApplied({ limit: String(l), page: '1' })} />
          </Card>
        </div>
      </div>

      <RecordPaymentDialog open={!!paying} onClose={() => setPaying(null)} onDone={refetch} meta={meta} student={paying?._id ? paying : null} />
      <StudentDrawer studentId={studentId} onClose={() => setStudentId(null)} meta={meta} onChanged={refetch}
        onCollect={(s) => { setStudentId(null); setPaying(s || true); }} />
      <VoidPaymentDialog payment={voiding} onClose={() => setVoiding(null)} onDone={refetch} sym={sym} />
      <Confirm open={!!rejecting} onClose={() => setRejecting(null)} onConfirm={reject} title="Reject payment" confirmLabel="Reject"
        message={rejecting ? `Reject the ${money(rejecting.amount, { sym })} payment submitted for ${rejecting.student.name}? It will be marked failed and the family told to contact the office.` : ''} />
    </div>
  );
}
