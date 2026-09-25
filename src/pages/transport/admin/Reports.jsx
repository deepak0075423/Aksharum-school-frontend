/**
 * Transport → Reports.
 *
 * Nine reports, one shape. Each builder on the server answers with columns,
 * rows and a summary, so this screen renders any of them without knowing which,
 * and CSV export is the same code for all nine. A report is rebuilt from live
 * data every time it is opened or downloaded — a link kept in an inbox can
 * never serve last month's numbers under this month's heading.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search,
  Filters, Pills, TableWrap, Cell2, Badge, StatusBadge, Pager, Rows, Row, QuickActions, Modal, Mark,
  Loading, Empty, Note, Confirm, count, compactMoney, money, fmtDate, fmtDateTime, words, useBoard,
  useDebounced, toCsv, saveFile, openHtml, Glyph, Ico,
} from './trUI';
import { Bars, LineChart, RankBars } from './trCharts';
import { ScheduleReportModal } from './trForms';

const RANGES = [
  { value: '7', label: 'Last 7 Days' }, { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' }, { value: '365', label: 'Last 12 Months' },
];
const CATEGORIES = [
  { value: '', label: 'All Reports' }, { value: 'trips', label: 'Trips' }, { value: 'fuel', label: 'Fuel' },
  { value: 'maintenance', label: 'Maintenance' }, { value: 'incidents', label: 'Incidents' },
  { value: 'students', label: 'Students' }, { value: 'finance', label: 'Finance' }, { value: 'compliance', label: 'Compliance' },
];
const ICON = {
  bus: 'bus', route: 'route', gauge: 'gauge', fuel: 'fuel', wrench: 'wrench',
  alert: 'alert', students: 'students', rupee: 'rupee', shield: 'shield',
};
const TONE = {
  trip_summary: 'blue', route_performance: 'green', vehicle_utilization: 'orange', fuel_consumption: 'red',
  maintenance: 'indigo', incident: 'red', student_transport: 'teal', fees_revenue: 'green', compliance: 'blue',
};

export default function TransportReports() {
  const [days, setDays] = useState('30');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sched, setSched] = useState(null);
  const [del, setDel] = useState(null);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(() => api.getReportBoard({ days }), [days]);
  const d = data || {};
  const t = d.tiles || {};

  const catalog = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (d.catalog || []).filter((c) => {
      if (cat && c.category !== cat) return false;
      if (needle && !`${c.name} ${c.description}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [d.catalog, cat, search]);

  const generate = async (meta) => {
    setBusy(true);
    try {
      const res = await api.generateReport({ reportType: meta.key, days, format: 'pdf' });
      setRun(res?.data ?? res);
      reload();
    } catch (e) { toast.error(e?.message || 'Could not build that report'); }
    finally { setBusy(false); }
  };
  const download = async (report, format) => {
    try {
      const res = await api.downloadReport(report._id, { format });
      const body = typeof res === 'string' ? res : (res?.data ?? '');
      if (format === 'csv' || format === 'excel') saveFile(`${report.name.replace(/[^\w.-]+/g, '_')}.csv`, body);
      else if (!openHtml(body, report.name)) toast.error('Allow pop-ups to open the report');
    } catch (e) { toast.error(e?.message || 'Could not download it'); }
  };
  const toggle = async (r) => {
    try { await api.toggleReport(r._id); reload(); }
    catch (e) { toast.error(e?.message || 'Could not change that schedule'); }
  };
  const remove = async () => {
    try { await api.deleteReport(del._id); toast.success('Removed'); setDel(null); reload(); }
    catch (e) { toast.error(e?.message || 'Could not remove it'); setDel(null); }
  };

  if (loading && !data) return <div className="tr-page"><Loading /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load reports">{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={`${fmtDate(d.range?.from)} – ${fmtDate(d.range?.to)}`} icon="calendar" />
        <Btn kind="primary" icon="plus" onClick={() => generate(d.catalog?.[0] || { key: 'trip_summary' })}>Generate Report</Btn>
      </TopBar>

      <TrHead icon="chart" iconTone="indigo" title="Transport Reports"
              subtitle="Insights and analytics to keep your transport operations efficient, safe and transparent.">
        <Btn icon="clock" onClick={() => setSched({})}>Schedule Report</Btn>
        <Btn icon="download" onClick={() => generate({ key: 'trip_summary' })}>Export All</Btn>
      </TrHead>

      <Tiles>
        <Tile icon="bus" tone="blue" value={count(t.trips)} label="Total Trips" delta={t.tripsDelta} deltaNote="vs. last period" />
        <Tile icon="students" tone="green" value={count(t.students)} label="Students Transported" delta={t.studentsDelta} deltaNote="vs. last period" />
        <Tile icon="fuel" tone="orange" value={`${count(t.fuel)} L`} label="Fuel Consumed" delta={t.fuelDelta} deltaNote="vs. last period" />
        <Tile icon="wrench" tone="red" value={count(t.maintenance)} label="Maintenance Events" delta={t.maintenanceDelta} deltaNote="vs. last period" />
        <Tile icon="alert" tone="purple" value={count(t.incidents)} label="Incidents Reported" delta={t.incidentsDelta} deltaNote="vs. last period" />
      </Tiles>

      <div className="tr-grid tr-grid--chart3">
        <Card>
          <CardHead title="Trips Overview" />
          <CardBody>
            {d.tripsOverview?.length ? (
              <>
                <Bars data={d.tripsOverview} height={196} series={[
                  { key: 'scheduled', label: 'Scheduled', color: '#c7d2fe' },
                  { key: 'completed', label: 'Completed', color: '#4f46e5' },
                ]} />
                <div className="tr-legend" style={{ marginTop: 10 }}>
                  <span><i style={{ background: '#c7d2fe' }} />Scheduled</span>
                  <span><i style={{ background: '#4f46e5' }} />Completed</span>
                </div>
              </>
            ) : <Empty icon="chart" sm title="No trips in this window" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Fuel Consumption"
                    right={<Select value={days} onChange={setDays} options={RANGES} width={150} />} />
          <CardBody>
            {d.fuelTrend?.some((x) => x.litres) ? (
              <LineChart data={d.fuelTrend} height={196} area fmt={(v) => `${count(v)} L`}
                         series={[{ key: 'litres', label: 'Litres', color: '#16a34a' }]} />
            ) : <Empty icon="fuel" sm title="No fill-ups in this window" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Route Performance" right={<Badge tone="slate">By On-Time %</Badge>} />
          <CardBody>
            {d.routePerformance?.length ? (
              <RankBars nameWidth={112} max={100} fmt={(v) => `${v}%`}
                        data={d.routePerformance.map((r) => ({ key: r.tag, label: `${r.tag} - ${r.name}`, value: r.onTimePct, color: r.color }))} />
            ) : <Empty icon="route" sm title="No trips to measure" />}
          </CardBody>
        </Card>
      </div>

      <Filters>
        <Pills value={cat} onChange={setCat} items={CATEGORIES} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Search value={q} onChange={setQ} placeholder="Search reports…" grow={false} style={{ width: 220 }} />
          <Select value={days} onChange={setDays} options={RANGES} width={150} />
        </div>
      </Filters>

      <div className="tr-split">
        <div style={{ display: 'grid', gap: 14 }}>
          <Card>
            <CardHead title="Available Reports" sub="Each one is built from live data when you run it" />
            <CardBody>
              {catalog.length ? (
                <div className="tr-repgrid">
                  {catalog.map((c) => (
                    <button key={c.key} type="button" className="tr-repcard" disabled={busy} onClick={() => generate(c)}>
                      <Mark name={ICON[c.icon] || 'doc'} tone={TONE[c.key] || 'indigo'} size={42} glyph={20} />
                      <span className="tr-repcard__text"><b>{c.name}</b><span>{c.description}</span></span>
                      <span className="tr-repcard__go"><Ico name="arrowRight" size={17} /></span>
                    </button>
                  ))}
                </div>
              ) : <Empty icon="doc" title="No report matches" />}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Recent Reports" right={<Badge tone="slate">{d.recent?.length || 0}</Badge>} />
            <CardBody flush>
              {d.recent?.length ? (
                <TableWrap>
                  <table className="tr-table">
                    <thead>
                      <tr>
                        <th className="tr-table__idx">#</th>
                        <th>Report Name</th><th>Type</th><th>Date Generated</th><th>Generated By</th>
                        <th>Format</th><th>Status</th><th className="tr-table__acts">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.recent.map((r, i) => (
                        <tr key={r._id}>
                          <td className="tr-table__idx">{i + 1}</td>
                          <td><Cell2 top={r.name} sub={`${count(r.rowCount)} rows`} /></td>
                          <td><Badge tone={TONE[r.reportType] || 'slate'} square>{words(r.category)}</Badge></td>
                          <td>{fmtDateTime(r.generatedAt)}</td>
                          <td>{r.generatedBy}</td>
                          <td><Badge tone={r.format === 'excel' ? 'green' : 'blue'}>{r.format.toUpperCase()}</Badge></td>
                          <td><StatusBadge value={r.status} /></td>
                          <td className="tr-table__acts">
                            <div>
                              <IconBtn icon="eye" label="Open" onClick={() => download(r, 'pdf')} />
                              <IconBtn icon="download" label="Download CSV" onClick={() => download(r, 'csv')} />
                              <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => setDel(r)} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              ) : <Empty icon="doc" title="Nothing has been generated yet">Pick a report above and it appears here.</Empty>}
            </CardBody>
          </Card>
        </div>

        <div className="tr-rail">
          <Panel title="Scheduled Reports" right={<Btn size="sm" icon="plus" onClick={() => setSched({})}>Add</Btn>} flush>
            {d.scheduled?.length ? (
              <Rows>
                {d.scheduled.map((r) => (
                  <Row key={r._id} icon="doc" iconTone={r.status === 'paused' ? 'slate' : 'blue'}
                       title={r.name} sub={`${words(r.frequency)}${r.nextRunAt ? ` · next ${fmtDate(r.nextRunAt)}` : ''}`}>
                    <StatusBadge value={r.status === 'paused' ? 'inactive' : 'active'} label={r.status === 'paused' ? 'Paused' : 'Active'} />
                    <span style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
                      <IconBtn icon={r.status === 'paused' ? 'play' : 'pause'} kind="plain"
                               label={r.status === 'paused' ? 'Resume' : 'Pause'} onClick={() => toggle(r)} />
                      <IconBtn icon="pencil" kind="plain" label="Edit" onClick={() => setSched(r)} />
                      <IconBtn icon="trash" kind="plain" label="Remove" onClick={() => setDel(r)} />
                    </span>
                  </Row>
                ))}
              </Rows>
            ) : (
              <div style={{ padding: 16 }}>
                <Note tone="info" title="Nothing is scheduled">
                  A scheduled report runs on its own and emails the people you list.
                </Note>
              </div>
            )}
          </Panel>

          <Panel title="Quick Actions">
            <QuickActions items={[
              { icon: 'plus', label: 'Create Custom Report', onClick: () => generate(d.catalog?.[0] || { key: 'trip_summary' }) },
              { icon: 'upload', label: 'Export Current View', onClick: () => generate({ key: 'trip_summary' }) },
              { icon: 'clock', label: 'Schedule Report', onClick: () => setSched({}) },
              { icon: 'copy', label: 'Report Templates', onClick: () => setCat('') },
            ]} />
          </Panel>
        </div>
      </div>

      <Modal open={!!run} onClose={() => setRun(null)} wide icon="chart" iconTone="indigo"
             title={run?.meta?.name || 'Report'}
             sub={run ? `${fmtDate(run.range?.from)} – ${fmtDate(run.range?.to)} · ${count(run.rows?.length)} rows` : ''}
             foot={<>
               <Btn icon="download" onClick={() => run && download(run.report, 'csv')}>Download CSV</Btn>
               <Btn kind="primary" icon="eye" onClick={() => run && download(run.report, 'pdf')}>Open printable</Btn>
             </>}>
        {run ? (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              {Object.entries(run.summary || {}).map(([k, v]) => (
                <div key={k} style={{ border: '1px solid var(--tr-line)', borderRadius: 11, padding: '9px 13px', minWidth: 118 }}>
                  <div style={{ fontSize: '.71rem', color: 'var(--tr-muted)' }}>{k}</div>
                  <b style={{ fontSize: '1.05rem' }}>{typeof v === 'number' ? count(v) : v}</b>
                </div>
              ))}
            </div>
            <TableWrap>
              <table className="tr-table">
                <thead><tr>{run.columns.map((c) => <th key={c[0]} className={c[2] === 'r' ? 'tr-r' : ''}>{c[1]}</th>)}</tr></thead>
                <tbody>
                  {run.rows.slice(0, 60).map((r, i) => (
                    <tr key={i}>{run.columns.map((c) => (
                      <td key={c[0]} className={c[2] === 'r' ? 'tr-r tr-num' : ''}>{r[c[0]] === '' || r[c[0]] == null ? '—' : String(r[c[0]])}</td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {run.rows.length > 60 ? (
              <div style={{ fontSize: '.79rem', color: 'var(--tr-muted)', padding: '10px 2px' }}>
                Showing the first 60 of {count(run.rows.length)} rows — download the CSV for all of them.
              </div>
            ) : null}
            {!run.rows.length ? <Empty icon="doc" title="Nothing in this window">Widen the date range and run it again.</Empty> : null}
          </>
        ) : null}
      </Modal>

      {sched ? <ScheduleReportModal open onClose={() => setSched(null)} catalog={d.catalog || []}
                                    row={sched._id ? sched : null} onSaved={() => { setSched(null); reload(); }} /> : null}
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} tone="danger"
               title="Remove this report?" confirmLabel="Remove"
               message={`${del?.name || 'It'} is removed from the list. Nothing in the underlying data changes.`} />
    </div>
  );
}
