/**
 * Hostel → Warden & Staff (Sep 2026 redesign, to the user's mockup).
 *
 * Four figures, a tab per kind of post, the filters and the staff table, from
 * GET /hostel/admin/board/staff. A row is an ASSIGNMENT — an existing employee
 * holding a post at a hostel — not a separate staff record: the people come
 * from the school's own employees, and a warden set here is the warden the
 * rest of the module reads off the hostel.
 */
import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { di, useNewFromLink } from '../shared';
import { PageHead, words } from './hsUI';
import { GhostArt } from './hsArt';
import { FormModal, FormSection, Grid, Fld, ChipSelect, ReviewList, ConfirmDialog, ampm, dmy } from './hsForm';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, LineTabs, Btn, Kebab, Popover, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, Avatar, TwoLine, useListState, useBoardData, exportCsv, fmtDate, fmtPhone,
} from './hsList';

const ROLES = ['warden', 'assistant_warden', 'caretaker', 'security', 'housekeeping', 'mess_staff', 'maintenance', 'floor_supervisor'];
const SHIFTS = ['morning', 'evening', 'night', 'general', 'rotational'];
const empty = {
  staff: '', hostel: '', building: '', floor: '', role: 'warden', shift: 'general',
  shiftStart: '', shiftEnd: '', responsibilities: [], fromDate: '', remarks: '',
};
const DUTIES = ['night_rounds', 'gate_register', 'roll_call', 'mess_supervision', 'visitor_desk', 'room_inspection', 'medical_first_aid', 'cleaning_schedule', 'maintenance_rounds'];
/** The usual hours of a shift, filled in when one is picked (and still editable). */
const SHIFT_HOURS = { morning: ['06:00', '14:00'], evening: ['14:00', '22:00'], night: ['22:00', '06:00'], general: ['09:00', '17:00'] };
/** The post as the mockup tags it: the two warden posts by name, every other post as support staff. */
const RoleTag = ({ role }) => (role === 'warden' ? <Badge tone="lavender" size="lg">Warden</Badge>
  : role === 'assistant_warden' ? <Badge tone="blue" size="lg">Assistant Warden</Badge>
    : <Badge tone="amber" size="lg" title={words(role)}>{words(role)}</Badge>);
const StatusTag = ({ value }) => <Badge tone={value === 'active' ? 'green' : 'red'} size="lg">{value === 'active' ? 'Active' : 'Inactive'}</Badge>;
const shiftHours = (r) => (r.shiftStart ? `${r.shiftStart} - ${r.shiftEnd || ''}`.trim() : '');
const where = (r) => [r.buildingName, r.floorName].filter(Boolean).join(' · ') || 'Whole hostel';
const FILTERS = { hostel: '', role: '', status: '', shift: '' };

export default function Staff() {
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS });
  const tab = ['wardens', 'assistants', 'support', 'inactive'].includes(state.tab) ? state.tab : 'all';
  const { data, loading, reload } = useBoardData((q) => api.getBoard('staff', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const staffPool = meta?.staff || [];

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [more, setMore] = useState(false);
  const moreBtn = useRef(null);

  const buildings = (meta?.buildings || []).filter((b) => !form.hostel || String(b.hostel) === form.hostel);
  const floors = (meta?.floors || []).filter((f) => (form.building ? String(f.building) === form.building : !form.hostel || String(f.hostel) === form.hostel));

  const setF = (k, v) => setForm((f) => ({
    ...f, [k]: v,
    ...(k === 'hostel' ? { building: '', floor: '' } : {}),
    ...(k === 'building' ? { floor: '' } : {}),
  }));

  const open = (row) => {
    if (row) {
      setEditId(row._id);
      setForm({
        ...empty,
        staff: row.staffId, hostel: row.hostelId, building: row.buildingId || '', floor: row.floorId || '',
        role: row.role, shift: row.shift || 'general', shiftStart: row.shiftStart || '', shiftEnd: row.shiftEnd || '',
        responsibilities: row.responsibilities || [],
        fromDate: row.fromDate ? di(row.fromDate) : '', remarks: row.remarks || '',
      });
    } else {
      const now = new Date();
      setEditId(null);
      setForm({ ...empty, hostel: state.hostel || hostels[0]?._id || '', shiftStart: '09:00', shiftEnd: '17:00',
        fromDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` });
    }
    setModal(true);
  };
  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(!!meta, () => open());

  const save = async () => {
    setSaving(true);
    try {
      const p = { ...form, building: form.building || null, floor: form.floor || null, responsibilities: form.responsibilities };
      if (editId) await api.updateStaff(editId, p); else await api.assignStaff(p);
      toast.success(editId ? 'Assignment updated' : 'Staff assigned');
      setModal(false); setDetail(null); reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const end = async () => {
    try { await api.endStaff(del._id); toast.success('Assignment ended'); setDel(null); setDetail(null); reload(); }
    catch (err) { toast.error(err.message); setDel(null); }
  };
  const reactivate = async (row) => {
    try { await api.updateStaff(row._id, { status: 'active' }); toast.success(`${row.staffName} is back on duty`); setDetail(null); reload(); }
    catch (err) { toast.error(err.message); }
  };

  const t = data?.tiles || {};
  const tabs = data?.tabs || {};
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'who', label: 'Name & Contact', render: (r) => (
      <span className="hs-person">
        <Avatar name={r.staffName} src={r.staffPhoto} size={38} />
        <span className="hs-two hs-two--three">
          <span className="hs-two__top">{r.staffName || '—'}</span>
          {r.staffPhone ? <span className="hs-two__sub">{fmtPhone(r.staffPhone)}</span> : null}
          {r.staffEmail ? <span className="hs-two__sub">{r.staffEmail}</span> : null}
        </span>
      </span>
    ) },
    { key: 'role', label: 'Role', render: (r) => <RoleTag role={r.role} /> },
    { key: 'where', label: 'Hostel / Location', render: (r) => <TwoLine top={r.hostelName || '—'} sub={where(r)} /> },
    { key: 'shift', label: 'Shift', render: (r) => <TwoLine top={words(r.shift)} sub={shiftHours(r)} /> },
    { key: 'joined', label: 'Joined On', render: (r) => fmtDate(r.fromDate), nowrap: true },
    { key: 'status', label: 'Status', render: (r) => <StatusTag value={r.status} /> },
  ];

  const csv = (list) => exportCsv('hostel-staff.csv', [
    { label: 'Name', value: (r) => r.staffName }, { label: 'Phone', value: (r) => r.staffPhone }, { label: 'Email', value: (r) => r.staffEmail },
    { label: 'Role', value: (r) => words(r.role) }, { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Location', value: (r) => where(r) },
    { label: 'Shift', value: (r) => words(r.shift) }, { label: 'Shift hours', value: (r) => shiftHours(r) },
    { label: 'Joined on', value: (r) => fmtDate(r.fromDate) }, { label: 'Status', value: (r) => words(r.status) },
    { label: 'Responsibilities', value: (r) => (r.responsibilities || []).join('; ') },
  ], list);
  const exportAll = async () => {
    try {
      const res = await api.getBoard('staff', { ...state, page: 1, limit: 5000 });
      csv((res.data ?? res).rows || []);
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="hs-page">
      <PageHead title="Warden & Hostel Staff" subtitle="Manage wardens and hostel staff with role assignments, hostel allocation and duty details.">
        <Btn className="hs-btn--accent" icon="download" onClick={exportAll}>Export</Btn>
        <Btn kind="primary" icon="plus" onClick={() => open()}>Add Staff</Btn>
      </PageHead>

      <Kpis cols={4} size="lg">
        <Kpi tone="indigo" icon="people" value={t.total ?? 0} label="Total Staff" labelTone="indigo"
          delta={t.change != null ? { pct: t.change, unit: '' } : null} art={<GhostArt kind="people" />} />
        <Kpi tone="green" icon="shieldSolid" value={t.wardens ?? 0} label="Wardens" pct={t.wardensPct ?? 0} pctTone="green" bar inline barColor="#12b76a" />
        <Kpi tone="blue" icon="person" value={t.assistants ?? 0} label="Assistant Wardens" labelTone="blue" pct={t.assistantsPct ?? 0} pctTone="blue" bar inline barColor="#2563eb" />
        <Kpi tone="amber" icon="hardhat" value={t.support ?? 0} label="Support Staff" labelTone="amber" pct={t.supportPct ?? 0} pctTone="amber" bar inline barColor="#f79009" />
      </Kpis>

      <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Staff by post"
        items={[
          { key: 'all', label: 'All Staff', count: tabs.all ?? 0 },
          { key: 'wardens', label: 'Wardens', count: tabs.wardens ?? 0 },
          { key: 'assistants', label: 'Assistant Wardens', count: tabs.assistants ?? 0 },
          { key: 'support', label: 'Support Staff', count: tabs.support ?? 0, tone: 'bad' },
          { key: 'inactive', label: 'Inactive', count: tabs.inactive ?? 0, tone: 'bad' },
        ]} />

      <FilterBar>
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={hostels.map((h) => ({ value: h._id, label: h.name }))} grow={0} width="148px" />
        <FSelect value={state.role} onChange={(v) => set({ role: v })} all="All roles" options={ROLES.map((r) => ({ value: r, label: words(r) }))} grow={0} width="180px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} grow={0} width="165px" />
        <span className="hs-filters__spacer" />
        <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search by name, email or phone..." grow={0} width="288px" />
        <Btn ref={moreBtn} icon="filter" aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((o) => !o)}>Filter{state.shift ? ' · 1' : ''}</Btn>
        <Popover anchor={moreBtn} open={more} onClose={() => setMore(false)} label="Filter by shift">
          <div className="hs-menu2" role="menu">
            <button type="button" role="menuitemradio" aria-checked={!state.shift} className={`hs-menu2__item${!state.shift ? ' is-on' : ''}`}
              onClick={() => { set({ shift: '' }); setMore(false); }}><span>All shifts</span></button>
            {SHIFTS.map((k) => (
              <button key={k} type="button" role="menuitemradio" aria-checked={state.shift === k} className={`hs-menu2__item${state.shift === k ? ' is-on' : ''}`}
                onClick={() => { set({ shift: k }); setMore(false); }}><span>{words(k)} shift</span></button>
            ))}
          </div>
        </Popover>
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
      </FilterBar>

      <ListCard>
        <BulkBar count={selected.size} noun="staff member" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => csv(rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={5} headPad={12} dense
          selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" icon="pencil" onClick={() => open(r)}>Edit</Btn>
              <Kebab label={`Actions for ${r.staffName}`} items={[
                { label: 'View details', icon: 'eye', onClick: () => setDetail(r) },
                '-',
                r.status === 'active'
                  ? { label: 'End assignment', icon: 'logOut', danger: true, onClick: () => setDel(r) }
                  : { label: 'Reactivate', icon: 'refresh', onClick: () => reactivate(r) },
              ]} />
            </>
          )}
          empty={(
            <EmptyRows icon="people" title={filtered || tab !== 'all' ? 'No staff member matches' : 'No staff assigned'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={() => open()}>Add Staff</Btn>}>
              {filtered || tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Give an employee a post at a hostel — warden, caretaker, security and the rest.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'staff member' : 'staff members'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      {/* ── Assign / edit ─────────────────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save}
        icon="users" title={editId ? 'Edit Assignment' : 'Assign Hostel Staff'}
        subtitle="Post an existing employee to a hostel with their role, shift and duties."
        submitLabel={editId ? 'Save Changes' : 'Assign Staff'} submitIcon="check"
        steps={[
          { key: 'who', title: 'Employee & Role', sub: 'Who, and in what post', icon: 'user' },
          { key: 'where', title: 'Posting', sub: 'Hostel, building and floor', icon: 'oBuilding' },
          { key: 'shift', title: 'Shift & Duties', sub: 'Hours and responsibilities', icon: 'clock' },
          { key: 'review', title: 'Review', sub: 'Confirm and assign', icon: 'oCheckRound' },
        ]}>
        <FormSection step="who" icon="user" title="Employee & Role" sub="Everyone here is an existing employee from the school's staff records.">
          <Grid cols={2}>
            <Fld label="Employee" required icon="user" hint={editId ? 'The employee on a post cannot change' : ''}>
              <select value={form.staff} disabled={!!editId} onChange={(e) => setF('staff', e.target.value)}>
                <option value="">Select employee</option>
                {staffPool.map((x) => <option key={x._id} value={x._id}>{x.name} ({x.role === 'school_admin' ? 'admin' : 'teacher'})</option>)}
              </select>
            </Fld>
            <Fld label="Role" required icon="shield" hint={['warden', 'assistant_warden'].includes(form.role) ? 'Also set as the hostel’s own warden' : ''}>
              <select value={form.role} onChange={(e) => setF('role', e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{words(r)}</option>)}
              </select>
            </Fld>
          </Grid>
        </FormSection>
        <FormSection step="where" icon="oBuilding" title="Posting" sub="Where they work. Leave the building and floor empty for the whole hostel.">
          <Grid cols={3}>
            <Fld label="Hostel" required icon="oBuilding">
              <select value={form.hostel} disabled={!!editId} onChange={(e) => setF('hostel', e.target.value)}>
                <option value="">Select hostel</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </Fld>
            <Fld label="Building" icon="oBuilding">
              <select value={form.building} onChange={(e) => setF('building', e.target.value)}>
                <option value="">Whole hostel</option>
                {buildings.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </Fld>
            <Fld label="Floor" icon="layers">
              <select value={form.floor} onChange={(e) => setF('floor', e.target.value)}>
                <option value="">All floors</option>
                {floors.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
              </select>
            </Fld>
          </Grid>
        </FormSection>
        <FormSection step="shift" icon="clock" title="Shift & Duties" sub="When they are on duty, and what they look after.">
          <Grid cols={4}>
            <Fld label="Shift" icon="clock">
              <select value={form.shift} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, shift: v, ...(SHIFT_HOURS[v] ? { shiftStart: SHIFT_HOURS[v][0], shiftEnd: SHIFT_HOURS[v][1] } : {}) })); }}>
                {SHIFTS.map((x) => <option key={x} value={x}>{words(x)}</option>)}
              </select>
            </Fld>
            <Fld label="Shift Start"><input type="time" value={form.shiftStart} onChange={(e) => setF('shiftStart', e.target.value)} /></Fld>
            <Fld label="Shift End" hint={form.shiftStart && form.shiftEnd && form.shiftEnd < form.shiftStart ? 'Ends the next morning' : ''}><input type="time" value={form.shiftEnd} onChange={(e) => setF('shiftEnd', e.target.value)} /></Fld>
            <Fld label="From Date" icon="calendar"><input type="date" value={form.fromDate} onChange={(e) => setF('fromDate', e.target.value)} /></Fld>
          </Grid>
          <Fld label="Responsibilities" optional hint="Pick from the list, or type your own and press Enter">
            <ChipSelect value={form.responsibilities} onChange={(v) => setF('responsibilities', v)} options={DUTIES} label="Responsibilities" icon="oTag" allowNew placeholder="Add a duty" />
          </Fld>
          <Fld label="Remarks" optional icon="fileDoc"><input value={form.remarks} maxLength={200} onChange={(e) => setF('remarks', e.target.value)} /></Fld>
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Confirm the posting.">
          <ReviewList groups={[
            { title: 'Employee', step: 0, rows: [['Employee', staffPool.find((x) => x._id === form.staff)?.name], ['Role', words(form.role)]] },
            { title: 'Posting', step: 1, rows: [['Hostel', hostels.find((h) => h._id === form.hostel)?.name], ['Building', buildings.find((b) => b._id === form.building)?.name || 'Whole hostel'], ['Floor', floors.find((f) => f._id === form.floor)?.name || 'All floors']] },
            { title: 'Shift & duties', step: 2, rows: [['Shift', `${words(form.shift)}${form.shiftStart ? ` · ${ampm(form.shiftStart)} – ${ampm(form.shiftEnd)}` : ''}`], ['From', dmy(form.fromDate)], ['Duties', form.responsibilities.map(words)], ['Remarks', form.remarks]] },
          ]} />
        </FormSection>
      </FormModal>

      {/* ── Detail ────────────────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Staff details">
        {detail ? (
          <>
            <DrawerHead
              mark={<Avatar name={detail.staffName} src={detail.staffPhoto} size={52} />}
              name={detail.staffName} sub={detail.staffEmail}
              tags={<><StatusTag value={detail.status} /><RoleTag role={detail.role} /></>}
              onClose={() => setDetail(null)}
            />
            <DrawerBody>
              <DrawerSection title="Post">
                <DrawerFields fields={[
                  ['Hostel', detail.hostelName], ['Covers', where(detail)],
                  ['Shift', words(detail.shift)], ['Shift hours', shiftHours(detail)],
                  ['Joined on', fmtDate(detail.fromDate)], ['Ended on', detail.toDate ? fmtDate(detail.toDate) : ''],
                  ['Remarks', detail.remarks],
                ]} />
              </DrawerSection>
              <DrawerSection title="Responsibilities">
                {detail.responsibilities?.length
                  ? <div className="hs-chips">{detail.responsibilities.map((x) => <Badge key={x} tone="slate">{x}</Badge>)}</div>
                  : <p className="hs-muted">None recorded.</p>}
              </DrawerSection>
              <DrawerSection title="Contact">
                <DrawerFields fields={[['Phone', fmtPhone(detail.staffPhone)], ['Email', detail.staffEmail]]} />
              </DrawerSection>
            </DrawerBody>
            <DrawerFoot>
              {detail.status === 'active'
                ? <Btn kind="danger" onClick={() => setDel(detail)}>End assignment</Btn>
                : <Btn icon="refresh" onClick={() => reactivate(detail)}>Reactivate</Btn>}
              <Btn kind="primary" icon="pencil" onClick={() => open(detail)}>Edit</Btn>
            </DrawerFoot>
          </>
        ) : null}
      </Drawer>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={end} confirmLabel="End Assignment" icon="oExit"
        title="End Assignment"
        message={`End ${del?.staffName}'s ${words(del?.role).toLowerCase()} assignment? The record is kept in history.`} />
    </div>
  );
}
