/**
 * Admin → Classes.
 *
 * Built on the frame the account lists use (listParts.jsx): a hero, four tiles,
 * one card holding the toolbar and the body, then the closing panels. What is
 * different here is the body — a class is a container, not a record, so the
 * default view is a grid of cards showing how full each class is and what it is
 * still missing, with the same rows available as a table for anyone who would
 * rather scan columns.
 *
 * Classes are always scoped to one academic year; the year picker sits in the
 * toolbar and everything else — search, tabs, sort, paging — is local.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, Button, Confirm, Empty, Spinner } from '../../components/ui/index';
import Icon, { StudentsScene, SupportScene } from '../../components/ui/icons';
import BulkClassCreateModal from '../../components/BulkClassCreateModal';
import AddSectionsModal from '../../components/AddSectionsModal';
import {
  Crumbs, ListHero, ListStats, ListStat, SearchField, ListTable, ListFooter,
  RowActions, IconAction, RowMenu, MenuItem, MenuSep, HelpPanel, PageFoot,
} from './listParts';
import {
  ClassCard, ClassCell, ClassForm, CountCell, DeleteClassDialog, HasStudentsDialog,
  SeatCell, SetupPanel, StatusBadge, fillOf, needsSetup, setupIssues,
} from './classParts';

const SORTS = [
  { value: 'grade',    label: 'Grade (low to high)' },
  { value: 'grade_z',  label: 'Grade (high to low)' },
  { value: 'name',     label: 'Name (A–Z)' },
  { value: 'students', label: 'Most students' },
  { value: 'fullest',  label: 'Fullest first' },
];

const TABS = [
  { value: 'all',      label: 'All Classes' },
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'setup',    label: 'Needs setup' },
];

// The view survives a reload — an admin who prefers the table should not have to
// pick it again every time they open the page.
const VIEW_KEY = 'admin.classes.view';
const readView = () => {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
};

/** A column heading with the sentence explaining it hanging off an ⓘ. */
const Head = ({ children, hint }) => (
  <span className="lhead">
    {children}
    <span className="lhead__hint" title={hint} aria-label={hint} role="img">i</span>
  </span>
);

export default function Classes() {
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const { data: years, loading: yearsLoading } = useFetch(api.getAcademicYears);
  const [year, setYear] = useState('');

  // Classes are always scoped to a single year, never "all" — start on the one
  // the school is working in, and fall back to the newest.
  useEffect(() => {
    if (!years?.length || year) return;
    setYear((years.find((y) => y.status === 'active') || years[0])._id);
  }, [years, year]);

  const { data, loading, error, refetch } = useFetch(
    () => (year ? api.getClasses({ academicYear: year }) : Promise.resolve({ data: [] })),
    [year],
  );
  const rows = useMemo(() => data || [], [data]);

  const [tab,    setTab]    = useState('all');
  const [search, setSearch] = useState('');
  const [term,   setTerm]   = useState('');
  const [sort,   setSort]   = useState('grade');
  const [view,   setView]   = useState(readView);
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(15);

  const [editing,  setEditing]  = useState(null);   // the row, or 'new'
  const [bulk,     setBulk]     = useState(false);
  const [sections, setSections] = useState(null);   // class getting more sections
  const [assign,   setAssign]   = useState(false);
  const [del,      setDel]      = useState(null);
  const [blocked,  setBlocked]  = useState(null);   // why a delete was refused

  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState('');
  const [deleting, setDeleting] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ } }, [view]);

  // A keystroke is not a search; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim().toLowerCase()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const yearDoc = (years || []).find((y) => String(y._id) === String(year)) || null;

  const counts = useMemo(() => ({
    total:    rows.length,
    active:   rows.filter((c) => c.status === 'active').length,
    inactive: rows.filter((c) => c.status !== 'active').length,
    setup:    rows.filter(needsSetup).length,
    students: rows.reduce((n, c) => n + (c.studentCount || 0), 0),
    seats:    rows.reduce((n, c) => n + (c.seats || 0), 0),
    sections: rows.reduce((n, c) => n + (c.sectionCount || 0), 0),
  }), [rows]);

  // ── The visible list ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const out = rows.filter((c) => {
      if (tab === 'active'   && c.status !== 'active') return false;
      if (tab === 'inactive' && c.status === 'active') return false;
      if (tab === 'setup'    && !needsSetup(c)) return false;
      if (term && !c.className.toLowerCase().includes(term)) return false;
      return true;
    });
    const byGrade = (a, b) => (Number(a.classNumber) || 0) - (Number(b.classNumber) || 0)
      || a.className.localeCompare(b.className, 'en', { numeric: true });
    return out.sort((a, b) => {
      switch (sort) {
        case 'grade_z':  return -byGrade(a, b);
        case 'name':     return a.className.localeCompare(b.className, 'en', { numeric: true });
        case 'students': return (b.studentCount || 0) - (a.studentCount || 0) || byGrade(a, b);
        case 'fullest':  return fillOf(b).pct - fillOf(a).pct || byGrade(a, b);
        default:         return byGrade(a, b);
      }
    });
  }, [rows, tab, term, sort]);

  const pages     = Math.max(1, Math.ceil(filtered.length / limit));
  const start     = (Math.min(page, pages) - 1) * limit;
  const shown     = filtered.slice(start, start + limit);
  const anyFilter = !!term || tab !== 'all';
  const clearAll  = () => { setSearch(''); setTerm(''); setTab('all'); setPage(1); };
  const pick      = (v) => { setTab(v); setPage(1); };

  // ── Actions ────────────────────────────────────────────────────────────────
  const save = async (form) => {
    setSaving(true); setFormErr('');
    try {
      if (editing === 'new') {
        await api.createClass(form);
        toast.success(`“${form.name}” created`);
      } else {
        await api.updateClass(editing._id, form);
        toast.success(`“${form.name}” saved`);
      }
      setEditing(null);
      refetch();
    } catch (e) { setFormErr(e.message); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (cls) => {
    const next = cls.status === 'active' ? 'inactive' : 'active';
    try {
      await api.updateClass(cls._id, { status: next });
      toast.success(`“${cls.className}” ${next === 'active' ? 'activated' : 'deactivated'}`);
      refetch();
    } catch (e) { toast.error(e.message); }
  };

  const remove = async () => {
    setDeleting(true);
    const target = del;
    try {
      const res = await api.deleteClass(target._id);
      const gone = res?.data?.deletedSections || 0;
      toast.success(gone
        ? `“${target.className}” deleted with ${gone} section${gone === 1 ? '' : 's'}`
        : `“${target.className}” deleted`);
      setDel(null);
      refetch();
    } catch (e) {
      // Refused because students are still placed in it: the server sends back
      // what is in the way, so show that rather than a toast nobody can act on.
      if (e.data?.code === 'CLASS_HAS_STUDENTS') {
        setDel(null);
        setBlocked(e.data);
        refetch();
      } else { toast.error(e.message); }
    } finally { setDeleting(false); }
  };

  const autoAssign = async () => {
    setAssigning(true);
    try {
      const res = await api.autoAssignStudents(year || undefined);
      const { assigned, skipped = 0, sections: secs } = res.data;
      toast.success(`${assigned} student${assigned === 1 ? '' : 's'} assigned to ${secs} section${secs === 1 ? '' : 's'}`
        + `${skipped ? `, ${skipped} already enrolled` : ''}`);
      setAssign(false);
      refetch();
    } catch (e) { toast.error(e.message); }
    finally { setAssigning(false); }
  };

  const openEdit = (cls) => { setFormErr(''); setEditing(cls); };

  // ── Columns (list view) ────────────────────────────────────────────────────
  const columns = [
    { key: 'class', className: 'clscol-name', label: 'Class', render: (c) => <ClassCell cls={c} /> },
    {
      key: 'sections',
      className: 'clscol-num',
      label: 'Sections',
      render: (c) => (
        <CountCell value={c.sectionCount} to={`/admin/classes/${c._id}`}
          sub={c.sectionCount ? `${c.classTeacherCount || 0} with a teacher` : 'none yet'} />
      ),
    },
    {
      key: 'students',
      className: 'clscol-seats',
      label: <Head hint="Students enrolled, against the seats across this class's sections.">Students / Seats</Head>,
      render: (c) => <SeatCell cls={c} />,
    },
    {
      key: 'teachers',
      className: 'clscol-num',
      label: <Head hint="Distinct teachers reaching this class — class teachers and subject teachers together, counted once each.">Teachers</Head>,
      render: (c) => <CountCell value={c.teacherCount} sub={c.subjectCount ? `${c.subjectCount} subjects` : 'no subjects'} />,
    },
    {
      key: 'status',
      className: 'clscol-status',
      label: 'Status',
      render: (c) => (
        <div className="clsstatuscell">
          <StatusBadge status={c.status} />
          {needsSetup(c) && (
            <span className="clschip" title={setupIssues(c).map((i) => i.text).join(' · ')}>
              <Icon name="alert" size={12} /> Needs setup
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      className: 'ltable__acts',
      label: 'Actions',
      render: (c) => (
        <RowActions>
          <IconAction icon="layers" label="View sections" onClick={() => navigate(`/admin/classes/${c._id}`)} />
          <IconAction icon="pencil" label="Edit class" variant="edit" onClick={() => openEdit(c)} />
          <RowMenu>
            <MenuItem icon="layers" to={`/admin/classes/${c._id}`}>Manage sections</MenuItem>
            <MenuItem icon="plus" onClick={() => setSections(c)}>Add sections</MenuItem>
            <MenuItem icon="book" to="/admin/subjects">Assign subjects</MenuItem>
            <MenuSep />
            <MenuItem icon="power" onClick={() => toggleStatus(c)}>
              {c.status === 'active' ? 'Deactivate class' : 'Activate class'}
            </MenuItem>
            <MenuSep />
            <MenuItem icon="trash" danger onClick={() => setDel(c)}>Delete class</MenuItem>
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  if ((loading || yearsLoading) && !rows.length) return <div className="loading-page"><Spinner /></div>;

  const empty = (
    <Empty
      icon={anyFilter ? '🔍' : '🏫'}
      title={anyFilter ? 'No classes match these filters' : `No classes in ${yearDoc?.yearName || 'this year'}`}
      message={anyFilter
        ? 'Try another tab or search term.'
        : 'Build the whole grade range and its sections in one go, or add a single class.'}
      action={anyFilter
        ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
        : (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button onClick={() => setBulk(true)}>Bulk create classes</Button>
            <Button variant="secondary" onClick={() => { setFormErr(''); setEditing('new'); }}>Add one class</Button>
          </div>
        )}
    />
  );

  return (
    <div className="page listpg">
      <Crumbs here="Classes" />

      <ListHero
        title="Classes"
        subtitle="Build the year's classes, keep their sections staffed, and see at a glance which ones are ready to teach."
        quote="A class is only as ready as its sections — seats to sit in, a teacher in front of them, and a subject list to follow."
        scene={StudentsScene}
      />

      <ListStats>
        <ListStat icon="grid" tone="indigo" value={counts.total} label="Total Classes"
          caption={yearDoc ? `In ${yearDoc.yearName}` : 'This academic year'}
          on={tab === 'all'} onClick={() => pick('all')} />
        <ListStat icon="checkCircle" tone="green" value={counts.active} label="Active Classes"
          caption={counts.total ? `${Math.round((counts.active / counts.total) * 100)}% of the year` : 'None yet'}
          on={tab === 'active'} onClick={() => pick('active')} />
        <ListStat icon="alert" tone="amber" value={counts.setup} label="Needs Setup"
          caption="Missing sections, teachers or subjects"
          on={tab === 'setup'} onClick={() => pick('setup')} />
        <ListStat icon="student" tone="blue" value={counts.students} label="Total Students"
          caption={`Across ${counts.sections} section${counts.sections === 1 ? '' : 's'}${counts.seats ? ` · ${counts.seats} seats` : ''}`} />
      </ListStats>

      {error && <Alert variant="danger">{error}</Alert>}

      {!years?.length && !yearsLoading && (
        <Alert variant="warning">
          No academic year exists yet. Classes belong to a year — add one in Academic Years first.
        </Alert>
      )}

      {yearDoc && yearDoc.status !== 'active' && (
        <Alert variant="info">
          Showing <b>{yearDoc.yearName}</b>, which is not the year the school is working in. Changes here
          do not affect the running session.
        </Alert>
      )}

      <section className="card">
        <div className="ltabs">
          {TABS.map((t) => (
            <button key={t.value} type="button" aria-pressed={tab === t.value}
              className={`ltab${tab === t.value ? ' is-on' : ''}`} onClick={() => pick(t.value)}>
              {t.label} ({counts[t.value === 'all' ? 'total' : t.value]})
            </button>
          ))}
        </div>

        <div className="ltools">
          <SearchField value={search} onChange={setSearch} placeholder="Search classes by name…" />

          <select className="form-control lsel" value={year}
            onChange={(e) => { setYear(e.target.value); setPage(1); }} aria-label="Academic year">
            {(years || []).map((y) => (
              <option key={y._id} value={y._id}>
                {y.yearName}{y.status === 'active' ? ' (active)' : ''}
              </option>
            ))}
          </select>

          <select className={`form-control lsel${sort !== 'grade' ? ' lfsel--on' : ''}`} value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort classes">
            {SORTS.map((s) => <option key={s.value} value={s.value}>Sort by: {s.label}</option>)}
          </select>

          {/* Two ways to read the same rows: cards for how full and how ready a
              class is, the table for comparing every class at once. */}
          <div className="clsview" role="group" aria-label="View">
            <button type="button" className={view === 'grid' ? 'is-on' : ''} onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}><Icon name="grid" size={15} /> Grid</button>
            <button type="button" className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')}
              aria-pressed={view === 'list'}><Icon name="menu" size={15} /> List</button>
          </div>

          <span className="ltools__sep" />

          <div className="ltools__acts">
            <Button variant="secondary" onClick={() => setAssign(true)} disabled={!counts.sections}
              title={counts.sections ? undefined : 'Add sections before assigning students'}>
              <Icon name="userPlus" size={16} /> Assign Students
            </Button>
            <Button variant="secondary" onClick={() => setBulk(true)}>
              <Icon name="layers" size={16} /> Bulk Create
            </Button>
            <Button onClick={() => { setFormErr(''); setEditing('new'); }} disabled={!years?.length}>
              <Icon name="plus" size={16} /> Add Class
            </Button>
          </div>
        </div>

        {view === 'grid'
          ? (
            <div className="clsbody">
              {loading
                ? <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>
                : !shown.length
                  ? empty
                  : (
                    <div className="clsgrid">
                      {shown.map((c) => (
                        <ClassCard key={c._id} cls={c}
                          onEdit={openEdit}
                          onDelete={setDel}
                          onToggle={toggleStatus}
                          onSections={setSections} />
                      ))}
                    </div>
                  )}
            </div>
          )
          : (
            <ListTable
              columns={columns}
              rows={shown}
              loading={loading}
              startIndex={start}
              emptyIcon={anyFilter ? '🔍' : '🏫'}
              emptyTitle={anyFilter ? 'No classes match these filters' : 'No classes in this year'}
              emptyMessage={anyFilter ? 'Try another tab or search term.' : 'Add a class to get started.'}
              emptyAction={anyFilter
                ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
                : <Button onClick={() => setBulk(true)}>Bulk create classes</Button>}
            />
          )}

        <ListFooter
          page={Math.min(page, pages)} pages={pages} total={filtered.length}
          limit={limit} count={shown.length} noun="class"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
        />
      </section>

      <div className="lbottom">
        <SetupPanel total={counts.total} needing={counts.setup} onBulk={() => setBulk(true)} />
        <HelpPanel scene={SupportScene}
          text="Students sit in sections, not in classes — a class with no sections has nowhere to put anyone. Build the sections first, give each one a class teacher, then assign the subject list. Deactivating a class keeps all of it; deleting one takes its sections with it." />
      </div>

      <PageFoot schoolName={me?.school?.name} />

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}
      <ClassForm
        open={!!editing}
        cls={editing === 'new' ? null : editing}
        years={years}
        defaultYear={year}
        saving={saving}
        error={formErr}
        onClose={() => { setEditing(null); setFormErr(''); }}
        onSave={save}
      />

      <BulkClassCreateModal
        open={bulk}
        academicYear={year || undefined}
        onClose={() => setBulk(false)}
        onCreated={refetch}
      />

      <AddSectionsModal
        open={!!sections}
        classId={sections?._id}
        className={sections?.className}
        onClose={() => setSections(null)}
        onCreated={refetch}
      />

      <DeleteClassDialog cls={del} deleting={deleting} onClose={() => setDel(null)} onConfirm={remove} />

      <HasStudentsDialog state={blocked} onClose={() => setBlocked(null)} />

      {/* What this actually does: match each student's current class+section by
          NAME to a section of the target year and enrol them there. It is the
          promotion step, not a placement engine — so the dialog says that. */}
      <Confirm
        open={assign}
        onClose={() => setAssign(false)}
        onConfirm={autoAssign}
        loading={assigning}
        title="Assign Students to Sections"
        message={`Every student already sitting in a section is enrolled into the section of the same name in ${yearDoc?.yearName || 'this year'} — Class 5 A into Class 5 A. Anyone already enrolled there, or with no matching section, is left alone. Continue?`}
      />
    </div>
  );
}
