/**
 * Designations → module access, for the signed-in admin's own school.
 *
 * Built on the frame the account lists use (listParts.jsx): a hero, four tiles,
 * one card holding the toolbar and the table, then the closing panels. A
 * designation is a record like any other here — it is listed, searched, sorted
 * and paged, and its module access is edited one designation at a time in its
 * own editor rather than in a page-wide grid with a global Save.
 *
 * The whole matrix arrives in a single call, so the filtering, the sorting and
 * the pager are all local: there is nothing to fetch when the tab changes.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../api/admin.api';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, Badge, Button, Confirm, Modal, Spinner } from '../../components/ui/index';
import Icon, { AdminsScene, SupportScene } from '../../components/ui/icons';
import { saveFile } from '../../utils/downloadFile';
import {
  Crumbs, ListHero, ListStats, ListStat, SearchField, ListTable, ListFooter,
  RowActions, IconAction, RowMenu, MenuItem, MenuSep, HelpPanel, PageFoot, Blank,
} from './listParts';
import {
  AccessDetail, AccessSummary, DesignationCell, DesignationDrawer, DesignationEditor,
  Holders, HoldersModal, countBy, levelOf,
} from './designationParts';

const SORTS = [
  { value: 'name',   label: 'Name (A–Z)' },
  { value: 'name_z', label: 'Name (Z–A)' },
  { value: 'users',  label: 'Most users' },
  { value: 'access', label: 'Widest access' },
  { value: 'newest', label: 'Newest first' },
];

const TABS = [
  { value: 'all',      label: 'All Designations' },
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

// The axios interceptor resolves to the response body — {success, data} — and
// only useFetch peels that off. These calls go straight to the api module, so
// the payload is unwrapped here or every field reads one level too high.
const unwrap = (res) => res?.data ?? res;

/** A column heading with the sentence explaining it hanging off an ⓘ. */
const Head = ({ children, hint }) => (
  <span className="lhead">
    {children}
    <span className="lhead__hint" title={hint} aria-label={hint} role="img">i</span>
  </span>
);

export default function Designations() {
  const { user: me } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [modules, setModules] = useState([]);
  const [rows,    setRows]    = useState([]);

  const [tab,    setTab]    = useState('all');
  const [search, setSearch] = useState('');
  const [term,   setTerm]   = useState('');
  const [module, setModule] = useState('');
  const [sort,   setSort]   = useState('name');
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(10);
  // One row at a time opens into its full module breakdown, so the levels are
  // readable without leaving the list. Reset by anything that reorders it.
  const [expanded, setExpanded] = useState(null);

  const [adding,   setAdding]   = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [viewing,  setViewing]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [del,      setDel]      = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [holders,  setHolders]  = useState(null);   // { name, teachers[], blocking?, designationId }
  const [downloading, setDownloading] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true); setError('');
    try {
      const d = unwrap(await api.getDesignationMatrix());
      setModules(d?.modules || []);
      setRows(d?.designations || []);
    } catch (err) {
      setError(err.message || 'Failed to load designations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // A keystroke is not a search; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim().toLowerCase()); setPage(1); setExpanded(null); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const enabled  = useMemo(() => modules.filter((m) => m.enabled),  [modules]);
  const disabled = useMemo(() => modules.filter((m) => !m.enabled), [modules]);
  const keys     = useMemo(() => enabled.map((m) => m.key), [enabled]);

  const counts = useMemo(() => ({
    total:    rows.length,
    active:   rows.filter((r) => r.isActive).length,
    inactive: rows.filter((r) => !r.isActive).length,
  }), [rows]);

  // ── The visible list ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (tab === 'active'   && !r.isActive) return false;
      if (tab === 'inactive' && r.isActive)  return false;
      if (module && levelOf(r.permissions, module) === 'none') return false;
      if (term && !`${r.name} ${r.description || ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const reach = (r) => countBy(r.permissions, keys, 'admin') * 100 + countBy(r.permissions, keys, 'user');
    const byName = (a, b) => a.name.localeCompare(b.name);
    return out.sort((a, b) => {
      switch (sort) {
        case 'name_z': return byName(b, a);
        case 'users':  return (b.holderCount || 0) - (a.holderCount || 0) || byName(a, b);
        case 'access': return reach(b) - reach(a) || byName(a, b);
        case 'newest': return new Date(b.createdAt || 0) - new Date(a.createdAt || 0) || byName(a, b);
        default:       return byName(a, b);
      }
    });
  }, [rows, tab, module, term, sort, keys]);

  const pages   = Math.max(1, Math.ceil(filtered.length / limit));
  const shown   = filtered.slice((Math.min(page, pages) - 1) * limit, Math.min(page, pages) * limit);
  const anyFilter = !!term || !!module || tab !== 'all';
  const clearAll  = () => { setSearch(''); setTerm(''); setModule(''); setTab('all'); setPage(1); setExpanded(null); };

  // ── Actions ────────────────────────────────────────────────────────────────
  const saveEdit = async (patch) => {
    setSaving(true);
    try {
      const moved = unwrap(await api.updateDesignation(editing._id, patch))?.teachersRenamed || 0;
      toast.success(moved
        ? `Saved — ${moved} teacher${moved === 1 ? '' : 's'} moved to the new name`
        : `“${patch.name}” saved`);
      setEditing(null);
      await load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const create = async ({ name, description, blank }) => {
    setSaving(true);
    try {
      // No permissions posted means the server's own starting point — normal
      // access everywhere, plus whatever the name historically implied.
      const body = { name, description };
      if (blank) body.permissions = Object.fromEntries(keys.map((k) => [k, 'none']));
      const created = unwrap(await api.createDesignation(body));
      toast.success(`“${name}” added — set its module access`);
      setAdding(false);
      const d = unwrap(await api.getDesignationMatrix());
      setModules(d?.modules || []);
      setRows(d?.designations || []);
      // Straight into the editor: a designation nobody has configured yet is
      // the one thing an admin never wants to have to find again.
      const row = (d?.designations || []).find((r) => String(r._id) === String(created?._id));
      if (row) setEditing(row);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    try {
      await api.updateDesignation(row._id, { isActive: !row.isActive });
      toast.success(row.isActive ? `“${row.name}” deactivated` : `“${row.name}” activated`);
      await load();
    } catch (err) { toast.error(err.message); }
  };

  const openHolders = async (row, blocking = false) => {
    try {
      const d = unwrap(await api.getDesignationTeachers(row._id));
      setHolders({
        designationId: row._id,
        name: d?.designation || row.name,
        teachers: d?.teachers || [],
        blocking,
      });
    } catch (err) { toast.error(err.message); }
  };

  // Ask for the list up front when the row already shows holders, so the admin
  // sees the blockers in one click rather than being refused first.
  const tryDelete = (row) => {
    if (row.holderCount) openHolders(row, true);
    else setDel(row);
  };

  const remove = async () => {
    setDeleting(true);
    const target = del;
    try {
      await api.deleteDesignation(target._id);
      toast.success(`“${target.name}” deleted`);
      setDel(null);
      await load();
    } catch (err) {
      // Refused because teachers still hold it: the server sends them back, so
      // show exactly who is in the way instead of a bare error string.
      const body = err.data;
      if (body?.code === 'DESIGNATION_IN_USE') {
        setDel(null);
        setHolders({
          designationId: target._id,
          name: body.designation || target.name,
          teachers: body.teachers || [],
          message: body.message,
          blocking: true,
        });
        await load();
      } else {
        toast.error(err.message);
      }
    } finally { setDeleting(false); }
  };

  const download = async () => {
    setDownloading(true);
    try {
      const buffer = await api.exportDesignationTeachers(holders.designationId);
      const slug = holders.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'designation';
      saveFile(buffer, `${slug}-teachers.xlsx`);
    } catch { toast.error('Failed to download the teacher list'); }
    finally { setDownloading(false); }
  };

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = [
    { key: 'name', className: 'dcol-name', label: 'Designation', render: (r) => <DesignationCell name={r.name} /> },
    {
      key: 'desc',
      className: 'dcol-desc',
      label: 'Description',
      render: (r) => (r.description ? <div className="ldesc">{r.description}</div> : <Blank />),
    },
    {
      key: 'users',
      className: 'dcol-users',
      label: <Head hint="People holding this designation. Teachers inherit its module access; admins already reach every enabled module.">Users</Head>,
      render: (r) => <Holders teachers={r.teacherCount} admins={r.adminCount} />,
    },
    {
      key: 'access',
      className: 'dcol-acc',
      label: <Head hint="How much of the school this designation reaches, by level. Open a row to see every module and the level it grants.">Module Access</Head>,
      render: (r) => (
        <AccessSummary
          modules={enabled}
          permissions={r.permissions}
          open={expanded === r._id}
          onToggle={() => setExpanded((id) => (id === r._id ? null : r._id))}
        />
      ),
    },
    {
      key: 'status',
      className: 'dcol-status',
      label: 'Status',
      render: (r) => (
        <Badge variant={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      className: 'ltable__acts',
      render: (r) => (
        <RowActions>
          <IconAction icon="eye" label="View details" onClick={() => setViewing(r)} />
          <IconAction icon="pencil" label="Edit module access" variant="edit" onClick={() => setEditing(r)} />
          <RowMenu>
            <MenuItem icon="users" onClick={() => openHolders(r)}>Teachers holding it</MenuItem>
            <MenuItem icon="teacher" to={`/admin/teachers?designation=${encodeURIComponent(r.name)}`}>
              Open in Teachers
            </MenuItem>
            <MenuSep />
            <MenuItem icon="power" onClick={() => toggleActive(r)}>
              {r.isActive ? 'Deactivate' : 'Activate'}
            </MenuItem>
            <MenuSep />
            <MenuItem icon="trash" danger onClick={() => tryDelete(r)}>Delete designation</MenuItem>
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page listpg">
      <Crumbs here="Designations" />

      <ListHero
        title="Designations & Module Access"
        subtitle="Manage designations, configure module access, and control what each role can do."
        quote="Right roles, smarter access — everyone reaches exactly what their work needs, and nothing else."
        scene={AdminsScene}
      />

      <ListStats>
        <ListStat icon="badge" tone="indigo" value={counts.total} label="Total Designations"
          caption="Created in your school" on={tab === 'all'} onClick={() => { setTab('all'); setPage(1); setExpanded(null); }} />
        <ListStat icon="checkCircle" tone="green" value={counts.active} label="Active Designations"
          caption="Currently in use" on={tab === 'active'} onClick={() => { setTab('active'); setPage(1); setExpanded(null); }} />
        <ListStat icon="power" tone="pink" value={counts.inactive} label="Inactive Designations"
          caption="Deactivated" on={tab === 'inactive'} onClick={() => { setTab('inactive'); setPage(1); setExpanded(null); }} />
        <ListStat icon="grid" tone="blue" value={enabled.length} label="Modules Enabled"
          caption="Available for access control" />
      </ListStats>

      {error && <Alert variant="danger">{error}</Alert>}

      <section className="card">
        <div className="ltabs">
          {TABS.map((t) => (
            <button key={t.value} type="button" aria-pressed={tab === t.value}
              className={`ltab${tab === t.value ? ' is-on' : ''}`}
              onClick={() => { setTab(t.value); setPage(1); setExpanded(null); }}>
              {t.label} ({counts[t.value === 'all' ? 'total' : t.value]})
            </button>
          ))}
        </div>

        <div className="ltools">
          <SearchField value={search} onChange={setSearch} placeholder="Search designation or description…" />

          <select className={`form-control lsel${module ? ' lfsel--on' : ''}`} value={module}
            onChange={(e) => { setModule(e.target.value); setPage(1); setExpanded(null); }} aria-label="Filter by module">
            <option value="">All modules</option>
            {enabled.map((m) => <option key={m.key} value={m.key}>Can reach {m.label}</option>)}
          </select>

          <select className={`form-control lsel${sort !== 'name' ? ' lfsel--on' : ''}`} value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); setExpanded(null); }} aria-label="Sort designations">
            {SORTS.map((s) => <option key={s.value} value={s.value}>Sort by: {s.label}</option>)}
          </select>

          <span className="ltools__sep" />

          <div className="ltools__acts">
            <Button onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add Designation</Button>
          </div>
        </div>

        <ListTable
          columns={columns}
          rows={shown}
          startIndex={(Math.min(page, pages) - 1) * limit}
          expandedId={expanded}
          renderExpanded={(r) => (
            <AccessDetail modules={enabled} permissions={r.permissions}
              onEdit={() => setEditing(r)} />
          )}
          emptyIcon={anyFilter ? '🔍' : '🎫'}
          emptyTitle={anyFilter ? 'No designations match these filters' : 'No designations yet'}
          emptyMessage={anyFilter
            ? 'Try another tab, module or search term.'
            : 'Add a designation to configure the module access it grants.'}
          emptyAction={anyFilter
            ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
            : <Button onClick={() => setAdding(true)}>+ Add Designation</Button>}
        />

        <ListFooter
          page={Math.min(page, pages)} pages={pages} total={filtered.length}
          limit={limit} count={shown.length} noun="designation"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); setExpanded(null); }}
        />
      </section>

      <div className="lbottom">
        <HelpPanel scene={SupportScene}
          text="Not sure what a designation should be able to reach? Access follows one hierarchy — school module enablement, then designation permission, then user access — and every teacher assigned a designation inherits it automatically." />
        <ModulesPanel enabled={enabled.length} disabled={disabled} />
      </div>

      <PageFoot schoolName={me?.school?.name} />

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}
      <AddDesignation open={adding} saving={saving} onClose={() => setAdding(false)} onCreate={create} />

      <DesignationEditor
        row={editing}
        modules={enabled}
        disabledModules={disabled}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
      />

      <DesignationDrawer
        row={viewing}
        modules={enabled}
        onClose={() => setViewing(null)}
        onEdit={(r) => { setViewing(null); setEditing(r); }}
      />

      <HoldersModal state={holders} onClose={() => setHolders(null)}
        onDownload={download} downloading={downloading} />

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={deleting}
        title="Delete Designation"
        message={`Delete “${del?.name}”? Its configured module permissions are removed with it.`} />
    </div>
  );
}

/**
 * The closing panel opposite Help.
 *
 * A designation can only ever grant what the school has switched on, so the list
 * of what is switched off belongs on this page — and the place to change it is
 * one click away rather than a thing to go looking for.
 */
const ModulesPanel = ({ enabled, disabled }) => (
  <section className="lpanel lmodpanel">
    <span className="lhelp__mark"><Icon name="settings" size={22} /></span>
    <div className="lhelp__body">
      <h2>Manage Modules</h2>
      <p>
        {enabled} module{enabled === 1 ? '' : 's'} can be granted here.
        {disabled.length > 0
          ? ` ${disabled.length} more ${disabled.length === 1 ? 'is' : 'are'} switched off for this school and stay hidden from every designation: ${disabled.map((m) => m.label).join(', ')}.`
          : ' Every module this school has is available to grant.'}
      </p>
      <Link to="/admin/school-settings" className="btn btn-secondary">
        Go to Module Settings <Icon name="arrowRight" size={15} />
      </Link>
    </div>
  </section>
);

/**
 * A new designation: what it is called, what it is for, and where its access
 * starts. The levels themselves are set straight afterwards in the editor,
 * which opens on its own once this closes.
 */
function AddDesignation({ open, onClose, onCreate, saving }) {
  const [form, setForm] = useState({ name: '', description: '', blank: false });

  useEffect(() => { if (open) setForm({ name: '', description: '', blank: false }); }, [open]);

  const submit = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    onCreate({ name, description: form.description.trim(), blank: form.blank });
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Designation"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button form="designation-add" type="submit" loading={saving}>Add &amp; Configure</Button>
      </>}>
      <form id="designation-add" onSubmit={submit}>
        <div className="form-group">
          <label className="form-label required">Name</label>
          <input className="form-control" autoFocus maxLength={60} required
            placeholder="e.g. Head of Science" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-control" maxLength={160}
            placeholder="What this designation is responsible for" value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Starting access</label>
          <select className="form-control" value={form.blank ? 'blank' : 'default'}
            onChange={(e) => setForm((f) => ({ ...f, blank: e.target.value === 'blank' }))}>
            <option value="default">Normal access to every enabled module</option>
            <option value="blank">No access — grant modules one by one</option>
          </select>
          <div className="form-hint">
            The module editor opens next, so either way you can change every level before anyone uses it.
          </div>
        </div>
      </form>
    </Modal>
  );
}
