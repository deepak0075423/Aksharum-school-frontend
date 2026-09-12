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
import { Alert, Button, Confirm, Modal, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  ViewerHero, ViewerStats, ViewerStat, ViewerTabs, ViewerTools, SearchField, Picker,
  DocList, DocDrawer, NothingHere, Field,
  TABS, SORTS, applyFilters, fmtDate, fileUrl, DOC_TYPES,
} from '../documents/viewerParts';

const EMPTY = {
  title: '', description: '', docType: 'notice', category: '',
  sectionId: '', isAssignment: false, dueDate: '', totalMarks: '',
};

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

  const [form,     setForm]     = useState(EMPTY);
  const [files,    setFiles]    = useState([]);
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
  const startNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, sectionId: sections[0]?._id || '' });
    setFiles([]);
    setShowForm(true);
  };

  const startEdit = (d) => {
    setEditing(d);
    setForm({
      title: d.title,
      description: d.description || '',
      docType: d.docType || 'notice',
      category: d.category || '',
      sectionId: '',
      isAssignment: !!d.isAssignment,
      dueDate: d.dueDate ? String(d.dueDate).slice(0, 10) : '',
      totalMarks: d.totalMarks == null ? '' : String(d.totalMarks),
    });
    setFiles([]);
    setOpen(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (!form.category)     return toast.error('Category is required');
    if (!editing && !form.sectionId) return toast.error('Choose the section this is for');

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      fd.append('description', form.description);
      fd.append('docType', form.docType);
      fd.append('category', form.category);
      fd.append('isAssignment', form.isAssignment ? 'true' : 'false');
      fd.append('dueDate', form.isAssignment && form.dueDate ? form.dueDate : '');
      if (form.isAssignment && form.totalMarks) {
        fd.append('totalMarks', form.totalMarks);
        fd.append('marksEnabled', 'true');
      }
      files.forEach((f) => fd.append('files', f));

      if (editing) {
        await updateDocument(editing._id, fd);
        toast.success('Updated');
      } else {
        // A teacher shares with one of their own sections; the section is the
        // whole target, so the form never asks who instead of where.
        fd.append('sectionId', form.sectionId);
        await uploadDocument(fd);
        toast.success('Shared with your section');
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
        <div className="dvscope" role="tablist" aria-label="Which documents">
          {SCOPES.map((s) => (
            <button key={s.value} type="button" role="tab" aria-selected={scope === s.value}
              className={`dvscope__btn${scope === s.value ? ' is-on' : ''}`}
              onClick={() => { setScope(s.value); setTab('all'); }}>
              {s.label}<b>{s.value === 'mine' ? counts.mine ?? 0 : counts.shared ?? 0}</b>
            </button>
          ))}
        </div>

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

      <Modal open={showForm} onClose={() => setShowForm(false)} maxWidth={560}
        title={editing ? 'Edit document' : 'Share a document'}
        footer={<>
          <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          <Button onClick={save} loading={saving}>{editing ? 'Save changes' : 'Share'}</Button>
        </>}>
        <div className="form-group">
          <label className="form-label required">Title</label>
          <input className="form-control" autoFocus maxLength={160} value={form.title}
            placeholder="e.g. Chapter 5 — practice questions"
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-control" rows={2} maxLength={300} value={form.description}
            placeholder="One line about what this is"
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>

        <div className="dvform__row">
          <div className="form-group">
            <label className="form-label required">Type</label>
            <select className="form-control" value={form.docType}
              onChange={(e) => setForm((f) => ({
                ...f,
                docType: e.target.value,
                isAssignment: e.target.value === 'assignment' ? true : f.isAssignment,
              }))}>
              {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Category</label>
            <select className="form-control" value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              <option value="">— Select —</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {!editing && (
          <div className="form-group">
            <label className="form-label required">Section</label>
            <select className="form-control" value={form.sectionId}
              onChange={(e) => setForm((f) => ({ ...f, sectionId: e.target.value }))}>
              {sections.map((s) => <option key={s._id} value={s._id}>{s.label}</option>)}
            </select>
            <div className="form-hint">Everyone in that section sees it.</div>
          </div>
        )}

        <label className="dvcheck">
          <input type="checkbox" checked={form.isAssignment}
            onChange={(e) => setForm((f) => ({
              ...f,
              isAssignment: e.target.checked,
              docType: e.target.checked ? 'assignment' : (f.docType === 'assignment' ? 'other' : f.docType),
            }))} />
          <span>Students hand work in against this</span>
        </label>

        {form.isAssignment && (
          <div className="dvform__row">
            <div className="form-group">
              <label className="form-label">Due date</label>
              <input type="date" className="form-control" value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Out of</label>
              <input type="number" min="1" className="form-control" value={form.totalMarks}
                placeholder="e.g. 50"
                onChange={(e) => setForm((f) => ({ ...f, totalMarks: e.target.value }))} />
            </div>
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">{editing ? 'Replace files' : 'Files'}</label>
          <input type="file" className="form-control" multiple
            onChange={(e) => setFiles(Array.from(e.target.files))} />
          {files.length > 0
            ? <div className="form-hint">{files.length} file(s) chosen</div>
            : editing?.fileCount
              ? <div className="form-hint">Leave empty to keep the {editing.fileCount} file(s) already attached.</div>
              : null}
        </div>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy}
        title="Delete document"
        message={del ? `Delete “${del.title}”? Anything handed in against it goes with it.` : ''} />
    </div>
  );
}
