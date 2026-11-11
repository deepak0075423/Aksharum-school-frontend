/**
 * One document, opened — for the office and for the teacher who set it.
 *
 *
 * Four tabs off a single header: what the document is (Overview), who has
 * handed work back (Submissions), how the class did (Analytics), and the
 * conversation hanging off it (Comments). A document that is not an assignment
 * has nothing to submit against, so it opens on Overview and Comments alone.
 *
 * The tab lives in the URL, so a notification, a bookmark and the back button
 * all land where they should. The roster's filters are shared between the
 * Overview table and the Submissions tab — they are the same list, read two
 * ways, and a status picked on one tab should still hold on the other.
 *
 * Pieces are in assignmentParts.jsx; the counting is all server-side (see
 * documentDetail.controller.js).
 *
 * Mounted at both `/admin/documents/:id` and `/teacher/documents/:id`. The two
 * differ only in which API module they call and in what the header offers — a
 * teacher may read anything shared with them and manage only their own, which
 * the payload states as `canManage` rather than the page guessing from a role.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as adminApi from '../../api/admin.api';
import * as teacherApi from '../../api/teacher.api';
import { Alert, Button, Confirm, Spinner } from '../../components/ui/index';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/ui/icons';
import { saveFile } from '../../utils/downloadFile';
import { typeOf, FileMark, fmtSize } from './documentParts';
import {
  Crumbs, DetailHero, MetaStrip, DetailTabs, StatTiles, Panel, Blank, Loading,
  SubmissionDonut, ScoreHistogram, SubmissionTrend, RankRows, QuestionBars,
  RosterTable, Pager, SubmissionPanel,
  CommentCard, MiniStats, Timeline, GUIDELINES, Person, Avatar, StatePill,
  fmtDate, fmtTime, assignmentTypeLabel, fileUrl,
} from './assignmentParts';
import { useFileViewer } from '../documents/FileViewer';

const unwrap = (res) => res?.data ?? res;

const STATUS_OPTIONS = [
  { value: '',          label: 'All Statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'late',      label: 'Late' },
  { value: 'pending',   label: 'Pending' },
  { value: 'missed',    label: 'Not Submitted' },
  { value: 'graded',    label: 'Marked' },
  { value: 'ungraded',  label: 'Handed in, not marked' },
];

const SORT_OPTIONS = [
  { value: 'roll',      label: 'Roll number' },
  { value: 'name',      label: 'Name (A–Z)' },
  { value: 'name_z',    label: 'Name (Z–A)' },
  { value: 'marks',     label: 'Highest marks' },
  { value: 'marks_low', label: 'Lowest marks' },
  { value: 'recent',    label: 'Most recent' },
];

const PAGE_SIZE = 10;

export default function DocumentDetail() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';

  // Which side of the app this is. Read off the URL rather than the role: a
  // module-admin teacher legitimately reaches the /admin route, and the page
  // must call the endpoints that match the path it was opened at.
  const asTeacher = window.location.pathname.startsWith('/teacher/');
  const home = asTeacher ? '/teacher/documents' : '/admin/documents';
  const api = asTeacher
    ? {
      detail:    teacherApi.getAssignmentDetail,
      analytics: teacherApi.getAssignmentAnalytics,
      review:    teacherApi.reviewAssignment,
      remind:    teacherApi.remindAssignment,
      duplicate: teacherApi.duplicateDocument,
      comments:  teacherApi.getDocumentComments,
      addComment:    teacherApi.addDocumentComment,
      updateComment: teacherApi.updateDocumentComment,
      deleteComment: teacherApi.deleteDocumentComment,
      likeComment:   teacherApi.likeDocumentComment,
      archive:   null,                       // a teacher has no archive
      remove:    teacherApi.deleteDocument,
      markRead:  teacherApi.markDocumentRead,
    }
    : {
      detail:    adminApi.getAssignmentDetail,
      analytics: adminApi.getAssignmentAnalytics,
      review:    adminApi.reviewSubmission,
      remind:    adminApi.remindAssignment,
      duplicate: adminApi.duplicateDocument,
      comments:  adminApi.getDocumentComments,
      addComment:    adminApi.addDocumentComment,
      updateComment: adminApi.updateDocumentComment,
      deleteComment: adminApi.deleteDocumentComment,
      likeComment:   adminApi.likeDocumentComment,
      archive:   adminApi.archiveDocument,
      remove:    adminApi.deleteDocument,
    };

  const setTab = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'overview') next.delete('tab'); else next.set('tab', v);
    setParams(next, { replace: true });
  };

  // ── Data ───────────────────────────────────────────────────────────────────
  const [doc,     setDoc]     = useState(null);
  const [roster,  setRoster]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);   // roster refetch, not first load
  const [error,   setError]   = useState('');

  const [analytics, setAnalytics] = useState(null);
  const [anaLoading, setAnaLoading] = useState(false);

  const [comments, setComments] = useState(null);
  const [comLoading, setComLoading] = useState(false);

  // ── The roster's filters, shared by Overview and Submissions ───────────────
  const [status,  setStatus]  = useState('');
  const [section, setSection] = useState('');
  const [search,  setSearch]  = useState('');
  const [term,    setTerm]    = useState('');
  const [sort,    setSort]    = useState('roll');
  const [page,    setPage]    = useState(1);

  const [picked,  setPicked]  = useState(null);   // the student in the side panel
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState(null);   // { kind, ... }

  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (first = false) => {
    if (first) setLoading(true); else setBusy(true);
    try {
      const d = unwrap(await api.detail(id, {
        status: status || undefined,
        section: section || undefined,
        search: term || undefined,
        sort,
        page,
        limit: PAGE_SIZE,
      }));
      setDoc(d.document);
      setRoster(d.roster);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load this document');
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }, [id, status, section, term, sort, page]);

  useEffect(() => { load(true); }, [id]);        // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving here by a link or a notification is opening the document just as
  // much as clicking its card is, so the teacher's list stops calling it new.
  useEffect(() => { api.markRead?.(id).catch(() => {}); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Submitted work, attachments and comment files open over this page.
  const viewer = useFileViewer();

  // The submission panel only exists once a student is picked. Beside the list
  // it opens in view; on a narrow screen it opens UNDER the list, where a click
  // on a row would otherwise appear to do nothing — so it is brought up.
  //
  // Keyed on the click itself (`pickTick`), not on `picked`: the picked row is
  // swapped for a fresh copy whenever the roster reloads, and the page must
  // not jump down to the panel each time that happens, or on coming back to
  // this tab with somebody still picked.
  const sideRef = useRef(null);
  const seenTick = useRef(0);
  const [pickTick, setPickTick] = useState(0);
  const pick = (row) => { setPicked(row); setPickTick((n) => n + 1); };
  useEffect(() => {
    const el = sideRef.current;
    // No panel yet means the click came from the Overview and the tab has not
    // switched: leave the click unanswered, and answer it when `tab` changes.
    if (!el || seenTick.current === pickTick) return;
    seenTick.current = pickTick;
    if (el.getBoundingClientRect().top > window.innerHeight - 120) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [pickTick, tab]);
  useEffect(() => { if (doc) load(false); }, [status, section, term, sort, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Analytics and the thread are only fetched once their tab is opened — most
  // visits are somebody checking who has handed in.
  useEffect(() => {
    if (tab !== 'analytics' || analytics || !doc?.isAssignment) return;
    setAnaLoading(true);
    api.analytics(id)
      .then((r) => setAnalytics(unwrap(r)))
      .catch((err) => toast.error(err?.response?.data?.message || err.message))
      .finally(() => setAnaLoading(false));
  }, [tab, id, analytics, doc?.isAssignment]);

  // ── Comments state ─────────────────────────────────────────────────────────
  const [comOrder,  setComOrder]  = useState('newest');
  const [comFilter, setComFilter] = useState('');
  const [comSearch, setComSearch] = useState('');
  const [comTerm,   setComTerm]   = useState('');
  const [draft,     setDraft]     = useState('');
  const [replyTo,   setReplyTo]   = useState(null);
  const [visibility, setVisibility] = useState('all');
  const [attach,    setAttach]    = useState([]);
  // A comment carries up to four files (the upload route's own limit). Picking
  // again adds to what is there; each file can be swapped or taken off.
  const MAX_ATTACH = 4;
  const addAttach = (picked) => {
    if (!picked.length) return;
    const next = [...attach, ...picked];
    if (next.length > MAX_ATTACH) toast.error(`A comment can carry up to ${MAX_ATTACH} files`);
    setAttach(next.slice(0, MAX_ATTACH));
  };
  const [posting,   setPosting]   = useState(false);

  const loadComments = useCallback(async () => {
    setComLoading(true);
    try {
      setComments(unwrap(await api.comments(id, {
        order: comOrder,
        author: comFilter || undefined,
        search: comTerm || undefined,
      })));
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setComLoading(false);
    }
  }, [id, comOrder, comFilter, comTerm]);

  useEffect(() => {
    const t = setTimeout(() => setComTerm(comSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [comSearch]);

  useEffect(() => {
    if (tab !== 'comments') return;
    loadComments();
  }, [tab, comOrder, comFilter, comTerm]);        // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ────────────────────────────────────────────────────────────────
  const saveMarks = async (payload) => {
    setSaving(true);
    try {
      await api.review(id, picked._id, payload);
      toast.success('Marks and feedback saved');
      await load(false);
      // The panel is showing a row that has just changed — pull the new one
      // through rather than leaving a stale copy beside a refreshed table.
      setPicked((p) => (p ? { ...p, _saved: Date.now() } : p));
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  // Once the roster reloads, re-point the panel at the fresh row.
  useEffect(() => {
    if (!picked || !roster?.students) return;
    const fresh = roster.students.find((s) => s._id === picked._id);
    if (fresh && fresh !== picked) setPicked(fresh);
  }, [roster]);                                    // eslint-disable-line react-hooks/exhaustive-deps

  const remind = async (studentIds) => {
    try {
      const r = await api.remind(id, studentIds ? { studentIds } : {});
      toast.success(r.sent ? `Reminder sent to ${r.sent} student${r.sent === 1 ? '' : 's'}` : (r.message || 'Nobody to remind'));
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  const duplicate = async () => {
    try {
      const r = await api.duplicate(id);
      toast.success('Copy created');
      navigate(`${home}/${unwrap(r)._id}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}${home}/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      // Clipboard is blocked outside a secure context — show the link so it can
      // still be copied by hand rather than failing silently.
      window.prompt('Copy this link', url);
    }
  };

  const exportCsv = () => {
    const rows = roster?.students || [];
    if (!rows.length) return toast.error('Nothing to export');
    const head = ['Roll No.', 'Student', 'Section', 'Status', 'Submitted On', 'Marks', 'Out of', 'Feedback'];
    const esc  = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv  = [head, ...rows.map((r) => [
      r.rollNumber, r.name, r.sectionLabel, r.state,
      r.submittedAt ? `${fmtDate(r.submittedAt)} ${fmtTime(r.submittedAt)}` : '',
      r.marks ?? '', doc.totalMarks ?? '', r.feedback,
    ])].map((line) => line.map(esc).join(',')).join('\n');
    saveFile(csv, `${doc.title.replace(/[^\w\-]+/g, '_')}-submissions.csv`, 'text/csv;charset=utf-8');
  };

  const postComment = async (e) => {
    e.preventDefault();
    if (!draft.trim() && !attach.length) return toast.error('Write something, or attach a file');
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append('body', draft.trim());
      fd.append('visibility', visibility);
      if (replyTo) fd.append('parent', replyTo._id);
      attach.forEach((f) => fd.append('files', f));
      await api.addComment(id, fd);
      setDraft(''); setAttach([]); setReplyTo(null);
      await loadComments();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setPosting(false);
    }
  };

  const onLike = async (c) => {
    try { await api.likeComment(c._id); await loadComments(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };
  const onPin = async (c, on) => {
    try { await api.updateComment(c._id, { isPinned: on }); await loadComments(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };
  const onEditComment = async (c, body) => {
    try { await api.updateComment(c._id, { body }); await loadComments(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };
  const runConfirm = async () => {
    const c = confirm;
    setBusy(true);
    try {
      if (c.kind === 'comment') { await api.deleteComment(c.comment._id); await loadComments(); toast.success('Comment deleted'); }
      if (c.kind === 'archive') { await api.archive(id, !doc.isArchived); toast.success(doc.isArchived ? 'Restored' : 'Archived'); await load(false); }
      if (c.kind === 'delete')  { await api.remove(id); toast.success('Document deleted'); navigate(home); return; }
      setConfirm(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <div className="loading-page"><Spinner /></div>;

  if (error && !doc) {
    return (
      <div className="page addetail">
        <Crumbs here="Not found" home={home} />
        <Alert variant="danger">{error}</Alert>
        <Button variant="secondary" onClick={() => navigate(home)}>Back to Documents</Button>
      </div>
    );
  }

  const isAssignment = !!doc.isAssignment;
  const counts  = roster?.counts  || { total: 0, submitted: 0, pending: 0, missed: 0, late: 0, graded: 0 };
  const percent = roster?.percent || { submitted: 0, pending: 0, missed: 0, total: 0 };

  const tabs = isAssignment
    ? [
      { value: 'overview',    label: 'Overview' },
      { value: 'submissions', label: 'Submissions' },
      { value: 'analytics',   label: 'Analytics' },
      { value: 'comments',    label: 'Comments', count: comments?.summary?.total },
    ]
    : [
      { value: 'overview', label: 'Overview' },
      { value: 'comments', label: 'Comments', count: comments?.summary?.total },
    ];

  const crumbTrail = isAssignment
    ? [{ label: 'Assignments', to: asTeacher ? home : '/admin/documents?tab=assignments' }, { label: doc.title }]
    : [{ label: typeOf(doc.docType).label }, { label: doc.title }];
  const crumbHere = tabs.find((t) => t.value === tab)?.label || 'Overview';

  // What narrows the roster. The sort is not one of them — it orders what is
  // left — so it sits with the count and the pager, on the list itself.
  const rosterTools = (
    <>
      <div className="adsearch">
        <Icon name="search" size={16} />
        <input className="form-control" value={search} placeholder="Search by name or roll no…"
          onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
      </div>
      <select className="form-control adsel" value={status} aria-label="Filter by status"
        onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className="form-control adsel" value={section} aria-label="Filter by section"
        onChange={(e) => { setSection(e.target.value); setPage(1); }}>
        <option value="">All Sections</option>
        {(roster?.sections || []).filter((s) => s._id).map((s) => (
          <option key={s._id} value={s._id}>{s.label} ({s.total})</option>
        ))}
      </select>
    </>
  );

  const sortSelect = (
    <select className="form-control adsel" value={sort} aria-label="Sort students"
      onChange={(e) => { setSort(e.target.value); setPage(1); }}>
      {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
    </select>
  );

  const rosterTable = (
    <RosterTable
      rows={(roster?.students || []).map((s, i) => ({ ...s, index: (page - 1) * PAGE_SIZE + i }))}
      loading={busy}
      outOf={doc.totalMarks}
      showFeedback={tab === 'overview'}
      selected={picked?._id}
      onOpen={(r) => { pick(r); if (tab === 'overview') setTab('submissions'); }}
      onMark={(r) => { pick(r); setTab('submissions'); }}
      onSelect={(r) => remind([r._id])}
      empty={<Blank text={status || section || term ? 'No students match these filters' : 'Nobody is on this assignment yet'} />}
    />
  );

  const rosterCount = roster?.shown
    ? `Showing ${(page - 1) * PAGE_SIZE + 1} to ${(page - 1) * PAGE_SIZE + (roster.students?.length || 0)} of ${roster.shown} students`
    : 'No students to show';

  const rosterPager = <Pager page={page} pages={roster?.pages || 1} onPage={setPage} />;

  // Under the Overview's table.
  const rosterFoot = (
    <div className="adfoot">
      <span>{rosterCount}</span>
      {rosterPager}
    </div>
  );

  // Over the Submissions list: how many, in what order, which page.
  const rosterHead = (
    <div className="adfoot adfoot--head">
      <span>{rosterCount}</span>
      <span className="adfoot__end">{sortSelect}{rosterPager}</span>
    </div>
  );

  const files = doc.files || [];

  return (
    <div className="page addetail">
      <Crumbs trail={crumbTrail} here={crumbHere} home={home} />

      <section className="adhead">
        <DetailHero doc={doc} actions={
          <>
            {doc.canManage && (
              <>
                <button type="button" className="btn btn-secondary"
                  onClick={() => navigate(asTeacher ? home : `/admin/documents?edit=${id}`)}>
                  <Icon name="pencil" size={15} /> Edit
                </button>
                <button type="button" className="btn btn-secondary" onClick={duplicate}>
                  <Icon name="repeat" size={15} /> Duplicate
                </button>
              </>
            )}
            <button type="button" className="btn btn-secondary" onClick={share}>
              <Icon name="upload" size={15} /> Share
            </button>
            {doc.canManage && (
              <button type="button" className="adact" title="More actions"
                onClick={() => setConfirm({ kind: 'menu' })} aria-label="More actions">
                <Icon name="dots" size={16} />
              </button>
            )}
          </>
        } />

        <MetaStrip items={[
          { icon: 'bookOpen',     label: 'Subject',         value: doc.subject || doc.category },
          { icon: 'layers',       label: 'Class / Section', value: doc.sharedWith?.[0],
            sub: doc.sharedWith?.length > 1 ? `+${doc.sharedWith.length - 1} more` : null },
          { icon: 'calendar',     label: 'Assigned On',     value: fmtDate(doc.assignedOn), sub: fmtTime(doc.assignedOn) },
          isAssignment && { icon: 'calendarDays', label: 'Due Date', value: doc.dueDate ? fmtDate(doc.dueDate) : 'No due date',
            sub: doc.dueDate ? fmtTime(doc.dueDate) : null },
          isAssignment && doc.totalMarks && { icon: 'star', label: 'Total Marks', value: String(doc.totalMarks) },
          isAssignment && { icon: 'clipboard', label: 'Assignment Type', value: assignmentTypeLabel(doc.assignmentType) },
          // The one place the document's own files are named on an
          // assignment's page — so it is also where they open from.
          { icon: 'files', label: 'Attachments',
            value: `${files.length} file${files.length === 1 ? '' : 's'}`,
            sub: files.length ? (files.length === 1 ? 'View file' : 'View files') : null,
            hint: files.length ? 'Open the attached file here' : undefined,
            onClick: files.length ? () => viewer.open(files, 0, doc.title) : undefined },
        ]} />

        <DetailTabs tabs={tabs} value={tab} onChange={setTab} />
      </section>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* ── Overview ───────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        isAssignment ? (
          <>
            <StatTiles counts={counts} percent={percent} active={status}
              onPick={(v) => { setStatus(v); setPage(1); }} />

            {/* Not three equal columns: the ring needs room for its legend
                beside it, the three scores need very little. */}
            <div className="adrow adrow--lead">
              <Panel title="Submission Status">
                <SubmissionDonut counts={counts} percent={percent} />
              </Panel>

              <Panel title="Score Distribution" subtitle={doc.totalMarks ? `(Out of ${doc.totalMarks})` : ''}>
                <ScoreHistogram data={roster?.distribution || []} yTitle="Students" />
              </Panel>

              <Panel className="adscores">
                <ScoreRow icon="trophy" tone="amber" label="Average Score"
                  value={roster?.scores?.average} outOf={doc.totalMarks} />
                <ScoreRow icon="arrowUp" tone="green" label="Highest Score"
                  value={roster?.scores?.highest} outOf={doc.totalMarks} />
                <ScoreRow icon="arrowDown" tone="red" label="Lowest Score"
                  value={roster?.scores?.lowest} outOf={doc.totalMarks} />
              </Panel>
            </div>

            <Panel title="Student Submissions" subtitle={`(${counts.total})`} right={
              <div className="adtools">
                {rosterTools}
                {/* The two actions travel together: when the row runs out, both
                    go to the next line rather than the last one alone. */}
                <div className="adtools__group">
                  <button type="button" className="btn btn-secondary" onClick={exportCsv}>
                    <Icon name="download" size={15} /> Export
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => remind()}>
                    <Icon name="bell" size={15} /> Send Reminder
                  </button>
                </div>
              </div>
            }>
              {rosterTable}
              {rosterFoot}
            </Panel>
          </>
        ) : (
          <div className="adrow adrow--2">
            <Panel title="About this document">
              <dl className="adfacts adfacts--wide">
                <div><dt>Type</dt><dd>{typeOf(doc.docType).label}</dd></div>
                <div><dt>Category</dt><dd>{doc.category || '—'}</dd></div>
                <div><dt>Shared with</dt><dd>{doc.sharedWith?.join(', ') || '—'}</dd></div>
                <div><dt>Academic year</dt><dd>{doc.academicYearName || 'Unfiled'}</dd></div>
                <div><dt>Uploaded by</dt><dd>{doc.uploadedBy?.name || '—'}</dd></div>
                <div><dt>Uploaded on</dt><dd>{fmtDate(doc.assignedOn)}, {fmtTime(doc.assignedOn)}</dd></div>
                <div><dt>Version</dt><dd>v{doc.currentVersion}</dd></div>
              </dl>
            </Panel>
            <Panel title="Files" subtitle={`(${doc.files?.length || 0})`}>
              <FileList files={doc.files} onView={viewer.open} />
            </Panel>
          </div>
        )
      )}

      {/* ── Submissions ────────────────────────────────────────────────────── */}
      {tab === 'submissions' && isAssignment && (
        <>
          <StatTiles counts={counts} percent={percent} active={status}
            onPick={(v) => { setStatus(v); setPage(1); }} />

          <Panel className="adworkbench">
            {/* One bar: what narrows the list on the left, what acts on all of
                it on the right. The three actions travel as a group, so on a
                narrower window they drop to the next line together rather than
                leaving one button behind on a row of its own. */}
            <div className="adtools adtools--bar">
              {rosterTools}
              <div className="adtools__group">
                <button type="button" className="btn btn-secondary" onClick={() => remind()}>
                  <Icon name="bell" size={15} /> Send Reminder
                </button>
                <button type="button" className="btn btn-secondary" onClick={exportCsv}>
                  <Icon name="download" size={15} /> Export
                </button>
                <button type="button" className="btn btn-secondary"
                  onClick={() => downloadAll(roster?.students, doc)}>
                  <Icon name="files" size={15} /> Download files
                </button>
              </div>
            </div>

            {/* The list has the whole width until a student is picked; their
                work then opens beside it. */}
            <div className={`adwork${picked ? ' adwork--split' : ''}`}>
              <div className="adlist">
                {rosterHead}
                {rosterTable}
              </div>

              {picked && (
                <div className="adwork__side" ref={sideRef}>
                  <SubmissionPanel student={picked} doc={doc} saving={saving}
                    onClose={() => setPicked(null)} onSave={saveMarks}
                    onRemind={(s) => remind([s._id])} onView={viewer.open} />
                </div>
              )}
            </div>
          </Panel>
        </>
      )}

      {/* ── Analytics ──────────────────────────────────────────────────────── */}
      {tab === 'analytics' && isAssignment && (
        anaLoading || !analytics ? <Loading /> : (
          <>
            <StatTiles counts={counts} percent={percent} />

            {/* The same uneven row as the Overview's, with the narrow column
                in the middle here. */}
            <div className="adrow adrow--lead adrow--lead-mid">
              <Panel title="Submission Overview">
                <SubmissionDonut counts={counts} percent={percent} centerLabel="Submission Rate" />
              </Panel>

              <Panel title="Average Score">
                <div className="adavg">
                  <div className="adavg__hero">
                    <span className="adavg__mark tint-amber"><Icon name="trophy" size={20} /></span>
                    <div>
                      <strong>{analytics.summary.average ?? '—'}<small> / {analytics.summary.outOf ?? '—'}</small></strong>
                      <small>Class average score</small>
                    </div>
                    {analytics.comparison?.change != null && (
                      <span className={`addelta ${analytics.comparison.change >= 0 ? 'is-up' : 'is-down'}`}>
                        <Icon name={analytics.comparison.change >= 0 ? 'arrowUp' : 'arrowDown'} size={13} />
                        {Math.abs(analytics.comparison.change)}%
                        <small>vs. {analytics.comparison.title}</small>
                      </span>
                    )}
                  </div>
                  <div className="adavg__pair">
                    <ScoreFace icon="user" tone="green" label="Highest Score"
                      value={roster?.scores?.highest} outOf={doc.totalMarks} who={analytics.top?.[0]?.name} />
                    <ScoreFace icon="arrowDown" tone="red" label="Lowest Score"
                      value={roster?.scores?.lowest} outOf={doc.totalMarks}
                      who={analytics.bottom?.name} />
                  </div>
                </div>
              </Panel>

              <Panel title="Score Distribution">
                <ScoreHistogram data={roster?.distribution || []} xTitle="Score Range" yTitle="No. of Students" height={214} />
              </Panel>
            </div>

            <div className="adrow adrow--3">
              <Panel title="Submission Trend" subtitle="cumulative">
                <SubmissionTrend data={cumulate(analytics.trend)} />
              </Panel>

              <Panel title="Performance by Section">
                <RankRows empty="No marks recorded per section yet"
                  rows={(analytics.sections || []).map((s) => ({ label: s.label, value: s.percent }))} />
              </Panel>

              <Panel title="Performance by Question" subtitle="(Avg. Score)">
                <QuestionBars questions={analytics.questions} />
              </Panel>
            </div>

            <div className="adrow adrow--3">
              <Panel title="Top Performers">
                <PeopleTable rows={analytics.top} outOf={doc.totalMarks} rank />
              </Panel>
              <Panel title="Needs Attention">
                <PeopleTable rows={analytics.attention} outOf={doc.totalMarks} />
              </Panel>
              <Panel title="Quick Insights">
                <Insights analytics={analytics} counts={counts} distribution={roster?.distribution} />
              </Panel>
            </div>
          </>
        )
      )}

      {/* ── Comments ───────────────────────────────────────────────────────── */}
      {tab === 'comments' && (
        <div className="adrow adrow--split">
          <Panel title="Comments & Discussions"
            lead="Communicate with students and keep track of important discussions."
            right={
              <div className="adtools">
                <select className="form-control adsel" value={comFilter} aria-label="Filter comments"
                  onChange={(e) => setComFilter(e.target.value)}>
                  <option value="">All Comments</option>
                  <option value="students">From students</option>
                  <option value="staff">From staff</option>
                  <option value="pinned">Pinned only</option>
                </select>
                <div className="adsearch">
                  <Icon name="search" size={16} />
                  <input className="form-control" value={comSearch} placeholder="Search comments…"
                    onChange={(e) => setComSearch(e.target.value)} aria-label="Search comments" />
                </div>
                <select className="form-control adsel" value={comOrder} aria-label="Order comments"
                  onChange={(e) => setComOrder(e.target.value)}>
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
            }>
            {comLoading && !comments ? <Loading /> : (
              <>
                <div className="adthreads">
                  {comments?.threads?.length
                    ? comments.threads.map((c) => (
                      <CommentCard key={c._id} c={c} onView={viewer.open}
                        onReply={(x) => { setReplyTo(x); document.getElementById('ad-composer')?.focus(); }}
                        onLike={onLike} onPin={onPin} onEdit={onEditComment}
                        onDelete={(x) => setConfirm({ kind: 'comment', comment: x })} />
                    ))
                    : <Blank text={comTerm || comFilter ? 'No comments match that' : 'No comments yet — start the discussion below.'} />}
                </div>

                <form className="adcomposer" onSubmit={postComment}>
                  {replyTo && (
                    <div className="adcomposer__reply">
                      Replying to <b>{replyTo.author.name}</b>
                      <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  )}
                  <div className="adcomposer__row">
                    <Avatar name={me?.name} src={me?.profileImage} size={36} />
                    <textarea id="ad-composer" className="form-control" rows={2} value={draft} maxLength={2000}
                      placeholder="Write a comment…" onChange={(e) => setDraft(e.target.value)} />
                  </div>
                  {/* What is attached, by name — it used to be a bare "2 file(s)",
                      with no way to take one back out short of reloading. */}
                  {attach.length > 0 && (
                    <ul className="adattached">
                      {attach.map((f, i) => (
                        <li key={`${f.name}-${f.size}-${i}`}>
                          <FileMark file={{ originalName: f.name, mimeType: f.type }} size={28} />
                          <span className="adfiles__name" title={f.name}>{f.name}</span>
                          <span className="adfiles__size">{fmtSize(f.size)}</span>
                          <label className="adattached__btn" title={`Replace ${f.name} with another file`}>
                            <Icon name="refresh" size={13} /> Replace
                            <input type="file" aria-label={`Replace ${f.name}`}
                              onChange={(e) => {
                                const swap = e.target.files?.[0];
                                if (swap) setAttach(attach.map((x, k) => (k === i ? swap : x)));
                                e.target.value = '';
                              }} />
                          </label>
                          <button type="button" className="adattached__btn is-danger"
                            aria-label={`Remove ${f.name}`}
                            onClick={() => setAttach(attach.filter((_, k) => k !== i))}>
                            <Icon name="close" size={13} /> Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="adcomposer__foot">
                    <label className="adattach">
                      <Icon name="files" size={15} /> {attach.length ? 'Attach another' : 'Attach File'}
                      <input type="file" multiple
                        onChange={(e) => { addAttach(Array.from(e.target.files || [])); e.target.value = ''; }} />
                    </label>
                    <span className="adtools__sep" />
                    <select className="form-control adsel" value={visibility} aria-label="Who can see this"
                      onChange={(e) => setVisibility(e.target.value)}>
                      <option value="all">Visible to All</option>
                      <option value="staff">Staff only</option>
                    </select>
                    <button type="submit" className="btn btn-primary" disabled={posting}>
                      {posting ? 'Posting…' : 'Post Comment'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </Panel>

          <div className="adaside">
            <Panel title="Comment Summary">
              <MiniStats items={[
                { icon: 'chat',      tone: 'indigo', value: comments?.summary?.total   ?? 0, label: 'Total Comments' },
                { icon: 'trending',  tone: 'green',  value: comments?.summary?.queries ?? 0, label: 'Student Queries' },
                { icon: 'user',      tone: 'amber',  value: comments?.summary?.replies ?? 0, label: 'Staff Responses' },
                { icon: 'star',      tone: 'purple', value: comments?.summary?.pinned  ?? 0, label: 'Pinned Comments' },
              ]} />
            </Panel>
            <Panel title="Recent Activity">
              <Timeline items={comments?.recent} />
            </Panel>
            <Panel className="adguide" title="Guidelines">
              <ul>{GUIDELINES.map((g) => <li key={g}>{g}</li>)}</ul>
            </Panel>
          </div>
        </div>
      )}

      {/* ── Overlays ───────────────────────────────────────────────────────── */}
      {viewer.node}

      {confirm?.kind === 'menu' && (
        <div className="adsheet" role="dialog" aria-label="Document actions" onClick={() => setConfirm(null)}>
          <div className="adsheet__box" onClick={(e) => e.stopPropagation()}>
            <h3>{doc.title}</h3>
            {api.archive && (
              <button type="button" onClick={() => setConfirm({ kind: 'archive' })}>
                <Icon name={doc.isArchived ? 'refresh' : 'package'} size={16} />
                {doc.isArchived ? 'Restore from archive' : 'Archive this document'}
              </button>
            )}
            <button type="button" className="is-danger" onClick={() => setConfirm({ kind: 'delete' })}>
              <Icon name="trash" size={16} /> Delete permanently
            </button>
            <button type="button" className="adsheet__cancel" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}

      <Confirm
        open={!!confirm && confirm.kind !== 'menu'}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        loading={busy}
        title={confirm?.kind === 'comment' ? 'Delete Comment'
          : confirm?.kind === 'archive' ? (doc.isArchived ? 'Restore Document' : 'Archive Document')
          : 'Delete Document'}
        message={confirm?.kind === 'comment'
          ? commentDeleteText(confirm.comment, asTeacher)
          : confirm?.kind === 'archive'
            ? (doc.isArchived ? `Put “${doc.title}” back on the shelf?` : `Archive “${doc.title}”? It stays here but leaves the main list.`)
            : `Permanently delete “${doc.title}”? Its files and every submission against it go with it.`} />
    </div>
  );
}

// ── Small pieces this page alone uses ────────────────────────────────────────

/**
 * What deleting a comment will do. An admin's delete takes the replies with
 * it. Anyone else deletes only their own words: replies from other people
 * stay, under "This comment was deleted".
 */
function commentDeleteText(c, asTeacher) {
  if (!c) return '';
  if (c.deleted) return 'Remove this deleted comment and every reply under it?';
  const replies = c.replies || [];
  if (!replies.length) return c.mine ? 'Delete your comment?' : `Delete ${c.author?.name || 'this person'}’s comment?`;
  if (!asTeacher) return `Delete this comment? The ${replies.length === 1 ? 'reply' : `${replies.length} replies`} under it go with it.`;
  return replies.some((r) => !r.mine)
    ? 'Delete your comment? The replies from other people stay, under a note that your comment was deleted.'
    : 'Delete your comment? Your replies under it go with it.';
}

const ScoreRow = ({ icon, tone, label, value, outOf }) => (
  <div className="adscore">
    <span className={`adscore__icon tint-${tone}`}><Icon name={icon} size={18} /></span>
    <div>
      <small>{label}</small>
      <strong>{value ?? '—'}{outOf ? <em> / {outOf}</em> : null}</strong>
    </div>
  </div>
);

const ScoreFace = ({ icon, tone, label, value, outOf, who }) => (
  <div className="adface">
    <span className={`adscore__icon tint-${tone}`}><Icon name={icon} size={17} /></span>
    <div>
      <small>{label}</small>
      <strong>{value ?? '—'}{outOf ? ` / ${outOf}` : ''}</strong>
      {who ? <span><Icon name="user" size={12} /> {who}</span> : null}
    </div>
  </div>
);

const FileList = ({ files, onView }) => (
  files?.length
    ? (
      <ul className="adfiles">
        {files.map((f, i) => (
          <li key={`${f.storedName || f.originalName}-${i}`}>
            <button type="button" className="adfiles__name adfiles__open" title={`View ${f.originalName}`}
              onClick={() => onView(files, i)}>{f.originalName}</button>
            <button type="button" className="adact" onClick={() => onView(files, i)}
              title="View file" aria-label={`View ${f.originalName}`}><Icon name="eye" size={15} /></button>
            <a className="adact" href={fileUrl(f.filePath)} target="_blank" rel="noreferrer" download={f.originalName}
              title="Download" aria-label={`Download ${f.originalName}`}><Icon name="download" size={15} /></a>
          </li>
        ))}
      </ul>
    )
    : <Blank text="No files attached" />
);

const PeopleTable = ({ rows, outOf, rank }) => (
  rows?.length
    ? (
      <table className="table adpeople">
        <thead>
          <tr>
            <th className="adtable__num">#</th>
            <th>Student Name</th>
            <th>Section</th>
            <th>{rank ? 'Score' : 'Status'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((r, i) => (
            <tr key={r._id}>
              <td className="adtable__num">{i + 1}</td>
              <td><Person name={r.name} photo={r.photo} size={28} /></td>
              <td className="admono">{r.section || '—'}</td>
              <td>
                {rank
                  ? <span className="admarks"><Icon name="trophy" size={13} /> {r.marks}{outOf ? ` / ${outOf}` : ''}</span>
                  : <StatePill state={r.state} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
    : <Blank text={rank ? 'Nothing marked yet' : 'Nobody is behind — everything is in'} />
);

/**
 * The sentences the numbers add up to.
 *
 * Written from what was actually measured, so an assignment with no marks says
 * so rather than printing an insight about a distribution that does not exist.
 */
const Insights = ({ analytics, counts, distribution }) => {
  const out = [];
  const cmp = analytics.comparison;

  if (cmp?.change != null) {
    out.push({
      icon: cmp.change >= 0 ? 'arrowUp' : 'arrowDown',
      tone: cmp.change >= 0 ? 'green' : 'red',
      text: `The class average is ${Math.abs(cmp.change)}% ${cmp.change >= 0 ? 'higher' : 'lower'} than on “${cmp.title}”.`,
    });
  }

  const graded = analytics.summary?.graded || 0;
  const peak = graded
    ? [...(distribution || [])].sort((a, b) => b.count - a.count)[0]
    : null;
  if (peak?.count > 0) {
    out.push({
      icon: 'chart', tone: 'indigo',
      text: `Most students scored between ${peak.label} (${Math.round((peak.count / graded) * 100)}%).`,
    });
  }

  const worst = (analytics.questions || []).filter((q) => q.percent != null).sort((a, b) => a.percent - b.percent)[0];
  if (worst) {
    out.push({ icon: 'target', tone: 'amber', text: `${worst.label} has the lowest average (${worst.percent}%). Worth revisiting.` });
  }

  if (counts.missed > 0) {
    out.push({ icon: 'users', tone: 'red', text: `${counts.missed} student${counts.missed === 1 ? ' has' : 's have'} not submitted. Send a reminder.` });
  } else if (counts.pending > 0) {
    out.push({ icon: 'clock', tone: 'amber', text: `${counts.pending} still to hand in, and the due date has not passed.` });
  } else if (counts.total > 0) {
    out.push({ icon: 'checkCircle', tone: 'green', text: 'Everybody has handed in.' });
  }

  const unmarked = counts.submitted - counts.graded;
  if (unmarked > 0) {
    out.push({ icon: 'pencil', tone: 'indigo', text: `${unmarked} submission${unmarked === 1 ? '' : 's'} still to mark.` });
  }

  if (!out.length) return <Blank text="Not enough has happened yet to say anything useful." />;
  return (
    <ul className="adinsights">
      {out.map((i) => (
        <li key={i.text}>
          <span className={`adinsights__icon tint-${i.tone}`}><Icon name={i.icon} size={16} /></span>
          {i.text}
        </li>
      ))}
    </ul>
  );
};

/** Daily arrivals turned into a running total, with the quiet days filled in. */
const TREND_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function cumulate(trend) {
  if (!trend?.length) return [];
  const days = trend.map((t) => new Date(t.day));
  const from = new Date(Math.min(...days));
  const to   = new Date(Math.max(...days));
  const byDay = Object.fromEntries(trend.map((t) => [dayKey(new Date(t.day)), t.count]));

  const out = [];
  let running = 0;
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d);
    running += byDay[key] || 0;
    out.push({ label: `${String(d.getDate()).padStart(2, '0')} ${TREND_MONTHS[d.getMonth()]}`, total: running });
  }
  return out;
}

/** Open every submitted file at once — the browser handles the rest. */
function downloadAll(students, doc) {
  const files = (students || []).flatMap((s) => s.files || []);
  if (!files.length) return toast.error('No submitted files on this page');
  toast.success(`Opening ${files.length} file${files.length === 1 ? '' : 's'}`);
  files.forEach((f, i) => {
    setTimeout(() => window.open(fileUrl(f.filePath), '_blank', 'noopener'), i * 250);
  });
}
