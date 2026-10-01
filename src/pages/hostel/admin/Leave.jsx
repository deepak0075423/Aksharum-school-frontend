/**
 * Hostel → Leave (Sep 2026 redesign, to the user's mockup).
 *
 * Four figures, a tab per stage, the filters and the requests table, from
 * GET /hostel/admin/board/leave. The workflow is the leave endpoint's and is
 * unchanged: parent consent → approval → departure → return, each a step a row
 * offers only when the leave is in the state that allows it.
 */
import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { Attachments, useNewFromLink } from '../shared';
import { PageHead, words } from './hsUI';
import { GhostArt } from './hsArt';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, FDateRange, LineTabs, Btn, Kebab, Popover, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, Avatar, useListState, useBoardData, exportCsv, fmtDate, fmtTime, fmtPhone,
} from './hsList';
import { StudentCell, roomShort } from './hsPeople';
import { FormModal, FormSection, Grid, Fld, RadioCards, StudentPicker, PersonCard, FileDrop, InfoNote, ReviewList, dmy } from './hsForm';

/** A leave type as the mockup tags it: its words, its tint and its glyph. */
export const LEAVE_TYPE = {
  home: ['Home', 'blue', 'house'], weekend: ['Weekend', 'violet', 'calendar'], medical: ['Medical', 'red', 'cross'],
  emergency: ['Emergency', 'orange', 'alertTri'], holiday: ['Holiday', 'teal', 'beach'], short: ['Short', 'sky', 'clockSolid'],
  other: ['Other', 'slate', 'dot'],
};
export const LeaveType = ({ value }) => {
  const [text, tone, glyph] = LEAVE_TYPE[value] || [words(value), 'slate', 'dot'];
  return <Badge tone={tone} glyph={glyph} size="lg">{text}</Badge>;
};
const STATUS = {
  pending: ['Pending', 'amber'], parent_approved: ['Pending', 'amber'], approved: ['Approved', 'green'], rejected: ['Rejected', 'red'],
  cancelled: ['Cancelled', 'slate'], active: ['On leave', 'indigo'], returned: ['Returned', 'blue'], overdue: ['Overdue', 'red'],
};
const StatusTag = ({ value }) => { const [text, tone] = STATUS[value] || [words(value), 'slate']; return <Badge tone={tone} size="lg">{text}</Badge>; };
const STATUS_FILTER = [
  ['pending', 'Pending'], ['parent_approved', 'Parent consented'], ['approved', 'Approved'], ['active', 'On leave'],
  ['overdue', 'Overdue'], ['returned', 'Returned'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled'],
].map(([value, label]) => ({ value, label }));

const empty = {
  student: '', leaveType: 'home', span: 'single', fromDate: '', toDate: '', reason: '',
  destination: '', guardianName: '', guardianPhone: '', guardianRelation: '', emergencyContact: '', attachments: [],
};
const ACT = {
  parent_approve: 'Record parent consent', approve: 'Approve', reject: 'Reject', depart: 'Mark departed',
  return: 'Confirm return', cancel: 'Cancel leave', revoke: 'Revoke leave',
};
const STEP_ICON = {
  parent_approve: ['checkSquare', 'violet'], approve: ['checkCircle', 'green'], reject: ['closeCircle', 'red'],
  depart: ['logOut', 'indigo'], return: ['logIn', 'green'], cancel: ['trash', 'red'], revoke: ['undo', 'red'],
};
const DONE = { parent_approve: 'Parent consent recorded', approve: 'Leave approved', reject: 'Leave rejected', depart: 'Departure recorded', return: 'Return confirmed', cancel: 'Leave cancelled' };
const FILTERS = { hostel: '', class: '', leaveType: '', status: '', from: '', to: '', consent: '' };

export default function Leave() {
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS });
  // (The Dashboard links here with ?status=active — that lands in the status filter.)
  const tab = ['pending', 'approved', 'rejected', 'active', 'past'].includes(state.tab) ? state.tab : 'all';
  const { data, loading, reload } = useBoardData((q) => api.getBoard('leave', q), state);
  const { data: meta } = useFetch(api.getMeta, []);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [act, setAct] = useState(null);       // { row, action }
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [more, setMore] = useState(false);
  const moreBtn = useRef(null);
  const [picked, setPicked] = useState(null);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const open = () => { setForm(empty); setPicked(null); setModal(true); };
  const years = meta?.academicYears || [];
  const pickStudent = (id, st) => {
    setPicked(st || null);
    setForm((f) => ({ ...f, student: id, guardianName: st?.guardianName || '', guardianPhone: st?.guardianPhone || '', guardianRelation: st?.guardianRelation || '' }));
  };
  const days = form.fromDate && (form.span === 'single' || form.toDate)
    ? Math.round((new Date(form.span === 'single' ? form.fromDate : form.toDate) - new Date(form.fromDate)) / 864e5) + 1 : 0;
  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(true, () => open());

  const save = async () => {
    setSaving(true);
    try {
      const { span, ...body } = form;
      await api.createLeave({ ...body, toDate: span === 'single' ? form.fromDate : form.toDate });
      toast.success('Leave filed'); setModal(false); reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const ask = (row, action) => { setAct({ row, action }); setRemark(''); };
  const submitAct = async () => {
    setBusy(true);
    try {
      const action = act.action === 'revoke' ? 'cancel' : act.action;
      await api.actOnLeave(act.row._id, { action, remark });
      toast.success(act.action === 'revoke' ? 'Leave revoked' : DONE[action] || 'Done');
      setAct(null); setRemark(''); setDetail(null); reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  /** The steps a leave may take from where it stands. */
  const steps = (r) => {
    const s = r.status;
    return [
      s === 'pending' && r.parentApprovalRequired && { label: ACT.parent_approve, icon: 'checkSquare', onClick: () => ask(r, 'parent_approve') },
      ['pending', 'parent_approved'].includes(s) && { label: ACT.approve, icon: 'checkCircle', onClick: () => ask(r, 'approve') },
      ['pending', 'parent_approved'].includes(s) && { label: ACT.reject, icon: 'closeCircle', danger: true, onClick: () => ask(r, 'reject') },
      s === 'approved' && { label: ACT.depart, icon: 'logOut', onClick: () => ask(r, 'depart') },
      ['active', 'overdue'].includes(s) && { label: ACT.return, icon: 'logIn', onClick: () => ask(r, 'return') },
      ['pending', 'parent_approved', 'approved', 'active'].includes(s) && '-',
      ['pending', 'parent_approved', 'active'].includes(s) && { label: ACT.cancel, icon: 'trash', danger: true, onClick: () => ask(r, 'cancel') },
      s === 'approved' && { label: ACT.revoke, icon: 'trash', danger: true, onClick: () => ask(r, 'revoke') },
    ];
  };

  const t = data?.tiles || {};
  const tabs = data?.tabs || {};
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'student', label: 'Student', render: (r) => <StudentCell r={r} /> },
    { key: 'class', label: 'Class', render: (r) => r.studentClass || '—', nowrap: true },
    { key: 'hostel', label: 'Hostel', render: (r) => r.hostelName || '—', nowrap: true },
    { key: 'room', label: 'Room / Bed', render: (r) => roomShort(r), nowrap: true },
    { key: 'type', label: 'Leave Type', render: (r) => <LeaveType value={r.leaveType} /> },
    { key: 'from', label: 'From', render: (r) => fmtDate(r.fromDate), nowrap: true },
    { key: 'to', label: 'To', render: (r) => fmtDate(r.toDate), nowrap: true },
    { key: 'days', label: 'Days', render: (r) => r.totalDays ?? '—' },
    { key: 'status', label: 'Status', render: (r) => (
      <span className="hs-stack">
        <StatusTag value={r.status} />
        {r.status === 'pending' && r.parentApprovalRequired ? <small>awaiting parent consent</small> : null}
        {r.status === 'parent_approved' ? <small>parent consented</small> : null}
      </span>
    ) },
    { key: 'applied', label: 'Applied On', render: (r) => fmtDate(r.createdAt), nowrap: true },
  ];

  const csv = (list) => exportCsv('hostel-leave.csv', [
    { label: 'Leave no.', value: (r) => r.leaveNumber }, { label: 'Student', value: (r) => r.studentName },
    { label: 'Roll', value: (r) => r.studentRoll }, { label: 'Class', value: (r) => r.studentClass },
    { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room / Bed', value: (r) => roomShort(r) },
    { label: 'Type', value: (r) => (LEAVE_TYPE[r.leaveType] || [r.leaveType])[0] },
    { label: 'From', value: (r) => fmtDate(r.fromDate) }, { label: 'To', value: (r) => fmtDate(r.toDate) },
    { label: 'Days', value: (r) => r.totalDays }, { label: 'Status', value: (r) => (STATUS[r.status] || [r.status])[0] },
    { label: 'Reason', value: (r) => r.reason }, { label: 'Applied on', value: (r) => fmtDate(r.createdAt) },
  ], list);
  const exportAll = async () => {
    try {
      const res = await api.getBoard('leave', { ...state, page: 1, limit: 5000 });
      csv((res.data ?? res).rows || []);
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="hs-page">
      <PageHead title="Hostel Leave Management" subtitle="Manage student leave requests with parent consent, approvals and return confirmation.">
        <Btn className="hs-btn--accent" icon="download" onClick={exportAll}>Export</Btn>
        <Btn kind="primary" icon="plus" onClick={open}>File Leave</Btn>
      </PageHead>

      <Kpis cols={4} size="lg">
        <Kpi tone="blue" icon="plane" value={t.total ?? 0} label="Total Requests" delta={t.delta} art={<GhostArt kind="doc" />} />
        <Kpi tone="green" icon="checkCircle" value={t.approved ?? 0} label="Approved" pct={t.approvedPct ?? 0} pctTone="green" bar barColor="#12b76a" art={<GhostArt kind="check" />} />
        <Kpi tone="amber" icon="clockSolid" value={t.pending ?? 0} label="Pending" pct={t.pendingPct ?? 0} pctTone="amber" bar inline barColor="#f79009" art={<GhostArt kind="clock" />} />
        <Kpi tone="red" icon="xCircle" value={t.rejected ?? 0} label="Rejected" pct={t.rejectedPct ?? 0} pctTone="red" bar inline barColor="#f04438" art={<GhostArt kind="doc" />} />
      </Kpis>

      <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Leave requests by stage"
        items={[
          { key: 'all', label: 'All Requests', count: tabs.all ?? 0 },
          { key: 'pending', label: 'Pending', count: tabs.pending ?? 0 },
          { key: 'approved', label: 'Approved', count: tabs.approved ?? 0 },
          { key: 'rejected', label: 'Rejected', count: tabs.rejected ?? 0, tone: 'bad' },
          { key: 'active', label: 'Active Leave', count: tabs.active ?? 0 },
          { key: 'past', label: 'Past Leave', count: tabs.past ?? 0 },
        ]} />

      <FilterBar>
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={(meta?.hostels || []).map((h) => ({ value: h._id, label: h.name }))} width="128px" />
        <FSelect value={state.class} onChange={(v) => set({ class: v })} all="All classes" options={(meta?.classes || []).map((c) => ({ value: c._id, label: c.className }))} width="118px" />
        <FSelect value={state.leaveType} onChange={(v) => set({ leaveType: v })} all="All leave types" options={Object.entries(LEAVE_TYPE).map(([value, [label]]) => ({ value, label }))} width="146px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={STATUS_FILTER} width="110px" />
        <FDateRange from={state.from} to={state.to} onChange={(v) => set(v)} grow={0} width="272px" />
        <FSearch compact value={state.search} onChange={(v) => set({ search: v })} placeholder="Search student name, roll no..." grow={1} width="244px" />
        <Btn ref={moreBtn} icon="filter" aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((o) => !o)}>Filter{state.consent ? ' · 1' : ''}</Btn>
        <Popover anchor={moreBtn} open={more} onClose={() => setMore(false)} label="More filters">
          <div className="hs-menu2" role="menu">
            {[['', 'Any parent consent'], ['awaiting', 'Awaiting parent consent'], ['recorded', 'Parent consent recorded']].map(([k, text]) => (
              <button key={k} type="button" role="menuitemradio" aria-checked={state.consent === k} className={`hs-menu2__item${state.consent === k ? ' is-on' : ''}`}
                onClick={() => { set({ consent: k }); setMore(false); }}><span>{text}</span></button>
            ))}
            <div className="hs-menu2__rule" role="separator" />
            <button type="button" role="menuitem" className="hs-menu2__item" onClick={() => { reset(); setMore(false); }}><span>Reset all filters</span></button>
          </div>
        </Popover>
      </FilterBar>

      <ListCard>
        <BulkBar count={selected.size} noun="request" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => csv(rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={6} headPad={11} dense
          selected={selected} onSelect={setSelected} actionsAlign="start"
          actions={(r) => (
            <>
              <Btn size="sm" icon="eye" onClick={() => setDetail(r)}>View</Btn>
              {['pending', 'parent_approved'].includes(r.status) ? (
                <>
                  <Btn size="sm" kind="success" icon="check" onClick={() => ask(r, 'approve')}>Approve</Btn>
                  <Btn size="sm" kind="danger" icon="close" onClick={() => ask(r, 'reject')}>Reject</Btn>
                </>
              ) : null}
              {r.status === 'approved' ? <Btn size="sm" icon="undo" onClick={() => ask(r, 'revoke')}>Revoke</Btn> : null}
              {['active', 'overdue'].includes(r.status) ? <Btn size="sm" kind="success" icon="logIn" onClick={() => ask(r, 'return')}>Returned</Btn> : null}
              <Kebab label={`Actions for ${r.studentName}`} items={[{ label: 'View details', icon: 'eye', onClick: () => setDetail(r) }, ...steps(r)]} />
            </>
          )}
          empty={(
            <EmptyRows icon="plane" title={filtered || tab !== 'all' ? 'No leave request matches' : 'No leave requests'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={open}>File Leave</Btn>}>
              {filtered || tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Home, weekend, medical and emergency leave is filed here.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'request' : 'requests'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      {/* ── File leave ────────────────────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save}
        icon="calendar" title="File Hostel Leave" subtitle="Create a hostel leave request for a student with all required details."
        submitLabel="Submit Leave" submitIcon="check"
        steps={[
          { key: 'details', title: 'Leave Details', sub: 'Basic leave information', icon: 'fileDoc' },
          { key: 'more', title: 'Additional Information', sub: 'Destination and guardian details', icon: 'mapPin' },
          { key: 'docs', title: 'Documents', sub: 'Upload supporting documents', icon: 'paperclip' },
          { key: 'review', title: 'Review', sub: 'Verify and submit', icon: 'oCheckRound' },
        ]}>
        <InfoNote>Leave requests are subject to approval. The system will check room availability, current allocation, and hostel rules automatically.</InfoNote>
        <FormSection step="details" icon="calendar" title="Leave Details" sub="Select the student and specify the leave period.">
          <Grid cols={2}>
            <Fld label="Student" required hint="Only current residents are listed">
              <StudentPicker value={form.student} onChange={pickStudent} params={{ allocated: 'true' }} />
            </Fld>
            <Fld label="Academic Year" required icon="calendar" hint={picked ? 'Taken from the student’s allocation' : ''}>
              <select value={picked?.allocation?.academicYear || years.find((y) => y.status === 'active')?._id || ''} disabled onChange={() => {}}>
                {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
              </select>
            </Fld>
            <Fld label="Leave Type" required icon="home">
              <select value={form.leaveType} onChange={(e) => setF('leaveType', e.target.value)}>
                {Object.entries(LEAVE_TYPE).map(([v, [l]]) => <option key={v} value={v}>{l === 'Home' ? 'Home Leave' : l}</option>)}
              </select>
            </Fld>
            <RadioCards half label="Leave Duration" value={form.span} onChange={(v) => setForm((f) => ({ ...f, span: v, toDate: v === 'single' ? '' : f.toDate }))}
              options={[['single', 'Single Day'], ['multiple', 'Multiple Days']]} />
            <Fld label="From Date" required icon="calendar">
              <input type="date" value={form.fromDate} onChange={(e) => setF('fromDate', e.target.value)} />
            </Fld>
            <Fld label="To Date" required={form.span === 'multiple'} icon="calendar" hint={days ? `${days} day${days === 1 ? '' : 's'}` : ''}>
              <input type="date" disabled={form.span === 'single'} min={form.fromDate || undefined} value={form.span === 'single' ? form.fromDate : form.toDate}
                onChange={(e) => setF('toDate', e.target.value)} />
            </Fld>
          </Grid>
          <Fld label="Reason for Leave" required count={[form.reason.length, 500]}>
            <textarea rows={2} maxLength={500} value={form.reason} placeholder="Enter reason for leave (e.g., vacation, family function, medical, etc.)" onChange={(e) => setF('reason', e.target.value)} />
          </Fld>
        </FormSection>
        <FormSection step="more" icon="mapPin" title="Destination & Guardian Details" sub="Provide where the student will be staying and contact information.">
          <Fld label="Destination / Address" required count={[form.destination.length, 200]}>
            <textarea rows={2} maxLength={200} value={form.destination} placeholder="Enter destination address" onChange={(e) => setF('destination', e.target.value)} />
          </Fld>
          <Grid cols={3}>
            <Fld label="Guardian Name" required icon="user"><input value={form.guardianName} maxLength={80} placeholder="Enter guardian name" onChange={(e) => setF('guardianName', e.target.value)} /></Fld>
            <Fld label="Guardian Phone" required icon="phone"><input type="tel" pattern="[0-9+ ()-]{6,20}" title="A phone number" value={form.guardianPhone} placeholder="Enter phone number" onChange={(e) => setF('guardianPhone', e.target.value)} /></Fld>
            <Fld label="Relation" required icon="users"><input value={form.guardianRelation} maxLength={30} placeholder="e.g. Father, Mother, Uncle" onChange={(e) => setF('guardianRelation', e.target.value)} /></Fld>
          </Grid>
        </FormSection>
        <FormSection step="docs" icon="paperclip" title="Supporting Documents" sub="Upload any relevant documents (optional).">
          <FileDrop value={form.attachments} onChange={(v) => setF('attachments', v)} entityType="HostelLeave" />
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Verify the leave before it is submitted.">
          <ReviewList groups={[
            { title: 'Leave', step: 0, rows: [['Student', picked?.name], ['Type', (LEAVE_TYPE[form.leaveType] || [words(form.leaveType)])[0]],
              ['Dates', form.fromDate ? `${dmy(form.fromDate)}${form.span === 'multiple' && form.toDate ? ` – ${dmy(form.toDate)}` : ''}` : ''], ['Days', days || ''], ['Reason', form.reason]] },
            { title: 'Destination & guardian', step: 1, rows: [['Destination', form.destination], ['Guardian', [form.guardianName, form.guardianRelation && `(${form.guardianRelation})`, form.guardianPhone].filter(Boolean).join(' ')]] },
            { title: 'Documents', step: 2, rows: [['Files', form.attachments.length ? `${form.attachments.length} attached` : 'None']] },
          ]} />
        </FormSection>
      </FormModal>

      {/* ── A step of the workflow ────────────────────────────────────────── */}
      <FormModal open={!!act} onClose={() => setAct(null)} busy={busy} onSubmit={submitAct}
        icon={STEP_ICON[act?.action]?.[0] || 'checkCircle'} iconTone={STEP_ICON[act?.action]?.[1] || 'indigo'}
        title={act ? ACT[act.action] : ''} subtitle={act ? `${act.row.leaveNumber || ''} · ${fmtDate(act.row.fromDate)} to ${fmtDate(act.row.toDate)}` : ''}
        submitLabel={act ? ACT[act.action] : 'Confirm'} tone={['reject', 'cancel', 'revoke'].includes(act?.action) ? 'danger' : undefined}
        cancelLabel={['cancel', 'revoke'].includes(act?.action) ? 'Keep Leave' : 'Cancel'}>
        {act ? (
          <FormSection>
            <PersonCard name={act.row.studentName} photo={act.row.studentPhoto} meta={[act.row.studentClass, act.row.hostelName]} />
            {act.action === 'approve' && act.row.parentApprovalRequired && !act.row.parentApprovedAt ? (
              <InfoNote tone="amber">Parent consent has not been recorded yet — approval will be refused. Record the consent first.</InfoNote>
            ) : null}
            <Fld label={['reject', 'cancel', 'revoke'].includes(act.action) ? 'Reason' : 'Remark'} required={act.action === 'reject'}
              optional={act.action !== 'reject'} count={[remark.length, 300]}>
              <textarea rows={3} maxLength={300} value={remark} onChange={(e) => setRemark(e.target.value)} />
            </Fld>
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── Detail ────────────────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Leave details">
        {detail ? (
          <>
            <DrawerHead
              mark={<Avatar name={detail.studentName} src={detail.studentPhoto} size={52} />}
              name={detail.studentName} sub={[detail.leaveNumber, detail.studentClass, detail.studentRoll ? `Roll ${detail.studentRoll}` : ''].filter(Boolean).join(' · ')}
              tags={<><StatusTag value={detail.status} /><LeaveType value={detail.leaveType} /></>}
              onClose={() => setDetail(null)}
            />
            <DrawerBody>
              <DrawerSection title="Leave">
                <DrawerFields fields={[
                  ['From', fmtDate(detail.fromDate)], ['To', fmtDate(detail.toDate)], ['Days', detail.totalDays],
                  ['Reason', detail.reason], ['Destination', detail.destination],
                  ['Hostel', detail.hostelName], ['Room / bed', detail.roomNumber ? roomShort(detail) : ''],
                  ['Applied on', fmtDate(detail.createdAt)],
                ]} />
              </DrawerSection>
              <DrawerSection title="Consent and movement">
                <DrawerFields fields={[
                  ['Parent consent', !detail.parentApprovalRequired ? 'Not required' : detail.parentApprovedAt ? `${fmtDate(detail.parentApprovedAt)}, ${fmtTime(detail.parentApprovedAt)}` : 'Not recorded'],
                  ['Warden approval', detail.wardenApprovedAt ? `${fmtDate(detail.wardenApprovedAt)}, ${fmtTime(detail.wardenApprovedAt)}` : ''],
                  ['Departed', detail.departedAt ? `${fmtDate(detail.departedAt)}, ${fmtTime(detail.departedAt)}` : ''],
                  ['Returned', detail.returnedAt ? `${fmtDate(detail.returnedAt)}, ${fmtTime(detail.returnedAt)}` : ''],
                  ['Rejection reason', detail.rejectionReason],
                ]} />
              </DrawerSection>
              <DrawerSection title="Guardian">
                <DrawerFields fields={[
                  ['Guardian', detail.guardianName], ['Phone', fmtPhone(detail.guardianPhone)], ['Emergency contact', detail.emergencyContact],
                ]} />
                {!detail.guardianName && !detail.guardianPhone && !detail.emergencyContact ? <p className="hs-muted">No guardian details on this request.</p> : null}
              </DrawerSection>
              {detail.attachments?.length ? (
                <DrawerSection title={`Documents (${detail.attachments.length})`}>
                  <Attachments value={detail.attachments} disabled />
                </DrawerSection>
              ) : null}
            </DrawerBody>
            {steps(detail).filter((x) => x && x !== '-').length ? (
              <DrawerFoot>
                {steps(detail).filter((x) => x && x !== '-').map((x) => (
                  <Btn key={x.label} kind={x.danger ? 'danger' : x.label === ACT.approve || x.label === ACT.return ? 'primary' : 'outline'} onClick={x.onClick}>{x.label}</Btn>
                ))}
              </DrawerFoot>
            ) : null}
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
