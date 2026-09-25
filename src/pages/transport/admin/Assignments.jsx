/**
 * Transport → Assignments.
 *
 * Five views of one set of rows: the students themselves, or those rows folded
 * by route, stop, vehicle or driver. The fold happens on the server so a
 * "Route-wise" count is the real count, not the count on the page you are on.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search,
  Filters, Pills, TableWrap, Cell2, Who, Avatar, Badge, StatusBadge, RouteBadge, Chip, Pager,
  Rows, Row, QuickActions, Loading, Empty, Note, Confirm, Check, count, fmtTime, fmtDate, ago, words,
  useBoard, useDebounced, Ico, plural } from './trUI';
import { Donut, DonutLegend, DonutRow, seriesColor } from './trCharts';
import { AssignmentForm, BulkAssignModal, ImportModal, NotifyModal } from './trForms';

const VIEWS = [
  { value: 'students', label: 'Student Assignments' },
  { value: 'routes', label: 'Route-wise' },
  { value: 'stops', label: 'Stop-wise' },
  { value: 'vehicles', label: 'Vehicle-wise' },
  { value: 'drivers', label: 'Driver-wise' },
];

export default function TransportAssignments() {
  const [view, setView] = useState('students');
  const [q, setQ] = useState('');
  const [route, setRoute] = useState('');
  const [status, setStatus] = useState('active');
  const [classId, setClassId] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [form, setForm] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [imp, setImp] = useState(false);
  const [notify, setNotify] = useState(false);
  const [cancel, setCancel] = useState(null);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(
    () => api.getAssignmentBoard({ view, search, route, status, classId, page, limit }),
    [view, search, route, status, classId, page, limit],
  );
  const d = data || {};
  const t = d.tiles || {};
  const rows = d.data || [];

  const slices = useMemo(() => {
    const s = (d.summary || []).map((r) => ({ label: `${r.tag} - ${r.name}`, value: r.students, color: r.color }));
    if (d.unassignedTotal) s.push({ label: 'Unassigned', value: d.unassignedTotal, color: '#cbd5e1' });
    return s;
  }, [d.summary, d.unassignedTotal]);

  const setStatusOf = async (row, next) => {
    try {
      await api.setAssignmentStatus(row._id, { status: next, reason: next === 'cancelled' ? 'Removed by the transport office' : '' });
      toast.success(`Assignment ${next}`);
      setCancel(null); reload();
    } catch (e) { toast.error(e?.message || 'Could not update'); setCancel(null); }
  };

  if (loading && !data) return <div className="tr-page"><Loading tiles={4} /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load assignments">{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={new Date().getFullYear()} sub="Academic Year" icon="calendar" />
        <Btn kind="primary" icon="plus" onClick={() => setForm({})}>New Assignment</Btn>
      </TopBar>

      <TrHead title="Route Assignments" subtitle="Assign students to routes, stops and vehicles. Manage pick-up/drop schedules." />

      <Tiles cols="4">
        <Tile icon="students" tone="teal" value={count(t.assigned)} label="Students Assigned"
              delta={t.assignedDelta} deltaNote="vs. last term" />
        <Tile icon="route" tone="pink" value={count(t.routes)} label="Active Routes"
              sub={`${t.routesUsedPct || 0}% carrying students`} />
        <Tile icon="bus" tone="blue" value={count(t.vehiclesInUse)} label="Vehicles in Use"
              sub={`${count(t.vehiclesSpare)} spare vehicle${t.vehiclesSpare === 1 ? '' : 's'}`} />
        <Tile icon="driver" tone="orange" value={count(t.driversAssigned)} label="Drivers Assigned"
              sub={t.driversOnLeave ? `${t.driversOnLeave} on leave` : 'All on duty'} />
      </Tiles>

      <div className="tr-split tr-split--wide">
        {/* Same column as the table — a full-width band under the split left a
            hole beside a three-row list. */}
        <div className="tr-stack">
          <Card>
            <CardHead line>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                <Pills value={view} onChange={(v) => { setView(v); setPage(1); }} items={VIEWS} />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} grow={false}
                          placeholder="Search by student name, class, route…" style={{ width: 230 }} />
                  <Select value={route} onChange={(v) => { setRoute(v); setPage(1); }} placeholder="All routes" options={d.filters?.routes || []} width={140} />
                  <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} width={125}
                          options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'On Hold' }, { value: 'cancelled', label: 'Cancelled' }]} />
                </div>
              </div>
            </CardHead>

            <CardBody flush>
              {view === 'students' ? (
                <>
                  <TableWrap>
                    <table className="tr-table">
                      <thead>
                        <tr>
                          <th className="tr-table__idx">#</th>
                          <th>Student</th><th>Class</th><th>Route</th><th>Stop (Pick-up / Drop)</th>
                          <th>Vehicle</th><th>Pickup</th><th>Drop</th><th>Status</th><th className="tr-table__acts">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={r._id}>
                            <td className="tr-table__idx">{(d.page - 1) * limit + i + 1}</td>
                            <td><Who name={r.student.name} src={r.student.photo} id={r.student._id}
                                     sub={r.student.admissionNumber || ''} /></td>
                            <td>{r.student.classLabel || '—'}</td>
                            <td>{r.route ? <Chip color={r.route.color}>{r.route.tag} - {r.route.zone || r.route.name}</Chip> : '—'}</td>
                            <td><Cell2 top={r.pickupStop?.name || '—'}
                                       sub={r.dropStop && r.dropStop._id !== r.pickupStop?._id ? `Drop: ${r.dropStop.name}` : (r.pickupStop ? `Stop ${r.pickupStop.sequence}` : '')} /></td>
                            <td><Cell2 top={r.vehicle?.vehicleNumber || '—'} sub={r.vehicle?.manufacturer} /></td>
                            <td className="tr-num">{r.pickupTime ? fmtTime(r.pickupTime) : '—'}</td>
                            <td className="tr-num">{r.dropTime ? fmtTime(r.dropTime) : '—'}</td>
                            <td><StatusBadge value={r.status} /></td>
                            <td className="tr-table__acts">
                              <div>
                                <IconBtn icon="pencil" label="Edit" onClick={() => setForm(r)} />
                                <IconBtn icon={r.status === 'active' ? 'pause' : 'play'}
                                         label={r.status === 'active' ? 'Put on hold' : 'Reactivate'}
                                         onClick={() => setStatusOf(r, r.status === 'active' ? 'suspended' : 'active')} />
                                <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => setCancel(r)} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                  {!rows.length ? (
                    <Empty icon="seat" title="No assignments match"
                           action={<Btn kind="soft" icon="people" onClick={() => setBulk(true)}>Bulk assign students</Btn>} />
                  ) : null}
                  <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="students"
                         onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
                </>
              ) : (
                <div style={{ padding: 4 }}>
                  {(d.groups || []).length ? (d.groups || []).map((g) => (
                    <details key={g.id || g.label} open style={{ borderBottom: '1px solid var(--tr-line-2)' }}>
                      <summary style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', cursor: 'pointer', listStyle: 'none' }}>
                        <span className="tr-rbadge" style={{ background: g.color || '#64748b' }}>{String(g.label).slice(0, 2).toUpperCase()}</span>
                        <Cell2 top={g.label} sub={g.sub} />
                        <span style={{ marginLeft: 'auto' }}><Badge tone="indigo">{plural(g.count, 'student')}</Badge></span>
                        <Ico name="chevronDown" size={15} />
                      </summary>
                      <div style={{ padding: '0 14px 12px 50px' }}>
                        <TableWrap>
                          <table className="tr-table">
                            <thead><tr><th>Student</th><th>Class</th><th>Stop</th><th>Pickup</th><th>Drop</th><th>Status</th></tr></thead>
                            <tbody>
                              {g.students.map((r) => (
                                <tr key={r._id}>
                                  <td><Who name={r.student.name} src={r.student.photo} id={r.student._id} sub={r.student.admissionNumber} size="sm" /></td>
                                  <td>{r.student.classLabel || '—'}</td>
                                  <td>{r.pickupStop?.name || '—'}</td>
                                  <td className="tr-num">{r.pickupTime ? fmtTime(r.pickupTime) : '—'}</td>
                                  <td className="tr-num">{r.dropTime ? fmtTime(r.dropTime) : '—'}</td>
                                  <td><StatusBadge value={r.status} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </TableWrap>
                        {g.count > g.students.length ? (
                          <div style={{ fontSize: '.78rem', color: 'var(--tr-muted)', padding: '8px 2px' }}>
                            Showing {g.students.length} of {g.count} — open the Student Assignments view and filter to see them all.
                          </div>
                        ) : null}
                      </div>
                    </details>
                  )) : <Empty icon="seat" title="Nothing to group yet" />}
                </div>
              )}
            </CardBody>
          </Card>
          <div className="tr-grid tr-grid--3">
          <Card>
            <CardHead title="Recent Assignments" />
            <CardBody flush>
              {d.recent?.length ? (
                <Rows>
                  {d.recent.map((r, i) => (
                    <Row key={i} icon={r.tone === 'bad' ? 'x' : 'check'} iconTone={r.tone === 'bad' ? 'red' : r.tone === 'warn' ? 'amber' : 'green'}
                         title={r.text} sub={r.route ? `${r.route.tag} — ${r.route.name}` : ''} endSub={ago(r.at)} />
                  ))}
                </Rows>
              ) : <Empty icon="clock" sm title="Nothing assigned yet" />}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Upcoming Changes" />
            <CardBody flush>
              {d.upcomingChanges?.length ? (
                <Rows>
                  {d.upcomingChanges.map((c, i) => (
                    <Row key={i} icon={c.type === 'route_maintenance' ? 'wrench' : 'swap'}
                         iconTone={c.tone === 'warn' ? 'amber' : 'blue'}
                         title={c.text} sub={c.detail || words(c.status)} endSub={fmtDate(c.at)} />
                  ))}
                </Rows>
              ) : <Empty icon="calendar" sm title="No changes are queued" />}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Unassigned Students"
                      right={<Badge tone="amber">{count(d.unassignedTotal)}</Badge>} />
            <CardBody flush>
              {d.unassignedStudents?.length ? (
                <Rows>
                  {d.unassignedStudents.slice(0, 6).map((s) => (
                    <Row key={s._id} avatar={<Avatar name={s.name} src={s.photo} id={s._id} size="sm" />}
                         title={s.name} sub={s.classLabel || s.admissionNumber || ''} endSub="No route assigned" />
                  ))}
                </Rows>
              ) : <Empty icon="check" sm title="Everyone has transport" />}
              {d.unassignedStudents?.length ? (
                <div style={{ padding: 12 }}>
                  <Btn kind="soft" block icon="plus" onClick={() => setBulk(true)}>Assign them</Btn>
                </div>
              ) : null}
            </CardBody>
          </Card>
          </div>
        </div>

        <div className="tr-rail">
          <Panel title="Quick Actions">
            <QuickActions items={[
              { icon: 'people', label: 'Bulk Assign Students', onClick: () => setBulk(true) },
              { icon: 'fileSheet', label: 'Import from Excel', onClick: () => setImp(true) },
              { icon: 'repeat', label: 'Reassign Route', onClick: () => setForm({}) },
              { icon: 'send', label: 'Send Notification', onClick: () => setNotify(true) },
            ]} />
          </Panel>

          <Panel title="Assignment Summary">
            {slices.length ? (
              <DonutRow>
                <div className="tr-donutwrap__chart">
                  <Donut data={slices} total={t.assigned} sub="Students" size={150} thickness={23} />
                </div>
                <DonutLegend data={slices} />
              </DonutRow>
            ) : <Empty icon="chart" sm title="Nobody is assigned yet" />}
          </Panel>
        </div>
      </div>


      {form ? <AssignmentForm open onClose={() => setForm(null)} row={form._id ? form : null}
                              onSaved={() => { setForm(null); reload(); }} /> : null}
      <BulkAssignModal open={bulk} onClose={() => setBulk(false)} unassigned={d.unassignedStudents || []}
                       onSaved={() => { setBulk(false); reload(); }} />
      <ImportModal open={imp} kind="assignments" onClose={() => setImp(false)} onSaved={() => { setImp(false); reload(); }} />
      <NotifyModal open={notify} onClose={() => setNotify(false)} routes={d.filters?.routes || []} onSaved={() => setNotify(false)} />
      <Confirm open={!!cancel} onClose={() => setCancel(null)} onConfirm={() => setStatusOf(cancel, 'cancelled')} tone="danger"
               title="Remove this assignment?" confirmLabel="Remove"
               message={`${cancel?.student?.name || 'This student'} will lose their seat and the family is told. Their history is kept.`} />
    </div>
  );
}
