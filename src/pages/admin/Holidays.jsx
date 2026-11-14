/**
 * Admin → Holidays.
 *
 * Built on the frame the other admin lists use (listParts.jsx): a hero, four
 * tiles that are also the filter, one card holding the toolbar and the table,
 * and a rail beside it. A holiday is a record like any other here — searched,
 * filtered, paged — but it is also a date, so the calendar sits next to the
 * list and marks the days it holds.
 *
 * Two sets of holidays live behind the tabs. **Mine** is what the server says
 * applies to the person looking (school-wide holidays; class-specific ones go
 * to those classes' students and parents, never to staff). **All** is the
 * school's calendar, which is the one an admin manages. Both arrive in one call
 * each, so the filtering, the counting and the pager are all local.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, Button, Confirm, Empty, Spinner } from '../../components/ui/index';
import Icon, { SchoolScene, SupportScene } from '../../components/ui/icons';
import {
  Crumbs, ListHero, ListStats, ListStat, SearchField, ListTable, ListFooter,
  RowActions, IconAction, SelectionBar, useSelection, HelpPanel, PageFoot, ListTabs} from './listParts';
import {
  AppliesCell, DateCell, HolidayCards, HolidayCell, HolidayDialog, HolidayForm, ImportDialog, MineList,
  MonthCalendar, STATUS, TypeChip, TypesDialog, TypesPanel, UpcomingPanel,
  dayKey, daysOf, formFrom, spanDays, statusOf, today,
  clashesWith, duplicateAmong, movedFrom,
} from './holidayParts';

const TABS = [
  { value: 'all',      label: 'All holidays' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ongoing',  label: 'On now' },
  { value: 'past',     label: 'Past' },
];

// Two different questions hide in "latest": the holiday furthest ahead on the
// calendar, and the one typed in most recently. Each has its own order, and
// the labels say which is which.
const SORTS = [
  { value: 'date',    label: 'Holiday date (earliest first)' },
  { value: 'dateDsc', label: 'Holiday date (latest first)' },
  { value: 'added',   label: 'Recently added first' },
  { value: 'name',    label: 'Name (A–Z)' },
  { value: 'length',  label: 'Longest first' },
];

export default function Holidays() {
  const { user: me } = useAuth();

  // Which academic year is on screen (Nov 2026): this year to begin with, never
  // every year at once — 'current' until the server says which one that is.
  const [year, setYear] = useState('current');
  const { data: mineData,  loading: mineLoading }  = useFetch(
    () => api.getMyHolidays({ year: year === 'current' ? undefined : year }), [year]);
  const { data: allData, meta: allMeta, loading: allLoading, error, refetch } = useFetch(api.getHolidays);
  const { data: typeData,  refetch: refetchTypes } = useFetch(api.getHolidayTypes);
  const { data: classData } = useFetch(api.getClasses);

  const everyYear = useMemo(() => allData || [], [allData]);
  const years       = allMeta?.years || [];
  const currentYear = allMeta?.currentYear || '';
  const yearId      = year === 'current' ? currentYear : year;
  // The school's calendar for the year on screen. A holiday written before
  // holidays carried a year counts as this year's, as it does for everyone else.
  const all = useMemo(() => (year === 'all' || !yearId ? everyYear : everyYear.filter((h) => {
    const id = h.academicYear?._id ? String(h.academicYear._id) : '';
    return id ? id === yearId : yearId === currentYear;
  })), [everyYear, year, yearId, currentYear]);
  const mine    = useMemo(() => mineData || [], [mineData]);
  const types   = useMemo(() => (Array.isArray(typeData) ? typeData : []), [typeData]);
  const classes = useMemo(() => classData || [], [classData]);
  const classNames = useMemo(
    () => Object.fromEntries(classes.map((c) => [String(c._id), c.className])),
    [classes],
  );

  const [view,   setView]   = useState('manage');   // manage | mine
  const [tab,    setTab]    = useState('all');
  const [search, setSearch] = useState('');
  const [term,   setTerm]   = useState('');
  const [type,   setType]   = useState('');
  // Who a holiday is for: '' every holiday, 'school' the school-wide ones,
  // 'classes' the ones that reach only some classes.
  const [scope,  setScope]  = useState('');
  const [sort,   setSort]   = useState('date');
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(10);

  const [month, setMonth] = useState(() => { const n = new Date(); return [n.getFullYear(), n.getMonth()]; });

  const [viewing, setViewing] = useState(null);     // a holiday opened from a phone card
  const [editing, setEditing] = useState(null);     // 'new' | holiday
  const [form,    setForm]    = useState(() => formFrom(null, []));
  const [saving,  setSaving]  = useState(false);
  const [formErr, setFormErr] = useState('');
  const [del,     setDel]     = useState(null);
  const [bulkDel, setBulkDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [typesOpen, setTypesOpen] = useState(false);
  const [typeSaving, setTypeSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);

  // A request per keystroke is a request per keystroke; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const source = view === 'mine' ? mine : all;
  const loading = view === 'mine' ? mineLoading : allLoading;

  // ── Counts ─────────────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { total: source.length, upcoming: 0, ongoing: 0, past: 0, days: 0, scoped: 0 };
    source.forEach((h) => {
      c[statusOf(h)] += 1;
      c.days += spanDays(h);
      if ((h.applicability?.scope || 'all') === 'specific_classes') c.scoped += 1;
    });
    return c;
  }, [source]);

  const typeCounts = useMemo(() => {
    const c = {};
    all.forEach((h) => { c[h.type] = (c[h.type] || 0) + 1; });
    return c;
  }, [all]);
  // A type still in use in ANY year cannot be deleted, so the types dialog
  // counts every year, not just the one on screen.
  const typeCountsEver = useMemo(() => {
    const c = {};
    everyYear.forEach((h) => { c[h.type] = (c[h.type] || 0) + 1; });
    return c;
  }, [everyYear]);

  // ── The list ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = term.toLowerCase();
    let rows = source.filter((h) => {
      if (tab !== 'all' && statusOf(h) !== tab) return false;
      if (type && h.type !== type) return false;
      if (scope) {
        const forClasses = (h.applicability?.scope || 'all') === 'specific_classes';
        if (scope === 'classes' ? !forClasses : forClasses) return false;
      }
      if (!q) return true;
      return [h.name, h.description, h.type].filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    // Two rows the chosen order cannot separate (the same day, the same
    // length) come newest-added first, so a holiday just saved is never
    // hidden behind an older one it ties with.
    const added = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    rows = [...rows].sort((a, b) => {
      if (sort === 'added')  return added(a, b);
      if (sort === 'name')   return a.name.localeCompare(b.name) || added(a, b);
      if (sort === 'length') return spanDays(b) - spanDays(a) || dayKey(a.startDate).localeCompare(dayKey(b.startDate)) || added(a, b);
      const cmp = dayKey(a.startDate).localeCompare(dayKey(b.startDate));
      return (sort === 'dateDsc' ? -cmp : cmp) || added(a, b);
    });
    return rows;
  }, [source, tab, type, scope, term, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / limit));
  const start = (Math.min(page, pages) - 1) * limit;
  const shown = filtered.slice(start, start + limit);
  const anyFilter = !!term || tab !== 'all' || !!type || !!scope;

  const queryKey = `${view}|${tab}|${type}|${year}|${scope}|${term}|${sort}|${page}|${limit}`;
  const selection = useSelection(shown, queryKey);

  // The calendar always shows the whole school's calendar for the open month —
  // it is a calendar, not a copy of the filtered table.
  const byDay = useMemo(() => {
    const map = {};
    source.forEach((h) => daysOf(h).forEach((d) => { (map[d] ||= []).push(h); }));
    return map;
  }, [source]);

  const upcoming = useMemo(
    () => source.filter((h) => statusOf(h) !== 'past')
      .sort((a, b) => dayKey(a.startDate).localeCompare(dayKey(b.startDate)))
      .slice(0, 5),
    [source],
  );
  const next30 = useMemo(() => {
    const t = today();
    const limitKey = new Date(Date.parse(`${t}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
    return source.filter((h) => {
      const s = dayKey(h.startDate);
      const e = dayKey(h.endDate) || s;
      return e >= t && s <= limitKey;
    }).length;
  }, [source]);

  const pick = (value) => { setTab(value); setPage(1); };
  // The four tiles are four views of one list: each one sets its own filter
  // and clears the other tiles' — "Upcoming" never quietly means "upcoming
  // and class-specific" because of an earlier press.
  const tileView = (nextTab, nextScope = '') => {
    setTab(nextTab); setScope(nextScope); setPage(1);
    if (view !== 'manage') setView('manage');
  };
  // The year is which calendar is open, not a filter on it — clearing the
  // filters leaves it where it is.
  const clearAll = () => {
    setTab('all'); setSearch(''); setTerm(''); setType(''); setScope(''); setPage(1);
  };
  const pickYear = (v) => { setYear(v); setPage(1); };

  // ── Create / edit ──────────────────────────────────────────────────────────
  const openNew = () => { setFormErr(''); setForm(formFrom(null, types)); setEditing('new'); };
  const openEdit = (h) => { setFormErr(''); setForm(formFrom(h, types)); setEditing(h); };

  const save = async (e) => {
    e.preventDefault();
    const end = form.mode === 'single' ? form.startDate : (form.endDate || form.startDate);
    if (!form.name.trim())  return setFormErr('Give the holiday a name.');
    if (!form.startDate)    return setFormErr('Pick a date.');
    if (!form.type)         return setFormErr('Choose a holiday type.');
    if (end < form.startDate) return setFormErr('The last day cannot be before the first.');
    if (form.scope === 'specific_classes' && !form.classes.length)
      return setFormErr('Choose at least one class, or set it to the whole school.');
    // The same holiday twice — the server refuses it too; said here first.
    const was = editing === 'new' ? null : editing;
    const shape = { type: form.type, startKey: form.startDate, endKey: end, scope: form.scope, classes: form.classes };
    const twin = movedFrom(was, shape) ? duplicateAmong(clashesWith(everyYear, form.startDate, end, was?._id), shape) : null;
    if (twin) return setFormErr(`“${twin.name}” is already on the calendar with the same date and type. A holiday with the same date and type cannot be added again.`);

    const body = {
      name: form.name.trim(),
      startDate: form.startDate,
      endDate: end,
      type: form.type,
      description: form.description.trim(),
      applicability: { scope: form.scope, classes: form.scope === 'specific_classes' ? form.classes : [] },
    };

    setSaving(true);
    try {
      if (editing === 'new') {
        await api.createHoliday({ ...body, notify: form.notify });
        toast.success(form.notify ? 'Holiday added — everyone notified' : 'Holiday added');
      } else {
        await api.updateHoliday(editing._id, body);
        toast.success('Holiday updated');
      }
      setEditing(null);
      refetch();
    } catch (err) {
      setFormErr(err.response?.data?.message || err.message);
    } finally { setSaving(false); }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteHoliday(del._id);
      toast.success(`“${del.name}” deleted`);
      setDel(null);
      refetch();
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setDeleting(false); }
  };

  const removeSelected = async () => {
    setDeleting(true);
    try {
      const res = await api.bulkDeleteHolidays(selection.ids);
      const n = res?.deleted ?? selection.ids.length;
      toast.success(`${n} holiday${n === 1 ? '' : 's'} deleted`);
      setBulkDel(false);
      selection.clear();
      refetch();
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setDeleting(false); }
  };

  // ── Types ──────────────────────────────────────────────────────────────────
  const saveTypes = async (list, renames) => {
    setTypeSaving(true);
    try {
      await api.updateHolidayTypes(list, renames);
      refetchTypes();
      if (renames?.length) refetch();     // holidays were carried to the new name
      toast.success('Holiday types saved');
    } catch (err) {
      // Refused because holidays still wear a type being removed — the server
      // says how many, which is the only useful thing to show.
      toast.error(err.response?.data?.message || err.message);
    } finally { setTypeSaving(false); }
  };

  // ── Import / export ────────────────────────────────────────────────────────
  const grabFile = async (blobPromise, filename) => {
    try {
      const res = await blobPromise;
      const url = URL.createObjectURL(new Blob([res]));
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(err.message); }
  };

  const onImportFile = async (f) => {
    setFile(f);
    setPreview(null);
    setImportBusy(true);
    try {
      const fd = new FormData();
      fd.append('csvFile', f);
      setPreview(await api.previewHolidayImport(fd));
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
      setFile(null);
    } finally { setImportBusy(false); }
  };

  const confirmImport = async () => {
    setImportBusy(true);
    try {
      const fd = new FormData();
      fd.append('csvFile', file);
      const res = await api.importHolidays(fd);
      toast.success(`Imported ${res.imported ?? 0} holidays`);
      setImportOpen(false); setFile(null); setPreview(null);
      refetch();
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setImportBusy(false); }
  };

  const closeImport = () => { setImportOpen(false); setFile(null); setPreview(null); };

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = [
    { key: 'name',  className: 'holcol-name',  label: 'Holiday',  render: (r) => <HolidayCell h={r} /> },
    { key: 'dates', className: 'holcol-dates', label: 'Date(s)',  render: (r) => <DateCell h={r} /> },
    { key: 'type',  className: 'holcol-type',  label: 'Type',     render: (r) => <TypeChip type={r.type} types={types} /> },
    {
      key: 'applies',
      className: 'holcol-app',
      label: 'Applies to',
      render: (r) => <AppliesCell h={r} classNames={classNames} />,
    },
    {
      key: 'status',
      className: 'holcol-status',
      label: 'Status',
      render: (r) => {
        const s = STATUS[statusOf(r)];
        return <span className={`holstatus is-${statusOf(r)}`}>{s.label}</span>;
      },
    },
    {
      key: 'actions',
      className: 'ltable__acts',
      label: 'Actions',
      render: (r) => (
        <RowActions>
          <IconAction icon="pencil" label="Edit holiday" variant="edit" onClick={() => openEdit(r)} />
          <IconAction icon="trash" label="Delete holiday" variant="danger" onClick={() => setDel(r)} />
        </RowActions>
      ),
    },
  ];

  if (loading && !source.length) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page listpg holpg">
      <Crumbs here="Holidays" />

      <ListHero
        title="Holidays"
        subtitle="The school's calendar of days off — public holidays, festivals, breaks and one-off closures."
        quote="Everyone plans around this list: it reaches students, parents and staff the moment a holiday is added."
        scene={SchoolScene}
      />

      <ListStats>
        <ListStat icon="calendar" tone="indigo" value={counts.total} label="Holidays"
          caption={counts.days ? `${counts.days} days off in total` : 'Nothing on the calendar yet'}
          on={tab === 'all' && !scope} onClick={() => tileView('all')} />
        <ListStat icon="sunrise" tone="green" value={counts.upcoming} label="Upcoming"
          caption={next30 ? `${next30} in the next 30 days` : 'None in the next 30 days'}
          on={tab === 'upcoming' && !scope} onClick={() => tileView('upcoming')} />
        <ListStat icon="clock" tone="amber" value={counts.past} label="Past"
          caption="Already been this year" on={tab === 'past' && !scope} onClick={() => tileView('past')} />
        <ListStat icon="users" tone="purple" value={counts.scoped} label="Class-specific"
          caption={counts.scoped ? 'Not school-wide' : 'Every holiday is school-wide'}
          on={scope === 'classes' && tab === 'all'} onClick={() => tileView('all', 'classes')} />
      </ListStats>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="holgrid">
        <section className="card">
          <ListTabs value={view} tabs={[
            { value: 'manage', label: 'School calendar', count: all.length },
            { value: 'mine',   label: 'Applies to me',   count: mine.length },
          ]} onChange={(v) => { setView(v); clearAll(); }}>
            {/* Which academic year — both views, the tiles and the calendar. */}
            {years.length > 0 && (
              <select className={`form-control lsel holyear${year !== 'current' && yearId !== currentYear ? ' lfsel--on' : ''}`}
                value={year === 'current' ? currentYear : year}
                onChange={(e) => pickYear(e.target.value)}
                aria-label="Academic year" title="Academic year">
                {years.map((y) => (
                  <option key={y._id} value={y._id}>{y.name}{y._id === currentYear ? ' (current)' : ''}</option>
                ))}
                <option value="all">All years</option>
              </select>
            )}
          </ListTabs>

          {view === 'mine' ? (
            <div className="holminewrap">
              <p className="holhint">
                <Icon name="alert" size={13} />
                What you would see as a member of staff. Class-specific holidays go to those
                classes&rsquo; students and parents, so they are not listed here.
              </p>
              {mineLoading
                ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
                : mine.length
                  ? <MineList holidays={mine} types={types} />
                  : (
                    <Empty icon="🗓️" title="No holidays apply to you yet"
                      message="School-wide holidays on the calendar will show up here."
                      action={<Button onClick={() => setView('manage')}>See the school calendar</Button>} />
                  )}
            </div>
          ) : (
            <>
              <ListTabs tabs={TABS} value={tab} onChange={pick} counts={counts} />

              <div className="ltools">
                <SearchField value={search} onChange={setSearch} placeholder="Search holidays…" />

                <select className={`form-control lsel${type ? ' lfsel--on' : ''}`} value={type}
                  onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Filter by type">
                  <option value="">All types</option>
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>

                <select className={`form-control lsel${scope ? ' lfsel--on' : ''}`} value={scope}
                  onChange={(e) => { setScope(e.target.value); setPage(1); }} aria-label="Filter by who it applies to">
                  <option value="">All audiences</option>
                  <option value="school">School-wide only</option>
                  <option value="classes">Class-specific only</option>
                </select>

                <select className={`form-control lsel${sort !== 'date' ? ' lfsel--on' : ''}`} value={sort}
                  onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort holidays">
                  {SORTS.map((s) => <option key={s.value} value={s.value}>Sort by: {s.label}</option>)}
                </select>

                <span className="ltools__sep" />

                <div className="ltools__acts">
                  <Button variant="secondary" onClick={() => setTypesOpen(true)}>
                    <Icon name="layers" size={16} /> Types
                  </Button>
                  <Button variant="secondary" onClick={() => setImportOpen(true)}>
                    <Icon name="upload" size={16} /> Import
                  </Button>
                  <Button variant="secondary" disabled={!everyYear.length}
                    onClick={() => grabFile(api.exportHolidays(), 'holidays.xlsx')}>
                    <Icon name="download" size={16} /> Export
                  </Button>
                  <Button onClick={openNew}>
                    <Icon name="plus" size={16} /> Add Holiday
                  </Button>
                </div>
              </div>

              <SelectionBar count={selection.ids.length} noun="holiday" onClear={selection.clear}>
                <Button variant="danger" size="sm" onClick={() => setBulkDel(true)}>
                  <Icon name="trash" size={15} /> Delete
                </Button>
              </SelectionBar>

              {/* On a phone the table gives way to cards (.holtable hides it
                  below 768px) — nothing scrolls sideways, and View opens the
                  rest of a holiday with Edit and Delete beside it. */}
              <HolidayCards rows={shown} types={types} selection={selection} onView={setViewing} />
              <div className="holtable">
              <ListTable
                columns={columns}
                rows={shown}
                loading={loading}
                selection={selection}
                startIndex={start}
                emptyIcon={anyFilter ? '🔍' : '🗓️'}
                emptyTitle={anyFilter ? 'No holidays match these filters' : 'No holidays yet'}
                emptyMessage={anyFilter
                  ? 'Try another tab, type or search term.'
                  : 'Add the school’s days off, or import a year’s calendar from a spreadsheet.'}
                emptyAction={anyFilter
                  ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
                  : <Button onClick={openNew}>+ Add Holiday</Button>}
              />
              </div>

              <ListFooter
                page={Math.min(page, pages)} pages={pages} total={filtered.length}
                limit={limit} count={shown.length} noun="holiday"
                onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
              />
            </>
          )}
        </section>

        <aside className="holside">
          <MonthCalendar
            title={view === 'mine' ? 'Your calendar' : 'School calendar'}
            month={month} onMonth={setMonth} byDay={byDay} types={types}
            onPick={view === 'manage' ? openEdit : undefined}
          />
          <UpcomingPanel holidays={upcoming} types={types}
            onPick={view === 'manage' ? openEdit : undefined} />
          {view === 'manage' && (
            <TypesPanel types={types} counts={typeCounts} onManage={() => setTypesOpen(true)} />
          )}
        </aside>
      </div>

      <div className="lbottom">
        <HelpPanel scene={SupportScene}
          text="A new holiday notifies everyone it applies to as soon as it is saved — editing one does not, so fix a wrong date before people plan around it. A holiday type cannot be deleted while holidays still use it; rename it and they come with it." />
      </div>

      <PageFoot schoolName={me?.school?.name} />

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}
      <HolidayForm
        open={!!editing}
        holiday={editing === 'new' ? null : editing}
        form={form} setForm={setForm}
        types={types} classes={classes} holidays={everyYear}
        saving={saving} error={formErr}
        onClose={() => { setEditing(null); setFormErr(''); }}
        onSave={save}
      />

      <HolidayDialog holiday={viewing} types={types} onClose={() => setViewing(null)}
        appliesTo={viewing && (viewing.applicability?.scope === 'specific_classes'
          ? (viewing.applicability.classes || []).map((c) => classNames[String(c?._id ?? c)]).filter(Boolean).join(', ') || 'Some classes'
          : 'Whole school')}
        actions={viewing && (
          <>
            <Button variant="danger" onClick={() => { const h = viewing; setViewing(null); setDel(h); }}>
              <Icon name="trash" size={15} /> Delete
            </Button>
            <Button onClick={() => { const h = viewing; setViewing(null); openEdit(h); }}>
              <Icon name="pencil" size={15} /> Edit
            </Button>
          </>
        )} />

      <TypesDialog
        open={typesOpen}
        types={types}
        counts={typeCountsEver}
        saving={typeSaving}
        onClose={() => setTypesOpen(false)}
        onSave={saveTypes}
      />

      <ImportDialog
        open={importOpen}
        busy={importBusy}
        preview={preview}
        fileName={file?.name}
        onClose={closeImport}
        onTemplate={() => grabFile(api.downloadHolidayTemplate(), 'holiday_template.xlsx')}
        onFile={onImportFile}
        onConfirm={confirmImport}
      />

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove}
        loading={deleting} title="Delete holiday"
        message={`Delete “${del?.name}”? It disappears from everyone's calendar. This cannot be undone.`} />

      <Confirm open={bulkDel} onClose={() => setBulkDel(false)} onConfirm={removeSelected}
        loading={deleting} title="Delete holidays"
        message={`Delete ${selection.ids.length} holiday${selection.ids.length === 1 ? '' : 's'}? They disappear from everyone's calendar. This cannot be undone.`} />
    </div>
  );
}
