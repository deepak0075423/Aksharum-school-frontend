/**
 * Hostel → Visitors (Sep 2026 redesign, to the user's mockup).
 *
 * Four figures, a tab per stage, the filters and the visits table, from
 * GET /hostel/admin/board/visitors. A visit is registered against a resident,
 * approved (which mints its gate pass), checked in and checked out; the
 * standing authorized / restricted lists decide a registration before anyone
 * has to — an authorized visitor is approved on the spot, a restricted one is
 * refused.
 */
import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { PassQr, useNewFromLink } from '../shared';
import { PageHead, Glyph, words } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, LineTabs, Btn, Kebab, Popover, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, Avatar, Person, TwoLine, useListState, useBoardData, exportCsv, fmtDate, fmtTime, fmtPhone,
} from './hsList';
import { roomTight } from './hsPeople';
import { FormModal, FormSection, Grid, Fld, RadioCards, StudentPicker, InfoNote, ReviewList, ConfirmDialog } from './hsForm';
import PhoneInput from '../../../components/ui/PhoneInput';

const ID_TYPES = ['aadhaar', 'pan', 'driving_license', 'voter_id', 'passport', 'other'];
/** Who a visitor is to the resident, as the mockup tags it. The record keeps free text; these are the usual answers. */
const TYPES = ['Parent', 'Guardian', 'Relative', 'Friend', 'Official', 'Delivery', 'Contractor', 'Other'];
const TYPE_TONE = { parent: 'blue', guardian: 'violet', relative: 'orange', friend: 'teal', official: 'blue', delivery: 'violet', contractor: 'amber' };
const typeTone = (v) => {
  const s = String(v || '').toLowerCase();
  if (/father|mother|parent/.test(s)) return 'blue';
  if (/uncle|aunt|brother|sister|cousin|grand|sibling/.test(s)) return 'orange';
  return TYPE_TONE[s] || 'slate';
};
const VisitorType = ({ value }) => (value ? <Badge tone={typeTone(value)} size="lg">{words(value)}</Badge> : <span className="hs-muted">-</span>);

const STATUS = {
  pending: ['Pending', 'amber'], approved: ['Approved', 'green'], rejected: ['Rejected', 'red'], checked_in: ['Inside', 'green'],
  checked_out: ['Out', 'blue'], cancelled: ['Cancelled', 'slate'], blocked: ['Blocked', 'red'],
};
const StatusPill = ({ value }) => { const [text, tone] = STATUS[value] || [words(value), 'slate']; return <Badge tone={tone} pill>{text}</Badge>; };

const empty = {
  student: '', visitorName: '', mobile: '', relationship: '', purpose: '',
  idProofType: '', idProofNumber: '', visitorCount: 1, scheduledAt: '',
  isTemplate: false, listType: 'none',
};
const DONE = { approve: 'approved', reject: 'rejected', entry: 'checked in', exit: 'checked out', cancel: 'cancelled', block: 'blocked' };
const FILTERS = { hostel: '', type: '', status: '', from: '', to: '', listType: '' };
const stamp = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '');
const When = ({ at }) => (at ? <TwoLine top={fmtDate(at)} sub={fmtTime(at)} /> : <span className="hs-muted">-</span>);

export default function Visitors() {
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS });
  const TABS = ['inside', 'pending', 'approved', 'rejected', 'history', 'lists'];
  const tab = TABS.includes(state.tab) ? state.tab : 'all';
  const lists = tab === 'lists';
  const { data, loading, reload } = useBoardData((q) => api.getBoard('visitors', q), state);
  // The lists tab answers only its own rows — keep the visits' figures on screen.
  const [frame, setFrame] = useState(null);
  React.useEffect(() => { if (data?.tiles) setFrame({ tiles: data.tiles, tabs: data.tabs }); }, [data]);
  const { data: meta } = useFetch(api.getMeta, []);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [del, setDel] = useState(null);
  const [act, setAct] = useState(null);           // { row, action } — the steps that want a reason
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [more, setMore] = useState(false);
  const moreBtn = useRef(null);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const open = (asTemplate) => { setForm({ ...empty, isTemplate: asTemplate, listType: asTemplate ? 'authorized' : 'none' }); setModal(true); };
  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(true, () => open(false));

  const save = async () => {
    setSaving(true);
    try {
      await api.createVisitor({ ...form, visitorCount: Number(form.visitorCount) || 1 });
      toast.success(form.isTemplate ? 'Added to the list' : 'Visitor registered');
      setModal(false); reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const run = async (row, action, note = '') => {
    setBusy(true);
    try {
      await api.actOnVisitor(row._id, { action, remark: note });
      toast.success(`Visitor ${DONE[action] || action}`);
      setAct(null); setDetail(null); reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  /** Approving and the gate's two steps go straight through; a refusal asks why. */
  const step = (row, action) => (['reject', 'cancel', 'block'].includes(action) ? (setAct({ row, action }), setRemark('')) : run(row, action));

  const remove = async () => {
    try { await api.deleteVisitor(del._id); toast.success('Removed'); setDel(null); reload(); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const openPass = async (row) => {
    setPass({ ...row, loading: true });
    try { const r = await api.getVisitorPass(row._id); setPass({ ...row, ...(r.data ?? r) }); }
    catch (err) { toast.error(err.message); setPass(null); }
  };

  const steps = (r) => [
    r.status === 'pending' && { label: 'Approve', icon: 'checkCircle', onClick: () => step(r, 'approve') },
    r.status === 'pending' && { label: 'Reject', icon: 'closeCircle', danger: true, onClick: () => step(r, 'reject') },
    r.status === 'approved' && { label: 'Check in', icon: 'logIn', onClick: () => step(r, 'entry') },
    r.status === 'checked_in' && { label: 'Check out', icon: 'logOut', onClick: () => step(r, 'exit') },
    r.hasPass && { label: 'Show gate pass', icon: 'qr', onClick: () => openPass(r) },
    !['checked_out', 'cancelled', 'blocked', 'rejected'].includes(r.status) && '-',
    ['pending', 'approved'].includes(r.status) && { label: 'Cancel visit', icon: 'trash', danger: true, onClick: () => step(r, 'cancel') },
    !['checked_out', 'cancelled', 'blocked', 'rejected'].includes(r.status) && { label: 'Block this visitor', icon: 'lock', danger: true, hint: 'Adds them to the restricted list', onClick: () => step(r, 'block') },
  ];

  const t = frame?.tiles || {};
  const tabs = frame?.tabs || {};
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'visitor', label: 'Visitor', render: (r) => <Person name={r.visitorName} sub={fmtPhone(r.mobile)} strong={false} /> },
    { key: 'type', label: 'Visitor Type', render: (r) => <VisitorType value={r.relationship} /> },
    { key: 'student', label: 'Student Visiting', render: (r) => (r.studentName
      ? <TwoLine top={r.studentName} sub={[r.studentClass, r.studentRoll ? `Roll ${r.studentRoll}` : ''].filter(Boolean).join(' | ')} />
      : <span className="hs-muted">-</span>) },
    { key: 'room', label: 'Hostel / Room', render: (r) => (
      <TwoLine top={[r.hostelName, roomTight(r)].filter(Boolean).join(' - ') || '—'} sub={[r.buildingName, r.roomNumber].filter(Boolean).join(' • ')} />
    ) },
    { key: 'in', label: 'In Time', render: (r) => <When at={r.entryTime} />, nowrap: true },
    { key: 'out', label: 'Out Time', render: (r) => <When at={r.exitTime} />, nowrap: true },
    { key: 'purpose', label: 'Purpose', render: (r) => r.purpose || '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> },
    { key: 'pass', label: 'Gate Pass', render: (r) => (r.passNumber ? (
      <button type="button" className="hs-passlink" onClick={() => openPass(r)} title={r.hasPass ? 'Show the gate pass' : 'Gate pass record'}>
        <Glyph name="qr" size={17} /><span>#{r.passNumber}</span>
      </button>
    ) : <span className="hs-muted">-</span>), nowrap: true },
  ];
  const listColumns = [
    { key: 'visitor', label: 'Visitor', render: (r) => <Person name={r.visitorName} sub={fmtPhone(r.mobile)} strong={false} /> },
    { key: 'type', label: 'Visitor Type', render: (r) => <VisitorType value={r.relationship} /> },
    { key: 'student', label: 'For Student', render: (r) => <TwoLine top={r.studentName || '—'} sub={[r.studentClass, r.studentRoll ? `Roll ${r.studentRoll}` : ''].filter(Boolean).join(' | ')} /> },
    { key: 'room', label: 'Hostel / Room', render: (r) => [r.hostelName, roomTight(r)].filter(Boolean).join(' - ') || '—' },
    { key: 'list', label: 'List', render: (r) => <Badge tone={r.listType === 'restricted' ? 'red' : 'green'} pill>{r.listType === 'restricted' ? 'Restricted' : 'Authorized'}</Badge> },
    { key: 'added', label: 'Added On', render: (r) => fmtDate(r.createdAt) },
  ];

  const csv = (list) => exportCsv('hostel-visitors.csv', [
    { label: 'Pass', value: (r) => r.passNumber }, { label: 'Visitor', value: (r) => r.visitorName }, { label: 'Mobile', value: (r) => r.mobile },
    { label: 'Type', value: (r) => r.relationship }, { label: 'Student', value: (r) => r.studentName }, { label: 'Class', value: (r) => r.studentClass },
    { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room', value: (r) => r.roomNumber },
    { label: 'In', value: (r) => stamp(r.entryTime) }, { label: 'Out', value: (r) => stamp(r.exitTime) },
    { label: 'Purpose', value: (r) => r.purpose }, { label: 'Status', value: (r) => (STATUS[r.status] || [r.status])[0] },
  ], list);

  return (
    <div className="hs-page">
      <PageHead title="Visitor Management" subtitle="Register, track and manage hostel visitors with gate pass verification.">
        <Btn className="hs-btn--accent" icon="plus" onClick={() => open(true)}>List entry</Btn>
        <Btn kind="primary" icon="plus" onClick={() => open(false)}>Register Visitor</Btn>
      </PageHead>

      <Kpis cols={4} size="lg">
        <Kpi tone="indigo" icon="people" value={t.total ?? 0} label="Total Visitors" delta={t.delta} />
        <Kpi tone="green" icon="checkCircle" value={t.approved ?? 0} label="Approved" pct={t.approvedPct ?? 0} pctTone="green" bar barColor="#12b76a" />
        <Kpi tone="amber" icon="clockSolid" value={t.pending ?? 0} label="Pending" pct={t.pendingPct ?? 0} pctTone="amber" bar inline barColor="#f79009" />
        <Kpi tone="red" icon="xCircle" value={t.rejected ?? 0} label="Rejected" pct={t.rejectedPct ?? 0} pctTone="red" bar inline barColor="#f04438" />
      </Kpis>

      <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Visitors by stage"
        items={[
          { key: 'all', label: 'All Visitors', count: tabs.all ?? 0 },
          { key: 'inside', label: 'Inside Now', count: tabs.inside ?? 0 },
          { key: 'pending', label: 'Pending', count: tabs.pending ?? 0 },
          { key: 'approved', label: 'Approved', count: tabs.approved ?? 0 },
          { key: 'rejected', label: 'Rejected', count: tabs.rejected ?? 0, tone: 'bad' },
          { key: 'history', label: 'History' },
          { key: 'lists', label: 'Visitor Lists', count: tabs.lists ?? 0 },
        ]} />

      <FilterBar>
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={(meta?.hostels || []).map((h) => ({ value: h._id, label: h.name }))} grow={0} width="128px" />
        <FSelect value={state.type} onChange={(v) => set({ type: v })} all="All visitor types" options={TYPES.map((x) => ({ value: x, label: x }))} grow={0} width="158px" />
        {lists
          ? <FSelect value={state.listType} onChange={(v) => set({ listType: v })} all="Both lists" options={[{ value: 'authorized', label: 'Authorized' }, { value: 'restricted', label: 'Restricted' }]} grow={0} width="128px" />
          : <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={Object.entries(STATUS).map(([value, [label]]) => ({ value, label }))} grow={0} width="128px" />}
        <label className="hs-fdate hs-fdate--fixed"><input type="date" value={state.from} onChange={(e) => set({ from: e.target.value })} aria-label="From date" disabled={lists} /></label>
        <span className="hs-fdash" aria-hidden>–</span>
        <label className="hs-fdate hs-fdate--fixed"><input type="date" value={state.to} min={state.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label="To date" disabled={lists} /></label>
        <FSearch compact value={state.search} onChange={(v) => set({ search: v })} placeholder="Search visitor name, student name..." grow={1} width="262px" />
        <Btn ref={moreBtn} icon="filter" aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((o) => !o)}>Filter</Btn>
        <Popover anchor={moreBtn} open={more} onClose={() => setMore(false)} label="Quick filters">
          <div className="hs-menu2" role="menu">
            {[['inside', 'Inside the hostel now'], ['pending', 'Waiting for approval'], ['lists', 'Authorized & restricted lists']].map(([k, text]) => (
              <button key={k} type="button" role="menuitem" className={`hs-menu2__item${tab === k ? ' is-on' : ''}`} onClick={() => { set({ tab: k }); setMore(false); }}><span>{text}</span></button>
            ))}
          </div>
        </Popover>
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
      </FilterBar>

      <ListCard>
        <BulkBar count={selected.size} noun="visitor" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => csv(rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        {lists ? (
          <DataTable select={false} columns={listColumns} rows={rows} loading={loading} pad={7} headPad={11} dense
            actions={(r) => <Btn size="sm" kind="danger" icon="trash" onClick={() => setDel(r)}>Remove</Btn>}
            empty={(
              <EmptyRows icon="people" title="No list entries" action={<Btn kind="primary" icon="plus" onClick={() => open(true)}>List entry</Btn>}>
                An authorized visitor is approved the moment they are registered; a restricted one is refused.
              </EmptyRows>
            )} />
        ) : (
          <DataTable
            columns={columns} rows={rows} loading={loading} pad={6} headPad={11} dense
            selected={selected} onSelect={setSelected}
            actions={(r) => (
              <>
                {r.status === 'checked_in'
                  ? <Btn size="sm" kind="danger" icon="logOut" onClick={() => step(r, 'exit')} disabled={busy}>Check Out</Btn>
                  : <Btn size="sm" icon="eye" onClick={() => setDetail(r)}>View</Btn>}
                <Kebab label={`Actions for ${r.visitorName}`} items={[{ label: 'View details', icon: 'eye', onClick: () => setDetail(r) }, ...steps(r)]} />
              </>
            )}
            empty={(
              <EmptyRows icon="people" title={filtered || tab !== 'all' ? 'No visitor matches' : 'No visitors yet'}
                action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={() => open(false)}>Register Visitor</Btn>}>
                {filtered || tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Register a visitor against the resident they have come to see.'}
              </EmptyRows>
            )}
          />
        )}
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={lists ? 'list entries' : data?.total === 1 ? 'visitor' : 'visitors'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      {/* ── Register / list entry ─────────────────────────────────────────── */}
      <datalist id="hs-visitor-types">{TYPES.map((x) => <option key={x} value={x} />)}</datalist>
      <FormModal open={modal && !form.isTemplate} onClose={() => setModal(false)} busy={saving} onSubmit={save}
        icon="walker" title="Register Visitor" subtitle="Book a visit to a resident; the pass is issued when it is approved."
        submitLabel="Register Visitor" submitIcon="check"
        steps={[
          { key: 'who', title: 'Visitor Details', sub: 'Who is visiting', icon: 'user' },
          { key: 'visit', title: 'Visit Details', sub: 'Whom, why and when', icon: 'calendar' },
          { key: 'id', title: 'ID Proof', sub: 'Identity check at the gate', icon: 'idCard', optional: true },
          { key: 'review', title: 'Review', sub: 'Verify and register', icon: 'oCheckRound' },
        ]}>
        <FormSection step="who" icon="user" title="Visitor Details" sub="The person at the gate.">
          <Grid cols={2}>
            <Fld label="Visitor Name" required icon="user"><input value={form.visitorName} maxLength={80} placeholder="Full name" onChange={(e) => setF('visitorName', e.target.value)} /></Fld>
            <Fld label="Mobile" icon="phone"><PhoneInput value={form.mobile} placeholder="Enter mobile number" onChange={(e) => setF('mobile', e.target.value)} /></Fld>
            <Fld label="Relationship" icon="users" hint="Parent, Guardian, Relative, Delivery…"><input list="hs-visitor-types" value={form.relationship} maxLength={30} placeholder="e.g. Parent" onChange={(e) => setF('relationship', e.target.value)} /></Fld>
            <Fld label="Number of Visitors" icon="users"><input type="number" min="1" max="20" value={form.visitorCount} onChange={(e) => setF('visitorCount', e.target.value)} /></Fld>
          </Grid>
        </FormSection>
        <FormSection step="visit" icon="calendar" title="Visit Details" sub="The resident being visited, and when.">
          <Grid cols={2}>
            <Fld label="Student" required hint="Only current residents are listed">
              <StudentPicker value={form.student} onChange={(id) => setF('student', id)} params={{ allocated: 'true' }} />
            </Fld>
            <Fld label="Scheduled At" icon="clock" hint="Checked against visiting hours">
              <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setF('scheduledAt', e.target.value)} />
            </Fld>
          </Grid>
          <Fld label="Purpose" optional count={[form.purpose.length, 200]}>
            <textarea rows={2} maxLength={200} value={form.purpose} placeholder="e.g. Weekend visit, dropping off books" onChange={(e) => setF('purpose', e.target.value)} />
          </Fld>
        </FormSection>
        <FormSection step="id" icon="idCard" title="ID Proof" sub="Recorded at the gate (optional).">
          <Grid cols={2}>
            <Fld label="ID Type" icon="idCard">
              <select value={form.idProofType} onChange={(e) => setF('idProofType', e.target.value)}>
                <option value="">— none —</option>
                {ID_TYPES.map((x) => <option key={x} value={x}>{words(x)}</option>)}
              </select>
            </Fld>
            <Fld label="ID Number" icon="oHash"><input value={form.idProofNumber} maxLength={30} disabled={!form.idProofType} onChange={(e) => setF('idProofNumber', e.target.value)} /></Fld>
          </Grid>
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Verify the visit before it is registered.">
          <ReviewList groups={[
            { title: 'Visitor', step: 0, rows: [['Name', form.visitorName], ['Mobile', form.mobile], ['Relationship', form.relationship], ['Visitors', form.visitorCount]] },
            { title: 'Visit', step: 1, rows: [['When', form.scheduledAt ? form.scheduledAt.replace('T', ' ') : 'On arrival'], ['Purpose', form.purpose]] },
            { title: 'ID proof', step: 2, rows: [['ID', form.idProofType ? `${words(form.idProofType)} ${form.idProofNumber}` : 'None']] },
          ]} />
        </FormSection>
      </FormModal>

      <FormModal open={modal && form.isTemplate} onClose={() => setModal(false)} busy={saving} onSubmit={save} width={620}
        icon="listSolid" title="Add to Visitor List" subtitle="An authorized visitor is approved automatically; a restricted one is refused at registration."
        submitLabel="Add to List" submitIcon="check">
        <FormSection>
          <RadioCards value={form.listType} onChange={(v) => setF('listType', v)} label="List"
            options={[['authorized', 'Authorized', 'Approved automatically'], ['restricted', 'Restricted', 'Refused at registration']]} />
          <Grid cols={2}>
            <Fld label="Student" required><StudentPicker value={form.student} onChange={(id) => setF('student', id)} params={{ allocated: 'true' }} /></Fld>
            <Fld label="Visitor Name" required icon="user"><input value={form.visitorName} maxLength={80} onChange={(e) => setF('visitorName', e.target.value)} /></Fld>
            <Fld label="Relationship" icon="users"><input list="hs-visitor-types" value={form.relationship} maxLength={30} placeholder="Parent, Guardian…" onChange={(e) => setF('relationship', e.target.value)} /></Fld>
            <Fld label="Mobile" icon="phone"><PhoneInput value={form.mobile} onChange={(e) => setF('mobile', e.target.value)} /></Fld>
          </Grid>
        </FormSection>
      </FormModal>

      {/* ── A refusal asks why ────────────────────────────────────────────── */}
      <FormModal open={!!act} onClose={() => setAct(null)} busy={busy} onSubmit={() => run(act.row, act.action, remark)}
        icon={act?.action === 'block' ? 'shield' : 'closeCircle'} iconTone="red"
        title={act ? `${act.action === 'block' ? 'Block' : act.action === 'reject' ? 'Reject' : 'Cancel'} Visit` : ''}
        subtitle={act ? `${act.row.visitorName}${act.row.studentName ? ` — visiting ${act.row.studentName}` : ''}` : ''}
        submitLabel={act ? words(act.action) : 'Confirm'} tone="danger">
        {act ? (
          <FormSection>
            {act.action === 'block' ? <InfoNote tone="amber">Blocking also puts {act.row.visitorName} on {act.row.studentName || 'the student'}&rsquo;s restricted list — later registrations are refused.</InfoNote> : null}
            <Fld label="Reason" required count={[remark.length, 300]}>
              <textarea rows={3} maxLength={300} value={remark} onChange={(e) => setRemark(e.target.value)} />
            </Fld>
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── The pass ──────────────────────────────────────────────────────── */}
      <FormModal open={!!pass} onClose={() => setPass(null)} width={460} icon="qr" title="Gate Pass"
        subtitle={pass ? `#${pass.passNumber || ''} · ${pass.visitorName}${pass.studentName ? ` — visiting ${pass.studentName}` : ''}` : ''}
        cancelLabel="Close" hideSubmit={!pass?.qrImage} submitLabel="Download PNG" submitIcon="download"
        onSubmit={() => { const x = document.createElement('a'); x.href = pass.qrImage; x.download = `${pass.passNumber || 'gate-pass'}.png`; x.click(); }}>
        {pass ? (
          <FormSection>
            {pass.loading ? <p className="hs-muted">Loading the pass…</p> : pass.qrImage ? (
              <div className="hsf-center"><PassQr image={pass.qrImage} caption={pass.scheduledAt ? `Expected ${stamp(pass.scheduledAt)}` : ''} /></div>
            ) : (
              <div className="hs-result">
                <h4>{pass.status === 'pending' ? 'No pass yet' : 'This pass is closed'}</h4>
                <p>In: {stamp(pass.entryTime) || 'not recorded'}</p>
                <p>Out: {stamp(pass.exitTime) || 'not recorded'}</p>
                <p>{pass.status === 'pending' ? 'A pass is issued when the visit is approved.' : 'A pass stops working once the visitor checks out, or the visit is cancelled.'}</p>
              </div>
            )}
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── Detail ────────────────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Visitor details">
        {detail ? (
          <>
            <DrawerHead
              mark={<Avatar name={detail.visitorName} size={52} />}
              name={detail.visitorName} sub={[detail.passNumber ? `#${detail.passNumber}` : '', fmtPhone(detail.mobile)].filter(Boolean).join(' · ')}
              tags={<><StatusPill value={detail.status} /><VisitorType value={detail.relationship} /></>}
              onClose={() => setDetail(null)}
            />
            <DrawerBody>
              <DrawerSection title="Visit">
                <DrawerFields fields={[
                  ['Purpose', detail.purpose], ['Visitors', detail.visitorCount],
                  ['Scheduled', stamp(detail.scheduledAt)], ['Checked in', stamp(detail.entryTime)], ['Checked out', stamp(detail.exitTime)],
                  ['ID proof', detail.idProofType ? `${words(detail.idProofType)} · ${detail.idProofNumber || '—'}` : ''],
                  ['Approved by', detail.approvedByName], ['Rejection reason', detail.rejectionReason], ['Remarks', detail.remarks],
                  ['Registered on', stamp(detail.createdAt)],
                ]} />
              </DrawerSection>
              <DrawerSection title="Visiting">
                <DrawerFields fields={[
                  ['Student', detail.studentName], ['Class', detail.studentClass], ['Roll', detail.studentRoll],
                  ['Hostel', detail.hostelName], ['Room', [detail.buildingName, detail.roomNumber].filter(Boolean).join(' • ')],
                ]} />
              </DrawerSection>
            </DrawerBody>
            <DrawerFoot>
              {detail.passNumber ? <Btn icon="qr" onClick={() => openPass(detail)}>Gate pass</Btn> : null}
              {detail.status === 'pending' ? <Btn kind="danger" onClick={() => step(detail, 'reject')}>Reject</Btn> : null}
              {detail.status === 'pending' ? <Btn kind="primary" icon="checkCircle" disabled={busy} onClick={() => step(detail, 'approve')}>Approve</Btn> : null}
              {detail.status === 'approved' ? <Btn kind="primary" icon="logIn" disabled={busy} onClick={() => step(detail, 'entry')}>Check in</Btn> : null}
              {detail.status === 'checked_in' ? <Btn kind="primary" icon="logOut" disabled={busy} onClick={() => step(detail, 'exit')}>Check out</Btn> : null}
            </DrawerFoot>
          </>
        ) : null}
      </Drawer>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title="Remove List Entry" confirmLabel="Remove" icon="trash" message={`Remove ${del?.visitorName} from the ${del?.listType} list?`} />
    </div>
  );
}
