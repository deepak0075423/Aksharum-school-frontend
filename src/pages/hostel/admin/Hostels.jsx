/**
 * Hostel → Hostels (Sep 2026 redesign, to the user's mockup).
 *
 * Four figures, a filter row, the hostels table and a call to action, from
 * GET /hostel/admin/board/hostels. A bed is counted under the state the
 * allocation engine would act on (services/hostelOverview → BED_STATE), so
 * these figures and the Dashboard's are the same numbers.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerField, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { label, useNewFromLink } from '../shared';
import { PageHead, Mark, words } from './hsUI';
import { HostelArt, BedArt } from './hsArt';
import { FormModal, FormSection, Grid, Fld, StatusSelect, ChipSelect, InfoNote, ReviewList, ConfirmDialog, ampm } from './hsForm';
import PhoneInput from '../../../components/ui/PhoneInput';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, Btn, SplitBtn, Kebab, ListCard, DataTable, Pager, EmptyRows,
  Badge, IconCell, TwoLine, Meter, Ico, fmtPhone, useListState, useBoardData,
} from './hsList';

const empty = {
  name: '', code: '', hostelType: 'boys', gender: 'male', capacity: '',
  address: '', city: '', state: '', pincode: '', contactNumber: '', email: '',
  warden: '', assistantWarden: '', description: '',
  entryTime: '06:00', exitTime: '21:00', curfewTime: '22:00',
  facilities: [], rules: '', status: 'active',
};
const FACILITIES = ['wifi', 'laundry', 'gym', 'reading_room', 'common_room', 'mess', 'parking', 'cctv', 'power_backup',
  'water_purifier', 'hot_water', 'sports', 'medical_room'];

const TYPES = [['boys', 'Boys Hostel'], ['girls', 'Girls Hostel'], ['staff', 'Staff Hostel'], ['other', 'Other']];
const GENDERS = [['male', 'Male'], ['female', 'Female'], ['co_ed', 'Co-ed'], ['any', 'Any']];
const STATUSES = [['active', 'Active'], ['inactive', 'Inactive'], ['under_construction', 'Under construction']];
const STATUS_TONE = { active: 'green', inactive: 'slate', under_construction: 'amber' };
const nameOf = (list, v) => (list.find(([k]) => k === v) || [v, label(v)])[1];

export default function Hostels() {
  const nav = useNavigate();
  const { state, set, setPage, reset } = useListState({ limit: 10 });
  const { data, loading, reload } = useBoardData((q) => api.getBoard('hostels', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const staff = meta?.staff || [];

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const open = async (row) => {
    if (row) {
      // The board row is a summary; edit the whole record.
      try {
        const r = await api.getHostel(row._id);
        const h = r.data ?? r;
        setEditId(h._id);
        setForm({
          ...empty, ...h,
          warden: h.warden?._id || h.warden || '',
          assistantWarden: h.assistantWarden?._id || h.assistantWarden || '',
          facilities: h.facilities || [],
          rules: (h.rules || []).join('\n'),
          capacity: h.capacity ?? '',
        });
      } catch (err) { toast.error(err.message); return; }
    } else { setEditId(null); setForm(empty); }
    setModal(true);
  };

  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(true, () => open());

  const staffName = (id) => staff.find((x) => x._id === id)?.name || '';
  /** "rahul@school.in · 98765 43210" under a warden picker. */
  const person = (id) => { const x = staff.find((p) => p._id === id); return x ? [x.phone && fmtPhone(x.phone), x.email].filter(Boolean).join(' · ') : ''; };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        capacity: Number(form.capacity) || 0,
        warden: form.warden || null,
        assistantWarden: form.assistantWarden || null,
        facilities: form.facilities,
        rules: String(form.rules || '').split('\n').map((x) => x.trim()).filter(Boolean),
      };
      delete payload.stats; delete payload.buildings; delete payload.staff; delete payload.messes;
      if (editId) await api.updateHostel(editId, payload);
      else await api.createHostel(payload);
      toast.success(editId ? 'Hostel updated' : 'Hostel created');
      setModal(false);
      reload();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    try {
      await api.deleteHostel(del._id);
      toast.success('Hostel deactivated');
      setDel(null); reload();
      if (detail?._id === del._id) setDetail(null);
    } catch (err) { toast.error(err.message); setDel(null); }
  };

  const openDetail = async (row) => {
    setDetail({ loading: true, name: row.name, _id: row._id });
    try { const r = await api.getHostel(row._id); setDetail(r.data ?? r); }
    catch (err) { toast.error(err.message); setDetail(null); }
  };

  const t = data?.tiles || {};
  const rows = data?.rows || [];

  const columns = [
    { key: 'hostel', label: 'Hostel', render: (r) => <IconCell icon="tower" tone="orange" size={46} top={r.name} sub={r.code} /> },
    { key: 'type', label: 'Type', render: (r) => <Badge tone="blue">{nameOf(TYPES, r.hostelType)}</Badge> },
    { key: 'gender', label: 'Gender', render: (r) => <Badge tone="blue">{nameOf(GENDERS, r.gender)}</Badge> },
    { key: 'occ', label: 'Occupancy', render: (r) => {
      const pct = r.beds ? Math.round((r.occupied / r.beds) * 100) : 0;
      return (
        <span className="hs-occcell">
          <span>{r.occupied || 0} / {r.beds || 0} beds</span>
          <Meter pct={pct} color="#4f46e5" />
        </span>
      );
    } },
    { key: 'rooms', label: 'Rooms', render: (r) => r.rooms || 0 },
    { key: 'warden', label: 'Warden', render: (r) => (r.wardenName
      ? <span className="hs-person hs-person--ico"><Ico name="users" size={20} /><TwoLine top={r.wardenName} sub={fmtPhone(r.wardenPhone)} /></span>
      : <span className="hs-muted">Not assigned</span>) },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] || 'slate'} dot>{nameOf(STATUSES, r.status)}</Badge> },
  ];

  return (
    <div className="hs-page">
      <PageHead title="Hostels" subtitle="Manage hostels, view occupancy and control access for students.">
        <SplitBtn label="Add Hostel" onClick={() => open()} menuLabel="More ways to add"
          items={[
            { label: 'Add Building', icon: 'building', onClick: () => nav('/admin/hostel/structure?new=building') },
            { label: 'Add Floor', icon: 'floors', onClick: () => nav('/admin/hostel/structure?new=floor') },
            { label: 'Add Room & Beds', icon: 'door', onClick: () => nav('/admin/hostel/rooms?new=1') },
          ]} />
      </PageHead>

      <Kpis cols={4}>
        <Kpi tone="violet" icon="tower" value={t.hostels ?? 0} label="Total Hostels" art={<HostelArt />} />
        <Kpi tone="rose" icon="bedSolid" value={t.beds ?? 0} label="Total Beds" art={<BedArt />} />
        <Kpi tone="green" icon="group" value={t.occupied ?? 0} label="Occupied Beds"
          pct={t.occupiedPct ?? 0} pctLabel={`${t.occupiedPct ?? 0}% occupancy`} bar inline barColor="#4f46e5" />
        <Kpi tone="sky" icon="bedSolid" value={t.available ?? 0} label="Available Beds"
          pct={t.availablePct ?? 0} pctLabel={`${t.availablePct ?? 0}% available`} bar inline barColor="#10c48f" />
      </Kpis>

      <FilterBar band>
        <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search hostel name, code or warden..." grow={3} />
        <FSelect value={state.gender} onChange={(v) => set({ gender: v })} all="All genders" options={GENDERS.map(([value, l]) => ({ value, label: l }))} />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={STATUSES.map(([value, l]) => ({ value, label: l }))} />
        <FSelect value={state.type} onChange={(v) => set({ type: v })} all="All types" options={TYPES.map(([value, l]) => ({ value, label: l }))} />
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
      </FilterBar>

      <ListCard foot={null}>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={19}
          selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" icon="eye" onClick={() => openDetail(r)}>View</Btn>
              <Btn size="sm" icon="pencil" onClick={() => open(r)}>Edit</Btn>
              <Kebab items={[
                { label: 'Buildings & floors', icon: 'building', onClick: () => nav('/admin/hostel/structure') },
                { label: 'Rooms & beds', icon: 'door', onClick: () => nav('/admin/hostel/rooms') },
                { label: 'Occupancy map', icon: 'grid', onClick: () => nav('/admin/hostel/occupancy') },
                '-',
                { label: 'Deactivate', icon: 'trash', danger: true, onClick: () => setDel(r) },
              ]} />
            </>
          )}
          empty={(
            <EmptyRows icon="hostel" title={state.search || state.gender || state.status || state.type ? 'No hostel matches these filters' : 'No hostels yet'}
              action={<Btn kind="primary" icon="plus" onClick={() => open()}>Add Hostel</Btn>}>
              {state.search || state.gender || state.status || state.type ? 'Clear the filters to see every hostel.' : 'Add a hostel, then its buildings, floors and rooms.'}
            </EmptyRows>
          )}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'hostel' : 'hostels'} onPage={setPage} compact />
      </ListCard>

      <section className="hs-cta">
        <Mark name="tower" tone="violet" size={62} glyph={32} />
        <div className="hs-cta__text">
          <h3>Need to add a new hostel?</h3>
          <p>Create a hostel to manage rooms, beds, wardens and student allocations.</p>
          <ul>
            {['Set hostel details', 'Assign warden', 'Add buildings, floors and rooms', 'Configure bed capacity'].map((s) => (
              <li key={s}><Ico name="checkCircle" size={18} />{s}</li>
            ))}
          </ul>
        </div>
        <Btn kind="primary" icon="plus" size="lg" onClick={() => open()}>Add Hostel</Btn>
      </section>

      {/* ── Detail ───────────────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Hostel details">
        {detail ? (
          <>
            <DrawerHead
              mark={<Mark name="tower" tone="orange" size={52} glyph={26} />}
              name={detail.name} sub={detail.code}
              tags={detail.loading ? null : <>
                <Badge tone={STATUS_TONE[detail.status] || 'slate'} dot>{nameOf(STATUSES, detail.status)}</Badge>
                <Badge tone="blue">{nameOf(TYPES, detail.hostelType)}</Badge>
              </>}
              onClose={() => setDetail(null)}
            />
            <DrawerBody>
              {detail.loading ? <p className="hs-muted">Loading…</p> : (
                <>
                  <div className="hs-dstats">
                    {[['Buildings', detail.stats?.buildings], ['Rooms', detail.stats?.rooms], ['Beds', detail.stats?.totalBeds],
                      ['Occupied', detail.stats?.occupiedBeds], ['Available', detail.stats?.availableBeds], ['Residents', detail.stats?.residents]]
                      .map(([l, v]) => <div key={l}><strong>{v ?? 0}</strong><span>{l}</span></div>)}
                  </div>
                  <DrawerSection title="Details">
                    <DrawerFields fields={[
                      ['Gender', nameOf(GENDERS, detail.gender)],
                      ['Capacity', detail.capacity || '—'],
                      ['Warden', detail.warden?.name || 'Not assigned'],
                      ['Assistant warden', detail.assistantWarden?.name || 'Not assigned'],
                      ['Entry / exit', `${detail.entryTime || '—'} – ${detail.exitTime || '—'}`],
                      ['Curfew', detail.curfewTime || '—'],
                      ['Contact', detail.contactNumber],
                      ['Email', detail.email],
                      ['Address', [detail.address, detail.city, detail.state, detail.pincode].filter(Boolean).join(', ')],
                    ]} />
                  </DrawerSection>
                  {detail.facilities?.length ? (
                    <DrawerSection title="Facilities">
                      <div className="hs-chips">{detail.facilities.map((f) => <Badge key={f} tone="slate">{f}</Badge>)}</div>
                    </DrawerSection>
                  ) : null}
                  {detail.rules?.length ? (
                    <DrawerSection title="House rules">
                      <ul className="hs-dlist">{detail.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    </DrawerSection>
                  ) : null}
                  {detail.staff?.length ? (
                    <DrawerSection title="Assigned staff">
                      <dl>{detail.staff.map((s, i) => <DrawerField key={s._id || i} label={words(s.role)}>{s.staff?.name || '—'}</DrawerField>)}</dl>
                    </DrawerSection>
                  ) : null}
                </>
              )}
            </DrawerBody>
            {!detail.loading ? (
              <DrawerFoot>
                <Btn icon="pencil" onClick={() => { setDetail(null); open(detail); }}>Edit hostel</Btn>
                <Btn kind="primary" icon="door" onClick={() => nav('/admin/hostel/rooms')}>Rooms & beds</Btn>
              </DrawerFoot>
            ) : null}
          </>
        ) : null}
      </Drawer>

      {/* ── Create / edit ────────────────────────────────────────────────── */}
      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save}
        title={editId ? 'Edit Hostel' : 'Add Hostel'} subtitle="Set up a new hostel with details, rules and facilities."
        submitLabel={editId ? 'Save Changes' : 'Create Hostel'} submitIcon="check"
        steps={[
          { key: 'basic', title: 'Basic Information', sub: 'Name, code, type and location', icon: 'oBuilding' },
          { key: 'admin', title: 'Administration', sub: 'Wardens and contact details', icon: 'users' },
          { key: 'timing', title: 'Timings & Access', sub: 'Entry, exit, curfew and visitors', icon: 'clock' },
          { key: 'capacity', title: 'Capacity & Facilities', sub: 'Rooms, capacity and amenities', icon: 'oBed' },
          { key: 'rules', title: 'Rules & Policies', sub: 'Hostel specific rules', icon: 'fileDoc' },
          { key: 'review', title: 'Additional Details', sub: 'Review and create', icon: 'settings' },
        ]}>
        <FormSection step="basic" icon="oBuilding" title="Basic Information" sub="Provide the essential details for the hostel.">
          <Grid cols={2}>
            <Fld label="Hostel Name" required icon="oBuilding">
              <input value={form.name} maxLength={80} placeholder="Enter hostel name (e.g. Boys Hostel)" onChange={(e) => setF('name', e.target.value)} />
            </Fld>
            <Fld label="Hostel Code" icon="oTag" hint={editId ? 'The code cannot be reused by another hostel' : 'Auto-generated if left blank (e.g. HL-001)'}>
              <input value={form.code} maxLength={20} placeholder="HL-001" onChange={(e) => setF('code', e.target.value.toUpperCase())} />
            </Fld>
          </Grid>
          <Grid cols={3}>
            <Fld label="Type" required icon="user">
              <select value={form.hostelType} onChange={(e) => setF('hostelType', e.target.value)}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Fld>
            <Fld label="Gender Restriction" required icon="oGender" hint="Enforced at the time of allocation">
              <select value={form.gender} onChange={(e) => setF('gender', e.target.value)}>
                {GENDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Fld>
            <StatusSelect value={form.status} onChange={(v) => setF('status', v)} options={STATUSES} />
          </Grid>
        </FormSection>
        <FormSection step="basic" icon="mapPin" title="Location & Contact" sub="Set the hostel's address and contact information.">
          <Grid cols={2}>
            <Fld label="Contact Number" icon="phone">
              <PhoneInput value={form.contactNumber}
                placeholder="Enter contact number" onChange={(e) => setF('contactNumber', e.target.value)} />
            </Fld>
            <Fld label="Email" icon="mail">
              <input type="email" value={form.email} placeholder="Enter email address" onChange={(e) => setF('email', e.target.value)} />
            </Fld>
          </Grid>
          <Fld label="Address" icon="mapPin">
            <input value={form.address} placeholder="Enter full address" onChange={(e) => setF('address', e.target.value)} />
          </Fld>
          <Grid cols={3}>
            <Fld label="City" icon="oBuilding"><input value={form.city} placeholder="City" onChange={(e) => setF('city', e.target.value)} /></Fld>
            <Fld label="State" icon="oMap"><input value={form.state} placeholder="State" onChange={(e) => setF('state', e.target.value)} /></Fld>
            <Fld label="Pincode" icon="mapPin">
              <input value={form.pincode} inputMode="numeric" pattern="[0-9]{6}" title="A six-digit pincode" maxLength={6} placeholder="Pincode"
                onChange={(e) => setF('pincode', e.target.value.replace(/\D/g, ''))} />
            </Fld>
          </Grid>
        </FormSection>
        <FormSection step="basic" icon="fileDoc" title="Short Description" sub="Brief information about this hostel.">
          <Fld count={[form.description.length, 500]}>
            <textarea rows={3} maxLength={500} value={form.description} placeholder="Enter a short description about the hostel (optional)"
              onChange={(e) => setF('description', e.target.value)} />
          </Fld>
        </FormSection>

        <FormSection step="admin" icon="users" title="Administration" sub="Who runs the hostel. Wardens are notified about its requests and alerts.">
          <Grid cols={2}>
            <Fld label="Warden" icon="user" hint={person(form.warden) || 'Chosen from the school’s staff'}>
              <select value={form.warden} onChange={(e) => setF('warden', e.target.value)}>
                <option value="">— none —</option>
                {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </Fld>
            <Fld label="Assistant Warden" icon="user" hint={person(form.assistantWarden) || 'Optional'}>
              <select value={form.assistantWarden} onChange={(e) => setF('assistantWarden', e.target.value)}>
                <option value="">— none —</option>
                {staff.filter((s) => s._id !== form.warden).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </Fld>
          </Grid>
          <InfoNote>Other staff — security, housekeeping, mess — are posted to the hostel under Warden &amp; Staff once it exists.</InfoNote>
        </FormSection>

        <FormSection step="timing" icon="clock" title="Timings & Access" sub="When residents may come and go. Movement after curfew is flagged and the warden alerted.">
          <Grid cols={3}>
            <Fld label="Entry Time" required icon="clock"><input type="time" value={form.entryTime} onChange={(e) => setF('entryTime', e.target.value)} /></Fld>
            <Fld label="Exit Time" required icon="clock"><input type="time" value={form.exitTime} onChange={(e) => setF('exitTime', e.target.value)} /></Fld>
            <Fld label="Curfew Time" required icon="clock"><input type="time" value={form.curfewTime} onChange={(e) => setF('curfewTime', e.target.value)} /></Fld>
          </Grid>
          <InfoNote>Visiting hours and days apply to every hostel and are set once, under Hostel Settings → Timings &amp; Curfew.</InfoNote>
        </FormSection>

        <FormSection step="capacity" icon="oBed" title="Capacity & Facilities" sub="The capacity the hostel is planned for, and what it offers.">
          <Grid cols={2}>
            <Fld label="Planned Capacity (Beds)" icon="users" hint="The live figure is always counted from the beds you add">
              <input type="number" min="0" max="100000" value={form.capacity} placeholder="e.g. 120" onChange={(e) => setF('capacity', e.target.value)} />
            </Fld>
          </Grid>
          <Fld label="Facilities" optional hint="Pick from the list, or type your own and press Enter">
            <ChipSelect value={form.facilities} onChange={(v) => setF('facilities', v)} options={FACILITIES} label="Facilities" icon="oTag" allowNew placeholder="Add a facility" />
          </Fld>
        </FormSection>

        <FormSection step="rules" icon="fileDoc" title="Rules & Policies" sub="Rules residents of this hostel must follow, shown to them and their parents.">
          <Fld label="Hostel Rules" optional hint="One rule per line" count={[form.rules.length, 2000]}>
            <textarea rows={6} maxLength={2000} value={form.rules} placeholder={'No visitors in the rooms\nLights out at 10:30 PM'} onChange={(e) => setF('rules', e.target.value)} />
          </Fld>
        </FormSection>

        <FormSection step="review" icon="settings" title="Additional Details" sub="Check everything before the hostel is created.">
          <ReviewList groups={[
            { title: 'Basic information', step: 0, rows: [['Name', form.name], ['Code', form.code || 'Generated on save'], ['Type', nameOf(TYPES, form.hostelType)], ['Gender', nameOf(GENDERS, form.gender)], ['Status', nameOf(STATUSES, form.status)]] },
            { title: 'Location & contact', step: 0, rows: [['Contact', form.contactNumber], ['Email', form.email], ['Address', [form.address, form.city, form.state, form.pincode].filter(Boolean).join(', ')]] },
            { title: 'Administration', step: 1, rows: [['Warden', staffName(form.warden)], ['Assistant warden', staffName(form.assistantWarden)]] },
            { title: 'Timings', step: 2, rows: [['Entry', ampm(form.entryTime)], ['Exit', ampm(form.exitTime)], ['Curfew', ampm(form.curfewTime)]] },
            { title: 'Capacity & facilities', step: 3, rows: [['Planned capacity', form.capacity ? `${form.capacity} beds` : ''], ['Facilities', form.facilities.map(words)]] },
            { title: 'Rules', step: 4, rows: [['Rules', form.rules.split('\n').filter(Boolean).length ? `${form.rules.split('\n').filter(Boolean).length} rule(s)` : '']] },
          ]} />
        </FormSection>
      </FormModal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} confirmLabel="Deactivate Hostel"
        title="Deactivate Hostel"
        message={`Deactivate ${del?.name}? Its history is kept — a hostel with residents cannot be deactivated.`} />
    </div>
  );
}
