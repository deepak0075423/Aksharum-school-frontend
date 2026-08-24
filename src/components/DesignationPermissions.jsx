import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { PageHeader, Button, Modal, Confirm, Spinner, Badge, Empty, Alert } from './ui/index';

/**
 * Designation → module access matrix.
 *
 * One component, two callers: the school admin edits their own school
 * (/admin/designations) and the super admin edits any school
 * (/super-admin/designations). The difference is entirely in the `api` prop, so
 * both screens stay identical in behaviour.
 *
 * The grid lists ONLY the modules the school has enabled — that is the level a
 * designation can actually be given. Modules disabled at the school level are
 * summarised separately: their configured level is kept untouched in the row and
 * comes back the moment the module is switched on again.
 *
 * api: {
 *   load()                    → { designations, modules, enabledModules, levels }
 *   save(designations)        → bulk save of [{ _id, permissions }]
 *   create({ name, permissions })
 *   update(id, patch)
 *   remove(id)                → rejects with code DESIGNATION_IN_USE + teachers[]
 *                               when teachers still hold it
 *   teachers(id)              → { designation, teacherCount, teachers[] }
 *   exportTeachers(id)        → .xlsx arraybuffer of that list
 * }
 */

const LEVELS = [
  { value: 'admin', label: 'Admin',     hint: 'Manage the module',        variant: 'primary' },
  { value: 'user',  label: 'Normal',    hint: 'Use the module',           variant: 'success' },
  { value: 'none',  label: 'No Access', hint: 'Module hidden and blocked', variant: 'muted'  },
];

const LEVEL_COLOR = {
  admin: { bg: 'rgba(99,102,241,.12)',  border: 'rgba(99,102,241,.45)',  fg: '#4f46e5' },
  user:  { bg: 'rgba(34,197,94,.10)',   border: 'rgba(34,197,94,.40)',   fg: '#15803d' },
  none:  { bg: 'var(--bg)',             border: 'var(--border)',         fg: 'var(--text-muted)' },
};

/** Three-way segmented control for one module row. */
function LevelPicker({ value, onChange, adminCapable, disabled }) {
  return (
    <div style={{ display: 'inline-flex', flexShrink: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {LEVELS.map(lv => {
        const unavailable = lv.value === 'admin' && !adminCapable;
        const active = value === lv.value;
        const c = LEVEL_COLOR[lv.value];
        return (
          <button
            key={lv.value}
            type="button"
            disabled={disabled || unavailable}
            title={unavailable ? 'This module has no administrative surface' : lv.hint}
            onClick={() => onChange(lv.value)}
            style={{
              padding: '5px 12px',
              fontSize: '.78rem',
              fontWeight: active ? 700 : 500,
              border: 'none',
              borderRight: '1px solid var(--border)',
              background: active ? c.bg : 'transparent',
              color: unavailable ? 'var(--border)' : active ? c.fg : 'var(--text-muted)',
              cursor: (disabled || unavailable) ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}>
            {lv.label}
          </button>
        );
      })}
    </div>
  );
}

const countBy = (permissions, keys, level) => keys.filter(k => (permissions?.[k] || 'none') === level).length;

// The axios interceptor resolves to the response body — {success, data} — and only
// useFetch peels that off. These calls go straight to the api module, so the
// payload has to be unwrapped here or every field reads one level too high.
const unwrap = (res) => res?.data ?? res;

export default function DesignationPermissions({ api, title, subtitle, schoolLabel }) {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [modules, setModules] = useState([]);
  const [rows,    setRows]    = useState([]);      // server state
  const [draft,   setDraft]   = useState({});      // { designationId: permissions }
  const [saving,  setSaving]  = useState(false);
  const [openRow, setOpenRow] = useState(null);    // expanded designation id

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding,  setAdding]  = useState(false);
  const [del,     setDel]     = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Set when a delete is refused: { name, teachers[], designationId }
  const [blocked, setBlocked] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [renaming, setRenaming] = useState(null);   // { _id, name }
  const [renameSaving, setRenameSaving] = useState(false);

  const load = async (focusId = null) => {
    setLoading(true); setError('');
    try {
      const d = unwrap(await api.load());
      setModules(d?.modules || []);
      setRows(d?.designations || []);
      setDraft({});
      setOpenRow(prev => {
        const next = focusId ?? prev;
        return next && (d?.designations || []).some(r => r._id === next) ? next : null;
      });
    } catch (err) {
      setError(err.message || 'Failed to load designations');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (api.ready !== false) load(); else setLoading(false); }, [api.key]);

  const enabled  = useMemo(() => modules.filter(m => m.enabled),  [modules]);
  const disabled = useMemo(() => modules.filter(m => !m.enabled), [modules]);
  const enabledKeys = useMemo(() => enabled.map(m => m.key), [enabled]);

  /** Effective permissions for a row: unsaved edits layered over server state. */
  const permsOf = (row) => draft[row._id] || row.permissions || {};
  const dirtyIds = Object.keys(draft);
  const isDirty  = dirtyIds.length > 0;

  const setLevel = (row, moduleKey, level) => {
    setDraft(d => ({ ...d, [row._id]: { ...permsOf(row), [moduleKey]: level } }));
  };

  const setAll = (row, level) => {
    const next = { ...permsOf(row) };
    for (const m of enabled) next[m.key] = (level === 'admin' && !m.adminCapable) ? 'user' : level;
    setDraft(d => ({ ...d, [row._id]: next }));
  };

  const save = async () => {
    setSaving(true);
    try {
      // Only the modules currently enabled are sent, so levels held for a
      // disabled module are never overwritten by a screen that cannot see them.
      const payload = dirtyIds.map(id => {
        const perms = draft[id];
        const scoped = {};
        for (const key of enabledKeys) scoped[key] = perms[key] || 'none';
        return { _id: id, permissions: scoped };
      });
      await api.save(payload);
      toast.success(`Permissions saved for ${payload.length} designation${payload.length === 1 ? '' : 's'}`);
      await load();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const addDesignation = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const created = unwrap(await api.create({ name }));
      toast.success(`"${name}" added — set its module access below`);
      setNewName(''); setAddOpen(false);
      await load(created?._id);
    } catch (err) { toast.error(err.message); }
    finally { setAdding(false); }
  };

  const rename = async (e) => {
    e.preventDefault();
    const name = renaming.name.trim();
    if (!name) return;
    setRenameSaving(true);
    try {
      const moved = unwrap(await api.update(renaming._id, { name }))?.teachersRenamed || 0;
      toast.success(moved ? `Renamed — ${moved} teacher${moved === 1 ? '' : 's'} updated` : 'Renamed');
      setRenaming(null);
      await load();
    } catch (err) { toast.error(err.message); }
    finally { setRenameSaving(false); }
  };

  const toggleActive = async (row) => {
    try {
      await api.update(row._id, { isActive: !row.isActive });
      toast.success(row.isActive ? `"${row.name}" deactivated` : `"${row.name}" activated`);
      await load();
    } catch (err) { toast.error(err.message); }
  };

  const remove = async () => {
    setDeleting(true);
    const target = del;
    try {
      await api.remove(target._id);
      toast.success(`"${target.name}" deleted`);
      setDel(null);
      await load();
    } catch (err) {
      // Refused because teachers still hold it: the server sends them back, so
      // show exactly who is in the way instead of a bare error string.
      const body = err.data;
      if (body?.code === 'DESIGNATION_IN_USE') {
        setDel(null);
        setBlocked({
          designationId: target._id,
          name: body.designation || target.name,
          teachers: body.teachers || [],
          message: body.message,
        });
        await load();
      } else {
        toast.error(err.message);
      }
    } finally { setDeleting(false); }
  };

  // Ask for the list up front when the row already shows holders, so the admin
  // sees the blockers in one click rather than being refused first.
  const tryDelete = async (row) => {
    if (!row.teacherCount) { setDel(row); return; }
    try {
      const d = unwrap(await api.teachers(row._id));
      setBlocked({
        designationId: row._id,
        name: d?.designation || row.name,
        teachers: d?.teachers || [],
      });
    } catch (err) { toast.error(err.message); }
  };

  const downloadTeachers = async () => {
    setDownloading(true);
    try {
      const buffer = await api.exportTeachers(blocked.designationId);
      const url = URL.createObjectURL(new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const slug = blocked.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'designation';
      const a = document.createElement('a');
      a.href = url; a.download = `${slug}-teachers.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to download the teacher list'); }
    finally { setDownloading(false); }
  };

  if (api.ready === false) {
    return (
      <div className="page">
        <PageHeader title={title} subtitle={subtitle} />
        <Empty icon="🏫" title="Pick a school" message="Choose a school to configure the module access its designations grant." />
      </div>
    );
  }

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setAddOpen(true)}>+ Designation</Button>
            <Button onClick={save} loading={saving} disabled={!isDirty}>
              {isDirty ? `Save (${dirtyIds.length})` : 'Saved'}
            </Button>
          </div>
        } />

      {schoolLabel && (
        <div style={{ marginBottom: 14, fontSize: '.85rem', color: 'var(--text-muted)' }}>
          Configuring <strong style={{ color: 'var(--text)' }}>{schoolLabel}</strong>
        </div>
      )}

      {error && <Alert variant="danger">{error}</Alert>}

      <Alert variant="info">
        Access follows one hierarchy: <strong>School module enablement → Designation permission → User access</strong>.
        Only the {enabled.length} module{enabled.length === 1 ? '' : 's'} enabled for this school can be granted here, and
        every teacher assigned a designation inherits its permissions automatically.
      </Alert>

      {disabled.length > 0 && (
        <div style={{
          margin: '12px 0 18px', padding: '10px 14px', borderRadius: 'var(--radius)',
          border: '1px dashed var(--border)', background: 'var(--bg)', fontSize: '.8rem', color: 'var(--text-muted)',
        }}>
          <strong style={{ color: 'var(--text)' }}>Disabled at school level ({disabled.length}):</strong>{' '}
          {disabled.map(m => `${m.icon} ${m.label}`).join(' · ')}
          <div style={{ marginTop: 4 }}>
            These are revoked for every designation and user. Anything configured for them is kept and reapplied
            if the Super Admin enables the module again.
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <Empty icon="🎫" title="No designations yet" message="Add a designation to configure the access it grants."
          action={<Button onClick={() => setAddOpen(true)}>+ Designation</Button>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(row => {
            const perms   = permsOf(row);
            const isOpen  = openRow === row._id;
            const changed = !!draft[row._id];
            const nAdmin  = countBy(perms, enabledKeys, 'admin');
            const nUser   = countBy(perms, enabledKeys, 'user');
            const nNone   = enabledKeys.length - nAdmin - nUser;

            return (
              <div key={row._id} className="card" style={changed ? { borderColor: 'var(--primary)' } : undefined}>
                <div className="card-header"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap' }}
                  onClick={() => setOpenRow(isOpen ? null : row._id)}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      🎫 {row.name}
                      {!row.isActive && <Badge variant="muted">inactive</Badge>}
                      {changed && <Badge variant="warning">unsaved</Badge>}
                    </div>
                    <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {row.teacherCount} teacher{row.teacherCount === 1 ? '' : 's'} · {nAdmin} admin · {nUser} normal · {nNone} no access
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setAll(row, 'user')}>All Normal</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setAll(row, 'none')}>All None</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setRenaming({ _id: row._id, name: row.name })}>Rename</button>
                    <button className="btn btn-warning btn-sm" onClick={() => toggleActive(row)}>
                      {row.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => tryDelete(row)}>Delete</button>
                  </div>

                  <span style={{
                    color: 'var(--text-muted)', fontSize: '.85rem',
                    transition: 'transform .2s', display: 'inline-block',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}>▼</span>
                </div>

                {isOpen && (
                  <div className="card-body" style={{ paddingTop: 0 }}>
                    {!row.isActive && (
                      <Alert variant="warning">
                        This designation is inactive — its teachers get no module access until it is activated again.
                      </Alert>
                    )}
                    {enabled.length === 0 ? (
                      <Empty icon="🔒" title="No modules enabled"
                        message="The Super Admin has not enabled any module for this school yet." />
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 10 }}>
                        {enabled.map(m => {
                          const level = perms[m.key] || 'none';
                          const c = LEVEL_COLOR[level];
                          return (
                            <div key={m.key} style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                              padding: '10px 12px', borderRadius: 'var(--radius)',
                              border: `1px solid ${c.border}`, background: c.bg,
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: '1.05rem' }}>{m.icon}</span>{m.label}
                                </div>
                                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                                  {m.description}
                                </div>
                              </div>
                              <LevelPicker
                                value={level}
                                adminCapable={m.adminCapable}
                                onChange={lv => setLevel(row, m.key, lv)} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isDirty && (
        <div style={{
          position: 'sticky', bottom: 0, marginTop: 16, padding: '12px 16px',
          background: 'var(--surface)', border: '1px solid var(--primary)', borderRadius: 'var(--radius)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '.85rem' }}>
            {dirtyIds.length} designation{dirtyIds.length === 1 ? '' : 's'} changed — teachers inherit this as soon as it is saved.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setDraft({})}>Discard</Button>
            <Button onClick={save} loading={saving}>Save Changes</Button>
          </div>
        </div>
      )}

      {/* ── Add ─────────────────────────────────────────────────────────────── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Designation"
        footer={<>
          <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button form="designation-add-form" type="submit" loading={adding}>Add</Button>
        </>}>
        <form id="designation-add-form" onSubmit={addDesignation}>
          <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginTop: 0 }}>
            The new designation starts with normal access to every enabled module. Open it in the list to grant
            administrative access or withdraw modules.
          </p>
          <div className="form-group">
            <label className="form-label required">Name</label>
            <input className="form-control" autoFocus maxLength={60} placeholder="e.g. Head of Science"
              value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
        </form>
      </Modal>

      {/* ── Rename ──────────────────────────────────────────────────────────── */}
      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename Designation"
        footer={<>
          <Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button>
          <Button form="designation-rename-form" type="submit" loading={renameSaving}>Save</Button>
        </>}>
        <form id="designation-rename-form" onSubmit={rename}>
          <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginTop: 0 }}>
            Every teacher holding this designation is moved to the new name, so nobody loses their permissions.
          </p>
          <div className="form-group">
            <label className="form-label required">Name</label>
            <input className="form-control" autoFocus maxLength={60}
              value={renaming?.name || ''}
              onChange={e => setRenaming(r => ({ ...r, name: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={deleting}
        title="Delete Designation"
        message={`Delete "${del?.name}"? Its configured module permissions are removed with it.`} />

      {/* ── Delete refused: these teachers still hold the designation ───────── */}
      <Modal open={!!blocked} onClose={() => setBlocked(null)} maxWidth={860}
        title="Cannot Delete Designation"
        footer={<>
          <Button variant="secondary" onClick={() => setBlocked(null)}>Close</Button>
          <Button onClick={downloadTeachers} loading={downloading}
            disabled={!blocked?.teachers?.length}>⬇ Download Excel</Button>
        </>}>
        <Alert variant="danger">
          {blocked?.message
            || `Cannot delete "${blocked?.name}" — ${blocked?.teachers?.length} teacher${blocked?.teachers?.length === 1 ? '' : 's'} still ${blocked?.teachers?.length === 1 ? 'has' : 'have'} this designation. Reassign ${blocked?.teachers?.length === 1 ? 'them' : 'them all'} to another designation first.`}
        </Alert>

        <p style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>
          Reassign each teacher on the <strong>Teachers</strong> page, then delete the designation.
          Download the list to work through it offline.
        </p>

        {blocked?.teachers?.length ? (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <table className="table" style={{ margin: 0, minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Teacher</th>
                  <th>Phone</th>
                  <th>Department</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {blocked.teachers.map(t => (
                  <tr key={t._id} data-focus-id={t._id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>{t.employeeId || '—'}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{t.email}</div>
                    </td>
                    <td>{t.phone || '—'}</td>
                    <td>{t.department || '—'}</td>
                    <td>{t.joiningDate || '—'}</td>
                    <td><Badge variant={t.isActive ? 'success' : 'muted'}>{t.isActive ? 'Active' : 'Inactive'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="✅" title="Nobody holds it now"
            message="The teachers were reassigned in the meantime — reload and try the delete again." />
        )}
      </Modal>
    </div>
  );
}
