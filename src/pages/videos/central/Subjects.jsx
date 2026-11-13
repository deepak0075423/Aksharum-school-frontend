/**
 * Super Admin → Video Library → Subjects.
 *
 * The central subject master. A subject exists ONCE and is mapped to every
 * board and class that teaches it — "Hindi" is not added again for each board.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { central as api } from '../../../api/video.api';
import { Button, Modal, Confirm, Alert } from '../../../components/ui/index';
import { ListTable, SearchField, Stack, RowActions, IconAction, RowMenu, MenuItem, MenuSep } from '../../admin/listParts';
import { levelOf } from '../../../utils/classLevels';
import { Head, Loadable, StatusBadge, Icon, errText, plural, useDebounced } from '../vlParts';
import { levelsText } from './Boards';

const BLANK = { name: '', code: '', description: '', language: 'English', status: 'active' };

function SubjectForm({ open, subject, boards, onClose, onSaved }) {
  const [f, setF] = useState(BLANK);
  const [map, setMap] = useState({});          // boardId → [classLevels]
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setF(subject ? { name: subject.name, code: subject.code, description: subject.description || '', language: subject.language || 'English', status: subject.status } : BLANK);
    setMap(Object.fromEntries((subject?.mappings || []).map((m) => [String(m.board), m.classLevels])));
    setError('');
  }, [open, subject]);

  const toggle = (boardId, n) => setMap((p) => {
    const cur = p[boardId] || [];
    return { ...p, [boardId]: cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n] };
  });
  const save = async () => {
    if (f.name.trim().length < 2) return setError('Enter the subject\'s name');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$/.test(f.code.trim())) return setError('The code is 2 to 20 letters or digits, for example HIN');
    const mappings = Object.entries(map).filter(([, levels]) => levels.length).map(([board, classLevels]) => ({ board, classLevels }));
    setError(''); setSaving(true);
    try {
      if (subject) await api.updateSubject(subject._id, { ...f, mappings }); else await api.createSubject({ ...f, mappings });
      toast.success(subject ? 'Subject saved' : 'Subject added'); onSaved(); onClose();
    } catch (e) { setError(errText(e)); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={subject ? 'Edit subject' : 'Add a subject'} maxWidth={680}
      footer={(<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>{subject ? 'Save' : 'Add subject'}</Button></>)}>
      <div className="vl-stack">
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <div className="vl-form-grid">
          <div className="form-group"><label className="form-label required" htmlFor="sb-name">Subject name</label>
            <input id="sb-name" data-text="title" className="form-control" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Hindi" /></div>
          <div className="form-group"><label className="form-label required" htmlFor="sb-code">Subject code</label>
            <input id="sb-code" data-text="code" className="form-control" maxLength={20} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="HIN" /></div>
          <div className="form-group"><label className="form-label" htmlFor="sb-lang">Language</label>
            <input id="sb-lang" data-text="title" className="form-control" maxLength={40} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} /></div>
          <div className="form-group"><label className="form-label" htmlFor="sb-status">Status</label>
            <select id="sb-status" className="form-control" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
          <div className="form-group vl-span"><label className="form-label" htmlFor="sb-desc">Description</label>
            <textarea id="sb-desc" data-text="sentence" className="form-control" rows={2} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        </div>
        <div>
          <div className="form-label">Where it is taught</div>
          <p className="vl-small vl-muted" style={{ marginBottom: 10 }}>Tick the classes of each board that teach this subject. Books can be added only where it is mapped.</p>
          {boards.length ? boards.map((b) => (
            <div key={b._id} style={{ marginBottom: 12 }}>
              <div className="vl-row" style={{ marginBottom: 6 }}>
                <b>{b.name}</b><span className="vl-small vl-muted">{b.code}</span>
                {b.classLevels?.length ? (
                  <>
                    <button type="button" className="vl-link vl-small" onClick={() => setMap((p) => ({ ...p, [b._id]: [...b.classLevels] }))}>All classes</button>
                    <button type="button" className="vl-link vl-small" onClick={() => setMap((p) => ({ ...p, [b._id]: [] }))}>None</button>
                  </>
                ) : null}
              </div>
              <div className="vl-checks">
                {[...(b.classLevels || [])].sort((x, y) => x - y).map((n) => {
                  const on = (map[b._id] || []).includes(n);
                  return (<label key={n} className={`vl-check${on ? ' is-on' : ''}`}><input type="checkbox" checked={on} onChange={() => toggle(b._id, n)} /> {levelOf(n)?.label || `Class ${n}`}</label>);
                })}
                {!b.classLevels?.length ? <span className="vl-small vl-muted">This board has no classes yet.</span> : null}
              </div>
            </div>
          )) : <Alert variant="info">Add a board first, then map this subject to its classes.</Alert>}
        </div>
      </div>
    </Modal>
  );
}

export default function CentralVideoSubjects() {
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [board, setBoard] = useState('');
  const [status, setStatus] = useState('');
  const { data, loading, error, refetch } = useFetch(() => api.subjects({ search: term || undefined, board: board || undefined, status: status || undefined }), [term, board, status]);
  const boards = useFetch(() => api.boards());
  const rows = data || [];
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'delete') await api.removeSubject(confirm.row._id);
      else await api.updateSubject(confirm.row._id, { status: confirm.kind === 'activate' ? 'active' : 'inactive' });
      toast.success(confirm.kind === 'delete' ? 'Subject deleted' : 'Subject updated'); setConfirm(null); refetch();
    } catch (e) { toast.error(errText(e)); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'subject', label: 'Subject', render: (r) => <Stack main={r.name} sub={r.code} /> },
    { key: 'lang', label: 'Language', render: (r) => r.language },
    { key: 'where', label: 'Taught in', render: (r) => (r.mappings.length
      ? <div className="vl-chips">{r.mappings.map((m) => <span key={m.board} className="vl-chip" title={m.boardName}>{m.boardCode} · {levelsText(m.classLevels)}</span>)}</div>
      : <span className="vl-muted">Not mapped yet</span>) },
    { key: 'books', label: 'Books', render: (r) => r.bookCount },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'acts', label: '', className: 'ltable__acts', render: (r) => (
      <RowActions>
        <IconAction icon="pencil" label="Edit and map" onClick={() => setEditing(r)} />
        <RowMenu>
          <MenuItem icon={r.status === 'active' ? 'eyeOff' : 'checkCircle'} onClick={() => setConfirm({ kind: r.status === 'active' ? 'deactivate' : 'activate', row: r })}>{r.status === 'active' ? 'Deactivate' : 'Activate'}</MenuItem>
          <MenuSep /><MenuItem icon="trash" danger onClick={() => setConfirm({ kind: 'delete', row: r })}>Delete</MenuItem>
        </RowMenu>
      </RowActions>
    ) },
  ];

  return (
    <div className="page vl-page">
      <Head title="Subjects" subtitle="One subject, mapped to every board and class that teaches it.">
        <Button onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Add subject</Button>
      </Head>
      <Loadable error={error} onRetry={refetch}>
        <section className="card">
          <div className="ltools">
            <SearchField value={search} onChange={setSearch} placeholder="Search subjects by name or code…" />
            <select className={`form-control lsel${board ? ' lfsel--on' : ''}`} value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Board">
              <option value="">All boards</option>{(boards.data || []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
            <select className={`form-control lsel${status ? ' lfsel--on' : ''}`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
          <ListTable columns={columns} rows={rows} loading={loading}
            emptyIcon="📘" emptyTitle={term || board || status ? 'No subjects match' : 'No subjects yet'}
            emptyMessage={term || board || status ? 'Try another search or filter.' : 'Add a subject and map it to the boards and classes that teach it.'}
            emptyAction={!term && !board && !status ? <Button onClick={() => setEditing('new')}>Add subject</Button> : null} />
          <div className="lfoot"><span className="lfoot__count">{plural(rows.length, 'subject')}</span></div>
        </section>
      </Loadable>
      <SubjectForm open={!!editing} subject={editing === 'new' ? null : editing} boards={(boards.data || []).filter((b) => b.isActive)} onClose={() => setEditing(null)} onSaved={refetch} />
      <Confirm open={!!confirm} loading={busy} onClose={() => setConfirm(null)} onConfirm={run}
        title={confirm?.kind === 'delete' ? 'Delete this subject?' : confirm?.kind === 'activate' ? 'Activate this subject?' : 'Deactivate this subject?'}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : confirm?.kind === 'activate' ? 'Activate' : 'Deactivate'}
        message={confirm?.kind === 'delete' ? `${confirm.row.name} will be removed. A subject that has books, or that a school has selected, cannot be deleted — deactivate it instead.`
          : confirm?.kind === 'activate' ? `${confirm?.row.name} will be offered to schools again.` : `${confirm?.row.name} will no longer be offered to schools selecting subjects. Classes already following it keep it.`} />
    </div>
  );
}
