/**
 * Admin → Timetable → Rooms & Labs.
 *
 * Where lessons physically happen. The generator allocates these and refuses to
 * put two classes in one room at one time, so what is recorded here decides
 * what it can build: a school with no labs cannot have its practicals placed.
 *
 * A room is never really deleted while a timetable still names it — it is
 * retired instead, so last term's schedule keeps its room labels.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { Button, Modal, Confirm } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  TtHead, Card, Body, Filters, Pick, Field, Search, Seg, Stats, Stat, Panel, KV,
  Chip, Note, Loading, Pager, QuickActions, CheckRow, plural, timeRange, toneFor,
} from './ttUI';
import { ROOM_TYPES, DAYS, DAY_SHORT } from './shared';

const unwrap = (res) => res?.data ?? res;
const PAGE = 10;
const MAX_PERIODS = 10;

const TYPE_ICON = {
  'Classroom': 'school', 'Science Lab': 'flask', 'Computer Lab': 'grid',
  'Physics Lab': 'flask', 'Chemistry Lab': 'flask', 'Biology Lab': 'flask',
  'Library': 'book', 'Auditorium': 'megaphone', 'Activity Room': 'sparkle',
  'Sports': 'trophy', 'Other': 'mapPin',
};
const typeTone = (t) => (t === 'Classroom' ? 'green' : /lab/i.test(t || '') ? 'violet' : 'slate');

const blank = {
  roomName: '', roomNumber: '', roomType: 'Classroom', capacity: 40,
  building: '', homeSection: '', subjects: [], unavailable: [], notes: '', isActive: true,
};

export default function TimetableRooms() {
  const [data, setData]     = useState(null);
  const [meta, setMeta]     = useState(null);
  const [loading, setLoad]  = useState(true);
  const [type, setType]     = useState('');
  const [status, setStatus] = useState('');
  const [building, setBuilding] = useState('');
  const [q, setQ]           = useState('');
  const [page, setPage]     = useState(1);
  const [pickedId, setPicked] = useState('');
  const [tab, setTab]       = useState('details');
  const [schedule, setSchedule] = useState(null);
  const [form, setForm]     = useState(null);        // { editId, ...room }
  const [saving, setSaving] = useState(false);
  const [del, setDel]       = useState(null);
  const [importing, setImp] = useState(null);

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const [rRes, mRes] = await Promise.all([
        api.getRoomsOverview({ ...(type ? { type } : {}), ...(building ? { building } : {}), ...(status ? { status } : {}) }),
        meta ? null : api.getMeta(),
      ]);
      setData(unwrap(rRes));
      if (mRes) setMeta(unwrap(mRes));
      setPage(1);
    } catch (e) { toast.error(e.message); }
    finally { setLoad(false); }
  }, [type, building, status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [type, building, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const rooms = data?.rooms || [];
  const s = data?.summary || {};

  const filtered = useMemo(() => {
    if (!q) return rooms;
    const needle = q.toLowerCase();
    return rooms.filter((r) => [r.roomName, r.roomNumber, r.building, r.roomType, r.homeLabel]
      .filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [rooms, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);
  const picked = rooms.find((r) => String(r._id) === String(pickedId)) || null;

  useEffect(() => {
    if (!picked && shown.length) setPicked(String(shown[0]._id));
  }, [shown, picked]);

  // The room's own week is only worth fetching when somebody asks for it.
  useEffect(() => {
    if (tab !== 'timetable' || !picked) return undefined;
    let alive = true;
    setSchedule({ loading: true });
    api.getRoomSchedule(picked._id)
      .then((res) => { if (alive) setSchedule(unwrap(res)); })
      .catch(() => { if (alive) setSchedule({ entries: [], days: [] }); });
    return () => { alive = false; };
  }, [tab, picked]);

  const allSections = useMemo(() => (meta?.classes || [])
    .flatMap((c) => (c.sections || []).map((x) => ({ ...x, className: c.className }))), [meta]);

  const openForm = (room) => setForm(room
    ? {
      ...blank, ...room, editId: room._id,
      homeSection: room.homeSection?._id || room.homeSection || '',
      subjects: (room.subjects || []).map((x) => x._id || x),
      unavailable: room.unavailable || [],
    }
    : { ...blank, editId: null });

  const save = async () => {
    if (!form.roomName.trim()) return toast.error('A room needs a name');
    setSaving(true);
    try {
      const payload = {
        roomName: form.roomName, roomNumber: form.roomNumber, roomType: form.roomType,
        capacity: Number(form.capacity) || 0, building: form.building,
        homeSection: form.homeSection || null, subjects: form.subjects,
        unavailable: form.unavailable, notes: form.notes, isActive: form.isActive,
      };
      if (form.editId) await api.updateRoom(form.editId, payload);
      else await api.createRoom(payload);
      toast.success(form.editId ? 'Room updated' : 'Room added');
      setForm(null);
      load();
    } catch (e) { toast.error(e?.data?.message || e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try {
      const d = unwrap(await api.deleteRoom(del._id));
      toast.success(d.retired ? d.message : 'Room deleted');
      setDel(null);
      load();
    } catch (e) { toast.error(e.message); setDel(null); }
  };

  const duplicate = () => {
    openForm({ ...picked, _id: null, roomName: `${picked.roomName} (copy)`, roomNumber: '' });
    setForm((f) => ({ ...f, editId: null }));
  };

  return (
    <div className="page tt-page">
      <TtHead icon="building" title="Rooms &amp; Labs"
        subtitle="Manage rooms, labs and other teaching spaces. Set capacity, room type and availability to prevent double-booking.">
        <Button variant="secondary" onClick={() => setImp({ text: '', rows: [], result: null })}>
          <Icon name="upload" size={16} /> Import Rooms
        </Button>
        <Button onClick={() => openForm(null)}>
          <Icon name="plus" size={16} /> Add Room
        </Button>
      </TtHead>

      <Stats cols={5}>
        <Stat icon="building" tone="indigo" value={s.total ?? '—'} label="Total Rooms" />
        <Stat icon="school" tone="green" value={s.classrooms ?? '—'} label="Classrooms" />
        <Stat icon="flask" tone="violet" value={s.labs ?? '—'} label="Special Labs" />
        <Stat icon="mapPin" tone="amber" value={s.other ?? '—'} label="Other Spaces" />
        <Stat icon="checkCircle" tone="teal" value={s.active ?? '—'} label="Available"
          cap={s.inactive ? `${s.inactive} inactive` : 'All in service'} />
      </Stats>

      <div className="tt-split tt-split--wide">
        <Card flush>
          <Filters>
            <Pick label="Room type" value={type} onChange={setType} allLabel="All types">
              {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Pick>
            <Pick label="Status" value={status} onChange={setStatus} allLabel="All statuses">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Pick>
            <Pick label="Building / Block" value={building} onChange={setBuilding} allLabel="All blocks">
              {(data?.buildings || []).map((b) => <option key={b} value={b}>{b}</option>)}
            </Pick>
            <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search rooms…" />
          </Filters>

          {loading ? <Loading label="Loading rooms…" /> : (
            <>
              <div className="tt-tablewrap">
                <table className="tt-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }} />
                      <th>Room name</th><th>Type</th><th>Capacity</th><th>Home class</th>
                      <th>Blocked slots</th><th>Status</th><th style={{ width: 110 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const on = String(r._id) === String(pickedId);
                      return (
                        <tr key={r._id} className={`is-pick${on ? ' is-on' : ''}`} onClick={() => setPicked(String(r._id))}>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={on} onChange={() => setPicked(String(r._id))}
                              style={{ accentColor: 'var(--primary)' }} aria-label={`Select ${r.roomName}`} />
                          </td>
                          <td>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span className="tt-stat__icon" style={{
                                width: 32, height: 32, borderRadius: 9,
                                background: '#eef2ff', color: 'var(--primary)',
                              }}>
                                <Icon name={TYPE_ICON[r.roomType] || 'mapPin'} size={16} />
                              </span>
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: 'block', fontWeight: 600 }}>{r.roomName}</span>
                                <span style={{ display: 'block', fontSize: '.74rem', color: 'var(--text-muted)' }}>
                                  {[r.roomNumber, r.building].filter(Boolean).join(' · ') || 'No block recorded'}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td><Chip tone={typeTone(r.roomType)}>{r.roomType}</Chip></td>
                          <td className="tt-num">{r.capacity || '—'}</td>
                          <td className="tt-nowrap">
                            {r.homeLabel || <span className="tt-table__muted">—</span>}
                          </td>
                          <td>
                            {r.blockedCount
                              ? <Chip tone="amber">{plural(r.blockedCount, 'slot')}</Chip>
                              : <span className="tt-table__muted">None</span>}
                          </td>
                          <td>
                            <Chip tone={r.isActive === false ? 'red' : 'green'} dot>
                              {r.isActive === false ? 'Inactive' : 'Active'}
                            </Chip>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <Button size="sm" variant="secondary" onClick={() => openForm(r)} title="Edit this room">
                                <Icon name="pencil" size={14} />
                              </Button>
                              <Button size="sm" variant="secondary" title="See its week"
                                onClick={() => { setPicked(String(r._id)); setTab('timetable'); }}>
                                <Icon name="calendar" size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filtered.length && (
                      <tr><td colSpan={8}>
                        <div className="tt-table__empty">
                          <strong>{rooms.length ? 'No room matches that' : 'No rooms yet'}</strong>
                          <span>
                            {rooms.length
                              ? 'Clear the filters or search for something else.'
                              : 'Add your labs first — practicals can only be allocated to rooms that exist here.'}
                          </span>
                        </div>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="tt-card__foot">
                <span className="tt-count">
                  {filtered.length
                    ? `Showing ${(page - 1) * PAGE + 1} to ${Math.min(page * PAGE, filtered.length)} of ${plural(filtered.length, 'room')}`
                    : 'Nothing to show'}
                </span>
                <Pager page={page} pages={pages} onPage={setPage} />
              </div>
            </>
          )}
        </Card>

        <div className="tt-rail">
          {!picked ? (
            <Panel icon="building" title="No room selected">
              <Note tone="quiet">Pick a room to see what it is and when it is free.</Note>
            </Panel>
          ) : (
            <Panel icon={TYPE_ICON[picked.roomType] || 'mapPin'} title={picked.roomName}
              right={<Chip tone={picked.isActive === false ? 'red' : 'green'} dot>
                {picked.isActive === false ? 'Inactive' : 'Active'}
              </Chip>}>
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: -6 }}>
                {[picked.roomNumber, picked.building].filter(Boolean).join(' · ') || 'No block recorded'}
              </span>

              <Seg quiet value={tab} onChange={setTab} options={[
                ['details', 'Details'], ['availability', 'Availability'], ['timetable', 'Timetable'],
              ]} />

              {tab === 'details' && (
                <>
                  <KV icon="layers" k="Type" v={picked.roomType} />
                  <KV icon="users" k="Capacity" v={picked.capacity || '—'} />
                  <KV icon="school" k="Home Class" v={picked.homeLabel || '—'} />
                  <KV icon="building" k="Building / Block" v={picked.building || '—'} />
                  <KV icon="calendarDays" k="Periods used a week" v={picked.periodsUsed || 0} />
                  {(picked.subjects || []).length > 0 && (
                    <KV icon="book" k="Only for"
                      v={(picked.subjects || []).map((x) => x.subjectName || x).join(', ')} />
                  )}
                  {picked.notes && (
                    <div style={{
                      background: 'var(--bg)', borderRadius: 10, padding: '10px 12px',
                      fontSize: '.83rem', lineHeight: 1.5,
                    }}>{picked.notes}</div>
                  )}
                  <Button variant="secondary" onClick={() => openForm(picked)}>
                    <Icon name="pencil" size={15} /> Edit Room
                  </Button>
                </>
              )}

              {tab === 'availability' && (
                <>
                  <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                    Blocked slots — maintenance, external bookings, anything that keeps this room
                    out of the timetable.
                  </span>
                  {!(picked.unavailable || []).length ? (
                    <Note tone="good">Nothing blocks this room. It is free all week.</Note>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(picked.unavailable || []).map((u, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem' }}>
                          <Chip tone="red">{DAY_SHORT[u.dayOfWeek] || u.dayOfWeek} P{u.periodNumber}</Chip>
                          <span className="tt-table__muted">{u.reason || 'No reason given'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="secondary" onClick={() => openForm(picked)}>
                    <Icon name="clock" size={15} /> Set Unavailable Slots
                  </Button>
                </>
              )}

              {tab === 'timetable' && (
                schedule?.loading ? <Loading label="Reading this room’s week…" /> : !schedule?.entries?.length ? (
                  <Note tone="quiet">
                    Nothing is timetabled in this room. Either nothing needs it, or no subject is
                    set to require this room type.
                  </Note>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
                    {(schedule.days || DAYS).map((d) => {
                      const rows = schedule.entries.filter((e) => e.dayOfWeek === d);
                      if (!rows.length) return null;
                      return (
                        <div key={d}>
                          <strong style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{d}</strong>
                          {rows.map((e, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
                              <span className="tt-period">{e.periodNumber}</span>
                              <span style={{ flex: 1, minWidth: 0, fontSize: '.83rem' }}>
                                {e.section} · {e.subject}
                              </span>
                              <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{e.teacher}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </Panel>
          )}

          {picked && (
            <Panel icon="sparkle" title="Quick Actions">
              <QuickActions items={[
                { icon: 'clock', tone: 'indigo', title: 'Set Unavailable Slots',
                  hint: 'Block this room for maintenance', onClick: () => openForm(picked) },
                { icon: 'chart', tone: 'green', title: 'View Usage Report',
                  hint: `${picked.utilisation || 0}% of the week`, onClick: () => { window.location.href = '/admin/timetable/reports?tab=rooms'; } },
                { icon: 'copy', tone: 'violet', title: 'Duplicate Room',
                  hint: 'Start a new room from this one', onClick: duplicate },
                { icon: 'trash', tone: 'red', title: 'Delete Room',
                  hint: 'Retired if a timetable uses it', onClick: () => setDel(picked) },
              ]} />
            </Panel>
          )}
        </div>
      </div>

      {form && (
        <RoomForm form={form} setForm={setForm} sections={allSections} subjects={meta?.subjects || []}
          saving={saving} onSave={save} onClose={() => setForm(null)} />
      )}

      {importing && (
        <ImportRooms state={importing} setState={setImp} onDone={() => { setImp(null); load(); }} />
      )}

      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete this room"
        message={`Delete “${del?.roomName}”? If an existing timetable uses it, it is deactivated instead so old schedules keep their labels.`}
        onConfirm={remove} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Add / edit a room
══════════════════════════════════════════════════════════════════════════ */

function RoomForm({ form, setForm, sections, subjects, saving, onSave, onClose }) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const blockedAt = (day, period) =>
    form.unavailable.some((u) => u.dayOfWeek === day && u.periodNumber === period);
  const toggleSlot = (day, period) => setForm((f) => ({
    ...f,
    unavailable: blockedAt(day, period)
      ? f.unavailable.filter((u) => !(u.dayOfWeek === day && u.periodNumber === period))
      : [...f.unavailable, { dayOfWeek: day, periodNumber: period, reason: '' }],
  }));

  return (
    <Modal open onClose={onClose} maxWidth={720} title={form.editId ? 'Edit room' : 'Add a room'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} loading={saving}>{form.editId ? 'Save changes' : 'Add room'}</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field label="Room name" required>
            <input className="form-control" value={form.roomName} placeholder="Computer Lab"
              onChange={(e) => set('roomName', e.target.value)} />
          </Field>
          <Field label="Room number">
            <input className="form-control" value={form.roomNumber} placeholder="L-101"
              onChange={(e) => set('roomNumber', e.target.value)} />
          </Field>
          <Field label="Room type">
            <select className="form-control" value={form.roomType} onChange={(e) => set('roomType', e.target.value)}>
              {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Capacity" hint="Classes larger than this are never placed here">
            <input type="number" min="0" className="form-control" value={form.capacity}
              onChange={(e) => set('capacity', e.target.value)} />
          </Field>
          <Field label="Building / Block">
            <input className="form-control" value={form.building} placeholder="Main Block"
              onChange={(e) => set('building', e.target.value)} />
          </Field>
          <Field label="Home class" hint="A section that always sits here">
            <select className="form-control" value={form.homeSection} onChange={(e) => set('homeSection', e.target.value)}>
              <option value="">Not a dedicated classroom</option>
              {sections.map((x) => (
                <option key={x._id} value={x._id}>{x.className} · {x.sectionName}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Only for these subjects (optional)"
          hint="Leave everything unticked to allow any subject that suits the room type.">
          <div style={{
            display: 'flex', gap: 12, flexWrap: 'wrap', padding: 10, maxHeight: 130, overflowY: 'auto',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          }}>
            {subjects.map((x) => (
              <CheckRow key={x._id} checked={form.subjects.includes(x._id)}
                onChange={(v) => set('subjects', v
                  ? [...form.subjects, x._id]
                  : form.subjects.filter((id) => id !== x._id))}>
                {x.subjectName}
              </CheckRow>
            ))}
            {!subjects.length && <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>No subjects yet.</span>}
          </div>
        </Field>

        <Field label="Blocked slots" hint="Click a slot to keep this room out of the timetable then.">
          <div style={{ overflowX: 'auto' }}>
            <table className="tt-slots">
              <thead>
                <tr>
                  <th />
                  {Array.from({ length: MAX_PERIODS }, (_, i) => <th key={i}>P{i + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((d) => (
                  <tr key={d}>
                    <td>{DAY_SHORT[d]}</td>
                    {Array.from({ length: MAX_PERIODS }, (_, i) => {
                      const p = i + 1;
                      const off = blockedAt(d, p);
                      return (
                        <td key={p}>
                          <button type="button" onClick={() => toggleSlot(d, p)}
                            className={`tt-slot tt-slot--${off ? 'blocked' : 'none'}`}
                            title={`${d} period ${p}${off ? ' — blocked' : ''}`}>
                            {off ? '✕' : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Field>

        <Field label="Notes">
          <input className="form-control" value={form.notes} onChange={(e) => set('notes', e.target.value)}
            placeholder="e.g. computers with internet access for practical classes." />
        </Field>

        <CheckRow checked={form.isActive} onChange={(v) => set('isActive', v)}>
          Active — the generator may use this room
        </CheckRow>
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Import several rooms at once
══════════════════════════════════════════════════════════════════════════ */

/** name, number, type, capacity, building — the order a school's list is in. */
function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  // A header row is optional; it is recognised, not required.
  const first = lines[0].toLowerCase();
  const body = /name/.test(first) && /type|capacity|number/.test(first) ? lines.slice(1) : lines;
  return body.map((line) => {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    return {
      roomName: cells[0] || '',
      roomNumber: cells[1] || '',
      roomType: ROOM_TYPES.find((t) => t.toLowerCase() === String(cells[2] || '').toLowerCase()) || 'Classroom',
      capacity: Number(cells[3]) || 0,
      building: cells[4] || '',
    };
  }).filter((r) => r.roomName);
}

function ImportRooms({ state, setState, onDone }) {
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => parseCsv(state.text), [state.text]);

  const run = async () => {
    if (!rows.length) return toast.error('Nothing to import');
    setBusy(true);
    try {
      const d = unwrap(await api.importRooms(rows));
      setState((s) => ({ ...s, result: d }));
      toast.success(`${plural(d.created, 'room')} added`);
      if (!d.skipped.length) onDone();
    } catch (e) { toast.error(e?.data?.message || e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => setState(null)} maxWidth={620} title="Import rooms"
      footer={<>
        <Button variant="secondary" onClick={() => setState(null)}>
          {state.result ? 'Done' : 'Cancel'}
        </Button>
        <Button onClick={run} loading={busy} disabled={!rows.length}>
          Import {plural(rows.length, 'room')}
        </Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Note tone="info">
          One room per line: <strong>name, number, type, capacity, block</strong>. A header row is
          fine. Anything already here is skipped rather than duplicated.
        </Note>
        <Field label="Paste your list">
          <textarea className="form-control" rows={7} value={state.text}
            placeholder={'Computer Lab, L-101, Computer Lab, 40, Main Block\nMaths Room 1, R-201, Classroom, 30, East Wing'}
            onChange={(e) => setState((s) => ({ ...s, text: e.target.value, result: null }))} />
        </Field>

        {rows.length > 0 && !state.result && (
          <div className="tt-tablewrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
            <table className="tt-table">
              <thead><tr><th>Name</th><th>Number</th><th>Type</th><th>Capacity</th><th>Block</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.roomName}</td><td>{r.roomNumber || '—'}</td>
                    <td><Chip tone={typeTone(r.roomType)}>{r.roomType}</Chip></td>
                    <td className="tt-num">{r.capacity || '—'}</td><td>{r.building || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {state.result && (
          <>
            <Note tone="good">{plural(state.result.created, 'room')} added.</Note>
            {state.result.skipped?.length > 0 && (
              <>
                <Note tone="warn">{plural(state.result.skipped.length, 'row')} skipped.</Note>
                <div className="tt-tablewrap" style={{ maxHeight: 180, overflowY: 'auto' }}>
                  <table className="tt-table">
                    <thead><tr><th>Row</th><th>Name</th><th>Why</th></tr></thead>
                    <tbody>
                      {state.result.skipped.map((x, i) => (
                        <tr key={i}><td className="tt-num">{x.row}</td><td>{x.name || '—'}</td><td>{x.reason}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
