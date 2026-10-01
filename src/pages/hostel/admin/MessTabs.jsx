/**
 * Hostel → Mess: the five views behind the Messes tab — Members, Menu &
 * Schedule, Meal Attendance, Expenses and Reports & Analytics.
 *
 * Each is its own component with its own board, so opening the Mess screen
 * costs one request and a view costs another only when somebody looks at it.
 * All of them take the same props from Mess.jsx:
 *
 *   messes        the active messes (from the meta endpoint), for the picker
 *   slot          the page head's button slot — a view portals its buttons in
 *   pickMess      the mess a row of the Messes tab sent us here for
 *   onChanged     tell the shell its figures are stale
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import { di, today } from '../shared';
import { words, count, compact, Card, CardHead, Legend } from './hsUI';
import { Donut, Columns } from './hsCharts';
import {
  FilterBar, FField, FSearch, FSelect, FDateRange, Btn, Kebab, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, TwoLine, useListState, useBoardData, exportCsv, fmtDate, rupees,
} from './hsList';
import { StudentCell, roomShort } from './hsPeople';
import { FormModal, FormSection, Grid, Fld, RadioCards, ChipSelect, StudentPicker, InfoNote, ConfirmDialog } from './hsForm';

const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PREF = { veg: ['Veg', 'green'], non_veg: ['Non-veg', 'red'], vegan: ['Vegan', 'teal'], jain: ['Jain', 'amber'], eggetarian: ['Eggetarian', 'orange'], other: ['Other', 'slate'] };
const PLAN = { full: 'All meals', breakfast_only: 'Breakfast only', lunch_dinner: 'Lunch & dinner', custom: 'Custom' };
const CATS = ['groceries', 'vegetables', 'dairy', 'gas', 'vendor_bill', 'salary', 'equipment', 'other'];
const CAT_COLOR = { groceries: '#4f46e5', vegetables: '#12b76a', dairy: '#2b8ef0', gas: '#f79009', vendor_bill: '#7338fd', salary: '#f04438', equipment: '#0d9488', other: '#94a3b8' };
const Pref = ({ value }) => { const [text, tone] = PREF[value] || [words(value), 'slate']; return <Badge tone={tone}>{text}</Badge>; };
const messOptions = (messes) => messes.map((m) => ({ value: m._id, label: m.name }));
const monthLabel = (ym) => { const [y, m] = String(ym).split('-').map(Number); return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); };

/** No mess yet: every view says so the same way. */
const NoMess = () => (
  <div className="hs-panel hs-omap__fail">
    <EmptyRows icon="cutlery" title="No mess set up yet">Add a mess on the Messes tab first.</EmptyRows>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
 *  Members
 * ═══════════════════════════════════════════════════════════════════════════ */
const emptyMember = { student: '', mess: '', foodPreference: 'veg', allergies: [], dietaryNotes: '', mealPlan: 'full' };
const ALLERGENS = ['peanuts', 'tree_nuts', 'milk', 'eggs', 'gluten', 'soy', 'shellfish', 'fish', 'sesame'];

export function Members({ messes, slot, pickMess, onChanged }) {
  const { state, set, setPage, reset } = useListState({ limit: 10, mess: pickMess || '', foodPreference: '', status: '', dues: '' }, { fromUrl: [] });
  const { data, loading, reload } = useBoardData((q) => api.getBoard('mess-members', q), state);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyMember);
  const [editRow, setEditRow] = useState(null);
  const [saving, setSaving] = useState(false);
  const [end, setEnd] = useState(null);           // { row, status }
  const [selected, setSelected] = useState(new Set());

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const open = (row) => {
    setEditRow(row || null);
    setForm(row
      ? { student: row.studentId, mess: row.messId, foodPreference: row.foodPreference, allergies: row.allergies || [], dietaryNotes: row.dietaryNotes || '', mealPlan: row.mealPlan }
      : { ...emptyMember, mess: state.mess || messes[0]?._id || '' });
    setModal(true);
  };
  const done = () => { reload(); onChanged?.(); };

  const save = async () => {
    setSaving(true);
    try {
      const p = { ...form, allergies: form.allergies };
      if (editRow) await api.updateMessMember(editRow._id, p); else await api.enrolMessMember(p);
      toast.success(editRow ? 'Enrolment updated' : 'Student enrolled');
      setModal(false); done();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const setStatus = async (row, status) => {
    try {
      await api.updateMessMember(row._id, { status });
      toast.success(status === 'active' ? 'Enrolment reactivated' : status === 'suspended' ? 'Enrolment suspended' : 'Enrolment ended');
      setEnd(null); done();
    } catch (err) { toast.error(err.message); setEnd(null); }
  };

  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const filtered = !!(state.search || state.mess || state.foodPreference || state.status || state.dues);
  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'student', label: 'Student', render: (r) => <StudentCell r={r} /> },
    { key: 'class', label: 'Class', render: (r) => r.studentClass || '—', nowrap: true },
    { key: 'room', label: 'Hostel / Room', render: (r) => <TwoLine top={r.hostelName || '—'} sub={r.roomNumber ? roomShort(r) : ''} /> },
    { key: 'mess', label: 'Mess', render: (r) => r.messName },
    { key: 'pref', label: 'Preference', render: (r) => <Pref value={r.foodPreference} /> },
    { key: 'allergies', label: 'Allergies', render: (r) => (r.allergies?.length ? <span className="hs-allergy">{r.allergies.join(', ')}</span> : <span className="hs-muted">None</span>) },
    { key: 'plan', label: 'Meal Plan', render: (r) => PLAN[r.mealPlan] || words(r.mealPlan) },
    { key: 'since', label: 'Since', render: (r) => fmtDate(r.fromDate), nowrap: true },
    { key: 'dues', label: 'Mess Dues', render: (r) => (r.dueAmount > 0 ? <span className="hs-allergy">{rupees(r.dueAmount)}</span> : <span className="hs-muted">—</span>) },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={r.status === 'active' ? 'green' : r.status === 'suspended' ? 'amber' : 'slate'} size="lg">{words(r.status)}</Badge> },
  ];
  const csv = (list) => exportCsv('mess-members.csv', [
    { label: 'Student', value: (r) => r.studentName }, { label: 'Roll', value: (r) => r.studentRoll }, { label: 'Class', value: (r) => r.studentClass },
    { label: 'Hostel', value: (r) => r.hostelName }, { label: 'Room', value: (r) => r.roomNumber }, { label: 'Mess', value: (r) => r.messName },
    { label: 'Preference', value: (r) => (PREF[r.foodPreference] || [r.foodPreference])[0] }, { label: 'Allergies', value: (r) => (r.allergies || []).join('; ') },
    { label: 'Meal plan', value: (r) => PLAN[r.mealPlan] }, { label: 'Since', value: (r) => fmtDate(r.fromDate) },
    { label: 'Mess dues', value: (r) => r.dueAmount || 0 }, { label: 'Status', value: (r) => words(r.status) },
  ], list);
  const exportAll = async () => {
    try { const res = await api.getBoard('mess-members', { ...state, page: 1, limit: 5000 }); csv((res.data ?? res).rows || []); }
    catch (err) { toast.error(err.message); }
  };

  return (
    <>
      {slot ? createPortal(
        <>
          <Btn className="hs-btn--accent" icon="download" onClick={exportAll}>Export</Btn>
          <Btn kind="primary" icon="plus" onClick={() => open()} disabled={!messes.length}>Enrol Student</Btn>
        </>, slot,
      ) : null}
      <FilterBar>
        <FSelect value={state.mess} onChange={(v) => set({ mess: v })} all="All messes" options={messOptions(messes)} grow={0} width="170px" />
        <FSelect value={state.foodPreference} onChange={(v) => set({ foodPreference: v })} all="All preferences" options={Object.entries(PREF).map(([value, [label]]) => ({ value, label }))} grow={0} width="170px" />
        <FSelect value={state.status} onChange={(v) => set({ status: v })} all="Active members"
          options={[{ value: 'all', label: 'All statuses' }, { value: 'suspended', label: 'Suspended' }, { value: 'ended', label: 'Ended' }]} grow={0} width="160px" />
        <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search student name or roll no..." grow={0} width="256px" />
        <span className="hs-filters__spacer" />
        <Btn icon="alert" className={state.dues ? 'is-on' : ''} aria-pressed={!!state.dues} onClick={() => set({ dues: state.dues ? '' : '1' })}>With dues</Btn>
        <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
      </FilterBar>
      <ListCard>
        <BulkBar count={selected.size} noun="member" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => csv(rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable columns={columns} rows={rows} loading={loading} pad={6} headPad={12} dense selected={selected} onSelect={setSelected}
          actions={(r) => (
            <>
              <Btn size="sm" icon="pencil" onClick={() => open(r)}>Edit</Btn>
              <Kebab label={`Actions for ${r.studentName}`} items={r.status === 'active' ? [
                { label: 'Suspend', icon: 'clock', onClick: () => setStatus(r, 'suspended') },
                { label: 'End enrolment', icon: 'logOut', danger: true, onClick: () => setEnd({ row: r, status: 'ended' }) },
              ] : [{ label: 'Reactivate', icon: 'refresh', onClick: () => setStatus(r, 'active') }]} />
            </>
          )}
          empty={(
            <EmptyRows icon="crowd" title={filtered ? 'No member matches' : 'Nobody enrolled yet'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={() => open()} disabled={!messes.length}>Enrol Student</Btn>}>
              {filtered ? 'Clear the filters to see every member.' : 'Enrol a hostel resident in a mess to plan their meals.'}
            </EmptyRows>
          )} />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'member' : 'members'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save} width={640}
        icon="cutlery" title={editRow ? 'Edit Enrolment' : 'Enrol Student'} subtitle={editRow ? `${editRow.studentName} · ${editRow.messName}` : 'Put a resident on a mess, with what the kitchen needs to know.'}
        submitLabel={editRow ? 'Save Changes' : 'Enrol Student'} submitIcon="check">
        <FormSection>
          <Grid cols={2}>
            <Fld label="Student" required hint={editRow ? '' : 'Only current residents are listed'}>
              <StudentPicker value={form.student} onChange={(id) => setF('student', id)} params={{ allocated: 'true' }} disabled={!!editRow}
                current={editRow ? { _id: editRow.studentId, name: editRow.studentName } : null} />
            </Fld>
            <Fld label="Mess" required icon="cutlery">
              <select value={form.mess} onChange={(e) => setF('mess', e.target.value)}>
                <option value="">Select mess</option>
                {messes.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
              </select>
            </Fld>
          </Grid>
          <RadioCards label="Food Preference" value={form.foodPreference} onChange={(v) => setF('foodPreference', v)} cols={Object.keys(PREF).length}
            options={Object.entries(PREF).map(([v, [l]]) => [v, l])} />
          <Fld label="Meal Plan" icon="clock">
            <select value={form.mealPlan} onChange={(e) => setF('mealPlan', e.target.value)}>
              {Object.entries(PLAN).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Fld>
          <Fld label="Allergies" optional hint="Pick from the list, or type your own and press Enter">
            <ChipSelect value={form.allergies} onChange={(v) => setF('allergies', v)} options={ALLERGENS} label="Allergies" icon="oHeart" allowNew placeholder="No allergies" />
          </Fld>
          <Fld label="Dietary Notes" optional count={[form.dietaryNotes.length, 300]}>
            <textarea rows={2} maxLength={300} value={form.dietaryNotes} onChange={(e) => setF('dietaryNotes', e.target.value)} />
          </Fld>
          {editRow ? null : <InfoNote>Allergy information here is what the kitchen needs day to day; the student&apos;s clinical record stays on their profile.</InfoNote>}
        </FormSection>
      </FormModal>
      <ConfirmDialog open={!!end} onClose={() => setEnd(null)} onConfirm={() => setStatus(end.row, end.status)} confirmLabel="End Enrolment"
        title="End Enrolment" message={`End ${end?.row?.studentName}'s enrolment in ${end?.row?.messName}? They can be enrolled again later.`} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Menu & Schedule
 * ═══════════════════════════════════════════════════════════════════════════ */
export function MenuSchedule({ messes, slot, pickMess }) {
  const [mess, setMess] = useState(pickMess || '');
  const [mode, setMode] = useState('week');                 // week (the template) | dates
  const [range, setRange] = useState({ from: today(), to: di(new Date(Date.now() + 6 * 864e5)) });
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(false);
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const current = messes.find((m) => m._id === mess) || messes[0] || null;
  const messId = current?._id || '';

  const load = async () => {
    if (!messId) return;
    setLoading(true);
    try {
      const r = mode === 'week' ? await api.getMenus({ mess: messId, isTemplate: 'true' }) : await api.getMenus({ mess: messId, from: range.from, to: range.to });
      setMenus(r.data ?? r);
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [messId, mode, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const dates = useMemo(() => {
    const out = [];
    const end = new Date(`${range.to}T00:00:00`);
    for (let d = new Date(`${range.from}T00:00:00`); d <= end && out.length < 31; d.setDate(d.getDate() + 1)) out.push(di(new Date(d)));
    return out;
  }, [range]);
  const cols = mode === 'week' ? DAYS.map((d, i) => ({ key: i, label: d })) : dates.map((d) => ({ key: d, label: new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) }));
  const menuFor = (meal, key) => menus.find((m) => m.meal === meal && (mode === 'week' ? m.dayOfWeek === key : di(m.date) === key));
  const served = MEALS.filter((k) => current?.mealTimings?.[k]?.enabled !== false);

  const openCell = (row, meal, key) => setEdit(row
    ? { ...row, items: row.items || [], estimatedCost: row.estimatedCost || '' }
    : { mess: messId, meal, items: [], description: '', isSpecial: false, specialOccasion: '', estimatedCost: '',
      isTemplate: mode === 'week', dayOfWeek: mode === 'week' ? key : null, date: mode === 'week' ? null : key });

  const save = async () => {
    if (!edit.items.length) { toast.error('Add at least one item to the menu'); return; }
    setSaving(true);
    try {
      await api.saveMenu({
        mess: messId, meal: edit.meal, isTemplate: !!edit.isTemplate, dayOfWeek: edit.dayOfWeek, date: edit.date,
        items: edit.items, description: edit.description || '',
        specialOccasion: edit.specialOccasion || '', isSpecial: !!edit.specialOccasion, estimatedCost: Number(edit.estimatedCost) || 0,
      });
      toast.success('Menu saved'); setEdit(null); load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const remove = async () => {
    try { await api.deleteMenu(del._id); toast.success('Menu removed'); setDel(null); setEdit(null); load(); }
    catch (err) { toast.error(err.message); setDel(null); }
  };
  const generate = async () => {
    try {
      const r = await api.generateMenus({ mess: messId, from: range.from, to: range.to, overwrite: false });
      const d = r.data ?? r;
      toast.success(`${d.created} menu entries generated, ${d.skipped} already existed`);
      load();
    } catch (err) { toast.error(err.message); }
  };

  if (!messes.length) return <NoMess />;
  return (
    <>
      {slot && mode === 'dates' ? createPortal(<Btn kind="primary" icon="calendar" onClick={generate}>Generate from template</Btn>, slot) : null}
      <FilterBar>
        <FSelect value={messId} onChange={setMess} options={messOptions(messes)} label="Mess" grow={0} width="190px" />
        <FSelect value={mode} onChange={setMode} options={[{ value: 'week', label: 'Weekly template' }, { value: 'dates', label: 'Dated menus' }]} label="Menu kind" grow={0} width="180px" />
        {mode === 'dates' ? <FDateRange from={range.from} to={range.to} onChange={(v) => setRange({ from: v.from || range.from, to: v.to || range.to })} grow={0} width="280px" /> : null}
      </FilterBar>

      <ul className="hs-mealtimes" aria-label="Meal timings">
        {MEALS.map((k) => {
          const tm = current?.mealTimings?.[k]; const on = tm?.enabled !== false;
          return (
            <li key={k} className={on ? '' : 'is-off'}>
              <strong>{words(k)}</strong>
              <span>{on ? `${tm?.start || '—'} – ${tm?.end || '—'}` : 'Not served'}</span>
            </li>
          );
        })}
      </ul>

      <ListCard className="hs-lcard--menu">
        <div className={`hs-table-wrap${loading ? ' is-loading' : ''}`}>
          <table className="hs-table hs-menugrid">
            <thead><tr><th>Meal</th>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>
              {served.map((meal) => (
                <tr key={meal}>
                  <th scope="row">{words(meal)}<small>{current?.mealTimings?.[meal]?.start || ''}</small></th>
                  {cols.map((c) => {
                    const m = menuFor(meal, c.key);
                    return (
                      <td key={c.key}>
                        <button type="button" className={`hs-menucell${m?.items?.length ? '' : ' is-empty'}`} onClick={() => openCell(m, meal, c.key)}
                          aria-label={`${words(meal)}, ${c.label}: ${m?.items?.length ? m.items.join(', ') : 'not planned'}`}>
                          {m?.items?.length ? m.items.join(', ') : '+ Add'}
                          {m?.specialOccasion ? <em>{m.specialOccasion}</em> : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!served.length ? <tr className="hs-table__empty"><td colSpan={cols.length + 1}><EmptyRows icon="cutlery" title="This mess serves no meals">Switch its meals on in the mess&rsquo;s own form.</EmptyRows></td></tr> : null}
            </tbody>
          </table>
        </div>
      </ListCard>
      <p className="hs-roll__saved">
        {mode === 'week'
          ? 'The weekly template is what each day repeats. Pick “Dated menus” to plan particular days, or to roll the template forward.'
          : 'Dated menus are what is actually served on a day — generate them from the template, then change the days that differ.'}
      </p>

      <FormModal open={!!edit} onClose={() => setEdit(null)} busy={saving} onSubmit={save} width={600}
        icon="cutlery" title={edit ? `${words(edit.meal)} Menu` : ''} subtitle={edit ? (edit.isTemplate ? `Every ${DAYS[edit.dayOfWeek]}` : fmtDate(edit.date)) : ''}
        submitLabel="Save Menu" submitIcon="check"
        footerStart={edit?._id ? <button type="button" className="hsf-btn hsf-btn--ghostbad" onClick={() => setDel(edit)}>Remove</button> : null}>
        {edit ? (
          <FormSection>
            <Fld label="Items" required hint="Type an item and press Enter">
              <ChipSelect value={edit.items} onChange={(v) => setEdit((m) => ({ ...m, items: v }))} options={[]} label="Items" icon="cutlery" allowNew placeholder="e.g. Poha, Boiled egg, Tea" />
            </Fld>
            <Grid cols={2}>
              <Fld label="Estimated Cost per Head (₹)" icon="rupee"><input type="number" min="0" value={edit.estimatedCost} onChange={(e) => setEdit((m) => ({ ...m, estimatedCost: e.target.value }))} /></Fld>
              <Fld label="Special Occasion" optional icon="sparkle"><input value={edit.specialOccasion || ''} maxLength={60} placeholder="e.g. Diwali dinner" onChange={(e) => setEdit((m) => ({ ...m, specialOccasion: e.target.value }))} /></Fld>
            </Grid>
            <Fld label="Description" optional><input value={edit.description || ''} maxLength={200} onChange={(e) => setEdit((m) => ({ ...m, description: e.target.value }))} /></Fld>
          </FormSection>
        ) : null}
      </FormModal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Remove Menu" confirmLabel="Remove" icon="trash" message="Remove this meal's menu? This cannot be undone." />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Meal Attendance
 * ═══════════════════════════════════════════════════════════════════════════ */
const MARK = { taken: ['Taken', 'present'], skipped: ['Skipped', 'absent'], on_leave: ['On leave', 'leave'] };

export function MealAttendance({ slot, pickMess, onChanged }) {
  const [q, setQ] = useState({ mess: pickMess || '', date: today(), meal: 'lunch' });
  const { data, loading, reload } = useBoardData((p) => api.getBoard('mess-attendance', p), q);
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);
  const [term, setTerm] = useState('');
  const rows = useMemo(() => data?.rows || [], [data]);

  useEffect(() => {
    if (data) setMarks(Object.fromEntries(rows.map((r) => [r.studentId, r.recordStatus === 'guest' ? 'taken' : (r.recordStatus || r.suggested)])));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const tally = useMemo(() => {
    const n = { taken: 0, skipped: 0, on_leave: 0 };
    rows.forEach((r) => { if (n[marks[r.studentId]] != null) n[marks[r.studentId]] += 1; });
    return n;
  }, [rows, marks]);
  const unsaved = rows.filter((r) => !r.recordId || marks[r.studentId] !== r.recordStatus).length;
  const visible = rows.filter((r) => !term.trim() || [r.studentName, r.studentRoll, r.roomNumber].some((v) => String(v || '').toLowerCase().includes(term.trim().toLowerCase())));

  const submit = async () => {
    setSaving(true);
    try {
      const records = rows.map((r) => ({ student: r.studentId, status: marks[r.studentId] || 'taken' }));
      const r = await api.markMessAttendance({ mess: data.mess, date: q.date, meal: data.meal, records });
      const d = r.data ?? r;
      toast.success(`${d.created} marked, ${d.updated} updated`);
      reload(); onChanged?.();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  if (data && !data.messes?.length) return <NoMess />;
  const columns = [
    { key: 'n', label: '#', render: (r, i) => i + 1, className: 'hs-table__num' },
    { key: 'student', label: 'Student', render: (r) => <StudentCell r={r} size={32} /> },
    { key: 'class', label: 'Class', render: (r) => r.studentClass || '—' },
    { key: 'room', label: 'Room', render: (r) => roomShort(r), nowrap: true },
    { key: 'pref', label: 'Preference', render: (r) => <Pref value={r.foodPreference} /> },
    { key: 'allergies', label: 'Allergies', render: (r) => (r.allergies?.length ? <span className="hs-allergy">{r.allergies.join(', ')}</span> : <span className="hs-muted">—</span>) },
    { key: 'status', label: words(data?.meal || q.meal), render: (r) => (
      <span className="hs-stack">
        <span className="hs-seg" role="group" aria-label={`Mark ${r.studentName}`}>
          {Object.entries(MARK).map(([k, [text, cls]]) => (
            <button key={k} type="button" className={`hs-seg__b is-${cls}${marks[r.studentId] === k ? ' is-on' : ''}`} aria-pressed={marks[r.studentId] === k}
              onClick={() => setMarks((m) => ({ ...m, [r.studentId]: k }))}>{text}</button>
          ))}
        </span>
        {/* The resident said so ahead of time, from their own Hostel page. */}
        {r.selfMarked && marks[r.studentId] === 'skipped' ? <small className="is-warn">Told the mess in advance</small> : null}
      </span>
    ) },
  ];

  return (
    <>
      {slot ? createPortal(<Btn kind="primary" onClick={submit} disabled={saving || !rows.length}>{saving ? 'Saving…' : 'Save Attendance'}</Btn>, slot) : null}
      <FilterBar>
        <FField label="Mess">
          <FSelect value={data?.mess || q.mess} onChange={(v) => setQ((s) => ({ ...s, mess: v }))} options={messOptions(data?.messes || [])} label="Mess" />
        </FField>
        <FField label="Meal">
          <FSelect value={data?.meal || q.meal} onChange={(v) => setQ((s) => ({ ...s, meal: v }))} options={[...MEALS, 'special'].map((m) => ({ value: m, label: words(m) }))} label="Meal" />
        </FField>
        <FField label="Date">
          <input type="date" value={q.date} max={today()} onChange={(e) => e.target.value && setQ((s) => ({ ...s, date: e.target.value }))} />
        </FField>
        <FField label="Served" grow={0.8}>
          <input value={data?.timing && data.timing.enabled !== false ? `${data.timing.start || '—'} – ${data.timing.end || '—'}` : '—'} readOnly aria-label="Meal hours" />
        </FField>
      </FilterBar>
      <ListCard className="hs-lcard--roll" head={(
        <>
          <h3 className="hs-roll__title">Members ({count(rows.length)})</h3>
          <ul className="hs-roll__key">
            <li><span className="hs-roll__chip is-present"><i aria-hidden />Taken ({tally.taken})</span></li>
            <li><span className="hs-roll__chip is-absent"><i aria-hidden />Skipped ({tally.skipped})</span></li>
            <li><span className="hs-roll__chip is-leave"><i aria-hidden />On Leave ({tally.on_leave})</span></li>
          </ul>
          <FSearch value={term} onChange={setTerm} placeholder="Search by name, roll no or room..." grow={0} width="264px" />
          <Btn onClick={() => setMarks(Object.fromEntries(rows.map((r) => [r.studentId, 'taken'])))} disabled={!rows.length}>Mark all taken</Btn>
        </>
      )}>
        {rows.length && unsaved ? (
          <p className="hs-roll__state is-amber" role="status">
            {data?.saved ? `${count(unsaved)} unsaved change${unsaved === 1 ? '' : 's'} — save to keep ${unsaved === 1 ? 'it' : 'them'}.` : 'This meal has not been saved — the marks shown are suggestions.'}
          </p>
        ) : null}
        <DataTable select={false} columns={columns} rows={visible} rowKey="studentId" loading={loading} pad={5} headPad={11} dense
          empty={<EmptyRows icon="crowd" title={rows.length ? 'Nobody matches' : 'Nobody enrolled'}>{rows.length ? 'Clear the search to see every member.' : 'Enrol students in this mess first.'}</EmptyRows>} />
      </ListCard>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Expenses
 * ═══════════════════════════════════════════════════════════════════════════ */
const emptyExpense = { mess: '', category: 'groceries', description: '', amount: '', vendorName: '', invoiceNumber: '', date: today() };

export function Expenses({ messes, slot, pickMess, onChanged }) {
  const { state, set, setPage, reset } = useListState({ limit: 10, mess: pickMess || '', category: '', from: '', to: '' }, { fromUrl: [] });
  const { data, loading, reload } = useBoardData((q) => api.getBoard('mess-expenses', q), state);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyExpense);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const open = () => { setForm({ ...emptyExpense, mess: state.mess || messes[0]?._id || '' }); setModal(true); };
  const done = () => { reload(); onChanged?.(); };

  const save = async () => {
    setSaving(true);
    try { await api.createMessExpense({ ...form, amount: Number(form.amount) || 0 }); toast.success('Expense recorded'); setModal(false); done(); }
    catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const remove = async () => {
    try { await api.deleteMessExpense(del._id); toast.success('Expense deleted'); setDel(null); done(); }
    catch (err) { toast.error(err.message); setDel(null); }
  };

  const rows = data?.rows || [];
  const sum = data?.summary || { byCategory: [], total: 0 };
  const filtered = !!(state.search || state.mess || state.category || state.from || state.to);
  const columns = [
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date), nowrap: true },
    { key: 'mess', label: 'Mess', render: (r) => r.messName },
    { key: 'cat', label: 'Category', render: (r) => <span className="hs-catdot"><i style={{ background: CAT_COLOR[r.category] }} aria-hidden />{words(r.category)}</span> },
    { key: 'desc', label: 'Description', render: (r) => r.description || '—' },
    { key: 'vendor', label: 'Vendor', render: (r) => r.vendorName || '—' },
    { key: 'inv', label: 'Invoice No.', render: (r) => r.invoiceNumber || '—' },
    { key: 'by', label: 'Recorded By', render: (r) => r.recordedByName || '—' },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <strong>{rupees(r.amount)}</strong> },
  ];
  const exportAll = async () => {
    try {
      const res = await api.getBoard('mess-expenses', { ...state, page: 1, limit: 5000 });
      exportCsv('mess-expenses.csv', [
        { label: 'Date', value: (r) => fmtDate(r.date) }, { label: 'Mess', value: (r) => r.messName }, { label: 'Category', value: (r) => words(r.category) },
        { label: 'Description', value: (r) => r.description }, { label: 'Vendor', value: (r) => r.vendorName }, { label: 'Invoice no.', value: (r) => r.invoiceNumber },
        { label: 'Amount', value: (r) => r.amount }, { label: 'Recorded by', value: (r) => r.recordedByName },
      ], (res.data ?? res).rows || []);
    } catch (err) { toast.error(err.message); }
  };

  return (
    <>
      {slot ? createPortal(
        <>
          <Btn className="hs-btn--accent" icon="download" onClick={exportAll}>Export</Btn>
          <Btn kind="primary" icon="plus" onClick={open} disabled={!messes.length}>Record Expense</Btn>
        </>, slot,
      ) : null}
      <FilterBar>
        <FSelect value={state.mess} onChange={(v) => set({ mess: v })} all="All messes" options={messOptions(messes)} grow={0} width="170px" />
        <FSelect value={state.category} onChange={(v) => set({ category: v })} all="All categories" options={CATS.map((c) => ({ value: c, label: words(c) }))} grow={0} width="170px" />
        <FDateRange from={state.from} to={state.to} onChange={(v) => set(v)} grow={0} width="280px" />
        <FSearch value={state.search} onChange={(v) => set({ search: v })} placeholder="Search description, vendor or invoice..." grow={1} width="240px" />
        <Btn icon="refresh" onClick={reset}>Reset</Btn>
      </FilterBar>

      <ul className="hs-catcards" aria-label="Spend by category">
        <li className="is-total"><strong>{rupees(sum.total)}</strong><span>Total{state.from || state.to ? ' in this period' : ''}</span></li>
        {sum.byCategory.map((c) => (
          <li key={c.category}>
            <button type="button" className={state.category === c.category ? 'is-on' : ''} aria-pressed={state.category === c.category}
              onClick={() => set({ category: state.category === c.category ? '' : c.category })}>
              <i style={{ background: CAT_COLOR[c.category] }} aria-hidden />
              <strong>{rupees(c.total)}</strong><span>{words(c.category)}</span>
            </button>
          </li>
        ))}
      </ul>

      <ListCard>
        <DataTable select={false} columns={columns} rows={rows} loading={loading} pad={9} headPad={12} dense
          actions={(r) => <Btn size="sm" kind="danger" icon="trash" onClick={() => setDel(r)}>Delete</Btn>}
          empty={(
            <EmptyRows icon="rupee" title={filtered ? 'No expense matches' : 'No expenses recorded'}
              action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={open} disabled={!messes.length}>Record Expense</Btn>}>
              {filtered ? 'Clear the filters to see every expense.' : 'Groceries, gas, vendor bills and salaries are recorded here.'}
            </EmptyRows>
          )} />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'expense' : 'expenses'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      <FormModal open={modal} onClose={() => setModal(false)} busy={saving} onSubmit={save} width={640}
        icon="oReceipt" title="Record Expense" subtitle="A bill paid for the mess — groceries, gas, the vendor, salaries."
        submitLabel="Record Expense" submitIcon="check">
        <FormSection>
          <Grid cols={2}>
            <Fld label="Mess" required icon="cutlery">
              <select value={form.mess} onChange={(e) => setF('mess', e.target.value)}>
                <option value="">Select mess</option>
                {messes.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
              </select>
            </Fld>
            <Fld label="Date" required icon="calendar"><input type="date" max={today()} value={form.date} onChange={(e) => setF('date', e.target.value)} /></Fld>
            <Fld label="Category" required icon="oTag">
              <select value={form.category} onChange={(e) => setF('category', e.target.value)}>
                {CATS.map((c) => <option key={c} value={c}>{words(c)}</option>)}
              </select>
            </Fld>
            <Fld label="Amount (₹)" required icon="rupee"><input type="number" min="1" step="any" value={form.amount} onChange={(e) => setF('amount', e.target.value)} /></Fld>
            <Fld label="Vendor" optional icon="briefcase"><input value={form.vendorName} maxLength={80} onChange={(e) => setF('vendorName', e.target.value)} /></Fld>
            <Fld label="Invoice No." optional icon="oHash"><input value={form.invoiceNumber} maxLength={40} onChange={(e) => setF('invoiceNumber', e.target.value)} /></Fld>
          </Grid>
          <Fld label="Description" optional count={[form.description.length, 200]}>
            <textarea rows={2} maxLength={200} value={form.description} onChange={(e) => setF('description', e.target.value)} />
          </Fld>
        </FormSection>
      </FormModal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete Expense" confirmLabel="Delete" icon="trash"
        message={`Delete the ${words(del?.category).toLowerCase()} expense of ${rupees(del?.amount)}? This cannot be undone.`} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Reports & Analytics
 * ═══════════════════════════════════════════════════════════════════════════ */
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function Analytics({ messes, slot, pickMess }) {
  const [q, setQ] = useState({ month: thisMonth(), mess: pickMess || '' });
  const { data, loading } = useBoardData((p) => api.getBoard('mess-report', p), q);
  const tot = data?.totals || {};
  const cats = data?.byCategory || [];
  const prefs = data?.preferences || [];
  const members = prefs.reduce((n, p) => n + p.n, 0);
  const trend = (data?.trend || []).map((r) => ({ ...r, label: new Date(r.year, r.month - 1, 1).toLocaleDateString('en-IN', { month: 'short' }), title: monthLabel(r.key) }));

  const download = () => exportCsv(`mess-report-${data?.month || q.month}.csv`, [
    { label: 'Mess', value: (r) => r.name }, { label: 'Members', value: (r) => r.members }, { label: 'Capacity', value: (r) => r.capacity },
    { label: 'Meals served', value: (r) => r.meals }, { label: 'Skipped', value: (r) => r.skipped }, { label: 'On leave', value: (r) => r.onLeave },
    { label: 'Attendance %', value: (r) => r.attendancePct }, { label: 'Expenses', value: (r) => r.expenses }, { label: 'Cost per meal', value: (r) => r.costPerMeal ?? '' },
  ], data?.messes || []);

  return (
    <>
      {slot ? createPortal(<Btn className="hs-btn--accent" icon="download" onClick={download} disabled={!data?.messes?.length}>Export</Btn>, slot) : null}
      <FilterBar>
        <FField label="Month" grow={0} width="190px">
          <input type="month" value={q.month} max={thisMonth()} onChange={(e) => e.target.value && setQ((s) => ({ ...s, month: e.target.value }))} />
        </FField>
        <FField label="Mess" grow={0} width="220px">
          <FSelect value={q.mess} onChange={(v) => setQ((s) => ({ ...s, mess: v }))} all="All messes" options={messOptions(messes)} />
        </FField>
      </FilterBar>

      <ul className={`hs-figs${loading ? ' is-loading' : ''}`} aria-label={`Figures for ${monthLabel(data?.month || q.month)}`}>
        <li><strong>{count(tot.members ?? 0)}</strong><span>Members</span></li>
        <li><strong>{count(tot.meals ?? 0)}</strong><span>Meals served</span></li>
        <li><strong>{tot.attendancePct ?? 0}%</strong><span>Turn-out (taken of taken + skipped)</span></li>
        <li><strong>{rupees(tot.expenses ?? 0)}</strong><span>Expenses</span></li>
        <li><strong>{tot.costPerMeal != null ? rupees(tot.costPerMeal) : '—'}</strong><span>Cost per meal served</span></li>
      </ul>

      <div className="hs-grid hs-grid--2">
        <Card busy={loading} label="Expenses over six months">
          <CardHead icon="rupee" tone="amber" title="Expenses — last 6 months" />
          <Columns data={trend} series={[{ key: 'expenses', label: 'Expenses', color: '#4f46e5' }]} height={170} tick={compact} tip={rupees}
            label={`Mess expenses for the six months to ${monthLabel(data?.month || q.month)}`} />
        </Card>
        <Card busy={loading} label="Spend by category">
          <CardHead icon="tag" tone="violet" title={`Spend by category — ${monthLabel(data?.month || q.month)}`} />
          {cats.length ? (
            <div className="hs-occ__main">
              <Donut slices={cats.map((c) => ({ key: c.category, value: c.total, color: CAT_COLOR[c.category] || '#94a3b8' }))} label="Spend by category">
                <strong>{compact(tot.expenses ?? 0)}</strong><span>Spent</span>
              </Donut>
              <Legend rows={cats.map((c) => ({ label: words(c.category), value: Math.round(c.total), color: CAT_COLOR[c.category] || '#94a3b8' }))} />
            </div>
          ) : <EmptyRows icon="rupee" title="Nothing spent this month" />}
        </Card>
      </div>

      <ListCard head={<h3>By mess — {monthLabel(data?.month || q.month)}</h3>} className="hs-lcard--report">
        <DataTable select={false} loading={loading} rows={data?.messes || []} pad={11} headPad={12} dense
          columns={[
            { key: 'name', label: 'Mess', render: (r) => <strong>{r.name}</strong> },
            { key: 'members', label: 'Members', render: (r) => (r.capacity ? `${r.members} / ${r.capacity}` : r.members) },
            { key: 'meals', label: 'Meals Served', render: (r) => count(r.meals) },
            { key: 'skipped', label: 'Skipped', render: (r) => count(r.skipped) },
            { key: 'leave', label: 'On Leave', render: (r) => count(r.onLeave) },
            { key: 'att', label: 'Turn-out', render: (r) => (r.served + r.skipped ? `${r.attendancePct}%` : '—') },
            { key: 'exp', label: 'Expenses', align: 'right', render: (r) => rupees(r.expenses) },
            { key: 'cpm', label: 'Cost / Meal', align: 'right', render: (r) => (r.costPerMeal != null ? rupees(r.costPerMeal) : '—') },
          ]}
          empty={<EmptyRows icon="cutlery" title="No mess to report on" />} />
      </ListCard>

      <Card label="Food preferences" className="hs-prefcard">
        <CardHead icon="crowd" tone="sky" title={`Food preferences — ${count(members)} active member${members === 1 ? '' : 's'}`} />
        {prefs.length ? (
          <ul className="hs-prefs">
            {prefs.map((p) => {
              const [text] = PREF[p.foodPreference] || [words(p.foodPreference)];
              const pct = members ? Math.round((p.n / members) * 100) : 0;
              return <li key={p.foodPreference}><span>{text}</span><span className="hs-bar"><i style={{ '--pct': `${pct}%`, '--bar': '#4f46e5' }} /></span><b>{p.n} · {pct}%</b></li>;
            })}
          </ul>
        ) : <p className="hs-muted">Nobody is enrolled yet.</p>}
      </Card>
    </>
  );
}
