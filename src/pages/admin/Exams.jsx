/**
 * Admin → Aptitude Exams.
 *
 * The school's exam calendar. A marked header with Import Questions and Create
 * Exam, five figures, the next few exams beside a period's completion and
 * scores, then every exam — filterable, as a table or as cards. Built on
 * examParts.jsx.
 *
 * Three reads, on purpose: the overview (tiles, what is next, dropdown
 * options) describes the school and does not move with the filters; the
 * insights follow their own period picker; the list follows the filter row.
 * Every figure is counted server-side — see aptitudeAdmin.controller.js.
 *
 * The question editor (shared with the teacher's workspace) is at
 * /admin/exams/:id/questions. Publish is offered only once an exam's
 * `readiness` passes; before that the menu and drawer say what is missing.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getExams, getExamOverview, getExamInsights, getAptitudeExamMeta, getAptitudeExam,
  createAptitudeExam, updateAptitudeExam, deleteAptitudeExam, duplicateAptitudeExam,
  publishAptitudeExam, unpublishAptitudeExam, cancelAptitudeExam, decideAptitudeResults,
} from '../../api/admin.api';
import { Alert, Button, Confirm, Modal } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { SearchField, Picker, MenuItem, MenuSep } from './documentParts';
import {
  ExamHero, ExamStats, ExamStat, Panel, UpcomingList, InsightsPanel, DateRange, ViewSwitch,
  ExamTable, ExamGrid, ExamFoot, ExamEmpty, ExamDrawer, STAGE_FILTERS, fmtShortDate,
} from './examParts';
import ExamForm from './ExamForm';
import ImportQuestions from './ImportQuestions';
import AdminExamQuestions from './ExamQuestions';
import AdminExamAnalytics, { AdminExamReport } from './ExamAnalytics';
import { PublishButton, PublishMenuItem, YearPicker } from '../exams/examShared';

const PAGE_SIZE = 10;
const unwrap = (res) => res?.data ?? res;
const errText = (err) => err?.data?.message || err?.message || 'Something went wrong';

export default function AdminExams() {
  return (
    <Routes>
      <Route index element={<ExamsHome />} />
      <Route path="analytics" element={<AdminExamAnalytics />} />
      <Route path=":id/analytics" element={<AdminExamReport />} />
      <Route path=":id/questions" element={<AdminExamQuestions />} />
      <Route path="*" element={<Navigate to="/admin/exams" replace />} />
    </Routes>
  );
}

function ExamsHome() {
  const navigate = useNavigate();

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search, setSearch]   = useState('');
  const [term, setTerm]       = useState('');
  const [stage, setStage]     = useState('');
  const [subject, setSubject] = useState('');
  const [klass, setKlass]     = useState('');
  const [range, setRange]     = useState({ from: '', to: '' });
  const [view, setView]       = useState('list');
  const [page, setPage]       = useState(1);
  const [period, setPeriod]   = useState('year');
  const [year, setYear]       = useState('');     // '' = the current academic year

  // ── Data ───────────────────────────────────────────────────────────────────
  const [rows, setRows]         = useState([]);
  const [listMeta, setListMeta] = useState({ total: 0, pages: 1 });
  const [loading, setLoading]   = useState(true);
  const [over, setOver]         = useState(null);
  const [overLoading, setOL]    = useState(true);
  const [insights, setInsights] = useState(null);
  const [insLoading, setIL]     = useState(true);
  const [error, setError]       = useState('');

  // ── Overlays ───────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [formMeta, setFormMeta] = useState(null);
  const [metaLoading, setML]    = useState(false);
  const [saving, setSaving]     = useState(false);
  const [importFor, setImportFor] = useState(null); // null closed · '' open with no exam chosen · id
  const [viewing, setViewing]   = useState(null);
  const [detail, setDetail]     = useState(null);
  const [confirm, setConfirm]   = useState(null);   // { kind, exam }
  const [busy, setBusy]         = useState(false);
  const [results, setResults]   = useState(null);   // exam being released / withheld
  const [resForm, setResForm]   = useState({ action: 'release', publishDate: '', reason: '' });

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadOverview = useCallback(async () => {
    setOL(true);
    try { setOver(unwrap(await getExamOverview())); }
    catch (err) { setError(errText(err)); }
    finally { setOL(false); }
  }, []);

  const loadInsights = useCallback(async () => {
    setIL(true);
    try { setInsights(unwrap(await getExamInsights(period))); }
    catch { setInsights(null); }
    finally { setIL(false); }
  }, [period]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getExams({
        page, limit: PAGE_SIZE,
        search: term || undefined,
        stage: stage || undefined,
        subject: subject || undefined,
        classNumber: klass || undefined,
        from: range.from || undefined,
        to: range.to || undefined,
        academicYear: year || undefined,
      });
      setRows(res.data || []);
      setListMeta({ total: res.total || 0, pages: res.pages || 1 });
      setError('');
    } catch (err) {
      setRows([]);
      setError(errText(err));
    } finally { setLoading(false); }
  }, [page, term, stage, subject, klass, range, year]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadInsights(); }, [loadInsights]);
  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  // The drawer shows the row at once and fills in attempts and approvals when
  // the fuller read lands.
  useEffect(() => {
    if (!viewing) { setDetail(null); return; }
    let live = true;
    getAptitudeExam(viewing._id).then((r) => { if (live) setDetail(unwrap(r)); }).catch(() => {});
    return () => { live = false; };
  }, [viewing]);

  const refresh = () => { loadList(); loadOverview(); loadInsights(); };

  const filtered = !!(term || stage || subject || klass || range.from || range.to || year);
  const go = (fn) => (v) => { fn(v); setPage(1); };
  const clearFilters = () => {
    setSearch(''); setTerm(''); setStage(''); setSubject(''); setKlass(''); setRange({ from: '', to: '' }); setYear(''); setPage(1);
  };
  const showList = (value) => {
    clearFilters();
    setStage(value);
    document.getElementById('apx-all')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Create / edit ──────────────────────────────────────────────────────────
  const ensureMeta = async () => {
    if (formMeta) return;
    setML(true);
    try { setFormMeta(unwrap(await getAptitudeExamMeta())); }
    catch (err) { toast.error(errText(err)); }
    finally { setML(false); }
  };

  const openCreate = () => { setEditing(null); setFormOpen(true); ensureMeta(); };
  const openEdit = (exam) => {
    if (exam.stage !== 'draft') return;
    setViewing(null); setEditing(exam); setFormOpen(true); ensureMeta();
  };

  const save = async (body) => {
    setSaving(true);
    try {
      if (editing) {
        await updateAptitudeExam(editing._id, body);
        toast.success('Exam updated');
        setFormOpen(false);
        refresh();
      } else {
        const created = unwrap(await createAptitudeExam(body));
        toast.success('Draft created — now add its questions');
        setFormOpen(false);
        navigate(`/admin/exams/${created._id}/questions`);
      }
    } catch (err) { toast.error(errText(err)); }
    finally { setSaving(false); }
  };

  const duplicate = async (exam) => {
    try {
      const copy = unwrap(await duplicateAptitudeExam(exam._id));
      toast.success(`Copied with ${copy.questionCount} question${copy.questionCount === 1 ? '' : 's'} — check the date and classes`);
      refresh();
      // Straight into the copy's form: its date may have moved and its title says "(Copy)".
      const fresh = unwrap(await getAptitudeExam(copy._id));
      setViewing(null); setEditing(fresh); setFormOpen(true); ensureMeta();
    } catch (err) { toast.error(errText(err)); }
  };

  // ── State changes ──────────────────────────────────────────────────────────
  const CONFIRMS = {
    publish: {
      title: 'Publish exam',
      label: 'Publish',
      message: (e) => `Publish “${e.title}”? It becomes visible to ${e.eligible} student${e.eligible === 1 ? '' : 's'} and opens on ${fmtShortDate(e.startsAt)} at the set time. Questions are locked once published.`,
      run: (e) => publishAptitudeExam(e._id),
      done: 'Exam published',
    },
    unpublish: {
      title: 'Move back to draft',
      label: 'Move to draft',
      message: (e) => `Take “${e.title}” back to draft? Students stop seeing it until it is published again.`,
      run: (e) => unpublishAptitudeExam(e._id),
      done: 'Moved back to draft',
    },
    cancel: {
      title: 'Cancel exam',
      label: 'Cancel exam',
      message: (e) => (e.stage === 'live'
        ? `“${e.title}” is running now. Cancelling withdraws it at once — students part-way through lose it.`
        : `Cancel “${e.title}”? Students stop seeing it. This cannot be undone; duplicate it to schedule it again.`),
      run: (e) => cancelAptitudeExam(e._id),
      done: 'Exam cancelled',
    },
    delete: {
      title: 'Delete exam',
      label: 'Delete',
      message: (e) => `Permanently delete “${e.title}” and its ${e.questionCount} question${e.questionCount === 1 ? '' : 's'}?`,
      run: (e) => deleteAptitudeExam(e._id),
      done: 'Exam deleted',
    },
  };

  const runConfirm = async () => {
    const c = CONFIRMS[confirm.kind];
    setBusy(true);
    try {
      await c.run(confirm.exam);
      toast.success(c.done);
      setConfirm(null);
      setViewing(null);
      if (confirm.kind === 'delete' && rows.length === 1 && page > 1) setPage(page - 1);
      refresh();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  const ask = (kind, exam) => {
    // The menu offers Publish on an incomplete draft too, and answers with
    // what is missing — the drawer, where the full checklist lives.
    if (kind === 'publish' && exam.readiness && !exam.readiness.ready) {
      setViewing(exam);
      toast.error(exam.readiness.message, { duration: 6000 });
      return;
    }
    setConfirm({ kind, exam });
  };

  const openResults = (exam, action) => {
    setResForm({ action, publishDate: '', reason: '' });
    setResults(exam);
  };

  const submitResults = async () => {
    setBusy(true);
    try {
      await decideAptitudeResults(results._id, {
        action: resForm.action,
        publishDate: resForm.action === 'release' && resForm.publishDate ? resForm.publishDate : undefined,
        reason: resForm.action === 'withhold' ? resForm.reason : undefined,
      });
      toast.success(resForm.action === 'release' ? 'Results released' : 'Results withheld');
      setResults(null);
      setViewing(null);
      refresh();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  // ── What each exam offers ──────────────────────────────────────────────────
  const questionsPath = (e) => `/admin/exams/${e._id}/questions`;

  const rowMenu = (e) => (
    <>
      <MenuItem icon="eye" onClick={() => setViewing(e)}>View details</MenuItem>
      {['live', 'completed'].includes(e.stage) && <MenuItem icon="chart" onClick={() => navigate(`/admin/exams/${e._id}/analytics`)}>View analytics</MenuItem>}
      <MenuItem icon="list" onClick={() => navigate(questionsPath(e))}>
        {e.stage === 'draft' ? 'Manage questions' : 'View questions'}
      </MenuItem>
      {e.stage === 'draft' && <MenuItem icon="upload" onClick={() => setImportFor(e._id)}>Import questions</MenuItem>}
      <MenuSep />
      {e.stage === 'draft' && <PublishMenuItem exam={e} onPublish={() => ask('publish', e)} />}
      {e.stage === 'scheduled' && e.attemptCount === 0 && (
        <MenuItem icon="refresh" onClick={() => ask('unpublish', e)}>Move back to draft</MenuItem>
      )}
      {e.stage === 'completed' && e.results?.state !== 'released' && e.results?.state !== 'scheduled' && (
        <MenuItem icon="checkCircle" onClick={() => openResults(e, 'release')}>Release results</MenuItem>
      )}
      {e.stage === 'completed' && e.results?.state !== 'withheld' && (
        <MenuItem icon="closeCircle" onClick={() => openResults(e, 'withhold')}>Withhold results</MenuItem>
      )}
      <MenuItem icon="copy" onClick={() => duplicate(e)}>Duplicate</MenuItem>
      {['scheduled', 'live'].includes(e.stage) && (
        <><MenuSep /><MenuItem icon="closeCircle" danger onClick={() => ask('cancel', e)}>Cancel exam</MenuItem></>
      )}
      {(e.stage === 'draft' || (e.stage === 'cancelled' && e.attemptCount === 0)) && (
        <><MenuSep /><MenuItem icon="trash" danger onClick={() => ask('delete', e)}>Delete</MenuItem></>
      )}
    </>
  );

  const drawerFooter = (e) => {
    if (!e) return null;
    const x = detail?._id === e._id ? { ...e, ...detail } : e;
    const q = <Button variant="secondary" onClick={() => navigate(questionsPath(x))}><Icon name="list" size={15} /> Questions</Button>;
    const analyticsBtn = <Button variant="secondary" onClick={() => navigate(`/admin/exams/${x._id}/analytics`)}><Icon name="chart" size={15} /> Analytics</Button>;
    switch (x.stage) {
      case 'draft':
        return (
          <>
            <Button variant="danger" onClick={() => ask('delete', x)}><Icon name="trash" size={15} /> Delete</Button>
            {q}
            <Button variant="secondary" onClick={() => openEdit(x)}><Icon name="pencil" size={15} /> Edit</Button>
            <PublishButton readiness={x.readiness} label="Publish" onPublish={() => setConfirm({ kind: 'publish', exam: x })} />
          </>
        );
      case 'scheduled':
        return (
          <>
            <Button variant="danger" onClick={() => ask('cancel', x)}>Cancel exam</Button>
            {q}
            {x.attemptCount === 0 && <Button onClick={() => ask('unpublish', x)}><Icon name="refresh" size={15} /> Move to draft</Button>}
          </>
        );
      case 'live':
        return <><Button variant="danger" onClick={() => ask('cancel', x)}>Cancel exam</Button>{q}{analyticsBtn}</>;
      case 'completed':
        return (
          <>
            {q}
            {analyticsBtn}
            {x.results?.state !== 'withheld' && <Button variant="secondary" onClick={() => openResults(x, 'withhold')}>Withhold results</Button>}
            {!['released', 'scheduled'].includes(x.results?.state) && <Button onClick={() => openResults(x, 'release')}>Release results</Button>}
          </>
        );
      default:
        return (
          <>
            {x.attemptCount === 0 && <Button variant="danger" onClick={() => ask('delete', x)}><Icon name="trash" size={15} /> Delete</Button>}
            <Button onClick={() => duplicate(x)}><Icon name="copy" size={15} /> Duplicate</Button>
          </>
        );
    }
  };

  // ── Tiles ──────────────────────────────────────────────────────────────────
  const t = over?.tiles || {};
  const since = over?.comparedWith ? `vs ${over.comparedWith.name}` : 'no earlier year';
  const delta = (change, unit = '%') => (change == null
    ? { text: '—', tone: 'flat' }
    : { text: `${change > 0 ? '+' : ''}${change}${unit}`, tone: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      arrow: change > 0 ? 'arrowUp' : change < 0 ? 'arrowDown' : null });

  const yearNote = over?.academicYear ? over.academicYear.name : 'all years';
  const Tile = overLoading && !over ? () => <div className="apxstat apxstat--skeleton" /> : ExamStat;

  const empty = <ExamEmpty filtered={filtered} onClear={clearFilters} onCreate={openCreate} />;
  const List = view === 'grid' ? ExamGrid : ExamTable;
  const c = confirm && CONFIRMS[confirm.kind];

  return (
    <div className="page apxpg">
      <ExamHero actions={
        <>
          <Button variant="secondary" className="btn btn-secondary apxhero__btn" onClick={() => navigate('/admin/exams/analytics')}>
            <Icon name="chart" size={17} /> Analytics
          </Button>
          <Button variant="secondary" className="btn btn-secondary apxhero__btn" onClick={() => setImportFor('')}>
            <Icon name="upload" size={17} /> Import Questions
          </Button>
          <Button className="btn btn-primary apxhero__btn" onClick={openCreate}>
            <Icon name="plus" size={17} /> Create Exam
          </Button>
        </>
      } />

      <ExamStats>
        <Tile icon="fileDoc" tone="indigo" label="Total Exams" value={t.total?.value}
          chip={delta(t.total?.change)} note={over?.comparedWith ? since : yearNote} />
        <Tile icon="pencil" tone="amber" label="Drafts" value={t.drafts?.value}
          chip={t.drafts?.needQuestions
            ? { text: `${t.drafts.needQuestions} need questions`, tone: 'warn' }
            : { text: t.drafts?.value ? 'all ready' : '—', tone: t.drafts?.value ? 'up' : 'flat' }}
          on={stage === 'draft'} onClick={() => showList(stage === 'draft' ? '' : 'draft')} />
        <Tile icon="calendar" tone="blue" label="Scheduled" value={t.scheduled?.value}
          chip={t.scheduled?.live
            ? { text: `${t.scheduled.live} live now`, tone: 'up' }
            : t.scheduled?.next ? { text: `next ${fmtShortDate(t.scheduled.next)}`, tone: 'flat' } : { text: '—', tone: 'flat' }}
          on={stage === 'scheduled,live'} onClick={() => showList(stage === 'scheduled,live' ? '' : 'scheduled,live')} />
        <Tile icon="checkCircle" tone="green" label="Completed" value={t.completed?.value}
          chip={t.completed?.awaiting
            ? { text: `${t.completed.awaiting} awaiting results`, tone: 'warn' }
            : delta(t.completed?.change)}
          note={t.completed?.awaiting ? null : since}
          on={stage === 'completed'} onClick={() => showList(stage === 'completed' ? '' : 'completed')} />
        <Tile icon="trophy" tone="violet" label="Average Score"
          value={t.average?.value == null ? '—' : `${t.average.value}%`}
          chip={t.average?.change != null ? delta(t.average.change, ' pts') : { text: `${t.average?.attempts || 0} attempts`, tone: 'flat' }}
          note={t.average?.change != null ? since : yearNote} />
      </ExamStats>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="apxmid">
        <Panel icon="calendarDays" title="Upcoming & Active Exams" subtitle="Next scheduled and ongoing exams"
          className="apxupcoming-panel"
          action={
            <button type="button" className="apxmore" onClick={() => showList('upcoming')}>
              View all exams <Icon name="arrowRight" size={15} />
            </button>
          }>
          <UpcomingList rows={over?.upcoming} loading={overLoading && !over}
            onView={setViewing} onEdit={openEdit} menu={rowMenu} onCreate={openCreate} />
        </Panel>

        <InsightsPanel data={insights} loading={insLoading} period={period} onPeriod={setPeriod} />
      </div>

      <Panel id="apx-all" icon="fileDoc" title="All Exams"
        subtitle={`${year === 'all' ? 'Every academic year' : `${(over?.options?.academicYears || []).find((y) => (year ? y._id === year : y.current))?.name || 'This academic year'}`} · manage, edit and track aptitude exams`}
        className="apxall"
        action={
          <div className="apxtools">
            <SearchField value={search} onChange={setSearch} placeholder="Search exams…" />
            <Picker value={stage} onChange={go(setStage)} all="All statuses" options={STAGE_FILTERS} label="Filter by status" />
            <Picker value={subject} onChange={go(setSubject)} all="All subjects" options={over?.options?.subjects || []} label="Filter by subject" />
            <Picker value={klass} onChange={go(setKlass)} all="All classes" options={over?.options?.classes || []} label="Filter by class" />
            <YearPicker years={over?.options?.academicYears} value={year} onChange={go(setYear)} />
            <DateRange from={range.from} to={range.to} onChange={go(setRange)} />
            <ViewSwitch value={view} onChange={setView} />
          </div>
        }>
        <List rows={rows} loading={loading} empty={empty}
          onView={setViewing} onEdit={openEdit} onDuplicate={duplicate} menu={rowMenu} />
        <ExamFoot page={page} pages={listMeta.pages} total={listMeta.total} limit={PAGE_SIZE}
          count={rows.length} onPage={setPage} />
      </Panel>

      {/* ── Overlays ─────────────────────────────────────────────────────── */}

      <ExamDrawer exam={viewing} detail={detail} onClose={() => setViewing(null)} footer={drawerFooter(viewing)} />

      <ExamForm open={formOpen} editing={editing} meta={formMeta} metaLoading={metaLoading}
        saving={saving} onClose={() => setFormOpen(false)} onSave={save} />

      <ImportQuestions open={importFor !== null} examId={importFor || ''}
        onClose={() => setImportFor(null)} onImported={() => refresh()} />

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} onConfirm={runConfirm} loading={busy}
        title={c?.title} confirmLabel={c?.label} message={confirm ? c.message(confirm.exam) : ''} />

      <Modal open={!!results} onClose={() => setResults(null)} maxWidth={480}
        title={resForm.action === 'release' ? 'Release results' : 'Withhold results'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResults(null)}>Cancel</Button>
            <Button variant={resForm.action === 'release' ? 'primary' : 'danger'} onClick={submitResults} loading={busy}>
              {resForm.action === 'release' ? 'Release' : 'Withhold'}
            </Button>
          </>
        }>
        {results && (resForm.action === 'release'
          ? (
            <div className="apxform">
              <p className="apxform__lead">
                Students and parents will see their scores for “{results.title}”
                {results.averageScore != null ? ` (class average ${results.averageScore}%)` : ''}.
                This signs off for the subject teacher too, if they have not yet.
              </p>
              <div className="form-group">
                <label className="form-label" htmlFor="apx-pub">Publish on (optional)</label>
                <input id="apx-pub" type="date" className="form-control" value={resForm.publishDate}
                  onChange={(e) => setResForm((f) => ({ ...f, publishDate: e.target.value }))} />
                <p className="apxform__hint">Leave empty to release now.</p>
              </div>
            </div>
          )
          : (
            <div className="apxform">
              <p className="apxform__lead">Results for “{results.title}” stay hidden from students and parents.</p>
              <div className="form-group">
                <label className="form-label" htmlFor="apx-why">Reason</label>
                <textarea id="apx-why" className="form-control" rows={3} value={resForm.reason}
                  onChange={(e) => setResForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g. A question was marked wrongly — re-checking before release" />
              </div>
            </div>
          ))}
      </Modal>
    </div>
  );
}
