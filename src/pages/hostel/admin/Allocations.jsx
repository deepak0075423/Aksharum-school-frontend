/**
 * Hostel → Allocations (Sep 2026 redesign, to the user's mockup).
 *
 * Four figures, a filter row, a tab per state and the allocations table, from
 * GET /hostel/admin/board/allocations; the History tab is the engine's
 * append-only log (…/board/allocation-history). Every move still goes through
 * the allocation engine — allocate, hold, confirm, transfer, release — each in
 * one transaction, so this screen only ever asks for a move, never makes one.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerField, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { money, useNewFromLink, openRefundVoucher } from '../shared';
import { PageHead, Glyph, words } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, LineTabs, Btn, Kebab, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, Person, Avatar, TwoLine, useListState, useBoardData, exportCsv, fmtDate, fmtTime, fmtPhone, rupees,
} from './hsList';
import { ROOM_TYPES, roomTypeLabel } from './hsRoom';
import { TransferRequests, RolloverModal } from './AllocationExtras';
import { useHostelAccess } from './hsAccess';
import { FormModal, FormSection, Grid, Fld, RadioCards, ToggleRow, StudentPicker, studentMeta, PersonCard, SummaryCard, InfoNote, ReviewList, dmy, RESIDENT_KINDS, bedFits, occupantOf } from './hsForm';
import { newestYear } from '../../../utils/listOrder';

const STATUS = {
  active: ['Active', 'green'], pending: ['Pending', 'amber'], vacated: ['Vacated', 'slate'],
  transferred: ['Transferred', 'blue'], cancelled: ['Cancelled', 'red'],
};
const StatusTag = ({ value }) => {
  const [text, tone] = STATUS[value] || [words(value), 'slate'];
  return <Badge tone={tone} strong>{text}</Badge>;
};
const STATUS_FILTER = [{ value: 'active', label: 'Active' }, { value: 'pending', label: 'Pending' }, { value: 'vacated', label: 'Vacated' }];
const ACTION = {
  allocated: ['Allocated', 'green'], reserved: ['Bed held', 'amber'], transferred: ['Transferred', 'blue'],
  released: ['Released', 'slate'], vacated: ['Vacated', 'slate'], cancelled: ['Cancelled', 'red'], maintenance: ['Maintenance', 'orange'],
};
const LIVE = ['active', 'pending'];
const bedLine = (r) => (r.bedNumber ? `Bed ${r.bedNumber}${r.bedCode ? ` (${r.bedCode})` : ''}` : '');
/** "the mess enrolment, 2 leave requests" — what a checkout closes besides the bed. */
const willEnd = (c) => {
  const w = c?.willEnd || {};
  const n = (k, one, many) => (w[k] ? `${w[k] === 1 ? one : `${w[k]} ${many}`}` : '');
  return [n('messEnrolments', 'the mess enrolment', 'mess enrolments'), n('leaves', '1 leave request', 'leave requests'),
    n('outpasses', '1 outpass', 'outpasses'), n('visits', '1 expected visit', 'expected visits')].filter(Boolean).join(', ');
};
const bedOption = (b) => `${b.room?.roomNumber || 'Room'} · Bed ${b.bedNumber}${b.room?.roomType ? ` (${roomTypeLabel(b.room.roomType)})` : ''}`;
const FILTERS = { hostel: '', building: '', room: '', class: '', status: '' };

export default function Allocations() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { state, set, setPage, reset } = useListState({ limit: 7, ...FILTERS }, { fromUrl: ['status', 'tab', 'search', 'hostel'] });
  const history = state.tab === 'history';
  const requests = state.tab === 'requests';
  // Administrators decide room changes and run the rollover; a posted warden sees and asks.
  const { full } = useHostelAccess();
  const { data, loading, reload } = useBoardData(
    (q) => api.getBoard(q.tab === 'history' ? 'allocation-history' : 'allocations', q), state,
  );
  // The History tab has no tiles or tab counts of its own — keep the last ones.
  const [frame, setFrame] = useState(null);
  useEffect(() => { if (data?.tiles) setFrame({ tiles: data.tiles, tabs: data.tabs }); }, [data]);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const years = meta?.academicYears || [];
  const activeYear = years.find((y) => y.status === 'active')?._id || newestYear(years)?._id || '';
  const roomsById = Object.fromEntries((meta?.rooms || []).map((r) => [String(r._id), r]));
  const buildings = (meta?.buildings || []).filter((b) => !state.hostel || String(b.hostel) === state.hostel);
  const roomOptions = (meta?.rooms || []).filter((r) => (state.building
    ? String(r.building) === state.building
    : !state.hostel || String(r.hostel) === state.hostel));

  const [modal, setModal] = useState(null);      // 'allocate' | 'bulk' | 'transfer' | 'release' | 'confirm'
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState(null);
  const [trail, setTrail] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const blankAlloc = { kind: 'student', student: '', mode: 'choose', hostel: '', building: '', floor: '', roomType: '', room: '', bed: '', academicYear: '', allocationType: 'permanent', fromDate: '', toDate: '', remarks: '', hold: false };
  const [allocForm, setAllocForm] = useState(blankAlloc);
  const [pickedStudent, setPickedStudent] = useState(null);
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkForm, setBulkForm] = useState({ students: [], academicYear: '', hostel: '', preferredRoomType: '' });
  const [transferForm, setTransferForm] = useState({ bed: '', reason: '' });
  const blankRelease = { reason: '', status: 'vacated', refundDeposit: false, refundReference: '', refundViaGateway: false };
  const [releaseForm, setReleaseForm] = useState(blankRelease);
  const [checkout, setCheckout] = useState(null);   // what the checkout has to settle, for the release form
  const [rollover, setRollover] = useState(false);
  // Room changes waiting for a decision: the tab's count, and a nudge to reload its list.
  const [reqKey, setReqKey] = useState(0);
  const [pendingReqs, setPendingReqs] = useState(0);
  useEffect(() => {
    api.getTransferRequests({ status: 'pending' }).then((r) => setPendingReqs((r.data ?? r).pending || 0)).catch(() => {});
  }, [reqKey]);
  const [freeBeds, setFreeBeds] = useState([]);
  const [students, setStudents] = useState([]);
  const [bulkResult, setBulkResult] = useState(null);

  const loadFreeBeds = async (hostelId) => {
    try {
      const r = await api.getBeds({ hostel: hostelId || undefined, status: 'available' });
      setFreeBeds(r.data ?? r);
    } catch { setFreeBeds([]); }
  };
  const loadStudents = async () => {
    try { const r = await api.searchStudents({ onlyUnallocated: 'true', limit: 500 }); setStudents(r.data ?? r); }
    catch { setStudents([]); }
  };

  const openAllocate = async (bed = '') => {
    setPickedStudent(null);
    const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setAllocForm({ ...blankAlloc, academicYear: activeYear, fromDate: iso });
    setModal('allocate');
    // A failed load must not look like "no free beds".
    const r = await api.getBeds({ status: 'available' }).catch((err) => { toast.error(`The free beds could not be loaded — ${err.message}`); return null; });
    const beds = r ? (r.data ?? r) : [];
    setFreeBeds(beds);
    // Opened on a particular bed (the Occupancy Map's "Allocate"): the form starts on it.
    const b = bed && beds.find((x) => String(x._id) === String(bed));
    if (b) {
      // A bed kept for teachers starts the form on "Teacher" — otherwise the bed it was opened on would not be offered.
      setAllocForm((f) => ({ ...f, kind: occupantOf(b) === 'teacher' ? 'teacher' : 'student', hostel: String(b.hostel), building: String(b.building), floor: String(b.floor), room: String(b.room?._id || b.room), bed: String(b._id), roomType: '' }));
    }
  };
  // Opened straight from the Dashboard's New menu, or from a free bed (?new=1&bed=…).
  const bedFromLink = sp.get('bed') || '';
  useNewFromLink(!!meta, () => openAllocate(bedFromLink));

  const openBulk = async () => {
    setBulkForm({ students: [], academicYear: activeYear, hostel: '', preferredRoomType: '' });
    setBulkResult(null);
    setModal('bulk');
    await loadStudents();
  };
  const openTransfer = async (row) => {
    setTarget(row); setTransferForm({ bed: '', reason: '' });
    setModal('transfer');
    await loadFreeBeds();
  };
  const openRelease = async (row) => {
    setTarget(row); setReleaseForm(blankRelease); setCheckout(null); setModal('release');
    if (row.status !== 'active') return;             // a held bed has nothing to settle
    try { const r = await api.getCheckout(row._id); setCheckout(r.data ?? r); } catch { setCheckout(null); }
  };
  const openConfirm = (row) => { setTarget(row); setModal('confirm'); };

  /* ── what the allocate form cascades through ─────────────────────────── */
  const hostelName = (id) => hostels.find((h) => String(h._id) === String(id))?.name || '';
  const nameIn = (list, id) => (list || []).find((x) => String(x._id) === String(id))?.name || '';
  // Who the bed is being found for: the person being moved, or the kind chosen on the allocate form.
  const fitKind = modal === 'transfer' ? (target?.studentKind || 'student') : allocForm.kind;
  const staff = allocForm.kind === 'teacher';
  const Who = staff ? 'Teacher' : 'Student';
  // A bed the engine would refuse — its room under maintenance or closed, or
  // kept for the other kind of resident — is not offered.
  const usableBeds = freeBeds.filter((b) => {
    const r = roomsById[String(b.room?._id || b.room)];
    return (!r || !['maintenance', 'inactive'].includes(r.status)) && bedFits(b, fitKind);
  });
  const bedText = (x) => `Bed ${x.bedNumber}${occupantOf(x) === 'both' ? ' (students & teachers)' : ''}`;
  const freeIn = (roomId) => usableBeds.filter((b) => String(b.room?._id || b.room) === String(roomId)).length;
  const floorRooms = (meta?.rooms || []).filter((r) => String(r.floor) === String(allocForm.floor)
    && (!allocForm.roomType || r.roomType === allocForm.roomType) && freeIn(r._id) > 0);
  const chosenRoom = roomsById[String(allocForm.room)] || null;
  const chosenBed = usableBeds.find((b) => String(b._id) === String(allocForm.bed)) || null;
  /** The hostel a student's gender points at, when only one fits. */
  const hostelFor = (st) => {
    const g = String(st?.gender || '').toLowerCase();
    const fit = hostels.filter((h) => h.gender === g);
    return fit.length === 1 ? fit[0]._id : '';
  };
  const chosenHostel = hostels.find((h) => String(h._id) === String(allocForm.hostel));
  const genderClash = chosenHostel && pickedStudent?.gender && ['male', 'female'].includes(chosenHostel.gender)
    && chosenHostel.gender !== String(pickedStudent.gender).toLowerCase() ? `This hostel is for ${words(chosenHostel.gender)} residents — it will be refused` : '';
  const bulkShown = students.filter((x) => {
    const q = bulkSearch.trim().toLowerCase();
    return !q || [x.name, x.className, x.admissionNumber, x.rollNumber].some((v) => String(v || '').toLowerCase().includes(q));
  });

  const doAllocate = async () => {
    setBusy(true);
    try {
      if (allocForm.mode === 'auto') {
        await api.autoAllocate({
          student: allocForm.student, academicYear: allocForm.academicYear,
          hostel: allocForm.hostel || null, preferredRoomType: allocForm.roomType || '',
        });
      } else {
        await api.createAllocation({
          student: allocForm.student, bed: allocForm.bed, academicYear: allocForm.academicYear,
          allocationType: allocForm.allocationType,
          fromDate: allocForm.fromDate || undefined, toDate: allocForm.toDate || undefined,
          remarks: allocForm.remarks, hold: allocForm.hold,
        });
      }
      toast.success(allocForm.hold && allocForm.mode === 'choose' ? `Bed held for the ${Who.toLowerCase()}` : 'Bed allocated');
      setModal(null); reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const doBulk = async () => {
    if (!bulkForm.students.length) return toast.error('Pick at least one student');
    setBusy(true);
    try {
      const r = await api.bulkAllocate(bulkForm);
      const d = r.data ?? r;
      setBulkResult(d);
      toast.success(`${d.allocated.length} allocated, ${d.failed.length} could not be placed`);
      reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
    return undefined;
  };

  const doTransfer = async () => {
    if (!transferForm.bed) return toast.error('Pick a destination bed');
    setBusy(true);
    try {
      const r = await api.transferAllocation(target._id, transferForm);
      // Where the school wants transfers approved, a warden's move waits for an administrator.
      if ((r.data ?? r)?.pending) { toast.success('Sent to the hostel administrators for approval'); setReqKey((k) => k + 1); }
      else toast.success(`${target.studentName || 'Resident'} transferred`);
      setModal(null); reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
    return undefined;
  };

  const doRelease = async () => {
    setBusy(true);
    try {
      const r = await api.releaseAllocation(target._id, releaseForm);
      const d = r.data ?? r;
      toast.success('Allocation closed');
      if (d.depositRefunded > 0) toast.success(`Security deposit of ${money(d.depositRefunded)} refunded`);
      if (d.depositHeld > 0) toast(`A security deposit of ${money(d.depositHeld)} is still held — refund it from Fees`, { icon: '🔒', duration: 7000 });
      if (d.ended?.depositError) toast.error(`The deposit was not refunded: ${d.ended.depositError}`, { duration: 8000 });
      if (d.vouchers?.[0]) openRefundVoucher(d.vouchers[0]);
      if (d.outstandingDues > 0) toast(`Outstanding hostel dues: ${money(d.outstandingDues)}`, { icon: '💳', duration: 6000 });
      if (d.unreturnedAssets > 0) toast(`${d.unreturnedAssets} hostel item(s) still on issue`, { icon: '📦', duration: 6000 });
      setModal(null); reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const doConfirm = async () => {
    setBusy(true);
    try {
      await api.confirmAllocation(target._id, {});
      toast.success(`${target.studentName || 'The student'} is now a resident`);
      setModal(null); reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const openProfile = async (row) => {
    setProfile({ loading: true, name: row.studentName, photo: row.studentPhoto });
    try { const r = await api.getStudentProfile(row.studentId); setProfile(r.data ?? r); }
    catch (err) { toast.error(err.message); setProfile(null); }
  };
  const openTrail = async (row) => {
    setTrail({ loading: true, name: row.studentName });
    try { const r = await api.getAllocationHistory({ student: row.studentId }); setTrail({ name: row.studentName, rows: r.data ?? r }); }
    catch (err) { toast.error(err.message); setTrail(null); }
  };

  const t = frame?.tiles || data?.tiles || {};
  const tabs = frame?.tabs || data?.tabs || {};
  const rows = data?.rows || [];
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));

  const columns = [
    { key: 'student', label: 'Student', render: (r) => <Person name={r.studentName} src={r.studentPhoto} sub={r.studentRoll ? `Roll ${r.studentRoll}` : r.studentAdmissionNo} strong={false} /> },
    { key: 'class', label: 'Class', render: (r) => r.studentClass || '—' },
    { key: 'hostel', label: 'Hostel', render: (r) => r.hostelName || '—' },
    { key: 'building', label: 'Building', render: (r) => r.buildingName || '—' },
    { key: 'room', label: 'Room / Bed', render: (r) => <TwoLine top={r.roomNumber || '—'} sub={bedLine(r)} /> },
    { key: 'on', label: 'Allocated On', render: (r) => fmtDate(r.fromDate || r.createdAt), nowrap: true },
    { key: 'status', label: 'Status', render: (r) => (
      <span className="hs-stack">
        <StatusTag value={r.status} />
        {r.conflict ? <small className="is-bad" title="The bed's own record does not agree with this allocation">bed mismatch</small> : null}
        {r.accountInactive ? <small className="is-bad" title="This person's school account has been deactivated, but they still hold the bed">account inactive</small> : null}
      </span>
    ) },
  ];
  const historyColumns = [
    { key: 'at', label: 'Date', render: (r) => <TwoLine top={fmtDate(r.effectiveDate || r.createdAt)} sub={fmtTime(r.createdAt)} />, nowrap: true },
    { key: 'student', label: 'Student', render: (r) => <Person name={r.studentName} src={r.studentPhoto} sub={r.studentRoll ? `Roll ${r.studentRoll}` : r.studentClass} strong={false} /> },
    { key: 'action', label: 'Action', render: (r) => { const [text, tone] = ACTION[r.action] || [words(r.action), 'slate']; return <Badge tone={tone} strong>{text}</Badge>; } },
    { key: 'from', label: 'From', render: (r) => r.fromLabel || '—' },
    { key: 'to', label: 'To', render: (r) => r.toLabel || '—' },
    { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
    { key: 'by', label: 'By', render: (r) => r.performedByName || 'System' },
  ];

  const csv = (list) => exportCsv('hostel-allocations.csv', [
    { label: 'Student', value: (r) => r.studentName }, { label: 'Roll', value: (r) => r.studentRoll },
    { label: 'Class', value: (r) => r.studentClass }, { label: 'Hostel', value: (r) => r.hostelName },
    { label: 'Building', value: (r) => r.buildingName }, { label: 'Room', value: (r) => r.roomNumber },
    { label: 'Bed', value: (r) => r.bedCode || r.bedNumber }, { label: 'Allocated on', value: (r) => fmtDate(r.fromDate || r.createdAt) },
    { label: 'Status', value: (r) => (STATUS[r.status] || [r.status])[0] },
  ], list);

  return (
    <div className="hs-page">
      <PageHead title="Room & Bed Allocations" subtitle="Allocate, reallocate and manage hostel room & bed assignments for students.">
        {full ? <Btn icon="calendar" onClick={() => setRollover(true)}>Year-end Rollover</Btn> : null}
        <Btn className="hs-btn--accent" icon="upload" onClick={openBulk}>Bulk Allocate</Btn>
        <Btn kind="primary" icon="plus" onClick={() => openAllocate()}>Allocate</Btn>
      </PageHead>

      <Kpis cols={4} size="sm">
        <Kpi tone="violet" icon="bedSolid" value={t.allocated ?? 0} label="Total Allocated" />
        <Kpi tone="green" icon="checkCircle" value={t.active ?? 0} label="Active Allocations" pct={t.activePct ?? 0} pctTone="green" />
        <Kpi tone="amber" icon="clockSolid" value={t.pending ?? 0} label="Pending Allocation" pct={t.pendingPct ?? 0} pctTone="amber" />
        <Kpi tone="red" icon="personAlert" value={t.conflicts ?? 0} label="Conflicts" pct={t.conflictsPct ?? 0} pctTone="red" />
      </Kpis>

      <FilterBar>
        <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search by student name, roll no..." grow={2} width="262px" />
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v, building: '', room: '' })} all="All hostels"
          options={hostels.map((h) => ({ value: h._id, label: h.name }))} width="118px" />
        <FSelect value={state.building} onChange={(v) => set({ building: v, room: '' })} all="All buildings"
          options={buildings.map((b) => ({ value: b._id, label: b.name }))} width="118px" />
        <FSelect value={state.room} onChange={(v) => set({ room: v })} all="All rooms"
          options={roomOptions.map((r) => ({ value: r._id, label: r.roomNumber }))} width="118px" />
        <FSelect value={state.class} onChange={(v) => set({ class: v })} all="All classes"
          options={(meta?.classes || []).map((c) => ({ value: c._id, label: c.className }))} width="118px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All status" options={STATUS_FILTER} width="118px" />
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
      </FilterBar>

      <LineTabs value={state.tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Allocations by state"
        items={[
          { key: 'all', label: 'All Allocations', count: tabs.all ?? 0 },
          { key: 'active', label: 'Active', count: tabs.active ?? 0 },
          { key: 'pending', label: 'Pending', count: tabs.pending ?? 0 },
          { key: 'vacated', label: 'Vacated', count: tabs.vacated ?? 0 },
          { key: 'requests', label: 'Room Changes', count: pendingReqs || undefined, tone: 'warn' },
          { key: 'history', label: 'History' },
        ]} />

      {requests ? (
        <TransferRequests refreshKey={reqKey} canDecide={full} hostels={hostels} roomsById={roomsById}
          onDone={() => { setReqKey((k) => k + 1); reload(); }} />
      ) : (
      <ListCard>
        {history ? null : (
          <BulkBar count={selected.size} noun="allocation" onClear={() => setSelected(new Set())}>
            <Btn size="sm" icon="download" onClick={() => csv(rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
          </BulkBar>
        )}
        {history ? (
          <DataTable select={false} columns={historyColumns} rows={rows} loading={loading} pad={8} headPad={11}
            empty={<EmptyRows icon="history" title="No history yet">Every allocation, transfer and release is recorded here.</EmptyRows>} />
        ) : (
          <DataTable
            columns={columns} rows={rows} loading={loading} pad={7} headPad={11}
            selected={selected} onSelect={setSelected}
            actions={(r) => (
              <>
                <Btn size="sm" icon="eye" onClick={() => openProfile(r)}>View</Btn>
                {r.status === 'pending'
                  ? <Btn size="sm" icon="key" onClick={() => openConfirm(r)}>Allocate</Btn>
                  : <Btn size="sm" icon="pencil" disabled={r.status !== 'active'} title={r.status === 'active' ? undefined : 'A closed allocation cannot be changed'}
                    onClick={() => openTransfer(r)}>Edit</Btn>}
                <Kebab label={`Actions for ${r.studentName}`} items={[
                  { label: 'Hostel profile', icon: 'user', onClick: () => openProfile(r) },
                  { label: 'Allocation history', icon: 'history', onClick: () => openTrail(r) },
                  r.roomNumber && { label: 'Show on occupancy map', icon: 'grid', onClick: () => nav(`/admin/hostel/occupancy?hostel=${r.hostelId}`) },
                  LIVE.includes(r.status) && '-',
                  LIVE.includes(r.status) && { label: 'Transfer to another bed', icon: 'repeat', onClick: () => openTransfer(r) },
                  LIVE.includes(r.status) && { label: r.status === 'pending' ? 'Cancel the hold' : 'Release bed', icon: 'logOut', danger: true, onClick: () => openRelease(r) },
                ]} />
              </>
            )}
            empty={(
              <EmptyRows icon="bedSolid" title={filtered || state.tab !== 'all' ? 'No allocation matches' : 'No allocations yet'}
                action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={() => openAllocate()}>Allocate</Btn>}>
                {filtered || state.tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Give a student a bed — by hand, or let the engine pick one.'}
              </EmptyRows>
            )}
          />
        )}
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={history ? 'entries' : data?.total === 1 ? 'allocation' : 'allocations'} onPage={setPage} size="sm" />
      </ListCard>
      )}

      <RolloverModal open={rollover} onClose={() => setRollover(false)} years={years} hostels={hostels} onDone={reload} />

      {/* ── Allocate ──────────────────────────────────────────────────────── */}
      <FormModal open={modal === 'allocate'} onClose={() => setModal(null)} busy={busy} onSubmit={doAllocate}
        icon="oBed" title="Allocate a Bed" subtitle="Assign a bed to a student or a teacher for a specific duration with all validations."
        submitLabel={allocForm.hold && allocForm.mode === 'choose' ? 'Hold Bed' : 'Allocate Bed'} submitIcon="check"
        steps={[
          { key: 'student', title: 'Resident & Academic', sub: 'Select who the bed is for', icon: 'oBed' },
          { key: 'bed', title: 'Bed Selection', sub: 'Choose hostel, room and bed', icon: 'oBed' },
          { key: 'details', title: 'Allocation Details', sub: 'Set dates and type', icon: 'calendar' },
          { key: 'review', title: 'Review', sub: 'Verify information', icon: 'fileDoc' },
          { key: 'confirm', title: 'Confirm', sub: 'Complete allocation', icon: 'oCheckRound' },
        ]}
        aside={<>
          <SummaryCard icon="user" title={`${Who} Details`} rows={[
            ['Name', pickedStudent?.name], [staff ? 'Employee ID' : 'Admission No.', pickedStudent?.admissionNumber], [staff ? 'Designation' : 'Class', pickedStudent?.className],
            ['Gender', pickedStudent?.gender], ['Academic Year', years.find((y) => y._id === allocForm.academicYear)?.yearName],
            ['Current Status', pickedStudent ? <Badge tone="slate">No active allocation</Badge> : ''],
          ]} />
          <SummaryCard icon="mapPin" title="Selected Location" rows={allocForm.mode === 'auto' ? [
            ['Hostel', hostelName(allocForm.hostel) || 'Any suitable hostel'], ['Bed', 'Picked on allocation'],
          ] : [
            ['Hostel', hostelName(allocForm.hostel)], ['Building', nameIn(meta?.buildings, allocForm.building)], ['Floor', nameIn(meta?.floors, allocForm.floor)],
            ['Room', chosenRoom ? `${chosenRoom.roomNumber} (${roomTypeLabel(chosenRoom.roomType)})` : ''], ['Bed', chosenBed ? `Bed ${chosenBed.bedNumber}` : ''],
          ]} />
          <SummaryCard icon="calendar" title="Allocation Summary" rows={[
            ['Type', words(allocForm.allocationType)], ['From', dmy(allocForm.fromDate)], ['To', dmy(allocForm.toDate)],
            ['Status', allocForm.hold && allocForm.mode === 'choose' ? 'Held until confirmed' : 'Will be active'],
          ]} />
        </>}>
        <FormSection step="student" icon="user" title="Resident & Academic Details" sub="Choose who the bed is for, and the academic year.">
          <RadioCards label="Allocate To" value={allocForm.kind} options={RESIDENT_KINDS}
            onChange={(v) => { if (v === allocForm.kind) return; setPickedStudent(null); setAllocForm((f) => ({ ...f, kind: v, student: '', room: '', bed: '' })); }} />
          <Grid cols={2}>
            <Fld label={Who} required hint={`Only ${staff ? 'teachers' : 'students'} without a bed are listed`}>
              <StudentPicker kind={allocForm.kind} value={allocForm.student} onChange={(id, st) => {
                setPickedStudent(st || null);
                setAllocForm((f) => ({ ...f, student: id, hostel: f.hostel || hostelFor(st), building: f.hostel ? f.building : '', floor: f.hostel ? f.floor : '', room: f.hostel ? f.room : '', bed: f.hostel ? f.bed : '' }));
              }} params={{ onlyUnallocated: 'true' }} />
            </Fld>
            <Fld label="Academic Year" required icon="calendar">
              <select value={allocForm.academicYear} onChange={(e) => setAllocForm((f) => ({ ...f, academicYear: e.target.value }))}>
                <option value="">Select year</option>
                {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
              </select>
            </Fld>
          </Grid>
          {pickedStudent ? <PersonCard name={pickedStudent.name} photo={pickedStudent.profileImage} meta={studentMeta(pickedStudent)} badge={staff ? 'Teacher' : 'Active'} badgeTone={staff ? 'violet' : 'green'} /> : null}
          {staff && !usableBeds.length ? <InfoNote tone="amber">No free bed is marked for teachers. Under Rooms &amp; Beds, set a bed to “Teachers” or “Both” first.</InfoNote> : null}
        </FormSection>
        <FormSection step="bed" icon="oBed" title="Bed Selection" sub={`Only beds kept for ${staff ? 'teachers' : 'students'} (or for both) are offered.`}>
          <RadioCards value={allocForm.mode} onChange={(v) => setAllocForm((f) => ({ ...f, mode: v }))}
            options={[['choose', 'Choose a bed', 'Pick the hostel, room and bed yourself'], ['auto', 'Pick the best free bed', 'A partly-filled room of the right type first']]} />
          <Grid cols={3}>
            <Fld label="Hostel" required={allocForm.mode === 'choose'} icon="oBuilding" hint={genderClash} hintTone="bad">
              <select value={allocForm.hostel} onChange={(e) => setAllocForm((f) => ({ ...f, hostel: e.target.value, building: '', floor: '', room: '', bed: '' }))}>
                <option value="">{allocForm.mode === 'auto' ? 'Any suitable hostel' : 'Select hostel'}</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </Fld>
            {allocForm.mode === 'choose' ? (
              <>
                <Fld label="Building" required icon="oBuilding">
                  <select value={allocForm.building} disabled={!allocForm.hostel} onChange={(e) => setAllocForm((f) => ({ ...f, building: e.target.value, floor: '', room: '', bed: '' }))}>
                    <option value="">Select building</option>
                    {(meta?.buildings || []).filter((x) => String(x.hostel) === String(allocForm.hostel)).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
                  </select>
                </Fld>
                <Fld label="Floor" required icon="layers">
                  <select value={allocForm.floor} disabled={!allocForm.building} onChange={(e) => setAllocForm((f) => ({ ...f, floor: e.target.value, room: '', bed: '' }))}>
                    <option value="">Select floor</option>
                    {(meta?.floors || []).filter((x) => String(x.building) === String(allocForm.building)).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
                  </select>
                </Fld>
                <Fld label="Room Type" icon="oRows">
                  <select value={allocForm.roomType} onChange={(e) => setAllocForm((f) => ({ ...f, roomType: e.target.value, room: '', bed: '' }))}>
                    <option value="">Any type</option>
                    {ROOM_TYPES.filter(([v]) => v !== 'custom').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Fld>
                <Fld label="Room" required icon="oDoor" hint={chosenRoom ? `${freeIn(chosenRoom._id)} bed(s) available` : (allocForm.floor && !floorRooms.length ? 'No room on this floor has a free bed' : '')}
                  hintTone={chosenRoom ? 'good' : 'bad'}>
                  <select value={allocForm.room} disabled={!allocForm.floor} onChange={(e) => setAllocForm((f) => ({ ...f, room: e.target.value, bed: '' }))}>
                    <option value="">Select room</option>
                    {floorRooms.map((r) => <option key={r._id} value={r._id}>{r.roomNumber} ({freeIn(r._id)}/{r.capacity})</option>)}
                  </select>
                </Fld>
                <Fld label="Bed" required icon="oBed" hint={chosenBed ? 'Available' : ''} hintTone="good" className={chosenBed ? 'hsf-dot-good' : ''}>
                  <select value={allocForm.bed} disabled={!allocForm.room} onChange={(e) => setAllocForm((f) => ({ ...f, bed: e.target.value }))}>
                    <option value="">Select bed</option>
                    {usableBeds.filter((x) => String(x.room?._id || x.room) === String(allocForm.room)).map((x) => <option key={x._id} value={x._id}>{bedText(x)}</option>)}
                  </select>
                </Fld>
              </>
            ) : (
              <Fld label="Preferred Room Type" icon="oRows" span={2}>
                <select value={allocForm.roomType} onChange={(e) => setAllocForm((f) => ({ ...f, roomType: e.target.value }))}>
                  <option value="">No preference</option>
                  {ROOM_TYPES.filter(([v]) => v !== 'custom').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Fld>
            )}
          </Grid>
        </FormSection>
        <FormSection step="details" icon="calendar" title="Allocation Details" sub="Set the allocation period and type.">
          <Grid cols={3}>
            <Fld label="Allocation Type" required icon="oTag" hint={allocForm.allocationType === 'permanent' ? `Permanent allocation stays active until the ${Who.toLowerCase()} leaves the hostel.` : 'Ends on the To date.'}>
              <select value={allocForm.allocationType} onChange={(e) => setAllocForm((f) => ({ ...f, allocationType: e.target.value }))}>
                <option value="permanent">Permanent</option>
                <option value="temporary">Temporary</option>
              </select>
            </Fld>
            <Fld label="From Date" required icon="calendar">
              <input type="date" value={allocForm.fromDate} onChange={(e) => setAllocForm((f) => ({ ...f, fromDate: e.target.value }))} />
            </Fld>
            <Fld label="To Date" optional={allocForm.allocationType === 'permanent'} required={allocForm.allocationType === 'temporary'} icon="calendar"
              hint={allocForm.allocationType === 'permanent' ? 'Leave blank for permanent allocation' : 'When the temporary stay ends'}>
              <input type="date" min={allocForm.fromDate || undefined} value={allocForm.toDate} onChange={(e) => setAllocForm((f) => ({ ...f, toDate: e.target.value }))} />
            </Fld>
          </Grid>
          <InfoNote>Rules checked automatically: who the bed is for, gender restriction, room &amp; hostel capacity, hostel status and one active allocation per person.</InfoNote>
        </FormSection>
        <FormSection step="review" icon="fileDoc" title="Review" sub="Verify the allocation before it is made.">
          <ReviewList groups={[
            { title: Who, step: 0, rows: [[Who, pickedStudent?.name], [staff ? 'Designation' : 'Class', pickedStudent?.className], ['Academic year', years.find((y) => y._id === allocForm.academicYear)?.yearName]] },
            { title: 'Bed', step: 1, rows: allocForm.mode === 'auto'
              ? [['Hostel', hostelName(allocForm.hostel) || 'Any suitable hostel'], ['Bed', 'The best free bed, picked on allocation'], ['Room type', allocForm.roomType ? roomTypeLabel(allocForm.roomType) : 'No preference']]
              : [['Hostel', hostelName(allocForm.hostel)], ['Building', nameIn(meta?.buildings, allocForm.building)], ['Floor', nameIn(meta?.floors, allocForm.floor)],
                ['Room', chosenRoom?.roomNumber], ['Bed', chosenBed ? `Bed ${chosenBed.bedNumber}` : '']] },
            { title: 'Allocation', step: 2, rows: [['Type', words(allocForm.allocationType)], ['From', dmy(allocForm.fromDate)], ['To', dmy(allocForm.toDate) || 'Until they leave']] },
          ]} />
        </FormSection>
        <FormSection step="confirm" icon="oCheckRound" title="Confirm" sub="Complete the allocation.">
          <ToggleRow on={allocForm.hold && allocForm.mode === 'choose'} disabled={allocForm.mode !== 'choose'} onChange={(v) => setAllocForm((f) => ({ ...f, hold: v }))}
            label={`Hold this bed until the ${Who.toLowerCase()} arrives`}
            hint={allocForm.mode === 'choose' ? 'The allocation stays Pending — the bed is theirs, but they join the roll call only once you confirm it.' : 'Choose a bed yourself to hold it.'} />
          <Fld label="Remarks" optional icon="fileDoc">
            <input value={allocForm.remarks} maxLength={200} placeholder="Anything to note on this allocation" onChange={(e) => setAllocForm((f) => ({ ...f, remarks: e.target.value }))} />
          </Fld>
        </FormSection>
      </FormModal>

      {/* ── Bulk ──────────────────────────────────────────────────────────── */}
      <FormModal open={modal === 'bulk'} onClose={() => setModal(null)} busy={busy} onSubmit={doBulk} width={760}
        icon="users" title="Bulk Allocation" subtitle="Place several students at once; each is checked and placed on its own."
        submitLabel={`Allocate ${bulkForm.students.length || ''}`.trim()} submitIcon="check" hideSubmit={!!bulkResult} cancelLabel={bulkResult ? 'Close' : 'Cancel'}>
        {bulkResult ? (
          <FormSection>
            <InfoNote tone={bulkResult.failed.length ? 'amber' : 'blue'}>{bulkResult.allocated.length} student(s) placed, {bulkResult.failed.length} could not be.</InfoNote>
            {bulkResult.allocated.length ? (
              <div className="hs-result"><h4>Placed</h4>{bulkResult.allocated.map((x) => <p key={x.student}><strong>{x.studentName}</strong> → {x.hostel} · Room {x.room} · Bed {x.bed}</p>)}</div>
            ) : null}
            {bulkResult.failed.length ? (
              <div className="hs-result hs-result--bad"><h4>Not placed</h4>{bulkResult.failed.map((x) => <p key={x.student}><strong>{x.studentName}</strong> — {x.reason}</p>)}</div>
            ) : null}
          </FormSection>
        ) : (
          <FormSection>
            <Grid cols={3}>
              <Fld label="Academic Year" required icon="calendar">
                <select value={bulkForm.academicYear} onChange={(e) => setBulkForm((f) => ({ ...f, academicYear: e.target.value }))}>
                  {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
                </select>
              </Fld>
              <Fld label="Hostel" icon="oBuilding">
                <select value={bulkForm.hostel} onChange={(e) => setBulkForm((f) => ({ ...f, hostel: e.target.value }))}>
                  <option value="">Any suitable hostel</option>
                  {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
                </select>
              </Fld>
              <Fld label="Preferred Room Type" icon="oRows">
                <select value={bulkForm.preferredRoomType} onChange={(e) => setBulkForm((f) => ({ ...f, preferredRoomType: e.target.value }))}>
                  <option value="">No preference</option>
                  {ROOM_TYPES.filter(([v]) => v !== 'custom').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Fld>
            </Grid>
            <div className="hsf-fld">
              <span className="hsf-fld__label">Students <small>({bulkForm.students.length} selected of {students.length} waiting)</small></span>
              <div className="hsf-ctl has-icon"><span className="hsf-ctl__icon"><Glyph name="search" size={18} /></span>
                <input className="hsf-in" value={bulkSearch} placeholder="Filter by name, class or admission no." onChange={(e) => setBulkSearch(e.target.value)} /></div>
              <div className="hsf-checklist">
                <label className="hsf-checklist__all">
                  <input type="checkbox" className="hs-check" checked={bulkShown.length > 0 && bulkShown.every((x) => bulkForm.students.includes(x._id))}
                    onChange={(e) => setBulkForm((f) => ({ ...f, students: e.target.checked ? [...new Set([...f.students, ...bulkShown.map((x) => x._id)])] : f.students.filter((id) => !bulkShown.some((x) => x._id === id)) }))} />
                  Select all shown
                </label>
                {bulkShown.map((x) => (
                  <label key={x._id}>
                    <input type="checkbox" className="hs-check" checked={bulkForm.students.includes(x._id)}
                      onChange={(e) => setBulkForm((f) => ({ ...f, students: e.target.checked ? [...f.students, x._id] : f.students.filter((id) => id !== x._id) }))} />
                    <span>{x.name}</span><small>{studentMeta(x).join(' • ')}</small>
                  </label>
                ))}
                {!students.length ? <p className="hs-muted">Every student already has an allocation.</p> : null}
              </div>
            </div>
            <InfoNote>Each student is allocated in its own transaction — one failure never rolls back the rest.</InfoNote>
          </FormSection>
        )}
      </FormModal>

      {/* ── Edit (transfer) ───────────────────────────────────────────────── */}
      <FormModal open={modal === 'transfer'} onClose={() => setModal(null)} busy={busy} onSubmit={doTransfer}
        icon="swap" title="Transfer to Another Bed" subtitle={target ? `Move ${target.studentName} — bed, room, floor and hostel moves are all one step.` : ''}
        submitLabel="Transfer" submitIcon="check">
        {target ? (
          <FormSection>
            <PersonCard name={target.studentName} photo={target.studentPhoto} meta={[target.hostelName, target.roomNumber, target.bedNumber ? `Bed ${target.bedNumber}` : '']} badge="Current bed" badgeTone="slate" />
            <Fld label="Destination Bed" required icon="oBed" hint={`${usableBeds.length} free bed${usableBeds.length === 1 ? '' : 's'}`}>
              <select value={transferForm.bed} onChange={(e) => setTransferForm((f) => ({ ...f, bed: e.target.value }))}>
                <option value="">Select a free bed</option>
                {usableBeds.map((x) => <option key={x._id} value={x._id}>{[hostelName(x.hostel), bedOption(x)].filter(Boolean).join(' · ')}</option>)}
              </select>
            </Fld>
            <Fld label="Reason" optional count={[transferForm.reason.length, 300]}>
              <textarea rows={3} maxLength={300} value={transferForm.reason} placeholder="Why the student is moving" onChange={(e) => setTransferForm((f) => ({ ...f, reason: e.target.value }))} />
            </Fld>
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── Release ───────────────────────────────────────────────────────── */}
      <FormModal open={modal === 'release'} onClose={() => setModal(null)} busy={busy} onSubmit={doRelease}
        icon="oExit" iconTone="red" title="Release from Hostel" subtitle={target ? `${target.studentName} leaves ${target.hostelName || 'the hostel'} and the bed is freed.` : ''}
        submitLabel="Release" tone="danger">
        {target ? (
          <FormSection>
            <InfoNote tone="amber">The allocation is closed and the bed freed. The record itself is kept, so occupancy history stays intact.</InfoNote>
            <RadioCards value={releaseForm.status} onChange={(v) => setReleaseForm((f) => ({ ...f, status: v }))} label="Outcome"
              options={[['vacated', 'Vacated', 'The student checked out'], ['cancelled', 'Cancelled', 'The allocation was a mistake']]} />
            <Fld label="Reason" optional count={[releaseForm.reason.length, 300]}>
              <textarea rows={3} maxLength={300} value={releaseForm.reason} onChange={(e) => setReleaseForm((f) => ({ ...f, reason: e.target.value }))} />
            </Fld>
            {checkout ? (
              <>
                <dl className="hs-settle" aria-label="What this checkout settles">
                  <div className={checkout.outstandingDues > 0 ? 'is-bad' : ''}><dt>Outstanding dues</dt><dd>{rupees(checkout.outstandingDues)}</dd></div>
                  <div><dt>Security deposit held</dt><dd>{rupees(checkout.depositHeld)}</dd></div>
                  <div className={checkout.unreturnedAssets?.length ? 'is-bad' : ''}><dt>Items still on issue</dt><dd>{checkout.unreturnedAssets?.length || 0}</dd></div>
                </dl>
                {willEnd(checkout) ? <p className="hs-dtext">Also ended with the stay: {willEnd(checkout)}.{checkout.unpaidDeposits ? ' A deposit that was billed and never paid is cancelled.' : ''}</p> : null}
                {checkout.depositHeld > 0 && releaseForm.status === 'vacated' ? (
                  <>
                    <ToggleRow on={releaseForm.refundDeposit} onChange={(v) => setReleaseForm((f) => ({ ...f, refundDeposit: v }))}
                      label={`Refund the security deposit now (${rupees(checkout.depositHeld)})`}
                      hint={checkout.outstandingDues > 0 ? 'There are unpaid dues — you may want to collect them first; off keeps the deposit held' : 'Off keeps it held; it can be refunded later from Fees'} />
                    {releaseForm.refundDeposit ? (
                      <>
                        {checkout.depositInvoices?.some((x) => x.online) ? (
                          <ToggleRow on={releaseForm.refundViaGateway} onChange={(v) => setReleaseForm((f) => ({ ...f, refundViaGateway: v }))}
                            label="Send it back to the online payment" hint="Returned by the gateway to the card or account it was paid from; off records cash or a transfer from the office" />
                        ) : null}
                        {releaseForm.refundViaGateway ? null : (
                          <Fld label="Refund Reference" optional icon="oHash" hint="Cheque or transfer number">
                            <input data-text="code" maxLength={60} value={releaseForm.refundReference} onChange={(e) => setReleaseForm((f) => ({ ...f, refundReference: e.target.value }))} />
                          </Fld>
                        )}
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── Confirm a held bed ────────────────────────────────────────────── */}
      <FormModal open={modal === 'confirm'} onClose={() => setModal(null)} busy={busy} onSubmit={doConfirm}
        icon="checkCircle" iconTone="green" title="Confirm Allocation" subtitle="The held bed becomes the student’s, and they join the roll call."
        submitLabel="Confirm Allocation" submitIcon="check">
        {target ? (
          <FormSection>
            <PersonCard name={target.studentName} photo={target.studentPhoto} meta={[target.hostelName, target.roomNumber, target.bedNumber ? `Bed ${target.bedNumber}` : '']} badge="Held" badgeTone="amber" />
            <p className="hs-dtext">Confirming makes the allocation active: they join the roll call, and can ask for leave and outpasses. The student and their parents are told.</p>
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── Student hostel profile ────────────────────────────────────────── */}
      <Drawer open={!!profile} onClose={() => setProfile(null)} label="Hostel profile">
        {profile ? (
          <>
            <DrawerHead
              mark={<Avatar name={profile.student?.name || profile.name} src={profile.student?.profileImage || profile.photo} size={52} />}
              name={profile.student?.name || profile.name} sub={profile.loading ? '' : [profile.student?.profile?.currentClass?.className, profile.student?.profile?.admissionNumber].filter(Boolean).join(' · ')}
              tags={profile.loading ? null : <Badge tone={profile.hostelStatus === 'resident' ? 'green' : 'slate'}>{words(profile.hostelStatus)}</Badge>}
              onClose={() => setProfile(null)}
            />
            <DrawerBody>
              {profile.loading ? <p className="hs-muted">Loading…</p> : (
                <>
                  <div className="hs-dstats">
                    {[['Present days', profile.attendanceSummary?.present || 0], ['Absent days', profile.attendanceSummary?.absent || 0],
                      ['Leaves', profile.leaves?.length || 0], ['Outpasses', profile.outpasses?.length || 0],
                      ['Complaints', profile.complaints?.length || 0], ['Fees due', `₹${money(profile.feeSummary?.outstanding)}`]]
                      .map(([l, v]) => <div key={l}><strong>{v}</strong><span>{l}</span></div>)}
                  </div>
                  <DrawerSection title="Where they live">
                    <DrawerFields fields={[
                      ['Hostel', profile.current?.hostel?.name],
                      ['Building', profile.current?.building?.name],
                      ['Floor', profile.current?.floor?.name],
                      ['Room', profile.current?.room?.roomNumber],
                      ['Bed', profile.current?.bed?.bedNumber],
                      ['Warden', profile.warden?.name],
                      ['Joined', profile.current?.fromDate ? fmtDate(profile.current.fromDate) : ''],
                    ]} />
                    {!profile.current ? <p className="hs-muted">No current allocation.</p> : null}
                  </DrawerSection>
                  <DrawerSection title="Student">
                    <DrawerFields fields={[
                      ['Blood group', profile.student?.profile?.bloodGroup],
                      ['Emergency contact', profile.student?.profile?.emergencyContactName],
                      ['Emergency phone', fmtPhone(profile.student?.profile?.emergencyContactPhone)],
                      ['Discipline actions', profile.discipline?.length ? String(profile.discipline.length) : ''],
                    ]} />
                  </DrawerSection>
                  {profile.previousAllocations?.length ? (
                    <DrawerSection title="Previous allocations">
                      <dl>{profile.previousAllocations.map((a) => (
                        <DrawerField key={a._id} label={`${fmtDate(a.fromDate)} – ${a.vacatedDate ? fmtDate(a.vacatedDate) : ''}`}>
                          {[a.hostel?.name, a.room?.roomNumber, a.bed?.bedNumber ? `Bed ${a.bed.bedNumber}` : ''].filter(Boolean).join(' · ')} · {words(a.status)}
                        </DrawerField>
                      ))}</dl>
                    </DrawerSection>
                  ) : null}
                  {profile.discipline?.length ? (
                    <DrawerSection title="Discipline history">
                      <dl>{profile.discipline.map((d) => (
                        <DrawerField key={d._id} label={d.violation}>{words(d.actionType)}{d.isRepeatOffence ? ' · repeat' : ''}</DrawerField>
                      ))}</dl>
                    </DrawerSection>
                  ) : null}
                </>
              )}
            </DrawerBody>
            {!profile.loading && profile.student?._id ? (
              <DrawerFoot>
                <Btn icon="history" onClick={() => openTrail({ studentId: profile.student._id, studentName: profile.student.name })}>Allocation history</Btn>
              </DrawerFoot>
            ) : null}
          </>
        ) : null}
      </Drawer>

      {/* ── One student's allocation history ──────────────────────────────── */}
      <FormModal open={!!trail} onClose={() => setTrail(null)} width={700} icon="history" title="Allocation History"
        subtitle={trail?.name ? `Every move ${trail.name} has made, newest first.` : ''} hideSubmit cancelLabel="Close">
        <FormSection>
          {trail?.loading ? <p className="hs-muted">Loading…</p> : (
            <ol className="hs-trail">
              {(trail?.rows || []).map((h) => {
                const [text, tone] = ACTION[h.action] || [words(h.action), 'slate'];
                return (
                  <li key={h._id}>
                    <div><Badge tone={tone} strong>{text}</Badge><time>{fmtDate(h.effectiveDate)}</time></div>
                    <p>{[h.fromLabel, h.toLabel].filter(Boolean).join(' → ')}</p>
                    {h.reason ? <p className="hs-muted">{h.reason}</p> : null}
                    <small>by {h.performedByName || h.performedBy?.name || 'System'}</small>
                  </li>
                );
              })}
              {!trail?.rows?.length ? <li className="hs-muted">No history yet.</li> : null}
            </ol>
          )}
        </FormSection>
      </FormModal>
    </div>
  );
}
