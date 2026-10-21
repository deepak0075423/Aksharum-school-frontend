/**
 * What the admission office screens share: the school's admission setup
 * (loaded once for the whole area from /admin/bootstrap), filters kept in the
 * URL, the pickers every list uses, and the dialogs more than one screen opens
 * — moving an application along the workflow, and reviewing a document.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin, openProtected } from '../../../api/admission.api';
import { useLoad, Spin, ErrorBox, Dialog, Btn, Field, Select, TextArea, Note, Check } from '../admUI';
import { STATUS, errMsg } from '../meta';

/* ── The admission setup, once for the area ───────────────────────────────── */

const AdmissionCtx = createContext(null);

export function AdmissionProvider({ children }) {
  const boot = useLoad(() => admin.bootstrap(), []);
  const value = useMemo(() => {
    const d = boot.data;
    if (!d) return null;
    const byId = (list) => new Map((list || []).map((x) => [String(x._id), x]));
    const classes = byId(d.classes);
    const rounds = byId(d.rounds);
    const years = byId(d.academicYears);
    const staff = byId(d.staff);
    const statuses = new Map((d.catalogs?.statuses || []).map((s) => [s.key, s]));
    return {
      ...d,
      reload: boot.reload,
      className: (id) => classes.get(String(id))?.className || '',
      roundName: (id) => rounds.get(String(id))?.name || '',
      yearName: (id) => years.get(String(id))?.yearName || '',
      staffName: (id) => staff.get(String(id))?.name || '',
      roundOf: (id) => rounds.get(String(id)) || null,
      statusOf: (k) => statuses.get(k) || { key: k, ...(STATUS[k] || { label: k, tone: 'gray' }) },
      currentYear: (d.academicYears || []).find((y) => y.status === 'active') || null,
    };
  }, [boot.data, boot.reload]);
  if (boot.loading && !boot.data) return <Spin label="Loading admissions…" />;
  if (boot.error && !boot.data) return <ErrorBox error={boot.error} onRetry={boot.reload} />;
  return <AdmissionCtx.Provider value={value}>{children}</AdmissionCtx.Provider>;
}

export const useAdmission = () => useContext(AdmissionCtx);

/* ── Filters in the URL ───────────────────────────────────────────────────── */

/**
 * A screen's query — tab, page, search, filters — kept in the address, so a
 * reload, the back button or a link from the dashboard lands on the same view.
 */
export function useQueryState(defaults = {}) {
  const [params, setParams] = useSearchParams();
  const query = {};
  for (const k of new Set([...Object.keys(defaults), ...params.keys()])) query[k] = params.get(k) ?? defaults[k] ?? '';
  const set = useCallback((patch, { keepPage } = {}) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === '' || v === null || v === undefined || v === defaults[k]) next.delete(k); else next.set(k, String(v));
      }
      if (!keepPage && !('page' in patch)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]); // eslint-disable-line react-hooks/exhaustive-deps
  return [query, set];
}

/** A search box's text, sent on after a pause in typing. */
export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/* ── Pickers ──────────────────────────────────────────────────────────────── */

export function RoundSelect({ value, onChange, all = 'All rounds', className, disabled }) {
  const adm = useAdmission();
  return (
    <Select value={value || ''} onChange={(e) => onChange(e.target.value)} className={className} disabled={disabled} aria-label="Round">
      {all !== false ? <option value="">{all}</option> : null}
      {(adm.rounds || []).map((r) => <option key={r._id} value={r._id}>{r.name}{r.status !== 'open' ? ` (${r.status})` : ''}</option>)}
    </Select>
  );
}

/** Classes — of one round when `round` is given. */
export function ClassSelect({ value, onChange, round, all = 'All classes', className, disabled }) {
  const adm = useAdmission();
  const r = round ? adm.roundOf(round) : null;
  const ids = r ? new Set((r.classes || []).map((c) => String(c.class))) : null;
  const list = (adm.classes || []).filter((c) => !ids || ids.has(String(c._id)));
  return (
    <Select value={value || ''} onChange={(e) => onChange(e.target.value)} className={className} disabled={disabled} aria-label="Class">
      {all !== false ? <option value="">{all}</option> : null}
      {list.map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}
    </Select>
  );
}

export function YearSelect({ value, onChange, all = 'All years', className }) {
  const adm = useAdmission();
  return (
    <Select value={value || ''} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Academic year">
      {all !== false ? <option value="">{all}</option> : null}
      {(adm.academicYears || []).map((y) => <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (current)' : ''}</option>)}
    </Select>
  );
}

export function StaffSelect({ value, onChange, placeholder = 'Choose staff', none, className, ariaLabel = 'Staff member' }) {
  const adm = useAdmission();
  return (
    <Select value={value || ''} onChange={(e) => onChange(e.target.value)} className={className} aria-label={ariaLabel}>
      <option value="">{placeholder}</option>
      {none ? <option value="none">{none}</option> : null}
      {(adm.staff || []).map((s) => <option key={s._id} value={s._id}>{s.name}{s.designation ? ` — ${s.designation}` : s.role === 'school_admin' ? ' — Admin' : ''}</option>)}
    </Select>
  );
}

export function StatusSelect({ value, onChange, all = 'All statuses', className }) {
  const adm = useAdmission();
  return (
    <Select value={value || ''} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Status">
      {all !== false ? <option value="">{all}</option> : null}
      {/* A dashboard tile can ask for several statuses at once ("under verification"). */}
      {String(value || '').includes(',') ? <option value={value}>{String(value).split(',').map((k) => adm.statusOf(k).label).join(', ')}</option> : null}
      {(adm.catalogs?.statuses || []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
    </Select>
  );
}

/** Several staff members, as ticks. */
export function StaffChecks({ value = [], onChange, max = 8 }) {
  const adm = useAdmission();
  const set = new Set((value || []).map(String));
  const list = adm.staff || [];
  if (!list.length) return <span className="adm-muted">No active staff found.</span>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, maxHeight: 180, overflow: 'auto', padding: 2 }}>
      {list.map((s) => (
        <Check key={s._id} checked={set.has(String(s._id))} disabled={!set.has(String(s._id)) && set.size >= max}
          onChange={(on) => onChange(on ? [...set, String(s._id)] : [...set].filter((x) => x !== String(s._id)))}>
          {s.name}{s.designation ? <span className="adm-muted"> · {s.designation}</span> : null}
        </Check>
      ))}
    </div>
  );
}

/* ── Files ────────────────────────────────────────────────────────────────── */

/** Open a private file (a document, a PDF the server builds) in a new tab. */
export const openFile = (url, opts) => openProtected(url, opts).catch((e) => toast.error(e.message));

/* ── Moving an application ────────────────────────────────────────────────── */

// The moves the family is told the reason for (services/admission/applications REASON_STATUSES).
export const REASON_STATUSES = ['rejected', 'ineligible', 'cancelled', 'withdrawn', 'incomplete', 'documents_pending'];

/**
 * Move an application to another status. `moves` is the server's list
 * (workflow.moves: { status, label, ok, needsApproval, reason }); only the
 * allowed ones are offered, the others are listed with why not.
 */
export function MoveDialog({ open, onClose, app, moves = [], initial = '', onDone, transition, canReopen }) {
  const adm = useAdmission();
  const ok = moves.filter((m) => m.ok);
  const [to, setTo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [note, setNote] = useState('');
  const [reopen, setReopen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setTo(initial || ''); setRemarks(''); setNote(''); setReopen(false); }
  }, [open, initial]);
  const pick = ok.find((m) => m.status === to);
  const needReason = REASON_STATUSES.includes(to);
  const closed = adm?.statusOf(app?.status)?.closed;
  const go = async () => {
    setBusy(true);
    try {
      const r = await transition(app._id, { to, remarks: remarks.trim(), note: note.trim(), reopen });
      toast.success(r.message || 'Done');
      onClose();
      onDone?.(r.data);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const blocked = moves.filter((m) => !m.ok && m.reason);
  return (
    <Dialog open={open} onClose={onClose} title="Change the application's status" width={560}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!to || (needReason && !remarks.trim())} onClick={go}>{pick?.needsApproval ? 'Send for approval' : 'Move'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {closed && canReopen ? (
          <Note tone="amber" icon="alert">
            This application is closed ({adm.statusOf(app.status).label}). An administrator can reopen it.
            <div className="adm-mt"><Check checked={reopen} onChange={setReopen}>Reopen it (back to review)</Check></div>
          </Note>
        ) : null}
        <Field label="Move to" required>
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose a status</option>
            {(reopen ? moves.filter((m) => m.status === 'under_review') : ok).map((m) => <option key={m.status} value={m.status}>{m.label}{m.needsApproval ? ' — needs approval' : ''}</option>)}
          </Select>
        </Field>
        {pick?.needsApproval ? <Note tone="indigo" icon="shieldCheck">This move needs an administrator's approval. It will wait on the application until someone approves it.</Note> : null}
        <Field label="Message to the family" required={needReason} hint={needReason ? 'Required — the family is told why.' : 'Optional. Added to the update the family sees and the email they get.'}>
          <TextArea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} />
        </Field>
        <Field label="Internal note" hint="Seen by staff only.">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        {blocked.length ? (
          <details>
            <summary className="adm-muted" style={{ cursor: 'pointer', fontSize: '.82rem' }}>Why some statuses are not offered ({blocked.length})</summary>
            <ul style={{ margin: '8px 0 0 18px', fontSize: '.8rem' }} className="adm-muted">
              {blocked.slice(0, 20).map((m) => <li key={m.status}><b>{m.label}</b>: {m.reason}</li>)}
            </ul>
          </details>
        ) : null}
      </div>
    </Dialog>
  );
}

/* ── Reviewing a document ─────────────────────────────────────────────────── */

const DECISIONS = [
  { key: 'verify', label: 'Verify', tone: 'success' },
  { key: 'resubmit', label: 'Ask to upload again', tone: 'primary' },
  { key: 'reject', label: 'Reject', tone: 'danger' },
];

/**
 * Verify, reject or ask for a new copy. A rejection always says why — the
 * family sees the reason. `review(docId, body)` is the admin or staff call.
 */
export function ReviewDialog({ open, onClose, doc, reasons = [], initial = 'verify', review, onDone }) {
  const [decision, setDecision] = useState(initial);
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDecision(initial); setReason(''); setCustom(''); setNote(''); } }, [open, initial]);
  const why = reason === '__other' || !reasons.length ? custom.trim() : reason;
  const go = async () => {
    setBusy(true);
    try {
      await review(doc._id, { decision, reason: decision === 'verify' ? '' : why, note: note.trim() });
      toast.success(decision === 'verify' ? 'Document verified' : 'The family has been told');
      onClose();
      onDone?.();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={`Review — ${doc?.typeName || doc?.name || doc?.docKey || 'document'}`} width={500}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind={DECISIONS.find((d) => d.key === decision)?.tone} busy={busy} disabled={decision !== 'verify' && !why} onClick={go}>{DECISIONS.find((d) => d.key === decision)?.label}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="adm-choices" role="radiogroup" aria-label="Decision">
          {DECISIONS.map((d) => (
            <label key={d.key} className={`adm-choice ${decision === d.key ? 'is-on' : ''}`}>
              <input type="radio" name="decision" checked={decision === d.key} onChange={() => setDecision(d.key)} />{d.label}
            </label>
          ))}
        </div>
        {doc ? <Btn kind="soft" size="sm" icon="eye" onClick={() => openFile(doc.fileUrl)} style={{ alignSelf: 'flex-start' }}>Open the file</Btn> : null}
        {decision !== 'verify' ? (
          <>
            {reasons.length ? (
              <Field label="Reason" required>
                <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Choose a reason</option>
                  {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
                  <option value="__other">Another reason…</option>
                </Select>
              </Field>
            ) : null}
            {(!reasons.length || reason === '__other') ? (
              <Field label={reasons.length ? 'Write the reason' : 'Reason'} required hint="The family sees this.">
                <TextArea rows={2} value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={300} />
              </Field>
            ) : null}
          </>
        ) : null}
        <Field label="Internal note" hint="Optional — kept in the document's history.">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
      </div>
    </Dialog>
  );
}

/** A tiny bar chart row: label, bar, number. */
export function BarRow({ label, n, max, tone = 'indigo', sub }) {
  const pct = max > 0 ? Math.max(2, Math.round((n / max) * 100)) : 0;
  return (
    <div className="adm-funnel__row">
      <span title={label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}{sub ? <em className="adm-muted" style={{ fontStyle: 'normal' }}> · {sub}</em> : null}</span>
      <span className={`adm-funnel__bar adm-tb-${tone}`} style={{ width: `${pct}%`, background: undefined }} />
      <span className="adm-funnel__n">{Number(n || 0).toLocaleString('en-IN')}</span>
    </div>
  );
}
