/**
 * Admin → Classes → one class's sections.
 *
 * The same frame as Classes (listParts.jsx) one level down: a hero naming the
 * class, four tiles about its seats, one card holding the toolbar and a grid of
 * section cards, then the closing panels. A section is where the school
 * actually happens, so each card leads with the two things the old page never
 * showed — who the class teacher is, and how much of the class's subject list
 * has a teacher against it in that section.
 *
 * Everything arrives in one call (`GET /admin/classes/:id`), so search, sort and
 * the tabs are local.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, Badge, Button, Confirm, Empty, Modal, Spinner } from '../../components/ui/index';
import Icon, { SchoolScene, SupportScene } from '../../components/ui/icons';
import AddSectionsModal from '../../components/AddSectionsModal';
import SectionCapacityModal from '../../components/SectionCapacityModal';
import {
  Crumbs, ListHero, ListStats, ListStat, SearchField, ListTable, ListFooter,
  RowActions, IconAction, RowMenu, MenuItem, MenuSep, HelpPanel, PageFoot,
} from './listParts';
import {
  CountCell, DeleteSectionDialog, HasStudentsDialog, SeatCell, SectionCard, SectionCell,
  SectionForm, SectionSetupPanel, SeatBar, ShuffleBanner, StatusBadge, TeacherLine,
  countOf, fillOf, needsSetup, seatsOf, setupIssues,
} from './sectionParts';

const SORTS = [
  { value: 'name',     label: 'Section name (A–Z)' },
  { value: 'name_z',   label: 'Section name (Z–A)' },
  { value: 'students', label: 'Most students' },
  { value: 'fullest',  label: 'Fullest first' },
  { value: 'emptiest', label: 'Most room first' },
];

const VIEW_KEY = 'admin.sections.view';
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

export default function Sections() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const { data, loading, error, refetch } = useFetch(() => api.getClassDetail(id), [id]);

  const cls      = data?.class || null;
  const sections = useMemo(() => data?.sections || [], [data]);
  const shuffle  = cls?.sectionShuffle || {};
  const isLocked = !!shuffle.lockedAt;

  const [tab,    setTab]    = useState('all');
  const [search, setSearch] = useState('');
  const [sort,   setSort]   = useState('name');
  const [view,   setView]   = useState(readView);
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(15);

  const [adding,   setAdding]   = useState(false);
  const [several,  setSeveral]  = useState(false);
  const [capacity, setCapacity] = useState(null);
  const [del,      setDel]      = useState(null);
  const [blocked,  setBlocked]  = useState(null);

  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState('');
  const [deleting, setDeleting] = useState(false);

  // Shuffle: the dialog asks the server to count the students and the seats
  // first, so it can refuse before offering the button.
  const [shuffleOpen, setShuffleOpen] = useState(false);
  const [preview, setPreview]   = useState(null);
  const [previewing, setPrevw]  = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [locking, setLocking]   = useState(false);

  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ } }, [view]);

  const classSubjects = cls?.subjectCount || 0;

  const counts = useMemo(() => {
    const students = sections.reduce((n, s) => n + countOf(s), 0);
    const seats    = sections.reduce((n, s) => n + seatsOf(s), 0);
    return {
      total:    sections.length,
      all:      sections.length,
      setup:    sections.filter((s) => needsSetup(s, classSubjects)).length,
      inactive: sections.filter((s) => s.status !== 'active').length,
      students,
      seats,
      pct:      seats ? Math.min(100, Math.round((students / seats) * 100)) : 0,
      avgSeats: sections.length ? Math.round(seats / sections.length) : 0,
      staffed:  sections.filter((s) => s.classTeacher).length,
    };
  }, [sections, classSubjects]);

  // ── The visible list ───────────────────────────────────────────────────────
  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const out = sections.filter((s) => {
      if (tab === 'setup'    && !needsSetup(s, classSubjects)) return false;
      if (tab === 'inactive' && s.status === 'active') return false;
      if (term && !`${s.sectionName} ${s.classTeacher?.name || ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const byName = (a, b) => String(a.sectionName).localeCompare(String(b.sectionName), 'en', { numeric: true });
    return out.sort((a, b) => {
      switch (sort) {
        case 'name_z':   return -byName(a, b);
        case 'students': return countOf(b) - countOf(a) || byName(a, b);
        case 'fullest':  return fillOf(b).pct - fillOf(a).pct || byName(a, b);
        case 'emptiest': return fillOf(a).pct - fillOf(b).pct || byName(a, b);
        default:         return byName(a, b);
      }
    });
  }, [sections, tab, term, sort, classSubjects]);

  const pages     = Math.max(1, Math.ceil(filtered.length / limit));
  const start     = (Math.min(page, pages) - 1) * limit;
  const shown     = filtered.slice(start, start + limit);
  const anyFilter = !!term || tab !== 'all';
  const clearAll  = () => { setSearch(''); setTab('all'); setPage(1); };
  const pick      = (v) => { setTab(v); setPage(1); };

  // ── Actions ────────────────────────────────────────────────────────────────
  const create = async (form) => {
    setSaving(true); setFormErr('');
    try {
      await api.createSection(id, form);
      toast.success(`Section ${form.name} added`);
      setAdding(false);
      refetch();
    } catch (e) { setFormErr(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    setDeleting(true);
    const target = del;
    try {
      await api.deleteSection(target._id);
      toast.success(`Section ${target.sectionName} deleted`);
      setDel(null);
      refetch();
    } catch (e) {
      // Refused because students are still sitting in it — the server says so,
      // and the dialog explains where they are moved from.
      if (e.data?.code === 'SECTION_HAS_STUDENTS') {
        setDel(null);
        setBlocked(e.data);
        refetch();
      } else { toast.error(e.message); }
    } finally { setDeleting(false); }
  };

  const askShuffle = async () => {
    setShuffleOpen(true); setPreview(null); setPrevw(true);
    try {
      // The interceptor resolves to the response BODY — {success, data} — and
      // only useFetch peels that off. This call goes straight to the api module,
      // so the payload is unwrapped here. Without it `canShuffle` read undefined
      // and the dialog refused every shuffle with an empty reason.
      const res = await api.shufflePreview(id);
      setPreview(res?.data ?? res);
    } catch (e) { toast.error(e.message || 'Could not check this class'); setShuffleOpen(false); }
    finally { setPrevw(false); }
  };

  const doShuffle = async () => {
    setShuffling(true);
    try {
      const res = await api.shuffleSections(id);
      const spread = (res?.data?.sections || []).map((s) => `${s.sectionName}: ${s.count}`).join(' · ');
      toast.success(`${res?.data?.students ?? 0} students shuffled — ${spread}`);
      setShuffleOpen(false); setPreview(null);
      refetch();
    } catch (e) { toast.error(e.message); }
    finally { setShuffling(false); }
  };

  const doLock = async () => {
    setLocking(true);
    try {
      await api.lockSectionShuffle(id);
      toast.success('Sections locked for this academic year');
      setLockOpen(false);
      refetch();
    } catch (e) { toast.error(e.message); }
    finally { setLocking(false); }
  };

  // ── Columns (list view) ────────────────────────────────────────────────────
  const columns = [
    { key: 'section', className: 'seccol-name', label: 'Section', render: (s) => <SectionCell sec={s} /> },
    {
      key: 'teacher',
      className: 'seccol-teacher',
      label: <Head hint="The class teacher of this section. A teacher can be class teacher of only one section in a year.">Class Teacher</Head>,
      render: (s) => <TeacherLine sec={s} to={`/admin/sections/${s._id}`} />,
    },
    {
      key: 'seats',
      className: 'seccol-seats',
      label: <Head hint="Students enrolled, against this section's capacity. Capacity is what the shuffle divides students between.">Students / Seats</Head>,
      render: (s) => <SeatCell sec={s} />,
    },
    {
      key: 'subjects',
      className: 'seccol-num',
      label: <Head hint="Subjects of this class that have a teacher assigned in this section.">Subjects</Head>,
      render: (s) => (
        <CountCell value={s.subjectsTaught || 0}
          sub={classSubjects ? `of ${classSubjects} on the class` : 'none on the class'} />
      ),
    },
    {
      key: 'status',
      className: 'seccol-status',
      label: 'Status',
      render: (s) => (
        <div className="secstatuscell">
          <StatusBadge status={s.status} />
          {needsSetup(s, classSubjects) && (
            <span className="secchiptag" title={setupIssues(s, classSubjects).map((i) => i.text).join(' · ')}>
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
      render: (s) => (
        <RowActions>
          <IconAction icon="sliders" label="Set capacity" onClick={() => setCapacity(s)} />
          <RowMenu>
            <MenuItem icon="users" to={`/admin/sections/${s._id}`}>Students &amp; teachers</MenuItem>
            <MenuItem icon="student" to={`/admin/students?classId=${id}&sectionId=${s._id}`}>Open in Students</MenuItem>
            <MenuSep />
            <MenuItem icon="trash" danger onClick={() => setDel(s)}>Delete section</MenuItem>
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  if (loading && !data) return <div className="loading-page"><Spinner /></div>;

  if (error || !cls) {
    return (
      <div className="page listpg">
        <Crumbs here="Sections" trail={[{ to: '/admin/classes', label: 'Classes' }]} />
        <Alert variant="danger">{error || 'This class could not be found.'}</Alert>
        <div><Link to="/admin/classes" className="btn btn-secondary">Back to Classes</Link></div>
      </div>
    );
  }

  const canShuffle = sections.length >= 2 && !isLocked;

  return (
    <div className="page listpg">
      <div className="sectop">
        <Crumbs here={cls.className} trail={[{ to: '/admin/classes', label: 'Classes' }]} />
        <Link to="/admin/classes" className="btn btn-secondary btn-sm">
          <Icon name="chevronLeft" size={14} /> Back to Classes
        </Link>
      </div>

      <ListHero
        title={`${cls.className} — Sections`}
        subtitle={`Capacity, class teachers and who sits where${cls.academicYear?.yearName ? `, in ${cls.academicYear.yearName}` : ''}.`}
        quote="Students sit in sections, not in classes — the seats, the class teacher and the subject teachers all live at this level."
        scene={SchoolScene}
      />

      <ListStats>
        <ListStat icon="layers" tone="indigo" value={counts.total} label="Total Sections"
          caption={`Under ${cls.className}`} on={tab === 'all'} onClick={() => pick('all')} />
        <ListStat icon="student" tone="green" value={counts.students} label="Total Students"
          caption="Enrolled across all sections" />
        <ListStat icon="checkSquare" tone="purple" value={counts.seats} label="Total Capacity"
          caption={counts.total ? `${counts.avgSeats} per section on average` : 'No sections yet'} />
        <ListStat icon="clock" tone="amber" value={`${counts.pct}%`} label="Seat Occupancy"
          caption={(
            <>
              {counts.students} of {counts.seats} seats filled
              <span className="secmeter" aria-hidden><span style={{ width: `${counts.pct}%` }} /></span>
            </>
          )} />
      </ListStats>

      <ShuffleBanner shuffle={shuffle} />

      {cls.status !== 'active' && (
        <Alert variant="info">
          {cls.className} is {cls.status}. Its sections are kept exactly as they are and stay out of the
          active class list until it is activated again.
        </Alert>
      )}

      <section className="card">
        <div className="ltabs">
          <button type="button" className={`ltab${tab === 'all' ? ' is-on' : ''}`}
            aria-pressed={tab === 'all'} onClick={() => pick('all')}>All Sections ({counts.total})</button>
          <button type="button" className={`ltab${tab === 'setup' ? ' is-on' : ''}`}
            aria-pressed={tab === 'setup'} onClick={() => pick('setup')}>Needs setup ({counts.setup})</button>
          <button type="button" className={`ltab${tab === 'inactive' ? ' is-on' : ''}`}
            aria-pressed={tab === 'inactive'} onClick={() => pick('inactive')}>Inactive ({counts.inactive})</button>
        </div>

        <div className="ltools">
          <SearchField value={search} onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search sections or class teachers…" />

          <select className={`form-control lsel${sort !== 'name' ? ' lfsel--on' : ''}`} value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort sections">
            {SORTS.map((s) => <option key={s.value} value={s.value}>Sort by: {s.label}</option>)}
          </select>

          <div className="clsview" role="group" aria-label="View">
            <button type="button" className={view === 'grid' ? 'is-on' : ''} onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}><Icon name="grid" size={15} /> Grid</button>
            <button type="button" className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')}
              aria-pressed={view === 'list'}><Icon name="menu" size={15} /> List</button>
          </div>

          <span className="ltools__sep" />

          <div className="ltools__acts">
            {canShuffle && (
              <Button variant="secondary" onClick={askShuffle}>
                <Icon name="repeat" size={16} /> Shuffle Sections
              </Button>
            )}
            {!isLocked && shuffle.shuffledAt && (
              <Button variant="secondary" onClick={() => setLockOpen(true)}>
                <Icon name="key" size={16} /> Lock
              </Button>
            )}
            <Button variant="secondary" onClick={() => setSeveral(true)}>
              <Icon name="layers" size={16} /> Add Several
            </Button>
            <Button onClick={() => { setFormErr(''); setAdding(true); }}>
              <Icon name="plus" size={16} /> Add Section
            </Button>
          </div>
        </div>

        {view === 'grid'
          ? (
            <div className="clsbody">
              {!shown.length
                ? (
                  <Empty
                    icon={anyFilter ? '🔍' : '🪑'}
                    title={anyFilter ? 'No sections match' : `No sections in ${cls.className}`}
                    message={anyFilter
                      ? 'Try another tab or search term.'
                      : 'Students are placed in sections, so this class cannot take anyone until it has at least one.'}
                    action={anyFilter
                      ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
                      : (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <Button onClick={() => setSeveral(true)}>Add several sections</Button>
                          <Button variant="secondary" onClick={() => { setFormErr(''); setAdding(true); }}>Add one</Button>
                        </div>
                      )}
                  />
                )
                : (
                  <div className="clsgrid">
                    {shown.map((s) => (
                      <SectionCard key={s._id} sec={s} classId={id} classSubjects={classSubjects}
                        onCapacity={setCapacity} onDelete={setDel} />
                    ))}
                  </div>
                )}
            </div>
          )
          : (
            <ListTable
              columns={columns}
              rows={shown}
              startIndex={start}
              emptyIcon={anyFilter ? '🔍' : '🪑'}
              emptyTitle={anyFilter ? 'No sections match' : 'No sections yet'}
              emptyMessage={anyFilter ? 'Try another tab or search term.' : 'Add a section before placing students.'}
              emptyAction={anyFilter
                ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
                : <Button onClick={() => setSeveral(true)}>Add several sections</Button>}
            />
          )}

        <ListFooter
          page={Math.min(page, pages)} pages={pages} total={filtered.length}
          limit={limit} count={shown.length} noun="section"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
        />
      </section>

      <div className="lbottom">
        <SectionSetupPanel total={counts.total} needing={counts.setup} classSubjects={classSubjects}
          onAdd={() => { setFormErr(''); setAdding(true); }} />
        <HelpPanel scene={SupportScene}
          text="Capacity decides how many students a section can take and how the shuffle divides them. A teacher can be class teacher of only one section per year, but can teach subjects in as many as you like. A section has to be empty before it can be deleted." />
      </div>

      <PageFoot schoolName={me?.school?.name} />

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}
      <SectionForm
        open={adding}
        sections={sections}
        className={cls.className}
        saving={saving}
        error={formErr}
        onClose={() => { setAdding(false); setFormErr(''); }}
        onSave={create}
      />

      <AddSectionsModal
        open={several}
        classId={id}
        className={cls.className}
        onClose={() => setSeveral(false)}
        onCreated={refetch}
      />

      <SectionCapacityModal
        open={!!capacity}
        section={capacity}
        onClose={() => setCapacity(null)}
        onSaved={refetch}
      />

      <DeleteSectionDialog sec={del} className={cls.className} deleting={deleting}
        onClose={() => setDel(null)} onConfirm={remove} />

      <HasStudentsDialog state={blocked} classId={id} onClose={() => setBlocked(null)} />

      {/* Shuffle. The counts come from the server, and when the students do not
          fit in the seats the dialog says so instead of offering the action. */}
      <Modal
        open={shuffleOpen}
        onClose={() => { setShuffleOpen(false); setPreview(null); }}
        title={preview && !preview.canShuffle ? 'Unable to shuffle' : `Shuffle ${cls.className}`}
        footer={<>
          <Button variant="secondary" onClick={() => { setShuffleOpen(false); setPreview(null); }}>
            {preview && !preview.canShuffle ? 'Close' : 'Cancel'}
          </Button>
          {preview?.canShuffle && <Button loading={shuffling} onClick={doShuffle}>Shuffle now</Button>}
        </>}>
        {previewing && <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}><Spinner /></div>}

        {!previewing && preview && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <Badge variant="info">{preview.students} students to place</Badge>
              <Badge variant={preview.students > preview.capacity ? 'danger' : 'success'}>
                {preview.capacity} seats across {preview.sectionCount} sections
              </Badge>
            </div>

            <div className="secplan">
              {(preview.sections || []).map((s) => (
                <div className="secplan__row" key={s._id}>
                  <b>{s.sectionName}</b>
                  <SeatBar sec={{ ...s, studentCount: s.currentCount }} showLabel={false} />
                  <span>{s.currentCount} / {s.maxStudents || '—'}</span>
                </div>
              ))}
            </div>

            {preview.canShuffle
              ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', lineHeight: 1.6, marginTop: 14 }}>
                  All {preview.students} students of {preview.className} — including any admitted but not placed
                  yet — are redistributed at random within each section&rsquo;s capacity. Existing roll numbers are
                  cleared so they can be reassigned afterwards. Repeat as often as you like until the sections
                  are locked.
                </p>
              )
              : <div style={{ marginTop: 14 }}><Alert variant="danger">{preview.reason}</Alert></div>}
          </>
        )}
      </Modal>

      <Confirm open={lockOpen} onClose={() => setLockOpen(false)} onConfirm={doLock} loading={locking}
        title="Lock Sections"
        message={`Freeze the section allocation for ${cls.className} for this academic year. Shuffling stops being possible — individual students can still be moved by hand. This cannot be undone.`} />
    </div>
  );
}
