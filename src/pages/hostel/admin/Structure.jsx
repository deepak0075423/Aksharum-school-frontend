/**
 * Hostel → Buildings & Floors (Sep 2026 redesign, to the user's mockup).
 *
 * Buildings down the left; the chosen building on the right with its floors,
 * and under them the rooms of whichever floor is picked. One call
 * (GET /hostel/admin/board/structure) answers the whole screen, so a
 * building's figures, its floors' and its rooms' always describe the same
 * moment.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { useNewFromLink } from '../shared';
import { PageHead, Mark, Glyph, words, pctOf } from './hsUI';
import {
  Btn, Kebab, Badge, TwoLine, FSearch, FSelect, DataTable, ListCard, EmptyRows, Ico, useBoardData,
} from './hsList';
import { RoomFormModal, RoomDrawer, roomTypeLabel } from './hsRoom';
import { FormModal, FormSection, Grid, Fld, StatusSelect, ChipSelect, ToggleRow, ReviewList, ConfirmDialog } from './hsForm';

const FLOOR_NAMES = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth'];
/** "Ground, First and Second Floor" — what "Create these floors now" will add. */
const floorPreview = (n) => {
  const names = Array.from({ length: Math.min(n, 4) }, (_, i) => FLOOR_NAMES[i] || `Floor ${i}`);
  if (n > 4) return `${names.slice(0, 3).join(', ')} … up to floor ${n - 1}`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} Floor` : `the ${names[0]} Floor`;
};

// Buildings and floors are one screen: a floor only makes sense inside a
// building, and a warden setting up a block does both in the same sitting.
const emptyBuilding = { name: '', code: '', hostel: '', floorCount: '1', expectedRooms: '', capacity: '', description: '', status: 'active', facilities: [], createFloors: true };
const emptyFloor    = { name: '', hostel: '', building: '', floorNumber: '', capacity: '', commonRooms: '', supervisor: '', facilities: [], status: 'active' };
const BUILDING_FACILITIES = ['lift', 'ramp', 'fire_exit', 'cctv', 'power_backup', 'water_cooler', 'common_room', 'study_hall', 'laundry', 'wifi'];
const FLOOR_FACILITIES = ['common_room', 'water_cooler', 'washroom_block', 'pantry', 'study_area', 'tv_room', 'fire_extinguisher', 'first_aid'];
const STATUSES = ['active', 'inactive', 'maintenance'];
const STATUS_TONE = { active: 'green', inactive: 'slate', maintenance: 'orange' };
/** A room here is simply in use or not — its occupancy is the Rooms screen's business. */
const roomStatus = (s) => (s === 'inactive' ? 'inactive' : s === 'maintenance' ? 'maintenance' : 'active');

const Status = ({ value, dot }) => <Badge tone={STATUS_TONE[value] || 'slate'} dot={dot} strong={!dot}>{words(value)}</Badge>;

export default function Structure() {
  const [state, setState] = useState({ search: '', hostel: '', building: '', floor: '' });
  const { data, loading, reload } = useBoardData((q) => api.getBoard('structure', q), state);
  const { data: meta, refetch: reloadMeta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const staff = meta?.staff || [];

  const [modal, setModal] = useState(null);        // 'building' | 'floor'
  const [form, setForm] = useState(emptyBuilding);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const [roomForm, setRoomForm] = useState(null);  // { room } | { floor }
  const [roomView, setRoomView] = useState(null);

  const buildings = data?.buildings || [];
  const sel = data?.selected || null;
  const floors = data?.floors || [];
  const rooms = data?.rooms || [];
  const floor = floors.find((f) => String(f._id) === String(data?.floor)) || null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const pick = (patch) => setState((s) => ({ ...s, ...patch }));
  const refresh = () => { reload(); reloadMeta?.(); };

  const openBuilding = (row) => {
    setModal('building');
    if (row) {
      setEditId(row._id);
      setForm({ ...emptyBuilding, ...row, hostel: row.hostelId || row.hostel?._id || row.hostel, facilities: row.facilities || [], createFloors: false,
        floorCount: String(row.floorCount ?? ''), expectedRooms: row.expectedRooms || '', capacity: row.capacity || '', description: row.description || '' });
    }
    else { setEditId(null); setForm({ ...emptyBuilding, hostel: state.hostel || sel?.hostelId || hostels[0]?._id || '' }); }
  };
  const openFloor = (row) => {
    setModal('floor');
    if (row) {
      setEditId(row._id);
      setForm({
        ...emptyFloor, ...row,
        building: sel?._id || '', hostel: sel?.hostelId || '',
        supervisor: row.supervisorId || '',
        facilities: row.facilities || [], capacity: row.capacity || '', commonRooms: row.commonRooms || '',
      });
    } else {
      const b = sel || buildings[0];
      const taken = new Set(floors.map((f) => Number(f.floorNumber)));
      let next = 0; while (taken.has(next)) next += 1;
      setEditId(null);
      setForm({ ...emptyFloor, building: b?._id || '', hostel: b?.hostelId || hostels[0]?._id || '', floorNumber: sel ? String(next) : '' });
    }
  };

  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(!!meta && !!data, (kind) => {
    if (kind !== 'floor') openBuilding();
    else if (data?.total) openFloor();
    else toast.error('Add a building first — a floor belongs to one');
  });

  const save = async () => {
    setSaving(true);
    try {
      if (modal === 'building') {
        const p = {
          name: form.name, code: form.code, hostel: form.hostel, description: form.description, status: form.status,
          floorCount: Number(form.floorCount) || 0, capacity: Number(form.capacity) || 0, expectedRooms: Number(form.expectedRooms) || 0,
          facilities: form.facilities, ...(editId ? {} : { createFloors: form.createFloors }),
        };
        const res = editId ? await api.updateBuilding(editId, p) : await api.createBuilding(p);
        const made = (res.data ?? res)?.floors?.length || 0;
        toast.success(editId ? 'Building updated' : made ? `Building added with ${made} floor${made === 1 ? '' : 's'}` : 'Building added');
        if (!editId) pick({ building: (res.data ?? res)?._id || '', floor: '' });
      } else {
        const p = {
          name: form.name, building: form.building, status: form.status,
          floorNumber: Number(form.floorNumber) || 0,
          capacity: Number(form.capacity) || 0, commonRooms: Number(form.commonRooms) || 0,
          supervisor: form.supervisor || null,
          facilities: form.facilities,
        };
        const res = editId ? await api.updateFloor(editId, p) : await api.createFloor(p);
        toast.success(editId ? 'Floor updated' : 'Floor added');
        if (!editId) pick({ building: form.building, floor: (res.data ?? res)?._id || '' });
      }
      setModal(null); refresh();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    try {
      if (del.kind === 'building') await api.deleteBuilding(del.row._id);
      else if (del.kind === 'floor') await api.deleteFloor(del.row._id);
      else await api.deleteRoom(del.row._id);
      toast.success('Deactivated');
      setDel(null); refresh();
    } catch (err) { toast.error(err.message); setDel(null); }
  };

  const floorColumns = [
    { key: 'floor', label: 'Floor', render: (r) => <TwoLine top={r.name} sub={`Floor ${r.floorNumber}`} strong /> },
    { key: 'code', label: 'Code', render: (r) => `F${r.floorNumber}` },
    { key: 'rooms', label: 'Rooms', render: (r) => r.rooms || 0 },
    { key: 'beds', label: 'Beds', render: (r) => r.beds || 0 },
    { key: 'occupied', label: 'Occupied', render: (r) => r.occupied || 0 },
    { key: 'available', label: 'Available', render: (r) => r.available || 0 },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
  ];
  const roomColumns = [
    { key: 'room', label: 'Room', render: (r) => <TwoLine top={r.roomNumber} sub={r.code} strong /> },
    { key: 'type', label: 'Type', render: (r) => <Badge tone="blue" strong>{roomTypeLabel(r.roomType)}</Badge> },
    { key: 'capacity', label: 'Capacity', render: (r) => r.beds ?? r.capacity ?? 0 },
    { key: 'occupied', label: 'Occupied', render: (r) => r.occupied || 0 },
    { key: 'available', label: 'Available', render: (r) => r.available || 0 },
    { key: 'status', label: 'Status', render: (r) => <Status value={roomStatus(r.status)} /> },
  ];

  const filtered = !!(state.search || state.hostel);

  return (
    <div className="hs-page">
      <PageHead title="Buildings & Floors" subtitle="Manage hostel buildings and their floors. View capacity, rooms and occupancy at a glance.">
        <Btn className="is-accent hs-btn--accent" icon="building" onClick={() => openBuilding()}>+ Add Building</Btn>
        <Btn kind="primary" icon="plus" onClick={() => openFloor()} disabled={!data?.total}>Add Floor</Btn>
      </PageHead>

      <div className="hs-duo">
        {/* ── Buildings ─────────────────────────────────────────────────── */}
        <section className="hs-panel hs-blist" aria-label="Buildings">
          <header className="hs-panel__head">
            <span className="hs-panel__ico"><Glyph name="office" size={30} /></span>
            <h2>Buildings ({buildings.length})</h2>
          </header>
          <div className="hs-blist__filters">
            <FSearch value={state.search} onChange={(v) => pick({ search: v })} placeholder="Search building name or code..." grow={2} />
            <FSelect value={state.hostel} onChange={(v) => pick({ hostel: v, building: '', floor: '' })} all="All hostels"
              options={hostels.map((h) => ({ value: h._id, label: h.name }))} grow={0} width="122px" />
          </div>
          <div className={`hs-blist__items${loading ? ' is-loading' : ''}`}>
            {buildings.map((b) => {
              const on = sel && String(b._id) === String(sel._id);
              return (
                <div key={b._id} className={`hs-bcard${on ? ' is-on' : ''}`}>
                  <button type="button" className="hs-bcard__hit" aria-pressed={on} aria-label={`${b.name}, ${b.hostelName}`}
                    onClick={() => pick({ building: b._id, floor: '' })} />
                  <div className="hs-bcard__top">
                    <Mark name="building" tone="orange" size={44} glyph={24} />
                    <TwoLine top={b.name} sub={b.code} strong />
                    <Status value={b.status} dot />
                    <Kebab kind="ghost" label={`Actions for ${b.name}`} items={[
                      { label: 'Edit building', icon: 'pencil', onClick: () => openBuilding(b) },
                      { label: 'Add floor', icon: 'plus', onClick: () => { pick({ building: b._id, floor: '' }); setModal('floor'); setEditId(null); setForm({ ...emptyFloor, building: b._id }); } },
                      '-',
                      { label: 'Deactivate', icon: 'trash', danger: true, onClick: () => setDel({ kind: 'building', row: b }) },
                    ]} />
                  </div>
                  <div className="hs-bcard__stats">
                    <span><b><Glyph name="stack" size={16} />{b.floors || 0}</b>Floors</span>
                    <span><b><Glyph name="bed" size={16} />{b.beds || 0}</b>Total Beds</span>
                    <span><b><Ico name="user" size={15} />{b.occupied || 0}</b>Occupied</span>
                    <span><b><i className="hs-dot hs-dot--green" />{b.available || 0}</b>Available</span>
                  </div>
                </div>
              );
            })}
            {!buildings.length && !loading ? (
              <EmptyRows icon="building" title={filtered ? 'No building matches' : 'No buildings yet'}
                action={filtered ? null : <Btn kind="primary" icon="plus" onClick={() => openBuilding()}>Add Building</Btn>}>
                {filtered ? 'Clear the search or pick another hostel.' : 'Add a building, then its floors and rooms.'}
              </EmptyRows>
            ) : null}
          </div>
        </section>

        {/* ── The chosen building ───────────────────────────────────────── */}
        <section className="hs-panel hs-bdetail" aria-label="Building details" aria-busy={loading || undefined}>
          {sel ? (
            <>
              <header className="hs-bdetail__head">
                <Mark name="building" tone="orange" size={58} glyph={32} />
                <div className="hs-bdetail__id">
                  <h2>{sel.name}</h2>
                  <span>{sel.code}</span>
                </div>
                <Status value={sel.status} dot />
                <div className="hs-bdetail__acts">
                  <Btn icon="pencil" size="sm" onClick={() => openBuilding(sel)}>Edit Building</Btn>
                  <Kebab label="Building actions" items={[
                    { label: 'Add floor', icon: 'plus', onClick: () => openFloor() },
                    '-',
                    { label: 'Deactivate building', icon: 'trash', danger: true, onClick: () => setDel({ kind: 'building', row: sel }) },
                  ]} />
                </div>
              </header>
              <dl className="hs-facts">
                <div><dt>Hostel</dt><dd>{sel.hostelName}</dd></div>
                <div><dt>Total Floors</dt><dd>{sel.floors || 0}</dd></div>
                <div><dt>Total Rooms</dt><dd>{sel.rooms || 0}</dd></div>
                <div><dt>Total Beds</dt><dd>{sel.beds || 0}</dd></div>
                <div><dt>Occupied Beds</dt><dd>{sel.occupied || 0} ({pctOf(sel.occupied, sel.beds)}%)</dd></div>
                <div><dt>Available Beds</dt><dd>{sel.available || 0} ({pctOf(sel.available, sel.beds)}%)</dd></div>
              </dl>

              <div className="hs-sechead">
                <span className="hs-sechead__ico"><Glyph name="stack" size={28} /></span>
                <h3>Floors ({floors.length})</h3>
                <Btn icon="plus" size="sm" onClick={() => openFloor()}>Add Floor</Btn>
              </div>
              <ListCard className="hs-lcard--flat">
                <DataTable
                  select={false} columns={floorColumns} rows={floors} pad={13} headPad={11}
                  onRowClick={(r) => pick({ floor: r._id })}
                  selected={new Set(floor ? [String(floor._id)] : [])}
                  actions={(r) => (
                    <>
                      <Btn size="sm" icon="eye" onClick={() => pick({ floor: r._id })}>View</Btn>
                      <Btn size="sm" icon="pencil" onClick={() => openFloor(r)}>Edit</Btn>
                      <Kebab label={`Actions for ${r.name}`} items={[
                        { label: 'Add room', icon: 'plus', onClick: () => setRoomForm({ floor: r._id }) },
                        '-',
                        { label: 'Deactivate', icon: 'trash', danger: true, onClick: () => setDel({ kind: 'floor', row: r }) },
                      ]} />
                    </>
                  )}
                  empty={(
                    <EmptyRows icon="stack" title="No floors yet" action={<Btn kind="primary" icon="plus" onClick={() => openFloor()}>Add Floor</Btn>}>
                      Add this building&rsquo;s floors, then the rooms on each.
                    </EmptyRows>
                  )}
                />
              </ListCard>

              {floor ? (
                <ListCard className="hs-lcard--rooms" head={(
                  <>
                    <span className="hs-sechead__ico"><Glyph name="bed" size={28} /></span>
                    <h3>Rooms in {floor.name} ({rooms.length})</h3>
                    <Btn icon="plus" size="sm" onClick={() => setRoomForm({ floor: floor._id })}>Add Room</Btn>
                  </>
                )}>
                  <DataTable
                    select={false} columns={roomColumns} rows={rooms} pad={13} headPad={11}
                    actions={(r) => (
                      <>
                        <Btn size="sm" icon="eye" onClick={() => setRoomView(r._id)}>View</Btn>
                        <Btn size="sm" icon="pencil" onClick={() => setRoomForm({ room: r._id })}>Edit</Btn>
                        <Kebab label={`Actions for ${r.roomNumber}`} items={[
                          { label: 'Deactivate', icon: 'trash', danger: true, onClick: () => setDel({ kind: 'room', row: { ...r, name: r.roomNumber } }) },
                        ]} />
                      </>
                    )}
                    empty={(
                      <EmptyRows icon="door" title="No rooms on this floor" action={<Btn kind="primary" icon="plus" onClick={() => setRoomForm({ floor: floor._id })}>Add Room</Btn>}>
                        A room lays out its own beds when you add it.
                      </EmptyRows>
                    )}
                  />
                </ListCard>
              ) : null}
            </>
          ) : (
            <div className="hs-bdetail__empty">
              {loading ? <p className="hs-muted">Loading…</p> : (
                <EmptyRows icon="building" title={data?.total ? 'Pick a building' : 'No buildings yet'}
                  action={data?.total ? null : <Btn kind="primary" icon="plus" onClick={() => openBuilding()}>Add Building</Btn>}>
                  {data?.total ? 'Nothing matches the search on the left.' : 'A hostel is made of buildings, a building of floors, a floor of rooms.'}
                </EmptyRows>
              )}
            </div>
          )}
        </section>
      </div>

      {/* ── Add / edit a building ────────────────────────────────────────── */}
      <FormModal open={modal === 'building'} onClose={() => setModal(null)} busy={saving} onSubmit={save}
        icon="oBuilding" title={editId ? 'Edit Building' : 'Add Building'}
        subtitle="Create a new building within a hostel with capacity and structural details."
        submitLabel={editId ? 'Save Changes' : 'Create Building'} submitIcon="check"
        steps={[
          { key: 'basic', title: 'Basic Details', sub: 'Name, code and hostel info', icon: 'user' },
          { key: 'structure', title: 'Structure', sub: 'Floors and capacity', icon: 'oDoor' },
          { key: 'facilities', title: 'Facilities', sub: 'Amenities and features', icon: 'oBuilding', optional: true },
          { key: 'review', title: 'Review', sub: 'Confirm and create', icon: 'fileDoc' },
        ]}>
        <FormSection step="basic" icon="oBuilding" title="Basic Details" sub="Provide the basic information for this building.">
          <Grid cols={2}>
            <Fld label="Hostel" required icon="oBed" hint={editId ? 'A building stays in the hostel it was built in' : ''}>
              <select value={form.hostel} disabled={!!editId} onChange={(e) => set('hostel', e.target.value)}>
                <option value="">Select hostel</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </Fld>
            <Fld label="Building Name" required icon="oBuilding">
              <input data-text="title" value={form.name} maxLength={60} placeholder="Enter building name (e.g. Block A)" onChange={(e) => set('name', e.target.value)} />
            </Fld>
            <Fld label="Building Code" icon="oTag" hint={editId ? 'Codes are unique within the school' : 'Leave blank to generate automatically'}>
              <input data-text="code" value={form.code} maxLength={20} placeholder="Auto-generate (e.g. BLD-001)" onChange={(e) => set('code', e.target.value.toUpperCase())} />
            </Fld>
            <StatusSelect value={form.status} onChange={(v) => set('status', v)} options={STATUSES}
              hint="Inactive buildings will not be available for allocations" />
          </Grid>
          <Fld label="Description" icon="fileDoc" count={[(form.description || '').length, 300]}>
            <textarea rows={2} maxLength={300} value={form.description || ''} placeholder="Enter a short description about this building (optional)"
              onChange={(e) => set('description', e.target.value)} />
          </Fld>
        </FormSection>
        <FormSection step="structure" icon="layers" title="Structure & Capacity" sub="Define the building structure and capacity limits.">
          <Grid cols={3}>
            <Fld label="Number of Floors" required icon="oBuilding">
              <input type="number" min={editId ? 0 : 1} max="60" value={form.floorCount} onChange={(e) => set('floorCount', e.target.value)} />
            </Fld>
            <Fld label="Total Rooms (Expected)" icon="oDoor" hint="Approximate total rooms in this building">
              <input type="number" min="0" max="2000" value={form.expectedRooms} placeholder="e.g. 20" onChange={(e) => set('expectedRooms', e.target.value)} />
            </Fld>
            <Fld label="Total Capacity (Beds)" icon="users" hint="Maximum number of students this building can accommodate">
              <input type="number" min="0" max="10000" value={form.capacity} placeholder="e.g. 60" onChange={(e) => set('capacity', e.target.value)} />
            </Fld>
          </Grid>
          {editId ? null : (
            <ToggleRow on={form.createFloors} onChange={(v) => set('createFloors', v)} label="Create these floors now"
              hint={Number(form.floorCount) > 0 ? `Adds ${floorPreview(Number(form.floorCount))} — rename or add rooms to them later` : 'Set the number of floors first'} />
          )}
        </FormSection>
        <FormSection step="facilities" icon="oTag" title="Facilities" sub="Amenities and features in this building (optional).">
          <Fld label="Facilities" optional hint="Pick from the list, or type your own and press Enter">
            <ChipSelect value={form.facilities || []} onChange={(v) => set('facilities', v)} options={BUILDING_FACILITIES} label="Facilities" icon="oTag" allowNew placeholder="Add a facility" />
          </Fld>
        </FormSection>
        <FormSection step="review" icon="fileDoc" title="Review" sub="Confirm the details before the building is created.">
          <ReviewList groups={[
            { title: 'Basic details', step: 0, rows: [['Hostel', hostels.find((h) => String(h._id) === String(form.hostel))?.name], ['Building', form.name], ['Code', form.code || 'Generated on save'], ['Status', words(form.status)], ['Description', form.description]] },
            { title: 'Structure', step: 1, rows: [['Floors', form.floorCount ? `${form.floorCount}${!editId && form.createFloors ? ' — created now' : ''}` : ''], ['Rooms expected', form.expectedRooms], ['Capacity', form.capacity ? `${form.capacity} beds` : '']] },
            { title: 'Facilities', step: 2, rows: [['Facilities', (form.facilities || []).map(words)]] },
          ]} />
        </FormSection>
      </FormModal>

      {/* ── Add / edit a floor ───────────────────────────────────────────── */}
      <FormModal open={modal === 'floor'} onClose={() => setModal(null)} busy={saving} onSubmit={save}
        icon="oBuilding" title={editId ? 'Edit Floor' : 'Add Floor'}
        subtitle="Create a new floor within a building with capacity and facility details."
        submitLabel={editId ? 'Save Changes' : 'Create Floor'} submitIcon="check"
        steps={[
          { key: 'basic', title: 'Basic Information', sub: 'Select building and floor details' },
          { key: 'capacity', title: 'Capacity & Facilities', sub: 'Set capacity and available facilities' },
          { key: 'review', title: 'Review', sub: 'Verify and create' },
        ]}>
        <FormSection step="basic" icon="oBuilding" title="Basic Information" sub="Choose the building and enter floor details.">
          <Grid cols={2}>
            <Fld label="Hostel" required icon="home">
              <select value={form.hostel} disabled={!!editId} onChange={(e) => setForm((f) => ({ ...f, hostel: e.target.value, building: '' }))}>
                <option value="">Select hostel</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </Fld>
            <Fld label="Building" required icon="oBuilding">
              <select value={form.building} disabled={!!editId} onChange={(e) => set('building', e.target.value)}>
                <option value="">Select building</option>
                {(meta?.buildings || []).filter((b) => !form.hostel || String(b.hostel) === String(form.hostel)).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </Fld>
          </Grid>
          <Grid cols={3}>
            <Fld label="Floor Name" required icon="oBuilding">
              <input data-text="title" value={form.name} maxLength={40} placeholder="e.g. Ground Floor, First Floor" onChange={(e) => set('name', e.target.value)} />
            </Fld>
            <Fld label="Floor Number" required icon="oHash" hint="Unique floor number within the building">
              <input type="number" min="-5" max="60" value={form.floorNumber} placeholder="e.g. 0, 1, 2…" onChange={(e) => set('floorNumber', e.target.value)} />
            </Fld>
            <StatusSelect value={form.status} onChange={(v) => set('status', v)} options={STATUSES} />
          </Grid>
          <Fld label="Floor Supervisor" optional icon="user" hint="Person responsible for this floor">
            <select value={form.supervisor || ''} onChange={(e) => set('supervisor', e.target.value)}>
              <option value="">— none —</option>
              {staff.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
            </select>
          </Fld>
        </FormSection>
        <FormSection step="capacity" icon="layers" title="Capacity & Facilities" sub="Define the capacity and amenities available on this floor.">
          <Grid cols={2}>
            <Fld label="Capacity (Total Beds)" icon="oBed" hint="Total number of beds available on this floor">
              <input type="number" min="0" max="2000" value={form.capacity} placeholder="e.g. 30" onChange={(e) => set('capacity', e.target.value)} />
            </Fld>
            <Fld label="Common Rooms" optional icon="home" hint="Number of common rooms on this floor">
              <input type="number" min="0" max="50" value={form.commonRooms} placeholder="e.g. 1" onChange={(e) => set('commonRooms', e.target.value)} />
            </Fld>
          </Grid>
          <Fld label="Facilities" optional hint="Select facilities available on this floor">
            <ChipSelect value={form.facilities || []} onChange={(v) => set('facilities', v)} options={FLOOR_FACILITIES} label="Facilities" icon="oTag" allowNew placeholder="Add a facility" />
          </Fld>
        </FormSection>
        <FormSection step="review" icon="fileDoc" title="Review" sub="Verify the floor before it is created.">
          <ReviewList groups={[
            { title: 'Floor', step: 0, rows: [['Hostel', hostels.find((h) => String(h._id) === String(form.hostel))?.name], ['Building', (meta?.buildings || []).find((b) => String(b._id) === String(form.building))?.name],
              ['Floor', form.name], ['Number', form.floorNumber], ['Status', words(form.status)], ['Supervisor', staff.find((x) => x._id === form.supervisor)?.name]] },
            { title: 'Capacity & facilities', step: 1, rows: [['Capacity', form.capacity ? `${form.capacity} beds` : ''], ['Common rooms', form.commonRooms], ['Facilities', (form.facilities || []).map(words)]] },
          ]} />
        </FormSection>
      </FormModal>

      <RoomFormModal open={!!roomForm} room={roomForm?.room} floor={roomForm?.floor} hostels={meta?.hostels || []}
        floors={meta?.floors || []} buildings={meta?.buildings || []}
        onClose={() => setRoomForm(null)} onSaved={refresh} />
      <RoomDrawer roomId={roomView} onClose={() => setRoomView(null)}
        onEdit={(r) => { setRoomView(null); setRoomForm({ room: r._id }); }} />

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        confirmLabel={`Deactivate ${words(del?.kind || '')}`}
        title={`Deactivate ${words(del?.kind || '')}`}
        message={`Deactivate ${del?.row?.name}? Occupied beds block this — release the students first.`} />
    </div>
  );
}
