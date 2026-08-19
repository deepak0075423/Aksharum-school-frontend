import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import {
  PageHeader, Table, Button, Modal, Badge, Confirm, Card, Empty, Spinner, Alert, Pagination,
} from '../../../components/ui/index';
import { StatusBadge, Filters, label, dd, money, today, di } from '../shared';

const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner', 'special'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PREFS = ['veg', 'non_veg', 'vegan', 'jain', 'eggetarian', 'other'];
const EXPENSE_CATS = ['groceries', 'vegetables', 'dairy', 'gas', 'vendor_bill', 'salary', 'equipment', 'other'];

const emptyMess = {
  name: '', code: '', messType: 'both', capacity: '', location: '', inCharge: '', hostels: [],
  vendorName: '', vendorContact: '', vendorEmail: '', contractFrom: '', contractTo: '', contractAmount: '',
};
const emptyMember = { student: '', mess: '', foodPreference: 'veg', allergies: '', dietaryNotes: '', mealPlan: 'full' };
const emptyExpense = { mess: '', category: 'groceries', description: '', amount: '', vendorName: '', invoiceNumber: '', date: today() };

export default function Mess() {
  const [tab, setTab] = useState('messes');
  const [messes, setMesses] = useState([]);
  const [loading, setLoad] = useState(true);
  const [mess, setMess] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyMess);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);

  const [members, setMembers] = useState({ rows: [], page: 1, pages: 1, total: 0 });
  const [menus, setMenus] = useState([]);
  const [menuMode, setMenuMode] = useState('week');       // week (template) | dates
  const [menuRange, setMenuRange] = useState({ from: today(), to: di(new Date(Date.now() + 6 * 864e5)) });
  const [expenses, setExpenses] = useState({ rows: [], byCategory: [], total: 0 });
  const [attendance, setAttendance] = useState(null);
  const [attQ, setAttQ] = useState({ date: today(), meal: 'lunch' });
  const [attMarks, setAttMarks] = useState({});
  const [residents, setResidents] = useState([]);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const staff = meta?.staff || [];

  const loadMesses = useCallback(async () => {
    setLoad(true);
    try {
      const r = await api.getMesses();
      const d = r.data ?? r;
      setMesses(d);
      if (!mess && d.length) setMess(d[0]._id);
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [mess]);
  useEffect(() => { loadMesses(); }, []); // eslint-disable-line

  const loadMembers = useCallback(async (page = 1) => {
    if (!mess) return;
    try {
      const r = await api.getMessMembers({ mess, page, limit: 25 });
      const d = r.data ?? r;
      setMembers({ rows: d.data || [], page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); }
  }, [mess]);

  const loadMenus = useCallback(async () => {
    if (!mess) return;
    try {
      const r = menuMode === 'week'
        ? await api.getMenus({ mess, isTemplate: 'true' })
        : await api.getMenus({ mess, from: menuRange.from, to: menuRange.to });
      setMenus(r.data ?? r);
    } catch (err) { toast.error(err.message); }
  }, [mess, menuMode, menuRange]);

  const loadExpenses = useCallback(async () => {
    if (!mess) return;
    try {
      const r = await api.getMessExpenses({ mess, limit: 50 });
      const d = r.data ?? r;
      setExpenses({ rows: d.data || [], byCategory: d.byCategory || [], total: d.total });
    } catch (err) { toast.error(err.message); }
  }, [mess]);

  const loadAttendance = useCallback(async () => {
    if (!mess) return;
    try {
      const r = await api.getMessAttendance({ mess, ...attQ });
      const d = r.data ?? r;
      setAttendance(d);
      setAttMarks(Object.fromEntries(d.rows.map((x) => [
        String(x.student?._id || x.student), x.meals?.[attQ.meal]?.status || 'taken',
      ])));
    } catch (err) { toast.error(err.message); }
  }, [mess, attQ]);

  useEffect(() => {
    if (tab === 'members') loadMembers(1);
    if (tab === 'menu') loadMenus();
    if (tab === 'expenses') loadExpenses();
    if (tab === 'attendance') loadAttendance();
  }, [tab, loadMembers, loadMenus, loadExpenses, loadAttendance]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openMess = (row) => {
    setModal('mess');
    if (row) {
      setEditId(row._id);
      setForm({
        ...emptyMess, ...row,
        inCharge: row.inCharge?._id || row.inCharge || '',
        hostels: (row.hostels || []).map(String),
        contractFrom: di(row.contractFrom), contractTo: di(row.contractTo),
      });
    } else { setEditId(null); setForm(emptyMess); }
  };

  const openMember = async () => {
    setModal('member'); setEditId(null);
    setForm({ ...emptyMember, mess });
    try {
      const r = await api.getAllocations({ status: 'active', limit: 300 });
      setResidents((r.data ?? r).data || []);
    } catch { setResidents([]); }
  };

  const openMenu = (row, meal, dayOrDate) => {
    setModal('menu');
    setEditId(row?._id || null);
    setForm(row
      ? { ...row, items: (row.items || []).join(', ') }
      : {
        mess, meal, items: '', description: '', isSpecial: false, specialOccasion: '', estimatedCost: '',
        isTemplate: menuMode === 'week',
        dayOfWeek: menuMode === 'week' ? dayOrDate : null,
        date: menuMode === 'week' ? null : dayOrDate,
      });
  };

  const openExpense = () => { setModal('expense'); setEditId(null); setForm({ ...emptyExpense, mess }); };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (modal === 'mess') {
        const p = { ...form, capacity: Number(form.capacity) || 0, contractAmount: Number(form.contractAmount) || 0, inCharge: form.inCharge || null };
        if (editId) await api.updateMess(editId, p); else await api.createMess(p);
      } else if (modal === 'member') {
        const p = { ...form, allergies: String(form.allergies).split(',').map((s) => s.trim()).filter(Boolean) };
        if (editId) await api.updateMessMember(editId, p); else await api.enrolMessMember(p);
      } else if (modal === 'menu') {
        await api.saveMenu({ ...form, items: String(form.items).split(',').map((s) => s.trim()).filter(Boolean), estimatedCost: Number(form.estimatedCost) || 0 });
      } else if (modal === 'expense') {
        await api.createMessExpense({ ...form, amount: Number(form.amount) || 0 });
      }
      toast.success('Saved');
      setModal(null);
      if (modal === 'mess') loadMesses();
      if (modal === 'member') loadMembers(members.page);
      if (modal === 'menu') loadMenus();
      if (modal === 'expense') loadExpenses();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const remove = async () => {
    try {
      if (del.kind === 'mess') await api.deleteMess(del.row._id);
      if (del.kind === 'menu') await api.deleteMenu(del.row._id);
      if (del.kind === 'expense') await api.deleteMessExpense(del.row._id);
      toast.success('Removed'); setDel(null);
      if (del.kind === 'mess') loadMesses();
      if (del.kind === 'menu') loadMenus();
      if (del.kind === 'expense') loadExpenses();
    } catch (err) { toast.error(err.message); setDel(null); }
  };

  const generateWeek = async () => {
    try {
      const r = await api.generateMenus({ mess, from: menuRange.from, to: menuRange.to, overwrite: false });
      const d = r.data ?? r;
      toast.success(`${d.created} menu entries generated, ${d.skipped} already existed`);
      setMenuMode('dates'); loadMenus();
    } catch (err) { toast.error(err.message); }
  };

  const submitMessAttendance = async () => {
    try {
      const records = Object.entries(attMarks).map(([student, status]) => ({ student, status }));
      const r = await api.markMessAttendance({ mess, ...attQ, records });
      const d = r.data ?? r;
      toast.success(`${d.created} marked, ${d.updated} updated`);
      loadAttendance();
    } catch (err) { toast.error(err.message); }
  };

  const messColumns = [
    { key: 'name', label: 'Mess', render: (r) => (
      <div><strong>{r.name}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.code} · {label(r.messType)}</div></div>
    ) },
    { key: 'hostels', label: 'Serves', render: (r) => (r.hostelNames || []).join(', ') || <span className="text-muted">—</span> },
    { key: 'members', label: 'Enrolled', render: (r) => <Badge variant="info">{r.memberCount || 0}</Badge> },
    { key: 'vendor', label: 'Vendor', render: (r) => r.vendorName || <span className="text-muted">in-house</span> },
    { key: 'incharge', label: 'In charge', render: (r) => r.inCharge?.name || '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'a', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => openMess(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel({ kind: 'mess', row: r })}>Deactivate</Button>
      </div>
    ) },
  ];

  const memberColumns = [
    { key: 'student', label: 'Student', render: (r) => r.student?.name || '—' },
    { key: 'pref', label: 'Preference', render: (r) => <Badge variant="muted">{label(r.foodPreference)}</Badge> },
    { key: 'allergies', label: 'Allergies', render: (r) => r.allergies?.length
      ? <span style={{ fontSize: '.8rem', color: '#b91c1c' }}>{r.allergies.join(', ')}</span>
      : <span className="text-muted">none</span> },
    { key: 'plan', label: 'Plan', render: (r) => label(r.mealPlan) },
    { key: 'from', label: 'Since', render: (r) => dd(r.fromDate) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
  ];

  const expenseColumns = [
    { key: 'date', label: 'Date', render: (r) => dd(r.date) },
    { key: 'category', label: 'Category', render: (r) => <Badge variant="muted">{label(r.category)}</Badge> },
    { key: 'desc', label: 'Description', render: (r) => r.description || '—' },
    { key: 'vendor', label: 'Vendor', render: (r) => r.vendorName || '—' },
    { key: 'amount', label: 'Amount', render: (r) => <strong>{money(r.amount)}</strong> },
    { key: 'a', label: '', render: (r) => <Button size="sm" variant="danger" onClick={() => setDel({ kind: 'expense', row: r })}>Delete</Button> },
  ];

  const menuFor = (meal, key) => menus.find((m) => m.meal === meal && (menuMode === 'week' ? m.dayOfWeek === key : di(m.date) === key));

  const dateColumns = () => {
    const out = [];
    for (let d = new Date(menuRange.from); d <= new Date(menuRange.to) && out.length < 31; d.setDate(d.getDate() + 1)) {
      out.push(di(new Date(d)));
    }
    return out;
  };

  return (
    <div className="page">
      <PageHeader title="Mess Management" subtitle="Setup, enrolment, menus, meal attendance and running costs"
        action={<Button onClick={() => openMess()}>+ Add Mess</Button>} />

      <div className="tabs">
        {['messes', 'members', 'menu', 'attendance', 'expenses'].map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{label(t)}</button>
        ))}
      </div>

      {tab !== 'messes' && (
        <Filters>
          <select className="form-control" style={{ maxWidth: 240 }} value={mess} onChange={(e) => setMess(e.target.value)}>
            {messes.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
          </select>
          {tab === 'menu' && <>
            <select className="form-control" style={{ maxWidth: 200 }} value={menuMode} onChange={(e) => setMenuMode(e.target.value)}>
              <option value="week">Weekly template</option>
              <option value="dates">Dated menus</option>
            </select>
            {menuMode === 'dates' && <>
              <input className="form-control" style={{ maxWidth: 160 }} type="date" value={menuRange.from} onChange={(e) => setMenuRange((r) => ({ ...r, from: e.target.value }))} />
              <input className="form-control" style={{ maxWidth: 160 }} type="date" value={menuRange.to} onChange={(e) => setMenuRange((r) => ({ ...r, to: e.target.value }))} />
              <Button size="sm" variant="secondary" onClick={generateWeek}>Generate from template</Button>
            </>}
          </>}
          {tab === 'attendance' && <>
            <input className="form-control" style={{ maxWidth: 160 }} type="date" value={attQ.date} onChange={(e) => setAttQ((q) => ({ ...q, date: e.target.value }))} />
            <select className="form-control" style={{ maxWidth: 150 }} value={attQ.meal} onChange={(e) => setAttQ((q) => ({ ...q, meal: e.target.value }))}>
              {MEALS.map((m) => <option key={m} value={m}>{label(m)}</option>)}
            </select>
          </>}
          {tab === 'members' && <Button size="sm" onClick={openMember}>+ Enrol student</Button>}
          {tab === 'expenses' && <Button size="sm" onClick={openExpense}>+ Record expense</Button>}
        </Filters>
      )}

      {tab === 'messes' && (
        <div className="card"><div className="card-body" style={{ padding: 0 }}>
          <Table columns={messColumns} data={messes} loading={loading} emptyIcon="🍽" emptyTitle="No mess set up yet" />
        </div></div>
      )}

      {tab === 'members' && <>
        <div className="card"><div className="card-body" style={{ padding: 0 }}>
          <Table columns={memberColumns} data={members.rows} emptyIcon="🧑‍🍳" emptyTitle="Nobody enrolled yet" />
        </div></div>
        <Pagination page={members.page} pages={members.pages} total={members.total} onPage={loadMembers} />
      </>}

      {tab === 'menu' && (
        <div className="card"><div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Meal</th>{(menuMode === 'week' ? DAYS.map((d, i) => [i, d]) : dateColumns().map((d) => [d, new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })])).map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
            <tbody>
              {MEALS.filter((m) => m !== 'special').map((meal) => (
                <tr key={meal}>
                  <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{meal}</td>
                  {(menuMode === 'week' ? DAYS.map((_, i) => i) : dateColumns()).map((k) => {
                    const m = menuFor(meal, k);
                    return (
                      <td key={k} style={{ minWidth: 140, verticalAlign: 'top' }}>
                        <button type="button" onClick={() => openMenu(m, meal, k)}
                          style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, fontFamily: 'inherit', width: '100%' }}>
                          {m?.items?.length
                            ? <span style={{ fontSize: '.78rem' }}>{m.items.join(', ')}</span>
                            : <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>+ add</span>}
                        </button>
                        {m && <div style={{ marginTop: 4 }}>
                          <button type="button" onClick={() => setDel({ kind: 'menu', row: m })}
                            style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '.68rem', cursor: 'pointer', padding: 0 }}>remove</button>
                        </div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}

      {tab === 'attendance' && (
        attendance?.rows?.length ? <>
          <div className="card"><div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th>Preference</th><th>Allergies</th><th>{label(attQ.meal)}</th></tr></thead>
                <tbody>
                  {attendance.rows.map((r) => {
                    const sid = String(r.student?._id || r.student);
                    return (
                      <tr key={sid}>
                        <td><strong>{r.student?.name}</strong></td>
                        <td><Badge variant="muted">{label(r.foodPreference)}</Badge></td>
                        <td>{r.allergies?.length ? <span style={{ fontSize: '.78rem', color: '#b91c1c' }}>{r.allergies.join(', ')}</span> : <span className="text-muted">—</span>}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {['taken', 'skipped', 'on_leave'].map((s) => (
                              <button key={s} type="button" onClick={() => setAttMarks((m) => ({ ...m, [sid]: s }))}
                                className={`btn btn-sm ${attMarks[sid] === s ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '3px 9px', fontSize: '.74rem' }}>{label(s)}</button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <Button onClick={submitMessAttendance}>Save meal attendance</Button>
          </div>
        </> : <Empty icon="🍽" title="Nobody enrolled" message="Enrol students in this mess first." />
      )}

      {tab === 'expenses' && <>
        {!!expenses.byCategory?.length && (
          <div className="stats-grid" style={{ gap: 10, marginBottom: 14 }}>
            {expenses.byCategory.map((c) => (
              <div key={c.label} className="card" style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{money(c.value)}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{label(c.label)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="card"><div className="card-body" style={{ padding: 0 }}>
          <Table columns={expenseColumns} data={expenses.rows} emptyIcon="🧾" emptyTitle="No expenses recorded" />
        </div></div>
      </>}

      {/* ── Forms ─────────────────────────────────────────────────────────── */}
      <Modal open={!!modal} onClose={() => setModal(null)} maxWidth={modal === 'mess' ? 720 : 560}
        title={{ mess: editId ? 'Edit Mess' : 'Add Mess', member: 'Enrol Student', menu: 'Menu', expense: 'Record Expense' }[modal] || ''}
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button form="mess-form" type="submit" loading={saving}>Save</Button></>}>
        <form id="mess-form" onSubmit={save}>
          {modal === 'mess' && <>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label required">Name</label>
                <input className="form-control" required value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Code</label>
                <input className="form-control" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="auto (MS-…)" />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-control" value={form.messType} onChange={(e) => set('messType', e.target.value)}>
                  <option value="veg">Vegetarian</option><option value="non_veg">Non-vegetarian</option><option value="both">Both</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Serves hostels</label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {hostels.map((h) => (
                  <label key={h._id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '.85rem' }}>
                    <input type="checkbox" checked={form.hostels.includes(h._id)}
                      onChange={(e) => set('hostels', e.target.checked ? [...form.hostels, h._id] : form.hostels.filter((x) => x !== h._id))} />
                    {h.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Capacity</label>
                <input className="form-control" type="number" min="0" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Location</label>
                <input className="form-control" value={form.location} onChange={(e) => set('location', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">In charge</label>
                <select className="form-control" value={form.inCharge} onChange={(e) => set('inCharge', e.target.value)}>
                  <option value="">— none —</option>
                  {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Vendor</label>
                <input className="form-control" value={form.vendorName} onChange={(e) => set('vendorName', e.target.value)} placeholder="blank = in-house" />
              </div>
              <div className="form-group">
                <label className="form-label">Vendor Contact</label>
                <input className="form-control" value={form.vendorContact} onChange={(e) => set('vendorContact', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Contract Amount</label>
                <input className="form-control" type="number" min="0" value={form.contractAmount} onChange={(e) => set('contractAmount', e.target.value)} />
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Contract From</label>
                <input className="form-control" type="date" value={form.contractFrom} onChange={(e) => set('contractFrom', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Contract To</label>
                <input className="form-control" type="date" value={form.contractTo} onChange={(e) => set('contractTo', e.target.value)} />
              </div>
            </div>
          </>}

          {modal === 'member' && <>
            <Alert variant="info">Allergy information here is what the kitchen needs day to day; the student's clinical record stays on their profile.</Alert>
            <div className="form-group" style={{ marginTop: 14 }}>
              <label className="form-label required">Student</label>
              <select className="form-control" required value={form.student} onChange={(e) => set('student', e.target.value)}>
                <option value="">— select a resident —</option>
                {residents.map((a) => (
                  <option key={a._id} value={a.student?._id || a.student}>{a.student?.name} · Room {a.room?.roomNumber}</option>
                ))}
              </select>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Food Preference</label>
                <select className="form-control" value={form.foodPreference} onChange={(e) => set('foodPreference', e.target.value)}>
                  {PREFS.map((p) => <option key={p} value={p}>{label(p)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Meal Plan</label>
                <select className="form-control" value={form.mealPlan} onChange={(e) => set('mealPlan', e.target.value)}>
                  <option value="full">All meals</option><option value="breakfast_only">Breakfast only</option>
                  <option value="lunch_dinner">Lunch & dinner</option><option value="custom">Custom</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Allergies</label>
              <input className="form-control" value={form.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="peanuts, shellfish" />
            </div>
            <div className="form-group">
              <label className="form-label">Dietary Notes</label>
              <textarea className="form-control" rows={2} value={form.dietaryNotes} onChange={(e) => set('dietaryNotes', e.target.value)} />
            </div>
          </>}

          {modal === 'menu' && <>
            <div className="form-group">
              <label className="form-label">Items</label>
              <input className="form-control" value={form.items} onChange={(e) => set('items', e.target.value)}
                placeholder="poha, boiled egg, tea" autoFocus />
              <div className="form-hint">Comma separated</div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Estimated cost per head</label>
                <input className="form-control" type="number" min="0" value={form.estimatedCost} onChange={(e) => set('estimatedCost', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Special occasion</label>
                <input className="form-control" value={form.specialOccasion} onChange={(e) => set('specialOccasion', e.target.value)} placeholder="Diwali dinner" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-control" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
          </>}

          {modal === 'expense' && <>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-control" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-control" value={form.category} onChange={(e) => set('category', e.target.value)}>
                  {EXPENSE_CATS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label required">Amount</label>
                <input className="form-control" type="number" min="0" required value={form.amount} onChange={(e) => set('amount', e.target.value)} />
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Vendor</label>
                <input className="form-control" value={form.vendorName} onChange={(e) => set('vendorName', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Invoice No.</label>
                <input className="form-control" value={form.invoiceNumber} onChange={(e) => set('invoiceNumber', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-control" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
          </>}
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        title={`Remove ${del?.kind}`} message="This cannot be undone." />
    </div>
  );
}
