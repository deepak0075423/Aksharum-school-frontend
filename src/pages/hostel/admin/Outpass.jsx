/**
 * Hostel → Outpass (Sep 2026 redesign, to the user's mockup).
 *
 * Five figures, two rows of filters, a tab per state and the passes table,
 * from GET /hostel/admin/board/outpass. Approval still mints the QR pass and
 * the gate still resolves a pass from its token — never from an id somebody
 * typed — so a student cannot present another's pass.
 */
import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { PassQr, today, useNewFromLink } from '../shared';
import { PageHead, words } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, LineTabs, Btn, IconBtn, Kebab, Popover, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, Avatar, TwoLine, useListState, useBoardData, exportCsv, fmtDate, fmtTime, fmtPhone,
} from './hsList';
import { StudentCell, roomTight, roomShort } from './hsPeople';
import { FormModal, FormSection, Grid, Fld, RadioCards, StudentPicker, studentMeta, PersonCard, SummaryCard, FileDrop, InfoNote, ReviewList, dmy, ampm } from './hsForm';
import PhoneInput from '../../../components/ui/PhoneInput';
import { GateModal } from './hsGate';

/** An outpass type as the mockup tags it: its words, its tint and its glyph. */
export const OUTPASS_TYPE = {
  day: ['Day', 'blue', 'house'], night: ['Night', 'violet', 'calendar'], weekend: ['Weekend', 'teal', 'calendar'], medical: ['Medical', 'red', 'cross'],
  emergency: ['Emergency', 'red', 'alertTri'], academic: ['Academic', 'green', 'trophy'], market: ['Market', 'orange', 'person'],
  other: ['Personal', 'orange', 'person'],
};
const OutpassType = ({ value }) => {
  const [text, tone, glyph] = OUTPASS_TYPE[value] || [words(value), 'slate', 'dot'];
  return <Badge tone={tone} glyph={glyph} size="lg">{text}</Badge>;
};
const STATUS = {
  pending: ['Pending', 'amber'], approved: ['Approved', 'green'], rejected: ['Rejected', 'red'], cancelled: ['Cancelled', 'slate'],
  active: ['Active', 'blue'], returned: ['Returned', 'blue'], overdue: ['Overdue', 'red'],
};
/** The actions that move a pass forward (green), as against turning it down. */
const GOOD = ['approve', 'parent_approve'];
const StatusTag = ({ value }) => { const [text, tone] = STATUS[value] || [words(value), 'slate']; return <Badge tone={tone} size="lg">{text}</Badge>; };

const empty = {
  student: '', kind: 'day', outpassType: 'day', purpose: '', destination: '',
  departureDate: today(), expectedDepartureTime: '', expectedReturnDate: today(), expectedReturnTime: '',
  guardianName: '', guardianPhone: '', guardianRelation: '', emergencyContact: '', remarks: '', attachments: [],
};
/** The mockup's four cards; "Other" opens the rest of the types. */
const KINDS = [['day', 'Day Out'], ['night', 'Overnight'], ['weekend', 'Weekend'], ['other', 'Other']];
const OTHER_TYPES = ['medical', 'emergency', 'academic', 'market', 'other'];
const KIND_LABEL = { day: 'Day Out', night: 'Overnight', weekend: 'Weekend' };
const FILTERS = { hostel: '', building: '', room: '', class: '', status: '', from: '', to: '', outpassType: '', late: '' };

/** When the pass takes (or took) the student out: the gate's time, else the plan. */
const outAt = (r) => {
  if (r.actualDepartureAt) return new Date(r.actualDepartureAt);
  if (!r.departureDate) return null;
  const d = new Date(r.departureDate);
  const [h, m] = String(r.expectedDepartureTime || '').split(':').map(Number);
  if (Number.isFinite(h)) d.setHours(h, m || 0, 0, 0);
  return d;
};
const When = ({ at, time = true }) => (at ? <TwoLine top={fmtDate(at)} sub={time ? fmtTime(at) : ''} /> : <span className="hs-muted">-</span>);
const stamp = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '');

export default function Outpass() {
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS });
  const tab = ['pending', 'approved', 'rejected', 'active', 'overdue'].includes(state.tab) ? state.tab : 'all';
  const { data, loading, reload } = useBoardData((q) => api.getBoard('outpass', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const buildings = (meta?.buildings || []).filter((b) => !state.hostel || String(b.hostel) === state.hostel);
  const roomOptions = (meta?.rooms || []).filter((r) => (state.building ? String(r.building) === state.building : !state.hostel || String(r.hostel) === state.hostel));

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [act, setAct] = useState(null);
  const [remark, setRemark] = useState('');
  const [detail, setDetail] = useState(null);
  const [gate, setGate] = useState(null);       // { token } while the gate dialog is open
  const [showPass, setShowPass] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [more, setMore] = useState(false);
  const moreBtn = useRef(null);
  const [picked, setPicked] = useState(null);
  const [rules, setRules] = useState(null);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const open = () => {
    setForm({ ...empty, departureDate: today(), expectedReturnDate: today() }); setPicked(null); setModal(true);
    if (!rules) api.getSettings().then((r) => setRules(r.data ?? r)).catch(() => {});
  };
  const years = meta?.academicYears || [];
  const pickStudent = (id, st) => {
    setPicked(st || null);
    setForm((f) => ({ ...f, student: id, guardianName: st?.guardianName || '', guardianPhone: st?.guardianPhone || '', guardianRelation: st?.guardianRelation || '' }));
  };
  const typeLabel = (f) => (f.kind === 'other' ? (OUTPASS_TYPE[f.outpassType] || [words(f.outpassType)])[0] : KIND_LABEL[f.kind]);
  const when = (d, t) => [dmy(d), ampm(t)].filter(Boolean).join(', ');
  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(true, () => open());

  const save = async () => {
    setSaving(true);
    try {
      const { kind, ...body } = form;
      await api.createOutpass({ ...body, outpassType: kind === 'other' ? form.outpassType : kind });
      toast.success('Outpass requested'); setModal(false); reload();
    }
    catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const ask = (row, action) => { setAct({ row, action }); setRemark(''); };
  const submitAct = async () => {
    setBusy(true);
    try {
      const r = await api.actOnOutpass(act.row._id, { action: act.action, remark });
      const d = r.data ?? r;
      toast.success(act.action === 'parent_approve' ? 'Parent consent recorded' : `Outpass ${act.action === 'approve' ? 'approved' : act.action === 'reject' ? 'rejected' : 'cancelled'}`);
      // An approval mints the pass — show it at once so it can be handed over.
      if (act.action === 'approve' && d?.qrImage) setShowPass({ ...act.row, ...d, studentName: act.row.studentName });
      setAct(null); setRemark(''); setDetail(null); reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const openGate = (token = '') => setGate({ token });

  const sweep = async () => {
    try {
      const r = await api.sweepOverdue();
      const d = r.data ?? r;
      toast.success(`${d.outpasses} outpass(es) and ${d.leaves} leave(s) marked overdue`);
      reload();
    } catch (err) { toast.error(err.message); }
  };

  /** The pass itself: its QR while it is live, its record once it is used. */
  const openPass = async (row) => {
    if (!row.qrToken) { setShowPass({ ...row, closed: true }); return; }
    setShowPass({ ...row, loading: true });
    try { const r = await api.verifyOutpass(row.qrToken); setShowPass({ ...row, ...(r.data ?? r), studentName: row.studentName }); }
    catch (err) { toast.error(err.message); setShowPass(null); }
  };

  const steps = (r) => [
    // Where the school asks for it, a student's pass waits for a parent first.
    r.awaitingParent && { label: 'Record parent consent', icon: 'checkCircle', onClick: () => ask(r, 'parent_approve') },
    r.status === 'pending' && !r.awaitingParent && { label: 'Approve', icon: 'checkCircle', onClick: () => ask(r, 'approve') },
    r.status === 'pending' && { label: 'Reject', icon: 'closeCircle', danger: true, onClick: () => ask(r, 'reject') },
    r.status === 'approved' && { label: 'Record departure at the gate', icon: 'logOut', onClick: () => openGate(r.qrToken) },
    ['active', 'overdue'].includes(r.status) && { label: 'Record return at the gate', icon: 'logIn', onClick: () => openGate(r.qrToken) },
    r.qrToken && { label: 'Show gate pass', icon: 'qr', onClick: () => openPass(r) },
    ['pending', 'approved'].includes(r.status) && '-',
    ['pending', 'approved'].includes(r.status) && { label: 'Cancel outpass', icon: 'trash', danger: true, onClick: () => ask(r, 'cancel') },
  ];

  const t = data?.tiles || {};
  const tabs = data?.tabs || {};
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));
  const extra = (state.outpassType ? 1 : 0) + (state.late ? 1 : 0);

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'student', label: 'Student', render: (r) => <StudentCell r={r} /> },
    { key: 'class', label: 'Class', render: (r) => r.studentClass || '—', nowrap: true },
    { key: 'room', label: 'Hostel / Room', render: (r) => <TwoLine top={[r.hostelName, roomTight(r)].filter(Boolean).join(' - ') || '—'} sub={r.bedNumber ? `Bed ${r.bedNumber}` : ''} /> },
    { key: 'type', label: 'Outpass Type', render: (r) => <OutpassType value={r.outpassType} /> },
    { key: 'out', label: 'Out Time', render: (r) => <When at={outAt(r)} time={!!(r.actualDepartureAt || r.expectedDepartureTime)} />, nowrap: true },
    { key: 'back', label: 'Expected Return', render: (r) => <When at={r.expectedReturnAt} />, nowrap: true },
    { key: 'ret', label: 'Actual Return', render: (r) => (
      r.actualReturnAt ? <TwoLine top={fmtDate(r.actualReturnAt)} sub={fmtTime(r.actualReturnAt)} danger={r.lateReturnMinutes > 0} /> : <span className="hs-muted">-</span>
    ), nowrap: true },
    { key: 'status', label: 'Status', render: (r) => (
      <span className="hs-stack"><StatusTag value={r.status} />{r.awaitingParent ? <small className="is-warn">Awaiting parent consent</small> : null}{r.lateReturnMinutes > 0 ? <small className="is-bad">{r.lateReturnMinutes} min late</small> : null}</span>
    ) },
    { key: 'pass', label: 'Gate Pass', align: 'center', render: (r) => (r.approvedAt
      ? <IconBtn icon="qr" size="sm" kind="ghost" className="hs-qrbtn" label={r.qrToken ? 'Show the gate pass' : 'Gate pass record'} onClick={() => openPass(r)} />
      : <span className="hs-muted">-</span>) },
  ];

  const csv = (list) => exportCsv('hostel-outpasses.csv', [
    { label: 'Outpass no.', value: (r) => r.outpassNumber }, { label: 'Student', value: (r) => r.studentName },
    { label: 'Roll', value: (r) => r.studentRoll }, { label: 'Class', value: (r) => r.studentClass },
    { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room / Bed', value: (r) => roomShort(r) },
    { label: 'Type', value: (r) => (OUTPASS_TYPE[r.outpassType] || [r.outpassType])[0] }, { label: 'Purpose', value: (r) => r.purpose },
    { label: 'Out', value: (r) => stamp(outAt(r)) }, { label: 'Expected return', value: (r) => stamp(r.expectedReturnAt) },
    { label: 'Actual return', value: (r) => stamp(r.actualReturnAt) }, { label: 'Late (min)', value: (r) => r.lateReturnMinutes || '' },
    { label: 'Status', value: (r) => (STATUS[r.status] || [r.status])[0] },
  ], list);

  return (
    <div className="hs-page">
      <PageHead title="Hostel Outpass" subtitle="Manage student outpasses with gate verification, parent consent and return tracking.">
        <Btn className="hs-btn--accent" icon="qr" onClick={() => openGate()}>Gate Pass</Btn>
        <Btn className="hs-btn--accent" icon="clock" onClick={sweep}>Sweep Overdue</Btn>
        <Btn kind="primary" icon="plus" onClick={open}>New Outpass</Btn>
      </PageHead>

      <Kpis cols={5} size="lg">
        <Kpi tone="indigo" icon="passes" value={t.total ?? 0} label="Total Outpasses" delta={t.delta} />
        <Kpi tone="green" icon="checkCircle" value={t.approved ?? 0} label="Approved" pct={t.approvedPct ?? 0} pctTone="green" bar inline barColor="#12b76a" />
        <Kpi tone="amber" icon="clockSolid" value={t.pending ?? 0} label="Pending" pct={t.pendingPct ?? 0} pctTone="amber" bar inline barColor="#f79009" />
        <Kpi tone="red" icon="xCircle" value={t.rejected ?? 0} label="Rejected" pct={t.rejectedPct ?? 0} pctTone="red" bar inline barColor="#f04438" />
        <Kpi tone="sky" icon="swap" value={t.active ?? 0} label="Active Outside" pct={t.activePct ?? 0} pctTone="blue" bar inline barColor="#2b8ef0" />
      </Kpis>

      <FilterBar below={(
        <>
          <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search student name, roll no. or outpass no..." grow={0} width="358px" />
          <span className="hs-filters__end">
            <Btn ref={moreBtn} icon="filter" aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((o) => !o)}>Filter{extra ? ` · ${extra}` : ''}</Btn>
            <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
          </span>
          <Popover anchor={moreBtn} open={more} onClose={() => setMore(false)} label="More filters">
            <div className="hs-menu2" role="menu">
              <button type="button" role="menuitemradio" aria-checked={!state.outpassType} className={`hs-menu2__item${!state.outpassType ? ' is-on' : ''}`}
                onClick={() => { set({ outpassType: '' }); setMore(false); }}><span>All outpass types</span></button>
              {Object.entries(OUTPASS_TYPE).map(([k, [text]]) => (
                <button key={k} type="button" role="menuitemradio" aria-checked={state.outpassType === k} className={`hs-menu2__item${state.outpassType === k ? ' is-on' : ''}`}
                  onClick={() => { set({ outpassType: k }); setMore(false); }}><span>{text}</span></button>
              ))}
              <div className="hs-menu2__rule" role="separator" />
              <button type="button" role="menuitemcheckbox" aria-checked={!!state.late} className={`hs-menu2__item${state.late ? ' is-on' : ''}`}
                onClick={() => { set({ late: state.late ? '' : '1' }); setMore(false); }}><span>Late returns only</span></button>
            </div>
          </Popover>
        </>
      )}>
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v, building: '', room: '' })} all="All hostels" options={(meta?.hostels || []).map((h) => ({ value: h._id, label: h.name }))} width="130px" />
        <FSelect value={state.building} onChange={(v) => set({ building: v, room: '' })} all="All buildings" options={buildings.map((b) => ({ value: b._id, label: b.name }))} width="130px" />
        <FSelect value={state.room} onChange={(v) => set({ room: v })} all="All rooms" options={roomOptions.map((r) => ({ value: r._id, label: r.roomNumber }))} width="130px" />
        <FSelect value={state.class} onChange={(v) => set({ class: v })} all="All classes" options={(meta?.classes || []).map((c) => ({ value: c._id, label: c.className }))} width="120px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={Object.entries(STATUS).map(([value, [label]]) => ({ value, label }))} width="120px" />
        <label className="hs-fdate"><input type="date" value={state.from} onChange={(e) => set({ from: e.target.value })} aria-label="Out on or after" /></label>
        <label className="hs-fdate"><input type="date" value={state.to} min={state.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label="Out on or before" /></label>
      </FilterBar>

      <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Outpasses by state"
        items={[
          { key: 'all', label: 'All Outpasses', count: tabs.all ?? 0 },
          { key: 'pending', label: 'Pending', count: tabs.pending ?? 0 },
          { key: 'approved', label: 'Approved', count: tabs.approved ?? 0 },
          { key: 'rejected', label: 'Rejected', count: tabs.rejected ?? 0, tone: 'bad' },
          { key: 'active', label: 'Active Outside', count: tabs.active ?? 0 },
          { key: 'overdue', label: 'Overdue', count: tabs.overdue ?? 0 },
        ]} />

      <ListCard className="hs-lcard--undertabs">
        <BulkBar count={selected.size} noun="outpass" plural="outpasses" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => csv(rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={5} headPad={11} dense
          selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" icon="eye" onClick={() => setDetail(r)}>View</Btn>
              {r.status === 'pending' && !r.awaitingParent ? <Btn size="sm" kind="success" onClick={() => ask(r, 'approve')}>Approve</Btn> : null}
              <Kebab label={`Actions for ${r.studentName}`} items={[{ label: 'View details', icon: 'eye', onClick: () => setDetail(r) }, ...steps(r)]} />
            </>
          )}
          empty={(
            <EmptyRows icon="passes" title={filtered || tab !== 'all' ? 'No outpass matches' : 'No outpasses'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={open}>New Outpass</Btn>}>
              {filtered || tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Short exits — a day out, a doctor’s visit — are requested here.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'outpass' : 'outpasses'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      {/* ── New outpass ───────────────────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save}
        icon="oExit" title="New Outpass Request" subtitle="Create an outpass request for a student with all necessary details."
        submitLabel="Submit Request" submitIcon="check"
        steps={[
          { key: 'student', title: 'Student Details', sub: 'Select student and basic information', icon: 'user' },
          { key: 'details', title: 'Outpass Details', sub: 'Set purpose, type and timing', icon: 'calendar' },
          { key: 'dest', title: 'Destination & Contact', sub: 'Where the student is going', icon: 'mapPin' },
          { key: 'docs', title: 'Documents', sub: 'Upload supporting documents', icon: 'paperclip' },
          { key: 'review', title: 'Review', sub: 'Verify and submit', icon: 'oCheckRound' },
        ]}
        aside={<>
          <SummaryCard icon="fileDoc" title="Outpass Summary" sub="Review the details before submitting" rows={[
            ['Student', picked?.name], ['Class', picked?.className], ['Academic Year', years.find((y) => y._id === picked?.allocation?.academicYear)?.yearName],
            ['Outpass Type', typeLabel(form)], ['Departure', when(form.departureDate, form.expectedDepartureTime)],
            ['Expected Return', when(form.expectedReturnDate, form.expectedReturnTime)], ['Destination', form.destination], ['Guardian', form.guardianName], ['Purpose', form.purpose],
          ]} />
          <InfoNote title="Automatic Validations">
            Room availability, active allocation, hostel rules and leave limits will be checked before submission.
            {rules ? ` Outpasses may start between ${ampm(rules.outpassFrom)} and ${ampm(rules.outpassTo)} and last up to ${rules.maxOutpassHours} hour${rules.maxOutpassHours === 1 ? '' : 's'}.` : ''}
          </InfoNote>
        </>}>
        <FormSection step="student" icon="user" title="Student Details" sub="Select the student and academic year">
          <Grid cols={2}>
            <Fld label="Student" required hint="Only current residents are listed">
              <StudentPicker value={form.student} onChange={pickStudent} params={{ allocated: 'true' }} />
            </Fld>
            <Fld label="Academic Year" required icon="calendar" hint={picked ? 'Taken from the student’s allocation' : ''}>
              <select value={picked?.allocation?.academicYear || years.find((y) => y.status === 'active')?._id || ''} disabled onChange={() => {}}>
                {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
              </select>
            </Fld>
          </Grid>
          {picked ? <PersonCard name={picked.name} photo={picked.profileImage} meta={[...studentMeta(picked), picked.allocation?.hostelName]} badge="Active" /> : null}
        </FormSection>
        <FormSection step="details" icon="calendar" title="Outpass Details" sub="Choose type, dates and reason for the outpass">
          <RadioCards label="Outpass Type" required cols={4} value={form.kind} onChange={(v) => setForm((f) => ({ ...f, kind: v, outpassType: v === 'other' ? 'other' : v,
            expectedReturnDate: v === 'day' ? f.departureDate : f.expectedReturnDate }))} options={KINDS} />
          {form.kind === 'other' ? (
            <Grid cols={2}>
              <Fld label="Kind of Outpass" required icon="oTag">
                <select value={form.outpassType} onChange={(e) => setF('outpassType', e.target.value)}>
                  {OTHER_TYPES.map((v) => <option key={v} value={v}>{(OUTPASS_TYPE[v] || [words(v)])[0]}</option>)}
                </select>
              </Fld>
            </Grid>
          ) : null}
          <Grid cols={4} className="is-compact">
            <Fld label="Departure Date" required>
              <input type="date" value={form.departureDate} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, departureDate: v, expectedReturnDate: f.kind === 'day' || !f.expectedReturnDate || f.expectedReturnDate < v ? v : f.expectedReturnDate })); }} />
            </Fld>
            <Fld label="Departure Time" required><input type="time" value={form.expectedDepartureTime} onChange={(e) => setF('expectedDepartureTime', e.target.value)} /></Fld>
            <Fld label="Expected Return Date" required>
              <input type="date" min={form.departureDate || undefined} value={form.expectedReturnDate} onChange={(e) => setF('expectedReturnDate', e.target.value)} />
            </Fld>
            <Fld label="Expected Return Time" required><input type="time" value={form.expectedReturnTime} onChange={(e) => setF('expectedReturnTime', e.target.value)} /></Fld>
          </Grid>
          <Fld label="Purpose / Reason" required count={[form.purpose.length, 500]}>
            <textarea rows={2} maxLength={500} value={form.purpose} placeholder="Enter reason for outpass (e.g., family function, medical, personal work, etc.)" onChange={(e) => setF('purpose', e.target.value)} />
          </Fld>
        </FormSection>
        <FormSection step="dest" icon="mapPin" title="Destination & Guardian Details" sub="Provide destination address and guardian contact information">
          <Fld label="Destination / Address" required count={[form.destination.length, 200]}>
            <textarea rows={2} maxLength={200} value={form.destination} placeholder="Enter full destination address" onChange={(e) => setF('destination', e.target.value)} />
          </Fld>
          <Grid cols={3}>
            <Fld label="Guardian Name" required><input data-text="name" value={form.guardianName} maxLength={80} placeholder="Enter guardian name" onChange={(e) => setF('guardianName', e.target.value)} /></Fld>
            <Fld label="Guardian Phone" required icon="phone"><PhoneInput value={form.guardianPhone} placeholder="Enter phone number" onChange={(e) => setF('guardianPhone', e.target.value)} /></Fld>
            <Fld label="Relation" required icon="users"><input data-text="letters" value={form.guardianRelation} maxLength={30} placeholder="e.g. Father, Mother, Uncle" onChange={(e) => setF('guardianRelation', e.target.value)} /></Fld>
          </Grid>
        </FormSection>
        <FormSection step="docs" icon="paperclip" title={<>Supporting Documents <small className="hsf-opt">(Optional)</small></>} sub="Upload any relevant documents (e.g., parent consent, medical note)">
          <FileDrop value={form.attachments} onChange={(v) => setF('attachments', v)} entityType="HostelOutpass" />
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Verify the outpass before it is submitted.">
          <ReviewList groups={[
            { title: 'Student', step: 0, rows: [['Student', picked?.name], ['Class', picked?.className], ['Hostel', picked?.allocation?.hostelName]] },
            { title: 'Outpass', step: 1, rows: [['Type', typeLabel(form)], ['Departure', when(form.departureDate, form.expectedDepartureTime)], ['Return', when(form.expectedReturnDate, form.expectedReturnTime)], ['Purpose', form.purpose]] },
            { title: 'Destination & guardian', step: 2, rows: [['Destination', form.destination], ['Guardian', [form.guardianName, form.guardianRelation && `(${form.guardianRelation})`, form.guardianPhone].filter(Boolean).join(' ')]] },
            { title: 'Documents', step: 3, rows: [['Files', form.attachments.length ? `${form.attachments.length} attached` : 'None']] },
          ]} />
        </FormSection>
      </FormModal>

      <GateModal open={!!gate} token={gate?.token} onClose={() => setGate(null)} onDone={() => { setDetail(null); reload(); }} />

      <FormModal open={!!act} onClose={() => setAct(null)} busy={busy} onSubmit={submitAct}
        icon={GOOD.includes(act?.action) ? 'checkCircle' : act?.action === 'reject' ? 'closeCircle' : 'trash'} iconTone={GOOD.includes(act?.action) ? 'green' : 'red'}
        title={act ? (act.action === 'parent_approve' ? 'Record Parent Consent' : `${act.action === 'approve' ? 'Approve' : act.action === 'reject' ? 'Reject' : 'Cancel'} Outpass`) : ''}
        subtitle={act ? [act.row.outpassNumber, act.row.purpose, outAt(act.row) ? fmtDate(outAt(act.row)) : ''].filter(Boolean).join(' · ') : ''}
        submitLabel={act?.action === 'approve' ? 'Approve & Issue Pass' : act?.action === 'parent_approve' ? 'Record Consent' : act?.action === 'reject' ? 'Reject' : 'Cancel Outpass'}
        tone={GOOD.includes(act?.action) ? undefined : 'danger'} cancelLabel={act?.action === 'cancel' ? 'Keep Outpass' : 'Cancel'}>
        {act ? (
          <FormSection>
            <PersonCard name={act.row.studentName} photo={act.row.studentPhoto} meta={[act.row.studentClass, act.row.hostelName]} />
            {act.action === 'parent_approve' ? (
              <InfoNote>Use this when a parent has agreed in person or on the phone. The parent can also consent from their own Hostel page. The outpass then waits for approval.</InfoNote>
            ) : (
              <Fld label={act.action === 'approve' ? 'Remark' : 'Reason'} required={act.action === 'reject'} optional={act.action !== 'reject'} count={[remark.length, 300]}>
                <textarea rows={3} maxLength={300} value={remark} onChange={(e) => setRemark(e.target.value)} />
              </Fld>
            )}
            {act.action === 'approve' ? <InfoNote>Approving issues a gate pass with a QR code — shown next, so it can be handed over.</InfoNote> : null}
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── The pass ──────────────────────────────────────────────────────── */}
      <FormModal open={!!showPass} onClose={() => setShowPass(null)} width={460} icon="qr" title="Gate Pass"
        subtitle={showPass ? [showPass.outpassNumber, showPass.studentName].filter(Boolean).join(' · ') : ''}
        cancelLabel="Close" hideSubmit={!showPass?.qrImage} submitLabel="Download PNG" submitIcon="download"
        onSubmit={() => { const x = document.createElement('a'); x.href = showPass.qrImage; x.download = `${showPass.outpassNumber || 'gate-pass'}.png`; x.click(); }}>
        {showPass ? (
          <FormSection>
            {showPass.loading ? <p className="hs-muted">Loading the pass…</p> : showPass.closed ? (
              <div className="hs-result">
                <h4>This pass is closed</h4>
                <p>Out: {stamp(showPass.actualDepartureAt) || 'not recorded'}</p>
                <p>Back: {stamp(showPass.actualReturnAt) || 'not recorded'}{showPass.lateReturnMinutes > 0 ? ` — ${showPass.lateReturnMinutes} min late` : ''}</p>
                <p>A pass stops working once the return is recorded, or the outpass is cancelled.</p>
              </div>
            ) : <div className="hsf-center"><PassQr image={showPass.qrImage} token={showPass.qrToken} caption={showPass.expectedReturnAt ? `Back by ${stamp(showPass.expectedReturnAt)}` : ''} /></div>}
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── Detail ────────────────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Outpass details">
        {detail ? (
          <>
            <DrawerHead
              mark={<Avatar name={detail.studentName} src={detail.studentPhoto} size={52} />}
              name={detail.studentName} sub={[detail.outpassNumber, detail.studentClass, detail.studentRoll ? `Roll ${detail.studentRoll}` : ''].filter(Boolean).join(' · ')}
              tags={<><StatusTag value={detail.status} /><OutpassType value={detail.outpassType} /></>}
              onClose={() => setDetail(null)}
            />
            <DrawerBody>
              <DrawerSection title="Outpass">
                <DrawerFields fields={[
                  ['Purpose', detail.purpose], ['Destination', detail.destination],
                  ['Hostel', detail.hostelName], ['Room / bed', detail.roomNumber ? roomShort(detail) : ''],
                  ['Departure date', fmtDate(detail.departureDate)],
                  ['Expected out', detail.expectedDepartureTime], ['Expected back', stamp(detail.expectedReturnAt)],
                  ['Requested on', stamp(detail.createdAt)],
                  ['Parent consent', !detail.parentApprovalRequired ? '' : detail.parentApprovedAt ? `Given ${stamp(detail.parentApprovedAt)}` : detail.status === 'pending' ? 'Waiting for a parent' : 'Not given'],
                  ['Approved on', stamp(detail.approvedAt)],
                  ['Rejection reason', detail.rejectionReason], ['Remarks', detail.remarks],
                ]} />
              </DrawerSection>
              <DrawerSection title="At the gate">
                <DrawerFields fields={[
                  ['Actual departure', stamp(detail.actualDepartureAt)], ['Actual return', stamp(detail.actualReturnAt)],
                  ['Late by', detail.lateReturnMinutes > 0 ? `${detail.lateReturnMinutes} min` : ''],
                ]} />
                {!detail.actualDepartureAt ? <p className="hs-muted">No movement recorded yet.</p> : null}
              </DrawerSection>
              <DrawerSection title="Guardian">
                <DrawerFields fields={[['Guardian', detail.guardianName], ['Phone', fmtPhone(detail.guardianPhone)], ['Emergency contact', detail.emergencyContact]]} />
                {!detail.guardianName && !detail.guardianPhone && !detail.emergencyContact ? <p className="hs-muted">No guardian details on this outpass.</p> : null}
              </DrawerSection>
            </DrawerBody>
            <DrawerFoot>
              {detail.approvedAt ? <Btn icon="qr" onClick={() => openPass(detail)}>Gate pass</Btn> : null}
              {detail.status === 'pending' ? <Btn kind="danger" onClick={() => ask(detail, 'reject')}>Reject</Btn> : null}
              {detail.awaitingParent ? <Btn kind="primary" icon="checkCircle" onClick={() => ask(detail, 'parent_approve')}>Record Parent Consent</Btn> : null}
              {detail.status === 'pending' && !detail.awaitingParent ? <Btn kind="primary" icon="checkCircle" onClick={() => ask(detail, 'approve')}>Approve</Btn> : null}
              {detail.status === 'approved' ? <Btn kind="primary" icon="logOut" onClick={() => openGate(detail.qrToken)}>Record departure</Btn> : null}
              {['active', 'overdue'].includes(detail.status) ? <Btn kind="primary" icon="logIn" onClick={() => openGate(detail.qrToken)}>Record return</Btn> : null}
            </DrawerFoot>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
