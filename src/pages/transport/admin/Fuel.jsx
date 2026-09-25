/**
 * Transport → Fuel.
 *
 * The four alerts on the right are measurements against the school's own
 * settings (mileage floor, spike percentage, silent-vehicle days), not a fixed
 * rule — so a school running CNG vans and one running diesel buses each get
 * warnings that mean something.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search,
  Filters, FilterEnd, TableWrap, Cell2, Who, Thumb, Badge, Pager, Rows, Row, QuickActions, Loading,
  Empty, Note, Confirm, count, money, compactMoney, fmtDate, fmtTime, fmtDateTime, isoDay, words,
  useBoard, useDebounced, toCsv, saveFile,
} from './trUI';
import { ComboChart, Donut, DonutLegend, DonutRow, RankBars, toSlices } from './trCharts';
import { FuelForm, ImportModal } from './trForms';

const RANGES = [
  { value: '7', label: 'Last 7 Days' }, { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' }, { value: '365', label: 'Last 12 Months' },
];

export default function TransportFuel() {
  const [days, setDays] = useState('30');
  const [q, setQ] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [form, setForm] = useState(false);
  const [imp, setImp] = useState(false);
  const [del, setDel] = useState(null);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(
    () => api.getFuelBoard({ days, search, vehicle, driver, page, limit }),
    [days, search, vehicle, driver, page, limit],
  );
  const d = data || {};
  const t = d.tiles || {};
  const rows = d.data || [];

  const reset = () => { setQ(''); setVehicle(''); setDriver(''); setPage(1); };
  const exportCsv = () => {
    saveFile(`fuel-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['date', 'Date', (r) => fmtDateTime(r.date)],
      ['vehicle', 'Vehicle', (r) => r.vehicle?.vehicleNumber || ''],
      ['driver', 'Driver', (r) => r.driver?.name || ''],
      ['odometer', 'Odometer (km)'], ['litres', 'Fuel (L)'], ['totalCost', 'Cost (₹)'],
      ['pricePerLitre', 'Price/L (₹)'], ['vendor', 'Station'], ['receipt', 'Bill No.'], ['mileage', 'Mileage (km/l)'],
    ], rows));
    toast.success('Exported the records on this page');
  };
  const remove = async () => {
    try { await api.deleteFuel(del._id); toast.success('Entry removed'); setDel(null); reload(); }
    catch (e) { toast.error(e?.message || 'Could not remove it'); setDel(null); }
  };

  if (loading && !data) return <div className="tr-page"><Loading tiles={4} /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load fuel records">{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={`${fmtDate(d.range?.from)} – ${fmtDate(d.range?.to)}`} icon="calendar" />
        <Btn kind="primary" icon="plus" onClick={() => setForm(true)}>Add Fuel Entry</Btn>
      </TopBar>

      <TrHead title="Fuel Management" subtitle="Track fuel consumption, expenses and efficiency across your transport fleet.">
        <Btn icon="download" onClick={exportCsv}>Download Report</Btn>
      </TrHead>

      <Tiles cols="4">
        <Tile icon="fuel" tone="orange" value={money(t.expense, { space: true })} label="Total Fuel Expense"
              delta={t.expenseDelta} deltaNote="vs. last period" />
        <Tile icon="drop" tone="teal" value={`${count(t.litres)} L`} label="Total Fuel Consumed"
              delta={t.litresDelta} deltaNote="vs. last period" />
        <Tile icon="gauge" tone="blue" value={`${t.mileage || 0} km/l`} label="Average Mileage"
              delta={t.mileageDelta} deltaNote="vs. last period" />
        <Tile icon="bus" tone="indigo" value={`${count(t.refuelled)} / ${count(t.fleet)}`} label="Vehicles Refueled"
              sub={`${t.refuelledPct || 0}% of fleet`} />
      </Tiles>

      <div className="tr-grid tr-grid--chart3">
        <Card>
          <CardHead title="Fuel Consumption Trend"
                    right={<Select value={days} onChange={(v) => { setDays(v); setPage(1); }} options={RANGES} width={150} />} />
          <CardBody>
            {d.trend?.length ? (
              <ComboChart data={d.trend} barKey="litres" lineKey="cost" barLabel="Fuel Consumed" lineLabel="Fuel Cost"
                          barColor="#a5b4fc" lineColor="#16a34a" height={214} />
            ) : <Empty icon="fuel" sm title="No fill-ups in this window" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Fuel Distribution by Vehicle Type" />
          <CardBody fill>
            {d.distribution?.length ? (
              <DonutRow>
                <div className="tr-donutwrap__chart">
                  <Donut size={150} thickness={23} total={`${count(t.litres)} L`} sub="Total"
                         data={toSlices(d.distribution, { valueKey: 'litres' })} />
                </div>
                <DonutLegend data={toSlices(d.distribution, { valueKey: 'litres' })} right={(x) => `${d.distribution.find((r) => r.label === x.label)?.pct || 0}%`} />
              </DonutRow>
            ) : <Empty icon="chart" sm title="Nothing to break down" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Top Fuel Consuming Vehicles" right={<Badge tone="slate">{d.top?.length || 0}</Badge>} />
          <CardBody>
            {d.top?.length ? (
              <RankBars nameWidth={78} fmt={(v) => `${count(v)} L`}
                        data={d.top.map((v) => ({
                          key: v._id, label: v.vehicleNumber, value: v.litres, color: '#818cf8',
                          lead: <Thumb src={v.photo} />,
                        }))} />
            ) : <Empty icon="bus" sm title="No fill-ups yet" />}
          </CardBody>
        </Card>
      </div>

      <Filters>
        <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by vehicle no., driver, or station…" />
        <Select value={vehicle} onChange={(v) => { setVehicle(v); setPage(1); }} placeholder="All Vehicles" options={d.filters?.vehicles || []} />
        <Select value={driver} onChange={(v) => { setDriver(v); setPage(1); }} placeholder="All Drivers" options={d.filters?.drivers || []} />
        <Select value={days} onChange={(v) => { setDays(v); setPage(1); }} options={RANGES} width={150} />
        <Btn onClick={reset}>Reset</Btn>
        <FilterEnd><Btn icon="upload" onClick={exportCsv}>Export</Btn></FilterEnd>
      </Filters>

      <div className="tr-split">
        <Card>
          <CardHead title={`Fuel Records (${count(d.total)})`} />
          <CardBody flush>
            <TableWrap>
              <table className="tr-table">
                <thead>
                  <tr>
                    <th className="tr-table__idx">#</th>
                    <th>Date & Time</th><th>Vehicle</th><th>Driver</th>
                    <th className="tr-r">Odometer (km)</th><th className="tr-r">Fuel (L)</th>
                    <th className="tr-r">Cost (₹)</th><th className="tr-r">Price/L (₹)</th>
                    <th>Station</th><th>Bill No.</th><th className="tr-table__acts">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r._id}>
                      <td className="tr-table__idx">{(d.page - 1) * limit + i + 1}</td>
                      <td><Cell2 top={fmtDate(r.date)} sub={fmtTime(r.date)} /></td>
                      <td><div className="tr-who"><Thumb src={r.vehicle?.photo} /><span style={{ fontWeight: 600 }}>{r.vehicle?.vehicleNumber || '—'}</span></div></td>
                      <td>{r.driver?.name || <span style={{ color: 'var(--tr-faint)' }}>—</span>}</td>
                      <td className="tr-r tr-num">{count(r.odometer)}</td>
                      <td className="tr-r tr-num">{r.litres}</td>
                      <td className="tr-r tr-num">{count(r.totalCost)}</td>
                      <td className="tr-r tr-num">{r.pricePerLitre ? r.pricePerLitre.toFixed(2) : '—'}</td>
                      <td>{r.vendor || '—'}</td>
                      <td className="tr-num">{r.receipt || '—'}</td>
                      <td className="tr-table__acts">
                        <div>
                          <IconBtn icon="pencil" label="Edit" onClick={() => setForm(true)} />
                          <IconBtn icon="trash" kind="danger" label="Delete" onClick={() => setDel(r)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {!rows.length ? (
              <Empty icon="fuel" title="No fuel entries here"
                     action={<Btn kind="soft" icon="plus" onClick={() => setForm(true)}>Add the first entry</Btn>} />
            ) : null}
            <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="records"
                   onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} limits={[5, 10, 25, 50]} />
          </CardBody>
        </Card>

        <div className="tr-rail">
          <Panel title="Fuel Alerts" right={<Badge tone={d.alerts?.length ? 'amber' : 'green'}>{d.alerts?.length || 0}</Badge>} flush>
            {d.alerts?.length ? (
              <Rows>
                {d.alerts.map((a, i) => (
                  <Row key={i} icon={{ low_mileage: 'gauge', high_consumption: 'fuel', unusual: 'info', missing: 'alert' }[a.kind] || 'alert'}
                       iconTone={{ bad: 'red', warn: 'amber', info: 'blue' }[a.tone] || 'amber'}
                       title={a.title} sub={a.detail} endSub={a.at ? fmtDate(a.at) : ''} />
                ))}
              </Rows>
            ) : (
              <div style={{ padding: 16 }}>
                <Note tone="good" title="Nothing looks wrong">
                  Mileage, consumption and refuelling patterns are all inside the thresholds set in Settings → Vehicles.
                </Note>
              </div>
            )}
          </Panel>

          <Panel title="Quick Actions">
            <QuickActions items={[
              { icon: 'plus', label: 'Add Fuel Entry', onClick: () => setForm(true) },
              { icon: 'upload', label: 'Bulk Upload', onClick: () => setImp(true) },
              { icon: 'chart', label: 'Fuel Report', to: '/admin/transport/reports' },
              { icon: 'gauge', label: 'Mileage Analysis', to: '/admin/transport/reports' },
            ]} />
          </Panel>
        </div>
      </div>

      <FuelForm open={form} onClose={() => setForm(false)} onSaved={() => { setForm(false); reload(); }} />
      <ImportModal open={imp} kind="fuel" onClose={() => setImp(false)} onSaved={() => { setImp(false); reload(); }} />
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} tone="danger"
               title="Delete this fuel entry?" confirmLabel="Delete"
               message="The mileage worked out from it will be recalculated on the next entry for that vehicle." />
    </div>
  );
}
