/**
 * Hostel → Maintenance (Sep 2026 redesign, to the user's mockup).
 *
 * Five figures, a tab per state, two rows of filters and the work orders, from
 * GET /hostel/admin/board/maintenance. A work order is listed under ONE state —
 * done, late, being worked on, booked for a later day, or open — so the tabs
 * add up to the total. The workflow (assign → start → complete, with hold,
 * schedule and cancel) is the maintenance endpoint's and is unchanged;
 * completing a repeating job still books the next one.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { FileLink, di, useNewFromLink } from '../shared';
import { PageHead, Mark, words } from './hsUI';
import { FormModal, FormSection, Grid, Fld, FileDrop, ReviewList, dmy } from './hsForm';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, FDateRange, LineTabs, Btn, Kebab, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, TwoLine, Ico, useListState, useBoardData, exportCsv, fmtDate, rupees,
} from './hsList';
import { PRIORITIES, Priority, Assignee, MoreFilters, stamp } from './hsTags';

const CATEGORY = {
  electrical: ['red', 'bolt', 'amber'], plumbing: ['blue', 'drop', 'blue'], furniture: ['violet', 'chair', 'violet'], fan: ['amber', 'bolt', 'amber'],
  ac: ['sky', 'bolt', 'sky'], internet: ['indigo', 'wifi', 'indigo'], cleaning: ['pink', 'broom', 'pink'], room: ['green', 'door', 'green'],
  bathroom: ['teal', 'drop', 'teal'], common_area: ['orange', 'building', 'orange'], other: ['slate', 'wrench', 'slate'],
};
const TYPE = { corrective: 'blue', preventive: 'sky', scheduled: 'violet' };
const STATE = {
  open: ['Open', 'blue'], progress: ['In Progress', 'amber'], completed: ['Completed', 'green'], overdue: ['Overdue', 'red'],
  scheduled: ['Scheduled', 'violet'], cancelled: ['Cancelled', 'slate'],
};
const Category = ({ value }) => <Badge tone={(CATEGORY[value] || CATEGORY.other)[0]} size="lg">{words(value)}</Badge>;
const StateTag = ({ r }) => {
  const [text, tone] = r.state === 'progress' && r.status === 'on_hold' ? ['On Hold', 'slate'] : (STATE[r.state] || [words(r.state), 'slate']);
  return <Badge tone={tone} size="lg">{text}</Badge>;
};
const empty = {
  hostel: '', room: '', category: 'other', maintenanceType: 'corrective', priority: 'medium',
  title: '', description: '', estimatedCost: '', scheduledDate: '', recurEveryDays: '', attachments: [],
};
const blankAct = { technicianName: '', vendorName: '', cost: '', resolution: '', comment: '', scheduledDate: '' };
const FILTERS = { hostel: '', category: '', type: '', priority: '', status: '', from: '', to: '' };
/** Each step's title, icon and tone. */
const STEP_LOOK = {
  assign: ['Assign Work Order', 'userPlus', 'indigo'], start: ['Start Work', 'activity', 'blue'], hold: ['Put on Hold', 'clockSolid', 'amber'],
  complete: ['Complete Work Order', 'checkCircle', 'green'], cancel: ['Cancel Work Order', 'closeCircle', 'red'],
  comment: ['Add a Comment', 'chat', 'indigo'], schedule: ['Schedule Work Order', 'calendar', 'violet'],
};
const DONE = { assign: 'assigned', start: 'started', hold: 'put on hold', complete: 'completed', cancel: 'cancelled', comment: 'updated', schedule: 'scheduled' };
/** "B1 - Room 101", else the floor or the building, else nothing. */
const spot = (r) => (r.roomNumber ? `${r.buildingCode ? `${r.buildingCode} - ` : ''}${r.roomNumber}` : r.floorName || r.buildingName || '');
const live = (r) => !['completed', 'cancelled'].includes(r.status);

export default function Maintenance() {
  const nav = useNavigate();
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS });
  const tab = ['open', 'progress', 'completed', 'overdue', 'scheduled'].includes(state.tab) ? state.tab : 'all';
  const { data, loading, reload } = useBoardData((q) => api.getBoard('maintenance', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [act, setAct] = useState(null);
  const [actForm, setActForm] = useState(blankAct);
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const rooms = (meta?.rooms || []).filter((r) => !form.hostel || String(r.hostel) === form.hostel);

  const open = () => { setForm(empty); setModal(true); };
  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(true, () => open());
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'hostel' ? { room: '' } : {}) }));

  const save = async () => {
    setSaving(true);
    try {
      await api.createMaintenance({
        ...form, room: form.room || null,
        estimatedCost: Number(form.estimatedCost) || 0,
        recurEveryDays: Number(form.recurEveryDays) || 0,
        scheduledDate: form.scheduledDate || null,
      });
      toast.success('Work order raised'); setModal(false); reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const ask = (row, action) => {
    setAct({ row, action });
    setActForm({ ...blankAct, technicianName: row.technicianName || '', vendorName: row.vendorName || '',
      cost: action === 'complete' ? String(row.estimatedCost || '') : '', scheduledDate: row.scheduledDate ? di(row.scheduledDate) : '' });
  };
  const submitAct = async () => {
    setBusy(true);
    try {
      const r = await api.actOnMaintenance(act.row._id, {
        action: act.action,
        technicianName: actForm.technicianName, vendorName: actForm.vendorName,
        cost: actForm.cost === '' ? null : Number(actForm.cost),
        resolution: actForm.resolution, comment: actForm.comment,
        scheduledDate: actForm.scheduledDate || null,
      });
      const d = r.data ?? r;
      toast.success(`Work order ${DONE[act.action] || 'updated'}`);
      if (d.nextScheduled) toast(`Next preventive job scheduled for ${fmtDate(d.nextScheduled.scheduledDate)}`, { icon: '🔁' });
      setAct(null); setDetail(null); reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const openSchedule = async () => {
    setSchedule({ loading: true });
    try {
      const r = await api.getBoard('maintenance', { tab: 'scheduled', sort: 'due', dir: 'asc', limit: 100 });
      setSchedule({ rows: (r.data ?? r).rows || [] });
    } catch (err) { toast.error(err.message); setSchedule(null); }
  };

  /** What may be done with a work order from where it stands. */
  const steps = (r) => [
    r.status === 'open' && { label: 'Assign', icon: 'userPlus', onClick: () => ask(r, 'assign') },
    ['open', 'assigned', 'on_hold'].includes(r.status) && { label: 'Start work', icon: 'activity', onClick: () => ask(r, 'start') },
    r.status === 'in_progress' && { label: 'Put on hold', icon: 'clock', onClick: () => ask(r, 'hold') },
    live(r) && { label: 'Complete', icon: 'checkCircle', onClick: () => ask(r, 'complete') },
    live(r) && { label: 'Reschedule', icon: 'calendar', onClick: () => ask(r, 'schedule') },
    live(r) && r.status !== 'open' && { label: 'Reassign', icon: 'userPlus', onClick: () => ask(r, 'assign') },
    { label: 'Add an update', icon: 'chat', onClick: () => ask(r, 'comment') },
    live(r) && '-',
    live(r) && { label: 'Cancel work order', icon: 'trash', danger: true, onClick: () => ask(r, 'cancel') },
  ];

  const t = data?.tiles || {};
  const tabs = data?.tabs || {};
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'title', label: 'Title', render: (r) => {
      const [, glyph, tone] = CATEGORY[r.category] || CATEGORY.other;
      return (
        <span className="hs-person">
          <Mark name={glyph} tone={tone} size={30} glyph={16} />
          <TwoLine top={r.title || r.description} sub={r.requestNumber ? `#${r.requestNumber}` : ''} />
        </span>
      );
    } },
    { key: 'cat', label: 'Category', render: (r) => <Category value={r.category} /> },
    { key: 'type', label: 'Type', render: (r) => <Badge tone={TYPE[r.maintenanceType] || 'slate'} size="lg">{words(r.maintenanceType)}</Badge> },
    { key: 'where', label: 'Hostel / Location', render: (r) => <TwoLine top={r.hostelName || '—'} sub={spot(r)} /> },
    { key: 'priority', label: 'Priority', render: (r) => <Priority value={r.priority} /> },
    { key: 'status', label: 'Status', render: (r) => <StateTag r={r} /> },
    { key: 'to', label: 'Assigned To', render: (r) => <Assignee name={r.assignedName} src={r.assignedPhoto} /> },
    { key: 'due', label: 'Due Date', render: (r) => (r.scheduledDate
      ? <span className={`hs-due${r.state === 'overdue' ? ' is-late' : ''}`}><Ico name="calendar" size={15} />{fmtDate(r.scheduledDate)}</span>
      : <span className="hs-muted">-</span>), nowrap: true },
  ];

  const csv = (list) => exportCsv('hostel-maintenance.csv', [
    { label: 'Work order', value: (r) => r.requestNumber }, { label: 'Title', value: (r) => r.title }, { label: 'Description', value: (r) => r.description },
    { label: 'Category', value: (r) => words(r.category) }, { label: 'Type', value: (r) => words(r.maintenanceType) }, { label: 'Priority', value: (r) => words(r.priority) },
    { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Location', value: (r) => spot(r) }, { label: 'Status', value: (r) => (STATE[r.state] || [r.state])[0] },
    { label: 'Assigned to', value: (r) => r.assignedName }, { label: 'Due', value: (r) => (r.scheduledDate ? fmtDate(r.scheduledDate) : '') },
    { label: 'Completed', value: (r) => stamp(r.completedAt) }, { label: 'Estimated cost', value: (r) => r.estimatedCost }, { label: 'Actual cost', value: (r) => r.actualCost },
  ], list);
  const exportAll = async () => {
    try { const res = await api.getBoard('maintenance', { ...state, page: 1, limit: 5000 }); csv((res.data ?? res).rows || []); }
    catch (err) { toast.error(err.message); }
  };

  return (
    <div className="hs-page">
      <PageHead title="Maintenance" subtitle="Manage corrective, scheduled and preventive work orders for hostel facilities.">
        <Btn className="hs-btn--accent" icon="download" onClick={exportAll}>Export</Btn>
        <Btn className="hs-btn--accent" icon="calendar" onClick={openSchedule}>Maintenance Schedule</Btn>
        <Btn kind="primary" icon="plus" onClick={open}>Create Work Order</Btn>
      </PageHead>

      <Kpis cols={5} size="lg">
        <Kpi tone="violet" icon="wrench" value={t.total ?? 0} label="Total Work Orders" delta={t.delta} />
        <Kpi tone="green" icon="checkCircle" value={t.completed ?? 0} label="Completed" pct={t.completedPct ?? 0} pctTone="green" bar inline barColor="#12b76a" />
        <Kpi tone="amber" icon="clockSolid" value={t.progress ?? 0} label="In Progress" pct={t.progressPct ?? 0} pctTone="amber" bar inline barColor="#f79009" />
        <Kpi tone="red" icon="alertTri" value={t.overdue ?? 0} label="Overdue" pct={t.overduePct ?? 0} pctTone="red" bar inline barColor="#f04438" />
        <Kpi tone="sky" icon="calendar" value={t.scheduled ?? 0} label="Scheduled (Preventive)" pct={t.scheduledPct ?? 0} pctTone="blue" bar inline barColor="#2563eb" />
      </Kpis>

      <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Work orders by state"
        items={[
          { key: 'all', label: 'All Work Orders', count: tabs.all ?? 0 },
          { key: 'open', label: 'Open', count: tabs.open ?? 0 },
          { key: 'progress', label: 'In Progress', count: tabs.progress ?? 0 },
          { key: 'completed', label: 'Completed', count: tabs.completed ?? 0 },
          { key: 'overdue', label: 'Overdue', count: tabs.overdue ?? 0, tone: 'bad' },
          { key: 'scheduled', label: 'Scheduled', count: tabs.scheduled ?? 0 },
        ]} />

      <FilterBar below={(
        <>
          <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search by title, asset, room, or ID..." grow={0} width="420px" />
          <span className="hs-filters__end">
            <MoreFilters groups={[
              { key: 'order', title: 'Order by', value: state.sort || '', onPick: (v) => set({ sort: v, dir: v === 'due' ? 'asc' : '' }), options: [['', 'Newest first'], ['due', 'Due date, soonest first']] },
            ]} />
            <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
          </span>
        </>
      )}>
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={hostels.map((h) => ({ value: h._id, label: h.name }))} width="140px" />
        <FSelect value={state.category} onChange={(v) => set({ category: v })} all="All categories" options={Object.keys(CATEGORY).map((c) => ({ value: c, label: words(c) }))} width="140px" />
        <FSelect value={state.type} onChange={(v) => set({ type: v })} all="All types" options={Object.keys(TYPE).map((c) => ({ value: c, label: words(c) }))} width="130px" />
        <FSelect value={state.priority} onChange={(v) => set({ priority: v })} all="All priorities" options={PRIORITIES.map((p) => ({ value: p, label: words(p) }))} width="130px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={Object.entries(STATE).map(([value, [label]]) => ({ value, label }))} width="150px" />
        <FDateRange from={state.from} to={state.to} onChange={(v) => set(v)} grow={1.5} width="230px" icon={false} />
      </FilterBar>

      <ListCard>
        <BulkBar count={selected.size} noun="work order" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => csv(rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={5} headPad={11} dense
          selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" icon="eye" onClick={() => setDetail(r)}>View</Btn>
              <Kebab label={`Actions for ${r.requestNumber}`} items={[{ label: 'View work order', icon: 'eye', onClick: () => setDetail(r) }, '-', ...steps(r)]} />
            </>
          )}
          empty={(
            <EmptyRows icon="wrench" title={filtered || tab !== 'all' ? 'No work order matches' : 'No work orders'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={open}>Create Work Order</Btn>}>
              {filtered || tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Repairs, scheduled jobs and preventive checks are raised and followed here.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'work order' : 'work orders'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      {/* ── New work order ────────────────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save}
        icon="oWrench" title="New Work Order" subtitle="Log a repair or a scheduled job, where it is and how urgent."
        submitLabel="Raise Work Order" submitIcon="check"
        steps={[
          { key: 'work', title: 'Work Details', sub: 'Where, what and how urgent', icon: 'oWrench' },
          { key: 'plan', title: 'Schedule & Cost', sub: 'When, and the estimate', icon: 'calendar' },
          { key: 'photos', title: 'Photos', sub: 'Pictures of the problem', icon: 'paperclip', optional: true },
          { key: 'review', title: 'Review', sub: 'Confirm and raise', icon: 'oCheckRound' },
        ]}>
        <FormSection step="work" icon="mapPin" title="Location" sub="Where the work is needed.">
          <Grid cols={2}>
            <Fld label="Hostel" required icon="oBuilding">
              <select value={form.hostel} onChange={(e) => setF('hostel', e.target.value)}>
                <option value="">Select hostel</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </Fld>
            <Fld label="Room" icon="oDoor">
              <select value={form.room} disabled={!form.hostel} onChange={(e) => setF('room', e.target.value)}>
                <option value="">Common area / not room specific</option>
                {rooms.map((r) => <option key={r._id} value={r._id}>{r.roomNumber}</option>)}
              </select>
            </Fld>
          </Grid>
        </FormSection>
        <FormSection step="work" icon="oWrench" title="Problem" sub="What needs doing.">
          <Grid cols={3}>
            <Fld label="Category" required icon="oTag">
              <select value={form.category} onChange={(e) => setF('category', e.target.value)}>
                {Object.keys(CATEGORY).map((c) => <option key={c} value={c}>{words(c)}</option>)}
              </select>
            </Fld>
            <Fld label="Type" required icon="oRows">
              <select value={form.maintenanceType} onChange={(e) => setF('maintenanceType', e.target.value)}>
                {Object.keys(TYPE).map((x) => <option key={x} value={x}>{words(x)}</option>)}
              </select>
            </Fld>
            <Fld label="Priority" required icon="alert">
              <select value={form.priority} onChange={(e) => setF('priority', e.target.value)}>
                {PRIORITIES.map((x) => <option key={x} value={x}>{words(x)}</option>)}
              </select>
            </Fld>
          </Grid>
          <Fld label="Title" optional icon="oWrench"><input value={form.title} maxLength={100} placeholder="e.g. AC not cooling" onChange={(e) => setF('title', e.target.value)} /></Fld>
          <Fld label="Description" required count={[form.description.length, 1000]}>
            <textarea rows={3} maxLength={1000} value={form.description} placeholder="What is wrong, and anything the technician should know" onChange={(e) => setF('description', e.target.value)} />
          </Fld>
        </FormSection>
        <FormSection step="plan" icon="calendar" title="Schedule & Cost" sub="Leave the date empty to do it as soon as possible.">
          <Grid cols={3}>
            <Fld label="Estimated Cost (₹)" icon="rupee"><input step="0.01" type="number" min="0" value={form.estimatedCost} placeholder="e.g. 1500" onChange={(e) => setF('estimatedCost', e.target.value)} /></Fld>
            <Fld label="Due / Scheduled Date" icon="calendar" required={form.maintenanceType !== 'corrective'}
              hint={form.maintenanceType !== 'corrective' ? 'A scheduled job needs its date' : ''}>
              <input type="date" value={form.scheduledDate} onChange={(e) => setF('scheduledDate', e.target.value)} />
            </Fld>
            <Fld label="Repeat Every (Days)" icon="refresh" hint="Completing it books the next one">
              <input type="number" min="0" max="365" value={form.recurEveryDays} placeholder="0 = once" onChange={(e) => setF('recurEveryDays', e.target.value)} />
            </Fld>
          </Grid>
        </FormSection>
        <FormSection step="photos" icon="paperclip" title="Photos" sub="Pictures or documents of the problem (optional).">
          <FileDrop value={form.attachments} onChange={(v) => setF('attachments', v)} entityType="HostelMaintenance" />
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Confirm the work order before it is raised.">
          <ReviewList groups={[
            { title: 'Where', step: 0, rows: [['Hostel', hostels.find((h) => h._id === form.hostel)?.name], ['Room', rooms.find((r) => r._id === form.room)?.roomNumber || 'Common area']] },
            { title: 'Problem', step: 0, rows: [['Title', form.title], ['Category', words(form.category)], ['Type', words(form.maintenanceType)], ['Priority', words(form.priority)], ['Description', form.description]] },
            { title: 'Schedule & cost', step: 1, rows: [['Due', dmy(form.scheduledDate) || 'As soon as possible'], ['Repeats', Number(form.recurEveryDays) ? `Every ${form.recurEveryDays} days` : 'No'], ['Estimate', form.estimatedCost ? `₹${form.estimatedCost}` : '']] },
            { title: 'Photos', step: 2, rows: [['Files', form.attachments.length ? `${form.attachments.length} attached` : 'None']] },
          ]} />
        </FormSection>
      </FormModal>

      {/* ── One step ──────────────────────────────────────────────────────── */}
      <FormModal open={!!act} onClose={() => setAct(null)} busy={busy} onSubmit={submitAct}
        icon={STEP_LOOK[act?.action]?.[1] || 'oWrench'} iconTone={STEP_LOOK[act?.action]?.[2] || 'indigo'}
        title={act ? STEP_LOOK[act.action]?.[0] || words(act.action) : ''} subtitle={act ? [act.row.requestNumber, act.row.title || act.row.description].filter(Boolean).join(' · ') : ''}
        submitLabel={act ? STEP_LOOK[act.action]?.[0] || 'Confirm' : 'Confirm'} tone={act?.action === 'cancel' ? 'danger' : undefined}
        cancelLabel={act?.action === 'cancel' ? 'Keep Work Order' : 'Cancel'}>
        {act ? (
          <FormSection>
            {act.action === 'assign' ? (
              <Grid cols={2}>
                <Fld label="Technician" icon="user"><input data-text="name" value={actForm.technicianName} maxLength={80} onChange={(e) => setActForm((f) => ({ ...f, technicianName: e.target.value }))} /></Fld>
                <Fld label="Vendor" icon="briefcase"><input data-text="title" value={actForm.vendorName} maxLength={80} onChange={(e) => setActForm((f) => ({ ...f, vendorName: e.target.value }))} /></Fld>
              </Grid>
            ) : null}
            {act.action === 'complete' ? (
              <>
                <Fld label="Actual Cost (₹)" icon="rupee"><input step="0.01" type="number" min="0" value={actForm.cost} onChange={(e) => setActForm((f) => ({ ...f, cost: e.target.value }))} /></Fld>
                <Fld label="Resolution" required hint="A linked complaint is resolved automatically" count={[actForm.resolution.length, 500]}>
                  <textarea rows={3} maxLength={500} value={actForm.resolution} onChange={(e) => setActForm((f) => ({ ...f, resolution: e.target.value }))} />
                </Fld>
              </>
            ) : null}
            {act.action === 'schedule' ? (
              <Fld label="Due / Scheduled Date" required icon="calendar"><input type="date" value={actForm.scheduledDate} onChange={(e) => setActForm((f) => ({ ...f, scheduledDate: e.target.value }))} /></Fld>
            ) : null}
            <Fld label={act.action === 'cancel' ? 'Reason' : 'Comment'} required={['comment', 'cancel'].includes(act.action)} optional={!['comment', 'cancel'].includes(act.action)} count={[actForm.comment.length, 300]}>
              <textarea rows={2} maxLength={300} value={actForm.comment} onChange={(e) => setActForm((f) => ({ ...f, comment: e.target.value }))} />
            </Fld>
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── Detail ────────────────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Work order details">
        {detail ? (
          <>
            <DrawerHead
              mark={<Mark name={(CATEGORY[detail.category] || CATEGORY.other)[1]} tone={(CATEGORY[detail.category] || CATEGORY.other)[2]} size={52} glyph={26} />}
              name={detail.title || detail.requestNumber} sub={detail.requestNumber ? `#${detail.requestNumber}` : ''}
              tags={<><StateTag r={detail} /><Priority value={detail.priority} /><Category value={detail.category} /></>}
              onClose={() => setDetail(null)}
            />
            <DrawerBody>
              <DrawerSection title="Work order">
                <p className="hs-dtext">{detail.description}</p>
                <DrawerFields fields={[
                  ['Type', words(detail.maintenanceType)], ['Hostel', detail.hostelName], ['Location', spot(detail)], ['Asset', detail.assetName],
                  ['Technician', detail.technicianName], ['Vendor', detail.vendorName],
                  ['Due / scheduled', detail.scheduledDate ? fmtDate(detail.scheduledDate) : ''],
                  ['Repeats', detail.recurEveryDays > 0 ? `Every ${detail.recurEveryDays} day${detail.recurEveryDays === 1 ? '' : 's'}` : ''],
                  ['Raised on', stamp(detail.createdAt)], ['Started', stamp(detail.startedAt)], ['Completed', stamp(detail.completedAt)],
                  ['Estimated cost', detail.estimatedCost ? rupees(detail.estimatedCost) : ''], ['Actual cost', detail.actualCost ? rupees(detail.actualCost) : ''],
                  ['Resolution', detail.resolution],
                ]} />
                {detail.complaintNumber ? (
                  <p className="hs-muted">Raised from complaint <button type="button" className="hs-linkbtn" onClick={() => nav(`/admin/hostel/complaints?search=${encodeURIComponent(detail.complaintNumber)}`)}>#{detail.complaintNumber}</button>.</p>
                ) : null}
              </DrawerSection>
              {detail.attachments?.length ? (
                <DrawerSection title={`Attachments (${detail.attachments.length})`}>
                  <div className="hs-chips">
                    {detail.attachments.map((f) => <FileLink key={f} name={f} />)}
                  </div>
                </DrawerSection>
              ) : null}
              <DrawerSection title={`Updates (${detail.updates?.length || 0})`}>
                {detail.updates?.length ? (
                  <ul className="hs-thread">
                    {detail.updates.map((u, i) => (
                      <li key={u._id || i}><div><strong>{u.byName || 'Staff'}</strong><span>{stamp(u.at)}</span></div><p>{u.text}</p></li>
                    ))}
                  </ul>
                ) : <p className="hs-muted">No updates yet.</p>}
              </DrawerSection>
            </DrawerBody>
            <DrawerFoot>
              <Kebab label="More steps" items={steps(detail)} />
              {live(detail) ? <Btn kind="primary" icon="checkCircle" onClick={() => ask(detail, 'complete')}>Complete</Btn> : null}
            </DrawerFoot>
          </>
        ) : null}
      </Drawer>

      {/* ── Maintenance Schedule ──────────────────────────────────────────── */}
      <Drawer open={!!schedule} onClose={() => setSchedule(null)} label="Maintenance schedule">
        <DrawerHead mark={<Mark name="calendar" tone="sky" size={52} glyph={26} />} name="Maintenance Schedule"
          sub="Preventive and scheduled jobs still to come, soonest first" onClose={() => setSchedule(null)} />
        <DrawerBody>
          {schedule?.loading ? <p className="hs-muted">Loading…</p> : schedule?.rows?.length ? (
            <ul className="hs-livelist">
              {schedule.rows.map((r) => (
                <li key={r._id}>
                  <button type="button" className="hs-linkrow" onClick={() => { setSchedule(null); setDetail(r); }}>
                    <TwoLine top={r.title || r.description} sub={[r.hostelName, spot(r), r.recurEveryDays > 0 ? `every ${r.recurEveryDays} days` : ''].filter(Boolean).join(' · ')} />
                  </button>
                  <Badge tone="violet">{fmtDate(r.scheduledDate)}</Badge>
                </li>
              ))}
            </ul>
          ) : <EmptyRows icon="calendar" title="Nothing is scheduled">Raise a preventive or scheduled work order with a date — and “repeat every” to keep it coming round.</EmptyRows>}
        </DrawerBody>
      </Drawer>
    </div>
  );
}
