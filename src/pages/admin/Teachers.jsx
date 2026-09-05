import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { toggleTeacher } from '../../api/admin.api';
import { useAuth } from '../../contexts/AuthContext';
import { useModules } from '../../contexts/ModulesContext';
import { Badge, Button } from '../../components/ui/index';
import Icon, { TeachersScene, SupportScene } from '../../components/ui/icons';
import TeacherForm from './TeacherForm';
import TeacherDependencyDialog from '../../components/TeacherDependencyDialog';
import BulkImport from '../../components/BulkImport';
import { saveFile } from '../../utils/downloadFile';
import {
  Crumbs, ListHero, ListStats, ListStat, SearchField, FiltersButton, FilterPanel,
  FilterField, activeFilterCount, SelectionBar, useSelection, ListTable, ListFooter,
  Who, Stack, Chips, RowActions, IconAction, RowMenu, MenuItem, MenuSep, QuickActions,
  HelpPanel, PageFoot, Drawer, DrawerHead, DrawerSection, DrawerFoot, orBlank, fmtDate,
} from './listParts';

const SORTS = [
  { value: 'name',   label: 'Name (A–Z)' },
  { value: 'name_z', label: 'Name (Z–A)' },
  { value: 'desig',  label: 'Designation' },
  { value: 'joined', label: 'Joining date' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

const STAFF_TYPES = [
  { value: 'teaching',     label: 'Teaching' },
  { value: 'non_teaching', label: 'Non-teaching' },
];

const STATUSES = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];
const GENDERS  = ['Male', 'Female', 'Other'];

const EMPTY = {
  status: '', designation: '', subject: '', department: '',
  gender: '', staffType: '', sort: 'name',
};

export default function Teachers() {
  const { user }    = useAuth();
  const { isEnabled } = useModules();

  const [page, setPage]   = useState(1);
  // Rows per page is the admin's choice; changing it starts again at page 1.
  const [limit, setLimit] = useState(20);

  // Seeded from ?search= so the header's global search can land on one person:
  // it navigates here with the name prefilled and ?focus=<id>, and the focus
  // highlight can only flag a row that actually rendered — see
  // hooks/useFocusHighlight.js.
  const [params] = useSearchParams();
  const [search, setSearch]   = useState(() => params.get('search') || '');
  const [filters, setFilters] = useState(EMPTY);
  const [showFilters, setShowFilters] = useState(false);

  // Delete and Deactivate both go through the dependency dialog — it is what
  // shows the admin the classes, subjects, books and periods still attached, and
  // it is the only thing that fires either action.
  const [depTarget, setDepTarget] = useState(null);   // { teacher, action }
  const [createOpen, setCreate]   = useState(false);
  const [editUser, setEditUser]   = useState(null);
  const [bulkOpen, setBulkOpen]   = useState(false);
  const [viewing, setViewing]     = useState(null);
  const [busy, setBusy]           = useState(false);

  const urlSearch = params.get('search') || '';
  useEffect(() => {
    if (urlSearch) { setSearch(urlSearch); setPage(1); }
  }, [urlSearch]);

  // A request per keystroke is a request per keystroke; wait for a pause.
  const [term, setTerm] = useState(search);
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

  const { data, loading, refetch } = useFetch(() => api.getTeachers(query), [queryKey]);

  // The designation list, and the module access each one grants, are managed on
  // /admin/designations — the wizard needs the whole master list, while the
  // filter only offers the ones staff actually hold.
  const { data: desigData } = useFetch(api.getDesignations);
  const designations = Array.isArray(desigData) ? desigData : [];

  const rows      = data?.data || [];
  const stats     = data?.stats || {};
  const options   = data?.options || {};
  const selection = useSelection(rows, queryKey);

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  const filterCount = activeFilterCount(filters, EMPTY);
  const anyFilter   = !!term || filterCount > 0;
  const clearAll    = () => { setSearch(''); setTerm(''); setFilters(EMPTY); setPage(1); };

  // ── Actions ────────────────────────────────────────────────────────────────
  /**
   * Activating is immediate; deactivating is not.
   *
   * Switching an account back on resolves dependencies rather than creating
   * them, so there is nothing to check — but switching it off strands whatever
   * still points at it, which is what the dialog is for.
   */
  const handleToggle = async (r) => {
    if (r.isActive !== false) { setDepTarget({ teacher: r, action: 'deactivate' }); return; }
    toast.loading('Activating…', { id: 'toggle' });
    try {
      await toggleTeacher(r._id);
      toast.success('Teacher activated', { id: 'toggle' });
      refetch();
    } catch (err) { toast.error(err.message, { id: 'toggle' }); }
  };

  /**
   * Bulk activation only — never the other way round.
   *
   * Deactivating a teacher can strand a class, a subject, a library loan or a
   * timetable period, and the dependency dialog is the only thing allowed to
   * make that call. There is no safe way to answer it for ten people at once,
   * so deactivation stays a one-at-a-time decision.
   */
  const bulkActivate = async () => {
    const targets = selection.rows.filter((r) => r.isActive === false);
    if (!targets.length) { toast('Every selected teacher is already active.'); return; }
    toast.loading(`Activating ${targets.length} teacher${targets.length === 1 ? '' : 's'}…`, { id: 'bulk' });
    setBusy(true);
    let done = 0;
    let failed = 0;
    for (const r of targets) {
      try { await toggleTeacher(r._id); done += 1; }
      catch { failed += 1; }
    }
    setBusy(false);
    if (failed) toast.error(`${done} activated, ${failed} failed`, { id: 'bulk' });
    else toast.success(`${done} teacher${done === 1 ? '' : 's'} activated`, { id: 'bulk' });
    selection.clear();
    refetch();
  };

  const handleExport = async () => {
    toast.loading('Building the spreadsheet…', { id: 'exp' });
    try {
      const { page: _p, limit: _l, ...rest } = query;
      saveFile(await api.exportTeachers(rest), 'teachers.xlsx');
      toast.success('Downloaded', { id: 'exp' });
    } catch (err) { toast.error(err.message || 'Export failed', { id: 'exp' }); }
  };

  // The directory profile is a richer view of the same person — offered only
  // when the school actually runs that module.
  const directoryPath = isEnabled('employeeDirectory')
    ? '/admin/employee-directory/employees'
    : null;

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'name',
      label: 'Teacher',
      render: (r) => <Who name={r.name} sub={r.employeeId || r.email} photo={r.profileImage} tone="indigo" />,
    },
    {
      key: 'designation',
      label: 'Designation',
      render: (r) => <Stack main={r.designation} sub={r.department} />,
    },
    { key: 'subjects', label: 'Subjects', render: (r) => <Chips items={r.subjects} max={2} /> },
    { key: 'phone',    label: 'Phone',    render: (r) => orBlank(r.phone) },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <Badge variant={r.isActive !== false ? 'success' : 'muted'}>
          {r.isActive !== false ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    { key: 'joined', label: 'Joining Date', render: (r) => orBlank(fmtDate(r.joiningDate)) },
    {
      key: 'actions',
      label: 'Actions',
      className: 'ltable__acts',
      render: (r) => (
        <RowActions>
          <IconAction icon="eye" label="View details" onClick={() => setViewing(r)} />
          <IconAction icon="pencil" label="Edit teacher" variant="edit" onClick={() => setEditUser(r)} />
          <RowMenu>
            {directoryPath && (
              <MenuItem icon="folder" to={`${directoryPath}/${r._id}`}>Directory profile</MenuItem>
            )}
            <MenuItem icon="badge" to="/admin/designations">Designations</MenuItem>
            <MenuItem icon="power" onClick={() => handleToggle(r)}>
              {r.isActive !== false ? 'Deactivate' : 'Activate'}
            </MenuItem>
            <MenuSep />
            <MenuItem icon="trash" danger onClick={() => setDepTarget({ teacher: r, action: 'delete' })}>
              Delete teacher
            </MenuItem>
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="page listpg">
      <Crumbs here="Teachers" />

      <ListHero
        title="Teachers"
        subtitle="Manage all teachers, view details, assign classes, and keep your school running smoothly."
        quote="Great teachers change the world, one student at a time."
        scene={TeachersScene}
      />

      <ListStats>
        <ListStat icon="users" tone="indigo" value={stats.total} label="Total Teachers"
          caption="Across all departments" on={!filters.status} onClick={() => set({ status: '' })} />
        <ListStat icon="teacher" tone="green" value={stats.active} label="Active Teachers"
          caption="Currently working" on={filters.status === 'active'} onClick={() => set({ status: 'active' })} />
        <ListStat icon="userCircle" tone="pink" value={stats.inactive} label="Inactive Teachers"
          caption="Not working" on={filters.status === 'inactive'} onClick={() => set({ status: 'inactive' })} />
        <ListStat icon="book" tone="amber" value={stats.subjectsCovered} label="Subjects Covered"
          caption="With an assigned teacher" />
      </ListStats>

      <section className="card">
        <div className="ltools">
          <SearchField value={search} onChange={setSearch}
            placeholder="Search name, email, phone, ID or designation…" />

          <FiltersButton open={showFilters} count={filterCount}
            onClick={() => setShowFilters((v) => !v)} />

          <span className="ltools__sep" />

          <div className="ltools__acts">
            <Button variant="secondary" onClick={handleExport}>
              <Icon name="download" size={16} /> Export
            </Button>
            <Button variant="secondary" onClick={() => setBulkOpen(true)}>
              <Icon name="upload" size={16} /> Bulk Import
            </Button>
            <Button onClick={() => setCreate(true)}><Icon name="plus" size={16} /> Add Teacher</Button>
          </div>
        </div>

        {showFilters && (
          <FilterPanel onReset={clearAll}>
            <FilterField label="Designation" value={filters.designation}
              onChange={(v) => set({ designation: v })}
              all="All designations" options={options.designations || []} />
            <FilterField label="Subject" value={filters.subject}
              onChange={(v) => set({ subject: v })}
              all="All subjects" options={options.subjects || []} />
            <FilterField label="Status" value={filters.status}
              onChange={(v) => set({ status: v })}
              all="All status" options={STATUSES} />
            <FilterField label="Department" value={filters.department}
              onChange={(v) => set({ department: v })}
              all="Any department" options={options.departments || []} />
            <FilterField label="Staff type" value={filters.staffType}
              onChange={(v) => set({ staffType: v })}
              all="Any type" options={STAFF_TYPES} />
            <FilterField label="Gender" value={filters.gender}
              onChange={(v) => set({ gender: v })}
              all="Any gender" options={GENDERS} />
            <FilterField label="Sort by" value={filters.sort} defaultValue="name"
              onChange={(v) => set({ sort: v })} options={SORTS} />
          </FilterPanel>
        )}

        <SelectionBar count={selection.ids.length} noun="teacher" onClear={selection.clear}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={bulkActivate}>
            Activate
          </button>
          {/* Deactivating is per-teacher on purpose — see bulkActivate. */}
        </SelectionBar>

        <ListTable
          columns={columns}
          rows={rows}
          loading={loading}
          selection={selection}
          startIndex={(page - 1) * limit}
          emptyIcon={anyFilter ? '🔍' : '🧑‍🏫'}
          emptyTitle={anyFilter ? 'No teachers match these filters' : 'No teachers yet'}
          emptyMessage={anyFilter
            ? 'Try a different designation, subject or search term.'
            : 'Add your first teacher, or bring the whole staff list in from a spreadsheet.'}
          emptyAction={anyFilter
            ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
            : <Button onClick={() => setCreate(true)}>+ Add Teacher</Button>}
        />

        <ListFooter
          page={page} pages={data?.pages || 1} total={data?.total || 0}
          limit={limit} count={rows.length} noun="teacher"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
        />
      </section>

      <div className="lbottom">
        <QuickActions items={[
          { icon: 'userPlus', tone: 'indigo', bg: '#f5f3ff', label: 'Add Teacher', sub: 'Onboard one member', onClick: () => setCreate(true) },
          { icon: 'upload',   tone: 'green',  bg: '#f0fdf4', label: 'Bulk Import', sub: 'From a spreadsheet', onClick: () => setBulkOpen(true) },
          { icon: 'badge',    tone: 'amber',  bg: '#fffbeb', label: 'Designations', sub: 'Roles & module access', to: '/admin/designations' },
          { icon: 'download', tone: 'teal',   bg: '#f0fdfa', label: 'Export List', sub: 'Download as Excel', onClick: handleExport },
        ]} />
        <HelpPanel scene={SupportScene}
          text="Questions about designations, module access or what a deactivation will affect? Message your school's support team and someone will pick it up." />
      </div>

      <PageFoot schoolName={user?.school?.name} />

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}
      {/* One seven-step wizard for both intake and editing, so an edit offers
          every field the record was created with. */}
      <TeacherForm open={createOpen} onClose={() => setCreate(false)}
        onCreated={refetch} designations={designations} />

      <TeacherForm open={!!editUser} teacher={editUser} onClose={() => setEditUser(null)}
        onCreated={refetch} designations={designations} />

      <BulkImport
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        endpoint="/admin/teachers/bulk"
        noun="teacher"
        template={{ download: api.downloadTeacherTemplate, filename: 'teacher-template.xlsx' }}
        intro="Upload an Excel file (.xlsx). Each teacher is emailed a one-time password and must set their own on first login."
        onImported={refetch}
        columns={(
          <>
            <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>Columns:</strong>
            The template carries every field of the Add Teacher form — personal, contact, government ID,
            education, experience, bank and school details. Its <em>Reference</em> sheet lists the exact
            values each column accepts, and which ones are required.
            <strong style={{ color: 'var(--text)', display: 'block', marginTop: 6 }}>Note:</strong>
            Only the paperwork itself can’t be imported — Aadhaar and PAN scans, resignation letter,
            experience certificate. Open each teacher in Edit afterwards to attach them.
            Re-uploading a corrected sheet updates the teachers it already created.
          </>
        )}
      />

      <TeacherDrawer
        row={viewing}
        directoryPath={directoryPath}
        onClose={() => setViewing(null)}
        onEdit={(r) => { setViewing(null); setEditUser(r); }}
      />

      {/* Delete / Deactivate — dependencies first, the action only once clear */}
      <TeacherDependencyDialog
        open={!!depTarget}
        teacher={depTarget?.teacher}
        action={depTarget?.action}
        onClose={() => setDepTarget(null)}
        onDone={refetch}
      />
    </div>
  );
}

/**
 * The whole teacher record beside the list.
 *
 * The row already carries the summary, so that renders immediately and the full
 * profile fills in behind it — opening a drawer should never be a blank wait.
 */
function TeacherDrawer({ row, onClose, onEdit, directoryPath }) {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!row) { setDetail(null); return undefined; }
    let live = true;
    api.getTeacherDetail(row._id).then((d) => { if (live) setDetail(d); }).catch(() => {});
    return () => { live = false; };
  }, [row]);

  if (!row) return null;
  const p = detail?.profile || {};
  const address = [p.currentAddress, p.currentCity, p.currentState, p.currentPincode]
    .filter(Boolean).join(', ');

  return (
    <Drawer open onClose={onClose}>
      <DrawerHead
        name={row.name} sub={row.email} photo={row.profileImage} tone="indigo" onClose={onClose}
        tags={[
          <Badge key="s" variant={row.isActive !== false ? 'success' : 'muted'}>
            {row.isActive !== false ? 'Active' : 'Inactive'}
          </Badge>,
          row.designation ? <Badge key="d" variant="primary">{row.designation}</Badge> : null,
        ].filter(Boolean)}
      />

      <div className="ldrawer__body">
        <DrawerSection title="Role" fields={[
          ['Employee ID', row.employeeId],
          ['Designation', row.designation],
          ['Department', row.department],
          ['Staff type', row.staffType === 'non_teaching' ? 'Non-teaching' : row.staffType ? 'Teaching' : ''],
          ['Joined on', fmtDate(row.joiningDate)],
          ['Subjects', row.subjects?.length ? row.subjects.join(', ') : ''],
          ['Classes', row.classes?.length ? row.classes.join(', ') : ''],
        ]} />

        <DrawerSection title="Contact" fields={[
          ['Email', row.email],
          ['Phone', row.phone],
          ['Alternate phone', p.alternatePhone],
          ['Address', address],
        ]} />

        <DrawerSection title="Personal" fields={[
          ['Gender', row.gender],
          ['Date of birth', fmtDate(p.dob)],
          ['Blood group', p.bloodGroup],
          ["Father's / husband's name", p.fatherOrHusbandName],
        ]} />

        <DrawerSection title="Qualifications" fields={[
          ['Qualification', row.qualification],
          ['Teaching degree', p.teachingDegree],
          ['Total experience', p.totalExperience],
          ['Previous school', p.previousSchool],
        ]} />

        <DrawerSection title="Emergency contact" fields={[
          ['Name', p.emergencyContactName],
          ['Phone', p.emergencyContactPhone],
        ]} />
      </div>

      <DrawerFoot>
        {directoryPath && (
          <Link className="btn btn-secondary" to={`${directoryPath}/${row._id}`}>
            <Icon name="folder" size={15} /> Directory profile
          </Link>
        )}
        <Button onClick={() => onEdit(row)}><Icon name="pencil" size={15} /> Edit</Button>
      </DrawerFoot>
    </Drawer>
  );
}
