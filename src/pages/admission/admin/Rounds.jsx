/**
 * Admission rounds — a year's intake, its classes and seats, fees, dates,
 * the form each class uses and its eligibility. A round is drafted, opened to
 * applicants, closed, and finally archived.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import {
  Page, Head, Panel, Btn, Chip, Table, Empty, ErrorBox, Spin, Dialog, ConfirmDialog, Field, Input, TextArea, Select, Toggle, IconBtn, Meter, Note, useLoad,
} from '../admUI';
import { fmtDate, fmtDateTime, errMsg, money, toLocalInput, toDateInput } from '../meta';
import { useAdmission } from './parts';

const STATUS = { draft: ['Draft', 'gray'], open: ['Open', 'green'], closed: ['Closed', 'amber'], archived: ['Archived', 'gray'] };
const TYPES = { regular: 'Regular intake', lateral: 'Lateral entry', mid_year: 'Mid-year', special: 'Special' };

export default function Rounds() {
  const adm = useAdmission();
  const { data, loading, error, reload } = useLoad(() => admin.rounds(), []);
  const [edit, setEdit] = useState(null);
  const [ask, setAsk] = useState(null);   // { round, to } | { round, del: true }
  const refresh = () => { reload(); adm.reload(); };
  const setStatus = async (round, to) => {
    try { await admin.roundStatus(round._id, to); toast.success(`Round ${to === 'open' ? 'opened' : to}`); refresh(); } catch (e) { toast.error(errMsg(e)); throw e; }
  };
  return (
    <Page>
      <Head eyebrow="Admissions" title="Admission rounds" subtitle="Each round is one intake: its classes, seats, fees and dates.">
        <Btn kind="primary" icon="plus" onClick={() => setEdit({})}>New round</Btn>
      </Head>
      {adm.settings.portal.status !== 'open' && (data || []).some((r) => r.status === 'open') ? <Note tone="amber" icon="alert">A round is open, but the portal itself is {adm.settings.portal.status} — families cannot apply until the portal is opened in Settings.</Note> : null}
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : !(data || []).length ? (
        <Panel><Empty icon="calendar" title="No rounds yet" action={<Btn kind="primary" onClick={() => setEdit({})}>Create the first round</Btn>}>A round names the academic year, the classes taking admissions and how many seats each has.</Empty></Panel>
      ) : data.map((r) => {
        const seatMap = new Map((r.seats || []).map((s) => [s.class, s]));
        return (
          <Panel key={r._id} title={r.name} icon="calendar"
            sub={`${adm.yearName(r.academicYear)} · ${TYPES[r.type] || r.type}${r.campus ? ` · ${r.campus}` : ''} · ${r.opensAt ? `${fmtDate(r.opensAt)} to ${fmtDate(r.closesAt)}` : 'no dates set'}`}
            right={<>
              <Chip tone={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0]}</Chip>
              {r.status !== 'open' && r.status !== 'archived' ? <Btn size="sm" kind="success" onClick={() => setAsk({ round: r, to: 'open' })}>Open</Btn> : null}
              {r.status === 'open' ? <Btn size="sm" onClick={() => setAsk({ round: r, to: 'closed' })}>Close</Btn> : null}
              {r.status === 'closed' ? <Btn size="sm" kind="ghost" onClick={() => setAsk({ round: r, to: 'archived' })}>Archive</Btn> : null}
              <IconBtn icon="pencil" label="Edit" onClick={() => setEdit(r)} />
              {!r.counts.total ? <IconBtn icon="trash" kind="danger" label="Delete" onClick={() => setAsk({ round: r, del: true })} /> : null}
            </>}
            pad={false}>
            <Table dense rows={r.classes || []} rowKey={(c) => c.class}
              empty={<Empty compact icon="building" title="No classes in this round" />}
              columns={[
                { key: 'c', label: 'Class', render: (c) => <><b>{adm.className(c.class)}</b>{c.isOpen === false ? <> <Chip tone="gray">Not taking applications</Chip></> : null}</> },
                { key: 's', label: 'Seats', align: 'right', render: (c) => (c.seats ? c.seats : 'No limit') },
                { key: 'h', label: 'Held', width: '22%', render: (c) => { const s = seatMap.get(String(c.class)); return s ? <div className="adm-row" style={{ gap: 6, flexWrap: 'nowrap' }}><span>{s.taken}</span>{s.capacity ? <Meter value={s.taken} total={s.capacity} tone={s.taken >= s.capacity ? 'red' : 'green'} /> : null}</div> : '—'; } },
                { key: 'af', label: 'Application fee', align: 'right', render: (c) => money(c.applicationFee ?? r.applicationFee) },
                { key: 'df', label: 'Admission fee', align: 'right', render: (c) => money(c.admissionFee ?? r.admissionFee) },
                { key: 'e', label: 'Eligibility', render: (c) => <span className="adm-muted" style={{ fontSize: '.8rem' }}>{eligibilityText(c.eligibility)}</span> },
                { key: 'q', label: 'Quotas', render: (c) => { const s = seatMap.get(String(c.class)); return s?.pools ? <div className="adm-row" style={{ gap: 4 }}>{s.pools.map((p) => <Chip key={p.quota || 'g'} tone={p.available === 0 ? 'amber' : 'gray'} title={p.quota ? `${p.reserved} set aside${p.released ? `, ${p.released} released` : ''}` : 'What the quotas leave'}>{p.name} {p.taken}/{p.capacity || '∞'}</Chip>)}</div> : <span className="adm-muted">—</span>; } },
              ]} />
            <div className="adm-row" style={{ padding: '10px 18px', fontSize: '.84rem' }}>
              <Chip tone="indigo">{r.counts.total} started</Chip><Chip tone="blue">{r.counts.submitted} submitted</Chip><Chip tone="green">{r.counts.confirmed} confirmed</Chip>
              {r.documentDeadline ? <span className="adm-muted">Documents by {fmtDateTime(r.documentDeadline)}</span> : null}
            </div>
          </Panel>
        );
      })}
      <RoundDialog open={!!edit} row={edit?._id ? edit : null} onClose={() => setEdit(null)} onDone={refresh} />
      <ConfirmDialog open={!!ask && !ask.del} onClose={() => setAsk(null)} tone={ask?.to === 'open' ? 'success' : 'primary'}
        title={ask ? `${ask.to === 'open' ? 'Open' : ask.to === 'closed' ? 'Close' : 'Archive'} ${ask.round.name}?` : ''}
        message={ask?.to === 'open' ? 'Families can start applications for its classes on the portal.' : ask?.to === 'closed' ? 'No new applications or submissions. Work on submitted applications carries on.' : 'The round is kept for the record and hidden from the lists.'}
        confirmLabel={ask?.to === 'open' ? 'Open round' : ask?.to === 'closed' ? 'Close round' : 'Archive'} onConfirm={() => setStatus(ask.round, ask.to)} />
      <ConfirmDialog open={!!ask?.del} onClose={() => setAsk(null)} title={`Delete ${ask?.round?.name || ''}?`} confirmLabel="Delete"
        onConfirm={async () => { try { await admin.deleteRound(ask.round._id); toast.success('Round deleted'); refresh(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </Page>
  );
}

function eligibilityText(e = {}) {
  const parts = [];
  if (e.minAgeYears != null || e.maxAgeYears != null) parts.push(`age ${e.minAgeYears ?? 0}–${e.maxAgeYears ?? '…'}${e.ageOn ? ` on ${fmtDate(e.ageOn)}` : ''}`);
  if (e.dobFrom || e.dobTo) parts.push(`born ${e.dobFrom ? `from ${fmtDate(e.dobFrom)}` : ''}${e.dobTo ? ` to ${fmtDate(e.dobTo)}` : ''}`);
  if (e.notes) parts.push(e.notes);
  return parts.join(' · ') || '—';
}

const blankClass = () => ({ class: '', seats: 0, applicationFee: '', admissionFee: '', form: '', isOpen: true, quotas: [], eligibility: { ageOn: '', minAgeYears: '', maxAgeYears: '', dobFrom: '', dobTo: '', notes: '' } });

const QUOTA_KINDS = { rte: 'RTE 25% (EWS / DG)', staff: 'Staff ward', sibling: 'Sibling', management: 'Management', sports: 'Sports', other: 'Other' };
const CLAIM_OPS = [['eq', 'is'], ['neq', 'is not'], ['checked', 'is ticked'], ['filled', 'is answered']];

/** The questions a form asks — what a quota's claim can read. */
function useFormQuestions(formId) {
  const [fields, setFields] = useState([]);
  useEffect(() => {
    if (!formId) { setFields([]); return; }
    admin.form(formId).then((r) => setFields((r.data?.current?.schema?.sections || []).flatMap((sec) => (sec.fields || []).filter((x) => !['info', 'file'].includes(x.type))))).catch(() => setFields([]));
  }, [formId]);
  return fields;
}

/** Seats set aside within one class — quotas (services/admission/quotas.js). */
function QuotaEditor({ quotas = [], onChange, formId, classSeats }) {
  const fields = useFormQuestions(formId);
  const setQ = (i, patch) => onChange(quotas.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const reserved = quotas.reduce((s, q) => s + (Number(q.seats) || 0), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {quotas.map((q, i) => {
        const f = fields.find((x) => x.key === q.claim?.field);
        const choices = Array.isArray(f?.options) ? f.options.map((o) => (typeof o === 'string' ? o : o.value)) : null;
        return (
          <div key={i} style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="adm-row" style={{ flexWrap: 'wrap' }}>
              <Input value={q.name} placeholder="Name, e.g. Staff ward" maxLength={60} data-text="title" style={{ width: 190 }} onChange={(e) => setQ(i, { name: e.target.value })} aria-label="Quota name" />
              <Select value={q.kind} style={{ width: 180 }} aria-label="Kind" onChange={(e) => setQ(i, { kind: e.target.value, ...(e.target.value === 'rte' ? { claim: null, feeRule: { type: 'free', percent: 0 } } : {}) })}>
                {Object.entries(QUOTA_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
              <label className="adm-row" style={{ gap: 6, fontSize: '.82rem' }}>Seats <Input type="number" min="0" step="1" style={{ width: 80 }} value={q.seats} onChange={(e) => setQ(i, { seats: e.target.value })} /></label>
              <Select value={q.feeRule?.type || 'normal'} style={{ width: 170 }} aria-label="Admission fee" onChange={(e) => setQ(i, { feeRule: { type: e.target.value, percent: q.feeRule?.percent || 50 } })}>
                <option value="normal">Full admission fee</option><option value="percent">A concession</option><option value="free">No admission fee</option>
              </Select>
              {q.feeRule?.type === 'percent' ? <label className="adm-row" style={{ gap: 6, fontSize: '.82rem' }}><Input type="number" min="1" max="100" step="1" style={{ width: 70 }} value={q.feeRule.percent} onChange={(e) => setQ(i, { feeRule: { type: 'percent', percent: e.target.value } })} />% off</label> : null}
              {Number(q.released) ? <Chip tone="gray">{q.released} released to general</Chip> : null}
              <IconBtn icon="trash" kind="danger" label="Remove quota" onClick={() => onChange(quotas.filter((_, j) => j !== i))} />
            </div>
            {q.kind === 'rte' ? (
              <span className="adm-muted" style={{ fontSize: '.8rem' }}>RTE seats are allotted by the state. Import the allotment under Admissions → RTE once it arrives.</span>
            ) : (
              <div className="adm-row" style={{ flexWrap: 'wrap', fontSize: '.82rem' }}>
                <span className="adm-muted">Claimed when the form&rsquo;s</span>
                <Select value={q.claim?.field || ''} style={{ width: 230 }} aria-label="Question" onChange={(e) => setQ(i, { claim: e.target.value ? { field: e.target.value, op: q.claim?.op || 'eq', value: '' } : null })}>
                  <option value="">— no claim on the form —</option>
                  {fields.map((x) => <option key={x.key} value={x.key}>{x.label || x.key}</option>)}
                </Select>
                {q.claim?.field ? (
                  <>
                    <Select value={q.claim.op} style={{ width: 120 }} aria-label="Comparison" onChange={(e) => setQ(i, { claim: { ...q.claim, op: e.target.value } })}>
                      {CLAIM_OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </Select>
                    {['eq', 'neq'].includes(q.claim.op) ? (choices ? (
                      <Select value={q.claim.value || ''} style={{ width: 140 }} aria-label="Answer" onChange={(e) => setQ(i, { claim: { ...q.claim, value: e.target.value } })}>
                        <option value="">Choose…</option>{choices.map((o) => <option key={o} value={o}>{o}</option>)}
                      </Select>
                    ) : <Input value={q.claim.value || ''} style={{ width: 140 }} aria-label="Answer" onChange={(e) => setQ(i, { claim: { ...q.claim, value: e.target.value } })} />) : null}
                    <span className="adm-muted">— the office then verifies it</span>
                  </>
                ) : <span className="adm-muted">— or the office puts applications in it</span>}
              </div>
            )}
          </div>
        );
      })}
      <div className="adm-row">
        <Btn size="sm" kind="ghost" icon="plus" onClick={() => onChange([...quotas, { name: '', kind: 'other', seats: 1, feeRule: { type: 'normal', percent: 0 }, claim: null }])}>Add a quota</Btn>
        {quotas.length ? <span className="adm-muted" style={{ fontSize: '.8rem' }}>{reserved} of {Number(classSeats) || 'unlimited'} seats set aside; the rest are general seats.</span> : null}
      </div>
    </div>
  );
}

/**
 * The admission fee in parts (services/admission/payments.js planFor): each a
 * share of the fee, the first due by the fee date, each later one a number of
 * days after it. The server checks the plan again (2–6 parts, 100%, in order).
 */
function InstalmentEditor({ value = [], onChange, confirmWith, onConfirmWith, fee }) {
  const total = Math.round(value.reduce((s, p) => s + (Number(p.percent) || 0), 0) * 100) / 100;
  const setRow = (i, patch) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  if (!value.length) {
    return (
      <div className="adm-row">
        <span className="adm-muted" style={{ fontSize: '.84rem' }}>Paid in one go.</span>
        <Btn size="sm" kind="ghost" icon="plus" onClick={() => onChange([{ label: 'On joining', percent: 50, dueDays: 0 }, { label: 'Second instalment', percent: 50, dueDays: 60 }])}>Split into instalments</Btn>
      </div>
    );
  }
  const last = value[value.length - 1];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {value.map((p, i) => (
        <div key={i} className="adm-row" style={{ flexWrap: 'wrap' }}>
          <Input value={p.label} onChange={(e) => setRow(i, { label: e.target.value })} maxLength={40} data-text="title" style={{ width: 190 }} aria-label={`Instalment ${i + 1} name`} />
          <label className="adm-row" style={{ gap: 6, fontSize: '.82rem' }}>
            <Input type="number" min="1" max="99" step="1" style={{ width: 76 }} value={p.percent} onChange={(e) => setRow(i, { percent: e.target.value })} aria-label={`Instalment ${i + 1} share`} />
            % of the fee{fee > 0 && Number(p.percent) > 0 ? ` (${money((fee * Number(p.percent)) / 100)})` : ''}
          </label>
          {i === 0 ? <span className="adm-muted" style={{ fontSize: '.82rem' }}>due by the admission fee date</span> : (
            <label className="adm-row" style={{ gap: 6, fontSize: '.82rem' }}>
              <Input type="number" min="1" max="365" step="1" style={{ width: 76 }} value={p.dueDays} onChange={(e) => setRow(i, { dueDays: e.target.value })} aria-label={`Instalment ${i + 1} days`} />
              days after it
            </label>
          )}
          {value.length > 2 ? <IconBtn icon="trash" kind="danger" label="Remove instalment" onClick={() => onChange(value.filter((_, j) => j !== i))} /> : null}
        </div>
      ))}
      <div className="adm-row">
        <Chip tone={total === 100 ? 'green' : 'red'}>Adds up to {total}%</Chip>
        {value.length < 6 ? <Btn size="sm" kind="ghost" icon="plus" onClick={() => onChange([...value, { label: `Instalment ${value.length + 1}`, percent: 0, dueDays: (Number(last.dueDays) || 0) + 30 }])}>Add an instalment</Btn> : null}
        <Btn size="sm" kind="ghost" onClick={() => onChange([])}>Pay in one go instead</Btn>
      </div>
      <Field label="The seat is confirmed once">
        <Select value={confirmWith || 'full'} onChange={(e) => onConfirmWith(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="full">the whole fee is paid</option>
          <option value="first">the first instalment is paid</option>
        </Select>
      </Field>
      {confirmWith === 'first' ? <Note tone="indigo" icon="info">An unpaid later instalment does not take the seat back — the office follows it up. With fee reminders on (Settings → Email), families are reminded before each instalment falls due.</Note> : null}
    </div>
  );
}

function RoundDialog({ open, row, onClose, onDone }) {
  const adm = useAdmission();
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({
      name: row?.name || '', academicYear: String(row?.academicYear || adm.currentYear?._id || ''), type: row?.type || 'regular',
      description: row?.description || '', campus: row?.campus || '',
      opensAt: toLocalInput(row?.opensAt), closesAt: toLocalInput(row?.closesAt), documentDeadline: toLocalInput(row?.documentDeadline),
      form: String(row?.form || (adm.forms || []).find((x) => x.currentVersion)?._id || ''),
      applicationFee: row?.applicationFee ?? 0, admissionFee: row?.admissionFee ?? 0, admissionFeeDueDays: row?.admissionFeeDueDays ?? 7,
      maxApplicationsPerApplicant: row?.maxApplicationsPerApplicant ?? '',
      instalments: (row?.instalments || []).map((p) => ({ ...p })), confirmWith: row?.confirmWith || 'full',
      classes: (row?.classes || []).map((c) => ({
        ...blankClass(), ...c, class: String(c.class), form: c.form ? String(c.form) : '',
        applicationFee: c.applicationFee ?? '', admissionFee: c.admissionFee ?? '',
        eligibility: { ...blankClass().eligibility, ...(c.eligibility || {}), ageOn: toDateInput(c.eligibility?.ageOn), dobFrom: toDateInput(c.eligibility?.dobFrom), dobTo: toDateInput(c.eligibility?.dobTo), minAgeYears: c.eligibility?.minAgeYears ?? '', maxAgeYears: c.eligibility?.maxAgeYears ?? '' },
      })),
    });
  }, [open, row]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setClass = (i, patch) => set('classes', f.classes.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setElig = (i, k, v) => setClass(i, { eligibility: { ...f.classes[i].eligibility, [k]: v } });
  const go = async () => {
    setBusy(true);
    const iso = (v) => (v ? new Date(v).toISOString() : null);
    const day = (v) => (v ? new Date(`${v}T00:00:00`).toISOString() : null);
    const body = {
      name: f.name.trim(), academicYear: f.academicYear, type: f.type, description: f.description.trim(), campus: f.campus.trim(),
      opensAt: iso(f.opensAt), closesAt: iso(f.closesAt), documentDeadline: iso(f.documentDeadline), form: f.form || null,
      applicationFee: Number(f.applicationFee) || 0, admissionFee: Number(f.admissionFee) || 0, admissionFeeDueDays: Number(f.admissionFeeDueDays) || 7,
      maxApplicationsPerApplicant: f.maxApplicationsPerApplicant === '' ? null : Number(f.maxApplicationsPerApplicant),
      instalments: (f.instalments || []).map((p, i) => ({ label: (p.label || '').trim(), percent: Number(p.percent) || 0, dueDays: i === 0 ? 0 : Number(p.dueDays) || 0 })),
      confirmWith: (f.instalments || []).length ? f.confirmWith : 'full',
      classes: f.classes.filter((c) => c.class).map((c) => ({
        ...(c._id ? { _id: c._id } : {}), class: c.class, seats: Number(c.seats) || 0,
        applicationFee: c.applicationFee === '' ? null : Number(c.applicationFee), admissionFee: c.admissionFee === '' ? null : Number(c.admissionFee),
        form: c.form || null, isOpen: c.isOpen !== false,
        quotas: (c.quotas || []).map((q) => ({
          ...(q.key ? { key: q.key } : {}), name: (q.name || '').trim(), kind: q.kind, seats: Number(q.seats) || 0,
          feeRule: { type: q.feeRule?.type || 'normal', percent: Number(q.feeRule?.percent) || 0 },
          claim: q.kind !== 'rte' && q.claim?.field ? q.claim : null,
        })),
        eligibility: {
          ageOn: day(c.eligibility.ageOn), minAgeYears: c.eligibility.minAgeYears === '' ? null : Number(c.eligibility.minAgeYears),
          maxAgeYears: c.eligibility.maxAgeYears === '' ? null : Number(c.eligibility.maxAgeYears),
          dobFrom: day(c.eligibility.dobFrom), dobTo: day(c.eligibility.dobTo), notes: c.eligibility.notes.trim(),
        },
      })),
    };
    try {
      if (row) await admin.updateRound(row._id, body); else await admin.createRound(body);
      toast.success(row ? 'Round saved' : 'Round created — open it when you are ready');
      onClose();
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  if (!open) return null;
  const used = new Set((f.classes || []).map((c) => c.class));
  const published = (adm.forms || []).filter((x) => x.currentVersion);
  return (
    <Dialog open={open} onClose={onClose} title={row ? `Edit ${row.name}` : 'New admission round'} width={860}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!f.name?.trim() || !f.academicYear} onClick={go}>{row ? 'Save' : 'Create round'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="adm-grid3">
          <Field label="Name" required><Input value={f.name || ''} onChange={(e) => set('name', e.target.value)} maxLength={80} data-text="title" placeholder="Admissions 2027-28" /></Field>
          <Field label="Academic year" required>
            <Select value={f.academicYear || ''} onChange={(e) => set('academicYear', e.target.value)}>
              <option value="">Choose a year</option>
              {(adm.academicYears || []).map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
            </Select>
          </Field>
          <Field label="Kind"><Select value={f.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Opens"><Input type="datetime-local" value={f.opensAt || ''} onChange={(e) => set('opensAt', e.target.value)} /></Field>
          <Field label="Closes"><Input type="datetime-local" value={f.closesAt || ''} onChange={(e) => set('closesAt', e.target.value)} /></Field>
          <Field label="Documents due by"><Input type="datetime-local" value={f.documentDeadline || ''} onChange={(e) => set('documentDeadline', e.target.value)} /></Field>
          <Field label="Application form" hint={published.length ? 'Classes can use their own' : 'Publish a form first'}>
            <Select value={f.form || ''} onChange={(e) => set('form', e.target.value)}>
              <option value="">No form</option>
              {published.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
            </Select>
          </Field>
          <Field label="Campus"><Input value={f.campus || ''} onChange={(e) => set('campus', e.target.value)} maxLength={80} data-text="title" /></Field>
          <Field label="Applications per family" hint="Empty: the school's setting"><Input type="number" min="1" max="20" step="1" value={f.maxApplicationsPerApplicant ?? ''} onChange={(e) => set('maxApplicationsPerApplicant', e.target.value)} /></Field>
          <Field label="Application fee (₹)"><Input type="number" min="0" step="1" value={f.applicationFee ?? 0} onChange={(e) => set('applicationFee', e.target.value)} /></Field>
          <Field label="Admission fee (₹)"><Input type="number" min="0" step="1" value={f.admissionFee ?? 0} onChange={(e) => set('admissionFee', e.target.value)} /></Field>
          <Field label="Admission fee due (days after the offer)"><Input type="number" min="1" max="90" step="1" value={f.admissionFeeDueDays ?? 7} onChange={(e) => set('admissionFeeDueDays', e.target.value)} /></Field>
        </div>
        <Field label="About this round" hint="Shown on the portal"><TextArea rows={2} value={f.description || ''} onChange={(e) => set('description', e.target.value)} maxLength={1500} /></Field>
        <Field label="Admission fee in instalments" hint="The same shares for every class in the round">
          <InstalmentEditor value={f.instalments || []} onChange={(v) => set('instalments', v)} confirmWith={f.confirmWith} onConfirmWith={(v) => set('confirmWith', v)} fee={Number(f.admissionFee) || 0} />
        </Field>

        <Field label="Classes and seats" hint="0 seats: no limit. Fees and form left empty follow the round's.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(f.classes || []).map((c, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="adm-row" style={{ flexWrap: 'wrap' }}>
                  <Select value={c.class} onChange={(e) => setClass(i, { class: e.target.value })} style={{ width: 170 }} aria-label="Class">
                    <option value="">Class…</option>
                    {(adm.classes || []).map((x) => <option key={x._id} value={x._id} disabled={used.has(String(x._id)) && String(x._id) !== c.class}>{x.className}</option>)}
                  </Select>
                  <label className="adm-row" style={{ gap: 6, fontSize: '.82rem' }}>Seats <Input type="number" min="0" step="1" style={{ width: 90 }} value={c.seats} onChange={(e) => setClass(i, { seats: e.target.value })} /></label>
                  <label className="adm-row" style={{ gap: 6, fontSize: '.82rem' }}>Application ₹ <Input type="number" min="0" step="1" style={{ width: 100 }} value={c.applicationFee} placeholder={String(f.applicationFee || 0)} onChange={(e) => setClass(i, { applicationFee: e.target.value })} /></label>
                  <label className="adm-row" style={{ gap: 6, fontSize: '.82rem' }}>Admission ₹ <Input type="number" min="0" step="1" style={{ width: 110 }} value={c.admissionFee} placeholder={String(f.admissionFee || 0)} onChange={(e) => setClass(i, { admissionFee: e.target.value })} /></label>
                  <Select value={c.form} onChange={(e) => setClass(i, { form: e.target.value })} style={{ width: 190 }} aria-label="Form">
                    <option value="">Round's form</option>
                    {published.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
                  </Select>
                  <Toggle checked={c.isOpen !== false} onChange={(v) => setClass(i, { isOpen: v })} label="Taking applications" />
                  <IconBtn icon="trash" kind="danger" label="Remove class" onClick={() => set('classes', f.classes.filter((_, j) => j !== i))} />
                </div>
                <details open={(c.quotas || []).length > 0}>
                  <summary style={{ cursor: 'pointer', fontSize: '.82rem', fontWeight: 650 }}>Quotas — {(c.quotas || []).length ? (c.quotas || []).map((q) => `${q.name || 'Unnamed'} ${q.seats}`).join(', ') : 'none: every seat is a general seat'}</summary>
                  <div className="adm-mt"><QuotaEditor quotas={c.quotas || []} onChange={(qs) => setClass(i, { quotas: qs })} formId={c.form || f.form} classSeats={c.seats} /></div>
                </details>
                <details>
                  <summary style={{ cursor: 'pointer', fontSize: '.82rem', fontWeight: 650 }}>Eligibility — {eligibilityText(c.eligibility)}</summary>
                  <div className="adm-grid3 adm-mt">
                    <Field label="Lowest age (years)"><Input type="number" min="0" max="25" step="0.5" value={c.eligibility.minAgeYears} onChange={(e) => setElig(i, 'minAgeYears', e.target.value)} /></Field>
                    <Field label="Highest age (years)"><Input type="number" min="0" max="30" step="0.5" value={c.eligibility.maxAgeYears} onChange={(e) => setElig(i, 'maxAgeYears', e.target.value)} /></Field>
                    <Field label="Age counted on"><Input type="date" value={c.eligibility.ageOn} onChange={(e) => setElig(i, 'ageOn', e.target.value)} /></Field>
                    <Field label="Born on or after"><Input type="date" value={c.eligibility.dobFrom} onChange={(e) => setElig(i, 'dobFrom', e.target.value)} /></Field>
                    <Field label="Born on or before"><Input type="date" value={c.eligibility.dobTo} onChange={(e) => setElig(i, 'dobTo', e.target.value)} /></Field>
                    <Field label="Notes for families"><Input value={c.eligibility.notes} onChange={(e) => setElig(i, 'notes', e.target.value)} maxLength={300} /></Field>
                  </div>
                </details>
              </div>
            ))}
            <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => set('classes', [...(f.classes || []), blankClass()])}>Add a class</Btn>
          </div>
        </Field>
      </div>
    </Dialog>
  );
}
