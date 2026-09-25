/**
 * Transport → Routes.
 *
 * Three panes: the routes, the picked route on a map, and its details. The Map
 * view widens the middle pane to every route at once; the Calendar view lays
 * the week out by shift, which is the question "when does each route run?"
 * that neither of the other two answers.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search,
  Seg, Rows, Row, Badge, StatusBadge, RouteBadge, Chip, Facts, Fact, Thumb, Avatar, Loading, Empty, Note,
  Confirm, count, fmtDate, fmtTime, ago, words, SHIFT, useBoard, useDebounced, Cell2, plural } from './trUI';
import { RankBars } from './trCharts';
import TrMap from './trMap';
import { RouteForm } from './trForms';

const VIEWS = [
  { value: 'list', label: 'List', icon: 'list' },
  { value: 'map', label: 'Map', icon: 'mapPin' },
  { value: 'calendar', label: 'Calendar', icon: 'calendar' },
];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TransportRoutes() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState('list');
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(
    () => api.getRouteBoard({ search, status }), [search, status],
  );
  const d = data || {};
  const rows = d.data || [];
  const t = d.tiles || {};
  const route = useMemo(() => rows.find((r) => String(r._id) === String(picked)) || rows[0], [rows, picked]);

  const optimize = async (r) => {
    try { await api.optimizeRoute(r._id); toast.success('Stops reordered by distance'); reload(); }
    catch (e) { toast.error(e?.message || 'Could not reorder'); }
  };
  const remove = async () => {
    try { await api.deleteRoute(del._id); toast.success(`${del.name} removed`); setDel(null); reload(); }
    catch (e) { toast.error(e?.message || 'Could not remove that route'); setDel(null); }
  };

  if (loading && !data) return <div className="tr-page"><Loading /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load the routes">{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={t.yearName || new Date().getFullYear()} sub="Academic Year" icon="calendar" />
        <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Add Route</Btn>
      </TopBar>

      <TrHead title="Routes" subtitle="Create and manage transport routes, stops and schedules">
        <Search value={q} onChange={setQ} placeholder="Search routes…" grow={false} style={{ width: 210 }} />
        <Select value={status} onChange={setStatus} placeholder="All Status" width={140}
                options={['active', 'inactive', 'maintenance', 'draft'].map((v) => ({ value: v, label: words(v) }))} />
        <Seg value={view} onChange={setView} items={VIEWS} solid />
      </TrHead>

      <Tiles>
        <Tile icon="route" tone="indigo" value={count(t.total)} label="Total Routes"
              sub={t.newThisTerm ? `↑ ${t.newThisTerm} new this term` : `Term: ${t.term || '—'}`} />
        <Tile icon="check" tone="green" value={count(t.active)} label="Active Routes"
              sub={`${t.total ? Math.round((t.active / t.total) * 100) : 0}% of total`} />
        <Tile icon="pause" tone="orange" value={count(t.inactive)} label="Inactive Routes"
              sub={`${t.total ? Math.round((t.inactive / t.total) * 100) : 0}% of total`} />
        <Tile icon="wrench" tone="red" value={count(t.maintenance)} label="Under Maintenance"
              sub={`${t.total ? Math.round((t.maintenance / t.total) * 100) : 0}% of total`} />
        <Tile icon="students" tone="blue" value={count(t.students)} label="Students Assigned"
              delta={t.studentsDelta} deltaNote="vs. last term" />
      </Tiles>

      {view === 'map' ? (
        <Card>
          <CardHead title="All Routes" sub={`${plural(rows.length, 'route')} · ${plural(t.students, 'student')}`} />
          <CardBody fill>
            <TrMap height={520} routes={rows} school={d.school} showStopLabels map={d.map}
                   vehicles={rows.filter((r) => r.live).map((r) => ({
                     _id: r._id, vehicleNumber: r.vehicle?.vehicleNumber || r.tag, latitude: r.live.latitude,
                     longitude: r.live.longitude, state: 'on_route', route: r, speed: r.live.speed,
                   }))} />
          </CardBody>
        </Card>
      ) : view === 'calendar' ? (
        <Card>
          <CardHead title="Weekly Schedule" sub="When each route runs — from its published morning and afternoon windows" />
          <CardBody flush>
            <div className="tr-tablewrap">
              <table className="tr-table">
                <thead><tr><th style={{ minWidth: 190 }}>Route</th><th>Shift</th>{DAYS.map((x) => <th key={x}>{x}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._id}>
                      <td><div className="tr-who"><RouteBadge route={r} /><Cell2 top={r.name} sub={r.zone} /></div></td>
                      <td><Badge tone="slate" square>{SHIFT[r.shift]}</Badge></td>
                      {DAYS.map((day) => (
                        <td key={day} style={{ fontSize: '.75rem' }}>
                          {r.status !== 'active' ? <span style={{ color: 'var(--tr-faint)' }}>—</span> : (
                            <>
                              {r.shift !== 'evening' && r.schedule.morningStart
                                ? <div style={{ color: '#2563eb' }}>{fmtTime(r.schedule.morningStart)}</div> : null}
                              {r.shift !== 'morning' && r.schedule.eveningStart
                                ? <div style={{ color: '#7c3aed' }}>{fmtTime(r.schedule.eveningStart)}</div> : null}
                              {!r.schedule.morningStart && !r.schedule.eveningStart
                                ? <span style={{ color: 'var(--tr-faint)' }}>No time set</span> : null}
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length ? <Empty icon="calendar" title="No routes to schedule" /> : null}
          </CardBody>
        </Card>
      ) : (
        <div className="tr-split tr-split--three">
          <Panel title={`All Routes (${rows.length})`} flush
                 right={<Select value="" onChange={() => {}} options={[{ value: '', label: 'Sort by Route Name' }]} width={150} />}>
            <div className="tr-scroller tr-scroller--fill" style={{ maxHeight: 520 }}>
              {rows.length ? (
                <Rows>
                  {rows.map((r) => (
                    <Row key={r._id} selected={String(r._id) === String(route?._id)} onClick={() => setPicked(r._id)}
                         avatar={<RouteBadge route={r} />} title={r.name} sub={r.stopSummary || 'No stops yet'}
                         end={`${r.students}`} endSub={r.students === 1 ? 'student' : 'students'}>
                      <StatusBadge value={r.status} />
                    </Row>
                  ))}
                </Rows>
              ) : <Empty icon="route" sm title="No routes match" />}
            </div>
          </Panel>

          <Card>
            <CardHead title={route ? `Route Map — ${route.tag} (${route.zone || route.name})` : 'Route Map'}
                      right={route?.live ? <Badge tone="green" dot="green">Live</Badge> : null} />
            <CardBody fill>
              <TrMap height={382} routes={route ? [route] : []} school={d.school} showStopLabels
                     map={d.map} viewKey={route?._id}
                     vehicles={route?.live ? [{
                       _id: route._id, vehicleNumber: route.vehicle?.vehicleNumber || route.tag,
                       latitude: route.live.latitude, longitude: route.live.longitude,
                       state: 'on_route', route, speed: route.live.speed,
                     }] : []}
                     emptyHint="Add latitude and longitude to this route's stops and the line, its stops and the bus on it are drawn here." />
            </CardBody>
          </Card>

          <Panel title="Route Details" right={route ? <Btn size="sm" icon="pencil" onClick={() => setForm(route)}>Edit Route</Btn> : null}>
            {route ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                  <RouteBadge route={route} />
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: '.98rem' }}>{route.zone || route.name}</b>
                    <div style={{ fontSize: '.76rem', color: 'var(--tr-muted)' }}>{route.stopSummary}</div>
                  </div>
                  <span style={{ marginLeft: 'auto' }}><StatusBadge value={route.status} /></span>
                </div>
                <Facts>
                  <Fact icon="users" k="Students" v={route.students} />
                  <Fact icon="mapPin" k="Stops" v={route.stopCount} />
                  <Fact icon="compass" k="Distance" v={route.distanceKm ? `${route.distanceKm} km` : '—'} />
                  <Fact icon="clock" k="Est. Duration" v={route.durationMin ? `${route.durationMin} mins` : '—'} />
                </Facts>

                <div style={{ marginTop: 14 }}>
                  <div className="tr-fact__k" style={{ marginBottom: 6 }}>Driver</div>
                  {route.driver ? (
                    <div className="tr-who">
                      <Avatar name={route.driver.name} src={route.driver.photo} id={route.driver._id} />
                      <Cell2 top={route.driver.name} sub={route.driver.phone} />
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        {route.driver.phone ? <IconBtn icon="phone" label="Call" as="a" onClick={() => { window.location.href = `tel:${route.driver.phone}`; }} /> : null}
                        <IconBtn icon="chat" label="Message" onClick={() => toast('Messaging the driver opens in Chat')} />
                      </span>
                    </div>
                  ) : <span style={{ fontSize: '.82rem', color: 'var(--tr-faint)' }}>No driver assigned</span>}
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="tr-fact__k" style={{ marginBottom: 6 }}>Vehicle</div>
                  {route.vehicle ? (
                    <div className="tr-who">
                      <Thumb src={route.vehicle.photo} alt={route.vehicle.vehicleNumber} />
                      <Cell2 top={`${route.vehicle.vehicleNumber}${route.vehicle.manufacturer ? ` (${route.vehicle.manufacturer})` : ''}`}
                             sub={route.vehicle.registrationNumber} />
                      <span style={{ marginLeft: 'auto' }}><IconBtn icon="eye" label="View vehicle" /></span>
                    </div>
                  ) : <span style={{ fontSize: '.82rem', color: 'var(--tr-faint)' }}>No vehicle assigned</span>}
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="tr-fact__k" style={{ marginBottom: 6 }}>Schedule</div>
                  <div style={{ display: 'grid', gap: 6, fontSize: '.82rem' }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <span style={{ width: 78, color: 'var(--tr-muted)' }}>Morning</span>
                      <b>{route.schedule.morningStart ? `${fmtTime(route.schedule.morningStart)} – ${fmtTime(route.schedule.morningEnd)}` : 'Not set'}</b>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <span style={{ width: 78, color: 'var(--tr-muted)' }}>Afternoon</span>
                      <b>{route.schedule.eveningStart ? `${fmtTime(route.schedule.eveningStart)} – ${fmtTime(route.schedule.eveningEnd)}` : 'Not set'}</b>
                    </div>
                  </div>
                </div>

                {route.description ? (
                  <div style={{ marginTop: 14 }}>
                    <div className="tr-fact__k" style={{ marginBottom: 4 }}>Route Description</div>
                    <p style={{ margin: 0, fontSize: '.81rem', color: 'var(--tr-ink-2)', lineHeight: 1.5 }}>{route.description}</p>
                  </div>
                ) : null}

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <Btn size="sm" icon="repeat" onClick={() => optimize(route)}>Reorder stops</Btn>
                  <Btn size="sm" kind="danger" icon="trash" onClick={() => setDel(route)}>Delete</Btn>
                </div>
              </>
            ) : <Empty icon="route" sm title="Pick a route">Its stops, crew, schedule and map appear here.</Empty>}
          </Panel>
        </div>
      )}

      <div className="tr-grid tr-grid--3" style={{ marginTop: 14 }}>
        <Card>
          <CardHead title="Route Utilization" sub="Students per route" />
          <CardBody>
            {d.utilization?.length ? (
              <RankBars nameWidth={78} fmt={count}
                        data={d.utilization.map((r) => ({ key: r.tag, label: r.tag, value: r.students, color: r.color }))} />
            ) : <Empty icon="chart" sm title="Nobody is assigned yet" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Upcoming Trips" />
          <CardBody flush>
            {d.upcoming?.length ? (
              <Rows>
                {d.upcoming.map((u) => (
                  <Row key={u._id} icon={u.shift === 'morning' ? 'sun' : 'moon'} iconTone={u.shift === 'morning' ? 'amber' : 'purple'}
                       title={`${u.route?.tag || ''} - ${u.shift === 'morning' ? 'Morning' : 'Afternoon'} Trip`}
                       sub={`Today, ${u.plannedTime ? fmtTime(u.plannedTime) : 'time not set'}`}
                       badge={<StatusBadge value={u.delayMinutes > 0 ? 'delayed' : u.status === 'started' ? 'in_progress' : 'scheduled'}
                                           label={u.delayMinutes > 0 ? `${u.delayMinutes}m late` : undefined} />} />
                ))}
              </Rows>
            ) : <Empty icon="trips" sm title="No trips lined up" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Recent Activity" />
          <CardBody flush>
            {d.activity?.length ? (
              <Rows>
                {d.activity.map((a, i) => (
                  <Row key={i}
                       avatar={<i className={`tr-dot tr-dot--${/delete|cancel/i.test(a.action) ? 'red' : /update/i.test(a.action) ? 'green' : 'blue'}`} />}
                       title={a.text} sub={a.by} endSub={ago(a.at)} />
                ))}
              </Rows>
            ) : <Empty icon="clock" sm title="Nothing changed recently" />}
          </CardBody>
        </Card>
      </div>

      {form ? <RouteForm open onClose={() => setForm(null)} row={form._id ? form : null} palette={d.palette || []}
                         onSaved={() => { setForm(null); reload(); }} /> : null}
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} tone="danger"
               title="Delete this route?" confirmLabel="Delete"
               message={`${del?.name} will be removed. A route with students still assigned cannot be deleted — move them first.`} />
    </div>
  );
}
