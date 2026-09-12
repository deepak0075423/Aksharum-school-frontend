/**
 * Admin → Documents.
 *
 * The school's shelf: notices, circulars, study material and assignments, and
 * who each one went to. Built on documentParts.jsx — a marked header with the
 * one action, four figures over the shelf, then a single card holding the tab
 * strip, the filter bar, the list and its footer.
 *
 * Filtering, sorting and paging are all server-side. The list is a raw-SQL read
 * that resolves the uploader and the class or section names behind each row's
 * target in Postgres (see document.controller.js) — the alternative is pulling
 * the classes and sections tables into the browser to label twenty rows.
 *
 * The tiles and the dropdown options come from their own call and describe the
 * whole school, so switching a filter never makes the figures above the list
 * move.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getDocuments, getDocument, getDocumentOverview, uploadDocument, updateDocument, deleteDocument,
  archiveDocument, getDocumentCategories, createDocumentCategory, deleteDocumentCategory,
  getClassesWithSections,
} from '../../api/admin.api';
import { Alert, Button, Confirm, Modal } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  Crumbs, DocHero, DocStats, DocStat, DocTabs, DocTools, SearchField, Picker, SortMenu,
  ViewSwitch, DocTable, DocGrid, DocFoot, DocEmpty, DocumentDrawer, DocumentFields,
  MenuItem, MenuSep, fileUrl,
  TABS, SORTS, TARGET_FILTERS, DOC_TYPES,
} from './documentParts';

const EMPTY_FORM = {
  title: '', description: '', docType: 'notice', category: '',
  targetType: 'whole_school', isAssignment: false, dueDate: '',
};

// The axios interceptor resolves to the response body — { success, data, … } —
// and only useFetch peels that off. These calls go straight to the api module,
// so the payload is unwrapped here or every field reads one level too high.
const unwrap = (res) => res?.data ?? res;

// How many rows a page holds. Server-side, so this is also the query's LIMIT.
const PAGE_SIZE = 10;

export default function Documents() {
  const navigate = useNavigate();
  const [urlParams, setUrlParams] = useSearchParams();

  // ── What the list is showing ───────────────────────────────────────────────
  const [tab,      setTab]      = useState('all');
  const [search,   setSearch]   = useState('');
  const [term,     setTerm]     = useState('');
  const [category, setCategory] = useState('');
  const [target,   setTarget]   = useState('');
  const [year,     setYear]     = useState('');
  const [sort,     setSort]     = useState('newest');
  const [view,     setView]     = useState('list');
  const [page,     setPage]     = useState(1);

  // ── Data ───────────────────────────────────────────────────────────────────
  const [rows,    setRows]    = useState([]);
  const [meta,    setMeta]    = useState({ total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [over,    setOver]    = useState(null);
  const [classes, setClasses] = useState([]);
  const [cats,    setCats]    = useState([]);

  // ── Overlays ───────────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm]   = useState(EMPTY_FORM);
  const [files, setFiles] = useState([]);
  const [selClasses,  setSelClasses]  = useState([]);
  const [selSections, setSelSections] = useState([]);

  const [editDoc, setEditDoc] = useState(null);
  const [saving,  setSaving]  = useState(false);

  const [viewDoc, setViewDoc] = useState(null);
  const [delDoc,  setDelDoc]  = useState(null);
  const [busy,    setBusy]    = useState(false);

  const [showCats,  setShowCats]  = useState(false);
  const [newCat,    setNewCat]    = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [delCat,    setDelCat]    = useState(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    try {
      setOver(unwrap(await getDocumentOverview()));
    } catch (err) {
      // The tiles failing must not take the list down with them.
      setOver(null);
      setError(err?.response?.data?.message || err.message || 'Failed to load the summary');
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDocuments({
        tab,
        page,
        limit: PAGE_SIZE,
        sort,
        search: term || undefined,
        category: category || undefined,
        target: target || undefined,
        academicYear: year || undefined,
      });
      setRows(res.data || []);
      setMeta({ total: res.total || 0, pages: res.pages || 1 });
      setError('');
    } catch (err) {
      setRows([]);
      setError(err?.response?.data?.message || err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [tab, page, sort, term, category, target, year]);

  useEffect(() => { loadList(); }, [loadList]);

  /**
   * `?edit=<id>` opens the edit form on arrival — how the document's own page
   * sends someone back here to change it, rather than keeping a second copy of
   * this form over there.
   */
  useEffect(() => {
    const wanted = urlParams.get('edit');
    if (!wanted || editDoc) return;
    (async () => {
      try {
        const hit = rows.find((r) => r._id === wanted) || unwrap(await getDocument(wanted));
        if (hit) openEdit(hit);
        else toast.error('That document could not be found');
      } finally {
        const next = new URLSearchParams(urlParams);
        next.delete('edit');
        setUrlParams(next, { replace: true });
      }
    })();
  }, [urlParams, rows]);          // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    (async () => {
      try {
        const [c, k] = await Promise.all([getClassesWithSections(), getDocumentCategories()]);
        setClasses(unwrap(c) || []);
        setCats(unwrap(k) || []);
      } catch { /* the pickers just stay empty — the list is the page */ }
    })();
  }, []);

  // A keystroke is not a search; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const refresh = () => { loadList(); loadSummary(); };

  // ── Filter state ───────────────────────────────────────────────────────────
  const filtered = !!(term || category || target || year);

  const clearFilters = () => {
    setSearch(''); setTerm(''); setCategory(''); setTarget(''); setYear(''); setPage(1);
  };

  const go = (fn) => (v) => { fn(v); setPage(1); };

  const tiles = over?.tiles || {};
  const counts = over?.counts || {};

  // Archived is a state, not a kind, so it is not one of the four content tabs
  // — but a document put away with no way back is a deleted one with extra
  // steps. The tab appears only once there is something in there.
  const tabs = useMemo(
    () => (counts.archived > 0 ? [...TABS, { value: 'archived', label: `Archived (${counts.archived})` }] : TABS),
    [counts.archived],
  );

  // A filter left pointing at the archive after the last archived document is
  // restored would show an empty list with no tab to leave it by.
  useEffect(() => {
    if (tab === 'archived' && over && !counts.archived) setTab('all');
  }, [tab, over, counts.archived]);

  const categoryOptions = useMemo(
    () => (over?.categories || []).map((c) => ({ value: c.name, label: c.name, count: c.count })),
    [over],
  );

  const yearOptions = useMemo(
    () => (over?.academicYears || []).map((y) => ({
      value: y._id,
      label: y.status === 'active' ? `${y.name} (current)` : y.name,
      count: y.count,
    })),
    [over],
  );

  // ── Upload ─────────────────────────────────────────────────────────────────
  const resetForm = () => { setForm(EMPTY_FORM); setFiles([]); setSelClasses([]); setSelSections([]); };

  const validate = (f) => {
    if (!f.title.trim()) return 'Title is required';
    if (!f.category)     return 'Category is required';
    if (f.targetType === 'class'          && !selClasses.length)  return 'Select at least one class';
    if (f.targetType === 'class_sections' && !selSections.length) return 'Select at least one section';
    return '';
  };

  const bodyOf = (f) => {
    const fd = new FormData();
    fd.append('title', f.title.trim());
    fd.append('description', f.description);
    fd.append('docType', f.docType);
    fd.append('category', f.category);
    fd.append('targetType', f.targetType);
    fd.append('targetClasses',  JSON.stringify(f.targetType === 'class'          ? selClasses  : []));
    fd.append('targetSections', JSON.stringify(f.targetType === 'class_sections' ? selSections : []));
    // Always sent, both ways: the edit endpoint reads `undefined` as "leave it
    // alone", so an assignment un-ticked would otherwise stay an assignment.
    fd.append('isAssignment', f.isAssignment ? 'true' : 'false');
    fd.append('dueDate', f.isAssignment && f.dueDate ? f.dueDate : '');
    files.forEach((file) => fd.append('files', file));
    return fd;
  };

  const submitUpload = async () => {
    const bad = validate(form);
    if (bad) return toast.error(bad);
    setUploading(true);
    try {
      await uploadDocument(bodyOf(form));
      toast.success('Document uploaded');
      setShowUpload(false);
      resetForm();
      setPage(1);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setUploading(false);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const openEdit = (doc) => {
    setViewDoc(null);
    setEditDoc(doc);
    setForm({
      title:       doc.title,
      description: doc.description || '',
      docType:     doc.docType || 'other',
      category:    doc.category || '',
      targetType:  doc.targetType,
      isAssignment: !!doc.isAssignment,
      dueDate:     doc.dueDate ? String(doc.dueDate).slice(0, 10) : '',
    });
    setFiles([]);
    setSelClasses((doc.targetClasses  || []).map((c) => c._id || c));
    setSelSections((doc.targetSections || []).map((s) => s._id || s));
  };

  const submitEdit = async () => {
    const bad = validate(form);
    if (bad) return toast.error(bad);
    setSaving(true);
    try {
      await updateDocument(editDoc._id, bodyOf(form));
      toast.success('Document updated');
      setEditDoc(null);
      resetForm();
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Archive / delete ───────────────────────────────────────────────────────
  const toggleArchive = async (doc) => {
    try {
      await archiveDocument(doc._id, !doc.isArchived);
      toast.success(doc.isArchived ? 'Document restored' : 'Document archived');
      setViewDoc(null);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await deleteDocument(delDoc._id);
      toast.success('Document deleted');
      setDelDoc(null);
      setViewDoc(null);
      // Deleting the only row on the last page would otherwise strand the
      // reader on an empty page with a pager that says there are more.
      if (rows.length === 1 && page > 1) setPage(page - 1); else refresh();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Categories ─────────────────────────────────────────────────────────────
  const addCategory = async () => {
    if (!newCat.trim()) return toast.error('Name is required');
    setAddingCat(true);
    try {
      await createDocumentCategory({ name: newCat.trim() });
      setNewCat('');
      setCats(unwrap(await getDocumentCategories()) || []);
      loadSummary();
      toast.success('Category added');
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setAddingCat(false);
    }
  };

  const removeCategory = async () => {
    setBusy(true);
    try {
      await deleteDocumentCategory(delCat._id);
      setDelCat(null);
      setCats(unwrap(await getDocumentCategories()) || []);
      loadSummary();
      toast.success('Category deleted');
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  // ── The overflow menu on a row ─────────────────────────────────────────────
  const rowMenu = (r) => (
    <>
      <MenuItem icon="arrowRight" onClick={() => navigate(`/admin/documents/${r._id}`)}>Open document</MenuItem>
      <MenuItem icon="eye" onClick={() => setViewDoc(r)}>Quick preview</MenuItem>
      {r.files?.[0] && (
        <MenuItem icon="download" href={fileUrl(r.files[0].filePath)}>
          Open {r.fileCount > 1 ? 'first file' : 'file'}
        </MenuItem>
      )}
      <MenuSep />
      <MenuItem icon="pencil" onClick={() => openEdit(r)}>Edit document</MenuItem>
      <MenuItem icon={r.isArchived ? 'refresh' : 'package'} onClick={() => toggleArchive(r)}>
        {r.isArchived ? 'Restore from archive' : 'Archive'}
      </MenuItem>
      <MenuSep />
      <MenuItem icon="trash" danger onClick={() => setDelDoc(r)}>Delete document</MenuItem>
    </>
  );

  const empty = <DocEmpty filtered={filtered} onClear={clearFilters} onUpload={() => setShowUpload(true)} />;
  const List  = view === 'grid' ? DocGrid : DocTable;

  const fields = (existing) => (
    <DocumentFields
      form={form} setForm={setForm}
      categories={cats} classes={classes}
      selClasses={selClasses} setSelClasses={setSelClasses}
      selSections={selSections} setSelSections={setSelSections}
      files={files} setFiles={setFiles}
      existing={existing}
      onManageCategories={() => setShowCats(true)}
    />
  );

  return (
    <div className="page docpg">
      <Crumbs here="Documents" />

      <DocHero
        title="Documents"
        subtitle="Share files, notices, assignments and study material with classes, teachers or the whole school."
        action={
          <Button onClick={() => { resetForm(); setShowUpload(true); }}>
            <Icon name="plus" size={16} /> Upload Document
          </Button>
        }
      />

      <DocStats>
        <DocStat icon="files" tone="indigo" label="Total Documents"
          value={tiles.total?.value} change={tiles.total?.change} added={tiles.total?.added} />
        <DocStat icon="users" tone="green" label="Shared with Classes"
          value={tiles.classes?.value} change={tiles.classes?.change} added={tiles.classes?.added}
          on={target === 'classes'} onClick={() => go(setTarget)(target === 'classes' ? '' : 'classes')} />
        <DocStat icon="user" tone="amber" label="Shared with Teachers"
          value={tiles.teachers?.value} change={tiles.teachers?.change} added={tiles.teachers?.added}
          on={target === 'teachers'} onClick={() => go(setTarget)(target === 'teachers' ? '' : 'teachers')} />
        <DocStat icon="clipboard" tone="red" label="Assignments"
          value={tiles.assignments?.value} change={tiles.assignments?.change} added={tiles.assignments?.added}
          on={tab === 'assignments'} onClick={() => { setTab(tab === 'assignments' ? 'all' : 'assignments'); setPage(1); }} />
      </DocStats>

      {error && <Alert variant="danger">{error}</Alert>}

      <section className="card docpanel">
        <DocTabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); setPage(1); }} />

        <DocTools>
          <SearchField value={search} onChange={setSearch} placeholder="Search documents…" />
          <Picker value={category} onChange={go(setCategory)} all="All Categories"
            options={categoryOptions} label="Filter by category" />
          <Picker value={target} onChange={go(setTarget)} all="All Targets"
            options={TARGET_FILTERS} label="Filter by who it was shared with" />
          <Picker value={year} onChange={go(setYear)} all="All Academic Years"
            options={yearOptions} label="Filter by academic year" />
          <span className="doctools__sep" />
          <SortMenu value={sort} onChange={go(setSort)} options={SORTS} />
          <ViewSwitch value={view} onChange={setView} />
        </DocTools>

        <List rows={rows} loading={loading} empty={empty}
          onOpen={(r) => navigate(`/admin/documents/${r._id}`)}
          onView={setViewDoc} onEdit={openEdit} menu={rowMenu} />

        <DocFoot page={page} pages={meta.pages} total={meta.total}
          limit={PAGE_SIZE} count={rows.length} onPage={setPage} />
      </section>

      {/* ── Overlays ───────────────────────────────────────────────────────── */}

      <DocumentDrawer doc={viewDoc} onClose={() => setViewDoc(null)}
        onOpen={(d) => navigate(`/admin/documents/${d._id}`)}
        onEdit={openEdit} onArchive={toggleArchive} onDelete={setDelDoc} />

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Document" maxWidth={640}
        footer={<>
          <Button variant="secondary" onClick={() => setShowUpload(false)}>Cancel</Button>
          <Button onClick={submitUpload} loading={uploading}>Upload</Button>
        </>}>
        {fields(null)}
      </Modal>

      <Modal open={!!editDoc} onClose={() => setEditDoc(null)} title="Edit Document" maxWidth={640}
        footer={<>
          <Button variant="secondary" onClick={() => setEditDoc(null)}>Cancel</Button>
          <Button onClick={submitEdit} loading={saving}>Save Changes</Button>
        </>}>
        {fields(editDoc)}
      </Modal>

      <Modal open={showCats} onClose={() => setShowCats(false)} title="Document Categories">
        <p className="docmodal__lead">
          Your school&rsquo;s own filing labels. They sit beside the fixed types
          ({DOC_TYPES.map((t) => t.label).join(', ')}), which the tabs are built on.
        </p>
        <div className="docaddcat">
          <input className="form-control" placeholder="New category name…" value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
          <Button onClick={addCategory} loading={addingCat}>Add</Button>
        </div>
        {cats.length === 0
          ? <p className="docnone" style={{ textAlign: 'center', padding: 16 }}>No categories yet</p>
          : (
            <ul className="doccats">
              {cats.map((c) => (
                <li key={c._id}>
                  <span>{c.name}</span>
                  <button type="button" className="docact docact--danger" onClick={() => setDelCat(c)}
                    title={`Delete ${c.name}`} aria-label={`Delete ${c.name}`}>
                    <Icon name="trash" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
      </Modal>

      <Confirm open={!!delDoc} onClose={() => setDelDoc(null)} onConfirm={confirmDelete} loading={busy}
        title="Delete Document"
        message={delDoc
          ? `Permanently delete “${delDoc.title}”? Its ${delDoc.fileCount || 0} file(s) and any submissions against it go with it.`
          : ''} />

      <Confirm open={!!delCat} onClose={() => setDelCat(null)} onConfirm={removeCategory} loading={busy}
        title="Delete Category"
        message={`Delete the category “${delCat?.name}”? Documents already filed under it keep the label.`} />
    </div>
  );
}
