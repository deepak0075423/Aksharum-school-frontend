/**
 * Hostel → Incidents, Medical & Emergency (Sep 2026 redesign, to the user's mockup).
 *
 * One register for everything that happens to a resident or the hostel, from
 * GET /hostel/admin/board/incidents. Each record is ONE kind — an emergency,
 * else a medical case, else an incident — so the tabs add up to the total.
 * The screen speaks of four stages (Open, In Progress, Resolved, Closed); the
 * model's "investigating" and "action taken" are both In Progress here, and
 * told apart on the drawer.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { FileLink, today, useNewFromLink } from '../shared';
import { PageHead, Mark, words } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, FDateRange, LineTabs, Btn, Kebab, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, TwoLine, useListState, useBoardData, exportCsv, fmtDate, fmtTime,
} from './hsList';
import { StudentCell, roomTight } from './hsPeople';
import { FormModal, FormSection, Grid, Fld, ChipSelect, ToggleRow, StudentPicker, FileDrop, InfoNote, ReviewList, dmy, ampm } from './hsForm';
import { MoreFilters, stamp } from './hsTags';

const TYPES = ['misconduct', 'fighting', 'theft', 'property_damage', 'security', 'medical_emergency', 'emergency', 'rule_violation', 'other'];
const TYPE_LABEL = { medical_emergency: 'Medical', emergency: 'Emergency (fire, evacuation…)', rule_violation: 'Rule violation', property_damage: 'Property damage' };
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const SEVERITY = { low: 'green', medium: 'amber', high: 'red', critical: 'red' };
const Severity = ({ value }) => <Badge tone={SEVERITY[value] || 'slate'} size="lg" strong={value === 'critical'}>{words(value)}</Badge>;
const STATUS = {
  reported: ['Open', 'blue'], investigating: ['In Progress', 'amber'], action_taken: ['In Progress', 'amber'],
  resolved: ['Resolved', 'green'], closed: ['Closed', 'slate'],
};
/** The list says In Progress for both working stages; the drawer says which. */
const Status = ({ value, real }) => {
  const [text, tone] = real && value === 'action_taken' ? ['Action Taken', 'amber'] : real && value === 'investigating' ? ['Investigating', 'amber'] : (STATUS[value] || [words(value), 'slate']);
  return <Badge tone={tone} size="lg">{text}</Badge>;
};
const KIND = {
  incident: { label: 'Incident', icon: 'alertTri', tone: 'red' },
  medical: { label: 'Medical', icon: 'cross', tone: 'green' },
  emergency: { label: 'Emergency', icon: 'siren', tone: 'red' },
};
const MEDICAL_CATS = ['first_aid', 'doctor_visit', 'hospital_visit', 'ambulance', 'medication'];
const STAGES = [['open', 'Open'], ['progress', 'In progress'], ['resolved', 'Resolved'], ['closed', 'Closed']].map(([value, label]) => ({ value, label }));
const FILTERS = { hostel: '', type: '', severity: '', status: '', subject: '', from: '', to: '', sort: '', dir: '' };
const empty = {
  hostel: '', room: '', student: '', studentName: '', incidentType: 'other', severity: 'low', title: '',
  date: today(), time: '', location: '', description: '', witnesses: [], assignedOfficer: '', actionTaken: '',
  medicalCategory: '', treatmentGiven: '', hospitalName: '', doctorName: '', transportArranged: false, attachments: [],
};

/** A record's headline and the line under it; older rows keep both in the description. */
const headline = (r) => {
  if (r.title) return [r.title, r.description];
  const d = String(r.description || '');
  const at = d.indexOf('. ');
  return at > 0 ? [d.slice(0, at), d.slice(at + 2)] : [d, r.treatmentGiven || r.actionTaken || ''];
};
/** "10:15 AM" from the "22:40" the form keeps, else the timestamp's own. */
const clock = (r) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(r.time || '');
  if (!m) return fmtTime(r.date);
  const h = +m[1];
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};
const where = (r) => (r.roomNumber ? roomTight(r).replace('-', ' - ') : r.location || '');
const DONE = { investigating: 'Investigation started', action_taken: 'Action recorded', resolved: 'Marked resolved', closed: 'Closed', reported: 'Reopened' };

/** What may be done with a record, from where it stands. */
const LADDER = (s) => [
  s === 'reported' && ['investigating', 'Start investigation', 'search'],
  ['reported', 'investigating'].includes(s) && ['action_taken', 'Record action taken', 'pencil'],
  !['resolved', 'closed'].includes(s) && ['resolved', 'Mark resolved', 'checkCircle'],
  s === 'resolved' && ['closed', 'Close', 'check'],
  ['resolved', 'closed'].includes(s) && ['reported', 'Reopen', 'refresh'],
].filter(Boolean);

export default function Incidents() {
  const navigate = useNavigate();
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS }, { fromUrl: ['status', 'tab', 'search'] });
  const tab = ['incidents', 'medical', 'emergency'].includes(state.tab) ? state.tab : 'all';
  const { data, loading, reload } = useBoardData((q) => api.getBoard('incidents', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const staff = meta?.staff || [];

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [act, setAct] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const rooms = (meta?.rooms || []).filter((r) => !form.hostel || String(r.hostel) === form.hostel);
  const isMedical = form.incidentType === 'medical_emergency';

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'hostel' ? { room: '' } : {}) }));
  const open = async (row) => {
    if (!row) { setEditId(null); setForm(empty); setModal(true); return; }
    try {
      const r = await api.getIncident(row._id); const x = r.data ?? r;
      setEditId(x._id);
      setForm({
        ...empty, ...x,
        hostel: x.hostel?._id || x.hostel || '', room: x.room?._id || x.room || '', student: x.student?._id || x.student || '',
        assignedOfficer: x.assignedOfficer?._id || x.assignedOfficer || '',
        date: x.date ? String(x.date).slice(0, 10) : today(), witnesses: x.witnesses || [], studentName: x.student?.name || '',
        title: x.title || headline(x)[0], description: x.title ? x.description : headline(x)[1] || x.description,
      });
      setModal(true);
    } catch (err) { toast.error(err.message); }
  };
  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(true, () => open());

  const save = async () => {
    setSaving(true);
    try {
      const p = {
        ...form, room: form.room || null, student: form.student || null, assignedOfficer: form.assignedOfficer || null,
        witnesses: form.witnesses,
      };
      for (const k of ['studentName', '_id', 'incidentNumber', 'studentDetails', 'discipline', 'documents', 'attachmentUrls', 'involvedStudents', 'createdAt', 'updatedAt', 'reportedBy', 'reportedByName', 'resolvedAt', 'parentNotifiedAt', 'school']) delete p[k];
      if (editId) await api.updateIncident(editId, p); else await api.createIncident(p);
      toast.success(editId ? 'Record updated' : 'Incident reported');
      setModal(false); reload();
      if (editId && detail?._id === editId) openDetail({ _id: editId });
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const openDetail = async (row) => {
    setDetail((d) => (d?._id === row._id ? d : { loading: true, _id: row._id, title: row.title, incidentNumber: row.incidentNumber, kind: row.kind }));
    try { const r = await api.getIncident(row._id); setDetail({ ...(r.data ?? r), kind: row.kind || detail?.kind }); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const ask = (row, status) => { setAct({ row, status }); setNote(row.actionTaken || ''); };
  const submitAct = async () => {
    setBusy(true);
    try {
      const body = { status: act.status };
      if (['action_taken', 'resolved'].includes(act.status) && note.trim()) body.actionTaken = note.trim();
      await api.updateIncident(act.row._id, body);
      toast.success(DONE[act.status] || 'Updated');
      const row = act.row; setAct(null); reload();
      if (detail?._id === row._id) openDetail(row);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const discipline = (r) => navigate(`/admin/hostel/discipline?new=1&student=${r.studentId || r.student?._id || ''}&incident=${r._id}`);

  const t = data?.tiles || {};
  const tabs = data?.tabs || {};
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'type', label: 'Type', render: (r) => {
      const k = KIND[r.kind] || KIND.incident;
      return <span className="hs-person"><Mark name={k.icon} tone={k.tone} size={34} glyph={18} /><span>{k.label}</span></span>;
    }, nowrap: true },
    { key: 'title', label: 'Title & Details', render: (r) => { const [top, sub] = headline(r); return <span className="hs-clip"><TwoLine top={top} sub={sub} /></span>; } },
    { key: 'student', label: 'Student', render: (r) => (r.studentName
      ? <StudentCell r={r} size={34} sub={[r.studentRoll ? `Roll ${r.studentRoll}` : r.studentAdmissionNo, r.studentClass].filter(Boolean).join(' • ')} />
      : <TwoLine top="Hostel-wide" sub={r.reportedByName ? `Reported by ${r.reportedByName}` : ''} />) },
    { key: 'room', label: 'Hostel / Room', render: (r) => <TwoLine top={r.hostelName || '—'} sub={where(r)} /> },
    { key: 'severity', label: 'Severity', render: (r) => <Severity value={r.severity} /> },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
    { key: 'on', label: 'Reported On', render: (r) => <TwoLine top={fmtDate(r.date)} sub={clock(r)} />, nowrap: true },
  ];

  const csvCols = [
    { label: 'No.', value: (r) => r.incidentNumber }, { label: 'Kind', value: (r) => KIND[r.kind]?.label }, { label: 'Type', value: (r) => words(r.incidentType) },
    { label: 'Title', value: (r) => headline(r)[0] }, { label: 'Details', value: (r) => headline(r)[1] },
    { label: 'Student', value: (r) => r.studentName }, { label: 'Roll', value: (r) => r.studentRoll }, { label: 'Class', value: (r) => r.studentClass },
    { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room / place', value: (r) => where(r) },
    { label: 'Severity', value: (r) => words(r.severity) }, { label: 'Status', value: (r) => words(r.status) },
    { label: 'Care given', value: (r) => words(r.medicalCategory) }, { label: 'Treatment', value: (r) => r.treatmentGiven },
    { label: 'Action taken', value: (r) => r.actionTaken }, { label: 'Reported on', value: (r) => `${fmtDate(r.date)} ${clock(r)}` },
  ];
  const exportAll = async () => {
    try { const res = await api.getBoard('incidents', { ...state, page: 1, limit: 5000 }); exportCsv('hostel-incidents.csv', csvCols, (res.data ?? res).rows || []); }
    catch (err) { toast.error(err.message); }
  };

  const openLog = async () => {
    setLog({ loading: true, rows: [] });
    try {
      const res = await api.getBoard('incidents', { type: 'medical_emergency', from: state.from, to: state.to, hostel: state.hostel, limit: 500 });
      setLog({ rows: (res.data ?? res).rows || [] });
    } catch (err) { toast.error(err.message); setLog(null); }
  };

  const ladder = (r) => [
    ...LADDER(r.status).map(([status, text, icon]) => ({ label: text, icon, onClick: () => ask(r, status) })),
    ...((r.studentId || r.student?._id) ? ['-', { label: 'Issue discipline action', icon: 'shield', onClick: () => discipline(r) }] : []),
  ];

  return (
    <div className="hs-page">
      <PageHead title="Incidents, Medical & Emergency" subtitle="Track and manage hostel incidents, health cases and emergencies with proper follow-up and closure.">
        <Btn className="hs-btn--accent" icon="ambulance" onClick={openLog}>Medical Log</Btn>
        <Btn className="hs-btn--accent" icon="download" onClick={exportAll}>Export</Btn>
        <Btn kind="primary" icon="plus" onClick={() => open()}>Report Incident</Btn>
      </PageHead>

      <Kpis cols={4} size="lg">
        <Kpi tone="red" icon="alertTri" value={t.total ?? 0} label="Total Incidents" delta={t.delta} />
        <Kpi tone="green" icon="cross" value={t.medical ?? 0} label="Medical Cases" pct={t.medicalPct ?? 0}
          pctLabel={<>{t.medicalPct ?? 0}% <span className="hs-muted">of total</span></>} pctTone="green" bar barColor="#12b76a" />
        <Kpi tone="amber" icon="clockSolid" value={t.progress ?? 0} label="In Progress" pct={t.progressPct ?? 0} pctTone="amber" bar barColor="#f79009" />
        <Kpi tone="sky" icon="checkCircle" value={t.resolved ?? 0} label="Resolved" pct={t.resolvedPct ?? 0} pctTone="blue" bar barColor="#2b8ef0" />
      </Kpis>

      <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Records by kind"
        items={[
          { key: 'all', label: 'All Records', count: tabs.all ?? 0 },
          { key: 'incidents', label: 'Incidents', count: tabs.incidents ?? 0 },
          { key: 'medical', label: 'Medical Cases', count: tabs.medical ?? 0 },
          { key: 'emergency', label: 'Emergency', count: tabs.emergency ?? 0, tone: 'bad' },
        ]} />

      <FilterBar>
        <FSelect value={state.type} onChange={(v) => set({ type: v })} all="All types" options={TYPES.map((x) => ({ value: x, label: words(TYPE_LABEL[x] || x) }))} grow={0} width="124px" />
        <FSelect value={state.severity} onChange={(v) => set({ severity: v })} all="All severities" options={SEVERITIES.map((x) => ({ value: x, label: words(x) }))} grow={0} width="132px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={STAGES} grow={0} width="124px" />
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={hostels.map((h) => ({ value: h._id, label: h.name }))} grow={0} width="124px" />
        <FDateRange from={state.from} to={state.to} onChange={(v) => set(v)} grow={0} width="236px" />
        <FSearch compact value={state.search} onChange={(v) => set({ search: v })} placeholder="Search by student name, ID, incident no..." grow={1} width="200px" />
        <MoreFilters groups={[
          { key: 'subject', title: 'Involving', value: state.subject, onPick: (v) => set({ subject: v }), options: [['', 'Anyone'], ['student', 'A student'], ['hostel', 'The hostel as a whole']] },
          { key: 'sort', title: 'Order', value: state.sort ? `${state.sort}:${state.dir}` : '', onPick: (v) => { const [s, d] = v.split(':'); set({ sort: s || '', dir: d || '' }); },
            options: [['', 'Newest first'], ['date:asc', 'Oldest first'], ['severity:asc', 'Most severe first']] },
        ]} />
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
      </FilterBar>

      <ListCard>
        <BulkBar count={selected.size} noun="record" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => exportCsv('hostel-incidents.csv', csvCols, rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={10} headPad={12} dense
          selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" icon="eye" onClick={() => openDetail(r)}>View</Btn>
              <Btn size="sm" icon="pencil" onClick={() => open(r)}>Edit</Btn>
              <Kebab label={`Actions for ${r.incidentNumber}`} items={ladder(r)} />
            </>
          )}
          empty={(
            <EmptyRows icon="alertTri" title={filtered || tab !== 'all' ? 'No record matches' : 'Nothing reported'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={() => open()}>Report Incident</Btn>}>
              {filtered || tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Incidents, health cases and emergencies are recorded and followed up here.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'record' : 'records'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      {/* ── Report / edit ─────────────────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save}
        icon={isMedical ? 'cross' : 'alertTri'} iconTone={isMedical ? 'green' : 'red'}
        title={editId ? 'Edit Record' : 'Report Incident'} subtitle="Record an incident, a health case or an emergency, with who was involved and what was done."
        submitLabel={editId ? 'Save Changes' : 'Report Incident'} submitIcon="check"
        steps={[
          { key: 'who', title: 'Who & Where', sub: 'Hostel, room and people', icon: 'mapPin' },
          { key: 'what', title: 'What Happened', sub: 'Type, severity and details', icon: 'alertTri' },
          ...(isMedical ? [{ key: 'medical', title: 'Medical Care', sub: 'Care given and hospital', icon: 'oHeart' }] : []),
          { key: 'files', title: 'Attachments', sub: 'Photos and reports', icon: 'paperclip', optional: true },
          { key: 'review', title: 'Review', sub: 'Verify and submit', icon: 'oCheckRound' },
        ]}>
        <FormSection step="who" icon="mapPin" title="Who & Where" sub="Where it happened and who it concerns.">
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
            <Fld label="Student" optional hint="Leave empty for a hostel-wide event">
              <StudentPicker value={form.student} onChange={(id) => setF('student', id)} params={{ allocated: 'true' }} required={false} placeholder="Nobody in particular"
                current={editId && form.student ? { _id: form.student, name: form.studentName } : null} />
            </Fld>
            <Fld label="Assigned Officer" icon="user">
              <select value={form.assignedOfficer} onChange={(e) => setF('assignedOfficer', e.target.value)}>
                <option value="">— none —</option>
                {staff.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
              </select>
            </Fld>
          </Grid>
        </FormSection>
        <FormSection step="what" icon="alertTri" title="What Happened" sub="The type decides whether it is an incident, a medical case or an emergency.">
          <Grid cols={2}>
            <Fld label="Type" required icon="oTag">
              <select value={form.incidentType} onChange={(e) => setF('incidentType', e.target.value)}>
                {TYPES.map((x) => <option key={x} value={x}>{words(TYPE_LABEL[x] || x)}</option>)}
              </select>
            </Fld>
            <Fld label="Severity" required icon="alert">
              <select value={form.severity} onChange={(e) => setF('severity', e.target.value)}>
                {SEVERITIES.map((x) => <option key={x} value={x}>{words(x)}</option>)}
              </select>
            </Fld>
          </Grid>
          <Fld label="Title" required icon="fileDoc"><input maxLength={120} value={form.title} placeholder="Fever and cold, Broken window…" onChange={(e) => setF('title', e.target.value)} /></Fld>
          <Fld label="What Happened" required count={[form.description.length, 1000]}>
            <textarea rows={3} maxLength={1000} value={form.description} onChange={(e) => setF('description', e.target.value)} />
          </Fld>
          <Grid cols={3}>
            <Fld label="Date" required icon="calendar"><input type="date" max={today()} value={form.date} onChange={(e) => setF('date', e.target.value)} /></Fld>
            <Fld label="Time" icon="clock"><input type="time" value={form.time} onChange={(e) => setF('time', e.target.value)} /></Fld>
            <Fld label="Location" icon="mapPin"><input value={form.location} maxLength={80} placeholder="Room, dining hall, gate…" onChange={(e) => setF('location', e.target.value)} /></Fld>
          </Grid>
          <Fld label="Witnesses" optional icon="users" hint="Type a name and press Enter">
            <ChipSelect value={form.witnesses} onChange={(v) => setF('witnesses', v)} options={[]} label="Witnesses" allowNew placeholder="Add a witness" />
          </Fld>
          {editId ? (
            <Fld label="Action Taken" optional count={[form.actionTaken.length, 500]}>
              <textarea rows={2} maxLength={500} value={form.actionTaken} onChange={(e) => setF('actionTaken', e.target.value)} />
            </Fld>
          ) : null}
        </FormSection>
        {isMedical ? (
          <FormSection step="medical" icon="oHeart" title="Medical Care" sub="Blood group, allergies and emergency contacts are read from the student’s record.">
            <Grid cols={3}>
              <Fld label="Care Given" icon="cross">
                <select value={form.medicalCategory} onChange={(e) => setF('medicalCategory', e.target.value)}>
                  <option value="">Select</option>
                  {MEDICAL_CATS.map((c) => <option key={c} value={c}>{words(c)}</option>)}
                </select>
              </Fld>
              <Fld label="Hospital" icon="oBuilding"><input value={form.hospitalName} maxLength={80} onChange={(e) => setF('hospitalName', e.target.value)} /></Fld>
              <Fld label="Doctor" icon="user"><input data-text="name" value={form.doctorName} maxLength={80} onChange={(e) => setF('doctorName', e.target.value)} /></Fld>
            </Grid>
            <Fld label="Treatment Given" optional count={[form.treatmentGiven.length, 500]}>
              <textarea rows={2} maxLength={500} value={form.treatmentGiven} onChange={(e) => setF('treatmentGiven', e.target.value)} />
            </Fld>
            <ToggleRow on={!!form.transportArranged} onChange={(v) => setF('transportArranged', v)} label="Emergency transport arranged" hint="This makes the record an Emergency" />
            <InfoNote>Parents are emailed as soon as a medical case is reported.</InfoNote>
          </FormSection>
        ) : null}
        <FormSection step="files" icon="paperclip" title="Attachments" sub="Photos, reports or statements (optional).">
          <FileDrop value={form.attachments} onChange={(v) => setF('attachments', v)} entityType="HostelIncident" entityId={editId} />
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Verify the record before it is saved.">
          <ReviewList groups={[
            { title: 'Who & where', step: 0, rows: [['Hostel', hostels.find((h) => h._id === form.hostel)?.name], ['Room', rooms.find((r) => r._id === form.room)?.roomNumber], ['Student', form.student ? (form.studentName || 'A resident') : 'Hostel-wide'], ['Officer', staff.find((x) => x._id === form.assignedOfficer)?.name]] },
            { title: 'What happened', step: 1, rows: [['Type', words(TYPE_LABEL[form.incidentType] || form.incidentType)], ['Severity', words(form.severity)], ['Title', form.title], ['Details', form.description], ['When', [dmy(form.date), ampm(form.time)].filter(Boolean).join(', ')], ['Location', form.location], ['Witnesses', form.witnesses]] },
            ...(isMedical ? [{ title: 'Medical care', step: 2, rows: [['Care', words(form.medicalCategory)], ['Hospital', form.hospitalName], ['Doctor', form.doctorName], ['Treatment', form.treatmentGiven], ['Transport', form.transportArranged ? 'Arranged' : '']] }] : []),
          ]} />
        </FormSection>
      </FormModal>

      {/* ── Detail ─────────────────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Record details">
        {detail ? (() => {
          const k = KIND[detail.kind] || (detail.incidentType === 'medical_emergency' ? KIND.medical : KIND.incident);
          const [top, sub] = headline(detail);
          const p = detail.studentDetails?.profile;
          const record = p ? [
            ['Blood group', p.bloodGroup], ['Allergies', Array.isArray(p.allergies) ? p.allergies.join(', ') : p.allergies],
            ['Emergency contact', [p.emergencyContactName, p.emergencyContactPhone].filter(Boolean).join(' · ')],
            ['Father', [p.fatherName, p.fatherPhone].filter(Boolean).join(' · ')], ['Mother', [p.motherName, p.motherPhone].filter(Boolean).join(' · ')],
          ].filter(([, v]) => v) : [];
          const steps = detail.loading ? [] : ladder(detail);
          const main = steps.filter((x) => x !== '-' && x.label !== 'Issue discipline action');
          return (
            <>
              <DrawerHead mark={<Mark name={k.icon} tone={k.tone} size={52} glyph={26} />}
                name={top || detail.incidentNumber || 'Record'} sub={[detail.incidentNumber, detail.date ? `${fmtDate(detail.date)}, ${clock(detail)}` : ''].filter(Boolean).join(' · ')}
                tags={detail.loading ? null : <><Badge tone={k.tone} size="lg">{k.label}</Badge><Severity value={detail.severity} /><Status value={detail.status} real /></>}
                onClose={() => setDetail(null)} />
              <DrawerBody>
                {detail.loading ? <p className="hs-muted">Loading…</p> : (
                  <>
                    <DrawerSection title="What happened">
                      {sub ? <p className="hs-dtext">{sub}</p> : null}
                      <DrawerFields fields={[
                        ['Type', words(TYPE_LABEL[detail.incidentType] || detail.incidentType)], ['Student', detail.student?.name || 'Hostel-wide'],
                        ['Hostel', detail.hostel?.name], ['Room', detail.room?.roomNumber], ['Location', detail.location !== detail.room?.roomNumber ? detail.location : ''],
                        ['Reported by', detail.reportedByName], ['Officer', detail.assignedOfficer?.name || 'Nobody yet'],
                        ['Witnesses', (detail.witnesses || []).join(', ')], ['Parents notified', stamp(detail.parentNotifiedAt)],
                        ['Resolved on', stamp(detail.resolvedAt)],
                      ]} />
                    </DrawerSection>
                    {detail.actionTaken ? <DrawerSection title="Action taken"><p className="hs-dtext">{detail.actionTaken}</p></DrawerSection> : null}
                    {detail.incidentType === 'medical_emergency' ? (
                      <DrawerSection title="Medical">
                        <DrawerFields fields={[
                          ['Care given', words(detail.medicalCategory)], ['Treatment', detail.treatmentGiven], ['Hospital', detail.hospitalName],
                          ['Doctor', detail.doctorName], ['Transport', detail.transportArranged ? 'Arranged' : ''],
                        ]} />
                      </DrawerSection>
                    ) : null}
                    {record.length ? <DrawerSection title="From the student's record"><DrawerFields fields={record} /></DrawerSection> : null}
                    {detail.attachments?.length ? (
                      <DrawerSection title={`Attachments (${detail.attachments.length})`}>
                        <div className="hs-chips">
                          {detail.attachments.map((f) => <FileLink key={f} name={f} />)}
                        </div>
                      </DrawerSection>
                    ) : null}
                    {detail.discipline?.length ? (
                      <DrawerSection title="Discipline issued from this record">
                        <DrawerFields fields={detail.discipline.map((d) => [d.actionNumber, `${words(d.actionType)} · ${d.violation}`])} />
                      </DrawerSection>
                    ) : null}
                  </>
                )}
              </DrawerBody>
              {!detail.loading ? (
                <DrawerFoot>
                  <Kebab label="More steps" items={[{ label: 'Edit record', icon: 'pencil', onClick: () => open(detail) }, ...steps.filter((x) => x !== main[0])]} />
                  {main[0] ? <Btn kind="primary" icon={main[0].icon} onClick={main[0].onClick}>{main[0].label}</Btn> : null}
                </DrawerFoot>
              ) : null}
            </>
          );
        })() : null}
      </Drawer>

      {/* ── One step ───────────────────────────────────────────────────────── */}
      <FormModal open={!!act} onClose={() => setAct(null)} busy={busy} onSubmit={submitAct}
        icon={act?.status === 'resolved' ? 'checkCircle' : act?.status === 'reported' ? 'refresh' : act?.status === 'closed' ? 'check' : 'search'}
        iconTone={['resolved', 'closed'].includes(act?.status) ? 'green' : 'indigo'}
        title={act ? LADDER(act.row.status).find(([x]) => x === act.status)?.[1] || 'Update' : ''}
        subtitle={act ? [act.row.incidentNumber, headline(act.row)[0]].filter(Boolean).join(' · ') : ''}
        submitLabel={act ? LADDER(act.row.status).find(([x]) => x === act.status)?.[1] || 'Confirm' : 'Confirm'}>
        {act ? (
          <FormSection>
            {['action_taken', 'resolved'].includes(act.status) ? (
              <Fld label={act.status === 'resolved' ? 'How It Was Resolved' : 'Action Taken'} required={act.status === 'action_taken'} count={[note.length, 500]}>
                <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </Fld>
            ) : <p className="hsf-msg">{act.status === 'reported' ? 'The record goes back to Open and its resolved date is cleared.' : act.status === 'closed' ? 'A closed record is kept for the history and not worked on again.' : 'The record moves to In Progress.'}</p>}
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── Medical log ────────────────────────────────────────────────────── */}
      <Drawer open={!!log} onClose={() => setLog(null)} label="Medical log">
        {log ? (
          <>
            <DrawerHead mark={<Mark name="cross" tone="green" size={52} glyph={26} />} name="Medical Log"
              sub={state.from || state.to ? `${state.from ? fmtDate(state.from) : 'Start'} – ${state.to ? fmtDate(state.to) : 'today'}` : 'Every health case on record'}
              onClose={() => setLog(null)} />
            <DrawerBody>
              {log.loading ? <p className="hs-muted">Loading…</p> : log.rows.length ? (
                <ul className="hs-thread">
                  {log.rows.map((r) => (
                    <li key={r._id}>
                      <div><strong>{headline(r)[0]}</strong><span>{fmtDate(r.date)} · {clock(r)}</span></div>
                      <p>{[r.studentName, r.hostelName, where(r)].filter(Boolean).join(' · ')}</p>
                      <p className="hs-muted">{[words(r.medicalCategory), r.treatmentGiven, r.hospitalName].filter(Boolean).join(' · ') || 'No care recorded'} — {STATUS[r.status]?.[0] || words(r.status)}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="hs-muted">No health case in this period.</p>}
            </DrawerBody>
            {!log.loading && log.rows.length ? (
              <DrawerFoot>
                <Btn kind="primary" icon="download" onClick={() => exportCsv('hostel-medical-log.csv', csvCols, log.rows)}>Export CSV</Btn>
              </DrawerFoot>
            ) : null}
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
