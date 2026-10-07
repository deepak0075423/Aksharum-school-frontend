/**
 * Hostel → Mess (Sep 2026 redesign, to the user's mockup).
 *
 * Five figures over six views of one module: the messes themselves, who eats
 * at them, what is served and when, who turned up, what it cost, and how the
 * month added up. The figures come with the messes board
 * (GET /hostel/admin/board/mess); each of the other views asks for its own.
 *
 * The page head's buttons belong to whichever view is showing, so each view
 * portals its own into the head (see `slot`).
 */
import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerField, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { di, useNewFromLink } from '../shared';
import { PageHead, Mark, words } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, LineTabs, Btn, Kebab, Popover, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, Person, TwoLine, Meter, Ico, useListState, useBoardData, exportCsv, fmtDate, fmtPhone, rupees,
} from './hsList';
import { Members, MenuSchedule, MealAttendance, Expenses, Analytics } from './MessTabs';
import { FormModal, FormSection, Grid, Fld, StatusSelect, ChipSelect, Toggle, ReviewList, ConfirmDialog, ampm, dmy } from './hsForm';
import PhoneInput from '../../../components/ui/PhoneInput';

export const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const MESS_TYPE = { veg: 'Vegetarian', non_veg: 'Non-vegetarian', both: 'Veg & non-veg' };
const TONES = ['violet', 'green', 'amber', 'blue', 'pink', 'teal'];
const blankTimings = () => ({
  breakfast: { start: '07:30', end: '09:00', enabled: true }, lunch: { start: '12:30', end: '14:00', enabled: true },
  snacks: { start: '16:30', end: '17:30', enabled: true }, dinner: { start: '19:30', end: '21:00', enabled: true },
});
const emptyMess = {
  name: '', code: '', messType: 'both', capacity: '', location: '', inCharge: '', hostels: [],
  vendorName: '', vendorContact: '', vendorEmail: '', contractFrom: '', contractTo: '', contractAmount: '', status: 'active',
};
/** "Breakfast, Lunch, Dinner" and whether snacks are served too. */
export const mealsOf = (timings) => {
  const on = (k) => timings?.[k]?.enabled !== false;
  return { mains: ['breakfast', 'lunch', 'dinner'].filter(on).map(words).join(', ') || '—', snacks: on('snacks') };
};
const serves = (r) => (r.hostelNames?.length ? r.hostelNames.join(', ') : 'All hostels');

export default function Mess() {
  const [tab, setTab] = useState('messes');
  const [slot, setSlot] = useState(null);
  const { state, set, setPage, reset } = useListState({ limit: 10, hostel: '', status: '', messType: '' }, { fromUrl: [] });
  const { data, loading, reload } = useBoardData((q) => api.getBoard('mess', q), state);
  const { data: meta, refetch: reloadMeta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const staff = meta?.staff || [];
  const messes = meta?.messes || [];

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyMess);
  const [timings, setTimings] = useState(blankTimings);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [pickMess, setPickMess] = useState('');       // the mess the other views open on
  const [more, setMore] = useState(false);
  const moreBtn = useRef(null);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => { reload(); reloadMeta?.(); };

  const openMess = (row) => {
    if (row) {
      setEditId(row._id);
      setForm({
        ...emptyMess,
        name: row.name || '', code: row.code || '', messType: row.messType || 'both', capacity: row.capacity ?? '', location: row.location || '',
        inCharge: row.inChargeId || '', hostels: (row.hostels || []).map(String),
        vendorName: row.vendorName || '', vendorContact: row.vendorContact || '', vendorEmail: row.vendorEmail || '',
        contractFrom: row.contractFrom ? di(row.contractFrom) : '', contractTo: row.contractTo ? di(row.contractTo) : '',
        contractAmount: row.contractAmount || '', status: row.status || 'active',
      });
      setTimings({ ...blankTimings(), ...(row.mealTimings || {}) });
    } else { setEditId(null); setForm(emptyMess); setTimings(blankTimings()); }
    setModal(true);
  };
  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(true, () => openMess());

  const save = async () => {
    setSaving(true);
    try {
      const p = {
        ...form, mealTimings: timings,
        capacity: Number(form.capacity) || 0, contractAmount: Number(form.contractAmount) || 0, inCharge: form.inCharge || null,
        contractFrom: form.contractFrom || null, contractTo: form.contractTo || null,
      };
      if (editId) await api.updateMess(editId, p); else await api.createMess(p);
      toast.success(editId ? 'Mess updated' : 'Mess added');
      setModal(false); setDetail(null); refresh();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    try { await api.deleteMess(del._id); toast.success('Mess deactivated'); setDel(null); setDetail(null); refresh(); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const go = (view, messId) => { if (messId) setPickMess(messId); setDetail(null); setTab(view); };

  const t = data?.tiles || {};
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const filtered = !!(state.search || state.hostel || state.status || state.messType);

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'name', label: 'Mess Name', render: (r, i) => (
      <span className="hs-person">
        <Mark name="cutlery" tone={TONES[(from + i) % TONES.length]} size={42} glyph={22} round />
        <TwoLine top={r.name} sub={[r.code, MESS_TYPE[r.messType]].filter(Boolean).join(' · ')} />
      </span>
    ) },
    { key: 'hostel', label: 'Hostel', render: (r) => <TwoLine top={serves(r)} sub={r.location} /> },
    { key: 'members', label: 'Members', render: (r) => (
      <span className="hs-capcell">
        <strong>{r.members || 0}</strong>
        <small>{r.capacity ? `/ ${r.capacity} capacity` : 'no capacity set'}</small>
        {r.capacity ? <Meter pct={r.memberPct} color="#2563eb" /> : null}
      </span>
    ) },
    { key: 'meals', label: 'Meals / Day', render: (r) => { const m = mealsOf(r.mealTimings); return <TwoLine top={m.mains} sub={m.snacks ? '+ snacks' : ''} />; } },
    { key: 'incharge', label: 'Warden / Incharge', render: (r) => (r.inChargeName
      ? <Person name={r.inChargeName} src={r.inChargePhoto} sub={fmtPhone(r.inChargePhone)} size={38} strong={false} />
      : <span className="hs-muted">Not assigned</span>) },
    { key: 'cost', label: 'Monthly Cost', render: (r) => (
      <span className="hs-two">
        <span className="hs-two__top is-strong">{rupees(r.monthCost)}</span>
        {r.costPct != null ? (
          <span className={`hs-trend${r.costPct > 0 ? ' is-up' : ' is-down'}`}>
            <Ico name={r.costPct > 0 ? 'arrowUp' : 'arrowDown'} size={13} />{r.costPct > 0 ? '+' : ''}{r.costPct}%
          </span>
        ) : null}
      </span>
    ) },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={r.status === 'active' ? 'green' : 'slate'} size="lg">{words(r.status)}</Badge> },
  ];

  const csv = (list) => exportCsv('hostel-messes.csv', [
    { label: 'Mess', value: (r) => r.name }, { label: 'Code', value: (r) => r.code }, { label: 'Type', value: (r) => MESS_TYPE[r.messType] },
    { label: 'Serves', value: (r) => serves(r) }, { label: 'Location', value: (r) => r.location },
    { label: 'Members', value: (r) => r.members }, { label: 'Capacity', value: (r) => r.capacity },
    { label: 'In charge', value: (r) => r.inChargeName }, { label: 'Phone', value: (r) => r.inChargePhone },
    { label: 'Cost this month', value: (r) => r.monthCost }, { label: 'Cost last month', value: (r) => r.lastMonthCost },
    { label: 'Status', value: (r) => words(r.status) },
  ], list);
  const exportAll = async () => {
    try { const res = await api.getBoard('mess', { ...state, page: 1, limit: 5000 }); csv((res.data ?? res).rows || []); }
    catch (err) { toast.error(err.message); }
  };

  const view = { messes, slot, pickMess, setPickMess, onChanged: refresh };

  return (
    <div className="hs-page">
      <PageHead title="Mess Management" subtitle="Manage hostel messes, members, menus, attendance and running costs">
        <span className="hs-head__slot" ref={setSlot} />
      </PageHead>

      <Kpis cols={5} size="lg">
        <Kpi tone="violet" icon="cutlery" value={t.messes ?? 0} label="Total Messes"
          delta={t.newThisTerm != null ? { pct: t.newThisTerm, unit: '', note: 'from last term' } : null} />
        <Kpi tone="sky" icon="crowd" value={t.members ?? 0} label="Total Members"
          pct={t.occupancyPct ?? 0} pctLabel={t.capacity ? <><b className="hs-pt-blue">{t.occupancyPct}%</b> occupancy</> : 'No capacity set'} pctTone="ink" bar barColor="#2563eb" />
        <Kpi tone="green" icon="cloche" value={t.served ?? 0} label="Meals Served (Today)"
          pct={t.servedPct ?? 0} pctLabel={`${t.servedPct ?? 0}% of ${t.planned ?? 0} planned`} pctTone="green" bar barColor="#12b76a" />
        <Kpi tone="amber" icon="rupee" value={rupees(t.expenses ?? 0)} label="Total Expenses (Month)"
          delta={t.expensesPct != null ? { pct: t.expensesPct, tone: t.expensesPct > 0 ? 'amber' : 'green', sign: false } : null} />
        <Kpi tone="red" icon="alertTri" value={t.dues ?? 0} label="Pending Dues"
          note={<><i className="hs-dot hs-dot--alert" /><b>{t.duesPct ?? 0}%</b> of members</>} />
      </Kpis>

      <LineTabs rule value={tab} onChange={setTab} label="Mess views"
        items={[
          { key: 'messes', label: 'Messes' }, { key: 'members', label: 'Members' }, { key: 'menu', label: 'Menu & Schedule' },
          { key: 'attendance', label: 'Meal Attendance' }, { key: 'expenses', label: 'Expenses' }, { key: 'reports', label: 'Reports & Analytics' },
        ]} />

      {tab === 'messes' ? (
        <>
          {slot ? createPortal(
            <>
              <Btn className="hs-btn--accent" icon="download" onClick={exportAll}>Export</Btn>
              <Btn kind="primary" icon="plus" onClick={() => openMess()}>Add Mess</Btn>
            </>, slot,
          ) : null}
          <FilterBar>
            <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={hostels.map((h) => ({ value: h._id, label: h.name }))} grow={0} width="170px" />
            <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} grow={0} width="170px" />
            <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search mess name or warden..." grow={0} width="256px" />
            <span className="hs-filters__spacer" />
            <Btn ref={moreBtn} icon="filter" aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((o) => !o)}>Filter{state.messType ? ' · 1' : ''}</Btn>
            <Popover anchor={moreBtn} open={more} onClose={() => setMore(false)} label="Filter by kitchen">
              <div className="hs-menu2" role="menu">
                {[['', 'Any kitchen'], ...Object.entries(MESS_TYPE)].map(([k, text]) => (
                  <button key={k || 'any'} type="button" role="menuitemradio" aria-checked={state.messType === k} className={`hs-menu2__item${state.messType === k ? ' is-on' : ''}`}
                    onClick={() => { set({ messType: k }); setMore(false); }}><span>{text}</span></button>
                ))}
              </div>
            </Popover>
            <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
          </FilterBar>

          <ListCard>
            <BulkBar count={selected.size} noun="mess" plural="messes" onClear={() => setSelected(new Set())}>
              <Btn size="sm" icon="download" onClick={() => csv(rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
            </BulkBar>
            <DataTable
              columns={columns} rows={rows} loading={loading} pad={13} headPad={12} dense
              selected={selected} onSelect={setSelected}
              actions={(r) => (
                <>
                  <Btn size="sm" icon="eye" onClick={() => setDetail(r)}>View</Btn>
                  <Btn size="sm" icon="pencil" onClick={() => openMess(r)}>Edit</Btn>
                  <Kebab label={`Actions for ${r.name}`} items={[
                    { label: 'Members', icon: 'users', onClick: () => go('members', r._id) },
                    { label: 'Menu & schedule', icon: 'calendar', onClick: () => go('menu', r._id) },
                    { label: 'Meal attendance', icon: 'checkSquare', onClick: () => go('attendance', r._id) },
                    { label: 'Expenses', icon: 'wallet', onClick: () => go('expenses', r._id) },
                    '-',
                    { label: 'Deactivate', icon: 'trash', danger: true, onClick: () => setDel(r) },
                  ]} />
                </>
              )}
              empty={(
                <EmptyRows icon="cutlery" title={filtered ? 'No mess matches these filters' : 'No mess set up yet'}
                  action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={() => openMess()}>Add Mess</Btn>}>
                  {filtered ? 'Clear the filters to see every mess.' : 'Set up a mess, then enrol its members and plan its menu.'}
                </EmptyRows>
              )}
            />
            <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
              noun={data?.total === 1 ? 'mess' : 'messes'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
          </ListCard>
        </>
      ) : null}

      {tab === 'members' ? <Members {...view} /> : null}
      {tab === 'menu' ? <MenuSchedule {...view} /> : null}
      {tab === 'attendance' ? <MealAttendance {...view} /> : null}
      {tab === 'expenses' ? <Expenses {...view} /> : null}
      {tab === 'reports' ? <Analytics {...view} /> : null}

      {/* ── Add / edit a mess ─────────────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save}
        icon="cutlery" title={editId ? 'Edit Mess' : 'Add Mess'} subtitle="Set up a mess with the hostels it serves, its meal hours and its vendor."
        submitLabel={editId ? 'Save Changes' : 'Create Mess'} submitIcon="check"
        steps={[
          { key: 'basic', title: 'Basic Details', sub: 'Name, type and who it serves', icon: 'cutlery' },
          { key: 'meals', title: 'Meals & Timings', sub: 'What is served, and when', icon: 'clock' },
          { key: 'vendor', title: 'Vendor & Contract', sub: 'In-house or a caterer', icon: 'briefcase', optional: true },
          { key: 'review', title: 'Review', sub: 'Confirm and create', icon: 'oCheckRound' },
        ]}>
        <FormSection step="basic" icon="cutlery" title="Basic Details" sub="The mess and the hostels it feeds.">
          <Grid cols={3}>
            <Fld label="Mess Name" required icon="cutlery"><input data-text="title" value={form.name} maxLength={60} placeholder="e.g. Main Mess" onChange={(e) => setF('name', e.target.value)} /></Fld>
            <Fld label="Code" icon="oTag" hint="Leave blank to generate automatically"><input data-text="code" value={form.code} maxLength={20} placeholder="Auto (MS-…)" onChange={(e) => setF('code', e.target.value.toUpperCase())} /></Fld>
            <Fld label="Type" required icon="oTag">
              <select value={form.messType} onChange={(e) => setF('messType', e.target.value)}>
                {Object.entries(MESS_TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Fld>
            <Fld label="Capacity (Seats)" icon="users"><input type="number" min="0" max="5000" value={form.capacity} placeholder="e.g. 120" onChange={(e) => setF('capacity', e.target.value)} /></Fld>
            <Fld label="Location" icon="mapPin"><input value={form.location} maxLength={80} placeholder="e.g. Ground floor, Block A" onChange={(e) => setF('location', e.target.value)} /></Fld>
            <StatusSelect value={form.status} onChange={(v) => setF('status', v)} options={[['active', 'Active'], ['inactive', 'Inactive']]} />
          </Grid>
          <Grid cols={2}>
            <Fld label="Serves Hostels" optional hint="Leave empty for a mess that serves every hostel">
              <ChipSelect value={form.hostels} onChange={(v) => setF('hostels', v)} options={hostels.map((h) => h._id)} show={(id) => hostels.find((h) => h._id === id)?.name || id}
                label="Hostels" icon="oBuilding" placeholder="All hostels" />
            </Fld>
            <Fld label="In Charge" icon="user">
              <select value={form.inCharge} onChange={(e) => setF('inCharge', e.target.value)}>
                <option value="">— none —</option>
                {staff.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
              </select>
            </Fld>
          </Grid>
        </FormSection>
        <FormSection step="meals" icon="clock" title="Meals & Timings" sub="Switch off a meal the mess does not serve.">
          <div className="hsf-meals">
            {MEALS.map((k) => {
              const on = timings[k]?.enabled !== false;
              const put = (patch) => setTimings((tm) => ({ ...tm, [k]: { ...tm[k], ...patch } }));
              return (
                <div key={k} className={`hsf-meal${on ? '' : ' is-off'}`}>
                  <Toggle on={on} onChange={(v) => put({ enabled: v })} label={`Serve ${words(k)}`} />
                  <strong>{words(k)}</strong>
                  <Fld label="From"><input type="time" required={on} disabled={!on} value={timings[k]?.start || ''} onChange={(e) => put({ start: e.target.value })} /></Fld>
                  <Fld label="To"><input type="time" required={on} disabled={!on} value={timings[k]?.end || ''} onChange={(e) => put({ end: e.target.value })} /></Fld>
                </div>
              );
            })}
          </div>
        </FormSection>
        <FormSection step="vendor" icon="briefcase" title="Vendor & Contract" sub="Leave the vendor empty for an in-house mess.">
          <Grid cols={3}>
            <Fld label="Vendor" icon="briefcase"><input data-text="title" value={form.vendorName} maxLength={80} placeholder="Blank = in-house" onChange={(e) => setF('vendorName', e.target.value)} /></Fld>
            <Fld label="Vendor Contact" icon="phone"><PhoneInput value={form.vendorContact} disabled={!form.vendorName} onChange={(e) => setF('vendorContact', e.target.value)} /></Fld>
            <Fld label="Contract Amount (₹)" icon="rupee"><input step="0.01" type="number" min="0" value={form.contractAmount} disabled={!form.vendorName} onChange={(e) => setF('contractAmount', e.target.value)} /></Fld>
            <Fld label="Contract From" icon="calendar"><input type="date" value={form.contractFrom} disabled={!form.vendorName} onChange={(e) => setF('contractFrom', e.target.value)} /></Fld>
            <Fld label="Contract To" icon="calendar"><input type="date" min={form.contractFrom || undefined} value={form.contractTo} disabled={!form.vendorName} onChange={(e) => setF('contractTo', e.target.value)} /></Fld>
          </Grid>
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Confirm the mess before it is saved.">
          <ReviewList groups={[
            { title: 'Mess', step: 0, rows: [['Name', form.name], ['Code', form.code || 'Generated on save'], ['Type', MESS_TYPE[form.messType]], ['Capacity', form.capacity], ['Location', form.location],
              ['Serves', form.hostels.length ? form.hostels.map((id) => hostels.find((h) => h._id === id)?.name).filter(Boolean) : 'All hostels'], ['In charge', staff.find((x) => x._id === form.inCharge)?.name], ['Status', words(form.status)]] },
            { title: 'Meals', step: 1, rows: MEALS.map((k) => [words(k), timings[k]?.enabled === false ? 'Not served' : `${ampm(timings[k]?.start)} – ${ampm(timings[k]?.end)}`]) },
            { title: 'Vendor', step: 2, rows: [['Vendor', form.vendorName || 'In-house'], ['Contract', form.vendorName && form.contractAmount ? `₹${form.contractAmount}` : ''], ['Period', form.contractFrom ? `${dmy(form.contractFrom)} – ${dmy(form.contractTo)}` : '']] },
          ]} />
        </FormSection>
      </FormModal>

      {/* ── Detail ────────────────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Mess details">
        {detail ? (
          <>
            <DrawerHead
              mark={<Mark name="cutlery" tone="violet" size={52} glyph={26} round />}
              name={detail.name} sub={detail.code}
              tags={<><Badge tone={detail.status === 'active' ? 'green' : 'slate'}>{words(detail.status)}</Badge><Badge tone="blue">{MESS_TYPE[detail.messType]}</Badge></>}
              onClose={() => setDetail(null)}
            />
            <DrawerBody>
              <div className="hs-dstats">
                {[['Members', detail.members || 0], ['Capacity', detail.capacity || '—'], ['This month', rupees(detail.monthCost)]]
                  .map(([l, v]) => <div key={l}><strong>{v}</strong><span>{l}</span></div>)}
              </div>
              <DrawerSection title="Mess">
                <DrawerFields fields={[
                  ['Serves', serves(detail)], ['Location', detail.location],
                  ['In charge', detail.inChargeName], ['Phone', fmtPhone(detail.inChargePhone)],
                  ['Last month', rupees(detail.lastMonthCost)],
                ]} />
              </DrawerSection>
              <DrawerSection title="Meals">
                <dl>{MEALS.map((k) => (
                  <DrawerField key={k} label={words(k)}>
                    {detail.mealTimings?.[k]?.enabled === false ? 'Not served' : `${detail.mealTimings?.[k]?.start || '—'} – ${detail.mealTimings?.[k]?.end || '—'}`}
                  </DrawerField>
                ))}</dl>
              </DrawerSection>
              <DrawerSection title="Vendor">
                {detail.vendorName ? (
                  <DrawerFields fields={[
                    ['Vendor', detail.vendorName], ['Contact', detail.vendorContact], ['Email', detail.vendorEmail],
                    ['Contract', detail.contractFrom ? `${fmtDate(detail.contractFrom)} – ${detail.contractTo ? fmtDate(detail.contractTo) : 'open'}` : ''],
                    ['Contract amount', detail.contractAmount ? rupees(detail.contractAmount) : ''],
                  ]} />
                ) : <p className="hs-muted">Run in-house — no vendor.</p>}
              </DrawerSection>
            </DrawerBody>
            <DrawerFoot>
              <Btn icon="users" onClick={() => go('members', detail._id)}>Members</Btn>
              <Btn kind="primary" icon="pencil" onClick={() => openMess(detail)}>Edit mess</Btn>
            </DrawerFoot>
          </>
        ) : null}
      </Drawer>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} confirmLabel="Deactivate" icon="cutlery"
        title="Deactivate Mess" message={`Deactivate ${del?.name}? A mess with members enrolled cannot be deactivated.`} />
    </div>
  );
}
