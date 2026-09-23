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
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getDocuments, uploadDocument, updateDocument, deleteDocument, getDocumentCategories,
} from '../../api/teacher.api';
import { Alert, Button, Confirm, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  ViewerHero, ViewerStats, ViewerStat, ViewerTabs, ViewerTools, SearchField, Picker,
  DocList, DocDrawer, NothingHere, Field,
  TABS, SORTS, applyFilters, fmtDate, fileUrl,
} from '../documents/viewerParts';
import ShareDocument from './ShareDocument';
import Tabs from '../../components/ui/Tabs';

const SCOPES = [
  { value: 'shared', label: 'Shared with me' },
  { value: 'mine',   label: 'My uploads' },
];

export default function TeacherDocuments() {
  const navigate = useNavigate();
  const [year, setYear] = useState('');
  const { data, meta, loading, error, refetch } = useFetch(
    () => getDocuments(year ? { year } : undefined), [year],
  );
  const { data: catData } = useFetch(getDocumentCategories);

  const all      = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const counts   = meta?.counts || {};
  const sections = meta?.sections || [];
  const years    = meta?.years || [];
  const categories = useMemo(
    () => (catData || []).map((c) => c.name ?? c),
    [catData],
  );

  const [scope,    setScope]    = useState('shared');
  const [tab,      setTab]      = useState('all');
  const [category, setCategory] = useState('');
  const [search,   setSearch]   = useState('');
  const [sort,     setSort]     = useState('newest');
  const [open,     setOpen]     = useState(null);

  const [editing,  setEditing]  = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [del,      setDel]      = useState(null);
  const [busy,     setBusy]     = useState(false);

  const scoped = useMemo(
    () => all.filter((d) => (scope === 'mine' ? d.mine : !d.mine)),
    [all, scope],
  );

  const shown = useMemo(
    () => applyFilters(scoped, { tab, category, search, sort }),
    [scoped, tab, category, search, sort],
  );

  // The tab counts follow the scope, or they would promise rows the other half
  // of the page is holding.
  const tabCounts = useMemo(() => ({
    all:         scoped.length,
    assignments: scoped.filter((d) => d.isAssignment).length,
    notices:     scoped.filter((d) => ['notice', 'circular'].includes(d.docType)).length,
    study:       scoped.filter((d) => d.docType === 'study_material').length,
  }), [scoped]);

  const filtered = !!(category || search);
  const clear = () => { setCategory(''); setSearch(''); setTab('all'); };
  const live  = open ? all.find((d) => d._id === open._id) || open : null;

  // ── Upload / edit ──────────────────────────────────────────────────────────
  const startNew  = () => { setEditing(null); setShowForm(true); };
  const startEdit = (d)  => { setOpen(null); setEditing(d); setShowForm(true); };

  const save = async (form, files) => {
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
      fd.append('dueDate', form.isAssignment && form.dueDate ? form.dueDate : '');
      fd.append('totalMarks', form.isAssignment && form.totalMarks ? form.totalMarks : '');
      // One document across every section it was set for, not a copy per
      // section — it is marked in one place.
      fd.append('sectionIds', JSON.stringify(form.sectionIds));
      files.forEach((f) => fd.append('files', f));

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

  if (loading && !data) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page dvpg">
      <ViewerHero
        icon="files"
        title="Documents"
        subtitle="Notices and material shared with you, and the work you have set your sections."
        right={
          <>
            {years.length > 1 && (
              <Picker value={year} onChange={setYear} all="This year" label="Academic year"
                options={[{ value: 'all', label: 'All years' },
                  ...years.map((y) => ({ value: y._id, label: y.name }))]} />
            )}
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
          caption="Notices, circulars and class material"
          on={scope === 'shared'} onClick={() => { setScope('shared'); setTab('all'); }} />
        <ViewerStat icon="upload" tone="purple" value={counts.mine} label="My uploads"
          caption="What you have shared"
          on={scope === 'mine'} onClick={() => { setScope('mine'); setTab('all'); }} />
        <ViewerStat icon="clipboard" tone="green" value={counts.assignments} label="Assignments"
          caption="Set across your sections" />
        <ViewerStat icon="pencil" tone="amber" value={counts.toMark} label="To mark"
          caption="Handed in, not yet marked" />
      </ViewerStats>

      <section className="card dvpanel">
        <Tabs variant="pill" className="uitabs--inset uitabs--flush" label="Which documents"
          value={scope} onChange={(v) => { setScope(v); setTab('all'); }}
          items={SCOPES.map((s) => ({
            key: s.value, label: s.label,
            count: s.value === 'mine' ? counts.mine ?? 0 : counts.shared ?? 0,
          }))} />

        <ViewerTabs tabs={TABS} value={tab} counts={tabCounts} onChange={setTab} />

        <ViewerTools>
          <SearchField value={search} onChange={setSearch} />
          <Picker value={category} onChange={setCategory} all="All categories"
            options={categories} label="Filter by category" />
          <span className="dvtools__sep" />
          <Picker value={sort} onChange={setSort} options={SORTS} label="Sort documents" />
        </ViewerTools>

        <DocList
          docs={shown} loading={loading} onOpen={setOpen}
          empty={<NothingHere filtered={filtered} onClear={clear}
            what={scope === 'mine' ? 'uploads' : 'documents'} />}
          badges={(d) => (d.isAssignment && d.mine
            ? (
              <span className={`dvpill dvpill--${d.submissionCount > d.markedCount ? 'warn' : 'yes'}`}>
                <Icon name="checkCircle" size={12} /> {d.markedCount}/{d.submissionCount} marked
              </span>
            )
            : null)}
          actions={(d) => (
            <>
              {d.isAssignment && (
                <button type="button" className="dvact" title="Open submissions"
                  aria-label={`Open submissions for ${d.title}`}
                  onClick={() => navigate(`/teacher/documents/${d._id}?tab=submissions`)}>
                  <Icon name="users" size={15} />
                </button>
              )}
              {d.mine && (
                <button type="button" className="dvact" title="Edit" aria-label={`Edit ${d.title}`}
                  onClick={() => startEdit(d)}>
                  <Icon name="pencil" size={15} />
                </button>
              )}
            </>
          )}
        />
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
            {live.files?.[0] && (
              <a className="btn btn-secondary" href={fileUrl(live.files[0].filePath)} target="_blank" rel="noreferrer">
                <Icon name="download" size={15} /> Open the file
              </a>
            )}
            {live.mine && (
              <>
                <button type="button" className="btn btn-danger" onClick={() => setDel(live)}>
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

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy}
        title="Delete document"
        message={del ? `Delete “${del.title}”? Anything handed in against it goes with it.` : ''} />
    </div>
  );
}
