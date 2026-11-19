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
import { Alert, Button, Confirm, Modal, Spinner } from '../../components/ui/index';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/ui/icons';
import { saveFile } from '../../utils/downloadFile';
import { fetchFile } from '../../utils/fileAccess';
import { typeOf, downloadUrl } from './documentParts';
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

/**
 * Keyed on the document: going from one to another (Duplicate does) is a new
 * page, not this one with a different id. Without the key the copy opened
 * showing the original's analytics, comment count, picked student and filters.
 */
export default function DocumentDetail() {
  const { id } = useParams();
  return <DocumentDetailPage key={id} />;
}

function DocumentDetailPage() {
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
      archive:   teacherApi.archiveDocument,  // their own only — the route checks
      remove:    teacherApi.deleteDocument,
      markRead:  teacherApi.markDocumentRead,
      versions:  teacherApi.getDocumentVersions,
      restore:   teacherApi.restoreDocumentVersion,
      readers:   teacherApi.getDocumentReaders,
      publish:   teacherApi.publishDocument,
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
      versions:  adminApi.getDocumentVersions,
      restore:   adminApi.restoreDocumentVersion,
      readers:   adminApi.getDocumentReaders,
      publish:   adminApi.publishDocument,
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
  // The page's clock: a reminder button held until a time (the server's
  // `remindAgainAt`) comes back by itself when that time passes.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

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
  // Comments are words only (Nov 2026) — files go on the document itself.
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
      toast.success(Number(doc?.totalMarks) > 0 ? 'Marks and feedback saved' : 'Feedback saved');
      // The analytics were worked out before this mark existed.
      setAnalytics(null);
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
      toast.success(r.sent
        ? `Reminder sent to ${r.sent} student${r.sent === 1 ? '' : 's'} and their parents`
        : (r.message || 'Nobody to remind'));
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      // Sent or refused, the page reads back when each button may be pressed
      // again, and holds it until then.
      await load(false);
    }
  };

  // Everyone the current filters leave, not the ten rows on screen — Export
  // and Download used to stop at the page.
  const wholeRoster = async () => {
    const out = [];
    for (let p = 1; p <= 50; p += 1) {
      const d = unwrap(await api.detail(id, {
        status: status || undefined, section: section || undefined, search: term || undefined,
        sort, page: p, limit: 200,
      }));
      out.push(...(d.roster?.students || []));
      if (p >= (d.roster?.pages || 1)) break;
    }
    return out;
  };

  // ── Earlier files, and who has opened it ───────────────────────────────────
  const [history, setHistory] = useState(null);     // { current, versions } | 'loading'
  const [readers, setReaders] = useState(null);     // { total, readers } | 'loading'
  const openHistory = async () => {
    setConfirm(null); setHistory('loading');
    try { setHistory(unwrap(await api.versions(id))); }
    catch (err) { setHistory(null); toast.error(err?.response?.data?.message || err.message); }
  };
  const openReaders = async () => {
    setConfirm(null); setReaders('loading');
    try { setReaders(unwrap(await api.readers(id))); }
    catch (err) { setReaders(null); toast.error(err?.response?.data?.message || err.message); }
  };
  const restoreVersion = async (v) => {
    try {
      await api.restore(id, v._id);
      toast.success(`Version ${v.versionNumber} is the current one again`);
      setHistory(null);
      await load(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  const duplicate = async () => {
    try {
      const r = await api.duplicate(id);
      toast.success('Copy made as a draft — nobody sees it until you share it');
      navigate(`${home}/${unwrap(r)._id}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  // A draft goes onto its audience's shelves — and they are told — only here.
  const [sharing, setSharing] = useState(false);
  const publish = async () => {
    setSharing(true);
    try {
      await api.publish(id);
      toast.success('Shared — everyone it is for has been told');
      await load(false);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSharing(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}${home}/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied — it opens for staff who can see this document');
    } catch {
      // Clipboard is blocked outside a secure context — show the link so it can
      // still be copied by hand rather than failing silently.
      window.prompt('Copy this link', url);
    }
  };

  const [working, setWorking] = useState('');     // 'export' | 'files' while one runs
  const exportCsv = async () => {
    if (!roster?.shown) return toast.error('Nothing to export');
    setWorking('export');
    let rows;
    try { rows = await wholeRoster(); }
    catch (err) { setWorking(''); return toast.error(err?.response?.data?.message || err.message); }
    setWorking('');
    const head = ['Roll No.', 'Student', 'Section', 'Status', 'Submitted On', 'Marks', 'Out of', 'Feedback'];
    // A cell that starts with = + - or @ is a formula to a spreadsheet; a
    // leading apostrophe makes it text again.
    const esc  = (v) => {
      const t = String(v ?? '');
      return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
    };
    const csv  = [head, ...rows.map((r) => [
      r.rollNumber, r.name, r.sectionLabel, r.state,
      r.submittedAt ? `${fmtDate(r.submittedAt)} ${fmtTime(r.submittedAt)}` : '',
      r.marks ?? '', doc.totalMarks ?? '', r.feedback,
    ])].map((line) => line.map(esc).join(',')).join('\n');
    saveFile(`\ufeff${csv}`, `${doc.title.replace(/[^\w\-]+/g, '_')}-submissions.csv`, 'text/csv;charset=utf-8');
  };

  /**
   * Every submitted file, saved one after another under the student's name.
   *
   * It used to open a browser tab per file — the pop-up blocker stopped it
   * after the first — and only for the ten students on screen.
   */
  const downloadAll = async () => {
    setWorking('files');
    try {
      const students = (await wholeRoster()).filter((s) => s.files?.length);
      const total = students.reduce((n, s) => n + s.files.length, 0);
      if (!total) { toast.error('Nobody on this list has handed in a file'); return; }
      const note = toast.loading(`Saving ${total} file${total === 1 ? '' : 's'}…`);
      let saved = 0;
      for (const s of students) {
        for (const f of s.files) {
          try {
            const res = await fetchFile(downloadUrl(f.filePath));
            if (!res.ok) throw new Error(String(res.status));
            const who = `${s.rollNumber ? `${s.rollNumber}-` : ''}${s.name}`.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
            saveFile(await res.blob(), `${who}-${f.originalName}`, f.mimeType || 'application/octet-stream');
            saved += 1;
            toast.loading(`Saving ${saved} of ${total}…`, { id: note });
            // A breath between saves: browsers drop downloads fired in one burst.
            await new Promise((r) => setTimeout(r, 350));
          } catch { /* counted below */ }
        }
      }
      toast.dismiss(note);
      if (saved === total) toast.success(`${saved} file${saved === 1 ? '' : 's'} saved`);
      else toast.error(`${saved} of ${total} files saved — the rest could not be opened`);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setWorking('');
    }
  };

  const postComment = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return toast.error('Write something first');
    setPosting(true);
    try {
      await api.addComment(id, {
        body: draft.trim(), visibility, ...(replyTo ? { parent: replyTo._id } : {}),
      });
      setDraft(''); setReplyTo(null);
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
      if (c.kind === 'remind')  { await remind(); }
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
  // A tab this document does not have (`?tab=submissions` on a notice, or on
  // work that has since stopped being an assignment) is the Overview — it used
  // to draw nothing under the header at all.
  const view = tabs.some((t) => t.value === tab) ? tab : 'overview';
  const crumbHere = tabs.find((t) => t.value === view)?.label || 'Overview';
  const outstanding = (counts.pending || 0) + (counts.missed || 0);
  // "Remind everyone" waits out its hour (the server's `remindAgainAt`): the
  // button is held, and says when it last went, until it may go again.
  const remindWait  = !!doc.remindAgainAt && new Date(doc.remindAgainAt).getTime() > now;
  const remindLabel = remindWait ? `Reminded at ${fmtTime(doc.remindedAt)}` : 'Send Reminder';
  const remindTitle = remindWait
    ? `A reminder went to everyone at ${fmtTime(doc.remindedAt)} — the next can go after ${fmtTime(doc.remindAgainAt)}`
    : undefined;
  // Replying inside a staff-only thread stays staff-only, so the choice is
  // shown made rather than offered.
  const replyStaff = replyTo?.visibility === 'staff';

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
        {/* The section alone — the roster under it already says how many. */}
        {(roster?.sections || []).filter((s) => s._id).map((s) => (
          <option key={s._id} value={s._id}>{s.label}</option>
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
      now={now}
      outOf={doc.totalMarks}
      showFeedback={view === 'overview'}
      selected={picked?._id}
      onOpen={(r) => { pick(r); if (view === 'overview') setTab('submissions'); }}
      onMark={doc.canManage ? (r) => { pick(r); setTab('submissions'); } : undefined}
      onSelect={doc.canManage ? (r) => remind([r._id]) : undefined}
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
                  onClick={() => navigate(`${home}?edit=${id}`)}>
                  <Icon name="pencil" size={15} /> Edit
                </button>
                <button type="button" className="btn btn-secondary" onClick={duplicate}>
                  <Icon name="repeat" size={15} /> Duplicate
                </button>
              </>
            )}
            <button type="button" className="btn btn-secondary" onClick={share}
              title="Copy a link to this page — it opens for staff who can see this document">
              <Icon name="upload" size={15} /> Copy link
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

        <DetailTabs tabs={tabs} value={view} onChange={setTab} />
      </section>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* A copy waits here until it has been made this week's. */}
      {doc.isDraft && (
        <div className="addraft" role="status">
          <Icon name="info" size={18} />
          <p>
            <b>This is a draft.</b> Nobody it is shared with can see it yet, and nobody has been told about it.
            {doc.canManage ? ' Edit it — the title, the due date, the file — then share it.' : ''}
          </p>
          {doc.canManage && (
            <div className="addraft__acts">
              <button type="button" className="btn btn-secondary" onClick={() => navigate(`${home}?edit=${id}`)}>
                <Icon name="pencil" size={15} /> Edit
              </button>
              <button type="button" className="btn btn-primary" onClick={publish} disabled={sharing}>
                <Icon name="upload" size={15} /> {sharing ? 'Sharing…' : 'Share now'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Overview ───────────────────────────────────────────────────────── */}
      {view === 'overview' && (
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
                  <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={!!working}>
                    <Icon name="download" size={15} /> {working === 'export' ? 'Exporting…' : 'Export'}
                  </button>
                  {doc.canManage && (
                    <button type="button" className="btn btn-primary" onClick={() => setConfirm({ kind: 'remind' })}
                      disabled={remindWait} title={remindTitle}>
                      <Icon name="bell" size={15} /> {remindLabel}
                    </button>
                  )}
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
                <div><dt>Version</dt><dd>
                  v{doc.currentVersion}
                  {doc.canManage && doc.currentVersion > 1 && (
                    <button type="button" className="adlinkbtn" onClick={openHistory}>See earlier files</button>
                  )}
                </dd></div>
                {doc.canManage && (
                  <div><dt>Opened by</dt><dd>
                    {doc.readCount ? `${doc.readCount} ${doc.readCount === 1 ? 'person' : 'people'}` : 'Nobody yet'}
                    {doc.readCount > 0 && (
                      <button type="button" className="adlinkbtn" onClick={openReaders}>See who</button>
                    )}
                  </dd></div>
                )}
              </dl>
            </Panel>
            <Panel title="Files" subtitle={`(${doc.files?.length || 0})`}>
              <FileList files={doc.files} onView={viewer.open} />
            </Panel>
          </div>
        )
      )}

      {/* ── Submissions ────────────────────────────────────────────────────── */}
      {view === 'submissions' && isAssignment && (
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
                {doc.canManage && (
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirm({ kind: 'remind' })}
                    disabled={remindWait} title={remindTitle}>
                    <Icon name="bell" size={15} /> {remindLabel}
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={!!working}>
                  <Icon name="download" size={15} /> {working === 'export' ? 'Exporting…' : 'Export'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={downloadAll} disabled={!!working}>
                  <Icon name="files" size={15} /> {working === 'files' ? 'Saving…' : 'Download files'}
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
                  <SubmissionPanel student={picked} doc={doc} saving={saving} now={now}
                    onClose={() => setPicked(null)} onSave={doc.canManage ? saveMarks : null}
                    onRemind={doc.canManage ? (s) => remind([s._id]) : null} onView={viewer.open} />
                </div>
              )}
            </div>
          </Panel>
        </>
      )}

      {/* ── Analytics ──────────────────────────────────────────────────────── */}
      {view === 'analytics' && isAssignment && (
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
      {view === 'comments' && (
        <div className="adrow adrow--split">
          <Panel title="Comments & Discussions"
            lead="Communicate with students and keep track of important discussions."
            right={
              <div className="adtools adtools--com">
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
                  <div className="adcomposer__foot">
                    <span className="adtools__sep" />
                    <select className="form-control adsel" value={replyStaff ? 'staff' : visibility}
                      aria-label="Who can see this" disabled={replyStaff}
                      title={replyStaff ? 'A reply is seen by whoever sees the comment it answers' : undefined}
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
            <button type="button" onClick={openReaders}>
              <Icon name="eye" size={16} />
              Who has opened it{doc.readCount ? ` (${doc.readCount})` : ''}
            </button>
            <button type="button" onClick={openHistory}>
              <Icon name="repeat" size={16} /> Earlier files (version {doc.currentVersion})
            </button>
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
        confirmLabel={confirm?.kind === 'remind' ? 'Send reminder' : undefined}
        title={confirm?.kind === 'comment' ? 'Delete Comment'
          : confirm?.kind === 'archive' ? (doc.isArchived ? 'Restore Document' : 'Archive Document')
          : confirm?.kind === 'remind' ? 'Send Reminder'
          : 'Delete Document'}
        message={confirm?.kind === 'comment'
          ? commentDeleteText(confirm.comment, asTeacher)
          : confirm?.kind === 'remind'
            ? (outstanding
              ? `Remind the ${outstanding} student${outstanding === 1 ? '' : 's'} who ${outstanding === 1 ? 'has' : 'have'} not handed in “${doc.title}”? Their parents are told too. It can be sent to everyone once an hour.`
              : `Everyone has handed in “${doc.title}” — there is nobody to remind.`)
          : confirm?.kind === 'archive'
            ? (doc.isArchived ? `Put “${doc.title}” back on the shelf?` : `Archive “${doc.title}”? It stays here but leaves the main list.`)
            : `Permanently delete “${doc.title}”? Its files and every submission against it go with it.`} />

      {/* Earlier sets of files. Replacing a file keeps what was there. */}
      <Modal open={!!history} onClose={() => setHistory(null)} title="Earlier files" maxWidth={560}>
        {history === 'loading' || !history ? <Loading /> : (
          <div className="adversions">
            <section>
              <h4>Version {history.current.versionNumber} <span className="adpill adpill--yes">Current</span></h4>
              <FileList files={history.current.files} onView={viewer.open} />
            </section>
            {history.versions.length === 0 && (
              <p className="adnone">Nothing has been replaced on this document — there are no earlier files.</p>
            )}
            {history.versions.map((v) => (
              <section key={v._id}>
                <h4>
                  Version {v.versionNumber}
                  <small>replaced {fmtDate(v.replacedAt)}{v.replacedBy ? ` by ${v.replacedBy}` : ''}</small>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => restoreVersion(v)}>
                    <Icon name="refresh" size={14} /> Use these again
                  </button>
                </h4>
                <FileList files={v.files} onView={viewer.open} />
              </section>
            ))}
          </div>
        )}
      </Modal>

      {/* Who has opened it — the read marks, read from the sharer's side. */}
      <Modal open={!!readers} onClose={() => setReaders(null)} title="Who has opened it" maxWidth={520}>
        {readers === 'loading' || !readers ? <Loading /> : (
          readers.readers.length ? (
            <ul className="adreaders">
              {readers.readers.map((r) => (
                <li key={r._id}>
                  <Person name={r.name} photo={r.photo} size={30}
                    sub={[{ school_admin: 'Admin', teacher: 'Teacher', student: 'Student', parent: 'Parent' }[r.role] || r.role, r.section].filter(Boolean).join(' · ')} />
                  <time>{fmtDate(r.readAt)}, {fmtTime(r.readAt)}</time>
                </li>
              ))}
            </ul>
          ) : <p className="adnone">Nobody has opened this yet.</p>
        )}
      </Modal>
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
            <a className="adact" href={downloadUrl(f.filePath)} target="_blank" rel="noreferrer" download={f.originalName}
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
