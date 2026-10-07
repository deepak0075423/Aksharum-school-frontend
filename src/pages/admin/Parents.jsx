/**
 * Admin → Parents.
 *
 * The parent accounts admissions create, on the frame the other account lists
 * use (listParts.jsx). Nobody is added from here: a parent account is made, or
 * an existing one linked, by the family step of a student's admission form. So
 * this screen finds people, shows which children each is linked to and how to
 * reach them, and switches an account on or off.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { useAuth } from '../../contexts/AuthContext';
import { useModules } from '../../contexts/ModulesContext';
import { Badge, Button } from '../../components/ui/index';
import Icon, { ParentsScene, SupportScene } from '../../components/ui/icons';
import { DrawerSection as Section } from '../../components/ui/Drawer';
import { saveFile } from '../../utils/downloadFile';
import {
  Crumbs, ListHero, ListStats, ListStat, SearchField, FiltersButton, FilterPanel,
  FilterField, activeFilterCount, SelectionBar, useSelection, ListTable, ListFooter,
  Who, RowActions, IconAction, RowMenu, MenuItem, MenuSep, QuickActions, HelpPanel,
  PageFoot, Drawer, DrawerHead, DrawerSection, DrawerFoot, orBlank, fmtDate, ago, Blank,
} from './listParts';

const SORTS = [
  { value: 'name',   label: 'Name (A–Z)' },
  { value: 'name_z', label: 'Name (Z–A)' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'active', label: 'Recently active' },
];

const STATUSES = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];

// Accounts added since the academic year began — what "New Parents" counts.
const ADDED = [{ value: 'year', label: 'This academic year' }];

const EMPTY = { status: '', added: '', classId: '', sectionId: '', sort: 'name' };

/** "Class 6 A" — or just the class, while the child waits for a section. */
const placeOf = (k) => [k.className, k.sectionName].filter(Boolean).join(' ');

/** A child's own record: the students list, searched to them and flagged. */
const studentLink = (k) => `/admin/students?search=${encodeURIComponent(k.name)}&focus=${k._id}`;

export default function Parents() {
  const { user: me } = useAuth();
  const { isEnabled } = useModules();

  const [page, setPage]   = useState(1);
  // Rows per page is the admin's choice; changing it starts again at page 1.
  const [limit, setLimit] = useState(20);
  const [search, setSearch]   = useState('');
  const [filters, setFilters] = useState(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy]       = useState(false);

  // A request per keystroke is a request per keystroke; wait for a pause.
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(
    () => ({ page, limit, search: term || undefined, ...Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v),
    ) }),
    [page, limit, term, filters],
  );
  const queryKey = JSON.stringify(query);

  const { data, loading, refetch } = useFetch(() => api.getParents(query), [queryKey]);

  // A child's class and section, from the running academic year.
  const { data: tree } = useFetch(() => api.getClassesWithSections(), []);
  const classes  = Array.isArray(tree) ? tree : [];
  const sections = filters.classId
    ? (classes.find((c) => c._id === filters.classId)?.sections || [])
    : classes.flatMap((c) => c.sections || []);

  const rows      = data?.data || [];
  const stats     = data?.stats || {};
  const selection = useSelection(rows, queryKey);

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  // A section belongs to one class, so picking a class drops a section from
  // another one rather than leaving a filter pair that can never match.
  const setClass = (classId) => set({ classId, sectionId: '' });

  const filterCount = activeFilterCount(filters, EMPTY);
  const anyFilter   = !!term || filterCount > 0;
  const clearAll    = () => { setSearch(''); setTerm(''); setFilters(EMPTY); setPage(1); };

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleToggle = async (r) => {
    toast.loading(r.isActive !== false ? 'Deactivating…' : 'Activating…', { id: 'tog' });
    try {
      await api.toggleUser(r._id);
      toast.success(r.isActive !== false ? 'Parent deactivated' : 'Parent activated', { id: 'tog' });
      refetch();
    } catch (err) { toast.error(err.message, { id: 'tog' }); }
  };

  const bulkSetActive = async (active) => {
    const targets = selection.rows.filter((r) => (r.isActive !== false) !== active);
    if (!targets.length) {
      toast(`Nothing to change — every selected parent is already ${active ? 'active' : 'inactive'}.`);
      return;
    }
    toast.loading(`${active ? 'Activating' : 'Deactivating'} ${targets.length}…`, { id: 'bulk' });
    setBusy(true);
    let done = 0;
    let failed = 0;
    for (const r of targets) {
      try { await api.toggleUser(r._id); done += 1; }
      catch { failed += 1; }
    }
    setBusy(false);
    if (failed) toast.error(`${done} changed, ${failed} failed`, { id: 'bulk' });
    else toast.success(`${done} parent${done === 1 ? '' : 's'} ${active ? 'activated' : 'deactivated'}`, { id: 'bulk' });
    selection.clear();
    refetch();
  };

  const handleExport = async () => {
    toast.loading('Building the spreadsheet…', { id: 'exp' });
    try {
      const { page: _p, limit: _l, ...rest } = query;
      saveFile(await api.exportParents(rest), 'parents.xlsx');
      toast.success('Downloaded', { id: 'exp' });
    } catch (err) { toast.error(err.message || 'Export failed', { id: 'exp' }); }
  };

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'name',
      label: 'Parent',
      render: (r) => <Who name={r.name} sub={r.email} photo={r.profileImage} tone="amber" />,
    },
    { key: 'children', label: 'Children', render: (r) => <ChildList kids={r.children} /> },
    { key: 'relationship', label: 'Relationship', render: (r) => orBlank(r.relationship) },
    { key: 'phone', label: 'Phone', render: (r) => orBlank(r.phone) },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <Badge variant={r.isActive !== false ? 'success' : 'muted'}>
          {r.isActive !== false ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'seen',
      label: 'Last Active',
      // The presence heartbeat — whether the family is actually using the app.
      render: (r) => (r.lastSeenAt
        ? <span title={fmtDate(r.lastSeenAt)}>{ago(r.lastSeenAt)}</span>
        : <span className="lnone">{r.isFirstLogin ? 'Never signed in' : '—'}</span>),
    },
    {
      key: 'actions',
      label: 'Actions',
      className: 'ltable__acts',
      render: (r) => (
        <RowActions>
          <IconAction icon="eye" label="View details" onClick={() => setViewing(r)} />
          <RowMenu>
            {(r.children || []).map((k) => (
              <MenuItem key={k._id} icon="student" to={studentLink(k)}>Open {k.name}</MenuItem>
            ))}
            {(r.children || []).length > 0 && <MenuSep />}
            <MenuItem icon="power" onClick={() => handleToggle(r)}>
              {r.isActive !== false ? 'Deactivate' : 'Activate'}
            </MenuItem>
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="page listpg">
      <Crumbs here="Parents" />

      <ListHero
        title="Parents"
        subtitle="Every parent and guardian account, the children each one is linked to, and how to reach them."
        quote="When home and school work together, children thrive."
        scene={ParentsScene}
      />

      {/* Four views of one list — each tile clears the others' filter. */}
      <ListStats>
        <ListStat icon="users" tone="indigo" value={stats.total} label="Total Parents"
          caption="Registered with your school" on={!filters.status && !filters.added}
          onClick={() => set({ status: '', added: '' })} />
        <ListStat icon="checkCircle" tone="green" value={stats.active} label="Active Parents"
          caption="Can sign in" on={filters.status === 'active' && !filters.added}
          onClick={() => set({ status: 'active', added: '' })} />
        <ListStat icon="userCircle" tone="pink" value={stats.inactive} label="Inactive Parents"
          caption="Deactivated accounts" on={filters.status === 'inactive' && !filters.added}
          onClick={() => set({ status: 'inactive', added: '' })} />
        <ListStat icon="userPlus" tone="amber" value={stats.newThisYear} label="New Parents"
          caption="This academic year" on={filters.added === 'year' && !filters.status}
          onClick={() => set({ added: 'year', status: '' })} />
      </ListStats>

      <section className="card">
        <div className="ltools">
          <SearchField value={search} onChange={setSearch}
            placeholder="Search parent, child, email or phone…" />

          <FiltersButton open={showFilters} count={filterCount}
            onClick={() => setShowFilters((v) => !v)} />

          <span className="ltools__sep" />

          <div className="ltools__acts">
            <Button variant="secondary" onClick={handleExport}>
              <Icon name="download" size={16} /> Export
            </Button>
          </div>
        </div>

        {showFilters && (
          <FilterPanel onReset={clearAll}>
            <FilterField label="Child's class" value={filters.classId} onChange={setClass}
              all="All classes" options={classes.map((c) => ({ value: c._id, label: c.className }))} />
            <FilterField label="Child's section" value={filters.sectionId}
              onChange={(v) => set({ sectionId: v })}
              all="All sections" options={sections.map((x) => ({ value: x._id, label: x.sectionName }))} />
            <FilterField label="Status" value={filters.status}
              onChange={(v) => set({ status: v })}
              all="All status" options={STATUSES} />
            <FilterField label="Added" value={filters.added}
              onChange={(v) => set({ added: v })}
              all="Any time" options={ADDED} />
            <FilterField label="Sort by" value={filters.sort} defaultValue="name"
              onChange={(v) => set({ sort: v })} options={SORTS} />
          </FilterPanel>
        )}

        <SelectionBar count={selection.ids.length} noun="parent" onClear={selection.clear}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
            onClick={() => bulkSetActive(true)}>Activate</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
            onClick={() => bulkSetActive(false)}>Deactivate</button>
        </SelectionBar>

        <ListTable
          columns={columns}
          rows={rows}
          loading={loading}
          selection={selection}
          startIndex={(page - 1) * limit}
          emptyIcon={anyFilter ? '🔍' : '👪'}
          emptyTitle={anyFilter ? 'No parents match these filters' : 'No parents yet'}
          emptyMessage={anyFilter
            ? 'Try a different class, status or search term.'
            : 'A parent account is created when a child is admitted — the admission form’s family step makes it.'}
          emptyAction={anyFilter
            ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
            : <Link to="/admin/students" className="btn btn-primary">Go to Students</Link>}
        />

        <ListFooter
          page={page} pages={data?.pages || 1} total={data?.total || 0}
          limit={limit} count={rows.length} noun="parent"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
        />
      </section>

      <div className="lbottom">
        <QuickActions items={[
          { icon: 'student',  tone: 'indigo', bg: '#f5f3ff', label: 'Students', sub: 'Admissions & family details', to: '/admin/students' },
          ...(isEnabled('notification')
            ? [{ icon: 'bell', tone: 'green', bg: '#f0fdf4', label: 'Send a Notice', sub: 'To parents and staff', to: '/admin/notifications' }]
            : []),
          { icon: 'download', tone: 'teal',   bg: '#f0fdfa', label: 'Export List', sub: 'Download as Excel', onClick: handleExport },
        ]} />
        <HelpPanel scene={SupportScene}
          text="A parent's account is made by the family step of a child's admission form, which also links a parent who already has one — a sibling's, say. To change a parent's details, edit that child's admission." />
      </div>

      <PageFoot schoolName={me?.school?.name} />

      <ParentDrawer row={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

/**
 * The children in a table cell — name over class, two at most, so one large
 * family cannot stretch every row on the page.
 */
function ChildList({ kids = [] }) {
  if (!kids.length) return <Blank>No child linked</Blank>;
  const shown = kids.slice(0, 2);
  const rest  = kids.length - shown.length;
  return (
    <div className="lkids" title={kids.map((k) => [k.name, placeOf(k)].filter(Boolean).join(' — ')).join('\n')}>
      {shown.map((k) => (
        <div key={k._id} className="lkids__row">
          <span className="lkids__name">{k.name}</span>
          {placeOf(k) ? <span className="lkids__where">{placeOf(k)}</span> : null}
        </div>
      ))}
      {rest > 0 && <div className="lkids__more">+{rest} more</div>}
    </div>
  );
}

/** "Name · phone · email", whichever of them the family record holds. */
const personLine = (p) => [p?.name, p?.phone, p?.email].filter((v) => v && String(v).trim()).join(' · ');

/** The account, its children and the family record, beside the list. */
function ParentDrawer({ row, onClose }) {
  if (!row) return null;
  const kids = row.children || [];
  const fam  = row.family || {};
  const guardianLabel = fam.guardian?.relation ? `Guardian (${fam.guardian.relation})` : 'Guardian';
  return (
    <Drawer open onClose={onClose}>
      <DrawerHead
        name={row.name} sub={row.email} photo={row.profileImage} tone="amber" onClose={onClose}
        tags={[
          <Badge key="s" variant={row.isActive !== false ? 'success' : 'muted'}>
            {row.isActive !== false ? 'Active' : 'Inactive'}
          </Badge>,
          row.relationship ? <Badge key="r" variant="info">{row.relationship}</Badge> : null,
        ].filter(Boolean)}
      />

      <div className="ldrawer__body">
        <Section title={`Children (${kids.length})`}>
          {kids.length ? (
            <ul className="lkidsec">
              {kids.map((k) => (
                <li key={k._id}>
                  <Link to={studentLink(k)} onClick={onClose}>{k.name}</Link>
                  <span>{placeOf(k) || 'Not placed in a class yet'}</span>
                  {!k.isActive && <Badge variant="muted">Inactive</Badge>}
                </li>
              ))}
            </ul>
          ) : <p className="lkidsec__none">No child is linked to this account.</p>}
        </Section>

        <DrawerSection title="Account" fields={[
          ['Email', row.email],
          ['Phone', row.phone],
          ['Relationship', row.relationship],
          ['Added on', fmtDate(row.createdAt)],
          ['Last active', row.lastSeenAt ? `${ago(row.lastSeenAt)} (${fmtDate(row.lastSeenAt)})` : ''],
          ['Password set', row.isFirstLogin ? 'Not yet — still on the one-time password' : 'Yes'],
        ]} />

        <DrawerSection title="Family" fields={[
          ['Father', personLine(fam.father)],
          ['Mother', personLine(fam.mother)],
          [guardianLabel, personLine(fam.guardian)],
          ['Emergency contact', row.emergencyContact],
        ]} />

        <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 24 }}>
          These details come from the family step of the children’s admission forms — edit a
          child’s admission to change them.
        </p>
      </div>

      <DrawerFoot>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </DrawerFoot>
    </Drawer>
  );
}
