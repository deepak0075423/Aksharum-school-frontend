/**
 * Hostel → Discipline (Sep 2026 redesign, to the user's mockup).
 *
 * Every action is a warning, a fine or an escalation, so those tabs add up to
 * the total; the fourth tab lists STUDENTS — anyone with more than one action —
 * from GET /hostel/admin/board/discipline-offenders. The screen's stages are
 * Pending (issued), Under Review (acknowledged), Resolved (served) and Revoked,
 * and its severities Low / Medium / High over the model's minor / moderate / major.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { today, useNewFromLink } from '../shared';
import { PageHead, Mark, words, money } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, FDateRange, LineTabs, Btn, Kebab, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, TwoLine, useListState, useBoardData, exportCsv, fmtDate, fmtTime, rupees,
} from './hsList';
import { StudentCell, roomTight } from './hsPeople';
import { FormModal, FormSection, Grid, Fld, StudentPicker, PersonCard, InfoNote, ReviewList, dmy } from './hsForm';
import { MoreFilters, stamp } from './hsTags';

const ACTIONS = ['verbal_warning', 'written_warning', 'fine', 'parent_notification', 'warden_action', 'principal_escalation', 'suspension', 'expulsion'];
const VIOLATIONS = ['curfew', 'ragging', 'substance', 'property_damage', 'misbehaviour', 'unauthorized_absence', 'visitor_rule', 'mess_rule', 'other'];
const GROUP = { warning: ['Warning', 'blue'], fine: ['Fine', 'red'], escalation: ['Escalation', 'orange'] };
const groupOf = (t) => (['verbal_warning', 'written_warning'].includes(t) ? 'warning' : t === 'fine' ? 'fine' : 'escalation');
const ActionTag = ({ type }) => { const [text, tone] = GROUP[groupOf(type)]; return <Badge tone={tone} size="lg" title={words(type)}>{text}</Badge>; };
const SEVERITY = { minor: ['Low', 'green'], moderate: ['Medium', 'amber'], major: ['High', 'red'] };
const Severity = ({ value }) => { const [text, tone] = SEVERITY[value] || [words(value), 'slate']; return <Badge tone={tone} size="lg">{text}</Badge>; };
const STATUS = { issued: ['Pending', 'amber'], acknowledged: ['Under Review', 'orange'], served: ['Resolved', 'green'], revoked: ['Revoked', 'slate'] };
const Status = ({ value }) => { const [text, tone] = STATUS[value] || [words(value), 'slate']; return <Badge tone={tone} size="lg">{text}</Badge>; };
const FILTERS = { hostel: '', action: '', severity: '', status: '', violation: '', from: '', to: '', sort: '', dir: '' };
const empty = {
  student: '', hostel: '', incident: '', violation: '', violationType: 'other', actionType: 'verbal_warning', severity: 'minor',
  description: '', date: today(), fineAmount: '', suspensionFrom: '', suspensionTo: '', remarks: '',
};
const where = (r) => (r.roomNumber ? roomTight(r).replace('-', ' - ') : '');
const DONE = { acknowledged: 'Marked under review', served: 'Marked resolved', revoked: 'Action revoked', issued: 'Action reinstated' };

/** What may be done with an action, from where it stands. */
const LADDER = (s) => [
  s === 'issued' && ['acknowledged', 'Mark under review', 'search'],
  ['issued', 'acknowledged'].includes(s) && ['served', 'Mark resolved', 'checkCircle'],
  s === 'revoked' && ['issued', 'Reinstate', 'refresh'],
  s !== 'revoked' && ['revoked', 'Revoke', 'closeCircle'],
].filter(Boolean);

/** The escalation ladder the policy drawer prints, lightest first. */
const POLICY = [
  ['verbal_warning', 'A first, minor breach — spoken to by the warden and put on record.'],
  ['written_warning', 'A repeat or a moderate breach — a letter the student acknowledges.'],
  ['fine', 'Billed as a hostel invoice on the student’s account, never twice.'],
  ['parent_notification', 'The parents are written to and asked to respond.'],
  ['warden_action', 'Loss of privileges set by the warden: outpasses, visitors, late study.'],
  ['principal_escalation', 'Referred to the principal; the hostel staff are alerted.'],
  ['suspension', 'Sent home for a set period, with the dates on record.'],
  ['expulsion', 'The hostel place is withdrawn.'],
];

export default function Discipline() {
  const navigate = useNavigate();
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS });
  const tab = ['warnings', 'fines', 'escalations', 'repeat'].includes(state.tab) ? state.tab : 'all';
  const repeat = tab === 'repeat';
  // The offenders list is its own board; the actions board still answers the tiles and tab counts.
  const { data, loading, reload } = useBoardData((q) => api.getBoard('discipline', { ...q, tab: repeat ? 'all' : q.tab, ...(repeat ? { limit: 1 } : null) }), state);
  const { data: offenders, loading: offLoading, reload: reloadOff } = useBoardData(
    (q) => (repeat ? api.getBoard('discipline-offenders', q) : Promise.resolve({ data: null })), state,
  );
  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [prior, setPrior] = useState(null);
  const [detail, setDetail] = useState(null);
  const [record, setRecord] = useState(null);
  const [act, setAct] = useState(null);
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const isFine = form.actionType === 'fine';
  const isSuspension = form.actionType === 'suspension';

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const open = (prefill = {}) => { setForm({ ...empty, ...prefill }); setPrior(null); setModal(true); };
  // From the Dashboard's New menu, or an incident's "Issue discipline action" (?new=1&student=&incident=).
  useNewFromLink(true, (want, prefill) => open(prefill), ['student', 'incident']);

  // How many actions the chosen student already has — the form says so before it is issued.
  useEffect(() => {
    if (!modal || !form.student) { setPrior(null); return undefined; }
    let alive = true;
    api.getStudentDiscipline(form.student).then((r) => alive && setPrior(r.data ?? r)).catch(() => alive && setPrior(null));
    return () => { alive = false; };
  }, [modal, form.student]);

  const refresh = () => { reload(); if (repeat) reloadOff(); };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.createDiscipline({
        ...form, hostel: form.hostel || null, incident: form.incident || null, fineAmount: Number(form.fineAmount) || 0,
        suspensionFrom: form.suspensionFrom || null, suspensionTo: form.suspensionTo || null,
      });
      const d = r.data ?? r;
      toast.success('Disciplinary action issued');
      if (d.fine) toast(`A fine of ${money(d.fine.netAmount)} was billed`, { duration: 6000 });
      if (d.action?.isRepeatOffence) toast(`Repeat offence — ${d.action.priorCount} prior action(s)`, { duration: 6000 });
      setModal(false); refresh();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const openRecord = async (studentId, name) => {
    setRecord({ loading: true, name });
    try { const r = await api.getStudentDiscipline(studentId); setRecord({ ...(r.data ?? r), name }); }
    catch (err) { toast.error(err.message); setRecord(null); }
  };
  const openDetail = (row) => { setDetail(row); openRecordFor(row); };
  const [history, setHistory] = useState(null);
  const openRecordFor = async (row) => {
    setHistory(null);
    try { const r = await api.getStudentDiscipline(row.studentId); setHistory(r.data ?? r); } catch { setHistory(null); }
  };

  const ask = (row, status) => { setAct({ row, status }); setRemark(''); };
  const submitAct = async () => {
    setBusy(true);
    try {
      const body = { status: act.status };
      if (remark.trim()) body.remarks = [act.row.remarks, `${STATUS[act.status]?.[0] || words(act.status)}: ${remark.trim()}`].filter(Boolean).join('\n');
      await api.updateDiscipline(act.row._id, body);
      toast.success(DONE[act.status] || 'Updated');
      const row = act.row; setAct(null); refresh();
      if (detail?._id === row._id) setDetail({ ...row, ...body });
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const openPolicy = async () => {
    setPolicy({ loading: true });
    try { const r = await api.getSettings(); setPolicy(r.data ?? r); } catch (err) { toast.error(err.message); setPolicy(null); }
  };

  const t = data?.tiles || {};
  const tabs = data?.tabs || {};
  const list = repeat ? offenders : data;
  const rows = list?.rows || [];
  const from = ((list?.page || 1) - 1) * (list?.limit || state.limit);
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));
  const studentCol = { key: 'student', label: 'Student', render: (r) => <StudentCell r={r} size={34} /> };
  const classCol = { key: 'class', label: 'Class', render: (r) => <span className="hs-muted-ink">{r.studentClass || '—'}</span>, nowrap: true };
  const roomCol = { key: 'room', label: 'Hostel / Room', render: (r) => <TwoLine top={r.hostelName || '—'} sub={where(r)} /> };

  const columns = repeat ? [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    studentCol, classCol, roomCol,
    { key: 'actions', label: 'Actions Taken', render: (r) => (
      <TwoLine top={`${r.actions} actions`} sub={[r.warnings && `${r.warnings} warning${r.warnings > 1 ? 's' : ''}`, r.fines && `${r.fines} fine${r.fines > 1 ? 's' : ''}`,
        r.escalations && `${r.escalations} escalation${r.escalations > 1 ? 's' : ''}`].filter(Boolean).join(' · ')} />
    ) },
    { key: 'last', label: 'Latest Reason', render: (r) => <span className="hs-wrap2">{r.lastViolation}</span> },
    { key: 'severity', label: 'Highest', render: (r) => <Severity value={r.severity} /> },
    { key: 'fines', label: 'Fines', render: (r) => (r.fineTotal ? rupees(r.fineTotal) : <span className="hs-muted">—</span>), nowrap: true },
    { key: 'date', label: 'Last Action', render: (r) => <TwoLine top={fmtDate(r.lastDate)} sub={r.open ? `${r.open} still open` : 'All settled'} />, nowrap: true },
  ] : [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    studentCol, classCol, roomCol,
    { key: 'type', label: 'Action Type', render: (r) => <ActionTag type={r.actionType} /> },
    { key: 'reason', label: 'Reason', render: (r) => <span className="hs-wrap2">{r.violation}</span> },
    { key: 'severity', label: 'Severity', render: (r) => <Severity value={r.severity} /> },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
    { key: 'date', label: 'Date', render: (r) => <TwoLine top={fmtDate(r.date)} sub={fmtTime(r.date)} />, nowrap: true },
  ];

  const csvCols = [
    { label: 'No.', value: (r) => r.actionNumber }, { label: 'Student', value: (r) => r.studentName }, { label: 'Roll', value: (r) => r.studentRoll },
    { label: 'Class', value: (r) => r.studentClass }, { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room', value: (r) => where(r) },
    { label: 'Action', value: (r) => words(r.actionType) }, { label: 'Violation', value: (r) => r.violation }, { label: 'Violation type', value: (r) => words(r.violationType) },
    { label: 'Severity', value: (r) => SEVERITY[r.severity]?.[0] }, { label: 'Status', value: (r) => STATUS[r.status]?.[0] },
    { label: 'Fine', value: (r) => r.fineAmount || '' }, { label: 'Repeat offence', value: (r) => (r.isRepeatOffence ? `Yes (${r.priorCount} prior)` : 'No') },
    { label: 'Date', value: (r) => stamp(r.date) }, { label: 'Issued by', value: (r) => r.issuedByName },
  ];
  const exportAll = async () => {
    try { const res = await api.getBoard('discipline', { ...state, tab: repeat ? 'all' : state.tab, page: 1, limit: 5000 }); exportCsv('hostel-discipline.csv', csvCols, (res.data ?? res).rows || []); }
    catch (err) { toast.error(err.message); }
  };

  const ladder = (r) => [
    ...LADDER(r.status).map(([status, text, icon]) => ({ label: text, icon, danger: status === 'revoked', onClick: () => ask(r, status) })),
    '-', { label: 'Student’s record', icon: 'history', onClick: () => openRecord(r.studentId, r.studentName) },
    ...(r.incidentId ? [{ label: `Open incident ${r.incidentNumber || ''}`, icon: 'alert', onClick: () => navigate(`/admin/hostel/incidents?search=${encodeURIComponent(r.incidentNumber || '')}`) }] : []),
  ];

  return (
    <div className="hs-page">
      <PageHead title="Discipline" subtitle="Manage warnings, fines, escalations and repeat-offence tracking for hostel residents.">
        <Btn className="hs-btn--accent" icon="download" onClick={exportAll}>Export</Btn>
        <Btn className="hs-btn--accent" icon="fileDoc" onClick={openPolicy}>Discipline Policy</Btn>
        <Btn kind="primary" icon="plus" onClick={() => open()}>Issue Action</Btn>
      </PageHead>

      <Kpis cols={4} size="lg">
        <Kpi tone="indigo" icon="gavel" value={t.total ?? 0} label="Total Actions" delta={t.delta} />
        <Kpi tone="green" icon="checkCircle" value={t.resolved ?? 0} label="Resolved" pct={t.resolvedPct ?? 0}
          pctLabel={`${t.resolvedPct ?? 0}% resolution rate`} pctTone="green" bar barColor="#12b76a" />
        <Kpi tone="amber" icon="clockSolid" value={t.review ?? 0} label="Under Review" pct={t.reviewPct ?? 0} pctTone="amber" bar barColor="#f79009" />
        <Kpi tone="red" icon="alertTri" value={t.offenders ?? 0} label="Repeat Offenders" pct={t.offendersPct ?? 0}
          pctLabel={`${t.offendersPct ?? 0}%`} pctTone="red" bar barColor="#f04438" />
      </Kpis>

      <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Actions by kind"
        items={[
          { key: 'all', label: 'All Actions', count: tabs.all ?? 0 },
          { key: 'warnings', label: 'Warnings', count: tabs.warnings ?? 0 },
          { key: 'fines', label: 'Fines', count: tabs.fines ?? 0 },
          { key: 'escalations', label: 'Escalations', count: tabs.escalations ?? 0 },
          { key: 'repeat', label: 'Repeat Offenders', count: tabs.repeat ?? 0, tone: 'bad' },
        ]} />

      <FilterBar>
        <FSelect value={state.action} onChange={(v) => set({ action: v })} all="All actions" options={ACTIONS.map((x) => ({ value: x, label: words(x) }))} grow={0} width="124px" />
        <FSelect value={state.severity} onChange={(v) => set({ severity: v })} all="All severities" options={Object.entries(SEVERITY).map(([value, [label]]) => ({ value, label }))} grow={0} width="132px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={Object.entries(STATUS).map(([value, [label]]) => ({ value, label }))} grow={0} width="124px" />
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={hostels.map((h) => ({ value: h._id, label: h.name }))} grow={0} width="124px" />
        <FDateRange from={state.from} to={state.to} onChange={(v) => set(v)} grow={0} width="236px" />
        <FSearch compact value={state.search} onChange={(v) => set({ search: v })} placeholder="Search by student name, roll no., incident..." grow={1} width="200px" />
        <MoreFilters groups={[
          { key: 'violation', title: 'Violation', value: state.violation, onPick: (v) => set({ violation: v }), options: [['', 'Any violation'], ...VIOLATIONS.map((v) => [v, words(v)])] },
          { key: 'sort', title: 'Order', value: state.sort ? `${state.sort}:${state.dir}` : '', onPick: (v) => { const [s, d] = v.split(':'); set({ sort: s || '', dir: d || '' }); },
            options: [['', 'Newest first'], ['date:asc', 'Oldest first'], ['severity:asc', 'Most severe first']] },
        ]} />
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
      </FilterBar>

      <ListCard>
        {!repeat ? (
          <BulkBar count={selected.size} noun="action" onClear={() => setSelected(new Set())}>
            <Btn size="sm" icon="download" onClick={() => exportCsv('hostel-discipline.csv', csvCols, rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
          </BulkBar>
        ) : null}
        <DataTable
          key={repeat ? 'repeat' : 'actions'}
          columns={columns} rows={rows} loading={repeat ? offLoading : loading} pad={9} headPad={12} dense
          rowKey={repeat ? 'studentId' : '_id'} select={!repeat}
          selected={selected} onSelect={setSelected}
          actions={(r) => (repeat ? (
            <Btn size="sm" icon="eye" onClick={() => openRecord(r.studentId, r.studentName)}>View</Btn>
          ) : (
            <>
              <Btn size="sm" icon="eye" onClick={() => openDetail(r)}>View</Btn>
              <Kebab label={`Actions for ${r.actionNumber}`} items={ladder(r)} />
            </>
          ))}
          empty={(
            <EmptyRows icon="gavel" title={repeat ? 'No repeat offenders' : filtered || tab !== 'all' ? 'No action matches' : 'No disciplinary actions'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={() => open()}>Issue Action</Btn>}>
              {repeat ? 'Nobody has more than one action on record.' : filtered || tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Warnings, fines and escalations issued to residents are kept here.'}
            </EmptyRows>
          )}
        />
        <Pager page={list?.page || 1} pages={list?.pages || 1} total={list?.total || 0} limit={list?.limit || state.limit}
          noun={repeat ? (list?.total === 1 ? 'student' : 'students') : (list?.total === 1 ? 'action' : 'actions')}
          onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      {/* ── Issue ─────────────────────────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save}
        icon="gavel" title="Issue Disciplinary Action" subtitle="The student and their parents are told. Earlier actions are counted and a repeat offence is flagged."
        submitLabel="Issue Action" submitIcon="check"
        steps={[
          { key: 'student', title: 'Student', sub: 'Who, and their record', icon: 'user' },
          { key: 'action', title: 'Violation & Action', sub: 'What happened, what follows', icon: 'gavel' },
          { key: 'details', title: 'Fine & Details', sub: 'Amount, dates and notes', icon: 'rupee' },
          { key: 'review', title: 'Review', sub: 'Confirm and issue', icon: 'oCheckRound' },
        ]}>
        <FormSection step="student" icon="user" title="Student" sub="The resident the action is issued to.">
          <Grid cols={2}>
            <Fld label="Student" required hint="Only current residents are listed">
              <StudentPicker value={form.student} onChange={(id) => setF('student', id)} params={{ allocated: 'true' }} />
            </Fld>
            <Fld label="Hostel" icon="oBuilding">
              <select value={form.hostel} onChange={(e) => setF('hostel', e.target.value)}>
                <option value="">From the student&apos;s allocation</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </Fld>
          </Grid>
          {prior?.total ? <InfoNote tone="amber">{prior.total} earlier action{prior.total > 1 ? 's' : ''} on record — this will be a repeat offence.</InfoNote> : null}
          {form.incident ? <InfoNote>Issued from an incident — it will be linked to it.</InfoNote> : null}
        </FormSection>
        <FormSection step="action" icon="gavel" title="Violation & Action" sub="What the student did, and the action taken.">
          <Fld label="Reason" required icon="fileDoc"><input value={form.violation} maxLength={150} placeholder="Returned after curfew three nights running" onChange={(e) => setF('violation', e.target.value)} /></Fld>
          <Grid cols={3}>
            <Fld label="Violation" required icon="oTag">
              <select value={form.violationType} onChange={(e) => setF('violationType', e.target.value)}>
                {VIOLATIONS.map((v) => <option key={v} value={v}>{words(v)}</option>)}
              </select>
            </Fld>
            <Fld label="Action" required icon="gavel">
              <select value={form.actionType} onChange={(e) => setF('actionType', e.target.value)}>
                {ACTIONS.map((x) => <option key={x} value={x}>{words(x)}</option>)}
              </select>
            </Fld>
            <Fld label="Severity" required icon="alert">
              <select value={form.severity} onChange={(e) => setF('severity', e.target.value)}>
                {Object.entries(SEVERITY).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Fld>
          </Grid>
        </FormSection>
        <FormSection step="details" icon="rupee" title="Fine & Details" sub="A fine above zero is billed as a hostel invoice.">
          <Grid cols={2}>
            <Fld label="Date" required icon="calendar"><input type="date" max={today()} value={form.date} onChange={(e) => setF('date', e.target.value)} /></Fld>
            <Fld label="Fine Amount (₹)" required={isFine} optional={!isFine} icon="rupee" hint={isFine ? 'Billed as a hostel invoice' : 'Optional — billed if above zero'}>
              <input type="number" min={isFine ? 1 : 0} value={form.fineAmount} onChange={(e) => setF('fineAmount', e.target.value)} />
            </Fld>
            {isSuspension ? (
              <>
                <Fld label="Suspended From" required icon="calendar"><input type="date" value={form.suspensionFrom} onChange={(e) => setF('suspensionFrom', e.target.value)} /></Fld>
                <Fld label="Suspended Until" required icon="calendar"><input type="date" min={form.suspensionFrom || undefined} value={form.suspensionTo} onChange={(e) => setF('suspensionTo', e.target.value)} /></Fld>
              </>
            ) : null}
          </Grid>
          <Fld label="Description" optional count={[form.description.length, 500]}>
            <textarea rows={3} maxLength={500} value={form.description} onChange={(e) => setF('description', e.target.value)} />
          </Fld>
          <Fld label="Remarks" optional icon="fileDoc"><input value={form.remarks} maxLength={200} onChange={(e) => setF('remarks', e.target.value)} /></Fld>
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Confirm the action before it is issued.">
          <ReviewList groups={[
            { title: 'Student', step: 0, rows: [['Hostel', hostels.find((h) => h._id === form.hostel)?.name || 'From the allocation'], ['Earlier actions', prior ? String(prior.total || 0) : ''], ['From incident', form.incident ? 'Yes' : '']] },
            { title: 'Violation & action', step: 1, rows: [['Reason', form.violation], ['Violation', words(form.violationType)], ['Action', words(form.actionType)], ['Severity', SEVERITY[form.severity]?.[0]]] },
            { title: 'Details', step: 2, rows: [['Date', dmy(form.date)], ['Fine', Number(form.fineAmount) ? `₹${form.fineAmount}` : ''], ['Suspension', isSuspension && form.suspensionFrom ? `${dmy(form.suspensionFrom)} – ${dmy(form.suspensionTo)}` : ''], ['Description', form.description], ['Remarks', form.remarks]] },
          ]} />
        </FormSection>
      </FormModal>

      {/* ── One action ─────────────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Disciplinary action">
        {detail ? (
          <>
            <DrawerHead mark={<Mark name="gavel" tone="indigo" size={52} glyph={26} />} name={detail.violation}
              sub={[detail.actionNumber, stamp(detail.date)].filter(Boolean).join(' · ')}
              tags={<><ActionTag type={detail.actionType} /><Severity value={detail.severity} /><Status value={detail.status} />{detail.isRepeatOffence ? <Badge tone="red" size="lg">Repeat offence</Badge> : null}</>}
              onClose={() => setDetail(null)} />
            <DrawerBody>
              <DrawerSection title="Action">
                {detail.description ? <p className="hs-dtext">{detail.description}</p> : null}
                <DrawerFields fields={[
                  ['Student', [detail.studentName, detail.studentRoll ? `Roll ${detail.studentRoll}` : '', detail.studentClass].filter(Boolean).join(' · ')],
                  ['Hostel', [detail.hostelName, where(detail)].filter(Boolean).join(' · ')],
                  ['Action', words(detail.actionType)], ['Violation', words(detail.violationType)],
                  ['Fine', detail.fineAmount ? `${rupees(detail.fineAmount)}${detail.fineInvoice ? ' — billed' : ''}` : ''],
                  ['Suspension', detail.suspensionFrom ? `${fmtDate(detail.suspensionFrom)} – ${fmtDate(detail.suspensionTo)}` : ''],
                  ['Earlier actions', detail.priorCount ? String(detail.priorCount) : 'None'],
                  ['Parents told', detail.parentNotified ? 'Yes' : 'Not yet'], ['Issued by', detail.issuedByName],
                  ['From incident', detail.incidentNumber], ['Remarks', detail.remarks],
                ]} />
              </DrawerSection>
              <DrawerSection title={history ? `${detail.studentName}’s record (${history.total})` : 'The student’s record'}>
                {history ? (
                  <ul className="hs-thread">
                    {history.actions.map((a) => (
                      <li key={a._id} className={a._id === detail._id ? 'is-on' : ''}>
                        <div><strong>{a.violation}</strong><span>{fmtDate(a.date)}</span></div>
                        <p>{words(a.actionType)} · {SEVERITY[a.severity]?.[0]} · {STATUS[a.status]?.[0]}{a.fineAmount ? ` · ${rupees(a.fineAmount)}` : ''}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="hs-muted">Loading…</p>}
              </DrawerSection>
            </DrawerBody>
            <DrawerFoot>
              <Kebab label="More steps" items={ladder(detail).slice(1)} />
              {ladder(detail).slice(0, 1).map((x) => <Btn key={x.label} kind="primary" icon={x.icon} onClick={x.onClick}>{x.label}</Btn>)}
            </DrawerFoot>
          </>
        ) : null}
      </Drawer>

      {/* ── A student's whole record ───────────────────────────────────────── */}
      <Drawer open={!!record} onClose={() => setRecord(null)} label="Disciplinary record">
        {record ? (
          <>
            <DrawerHead mark={<Mark name="person" tone="red" size={52} glyph={26} />} name={record.name || 'Disciplinary record'}
              sub={record.loading ? '' : `${record.total} action${record.total === 1 ? '' : 's'} · ${rupees(record.totalFines)} in fines`}
              tags={!record.loading && record.repeatOffender ? <Badge tone="red" size="lg">Repeat offender</Badge> : null}
              onClose={() => setRecord(null)} />
            <DrawerBody>
              {record.loading ? <p className="hs-muted">Loading…</p> : (
                <>
                  {Object.keys(record.byType || {}).length ? (
                    <div className="hs-chips">{Object.entries(record.byType).map(([k, v]) => <Badge key={k} tone="slate" size="lg">{words(k)} · {v}</Badge>)}</div>
                  ) : null}
                  <DrawerSection title="History">
                    {record.actions?.length ? (
                      <ul className="hs-thread">
                        {record.actions.map((a) => (
                          <li key={a._id}>
                            <div><strong>{a.violation}</strong><span>{fmtDate(a.date)}</span></div>
                            <p>{words(a.actionType)} · {SEVERITY[a.severity]?.[0]} · {STATUS[a.status]?.[0]}{a.fineAmount ? ` · ${rupees(a.fineAmount)}` : ''}</p>
                            {a.description ? <p className="hs-muted">{a.description}</p> : null}
                          </li>
                        ))}
                      </ul>
                    ) : <p className="hs-muted">A clean record.</p>}
                  </DrawerSection>
                </>
              )}
            </DrawerBody>
          </>
        ) : null}
      </Drawer>

      {/* ── One step ───────────────────────────────────────────────────────── */}
      <FormModal open={!!act} onClose={() => setAct(null)} busy={busy} onSubmit={submitAct}
        icon={act?.status === 'revoked' ? 'closeCircle' : act?.status === 'served' ? 'checkCircle' : act?.status === 'issued' ? 'refresh' : 'search'}
        iconTone={act?.status === 'revoked' ? 'red' : act?.status === 'served' ? 'green' : 'indigo'}
        title={act ? LADDER(act.row.status).find(([x]) => x === act.status)?.[1] || 'Update' : ''}
        subtitle={act ? [act.row.actionNumber, act.row.violation].filter(Boolean).join(' · ') : ''}
        submitLabel={act ? LADDER(act.row.status).find(([x]) => x === act.status)?.[1] || 'Confirm' : 'Confirm'}
        tone={act?.status === 'revoked' ? 'danger' : undefined}>
        {act ? (
          <FormSection>
            <PersonCard name={act.row.studentName} photo={act.row.studentPhoto} meta={[act.row.studentClass, act.row.hostelName]} />
            {act.status === 'revoked' ? <InfoNote tone="amber">A revoked action stays on the record, marked as withdrawn. Any fine already billed is not refunded from here — adjust the invoice under Fees.</InfoNote> : null}
            <Fld label="Remark" required={act.status === 'revoked'} optional={act.status !== 'revoked'} hint="Added to the action's remarks" count={[remark.length, 300]}>
              <textarea rows={3} maxLength={300} value={remark} onChange={(e) => setRemark(e.target.value)} />
            </Fld>
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── Policy ─────────────────────────────────────────────────────────── */}
      <Drawer open={!!policy} onClose={() => setPolicy(null)} label="Discipline policy">
        {policy ? (
          <>
            <DrawerHead mark={<Mark name="fileDoc" tone="indigo" size={52} glyph={26} />} name="Discipline Policy" sub="How actions escalate, and the rules in force" onClose={() => setPolicy(null)} />
            <DrawerBody>
              <DrawerSection title="The ladder">
                <ol className="hs-ladder">
                  {POLICY.map(([k, text]) => (
                    <li key={k}><ActionTag type={k} /><div><strong>{words(k)}</strong><p>{text}</p></div></li>
                  ))}
                </ol>
              </DrawerSection>
              {!policy.loading ? (
                <DrawerSection title="Rules in force">
                  <DrawerFields fields={[
                    ['Curfew', policy.curfewTime], ['Grace for late return', `${policy.lateReturnGraceMinutes ?? 0} min`],
                    ['Late return fine', policy.lateReturnFine ? rupees(policy.lateReturnFine) : 'None'],
                    ['Curfew violation fine', policy.curfewViolationFine ? rupees(policy.curfewViolationFine) : 'None'],
                    ['Parents told of each action', policy.notifyParentOnDiscipline ? 'Yes' : 'No'],
                  ]} />
                  <p className="hs-muted">These are set under <Link to="/admin/hostel/settings">Hostel Settings</Link>.</p>
                </DrawerSection>
              ) : null}
            </DrawerBody>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
