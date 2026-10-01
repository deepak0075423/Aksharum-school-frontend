/**
 * Hostel → Assets (Sep 2026 redesign, to the user's mockup).
 *
 * Five figures, a tab per state, the filters and the assets table, from
 * GET /hostel/admin/board/assets. An asset is listed under ONE state —
 * allocated (in a room or out with a student), unassigned, under maintenance,
 * damaged or retired — so the tabs add up to the total.
 *
 * Expensive tracked items stay in the Inventory module: an asset linked to one
 * records where it sits and who holds it here, and its Inventory status follows.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { PassQr, useNewFromLink } from '../shared';
import { PageHead, Mark, words } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, LineTabs, Btn, Kebab, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, TwoLine, useListState, useBoardData, exportCsv, fmtDate, rupees,
} from './hsList';
import { FormModal, FormSection, Grid, Fld, StudentPicker, InfoNote, ReviewList } from './hsForm';
import { MoreFilters } from './hsTags';

/** A category, the group the mockup tags it under, and its drawing. */
const CATEGORY = {
  bed: ['Furniture', 'bedSolid', 'violet'], mattress: ['Furniture', 'bedSolid', 'blue'], table: ['Furniture', 'chair', 'amber'],
  chair: ['Furniture', 'chair', 'orange'], cupboard: ['Furniture', 'boxSolid', 'amber'], fan: ['Electrical', 'bolt', 'slate'],
  ac: ['Electrical', 'bolt', 'sky'], electronics: ['Electrical', 'bolt', 'indigo'], fire_safety: ['Safety', 'alertTri', 'red'],
  kitchen: ['Appliance', 'cloche', 'green'], other: ['Other', 'cube', 'slate'],
};
const GROUP_TONE = { Furniture: 'violet', Electrical: 'red', Safety: 'lavender', Appliance: 'green', Other: 'slate' };
const catOf = (c) => CATEGORY[c] || CATEGORY.other;
const Category = ({ value }) => { const [group] = catOf(value); return <Badge tone={GROUP_TONE[group]} size="lg" title={words(value)}>{group}</Badge>; };
const CONDITIONS = ['new', 'good', 'fair', 'damaged', 'scrapped'];
const CONDITION_TONE = { new: 'green', good: 'green', fair: 'amber', damaged: 'red', scrapped: 'slate' };
const Condition = ({ value }) => <Badge tone={CONDITION_TONE[value] || 'slate'} size="lg">{words(value)}</Badge>;
const STATE = {
  allocated: ['Allocated', 'blue'], unassigned: ['Unassigned', 'slate'], maintenance: ['Under Maintenance', 'amber'],
  damaged: ['Damaged', 'red'], retired: ['Retired', 'slate'],
};
const StateTag = ({ r }) => {
  const [text, tone] = r.state === 'retired' ? [words(r.status), 'slate'] : (STATE[r.state] || [words(r.state), 'slate']);
  return <Badge tone={tone} size="lg">{text}</Badge>;
};
const empty = { hostel: '', room: '', name: '', assetCode: '', category: 'other', quantity: 1, condition: 'good', inventoryAsset: '', remarks: '' };
const FILTERS = { hostel: '', room: '', category: '', condition: '', status: '', linked: '', code: '' };
const ACT = {
  issue: 'Issue to a student', return: 'Take back', transfer: 'Move to another room', repair: 'Send for repair',
  restore: 'Back in service', damage: 'Report damage', replace: 'Replace', dispose: 'Dispose of',
};
/** Each step's icon and tone. */
const ACT_LOOK = {
  issue: ['userPlus', 'indigo'], return: ['undo', 'blue'], transfer: ['swap', 'violet'], repair: ['oWrench', 'amber'],
  restore: ['checkCircle', 'green'], damage: ['alertTri', 'red'], replace: ['refresh', 'red'], dispose: ['trash', 'red'],
};
const DONE = { issue: 'issued', return: 'returned', transfer: 'moved', repair: 'sent for repair', restore: 'back in service', damage: 'marked damaged', replace: 'replaced', dispose: 'disposed of' };
const roomLabel = (r) => (r.roomNumber ? `${r.buildingCode ? `${r.buildingCode}-` : ''}${String(r.roomNumber).replace(/^room\s*/i, 'R')}` : '');
const retired = (r) => ['replaced', 'disposed'].includes(r.status);

/** Who has it: a student, a room and how many live there, or nobody. */
const Holder = ({ r }) => {
  if (r.issuedToName) return <TwoLine top={r.issuedToName} sub={r.issuedAt ? `Issued ${fmtDate(r.issuedAt)}` : 'Issued'} />;
  if (r.roomNumber && r.state === 'allocated') return <TwoLine top={`Room ${roomLabel(r)}`} sub={`${r.roomStudents || 0} student${r.roomStudents === 1 ? '' : 's'}`} />;
  return <span className="hs-muted">—</span>;
};

export default function Assets() {
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS });
  const tab = ['allocated', 'unassigned', 'maintenance', 'damaged', 'retired'].includes(state.tab) ? state.tab : 'all';
  const { data, loading, reload } = useBoardData((q) => api.getBoard('assets', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const allRooms = meta?.rooms || [];

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [act, setAct] = useState(null);
  const [actForm, setActForm] = useState({ student: '', room: '', note: '', damageCharge: '', condition: 'good' });
  const [busy, setBusy] = useState(false);
  const [invAssets, setInvAssets] = useState([]);
  const [detail, setDetail] = useState(null);
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const formRooms = allRooms.filter((r) => !form.hostel || String(r.hostel) === form.hostel);
  const filterRooms = allRooms.filter((r) => !state.hostel || String(r.hostel) === state.hostel);
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'hostel' ? { room: '' } : {}) }));

  const open = async (row) => {
    if (row) {
      setEditId(row._id);
      setForm({ ...empty, hostel: row.hostelId || '', room: row.roomId || '', name: row.name, assetCode: row.assetCode || '',
        category: row.category, quantity: row.quantity || 1, condition: row.condition, remarks: row.remarks || '' });
    } else { setEditId(null); setForm({ ...empty, hostel: state.hostel || hostels[0]?._id || '' }); }
    setModal(true);
    if (!row) { try { const r = await api.getInventoryAssets(); setInvAssets(r.data ?? r); } catch { setInvAssets([]); } }
  };
  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(!!meta, () => open());

  const save = async () => {
    setSaving(true);
    try {
      const p = { ...form, room: form.room || null, inventoryAsset: form.inventoryAsset || null, quantity: Number(form.quantity) || 1 };
      if (editId) { delete p.inventoryAsset; await api.updateAsset(editId, p); } else await api.createAsset(p);
      toast.success(editId ? 'Asset updated' : 'Asset added'); setModal(false); setDetail(null); reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const ask = (row, action) => { setAct({ row, action }); setActForm({ student: '', room: '', note: '', damageCharge: '', condition: row.condition === 'damaged' ? 'good' : (row.condition || 'good') }); };
  const submitAct = async () => {
    setBusy(true);
    try {
      const r = await api.actOnAsset(act.row._id, {
        action: act.action,
        student: actForm.student || null, room: actForm.room || null, note: actForm.note,
        damageCharge: actForm.damageCharge === '' ? null : Number(actForm.damageCharge),
        condition: actForm.condition || null,
      });
      const d = r.data ?? r;
      toast.success(`Asset ${DONE[act.action] || 'updated'}`);
      if (d.fine) toast(`A damage charge of ${rupees(d.fine.netAmount)} was billed`, { icon: '💳', duration: 6000 });
      setAct(null); setDetail(null); reload();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  /** What may be done with an asset from where it stands. */
  const steps = (r) => (retired(r) ? [] : [
    !['issued'].includes(r.status) && !['maintenance', 'damaged'].includes(r.state) && { label: ACT.issue, icon: 'userPlus', onClick: () => ask(r, 'issue') },
    r.status === 'issued' && { label: ACT.return, icon: 'logIn', onClick: () => ask(r, 'return') },
    { label: ACT.transfer, icon: 'repeat', onClick: () => ask(r, 'transfer') },
    !['under_repair'].includes(r.status) && { label: ACT.repair, icon: 'wrench', onClick: () => ask(r, 'repair') },
    ['under_repair', 'damaged'].includes(r.status) && { label: ACT.restore, icon: 'checkCircle', onClick: () => ask(r, 'restore') },
    r.status !== 'damaged' && { label: ACT.damage, icon: 'alert', onClick: () => ask(r, 'damage') },
    '-',
    { label: ACT.replace, icon: 'refresh', danger: true, onClick: () => ask(r, 'replace') },
    { label: ACT.dispose, icon: 'trash', danger: true, onClick: () => ask(r, 'dispose') },
  ]);

  const t = data?.tiles || {};
  const tabs = data?.tabs || {};
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'asset', label: 'Asset Details', render: (r) => {
      const [, glyph, tone] = catOf(r.category);
      return (
        <span className="hs-person">
          <Mark name={glyph} tone={tone} size={38} glyph={20} />
          <span className="hs-two hs-two--three">
            <span className="hs-two__top">{r.name}{r.quantity > 1 ? ` × ${r.quantity}` : ''}</span>
            <span className="hs-two__sub">{r.assetCode || 'No code'}{r.linked ? ' · Inventory' : ''}</span>
            {r.remarks ? <span className="hs-two__sub">{r.remarks}</span> : null}
          </span>
        </span>
      );
    } },
    { key: 'cat', label: 'Category', render: (r) => <Category value={r.category} /> },
    { key: 'where', label: 'Hostel / Room', render: (r) => <TwoLine top={r.hostelName || '—'} sub={roomLabel(r) || 'Common area'} /> },
    { key: 'cond', label: 'Condition', render: (r) => <Condition value={r.condition} /> },
    { key: 'status', label: 'Status', render: (r) => <StateTag r={r} /> },
    { key: 'to', label: 'Assigned To', render: (r) => <Holder r={r} /> },
    { key: 'last', label: 'Last Maintenance', render: (r) => (r.lastMaintenanceAt
      ? <TwoLine top={fmtDate(r.lastMaintenanceAt)} sub={r.lastMaintenanceStatus && r.lastMaintenanceStatus !== 'completed' ? `${r.lastMaintenanceNote} · ${words(r.lastMaintenanceStatus)}` : r.lastMaintenanceNote} />
      : <span className="hs-muted">—</span>) },
  ];

  const csv = (list) => exportCsv('hostel-assets.csv', [
    { label: 'Asset', value: (r) => r.name }, { label: 'Code', value: (r) => r.assetCode }, { label: 'Category', value: (r) => words(r.category) },
    { label: 'Quantity', value: (r) => r.quantity }, { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room', value: (r) => r.roomNumber },
    { label: 'Condition', value: (r) => words(r.condition) }, { label: 'Status', value: (r) => (STATE[r.state] || [r.state])[0] },
    { label: 'Issued to', value: (r) => r.issuedToName }, { label: 'Last maintenance', value: (r) => (r.lastMaintenanceAt ? fmtDate(r.lastMaintenanceAt) : '') },
    { label: 'In Inventory', value: (r) => (r.linked ? 'Yes' : 'No') }, { label: 'Remarks', value: (r) => r.remarks },
  ], list);
  const exportAll = async () => {
    try { const res = await api.getBoard('assets', { ...state, page: 1, limit: 5000 }); csv((res.data ?? res).rows || []); }
    catch (err) { toast.error(err.message); }
  };

  return (
    <div className="hs-page">
      <PageHead title="Hostel Inventory & Assets" subtitle="Track and manage hostel assets with room-wise allocation, condition and maintenance history.">
        <Btn className="hs-btn--accent" icon="download" onClick={exportAll}>Export</Btn>
        <Btn className="hs-btn--accent" icon="qr" onClick={() => setScan({ code: '' })}>Scan QR</Btn>
        <Btn kind="primary" icon="plus" onClick={() => open()}>Add Asset</Btn>
      </PageHead>

      <Kpis cols={5} size="lg">
        <Kpi tone="indigo" icon="cube" value={t.total ?? 0} label="Total Assets"
          delta={t.added != null ? { pct: t.added, unit: '', note: 'added this month' } : null} />
        <Kpi tone="green" icon="office" value={t.allocated ?? 0} label="Allocated"
          pct={t.allocatedPct ?? 0} pctLabel={`${t.allocatedPct ?? 0}% in use`} pctTone="green" bar barColor="#12b76a" />
        <Kpi tone="amber" icon="clockSolid" value={t.maintenance ?? 0} label="Under Maintenance" pct={t.maintenancePct ?? 0} pctTone="amber" bar inline barColor="#f79009" />
        <Kpi tone="red" icon="alertTri" value={t.damaged ?? 0} label="Damaged" pct={t.damagedPct ?? 0} pctTone="red" bar inline barColor="#f04438" />
        <Kpi tone="blue" icon="boxSolid" value={t.unassigned ?? 0} label="Unassigned" pct={t.unassignedPct ?? 0} pctTone="blue" bar inline barColor="#2563eb" />
      </Kpis>

      <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Assets by state"
        items={[
          { key: 'all', label: 'All Assets', count: tabs.all ?? 0 },
          { key: 'allocated', label: 'Allocated', count: tabs.allocated ?? 0 },
          { key: 'unassigned', label: 'Unassigned', count: tabs.unassigned ?? 0 },
          { key: 'maintenance', label: 'Under Maintenance', count: tabs.maintenance ?? 0 },
          { key: 'damaged', label: 'Damaged', count: tabs.damaged ?? 0, tone: 'bad' },
          { key: 'retired', label: 'Retired', count: tabs.retired ?? 0 },
        ]} />

      <FilterBar>
        <FSelect value={state.hostel} onChange={(v) => set({ hostel: v, room: '' })} all="All hostels" options={hostels.map((h) => ({ value: h._id, label: h.name }))} grow={0} width="150px" />
        <FSelect value={state.room} onChange={(v) => set({ room: v })} all="All rooms" options={filterRooms.map((r) => ({ value: r._id, label: r.roomNumber }))} grow={0} width="146px" />
        <FSelect value={state.category} onChange={(v) => set({ category: v })} all="All categories" options={Object.keys(CATEGORY).map((c) => ({ value: c, label: words(c) }))} grow={0} width="142px" />
        <FSelect value={state.condition} onChange={(v) => set({ condition: v })} all="All conditions" options={CONDITIONS.map((c) => ({ value: c, label: words(c) }))} grow={0} width="138px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={Object.entries(STATE).map(([value, [label]]) => ({ value, label }))} grow={0} width="130px" />
        <FSearch compact value={state.search} onChange={(v) => set({ search: v })} placeholder="Search by asset name, code or location..." grow={1} width="220px" />
        <MoreFilters groups={[
          { key: 'inv', title: 'Inventory', value: state.linked, onPick: (v) => set({ linked: v }), options: [['', 'Any asset'], ['1', 'Linked to Inventory only']] },
        ]} />
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
      </FilterBar>
      {state.code ? (
        <p className="hs-roll__saved">Showing the asset labelled <strong>{state.code}</strong>. <button type="button" className="hs-linkbtn" onClick={() => set({ code: '' })}>Show every asset</button></p>
      ) : null}

      <ListCard>
        <BulkBar count={selected.size} noun="asset" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => csv(rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={6} headPad={11} dense
          selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" icon="eye" onClick={() => setDetail(r)}>View</Btn>
              <Btn size="sm" icon="pencil" disabled={retired(r)} onClick={() => open(r)}>Edit</Btn>
              <Kebab label={`Actions for ${r.name}`} items={[{ label: 'View asset', icon: 'eye', onClick: () => setDetail(r) }, ...(steps(r).length ? ['-', ...steps(r)] : [])]} />
            </>
          )}
          empty={(
            <EmptyRows icon="cube" title={filtered || tab !== 'all' ? 'No asset matches' : 'No assets recorded'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={() => open()}>Add Asset</Btn>}>
              {filtered || tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Beds, fans, cupboards and fire extinguishers — everything in the rooms and where it is.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'asset' : 'assets'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      {/* ── Add / edit ────────────────────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save}
        icon="cube" title={editId ? 'Edit Asset' : 'Add Hostel Asset'} subtitle="Record furniture and equipment, where it is and the state it is in."
        submitLabel={editId ? 'Save Changes' : 'Add Asset'} submitIcon="check"
        steps={[
          { key: 'asset', title: 'Asset Details', sub: 'What it is and its condition', icon: 'cube' },
          { key: 'where', title: 'Location', sub: 'Hostel and room', icon: 'mapPin' },
          { key: 'review', title: 'Review', sub: 'Confirm and add', icon: 'oCheckRound' },
        ]}>
        <FormSection step="asset" icon="cube" title="Asset Details" sub="Expensive tracked items stay in Inventory — link one, and this row records where it sits.">
          {!editId ? (
            <Fld label="Link to an Inventory Asset" optional icon="package">
              <select value={form.inventoryAsset} onChange={(e) => {
                const inv = invAssets.find((x) => x._id === e.target.value);
                setForm((f) => ({ ...f, inventoryAsset: e.target.value, name: inv?.name || f.name, assetCode: inv?.assetCode || f.assetCode }));
              }}>
                <option value="">Not tracked in Inventory</option>
                {invAssets.map((x) => <option key={x._id} value={x._id}>{x.name} ({x.assetCode})</option>)}
              </select>
            </Fld>
          ) : null}
          <Grid cols={2}>
            <Fld label="Name" required icon="cube"><input value={form.name} maxLength={80} placeholder="e.g. Study table" onChange={(e) => setF('name', e.target.value)} /></Fld>
            <Fld label="Asset Code" icon="oTag" hint="What its label says"><input value={form.assetCode} maxLength={30} placeholder="e.g. AST-0001" onChange={(e) => setF('assetCode', e.target.value.toUpperCase())} /></Fld>
          </Grid>
          <Grid cols={3}>
            <Fld label="Category" required icon="oTag">
              <select value={form.category} onChange={(e) => setF('category', e.target.value)}>
                {Object.keys(CATEGORY).map((c) => <option key={c} value={c}>{words(c)}</option>)}
              </select>
            </Fld>
            <Fld label="Quantity" required icon="oHash"><input type="number" min="1" max="1000" value={form.quantity} onChange={(e) => setF('quantity', e.target.value)} /></Fld>
            <Fld label="Condition" required icon="sparkle">
              <select value={form.condition} onChange={(e) => setF('condition', e.target.value)}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{words(c)}</option>)}
              </select>
            </Fld>
          </Grid>
          <Fld label="Description" optional count={[form.remarks.length, 200]}>
            <input value={form.remarks} maxLength={200} placeholder="Wooden double decker, 1.5 ton, …" onChange={(e) => setF('remarks', e.target.value)} />
          </Fld>
        </FormSection>
        <FormSection step="where" icon="mapPin" title="Location" sub="Where the asset is kept.">
          <Grid cols={2}>
            <Fld label="Hostel" required icon="oBuilding">
              <select value={form.hostel} disabled={!!editId} onChange={(e) => setF('hostel', e.target.value)}>
                <option value="">Select hostel</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </Fld>
            <Fld label="Room" icon="oDoor" hint={editId ? 'Use “Move to another room” to relocate it — the move is logged.' : ''}>
              <select value={form.room} disabled={!!editId || !form.hostel} onChange={(e) => setF('room', e.target.value)}>
                <option value="">Common area / store</option>
                {formRooms.map((r) => <option key={r._id} value={r._id}>{r.roomNumber}</option>)}
              </select>
            </Fld>
          </Grid>
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Confirm the asset before it is saved.">
          <ReviewList groups={[
            { title: 'Asset', step: 0, rows: [['Name', form.name], ['Code', form.assetCode], ['Category', words(form.category)], ['Quantity', form.quantity], ['Condition', words(form.condition)],
              ['Inventory', form.inventoryAsset ? invAssets.find((x) => x._id === form.inventoryAsset)?.assetCode || 'Linked' : 'Not linked'], ['Description', form.remarks]] },
            { title: 'Location', step: 1, rows: [['Hostel', hostels.find((h) => h._id === form.hostel)?.name], ['Room', formRooms.find((r) => r._id === form.room)?.roomNumber || 'Common area / store']] },
          ]} />
        </FormSection>
      </FormModal>

      {/* ── One step ──────────────────────────────────────────────────────── */}
      <FormModal open={!!act} onClose={() => setAct(null)} busy={busy} onSubmit={submitAct}
        icon={ACT_LOOK[act?.action]?.[0] || 'cube'} iconTone={ACT_LOOK[act?.action]?.[1] || 'indigo'}
        title={act ? ACT[act.action] : ''} subtitle={act ? [act.row.name, act.row.assetCode].filter(Boolean).join(' · ') : ''}
        submitLabel={act ? ACT[act.action] : 'Confirm'} tone={['damage', 'replace', 'dispose'].includes(act?.action) ? 'danger' : undefined}>
        {act ? (
          <FormSection>
            {act.action === 'issue' ? (
              <Fld label="Issue To" required hint="Only current residents are listed">
                <StudentPicker value={actForm.student} onChange={(id) => setActForm((f) => ({ ...f, student: id }))} params={{ allocated: 'true' }} />
              </Fld>
            ) : null}
            {act.action === 'transfer' ? (
              <Fld label="Move to Room" required icon="oDoor">
                <select value={actForm.room} onChange={(e) => setActForm((f) => ({ ...f, room: e.target.value }))}>
                  <option value="">Select room</option>
                  {allRooms.filter((r) => String(r._id) !== String(act.row.roomId)).map((r) => (
                    <option key={r._id} value={r._id}>{[hostels.find((h) => String(h._id) === String(r.hostel))?.name, r.roomNumber].filter(Boolean).join(' · ')}</option>
                  ))}
                </select>
              </Fld>
            ) : null}
            {['return', 'restore'].includes(act.action) ? (
              <Fld label="Condition Now" required icon="sparkle">
                <select value={actForm.condition} onChange={(e) => setActForm((f) => ({ ...f, condition: e.target.value }))}>
                  {(act.action === 'restore' ? ['new', 'good', 'fair'] : CONDITIONS).map((c) => <option key={c} value={c}>{words(c)}</option>)}
                </select>
              </Fld>
            ) : null}
            {act.action === 'damage' ? (
              <Fld label="Damage Charge (₹)" icon="rupee" hint={act.row.issuedToName ? `A charge above zero is billed to ${act.row.issuedToName} as a hostel fine.` : 'Nobody holds this asset, so a charge cannot be billed to anyone.'}>
                <input type="number" min="0" disabled={!act.row.issuedToName} value={actForm.damageCharge} onChange={(e) => setActForm((f) => ({ ...f, damageCharge: e.target.value }))} />
              </Fld>
            ) : null}
            {['replace', 'dispose'].includes(act.action) ? <InfoNote tone="amber">This retires the asset for good — it stays on record but can no longer be changed.</InfoNote> : null}
            <Fld label="Note" optional hint="Kept in the Activity Log with this step" count={[actForm.note.length, 300]}>
              <textarea rows={2} maxLength={300} value={actForm.note} onChange={(e) => setActForm((f) => ({ ...f, note: e.target.value }))} />
            </Fld>
          </FormSection>
        ) : null}
      </FormModal>

      <AssetDrawer asset={detail} onClose={() => setDetail(null)} steps={steps} onEdit={(r) => open(r)} />
      <ScanQr open={!!scan} onClose={() => setScan(null)} onFound={(code) => { setScan(null); set({ code, tab: 'all' }); }} />
    </div>
  );
}

/* ── One asset ───────────────────────────────────────────────────────────── */
function AssetDrawer({ asset: r, onClose, steps, onEdit }) {
  const [qr, setQr] = useState(null);
  const [history, setHistory] = useState(null);
  useEffect(() => {
    if (!r) { setQr(null); setHistory(null); return undefined; }
    let alive = true;
    api.getAssetQr(r._id).then((x) => alive && setQr(x.data ?? x)).catch(() => alive && setQr(null));
    api.getBoard('maintenance', { asset: r._id, limit: 20 }).then((x) => alive && setHistory((x.data ?? x).rows || [])).catch(() => alive && setHistory([]));
    return () => { alive = false; };
  }, [r]);

  const print = () => {
    if (!qr?.qrImage) return;
    const w = window.open('', '_blank', 'width=360,height=460');
    if (!w) { toast.error('Allow pop-ups to print the label'); return; }
    w.document.write(`<title>${qr.code}</title><body style="font-family:sans-serif;text-align:center;padding:24px">
      <img src="${qr.qrImage}" width="220" height="220" style="image-rendering:pixelated"/><h3 style="margin:10px 0 2px">${String(qr.name).replace(/</g, '&lt;')}</h3>
      <div style="font:600 14px monospace">${String(qr.code).replace(/</g, '&lt;')}</div></body>`);
    w.document.close(); w.focus(); w.print();
  };

  const list = r ? steps(r).filter((x) => x && x !== '-') : [];
  return (
    <Drawer open={!!r} onClose={onClose} label="Asset details">
      {r ? (
        <>
          <DrawerHead
            mark={<Mark name={catOf(r.category)[1]} tone={catOf(r.category)[2]} size={52} glyph={26} />}
            name={`${r.name}${r.quantity > 1 ? ` × ${r.quantity}` : ''}`} sub={r.assetCode || 'No code'}
            tags={<><StateTag r={r} /><Condition value={r.condition} /><Category value={r.category} /></>}
            onClose={onClose}
          />
          <DrawerBody>
            <DrawerSection title="Asset">
              <DrawerFields fields={[
                ['Category', words(r.category)], ['Hostel', r.hostelName], ['Room', r.roomNumber ? `${roomLabel(r)} · ${r.roomStudents || 0} living there` : 'Common area / store'],
                ['Issued to', r.issuedToName], ['Issued on', r.issuedAt ? fmtDate(r.issuedAt) : ''], ['Returned on', r.returnedAt ? fmtDate(r.returnedAt) : ''],
                ['Damage', r.damageNote], ['Damage charge', r.damageCharge ? rupees(r.damageCharge) : ''],
                ['In Inventory', r.linked ? 'Yes — its Inventory status follows this one' : 'No'], ['Added on', fmtDate(r.createdAt)], ['Description', r.remarks],
              ]} />
            </DrawerSection>
            <DrawerSection title="Label">
              {qr?.qrImage ? (
                <div className="hs-label">
                  <PassQr image={qr.qrImage} size={132} />
                  <div><strong>{qr.code}</strong><p className="hs-muted">Print it and stick it on the asset. Scanning it with “Scan QR” finds this asset.</p>
                    <Btn size="sm" icon="download" onClick={print}>Print label</Btn></div>
                </div>
              ) : <p className="hs-muted">Loading…</p>}
            </DrawerSection>
            <DrawerSection title={`Maintenance history (${history?.length ?? '…'})`}>
              {history?.length ? (
                <ul className="hs-livelist">
                  {history.map((m) => (
                    <li key={m._id}>
                      <TwoLine top={m.title || m.description} sub={[m.requestNumber ? `#${m.requestNumber}` : '', fmtDate(m.completedAt || m.scheduledDate || m.createdAt)].filter(Boolean).join(' · ')} />
                      <Badge tone={m.state === 'completed' ? 'green' : m.state === 'overdue' ? 'red' : 'amber'}>{words(m.state)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : history ? <p className="hs-muted">No work orders have been raised against this asset.</p> : <p className="hs-muted">Loading…</p>}
            </DrawerSection>
          </DrawerBody>
          <DrawerFoot>
            {list.length ? <Kebab label="More steps" items={steps(r)} /> : null}
            {!retired(r) ? <Btn kind="primary" icon="pencil" onClick={() => { onClose(); onEdit(r); }}>Edit asset</Btn> : null}
          </DrawerFoot>
        </>
      ) : null}
    </Drawer>
  );
}

/* ── Scan a label ────────────────────────────────────────────────────────── */
/**
 * A barcode or QR scanner types what it reads and presses Enter, so a text box
 * is all a scan needs — and the same box takes a code typed off a worn label.
 */
function ScanQr({ open, onClose, onFound }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setCode(''); }, [open]);
  const find = async (e) => {
    e?.preventDefault();
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    try {
      const r = await api.getBoard('assets', { code: c, limit: 5 });
      const n = (r.data ?? r).total || 0;
      if (!n) toast.error(`No asset is labelled ${c}`);
      else onFound(c);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <FormModal open={open} onClose={onClose} busy={busy} onSubmit={find} width={500}
      icon="qr" title="Scan an Asset Label" subtitle="Scan the QR on the asset with a scanner, or type the code printed under it."
      submitLabel="Find Asset" submitIcon="search">
      <FormSection>
        <Fld label="Asset Code" required icon="qr">
          <input id="hs-scan" value={code} autoComplete="off" placeholder="AST-0001" onChange={(e) => setCode(e.target.value)} />
        </Fld>
      </FormSection>
    </FormModal>
  );
}
