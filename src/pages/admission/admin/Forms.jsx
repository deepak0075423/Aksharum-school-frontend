/**
 * Application forms. Each form keeps its published version (what families
 * fill in) and at most one draft being worked on; publishing the draft makes
 * a new version, and earlier ones stay for the applications made on them.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import { Page, Head, Panel, Btn, Chip, Table, Empty, ErrorBox, Spin, Dialog, ConfirmDialog, Field, Input, Select, IconBtn, Toggle, useLoad } from '../admUI';
import { fmtDate, errMsg } from '../meta';
import { useAdmission } from './parts';

const BASE = '/admin/admissions';

export default function Forms() {
  const nav = useNavigate();
  const adm = useAdmission();
  const { data, loading, error, reload, setData } = useLoad(() => admin.forms(), []);
  const [creating, setCreating] = useState(null);   // {} | { from: form }
  const [del, setDel] = useState(null);
  const refresh = () => { reload(); adm.reload(); };
  const toggle = async (f, on) => {
    setData((rows) => rows.map((r) => (r._id === f._id ? { ...r, isActive: on } : r)));
    try { await admin.updateForm(f._id, { isActive: on }); } catch (e) { toast.error(errMsg(e)); reload(); }
  };
  return (
    <Page>
      <Head eyebrow="Admissions" title="Application forms" subtitle="Design the questions families answer. A round, or a class within it, chooses which form it uses.">
        <Btn kind="primary" icon="plus" onClick={() => setCreating({})}>New form</Btn>
      </Head>
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <Panel pad={false}>
          <Table rows={data || []} onRow={(f) => nav(`${BASE}/forms/${f._id}`)}
            empty={<Empty icon="list" title="No forms yet" action={<Btn kind="primary" onClick={() => setCreating({})}>Create one</Btn>} />}
            columns={[
              { key: 'n', label: 'Form', render: (f) => <><b>{f.name}</b>{f.description ? <div className="adm-muted" style={{ fontSize: '.76rem' }}>{f.description}</div> : null}</> },
              { key: 'v', label: 'Published', render: (f) => (f.current ? <><Chip tone="green">Version {f.current.version}</Chip><div className="adm-muted" style={{ fontSize: '.74rem' }}>{fmtDate(f.current.publishedAt)}</div></> : <Chip tone="gray">Never published</Chip>) },
              { key: 'd', label: 'Draft', render: (f) => (f.draft ? <Chip tone="amber">Version {f.draft.version} in progress</Chip> : '—') },
              { key: 'r', label: 'Used by', render: (f) => (f.rounds.length ? f.rounds.join(', ') : <span className="adm-muted">No round</span>) },
              { key: 'a', label: 'Applications', align: 'right', render: (f) => f.applications },
              { key: 'on', label: 'In use', render: (f) => <Toggle checked={f.isActive !== false} onChange={(v) => toggle(f, v)} /> },
              { key: 'x', label: '', render: (f) => (
                <div className="adm-row" style={{ gap: 2, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                  <IconBtn icon="copy" label="Duplicate" onClick={() => setCreating({ from: f })} />
                  {!f.applications && !f.rounds.length ? <IconBtn icon="trash" kind="danger" label="Delete" onClick={() => setDel(f)} /> : null}
                </div>
              ) },
            ]} />
        </Panel>
      )}
      <NewForm open={!!creating} from={creating?.from} forms={data || []} onClose={() => setCreating(null)} onDone={(id) => { refresh(); nav(`${BASE}/forms/${id}`); }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={`Delete ${del?.name || ''}?`} confirmLabel="Delete"
        onConfirm={async () => { try { await admin.deleteForm(del._id); toast.success('Form deleted'); refresh(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </Page>
  );
}

function NewForm({ open, from, forms, onClose, onDone }) {
  const [name, setName] = useState('');
  const [source, setSource] = useState('default');
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (open) { setName(from ? `${from.name} (copy)` : ''); setSource(from ? String(from._id) : 'default'); } }, [open, from]);
  const go = async () => {
    setBusy(true);
    try {
      const r = from ? await admin.duplicateForm(from._id, name.trim()) : await admin.createForm({ name: name.trim(), from: source === 'blank' ? undefined : source });
      toast.success('Form created — edit it, then publish');
      onClose();
      onDone(r.data._id);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={from ? `Duplicate ${from.name}` : 'New application form'} width={480}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!name.trim()} onClick={go}>Create</Btn></>}>
      <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} data-text="title" placeholder="Application — Classes 1 to 5" /></Field>
      {!from ? (
        <Field label="Start from" className="adm-mt">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="default">The standard form (student, parents, address, previous school, health, documents…)</option>
            <option value="blank">A blank form</option>
            {forms.map((f) => <option key={f._id} value={f._id}>A copy of {f.name}</option>)}
          </Select>
        </Field>
      ) : null}
    </Dialog>
  );
}
