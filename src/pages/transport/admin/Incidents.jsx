/**
 * Transport → Incidents.
 *
 * "Student Injuries" is its own counted field rather than the length of
 * studentsInvolved[] — that list holds every child who was on board, and
 * reporting them all as injured would be the worst kind of wrong number.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search,
  Filters, FilterEnd, TableWrap, Cell2, Who, Badge, StatusBadge, Chip, Pager, Rows, Row, Facts, Fact,
  QuickActions, Loading, Empty, Note, count, money, fmtDate, fmtTime, fmtDateTime, words, useBoard,
  useDebounced, toCsv, saveFile,
} from './trUI';
import { Donut, DonutLegend, DonutRow, LineChart, toSlices } from './trCharts';
import TrMap from './trMap';
import { IncidentForm } from './trForms';

const RANGES = [
  { value: '7', label: 'Last 7 Days' }, { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' }, { value: '365', label: 'Last 12 Months' },
];

export default function TransportIncidents() {
  const [days, setDays] = useState('30');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [route, setRoute] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [form, setForm] = useState(null);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(
    () => api.getIncidentBoard({ days, search, type, status, route, page, limit }),
    [days, search, type, status, route, page, limit],
  );
  const d = data || {};
  const t = d.tiles || {};
  const rows = d.data || [];
  const recent = d.recent;

  const reset = () => { setQ(''); setType(''); setStatus(''); setRoute(''); setPage(1); };
  const exportCsv = () => {
    saveFile(`incidents-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['incidentCode', 'Code'], ['date', 'Date', (r) => fmtDateTime(r.date)],
      ['typeLabel', 'Type'], ['severity', 'Severity'], ['description', 'Description'],
      ['vehicle', 'Vehicle', (r) => r.vehicle?.vehicleNumber || ''],
      ['driver', 'Driver', (r) => r.driver?.name || ''],
      ['locationText', 'Location'], ['injuredCount', 'Injuries'], ['repairCost', 'Repair (₹)'], ['status', 'Status'],
    ], rows));
    toast.success('Exported the incidents on this page');
  };

  if (loading && !data) return <div className="tr-page"><Loading tiles={4} /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load incidents">{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={`${fmtDate(d.range?.from)} – ${fmtDate(d.range?.to)}`} icon="calendar" />
        <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Report Incident</Btn>
      </TopBar>

      <TrHead title="Transport Incidents" subtitle="Track, manage and resolve transport-related incidents for a safer journey.">
        <Btn icon="download" onClick={exportCsv}>Export Report</Btn>
      </TrHead>

      <Tiles cols="4">
        <Tile icon="alert" tone="red" value={count(t.total)} label="Total Incidents"
              delta={t.totalDelta} deltaNote="vs. last period" />
        <Tile icon="clock" tone="orange" value={count(t.open)} label="Open Incidents"
              sub={t.stale48 ? `${t.stale48} pending > 48 hrs` : 'None waiting over 48 hrs'} />
        <Tile icon="check" tone="green" value={count(t.resolved)} label="Resolved Incidents"
              delta={t.resolvedDelta} deltaNote="vs. last period" />
        <Tile icon="students" tone="purple" value={count(t.injuries)} label="Student Injuries"
              sub={t.injuries ? 'Needs a safety review' : 'Good safety record'} />
      </Tiles>

      <div className="tr-grid tr-grid--chart3">
        <Card>
          <CardHead title="Incidents by Type" />
          <CardBody fill>
            {d.types?.length ? (
              <DonutRow>
                <div className="tr-donutwrap__chart">
                  <Donut size={150} thickness={23} total={t.total} sub="Incidents" data={toSlices(d.types)} />
                </div>
                <DonutLegend data={toSlices(d.types)} right={(x) => `${d.types.find((r) => r.label === x.label)?.pct || 0}%`} />
              </DonutRow>
            ) : <Empty icon="check" sm title="No incidents in this window">A quiet fleet is the point.</Empty>}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Incidents Trend"
                    right={<Select value={days} onChange={(v) => { setDays(v); setPage(1); }} options={RANGES} width={150} />} />
          <CardBody>
            {d.trend?.length ? (
              <LineChart data={d.trend} height={196} area fmt={count}
                         series={[{ key: 'count', label: 'Incidents', color: '#7c3aed' }]} />
            ) : <Empty icon="chart" sm title="Nothing to chart" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Incident Locations" />
          <CardBody fill>
            <TrMap height={196} legend={false} routes={[]} school={null} map={d.map}
                   pins={(d.locations || []).map((x) => ({ ...x, title: `${x.label} — ${x.address || ''}` }))}
                   emptyHint="Add a latitude and longitude when you report an incident and it is plotted here." />
            {d.types?.length ? (
              <div className="tr-maplegend-inline">
                {d.types.slice(0, 4).map((x) => (
                  <span key={x.key}><i className={`tr-dot tr-dot--${x.tone === 'slate' ? 'slate' : x.tone}`} />{x.label}</span>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Filters>
        <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search incidents by ID, vehicle, driver, location…" />
        <Select value={type} onChange={(v) => { setType(v); setPage(1); }} placeholder="All Types" options={d.filters?.types || []} />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All Status"
                options={['reported', 'investigating', 'resolved', 'closed'].map((v) => ({ value: v, label: words(v) }))} />
        <Select value={route} onChange={(v) => { setRoute(v); setPage(1); }} placeholder="All Routes" options={d.filters?.routes || []} />
        <Select value={days} onChange={(v) => { setDays(v); setPage(1); }} options={RANGES} width={150} />
        <Btn onClick={reset}>Reset</Btn>
      </Filters>

      <div className="tr-split">
        {/* Actions belong under the table, not stacked below a detail panel
            that is already taller than a five-row list. */}
        <div className="tr-stack">
          <Card>
            <CardHead title={`Incident Records (${count(d.total)})`} />
            <CardBody flush>
              <TableWrap>
                <table className="tr-table">
                  <thead>
                    <tr>
                      <th className="tr-table__idx">#</th>
                      <th>Date & Time</th><th>Type</th><th>Description</th><th>Vehicle</th>
                      <th>Driver / Crew</th><th>Location</th><th>Status</th><th className="tr-table__acts">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r._id}>
                        <td className="tr-table__idx">{(d.page - 1) * limit + i + 1}</td>
                        <td><Cell2 top={fmtDate(r.date)} sub={fmtTime(r.date)} /></td>
                        <td><Badge tone={r.tone} square>{r.typeLabel}</Badge></td>
                        <td style={{ maxWidth: 220 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description}</div>
                        </td>
                        <td>{r.vehicle?.vehicleNumber || '—'}</td>
                        <td>{r.driver ? <Who name={r.driver.name} src={r.driver.photo} id={r.driver._id} size="sm" /> : '—'}</td>
                        <td>{r.locationText || '—'}</td>
                        <td><StatusBadge value={r.status} /></td>
                        <td className="tr-table__acts">
                          <div>
                            <IconBtn icon="eye" label="View" onClick={() => setForm(r)} />
                            <IconBtn icon="pencil" label="Update" onClick={() => setForm(r)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              {!rows.length ? (
                <Empty icon="check" title="No incidents here"
                       action={<Btn kind="soft" icon="plus" onClick={() => setForm({})}>Report one</Btn>}>
                  Nothing has been reported in this window.
                </Empty>
              ) : null}
              <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="records"
                     onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
            </CardBody>
          </Card>
            <Panel title="Quick Actions">
              <QuickActions items={[
                { icon: 'alert', label: 'Report Incident', onClick: () => setForm({}) },
                { icon: 'upload', label: 'Export Records', onClick: exportCsv },
                { icon: 'chart', label: 'Incident Report', to: '/admin/transport/reports' },
                { icon: 'shield', label: 'Safety Guidelines', to: '/admin/transport/settings' },
              ]} />
            </Panel>
        </div>

        <div className="tr-rail">
          <Panel title="Recent Incident">
            {recent ? (
              <>
                <div className="tr-chiprow" style={{ marginBottom: 10 }}>
                  <Badge tone={recent.tone} square>{recent.typeLabel}</Badge>
                  <span style={{ fontSize: '.82rem', fontWeight: 700 }}>#{recent.incidentCode}</span>
                </div>
                <div style={{ display: 'grid', gap: 9 }}>
                  <Fact icon="calendar" k="When" v={fmtDateTime(recent.date)} />
                  <Fact icon="mapPin" k="Where" v={recent.locationText || '—'} />
                  <Fact icon="bus" k="Vehicle" v={recent.vehicle?.vehicleNumber || '—'} />
                  <Fact icon="driver" k="Driver" v={recent.driver?.name || '—'} />
                  <Fact icon="info" k="What happened" v={recent.description} />
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '.78rem', color: 'var(--tr-muted)' }}>Status</span>
                  <StatusBadge value={recent.status} />
                  {recent.injuredCount ? <Badge tone="red">{recent.injuredCount} injured</Badge> : null}
                  {recent.repairCost ? <Badge tone="slate">{money(recent.repairCost)} repair</Badge> : null}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <Btn kind="primary" style={{ flex: 1 }} onClick={() => setForm(recent)}>View Details</Btn>
                  <Btn onClick={() => setForm(recent)}>Update Status</Btn>
                </div>
              </>
            ) : <Empty icon="check" sm title="Nothing to show">No incident has been reported in this window.</Empty>}
          </Panel>
        </div>
      </div>

      {form ? <IncidentForm open onClose={() => setForm(null)} row={form._id ? form : null}
                            onSaved={() => { setForm(null); reload(); }} /> : null}
    </div>
  );
}
