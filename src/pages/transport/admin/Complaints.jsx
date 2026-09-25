/**
 * Transport → Complaints.
 *
 * Average resolution time is measured on `resolvedAt`, stamped when a
 * complaint is actually resolved. It used to fall back to `updatedAt`, which
 * every later edit moved, so the figure drifted upward every time someone
 * added a note to an old row.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search,
  Filters, TableWrap, Cell2, Who, Avatar, Badge, StatusBadge, Chip, Pager, Rows, Row, QuickActions,
  Loading, Empty, Note, Mark, count, fmtDate, fmtTime, ago, words, useBoard, useDebounced, toCsv, saveFile, Ico,
} from './trUI';
import { Donut, DonutLegend, DonutRow, LineChart, toSlices, STATUS_INK } from './trCharts';
import { ComplaintForm, ComplaintActionModal } from './trForms';

const RANGES = [
  { value: '7', label: 'Last 7 Days' }, { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' }, { value: '365', label: 'Last 12 Months' },
];

export default function TransportComplaints() {
  const [days, setDays] = useState('30');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [route, setRoute] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [form, setForm] = useState(false);
  const [act, setAct] = useState(null);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(
    () => api.getComplaintBoard({ days, search, status, category, route, page, limit }),
    [days, search, status, category, route, page, limit],
  );
  const d = data || {};
  const t = d.tiles || {};
  const rows = d.data || [];

  const reset = () => { setQ(''); setStatus(''); setCategory(''); setRoute(''); setPage(1); };
  const exportCsv = () => {
    saveFile(`complaints-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['complaintCode', 'Code'], ['createdAt', 'Raised', (r) => fmtDate(r.createdAt)],
      ['raisedBy', 'Raised by', (r) => `${r.raisedBy?.name || ''}${r.raisedBy?.role ? ` (${r.raisedBy.role})` : ''}`],
      ['categoryLabel', 'Category'], ['subject', 'Subject'],
      ['route', 'Route', (r) => r.route?.name || ''], ['vehicle', 'Vehicle', (r) => r.vehicle?.vehicleNumber || ''],
      ['status', 'Status'], ['assignedTo', 'Assigned to', (r) => r.assignedTo?.name || ''],
      ['rating', 'Rating'],
    ], rows));
    toast.success('Exported the complaints on this page');
  };

  if (loading && !data) return <div className="tr-page"><Loading tiles={4} /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load complaints">{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={`${fmtDate(d.range?.from)} – ${fmtDate(d.range?.to)}`} icon="calendar" />
        <Btn kind="primary" icon="plus" onClick={() => setForm(true)}>New Complaint</Btn>
      </TopBar>

      <TrHead icon="megaphone" iconTone="red" title="Transport Complaints"
              subtitle="Track, manage and resolve transport-related complaints for a safer, better journey." />

      <Tiles cols="4">
        <Tile icon="megaphone" tone="red" value={count(t.total)} label="Total Complaints"
              delta={t.totalDelta} deltaNote="vs. last period" />
        <Tile icon="clock" tone="orange" value={count(t.open)} label="Open Complaints"
              sub={`${t.openAssigned || 0} assigned, ${t.openUnassigned || 0} unassigned`} />
        <Tile icon="check" tone="green" value={count(t.resolved)} label="Resolved Complaints"
              delta={t.resolvedDelta} deltaNote="vs. last period" />
        <Tile icon="star" tone="amber" value={t.rating ? t.rating.toFixed(1) : '—'} label="Average Rating"
              sub={t.ratingCount ? `Based on ${t.ratingCount} resolved complaints` : 'Nobody has rated a resolution yet'} />
      </Tiles>

      <div className="tr-grid tr-grid--chart3">
        <Card>
          <CardHead title="Complaints Trend"
                    right={<Select value={days} onChange={(v) => { setDays(v); setPage(1); }} options={RANGES} width={150} />} />
          <CardBody>
            {d.trend?.length ? (
              <>
                <LineChart data={d.trend} height={196} area fmt={count} series={[
                  { key: 'raised', label: 'New Complaints', color: '#7c3aed' },
                  { key: 'resolved', label: 'Resolved', color: '#16a34a' },
                ]} />
                <div className="tr-legend" style={{ marginTop: 10 }}>
                  <span><i style={{ background: '#7c3aed' }} />New Complaints</span>
                  <span><i style={{ background: '#16a34a' }} />Resolved</span>
                </div>
              </>
            ) : <Empty icon="chart" sm title="Nothing to chart" />}
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Complaints by Category" />
          <CardBody fill>
            {d.categories?.length ? (
              <DonutRow>
                <div className="tr-donutwrap__chart">
                  <Donut size={150} thickness={23} total={t.total} sub="Complaints" data={toSlices(d.categories)} />
                </div>
                <DonutLegend data={toSlices(d.categories)} right={(x) => `${d.categories.find((r) => r.label === x.label)?.pct || 0}%`} />
              </DonutRow>
            ) : <Empty icon="chart" sm title="Nothing to break down" />}
          </CardBody>
        </Card>

        <div className="tr-rail">
          <Panel title="Resolution Time">
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <Mark name="clock" tone="blue" size={44} glyph={21} />
              <div>
                <div style={{ fontSize: '1.42rem', fontWeight: 700 }}>{t.resolutionDays || 0} days</div>
                <div style={{ fontSize: '.76rem', color: 'var(--tr-muted)' }}>Average Resolution Time</div>
                {t.resolutionDelta != null ? (
                  <div className={`tr-tile__delta tr-tile__delta--${t.resolutionDelta <= 0 ? 'up' : 'down'}`} style={{ marginTop: 4 }}>
                    <Ico name={t.resolutionDelta <= 0 ? 'arrowDown' : 'arrowUp'} size={13} />
                    {t.resolutionDelta > 0 ? '+' : ''}{t.resolutionDelta}% vs. last period
                  </div>
                ) : null}
              </div>
            </div>
          </Panel>
          <Panel title="Satisfaction Rating">
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <Mark name="star" tone="amber" size={44} glyph={21} />
              <div>
                <div style={{ fontSize: '1.42rem', fontWeight: 700 }}>{t.rating ? t.rating.toFixed(1) : '—'} / 5</div>
                <div style={{ fontSize: '.76rem', color: 'var(--tr-muted)' }}>
                  {t.ratingCount ? `From ${t.ratingCount} resolved complaints` : 'No ratings yet'}
                </div>
                {t.ratingDelta != null ? (
                  <div className={`tr-tile__delta tr-tile__delta--${t.ratingDelta >= 0 ? 'up' : 'down'}`} style={{ marginTop: 4 }}>
                    <Ico name={t.ratingDelta >= 0 ? 'arrowUp' : 'arrowDown'} size={13} />
                    {t.ratingDelta > 0 ? '+' : ''}{t.ratingDelta} vs. last period
                  </div>
                ) : null}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Filters>
        <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search complaints…" />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All Status"
                options={['open', 'assigned', 'in_progress', 'resolved', 'closed'].map((v) => ({ value: v, label: words(v) }))} />
        <Select value={category} onChange={(v) => { setCategory(v); setPage(1); }} placeholder="All Categories" options={d.filters?.categories || []} />
        <Select value={route} onChange={(v) => { setRoute(v); setPage(1); }} placeholder="All Routes" options={d.filters?.routes || []} />
        <Select value={days} onChange={(v) => { setDays(v); setPage(1); }} options={RANGES} width={150} />
        <Btn onClick={reset}>Reset</Btn>
      </Filters>

      <div className="tr-split">
        <Card>
          <CardHead title={`Complaint Records (${count(d.total)})`} />
          <CardBody flush>
            <TableWrap>
              <table className="tr-table">
                <thead>
                  <tr>
                    <th className="tr-table__idx">#</th>
                    <th>Date & Time</th><th>Student / Parent</th><th>Category</th><th>Description</th>
                    <th>Route / Vehicle</th><th>Status</th><th>Assigned To</th><th className="tr-table__acts">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r._id}>
                      <td className="tr-table__idx">{(d.page - 1) * limit + i + 1}</td>
                      <td><Cell2 top={fmtDate(r.createdAt)} sub={fmtTime(r.createdAt)} /></td>
                      <td><Cell2 top={r.raisedBy?.name || '—'} sub={r.raisedBy?.role ? `(${words(r.raisedBy.role)})` : ''} /></td>
                      <td><Badge tone={r.tone} square>{r.categoryLabel}</Badge></td>
                      <td style={{ maxWidth: 210 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description || r.subject}>
                          {r.subject}
                        </div>
                      </td>
                      <td><Cell2 top={r.route ? `${r.route.tag} - ${r.route.name}` : '—'} sub={r.vehicle?.vehicleNumber} /></td>
                      <td><StatusBadge value={r.status} /></td>
                      <td>{r.assignedTo
                        ? <Who name={r.assignedTo.name} id={r.assignedTo._id} src={r.assignedTo.profileImage || r.assignedTo.photo} size="sm" />
                        : <Badge tone="slate">Unassigned</Badge>}</td>
                      <td className="tr-table__acts">
                        <div>
                          <IconBtn icon="eye" label="View" onClick={() => setAct(r)} />
                          <IconBtn icon="pencil" label="Act on it" onClick={() => setAct(r)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {!rows.length ? <Empty icon="megaphone" title="No complaints here">Nothing has been raised in this window.</Empty> : null}
            <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="records"
                   onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
          </CardBody>
        </Card>

        <div className="tr-rail">
          <Panel title="Recent Complaints" flush>
            {d.recent?.length ? (
              <Rows>
                {d.recent.map((c) => (
                  <Row key={c._id} icon="megaphone" iconTone={c.tone === 'slate' ? 'slate' : c.tone}
                       title={c.subject} sub={c.route ? `${c.route.tag} - ${c.route.name}` : words(c.categoryLabel)}
                       endSub={ago(c.createdAt)} onClick={() => setAct(c)} />
                ))}
              </Rows>
            ) : <Empty icon="megaphone" sm title="Nothing raised recently" />}
          </Panel>

          <Panel title="Quick Actions">
            <QuickActions items={[
              { icon: 'plus', label: 'New Complaint', onClick: () => setForm(true) },
              { icon: 'chart', label: 'View Reports', to: '/admin/transport/reports' },
              { icon: 'sliders', label: 'Manage Categories', to: '/admin/transport/settings' },
              { icon: 'star', label: 'Feedback Survey', to: '/admin/feedback' },
            ]} />
          </Panel>
        </div>
      </div>

      <ComplaintForm open={form} onClose={() => setForm(false)} onSaved={() => { setForm(false); reload(); }} />
      {act ? <ComplaintActionModal open onClose={() => setAct(null)} complaint={act} assignees={d.assignees || []}
                                   onSaved={() => { setAct(null); reload(); }} /> : null}
    </div>
  );
}
