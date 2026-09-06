/**
 * Admin → Academic Years.
 *
 * Built on the frame the account lists use (listParts.jsx): a hero, four tiles
 * that double as the filter, one card holding the toolbar and the table, then
 * the closing panels. A year is a record like any other here — searched, sorted,
 * paged — but it is also a calendar, so the list leads with where today sits
 * inside it rather than with two bare dates.
 *
 * Every year the school has arrives in one call with the counts of what it
 * holds, so the filtering, the sorting and the pager are all local.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, Button, Confirm, Spinner } from '../../components/ui/index';
import Icon, { SchoolScene, SupportScene } from '../../components/ui/icons';
import ImportYearStructureModal from '../../components/ImportYearStructureModal';
import {
  Crumbs, ListHero, ListStats, ListStat, SearchField, ListTable, ListFooter,
  RowActions, IconAction, RowMenu, MenuItem, MenuSep, HelpPanel, PageFoot,
} from './listParts';
import {
  CountCell, InUseDialog, PHASE, RolloverPanel, SessionCell, SetActiveDialog, StatusCell,
  YearCell, YearDrawer, YearForm, phaseOf, todayDay,
} from './academicYearParts';

const SORTS = [
  { value: 'newest',   label: 'Newest first' },
  { value: 'oldest',   label: 'Oldest first' },
  { value: 'name',     label: 'Name (A–Z)' },
  { value: 'students', label: 'Most students' },
];

const TABS = [
  { value: 'all',      label: 'All Years' },
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'upcoming', label: 'Upcoming' },
];

/** A column heading with the sentence explaining it hanging off an ⓘ. */
const Head = ({ children, hint }) => (
  <span className="lhead">
    {children}
    <span className="lhead__hint" title={hint} aria-label={hint} role="img">i</span>
  </span>
);

export default function AcademicYears() {
  const { user: me } = useAuth();
  const { data, loading, error, refetch } = useFetch(api.getAcademicYears);
  const years = useMemo(() => data || [], [data]);

  const [tab,    setTab]    = useState('all');
  const [search, setSearch] = useState('');
  const [term,   setTerm]   = useState('');
  const [sort,   setSort]   = useState('newest');
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(10);

  const [editing,  setEditing]  = useState(null);   // the row, or 'new'
  const [viewing,  setViewing]  = useState(null);
  const [importInto, setImportInto] = useState(null);
  const [activating, setActivating] = useState(null);
  const [del,      setDel]      = useState(null);
  const [inUse,    setInUse]    = useState(null);   // why a delete was refused

  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState('');
  const [deleting, setDeleting] = useState(false);

  // A keystroke is not a search; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim().toLowerCase()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  // One day number for the whole render, so no two cells can disagree about
  // where today falls.
  const today  = todayDay();
  const active = years.find((y) => y.status === 'active') || null;

  const counts = useMemo(() => ({
    total:    years.length,
    active:   years.filter((y) => y.status === 'active').length,
    inactive: years.filter((y) => y.status !== 'active').length,
    upcoming: years.filter((y) => phaseOf(y, today) === 'upcoming').length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [years]);

  // ── The visible list ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const out = years.filter((y) => {
      if (tab === 'active'   && y.status !== 'active') return false;
      if (tab === 'inactive' && y.status === 'active') return false;
      if (tab === 'upcoming' && phaseOf(y, today) !== 'upcoming') return false;
      if (term && !y.yearName.toLowerCase().includes(term)) return false;
      return true;
    });
    const byStart = (a, b) => new Date(b.startDate) - new Date(a.startDate);
    return out.sort((a, b) => {
      switch (sort) {
        case 'oldest':   return -byStart(a, b);
        case 'name':     return a.yearName.localeCompare(b.yearName, 'en', { numeric: true });
        case 'students': return (b.students || 0) - (a.students || 0) || byStart(a, b);
        default:         return byStart(a, b);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, tab, term, sort]);

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
        await api.createAcademicYear(form);
        toast.success(`“${form.yearName}” added`);
      } else {
        await api.updateAcademicYear(editing._id, form);
        toast.success(`“${form.yearName}” saved`);
      }
      setEditing(null);
      refetch();
    } catch (e) { setFormErr(e.message); }
    finally { setSaving(false); }
  };

  const setActive = async () => {
    setSaving(true);
    try {
      await api.setActiveYear(activating._id);
      toast.success(`“${activating.yearName}” is now the active year`);
      setActivating(null);
      setViewing(null);
      refetch();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    setDeleting(true);
    const target = del;
    try {
      await api.deleteAcademicYear(target._id);
      toast.success(`“${target.yearName}” deleted`);
      setDel(null);
      refetch();
    } catch (e) {
      // Refused because the year still holds classes, sections or subjects: the
      // server sends back what is in the way, so show that instead of a toast
      // the admin can do nothing with.
      if (e.data?.code === 'ACADEMIC_YEAR_IN_USE') {
        setDel(null);
        setInUse(e.data);
        refetch();
      } else { toast.error(e.message); }
    } finally { setDeleting(false); }
  };

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = [
    { key: 'year', className: 'aycol-year', label: 'Academic Year', render: (r) => <YearCell year={r} /> },
    {
      key: 'session',
      className: 'aycol-session',
      label: <Head hint="The dates the session covers, and how far through it today is.">Session</Head>,
      render: (r) => <SessionCell year={r} />,
    },
    {
      key: 'status',
      className: 'aycol-status',
      label: <Head hint="Active is the year the school works in — one per school. The chip beside it is where today falls inside the year's own dates.">Status</Head>,
      render: (r) => <StatusCell year={r} />,
    },
    {
      key: 'classes',
      className: 'aycol-num',
      label: 'Classes',
      render: (r) => <CountCell value={r.classes} sub={r.sections ? `${r.sections} sections` : 'no sections'} muted />,
    },
    {
      key: 'students',
      className: 'aycol-num',
      label: <Head hint="Students enrolled in this year's sections.">Students</Head>,
      render: (r) => <CountCell value={r.students} sub={r.subjects ? `${r.subjects} subjects` : 'no subjects'} muted />,
    },
    {
      key: 'actions',
      className: 'ltable__acts',
      label: 'Actions',
      render: (r) => (
        <RowActions>
          {r.status !== 'active' && (
            <Button variant="secondary" size="sm" onClick={() => setActivating(r)}>Set Active</Button>
          )}
          <IconAction icon="eye"    label="View details" onClick={() => setViewing(r)} />
          <IconAction icon="pencil" label="Edit year" variant="edit" onClick={() => { setFormErr(''); setEditing(r); }} />
          <RowMenu>
            <MenuItem icon="upload" onClick={() => setImportInto(r)}>Import structure</MenuItem>
            {/* Neither page takes the year in its URL — they open on whichever
                year is active — so these are plain navigation, not a filter. */}
            <MenuItem icon="grid" to="/admin/classes">Manage classes</MenuItem>
            <MenuItem icon="book" to="/admin/subjects">Manage subjects</MenuItem>
            <MenuSep />
            <MenuItem icon="trash" danger onClick={() => setDel(r)}>Delete year</MenuItem>
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page listpg">
      <Crumbs here="Academic Years" />

      <ListHero
        title="Academic Years"
        subtitle="Set the year the school works in, plan the next one, and carry a year's structure forward."
        quote="One session at a time — the active year is what every class, timetable, attendance sheet and result belongs to."
        scene={SchoolScene}
      />

      <ListStats>
        <ListStat icon="calendar" tone="indigo" value={counts.total} label="Total Years"
          caption="On record for this school" on={tab === 'all'} onClick={() => pick('all')} />
        <ListStat icon="checkCircle" tone="green" value={counts.active} label="Active Year"
          caption={active ? `${active.yearName} — ${PHASE[phaseOf(active, today)].label.toLowerCase()}` : 'None set yet'}
          on={tab === 'active'} onClick={() => pick('active')} />
        <ListStat icon="clock" tone="amber" value={counts.inactive} label="Inactive Years"
          caption="Past and planned sessions" on={tab === 'inactive'} onClick={() => pick('inactive')} />
        <ListStat icon="sunrise" tone="blue" value={counts.upcoming} label="Upcoming Years"
          caption="Starting at a later date" on={tab === 'upcoming'} onClick={() => pick('upcoming')} />
      </ListStats>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Nothing works properly without one: class creation, subject assignment
          and every "this year" lookup resolve against the active year. */}
      {!loading && !active && years.length > 0 && (
        <Alert variant="warning">
          No academic year is active. Class creation, subject assignment and attendance stay
          blocked until one is set — use <b>Set Active</b> on the year the school is in.
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
          <SearchField value={search} onChange={setSearch} placeholder="Search academic year…" />

          <select className={`form-control lsel${sort !== 'newest' ? ' lfsel--on' : ''}`} value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort academic years">
            {SORTS.map((s) => <option key={s.value} value={s.value}>Sort by: {s.label}</option>)}
          </select>

          <span className="ltools__sep" />

          <div className="ltools__acts">
            <Button variant="secondary" onClick={() => setImportInto(active || years[0])}
              disabled={years.length < 2}
              title={years.length < 2 ? 'Two years are needed before one can be copied into another' : undefined}>
              <Icon name="upload" size={16} /> Import Structure
            </Button>
            <Button onClick={() => { setFormErr(''); setEditing('new'); }}>
              <Icon name="plus" size={16} /> Add Academic Year
            </Button>
          </div>
        </div>

        <ListTable
          columns={columns}
          rows={shown}
          startIndex={start}
          emptyIcon={anyFilter ? '🔍' : '📅'}
          emptyTitle={anyFilter ? 'No years match these filters' : 'No academic years yet'}
          emptyMessage={anyFilter
            ? 'Try another tab or search term.'
            : 'Add the session your school is running. Classes, subjects and attendance all hang off it.'}
          emptyAction={anyFilter
            ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
            : <Button onClick={() => { setFormErr(''); setEditing('new'); }}>+ Add Academic Year</Button>}
        />

        <ListFooter
          page={Math.min(page, pages)} pages={pages} total={filtered.length}
          limit={limit} count={shown.length} noun="academic year"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
        />
      </section>

      <div className="lbottom">
        <RolloverPanel
          active={active}
          next={years.find((y) => phaseOf(y, today) === 'upcoming') || null}
          onImport={setImportInto}
        />
        <HelpPanel scene={SupportScene}
          text="Years cannot overlap — one date belongs to exactly one session — and the year the school works in is whichever one is set active. A year that already holds classes cannot be deleted; empty it or leave it as a historical record." />
      </div>

      <PageFoot schoolName={me?.school?.name} />

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}
      <YearForm
        open={!!editing}
        year={editing === 'new' ? null : editing}
        years={years}
        saving={saving}
        error={formErr}
        onClose={() => { setEditing(null); setFormErr(''); }}
        onSave={save}
      />

      <YearDrawer
        year={viewing}
        onClose={() => setViewing(null)}
        onEdit={(r) => { setViewing(null); setFormErr(''); setEditing(r); }}
        onImport={(r) => { setViewing(null); setImportInto(r); }}
        onSetActive={(r) => setActivating(r)}
      />

      <ImportYearStructureModal
        open={!!importInto}
        targetYear={importInto}
        years={years}
        onClose={() => setImportInto(null)}
        onImported={refetch}
      />

      <SetActiveDialog
        year={activating}
        current={activating && active && String(active._id) !== String(activating._id) ? active : null}
        saving={saving}
        onClose={() => setActivating(null)}
        onConfirm={setActive}
      />

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={deleting}
        title="Delete Academic Year"
        message={`Delete “${del?.yearName}”? Only a year holding no classes, sections or subjects can be removed, and this cannot be undone.`} />

      <InUseDialog state={inUse} onClose={() => setInUse(null)} />
    </div>
  );
}
