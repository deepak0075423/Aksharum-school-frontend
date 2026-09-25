/**
 * Transport → Fee Plans.
 *
 * "Total Revenue (Annual)" is the plans' own arithmetic — amount × how often it
 * bills × how many children are on it — while the year-on-year comparison is
 * made on invoices actually billed, because last year's plans may since have
 * been edited out of existence.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search,
  Filters, FilterEnd, TableWrap, Cell2, Badge, StatusBadge, Chip, Pager, Rows, Row, QuickActions,
  Loading, Empty, Note, Confirm, DateChip, Mark, count, money, compactMoney, fmtDate, words,
  FREQUENCY, useBoard, useDebounced, toCsv, saveFile, plural } from './trUI';
import { Bars, Donut, DonutLegend, DonutRow, STATUS_INK } from './trCharts';
import { FeePlanForm } from './trForms';

/* Reserved state colours, escalating. Overdue was drawn in slate and pending in
   red, which said the harmless state was the serious one — and the Invoices
   screen paints overdue red, so the two disagreed about the same money. */
const COLLECTION_META = {
  paid: ['green', 'check', 'Paid'], partial: ['blue', 'clock', 'Partial'],
  pending: ['amber', 'bang', 'Pending'], overdue: ['red', 'x', 'Overdue'],
};

export default function TransportFeePlans() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [route, setRoute] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(
    () => api.getFeePlanBoard({ search, status, route, vehicleType, page, limit }),
    [search, status, route, vehicleType, page, limit],
  );
  const d = data || {};
  const t = d.tiles || {};
  const rows = d.data || [];

  const reset = () => { setQ(''); setStatus(''); setRoute(''); setVehicleType(''); setPage(1); };
  const exportCsv = () => {
    saveFile(`fee-plans-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['name', 'Plan Name'], ['scope', 'Route / Zone'], ['vehicleTypeLabel', 'Vehicle Type'],
      ['amount', 'Fee Amount (₹)'], ['frequencyLabel', 'Billing Frequency'], ['students', 'Students'],
      ['annual', 'Annual Revenue (₹)'], ['status', 'Status'], ['approvalStatus', 'Approval'],
    ], rows));
    toast.success('Exported the plans on this page');
  };
  const approve = async (plan, action) => {
    try { await api.approveFeePlan(plan._id, { action }); toast.success(`Plan ${action}d`); reload(); }
    catch (e) { toast.error(e?.message || 'Could not do that'); }
  };
  const remove = async () => {
    try { await api.deleteFeePlan(del._id); toast.success('Plan retired'); setDel(null); reload(); }
    catch (e) { toast.error(e?.message || 'Could not retire it'); setDel(null); }
  };

  if (loading && !data) return <div className="tr-page"><Loading tiles={4} /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load fee plans">{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={t.yearName || `${new Date().getFullYear()}`} sub="Academic Year" icon="calendar" />
        <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Create Fee Plan</Btn>
      </TopBar>

      <TrHead icon="rupee" iconTone="green" title="Transport Fee Plans"
              subtitle="Create and manage transport fee plans for different routes, zones and vehicle types." />

      <Tiles cols="4">
        <Tile icon="people" tone="indigo" value={count(t.plans)} label="Active Fee Plans"
              delta={t.plansDelta} deltaNote="vs. last term" />
        <Tile icon="students" tone="green" value={count(t.enrolled)} label="Students Enrolled"
              sub={`${t.enrolledPct || 0}% of total students`} />
        <Tile icon="rupee" tone="amber" value={money(t.annual, { space: true })} label="Total Revenue (Annual)"
              delta={t.annualDelta} deltaNote="vs. last year billed" />
        <Tile icon="doc" tone="red" value={count(t.pendingApprovals)} label="Pending Approvals"
              sub={t.pendingApprovals ? 'Requires action' : 'Nothing waiting'} />
      </Tiles>

      <div className="tr-grid tr-grid--chart3">
        <Card>
          <CardHead title="Revenue Trend" right={<Badge tone="slate">Last 6 Months</Badge>} />
          <CardBody>
            {d.revenueTrend?.length ? (
              <>
                <Bars data={d.revenueTrend} height={196} fmt={compactMoney} series={[
                  { key: 'expected', label: 'Expected Revenue', color: '#c7d2fe' },
                  { key: 'collected', label: 'Collected Revenue', color: '#4f46e5' },
                ]} />
                <div className="tr-legend" style={{ marginTop: 10 }}>
                  <span><i style={{ background: '#c7d2fe' }} />Expected Revenue</span>
                  <span><i style={{ background: '#4f46e5' }} />Collected Revenue</span>
                </div>
              </>
            ) : <Empty icon="chart" sm title="Nothing billed yet" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Student Distribution by Fee Plan" />
          <CardBody fill>
            {d.distribution?.length ? (
              <DonutRow>
                <div className="tr-donutwrap__chart">
                  <Donut size={150} thickness={23} total={t.enrolled} sub="Students"
                         data={d.distribution.map((x) => ({ label: x.label, value: x.students, color: x.color }))} />
                </div>
                <DonutLegend data={d.distribution.map((x) => ({ label: x.label, value: x.students, color: x.color }))}
                             right={(x) => `${d.distribution.find((r) => r.label === x.label)?.pct || 0}%`} />
              </DonutRow>
            ) : <Empty icon="chart" sm title="Nobody is on a plan yet" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Fee Collection Status" right={<Badge tone="slate">This month</Badge>} />
          <CardBody>
            {(d.collectionStatus || []).some((x) => x.students) ? (
              <div className="tr-statuslist">
                {(d.collectionStatus || []).map((x) => {
                  const [tone, icon, label] = COLLECTION_META[x.key] || ['slate', 'info', words(x.key)];
                  return (
                    <div className="tr-statusrow" key={x.key}>
                      <Mark name={icon} tone={tone} className="tr-statusrow__mark" size={34} glyph={17} />
                      <div className="tr-statusrow__text">
                        <b>{label}</b>
                        <span>{plural(x.students, 'student')}</span>
                      </div>
                      <div style={{ flex: '0 0 110px' }}>
                        <span className="tr-bar"><i style={{ width: `${x.pct}%`, background: STATUS_INK[tone] }} /></span>
                      </div>
                      <b style={{ fontSize: '.82rem', minWidth: 34, textAlign: 'right' }}>{x.pct}%</b>
                    </div>
                  );
                })}
              </div>
            ) : <Empty icon="rupee" sm title="No invoices this month">Generate them on the Invoices screen.</Empty>}
          </CardBody>
        </Card>
      </div>

      <Filters>
        <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search fee plans by name, route, or vehicle type…" />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All Status"
                options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        <Select value={route} onChange={(v) => { setRoute(v); setPage(1); }} placeholder="All Routes" options={d.filters?.routes || []} />
        <Select value={vehicleType} onChange={(v) => { setVehicleType(v); setPage(1); }} placeholder="All Vehicle Types" options={d.filters?.vehicleTypes || []} />
        <Btn onClick={reset}>Reset</Btn>
        <FilterEnd><Btn icon="upload" onClick={exportCsv}>Export</Btn></FilterEnd>
      </Filters>

      <div className="tr-split">
        <Card>
          <CardHead title={`Fee Plans (${count(d.total)})`} />
          <CardBody flush>
            <TableWrap>
              <table className="tr-table">
                <thead>
                  <tr>
                    <th className="tr-table__idx">#</th>
                    <th>Plan Name</th><th>Route / Zone</th><th>Vehicle Type</th>
                    <th className="tr-r">Fee Amount</th><th>Billing Frequency</th>
                    <th className="tr-r">Students</th><th>Status</th><th className="tr-table__acts">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r._id}>
                      <td className="tr-table__idx">{(d.page - 1) * limit + i + 1}</td>
                      <td>
                        <div className="tr-who">
                          <span className="tr-rbadge" style={{ background: r.route?.color || '#64748b' }}>{r.letter}</span>
                          <Cell2 top={r.name} sub={r.approvalStatus === 'pending' ? 'Awaiting approval' : r.description} />
                        </div>
                      </td>
                      <td>{r.scope}</td>
                      <td>{r.vehicleTypeLabel}</td>
                      <td className="tr-r tr-num">
                        {money(r.amount)}
                        {r.amountRange && r.amountRange.min !== r.amountRange.max
                          ? <div style={{ fontSize: '.7rem', color: 'var(--tr-muted)' }}>to {money(r.amountRange.max)}</div> : null}
                      </td>
                      <td>{r.frequencyLabel}</td>
                      <td className="tr-r tr-num">{count(r.students)}</td>
                      <td>
                        {r.approvalStatus === 'pending'
                          ? <Badge tone="amber">Pending Approval</Badge>
                          : <StatusBadge value={r.status} />}
                      </td>
                      <td className="tr-table__acts">
                        <div>
                          {r.approvalStatus === 'pending' ? (
                            <>
                              <IconBtn icon="checkCircle" kind="primary" label="Approve" onClick={() => approve(r, 'approve')} />
                              <IconBtn icon="closeCircle" kind="danger" label="Reject" onClick={() => approve(r, 'reject')} />
                            </>
                          ) : (
                            <>
                              <IconBtn icon="pencil" label="Edit" onClick={() => setForm(r)} />
                              <IconBtn icon="copy" label="Duplicate"
                                       onClick={() => setForm({ ...r, _id: undefined, name: `${r.name} (copy)` })} />
                              <IconBtn icon="trash" kind="danger" label="Retire" onClick={() => setDel(r)} />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {!rows.length ? (
              <Empty icon="rupee" title="No fee plans yet"
                     action={<Btn kind="soft" icon="plus" onClick={() => setForm({})}>Create the first plan</Btn>}>
                A student with no plan is never billed for transport.
              </Empty>
            ) : null}
            <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="fee plans"
                   onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
          </CardBody>
        </Card>

        <div className="tr-rail">
          <Panel title="Upcoming Fee Renewals" right={<Badge tone="amber">{d.renewals?.length || 0}</Badge>} flush>
            {d.renewals?.length ? (
              <Rows>
                {d.renewals.map((r) => (
                  <Row key={r._id} avatar={<DateChip day={r.day} month={r.month} tone="indigo" />}
                       title={r.name} sub={plural(r.students, 'student')}
                       badge={<Badge tone={r.inDays <= 7 ? 'red' : 'green'}>In {r.inDays} days</Badge>} />
                ))}
              </Rows>
            ) : (
              <div style={{ padding: 16 }}>
                <Note tone="info" title="No renewal dates set">
                  Give a plan a renewal date when you edit it and it is listed here as the date approaches.
                </Note>
              </div>
            )}
          </Panel>

          <Panel title="Quick Actions">
            <QuickActions items={[
              { icon: 'plus', label: 'Create New Plan', onClick: () => setForm({}) },
              { icon: 'sliders', label: 'Bulk Update', to: '/admin/transport/assignments' },
              { icon: 'chart', label: 'Fee Report', to: '/admin/transport/reports' },
              { icon: 'history', label: 'Collection History', to: '/admin/transport/invoices' },
            ]} />
          </Panel>
        </div>
      </div>

      {form ? <FeePlanForm open onClose={() => setForm(null)} row={form._id ? form : null}
                           onSaved={() => { setForm(null); reload(); }} /> : null}
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} tone="danger"
               title="Retire this fee plan?" confirmLabel="Retire"
               message={`${del?.name} stops being offered. Students already on it keep their invoices — move them to another plan first.`} />
    </div>
  );
}
