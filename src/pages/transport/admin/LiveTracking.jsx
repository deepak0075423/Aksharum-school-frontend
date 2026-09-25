/**
 * Transport → Live Map.
 *
 * Polls `/transport/admin/live-board` at the school's own tracking interval.
 * Every vehicle in the fleet appears in the rail, not only the ones on a trip —
 * a bus that is idle in the yard and a bus whose tracker has died are different
 * answers, and the old screen showed neither.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/transport.api';
import {
  Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search, LinkBtn, Rows, Row,
  Badge, StatusBadge, Stops, Stop, Loading, Empty, Note, TopBar, DayChip, LiveChip, Ring,
  count, fmtTime, fmtDay, ago, useBoard, useDebounced, statusWord, Ico, TrHead } from './trUI';
import TrMap, { STATE_INK } from './trMap';

const STATES = [
  { value: 'on_route', label: 'On Route' }, { value: 'at_stop', label: 'At Stop' },
  { value: 'delayed', label: 'Delayed' }, { value: 'idle', label: 'Idle' },
  { value: 'offline', label: 'Offline' }, { value: 'maintenance', label: 'In Maintenance' },
];

export default function TransportLive() {
  const nav = useNavigate();
  const [focus, setFocus] = useState('');
  const [route, setRoute] = useState('');
  const [state, setState] = useState('');
  const [q, setQ] = useState('');
  const [railQ, setRailQ] = useState('');
  const [basemap, setBasemap] = useState('map');
  const [full, setFull] = useState(false);
  // Crew positions come from people's own devices and answer a different
  // question from the bus markers, so they are a layer you turn on.
  const [showCrew, setShowCrew] = useState(true);
  const dq = useDebounced(q);

  const { data, loading, error } = useBoard(
    () => api.getLiveBoard(focus ? { vehicle: focus } : {}), [focus],
    { poll: 30 },
  );

  const d = data || {};
  const t = d.tiles || {};
  const picked = focus || d.focusVehicle;

  const shown = useMemo(() => (d.vehicles || []).filter((v) => {
    if (route && String(v.route?._id) !== String(route)) return false;
    if (state && v.state !== state) return false;
    const needle = (dq || '').trim().toLowerCase();
    if (needle && ![v.vehicleNumber, v.registrationNumber, v.driver?.name, v.route?.name, v.route?.tag].join(' ').toLowerCase().includes(needle)) return false;
    return true;
  }), [d.vehicles, route, state, dq]);

  const railShown = useMemo(() => {
    const needle = railQ.trim().toLowerCase();
    return needle ? shown.filter((v) => `${v.vehicleNumber} ${v.route?.name || ''}`.toLowerCase().includes(needle)) : shown;
  }, [shown, railQ]);

  if (loading) return <div className="tr-page"><Loading /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load the live map">{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={fmtDay(new Date())} sub={fmtTime(new Date())} icon="calendar" />
        <LiveChip />
      </TopBar>

      <TrHead icon="pin" iconTone="blue" title="Live Tracking"
              subtitle="Where every bus, driver and crew member is right now." />

      <Tiles cols="6">
        <Tile icon="bus" tone="blue" value={count(t.fleet?.total)} label="Total Vehicles"
              legend={[
                { tone: 'green', value: t.fleet?.running, label: 'Running' },
                { tone: 'amber', value: t.fleet?.idle, label: 'Idle' },
                { tone: 'red', value: t.fleet?.offline, label: 'Offline' },
              ]} />
        <Tile icon="students" tone="teal" value={count(t.onBoard?.value)} label="Students On Board"
              sub={`Out of ${count(t.onBoard?.assigned)} assigned`} ring={t.onBoard?.pct} />
        <Tile icon="route" tone="pink" value={count(t.routes?.total)} label="Active Routes"
              legend={[
                { tone: 'blue', value: t.routes?.morning, label: 'Morning' },
                { tone: 'purple', value: t.routes?.afternoon, label: 'Afternoon' },
                { tone: 'slate', value: t.routes?.both, label: 'Both' },
              ]} />
        <Tile icon="play" tone="green" value={count(t.trips?.ongoing)} label="Ongoing Trips"
              bar={t.trips?.pct} sub={`${t.trips?.pct || 0}% of today's trips run`} />
        <Tile icon="people" tone="purple" value={count(d.crew?.length)} label="Crew Reporting"
              sub={d.crewSharing ? `${count(d.crewSharing)} sharing their location` : 'Nobody is sharing a position'} />
        <Tile icon="alert" tone={t.incidents ? 'red' : 'amber'} value={count(t.incidents)} label="Incidents"
              sub={t.incidents ? 'Reported today' : 'No active incidents'} />
      </Tiles>

      <div className={full ? '' : 'tr-split tr-split--wide'}>
        <Card>
          <CardHead title="Live Vehicle Tracking" sub="Real-time location of all school transport vehicles">
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Search value={q} onChange={setQ} placeholder="Search vehicle, driver or route…" grow={false} style={{ width: 246 }} />
              <Select value={route} onChange={setRoute} placeholder="All Routes" width={130}
                      options={(d.routes || []).map((r) => ({ value: r._id, label: `${r.tag} — ${r.name}` }))} />
              <Select value={state} onChange={setState} placeholder="All Status" width={130} options={STATES} />
              <Btn size="sm" kind={showCrew ? 'soft' : 'ghost'} icon="people" onClick={() => setShowCrew((v) => !v)}>
                Crew {d.crew?.length ? `(${d.crew.length})` : ''}
              </Btn>
              <IconBtn icon="externalLink" label={full ? 'Exit full width' : 'Full width'} onClick={() => setFull((v) => !v)} />
            </div>
          </CardHead>
          <CardBody>
            <TrMap height={full ? 520 : 430} basemap={basemap} onBasemap={setBasemap}
                   routes={(d.routes || []).filter((r) => !route || String(r._id) === String(route))}
                   vehicles={shown} crew={showCrew ? (d.crew || []) : []} school={d.school} focusVehicle={picked}
                   onPickVehicle={(v) => setFocus(String(v._id))} showStopLabels={full}
                   map={d.map} />
            {d.crewSharing ? (
              <div className="tr-maplegend-inline">
                <span><i className="tr-dot" style={{ background: '#0891b2' }} />Driver on foot</span>
                <span><i className="tr-dot" style={{ background: '#7c3aed' }} />Conductor / crew</span>
                <span><i className="tr-dot tr-dot--slate" />Not reporting</span>
                <span style={{ marginLeft: 'auto' }}>
                  {count(d.crew?.length)} of {count(d.crewSharing)} sharing crew are reporting a position
                </span>
              </div>
            ) : null}
          </CardBody>
        </Card>

        {!full ? (
          <div className="tr-rail">
            <Panel title={`Vehicles (${count(shown.length)})`} right={<LinkBtn to="/admin/transport/vehicles">View All</LinkBtn>} flush>
              <div style={{ padding: '0 16px 10px' }}>
                <Search value={railQ} onChange={setRailQ} placeholder="Search vehicles…" grow={false} />
              </div>
              <div className="tr-scroller tr-scroller--fade" style={{ maxHeight: 292 }}>
                {railShown.length ? (
                  <Rows>
                    {railShown.map((v) => (
                      <Row key={v._id} selected={String(v._id) === String(picked)} onClick={() => setFocus(String(v._id))}
                           avatar={<span className="tr-mark" style={{ width: 34, height: 34, background: `${STATE_INK[v.state]}1f`, color: STATE_INK[v.state] }}>
                             <Ico name="bus" size={17} />
                           </span>}
                           title={v.vehicleNumber}
                           sub={v.route ? `${v.route.tag} - ${v.route.zone || v.route.name}` : 'No route assigned'}
                           end={v.state === 'offline' ? '—' : `${v.speed} km/h`}
                           endSub={v.lastSeen ? fmtTime(v.lastSeen) : 'No signal'}>
                        <StatusBadge value={v.state} />
                      </Row>
                    ))}
                  </Rows>
                ) : <Empty icon="bus" sm title="No vehicles match" />}
              </div>
            </Panel>

            {d.stopBoard ? (
              <Panel title={`Route Stops (${d.stopBoard.vehicle})`}
                     right={d.stopBoard.route ? <LinkBtn to="/admin/transport/routes">View Route</LinkBtn> : null}>
                {d.stopBoard.stops.length ? (
                  <Stops>
                    {d.stopBoard.stops.map((s, i) => (
                      <Stop key={i} index={s.sequence || i + 1} name={s.name}
                            state={s.status === 'reached' ? 'done' : s.status === 'skipped' ? 'skipped' : 'upcoming'}
                            sub={s.reachedAt
                              ? `${i === 0 ? 'Departed at' : 'Arrived at'} ${fmtTime(s.reachedAt)}`
                              : s.plannedTime ? `ETA ${fmtTime(s.plannedTime)}` : 'No time set'}
                            badge={<Badge tone={s.status === 'reached' ? 'green' : s.status === 'skipped' ? 'red' : 'indigo'}>
                              {s.status === 'reached' ? 'Completed' : s.status === 'skipped' ? 'Skipped' : 'Upcoming'}
                            </Badge>} />
                    ))}
                  </Stops>
                ) : <Empty icon="pin" sm title="This vehicle has no route stops" />}
              </Panel>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="tr-grid tr-grid--3" style={{ marginTop: 14 }}>
      <Card>
        <CardHead title="Geofence Alerts" right={<LinkBtn to="/admin/transport/incidents">View All</LinkBtn>} />
        <CardBody>
          {d.geofence?.alerts?.length ? (
            <Rows>
              {d.geofence.alerts.map((a, i) => (
                <Row key={i} icon="alert" iconTone="red" title={a.title} sub={a.detail} endSub={ago(a.at)} />
              ))}
            </Rows>
          ) : d.geofence?.measurable ? (
            <Note tone="good" title="All vehicles are within their designated routes">
              You will be notified if any vehicle deviates.
            </Note>
          ) : (
            <Note tone="info" title="Nothing to measure against yet">
              Geofencing compares a bus to its stops&rsquo; coordinates. Add latitude and longitude to your stops
              and deviations are flagged here.
            </Note>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="Upcoming Stops (Next 15 mins)" right={<LinkBtn to="/admin/transport/trips">View All</LinkBtn>} />
        <CardBody flush>
          {d.upcomingStops?.length ? (
            <Rows>
              {d.upcomingStops.map((s, i) => (
                <Row key={i}
                     avatar={<span className="tr-mark" style={{ width: 30, height: 30, background: `${s.color}1f`, color: s.color }}>
                       <Ico name="bus" size={15} />
                     </span>}
                     title={s.vehicle} sub={s.stop} end={`${s.inMinutes} mins`} />
              ))}
            </Rows>
          ) : <Empty icon="clock" sm title="Nothing due in the next 15 minutes" />}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="Recent Activity" right={<LinkBtn to="/admin/transport/activity">View All</LinkBtn>} />
        <CardBody flush>
          {d.activity?.length ? (
            <Rows>
              {d.activity.slice(0, 6).map((a, i) => (
                <Row key={i}
                     avatar={<span className="tr-num" style={{ fontSize: '.74rem', color: 'var(--tr-muted)', width: 52 }}>{fmtTime(a.at)}</span>}
                     title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                       <i className={`tr-dot tr-dot--${a.tone === 'bad' ? 'red' : 'green'}`} />{a.text}
                     </span>}
                     badge={a.tag ? <Badge tone={a.tone === 'bad' ? 'red' : 'green'}>{a.tag}</Badge> : null} />
              ))}
            </Rows>
          ) : <Empty icon="clock" sm title="Nothing has happened on the road today" />}
        </CardBody>
      </Card>
      </div>

    </div>
  );
}
