/**
 * Hostel → Complaints (Sep 2026 redesign, to the user's mockup).
 *
 * Five figures, a tab per stage, the filters and the tickets table, from
 * GET /hostel/admin/board/complaints. A ticket past its SLA and still not
 * dealt with is listed as Overdue whatever its stage; the stage itself is on
 * its drawer, with the ladder of what may be done next.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Alert } from '../../../components/ui/index';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerField, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { FileLink, useNewFromLink } from '../shared';
import { PageHead, Mark, words } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, FDateRange, LineTabs, Btn, Kebab, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, TwoLine, useListState, useBoardData, exportCsv, fmtDate, fmtTime,
} from './hsList';
import { roomTight } from './hsPeople';
import { FormModal, FormSection, Grid, Fld, RadioCards, ToggleRow, StudentPicker, FileDrop, ReviewList } from './hsForm';
import { PRIORITIES, Priority, Assignee, DueDate, stamp } from './hsTags';

const CATEGORY = {
  room: 'sky', mess: 'red', cleaning: 'green', security: 'violet', maintenance: 'lavender', staff: 'amber',
  food: 'orange', facilities: 'blue', internet: 'indigo', other: 'slate',
};
const Category = ({ value }) => <Badge tone={CATEGORY[value] || 'slate'} size="lg">{words(value)}</Badge>;
const STATUS = {
  open: ['Open', 'blue'], assigned: ['Open', 'blue'], in_progress: ['In Progress', 'amber'], resolved: ['Resolved', 'green'],
  reopened: ['Reopened', 'blue'], closed: ['Closed', 'green'], rejected: ['Rejected', 'slate'],
};
/** A live ticket past its SLA reads Overdue on the list; its real stage is on the drawer. */
const StatusTag = ({ r, real }) => {
  if (r.overdue && !real) return <Badge tone="red" size="lg">Overdue</Badge>;
  const [text, tone] = real && r.status === 'assigned' ? ['Assigned', 'blue'] : (STATUS[r.status] || [words(r.status), 'slate']);
  return <Badge tone={tone} size="lg">{text}</Badge>;
};
const STATUS_FILTER = [['open', 'Open'], ['progress', 'In progress'], ['overdue', 'Overdue'], ['escalated', 'Escalated'], ['resolved', 'Resolved'], ['reopened', 'Reopened'], ['closed', 'Closed'], ['rejected', 'Rejected']]
  .map(([value, label]) => ({ value, label }));
const empty = { hostel: '', room: '', student: '', category: 'other', priority: 'medium', subject: '', description: '', attachments: [] };
const FILTERS = { hostel: '', category: '', priority: '', status: '', from: '', to: '' };
const where = (r) => (r.roomNumber ? roomTight(r).replace('-', ' - ') : '');
/** Each step's title, icon and tone. */
const STEP_LOOK = {
  assign: ['Assign Complaint', 'userPlus', 'indigo'], start: ['Start Work', 'activity', 'blue'], resolve: ['Resolve Complaint', 'checkCircle', 'green'],
  reopen: ['Reopen Complaint', 'refresh', 'amber'], close: ['Close Complaint', 'check', 'green'], reject: ['Reject Complaint', 'closeCircle', 'red'],
  escalate: ['Escalate Complaint', 'alert', 'orange'], comment: ['Add a Comment', 'chat', 'indigo'], prioritize: ['Change Priority', 'sliders', 'violet'],
};
const DONE = { assign: 'assigned', start: 'started', resolve: 'resolved', reopen: 'reopened', close: 'closed', reject: 'rejected', escalate: 'escalated', comment: 'updated', prioritize: 'updated' };

/** What may be done with a ticket, from where it stands. */
const LADDER = (status) => [
  !['closed', 'rejected'].includes(status) && ['assign', 'Assign', 'userPlus'],
  ['open', 'assigned', 'reopened'].includes(status) && ['start', 'Start work', 'activity'],
  !['resolved', 'closed', 'rejected'].includes(status) && ['resolve', 'Resolve', 'checkCircle'],
  ['resolved', 'closed'].includes(status) && ['reopen', 'Reopen', 'refresh'],
  status === 'resolved' && ['close', 'Close', 'check'],
  !['closed', 'rejected'].includes(status) && ['escalate', 'Escalate', 'alert'],
  !['closed', 'rejected'].includes(status) && ['prioritize', 'Change priority', 'sliders'],
  ['comment', 'Add a comment', 'chat'],
  !['resolved', 'closed', 'rejected'].includes(status) && ['reject', 'Reject', 'closeCircle'],
].filter(Boolean);

export default function Complaints() {
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS });
  const tab = ['open', 'progress', 'resolved', 'reopened', 'closed', 'rejected'].includes(state.tab) ? state.tab : 'all';
  const { data, loading, reload } = useBoardData((q) => api.getBoard('complaints', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const staff = meta?.staff || [];

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [act, setAct] = useState(null);
  const [actForm, setActForm] = useState({ comment: '', assignedTo: '', resolution: '', priority: '', internal: true });
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const rooms = (meta?.rooms || []).filter((r) => !form.hostel || String(r.hostel) === form.hostel);

  const open = () => { setForm(empty); setModal(true); };
  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(true, () => open());
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'hostel' ? { room: '' } : {}) }));

  const save = async () => {
    setSaving(true);
    try {
      await api.createComplaint({ ...form, room: form.room || null, student: form.student || null });
      toast.success('Complaint raised'); setModal(false); reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const openDetail = async (row) => {
    setDetail({ loading: true, subject: row.subject, ticketNumber: row.ticketNumber, _id: row._id });
    try { const r = await api.getComplaint(row._id); setDetail({ ...(r.data ?? r), overdue: row.overdue }); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const ask = (row, action) => {
    setAct({ row, action });
    setActForm({ comment: '', assignedTo: row.assignedId || row.assignedTo?._id || '', resolution: row.resolution || '', priority: row.priority, internal: true });
  };
  const submitAct = async () => {
    setBusy(true);
    try {
      await api.actOnComplaint(act.row._id, {
        action: act.action,
        comment: actForm.comment,
        assignedTo: actForm.assignedTo || null,
        resolution: actForm.resolution,
        priority: actForm.priority || null,
        internal: actForm.internal,
      });
      toast.success(`Complaint ${DONE[act.action] || 'updated'}`);
      const row = act.row;
      setAct(null); reload();
      if (detail?._id === row._id) openDetail({ ...row, overdue: detail.overdue });
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const escalateAll = async () => {
    try {
      const r = await api.escalateComplaints();
      const d = r.data ?? r;
      toast.success(d.message || `${d.escalated} complaint(s) escalated`);
      reload();
    } catch (err) { toast.error(err.message); }
  };

  const t = data?.tiles || {};
  const tabs = data?.tabs || {};
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'subject', label: 'Subject', render: (r) => <TwoLine top={r.subject || r.description} sub={r.ticketNumber ? `#${r.ticketNumber}` : ''} /> },
    { key: 'cat', label: 'Category', render: (r) => <Category value={r.category} /> },
    { key: 'room', label: 'Hostel / Room', render: (r) => <TwoLine top={r.hostelName || '—'} sub={where(r)} /> },
    { key: 'by', label: 'Reported By', render: (r) => (r.studentName
      ? <TwoLine top={r.studentName} sub={[r.studentClass, r.studentRoll ? `Roll ${r.studentRoll}` : ''].filter(Boolean).join(' | ')} />
      : <TwoLine top={r.raisedByName || '—'} sub={words(r.raisedByRole)} />) },
    { key: 'priority', label: 'Priority', render: (r) => <Priority value={r.priority} /> },
    { key: 'status', label: 'Status', render: (r) => (
      <span className="hs-stack"><StatusTag r={r} />{r.escalationLevel > 0 ? <small className="is-bad">escalated · L{r.escalationLevel}</small> : null}</span>
    ) },
    { key: 'to', label: 'Assigned To', render: (r) => <Assignee name={r.assignedName} src={r.assignedPhoto} /> },
    { key: 'on', label: 'Reported On', render: (r) => <TwoLine top={fmtDate(r.createdAt)} sub={fmtTime(r.createdAt)} />, nowrap: true },
    { key: 'due', label: 'Due Date', render: (r) => <DueDate at={r.dueAt} late={r.overdue} />, nowrap: true },
  ];

  const csv = (list) => exportCsv('hostel-complaints.csv', [
    { label: 'Ticket', value: (r) => r.ticketNumber }, { label: 'Subject', value: (r) => r.subject }, { label: 'Description', value: (r) => r.description },
    { label: 'Category', value: (r) => words(r.category) }, { label: 'Priority', value: (r) => words(r.priority) },
    { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room', value: (r) => r.roomNumber }, { label: 'Reported by', value: (r) => r.studentName || r.raisedByName },
    { label: 'Status', value: (r) => (r.overdue ? 'Overdue' : words(r.status)) }, { label: 'Assigned to', value: (r) => r.assignedName },
    { label: 'Reported on', value: (r) => stamp(r.createdAt) }, { label: 'Due', value: (r) => stamp(r.dueAt) }, { label: 'Resolved on', value: (r) => stamp(r.resolutionDate) },
  ], list);
  const exportAll = async () => {
    try { const res = await api.getBoard('complaints', { ...state, page: 1, limit: 5000 }); csv((res.data ?? res).rows || []); }
    catch (err) { toast.error(err.message); }
  };

  const ladder = (r) => LADDER(r.status).map(([action, text, icon]) => ({ label: text, icon, danger: action === 'reject', onClick: () => ask(r, action) }));

  return (
    <div className="hs-page">
      <PageHead title="Hostel Complaints" subtitle="Manage room, mess, cleaning, security and facilities complaints with SLA and escalation.">
        <Btn className="hs-btn--accent" icon="warn" onClick={escalateAll}>Escalate Breached</Btn>
        <Btn className="hs-btn--accent" icon="download" onClick={exportAll}>Export</Btn>
        <Btn kind="primary" icon="plus" onClick={open}>Raise Complaint</Btn>
      </PageHead>

      <Kpis cols={5} size="lg">
        <Kpi tone="indigo" icon="chatSolid" value={t.total ?? 0} label="Total Complaints" delta={t.delta} />
        <Kpi tone="green" icon="checkCircle" value={t.resolved ?? 0} label="Resolved" pct={t.resolvedPct ?? 0} pctTone="green" bar barColor="#12b76a" />
        <Kpi tone="amber" icon="clockSolid" value={t.progress ?? 0} label="In Progress" pct={t.progressPct ?? 0} pctTone="amber" bar inline barColor="#f79009" />
        <Kpi tone="red" icon="alertTri" value={t.overdue ?? 0} label="Overdue" pct={t.overduePct ?? 0} pctTone="red" bar inline barColor="#f04438" />
        <Kpi tone="sky" icon="cycle" value={t.reopened ?? 0} label="Reopened" pct={t.reopenedPct ?? 0} pctTone="blue" bar inline barColor="#2b8ef0" />
      </Kpis>

      <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Complaints by stage"
        items={[
          { key: 'all', label: 'All Complaints', count: tabs.all ?? 0 },
          { key: 'open', label: 'Open', count: tabs.open ?? 0 },
          { key: 'progress', label: 'In Progress', count: tabs.progress ?? 0 },
          { key: 'resolved', label: 'Resolved', count: tabs.resolved ?? 0 },
          { key: 'reopened', label: 'Reopened', count: tabs.reopened ?? 0, tone: 'bad' },
          { key: 'closed', label: 'Closed', count: tabs.closed ?? 0 },
          { key: 'rejected', label: 'Rejected', count: tabs.rejected ?? 0, tone: 'bad' },
        ]} />

      <FilterBar>
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={hostels.map((h) => ({ value: h._id, label: h.name }))} grow={0} width="150px" />
        <FSelect value={state.category} onChange={(v) => set({ category: v })} all="All categories" options={Object.keys(CATEGORY).map((c) => ({ value: c, label: words(c) }))} grow={0} width="150px" />
        <FSelect value={state.priority} onChange={(v) => set({ priority: v })} all="All priorities" options={PRIORITIES.map((p) => ({ value: p, label: words(p) }))} grow={0} width="152px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={STATUS_FILTER} grow={0} width="152px" />
        <FDateRange from={state.from} to={state.to} onChange={(v) => set(v)} grow={0} width="246px" icon={false} />
        <FSearch compact value={state.search} onChange={(v) => set({ search: v })} placeholder="Search by complaint ID, subject, student..." grow={1} width="200px" />
      </FilterBar>

      <ListCard>
        <BulkBar count={selected.size} noun="complaint" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => csv(rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={6} headPad={11} dense
          selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" icon="eye" onClick={() => openDetail(r)}>View</Btn>
              <Kebab label={`Actions for ${r.ticketNumber}`} items={[{ label: 'View complaint', icon: 'eye', onClick: () => openDetail(r) }, '-', ...ladder(r)]} />
            </>
          )}
          empty={(
            <EmptyRows icon="chatSolid" title={filtered || tab !== 'all' ? 'No complaint matches' : 'No complaints'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={open}>Raise Complaint</Btn>}>
              {filtered || tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Room, mess, cleaning and security complaints are raised and followed here.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'complaint' : 'complaints'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      {/* ── Raise ─────────────────────────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save}
        icon="chatSolid" title="Raise a Complaint" subtitle="Log a room, mess, cleaning, security or facilities problem; it is tracked against its SLA."
        submitLabel="Raise Complaint" submitIcon="check"
        steps={[
          { key: 'what', title: 'Complaint', sub: 'What is wrong, and how urgent', icon: 'chat' },
          { key: 'where', title: 'Location & Person', sub: 'Where, and on whose behalf', icon: 'mapPin' },
          { key: 'files', title: 'Attachments', sub: 'Photos or documents', icon: 'paperclip', optional: true },
          { key: 'review', title: 'Review', sub: 'Confirm and raise', icon: 'oCheckRound' },
        ]}>
        <FormSection step="what" icon="chat" title="Complaint" sub="Describe the problem.">
          <Grid cols={2}>
            <Fld label="Category" required icon="oTag">
              <select value={form.category} onChange={(e) => setF('category', e.target.value)}>
                {Object.keys(CATEGORY).map((c) => <option key={c} value={c}>{words(c)}</option>)}
              </select>
            </Fld>
            <Fld label="Priority" required icon="alert">
              <select value={form.priority} onChange={(e) => setF('priority', e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{words(p)}</option>)}
              </select>
            </Fld>
          </Grid>
          <Fld label="Subject" optional icon="chat"><input value={form.subject} maxLength={100} placeholder="e.g. Water leaking in the bathroom" onChange={(e) => setF('subject', e.target.value)} /></Fld>
          <Fld label="Description" required count={[form.description.length, 1000]}>
            <textarea rows={4} maxLength={1000} value={form.description} placeholder="What is wrong, since when, and anything else that helps" onChange={(e) => setF('description', e.target.value)} />
          </Fld>
        </FormSection>
        <FormSection step="where" icon="mapPin" title="Location & Person" sub="Where the problem is, and who raised it.">
          <Grid cols={2}>
            <Fld label="Hostel" required icon="oBuilding">
              <select value={form.hostel} onChange={(e) => setF('hostel', e.target.value)}>
                <option value="">Select hostel</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </Fld>
            <Fld label="Room" icon="oDoor">
              <select value={form.room} disabled={!form.hostel} onChange={(e) => setF('room', e.target.value)}>
                <option value="">— none —</option>
                {rooms.map((r) => <option key={r._id} value={r._id}>{r.roomNumber}</option>)}
              </select>
            </Fld>
          </Grid>
          <Fld label="On Behalf Of" optional hint="Leave empty when a member of staff is raising it">
            <StudentPicker value={form.student} onChange={(id) => setF('student', id)} params={{ allocated: 'true' }} required={false} placeholder="Nobody in particular — raised by staff" />
          </Fld>
        </FormSection>
        <FormSection step="files" icon="paperclip" title="Attachments" sub="Photos or documents of the problem (optional).">
          <FileDrop value={form.attachments} onChange={(v) => setF('attachments', v)} entityType="HostelComplaint" />
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Confirm the complaint before it is raised.">
          <ReviewList groups={[
            { title: 'Complaint', step: 0, rows: [['Category', words(form.category)], ['Priority', words(form.priority)], ['Subject', form.subject], ['Description', form.description]] },
            { title: 'Where', step: 1, rows: [['Hostel', hostels.find((h) => h._id === form.hostel)?.name], ['Room', rooms.find((r) => r._id === form.room)?.roomNumber], ['On behalf of', form.student ? 'A resident' : 'Staff']] },
            { title: 'Attachments', step: 2, rows: [['Files', form.attachments.length ? `${form.attachments.length} attached` : 'None']] },
          ]} />
        </FormSection>
      </FormModal>

      {/* ── Detail, with the ladder of what may be done next ───────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Complaint details">
        {detail ? (
          <>
            <DrawerHead
              mark={<Mark name="chatSolid" tone="indigo" size={52} glyph={26} />}
              name={detail.subject || detail.ticketNumber || 'Complaint'} sub={detail.ticketNumber ? `#${detail.ticketNumber}` : ''}
              tags={detail.loading ? null : <><StatusTag r={detail} real /><Priority value={detail.priority} /><Category value={detail.category} />{detail.overdue ? <Badge tone="red">SLA breached</Badge> : null}</>}
              onClose={() => setDetail(null)}
            />
            <DrawerBody>
              {detail.loading ? <p className="hs-muted">Loading…</p> : (
                <>
                  {detail.escalationLevel > 0 ? (
                    <Alert variant="warning">Escalated to level {detail.escalationLevel}{detail.escalatedAt ? ` on ${fmtDate(detail.escalatedAt)}` : ''}{detail.escalatedTo?.name ? ` — to ${detail.escalatedTo.name}` : ''}.</Alert>
                  ) : null}
                  <DrawerSection title="Complaint">
                    <p className="hs-dtext">{detail.description}</p>
                    <DrawerFields fields={[
                      ['Raised by', detail.student?.name || words(detail.raisedByRole)], ['Hostel', detail.hostel?.name], ['Room', detail.room?.roomNumber],
                      ['Assigned to', detail.assignedTo?.name || 'Nobody yet'], ['Raised on', stamp(detail.createdAt)], ['SLA due', stamp(detail.dueAt)],
                      ['Resolved on', stamp(detail.resolutionDate)], ['Resolved by', detail.resolvedBy?.name], ['Resolution', detail.resolution],
                      ['Reopened', detail.reopenCount ? `${detail.reopenCount} time${detail.reopenCount === 1 ? '' : 's'}` : ''],
                      ['Rating', detail.rating ? `${detail.rating} of 5` : ''],
                    ]} />
                  </DrawerSection>
                  {detail.attachments?.length ? (
                    <DrawerSection title={`Attachments (${detail.attachments.length})`}>
                      <div className="hs-chips">
                        {detail.attachments.map((f) => <FileLink key={f} name={f} />)}
                      </div>
                    </DrawerSection>
                  ) : null}
                  <DrawerSection title={`Conversation (${detail.comments?.length || 0})`}>
                    {detail.comments?.length ? (
                      <ul className="hs-thread">
                        {detail.comments.map((c) => (
                          <li key={c._id}>
                            <div><strong>{c.byName || 'Staff'}</strong><span>{words(c.byRole)}{c.internal ? ' · internal' : ''} · {stamp(c.at)}</span></div>
                            <p>{c.text}</p>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="hs-muted">Nothing has been said yet.</p>}
                  </DrawerSection>
                  {detail.maintenance?.length ? (
                    <DrawerSection title="Linked maintenance">
                      <dl>{detail.maintenance.map((m) => <DrawerField key={m._id} label={m.requestNumber}>{words(m.category)} · {words(m.status)}</DrawerField>)}</dl>
                    </DrawerSection>
                  ) : null}
                </>
              )}
            </DrawerBody>
            {!detail.loading ? (
              <DrawerFoot>
                <Kebab label="More steps" items={ladder(detail).slice(2)} />
                {ladder(detail).slice(0, 2).map((x, i) => <Btn key={x.label} kind={i === 1 ? 'primary' : 'outline'} icon={x.icon} onClick={x.onClick}>{x.label}</Btn>)}
              </DrawerFoot>
            ) : null}
          </>
        ) : null}
      </Drawer>

      {/* ── One step of the ladder ─────────────────────────────────────────── */}
      <FormModal open={!!act} onClose={() => setAct(null)} busy={busy} onSubmit={submitAct}
        icon={STEP_LOOK[act?.action]?.[1] || 'chat'} iconTone={STEP_LOOK[act?.action]?.[2] || 'indigo'}
        title={act ? STEP_LOOK[act.action]?.[0] || words(act.action) : ''} subtitle={act ? [act.row.ticketNumber && `#${act.row.ticketNumber}`, act.row.subject].filter(Boolean).join(' · ') : ''}
        submitLabel={act ? STEP_LOOK[act.action]?.[0] || 'Confirm' : 'Confirm'} tone={act?.action === 'reject' ? 'danger' : undefined}>
        {act ? (
          <FormSection>
            {['assign', 'escalate'].includes(act.action) ? (
              <Fld label={act.action === 'assign' ? 'Assign To' : 'Escalate To'} required={act.action === 'assign'} icon="user">
                <select value={actForm.assignedTo} onChange={(e) => setActForm((f) => ({ ...f, assignedTo: e.target.value }))}>
                  <option value="">{act.action === 'escalate' ? 'Configured escalation owner' : 'Select a member of staff'}</option>
                  {staff.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
                </select>
              </Fld>
            ) : null}
            {act.action === 'prioritize' ? (
              <RadioCards label="Priority" value={actForm.priority} onChange={(v) => setActForm((f) => ({ ...f, priority: v }))} cols={4} options={PRIORITIES.map((x) => [x, words(x)])} />
            ) : null}
            {['resolve', 'reject'].includes(act.action) ? (
              <Fld label={act.action === 'reject' ? 'Reason' : 'Resolution'} required count={[actForm.resolution.length, 500]}>
                <textarea rows={3} maxLength={500} value={actForm.resolution} onChange={(e) => setActForm((f) => ({ ...f, resolution: e.target.value }))} />
              </Fld>
            ) : null}
            <Fld label="Comment" required={act.action === 'comment'} optional={act.action !== 'comment'} count={[actForm.comment.length, 500]}>
              <textarea rows={2} maxLength={500} value={actForm.comment} onChange={(e) => setActForm((f) => ({ ...f, comment: e.target.value }))} />
            </Fld>
            <ToggleRow on={actForm.internal} onChange={(v) => setActForm((f) => ({ ...f, internal: v }))} label="Internal note" hint="Hidden from the student" />
          </FormSection>
        ) : null}
      </FormModal>
    </div>
  );
}
