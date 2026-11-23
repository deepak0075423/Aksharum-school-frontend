/**
 * Teacher → Documents.
 *
 * Two halves of one shelf: what has been shared *with* this teacher — staff
 * notices, school circulars, work set for a class they teach — and what they
 * have shared themselves. The split is the first control on the page because it
 * is the first question: am I reading, or am I looking after my own?
 *
 * Their own assignments carry the count of what has come in, and open the same
 * four-tab screen the office gets (`/teacher/documents/:id`) — the submissions
 * list, the marking form and the discussion. A teacher may read anything shared
 * with them there and may only mark what they set; the routes enforce it.
 *
 * Built on the shared viewer kit, so a document looks the same to a teacher as
 * it does to the class they set it for.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getDocuments, uploadDocument, updateDocument, deleteDocument, getDocumentCategories,
  markDocumentRead, markDocumentsRead, archiveDocument, publishDocument, bulkDeleteDocuments,
} from '../../api/teacher.api';
import { Alert, Button, Confirm, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  ViewerHero, ViewerStats, ViewerStat, ViewerTabs, ViewerTools, SearchField, Picker, YearPicker,
  ReaderList, useReaderView, DocDrawer, NothingHere, Field, UnreadNote, OpenFile,
  TABS, sortsFor, sortOn, useShelf, useReadMarks, fmtDate,
} from '../documents/viewerParts';
import ShareDocument from './ShareDocument';
import Tabs from '../../components/ui/Tabs';
import { ResetFilters, ArchiveConfirm, BulkDeleteConfirm, ViewSwitch, DocFoot } from '../admin/documentParts';
import useCardPaging from '../../hooks/useCardPaging';
import { SelectionBar, useSelection } from '../admin/listParts';

// "All" (Nov 23 2026): both halves together — what the Assignments tile
// counts, so the tile has somewhere to open.
const SCOPES = [
  { value: 'all',    label: 'All' },
  { value: 'shared', label: 'Shared with me' },
  { value: 'mine',   label: 'My uploads' },
];

export default function TeacherDocuments() {
  const navigate = useNavigate();
  const [year, setYear] = useState('');
  const { data: catData } = useFetch(getDocumentCategories);

  const [scope,    setScope]    = useState('shared');
  const [tab,      setTab]      = useState('all');
  const [category, setCategory] = useState('');
  const [search,   setSearch]   = useState('');
  const [sort,     setSort]     = useState('newest');
  const [open,     setOpen]     = useState(null);
  const [limit,    setLimit]    = useState(10);
  // List or Card on a laptop, cards only on a phone; a page of cards is whole rows.
  const rv     = useReaderView('teacher.documents.view');
  const paging = useCardPaging({ cards: rv.asCards });

  // `?edit=<id>` names one of their own documents to open the form on — how the
  // document's own page sends its owner back here. The server finds it
  // whatever year or half of the shelf it sits in (`meta.focused`).
  const [urlParams, setUrlParams] = useSearchParams();
  const focusRef = useRef(urlParams.get('edit'));

  // The server narrows, counts and pages; this page only says what it wants.
  const params = useMemo(
    // No scope is both halves of the shelf.
    () => ({ year, scope: scope === 'all' ? '' : scope, tab: tab === 'all' ? '' : tab, category, search, sort: sortOn(tab, sort) }),
    [year, scope, tab, category, search, sort],
  );
  const { docs: loaded, meta, loading, error, page, pages, total, setPage, refetch } = useShelf(getDocuments, params, { focusRef, limit });

  // The same list, with what has been opened on this visit already marked read.
  const { docs: all, read, readAll, stillUnread } = useReadMarks(loaded, { one: markDocumentRead, many: markDocumentsRead });
  const counts   = meta?.counts || {};
  const sections = meta?.sections || [];
  const years    = meta?.years || [];
  const unread   = stillUnread(meta?.unreadIds);
  const categories = useMemo(
    () => (catData || []).map((c) => c.name ?? c),
    [catData],
  );

  const [editing,  setEditing]  = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [del,      setDel]      = useState(null);
  const [busy,     setBusy]     = useState(false);
  // Asked before archiving, and before several of their own go at once (Nov 23 2026).
  const [archiveAsk, setArchiveAsk] = useState(null);
  const [bulkDel,    setBulkDel]    = useState(null);

  const shown = all;

  // The tab counts follow the scope, or they would promise rows the other half
  // of the page is holding. The server counts them over that half.
  const tabCounts = meta?.tabCounts || {};

  const filtered = !!(category || search);
  const clear = () => { setCategory(''); setSearch(''); setTab('all'); };
  const live  = open
    ? all.find((d) => d._id === open._id)
      || (meta?.focused && String(meta.focused._id) === String(open._id) ? meta.focused : open)
    : null;

  // ── Upload / edit ──────────────────────────────────────────────────────────
  const startNew  = () => { setEditing(null); setShowForm(true); };
  const startEdit = (d)  => { setOpen(null); setEditing(d); setShowForm(true); };

  // The edit form opens on arrival. (The page's Edit button used to bring its
  // owner to this list and stop.)
  useEffect(() => {
    const id = urlParams.get('edit');
    if (!id || !meta) return;
    const hit = meta.focused;
    if (hit?.mine && String(hit._id) === id) { setScope('mine'); startEdit(hit); }
    else toast.error('That document is not one of yours to edit');
    focusRef.current = null;
    const next = new URLSearchParams(urlParams);
    next.delete('edit');
    setUrlParams(next, { replace: true });
  }, [urlParams, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  // A copy starts as a draft, seen by nobody it is aimed at. Sharing it is
  // what puts it on their shelves and tells them.
  const shareDraft = async (d) => {
    try {
      await publishDocument(d._id);
      toast.success('Shared — everyone it is for has been told');
      refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  // Their own to put away and take back out. Archived, it leaves every
  // reader's shelf and stays on this one, marked. Archiving asks first.
  const toggleArchive = (d) => {
    if (d.isArchived) runArchive(d, false);
    // The drawer closes as it asks: it sits above the dialog layer.
    else { setOpen(null); setArchiveAsk([d]); }
  };
  const runArchive = async (d, archived = true) => {
    setBusy(true);
    try {
      await archiveDocument(d._id, archived);
      toast.success(archived ? 'Archived — readers no longer see it' : 'Back on the shelf');
      setArchiveAsk(null);
      refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  // Ticking several of their own uploads to delete together (Nov 23 2026).
  // Only on "My uploads", and only what is theirs — the server checks too.
  // Their own rows, wherever they show — "My uploads" or "All".
  const sel = useSelection(
    scope === 'shared' ? [] : all.filter((d) => d.mine),
    `${scope}|${tab}|${category}|${search}|${sort}|${year}|${page}|${limit}`,
  );
  const runBulkDelete = async () => {
    setBusy(true);
    try {
      const r = await bulkDeleteDocuments(bulkDel.map((d) => d._id));
      const n = r?.deleted ?? bulkDel.length;
      toast.success(n === 1 ? 'Document deleted' : `${n} documents deleted`);
      setBulkDel(null); setOpen(null);
      sel.clear();
      refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (form, files, kept = []) => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      fd.append('description', form.description);
      fd.append('docType', form.docType);
      fd.append('category', form.category);
      fd.append('subject', form.subject);
      // Always sent both ways: the edit endpoint reads `undefined` as "leave it
      // alone", so an assignment un-ticked would otherwise stay one.
      fd.append('isAssignment', form.isAssignment ? 'true' : 'false');
      fd.append('allowSubmission', form.isAssignment && form.allowSubmission ? 'true' : 'false');
      fd.append('assignmentType', form.assignmentType);
      fd.append('dueDate', form.isAssignment && form.dueDate ? form.dueDate : '');
      fd.append('totalMarks', form.isAssignment && form.totalMarks ? form.totalMarks : '');
      // A breakdown splits the "Out of"; with none there is nothing to split.
      fd.append('questions', JSON.stringify(form.isAssignment && Number(form.totalMarks) > 0 ? form.questions : []));
      // One document across every section it was set for, not a copy per
      // section — it is marked in one place.
      fd.append('sectionIds', JSON.stringify(form.sectionIds));
      files.forEach((f) => fd.append('files', f));
      // On an edit: which of the files already attached are staying. The new
      // ones above are added to them rather than replacing them.
      if (editing) fd.append('keepFiles', JSON.stringify(kept.map((f) => f.storedName)));

      if (editing) {
        await updateDocument(editing._id, fd);
        toast.success('Updated');
      } else {
        await uploadDocument(fd);
        toast.success(form.sectionIds.length > 1
          ? `Shared with ${form.sectionIds.length} sections`
          : 'Shared with your section');
      }
      setShowForm(false);
      setScope('mine');
      refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteDocument(del._id);
      toast.success('Deleted');
      setDel(null); setOpen(null);
      refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !meta) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page dvpg">
      <ViewerHero
        icon="files"
        title="Documents"
        subtitle="Notices and material shared with you, and the work you have set your sections."
        right={
          <>
            <YearPicker years={years} value={year} onChange={setYear} />
            <Button onClick={startNew} disabled={!sections.length}>
              <Icon name="plus" size={16} /> Share a document
            </Button>
          </>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}
      {!sections.length && (
        <Alert variant="info">
          You are not assigned to a section yet, so there is nowhere to share to.
          You can still read everything shared with you.
        </Alert>
      )}

      <ViewerStats>
        <ViewerStat icon="files" tone="indigo" value={counts.shared} label="Shared with me"
          caption="Notices and class material"
          on={scope === 'shared'} onClick={() => { setScope('shared'); setTab('all'); }} />
        <ViewerStat icon="upload" tone="purple" value={counts.mine} label="My uploads"
          caption="What you have shared"
          on={scope === 'mine'} onClick={() => { setScope('mine'); setTab('all'); }} />
        {/* Opens what it counts (Nov 23 2026): every assignment on the shelf —
            shared with them and set by them — so both halves, "All". */}
        <ViewerStat icon="clipboard" tone="green" value={counts.assignments} label="Assignments"
          caption="Set across your sections"
          on={scope === 'all' && tab === 'assignments'}
          onClick={() => {
            const off = scope === 'all' && tab === 'assignments';
            setScope(off ? 'shared' : 'all'); setTab(off ? 'all' : 'assignments');
          }} />
        <ViewerStat icon="pencil" tone="amber" value={counts.toMark} label="To mark"
          caption="Handed in, not yet marked"
          on={scope === 'mine' && tab === 'assignments'}
          onClick={() => { setScope('mine'); setTab('assignments'); }} />
      </ViewerStats>

      <section className="card dvpanel">
        <Tabs variant="pill" className="uitabs--inset uitabs--flush" label="Which documents"
          value={scope} onChange={(v) => { setScope(v); setTab('all'); }}
          items={SCOPES.map((s) => ({
            key: s.value, label: s.label,
            count: s.value === 'mine' ? counts.mine ?? 0
              : s.value === 'shared' ? counts.shared ?? 0
                : (counts.mine ?? 0) + (counts.shared ?? 0),
          }))} />

        <ViewerTabs tabs={TABS} value={tab} counts={tabCounts} onChange={setTab} />

        <ViewerTools>
          <SearchField value={search} onChange={setSearch} />
          <Picker value={category} onChange={setCategory} all="All categories"
            options={categories} label="Filter by category" />
          <span className="dvtools__sep" />
          {scope !== 'mine' && <UnreadNote count={unread.length} onClear={() => readAll(unread)} />}
          <Picker value={sortOn(tab, sort)} onChange={setSort} options={sortsFor(tab)} label="Sort documents" />
          <ResetFilters on={!!(search || category || sort !== 'newest')}
            onClick={() => { setSearch(''); setCategory(''); setSort('newest'); }} />
          {!rv.cardsOnly && <ViewSwitch value={rv.view} onChange={rv.setView} />}
        </ViewerTools>

        {scope !== 'shared' && (
          <SelectionBar count={sel.ids.length} noun="document" onClear={sel.clear}>
            {!sel.allOn && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={sel.toggleAll}>
                Select all {all.filter((d) => d.mine).length}
              </button>
            )}
            <button type="button" className="btn btn-danger btn-sm" disabled={busy}
              onClick={() => setBulkDel(sel.rows)}>
              <Icon name="trash" size={14} /> Delete
            </button>
          </SelectionBar>
        )}

        <ReaderList asCards={rv.asCards} gridRef={paging.gridRef}
          docs={shown} loading={loading} onOpen={(d) => { setOpen(d); read(d); }}
          // Their own uploads can be ticked to delete together, where they show.
          tick={scope !== 'shared'
            ? (d) => (d.mine ? { checked: sel.has(d._id), onChange: () => sel.toggle(d._id) } : null)
            : undefined}
          tickAll={sel.ids.length || all.some((d) => d.mine)
            ? { checked: sel.allOn, some: sel.some, onChange: sel.toggleAll } : undefined}
          empty={<NothingHere filtered={filtered} onClear={clear}
            what={scope === 'mine' ? 'uploads' : 'documents'} />}
          badges={(d) => (d.isAssignment && d.mine
            ? (
              <span className={`dvpill dvpill--${d.submissionCount > d.markedCount ? 'warn' : 'yes'}`}>
                <Icon name="checkCircle" size={12} /> {d.markedCount}/{d.submissionCount} marked
              </span>
            )
            : null)}
        />

        <DocFoot page={page} pages={pages} total={total} limit={limit} count={shown.length}
          onPage={setPage} sizes={paging.sizes} onLimit={(n) => { setLimit(n); setPage(1); }} />
      </section>

      <DocDrawer
        doc={live}
        onClose={() => setOpen(null)}
        extra={live?.isAssignment && (
          <section className="dvdrawer__sec">
            <h4>Submissions</h4>
            <dl>
              <Field label="Handed in">{live.submissionCount}</Field>
              <Field label="Marked">{live.markedCount}</Field>
              {live.dueDate ? <Field label="Due">{fmtDate(live.dueDate)}</Field> : null}
              {live.totalMarks ? <Field label="Out of">{live.totalMarks}</Field> : null}
            </dl>
            <Button variant="secondary" onClick={() => navigate(`/teacher/documents/${live._id}?tab=submissions`)}>
              <Icon name="arrowRight" size={15} />
              {live.mine ? 'Open marking screen' : 'Open submissions'}
            </Button>
          </section>
        )}
        foot={live && (
          <>
            <OpenFile files={live.files} caption={live.title} />
            {/* Every document has a page — the discussion under it lives
                there, and a notice had no way to reach it from here. */}
            <button type="button" className="btn btn-secondary"
              onClick={() => navigate(`/teacher/documents/${live._id}${live.isAssignment ? '' : '?tab=comments'}`)}>
              <Icon name="chat" size={15} /> {live.isAssignment ? 'Open page' : 'Comments'}
            </button>
            {live.mine && (
              <>
                {live.isDraft && (
                  <button type="button" className="btn btn-primary" onClick={() => shareDraft(live)}>
                    <Icon name="upload" size={15} /> Share now
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => toggleArchive(live)}>
                  <Icon name={live.isArchived ? 'refresh' : 'package'} size={15} />
                  {live.isArchived ? 'Restore' : 'Archive'}
                </button>
                <button type="button" className="btn btn-danger" onClick={() => { setOpen(null); setDel(live); }}>
                  <Icon name="trash" size={15} /> Delete
                </button>
                <button type="button" className="btn btn-primary" onClick={() => startEdit(live)}>
                  <Icon name="pencil" size={15} /> Edit
                </button>
              </>
            )}
          </>
        )}
      />

      <ShareDocument
        open={showForm}
        editing={editing}
        sections={sections}
        categories={categories}
        saving={saving}
        onClose={() => setShowForm(false)}
        onSave={save}
      />

      <ArchiveConfirm docs={archiveAsk} loading={busy}
        onClose={() => setArchiveAsk(null)} onConfirm={() => runArchive(archiveAsk[0], true)} />

      <BulkDeleteConfirm docs={bulkDel} loading={busy}
        onClose={() => setBulkDel(null)} onConfirm={runBulkDelete} />

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy}
        title="Delete document"
        message={del ? `Delete “${del.title}”? Anything handed in against it goes with it.` : ''} />
    </div>
  );
}
