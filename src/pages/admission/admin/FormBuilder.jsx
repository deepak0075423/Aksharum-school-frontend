/**
 * The form builder. Sections and questions on the left (dragged into order,
 * or moved with the arrow buttons), the chosen one's settings in the middle,
 * and the form as a family will see it on the right — fillable, for the class
 * and round you pick, and checkable against the server's own rules.
 *
 * Work is saved to the form's draft; publishing makes it the version new
 * applications use. Drafts already started move to it as the school's
 * draft-migration setting says. The server validates every save — the same
 * rules the form is held to when families submit.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import FormRenderer from '../FormRenderer';
import { savable } from '../formLogic';
import {
  Page, Head, Panel, Btn, Chip, Empty, ErrorBox, Spin, Dialog, ConfirmDialog, Field, Input, TextArea, Select, Toggle, Check, IconBtn, Ico, Note, KV, useLoad,
} from '../admUI';
import { fmtDateTime, errMsg } from '../meta';
import { useAdmission } from './parts';
import { STATES_AND_UTS } from '../../../utils/indiaStates';

const BASE = '/admin/admissions';
const TYPE_LABEL = {
  text: 'Short text', textarea: 'Long text', number: 'Number', date: 'Date', email: 'Email', phone: 'Mobile number',
  select: 'Dropdown', radio: 'One choice', checkbox: 'Tick box', multiselect: 'Several choices', file: 'Document upload',
  declaration: 'Declaration', info: 'Information text',
};
const TYPE_ICON = {
  text: 'pencil', textarea: 'list', number: 'calculator', date: 'calendar', email: 'mail', phone: 'phone', select: 'chevronDown',
  radio: 'target', checkbox: 'checkSquare', multiselect: 'checks', file: 'upload', declaration: 'shieldCheck', info: 'info',
};
const CHOICE = ['select', 'radio', 'multiselect'];
const OP_LABEL = {
  eq: 'is', neq: 'is not', in: 'is one of', not_in: 'is none of', checked: 'is ticked', not_checked: 'is not ticked',
  filled: 'is answered', empty: 'is not answered', gt: 'is more than', lt: 'is less than', gte: 'is at least', lte: 'is at most',
};
const NO_VALUE = ['checked', 'not_checked', 'filled', 'empty'];
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{1,39}$/;
const clone = (x) => JSON.parse(JSON.stringify(x));

function uniqueKey(schema, base) {
  const used = new Set(schema.sections.flatMap((s) => s.fields.map((f) => f.key)));
  const stem = base.replace(/[^a-zA-Z0-9_]/g, '') || 'field';
  for (let n = 1; ; n++) { const k = `${stem}${n}`; if (!used.has(k)) return k; }
}

function newField(schema, type, docTypes) {
  const f = { key: uniqueKey(schema, type === 'multiselect' ? 'choices' : type), type, label: TYPE_LABEL[type], help: '', placeholder: '', required: false, width: ['textarea', 'radio', 'multiselect', 'file', 'declaration', 'info', 'checkbox'].includes(type) ? 'full' : 'half', sensitive: false };
  if (CHOICE.includes(type)) f.options = [{ value: 'Option 1', label: 'Option 1' }, { value: 'Option 2', label: 'Option 2' }];
  if (type === 'text') f.validation = { kind: 'text', minLength: 0, maxLength: 200 };
  if (type === 'textarea') f.validation = { kind: 'sentence', minLength: 0, maxLength: 2000 };
  if (type === 'number') f.validation = { min: null, max: null, integer: false };
  if (type === 'date') f.validation = { minDate: null, maxDate: null };
  if (type === 'file') f.docType = docTypes.find((t) => t.isActive !== false)?.key || '';
  if (type === 'declaration') { f.label = 'Declaration'; f.text = 'I confirm that the information given is correct.'; f.required = true; }
  if (type === 'info') { f.label = ''; f.text = 'Write the information families should read here.'; }
  return f;
}

/**
 * Questions Indian schools ask the same way — added ready to go (and still
 * editable): the state as a list, the PIN that fills city and state, the
 * national student IDs and the previous school's codes. Each goes to its
 * place in the student record at enrolment, unless the form already sends
 * something there.
 */
const PRESETS = [
  { id: 'state', label: 'State (India)', icon: 'mapPin', make: () => ({ type: 'select', label: 'State / union territory', mapTo: 'address.state', options: STATES_AND_UTS.map((v) => ({ value: v, label: v })) }) },
  { id: 'pincode', label: 'PIN code', icon: 'mapPin', make: () => ({ type: 'text', label: 'PIN code', mapTo: 'address.pincode', help: 'The city and state fill themselves in.', validation: { kind: 'pincode', minLength: 0, maxLength: 6 } }) },
  { id: 'pen', label: 'PEN', icon: 'idCard', make: () => ({ type: 'text', label: 'PEN (Permanent Education Number)', mapTo: 'student.pen', help: 'Optional. 11 digits, from the previous school.', validation: { kind: 'pen', minLength: 0, maxLength: 11 } }) },
  { id: 'apaar', label: 'APAAR ID', icon: 'idCard', make: () => ({ type: 'text', label: 'APAAR ID', mapTo: 'student.apaar', help: 'Optional. The 12-digit student ID.', validation: { kind: 'apaar', minLength: 0, maxLength: 12 } }) },
  { id: 'udise', label: 'Previous school UDISE+', icon: 'school', make: () => ({ type: 'text', label: 'UDISE+ code of the previous school', mapTo: 'previous.udise', help: 'Optional. 11 digits — on the transfer certificate.', validation: { kind: 'udise', minLength: 0, maxLength: 11 } }) },
  { id: 'tcNumber', label: 'TC number', icon: 'fileDoc', make: () => ({ type: 'text', label: 'Transfer certificate number', mapTo: 'previous.tcNumber', validation: { kind: 'code', minLength: 0, maxLength: 40 } }) },
  { id: 'tcDate', label: 'TC date', icon: 'calendar', make: () => ({ type: 'date', label: 'Transfer certificate date', mapTo: 'previous.tcDate', validation: { minDate: null, maxDate: 'today' } }) },
];

function presetField(schema, preset) {
  const f = { key: uniqueKey(schema, preset.id), help: '', placeholder: '', required: false, width: 'half', sensitive: false, ...preset.make() };
  // Two questions cannot fill the same place in the student record.
  if (f.mapTo && schema.sections.some((sec) => sec.fields.some((x) => x.mapTo === f.mapTo))) delete f.mapTo;
  return f;
}

/** "sections[2].fields[4].key" → { s: 2, f: 4 } */
const pathTo = (path) => {
  const m = /sections\[(\d+)\](?:\.fields\[(\d+)\])?/.exec(path || '');
  return m ? { s: Number(m[1]), f: m[2] !== undefined ? Number(m[2]) : null } : null;
};

export default function FormBuilder() {
  const { id } = useParams();
  const adm = useAdmission();
  const { data: d, loading, error, reload } = useLoad(() => admin.form(id), [id]);
  const [schema, setSchema] = useState(null);
  const [sel, setSel] = useState({ s: 0, f: null });   // a section (f null) or a field
  const [dirty, setDirty] = useState(false);
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState('');
  const [ask, setAsk] = useState(null);   // 'publish' | 'discard' | 'rename'
  const [viewing, setViewing] = useState(null);   // a version being looked at

  useEffect(() => {
    if (!d) return;
    const base = d.draft?.schema || d.current?.schema || { sections: [] };
    setSchema(clone(base));
    setDirty(false);
    setProblems([]);
  }, [d]);
  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = useCallback((fn) => {
    setSchema((s) => { const next = clone(s); fn(next); return next; });
    setDirty(true);
  }, []);

  const save = async () => {
    setBusy('save');
    try {
      await admin.saveDraft(id, schema);
      toast.success('Draft saved');
      setProblems([]);
      setDirty(false);
      reload();
      return true;
    } catch (e) {
      const list = e?.data?.errors || [];
      setProblems(list.length ? list : [{ path: '', message: errMsg(e) }]);
      const at = pathTo(list[0]?.path);
      if (at) setSel(at);
      toast.error(errMsg(e));
      return false;
    } finally { setBusy(''); }
  };
  const publish = async (note) => {
    if (dirty && !(await save())) throw new Error('not saved');
    try { const r = await admin.publishForm(id, note); toast.success(`Version ${r.data.version} published`); adm.reload(); reload(); } catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const discard = async () => {
    try { await admin.discardDraft(id); toast.success('Draft discarded'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; }
  };
  const view = async (v) => {
    try { const r = await admin.version(id, v._id); setViewing(r.data); } catch (e) { toast.error(errMsg(e)); }
  };

  if (loading && !d) return <Spin />;
  if (error && !d) return <ErrorBox error={error} onRetry={reload} />;
  if (!schema) return <Spin />;
  const form = d.form;
  const sec = schema.sections[sel.s];
  const field = sec && sel.f != null ? sec.fields[sel.f] : null;

  return (
    <Page>
      <Link to={`${BASE}/forms`} className="adm-linkbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)' }}><Ico name="arrowLeft" size={14} />Forms</Link>
      <Head eyebrow="Form builder" title={form.name}
        subtitle={<>{d.current ? <>Published: version {d.current.version} ({fmtDateTime(d.current.publishedAt)}).</> : 'Not published yet.'} {d.draft ? <>Working on version {d.draft.version}.</> : 'Editing starts a new draft.'}</>}>
        <span className="adm-saved">{dirty ? <><Ico name="alert" size={13} />Unsaved changes</> : <><Ico name="checkCircle" size={13} />Saved</>}</span>
        <Btn icon="pencil" kind="ghost" onClick={() => setAsk('rename')}>Rename</Btn>
        {d.draft && d.current ? <Btn kind="ghost" onClick={() => setAsk('discard')}>Discard draft</Btn> : null}
        <Btn icon="save" busy={busy === 'save'} disabled={!dirty} onClick={save}>Save draft</Btn>
        <Btn kind="primary" icon="send" disabled={!d.draft && !dirty} onClick={() => setAsk('publish')}>Publish</Btn>
      </Head>
      {problems.length ? (
        <Note tone="red" icon="alert">
          <b>The form cannot be saved yet:</b>
          <ul style={{ margin: '6px 0 0 18px' }}>{problems.slice(0, 10).map((p, i) => <li key={i}><button type="button" className="adm-linkbtn" style={{ color: 'inherit', textAlign: 'left' }} onClick={() => { const at = pathTo(p.path); if (at) setSel(at); }}>{p.message}</button></li>)}</ul>
        </Note>
      ) : null}

      <div className="adm-builder">
        <Outline schema={schema} sel={sel} setSel={setSel} change={change} docTypes={adm.documentTypes || []} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {field ? <FieldEditor key={`${sel.s}-${sel.f}`} schema={schema} s={sel.s} f={sel.f} change={change} setSel={setSel} />
            : sec ? <SectionEditor key={`s-${sel.s}`} schema={schema} s={sel.s} change={change} setSel={setSel} />
              : <Panel><Empty icon="list" title="Add a section to begin" /></Panel>}
          <Versions d={d} onView={view} />
        </div>
        <Preview schema={viewing ? viewing.schema : schema} formId={id} viewing={viewing} onStopViewing={() => setViewing(null)}
          onUseVersion={() => { setSchema(clone(viewing.schema)); setDirty(true); setViewing(null); toast('Loaded into the draft — save to keep it'); }} />
      </div>

      <ConfirmDialog open={ask === 'publish'} onClose={() => setAsk(null)} tone="primary" title="Publish this form?" confirmLabel="Publish" reason reasonLabel="What changed (kept with the version)"
        message={`New applications use it at once. ${adm.settings.applications.draftMigration === 'migrate' ? 'Drafts already started move to it the next time they are opened; answers to removed questions are kept aside.' : 'Drafts already started keep the version they began with.'} Submitted applications keep theirs.`}
        onConfirm={publish} />
      <ConfirmDialog open={ask === 'discard'} onClose={() => setAsk(null)} title="Discard the draft?" confirmLabel="Discard" message="The published version stays as it is." onConfirm={discard} />
      <RenameDialog open={ask === 'rename'} form={form} onClose={() => setAsk(null)} onDone={() => { reload(); adm.reload(); }} />
    </Page>
  );
}

function RenameDialog({ open, form, onClose, onDone }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setName(form.name); setDescription(form.description || ''); } }, [open, form]);
  const go = async () => {
    setBusy(true);
    try { await admin.updateForm(form._id, { name: name.trim(), description: description.trim() }); toast.success('Saved'); onClose(); onDone(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Name and description" width={460}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!name.trim()} onClick={go}>Save</Btn></>}>
      <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} data-text="title" /></Field>
      <Field label="Description" className="adm-mt"><TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} /></Field>
    </Dialog>
  );
}

/* ── The outline: sections, questions, drag and drop ──────────────────────── */

function Outline({ schema, sel, setSel, change, docTypes }) {
  const drag = useRef(null);
  const [over, setOver] = useState(null);
  const [adding, setAdding] = useState(false);
  const moveField = (from, to) => change((x) => {
    const [f] = x.sections[from.s].fields.splice(from.f, 1);
    const target = to.f == null ? x.sections[to.s].fields.length : to.f;
    x.sections[to.s].fields.splice(target, 0, f);
  });
  const drop = (to) => {
    const from = drag.current;
    drag.current = null;
    setOver(null);
    if (!from || (from.s === to.s && from.f === to.f)) return;
    // Within one section, dropping below its own place shifts by one.
    const adj = from.s === to.s && to.f != null && to.f > from.f ? { ...to, f: to.f - 1 } : to;
    moveField(from, adj);
    setSel({ s: adj.s, f: adj.f == null ? schema.sections[adj.s].fields.length - (from.s === adj.s ? 1 : 0) : adj.f });
  };
  const nudge = (s, f, dir) => {
    const sec = schema.sections[s];
    if (f + dir < 0 || f + dir >= sec.fields.length) return;
    change((x) => { const list = x.sections[s].fields; [list[f], list[f + dir]] = [list[f + dir], list[f]]; });
    setSel({ s, f: f + dir });
  };
  const moveSection = (s, dir) => {
    if (s + dir < 0 || s + dir >= schema.sections.length) return;
    change((x) => { [x.sections[s], x.sections[s + dir]] = [x.sections[s + dir], x.sections[s]]; });
    setSel({ s: s + dir, f: null });
  };
  const addSection = () => {
    const used = new Set(schema.sections.map((x) => x.key));
    let n = schema.sections.length + 1;
    while (used.has(`section${n}`)) n += 1;
    change((x) => { x.sections.push({ key: `section${n}`, title: `Section ${n}`, description: '', fields: [], visibleIf: null, classes: [], rounds: [] }); });
    setSel({ s: schema.sections.length, f: null });
  };
  const addField = (type, preset = null) => {
    const s = Math.min(sel.s, schema.sections.length - 1);
    if (s < 0) return;
    const f = preset ? presetField(schema, preset) : newField(schema, type, docTypes);
    const at = sel.f != null ? sel.f + 1 : schema.sections[s].fields.length;
    change((x) => { x.sections[s].fields.splice(at, 0, f); });
    setSel({ s, f: at });
    setAdding(false);
  };
  return (
    <Panel title="Sections and questions" icon="list" pad={false}
      right={<Btn size="sm" kind="ghost" icon="plus" onClick={addSection}>Section</Btn>}>
      <div className="adm-outline" style={{ padding: 8 }}>
        {schema.sections.map((sec, s) => (
          <div key={`${sec.key}-${s}`}
            onDragOver={(e) => { if (drag.current) { e.preventDefault(); if (!sec.fields.length) setOver({ s, f: null }); } }}
            onDrop={(e) => { e.preventDefault(); if (!sec.fields.length) drop({ s, f: null }); }}>
            <div className={`adm-outline__sec ${sel.s === s && sel.f == null ? 'is-on' : ''}`}>
              <button type="button" className="adm-linkbtn" style={{ color: 'inherit', textAlign: 'left', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => setSel({ s, f: null })}>
                {sec.title || 'Untitled section'}{sec.visibleIf || sec.classes?.length || sec.rounds?.length ? ' ◆' : ''}
              </button>
              <span style={{ display: 'inline-flex' }}>
                <IconBtn icon="arrowUp" label="Move section up" disabled={s === 0} onClick={() => moveSection(s, -1)} />
                <IconBtn icon="arrowDown" label="Move section down" disabled={s === schema.sections.length - 1} onClick={() => moveSection(s, 1)} />
              </span>
            </div>
            {sec.fields.map((f, i) => (
              <button key={`${f.key}-${i}`} type="button" draggable
                className={`adm-outline__field ${sel.s === s && sel.f === i ? 'is-on' : ''} ${over && over.s === s && over.f === i ? 'is-over' : ''}`}
                onClick={() => setSel({ s, f: i })}
                onDragStart={(e) => { drag.current = { s, f: i }; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', f.key); } catch { /* old browsers */ } }}
                onDragEnd={() => { drag.current = null; setOver(null); }}
                onDragOver={(e) => { if (drag.current) { e.preventDefault(); setOver({ s, f: i }); } }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop({ s, f: i }); }}
                onKeyDown={(e) => { if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); nudge(s, i, -1); } if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); nudge(s, i, 1); } }}
                title="Drag to reorder (or Alt + ↑ / ↓)">
                <span className="adm-outline__grip" aria-hidden><Ico name="dotsV" size={14} /></span>
                <Ico name={TYPE_ICON[f.type]} size={14} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.label || f.text || f.key}{f.required ? <span className="adm-req">*</span> : null}
                </span>
                <em>{f.visibleIf || f.classes?.length || f.rounds?.length ? '◆ ' : ''}{f.mapTo ? '→ ' : ''}{TYPE_LABEL[f.type]}</em>
              </button>
            ))}
            {!sec.fields.length ? <div className={`adm-muted ${over && over.s === s && over.f == null ? 'adm-outline__field is-over' : ''}`} style={{ fontSize: '.78rem', padding: '6px 10px' }}>No questions — add one, or drop one here.</div> : null}
          </div>
        ))}
        {!schema.sections.length ? <Empty compact icon="list" title="No sections yet" action={<Btn size="sm" kind="primary" onClick={addSection}>Add a section</Btn>} /> : null}
      </div>
      <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
        {adding ? (
          <div className="adm-palette">
            {Object.keys(TYPE_LABEL).map((t) => <button key={t} type="button" onClick={() => addField(t)}><Ico name={TYPE_ICON[t]} size={14} />{TYPE_LABEL[t]}</button>)}
            <div className="adm-palette__head">Ready-made</div>
            {PRESETS.map((p) => <button key={p.id} type="button" onClick={() => addField(null, p)}><Ico name={p.icon} size={14} />{p.label}</button>)}
            <button type="button" onClick={() => setAdding(false)} style={{ gridColumn: '1 / -1', justifyContent: 'center' }}>Cancel</button>
          </div>
        ) : <Btn kind="soft" icon="plus" style={{ width: '100%' }} disabled={!schema.sections.length} onClick={() => setAdding(true)}>Add a question</Btn>}
        <p className="adm-muted" style={{ fontSize: '.72rem', marginTop: 8 }}>◆ shown only sometimes · → copied to the student record</p>
      </div>
    </Panel>
  );
}

/* ── Who sees it: conditions and scope ────────────────────────────────────── */

function ConditionEditor({ value, onChange, earlier, label = 'Show only when' }) {
  const rules = value?.rules || [];
  const mode = value?.mode || 'all';
  const set = (next) => onChange(next.length ? { mode, rules: next } : null);
  const usable = earlier.filter((f) => !['info', 'file'].includes(f.type));
  if (!usable.length) return <p className="adm-muted" style={{ fontSize: '.8rem' }}>A condition can look at questions that come earlier in the form — there are none before this one.</p>;
  return (
    <div className="adm-cond">
      <div className="adm-row" style={{ fontSize: '.84rem' }}>
        <b>{label}</b>
        {rules.length > 1 ? (
          <Select value={mode} onChange={(e) => onChange({ mode: e.target.value, rules })} style={{ width: 'auto', height: 30 }} aria-label="Match">
            <option value="all">all of these hold</option><option value="any">any of these holds</option>
          </Select>
        ) : null}
      </div>
      {rules.map((r, i) => {
        const target = usable.find((f) => f.key === r.field);
        const setRule = (patch) => set(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        const choice = target && CHOICE.includes(target.type);
        return (
          <div key={i} className="adm-cond__row">
            <Select value={r.field} onChange={(e) => setRule({ field: e.target.value, value: '' })} aria-label="Question">
              {usable.map((f) => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
            </Select>
            <Select value={r.op} onChange={(e) => setRule({ op: e.target.value, value: ['in', 'not_in'].includes(e.target.value) ? [] : NO_VALUE.includes(e.target.value) ? null : '' })} aria-label="Comparison">
              {Object.entries(OP_LABEL).filter(([k]) => (['checkbox', 'declaration'].includes(target?.type) ? ['checked', 'not_checked'].includes(k) : !['checked', 'not_checked'].includes(k))).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            {NO_VALUE.includes(r.op) ? <span /> : ['in', 'not_in'].includes(r.op) ? (
              choice ? (
                <Select multiple value={Array.isArray(r.value) ? r.value : []} onChange={(e) => setRule({ value: [...e.target.selectedOptions].map((o) => o.value) })} style={{ height: 64 }} aria-label="Values">
                  {(target.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : <Input value={(Array.isArray(r.value) ? r.value : []).join(', ')} placeholder="Comma separated" onChange={(e) => setRule({ value: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
            ) : choice ? (
              <Select value={r.value ?? ''} onChange={(e) => setRule({ value: e.target.value })} aria-label="Value">
                <option value="">Choose…</option>
                {(target.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            ) : <Input type={target?.type === 'number' ? 'number' : target?.type === 'date' ? 'date' : 'text'} value={r.value ?? ''} onChange={(e) => setRule({ value: e.target.value })} aria-label="Value" />}
            <IconBtn icon="trash" kind="danger" label="Remove condition" onClick={() => set(rules.filter((_, j) => j !== i))} />
          </div>
        );
      })}
      <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => set([...rules, { field: usable[usable.length - 1].key, op: 'eq', value: '' }])}>Add a condition</Btn>
    </div>
  );
}

function ScopeEditor({ item, onChange }) {
  const adm = useAdmission();
  const toggle = (k, id, on) => onChange(k, on ? [...new Set([...(item[k] || []), id])] : (item[k] || []).filter((x) => x !== id));
  return (
    <details>
      <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: '.84rem' }}>
        Only for some classes or rounds{item.classes?.length || item.rounds?.length ? ` — ${[...(item.classes || []).map((c) => adm.className(c)), ...(item.rounds || []).map((r) => adm.roundName(r))].join(', ')}` : ''}
      </summary>
      <div className="adm-grid2 adm-mt">
        <Field label="Classes" hint="None ticked: every class">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflow: 'auto' }}>
            {(adm.classes || []).map((c) => <Check key={c._id} checked={(item.classes || []).includes(String(c._id))} onChange={(on) => toggle('classes', String(c._id), on)}>{c.className}</Check>)}
          </div>
        </Field>
        <Field label="Rounds" hint="None ticked: every round">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflow: 'auto' }}>
            {(adm.rounds || []).map((r) => <Check key={r._id} checked={(item.rounds || []).includes(String(r._id))} onChange={(on) => toggle('rounds', String(r._id), on)}>{r.name}</Check>)}
            {!(adm.rounds || []).length ? <span className="adm-muted">No rounds yet</span> : null}
          </div>
        </Field>
      </div>
    </details>
  );
}

/* ── A section's settings ─────────────────────────────────────────────────── */

function SectionEditor({ schema, s, change, setSel }) {
  const sec = schema.sections[s];
  const earlier = schema.sections.slice(0, s).flatMap((x) => x.fields);
  const set = (k, v) => change((x) => { x.sections[s][k] = v; });
  const [del, setDel] = useState(false);
  return (
    <Panel title="Section" icon="layers" right={<Btn size="sm" kind="ghost" icon="trash" onClick={() => setDel(true)}>Delete section</Btn>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-grid2">
          <Field label="Title" required><Input value={sec.title} onChange={(e) => set('title', e.target.value)} maxLength={80} data-text="title" /></Field>
          <Field label="Key" hint="Letters, digits and _"><Input value={sec.key} onChange={(e) => set('key', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} maxLength={40} invalid={!KEY_RE.test(sec.key)} /></Field>
        </div>
        <Field label="Description" hint="Shown under the title"><TextArea rows={2} value={sec.description || ''} onChange={(e) => set('description', e.target.value)} maxLength={600} /></Field>
        <ConditionEditor value={sec.visibleIf} onChange={(v) => set('visibleIf', v)} earlier={earlier} label="Show this section only when" />
        <ScopeEditor item={sec} onChange={(k, v) => set(k, v)} />
        <p className="adm-muted" style={{ fontSize: '.8rem' }}>{sec.fields.length} question(s). A section with no question that applies is skipped.</p>
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} title={`Delete “${sec.title}”?`} confirmLabel="Delete section"
        message={`Its ${sec.fields.length} question(s) go too. Answers already given stay with the applications.`}
        onConfirm={() => { change((x) => { x.sections.splice(s, 1); }); setSel({ s: Math.max(0, s - 1), f: null }); }} />
    </Panel>
  );
}

/* ── A question's settings ────────────────────────────────────────────────── */

function FieldEditor({ schema, s, f, change, setSel }) {
  const adm = useAdmission();
  const field = schema.sections[s].fields[f];
  const all = schema.sections.flatMap((x) => x.fields);
  const earlier = [...schema.sections.slice(0, s).flatMap((x) => x.fields), ...schema.sections[s].fields.slice(0, f)];
  const set = (k, v) => change((x) => { x.sections[s].fields[f][k] = v; });
  const setV = (k, v) => change((x) => { const t = x.sections[s].fields[f]; t.validation = { ...(t.validation || {}), [k]: v }; });
  const keyClash = all.filter((x) => x.key === field.key).length > 1;
  const usedTargets = new Set(all.filter((x) => x !== field && x.mapTo).map((x) => x.mapTo));
  const changeType = (type) => change((x) => {
    const old = x.sections[s].fields[f];
    const fresh = newField(schema, type, adm.documentTypes || []);
    x.sections[s].fields[f] = { ...fresh, key: old.key, label: old.label || fresh.label, help: old.help, required: old.required, visibleIf: old.visibleIf, classes: old.classes, rounds: old.rounds, sensitive: old.sensitive, ...(CHOICE.includes(type) && old.options ? { options: old.options } : {}) };
  });
  const [del, setDel] = useState(false);
  const duplicate = () => {
    const copy = { ...clone(field), key: uniqueKey(schema, field.key.replace(/\d+$/, '')), mapTo: undefined };
    change((x) => { x.sections[s].fields.splice(f + 1, 0, copy); });
    setSel({ s, f: f + 1 });
  };
  const opts = field.options || [];
  const setOpt = (i, patch) => set('options', opts.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const input = !['info', 'file'].includes(field.type);
  const dateBound = (k) => {
    const v = field.validation?.[k];
    return (
      <div className="adm-row" style={{ flexWrap: 'nowrap' }}>
        <Select value={v === 'today' ? 'today' : v ? 'date' : ''} style={{ width: 130 }} onChange={(e) => setV(k, e.target.value === 'today' ? 'today' : e.target.value === 'date' ? new Date().toISOString().slice(0, 10) : null)} aria-label={k}>
          <option value="">No limit</option><option value="today">Today</option><option value="date">A date</option>
        </Select>
        {v && v !== 'today' ? <Input type="date" value={v} onChange={(e) => setV(k, e.target.value || null)} /> : null}
      </div>
    );
  };
  return (
    <Panel title={TYPE_LABEL[field.type]} icon={TYPE_ICON[field.type]}
      right={<><IconBtn icon="copy" label="Duplicate" onClick={duplicate} /><IconBtn icon="trash" kind="danger" label="Delete" onClick={() => setDel(true)} /></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-grid2">
          <Field label={field.type === 'info' ? 'Heading (optional)' : 'Question'} required={field.type !== 'info'}>
            <Input value={field.label} onChange={(e) => set('label', e.target.value)} maxLength={160} />
          </Field>
          <Field label="Answer type">
            <Select value={field.type} onChange={(e) => changeType(e.target.value)}>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Key" hint="Unique in the form. Changing it on a published form starts a new question." error={keyClash ? 'Another question uses this key' : !KEY_RE.test(field.key) ? 'A letter, then letters, digits or _' : null}>
            <Input value={field.key} onChange={(e) => set('key', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} maxLength={40} invalid={keyClash || !KEY_RE.test(field.key)} />
          </Field>
          <Field label="Width"><Select value={field.width || 'full'} onChange={(e) => set('width', e.target.value)}><option value="full">Full line</option><option value="half">Half line</option></Select></Field>
        </div>
        {input ? (
          <div className="adm-grid2">
            <Field label="Help text" hint="Shown under the box"><Input value={field.help || ''} onChange={(e) => set('help', e.target.value)} maxLength={300} /></Field>
            {['text', 'textarea', 'number', 'email', 'phone'].includes(field.type) ? <Field label="Placeholder"><Input value={field.placeholder || ''} onChange={(e) => set('placeholder', e.target.value)} maxLength={120} /></Field> : <span />}
          </div>
        ) : null}
        {['declaration', 'info'].includes(field.type) ? (
          <Field label={field.type === 'declaration' ? 'What the family agrees to' : 'Text'} required={field.type === 'declaration'}>
            <TextArea rows={4} value={field.text || ''} onChange={(e) => set('text', e.target.value)} maxLength={3000} />
          </Field>
        ) : null}
        {field.type === 'file' ? (
          <Field label="Document type" required hint="Formats, size and review come from the document type (Documents → Document types).">
            <Select value={field.docType || ''} onChange={(e) => set('docType', e.target.value)}>
              <option value="">Choose…</option>
              {(adm.documentTypes || []).map((t) => <option key={t.key} value={t.key} disabled={t.isActive === false}>{t.name}{t.isActive === false ? ' (off)' : ''}</option>)}
            </Select>
          </Field>
        ) : null}
        {CHOICE.includes(field.type) ? (
          <Field label="Options" hint="The value is stored; the label is shown. Values use letters, digits, spaces and . , & ' ( ) / + - _">
            <div className="adm-opts">
              {opts.map((o, i) => (
                <div key={i} className="adm-opts__row">
                  <Input value={o.label} placeholder="Label" maxLength={120} onChange={(e) => setOpt(i, { label: e.target.value, ...(o.value === o.label || !o.value ? { value: e.target.value.replace(/[^A-Za-z0-9 _.,&'()/+-]/g, '').slice(0, 60) } : {}) })} />
                  <Input value={o.value} placeholder="Value" maxLength={60} style={{ width: 150 }} onChange={(e) => setOpt(i, { value: e.target.value })} />
                  <IconBtn icon="arrowUp" label="Up" disabled={i === 0} onClick={() => { const n = [...opts]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set('options', n); }} />
                  <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => set('options', opts.filter((_, j) => j !== i))} />
                </div>
              ))}
              <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => set('options', [...opts, { value: `Option ${opts.length + 1}`, label: `Option ${opts.length + 1}` }])}>Add an option</Btn>
            </div>
          </Field>
        ) : null}

        <div className="adm-grid2">
          {field.type !== 'info' ? <Toggle checked={!!field.required} onChange={(v) => set('required', v)} label="Required" sub={field.type === 'file' ? 'Must be uploaded to submit' : 'Must be answered to submit'} /> : null}
          {input ? <Toggle checked={!!field.sensitive} onChange={(v) => set('sensitive', v)} label="Sensitive" sub="Hidden from staff who are not admission administrators" /> : null}
        </div>

        {['text', 'textarea'].includes(field.type) ? (
          <div className="adm-grid3">
            <Field label="Kind of text" hint="Decides what can be typed"><Select value={field.validation?.kind || 'text'} onChange={(e) => setV('kind', e.target.value)}>{(adm.catalogs?.textKinds || ['text']).map((k) => <option key={k} value={k}>{k}</option>)}</Select></Field>
            <Field label="Fewest characters"><Input type="number" min="0" step="1" value={field.validation?.minLength ?? 0} onChange={(e) => setV('minLength', Number(e.target.value) || 0)} /></Field>
            <Field label="Most characters"><Input type="number" min="1" step="1" value={field.validation?.maxLength ?? ''} onChange={(e) => setV('maxLength', Number(e.target.value) || undefined)} /></Field>
          </div>
        ) : null}
        {field.type === 'number' ? (
          <div className="adm-grid3">
            <Field label="Lowest"><Input type="number" step="any" value={field.validation?.min ?? ''} onChange={(e) => setV('min', e.target.value === '' ? null : Number(e.target.value))} /></Field>
            <Field label="Highest"><Input type="number" step="any" value={field.validation?.max ?? ''} onChange={(e) => setV('max', e.target.value === '' ? null : Number(e.target.value))} /></Field>
            <Toggle checked={!!field.validation?.integer} onChange={(v) => setV('integer', v)} label="Whole numbers only" />
          </div>
        ) : null}
        {field.type === 'multiselect' ? (
          <div className="adm-grid2">
            <Field label="Choose at least"><Input type="number" min="0" step="1" value={field.validation?.min ?? 0} onChange={(e) => setV('min', Number(e.target.value) || 0)} /></Field>
            <Field label="Choose at most" hint="0: no limit"><Input type="number" min="0" step="1" value={field.validation?.max ?? 0} onChange={(e) => setV('max', Number(e.target.value) || 0)} /></Field>
          </div>
        ) : null}
        {field.type === 'date' ? (
          <div className="adm-grid2">
            <Field label="Earliest date">{dateBound('minDate')}</Field>
            <Field label="Latest date">{dateBound('maxDate')}</Field>
          </div>
        ) : null}

        {input ? (
          <Field label="Copy to the student record" hint="When the applicant is enrolled, this answer fills the chosen field of the student's record.">
            <Select value={field.mapTo || ''} onChange={(e) => set('mapTo', e.target.value || undefined)}>
              <option value="">Do not copy</option>
              {(adm.catalogs?.mapTargets || []).map((m) => <option key={m.key} value={m.key} disabled={usedTargets.has(m.key)}>{m.label}{usedTargets.has(m.key) ? ' (used)' : ''}</option>)}
            </Select>
          </Field>
        ) : null}
        <ConditionEditor value={field.visibleIf} onChange={(v) => set('visibleIf', v)} earlier={earlier} />
        <ScopeEditor item={field} onChange={(k, v) => set(k, v)} />
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} title="Delete this question?" confirmLabel="Delete"
        message="Answers already given stay with the applications; new ones are not asked for."
        onConfirm={() => { change((x) => { x.sections[s].fields.splice(f, 1); }); setSel({ s, f: f > 0 ? f - 1 : null }); }} />
    </Panel>
  );
}

/* ── Versions ─────────────────────────────────────────────────────────────── */

function Versions({ d, onView }) {
  if (!d.versions?.length) return null;
  return (
    <Panel title="Versions" icon="history">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {d.versions.map((v) => (
          <div key={v._id} className="adm-row adm-row--between" style={{ fontSize: '.86rem', flexWrap: 'nowrap' }}>
            <span style={{ minWidth: 0 }}>
              <b>Version {v.version}</b> <Chip tone={v.status === 'published' ? 'green' : v.status === 'draft' ? 'amber' : 'gray'}>{v.status}</Chip>
              <span className="adm-muted"> {v.publishedAt ? fmtDateTime(v.publishedAt) : fmtDateTime(v.updatedAt)}{v.changeNote ? ` — ${v.changeNote}` : ''}</span>
            </span>
            {v.status !== 'draft' ? <Btn size="sm" kind="ghost" icon="eye" onClick={() => onView(v)}>View</Btn> : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ── The live preview ─────────────────────────────────────────────────────── */

function Preview({ schema, formId, viewing, onStopViewing, onUseVersion }) {
  const adm = useAdmission();
  const [values, setValues] = useState({});
  const [round, setRound] = useState('');
  const [cls, setCls] = useState('');
  const [files, setFiles] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('form');
  const types = useMemo(() => Object.fromEntries((adm.documentTypes || []).map((t) => [t.key, t])), [adm.documentTypes]);
  const errors = result?.errors || {};
  const test = async () => {
    setBusy(true);
    try {
      const r = await admin.testForm(formId, { schema: viewing ? undefined : schema, answers: savable(schema, values), classId: cls || undefined, roundId: round || undefined, uploaded: Object.keys(files) });
      setResult(r.data);
      setTab('result');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Panel className="adm-builder__preview" title={viewing ? `Version ${viewing.version} (read only)` : 'Preview'} icon="eye"
      right={viewing ? <><Btn size="sm" onClick={onUseVersion}>Use as the draft</Btn><Btn size="sm" kind="ghost" onClick={onStopViewing}>Back</Btn></> : <Btn size="sm" kind="soft" icon="checkCircle" busy={busy} onClick={test}>Check with the server</Btn>}>
      <div className="adm-row" style={{ marginBottom: 10 }}>
        <Select value={round} onChange={(e) => setRound(e.target.value)} style={{ width: 'auto' }} aria-label="As for round">
          <option value="">Any round</option>
          {(adm.rounds || []).map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
        </Select>
        <Select value={cls} onChange={(e) => setCls(e.target.value)} style={{ width: 'auto' }} aria-label="As for class">
          <option value="">Any class</option>
          {(adm.classes || []).map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}
        </Select>
        <Btn size="sm" kind="ghost" onClick={() => { setValues({}); setFiles({}); setResult(null); }}>Clear answers</Btn>
      </div>
      {result ? <Tabs variant="solid" size="sm" value={tab} onChange={setTab} items={[{ key: 'form', label: 'Form' }, { key: 'result', label: `Server check${Object.keys(errors).length ? ` (${Object.keys(errors).length})` : ''}` }]} /> : null}
      {tab === 'result' && result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {Object.keys(errors).length ? (
            <Note tone="amber" icon="alert"><b>A real submission would be refused:</b><ul style={{ margin: '6px 0 0 18px' }}>{Object.values(errors).map((m, i) => <li key={i}>{m}</li>)}</ul></Note>
          ) : <Note tone="green" icon="checkCircle">These answers would be accepted.</Note>}
          {(result.missingDocs || []).length ? <Note tone="amber" icon="upload">Documents still needed: {result.missingDocs.join(', ')}</Note> : null}
          <KV cols={1} items={[
            ['Questions that apply', String(result.applicable.length)],
            ['Student', result.summary?.studentName], ['Date of birth', result.summary?.studentDob ? String(result.summary.studentDob).slice(0, 10) : ''],
            ['Contact', [result.summary?.guardianName, result.summary?.guardianPhone, result.summary?.guardianEmail].filter(Boolean).join(' · ')],
          ]} />
        </div>
      ) : (
        <div style={{ marginTop: 10, maxHeight: 'calc(100vh - 280px)', overflow: 'auto', paddingRight: 4 }}>
          <FormRenderer schema={schema} values={values} onChange={(k, v) => setValues((x) => ({ ...x, [k]: v }))} errors={errors}
            scope={{ classId: cls || null, roundId: round || null }} showSensitiveMark
            docs={{ byKey: files, types, onUpload: (key, file) => setFiles((x) => ({ ...x, [key]: { originalName: file.name, size: file.size, status: 'uploaded' } })), onRemove: (file) => setFiles((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== file))) }} />
          <p className="adm-muted" style={{ fontSize: '.74rem', marginTop: 10 }}>Uploads here are pretend — nothing is stored.</p>
        </div>
      )}
    </Panel>
  );
}
