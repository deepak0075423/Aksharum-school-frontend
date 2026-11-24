/**
 * Employee Directory → Departments.
 *
 * Built on the frame its sibling screens use (employeeParts.jsx): crumbs, a
 * header, tiles that double as the filter, one card holding the toolbar and the
 * body, then the closing panel.
 *
 * Departments are the distinct values already stored on the employee records —
 * there is no department master table, so there is nothing here to create or
 * rename directly. What the page offers instead is everything derived from that
 * grouping: how big each one is, who is in it, whether it is teaching or
 * support, and the employees who are not in one yet.
 *
 * Everything arrives in a single call, so search, sorting and paging are local.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getDepartments, getMeta, createDepartment, updateDepartment, moveDepartment, removeDepartment,
} from '../../api/employeeDirectory.api';
import { Button, Confirm, Empty, Modal, Select } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { Chips, ErrorState, SkeletonCards, useDirectoryBase } from './parts';
import {
  Crumbs, ListFoot, MenuItem, MenuSep, PageTop, Pick, RowMenu, SearchBox, StatTile, ViewToggle, useShownView,
} from './employeeParts';
import {
  DepartmentCard, HowPanel, Members, StaffMix, TypeChip, UNASSIGNED, summarise, typeOf,
} from './departmentParts';

const VIEW_KEY   = 'employeeDirectory.departments.view';
const PAGE_SIZES = [12, 24, 48, 96];

const SORTS = [
  { value: 'size',  label: 'Largest first' },
  { value: 'small', label: 'Smallest first' },
  { value: 'name',  label: 'Name (A–Z)' },
  { value: 'teach', label: 'Most teaching staff' },
];

const TYPES = [
  { value: 'teaching', label: 'Teaching only' },
  { value: 'support',  label: 'Non-teaching only' },
  { value: 'mixed',    label: 'Mixed' },
];

const readView = () => {
  try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'card'; } catch { return 'card'; }
};

export default function Departments() {
  const { base } = useDirectoryBase();
  const { data, loading, error, refetch } = useFetch(getDepartments, []);

  const [search, setSearch] = useState('');
  const [type,   setType]   = useState('');
  const [sort,   setSort]   = useState('size');
  const [view,   setView]   = useState(readView);
  // A phone always gets the cards (no Grid / List switch there).
  const shownView = useShownView(view);
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(12);
  const [open,   setOpen]   = useState('');   // the department listing its members
  // The dialog in front: { mode: 'add' | 'edit' | 'move', department }.
  const [dialog, setDialog] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: meta } = useFetch(getMeta, []);
  const done = () => { setDialog(null); setRemoving(null); refetch(); };
  const remove = async () => {
    setBusy(true);
    try {
      await removeDepartment(removing._id);
      toast.success(`${removing.name} removed from the list`);
      done();
    } catch (err) { toast.error(err.message || 'Could not remove it'); }
    finally { setBusy(false); }
  };
  const addButton = (
    <button type="button" className="btn btn-primary" onClick={() => setDialog({ mode: 'add' })}>
      <Icon name="plus" size={16} /> Add department
    </button>
  );

  const list  = useMemo(() => data?.departments || [], [data]);
  const stats = useMemo(() => summarise(list), [list]);

  const setLayout = (v) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ }
  };

  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const out = list.filter((d) => {
      if (type && typeOf(d) !== type) return false;
      if (term && !`${d.name} ${d.designations.join(' ')}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const byName = (a, b) => a.name.localeCompare(b.name);
    // "Unassigned" is the gap, not a department — it sorts last whatever the
    // order, so a real department is always the first thing read.
    const gapLast = (a, b) => (a.name === UNASSIGNED ? 1 : b.name === UNASSIGNED ? -1 : 0);
    return out.sort((a, b) => gapLast(a, b) || (() => {
      switch (sort) {
        case 'small': return a.total - b.total || byName(a, b);
        case 'name':  return byName(a, b);
        case 'teach': return b.teaching - a.teaching || byName(a, b);
        default:      return b.total - a.total || byName(a, b);
      }
    })());
  }, [list, term, type, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / limit));
  const start = (Math.min(page, pages) - 1) * limit;
  const shown = filtered.slice(start, start + limit);
  const anyFilter = !!term || !!type;
  const clearAll = () => { setSearch(''); setType(''); setPage(1); };
  const pick = (v) => { setType(type === v ? '' : v); setPage(1); };

  if (loading && !data) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Departments" />
        <PageTop title="Departments" subtitle="Grouped from the department on each employee record." />
        <SkeletonCards count={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Departments" />
        <PageTop title="Departments" />
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  if (!list.length) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Departments" />
        <PageTop title="Departments">{addButton}</PageTop>
        <Empty icon="🏢" title="No departments yet"
          message="Add the school's departments here, then place staff in them from the employee list." />
        <DepartmentDialog dialog={dialog} departments={list} managers={meta?.filters?.managers || []}
          onClose={() => setDialog(null)} onDone={done} />
      </div>
    );
  }

  return (
    <div className="page edl">
      <Crumbs base={base} here="Departments" />

      <PageTop
        title="Departments"
        subtitle="The school's departments, who heads each one, and who is in it.">
        {addButton}
        <Link className="btn btn-secondary" to={`${base}/employees`}>
          <Icon name="users" size={16} /> All employees
        </Link>
        {stats.unassigned > 0 && (
          <Link className="btn btn-secondary" to={`${base}/employees?department=Unassigned&accountStatus=all`}>
            <Icon name="userPlus" size={16} /> Place {stats.unassigned} unassigned
          </Link>
        )}
      </PageTop>

      {/* Each tile is the filter it names; the last is the gap, and it links
          rather than filters because the answer is not on this page. */}
      <div className="edl-stats">
        <StatTile icon={<Icon name="building" size={22} />} tone="indigo" value={stats.departments}
          label="Departments" caption={stats.largest ? `Largest: ${stats.largest.name}` : 'None yet'}
          on={!type} onClick={() => { setType(''); setPage(1); }} />
        <StatTile icon={<Icon name="teacher" size={22} />} tone="blue" value={stats.teaching}
          label="Teaching" caption="Only teaching staff in them"
          on={type === 'teaching'} onClick={() => pick('teaching')} />
        <StatTile icon={<Icon name="badge" size={22} />} tone="teal" value={stats.support}
          label="Non-teaching" caption="Only support staff in them"
          on={type === 'support'} onClick={() => pick('support')} />
        {/* Everyone the departments add up to, inactive included — the list
            is told so, or it would open on active staff only. */}
        <StatTile icon={<Icon name="users" size={22} />} tone="amber" value={stats.employees}
          label="Employees" captionTone={stats.unassigned ? 'down' : undefined}
          caption={stats.unassigned
            ? `${stats.unassigned} without a department`
            : 'Every one of them placed'}
          to={`${base}/employees?accountStatus=all`} />
      </div>

      <section className="card edl-card-wrap">
        <div className="edl-bar">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search departments or the designations in them…" />
          <Pick value={type} onChange={(v) => { setType(v); setPage(1); }}
            all="All types" label="Filter by staff type" options={TYPES} />
          <Pick value={sort} onChange={(v) => { setSort(v); setPage(1); }}
            label="Sort departments" options={SORTS} defaultValue="size" />
          <ViewToggle value={view} onChange={setLayout} />
        </div>

        <div className="edl-results">
          <span className="edl-results__count">
            {filtered.length} of {list.length} {list.length === 1 ? 'group' : 'groups'}
            {anyFilter ? ' matching' : ''}
          </span>
          {anyFilter && (
            <div className="edl-results__right">
              <button type="button" className="edl-hint__btn" onClick={clearAll}>Clear filters</button>
            </div>
          )}
        </div>

        <div className="edl-body">
          {shown.length === 0
            ? (
              <Empty icon="🔍" title="No departments match"
                message="Try another staff type or search term." />
            )
            : shownView === 'card'
              ? (
                <div className="depgrid">
                  {shown.map((d) => (
                    <DepartmentCard key={d.name} department={d} base={base}
                      open={open === d.name} onToggle={(n) => setOpen(open === n ? '' : n)}
                      onManage={(x) => setDialog({ mode: 'edit', department: x })} />
                  ))}
                </div>
              )
              : (
                <div className="table-wrap">
                  <table className="table edl-table">
                    <thead>
                      <tr>
                        <th className="depcol-num">#</th>
                        <th>Department</th>
                        <th className="depcol-type">Type</th>
                        <th className="depcol-mix">Staff mix</th>
                        <th className="depcol-n">People</th>
                        <th className="depcol-n">Active</th>
                        <th>Designations</th>
                        <th className="edl-table__acts">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((d, i) => (
                        <React.Fragment key={d.name}>
                          <tr className={d.name === UNASSIGNED ? 'deprow--gap' : undefined}>
                            <td className="depcol-num">{start + i + 1}</td>
                            <td>
                              <div className="depname">
                                <Icon name={d.name === UNASSIGNED ? 'alert' : 'building'} size={15} />
                                <b>{d.name}</b>
                                {d.name !== UNASSIGNED && d.listed === false && (
                                  <span className="badge badge-warning" style={{ marginLeft: 6 }}
                                    title="Typed on a staff record, but not on the school's list of departments">Not on the list</span>
                                )}
                              </div>
                              {d.head && <div className="ed-sub">Head: {d.head.name}{d.head.inactive ? ' (deactivated)' : ''}</div>}
                            </td>
                            <td className="depcol-type">{d.total > 0 ? <TypeChip type={typeOf(d)} /> : <span className="ed-none">Empty</span>}</td>
                            <td className="depcol-mix"><StaffMix department={d} /></td>
                            <td className="depcol-n"><b>{d.total}</b></td>
                            <td className="depcol-n">{d.active}</td>
                            <td><Chips items={d.designations} max={2} empty="—" /></td>
                            <td className="edl-table__acts">
                              <div className="edl-rowacts">
                                {/* Everyone the row counts, deactivated accounts included. */}
                                <Link className="btn btn-secondary btn-sm"
                                  to={`${base}/employees?department=${encodeURIComponent(d.name)}&accountStatus=all`}>
                                  View
                                </Link>
                                <RowMenu>
                                  {d.members.length > 0 && (
                                    <MenuItem icon="users" onClick={() => setOpen(open === d.name ? '' : d.name)}>
                                      {open === d.name ? 'Hide members' : `List ${d.members.length} member${d.members.length === 1 ? '' : 's'}`}
                                    </MenuItem>
                                  )}
                                  {/* No "Open in directory": the View button beside it is that. */}
                                  {d.name !== UNASSIGNED && d.members.length > 0 && <MenuSep />}
                                  {d.name !== UNASSIGNED && (
                                    <MenuItem icon="pencil" onClick={() => setDialog({ mode: 'edit', department: d })}>
                                      {d._id ? 'Rename, head & description' : 'Add it to the list'}
                                    </MenuItem>
                                  )}
                                  {d.total > 0 && (
                                    <MenuItem icon="users" onClick={() => setDialog({ mode: 'move', department: d })}>
                                      Move its staff to another…
                                    </MenuItem>
                                  )}
                                  {d._id && d.total === 0 && (
                                    <MenuItem icon="trash" danger onClick={() => setRemoving(d)}>Remove from the list</MenuItem>
                                  )}
                                </RowMenu>
                              </div>
                            </td>
                          </tr>
                          {open === d.name && (
                            <tr className="deprow--members">
                              <td colSpan={8}><Members members={d.members} base={base} /></td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </div>

        <ListFoot
          page={Math.min(page, pages)} pages={pages} total={filtered.length}
          limit={limit} count={shown.length} noun="department"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} sizes={PAGE_SIZES}
        />
      </section>

      <HowPanel base={base} unassigned={stats.unassigned} />

      <DepartmentDialog dialog={dialog} departments={list} managers={meta?.filters?.managers || []}
        onClose={() => setDialog(null)} onDone={done}
        onMove={(d) => setDialog({ mode: 'move', department: d })}
        onRemove={(d) => { setDialog(null); setRemoving(d); }} />
      <Confirm open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} loading={busy}
        title="Remove this department?" confirmLabel="Remove"
        message={`${removing?.name || ''} has nobody in it, and will be taken off the school's list.`} />
    </div>
  );
}

/**
 * Add a department, change one (its name, head and description), or move its
 * staff into another. A rename is carried onto everyone in it by the server;
 * a move is how two spellings of one department become one.
 */
function DepartmentDialog({ dialog, departments, managers, onClose, onDone, onMove, onRemove }) {
  const [form, setForm] = useState({ name: '', description: '', head: '' });
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const d = dialog?.department;
  useEffect(() => {
    if (!dialog) return;
    setForm({ name: d?.name || '', description: d?.description || '', head: d?.head?._id || '' });
    setTo('');
  }, [dialog]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!dialog) return null;
  const put = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));

  if (dialog.mode === 'move') {
    const others = departments.filter((x) => x.name !== d.name && x.name !== UNASSIGNED);
    const move = async () => {
      setBusy(true);
      try {
        const res = await moveDepartment({ from: d.name, to: to || 'Unassigned' });
        const out = res?.data ?? res;
        toast.success(`${out.moved} ${out.moved === 1 ? 'person' : 'people'} moved to ${out.to}`);
        onDone();
      } catch (err) { toast.error(err.message || 'Could not move them'); }
      finally { setBusy(false); }
    };
    return (
      <Modal open onClose={busy ? () => {} : onClose} title={`Move everyone out of ${d.name}`}
        footer={<>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button loading={busy} onClick={move}>Move {d.total} {d.total === 1 ? 'person' : 'people'}</Button>
        </>}>
        <Select label="Move them to" value={to} onChange={(ev) => setTo(ev.target.value)}>
          <option value="">No department (unassigned)</option>
          {others.map((x) => <option key={x.name} value={x.name}>{x.name} · {x.total} now</option>)}
        </Select>
        <p className="form-hint" style={{ marginTop: 10 }}>
          All {d.total} {d.total === 1 ? 'person' : 'people'} in {d.name} — deactivated accounts included — take the new
          department on their record, and {d.name} is taken off the list. Use this to merge two spellings of one department.
        </p>
      </Modal>
    );
  }

  const adding = dialog.mode === 'add' || !d?._id;
  const save = async () => {
    if (!form.name.trim()) { toast.error('Give the department a name'); return; }
    setBusy(true);
    try {
      if (adding) await createDepartment(form);
      else await updateDepartment(d._id, form);
      toast.success(adding ? `${form.name.trim()} is on the list` : 'Department updated');
      onDone();
    } catch (err) { toast.error(err.message || 'Could not save'); }
    finally { setBusy(false); }
  };
  const renaming = !adding && form.name.trim() && form.name.trim() !== d.name;

  // A department's head is one of its own staff (Nov 24 2026) — not anyone in
  // the school. The department's members come with the row; a brand-new name
  // is matched against a department already typed on somebody's record. Only
  // live accounts, as everywhere a head is picked; the server checks too.
  const low = (s) => String(s || '').trim().toLowerCase();
  const crew = d
    ? d.members || []
    : departments.find((x) => x.name !== UNASSIGNED && low(x.name) === low(form.name))?.members || [];
  const crewIds = new Set(crew.filter((m) => m.isActive !== false).map((m) => String(m._id)));
  const heads = managers.filter((m) => crewIds.has(String(m._id)));
  const deptName = form.name.trim() || d?.name || 'this department';
  // A head chosen before this rule who is not in the department (or has since
  // been switched off) stays shown while they hold it; they cannot be picked again.
  const keptHead = form.head && !heads.some((m) => String(m._id) === String(form.head))
    ? `${d?.head?.name || 'Current head'} (${d?.head?.inactive ? 'deactivated' : `not in ${deptName}`})`
    : null;
  return (
    <Modal open onClose={busy ? () => {} : onClose}
      title={dialog.mode === 'add' ? 'Add a department' : adding ? `Add ${d.name} to the list` : `Manage ${d.name}`}
      footer={<>
        {!adding && d.total > 0 && onMove && (
          <Button variant="secondary" onClick={() => onMove(d)} disabled={busy}>Move its staff…</Button>
        )}
        {!adding && d.total === 0 && onRemove && (
          <Button variant="danger" onClick={() => onRemove(d)} disabled={busy}>Remove</Button>
        )}
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button loading={busy} onClick={save}>{adding ? 'Add department' : 'Save'}</Button>
      </>}>
      <div className="form-group">
        <label className="form-label required" htmlFor="dep-name">Name</label>
        <input id="dep-name" data-text="title" className="form-control" maxLength={60} autoFocus
          value={form.name} onChange={put('name')} placeholder="e.g. Mathematics" />
        {renaming && d.total > 0 && (
          <span className="form-hint">The {d.total} {d.total === 1 ? 'person' : 'people'} in {d.name} will be moved to the new name with it.</span>
        )}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="dep-head">Head of department</label>
        <select id="dep-head" className="form-control" value={form.head} onChange={put('head')}>
          <option value="">Nobody yet</option>
          {heads.map((m) => <option key={m._id} value={m._id}>{m.label}{m.designation ? ` — ${m.designation}` : ''}</option>)}
          {keptHead && <option value={form.head}>{keptHead}</option>}
        </select>
        <span className="form-hint">
          {heads.length
            ? `Chosen from the ${heads.length} ${heads.length === 1 ? 'person' : 'people'} in ${deptName}.`
            : `Nobody is in ${deptName} yet — its head is chosen from its own staff, so add people to it first.`}
        </span>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="dep-desc">Description</label>
        <input id="dep-desc" data-text="sentence" className="form-control" maxLength={200}
          value={form.description} onChange={put('description')} placeholder="What this department looks after" />
      </div>
    </Modal>
  );
}
