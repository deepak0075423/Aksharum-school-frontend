/**
 * Super admin → Admission groups (Oct 2026): schools of one trust or chain that
 * families see together on one page, app.aksharum.com/g/<slug>. A school can be
 * in one group; each school decides in its own admission office whether it is
 * listed. "Share status" lets branches see the same family's applications at
 * each other (school-backend services/admission/groups.js).
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { platform } from '../../api/admission.api';
import {
  Page, Head, Panel, Btn, Chip, Table, Empty, ErrorBox, Spin, Dialog, ConfirmDialog, Field, Input, TextArea, Toggle, Note, SearchBox, useLoad,
} from '../admission/admUI';
import { errMsg } from '../admission/meta';

export default function AdmissionGroups() {
  const { data, loading, error, reload } = useLoad(() => platform.groups(), []);
  const [editing, setEditing] = useState(null);   // a group, or {} for a new one
  const [removing, setRemoving] = useState(null);
  return (
    <Page>
      <Head eyebrow="Platform" title="Admission groups" subtitle="Schools of one trust or chain that families see on one page — /g/<address>.">
        <Btn kind="primary" icon="plus" onClick={() => setEditing({})}>New group</Btn>
      </Head>
      <Panel pad={false}>
        {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
          <Table rows={data || []} onRow={setEditing} empty={<Empty icon="layers" title="No groups yet">A group lists several schools' admission portals on one page.</Empty>} columns={[
            { key: 'n', label: 'Group', render: (g) => <><b>{g.name}</b><div className="adm-muted" style={{ fontSize: '.76rem' }}><a href={`/g/${g.slug}`} target="_blank" rel="noreferrer">/g/{g.slug}</a></div></> },
            { key: 'm', label: 'Schools', render: (g) => (g.members || []).map((m) => <Chip key={m.school} tone={m.listed === false ? 'gray' : 'indigo'} title={m.listed === false ? 'Not listed — the school\'s choice' : ''}>{m.name || 'School'}</Chip>) },
            { key: 's', label: 'Shares status', render: (g) => (g.shareStatus ? <Chip tone="amber">Yes</Chip> : <Chip tone="gray">No</Chip>) },
            { key: 'a', label: '', render: (g) => (g.isActive ? <Chip tone="green">Live</Chip> : <Chip tone="gray">Off</Chip>) },
          ]} />
        )}
      </Panel>
      {editing ? <GroupDialog group={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} onRemove={(g) => { setEditing(null); setRemoving(g); }} /> : null}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.name || 'the group'}?`} confirmLabel="Delete"
        message="The group page goes away. The schools, their portals and every application stay as they are."
        onConfirm={async () => { try { await platform.deleteGroup(removing._id); toast.success('Deleted'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </Page>
  );
}

function GroupDialog({ group, onClose, onDone, onRemove }) {
  const isNew = !group._id;
  const [f, setF] = useState(() => ({
    name: group.name || '', slug: group.slug || '', intro: group.intro || '', primary: group.theme?.primary || '#4f46e5',
    shareStatus: !!group.shareStatus, isActive: group.isActive !== false, members: (group.members || []).map((m) => String(m.school)),
  }));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const schools = useLoad(() => platform.schools(), []);
  const all = useMemo(() => schools.data?.data || [], [schools.data]);
  const shown = all.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || f.members.includes(String(s._id)));
  useEffect(() => { if (isNew && f.name && !f.slug) setF((x) => x); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    setBusy(true);
    const body = { name: f.name.trim(), slug: f.slug.trim().toLowerCase(), intro: f.intro.trim(), theme: { primary: f.primary }, shareStatus: f.shareStatus, isActive: f.isActive, members: f.members };
    try {
      if (isNew) await platform.createGroup(body); else await platform.updateGroup(group._id, body);
      toast.success(isNew ? 'Group created' : 'Saved');
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const toggle = (id) => setF({ ...f, members: f.members.includes(id) ? f.members.filter((x) => x !== id) : [...f.members, id] });
  return (
    <Dialog open onClose={onClose} title={isNew ? 'New admission group' : group.name} width={720}
      footer={<>{!isNew ? <Btn kind="ghost" icon="trash" onClick={() => onRemove(group)}>Delete</Btn> : null}<Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!f.name.trim() || !f.slug.trim() || f.members.length < 2} onClick={go}>{isNew ? 'Create' : 'Save'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-grid2">
          <Field label="Name" required><Input value={f.name} maxLength={120} data-text="title" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Address" required hint={`app.aksharum.com/g/${f.slug || '…'}`}><Input value={f.slug} maxLength={40} data-text="code" onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} /></Field>
        </div>
        <Field label="Introduction" hint="Shown at the top of the group page"><TextArea rows={2} maxLength={1500} value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} /></Field>
        <div className="adm-row">
          <Field label="Colour"><input type="color" value={f.primary} onChange={(e) => setF({ ...f, primary: e.target.value })} aria-label="Colour" style={{ width: 52, height: 36, border: 0, background: 'none' }} /></Field>
          <Toggle checked={f.shareStatus} onChange={(v) => setF({ ...f, shareStatus: v })} label="Branches see the same family's applications at each other" sub="Status and order of preference only — never the answers. Tell families so in each branch's privacy notice." />
          <Toggle checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Live" />
        </div>
        <Field label={`Schools (${f.members.length})`} required hint="At least two; a school can be in one group only">
          <SearchBox value={q} onChange={setQ} placeholder="Find a school" />
          <div className="adm-choices" style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8 }}>
            {schools.loading && !schools.data ? <Spin /> : shown.map((s) => (
              <label key={s._id} className={`adm-choice ${f.members.includes(String(s._id)) ? 'is-on' : ''}`}>
                <input type="checkbox" checked={f.members.includes(String(s._id))} onChange={() => toggle(String(s._id))} />{s.name}
              </label>
            ))}
          </div>
        </Field>
        {f.shareStatus ? <Note tone="amber" icon="shieldCheck">Sharing status across branches is sharing personal data between schools. Make sure the families are told in each branch&rsquo;s privacy notice.</Note> : null}
      </div>
    </Dialog>
  );
}
