/**
 * Hostel → Security & Student Movement (Sep 2026 redesign, to the user's mockup).
 *
 * The five figures are the residents as they stand right now; the table is the
 * gate log, each line under the state that movement put its student in — and
 * "Overdue" for as long as the pass they left on is still not closed.
 * GET /hostel/admin/board/movements answers both.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields } from '../../../components/ui/Drawer';
import { PageHead, Mark, words, count } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, LineTabs, Btn, Kebab, Popover, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, Avatar, Person, TwoLine, useListState, useBoardData, exportCsv, fmtDate, fmtTime,
} from './hsList';
import { roomShort } from './hsPeople';
import { FormModal, FormSection, Grid, Fld, RadioCards, StudentPicker, InfoNote } from './hsForm';
import { GateModal } from './hsGate';

const TYPES = ['gate', 'outpass', 'leave', 'visitor', 'vehicle', 'medical', 'other'];
const STATE = { inside: ['Inside', 'green'], out: ['Out', 'blue'], overdue: ['Overdue', 'red'], on_leave: ['On Leave', 'amber'] };
const StatePill = ({ value }) => { const [text, tone] = STATE[value] || [words(value), 'slate']; return <Badge tone={tone} pill>{text}</Badge>; };
/** Entry, Exit, or — for a departure on leave — Leave, as the mockup tags a movement. */
const MoveTag = ({ r }) => {
  if (r.direction === 'in') return <Badge tone="green" icon="arrowUp" size="lg">Entry</Badge>;
  if (r.movementType === 'leave') return <Badge tone="amber" glyph="beach" size="lg">Leave</Badge>;
  return <Badge tone="red" icon="arrowDown" size="lg">Exit</Badge>;
};
const reference = (r) => (r.outpassNumber ? `Outpass #${r.outpassNumber}` : r.leaveNumber ? `Leave #${r.leaveNumber}` : r.movementType === 'visitor' ? 'Visitor' : '-');
const stamp = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '');
const FILTERS = { hostel: '', building: '', room: '', movementType: '', status: '', from: '', to: '', late: '' };
const blank = { student: '', direction: 'out', movementType: 'gate', gate: 'Main Gate', remarks: '' };

export default function Movement() {
  const nav = useNavigate();
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS });
  const tab = ['inside', 'outside', 'leave', 'outpass', 'overdue'].includes(state.tab) ? state.tab : 'all';
  const { data, loading, reload } = useBoardData((q) => api.getBoard('movements', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const buildings = (meta?.buildings || []).filter((b) => !state.hostel || String(b.hostel) === state.hostel);
  const roomOptions = (meta?.rooms || []).filter((r) => (state.building ? String(r.building) === state.building : !state.hostel || String(r.hostel) === state.hostel));

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [gate, setGate] = useState(false);
  const [live, setLive] = useState(false);
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [more, setMore] = useState(false);
  const moreBtn = useRef(null);

  const open = () => { setForm(blank); setModal(true); };
  const save = async () => {
    setSaving(true);
    try {
      await api.recordMovement(form);
      toast.success('Movement recorded');
      setModal(false); reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const t = data?.tiles || {};
  const tabs = data?.tabs || {};
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'student', label: 'Student', render: (r) => (
      <Person name={r.studentName || r.personName || '—'} src={r.studentPhoto} strong={false}
        sub={r.studentName ? (r.studentRoll ? `Roll ${r.studentRoll}` : r.studentAdmissionNo) : 'Visitor'} />
    ) },
    { key: 'class', label: 'Class', render: (r) => r.studentClass || '—', nowrap: true },
    { key: 'room', label: 'Hostel / Room', render: (r) => (r.roomNumber ? roomShort(r, { bed: false }) : (r.hostelName || '—')), nowrap: true },
    { key: 'type', label: 'Movement Type', render: (r) => <MoveTag r={r} /> },
    { key: 'gate', label: 'Gate', render: (r) => r.gate || '-' },
    { key: 'at', label: 'Time', render: (r) => <TwoLine top={fmtDate(r.at)} sub={fmtTime(r.at)} />, nowrap: true },
    { key: 'status', label: 'Status', render: (r) => (
      <span className="hs-stack"><StatePill value={r.state} />{r.isLate ? <small className="is-bad">{r.lateMinutes ? `${r.lateMinutes} min late` : 'after curfew'}</small> : null}</span>
    ) },
    { key: 'ref', label: 'Reference', render: (r) => reference(r) },
  ];

  const csv = (list) => exportCsv('hostel-movements.csv', [
    { label: 'Time', value: (r) => stamp(r.at) }, { label: 'Student', value: (r) => r.studentName || r.personName },
    { label: 'Roll', value: (r) => r.studentRoll }, { label: 'Class', value: (r) => r.studentClass },
    { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room', value: (r) => r.roomNumber },
    { label: 'Direction', value: (r) => (r.direction === 'in' ? 'Entry' : 'Exit') }, { label: 'Type', value: (r) => words(r.movementType) },
    { label: 'Gate', value: (r) => r.gate }, { label: 'Status', value: (r) => (STATE[r.state] || [r.state])[0] },
    { label: 'Reference', value: (r) => (reference(r) === '-' ? '' : reference(r)) }, { label: 'Late (min)', value: (r) => r.lateMinutes || '' },
    { label: 'Recorded by', value: (r) => r.recordedByName }, { label: 'Remarks', value: (r) => r.remarks },
  ], list);

  return (
    <div className="hs-page">
      <PageHead title="Security & Student Movement" subtitle="Track gate entries and exits, live presence, outpasses and overdue returns.">
        <Btn className="hs-btn--accent" icon="monitor" onClick={() => setLive(true)}>Live Monitor</Btn>
        <Btn className="hs-btn--accent" icon="qr" onClick={() => setGate(true)}>Gate Pass</Btn>
        <Btn kind="primary" icon="plus" onClick={open}>Record Movement</Btn>
      </PageHead>

      <Kpis cols={5} size="sm" tonePct>
        <Kpi tone="green" icon="gateIn" value={t.inside ?? 0} label="Inside Hostel" pct={t.insidePct ?? 0} pctTone="green" bar inline barColor="#12b76a" />
        <Kpi tone="blue" icon="walk" value={t.outside ?? 0} label="Currently Out" pct={t.outsidePct ?? 0} pctTone="blue" bar inline barColor="#2b7bf5" />
        <Kpi tone="amber" icon="beach" value={t.onLeave ?? 0} label="On Leave" pct={t.onLeavePct ?? 0} pctTone="amber" bar inline barColor="#f79009" />
        <Kpi tone="violet" icon="ticket" value={t.activeOutpasses ?? 0} label="Active Outpasses" pct={t.activeOutpassesPct ?? 0} pctTone="violet" bar inline barColor="#4f46e5" />
        <Kpi tone="red" icon="alarm" value={t.overdue ?? 0} label="Overdue Returns" pct={t.overduePct ?? 0} pctTone="red" bar inline barColor="#f04438" />
      </Kpis>

      <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Movements by state"
        items={[
          { key: 'all', label: 'All Movements', count: tabs.all ?? 0 },
          { key: 'inside', label: 'Inside', count: tabs.inside ?? 0 },
          { key: 'outside', label: 'Outside', count: tabs.outside ?? 0 },
          { key: 'leave', label: 'On Leave', count: tabs.leave ?? 0 },
          { key: 'outpass', label: 'Outpass', count: tabs.outpass ?? 0 },
          { key: 'overdue', label: 'Overdue', count: tabs.overdue ?? 0, tone: 'bad' },
        ]} />

      <FilterBar below={(
        <>
          <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search student name, roll no., gate pass no...." grow={0} width="370px" />
          <span className="hs-filters__end">
            <Btn ref={moreBtn} icon="filter" aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((o) => !o)}>Filter{state.late ? ' · 1' : ''}</Btn>
            <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
          </span>
          <Popover anchor={moreBtn} open={more} onClose={() => setMore(false)} label="More filters">
            <div className="hs-menu2" role="menu">
              <button type="button" role="menuitemcheckbox" aria-checked={!!state.late} className={`hs-menu2__item${state.late ? ' is-on' : ''}`}
                onClick={() => { set({ late: state.late ? '' : '1' }); setMore(false); }}><span>Late or after-curfew only</span></button>
            </div>
          </Popover>
        </>
      )}>
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v, building: '', room: '' })} all="All hostels" options={(meta?.hostels || []).map((h) => ({ value: h._id, label: h.name }))} width="130px" />
        <FSelect value={state.building} onChange={(v) => set({ building: v, room: '' })} all="All buildings" options={buildings.map((b) => ({ value: b._id, label: b.name }))} width="130px" />
        <FSelect value={state.room} onChange={(v) => set({ room: v })} all="All rooms" options={roomOptions.map((r) => ({ value: r._id, label: r.roomNumber }))} width="130px" />
        <FSelect value={state.movementType} onChange={(v) => set({ movementType: v })} all="All movement types" options={TYPES.map((x) => ({ value: x, label: words(x) }))} width="170px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={Object.entries(STATE).map(([value, [label]]) => ({ value, label }))} width="150px" />
        <label className="hs-fdate"><input type="date" value={state.from} onChange={(e) => set({ from: e.target.value })} aria-label="From date" /></label>
        <span className="hs-fdash" aria-hidden>→</span>
        <label className="hs-fdate"><input type="date" value={state.to} min={state.from || undefined} onChange={(e) => set({ to: e.target.value })} aria-label="To date" /></label>
      </FilterBar>

      <ListCard>
        <BulkBar count={selected.size} noun="movement" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => csv(rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={5} headPad={11} dense
          selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" icon="eye" onClick={() => setDetail(r)}>View</Btn>
              <Kebab label={`Actions for ${r.studentName || r.personName}`} items={[
                r.outpassNumber && { label: 'Open the outpass', icon: 'arrowRight', onClick: () => nav(`/admin/hostel/outpass?search=${encodeURIComponent(r.outpassNumber)}`) },
                r.leaveNumber && { label: 'Open the leave', icon: 'arrowRight', onClick: () => nav(`/admin/hostel/leave?search=${encodeURIComponent(r.leaveNumber)}`) },
                r.studentName && { label: 'This student’s movements', icon: 'history', onClick: () => set({ search: r.studentName, tab: 'all' }) },
              ]} />
            </>
          )}
          empty={(
            <EmptyRows icon="gateIn" title={filtered || tab !== 'all' ? 'No movement matches' : 'No movements recorded'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={open}>Record Movement</Btn>}>
              {filtered || tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Every exit and entry at the gate is logged here.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'movement' : 'movements'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      {/* ── Record a movement by hand ─────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save} width={600}
        icon="gateIn" title="Record Gate Movement" subtitle="A resident passing the gate without a pass — the register keeps every crossing."
        submitLabel="Record Movement" submitIcon="check">
        <FormSection>
          <Fld label="Student" required hint="Only current residents are listed">
            <StudentPicker value={form.student} onChange={(id) => setForm((f) => ({ ...f, student: id }))} params={{ allocated: 'true' }} />
          </Fld>
          <RadioCards label="Direction" required value={form.direction} onChange={(v) => setForm((f) => ({ ...f, direction: v }))}
            options={[['out', 'Going out'], ['in', 'Coming in']]} />
          <Grid cols={2}>
            <Fld label="Type" icon="oTag">
              <select value={form.movementType} onChange={(e) => setForm((f) => ({ ...f, movementType: e.target.value }))}>
                {['gate', 'medical', 'other'].map((x) => <option key={x} value={x}>{words(x)}</option>)}
              </select>
            </Fld>
            <Fld label="Gate" icon="gateIn"><input data-text="title" value={form.gate} maxLength={40} placeholder="Main Gate" onChange={(e) => setForm((f) => ({ ...f, gate: e.target.value }))} /></Fld>
          </Grid>
          <Fld label="Remarks" optional icon="fileDoc"><input value={form.remarks} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} /></Fld>
          <InfoNote>A movement after curfew is flagged automatically and the warden is alerted.</InfoNote>
        </FormSection>
      </FormModal>

      <GateModal open={gate} onClose={() => setGate(false)} onDone={reload} />
      <LiveMonitor open={live} onClose={() => setLive(false)} />

      {/* ── Detail ────────────────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Movement details">
        {detail ? (
          <>
            <DrawerHead
              mark={<Avatar name={detail.studentName || detail.personName} src={detail.studentPhoto} size={52} />}
              name={detail.studentName || detail.personName || 'Movement'}
              sub={detail.studentName ? [detail.studentClass, detail.studentRoll ? `Roll ${detail.studentRoll}` : ''].filter(Boolean).join(' · ') : 'Visitor'}
              tags={<><StatePill value={detail.state} /><MoveTag r={detail} /></>}
              onClose={() => setDetail(null)}
            />
            <DrawerBody>
              <DrawerSection title="Movement">
                <DrawerFields fields={[
                  ['When', stamp(detail.at)], ['Direction', detail.direction === 'in' ? 'Coming in' : 'Going out'],
                  ['Type', words(detail.movementType)], ['Gate', detail.gate], ['Vehicle', detail.vehicleNumber],
                  ['Reference', reference(detail) === '-' ? '' : reference(detail)],
                  ['Late', detail.isLate ? (detail.lateMinutes ? `${detail.lateMinutes} min` : 'After curfew') : ''],
                  ['Remarks', detail.remarks], ['Recorded by', detail.recordedByName],
                ]} />
              </DrawerSection>
              {detail.studentName ? (
                <DrawerSection title="Resident">
                  <DrawerFields fields={[['Hostel', detail.hostelName], ['Room / bed', detail.roomNumber ? roomShort(detail) : ''], ['Admission no.', detail.studentAdmissionNo]]} />
                </DrawerSection>
              ) : null}
            </DrawerBody>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}

/* ── Live Monitor ────────────────────────────────────────────────────────── */

/** Who is where, now: refreshed every 20 seconds for as long as it is open. */
function LiveMonitor({ open, onClose }) {
  const [live, setLive] = useState(null);
  const [at, setAt] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const load = () => api.getLiveMovement()
      .then((r) => { if (alive) { setLive(r.data ?? r); setAt(new Date()); } })
      .catch((err) => alive && toast.error(err.message));
    load();
    const timer = setInterval(load, 20000);
    return () => { alive = false; clearInterval(timer); };
  }, [open]);

  const who = (o) => <Person name={o.student?.name || o.personName || '—'} src={o.student?.profileImage} size={32} strong={false} sub={o.outpassNumber || words(o.movementType)} />;

  return (
    <Drawer open={open} onClose={onClose} label="Live monitor">
      <DrawerHead mark={<Mark name="monitor" tone="indigo" size={52} glyph={26} />} name="Live Monitor"
        sub={at ? `Updated ${fmtTime(at)} · refreshes every 20 seconds` : 'Loading…'} onClose={onClose} />
      <DrawerBody>
        <div className="hs-dstats">
          {[['Inside', live?.inside], ['Out', live?.outside], ['On leave', live?.onLeave]].map(([l, v]) => <div key={l}><strong>{count(v ?? 0)}</strong><span>{l}</span></div>)}
        </div>
        <DrawerSection title={`Overdue returns (${live?.overdue?.length || 0})`}>
          {live?.overdue?.length ? (
            <ul className="hs-livelist">{live.overdue.map((o) => (
              <li key={o._id}>{who(o)}<Badge tone="red">due {stamp(o.expectedReturnAt)}</Badge></li>
            ))}</ul>
          ) : <p className="hs-muted">Nobody is late back.</p>}
        </DrawerSection>
        <DrawerSection title={`Out on a pass (${live?.activeOutpasses?.length || 0})`}>
          {live?.activeOutpasses?.length ? (
            <ul className="hs-livelist">{live.activeOutpasses.map((o) => (
              <li key={o._id}>{who(o)}<span className="hs-muted">back by {o.expectedReturnAt ? fmtTime(o.expectedReturnAt) : '—'}</span></li>
            ))}</ul>
          ) : <p className="hs-muted">Nobody is out on a pass.</p>}
        </DrawerSection>
        <DrawerSection title="Latest at the gate">
          {live?.recent?.length ? (
            <ul className="hs-livelist">{live.recent.slice(0, 12).map((m) => (
              <li key={m._id}>{who(m)}<span className="hs-livelist__end"><Badge tone={m.direction === 'in' ? 'green' : 'red'} icon={m.direction === 'in' ? 'arrowUp' : 'arrowDown'}>{m.direction === 'in' ? 'Entry' : 'Exit'}</Badge><small>{fmtTime(m.at)}</small></span></li>
            ))}</ul>
          ) : <p className="hs-muted">Nothing recorded yet.</p>}
        </DrawerSection>
      </DrawerBody>
    </Drawer>
  );
}
