/**
 * Transport → Drivers / Conductors / Crew Members.
 *
 * One screen, three roles. `role` decides the heading, the tiles, which columns
 * matter (a licence is a driver's business, not a helper's) and what the assign
 * button offers, so each role gets a screen about that role rather than a
 * shared list with a filter on it.
 *
 * Crew are employees: the identity on every row comes from their Teacher /
 * Employee record, and this screen only manages the transport side — the role,
 * the licence and medical, routes, leave, and whether their device is sharing a
 * position.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, IconBtn, Select, Search,
  Filters, FilterEnd, TableWrap, Cell2, Who, Avatar, Badge, StatusBadge, Chip, Pager, Facts, Fact,
  Rows, Row, QuickActions, Loading, Empty, Note, Confirm, Check, Toggle, DateChip, count, fmtDate,
  fmtTime, fmtDateTime, ago, words, useBoard, useDebounced, toCsv, saveFile, Ico,
} from './trUI';
import TrMap from './trMap';
import { StaffForm, CrewAssignForm, LeaveModal, NotifyModal } from './trForms';

const ROLES = {
  driver: {
    label: 'Drivers', one: 'Driver', icon: 'driver', tone: 'blue',
    subtitle: 'The people who drive your buses — licences, routes, duty status and live position.',
    licence: true,
  },
  conductor: {
    label: 'Conductors', one: 'Conductor', icon: 'people', tone: 'purple',
    subtitle: 'Conductors who ride with the bus, take the register and account for every child.',
    licence: false,
  },
  helper: {
    label: 'Crew Members', one: 'Crew Member', icon: 'people', tone: 'amber',
    subtitle: 'Helpers and attendants who support the driver and see children on and off safely.',
    licence: false,
  },
};
const STATUSES = [
  { value: 'active', label: 'Active' }, { value: 'on_leave', label: 'On Leave' },
  { value: 'document_expiring', label: 'Document Expiring' }, { value: 'inactive', label: 'Inactive' },
];

export default function TransportCrew({ role = 'driver' }) {
  const meta = ROLES[role] || ROLES.driver;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [route, setRoute] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const [picked, setPicked] = useState(null);
  const [assign, setAssign] = useState(false);
  const [edit, setEdit] = useState(null);
  const [leave, setLeave] = useState(null);
  const [notify, setNotify] = useState(false);
  const [del, setDel] = useState(null);
  const [unlink, setUnlink] = useState(null);
  const [trail, setTrail] = useState(null);
  const search = useDebounced(q);

  const { data, loading, error, reload } = useBoard(
    () => api.getStaffBoard({ role, search, status, route, page, limit }),
    [role, search, status, route, page, limit],
    { poll: 60 },   // positions move; the roster does not need to be reloaded by hand
  );
  const d = data || {};
  const rows = d.data || [];
  const t = d.tiles || {};
  const person = useMemo(() => rows.find((r) => String(r._id) === String(picked)) || rows[0], [rows, picked]);

  // The picked person's trail for today, fetched when the rail opens on them.
  useEffect(() => {
    if (!person?._id || !person.locationSharing) { setTrail(null); return undefined; }
    let alive = true;
    api.getStaffTrail(person._id).then((r) => { if (alive) setTrail((r?.data ?? r) || null); })
      .catch((e) => { if (alive) toast.error(e?.message || 'That trail could not be loaded'); });
    return () => { alive = false; };
  }, [person?._id, person?.locationSharing, data]);

  useEffect(() => { setPicked(null); setPage(1); }, [role]);

  const reset = () => { setQ(''); setStatus(''); setRoute(''); setPage(1); };
  const exportCsv = () => {
    saveFile(`transport-${role}s-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['name', 'Name'], ['employeeId', 'Employee ID'], ['designation', 'Designation'], ['phone', 'Phone'],
      ...(meta.licence ? [['licenseNumber', 'Licence No.'], ['licenseExpiry', 'Licence expiry', (r) => fmtDate(r.licenseExpiry)]] : []),
      ['routes', 'Routes', (r) => (r.routes || []).map((x) => x.name).join(' / ')],
      ['displayStatus', 'Status', (r) => words(r.displayStatus)],
      ['linked', 'Employee account', (r) => (r.linked ? 'Linked' : 'Standalone')],
      ['lastSeen', 'Last position', (r) => (r.location?.at ? fmtDateTime(r.location.at) : '')],
    ], rows));
    toast.success(`Exported the ${meta.label.toLowerCase()} on this page`);
  };
  const act = async (fn, okMsg) => {
    try { await fn(); toast.success(okMsg); reload(); }
    catch (e) { toast.error(e?.message || 'That did not work'); }
  };
  const toggleSharing = (s) => act(
    () => api.setLocationSharing(s._id, { on: !s.locationSharing }),
    !s.locationSharing ? `${s.name} is now sharing their location` : `Location sharing off for ${s.name}`,
  );

  if (loading && !data) return <div className="tr-page"><Loading /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title={`Could not load ${meta.label.toLowerCase()}`}>{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={new Date().getFullYear()} sub="Academic Year" icon="calendar" />
        <Btn kind="primary" icon="plus" onClick={() => setAssign(true)}>Assign {meta.one}</Btn>
      </TopBar>

      <TrHead icon={meta.icon} iconTone={meta.tone} title={meta.label} subtitle={meta.subtitle} />

      <Tiles>
        <Tile icon={meta.icon} tone={meta.tone} value={count(t.total)} label={`Total ${meta.label}`}
              legend={[
                { tone: 'green', value: t.active, label: 'Active' },
                { tone: 'amber', value: t.onLeave, label: 'On Leave' },
              ]} />
        <Tile icon="route" tone="teal" value={count(t.onRoute)} label="Assigned to a Route"
              sub={t.unassigned ? `${count(t.unassigned)} not on any route` : 'Everyone is rostered'} />
        <Tile icon="clock" tone="orange" value={count(t.onLeave)} label="On Leave"
              sub={t.onLeave ? 'Their routes need cover' : 'Everyone is on duty'} />
        <Tile icon="doc" tone="red" value={count(t.expiringDocuments)} label="Expiring Documents" sub="Within 30 days" />
        <Tile icon="pin" tone="green" value={`${count(t.liveNow)} / ${count(t.sharingLocation)}`}
              label="Sharing Location"
              sub={t.sharingLocation ? 'Reporting now / switched on' : 'Nobody is sharing a position'} />
      </Tiles>

      {t.unlinked ? (
        <div style={{ marginBottom: 14 }}>
          <Note tone="warn" title={`${count(t.unlinked)} record${t.unlinked === 1 ? '' : 's'} not linked to an employee account`}>
            Crew are staff: create them under Teachers/Employees, then assign the role here. A standalone record keeps
            its own copy of a name and phone number, which is how two versions end up disagreeing.
          </Note>
        </div>
      ) : null}

      <Filters>
        <Search value={q} onChange={(v) => { setQ(v); setPage(1); }}
                placeholder={`Search ${meta.label.toLowerCase()} by name, ID, phone${meta.licence ? ' or licence no.' : ''}…`} />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All Status" options={STATUSES} />
        <Select value={route} onChange={(v) => { setRoute(v); setPage(1); }} placeholder="All Routes" options={d.filters?.routes || []} />
        <Btn icon="filter" onClick={reset}>Reset</Btn>
        <FilterEnd><Btn icon="upload" onClick={exportCsv}>Export</Btn></FilterEnd>
      </Filters>

      <div className="tr-split tr-split--wide">
        {/* The list and the three summary cards share the left column: the
            detail aside is several times taller than a short crew list, and a
            full-width strip under the whole split left a page of white. */}
        <div className="tr-stack">
          <Card>
            <CardHead title={`${meta.label} (${count(d.total)})`} />
            <CardBody flush>
              <TableWrap>
                <table className="tr-table">
                  <thead>
                    <tr>
                      <th className="tr-table__idx">#</th>
                      <th>Name</th><th>Employee ID</th><th>Phone</th>
                      {meta.licence ? <th>Licence</th> : <th>Designation</th>}
                      <th>Assigned Route(s)</th><th>Location</th><th>Status</th>
                      <th className="tr-table__acts">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r._id} aria-selected={String(r._id) === String(person?._id)} className="tr-rowlink"
                          onClick={() => setPicked(r._id)}>
                        <td className="tr-table__idx">{(d.page - 1) * limit + i + 1}</td>
                        <td>
                          <Who name={r.name} src={r.photo} id={r._id}
                               sub={r.linked ? (r.designation || 'Employee') : 'Standalone record'} />
                        </td>
                        <td className="tr-num">{r.employeeId || '—'}</td>
                        <td className="tr-nowrap">{r.phone
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ico name="phone" size={13} />{r.phone}</span>
                          : '—'}</td>
                        <td>{meta.licence
                          ? <Cell2 top={r.licenseNumber || '—'} sub={r.licenseExpiry ? `Till ${fmtDate(r.licenseExpiry)}` : ''} />
                          : (r.designation || <span style={{ color: 'var(--tr-faint)' }}>—</span>)}</td>
                        <td>
                          {r.routes.length ? (
                            <div className="tr-chiprow">
                              {r.routes.slice(0, 2).map((x) => <Chip key={x._id} color={x.color}>{x.tag} - {x.zone || x.name}</Chip>)}
                              {r.routes.length > 2 ? <Chip tone="slate">+{r.routes.length - 2}</Chip> : null}
                            </div>
                          ) : <span style={{ color: 'var(--tr-faint)' }}>Unassigned</span>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {r.locationSharing ? (
                            r.location ? (
                              <Cell2 top={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <i className={`tr-dot tr-dot--${r.location.stale ? 'slate' : 'green'}`} />
                                {r.location.stale ? 'Last seen' : 'Live'}
                              </span>} sub={r.location.at ? ago(r.location.at) : 'No fix yet'} />
                            ) : <Badge tone="amber">Waiting for a fix</Badge>
                          ) : (
                            // A bare switch in a column of sentences reads as an
                            // unexplained control, so it is captioned.
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <Toggle checked={false} label="Turn on location sharing" onChange={() => toggleSharing(r)} />
                              <span style={{ fontSize: '.74rem', color: 'var(--tr-muted)' }}>Sharing off</span>
                            </span>
                          )}
                        </td>
                        <td className="tr-nowrap">
                          {/* Short in the table, where the row is already carrying
                              nine columns; the full phrase stays on the tiles and
                              in the rail. */}
                          <StatusBadge value={r.displayStatus}
                                       label={r.displayStatus === 'document_expiring' ? 'Docs Expiring' : undefined} />
                        </td>
                        <td className="tr-table__acts" onClick={(e) => e.stopPropagation()}>
                          <div>
                            <IconBtn icon="eye" label="View" onClick={() => setPicked(r._id)} />
                            <IconBtn icon="pencil" label="Edit" onClick={() => setEdit(r)} />
                            <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => setDel(r)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              {!rows.length ? (
                <Empty icon={meta.icon} title={`No ${meta.label.toLowerCase()} yet`}
                       action={<Btn kind="soft" icon="plus" onClick={() => setAssign(true)}>Assign a {meta.one.toLowerCase()}</Btn>}>
                  Create the person under Teachers/Employees first, then give them the role here.
                </Empty>
              ) : null}
              <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun={meta.label.toLowerCase()}
                     onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
            </CardBody>
          </Card>
          {/* Documents and actions belong beside the table, not stacked under a
              detail panel that is already fifteen hundred pixels tall — the rail
              ran a page and a quarter past the bottom of a four-row list. */}
          {person ? (
            <div className="tr-grid tr-grid--2">
            <Panel title="Document Status"
                   right={<span style={{ fontSize: '.76rem', color: 'var(--tr-muted)' }}>{person.expiringDocuments || 0} need attention</span>} flush>
              <Rows>
                {person.documents.map((doc) => (
                  <Row key={doc.docType} icon="doc"
                       iconTone={{ ok: 'green', verified: 'green', due: 'amber', expired: 'red', missing: 'slate' }[doc.state]}
                       title={doc.label}
                       sub={doc.expiry ? `Valid till ${fmtDate(doc.expiry)}` : doc.state === 'verified' ? 'Verified' : 'Not on file'}
                       badge={<span style={{ color: { ok: '#16a34a', verified: '#16a34a', due: '#d97706', expired: '#dc2626', missing: '#94a3b8' }[doc.state], display: 'inline-flex' }}>
                         <Ico name={doc.state === 'missing' ? 'alert' : doc.state === 'expired' ? 'closeCircle' : 'checkCircle'} size={17} />
                       </span>} />
                ))}
              </Rows>
            </Panel>

            <Panel title="Quick Actions">
              <QuickActions items={[
                person.displayStatus === 'on_leave'
                  ? { icon: 'checkCircle', label: 'Back on Duty', onClick: () => act(() => api.endStaffLeave(person._id), `${person.name} back on duty`) }
                  : { icon: 'calendar', label: 'Mark Leave', onClick: () => setLeave(person) },
                { icon: 'repeat', label: 'Assign Route', to: '/admin/transport/routes' },
                { icon: 'send', label: 'Send Message', onClick: () => setNotify(true) },
                { icon: 'chart', label: 'View Trips', to: '/admin/transport/trips' },
                person.linked
                  ? { icon: 'close', label: 'Unlink Employee', onClick: () => setUnlink(person) }
                  : { icon: 'userPlus', label: 'Link an Employee', onClick: () => setAssign(true) },
                { icon: 'mapPin', label: 'Live Map', to: '/admin/transport/live' },
              ]} />
            </Panel>
            </div>
          ) : null}
          <div className="tr-grid tr-grid--3">
          <Card>
            <CardHead title="Upcoming Leave"
                      right={<span style={{ fontSize: '.76rem', color: 'var(--tr-muted)' }}>{d.upcomingLeave?.length || 0} planned</span>} />
            <CardBody flush>
              {d.upcomingLeave?.length ? (
                <Rows>
                  {d.upcomingLeave.map((l, i) => (
                    <Row key={i} avatar={<Avatar name={l.staff} src={l.photo} id={l.staffId} size="sm" />}
                         title={l.staff} sub={`${l.role} · ${words(l.leaveType)}`}
                         end={fmtDate(l.fromDate)} endSub={`to ${fmtDate(l.toDate)}`} />
                  ))}
                </Rows>
              ) : <Empty icon="clock" sm title="Nobody is booked off">Mark leave from a crew member's panel.</Empty>}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Birthdays This Month" />
            <CardBody flush>
              {d.birthdays?.length ? (
                <Rows>
                  {d.birthdays.map((b) => (
                    <Row key={b._id} avatar={<Avatar name={b.name} src={b.photo} id={b._id} size="sm" />}
                         title={b.name} sub={b.role} end={fmtDate(b.date).slice(0, 6)} />
                  ))}
                </Rows>
              ) : <Empty icon="cake" sm title="No birthdays this month" />}
            </CardBody>
          </Card>

          <Card>
            <CardHead title="Recent Joinees" />
            <CardBody flush>
              {d.joinees?.length ? (
                <Rows>
                  {d.joinees.map((j) => (
                    <Row key={j._id} avatar={<Avatar name={j.name} src={j.photo} id={j._id} size="sm" />}
                         title={j.name} sub={j.role} end={fmtDate(j.date)} />
                  ))}
                </Rows>
              ) : <Empty icon="people" sm title="Nobody new this month" />}
            </CardBody>
          </Card>
          </div>
        </div>

        <div className="tr-rail">
          {person ? (
            <>
              <Panel title={`${meta.one} Details`}
                     right={<><IconBtn icon="download" label="Export" onClick={exportCsv} />
                              <IconBtn icon="pencil" label="Edit" onClick={() => setEdit(person)} /></>}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
                  <Avatar name={person.name} src={person.photo} id={person._id} size="xl" />
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: '1.02rem' }}>{person.name}</b>
                    <div className="tr-chiprow" style={{ marginTop: 6 }}>
                      <Badge tone={meta.tone}>{person.roleLabel}</Badge>
                      <StatusBadge value={person.displayStatus} />
                    </div>
                  </div>
                </div>

                {person.linked ? (
                  <Note tone="good" title="Employee account">
                    {[person.designation, person.department].filter(Boolean).join(' · ') || 'On the staff register'} —
                    name, phone and photo are kept on their employee record.
                  </Note>
                ) : (
                  <Note tone="warn" title="Standalone record">
                    Not linked to an employee account, so these details live only in Transport.
                  </Note>
                )}

                <div style={{ marginTop: 14 }}>
                  <Facts>
                    <Fact icon="idCard" k="Employee ID" v={person.employeeId} />
                    <Fact icon="phone" k="Phone" v={person.phone || '—'} />
                    {meta.licence ? <Fact icon="fileCheck" k="License No." v={person.licenseNumber || '—'} /> : null}
                    {meta.licence ? <Fact icon="calendar" k="Experience" v={person.experienceYears ? `${person.experienceYears} years` : '—'} /> : null}
                  </Facts>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div className="tr-fact__k" style={{ marginBottom: 6 }}>Assigned Routes</div>
                  {person.routes.length ? (
                    <div className="tr-chiprow">{person.routes.map((x) => <Chip key={x._id} color={x.color}>{x.tag} - {x.zone || x.name}</Chip>)}</div>
                  ) : <span style={{ fontSize: '.82rem', color: 'var(--tr-faint)' }}>Not on any route</span>}
                </div>

                <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                  <Fact icon="phone" k="Emergency Contact"
                        v={person.emergencyContact?.name
                          ? `${person.emergencyContact.name}${person.emergencyContact.relation ? ` (${person.emergencyContact.relation})` : ''}${person.emergencyContact.phone ? ` · ${person.emergencyContact.phone}` : ''}`
                          : '—'} />
                  <Fact icon="mapPin" k="Address" v={person.address || '—'} />
                </div>
              </Panel>

              <Panel title="Location"
                     right={<Toggle checked={person.locationSharing} label="Location sharing"
                                    onChange={() => toggleSharing(person)} />}>
                {person.locationSharing ? (
                  <>
                    <TrMap height={190} legend={false} routes={[]} school={d.school}
                           map={d.map} viewKey={person._id}
                           crew={person.location ? [{
                             _id: person._id, name: person.name, roleLabel: person.roleLabel,
                             staffType: person.staffType, latitude: person.location.latitude,
                             longitude: person.location.longitude, stale: person.location.stale,
                           }] : []}
                           trail={trail?.points || []}
                           emptyHint="Waiting for the first fix from their device. They need to be signed in with location permission granted." />
                    <div style={{ marginTop: 12 }}>
                      <Facts>
                        <Fact icon="clock" k="Last seen" v={person.location?.at ? ago(person.location.at) : 'No fix yet'} />
                        <Fact icon="gauge" k="Speed" v={person.location ? `${Math.round(person.location.speed || 0)} km/h` : '—'} />
                        <Fact icon="target" k="Accuracy" v={person.location?.accuracy ? `± ${Math.round(person.location.accuracy)} m` : '—'} />
                        <Fact icon="mapPin" k="Points today" v={count(trail?.points?.length)} />
                      </Facts>
                    </div>
                    {person.location?.stale ? (
                      <div style={{ marginTop: 12 }}>
                        <Note tone="warn" title="Not reporting right now">
                          The last fix arrived {ago(person.location.at)}. A phone that is off, asleep or out of signal
                          stops reporting — the position above is where they were then, not where they are.
                        </Note>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Note tone="info" title="Location sharing is off">
                    Nothing is collected. Turn it on and their position is reported from their own signed-in device
                    while they are on duty{person.linked ? '' : ' — this record needs an employee account first'}.
                  </Note>
                )}
              </Panel>

            </>
          ) : (
            <Panel title={`${meta.one} Details`}>
              <Empty icon={meta.icon} sm title="Pick someone">Their routes, documents, leave and position appear here.</Empty>
            </Panel>
          )}
        </div>
      </div>

      <CrewAssignForm open={assign} role={role} onClose={() => setAssign(false)}
                      onSaved={() => { setAssign(false); reload(); }} />
      {edit ? <StaffForm open onClose={() => setEdit(null)} row={edit} onSaved={() => { setEdit(null); reload(); }} /> : null}
      {leave ? <LeaveModal open onClose={() => setLeave(null)} staff={leave} onSaved={() => { setLeave(null); reload(); }} /> : null}
      <NotifyModal open={notify} onClose={() => setNotify(false)} routes={d.filters?.routes || []} onSaved={() => setNotify(false)} />
      <Confirm open={!!unlink} onClose={() => setUnlink(null)}
               onConfirm={() => { act(() => api.unlinkCrew(unlink._id), `${unlink.name} unlinked`); setUnlink(null); }}
               tone="danger" title="Unlink this employee account?" confirmLabel="Unlink"
               message={`${unlink?.name}'s details are copied down to this transport record and stop following their employee record. Location sharing is switched off.`} />
      <Confirm open={!!del} onClose={() => setDel(null)}
               onConfirm={() => { act(() => api.deleteStaff(del._id), `${del.name} removed`); setDel(null); }}
               tone="danger" title={`Remove this ${meta.one.toLowerCase()}?`} confirmLabel="Remove"
               message={`${del?.name} loses their transport role. Their employee account and trip history are kept.`} />
    </div>
  );
}
