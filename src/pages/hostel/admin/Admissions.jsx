/**
 * Hostel → Admissions (Sep 2026 redesign, to the user's mockup).
 *
 * Five figures, a filter row, a tab per stage and the applications table, from
 * GET /hostel/admin/board/admissions. The workflow is unchanged: an application
 * is filed here, and approved, rejected or waitlisted through the decision
 * endpoint — which is also what allocates the bed and tells the family.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerField, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { di, useNewFromLink } from '../shared';
import { PageHead, words } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, LineTabs, Btn, SplitBtn, Kebab, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, Person, Avatar, TwoLine, Ico, useListState, useBoardData, exportCsv, fmtDate, fmtPhone,
} from './hsList';
import { ROOM_TYPES, roomTypeLabel } from './hsRoom';
import { FormModal, FormSection, Grid, Fld, StudentPicker, studentMeta, PersonCard, ToggleRow, InfoNote, ReviewList, dmy } from './hsForm';
import PhoneInput from '../../../components/ui/PhoneInput';
import { newestYear } from '../../../utils/listOrder';

/** A decision's title, icon, tone and button. */
const DECIDE = {
  approve: ['Approve Application', 'checkCircle', 'green', 'Approve'],
  reject: ['Reject Application', 'closeCircle', 'red', 'Reject'],
  waitlist: ['Move to Waitlist', 'listSolid', 'lavender', 'Move to Waitlist'],
  cancel: ['Cancel Application', 'trash', 'red', 'Cancel Application'],
};

const empty = {
  student: '', hostel: '', academicYear: '', preferredRoomType: '', preferredBuilding: '', preferredFloor: '',
  joiningDate: '', expectedLeavingDate: '', reason: '',
  guardianName: '', guardianPhone: '', guardianRelation: '',
  emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
  medicalInfo: '', specialRequirements: '', remarks: '',
};
const FIELDS = Object.keys(empty);

/** A status as the mockup words and tints it. */
export const ADMISSION_STATUS = {
  draft: ['Draft', 'slate'], applied: ['Pending', 'amber'], pending_approval: ['Pending', 'amber'],
  approved: ['Approved', 'green'], completed: ['Completed', 'green'], rejected: ['Rejected', 'red'],
  waitlisted: ['Waitlist', 'lavender'], cancelled: ['Cancelled', 'slate'],
};
const StatusPill = ({ value }) => {
  const [text, tone] = ADMISSION_STATUS[value] || [words(value), 'slate'];
  return <Badge tone={tone} pill>{text}</Badge>;
};
const STATUS_FILTER = [
  { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' }, { value: 'waitlist', label: 'Waitlist' },
];
const OPEN = ['applied', 'pending_approval', 'waitlisted'];
const EDITABLE = (s) => !['approved', 'completed', 'cancelled'].includes(s);

/** The papers the school asks for with an application, and which are on file. */
const Papers = ({ papers }) => (
  <ul className="hsf-checks" aria-label="Required documents">
    {papers.required.map((d) => {
      const lacking = papers.missing.includes(d);
      return (
        <li key={d} className={lacking ? 'is-missing' : 'is-ok'}>
          <Ico name={lacking ? 'close' : 'check'} size={13} />
          <span>{words(d)}</span>
          <em>{lacking ? 'Missing' : 'On file'}</em>
        </li>
      );
    })}
  </ul>
);
const classNo = (c) => String(c || '').replace(/^class\s*/i, '') || '—';
const studentSub = (r) => [r.studentAdmissionNo, r.studentClass].filter(Boolean).join(' | ');
const roomLine = (t) => (t ? `${roomTypeLabel(t)} room` : 'No room preference');

export default function Admissions() {
  const nav = useNavigate();
  const { state, set, setPage, reset } = useListState({ limit: 5, status: '', academicYear: '', class: '', hostel: '' });
  const { data, loading, reload } = useBoardData((q) => api.getBoard('admissions', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const years = meta?.academicYears || [];

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editRow, setEditRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [decide, setDecide] = useState(null);   // { row, action }
  const [decideForm, setDecideForm] = useState({ remark: '', allocate: true, bed: '', acceptMissing: false });
  const [papers, setPapers] = useState(null);     // { required, missing } for the application being decided
  const [deciding, setDeciding] = useState(false);
  const [freeBeds, setFreeBeds] = useState([]);
  const [picked, setPicked] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const chosenHostel = hostels.find((h) => h._id === form.hostel);
  const hostelHint = chosenHostel && picked?.gender && !['any', 'co_ed'].includes(chosenHostel.gender)
    && chosenHostel.gender !== String(picked.gender).toLowerCase() ? `This hostel is for ${words(chosenHostel.gender)} students` : '';
  const approvalNote = 'The application goes to the warden for approval. Approving it can allocate a bed straight away.';

  const open = () => {
    setEditRow(null); setPicked(null);
    setForm({ ...empty, academicYear: years.find((y) => y.status === 'active')?._id || newestYear(years)?._id || '', joiningDate: di(new Date()) });
    setModal(true);
  };
  /** Choosing a student fills the contacts from their record — each can still be changed for this application. */
  const pickStudent = (id, st) => {
    setPicked(st || null);
    setForm((f) => ({
      ...f, student: id,
      guardianName: st?.guardianName || '', guardianPhone: st?.guardianPhone || '', guardianRelation: st?.guardianRelation || '',
      emergencyContactName: f.emergencyContactName || st?.emergencyContactName || '', emergencyContactPhone: f.emergencyContactPhone || st?.emergencyContactPhone || '',
      emergencyContactRelation: f.emergencyContactRelation || st?.emergencyContactRelation || '',
      // A student's gender points at the hostel that can take them.
      hostel: f.hostel || (st?.gender ? (hostels.find((h) => h.gender === String(st.gender).toLowerCase())?._id || '') : ''),
    }));
  };

  const openEdit = async (row) => {
    try {
      const r = await api.getAdmission(row._id);
      const d = r.data ?? r;
      setEditRow(d);
      setForm({
        ...empty,
        ...Object.fromEntries(FIELDS.map((k) => [k, d[k] ?? ''])),
        student: d.student?._id || d.student, hostel: d.hostel?._id || d.hostel,
        academicYear: d.academicYear?._id || d.academicYear,
        preferredBuilding: d.preferredBuilding?._id || d.preferredBuilding || '', preferredFloor: d.preferredFloor?._id || d.preferredFloor || '',
        joiningDate: d.joiningDate ? di(d.joiningDate) : '', expectedLeavingDate: d.expectedLeavingDate ? di(d.expectedLeavingDate) : '',
      });
      setModal(true);
    } catch (err) { toast.error(err.message); }
  };

  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(!!meta, () => open());

  const save = async () => {
    setSaving(true);
    try {
      const clean = { ...form, preferredBuilding: form.preferredBuilding || null, preferredFloor: form.preferredFloor || null,
        joiningDate: form.joiningDate || null, expectedLeavingDate: form.expectedLeavingDate || null };
      if (editRow) {
        const { student, ...body } = clean;
        await api.updateAdmission(editRow._id, body);
        toast.success('Application updated');
      } else {
        await api.createAdmission(clean);
        toast.success('Application filed');
      }
      setModal(false); reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const openDetail = async (row) => {
    setDetail({ loading: true, applicationNumber: row.applicationNumber, studentName: row.studentName });
    try { const r = await api.getAdmission(row._id); setDetail(r.data ?? r); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const openDecide = async (row, action) => {
    const hostelId = row.hostelId || row.hostel?._id || row.hostel;
    setDecide({ row: { ...row, studentName: row.studentName || row.student?.name, hostelName: row.hostelName || row.hostel?.name }, action });
    setDecideForm({ remark: '', allocate: action === 'approve', bed: '', acceptMissing: false });
    setPapers(row.papers || null);
    if (action === 'approve') {
      // The beds to offer, and which of the school's required papers are on file.
      const [beds, full] = await Promise.allSettled([
        api.getBeds({ hostel: hostelId, status: 'available' }),
        row.papers ? Promise.resolve(null) : api.getAdmission(row._id),
      ]);
      setFreeBeds(beds.status === 'fulfilled' ? (beds.value.data ?? beds.value) : []);
      if (full.status === 'fulfilled' && full.value) setPapers((full.value.data ?? full.value).papers || null);
    }
  };

  const missing = decide?.action === 'approve' && decide.row.status !== 'approved' ? (papers?.missing || []) : [];
  const submitDecision = async () => {
    if (missing.length && !decideForm.acceptMissing) { toast.error('Required documents are missing — upload them, or choose to approve anyway'); return; }
    setDeciding(true);
    try {
      const r = await api.decideAdmission(decide.row._id, {
        action: decide.action,
        remark: decideForm.remark,
        allocate: decideForm.allocate,
        bed: decideForm.bed || null,
        acceptMissingDocuments: !!decideForm.acceptMissing,
      });
      const d = r.data ?? r;
      if (d.allocationError) toast(`Approved, but allocation failed: ${d.allocationError}`, { icon: '⚠️', duration: 6000 });
      else if (d.allocation) toast.success('Approved and a bed was allocated');
      else toast.success(`Application ${decide.action === 'waitlist' ? 'waitlisted' : `${decide.action}${decide.action.endsWith('e') ? 'd' : 'ed'}`}`);
      setDecide(null); setDetail(null); reload();
    } catch (err) { toast.error(err.message); } finally { setDeciding(false); }
  };

  /** What may be done with an application, for the row menu and the drawer. */
  const steps = (r) => {
    const s = r.status;
    return [
      OPEN.includes(s) && { label: 'Approve', icon: 'checkCircle', onClick: () => openDecide(r, 'approve') },
      ['applied', 'pending_approval'].includes(s) && { label: 'Move to waitlist', icon: 'list', onClick: () => openDecide(r, 'waitlist') },
      OPEN.includes(s) && { label: 'Reject', icon: 'closeCircle', danger: true, onClick: () => openDecide(r, 'reject') },
      s === 'approved' && !r.allocation && { label: 'Allocate bed', icon: 'bed', onClick: () => openDecide(r, 'approve') },
      s === 'approved' && r.allocation && { label: 'Open allocation', icon: 'arrowRight', onClick: () => nav(`/admin/hostel/allocations?search=${encodeURIComponent(r.studentName || r.student?.name || '')}`) },
      ['draft', ...OPEN].includes(s) && '-',
      ['draft', ...OPEN].includes(s) && { label: 'Cancel application', icon: 'trash', danger: true, onClick: () => openDecide(r, 'cancel') },
    ];
  };

  const t = data?.tiles || {};
  const tabs = data?.tabs || {};
  const rows = data?.rows || [];
  const filtered = !!(state.search || state.status || state.academicYear || state.class || state.hostel);

  const columns = [
    { key: 'no', label: 'Application No.', render: (r) => r.applicationNumber || '—', nowrap: true },
    { key: 'student', label: 'Student', render: (r) => <Person name={r.studentName} src={r.studentPhoto} sub={studentSub(r)} size={40} /> },
    { key: 'class', label: 'Class', render: (r) => classNo(r.studentClass) },
    { key: 'pref', label: 'Hostel Preference', render: (r) => <TwoLine top={r.hostelName} sub={roomLine(r.preferredRoomType)} /> },
    { key: 'on', label: 'Applied On', render: (r) => fmtDate(r.appliedAt || r.createdAt), nowrap: true },
    { key: 'status', label: 'Status', render: (r) => (
      <span className="hs-stack">
        <StatusPill value={r.status} />
        {r.status === 'waitlisted' && r.waitlistPosition > 0 ? <small>position {r.waitlistPosition}</small> : null}
      </span>
    ) },
  ];

  const csv = (list) => exportCsv('hostel-admissions.csv', [
    { label: 'Application no.', value: (r) => r.applicationNumber }, { label: 'Student', value: (r) => r.studentName },
    { label: 'Admission no.', value: (r) => r.studentAdmissionNo }, { label: 'Class', value: (r) => r.studentClass },
    { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room preference', value: (r) => (r.preferredRoomType ? roomTypeLabel(r.preferredRoomType) : '') },
    { label: 'Applied on', value: (r) => fmtDate(r.appliedAt || r.createdAt) },
    { label: 'Status', value: (r) => (ADMISSION_STATUS[r.status] || [r.status])[0] },
  ], list);
  const exportAll = async () => {
    try {
      const res = await api.getBoard('admissions', { ...state, page: 1, limit: 5000 });
      csv((res.data ?? res).rows || []);
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="hs-page">
      <PageHead title="Hostel Admissions" subtitle="Manage student hostel applications, approvals and the waiting list.">
        <SplitBtn label="New Application" onClick={open} menuLabel="More"
          items={[{ label: 'Export this list (CSV)', icon: 'download', onClick: exportAll }]} />
      </PageHead>

      <Kpis cols={5} size="md">
        <Kpi tone="indigo" icon="doc" value={t.total ?? 0} label="Total Applications" />
        <Kpi tone="green" icon="checkCircle" value={t.approved ?? 0} label="Approved" pct={t.approvedPct ?? 0} />
        <Kpi tone="amber" icon="clockSolid" value={t.pending ?? 0} label="Pending" pct={t.pendingPct ?? 0} />
        <Kpi tone="red" icon="xCircle" value={t.rejected ?? 0} label="Rejected" pct={t.rejectedPct ?? 0} pctTone="red" />
        <Kpi tone="blue" icon="listSolid" value={t.waitlist ?? 0} label="In Waitlist" />
      </Kpis>

      <FilterBar>
        <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search student name or application no..." grow={3} width="300px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={STATUS_FILTER} />
        <FSelect value={state.academicYear} onChange={(v) => set({ academicYear: v })} all="All academic years"
          options={years.map((y) => ({ value: y._id, label: y.yearName }))} />
        <FSelect value={state.class} onChange={(v) => set({ class: v })} all="All classes"
          options={(meta?.classes || []).map((c) => ({ value: c._id, label: c.className }))} />
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels"
          options={hostels.map((h) => ({ value: h._id, label: h.name }))} />
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
      </FilterBar>

      <LineTabs value={data?.tab || state.tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Applications by stage"
        items={[
          { key: 'all', label: 'All Applications', count: tabs.all ?? 0 },
          { key: 'pending', label: 'Pending', count: tabs.pending ?? 0 },
          { key: 'approved', label: 'Approved', count: tabs.approved ?? 0 },
          { key: 'rejected', label: 'Rejected', count: tabs.rejected ?? 0, tone: 'bad' },
          { key: 'waitlist', label: 'Waitlist', count: tabs.waitlist ?? 0, tone: 'info' },
        ]} />

      <ListCard>
        <BulkBar count={selected.size} noun="application" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => csv(rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={11} headPad={16}
          selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" icon="eye" onClick={() => openDetail(r)}>View</Btn>
              <Btn size="sm" icon="pencil" disabled={!EDITABLE(r.status)} title={EDITABLE(r.status) ? undefined : `A ${words(r.status).toLowerCase()} application can no longer be edited`}
                onClick={() => openEdit(r)}>Edit</Btn>
              <Kebab label={`Actions for ${r.applicationNumber}`} items={[{ label: 'View details', icon: 'eye', onClick: () => openDetail(r) }, ...steps(r)]} />
            </>
          )}
          empty={(
            <EmptyRows icon="doc" title={filtered || state.tab !== 'all' ? 'No application matches' : 'No applications yet'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={open}>New Application</Btn>}>
              {filtered || state.tab !== 'all' ? 'Try another stage, or clear the filters.' : 'File a student’s application, then approve it to allocate a bed.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'application' : 'applications'} onPage={setPage} size="sm" />
      </ListCard>

      {/* ── New / edit application ────────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save}
        icon="fileDoc" title={editRow ? `Edit ${editRow.applicationNumber || 'Application'}` : 'New Hostel Application'}
        subtitle="Create a new hostel application for a student with all required details."
        submitLabel={editRow ? 'Save Changes' : 'Submit Application'} submitIcon="check"
        steps={[
          { key: 'student', title: 'Student & Admission', sub: 'Basic student and admission details', icon: 'user' },
          { key: 'room', title: 'Room Preference', sub: 'Select hostel and room type', icon: 'oBed' },
          { key: 'contacts', title: 'Contacts', sub: 'Guardian and emergency details', icon: 'phone' },
          { key: 'health', title: 'Health & Requirements', sub: 'Medical info and special needs', icon: 'oHeart' },
          { key: 'review', title: 'Review', sub: 'Verify and submit application', icon: 'fileDoc' },
        ]}>
        <FormSection step="student" icon="user" title="Student & Admission Details" sub="Select the student and provide admission-related information.">
          <Grid cols={2}>
            <Fld label="Student" required hint={editRow ? 'The student on an application cannot change' : 'Only students without a bed are listed'}>
              <StudentPicker value={form.student} onChange={pickStudent} params={{ onlyUnallocated: 'true' }} disabled={!!editRow}
                current={editRow ? { _id: form.student, name: editRow.student?.name } : null} />
            </Fld>
            <Fld label="Academic Year" required icon="calendar">
              <select value={form.academicYear} onChange={(e) => setF('academicYear', e.target.value)}>
                <option value="">Select year</option>
                {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
              </select>
            </Fld>
            {picked && !editRow ? <div className="hsf-span-all"><PersonCard name={picked.name} photo={picked.profileImage} meta={studentMeta(picked)} badge="No bed yet" badgeTone="amber" /></div> : null}
            <Fld label="Hostel" required icon="oBuilding" hint={hostelHint}>
              <select value={form.hostel} onChange={(e) => setForm((f) => ({ ...f, hostel: e.target.value, preferredBuilding: '', preferredFloor: '' }))}>
                <option value="">Select hostel</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name} ({words(h.gender)})</option>)}
              </select>
            </Fld>
            <Fld label="Joining Date" required icon="calendar">
              <input type="date" value={form.joiningDate} onChange={(e) => setF('joiningDate', e.target.value)} />
            </Fld>
            <Fld label="Expected Leaving Date" icon="calendar" hint="Leave blank if not known">
              <input type="date" min={form.joiningDate || undefined} value={form.expectedLeavingDate} onChange={(e) => setF('expectedLeavingDate', e.target.value)} />
            </Fld>
            <Fld label="Reason for Applying" optional icon="fileDoc">
              <input value={form.reason} maxLength={200} placeholder="e.g. Lives far from school" onChange={(e) => setF('reason', e.target.value)} />
            </Fld>
          </Grid>
        </FormSection>
        <FormSection step="room" icon="oBed" title="Room Preference" sub="Choose preferred options to help with allocation (optional).">
          <Grid cols={3}>
            <Fld label="Preferred Building" icon="oBuilding">
              <select value={form.preferredBuilding} disabled={!form.hostel} onChange={(e) => setForm((f) => ({ ...f, preferredBuilding: e.target.value, preferredFloor: '' }))}>
                <option value="">No preference</option>
                {(meta?.buildings || []).filter((b) => String(b.hostel) === String(form.hostel)).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </Fld>
            <Fld label="Preferred Floor" icon="layers">
              <select value={form.preferredFloor} disabled={!form.preferredBuilding} onChange={(e) => setF('preferredFloor', e.target.value)}>
                <option value="">No preference</option>
                {(meta?.floors || []).filter((x) => String(x.building) === String(form.preferredBuilding)).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
              </select>
            </Fld>
            <Fld label="Preferred Room Type" icon="oBed">
              <select value={form.preferredRoomType} onChange={(e) => setF('preferredRoomType', e.target.value)}>
                <option value="">No preference</option>
                {ROOM_TYPES.filter(([v]) => v !== 'custom').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Fld>
          </Grid>
        </FormSection>
        <FormSection step="contacts" icon="phone" title="Contacts" sub="Guardian and emergency contacts are pre-filled from the student's record.">
          <Grid cols={3}>
            <Fld label="Guardian Name" icon="user"><input value={form.guardianName} maxLength={80} placeholder="Auto-filled" onChange={(e) => setF('guardianName', e.target.value)} /></Fld>
            <Fld label="Guardian Phone" icon="phone"><PhoneInput value={form.guardianPhone} placeholder="Auto-filled" onChange={(e) => setF('guardianPhone', e.target.value)} /></Fld>
            <Fld label="Relation" icon="users"><input value={form.guardianRelation} maxLength={30} placeholder="Auto-filled" onChange={(e) => setF('guardianRelation', e.target.value)} /></Fld>
            <Fld label="Emergency Contact" icon="user"><input value={form.emergencyContactName} maxLength={80} placeholder="Enter name" onChange={(e) => setF('emergencyContactName', e.target.value)} /></Fld>
            <Fld label="Emergency Phone" icon="phone"><PhoneInput value={form.emergencyContactPhone} placeholder="Enter phone number" onChange={(e) => setF('emergencyContactPhone', e.target.value)} /></Fld>
            <Fld label="Relation" icon="users"><input value={form.emergencyContactRelation} maxLength={30} placeholder="e.g. Uncle, Aunt" onChange={(e) => setF('emergencyContactRelation', e.target.value)} /></Fld>
          </Grid>
          {picked && !picked.guardianName && !editRow ? <InfoNote tone="amber">No parent is linked to this student yet, so there was nothing to fill in. Enter the guardian here, or link a parent under Students.</InfoNote> : null}
        </FormSection>
        <FormSection step="health" icon="oHeart" title="Health & Special Requirements" sub="Provide medical information and any special requirements.">
          <Grid cols={2}>
            <Fld label="Medical Information" icon="oHeart" count={[form.medicalInfo.length, 500]}>
              <textarea rows={2} maxLength={500} value={form.medicalInfo} placeholder="Any medical conditions, allergies or regular medication" onChange={(e) => setF('medicalInfo', e.target.value)} />
            </Fld>
            <Fld label="Special Requirements" optional icon="fileDoc" count={[form.specialRequirements.length, 500]}>
              <textarea rows={2} maxLength={500} value={form.specialRequirements} placeholder="Dietary needs, accessibility, etc." onChange={(e) => setF('specialRequirements', e.target.value)} />
            </Fld>
          </Grid>
        </FormSection>
        <FormSection step="review" icon="fileDoc" title="Review" sub="Verify the application before it is submitted.">
          <ReviewList groups={[
            { title: 'Student & admission', step: 0, rows: [['Student', picked?.name || editRow?.student?.name], ['Academic year', years.find((y) => y._id === form.academicYear)?.yearName],
              ['Hostel', hostels.find((h) => h._id === form.hostel)?.name], ['Joining', dmy(form.joiningDate)], ['Leaving', dmy(form.expectedLeavingDate)], ['Reason', form.reason]] },
            { title: 'Room preference', step: 1, rows: [['Building', (meta?.buildings || []).find((b) => b._id === form.preferredBuilding)?.name || 'No preference'],
              ['Floor', (meta?.floors || []).find((x) => x._id === form.preferredFloor)?.name || 'No preference'], ['Room type', form.preferredRoomType ? roomTypeLabel(form.preferredRoomType) : 'No preference']] },
            { title: 'Contacts', step: 2, rows: [['Guardian', [form.guardianName, form.guardianRelation && `(${form.guardianRelation})`, form.guardianPhone].filter(Boolean).join(' ')],
              ['Emergency', [form.emergencyContactName, form.emergencyContactRelation && `(${form.emergencyContactRelation})`, form.emergencyContactPhone].filter(Boolean).join(' ')]] },
            { title: 'Health', step: 3, rows: [['Medical', form.medicalInfo], ['Special requirements', form.specialRequirements]] },
          ]} />
          {!editRow ? <InfoNote>{approvalNote}</InfoNote> : null}
        </FormSection>
      </FormModal>

      {/* ── Decision ──────────────────────────────────────────────────────── */}
      <FormModal open={!!decide} onClose={() => setDecide(null)} busy={deciding} onSubmit={submitDecision}
        icon={DECIDE[decide?.action]?.[1] || 'checkCircle'} iconTone={DECIDE[decide?.action]?.[2] || 'indigo'}
        title={decide ? `${DECIDE[decide.action]?.[0] || words(decide.action)}` : ''}
        subtitle={decide ? `${decide.row.applicationNumber || ''} · the student and their parents are told of the decision.` : ''}
        submitLabel={DECIDE[decide?.action]?.[3] || 'Confirm'} tone={['reject', 'cancel'].includes(decide?.action) ? 'danger' : undefined}
        cancelLabel={decide?.action === 'cancel' ? 'Keep Application' : 'Cancel'}>
        {decide ? (
          <FormSection>
            <PersonCard name={decide.row.studentName} meta={[decide.row.hostelName, decide.row.applicationNumber]} />
            {decide.action === 'approve' && decide.row.status !== 'approved' && papers?.required?.length ? (
              <>
                <Papers papers={papers} />
                {missing.length ? (
                  <ToggleRow on={decideForm.acceptMissing} onChange={(v) => setDecideForm((f) => ({ ...f, acceptMissing: v }))}
                    label="Approve without these documents" hint="What was missing is kept on the application and in the activity log" />
                ) : null}
              </>
            ) : null}
            {decide.action === 'approve' ? (
              <>
                <ToggleRow on={decideForm.allocate} onChange={(v) => setDecideForm((f) => ({ ...f, allocate: v }))}
                  label="Allocate a bed now" hint="Gender, capacity and hostel-status rules are checked before the bed is given" />
                {decideForm.allocate ? (
                  <Fld label="Bed" icon="oBed" hint={freeBeds.length ? `${freeBeds.length} free bed${freeBeds.length === 1 ? '' : 's'} in this hostel` : 'No free bed right now — approve without one, or free a bed first'}
                    hintTone={freeBeds.length ? 'good' : 'bad'}>
                    <select value={decideForm.bed} onChange={(e) => setDecideForm((f) => ({ ...f, bed: e.target.value }))}>
                      <option value="">Pick the best free bed automatically</option>
                      {freeBeds.map((b) => <option key={b._id} value={b._id}>{b.room?.roomNumber} · Bed {b.bedNumber}</option>)}
                    </select>
                  </Fld>
                ) : null}
              </>
            ) : null}
            <Fld label={['reject', 'cancel'].includes(decide.action) ? 'Reason' : 'Remark'} required={['reject', 'cancel'].includes(decide.action)}
              optional={!['reject', 'cancel'].includes(decide.action)} count={[decideForm.remark.length, 300]}>
              <textarea rows={3} maxLength={300} value={decideForm.remark} placeholder={decide.action === 'reject' ? 'Why the application is turned down' : 'Anything the student should know'}
                onChange={(e) => setDecideForm((f) => ({ ...f, remark: e.target.value }))} />
            </Fld>
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── Detail ────────────────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Application details">
        {detail ? (
          <>
            <DrawerHead
              mark={<Avatar name={detail.student?.name || detail.studentName} src={detail.student?.profileImage} size={52} />}
              name={detail.student?.name || detail.studentName} sub={detail.applicationNumber}
              tags={detail.loading ? null : <>
                <StatusPill value={detail.status} />
                {detail.status === 'waitlisted' && detail.waitlistPosition > 0 ? <Badge tone="slate">position {detail.waitlistPosition}</Badge> : null}
                {detail.allocation ? <Badge tone="green">Bed allocated</Badge> : null}
              </>}
              onClose={() => setDetail(null)}
            />
            <DrawerBody>
              {detail.loading ? <p className="hs-muted">Loading…</p> : (
                <>
                  <DrawerSection title="Application">
                    <DrawerFields fields={[
                      ['Hostel', detail.hostel?.name],
                      ['Academic year', detail.academicYear?.yearName],
                      ['Preferred room', detail.preferredRoomType ? roomTypeLabel(detail.preferredRoomType) : 'No preference'],
                      ['Applied on', fmtDate(detail.appliedAt)],
                      ['Joining', detail.joiningDate ? fmtDate(detail.joiningDate) : ''],
                      ['Expected leaving', detail.expectedLeavingDate ? fmtDate(detail.expectedLeavingDate) : ''],
                      ['Reason', detail.reason],
                      ['Reviewed by', detail.reviewedBy?.name],
                      ['Decision remark', detail.decisionRemark],
                      ['Allocated from', detail.allocation?.fromDate ? fmtDate(detail.allocation.fromDate) : ''],
                    ]} />
                  </DrawerSection>
                  <DrawerSection title="Student">
                    <DrawerFields fields={[
                      ['Class', detail.studentDetails?.profile?.currentClass?.className],
                      ['Admission no.', detail.studentDetails?.profile?.admissionNumber],
                      ['Gender', detail.studentDetails?.profile?.gender ? words(detail.studentDetails.profile.gender) : ''],
                      ['Blood group', detail.studentDetails?.profile?.bloodGroup],
                      ['Email', detail.student?.email],
                      ['Phone', fmtPhone(detail.student?.phone)],
                    ]} />
                  </DrawerSection>
                  <DrawerSection title="Guardian & emergency contact">
                    <DrawerFields fields={[
                      ['Guardian', [detail.guardianName, detail.guardianRelation ? `(${detail.guardianRelation})` : ''].filter(Boolean).join(' ')],
                      ['Guardian phone', fmtPhone(detail.guardianPhone)],
                      ['Emergency contact', [detail.emergencyContactName, detail.emergencyContactRelation ? `(${detail.emergencyContactRelation})` : ''].filter(Boolean).join(' ')],
                      ['Emergency phone', fmtPhone(detail.emergencyContactPhone)],
                    ]} />
                  </DrawerSection>
                  {(detail.medicalInfo || detail.specialRequirements) ? (
                    <DrawerSection title="Health & requirements">
                      <DrawerFields fields={[['Medical information', detail.medicalInfo], ['Special requirements', detail.specialRequirements]]} />
                    </DrawerSection>
                  ) : null}
                  {detail.papers?.required?.length ? (
                    <DrawerSection title="Required documents">
                      <Papers papers={detail.papers} />
                      {detail.missingDocuments?.length && ['approved', 'completed'].includes(detail.status) ? (
                        <p className="hs-muted" style={{ marginTop: 8 }}>Approved with {detail.missingDocuments.map(words).join(', ')} missing.</p>
                      ) : null}
                    </DrawerSection>
                  ) : null}
                  {detail.documents?.length ? (
                    <DrawerSection title={`Documents (${detail.documents.length})`}>
                      <dl>{detail.documents.map((d, i) => <DrawerField key={d._id || i} label={d.title}>{words(d.verificationStatus)}</DrawerField>)}</dl>
                    </DrawerSection>
                  ) : null}
                </>
              )}
            </DrawerBody>
            {!detail.loading ? (
              <DrawerFoot>
                {EDITABLE(detail.status) ? <Btn icon="pencil" onClick={() => { const d = detail; setDetail(null); openEdit(d); }}>Edit</Btn> : null}
                {OPEN.includes(detail.status) ? <Btn kind="danger" onClick={() => openDecide(detail, 'reject')}>Reject</Btn> : null}
                {OPEN.includes(detail.status) ? <Btn kind="primary" icon="checkCircle" onClick={() => openDecide(detail, 'approve')}>Approve</Btn> : null}
                {detail.status === 'approved' && !detail.allocation ? <Btn kind="primary" icon="bed" onClick={() => openDecide(detail, 'approve')}>Allocate bed</Btn> : null}
              </DrawerFoot>
            ) : null}
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
