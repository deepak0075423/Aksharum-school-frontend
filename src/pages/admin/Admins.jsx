import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { useAuth } from '../../contexts/AuthContext';
import { Badge, Button, Confirm, Modal } from '../../components/ui/index';
import Icon, { AdminsScene, SupportScene } from '../../components/ui/icons';
import { isEmail } from '../../utils/validators';
import { saveFile } from '../../utils/downloadFile';
import {
  Crumbs, ListHero, ListStats, ListStat, SearchField, FiltersButton, FilterPanel,
  FilterField, activeFilterCount, SelectionBar, useSelection, ListTable, ListFooter,
  Who, RowActions, IconAction, RowMenu, MenuItem, MenuSep, QuickActions, HelpPanel,
  PageFoot, Drawer, DrawerHead, DrawerSection, DrawerFoot, orBlank, fmtDate, ago,
} from './listParts';

const SORTS = [
  { value: 'name',   label: 'Name (A–Z)' },
  { value: 'name_z', label: 'Name (Z–A)' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'active', label: 'Recently active' },
];

const STATUSES = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];

const EMPTY = { status: '', sort: 'name' };

export default function Admins() {
  const { user: me } = useAuth();

  const [page, setPage]   = useState(1);
  // Rows per page is the admin's choice; changing it starts again at page 1.
  const [limit, setLimit] = useState(20);
  const [search, setSearch]   = useState('');
  const [filters, setFilters] = useState(EMPTY);
  const [showFilters, setShowFilters] = useState(false);

  const [del, setDel]     = useState(null);
  const [delLoad, setDL]  = useState(false);
  const [invite, setInv]  = useState(false);
  const [editing, setEd]  = useState(null);
  const [viewing, setVw]  = useState(null);
  const [busy, setBusy]   = useState(false);

  // A request per keystroke is a request per keystroke; wait for a pause.
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(
    () => ({ page, limit, search: term || undefined, ...Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v),
    ) }),
    [page, limit, term, filters],
  );
  const queryKey = JSON.stringify(query);

  const { data, loading, refetch } = useFetch(() => api.getAdmins(query), [queryKey]);

  const rows      = data?.data || [];
  const stats     = data?.stats || {};
  const selection = useSelection(rows, queryKey);

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const isMe = (r) => String(r._id) === String(me?._id);

  const filterCount = activeFilterCount(filters, EMPTY);
  const anyFilter   = !!term || filterCount > 0;
  const clearAll    = () => { setSearch(''); setTerm(''); setFilters(EMPTY); setPage(1); };

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteAdmin(del._id); toast.success('Admin deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  /**
   * Switching your own account off would sign you out of a school you may be
   * the only administrator of, so it is refused here and again on the server.
   */
  const handleToggle = async (r) => {
    if (isMe(r)) { toast.error('You cannot deactivate your own account'); return; }
    toast.loading(r.isActive !== false ? 'Deactivating…' : 'Activating…', { id: 'tog' });
    try {
      await api.toggleUser(r._id);
      toast.success(r.isActive !== false ? 'Admin deactivated' : 'Admin activated', { id: 'tog' });
      refetch();
    } catch (err) { toast.error(err.message, { id: 'tog' }); }
  };

  const bulkSetActive = async (active) => {
    const targets = selection.rows.filter((r) => !isMe(r) && (r.isActive !== false) !== active);
    if (!targets.length) {
      toast(`Nothing to change — every selected admin is already ${active ? 'active' : 'inactive'}.`);
      return;
    }
    toast.loading(`${active ? 'Activating' : 'Deactivating'} ${targets.length}…`, { id: 'bulk' });
    setBusy(true);
    let done = 0;
    let failed = 0;
    for (const r of targets) {
      try { await api.toggleUser(r._id); done += 1; }
      catch { failed += 1; }
    }
    setBusy(false);
    if (failed) toast.error(`${done} changed, ${failed} failed`, { id: 'bulk' });
    else toast.success(`${done} admin${done === 1 ? '' : 's'} ${active ? 'activated' : 'deactivated'}`, { id: 'bulk' });
    selection.clear();
    refetch();
  };

  const handleExport = async () => {
    toast.loading('Building the spreadsheet…', { id: 'exp' });
    try {
      const { page: _p, limit: _l, ...rest } = query;
      saveFile(await api.exportAdmins(rest), 'admins.xlsx');
      toast.success('Downloaded', { id: 'exp' });
    } catch (err) { toast.error(err.message || 'Export failed', { id: 'exp' }); }
  };

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'name',
      label: 'Admin',
      render: (r) => (
        <Who name={r.name} sub={r.email} photo={r.profileImage} tone="purple"
          badge={isMe(r) ? <Badge variant="primary">You</Badge> : null} />
      ),
    },
    { key: 'role',  label: 'Role',  render: () => <Badge variant="info">School Admin</Badge> },
    { key: 'phone', label: 'Phone', render: (r) => orBlank(r.phone) },
    {
      key: 'status',
      label: 'Status',
      render: (r) => (
        <Badge variant={r.isActive !== false ? 'success' : 'muted'}>
          {r.isActive !== false ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'seen',
      label: 'Last Active',
      // `lastSeenAt` is the presence heartbeat, so it says when they were last
      // *using* the app — a more useful answer than when they last signed in.
      render: (r) => (r.lastSeenAt
        ? <span title={fmtDate(r.lastSeenAt)}>{ago(r.lastSeenAt)}</span>
        : <span className="lnone">{r.isFirstLogin ? 'Never signed in' : '—'}</span>),
    },
    {
      key: 'actions',
      label: 'Actions',
      className: 'ltable__acts',
      render: (r) => (
        <RowActions>
          <IconAction icon="eye" label="View details" onClick={() => setVw(r)} />
          <IconAction icon="pencil" label="Edit admin" variant="edit" onClick={() => setEd(r)} />
          <RowMenu>
            <MenuItem icon="badge" to="/admin/designations">Designations &amp; access</MenuItem>
            {!isMe(r) && (
              <MenuItem icon="power" onClick={() => handleToggle(r)}>
                {r.isActive !== false ? 'Deactivate' : 'Activate'}
              </MenuItem>
            )}
            {!isMe(r) && <MenuSep />}
            {!isMe(r) && (
              <MenuItem icon="trash" danger onClick={() => setDel(r)}>Delete admin</MenuItem>
            )}
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="page listpg">
      <Crumbs here="Admins" />

      <ListHero
        title="Admins"
        subtitle="Manage all administrators, their roles, and access permissions."
        quote="Strong administration builds stronger schools."
        scene={AdminsScene}
      />

      <ListStats>
        <ListStat icon="users" tone="indigo" value={stats.total} label="Total Admins"
          caption="Manage your admin team" on={!filters.status} onClick={() => set({ status: '' })} />
        <ListStat icon="checkCircle" tone="green" value={stats.active} label="Active Admins"
          caption="Currently active" on={filters.status === 'active'} onClick={() => set({ status: 'active' })} />
        <ListStat icon="userCircle" tone="pink" value={stats.inactive} label="Inactive Admins"
          caption="Deactivated accounts" on={filters.status === 'inactive'} onClick={() => set({ status: 'inactive' })} />
        <ListStat icon="userPlus" tone="amber" value={stats.newThisYear} label="New Admins"
          caption="This academic year" />
      </ListStats>

      <section className="card">
        <div className="ltools">
          <SearchField value={search} onChange={setSearch}
            placeholder="Search name, email or phone…" />

          <FiltersButton open={showFilters} count={filterCount}
            onClick={() => setShowFilters((v) => !v)} />

          <span className="ltools__sep" />

          <div className="ltools__acts">
            <Button variant="secondary" onClick={handleExport}>
              <Icon name="download" size={16} /> Export
            </Button>
            <Button onClick={() => setInv(true)}><Icon name="plus" size={16} /> Add Admin</Button>
          </div>
        </div>

        {showFilters && (
          <FilterPanel onReset={clearAll}>
            <FilterField label="Status" value={filters.status}
              onChange={(v) => set({ status: v })}
              all="All status" options={STATUSES} />
            <FilterField label="Sort by" value={filters.sort} defaultValue="name"
              onChange={(v) => set({ sort: v })} options={SORTS} />
          </FilterPanel>
        )}

        <SelectionBar count={selection.ids.length} noun="admin" onClear={selection.clear}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
            onClick={() => bulkSetActive(true)}>Activate</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
            onClick={() => bulkSetActive(false)}>Deactivate</button>
        </SelectionBar>

        <ListTable
          columns={columns}
          rows={rows}
          loading={loading}
          selection={selection}
          startIndex={(page - 1) * limit}
          emptyIcon={anyFilter ? '🔍' : '🛡️'}
          emptyTitle={anyFilter ? 'No admins match these filters' : 'No admins yet'}
          emptyMessage={anyFilter
            ? 'Try a different status or search term.'
            : 'Invite someone to help run the school. They are emailed a one-time password.'}
          emptyAction={anyFilter
            ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
            : <Button onClick={() => setInv(true)}>+ Add Admin</Button>}
        />

        <ListFooter
          page={page} pages={data?.pages || 1} total={data?.total || 0}
          limit={limit} count={rows.length} noun="admin"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
        />
      </section>

      <div className="lbottom">
        <QuickActions items={[
          { icon: 'userPlus', tone: 'indigo', bg: '#f5f3ff', label: 'Add Admin', sub: 'Invite by email', onClick: () => setInv(true) },
          { icon: 'badge',    tone: 'green',  bg: '#f0fdf4', label: 'Designations', sub: 'Roles & module access', to: '/admin/designations' },
          { icon: 'settings', tone: 'amber',  bg: '#fffbeb', label: 'School Settings', sub: 'Modules & branding', to: '/admin/school-settings' },
          { icon: 'download', tone: 'teal',   bg: '#f0fdfa', label: 'Export List', sub: 'Download as Excel', onClick: handleExport },
        ]} />
        <HelpPanel scene={SupportScene}
          text="Not sure who should be an administrator, or what a designation grants them? Message your school's support team and someone will pick it up." />
      </div>

      <PageFoot schoolName={me?.school?.name} />

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}
      <InviteAdmin open={invite} onClose={() => setInv(false)} onCreated={refetch} />
      <EditAdmin admin={editing} onClose={() => setEd(null)} onSaved={refetch} />

      <AdminDrawer
        row={viewing}
        isMe={viewing ? isMe(viewing) : false}
        onClose={() => setVw(null)}
        onEdit={(r) => { setVw(null); setEd(r); }}
      />

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Admin"
        message={`Delete "${del?.name}"? They lose access to this school immediately. This cannot be undone.`} />
    </div>
  );
}

/** A new administrator, invited by email — they set their own password. */
function InviteAdmin({ open, onClose, onCreated }) {
  const [form, setForm]     = useState({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm({ name: '', email: '', phone: '' }); }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return toast.error('Name must be at least 2 characters');
    if (!isEmail(form.email))        return toast.error('Please enter a valid email address');
    setSaving(true);
    try {
      await api.createAdmin({ ...form, name: form.name.trim(), email: form.email.trim() });
      toast.success('Admin created — login credentials emailed');
      onClose();
      onCreated();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Admin"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button form="admin-invite" type="submit" loading={saving}>Create</Button>
      </>}>
      <form id="admin-invite" onSubmit={submit}>
        <div className="form-group">
          <label className="form-label required">Full Name</label>
          <input className="form-control" required value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label required">Email</label>
          <input type="email" className="form-control" required value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Phone</label>
          <input className="form-control" value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </div>
        <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
          A one-time password will be emailed. The admin must set a new password on first login.
        </p>
      </form>
    </Modal>
  );
}

/**
 * Name and phone only.
 *
 * The email address is the account — changing it would move the login out from
 * under whoever holds it — so the server refuses it and this form does not
 * offer it.
 */
function EditAdmin({ admin, onClose, onSaved }) {
  const [form, setForm]     = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (admin) setForm({ name: admin.name || '', phone: admin.phone || '' });
  }, [admin]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return toast.error('Name must be at least 2 characters');
    setSaving(true);
    try {
      await api.updateUser(admin._id, { name: form.name.trim(), phone: form.phone.trim() });
      toast.success('Admin updated');
      onClose();
      onSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={!!admin} onClose={onClose} title="Edit Admin"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button form="admin-edit" type="submit" loading={saving}>Save</Button>
      </>}>
      <form id="admin-edit" onSubmit={submit}>
        <div className="form-group">
          <label className="form-label required">Full Name</label>
          <input className="form-control" required value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Phone</label>
          <input className="form-control" value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Email</label>
          <input className="form-control" value={admin?.email || ''} disabled />
          <div className="form-hint">
            The email address is the account itself and cannot be changed here.
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** The account, beside the list. Everything shown is already on the row. */
function AdminDrawer({ row, onClose, onEdit, isMe }) {
  if (!row) return null;
  return (
    <Drawer open onClose={onClose}>
      <DrawerHead
        name={row.name} sub={row.email} photo={row.profileImage} tone="purple" onClose={onClose}
        tags={[
          <Badge key="s" variant={row.isActive !== false ? 'success' : 'muted'}>
            {row.isActive !== false ? 'Active' : 'Inactive'}
          </Badge>,
          <Badge key="r" variant="info">School Admin</Badge>,
          isMe ? <Badge key="me" variant="primary">You</Badge> : null,
        ].filter(Boolean)}
      />

      <div className="ldrawer__body">
        <DrawerSection title="Account" fields={[
          ['Email', row.email],
          ['Phone', row.phone],
          ['Role', 'School Admin'],
          ['Added on', fmtDate(row.createdAt)],
        ]} />

        <DrawerSection title="Activity" fields={[
          ['Last active', row.lastSeenAt ? `${ago(row.lastSeenAt)} (${fmtDate(row.lastSeenAt)})` : ''],
          ['Password set', row.isFirstLogin ? 'Not yet — still on the one-time password' : 'Yes'],
        ]} />

        <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 24 }}>
          A school administrator reaches every module this school has switched on.
          What each designation may reach is set on the Designations screen.
        </p>
      </div>

      <DrawerFoot>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button onClick={() => onEdit(row)}><Icon name="pencil" size={15} /> Edit</Button>
      </DrawerFoot>
    </Drawer>
  );
}
