/**
 * Admin → Results & Assessments (Oct 2026 redesign, to the user's mockup).
 *
 * Four figures over the whole school, then one card: the exam's lifecycle as
 * tabs, a search, four filters, and the table. Everything on it is answered by
 * two SQL read models — GET /admin/results/overview for the tiles and the
 * filters' options, GET /admin/results/exams for the rows and a count under
 * every tab — so a tile and its tab can never disagree.
 *
 * The page decides nothing about an exam. Each row arrives with `stage` (its
 * tab), `attention` (what, if anything, is waiting on the office) and `can`
 * (the steps it may take), all worked out in school-backend/services; the row's
 * button, its menu, the drawer and the bulk bar read those and nothing else.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/admin.api';
import useFetch from '../../../hooks/useFetch';
import {
  PageHead, Tiles, Tile, Btn, IconBtn, MenuBtn, LineTabs, SearchBox, SelectField, Badge, Meter, Check, Kebab, Pager, Empty, Ico,
  useBoard, useDebounced, count, plural, fmtDay, fmtStamp, fmtRange,
} from '../rsUI';
import { TABS, STATUS, VIEWS, ATTENTION, statusOf, statusOptions, examTypeText, classLine } from '../resultMeta';
import { STEPS, BULK, ActionDialog } from './examActions';
import ExamForm from './ExamForm';
import ExamDrawer from './ExamDrawer';
import PublishedEdit from './PublishedEdits';

const NO_FILTERS = { academicYear: '', classNumber: '', examType: '', status: '' };
const PREF = 'admin.results.filters';
const readPref = () => { try { return localStorage.getItem(PREF) !== 'closed'; } catch { return true; } };

/** What an empty tab says. The first is the mockup's own wording. */
const EMPTY_TAB = {
  all: 'Create an exam to start managing student results.',
  draft: 'Every exam has been opened for mark entry, or none has been created yet.',
  marks: 'No exam is waiting for marks to be entered.',
  validation: 'Nothing is waiting to be validated or published.',
  published: 'No results have been published yet.',
  archived: 'Nothing has been archived.',
};

/** The one step a row is waiting for, if there is one. */
function nextStep(r) {
  if (r.archived) return null;
  if (r.attention && ATTENTION[r.attention]) return ATTENTION[r.attention];
  if (r.can?.open) return { act: 'Open mark entry', step: 'open', icon: 'unlock', kind: 'soft' };
  return null;
}

/** "Published on": the day families can see the results, or when they are due. */
function PublishedOn({ r }) {
  if (r.publishedOn) {
    // The later of "published" (an instant) and the result date (a calendar day).
    const scheduled = r.publishDate && r.publishedOn === r.publishDate;
    return (
      <span className="rs-two">
        <strong>{scheduled ? fmtDay(r.publishedOn) : fmtStamp(r.publishedOn)}</strong>
        {r.resultsVisible ? null : <span className="rs-sub">Hidden until then</span>}
      </span>
    );
  }
  if (r.publishDate) return <span className="rs-two"><span className="rs-muted">{fmtDay(r.publishDate)}</span><span className="rs-sub">Result date</span></span>;
  return <span className="rs-muted">—</span>;
}

export default function ResultsHome() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  // A link may land on a tab, a status or a tile's view (the dashboard's
  // "results ready to publish" does).
  const [tab, setTab] = useState(() => (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'all'));
  const [filters, setFilters] = useState(() => ({ ...NO_FILTERS, status: STATUS[params.get('status')] ? params.get('status') : '' }));
  const [view, setView] = useState(() => (VIEWS[params.get('view')] ? params.get('view') : ''));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [showFilters, setShowFilters] = useState(readPref);

  const [picked, setPicked] = useState(() => new Set());
  const [form, setForm] = useState(null);          // { exam } to edit, {} to create
  const [open, setOpen] = useState(null);          // { id, tab } — the drawer
  const [ask, setAsk] = useState(null);            // the step being confirmed
  const [edit, setEdit] = useState(null);          // { kind: 'rename' | 'resultDate', r } on a published exam
  const [stamp, setStamp] = useState(0);           // bumps when an exam changed, so an open drawer refetches

  // Wider than its card? Then the table scrolls sideways and its Actions column
  // is pinned. A callback ref, so it measures the element once it exists.
  const [wide, setWide] = useState(false);
  const watcher = useRef(null);
  const scroller = useCallback((el) => {
    watcher.current?.disconnect();
    if (!el) return;
    const check = () => setWide(el.scrollWidth > el.clientWidth + 1);
    check();
    watcher.current = new ResizeObserver(check);
    watcher.current.observe(el);
    if (el.firstElementChild) watcher.current.observe(el.firstElementChild);
  }, []);

  const q = useDebounced(search, 300).trim();
  const query = useMemo(() => {
    const out = { tab, page, limit };
    if (q) out.search = q;
    if (view) out.view = view;
    Object.entries(filters).forEach(([k, v]) => { if (v !== '') out[k] = v; });
    return out;
  }, [tab, page, limit, q, view, filters]);

  const { body, loading, error, reload } = useBoard(api.getFormalExams, query);
  const overview = useFetch(api.getResultOverview, []);
  const tiles = overview.data?.tiles || {};
  const rows = useMemo(() => body?.data || [], [body]);
  const tabs = body?.tabs || {};

  // Ticks belong to the rows on screen: a bulk action must never reach a row
  // left over from two filters ago.
  const listKey = JSON.stringify(query);
  useEffect(() => { setPicked(new Set()); }, [listKey]);

  // ?new=1 opens the form; ?exam=<id> opens that exam (the analytics page and
  // notifications link this way). They come off the URL a tick later, and only
  // from the instance that survives: the layout mounts a page twice on
  // navigation and throws the first away — taking the parameter with it would
  // leave the second with nothing to open.
  const wantNew = params.get('new');
  const wantExam = params.get('exam');
  useEffect(() => {
    if (!wantNew && !wantExam) return undefined;
    if (wantNew) setForm({});
    if (wantExam) setOpen({ id: wantExam, tab: 'overview' });
    const t = setTimeout(() => setParams((p) => {
      const next = new URLSearchParams(p); next.delete('new'); next.delete('exam'); return next;
    }, { replace: true }), 0);
    return () => clearTimeout(t);
  }, [wantNew, wantExam, setParams]);

  const refresh = useCallback(() => { reload(); overview.refetch(); setStamp((n) => n + 1); }, [reload, overview]);

  const goTab = (k) => {
    setTab(k); setPage(1);
    // The status filter only subdivides a tab; one that cannot sit under the new tab is dropped.
    setFilters((f) => (f.status && !statusOptions(k).some((o) => o.value === f.status) ? { ...f, status: '' } : f));
  };
  const setFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const activeFilters = Object.values(filters).filter((v) => v !== '').length;
  const narrowed = activeFilters > 0 || !!q || !!view;
  const reset = () => { setFilters(NO_FILTERS); setSearch(''); setView(''); setPage(1); };
  const toggleFilters = () => setShowFilters((s) => { try { localStorage.setItem(PREF, s ? 'closed' : 'open'); } catch { /* private mode */ } return !s; });

  // A tile shows the rows behind its number: two are a tab, two are a view over every tab.
  const tileTo = (target) => {
    setFilters(NO_FILTERS); setSearch(''); setPage(1);
    if (target === 'attention' || target === 'progress') { setTab('all'); setView(target); } else { setView(''); setTab(target); }
  };

  /* ── steps ── */
  // Entering marks happens in the drawer; every other step is asked first.
  const step = (name, r) => {
    if (name === 'marks') { setOpen({ id: r._id, tab: 'marks' }); return; }
    if (name === 'rename' || name === 'resultDate') { setEdit({ kind: name, r }); return; }
    const cfg = STEPS[name]?.(r);
    if (cfg) setAsk(name === 'delete' ? { ...cfg, closes: true } : cfg);
  };
  const onDone = (res, done) => {
    const said = typeof done.done === 'function' ? done.done(res) : done.done;
    if (said) toast.success(said);
    setAsk(null);
    if (done.closes) setOpen(null);
    refresh();
  };

  /* ── selection ── */
  const pickedRows = rows.filter((r) => picked.has(r._id));
  const allOn = rows.length > 0 && pickedRows.length === rows.length;
  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setPicked(allOn ? new Set() : new Set(rows.map((r) => r._id)));

  const bulk = (action) => {
    // Only the ticked rows the action applies to; the button already said how many.
    const ids = pickedRows.filter((r) => r.can?.[action]).map((r) => r._id);
    if (!ids.length) return;
    const cfg = BULK[action](ids.length);
    setAsk({
      ...cfg,
      run: () => api.bulkFormalExams(action, ids),
      done: (res) => {
        // Each exam is its own decision: say what went through, and name what did not.
        const out = res?.data || {};
        const failed = out.failed || [];
        const n = (out.done || []).length;
        if (failed.length) toast.error(`${plural(failed.length, 'exam')} could not be ${cfg.verb}: ${failed[0].message}`, { duration: 7000 });
        return n ? `${plural(n, 'exam')} ${cfg.verb}` : '';
      },
    });
  };
  const bulkCount = (k) => pickedRows.filter((r) => r.can?.[k]).length;

  const menu = (r) => [
    { label: 'View details', icon: 'eye', onClick: () => setOpen({ id: r._id, tab: 'overview' }) },
    r.can.edit && { label: 'Edit exam', icon: 'pencil', onClick: () => setForm({ exam: r }) },
    r.can.rename && { label: 'Rename', icon: 'pencil', onClick: () => step('rename', r) },
    r.can.resultDate && { label: 'Change result date', icon: 'calendar', onClick: () => step('resultDate', r) },
    r.can.marks && { label: r.status === 'SUBMITTED' || r.status === 'CLASS_APPROVED' ? 'Review marks' : 'Enter marks', icon: 'clipboard', onClick: () => setOpen({ id: r._id, tab: 'marks' }) },
    r.can.results && { label: 'View results', icon: 'trophy', onClick: () => setOpen({ id: r._id, tab: 'results' }) },
    '-',
    r.can.open && { label: 'Open mark entry', icon: 'unlock', onClick: () => step('open', r) },
    r.can.toDraft && { label: 'Move back to draft', icon: 'undo', onClick: () => step('draft', r) },
    r.can.validate && { label: 'Validate marks', icon: 'shieldCheck', onClick: () => step('validate', r) },
    r.can.publish && { label: 'Publish results', icon: 'checkCircle', onClick: () => step('publish', r) },
    r.can.reject && { label: 'Reject marks', icon: 'closeCircle', onClick: () => step('reject', r) },
    r.can.reopen && { label: r.status === 'FINAL_APPROVED' ? 'Withdraw results' : 'Reopen for correction', icon: r.status === 'FINAL_APPROVED' ? 'undo' : 'refresh', onClick: () => step('reopen', r) },
    '-',
    r.can.archive && { label: 'Archive', icon: 'archive', onClick: () => step('archive', r) },
    r.can.restore && { label: 'Restore', icon: 'restore', onClick: () => step('restore', r) },
    r.can.delete && { label: 'Delete draft', icon: 'trash', danger: true, onClick: () => step('delete', r) },
  ];

  const years = overview.data?.years || [];
  const classes = overview.data?.classes || [];
  const types = overview.data?.examTypes || [];
  const chip = view ? VIEWS[view] : null;
  const first = !body && loading;

  return (
    <div className="rs-page">
      <PageHead title="Results & Assessments" subtitle="Manage exam cycles, enter marks, validate and publish results for students.">
        <Btn kind="tint" size="lg" icon="bars" iconSize={19} onClick={() => nav('/admin/results/analytics')}>Result Analytics</Btn>
        <MenuBtn size="lg" label="More results pages" items={[
          { label: 'Report Cards', icon: 'printer', onClick: () => nav('/admin/results/report-cards') },
          { label: 'Class Tests', icon: 'clipboard', onClick: () => nav('/admin/results/class-tests') },
          { label: 'Exam Schedule', icon: 'calendarDays', onClick: () => nav('/admin/results/exam-schedule') },
          { label: 'Exam Day Plan', icon: 'building', onClick: () => nav('/admin/results/exam-day') },
          { label: 'Merit List', icon: 'trophy', onClick: () => nav('/admin/results/merit') },
          { label: 'Electives', icon: 'users', onClick: () => nav('/admin/results/electives') },
          { label: overview.data?.rechecksOpen ? `Re-check Requests (${overview.data.rechecksOpen})` : 'Re-check Requests', icon: 'search', onClick: () => nav('/admin/results/rechecks') },
          '-',
          { label: 'Activity', icon: 'history', onClick: () => nav('/admin/results/activity') },
          { label: 'Settings', icon: 'settings', onClick: () => nav('/admin/results/settings') },
        ]}>More</MenuBtn>
        <Btn kind="primary" size="lg" icon="plus" iconSize={20} onClick={() => setForm({})}>Create Exam</Btn>
      </PageHead>

      <Tiles>
        <Tile tone="indigo" icon="sheet" iconSize={40} value={tiles.total} label="Total Exams" quietLabel caption="Across all academic years"
          onClick={() => tileTo('all')} />
        <Tile tone="green" icon="checkDisc" value={tiles.published} label="Published Results" caption={`${count(tiles.publishedPct)}% of total exams`}
          onClick={() => tileTo('published')} />
        <Tile tone="amber" icon="clockRing" iconSize={35} value={tiles.inProgress} label="In Progress" caption="Mark entry / validation"
          onClick={() => tileTo('progress')} on={view === 'progress'} />
        <Tile tone="red" icon="alertTri" iconSize={35} value={tiles.pending} label="Pending Actions" caption="Requires attention"
          onClick={() => tileTo('attention')} on={view === 'attention'} />
      </Tiles>

      <section className="rs-card" aria-label="Exams">
        <div className="rs-card__top">
          <LineTabs value={tab} onChange={goTab} items={TABS.map((t) => ({ ...t, count: tabs[t.key] }))} />
          <div className="rs-tools">
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search exams by name, class or academic year..." label="Search exams" />
            <Btn className="rs-filterbtn" icon="filter" iconSize={18} onClick={toggleFilters} aria-expanded={showFilters} aria-controls="rs-filters">
              Filter{!showFilters && activeFilters ? <span className="rs-filterbtn__n">{activeFilters}</span> : null}
            </Btn>
          </div>
        </div>

        {showFilters ? (
          <div className="rs-filters" id="rs-filters">
            <SelectField label="Academic Year" width={192} value={filters.academicYear} onChange={(v) => setFilter('academicYear', v)} all="All Years"
              options={years.map((y) => ({ value: y._id, label: `${y.yearName}${y.current ? ' (Current)' : ''}` }))} />
            <SelectField label="Class" width={197} value={filters.classNumber} onChange={(v) => setFilter('classNumber', v)} all="All Classes"
              options={classes.map((c) => ({ value: String(c.classNumber), label: c.className }))} />
            <SelectField label="Exam Type" width={197} value={filters.examType} onChange={(v) => setFilter('examType', v)} all="All Types" options={types} />
            <SelectField label="Status" width={208} value={filters.status} onChange={(v) => setFilter('status', v)} all="All Statuses" options={statusOptions(tab)} />
            <Btn className="rs-filters__reset" icon="reset" iconSize={19} onClick={reset}>Reset</Btn>
          </div>
        ) : null}

        <div className={`rs-tablearea${showFilters ? '' : ' rs-tablearea--tight'}`}>
          {chip ? (
            <div className="rs-tablearea__note">
              <span className={`rs-viewchip rs-t-${chip.tone}`}>
                Showing: {chip.label}
                <button type="button" onClick={() => { setView(''); setPage(1); }} aria-label={`Stop showing only ${chip.label.toLowerCase()}`}><Ico name="close" size={11} /></button>
              </span>
            </div>
          ) : null}

          <div className={`rs-tablebox${loading && body ? ' is-loading' : ''}`} aria-busy={loading || undefined}>
            {pickedRows.length ? (
              <div className="rs-bulk" role="region" aria-label="Selected exams">
                <strong>{plural(pickedRows.length, 'exam')} selected</strong>
                <span className="rs-bulk__acts">
                  {bulkCount('open') ? <Btn size="sm" icon="unlock" onClick={() => bulk('open')}>Open Entry ({bulkCount('open')})</Btn> : null}
                  {bulkCount('publish') ? <Btn size="sm" kind="primary" icon="checkCircle" onClick={() => bulk('publish')}>Publish ({bulkCount('publish')})</Btn> : null}
                  {bulkCount('archive') ? <Btn size="sm" icon="archive" onClick={() => bulk('archive')}>Archive ({bulkCount('archive')})</Btn> : null}
                  {bulkCount('restore') ? <Btn size="sm" icon="restore" onClick={() => bulk('restore')}>Restore ({bulkCount('restore')})</Btn> : null}
                  {bulkCount('delete') ? <Btn size="sm" kind="danger" icon="trash" onClick={() => bulk('delete')}>Delete ({bulkCount('delete')})</Btn> : null}
                </span>
                <button type="button" className="rs-bulk__clear" onClick={() => setPicked(new Set())}>Clear</button>
              </div>
            ) : null}

            <div className={`rs-tablescroll${wide ? ' is-wide' : ''}`} ref={scroller}>
              <table className={`rs-table ${rows.length ? 'rs-table--rows' : 'rs-table--empty'}`}>
                <thead>
                  <tr>
                    <th className="rs-table__check">
                      <Check checked={allOn} indeterminate={pickedRows.length > 0} onChange={toggleAll} label="Select every exam on this page" />
                    </th>
                    <th>Exam Name</th>
                    <th>Academic Year</th>
                    <th>Class / Section</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Students</th>
                    <th>Mark Entry</th>
                    <th>Published On</th>
                    <th className="is-right rs-table__acts">Actions</th>
                  </tr>
                </thead>
                {rows.length ? (
                  <tbody>
                    {rows.map((r) => {
                      const st = statusOf(r.status);
                      const next = nextStep(r);
                      const need = !r.archived && r.attention ? ATTENTION[r.attention] : null;
                      return (
                        <tr key={r._id} data-focus-id={r._id} className={picked.has(r._id) ? 'is-picked' : undefined}>
                          <td className="rs-table__check"><Check checked={picked.has(r._id)} onChange={() => toggle(r._id)} label={`Select ${r.title}`} /></td>
                          <td>
                            <button type="button" className="rs-name" onClick={() => setOpen({ id: r._id, tab: 'overview' })}>
                              <strong>{r.title}</strong>
                              <span className="rs-sub">{r.code ? `${r.code} · ` : ''}{fmtRange(r.startDate, r.endDate)} · {plural(r.subjectCount, 'subject')}</span>
                            </button>
                          </td>
                          <td data-label="Academic year">{r.yearName || <span className="rs-muted">—</span>}</td>
                          <td data-label="Class / Section">{classLine(r)}{r.yearName ? <span className="rs-sub rs-yearsub">{r.yearName}</span> : null}</td>
                          <td data-label="Type">{examTypeText(r)}</td>
                          <td data-label="Status">
                            <Badge tone={st.tone}>{st.label}</Badge>
                            {need?.note ? <span className={`rs-need${need.red ? ' rs-need--red' : ''}`} title={need.why}>{need.note}</span> : null}
                          </td>
                          <td className="rs-num" data-label="Students">{r.students ? count(r.students) : <span className="rs-muted">—</span>}</td>
                          <td data-label="Mark entry">
                            {r.status === 'DRAFT'
                              ? <span className="rs-muted">Not opened</span>
                              : <Meter value={r.sheetsSubmitted} total={r.subjectCount} color={r.sheetsSubmitted >= r.subjectCount ? '#3fbf61' : undefined} />}
                          </td>
                          <td data-label="Published on"><PublishedOn r={r} /></td>
                          <td className="is-right rs-table__acts">
                            <span className="rs-acts">
                              {next ? (
                                <IconBtn icon={next.icon} className={`rs-ibtn--${next.kind}`} label={`${next.act} — ${r.title}`} onClick={() => step(next.step, r)} />
                              ) : null}
                              <IconBtn icon="eye" label={`View ${r.title}`} onClick={() => setOpen({ id: r._id, tab: 'overview' })} />
                              <Kebab items={menu(r)} label={`More actions for ${r.title}`} />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ) : null}
              </table>
            </div>

            {rows.length ? null : first ? (
              <div className="rs-loading" role="status">Loading exams…</div>
            ) : error && !body ? (
              <Empty title="Exams could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty>
            ) : narrowed ? (
              <Empty title="No exams found" action={<Btn size="lg" icon="reset" onClick={reset}>Reset Filters</Btn>}>
                Nothing matches {q ? 'this search' : 'these filters'}{tab === 'all' ? '' : ' under this tab'}. Try a different search, or reset the filters.
              </Empty>
            ) : (
              <Empty title="No exams found"
                action={tab === 'all' || tab === 'draft' ? <Btn kind="primary" size="lg" icon="plus" iconSize={20} onClick={() => setForm({})}>Create Exam</Btn> : null}>
                {EMPTY_TAB[tab]}
              </Empty>
            )}
          </div>

          {rows.length ? (
            <Pager page={body?.page || 1} pages={body?.pages || 1} total={body?.total || 0} limit={limit}
              onPage={setPage} sizes={[10, 20, 50]} onLimit={(n) => { setLimit(n); setPage(1); }} />
          ) : null}
        </div>
      </section>

      <ExamForm open={!!form} exam={form?.exam} onClose={() => setForm(null)}
        onSaved={(saved) => {
          setForm(null); refresh();
          // A new exam is a draft: make sure the tab being looked at can show it.
          if (saved?.created && !['all', 'draft'].includes(tab)) goTab('all');
        }} />

      <ExamDrawer open={!!open} examId={open?.id} tab={open?.tab} stamp={stamp} locked={!!ask || !!form || !!edit} onClose={() => setOpen(null)}
        onStep={step} onEdit={(exam) => setForm({ exam })} onChanged={refresh} />

      <ActionDialog ask={ask} onClose={() => setAsk(null)} onDone={onDone} />
      <PublishedEdit edit={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); refresh(); }} />
    </div>
  );
}
