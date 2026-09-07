/**
 * Employee Directory → Designations.
 *
 * The people view of a designation. Two records describe one, and this screen
 * is where they meet: the Designation table an admin keeps (description, active
 * flag, the modules it grants) and the designation NAME on each employee's
 * profile, which is what actually puts them in it. They join by name, so a
 * designation can be defined with nobody in it, and a profile can name one that
 * was never defined — both are shown for what they are.
 *
 * Nothing is edited here. Designations and the access they grant are configured
 * on Admin → Designations, which stays the single place they change; a teacher
 * viewing this page has no master list at all and simply sees the headcounts.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getDesignations } from '../../api/employeeDirectory.api';
import { getDesignationMatrix } from '../../api/admin.api';
import { Empty } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { ErrorState, SkeletonRows, useDirectoryBase } from './parts';
import {
  Crumbs, ListFoot, MenuItem, MenuSep, PageTop, Pick, RowMenu, SearchBox, StatTile, ViewToggle,
} from './employeeParts';
import {
  AboutPanel, AccessSummary, DesignationCard, DesignationMark, Faces, StateChip,
  accessOf, fmtDay, gapOf, merge, summarise,
} from './designationParts';

const VIEW_KEY   = 'employeeDirectory.designations.view';
const PAGE_SIZES = [10, 25, 50, 100];

const SORTS = [
  { value: 'size',   label: 'Most employees' },
  { value: 'name',   label: 'Name (A–Z)' },
  { value: 'access', label: 'Widest module access' },
  { value: 'newest', label: 'Newest first' },
];

const STATES = [
  { value: 'held',       label: 'Held by someone' },
  { value: 'unused',     label: 'Nobody holds it' },
  { value: 'undefined_', label: 'Not configured' },
  { value: 'inactive',   label: 'Deactivated' },
];

const readView = () => {
  try { return localStorage.getItem(VIEW_KEY) === 'card' ? 'card' : 'table'; } catch { return 'table'; }
};

export default function Designations() {
  const { base, isDirectoryAdmin } = useDirectoryBase();
  const held = useFetch(getDesignations, []);
  // The master list is an administrative endpoint. A teacher gets the roll-up
  // alone, and every column that comes from the Designation record is simply
  // absent rather than guessed at.
  const master = useFetch(
    () => (isDirectoryAdmin ? getDesignationMatrix() : Promise.resolve(null)),
    [isDirectoryAdmin],
  );

  const [search, setSearch] = useState('');
  const [state,  setState]  = useState('');
  const [sort,   setSort]   = useState('size');
  const [view,   setView]   = useState(readView);
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(10);
  const [open,   setOpen]   = useState('');

  const heldList = useMemo(() => held.data?.designations || [], [held.data]);
  const modules  = useMemo(() => (master.data?.modules || []).filter((m) => m.enabled), [master.data]);
  const rows     = useMemo(
    () => merge(master.data?.designations || [], heldList),
    [master.data, heldList],
  );
  const gap   = useMemo(() => gapOf(heldList), [heldList]);
  const stats = useMemo(() => summarise(rows, gap), [rows, gap]);

  const setLayout = (v) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ }
  };

  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (state === 'held'       && !r.total) return false;
      if (state === 'unused'     && r.state !== 'unused') return false;
      if (state === 'undefined_' && r.state !== 'undefined_') return false;
      if (state === 'inactive'   && r.isActive) return false;
      if (term && !`${r.name} ${r.description}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const byName = (a, b) => a.name.localeCompare(b.name);
    const reach  = (r) => accessOf(r.permissions, modules)?.reach ?? -1;
    return out.sort((a, b) => {
      switch (sort) {
        case 'name':   return byName(a, b);
        case 'access': return reach(b) - reach(a) || byName(a, b);
        case 'newest': return new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || byName(a, b);
        default:       return b.total - a.total || byName(a, b);
      }
    });
  }, [rows, term, state, sort, modules]);

  const pages = Math.max(1, Math.ceil(filtered.length / limit));
  const start = (Math.min(page, pages) - 1) * limit;
  const shown = filtered.slice(start, start + limit);
  const anyFilter = !!term || !!state;
  const clearAll = () => { setSearch(''); setState(''); setPage(1); };
  const pickState = (v) => { setState(state === v ? '' : v); setPage(1); };

  if (held.loading) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Designations" />
        <PageTop title="Designations" subtitle="Who holds which designation, and what it opens." />
        <SkeletonRows rows={6} cols={5} />
      </div>
    );
  }

  if (held.error) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Designations" />
        <PageTop title="Designations" />
        <ErrorState error={held.error} onRetry={held.refetch} />
      </div>
    );
  }

  if (!rows.length && !gap) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Designations" />
        <PageTop title="Designations" />
        <Empty icon="🎫" title="No designations yet"
          message="They appear here as soon as one is defined, or an employee has one on their record." />
      </div>
    );
  }

  return (
    <div className="page edl">
      <Crumbs base={base} here="Designations" />

      <PageTop
        title="Designations"
        subtitle="Who holds which designation, how many of them there are, and what each one opens across the school.">
        <Link className="btn btn-secondary" to={`${base}/employees`}>
          <Icon name="users" size={16} /> All employees
        </Link>
        {isDirectoryAdmin && (
          <Link className="btn btn-primary" to="/admin/designations">
            <Icon name="settings" size={16} /> Manage &amp; set access
          </Link>
        )}
      </PageTop>

      <div className="edl-stats">
        <StatTile icon={<Icon name="badge" size={22} />} tone="indigo" value={stats.designations}
          label="Designations"
          caption={isDirectoryAdmin ? `${stats.defined} on the master list` : 'Held across the school'}
          on={!state} onClick={() => { setState(''); setPage(1); }} />
        <StatTile icon={<Icon name="users" size={22} />} tone="green" value={stats.employees}
          label="Employees" caption={`${stats.active} of them active`} />
        <StatTile icon={<Icon name="userPlus" size={22} />} tone="blue" value={stats.unused}
          label="Nobody holds it" caption="Defined but unused"
          on={state === 'unused'} onClick={() => pickState('unused')} />
        <StatTile icon={<Icon name="alert" size={22} />} tone={stats.undefined_ ? 'pink' : 'amber'}
          value={stats.undefined_ || stats.unassigned}
          label={stats.undefined_ ? 'Not configured' : 'Without one'}
          captionTone={stats.undefined_ ? 'down' : undefined}
          caption={stats.undefined_
            ? 'Held by staff, never defined'
            : `${stats.unassigned} employee${stats.unassigned === 1 ? '' : 's'} with no designation`}
          on={state === 'undefined_'}
          onClick={stats.undefined_ ? () => pickState('undefined_') : undefined} />
      </div>

      <section className="card edl-card-wrap">
        <div className="edl-bar">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search designations or their descriptions…" />
          <Pick value={state} onChange={(v) => { setState(v); setPage(1); }}
            all="All designations" label="Filter by state" options={STATES} />
          <Pick value={sort} onChange={(v) => { setSort(v); setPage(1); }}
            label="Sort designations" options={SORTS} defaultValue="size" />
          <ViewToggle value={view === 'card' ? 'card' : 'table'} onChange={setLayout} />
        </div>

        <div className="edl-results">
          <span className="edl-results__count">
            {filtered.length} of {rows.length} designation{rows.length === 1 ? '' : 's'}
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
            ? <Empty icon="🔍" title="No designations match" message="Try another state or search term." />
            : view === 'card'
              ? (
                <div className="dsggrid">
                  {shown.map((r) => (
                    <DesignationCard key={r.name} row={r} base={base}
                      access={accessOf(r.permissions, modules)}
                      open={open === r.name} onMembers={(n) => setOpen(open === n ? '' : n)} />
                  ))}
                </div>
              )
              : (
                <div className="table-wrap">
                  <table className="table edl-table">
                    <thead>
                      <tr>
                        <th className="dsgcol-num">#</th>
                        <th>Designation</th>
                        <th className="dsgcol-n">Employees</th>
                        <th className="dsgcol-n">Active</th>
                        <th className="dsgcol-faces">Members</th>
                        {isDirectoryAdmin && <th className="dsgcol-access">Module access</th>}
                        <th className="dsgcol-state">State</th>
                        {isDirectoryAdmin && <th className="dsgcol-date">Created</th>}
                        <th className="edl-table__acts">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r, i) => (
                        <React.Fragment key={r.name}>
                          <tr className={r.state === 'undefined_' ? 'dsgrow--warn' : undefined}>
                            <td className="dsgcol-num">{start + i + 1}</td>
                            <td>
                              <div className="dsgwho">
                                <DesignationMark name={r.name} size={34} />
                                <div style={{ minWidth: 0 }}>
                                  <div className="dsgwho__name">{r.name}</div>
                                  <div className="dsgwho__sub">
                                    {r.description || (r.defined ? 'No description set' : 'Not on the designation list')}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="dsgcol-n"><b>{r.total}</b></td>
                            <td className="dsgcol-n">{r.active}</td>
                            <td className="dsgcol-faces"><Faces members={r.members} base={base} /></td>
                            {isDirectoryAdmin && (
                              <td className="dsgcol-access"><AccessSummary access={accessOf(r.permissions, modules)} /></td>
                            )}
                            <td className="dsgcol-state"><StateChip row={r} /></td>
                            {isDirectoryAdmin && <td className="dsgcol-date">{fmtDay(r.createdAt)}</td>}
                            <td className="edl-table__acts">
                              <div className="edl-rowacts">
                                <Link className="btn btn-secondary btn-sm"
                                  to={`${base}/employees?designation=${encodeURIComponent(r.name)}`}>View</Link>
                                <RowMenu>
                                  {r.members.length > 0 && (
                                    <MenuItem icon="users" onClick={() => setOpen(open === r.name ? '' : r.name)}>
                                      {open === r.name ? 'Hide members' : `List ${r.members.length} members`}
                                    </MenuItem>
                                  )}
                                  <MenuItem icon="folder"
                                    to={`${base}/employees?designation=${encodeURIComponent(r.name)}`}>
                                    Open in directory
                                  </MenuItem>
                                  {isDirectoryAdmin && <MenuSep />}
                                  {isDirectoryAdmin && (
                                    <MenuItem icon="settings" to="/admin/designations">
                                      {r.defined ? 'Configure module access' : 'Add it to the list'}
                                    </MenuItem>
                                  )}
                                </RowMenu>
                              </div>
                            </td>
                          </tr>
                          {open === r.name && (
                            <tr className="dsgrow--members">
                              <td colSpan={isDirectoryAdmin ? 9 : 7}>
                                <div className="dsgmembers">
                                  {r.members.map((m) => (
                                    <Link key={m._id} to={`${base}/employees/${m._id}`} className="dsgmember">
                                      <span className="dsgmember__name">{m.name}</span>
                                      <span className="dsgmember__sub">{m.department || 'No department'}</span>
                                      <Icon name="chevronRight" size={14} />
                                    </Link>
                                  ))}
                                </div>
                              </td>
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
          limit={limit} count={shown.length} noun="designation"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} sizes={PAGE_SIZES}
        />
      </section>

      <AboutPanel isAdmin={isDirectoryAdmin} undefinedCount={stats.undefined_}
        unassigned={stats.unassigned} base={base} />
    </div>
  );
}
