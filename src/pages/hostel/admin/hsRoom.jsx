/**
 * Rooms and beds, shared by the three screens that show them — Buildings &
 * Floors, Rooms & Beds and the Occupancy Map. One room form, one bed form and
 * one room drawer, so a room edited from the map is edited by the same code as
 * a room edited from the list.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerField, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { Mark, words } from './hsUI';
import { Badge, Btn, Person, fmtDate, classLine } from './hsList';
import { FormModal, FormSection, SectionPair, Grid, Fld, StatusSelect, ChipSelect, ToggleRow, InfoNote, ReviewList, RadioCards, OCCUPANTS, occupantOf, occupantLabel } from './hsForm';

export const ROOM_TYPES = [
  ['single', 'Single'], ['double', 'Double'], ['triple', 'Triple'],
  ['four_bed', 'Four Bed'], ['dormitory', 'Dormitory'], ['custom', 'Custom'],
];
export const roomTypeLabel = (v) => (ROOM_TYPES.find(([k]) => k === v) || [v, words(v)])[1];
const TYPE_CAPACITY = { single: 1, double: 2, triple: 3, four_bed: 4, dormitory: 8 };

/** How a room is listed: what the board's ROOM_STATE answered. */
export const ROOM_STATE = {
  available: ['Available', 'green'], full: ['Full', 'red'], reserved: ['Reserved', 'amber'],
  maintenance: ['Maintenance', 'orange'], inactive: ['Inactive', 'slate'],
};
export const ROOM_STATES = Object.entries(ROOM_STATE).map(([value, [label]]) => ({ value, label }));
export const RoomState = ({ state }) => {
  const [text, tone] = ROOM_STATE[state] || [words(state), 'slate'];
  return <Badge tone={tone} dot pill>{text}</Badge>;
};

/** A bed's state, as the board's BED_STATE answered ('out' is a bed out of service). */
export const BED_STATE = {
  occupied: ['Occupied', 'green'], available: ['Available', 'blue'], reserved: ['Reserved', 'amber'],
  maintenance: ['Maintenance', 'orange'], out: ['Inactive', 'slate'], inactive: ['Inactive', 'slate'],
};
export const BedState = ({ state }) => {
  const [text, tone] = BED_STATE[state] || [words(state), 'slate'];
  return <Badge tone={tone} dot pill>{text}</Badge>;
};
const BED_TYPES = [['single', 'General'], ['bunk_upper', 'Bunk (upper)'], ['bunk_lower', 'Bunk (lower)'], ['other', 'Other']];
export const bedTypeLabel = (v) => (BED_TYPES.find(([k]) => k === v) || [v, words(v)])[1];
/** The states a warden may put a bed in by hand — occupancy belongs to Allocations. */
const BED_SETTABLE = [['available', 'Available'], ['reserved', 'Reserved'], ['maintenance', 'Maintenance'], ['inactive', 'Inactive']];

/* ── Room form ───────────────────────────────────────────────────────────── */

const emptyRoom = {
  hostel: '', building: '', floor: '', roomNumber: '', code: '', roomType: 'double', capacity: '2',
  bedType: 'single', bedArrangement: 'single_row', occupantType: 'student', gender: '', facilities: [], description: '', status: 'available', generateBeds: true,
};
const ROOM_BED_TYPES = [['single', 'Standard Bed'], ['bunk', 'Bunk Beds'], ['other', 'Other']];
const ARRANGEMENTS = [['single_row', 'Single Row'], ['double_row', 'Double Row'], ['l_shape', 'L-Shape'], ['around_walls', 'Around the Walls'], ['custom', 'Custom']];
const ROOM_FACILITIES = ['attached_bathroom', 'balcony', 'ac', 'fan', 'study_table', 'wardrobe', 'geyser', 'wifi', 'window'];
/** The states a room can be put in by hand; occupancy (partly full, full) is kept by the allocation engine. */
const ROOM_SETTABLE = [['available', 'Active'], ['reserved', 'Reserved'], ['maintenance', 'Maintenance'], ['inactive', 'Inactive']];
const FACILITY_LABEL = { ac: 'AC', wifi: 'Wi-Fi' };
const facilityWord = (v) => FACILITY_LABEL[v] || words(v);

/**
 * Add or edit a room. `room` is a room id or row to edit (the full record is
 * fetched, since a board row is only a summary); `floor` pre-picks the floor
 * for a new one. `hostels`, `buildings` and `floors` are the meta endpoint's.
 */
export function RoomFormModal({ open, room, floor, hostels = [], floors = [], buildings = [], onClose, onSaved }) {
  const editId = room ? (room._id || room) : null;
  const [form, setForm] = useState(emptyRoom);
  const [orig, setOrig] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return undefined;
    if (!editId) {
      const f = floors.find((x) => String(x._id) === String(floor));
      setForm({ ...emptyRoom, floor: floor || '', building: f?.building || '', hostel: f?.hostel || (hostels.length === 1 ? hostels[0]._id : '') });
      setOrig(null);
      return undefined;
    }
    let alive = true;
    api.getRoom(editId)
      .then((r) => {
        if (!alive) return;
        const d = r.data ?? r;
        const next = {
          ...emptyRoom, ...d, floor: d.floor?._id || d.floor, building: d.building?._id || d.building, hostel: d.hostel?._id || d.hostel,
          facilities: d.facilities || [], capacity: String(d.capacity ?? ''), description: d.description || '', code: d.code || '',
          bedType: d.bedType || 'single', bedArrangement: d.bedArrangement || 'single_row', occupantType: occupantOf(d), gender: d.gender || '',
        };
        setForm(next); setOrig(next);
      })
      .catch((err) => { toast.error(err.message); onClose(); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId, floor]);

  // A room that is part-full or full shows as Active here; its occupancy is not the form's to set.
  const shownStatus = ['partially_occupied', 'full'].includes(form.status) ? 'available' : form.status;
  const save = async () => {
    setSaving(true);
    try {
      const p = {
        roomNumber: form.roomNumber.trim(), code: form.code.trim(), floor: form.floor, roomType: form.roomType,
        capacity: Number(form.capacity) || 1, gender: form.gender, description: form.description, facilities: form.facilities,
        bedType: form.bedType, bedArrangement: form.bedArrangement, occupantType: form.occupantType,
      };
      if (!editId) Object.assign(p, { generateBeds: form.generateBeds, status: form.status });
      else if (orig && shownStatus !== (['partially_occupied', 'full'].includes(orig.status) ? 'available' : orig.status)) p.status = form.status;
      const res = editId ? await api.updateRoom(editId, p) : await api.createRoom(p);
      const made = (res.data ?? res)?.beds?.length;
      toast.success(editId ? 'Room updated' : made ? `Room created with ${made} bed${made === 1 ? '' : 's'}` : 'Room created');
      onSaved?.(res.data ?? res);
      onClose();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const nameOf = (list, id, key = 'name') => list.find((x) => String(x._id) === String(id))?.[key] || '';
  const bList = buildings.filter((b) => !form.hostel || String(b.hostel) === String(form.hostel));
  const fList = floors.filter((f) => (!form.building || String(f.building) === String(form.building)) && (!form.hostel || String(f.hostel) === String(form.hostel)));
  const cap = Number(form.capacity) || 0;
  const typeName = (v) => (ROOM_TYPES.find(([k]) => k === v) || [v, words(v)])[1];

  return (
    <FormModal open={open} onClose={onClose} busy={saving} onSubmit={save}
      icon="oBed" title={editId ? `Edit ${form.roomNumber || 'Room'}` : 'Add Room'}
      subtitle="Create a new room within a floor with capacity and facility details."
      submitLabel={editId ? 'Save Changes' : 'Create Room'} submitIcon="check"
      steps={[
        { key: 'basic', title: 'Basic Information', sub: 'Select location and room details', icon: 'oBed' },
        { key: 'capacity', title: 'Capacity & Allocation', sub: 'Set capacity and bed arrangement', icon: 'users' },
        { key: 'facilities', title: 'Facilities', sub: 'Select room amenities', icon: 'settings' },
        { key: 'settings', title: 'Additional Settings', sub: 'Rules and description', icon: 'fileDoc' },
        { key: 'review', title: 'Review', sub: 'Confirm and create', icon: 'oCheckRound' },
      ]}>
      <FormSection step="basic" icon="mapPin" title="Location Details" sub="Select the building and floor for this room.">
        <Grid cols={3}>
          <Fld label="Hostel" required icon="oBuilding">
            <select value={form.hostel} disabled={!!editId} onChange={(e) => setForm((f) => ({ ...f, hostel: e.target.value, building: '', floor: '' }))}>
              <option value="">Select hostel</option>
              {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
            </select>
          </Fld>
          <Fld label="Building" required icon="oBuilding">
            <select value={form.building} disabled={!!editId || !form.hostel} onChange={(e) => setForm((f) => ({ ...f, building: e.target.value, floor: '' }))}>
              <option value="">{form.hostel ? 'Select building' : 'Pick a hostel first'}</option>
              {bList.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </Fld>
          <Fld label="Floor" required icon="layers">
            <select value={form.floor} disabled={!!editId || !form.building} onChange={(e) => set('floor', e.target.value)}>
              <option value="">{form.building ? 'Select floor' : 'Pick a building first'}</option>
              {fList.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
            </select>
          </Fld>
        </Grid>
      </FormSection>
      <FormSection step="basic" icon="oBed" title="Room Information" sub="Provide room details and type.">
        <Grid cols={3}>
          <Fld label="Room Number" required icon="oHash">
            <input data-text="code" value={form.roomNumber} maxLength={20} placeholder="e.g. 101" onChange={(e) => set('roomNumber', e.target.value)} />
          </Fld>
          <Fld label="Room Code" icon="oTag" hint={editId ? '' : 'Leave blank to generate automatically'}>
            <input data-text="code" value={form.code} maxLength={20} placeholder="Auto (RM-…)" onChange={(e) => set('code', e.target.value.toUpperCase())} />
          </Fld>
          <Fld label="Room Type" required icon="oRows">
            <select value={form.roomType} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, roomType: v, capacity: TYPE_CAPACITY[v] ? String(TYPE_CAPACITY[v]) : f.capacity })); }}>
              {ROOM_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Fld>
        </Grid>
      </FormSection>
      <FormSection step="capacity" icon="users" title="Capacity & Bed Arrangement" sub="Set the total capacity and bed configuration.">
        <Grid cols={3}>
          <Fld label="Total Capacity (Beds)" required icon="users" hint="Maximum number of students this room can accommodate">
            <input type="number" min="1" max="100" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
          </Fld>
          <Fld label="Bed Type" icon="oBed" hint={form.bedType === 'bunk' ? 'Laid out as lower and upper berths, alternately' : ''}>
            <select value={form.bedType} onChange={(e) => set('bedType', e.target.value)}>
              {ROOM_BED_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Fld>
          <Fld label="Bed Arrangement" icon="oGrid">
            <select value={form.bedArrangement} onChange={(e) => set('bedArrangement', e.target.value)}>
              {ARRANGEMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Fld>
        </Grid>
        <RadioCards label="Beds Are For" cols={3} value={form.occupantType} onChange={(v) => set('occupantType', v)} options={OCCUPANTS} />
        {editId && orig && occupantOf(orig) !== form.occupantType
          ? <InfoNote>Saving also changes this room&apos;s beds. A bed whose current occupant would no longer fit is left as it is.</InfoNote> : null}
        {editId ? null : (
          <ToggleRow on={form.generateBeds} onChange={(v) => set('generateBeds', v)} label="Auto-create beds for this room"
            hint={cap > 0 ? `Automatically create and number ${cap} bed(s) (${Array.from({ length: Math.min(cap, 3) }, (_, i) => `Bed ${i + 1}`).join(', ')}${cap > 3 ? ' …' : ''})` : 'Set the capacity first'} />
        )}
      </FormSection>
      <SectionPair>
        <FormSection step="facilities" icon="settings" title="Room Facilities" sub="Select amenities available in this room.">
          <ChipSelect value={form.facilities} onChange={(v) => set('facilities', v)} options={ROOM_FACILITIES} show={facilityWord} label="Room facilities" allowNew placeholder="Add a facility" />
        </FormSection>
        <FormSection step="settings" icon="fileDoc" title="Additional Settings" sub="Set room rules and description.">
          <Grid cols={2}>
            <Fld label="Gender" icon="user">
              <select value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Inherit from hostel</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="any">Any</option>
              </select>
            </Fld>
            <StatusSelect value={shownStatus} onChange={(v) => set('status', v)} options={ROOM_SETTABLE} required={false} />
          </Grid>
          <Fld label="Description" optional count={[form.description.length, 300]}>
            <textarea rows={2} maxLength={300} value={form.description} placeholder="Rules or notes for this room" onChange={(e) => set('description', e.target.value)} />
          </Fld>
        </FormSection>
      </SectionPair>
      <FormSection step="review" icon="oCheckRound" title="Review" sub="Confirm the room before it is created.">
        <ReviewList groups={[
          { title: 'Location', step: 0, rows: [['Hostel', nameOf(hostels, form.hostel)], ['Building', nameOf(buildings, form.building)], ['Floor', nameOf(floors, form.floor)]] },
          { title: 'Room', step: 0, rows: [['Room number', form.roomNumber], ['Code', form.code || (editId ? '' : 'Generated on save')], ['Type', typeName(form.roomType)]] },
          { title: 'Capacity', step: 1, rows: [['Capacity', cap ? `${cap} bed${cap === 1 ? '' : 's'}` : ''], ['Bed type', (ROOM_BED_TYPES.find(([k]) => k === form.bedType) || [])[1]],
            ['Arrangement', (ARRANGEMENTS.find(([k]) => k === form.bedArrangement) || [])[1]], ['Beds are for', occupantLabel(form)], ...(editId ? [] : [['Beds', form.generateBeds ? `${cap} created now` : 'Added later by hand']])] },
          { title: 'Facilities & settings', step: 2, rows: [['Facilities', form.facilities.map(facilityWord)], ['Gender', form.gender ? words(form.gender) : 'Inherit from hostel'], ['Status', (ROOM_SETTABLE.find(([k]) => k === shownStatus) || [])[1]], ['Description', form.description]] },
        ]} />
      </FormSection>
    </FormModal>
  );
}

/* ── Bed form ────────────────────────────────────────────────────────────── */

/**
 * Add a bed to `room`, or edit `bed`. Editing also sets the bed's state —
 * except for an occupied bed, whose state only the allocation engine changes.
 */
export function BedFormModal({ open, room, bed, onClose, onSaved }) {
  const [form, setForm] = useState({ bedNumber: '', bedType: 'single', occupantType: 'student', remarks: '', status: 'available' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const occupied = bed?.status === 'occupied';

  useEffect(() => {
    if (!open) return;
    setForm(bed
      ? { bedNumber: bed.bedNumber || '', bedType: bed.bedType || 'single', occupantType: occupantOf(bed), remarks: bed.remarks || '', status: bed.status === 'occupied' ? 'occupied' : (bed.status || 'available') }
      : { bedNumber: String((room?.bedList?.length || room?.beds || 0) + 1), bedType: 'single', occupantType: occupantOf(room), remarks: '', status: 'available' });
  }, [open, bed, room]);

  const save = async () => {
    setSaving(true);
    try {
      if (bed) {
        await api.updateBed(bed._id, { bedNumber: form.bedNumber, bedType: form.bedType, occupantType: form.occupantType, remarks: form.remarks });
        if (!occupied && form.status !== bed.status) await api.setBedState(bed._id, { status: form.status, remarks: form.remarks });
        toast.success('Bed updated');
      } else {
        await api.createBed({ room: room._id, bedNumber: form.bedNumber, bedType: form.bedType, occupantType: form.occupantType, remarks: form.remarks });
        toast.success('Bed added');
      }
      onSaved?.();
      onClose();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  return (
    <FormModal open={open} onClose={onClose} busy={saving} onSubmit={save} width={600}
      icon="oBed" title={bed ? `Edit Bed ${bed.code || bed.bedNumber}` : 'Add Bed'}
      subtitle={bed ? 'Change the bed’s number, type, who it is for, or its state.' : `A new bed in ${room?.roomNumber || 'this room'}.`}
      submitLabel={bed ? 'Save Changes' : 'Add Bed'} submitIcon="check">
      <FormSection>
        <Grid cols={2}>
          <Fld label="Bed Number" required icon="oHash">
            <input data-text="code" value={form.bedNumber} maxLength={10} placeholder="1, 2, A, Upper…" onChange={(e) => set('bedNumber', e.target.value)} />
          </Fld>
          <Fld label="Type" icon="oBed">
            <select value={form.bedType} onChange={(e) => set('bedType', e.target.value)}>
              {BED_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Fld>
        </Grid>
        <RadioCards label="Bed Is For" required cols={3} value={form.occupantType} onChange={(v) => set('occupantType', v)} options={OCCUPANTS} />
        {bed ? (
          occupied ? (
            <InfoNote>This bed is occupied. Release its occupant from Allocations to change its state.</InfoNote>
          ) : <StatusSelect label="State" value={form.status} onChange={(v) => set('status', v)} options={BED_SETTABLE} />
        ) : null}
        <Fld label="Remark" optional icon="fileDoc" hint="Kept on the bed and in the audit log">
          <input value={form.remarks} maxLength={200} placeholder="e.g. Mattress replaced" onChange={(e) => set('remarks', e.target.value)} />
        </Fld>
      </FormSection>
    </FormModal>
  );
}

/** Put a bed in a state by hand, straight from a menu. Returns true when it took. */
export async function setBedState(bed, status) {
  try {
    await api.setBedState(bed._id, { status, remarks: bed.remarks || '' });
    toast.success(`Bed ${bed.code || bed.bedNumber} marked ${status}`);
    return true;
  } catch (err) { toast.error(err.message); return false; }
}

/** The ⋮ menu of a bed: the states it may be put in, and removal. */
export function bedMenu(bed, { onChanged, onRemove }) {
  if (bed.status === 'occupied') return [];
  const to = (status) => async () => { if (await setBedState(bed, status)) onChanged?.(); };
  return [
    bed.status !== 'available' && { label: 'Mark available', icon: 'checkCircle', onClick: to('available') },
    bed.status !== 'reserved' && { label: 'Reserve', icon: 'lock', onClick: to('reserved') },
    bed.status !== 'maintenance' && { label: 'Send for maintenance', icon: 'wrench', onClick: to('maintenance') },
    bed.status !== 'inactive' && { label: 'Mark inactive', icon: 'power', onClick: to('inactive') },
    '-',
    { label: 'Remove bed', icon: 'trash', danger: true, onClick: () => onRemove?.(bed) },
  ];
}

/* ── Room drawer ─────────────────────────────────────────────────────────── */

/**
 * Everything about one room: where it is, its beds and who is in them, and the
 * assets, complaints and repairs filed against it.
 */
export function RoomDrawer({ roomId, onClose, onEdit, refreshKey = 0 }) {
  const nav = useNavigate();
  const [d, setD] = useState(null);

  useEffect(() => {
    if (!roomId) { setD(null); return undefined; }
    let alive = true;
    api.getRoom(roomId)
      .then((r) => alive && setD(r.data ?? r))
      .catch((err) => { toast.error(err.message); onClose(); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, refreshKey]);

  const beds = (d?.beds || []).filter((b) => b.isActive !== false);
  const occupied = beds.filter((b) => b.status === 'occupied').length;

  return (
    <Drawer open={!!roomId} onClose={onClose} label="Room details">
      <DrawerHead
        mark={<Mark name="door" tone="indigo" size={52} glyph={26} />}
        name={d?.roomNumber || 'Room'} sub={d?.code}
        tags={d ? <>
          <Badge tone="blue">{roomTypeLabel(d.roomType)}</Badge>
          <Badge tone="slate">{occupied} / {beds.length} beds</Badge>
        </> : null}
        onClose={onClose}
      />
      <DrawerBody>
        {!d ? <p className="hs-muted">Loading…</p> : (
          <>
            <DrawerSection title="Where">
              <DrawerFields fields={[
                ['Hostel', d.hostel?.name],
                ['Building', d.building?.name],
                ['Floor', d.floor?.name],
                ['Capacity', d.capacity],
                ['Gender', d.gender ? words(d.gender) : 'As the hostel'],
                ['Status', words(d.status)],
                ['Facilities', (d.facilities || []).join(', ')],
                ['Description', d.description],
              ]} />
            </DrawerSection>
            <DrawerSection title={`Beds (${beds.length})`}>
              {beds.length ? (
                <ul className="hs-dbeds">
                  {beds.map((b) => (
                    <li key={b._id}>
                      <span className="hs-dbeds__no">{b.code || b.bedNumber}</span>
                      {b.student?.name
                        ? <Person name={b.student.name} src={b.student.profileImage} size={28} strong={false} />
                        : <span className="hs-muted">Not allocated</span>}
                      <BedState state={b.status} />
                    </li>
                  ))}
                </ul>
              ) : <p className="hs-muted">No beds laid out yet.</p>}
            </DrawerSection>
            {d.assets?.length ? (
              <DrawerSection title={`Assets (${d.assets.length})`}>
                <dl>{d.assets.map((a, i) => <DrawerField key={a._id || i} label={`${a.name}${a.quantity > 1 ? ` × ${a.quantity}` : ''}`}>{words(a.status)}</DrawerField>)}</dl>
              </DrawerSection>
            ) : null}
            {d.complaints?.length ? (
              <DrawerSection title={`Recent complaints (${d.complaints.length})`}>
                <dl>{d.complaints.map((c, i) => <DrawerField key={c._id || i} label={c.ticketNumber}>{words(c.category)} · {words(c.status)}</DrawerField>)}</dl>
              </DrawerSection>
            ) : null}
            {d.maintenance?.length ? (
              <DrawerSection title={`Maintenance (${d.maintenance.length})`}>
                <dl>{d.maintenance.map((m, i) => <DrawerField key={m._id || i} label={m.requestNumber}>{words(m.category)} · {words(m.status)} · {fmtDate(m.createdAt)}</DrawerField>)}</dl>
              </DrawerSection>
            ) : null}
          </>
        )}
      </DrawerBody>
      {d ? (
        <DrawerFoot>
          {onEdit ? <Btn icon="pencil" onClick={() => onEdit(d)}>Edit room</Btn> : null}
          <Btn kind="primary" icon="bed" onClick={() => nav(`/admin/hostel/rooms?search=${encodeURIComponent(d.roomNumber)}`)}>Manage beds</Btn>
        </DrawerFoot>
      ) : null}
    </Drawer>
  );
}

/* ── Bed drawer ──────────────────────────────────────────────────────────── */

/** One bed and whoever is in it. `bed` is a board bed row (bedList entry). */
export function BedDrawer({ bed, room, onClose, onEdit }) {
  const nav = useNavigate();
  return (
    <Drawer open={!!bed} onClose={onClose} label="Bed details">
      {bed ? (
        <>
          <DrawerHead
            mark={<Mark name="bedSolid" tone="indigo" size={52} glyph={28} />}
            name={`Bed ${bed.code || bed.bedNumber}`} sub={room?.roomNumber}
            tags={<><BedState state={bed.state || bed.status} /><Badge tone="blue">{bedTypeLabel(bed.bedType)}</Badge>
              <Badge tone={occupantOf(bed) === 'student' ? 'slate' : 'violet'}>For {occupantLabel(bed).toLowerCase()}</Badge></>}
            onClose={onClose}
          />
          <DrawerBody>
            <DrawerSection title="Occupant">
              {bed.studentName ? (
                <>
                  <Person name={bed.studentName} src={bed.studentPhoto} sub={classLine(bed)} size={44} />
                  <DrawerFields fields={[
                    ['Admission no.', bed.studentAdmissionNo],
                    ['Section', bed.studentSection],
                    ['Allocated on', bed.allocatedOn ? fmtDate(bed.allocatedOn) : ''],
                  ]} />
                </>
              ) : <p className="hs-muted">Nobody is allocated to this bed.</p>}
            </DrawerSection>
            <DrawerSection title="Bed">
              <DrawerFields fields={[
                ['Room', room?.roomNumber],
                ['Building', room?.buildingName],
                ['Floor', room?.floorName],
                ['Hostel', room?.hostelName],
                ['Remark', bed.remarks],
              ]} />
            </DrawerSection>
          </DrawerBody>
          <DrawerFoot>
            {onEdit ? <Btn icon="pencil" onClick={() => onEdit(bed)}>Edit bed</Btn> : null}
            {bed.studentName
              ? <Btn kind="primary" icon="arrowRight" onClick={() => nav(`/admin/hostel/allocations?search=${encodeURIComponent(bed.studentName)}`)}>Open allocation</Btn>
              : (bed.state === 'available'
                ? <Btn kind="primary" icon="userPlus" onClick={() => nav(`/admin/hostel/allocations?new=1&bed=${bed._id}`)}>Assign student</Btn>
                : null)}
          </DrawerFoot>
        </>
      ) : null}
    </Drawer>
  );
}
