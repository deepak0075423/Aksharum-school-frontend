/**
 * Documents: the verification queue (oldest first, so nothing waits forever)
 * and the document types the school asks for — formats, size, who reviews
 * them, when they are needed, the rejection reasons the office picks from,
 * and where a verified copy goes on the student's record.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import {
  Page, Head, Panel, Btn, Chip, DocChip, Table, Pager, Toolbar, Select, Empty, ErrorBox, Spin, Dialog, ConfirmDialog, Field, Input,
  TextArea, Toggle, Check, IconBtn, Note, Person, useLoad,
} from '../admUI';
import { ago, errMsg, size } from '../meta';
import { useAdmission, useQueryState, RoundSelect, ReviewDialog, StaffChecks, openFile } from './parts';

const BASE = '/admin/admissions';

export default function Documents() {
  const [q, setQ] = useQueryState({ tab: 'queue' });
  return (
    <Page>
      <Head eyebrow="Admissions" title="Documents" subtitle="Check what families upload, and decide what they are asked for." />
      <Tabs variant="line" value={q.tab} onChange={(v) => setQ({ tab: v })} items={[{ key: 'queue', label: 'Verification queue' }, { key: 'types', label: 'Document types' }]} />
      {q.tab === 'types' ? <Types /> : <Queue />}
    </Page>
  );
}

/* ── The queue ────────────────────────────────────────────────────────────── */

function Queue() {
  const adm = useAdmission();
  const [q, setQ] = useQueryState({ tab: 'queue', status: '', docKey: '', round: '', page: '1' });
  const [review, setReview] = useState(null);
  const params = { status: q.status, docKey: q.docKey, round: q.round, page: q.page, limit: 30 };
  const { data, meta, loading, error, reload } = useLoad(() => admin.documents(params), [JSON.stringify(params)]);
  const open = (r, decision) => setReview({ doc: { ...r, fileUrl: admin.docUrl(r._id) }, decision, reasons: r.rejectionReasons || [] });
  return (
    <Panel pad={false}>
      <Toolbar>
        <Select value={q.status} onChange={(e) => setQ({ status: e.target.value })} aria-label="Status">
          <option value="">Waiting for review</option>
          <option value="resubmission_required">Asked to upload again</option>
          <option value="rejected">Rejected</option>
          <option value="verified">Verified</option>
        </Select>
        <Select value={q.docKey} onChange={(e) => setQ({ docKey: e.target.value })} aria-label="Document type">
          <option value="">All documents</option>
          {(adm.documentTypes || []).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </Select>
        <RoundSelect value={q.round} onChange={(v) => setQ({ round: v })} />
      </Toolbar>
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <>
          <Table rows={data || []}
            empty={<Empty icon="fileCheck" title={q.status ? 'Nothing here' : 'Nothing waiting'}>{q.status ? '' : 'Every uploaded document has been reviewed.'}</Empty>}
            columns={[
              { key: 'doc', label: 'Document', render: (r) => <><b>{r.typeName || r.docKey}</b>{r.sensitive ? <> <Chip tone="amber">Sensitive</Chip></> : null}<div className="adm-muted" style={{ fontSize: '.76rem' }}>{r.originalName} · {size(r.size || 0)}{r.version > 1 ? ` · version ${r.version}` : ''}</div></> },
              { key: 'student', label: 'Student', render: (r) => <Person name={r.studentName} sub={`${r.applicationNumber || ''} · ${r.className || ''}`} to={`${BASE}/applications/${r.applicationId}`} /> },
              { key: 'status', label: 'Status', render: (r) => <><DocChip status={r.status} />{r.rejectionReason ? <div className="adm-muted" style={{ fontSize: '.74rem' }}>{r.rejectionReason}</div> : null}</> },
              { key: 'at', label: 'Uploaded', render: (r) => ago(r.createdAt) },
              { key: 'act', label: '', render: (r) => (
                <div className="adm-row" style={{ gap: 4, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                  <IconBtn icon="eye" label="Open" onClick={() => openFile(admin.docUrl(r._id))} />
                  {r.status !== 'verified' ? <Btn size="sm" kind="success" onClick={() => open(r, 'verify')}>Verify</Btn> : null}
                  <Btn size="sm" onClick={() => open(r, 'resubmit')}>Problem</Btn>
                </div>
              ) },
            ]} />
          <Pager page={Number(q.page) || 1} pages={Math.max(1, Math.ceil((meta?.total || 0) / 30))} total={meta?.total || 0} onPage={(p) => setQ({ page: p }, { keepPage: true })} label="documents" />
        </>
      )}
      <ReviewDialog open={!!review} onClose={() => setReview(null)} doc={review?.doc} reasons={review?.reasons || []} initial={review?.decision}
        review={admin.reviewDoc} onDone={reload} />
    </Panel>
  );
}

/* ── Document types ───────────────────────────────────────────────────────── */

const GATES = [
  ['submission', 'Needed to submit the application'],
  ['before_exam', 'Needed before the entrance exam'],
  ['before_confirmation', 'Needed before the admission is confirmed'],
  ['none', 'Not a condition for anything'],
];
const FORMATS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

function Types() {
  const adm = useAdmission();
  const { data, loading, error, reload, setData } = useLoad(() => admin.docTypes(), []);
  const [edit, setEdit] = useState(null);   // {} new | row
  const [del, setDel] = useState(null);
  const move = async (i, dir) => {
    const list = [...data];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setData(list);
    try { await admin.orderDocTypes(list.map((t) => t._id)); adm.reload(); } catch (e) { toast.error(errMsg(e)); reload(); }
  };
  if (loading && !data) return <Spin />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <Panel pad={false} title="Document types" sub="What families can be asked to upload. A form's upload question points at one of these." icon="files"
      right={<Btn kind="primary" icon="plus" onClick={() => setEdit({})}>Add document type</Btn>}>
      <Table rows={data || []}
        empty={<Empty icon="files" title="No document types" action={<Btn kind="primary" onClick={() => setEdit({})}>Add one</Btn>} />}
        columns={[
          { key: 'ord', label: '', width: 64, render: (t) => {
            const i = data.indexOf(t);
            return <div className="adm-row" style={{ gap: 0, flexWrap: 'nowrap' }}><IconBtn icon="arrowUp" label="Up" disabled={i === 0} onClick={() => move(i, -1)} /><IconBtn icon="arrowDown" label="Down" disabled={i === data.length - 1} onClick={() => move(i, 1)} /></div>;
          } },
          { key: 'name', label: 'Document', render: (t) => <><b>{t.name}</b> <span className="adm-num adm-muted">{t.key}</span><div className="adm-muted" style={{ fontSize: '.76rem' }}>{t.accept.join(', ').toUpperCase()} · up to {t.maxSizeMB} MB</div></> },
          { key: 'rules', label: 'Rules', render: (t) => (
            <div className="adm-row" style={{ gap: 4 }}>
              {t.required ? <Chip tone="indigo">Always required</Chip> : <Chip tone="gray">When a form asks</Chip>}
              {t.verification ? <Chip tone="blue">Verified</Chip> : null}
              {t.sensitive ? <Chip tone="amber">Sensitive</Chip> : null}
              {t.mapsTo ? <Chip tone="teal">To student record</Chip> : null}
              {!t.isActive ? <Chip tone="red">Off</Chip> : null}
            </div>
          ) },
          { key: 'use', label: 'Uploads', align: 'right', render: (t) => <>{t.uploads}{t.pending ? <div className="adm-muted" style={{ fontSize: '.74rem' }}>{t.pending} waiting</div> : null}</> },
          { key: 'act', label: '', render: (t) => (
            <div className="adm-row" style={{ gap: 2, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
              <IconBtn icon="pencil" label="Edit" onClick={() => setEdit(t)} />
              <IconBtn icon="trash" kind="danger" label="Delete" onClick={() => setDel(t)} />
            </div>
          ) },
        ]} />
      <DocTypeDialog open={!!edit} row={edit} onClose={() => setEdit(null)} onDone={() => { reload(); adm.reload(); }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={`Delete ${del?.name || ''}?`} confirmLabel="Delete"
        message="A document type that has uploads, or that a form asks for, is switched off instead of deleted."
        onConfirm={async () => { try { const r = await admin.deleteDocType(del._id); toast.success(r.message || 'Deleted'); reload(); adm.reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </Panel>
  );
}

function DocTypeDialog({ open, row, onClose, onDone }) {
  const adm = useAdmission();
  const isNew = !row?._id;
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({
      name: row?.name || '', key: row?.key || '', description: row?.description || '',
      accept: row?.accept || ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: row?.maxSizeMB ?? 5,
      required: !!row?.required, verification: row?.verification ?? true, gate: row?.gate || 'before_confirmation',
      reviewers: row?.reviewers || [], reasons: (row?.rejectionReasons || ['Not clear enough to read', 'Wrong document', 'Name does not match the application']).join('\n'),
      allowResubmission: row?.allowResubmission ?? true, maxResubmissions: row?.maxResubmissions ?? 3, deadlineDays: row?.deadlineDays ?? '',
      mapsTo: row?.mapsTo || '', sensitive: !!row?.sensitive, isActive: row?.isActive ?? true,
      classes: row?.appliesTo?.classes || [], rounds: row?.appliesTo?.rounds || [],
    });
  }, [open, row]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const toggleIn = (k, id, on) => set(k, on ? [...new Set([...(f[k] || []), id])] : (f[k] || []).filter((x) => x !== id));
  const go = async () => {
    setBusy(true);
    const body = {
      name: f.name.trim(), ...(isNew && f.key.trim() ? { key: f.key.trim() } : {}), description: f.description.trim(), accept: f.accept,
      maxSizeMB: Number(f.maxSizeMB), required: f.required, verification: f.verification, gate: f.gate, reviewers: f.reviewers,
      rejectionReasons: f.reasons.split('\n').map((x) => x.trim()).filter(Boolean), allowResubmission: f.allowResubmission,
      maxResubmissions: Number(f.maxResubmissions), deadlineDays: f.deadlineDays === '' ? null : Number(f.deadlineDays),
      mapsTo: f.mapsTo, sensitive: f.sensitive, isActive: f.isActive, appliesTo: { classes: f.classes, rounds: f.rounds },
    };
    try {
      if (isNew) await admin.createDocType(body); else await admin.updateDocType(row._id, body);
      toast.success(isNew ? 'Document type added' : 'Saved');
      onClose();
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={isNew ? 'Add a document type' : `Edit ${row?.name}`} width={720}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!f.name?.trim() || !f.accept?.length} onClick={go}>{isNew ? 'Add' : 'Save'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="adm-grid2">
          <Field label="Name" required><Input value={f.name || ''} onChange={(e) => set('name', e.target.value)} maxLength={80} data-text="title" /></Field>
          <Field label="Key" hint={isNew ? 'Made from the name when left empty. Cannot change later.' : 'Fixed — forms refer to it.'}>
            <Input value={f.key || ''} disabled={!isNew} onChange={(e) => set('key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} maxLength={40} />
          </Field>
        </div>
        <Field label="What to upload" hint="Shown to the family next to the upload box."><TextArea rows={2} value={f.description || ''} onChange={(e) => set('description', e.target.value)} maxLength={300} /></Field>
        <div className="adm-grid2">
          <Field label="File formats" required>
            <div className="adm-choices">
              {FORMATS.map((x) => <label key={x} className={`adm-choice ${f.accept?.includes(x) ? 'is-on' : ''}`}><input type="checkbox" checked={!!f.accept?.includes(x)} onChange={(e) => set('accept', e.target.checked ? [...(f.accept || []), x] : f.accept.filter((y) => y !== x))} />{x.toUpperCase()}</label>)}
            </div>
          </Field>
          <Field label="Largest file (MB)"><Input type="number" min="1" max="20" step="1" value={f.maxSizeMB ?? ''} onChange={(e) => set('maxSizeMB', e.target.value)} /></Field>
        </div>
        <div className="adm-grid2">
          <Toggle checked={f.required} onChange={(v) => set('required', v)} label="Always required" sub="Asked of every applicant it applies to, even when the form has no upload question for it." />
          <Toggle checked={f.verification} onChange={(v) => set('verification', v)} label="Must be verified" sub="Someone checks each copy before it counts." />
          <Toggle checked={f.sensitive} onChange={(v) => set('sensitive', v)} label="Sensitive" sub="Only admission administrators can open it." />
          <Toggle checked={f.isActive} onChange={(v) => set('isActive', v)} label="In use" />
        </div>
        <div className="adm-grid2">
          <Field label="Needed by"><Select value={f.gate} onChange={(e) => set('gate', e.target.value)}>{GATES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Copy to the student record as" hint="When the student is enrolled, the verified copy is filed here.">
            <Select value={f.mapsTo} onChange={(e) => set('mapsTo', e.target.value)}>
              <option value="">Do not copy</option>
              {(adm.catalogs?.studentFileFields || []).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </Select>
          </Field>
          <Toggle checked={f.allowResubmission} onChange={(v) => set('allowResubmission', v)} label="Allow a new copy after a rejection" />
          <div className="adm-row" style={{ gap: 10 }}>
            <Field label="Copies allowed after rejection"><Input type="number" min="0" max="10" step="1" value={f.maxResubmissions ?? ''} onChange={(e) => set('maxResubmissions', e.target.value)} disabled={!f.allowResubmission} /></Field>
            <Field label="Days to upload again"><Input type="number" min="1" max="120" step="1" value={f.deadlineDays ?? ''} placeholder="No limit" onChange={(e) => set('deadlineDays', e.target.value)} /></Field>
          </div>
        </div>
        <Field label="Rejection reasons" hint="One per line — the reviewer picks one, and the family sees it.">
          <TextArea rows={4} value={f.reasons || ''} onChange={(e) => set('reasons', e.target.value)} />
        </Field>
        <Field label="Reviewers" hint="Staff who may verify this document from their admission duties (administrators always can). Not used for sensitive documents.">
          <StaffChecks value={f.reviewers} onChange={(v) => set('reviewers', v)} max={20} />
        </Field>
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: '.86rem' }}>Only for some classes or rounds</summary>
          <div className="adm-grid2 adm-mt">
            <Field label="Classes" hint="None ticked: every class.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflow: 'auto' }}>
                {(adm.classes || []).map((c) => <Check key={c._id} checked={f.classes?.includes(String(c._id))} onChange={(on) => toggleIn('classes', String(c._id), on)}>{c.className}</Check>)}
              </div>
            </Field>
            <Field label="Rounds" hint="None ticked: every round.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflow: 'auto' }}>
                {(adm.rounds || []).map((r) => <Check key={r._id} checked={f.rounds?.includes(String(r._id))} onChange={(on) => toggleIn('rounds', String(r._id), on)}>{r.name}</Check>)}
                {!(adm.rounds || []).length ? <span className="adm-muted">No rounds yet.</span> : null}
              </div>
            </Field>
          </div>
        </details>
        {!isNew && row?.uploads ? <Note tone="indigo" icon="info">{row.uploads} upload(s) use this type. Changes apply to new uploads and reviews.</Note> : null}
        <span className="adm-muted" style={{ fontSize: '.8rem' }}>Upload questions are added to a form in the <Link to={`${BASE}/forms`}>form builder</Link>.</span>
      </div>
    </Dialog>
  );
}
