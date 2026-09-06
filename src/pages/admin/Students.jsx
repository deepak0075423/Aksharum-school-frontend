import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { toggleStudent } from '../../api/admin.api';
import { useAuth } from '../../contexts/AuthContext';
import { Badge, Button, Confirm } from '../../components/ui/index';
import Icon, { StudentsScene, SupportScene } from '../../components/ui/icons';
import StudentForm from './StudentForm';
import BulkImport from '../../components/BulkImport';
import { saveFile } from '../../utils/downloadFile';
import {
  Crumbs, ListHero, ListStats, ListStat, SearchField, FiltersButton, FilterPanel,
  FilterField, activeFilterCount, SelectionBar, useSelection, ListTable, ListFooter,
  Who, Stack, RowActions, IconAction, RowMenu, MenuItem, MenuSep, QuickActions,
  HelpPanel, PageFoot, Drawer, DrawerHead, DrawerSection, DrawerFoot, orBlank, fmtDate,
} from './listParts';

const GENDERS  = ['Male', 'Female', 'Other'];
const STATUSES = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];

const SORTS = [
  { value: 'name',   label: 'Name (A–Z)' },
  { value: 'name_z', label: 'Name (Z–A)' },
  { value: 'roll',   label: 'Roll number' },
  { value: 'class',  label: 'Class & section' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

const EMPTY = { status: '', gender: '', classId: '', sectionId: '', sort: 'name' };

export default function Students() {
  const { user } = useAuth();

  const [page, setPage]   = useState(1);
  // Rows per page is the admin's choice; changing it starts again at page 1.
  const [limit, setLimit] = useState(20);

  // Seeded from ?search= so the header's global search can land on one person:
  // it navigates here with the name prefilled and ?focus=<id>, and the focus
  // highlight can only flag a row that actually rendered — see
  // hooks/useFocusHighlight.js.
  const [params] = useSearchParams();
  const [search, setSearch]   = useState(() => params.get('search') || '');
  // ?classId= / ?sectionId= arrive from a class's Sections page, so "Students"
  // there lands on this list already narrowed to that class rather than on all
  // 400 of them. The panel opens with them, or the filter would be invisible.
  const urlClass   = params.get('classId')   || '';
  const urlSection = params.get('sectionId') || '';
  const [filters, setFilters] = useState(() => ({ ...EMPTY, classId: urlClass, sectionId: urlSection }));
  const [showFilters, setShowFilters] = useState(() => !!(urlClass || urlSection));

  const [del, setDel]         = useState(null);
  const [delLoad, setDL]      = useState(false);
  const [busy, setBusy]       = useState(false);

  // One wizard drives both admission and editing — `editing` null means "add"
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [viewing, setViewing]   = useState(null);   // the row behind the drawer

  // The list does not remount when only the query string changes, so a second
  // search from the header has to be picked up here as well as at mount.
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

  const { data, loading, refetch } = useFetch(() => api.getStudents(query), [queryKey]);

  // Class and section dropdowns, from the running academic year.
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
  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit   = (r) => { setEditing(r);   setFormOpen(true); };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteStudent(del._id); toast.success('Student deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const handleToggle = async (r) => {
    toast.loading(r.isActive ? 'Deactivating…' : 'Activating…', { id: 'tog' });
    try {
      await toggleStudent(r._id);
      toast.success(r.isActive ? 'Student deactivated' : 'Student activated', { id: 'tog' });
      refetch();
    } catch (err) { toast.error(err.message, { id: 'tog' }); }
  };

  /**
   * Switch every selected account that is not already in the target state.
   *
   * The endpoint toggles rather than sets, so rows already the right way round
   * are skipped — otherwise "Activate 5" would switch off the two that were
   * already on. Failures are counted, not swallowed.
   */
  const bulkSetActive = async (active) => {
    const targets = selection.rows.filter((r) => (r.isActive !== false) !== active);
    if (!targets.length) {
      toast(`Nothing to change — every selected student is already ${active ? 'active' : 'inactive'}.`);
      return;
    }
    const word = active ? 'Activating' : 'Deactivating';
    toast.loading(`${word} ${targets.length} student${targets.length === 1 ? '' : 's'}…`, { id: 'bulk' });
    setBusy(true);
    let done = 0;
    let failed = 0;
    for (const r of targets) {
      try { await toggleStudent(r._id); done += 1; }
      catch { failed += 1; }
    }
    setBusy(false);
    if (failed) toast.error(`${done} changed, ${failed} failed`, { id: 'bulk' });
    else toast.success(`${done} student${done === 1 ? '' : 's'} ${active ? 'activated' : 'deactivated'}`, { id: 'bulk' });
    selection.clear();
    refetch();
  };

  const handleExport = async () => {
    toast.loading('Building the spreadsheet…', { id: 'exp' });
    try {
      const { page: _p, limit: _l, ...rest } = query;
      saveFile(await api.exportStudents(rest), 'students.xlsx');
      toast.success('Downloaded', { id: 'exp' });
    } catch (err) { toast.error(err.message || 'Export failed', { id: 'exp' }); }
  };

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'name',
      label: 'Student',
      render: (r) => (
        <Who name={r.name} sub={r.email} photo={r.profileImage} tone="green" />
      ),
    },
    { key: 'roll',  label: 'Roll No', render: (r) => orBlank(r.rollNumber) },
    {
      key: 'class',
      label: 'Class / Section',
      render: (r) => (r.className
        ? <Stack main={r.className} sub={r.sectionName ? `Section ${r.sectionName}` : 'Not placed in a section'} />
        : orBlank('')),
    },
    { key: 'gender', label: 'Gender', render: (r) => orBlank(r.gender) },
    {
      key: 'parent',
      label: 'Parent / Guardian',
      render: (r) => (r.parentName
        ? <Stack main={r.parentName} sub={r.parentPhone} />
        : orBlank('')),
    },
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
      key: 'actions',
      label: 'Actions',
      className: 'ltable__acts',
      render: (r) => (
        <RowActions>
          <IconAction icon="eye" label="View details" onClick={() => setViewing(r)} />
          <IconAction icon="pencil" label="Edit student" variant="edit" onClick={() => openEdit(r)} />
          <RowMenu>
            <MenuItem icon="chart" to={`/admin/student-analytics/${r._id}`}>Analytics</MenuItem>
            {r.currentSection && (
              <MenuItem icon="building" to={`/admin/sections/${r.currentSection}`}>Open section</MenuItem>
            )}
            <MenuItem icon="power" onClick={() => handleToggle(r)}>
              {r.isActive !== false ? 'Deactivate' : 'Activate'}
            </MenuItem>
            <MenuSep />
            <MenuItem icon="trash" danger onClick={() => setDel(r)}>Delete student</MenuItem>
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="page listpg">
      <Crumbs here="Students" />

      <ListHero
        title="Students"
        subtitle="Manage all students, view details, and keep information up to date."
        quote="Every student's journey matters. Together, we build a brighter future."
        scene={StudentsScene}
      />

      <ListStats>
        <ListStat icon="users" tone="indigo" value={stats.total} label="Total Students"
          caption="Across all classes" on={!filters.status} onClick={() => set({ status: '' })} />
        <ListStat icon="student" tone="green" value={stats.active} label="Active Students"
          caption="Currently enrolled" on={filters.status === 'active'} onClick={() => set({ status: 'active' })} />
        <ListStat icon="userCircle" tone="pink" value={stats.inactive} label="Inactive Students"
          caption="Not enrolled" on={filters.status === 'inactive'} onClick={() => set({ status: 'inactive' })} />
        <ListStat icon="userPlus" tone="amber" value={stats.newThisYear} label="New Admissions"
          caption="This academic year" />
      </ListStats>

      <section className="card">
        <div className="ltools">
          <SearchField value={search} onChange={setSearch}
            placeholder="Search name, roll no, admission no or email…" />

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
            <Button onClick={openCreate}><Icon name="plus" size={16} /> Add Student</Button>
          </div>
        </div>

        {showFilters && (
          <FilterPanel onReset={clearAll}>
            <FilterField label="Class" value={filters.classId} onChange={setClass}
              all="All classes" options={classes.map((c) => ({ value: c._id, label: c.className }))} />
            <FilterField label="Section" value={filters.sectionId}
              onChange={(v) => set({ sectionId: v })}
              all="All sections" options={sections.map((x) => ({ value: x._id, label: x.sectionName }))} />
            <FilterField label="Status" value={filters.status}
              onChange={(v) => set({ status: v })}
              all="All status" options={STATUSES} />
            <FilterField label="Gender" value={filters.gender}
              onChange={(v) => set({ gender: v })}
              all="Any gender" options={GENDERS} />
            <FilterField label="Sort by" value={filters.sort} defaultValue="name"
              onChange={(v) => set({ sort: v })} options={SORTS} />
          </FilterPanel>
        )}

        <SelectionBar count={selection.ids.length} noun="student" onClear={selection.clear}>
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
          emptyIcon={anyFilter ? '🔍' : '🎒'}
          emptyTitle={anyFilter ? 'No students match these filters' : 'No students yet'}
          emptyMessage={anyFilter
            ? 'Try a different class, section or search term.'
            : 'Admit your first student, or bring a whole class in from a spreadsheet.'}
          emptyAction={anyFilter
            ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
            : <Button onClick={openCreate}>+ Add Student</Button>}
        />

        <ListFooter
          page={page} pages={data?.pages || 1} total={data?.total || 0}
          limit={limit} count={rows.length} noun="student"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
        />
      </section>

      <div className="lbottom">
        <QuickActions items={[
          { icon: 'userPlus', tone: 'indigo', bg: '#f5f3ff', label: 'Add Student', sub: 'Admit one student', onClick: openCreate },
          { icon: 'upload',   tone: 'green',  bg: '#f0fdf4', label: 'Bulk Import', sub: 'From a spreadsheet', onClick: () => setBulkOpen(true) },
          { icon: 'building', tone: 'amber',  bg: '#fffbeb', label: 'Manage Classes', sub: 'Classes & sections', to: '/admin/classes' },
          { icon: 'download', tone: 'teal',   bg: '#f0fdfa', label: 'Export List', sub: 'Download as Excel', onClick: handleExport },
        ]} />
        <HelpPanel scene={SupportScene}
          text="Facing an issue with admissions, roll numbers or section placement? Message your school's support team and someone will pick it up." />
      </div>

      <PageFoot schoolName={user?.school?.name} />

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}
      <StudentForm
        open={formOpen}
        student={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={refetch}
      />

      <BulkImport
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        endpoint="/admin/students/bulk"
        noun="student"
        template={{ download: api.downloadStudentTemplate, filename: 'student-template.xlsx' }}
        intro="Upload an Excel file (.xlsx). Parent accounts are created automatically, or mapped to an existing account if the email already exists."
        onImported={refetch}
        columns={(
          <>
            <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>Columns:</strong>
            The template carries every field of the Add Student wizard — personal, address, Aadhaar,
            previous school, enrolment and the full father / mother / guardian records. Its
            <em> Reference</em> sheet lists the exact values each column accepts, which ones are
            required, and this school’s own classes and sections.
            <strong style={{ color: 'var(--text)', display: 'block', marginTop: 6 }}>Note:</strong>
            Only the certificates themselves can’t be imported — photo, Aadhaar scans, birth
            certificate, TC. Open each student in Edit afterwards to attach them.
            Re-uploading a corrected sheet updates the students it already created.
          </>
        )}
      />

      <StudentDrawer
        row={viewing}
        onClose={() => setViewing(null)}
        onEdit={(r) => { setViewing(null); openEdit(r); }}
      />

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Student"
        message={`Delete "${del?.name}"? Their record, enrolment and history go with them. This cannot be undone.`} />
    </div>
  );
}

/**
 * The whole student record beside the list.
 *
 * The row already carries the summary, so that renders immediately and the full
 * profile fills in behind it — opening a drawer should never be a blank wait.
 */
function StudentDrawer({ row, onClose, onEdit }) {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!row) { setDetail(null); return undefined; }
    let live = true;
    api.getStudent(row._id).then((d) => { if (live) setDetail(d); }).catch(() => {});
    return () => { live = false; };
  }, [row]);

  if (!row) return null;
  const p  = detail?.profile || {};
  const pp = detail?.parentProfile || {};
  const guardian = pp.guardian?.name ? pp.guardian : null;
  const address = [p.address, p.city, p.state, p.pincode].filter(Boolean).join(', ');

  return (
    <Drawer open onClose={onClose}>
      <DrawerHead
        name={row.name} sub={row.email} photo={row.profileImage} tone="green" onClose={onClose}
        tags={[
          <Badge key="s" variant={row.isActive !== false ? 'success' : 'muted'}>
            {row.isActive !== false ? 'Active' : 'Inactive'}
          </Badge>,
          row.className
            ? <Badge key="c" variant="primary">{row.className}{row.sectionName ? ` – ${row.sectionName}` : ''}</Badge>
            : null,
        ].filter(Boolean)}
      />

      <div className="ldrawer__body">
        <DrawerSection title="Enrolment" fields={[
          ['Admission number', row.admissionNumber],
          ['Roll number', row.rollNumber],
          ['Class', row.className],
          ['Section', row.sectionName],
          ['Admitted on', fmtDate(row.createdAt)],
        ]} />

        <DrawerSection title="Personal" fields={[
          ['Gender', row.gender],
          ['Date of birth', fmtDate(row.dob)],
          ['Blood group', p.bloodGroup],
          ['Religion', p.religion],
          ['Category', p.category],
          ['Nationality', p.nationality],
        ]} />

        <DrawerSection title="Contact" fields={[
          ['Email', row.email],
          ['Phone', row.phone],
          ['Address', address],
        ]} />

        <DrawerSection title="Parent / Guardian" fields={[
          ['Primary contact', row.parentName],
          ['Phone', row.parentPhone],
          ['Father', pp.father?.name],
          ['Mother', pp.mother?.name],
          ['Guardian', guardian ? `${guardian.name}${guardian.relation ? ` (${guardian.relation})` : ''}` : ''],
        ]} />

        <DrawerSection title="Emergency contact" fields={[
          ['Name', p.emergencyContactName],
          ['Phone', p.emergencyContactPhone],
          ['Relation', p.emergencyContactRelation],
        ]} />
      </div>

      <DrawerFoot>
        <Link className="btn btn-secondary" to={`/admin/student-analytics/${row._id}`}>
          <Icon name="chart" size={15} /> Analytics
        </Link>
        <Button onClick={() => onEdit(row)}><Icon name="pencil" size={15} /> Edit</Button>
      </DrawerFoot>
    </Drawer>
  );
}
