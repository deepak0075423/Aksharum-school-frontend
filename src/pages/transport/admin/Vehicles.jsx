/**
 * Transport → Vehicles.
 *
 * The list answers "what is each bus doing" — its route, its driver and its
 * last trip — which the old screen could not say because those live on other
 * collections. The rail is the picked vehicle in five tabs.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/transport.api';
import {
  TrHead, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search, Filters, FilterEnd,
  TableWrap, Cell2, Who, Thumb, Badge, StatusBadge, RouteBadge, Chip, Pager, Facts, Fact, Rows, Row,
  UTabs, Loading, Empty, Note, Confirm, Check, count, money, fmtDate, fmtTime, fmtDateTime, words,
  VEHICLE_TYPE, FUEL_TYPE, useBoard, useDebounced, toCsv, saveFile, Avatar, Ico,
} from './trUI';
import { VehicleForm } from './trForms';

const RAIL_TABS = [
  { value: 'overview', label: 'Overview' }, { value: 'driver', label: 'Driver' },
  { value: 'route', label: 'Route' }, { value: 'maintenance', label: 'Maintenance' },
  { value: 'documents', label: 'Documents' },
];

export default function TransportVehicles() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [route, setRoute] = useState('');
  const [type, setType] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [picked, setPicked] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('overview');
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [marked, setMarked] = useState([]);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(
    () => api.getVehicleBoard({ search, status, route, type, fuelType, page, limit }),
    [search, status, route, type, fuelType, page, limit],
  );
  const d = data || {};
  const rows = d.data || [];

  // The rail follows the picked row, falling back to the first of the page.
  const railId = picked || rows[0]?._id;
  useEffect(() => {
    if (!railId) { setDetail(null); return; }
    let alive = true;
    api.getVehicleDetail(railId).then((r) => { if (alive) setDetail(r?.data ?? r); })
      .catch((e) => { if (alive) toast.error(e?.message || 'That vehicle could not be loaded'); });
    return () => { alive = false; };
  }, [railId, data]);

  const reset = () => { setQ(''); setStatus(''); setRoute(''); setType(''); setFuelType(''); setPage(1); };
  const exportCsv = () => {
    saveFile(`vehicles-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['vehicleNumber', 'Fleet No.'], ['registrationNumber', 'Registration'], ['busName', 'Model'],
      ['type', 'Type', (r) => VEHICLE_TYPE[r.vehicleType] || r.vehicleType],
      ['route', 'Route', (r) => (r.route ? `${r.route.tag} — ${r.route.name}` : '')],
      ['driver', 'Driver', (r) => r.driver?.name || ''],
      ['capacity', 'Capacity'], ['occupancy', 'Assigned'], ['status', 'Status'],
      ['fuelType', 'Fuel'], ['odometer', 'Odometer (km)'], ['mileage', 'Mileage (km/l)'],
    ], rows));
    toast.success('Exported the vehicles on this page');
  };

  const remove = async () => {
    try {
      await api.deleteVehicle(del._id);
      toast.success(`${del.vehicleNumber} retired`);
      setDel(null); reload();
    } catch (e) { toast.error(e?.message || 'Could not retire that vehicle'); setDel(null); }
  };

  if (loading && !data) return <div className="tr-page"><Loading /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load the fleet">{error}</Note></div>;
  const t = d.tiles || {};

  return (
    <div className="tr-page">
      <TrHead title="Fleet — Vehicles" subtitle="Buses, vans and the compliance documents that keep them on the road">
        <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Add Vehicle</Btn>
      </TrHead>

      <Tiles>
        <Tile icon="bus" tone="blue" value={count(t.total)} label="Total Vehicles"
              legend={[
                { tone: 'green', value: t.active, label: 'Active' },
                { tone: 'amber', value: t.maintenance, label: 'In Maintenance' },
                { tone: 'red', value: t.inactive, label: 'Inactive' },
              ]} />
        <Tile icon="check" tone="green" value={count(t.active)} label="Active Vehicles"
              sub={`${t.total ? Math.round((t.active / t.total) * 100) : 0}% of total`} />
        <Tile icon="wrench" tone="red" value={count(t.maintenance)} label="In Maintenance"
              sub={`${t.total ? Math.round((t.maintenance / t.total) * 100) : 0}% of total`} />
        <Tile icon="pause" tone="slate" value={count(t.inactive)} label="Inactive Vehicles"
              sub={`${t.total ? Math.round((t.inactive / t.total) * 100) : 0}% of total`} />
        <Tile icon="fuel" tone="orange" value={`${count(t.fuel?.litres)} L`} label="Total Fuel (This Month)"
              delta={t.fuel?.delta} deltaNote="vs. last month" />
      </Tiles>

      <Filters>
        <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by vehicle no., model, driver, or route…" />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All Status"
                options={['active', 'maintenance', 'inactive', 'retired'].map((v) => ({ value: v, label: words(v) }))} />
        <Select value={route} onChange={(v) => { setRoute(v); setPage(1); }} placeholder="All Routes" options={d.filters?.routes || []} />
        <Select value={type} onChange={(v) => { setType(v); setPage(1); }} placeholder="All Types"
                options={(d.filters?.types || []).map((v) => ({ value: v, label: VEHICLE_TYPE[v] || words(v) }))} />
        <Select value={fuelType} onChange={(v) => { setFuelType(v); setPage(1); }} placeholder="All Fuel Types"
                options={(d.filters?.fuelTypes || []).map((v) => ({ value: v, label: FUEL_TYPE[v] || words(v) }))} />
        <Btn onClick={reset}>Reset</Btn>
        <FilterEnd><Btn icon="upload" onClick={exportCsv}>Export</Btn></FilterEnd>
      </Filters>

      <div className="tr-split tr-split--wide">
        <Card>
          <CardHead title={`Vehicles (${count(d.total)})`}
                    right={marked.length ? <Badge tone="indigo">{marked.length} selected</Badge> : null} />
          <CardBody flush>
            <TableWrap>
              <table className="tr-table">
                <thead>
                  <tr>
                    <th className="tr-table__pick">
                      <Check checked={marked.length === rows.length && rows.length > 0}
                             indeterminate={marked.length > 0 && marked.length < rows.length}
                             onChange={(v) => setMarked(v ? rows.map((r) => r._id) : [])} />
                    </th>
                    <th className="tr-table__idx">#</th>
                    <th>Vehicle Details</th><th>Type</th><th>Route</th><th>Driver</th>
                    <th>Status</th><th>Last Trip</th><th className="tr-table__acts">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r._id} aria-selected={String(r._id) === String(railId)} className="tr-rowlink"
                        onClick={() => { setPicked(r._id); setTab('overview'); }}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Check checked={marked.includes(r._id)}
                               onChange={(v) => setMarked((m) => (v ? [...m, r._id] : m.filter((x) => x !== r._id)))} />
                      </td>
                      <td className="tr-table__idx">{(d.page - 1) * limit + i + 1}</td>
                      <td>
                        <div className="tr-who">
                          <Thumb src={r.photo} alt={r.vehicleNumber} />
                          <Cell2 top={r.vehicleNumber} sub={r.registrationNumber} />
                        </div>
                      </td>
                      <td><Badge tone="blue" square>{VEHICLE_TYPE[r.vehicleType] || words(r.vehicleType)}</Badge></td>
                      <td>{r.route ? <Chip color={r.route.color}>{r.route.tag} - {r.route.zone || r.route.name}</Chip>
                        : <span style={{ color: 'var(--tr-faint)' }}>Unassigned</span>}</td>
                      <td>{r.driver
                        ? <Who name={r.driver.name} sub={r.driver.phone} src={r.driver.photo} id={r.driver._id} size="sm" />
                        : <span style={{ color: 'var(--tr-faint)' }}>—</span>}</td>
                      <td><StatusBadge value={r.lastTrip?.delay > 0 ? 'delayed' : r.status} /></td>
                      <td>{r.lastTrip
                        ? <Cell2 top={fmtTime(r.lastTrip.at)}
                                 sub={r.lastTrip.delay > 0 ? `${r.lastTrip.delay} mins late`
                                   : r.lastTrip.status === 'completed' ? 'Completed' : 'In progress'} />
                        : <Cell2 top="—" sub={r.status === 'maintenance' ? 'In workshop' : 'No trip today'} />}</td>
                      <td className="tr-table__acts" onClick={(e) => e.stopPropagation()}>
                        <div>
                          <IconBtn icon="eye" label="View" onClick={() => { setPicked(r._id); setTab('overview'); }} />
                          <IconBtn icon="pencil" label="Edit" onClick={() => setForm(r)} />
                          <IconBtn icon="trash" kind="danger" label="Retire" onClick={() => setDel(r)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {!rows.length ? (
              <Empty icon="bus" title="No vehicles match these filters"
                     action={<Btn kind="soft" onClick={reset}>Clear the filters</Btn>} />
            ) : null}
            <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="vehicles"
                   onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
          </CardBody>
        </Card>

        <div className="tr-rail">
          {detail ? <VehicleRail v={detail} tab={tab} setTab={setTab} onEdit={() => setForm(detail)} nav={nav} />
            : <Panel title="Vehicle"><Empty icon="bus" sm title="Pick a vehicle" >Its route, crew, service history and documents appear here.</Empty></Panel>}
        </div>
      </div>

      {form ? (
        <VehicleForm open onClose={() => setForm(null)} row={form._id ? form : null}
                     onSaved={() => { setForm(null); reload(); }} />
      ) : null}
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} tone="danger"
               title="Retire this vehicle?" confirmLabel="Retire"
               message={`${del?.vehicleNumber} will be taken out of the active fleet. Its trips, fuel and service history are kept.`} />
    </div>
  );
}

function VehicleRail({ v, tab, setTab, onEdit, nav }) {
  const route = v.routes?.[0];
  const driver = v.crew?.find((c) => c.staffType === 'driver');
  return (
    <>
      <Panel flush>
        <div style={{ position: 'relative' }}>
          <Thumb src={v.photo} alt={v.vehicleNumber} lg />
          <span style={{ position: 'absolute', top: 12, right: 12 }}>
            <StatusBadge value={v.status === 'active' && route ? 'on_route' : v.status} />
          </span>
        </div>
        <div style={{ padding: '14px 16px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className={`tr-dot tr-dot--${v.status === 'active' ? 'green' : v.status === 'maintenance' ? 'amber' : 'slate'}`} />
            <b style={{ fontSize: '1.05rem' }}>{v.vehicleNumber}</b>
          </div>
          <div style={{ fontSize: '.84rem', color: 'var(--tr-muted)', marginTop: 2 }}>
            {[v.busName || v.manufacturer, v.capacity ? `${v.capacity} Seater` : null].filter(Boolean).join(' ')}
          </div>
          <div style={{ marginTop: 8 }}><Chip tone="slate"><Ico name="idCard" size={13} />{v.registrationNumber}</Chip></div>
          <div style={{ display: 'flex', gap: 8, margin: '14px 0 4px' }}>
            <Btn kind="primary" icon="mapPin" onClick={() => nav('/admin/transport/live')} style={{ flex: 1 }}>Track Live</Btn>
            <Btn icon="pencil" onClick={onEdit}>Edit</Btn>
          </div>
        </div>
        <div style={{ padding: '6px 16px 0' }}><UTabs value={tab} onChange={setTab} items={RAIL_TABS} /></div>
        <div style={{ padding: 16 }}>
          {tab === 'overview' ? (
            <>
              <Facts>
                <Fact icon="bus" k="Type" v={VEHICLE_TYPE[v.vehicleType] || words(v.vehicleType)} />
                <Fact icon="users" k="Capacity" v={`${v.capacity || 0} Seats`} />
                <Fact icon="wallet" k="Fuel Type" v={FUEL_TYPE[v.fuelType] || words(v.fuelType)} />
                <Fact icon="gauge" k="Mileage" v={v.mileage ? `${v.mileage} km/l` : '—'} />
                <Fact icon="calendar" k="Purchase Date" v={fmtDate(v.purchaseDate)} />
                <Fact icon="shieldCheck" k="Insurance Valid Till" v={fmtDate(v.insuranceExpiry)} />
              </Facts>
              <div style={{ marginTop: 12 }}>
                {v.compliance?.state === 'ok' ? (
                  <Note tone="good" title="All systems operational">Last checked {fmtDateTime(new Date())}</Note>
                ) : (
                  <Note tone={v.compliance?.state === 'expired' ? 'bad' : 'warn'}
                        title={v.compliance?.expired ? `${v.compliance.expired} document${v.compliance.expired === 1 ? '' : 's'} expired` : 'Documents expiring soon'}>
                    {v.compliance.docs.filter((x) => x.state !== 'ok').map((x) => x.label).join(', ')} — see the Documents tab.
                  </Note>
                )}
              </div>
              <div style={{ marginTop: 12, fontSize: '.79rem', color: 'var(--tr-muted)' }}>
                {v.occupancy} of {v.capacity || 0} seats assigned · odometer {count(v.odometer)} km
              </div>
            </>
          ) : null}

          {tab === 'driver' ? (
            v.crew?.length ? (
              <Rows>
                {v.crew.map((c) => (
                  <Row key={c._id} avatar={<Avatar name={c.name} src={c.photo} id={c._id} />}
                       title={c.name} sub={`${c.roleLabel}${c.phone ? ` · ${c.phone}` : ''}`}
                       badge={<StatusBadge value={c.status} />} />
                ))}
              </Rows>
            ) : <Empty icon="driver" sm title="No crew on this vehicle">Assign a driver on the route that uses it.</Empty>
          ) : null}

          {tab === 'route' ? (
            route ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <RouteBadge route={route} />
                  <Cell2 top={route.name} sub={route.zone || `${route.stops?.length || 0} stops`} />
                </div>
                <Facts>
                  <Fact icon="mapPin" k="Stops" v={route.stops?.length || 0} />
                  <Fact icon="compass" k="Distance" v={route.distanceKm ? `${route.distanceKm} km` : '—'} />
                  <Fact icon="clock" k="Duration" v={route.estimatedDurationMin ? `${route.estimatedDurationMin} mins` : '—'} />
                  <Fact icon="sun" k="Morning" v={route.schedule?.morningStart ? `${fmtTime(route.schedule.morningStart)}` : '—'} />
                </Facts>
              </>
            ) : <Empty icon="route" sm title="Not on a route">Assign this vehicle to a route on the Routes screen.</Empty>
          ) : null}

          {tab === 'maintenance' ? (
            v.maintenance?.length ? (
              <Rows>
                {v.maintenance.map((m) => (
                  <Row key={m._id} icon="wrench" iconTone={m.status === 'completed' ? 'green' : 'amber'}
                       title={m.title} sub={`${words(m.category)} · ${fmtDate(m.completedDate || m.scheduledDate)}`}
                       end={m.cost ? money(m.cost) : '—'} endSub={words(m.status)} />
                ))}
              </Rows>
            ) : <Empty icon="wrench" sm title="No service history" />
          ) : null}

          {tab === 'documents' ? (
            v.compliance?.docs?.length ? (
              <Rows>
                {v.compliance.docs.map((doc) => (
                  <Row key={doc.label} icon="doc" iconTone={doc.state === 'ok' ? 'green' : doc.state === 'due' ? 'amber' : 'red'}
                       title={doc.label} sub={`Valid till ${fmtDate(doc.date)}`}
                       badge={<StatusBadge value={doc.state} />} />
                ))}
              </Rows>
            ) : <Empty icon="doc" sm title="No compliance dates recorded">Add them when you edit the vehicle and the renewal alerts start working.</Empty>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
