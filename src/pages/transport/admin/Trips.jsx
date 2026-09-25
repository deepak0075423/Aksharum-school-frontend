/**
 * Transport → Trips.
 *
 * "Delayed" is a real measurement here for the first time: `delayMinutes` is
 * now written when a stop is reached or a trip starts, so the tiles, the status
 * column and the charts all read the same number instead of a permanent zero.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search,
  Filters, FilterEnd, Seg, TableWrap, Cell2, Who, Avatar, Thumb, Badge, StatusBadge, RouteBadge, Chip,
  Bar, Pager, Facts, Fact, Rows, Row, Timeline, TL, Loading, Empty, Note, Confirm, Check, count, money,
  fmtTime, fmtDate, fmtDay, isoDay, words, useBoard, useDebounced, toCsv, saveFile, Glyph, plural } from './trUI';
import { Donut, DonutLegend, DonutRow, Bars, RankBars, STATUS_INK } from './trCharts';
import { ScheduleTripModal, GenerateTripsModal } from './trForms';
import TrMap from './trMap';

const VIEWS = [
  { value: 'list', label: 'List', icon: 'list' },
  { value: 'timeline', label: 'Timeline', icon: 'clock' },
  { value: 'map', label: 'Map', icon: 'mapPin' },
];
const STATUSES = ['completed', 'in_progress', 'delayed', 'scheduled', 'cancelled'];

export default function TransportTrips() {
  const [date, setDate] = useState(isoDay(new Date()));
  const [view, setView] = useState('list');
  const [q, setQ] = useState('');
  const [route, setRoute] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [tripType, setTripType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [picked, setPicked] = useState(null);
  const [detail, setDetail] = useState(null);
  const [schedule, setSchedule] = useState(false);
  const [generate, setGenerate] = useState(false);
  const [act, setAct] = useState(null);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(
    () => api.getTripBoard({ date, search, route, vehicle, driver, tripType, status, page, limit }),
    [date, search, route, vehicle, driver, tripType, status, page, limit], { poll: 90 },
  );
  const d = data || {};
  const t = d.tiles || {};
  const rows = d.data || [];
  const railId = picked || rows[0]?._id;

  useEffect(() => {
    if (!railId) { setDetail(null); return; }
    let alive = true;
    api.getTripDetail(railId).then((r) => { if (alive) setDetail(r?.data ?? r); })
      .catch((e) => { if (alive) toast.error(e?.message || 'That trip could not be loaded'); });
    return () => { alive = false; };
  }, [railId, data]);

  const shiftDay = (n) => {
    const x = new Date(date); x.setDate(x.getDate() + n); setDate(isoDay(x)); setPage(1);
  };
  const reset = () => { setQ(''); setRoute(''); setVehicle(''); setDriver(''); setTripType(''); setStatus(''); setPage(1); };
  const exportCsv = () => {
    saveFile(`trips-${date}.csv`, toCsv([
      ['tripCode', 'Trip'], ['shiftLabel', 'Trip'], ['directionLabel', 'Direction'],
      ['route', 'Route', (r) => (r.route ? `${r.route.tag} — ${r.route.name}` : '')],
      ['vehicle', 'Vehicle', (r) => r.vehicle?.vehicleNumber || ''],
      ['driver', 'Driver', (r) => r.driver?.name || ''],
      ['boarded', 'Boarded'], ['total', 'Assigned'],
      ['startTime', 'Started', (r) => (r.startTime ? fmtTime(r.startTime) : '')],
      ['displayStatus', 'Status', (r) => words(r.displayStatus)], ['delayMinutes', 'Delay (min)'],
    ], rows));
    toast.success('Exported the trips on this page');
  };
  const runAction = async (trip, action) => {
    try {
      await api.tripAction(trip._id, { action });
      toast.success(`Trip ${action === 'start' ? 'started' : action === 'complete' ? 'completed' : action + 'd'}`);
      setAct(null); reload();
    } catch (e) { toast.error(e?.message || 'Could not do that'); setAct(null); }
  };

  if (loading && !data) return <div className="tr-page"><Loading /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load trips">{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip value={date} onChange={(v) => { setDate(v); setPage(1); }} icon="calendar" sub={fmtDay(date).split(',')[0]} />
        <IconBtn icon="chevronLeft" label="Previous day" onClick={() => shiftDay(-1)} />
        <IconBtn icon="chevronRight" label="Next day" onClick={() => shiftDay(1)} />
        <Btn kind="primary" icon="plus" onClick={() => setSchedule(true)}>Schedule Trip</Btn>
      </TopBar>

      <TrHead icon="play" iconTone="green" title="Trips"
              subtitle="Every scheduled, running and finished run, by day." />

      <Tiles>
        <Tile icon="play" tone="green" value={count(t.total)} label="Total Trips"
              bar={t.total ? Math.round((t.completed / t.total) * 100) : 0}
              legend={[
                { tone: 'green', value: t.completed, label: 'Completed' },
                { tone: 'amber', value: t.inProgress, label: 'Ongoing' },
                { tone: 'red', value: t.delayed, label: 'Delayed' },
              ]} />
        <Tile icon="students" tone="teal" value={count(t.students)} label="Students Transported"
              sub={`${t.assigned ? Math.round((t.students / t.assigned) * 100) : 0}% of assigned`} />
        <Tile icon="clock" tone="purple" value={count(t.inProgress)} label="Trips In Progress"
              sub={t.inProgressRoutes?.length ? t.inProgressRoutes.join(', ') : 'Nothing on the road'} />
        <Tile icon="alert" tone="red" value={count(t.delayed)} label="Delayed Trips"
              sub={t.delayedRoutes?.length ? t.delayedRoutes.map((x) => `${x.tag} (${x.minutes} min)`).join(', ') : 'All on time'} />
        <Tile icon="x" tone="slate" value={count(t.cancelled)} label="Cancelled Trips" sub="Today" />
      </Tiles>

      <Filters>
        <Select value={route} onChange={(v) => { setRoute(v); setPage(1); }} placeholder="All Routes" options={d.filters?.routes || []} />
        <Select value={vehicle} onChange={(v) => { setVehicle(v); setPage(1); }} placeholder="All Vehicles" options={d.filters?.vehicles || []} />
        <Select value={driver} onChange={(v) => { setDriver(v); setPage(1); }} placeholder="All Drivers" options={d.filters?.drivers || []} />
        <Select value={tripType} onChange={(v) => { setTripType(v); setPage(1); }} placeholder="All Trip Types"
                options={(d.filters?.tripTypes || []).map((v) => ({ value: v, label: words(v) }))} />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All Status"
                options={STATUSES.map((v) => ({ value: v, label: words(v) }))} />
        <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search trip, route or driver…" />
        <Btn onClick={reset}>Reset</Btn>
        <FilterEnd>
          <Btn icon="upload" onClick={exportCsv}>Export</Btn>
        </FilterEnd>
      </Filters>

      <div className="tr-split tr-split--wide">
        {/* The three summary charts sit under the table, in the same column:
            as a full-width row beneath the split they left a third of a page
            of nothing beside a short list. */}
        <div className="tr-stack">
          <Card>
            <CardHead title={`Trips (${count(d.total)})`}>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: '.78rem', color: 'var(--tr-muted)' }}>View:</span>
                <Seg value={view} onChange={setView} items={VIEWS} solid />
                <IconBtn icon="refresh" label="Generate today's trips" onClick={() => setGenerate(true)} />
              </div>
            </CardHead>
            <CardBody flush>
              {view === 'list' ? (
                <>
                  <TableWrap>
                    <table className="tr-table">
                      <thead>
                        <tr>
                          <th className="tr-table__idx">#</th>
                          <th>Trip Details</th><th>Route</th><th>Vehicle</th><th>Driver / Crew</th>
                          <th style={{ minWidth: 96 }}>Students</th><th>Start Time</th><th>Status</th><th className="tr-table__acts">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={r._id} aria-selected={String(r._id) === String(railId)} className="tr-rowlink" onClick={() => setPicked(r._id)}>
                            <td className="tr-table__idx">{(d.page - 1) * limit + i + 1}</td>
                            <td>
                              <div className="tr-who">
                                <span style={{ color: r.tripType !== 'regular' ? '#7c3aed' : r.shift === 'morning' ? '#d97706' : '#4f46e5', display: 'inline-flex' }}>
                                  <Glyph name={r.tripType !== 'regular' ? 'star' : r.shift === 'morning' ? 'sun' : 'moon'} size={19} />
                                </span>
                                <Cell2 top={r.title || r.shiftLabel} sub={r.tripType !== 'regular' ? words(r.tripType) : r.directionLabel} />
                              </div>
                            </td>
                            <td>{r.route ? <Chip color={r.route.color}>{r.route.tag} {r.route.zone || ''}</Chip> : '—'}</td>
                            <td><div className="tr-who"><Thumb src={r.vehicle?.photo} /><Cell2 top={r.vehicle?.vehicleNumber || '—'} sub={r.vehicle?.manufacturer} /></div></td>
                            <td>{r.driver ? <Who name={r.driver.name} src={r.driver.photo} id={r.driver._id} size="sm" /> : '—'}</td>
                            <td>
                              <div style={{ fontSize: '.8rem', fontWeight: 600 }}>{r.boarded} / {r.total}</div>
                              <Bar value={r.boarded} max={r.total || 1} color={STATUS_INK.good} />
                            </td>
                            {/* One column showing the scheduled time for some rows
                                and the real one for others is a trap: a morning trip
                                that actually rolled at 12:15 AM read like bad data.
                                When they differ, both are shown. */}
                            <td className="tr-num">
                              {r.startTime ? (
                                <Cell2 top={fmtTime(r.startTime)}
                                       sub={r.plannedStart && fmtTime(r.plannedStart) !== fmtTime(r.startTime)
                                         ? `due ${fmtTime(r.plannedStart)}` : null} />
                              ) : (r.plannedStart ? <Cell2 top={fmtTime(r.plannedStart)} sub="scheduled" /> : '—')}
                            </td>
                            <td><StatusBadge value={r.displayStatus} /></td>
                            <td className="tr-table__acts" onClick={(e) => e.stopPropagation()}>
                              <div>
                                {r.displayStatus === 'scheduled'
                                  ? <IconBtn icon="play" kind="primary" label="Start trip" onClick={() => runAction(r, 'start')} /> : null}
                                {['in_progress', 'delayed'].includes(r.displayStatus)
                                  ? <IconBtn icon="checkCircle" kind="primary" label="Complete trip" onClick={() => runAction(r, 'complete')} /> : null}
                                <IconBtn icon="eye" label="View" onClick={() => setPicked(r._id)} />
                                {r.displayStatus !== 'cancelled' && r.displayStatus !== 'completed'
                                  ? <IconBtn icon="close" kind="danger" label="Cancel trip" onClick={() => setAct(r)} /> : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                  {!rows.length ? (
                    <Empty icon="trips" title="No trips on this day"
                           action={<Btn kind="soft" icon="refresh" onClick={() => setGenerate(true)}>Generate the day's trips</Btn>}>
                      Trips are created from your active routes that have a vehicle.
                    </Empty>
                  ) : null}
                  <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="trips"
                         onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
                </>
              ) : view === 'timeline' ? (
                <div style={{ padding: 18 }}>
                  {rows.length ? (
                    <Timeline>
                      {rows.map((r) => (
                        <TL key={r._id}
                            state={r.displayStatus === 'completed' ? 'done' : r.displayStatus === 'delayed' ? 'bad'
                              : r.displayStatus === 'in_progress' ? 'now' : 'pending'}
                            time={r.startTime ? fmtTime(r.startTime) : (r.plannedStart ? fmtTime(r.plannedStart) : '—')}
                            title={`${r.route?.tag || ''} · ${r.title || r.shiftLabel}`}
                            sub={`${r.vehicle?.vehicleNumber || 'No vehicle'} · ${r.driver?.name || 'No driver'} · ${r.boarded}/${r.total} students${r.delayMinutes ? ` · ${plural(r.delayMinutes, 'min')} late` : ''}`} />
                      ))}
                    </Timeline>
                  ) : <Empty icon="clock" title="Nothing ran on this day" />}
                </div>
              ) : (
                <div style={{ padding: 14 }}>
                  <Empty icon="pin" title="A trip is on the map only while it is running"
                         action={<Btn kind="primary" icon="mapPin" as="a" href="/admin/transport/live">Open the Live Map</Btn>}>
                    A position comes from the vehicle's tracker, so a completed or scheduled trip has nowhere to be drawn.
                    The Live Map shows every bus that is reporting right now, with its route and stops.
                  </Empty>
                </div>
              )}
            </CardBody>
          </Card>
          <div className="tr-grid tr-grid--3">
          <Card>
            <CardHead title="Trip Status" />
            <CardBody fill>
              {t.total ? (
                <DonutRow>
                  <div className="tr-donutwrap__chart">
                    <Donut size={150} thickness={23} total={t.total} sub="Trips" data={[
                      { label: 'Completed', value: t.completed, color: STATUS_INK.good },
                      { label: 'In Progress', value: t.inProgress, color: STATUS_INK.info },
                      { label: 'Delayed', value: t.delayed, color: STATUS_INK.warn },
                      { label: 'Cancelled', value: t.cancelled, color: STATUS_INK.bad },
                    ]} />
                  </div>
                  <DonutLegend right={(x) => `${x.value} (${t.total ? Math.round((x.value / t.total) * 100) : 0}%)`} data={[
                    { label: 'Completed', value: t.completed, color: STATUS_INK.good },
                    { label: 'In Progress', value: t.inProgress, color: STATUS_INK.info },
                    { label: 'Delayed', value: t.delayed, color: STATUS_INK.warn },
                    { label: 'Cancelled', value: t.cancelled, color: STATUS_INK.bad },
                  ]} />
                </DonutRow>
              ) : <Empty icon="chart" sm title="No trips today" />}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Trips by Time" />
            <CardBody>
              {d.byWeekday?.length ? (
                <>
                  <Bars data={d.byWeekday} height={182} series={[
                    { key: 'morning', label: 'Morning', color: '#4f46e5' },
                    { key: 'afternoon', label: 'Afternoon', color: '#93c5fd' },
                  ]} />
                  <div className="tr-legend" style={{ marginTop: 10 }}>
                    <span><i style={{ background: '#4f46e5' }} />Morning</span>
                    <span><i style={{ background: '#93c5fd' }} />Afternoon</span>
                  </div>
                </>
              ) : <Empty icon="chart" sm title="No trips this week" />}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Route-wise Trips" />
            <CardBody>
              {d.routeWise?.length ? (
                <RankBars nameWidth={112} data={d.routeWise.map((r) => ({ key: r.tag, label: `${r.tag} - ${r.name}`, value: r.trips, color: r.color }))} />
              ) : <Empty icon="route" sm title="No trips to break down" />}
            </CardBody>
          </Card>
          </div>
        </div>

        <div className="tr-rail">
          {detail ? <TripRail t={detail} onClose={() => setPicked(null)} onAction={runAction} /> : (
            <Panel title="Trip"><Empty icon="trips" sm title="Pick a trip">Its stops, roll and timings appear here.</Empty></Panel>
          )}
        </div>
      </div>


      <ScheduleTripModal open={schedule} onClose={() => setSchedule(false)} onSaved={() => { setSchedule(false); reload(); }} />
      <GenerateTripsModal open={generate} onClose={() => setGenerate(false)} onSaved={() => { setGenerate(false); reload(); }} />
      <Confirm open={!!act} onClose={() => setAct(null)} onConfirm={() => runAction(act, 'cancel')} tone="danger"
               title="Cancel this trip?" confirmLabel="Cancel trip"
               message={`${act?.tripCode || 'This trip'} will be marked cancelled. Families are not told automatically — send a notification if they should be.`} />
    </div>
  );
}

function TripRail({ t, onClose, onAction }) {
  return (
    <Panel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <StatusBadge value={t.status === 'completed' ? 'completed' : t.status === 'cancelled' ? 'cancelled'
          : ['started', 'paused'].includes(t.status) ? 'in_progress' : 'scheduled'} />
        <b style={{ fontSize: '.95rem' }}>Trip #{t.tripCode}</b>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {t.status === 'scheduled' ? <IconBtn icon="play" kind="primary" label="Start" onClick={() => onAction(t, 'start')} /> : null}
          {['started', 'paused'].includes(t.status) ? <IconBtn icon="checkCircle" kind="primary" label="Complete" onClick={() => onAction(t, 'complete')} /> : null}
          <IconBtn icon="close" label="Close" onClick={onClose} />
        </span>
      </div>

      <div className="tr-who" style={{ marginBottom: 14 }}>
        <span style={{ color: t.shift === 'morning' ? '#d97706' : '#4f46e5', display: 'inline-flex' }}>
          <Glyph name={t.tripType !== 'regular' ? 'star' : t.shift === 'morning' ? 'sun' : 'moon'} size={22} />
        </span>
        <Cell2 top={t.title || t.shiftLabel} sub={t.directionLabel} />
      </div>

      <Facts>
        <Fact icon="calendar" k="Date" v={fmtDate(t.date)} />
        <Fact icon="clock" k="Start Time" v={t.startTime ? fmtTime(t.startTime) : '—'} />
        <Fact icon="route" k="Route" v={t.route ? `${t.route.tag} — ${t.route.name}` : '—'} />
        <Fact icon="clock" k="End Time" v={t.endTime ? fmtTime(t.endTime) : '—'} />
        <Fact icon="bus" k="Vehicle" v={t.vehicle?.vehicleNumber || '—'} />
        <Fact icon="history" k="Duration" v={t.durationMin != null ? `${Math.floor(t.durationMin / 60)} hr ${t.durationMin % 60} mins` : '—'} />
        <Fact icon="driver" k="Driver" v={t.driver?.name || '—'} />
        <Fact icon="users" k="Students" v={`${t.counts?.boarded || 0} / ${t.counts?.total || 0}`} />
        <Fact icon="mapPin" k="Stops" v={`${(t.timeline || []).length} stops`} />
        <Fact icon="alert" k="Delay" v={t.delayMinutes ? `${t.delayMinutes} mins` : 'On time'} />
      </Facts>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <b style={{ fontSize: '.88rem' }}>Trip Timeline</b>
        </div>
        {t.timeline?.length ? (
          <Timeline>
            {t.timeline.map((e, i) => (
              <TL key={e._id || i}
                  state={e.status === 'reached' ? 'done' : e.status === 'skipped' ? 'bad' : 'pending'}
                  time={e.reachedAt ? fmtTime(e.reachedAt) : (e.plannedTime ? fmtTime(e.plannedTime) : '—')}
                  title={e.name}
                  sub={e.status === 'reached'
                    ? `${e.boarded} of ${plural(e.students, 'student')}${i === 0 ? ' · departed' : ''}`
                    : e.status === 'skipped' ? 'Skipped' : `${plural(e.students, 'student')} expected`} />
            ))}
          </Timeline>
        ) : <Empty icon="pin" sm title="This trip has no stops" />}
      </div>
    </Panel>
  );
}
