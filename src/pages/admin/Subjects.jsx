/**
 * Admin → Subjects.
 *
 * The same frame as the other academic lists (listParts.jsx): a hero, four
 * tiles that double as the filter, one card holding the toolbar and the table,
 * then the closing panels.
 *
 * The thing to understand about this screen is the year picker. A subject row
 * belongs to ONE academic year — every year owns its own "Hindi" — so the
 * picker is not a filter over a shared catalogue, it chooses which catalogue is
 * being edited. What it also decides is what "in use" means: a subject is in
 * use when a class of that year carries it and a section has a teacher for it,
 * which the server works out and returns per row.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, Button, Spinner } from '../../components/ui/index';
import Icon, { TeachersScene, SupportScene } from '../../components/ui/icons';
import ImportYearStructureModal from '../../components/ImportYearStructureModal';
import {
  Crumbs, ListHero, ListStats, ListStat, SearchField, ListTable, ListFooter,
  RowActions, IconAction, RowMenu, MenuItem, MenuSep, HelpPanel, PageFoot,
} from './listParts';
import {
  DeleteDialog, InUseDialog, NextStepsPanel, StatusCell, SubjectCell, SubjectForm,
  TeacherChips, TypeBadge, TYPES, UsageCell, teacherCount,
} from './subjectParts';

const SORTS = [
  { value: 'name',     label: 'Name (A–Z)' },
  { value: 'name_z',   label: 'Name (Z–A)' },
  { value: 'type',     label: 'Type' },
  { value: 'used',     label: 'Most used' },
  { value: 'teachers', label: 'Most teachers' },
];

const TABS = [
  { value: 'all',    label: 'All Subjects' },
  { value: 'inUse',  label: 'In use' },
  { value: 'unused', label: 'Not used' },
];

/** A column heading with the sentence explaining it hanging off an ⓘ. */
const Head = ({ children, hint }) => (
  <span className="lhead">
    {children}
    <span className="lhead__hint" title={hint} aria-label={hint} role="img">i</span>
  </span>
);

export default function Subjects() {
  const { user: me } = useAuth();
  const { data: years, loading: yearsLoading } = useFetch(api.getAcademicYears);
  const [year, setYear] = useState('');

  // Start on the year the school is working in, and fall back to the newest.
  useEffect(() => {
    if (!years?.length || year) return;
    setYear((years.find((y) => y.status === 'active') || years[0])._id);
  }, [years, year]);

  const { data, meta, loading, error, refetch } = useFetch(
    () => (year ? api.getSubjects({ academicYear: year }) : Promise.resolve({ data: [] })),
    [year],
  );
  const rows = useMemo(() => data || [], [data]);

  const [tab,    setTab]    = useState('all');
  const [search, setSearch] = useState('');
  const [term,   setTerm]   = useState('');
  const [type,   setType]   = useState('');
  const [sort,   setSort]   = useState('name');
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(10);

  const [editing,  setEditing]  = useState(null);   // the row, or 'new'
  const [importOpen, setImportOpen] = useState(false);
  const [del,      setDel]      = useState(null);
  const [blocked,  setBlocked]  = useState(null);   // why a delete was refused

  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState('');
  const [deleting, setDeleting] = useState(false);

  // The teacher pool for the form, fetched once and kept.
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  useEffect(() => {
    if (!editing || teachers.length) return;
    setTeachersLoading(true);
    api.getTeachers({ limit: 200, status: 'active' })
      .then((res) => setTeachers(res?.data?.data || res?.data || []))
      .catch(() => {})
      .finally(() => setTeachersLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // A keystroke is not a search; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim().toLowerCase()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const yearDoc  = (years || []).find((y) => String(y._id) === String(year)) || null;
  const yearName = meta?.academicYear?.yearName || yearDoc?.yearName || 'this year';

  const counts = useMemo(() => ({
    total:    rows.length,
    inUse:    rows.filter((s) => s.usage?.inUse).length,
    unused:   rows.filter((s) => !s.usage?.inUse).length,
    teachers: teacherCount(rows),
  }), [rows]);

  // ── The visible list ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const out = rows.filter((s) => {
      if (tab === 'inUse'  && !s.usage?.inUse) return false;
      if (tab === 'unused' && s.usage?.inUse)  return false;
      if (type && (s.type || 'theory') !== type) return false;
      if (term && !`${s.subjectName} ${s.subjectCode || ''} ${s.description || ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const byName = (a, b) => a.subjectName.localeCompare(b.subjectName, 'en', { numeric: true });
    return out.sort((a, b) => {
      switch (sort) {
        case 'name_z':   return -byName(a, b);
        case 'type':     return String(a.type || '').localeCompare(String(b.type || '')) || byName(a, b);
        case 'used':     return (b.usage?.classCount || 0) - (a.usage?.classCount || 0) || byName(a, b);
        case 'teachers': return (b.teachers?.length || 0) - (a.teachers?.length || 0) || byName(a, b);
        default:         return byName(a, b);
      }
    });
  }, [rows, tab, term, type, sort]);

  const pages     = Math.max(1, Math.ceil(filtered.length / limit));
  const start     = (Math.min(page, pages) - 1) * limit;
  const shown     = filtered.slice(start, start + limit);
  const anyFilter = !!term || !!type || tab !== 'all';
  const clearAll  = () => { setSearch(''); setTerm(''); setType(''); setTab('all'); setPage(1); };
  const pick      = (v) => { setTab(v); setPage(1); };

  // ── Actions ────────────────────────────────────────────────────────────────
  const save = async (form) => {
    setSaving(true); setFormErr('');
    try {
      if (editing === 'new') {
        // Created INTO the year the screen is showing, not the active one.
        await api.createSubject({ ...form, academicYear: year || undefined });
        toast.success(`“${form.name}” added to ${yearName}`);
      } else {
        await api.updateSubject(editing._id, form);
        toast.success(`“${form.name}” saved`);
      }
      setEditing(null);
      refetch();
    } catch (e) { setFormErr(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    setDeleting(true);
    const target = del;
    try {
      await api.deleteSubject(target._id);
      toast.success(`“${target.subjectName}” deleted`);
      setDel(null);
      refetch();
    } catch (e) {
      // Refused because classes still carry it: the server sends back what is
      // in the way, so show that instead of a toast nobody can act on.
      if (e.data?.code === 'SUBJECT_IN_USE') {
        setDel(null);
        setBlocked(e.data);
        refetch();
      } else { toast.error(e.message); }
    } finally { setDeleting(false); }
  };

  const openEdit = (s) => { setFormErr(''); setEditing(s); };

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = [
    { key: 'subject', className: 'subcol-name', label: 'Subject', render: (s) => <SubjectCell subject={s} /> },
    {
      key: 'code',
      className: 'subcol-code',
      label: 'Code',
      render: (s) => (s.subjectCode ? <code className="subcode">{s.subjectCode}</code> : <span className="lnone">—</span>),
    },
    { key: 'type', className: 'subcol-type', label: 'Type', render: (s) => <TypeBadge type={s.type} /> },
    {
      key: 'teachers',
      className: 'subcol-teachers',
      label: <Head hint="Teachers attached to this subject in the catalogue — the pool a section picks from. It does not put anyone in front of a class on its own.">Teachers</Head>,
      render: (s) => <TeacherChips teachers={s.teachers} />,
    },
    {
      key: 'usage',
      className: 'subcol-usage',
      label: <Head hint="Where the subject is actually taught this year: classes that carry it, sections with a teacher for it.">Used in {yearName}</Head>,
      render: (s) => <UsageCell subject={s} yearName={yearName} />,
    },
    { key: 'status', className: 'subcol-status', label: 'Status', render: (s) => <StatusCell subject={s} /> },
    {
      key: 'actions',
      className: 'ltable__acts',
      label: 'Actions',
      render: (s) => (
        <RowActions>
          <IconAction icon="pencil" label="Edit subject" variant="edit" onClick={() => openEdit(s)} />
          <RowMenu>
            <MenuItem icon="grid" to="/admin/classes">Assign to a class</MenuItem>
            <MenuItem icon="clock" to="/admin/timetable">Open the timetable</MenuItem>
            <MenuSep />
            <MenuItem icon="trash" danger onClick={() => setDel(s)}>Delete subject</MenuItem>
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  if ((loading || yearsLoading) && !rows.length) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page listpg">
      <Crumbs here="Subjects" />

      <ListHero
        title="Subjects"
        subtitle="Keep each year's subject list, say who can teach what, and see which subjects are actually being taught."
        quote="A subject is only real once a class carries it and somebody teaches it — the catalogue is where that starts."
        scene={TeachersScene}
      />

      <ListStats>
        <ListStat icon="book" tone="indigo" value={counts.total} label="Total Subjects"
          caption={`In ${yearName}`} on={tab === 'all'} onClick={() => pick('all')} />
        <ListStat icon="checkCircle" tone="green" value={counts.inUse} label="In Use"
          caption={counts.total ? `${Math.round((counts.inUse / counts.total) * 100)}% of the catalogue` : 'Nothing yet'}
          on={tab === 'inUse'} onClick={() => pick('inUse')} />
        <ListStat icon="alert" tone="amber" value={counts.unused} label="Not Used"
          caption="Not carried by any class yet"
          on={tab === 'unused'} onClick={() => pick('unused')} />
        <ListStat icon="users" tone="blue" value={counts.teachers} label="Subject Teachers"
          caption="Named across all subjects" />
      </ListStats>

      {error && <Alert variant="danger">{error}</Alert>}

      {!years?.length && !yearsLoading && (
        <Alert variant="warning">
          No academic year exists yet. Subjects belong to a year — add one in Academic Years first.
        </Alert>
      )}

      {yearDoc && yearDoc.status !== 'active' && (
        <Alert variant="info">
          Showing the <b>{yearDoc.yearName}</b> catalogue, which is not the year the school is working in.
          Adding, editing or deleting here affects that year alone.
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
          <SearchField value={search} onChange={setSearch} placeholder="Search subjects by name or code…" />

          <select className="form-control lsel" value={year}
            onChange={(e) => { setYear(e.target.value); setPage(1); }} aria-label="Academic year">
            {(years || []).map((y) => (
              <option key={y._id} value={y._id}>
                {y.yearName}{y.status === 'active' ? ' (active)' : ''}
              </option>
            ))}
          </select>

          <select className={`form-control lsel${type ? ' lfsel--on' : ''}`} value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Subject type">
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <select className={`form-control lsel${sort !== 'name' ? ' lfsel--on' : ''}`} value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort subjects">
            {SORTS.map((s) => <option key={s.value} value={s.value}>Sort by: {s.label}</option>)}
          </select>

          <span className="ltools__sep" />

          <div className="ltools__acts">
            {/* The dialog owns both years, so this only needs two to exist. */}
            <Button variant="secondary" disabled={(years || []).length < 2}
              onClick={() => setImportOpen(true)}
              title={(years || []).length < 2 ? 'Another year is needed to copy from' : undefined}>
              <Icon name="upload" size={16} /> Import from another year
            </Button>
            <Button onClick={() => { setFormErr(''); setEditing('new'); }} disabled={!years?.length}>
              <Icon name="plus" size={16} /> Add Subject
            </Button>
          </div>
        </div>

        <ListTable
          columns={columns}
          rows={shown}
          loading={loading}
          startIndex={start}
          emptyIcon={anyFilter ? '🔍' : '📚'}
          emptyTitle={anyFilter
            ? 'No subjects match these filters'
            : `No subjects in ${yearName} yet`}
          emptyMessage={anyFilter
            ? 'Try another tab, type or search term.'
            : 'Each year has its own list. Copy last year’s across, or add the first one by hand.'}
          emptyAction={anyFilter
            ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
            : (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {(years || []).length > 1 && (
                  <Button onClick={() => setImportOpen(true)}>Import from another year</Button>
                )}
                <Button variant="secondary" onClick={() => { setFormErr(''); setEditing('new'); }}>Add a subject</Button>
              </div>
            )}
        />

        <ListFooter
          page={Math.min(page, pages)} pages={pages} total={filtered.length}
          limit={limit} count={shown.length} noun="subject"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
        />
      </section>

      <div className="lbottom">
        <NextStepsPanel unused={counts.unused} yearName={yearName} />
        <HelpPanel scene={SupportScene}
          text="Each academic year keeps its own subject list, so editing or deleting one here affects that year alone — use Import from another year to carry a list across. Teachers listed against a subject are the pool a section chooses from; who actually teaches it is set on the section itself." />
      </div>

      <PageFoot schoolName={me?.school?.name} />

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}
      <SubjectForm
        open={!!editing}
        subject={editing === 'new' ? null : editing}
        yearName={yearName}
        teachers={teachers}
        teachersLoading={teachersLoading}
        saving={saving}
        error={formErr}
        onClose={() => { setEditing(null); setFormErr(''); }}
        onSave={save}
      />

      {/* Opened from Subjects, so it starts on the subject list alone. The
          curriculum is left off on purpose: importing a subject list must not
          also decide which class teaches what. Both are still there to tick if
          the year needs building out too. */}
      <ImportYearStructureModal
        open={importOpen}
        targetYear={yearDoc}
        years={years}
        defaultParts={{ classes: false, sections: false, subjects: true, curriculum: false, assignments: false }}
        onClose={() => setImportOpen(false)}
        onImported={refetch}
      />

      <DeleteDialog subject={del} yearName={yearName} deleting={deleting}
        onClose={() => setDel(null)} onConfirm={remove} />

      <InUseDialog state={blocked} onClose={() => setBlocked(null)} />
    </div>
  );
}
