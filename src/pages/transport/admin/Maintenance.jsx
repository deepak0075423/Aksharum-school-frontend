/**
 * Transport → Maintenance.
 *
 * "Overdue" is computed, not stored: a job whose scheduled day has passed and
 * that nobody closed. That is what puts a vehicle in the Overdue tile and in
 * the red band of Service Status, and it is the same test in both places.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search,
  Filters, FilterEnd, TableWrap, Cell2, Thumb, Badge, StatusBadge, Pager, Rows, Row, QuickActions,
  Loading, Empty, Note, Confirm, Mark, DateChip, count, money, fmtDate, words, useBoard, useDebounced,
  toCsv, saveFile,
} from './trUI';
import { Bars, Donut, DonutLegend, DonutRow, toSlices } from './trCharts';
import { MaintenanceForm } from './trForms';

export default function TransportMaintenance() {
  const [q, setQ] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(
    () => api.getMaintenanceBoard({ search, vehicle, serviceType, status, page, limit }),
    [search, vehicle, serviceType, status, page, limit],
  );
  const d = data || {};
  const t = d.tiles || {};
  const rows = d.data || [];
  const ss = d.serviceStatus || {};

  const reset = () => { setQ(''); setVehicle(''); setServiceType(''); setStatus(''); setPage(1); };
  const exportCsv = () => {
    saveFile(`maintenance-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['vehicle', 'Vehicle', (r) => r.vehicle?.vehicleNumber || ''],
      ['title', 'Service Type'], ['categoryLabel', 'Category'],
      ['scheduledDate', 'Scheduled', (r) => fmtDate(r.scheduledDate)],
      ['completedDate', 'Completed', (r) => fmtDate(r.completedDate)],
      ['odometer', 'Odometer (km)'], ['cost', 'Cost (₹)'], ['vendor', 'Workshop'],
      ['displayStatus', 'Status', (r) => words(r.displayStatus)],
    ], rows));
    toast.success('Exported the records on this page');
  };
  const remove = async () => {
    try { await api.deleteMaintenance(del._id); toast.success('Record removed'); setDel(null); reload(); }
    catch (e) { toast.error(e?.message || 'Could not remove it'); setDel(null); }
  };

  if (loading && !data) return <div className="tr-page"><Loading tiles={4} /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load maintenance">{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={`${fmtDate(d.range?.from)} – ${fmtDate(d.range?.to)}`} icon="calendar" />
        <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Schedule Maintenance</Btn>
      </TopBar>

      <TrHead title="Vehicle Maintenance" subtitle="Keep your fleet safe, reliable and on the road">
        <Btn icon="download" onClick={exportCsv}>Export Report</Btn>
      </TrHead>

      <Tiles cols="4">
        <Tile icon="wrench" tone="blue" value={count(t.vehicles)} label="Total Vehicles"
              legend={[
                { tone: 'green', value: t.active, label: 'Active' },
                { tone: 'red', value: t.inMaintenance, label: 'In Maintenance' },
              ]} />
        <Tile icon="calendar" tone="green" value={count(t.scheduledThisMonth)} label="Scheduled This Month"
              delta={t.scheduledDelta} deltaNote="vs. last month" />
        <Tile icon="bang" tone="red" value={count(t.overdue)} label="Overdue Services"
              sub={t.overdue ? 'Resolve soon' : 'Nothing is overdue'} />
        <Tile icon="clock" tone="indigo" value={count(t.inWorkshop)} label="In Workshop"
              sub={t.inWorkshop ? 'Off the road right now' : 'All vehicles operational'} />
      </Tiles>

      <div className="tr-grid tr-grid--chart3">
        <Card>
          <CardHead title="Maintenance Overview" />
          <CardBody>
            {d.overview?.length ? (
              <>
                <Bars data={d.overview} height={196} series={[
                  { key: 'scheduled', label: 'Scheduled', color: '#c7d2fe' },
                  { key: 'completed', label: 'Completed', color: '#6366f1' },
                ]} />
                <div className="tr-legend" style={{ marginTop: 10 }}>
                  <span><i style={{ background: '#c7d2fe' }} />Scheduled</span>
                  <span><i style={{ background: '#6366f1' }} />Completed</span>
                </div>
              </>
            ) : <Empty icon="chart" sm title="No jobs in the last six months" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Maintenance Cost Breakdown" />
          <CardBody fill>
            {d.breakdown?.length ? (
              <DonutRow>
                <div className="tr-donutwrap__chart">
                  <Donut size={150} thickness={23} total={money(d.totalCost)} sub="Total Cost"
                         data={toSlices(d.breakdown, { valueKey: 'cost' })} />
                </div>
                <DonutLegend data={toSlices(d.breakdown, { valueKey: 'cost' })}
                             right={(x) => `${d.breakdown.find((r) => r.label === x.label)?.pct || 0}%`} />
              </DonutRow>
            ) : <Empty icon="chart" sm title="No costs recorded" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Service Status" right={<Badge tone="slate">{count(ss.fleet)} vehicles</Badge>} />
          <CardBody>
            <div className="tr-statuslist">
              <StatusRow icon="wrench" tone="green" value={ss.upToDate} title="Up to Date"
                         sub={`${ss.fleet ? Math.round((ss.upToDate / ss.fleet) * 100) : 0}% of fleet`} label="Up to Date" />
              <StatusRow icon="clock" tone="amber" value={ss.dueSoon} title="Due Soon"
                         sub={`Within ${ss.dueDays || 7} days`} label="Due Soon" />
              <StatusRow icon="bang" tone="red" value={ss.overdue} title="Overdue"
                         sub="Past their scheduled day" label="Overdue" />
              <StatusRow icon="pause" tone="slate" value={ss.inMaintenance} title="In Maintenance"
                         sub="Currently in workshop" label="In Maintenance" />
            </div>
          </CardBody>
        </Card>
      </div>

      <Filters>
        <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by vehicle no., service type, or workshop…" />
        <Select value={vehicle} onChange={(v) => { setVehicle(v); setPage(1); }} placeholder="All Vehicles" options={d.filters?.vehicles || []} />
        <Select value={serviceType} onChange={(v) => { setServiceType(v); setPage(1); }} placeholder="All Service Types"
                options={(d.filters?.serviceTypes || []).map((v) => ({ value: v, label: words(v) }))} />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All Status"
                options={['scheduled', 'in_progress', 'completed', 'overdue', 'cancelled'].map((v) => ({ value: v, label: words(v) }))} />
        <Btn onClick={reset}>Reset</Btn>
      </Filters>

      <div className="tr-split">
        <Card>
          <CardHead title={`Maintenance Records (${count(d.total)})`} />
          <CardBody flush>
            <TableWrap>
              <table className="tr-table">
                <thead>
                  <tr>
                    <th className="tr-table__idx">#</th>
                    <th>Vehicle</th><th>Service Type</th><th>Scheduled Date</th><th>Completed Date</th>
                    <th className="tr-r">Odometer (km)</th><th className="tr-r">Cost (₹)</th><th>Status</th>
                    <th className="tr-table__acts">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r._id}>
                      <td className="tr-table__idx">{(d.page - 1) * limit + i + 1}</td>
                      <td><div className="tr-who"><Thumb src={r.vehicle?.photo} /><Cell2 top={r.vehicle?.vehicleNumber || '—'} sub={r.vehicle?.manufacturer} /></div></td>
                      <td><Cell2 top={r.title} sub={r.categoryLabel} /></td>
                      <td>{fmtDate(r.scheduledDate)}</td>
                      <td>{r.completedDate ? fmtDate(r.completedDate) : '—'}</td>
                      <td className="tr-r tr-num">{r.odometer ? count(r.odometer) : '—'}</td>
                      <td className="tr-r tr-num">{r.cost ? count(r.cost) : '—'}</td>
                      <td><StatusBadge value={r.displayStatus} /></td>
                      <td className="tr-table__acts">
                        <div>
                          <IconBtn icon="eye" label="View" onClick={() => setForm(r)} />
                          <IconBtn icon="pencil" label="Edit" onClick={() => setForm(r)} />
                          <IconBtn icon="trash" kind="danger" label="Delete" onClick={() => setDel(r)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {!rows.length ? (
              <Empty icon="wrench" title="No maintenance records here"
                     action={<Btn kind="soft" icon="plus" onClick={() => setForm({})}>Schedule a service</Btn>} />
            ) : null}
            <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="records"
                   onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} limits={[5, 10, 25, 50]} />
          </CardBody>
        </Card>

        <div className="tr-rail">
          <Panel title="Upcoming Services" right={<Badge tone="amber">{d.upcoming?.length || 0}</Badge>} flush>
            {d.upcoming?.length ? (
              <Rows>
                {d.upcoming.map((u) => (
                  <Row key={u._id}
                       avatar={<DateChip day={u.day} month={u.month} tone={u.state === 'overdue' ? 'red' : u.state === 'due_soon' ? 'amber' : 'indigo'} />}
                       title={`${u.vehicle?.vehicleNumber || '—'}${u.vehicle?.manufacturer ? ` (${u.vehicle.manufacturer})` : ''}`}
                       sub={u.title}
                       badge={<StatusBadge value={u.state === 'overdue' ? 'overdue' : u.state === 'due_soon' ? 'due_soon' : 'scheduled'} />} />
                ))}
              </Rows>
            ) : <div style={{ padding: 16 }}><Note tone="good" title="Nothing is due">Every vehicle's next service is more than {ss.dueDays || 7} days away.</Note></div>}
          </Panel>

          <Panel title="Quick Actions">
            <QuickActions items={[
              { icon: 'calendar', label: 'Schedule Service', onClick: () => setForm({}) },
              { icon: 'history', label: 'Service History', to: '/admin/transport/reports' },
              { icon: 'package', label: 'Parts Inventory', to: '/admin/inventory/items' },
              { icon: 'chart', label: 'Maintenance Report', to: '/admin/transport/reports' },
            ]} />
          </Panel>
        </div>
      </div>

      {form ? <MaintenanceForm open onClose={() => setForm(null)} row={form._id ? form : null}
                               onSaved={() => { setForm(null); reload(); }} /> : null}
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} tone="danger"
               title="Delete this record?" confirmLabel="Delete"
               message="The job and its cost are removed from the service history and the cost breakdown." />
    </div>
  );
}

const StatusRow = ({ icon, tone, value, title, sub }) => (
  <div className="tr-statusrow">
    <Mark name={icon} tone={tone} className="tr-statusrow__mark" size={34} glyph={17} />
    <div className="tr-statusrow__text"><b>{count(value)}</b></div>
    <Badge tone={tone}>{title}</Badge>
    <span style={{ marginLeft: 'auto', fontSize: '.75rem', color: 'var(--tr-muted)', textAlign: 'right' }}>{sub}</span>
  </div>
);
