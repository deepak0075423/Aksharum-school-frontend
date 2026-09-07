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
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getDepartments } from '../../api/employeeDirectory.api';
import { Empty } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { Chips, ErrorState, SkeletonCards, useDirectoryBase } from './parts';
import {
  Crumbs, ListFoot, MenuItem, MenuSep, PageTop, Pick, RowMenu, SearchBox, StatTile, ViewToggle,
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
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(12);
  const [open,   setOpen]   = useState('');   // the department listing its members

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

  if (loading) {
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
        <PageTop title="Departments" />
        <Empty icon="🏢" title="No employees yet"
          message="Departments appear here as soon as an employee has one set on their record." />
      </div>
    );
  }

  return (
    <div className="page edl">
      <Crumbs base={base} here="Departments" />

      <PageTop
        title="Departments"
        subtitle="Grouped from the department on each employee record — there is no separate department list to keep in step.">
        <Link className="btn btn-secondary" to={`${base}/employees`}>
          <Icon name="users" size={16} /> All employees
        </Link>
        {stats.unassigned > 0 && (
          <Link className="btn btn-primary" to={`${base}/employees?department=Unassigned`}>
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
        <StatTile icon={<Icon name="users" size={22} />} tone="amber" value={stats.employees}
          label="Employees" captionTone={stats.unassigned ? 'down' : undefined}
          caption={stats.unassigned
            ? `${stats.unassigned} without a department`
            : 'Every one of them placed'} />
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
            : view === 'card'
              ? (
                <div className="depgrid">
                  {shown.map((d) => (
                    <DepartmentCard key={d.name} department={d} base={base}
                      open={open === d.name} onToggle={(n) => setOpen(open === n ? '' : n)} />
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
                              </div>
                            </td>
                            <td className="depcol-type"><TypeChip type={typeOf(d)} /></td>
                            <td className="depcol-mix"><StaffMix department={d} /></td>
                            <td className="depcol-n"><b>{d.total}</b></td>
                            <td className="depcol-n">{d.active}</td>
                            <td><Chips items={d.designations} max={2} empty="—" /></td>
                            <td className="edl-table__acts">
                              <div className="edl-rowacts">
                                <Link className="btn btn-secondary btn-sm"
                                  to={`${base}/employees?department=${encodeURIComponent(d.name)}`}>
                                  View
                                </Link>
                                <RowMenu>
                                  <MenuItem icon="users" onClick={() => setOpen(open === d.name ? '' : d.name)}>
                                    {open === d.name ? 'Hide members' : `List ${d.members.length} members`}
                                  </MenuItem>
                                  <MenuItem icon="folder"
                                    to={`${base}/employees?department=${encodeURIComponent(d.name)}`}>
                                    Open in directory
                                  </MenuItem>
                                  <MenuSep />
                                  <MenuItem icon="pencil" to={`${base}/employees`}>
                                    Rename on a profile
                                  </MenuItem>
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
    </div>
  );
}
