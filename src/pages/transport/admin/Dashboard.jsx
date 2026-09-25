/**
 * Transport → Dashboard.
 *
 * One read (`/transport/admin/overview`) answers the whole screen. The route
 * and period pickers are part of that query, so changing either re-asks the
 * server rather than filtering a copy in the browser.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, SplitBtn, Select,
  LinkBtn, Rows, Row, Badge, Mark, Loading, Empty, Note, money, count, fmtDay, fmtTime, ago, pct,
  useBoard, Glyph,
} from './trUI';
import { Donut, DonutLegend, DonutRow, Bars, ProgressLine, STATUS_INK } from './trCharts';
import TrMap from './trMap';
import NewRequestModal from './trForms';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

export default function TransportDashboard() {
  const nav = useNavigate();
  const [route, setRoute] = useState('all');
  const [period, setPeriod] = useState('today');
  const [newReq, setNewReq] = useState(false);

  const { data, loading, error, reload } = useBoard(
    () => api.getOverview({ route, period }), [route, period], { poll: 60 },
  );

  if (loading) return <div className="tr-page"><Loading /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load the dashboard">{error}</Note></div>;

  const d = data || {};
  const t = d.tiles || {};
  const trips = d.trips || {};
  const m = d.money || {};
  const up = d.upcoming || {};

  const tripSlices = [
    { label: 'Completed', value: trips.completed, color: STATUS_INK.good },
    { label: 'In Progress', value: trips.inProgress, color: STATUS_INK.info },
    { label: 'Delayed', value: trips.delayed, color: STATUS_INK.warn },
    { label: 'Cancelled', value: trips.cancelled, color: STATUS_INK.bad },
  ];
  const fleetSlices = [
    { label: 'Active', value: t.fleet?.active, color: STATUS_INK.good },
    { label: 'In Maintenance', value: t.fleet?.maintenance, color: STATUS_INK.warn },
    { label: 'Inactive', value: t.fleet?.inactive, color: STATUS_INK.bad },
  ];

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={fmtDay(d.date).replace(/^\w+, /, (mo) => mo)} icon="calendar"
                 sub={new Date(d.date).toDateString() === new Date().toDateString() ? 'Today' : ''} />
      </TopBar>

      <TrHead title="Transport Dashboard" subtitle="Fleet, routes, trips, safety and collection at a glance">
        <Select value={route} onChange={setRoute} width={150}
                options={[{ value: 'all', label: 'All Routes' }, ...(d.routes || []).map((r) => ({ value: r._id, label: `${r.tag} — ${r.name}` }))]} />
        <Select value={period} onChange={setPeriod} options={PERIODS} width={130} />
        <SplitBtn label="New Request" icon="plus" onClick={() => setNewReq(true)} items={[
          { label: 'Schedule a trip', icon: 'calendar', onClick: () => nav('/admin/transport/trips') },
          { label: 'Add a vehicle', icon: 'bus', onClick: () => nav('/admin/transport/vehicles') },
          { label: 'Report an incident', icon: 'alert', onClick: () => nav('/admin/transport/incidents') },
        ]} />
      </TrHead>

      <Tiles>
        <Tile icon="bus" tone="blue" value={count(t.fleet?.total)} label="Total Vehicles" to="/admin/transport/vehicles"
              legend={[
                { tone: 'green', value: t.fleet?.active, label: 'Active' },
                { tone: 'amber', value: t.fleet?.maintenance, label: 'In Maintenance' },
                { tone: 'red', value: t.fleet?.inactive, label: 'Inactive' },
              ]} />
        <Tile icon="driver" tone="orange" value={count(t.crew?.total)} label="Drivers & Crew" to="/admin/transport/staff"
              legend={[
                { tone: 'green', value: t.crew?.onDuty, label: 'On Duty' },
                { tone: 'slate', value: t.crew?.offDuty, label: 'Off Duty' },
              ]} />
        <Tile icon="students" tone="teal" value={count(t.students?.value)} label="Students Transported"
              to="/admin/transport/assignments" delta={t.students?.delta} deltaNote="vs. previous day"
              sub={t.students?.delta == null ? "Boarding starts with today's first trip" : undefined} />
        <Tile icon="route" tone="pink" value={count(t.routesTile?.total)} label="Active Routes" to="/admin/transport/routes"
              legend={[
                { tone: 'blue', value: t.routesTile?.morning, label: 'Morning' },
                { tone: 'purple', value: t.routesTile?.afternoon, label: 'Afternoon' },
                { tone: 'slate', value: t.routesTile?.both, label: 'Both' },
              ]} />
        <Tile icon="rupee" tone="green" value={money(t.collectedToday?.value, { space: true })}
              label="Fees Collected (Today)" to="/admin/transport/invoices"
              delta={t.collectedToday?.delta} deltaNote="vs. previous day" />
      </Tiles>

      <div className="tr-grid tr-grid--dash">
        <Card>
          <CardHead title="Live Vehicles" right={<LinkBtn to="/admin/transport/live">View Live Map</LinkBtn>}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.77rem', color: 'var(--tr-muted)' }}>
              <i className="tr-dot tr-dot--green" />{count(d.live?.onRoute)} vehicles on route
            </span>
          </CardHead>
          <CardBody fill>
            <TrMap height={236} vehicles={d.live?.markers || []} school={d.live?.school} routes={[]}
                   map={d.map} />
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Today's Trips" right={<LinkBtn to="/admin/transport/trips">View All</LinkBtn>} />
          <CardBody fill>
            {trips.total ? (
              <DonutRow>
                <div className="tr-donutwrap__chart">
                  <Donut data={tripSlices} total={trips.total} sub="Total Trips" size={158} thickness={24} />
                </div>
                <DonutLegend data={tripSlices} />
              </DonutRow>
            ) : (
              <Empty icon="trips" sm title="No trips today"
                     action={<Btn kind="soft" size="sm" as="a" href="/admin/transport/trips">Generate today's trips</Btn>}>
                Trips are created from your active routes — generate them on the Trips screen.
              </Empty>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Notifications & Alerts" right={<LinkBtn to="/admin/transport/activity">View All</LinkBtn>} />
          <CardBody flush>
            {(d.alerts || []).length ? (
              <Rows>
                {d.alerts.map((a, i) => (
                  <Row key={i} icon={{ delay: 'clock', wrench: 'wrench', request: 'request', megaphone: 'megaphone' }[a.icon] || 'bell'}
                       iconTone={{ warn: 'amber', bad: 'red', blue: 'blue', info: 'indigo', good: 'green' }[a.tone] || 'indigo'}
                       title={a.title} sub={a.detail} endSub={ago(a.at)}
                       onClick={a.link ? () => nav(a.link) : undefined} />
                ))}
              </Rows>
            ) : <Empty icon="bell" sm title="Nothing needs attention">No delays, overdue services or unanswered requests.</Empty>}
          </CardBody>
        </Card>
      </div>

      <div className="tr-grid tr-grid--dash">
        <Card>
          <CardHead title="Fee Collection (This Month)" right={<LinkBtn to="/admin/transport/invoices">View Details</LinkBtn>} />
          <CardBody>
            <div style={{ fontSize: '1.68rem', fontWeight: 700, letterSpacing: '-.02em' }}>{money(m.collected, { space: true })}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.79rem', color: 'var(--tr-muted)', margin: '4px 0 10px' }}>
              <span>Collected of {money(m.billed, { space: true })}</span>
              <b style={{ color: 'var(--tr-ink)' }}>{m.pct || 0}%</b>
            </div>
            <span className="tr-bar tr-bar--lg"><i style={{ width: `${Math.min(100, m.pct || 0)}%`, background: STATUS_INK.good }} /></span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
              <MoneyChip tone="green" value={m.collected} label="Collected" />
              <MoneyChip tone="amber" value={m.pending} label="Pending" />
              <MoneyChip tone="red" value={m.overdue} label="Overdue" />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Fuel Consumption (Last 6 Months)" right={<LinkBtn to="/admin/transport/fuel">View Details</LinkBtn>} />
          <CardBody>
            {(d.fuelTrend || []).some((f) => f.litres) ? (
              <Bars data={(d.fuelTrend || []).map((f) => ({ label: f.label, value: f.litres }))}
                    series={[{ key: 'value', label: 'Litres', color: '#a5b4fc' }]}
                    height={196} fmt={(v) => `${count(v)} L`} />
            ) : <Empty icon="fuel" sm title="No fuel entries yet">Log a fill-up on the Fuel screen and this fills in.</Empty>}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Vehicle Status" right={<LinkBtn to="/admin/transport/vehicles">View All</LinkBtn>} />
          <CardBody fill>
            {t.fleet?.total ? (
              <DonutRow>
                <div className="tr-donutwrap__chart">
                  <Donut data={fleetSlices} total={t.fleet.total} sub="Total Vehicles" size={150} thickness={23} />
                </div>
                <DonutLegend data={fleetSlices} />
              </DonutRow>
            ) : <Empty icon="bus" sm title="No vehicles yet" />}
          </CardBody>
        </Card>
      </div>

      <div className="tr-grid tr-grid--2a">
        <Card>
          <CardHead title="Upcoming Items" right={<LinkBtn to="/admin/transport/maintenance">View All</LinkBtn>} />
          <CardBody>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }}>
              <UpTile to="/admin/transport/maintenance" icon="wrench" tone="red" value={up.maintenanceDue}
                      label="Maintenance Due" sub="In next 7 days" />
              <UpTile to="/admin/transport/vehicles" icon="doc" tone="blue" value={up.renewals}
                      label="Renewals" sub="Insurance / Fitness" />
              <UpTile to="/admin/transport/requests" icon="request" tone="amber" value={up.requests}
                      label="Transport Requests" sub="Pending approval" />
              <UpTile to="/admin/transport/incidents" icon="alert" tone="green" value={up.incidents}
                      label="Open Incidents" sub={up.incidents ? 'Needs attention' : 'Good safety record'} />
            </div>
            {(d.renewals || []).length ? (
              <div style={{ marginTop: 14 }}>
                <Rows>
                  {d.renewals.slice(0, 3).map((r, i) => {
                    const days = Math.ceil((new Date(r.date) - Date.now()) / 864e5);
                    return (
                      <Row key={i} icon={r.kind === 'vehicle' ? 'bus' : 'driver'} iconTone={days < 0 ? 'red' : 'amber'}
                           title={`${r.name} — ${r.doc}`} sub={fmtDay(r.date)}
                           badge={<Badge tone={days < 0 ? 'red' : 'amber'}>{days < 0 ? 'Expired' : `${days}d left`}</Badge>} />
                    );
                  })}
                </Rows>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Recent Activity" right={<LinkBtn to="/admin/transport/activity">View All</LinkBtn>} />
          <CardBody flush>
            {(d.activity || []).length ? (
              <div className="tr-tablewrap">
                <table className="tr-table">
                  <thead><tr><th style={{ width: 96 }}>Time</th><th>Activity</th><th>Details</th></tr></thead>
                  <tbody>
                    {d.activity.slice(0, 6).map((a, i) => (
                      <tr key={i}>
                        <td className="tr-num" style={{ color: 'var(--tr-muted)' }}>{fmtTime(a.at)}</td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <i className={`tr-dot tr-dot--${{ good: 'green', warn: 'amber', bad: 'red', info: 'blue' }[a.tone] || 'blue'}`} />
                            {a.description || a.action}
                          </span>
                        </td>
                        <td style={{ color: 'var(--tr-muted)' }}>{a.entity} · {a.by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty icon="clock" sm title="No activity yet">Everything anyone does in this module is listed here.</Empty>}
          </CardBody>
        </Card>
      </div>

      <NewRequestModal open={newReq} onClose={() => setNewReq(false)} onSaved={() => { setNewReq(false); reload(); }} />
    </div>
  );
}

const MoneyChip = ({ tone, value, label }) => (
  <div className={`tr-t-${tone}`} style={{ borderRadius: 11, padding: '9px 11px' }}>
    <div style={{ fontWeight: 700, fontSize: '.92rem' }}>{money(value, { space: true })}</div>
    <div style={{ fontSize: '.72rem', opacity: .85 }}>{label}</div>
  </div>
);

const UpTile = ({ to, icon, tone, value, label, sub }) => (
  <Tile icon={icon} tone={tone} value={count(value)} label={label} sub={sub} to={to} />
);
