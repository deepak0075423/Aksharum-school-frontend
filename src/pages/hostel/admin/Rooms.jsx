/**
 * Hostel → Rooms & Beds (Sep 2026 redesign, to the user's mockup).
 *
 * Five figures, a filter row and the rooms table; a room opens to its beds in
 * place. GET /hostel/admin/board/rooms carries each page's beds with whoever
 * sleeps in them, so opening a room costs nothing and the search can find a
 * room by the name of a student who lives in it.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { ConfirmDialog, occupantOf, occupantLabel } from './hsForm';
import { useNewFromLink } from '../shared';
import { PageHead, Glyph } from './hsUI';
import { DoorArt, BedArt } from './hsArt';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, Btn, SplitBtn, Kebab, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, Person, TwoLine, useListState, useBoardData, exportCsv, fmtDate, classLine,
} from './hsList';
import {
  RoomFormModal, RoomDrawer, BedFormModal, BedDrawer, RoomState, BedState, ROOM_TYPES, ROOM_STATES,
  roomTypeLabel, bedTypeLabel, bedMenu,
} from './hsRoom';

const FILTERS = { hostel: '', building: '', floor: '', roomType: '', status: '' };

export default function Rooms() {
  const nav = useNavigate();
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS },
    { fromUrl: ['hostel', 'building', 'floor', 'status', 'search'] });
  const { data, loading, reload } = useBoardData((q) => api.getBoard('rooms', q), state);
  const { data: meta, refetch: reloadMeta } = useFetch(api.getMeta, []);

  const hostels = meta?.hostels || [];
  const buildings = (meta?.buildings || []).filter((b) => !state.hostel || String(b.hostel) === state.hostel);
  const floors = (meta?.floors || []).filter((f) => (state.building
    ? String(f.building) === state.building
    : !state.hostel || String(f.hostel) === state.hostel));
  const allFloors = meta?.floors || [];

  const [roomForm, setRoomForm] = useState(null);   // { room } | { floor }
  const [roomView, setRoomView] = useState(null);
  const [bedForm, setBedForm] = useState(null);     // { room, bed? }
  const [bedView, setBedView] = useState(null);     // { room, bed }
  const [del, setDel] = useState(null);             // { kind: 'room' | 'bed', row }
  const [open, setOpen] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bedsSelected, setBedsSelected] = useState(new Set());
  const [tick, setTick] = useState(0);

  const refresh = () => { reload(); reloadMeta?.(); setTick((t) => t + 1); };

  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(!!meta, () => (allFloors.length ? setRoomForm({ floor: state.floor || '' }) : toast.error('Add a floor first, then its rooms')));

  const remove = async () => {
    try {
      if (del.kind === 'room') { await api.deleteRoom(del.row._id); toast.success('Room deactivated'); }
      else { await api.deleteBed(del.row._id); toast.success('Bed removed'); }
      setDel(null); refresh();
    } catch (err) { toast.error(err.message); setDel(null); }
  };

  const addBeds = async (room) => {
    try {
      const r = await api.generateBeds(room._id, {});
      toast.success(`${(r.data ?? r).length} bed(s) added`);
      refresh();
    } catch (err) { toast.error(err.message); }
  };

  const t = data?.tiles || {};
  const rows = data?.rows || [];
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));

  const columns = [
    { key: 'room', label: 'Room No.', render: (r) => <TwoLine top={r.roomNumber} sub={r.code} strong /> },
    { key: 'hostel', label: 'Hostel', render: (r) => r.hostelName || '—' },
    { key: 'building', label: 'Building', render: (r) => r.buildingName || '—' },
    { key: 'floor', label: 'Floor', render: (r) => r.floorName || '—' },
    { key: 'type', label: 'Type', render: (r) => <Badge tone="blue">{roomTypeLabel(r.roomType)}</Badge> },
    { key: 'capacity', label: 'Capacity', render: (r) => r.capacity ?? 0 },
    { key: 'occupied', label: 'Occupied', render: (r) => r.occupied || 0 },
    { key: 'available', label: 'Available', render: (r) => r.available || 0 },
    { key: 'status', label: 'Status', render: (r) => <RoomState state={r.state} /> },
  ];

  const bedColumns = [
    { key: 'bed', label: 'Bed No.', render: (b) => b.code || b.bedNumber },
    { key: 'student', label: 'Occupant', render: (b) => (b.studentName
      ? <Person name={b.studentName} src={b.studentPhoto} strong={false}
          sub={b.studentKind === 'teacher' ? ['Teacher', b.studentAdmissionNo].filter(Boolean).join(' • ') : classLine(b).replace(' | ', ' • ')} />
      : <span className="hs-person hs-person--none"><span aria-hidden>—</span><span className="hs-muted">Not allocated</span></span>) },
    { key: 'type', label: 'Type', render: (b) => <Badge tone="blue">{bedTypeLabel(b.bedType)}</Badge> },
    { key: 'for', label: 'Bed Is For', render: (b) => <Badge tone={occupantOf(b) === 'student' ? 'slate' : 'violet'}>{occupantLabel(b)}</Badge> },
    { key: 'status', label: 'Status', render: (b) => <BedState state={b.state} /> },
    { key: 'on', label: 'Allocated On', render: (b) => (b.studentName && b.allocatedOn ? fmtDate(b.allocatedOn) : '—') },
  ];

  const bedsPanel = (room) => {
    const beds = room.bedList || [];
    return (
      <ListCard className="hs-lcard--nest" head={(
        <>
          <span className="hs-sechead__ico"><Glyph name="bedSolid" size={24} /></span>
          <h3>Beds in {room.roomNumber} ({beds.length})</h3>
          <Btn icon="plus" size="sm" onClick={() => setBedForm({ room })}>Add Bed</Btn>
        </>
      )}>
        <DataTable
          columns={bedColumns} rows={beds} pad={7} headPad={10}
          selected={bedsSelected} onSelect={setBedsSelected}
          actions={(b) => (
            <>
              {b.state === 'available'
                ? <Btn size="sm" icon="userPlus" onClick={() => nav(`/admin/hostel/allocations?new=1&bed=${b._id}`)}>Assign</Btn>
                : <Btn size="sm" icon="eye" onClick={() => setBedView({ room, bed: b })}>View</Btn>}
              <Btn size="sm" icon="pencil" onClick={() => setBedForm({ room, bed: b })}>Edit</Btn>
              <Kebab label={`Actions for bed ${b.code || b.bedNumber}`} items={b.status === 'occupied'
                ? [{ label: 'Open allocation', icon: 'arrowRight', onClick: () => nav(`/admin/hostel/allocations?search=${encodeURIComponent(b.studentName || '')}`) }]
                : bedMenu(b, { onChanged: refresh, onRemove: (bed) => setDel({ kind: 'bed', row: bed }) })} />
            </>
          )}
          empty={(
            <EmptyRows icon="bed" title="No beds laid out yet"
              action={<Btn kind="primary" icon="plus" onClick={() => addBeds(room)}>Lay out {room.capacity} bed{room.capacity === 1 ? '' : 's'}</Btn>}>
              A room&rsquo;s beds are what students and teachers are allocated to.
            </EmptyRows>
          )}
        />
      </ListCard>
    );
  };

  const exportRows = () => {
    const pick = rows.filter((r) => selected.has(String(r._id)));
    exportCsv('hostel-rooms.csv', [
      { label: 'Room', value: (r) => r.roomNumber }, { label: 'Code', value: (r) => r.code },
      { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Building', value: (r) => r.buildingName },
      { label: 'Floor', value: (r) => r.floorName }, { label: 'Type', value: (r) => roomTypeLabel(r.roomType) },
      { label: 'Capacity', value: (r) => r.capacity }, { label: 'Occupied', value: (r) => r.occupied },
      { label: 'Available', value: (r) => r.available }, { label: 'Status', value: (r) => r.state },
    ], pick);
  };

  return (
    <div className="hs-page">
      <PageHead title="Rooms & Beds" subtitle="Manage hostel rooms and beds. View availability, assign students or send for maintenance.">
        <SplitBtn label="Add Room" menuLabel="More ways to add"
          onClick={() => (allFloors.length ? setRoomForm({ floor: state.floor || '' }) : toast.error('Add a floor first, then its rooms'))}
          items={[
            { label: 'Add Building', icon: 'building', onClick: () => nav('/admin/hostel/structure?new=building') },
            { label: 'Add Floor', icon: 'layers', onClick: () => nav('/admin/hostel/structure?new=floor') },
          ]} />
      </PageHead>

      <Kpis cols={5} size="sm">
        <Kpi tone="violet" icon="bedSolid" value={t.rooms ?? 0} label="Total Rooms" art={<DoorArt />} />
        <Kpi tone="rose" icon="bedSolid" value={t.beds ?? 0} label="Total Beds" art={<BedArt small />} />
        <Kpi tone="green" icon="person" value={t.occupied ?? 0} label="Occupied Beds"
          pct={t.occupiedPct ?? 0} pctLabel={`${t.occupiedPct ?? 0}% occupancy`} pctTone="violet" bar inline barColor="linear-gradient(90deg, #6d5dfc, #a78bfa)" />
        <Kpi tone="sky" icon="bedSolid" value={t.available ?? 0} label="Available Beds"
          pct={t.availablePct ?? 0} pctLabel={`${t.availablePct ?? 0}% available`} bar inline barColor="#2b8ef0" />
        <Kpi tone="amber" icon="tools" value={t.maintenance ?? 0} label="Maintenance Beds"
          pct={t.maintenancePct ?? 0} pctLabel={`${t.maintenancePct ?? 0}% under maintenance`} bar inline barColor="#f59e0b" />
      </Kpis>

      <FilterBar>
        <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search room number, student name..." grow={3} width="300px" />
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v, building: '', floor: '' })} all="All hostels"
          options={hostels.map((h) => ({ value: h._id, label: h.name }))} width="120px" />
        <FSelect value={state.building} onChange={(v) => set({ building: v, floor: '' })} all="All buildings"
          options={buildings.map((b) => ({ value: b._id, label: b.name }))} width="120px" />
        <FSelect value={state.floor} onChange={(v) => set({ floor: v })} all="All floors"
          options={floors.map((f) => ({ value: f._id, label: f.name }))} width="110px" />
        <FSelect value={state.roomType} onChange={(v) => set({ roomType: v })} all="All room types"
          options={ROOM_TYPES.map(([value, label]) => ({ value, label }))} width="130px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={ROOM_STATES} width="120px" />
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); setOpen(null); }}>Reset</Btn>
      </FilterBar>

      <ListCard>
        <BulkBar count={selected.size} noun="room" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={exportRows}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={7} headPad={10}
          selected={selected} onSelect={setSelected}
          expand={bedsPanel} expanded={open} onExpand={(k) => { setOpen(k); setBedsSelected(new Set()); }}
          actions={(r) => (
            <>
              <Btn size="sm" icon="eye" onClick={() => setRoomView(r._id)}>View</Btn>
              <Btn size="sm" icon="pencil" onClick={() => setRoomForm({ room: r._id })}>Edit</Btn>
              <Kebab label={`Actions for ${r.roomNumber}`} items={[
                { label: 'Add bed', icon: 'plus', onClick: () => setBedForm({ room: r }) },
                (r.bedList?.length || 0) < r.capacity && { label: 'Lay out missing beds', icon: 'bed', onClick: () => addBeds(r) },
                { label: 'Show on occupancy map', icon: 'grid', onClick: () => nav(`/admin/hostel/occupancy?hostel=${r.hostelId}&building=${r.buildingId}&floor=${r.floorId}&room=${r._id}`) },
                '-',
                { label: 'Deactivate', icon: 'trash', danger: true, onClick: () => setDel({ kind: 'room', row: r }) },
              ]} />
            </>
          )}
          empty={(
            <EmptyRows icon="door" title={filtered ? 'No room matches these filters' : 'No rooms yet'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn>
                : <Btn kind="primary" icon="plus" onClick={() => setRoomForm({ floor: '' })} disabled={!allFloors.length}>Add Room</Btn>}>
              {filtered ? 'Try a different room number, student or filter.' : 'Add a floor first, then create rooms on it.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'room' : 'rooms'} onPage={setPage} size="sm" />
      </ListCard>

      <RoomFormModal open={!!roomForm} room={roomForm?.room} floor={roomForm?.floor} hostels={meta?.hostels || []}
        floors={allFloors} buildings={meta?.buildings || []} onClose={() => setRoomForm(null)} onSaved={refresh} />
      <RoomDrawer roomId={roomView} refreshKey={tick} onClose={() => setRoomView(null)}
        onEdit={(r) => { setRoomView(null); setRoomForm({ room: r._id }); }} />
      <BedFormModal open={!!bedForm} room={bedForm?.room} bed={bedForm?.bed} onClose={() => setBedForm(null)} onSaved={refresh} />
      <BedDrawer bed={bedView?.bed} room={bedView?.room} onClose={() => setBedView(null)}
        onEdit={(b) => { const room = bedView.room; setBedView(null); setBedForm({ room, bed: b }); }} />

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        confirmLabel={del?.kind === 'bed' ? 'Remove Bed' : 'Deactivate Room'}
        title={del?.kind === 'bed' ? 'Remove Bed' : 'Deactivate Room'}
        message={del?.kind === 'bed'
          ? `Remove bed ${del?.row?.code || del?.row?.bedNumber}? It is taken out of the room's count.`
          : `Deactivate ${del?.row?.roomNumber}? Occupied beds block this.`} />
    </div>
  );
}
