/**
 * Super Admin → Video Library → Boards.
 *
 * The education boards of the central library and the classes each one has.
 * A class here is one of the platform's own classes (Playgroup … Class 12) —
 * the same ones every school's classes are built from — so there is no second
 * class list to keep in step.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { central as api } from '../../../api/video.api';
import { Button, Modal, Confirm, Alert, Spinner } from '../../../components/ui/index';
import { ListTable, SearchField, Stack, RowActions, IconAction, RowMenu, MenuItem, MenuSep, Drawer, DrawerHead } from '../../admin/listParts';
import { CLASS_LEVELS, levelOf } from '../../../utils/classLevels';
import { Head, Loadable, StatusBadge, Icon, errText, plural, useDebounced } from '../vlParts';

const BLANK = { name: '', code: '', description: '', classLevels: [] };

/** "Class 1 – Class 10" for a run, the labels otherwise. */
export const levelsText = (levels = []) => {
  const sorted = [...levels].sort((a, b) => a - b);
  if (!sorted.length) return 'No classes yet';
  const run = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  const label = (n) => levelOf(n)?.label || `Class ${n}`;
  return run && sorted.length > 2 ? `${label(sorted[0])} – ${label(sorted[sorted.length - 1])}` : sorted.map(label).join(', ');
};

function BoardForm({ open, board, onClose, onSaved }) {
  const [f, setF] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setF(board ? { name: board.name, code: board.code, description: board.description || '', classLevels: board.classLevels || [] } : BLANK); setError(''); } }, [open, board]);
  const toggle = (n) => setF((p) => ({ ...p, classLevels: p.classLevels.includes(n) ? p.classLevels.filter((x) => x !== n) : [...p.classLevels, n] }));
  const save = async () => {
    if (f.name.trim().length < 2) return setError('Enter the board\'s name');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$/.test(f.code.trim())) return setError('The code is 2 to 20 letters or digits, for example WBBSE');
    setError(''); setSaving(true);
    try { if (board) await api.updateBoard(board._id, f); else await api.createBoard(f); toast.success(board ? 'Board saved' : 'Board added'); onSaved(); onClose(); }
    catch (e) { setError(errText(e)); }
    finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={board ? 'Edit board' : 'Add a board'} maxWidth={600}
      footer={(<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>{board ? 'Save' : 'Add board'}</Button></>)}>
      <div className="vl-stack">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="vl-form-grid">
          <div className="form-group"><label className="form-label required" htmlFor="bd-name">Board name</label>
            <input id="bd-name" data-text="title" className="form-control" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="West Bengal Board of Secondary Education" /></div>
          <div className="form-group"><label className="form-label required" htmlFor="bd-code">Code</label>
            <input id="bd-code" data-text="code" className="form-control" maxLength={20} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="WBBSE" />
            <div className="form-hint">The board's unique identifier.</div></div>
          <div className="form-group vl-span"><label className="form-label" htmlFor="bd-desc">Description</label>
            <textarea id="bd-desc" data-text="sentence" className="form-control" rows={2} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        </div>
        <div>
          <div className="vl-row" style={{ marginBottom: 8 }}>
            <span className="form-label" style={{ margin: 0 }}>Classes this board has</span>
            <button type="button" className="vl-link vl-small" onClick={() => setF({ ...f, classLevels: CLASS_LEVELS.filter((l) => l.number >= 1).map((l) => l.number) })}>Class 1 to 12</button>
            <button type="button" className="vl-link vl-small" onClick={() => setF({ ...f, classLevels: CLASS_LEVELS.filter((l) => l.number >= 1 && l.number <= 10).map((l) => l.number) })}>Class 1 to 10</button>
            <button type="button" className="vl-link vl-small" onClick={() => setF({ ...f, classLevels: [] })}>Clear</button>
          </div>
          <div className="vl-checks">
            {CLASS_LEVELS.map((l) => {
              const on = f.classLevels.includes(l.number);
              return (<label key={l.number} className={`vl-check${on ? ' is-on' : ''}`}><input type="checkbox" checked={on} onChange={() => toggle(l.number)} /> {l.label}</label>);
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function CentralVideoBoards() {
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [status, setStatus] = useState('');
  const { data, loading, error, refetch } = useFetch(() => api.boards({ search: term || undefined, status: status || undefined }), [term, status]);
  const rows = data || [];
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!viewing) { setDetail(null); return undefined; }
    let alive = true;
    api.board(viewing._id).then((r) => { if (alive) setDetail(r.data); }).catch((e) => toast.error(errText(e)));
    return () => { alive = false; };
  }, [viewing]);

  const run = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'delete') await api.removeBoard(confirm.row._id);
      else await api.setBoardActive(confirm.row._id, confirm.kind === 'activate');
      toast.success(confirm.kind === 'delete' ? 'Board deleted' : confirm.kind === 'activate' ? 'Board activated' : 'Board deactivated');
      setConfirm(null); refetch();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'board', label: 'Board', render: (r) => <button type="button" className="vl-link" onClick={() => setViewing(r)}><Stack main={r.name} sub={r.code} /></button> },
    { key: 'classes', label: 'Classes', render: (r) => levelsText(r.classLevels) },
    { key: 'subjects', label: 'Subjects', render: (r) => r.subjectCount },
    { key: 'books', label: 'Books', render: (r) => r.bookCount },
    { key: 'schools', label: 'Schools', render: (r) => r.schoolCount },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.isActive ? 'active' : 'inactive'} /> },
    { key: 'acts', label: '', className: 'ltable__acts', render: (r) => (
      <RowActions>
        <IconAction icon="eye" label="Classes, subjects and books" onClick={() => setViewing(r)} />
        <IconAction icon="pencil" label="Edit" onClick={() => setEditing(r)} />
        <RowMenu>
          <MenuItem icon={r.isActive ? 'eyeOff' : 'checkCircle'} onClick={() => setConfirm({ kind: r.isActive ? 'deactivate' : 'activate', row: r })}>{r.isActive ? 'Deactivate' : 'Activate'}</MenuItem>
          <MenuSep /><MenuItem icon="trash" danger onClick={() => setConfirm({ kind: 'delete', row: r })}>Delete</MenuItem>
        </RowMenu>
      </RowActions>
    ) },
  ];

  return (
    <div className="page vl-page">
      <Head title="Boards" subtitle="The education boards of the library and the classes each one covers.">
        <Button onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Add board</Button>
      </Head>
      <Loadable error={error} onRetry={refetch}>
        <section className="card">
          <div className="ltools">
            <SearchField value={search} onChange={setSearch} placeholder="Search boards by name or code…" />
            <select className={`form-control lsel${status ? ' lfsel--on' : ''}`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">All boards</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
          <ListTable columns={columns} rows={rows} loading={loading}
            emptyIcon="🏛️" emptyTitle={term || status ? 'No boards match' : 'No boards yet'}
            emptyMessage={term || status ? 'Try another search.' : 'Add the first board — WBBSE, CBSE, ICSE — to start building the library.'}
            emptyAction={!term && !status ? <Button onClick={() => setEditing('new')}>Add board</Button> : null} />
          <div className="lfoot"><span className="lfoot__count">{plural(rows.length, 'board')}</span></div>
        </section>
      </Loadable>

      <BoardForm open={!!editing} board={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={refetch} />
      <Confirm open={!!confirm} loading={busy} onClose={() => setConfirm(null)} onConfirm={run}
        title={confirm?.kind === 'delete' ? 'Delete this board?' : confirm?.kind === 'activate' ? 'Activate this board?' : 'Deactivate this board?'}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : confirm?.kind === 'activate' ? 'Activate' : 'Deactivate'}
        message={confirm?.kind === 'delete' ? `${confirm.row.name} will be removed. A board that has books, or that a school follows, cannot be deleted — deactivate it instead.`
          : confirm?.kind === 'activate' ? `${confirm?.row.name} will be offered to schools again.`
            : `${confirm?.row.name} will no longer be offered to schools choosing a board. Schools already following it keep what they have.`} />

      <Drawer open={!!viewing} onClose={() => setViewing(null)} label="Board details">
        {viewing ? (
          <>
            <DrawerHead name={viewing.name} sub={viewing.code} tags={<StatusBadge status={viewing.isActive ? 'active' : 'inactive'} />} onClose={() => setViewing(null)} />
            <div className="ldrawer__body">
              {viewing.description ? <p className="vl-muted" style={{ marginBottom: 16 }}>{viewing.description}</p> : null}
              {!detail ? <Spinner size="sm" /> : detail.classes.length ? detail.classes.map((c) => (
                <div className="ldrawer__sec" key={c.classLevel}>
                  <h4>{c.label}</h4>
                  {c.subjects.length ? (
                    <div className="vl-chips">{c.subjects.map((s) => <span key={s.subject} className="vl-chip">{s.name} · {plural(s.bookCount, 'book')}</span>)}</div>
                  ) : <span className="vl-small vl-muted">No subjects mapped yet</span>}
                </div>
              )) : <p className="vl-muted">This board has no classes yet. Edit it to add them.</p>}
            </div>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
