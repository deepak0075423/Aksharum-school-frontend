/**
 * Staff Health (Oct 2026) — members of staff seen in the Medical Room, kept
 * apart from every student's record. A visit can take medicine from the same
 * stock (stopped when it clashes with an allergy on the person's record,
 * unless a reason is given); each person's own record — allergies, conditions,
 * the person to call — is here for the medical staff and in the person's own
 * portal for them to keep up to date.
 */
import React, { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Badge, Dialog, Field, Segmented, Note, Person, Table, Pager, LineTabs, SearchBox, Empty, Spin, LoadError, IconBtn, ConfirmDialog, useLoad, useDebounced } from '../mdUI';
import { StudentPicker, VitalsFields } from '../mdForm';
import { fmtStamp, fmtTime, errorText, qty } from '../mdMeta';
import { StaffRecordView, StaffRecordDialog } from '../staffHealthParts';
import { useMeta } from './mdForms';

const OUTCOME = { in_room: { label: 'In the room', tone: 'blue' }, back_to_work: { label: 'Back to work', tone: 'green' }, went_home: { label: 'Went home', tone: 'amber' }, referred: { label: 'Referred to hospital', tone: 'red' } };
const findStaff = (q) => api.searchStaffPatients(q).then((r) => (r?.data ?? r ?? []).map((s) => ({ ...s, classLabel: s.designation || (s.role === 'school_admin' ? 'School admin' : 'Teacher') })));

/** A visit — new, or more for one already open. A clash with an allergy asks for a reason. */
function VisitDialog({ visit, onClose, onSaved, meta }) {
  const isNew = !visit?._id;
  const [v, setV] = useState(() => ({
    staff: visit?.staff || null, reason: '', symptoms: '', vitals: { tempUnit: meta?.settings?.temperatureUnit || 'F' }, treatment: visit?.treatment || '',
    outcome: visit?.outcome || 'in_room', outcomeNote: '', privateNotes: visit?.privateNotes || '', medicines: [],
  }));
  const [stop, setStop] = useState(null);       // { message } when the server stopped a medicine
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const medicines = meta?.medicines || [];
  const line = (i, patchIn) => setV((x) => ({ ...x, medicines: x.medicines.map((m, j) => (j === i ? { ...m, ...patchIn } : m)) }));
  const go = async () => {
    if (isNew && !v.staff?._id) { setErr('Choose the member of staff'); return; }
    if (isNew && !v.reason.trim()) { setErr('Give the reason for the visit'); return; }
    if (stop && !why.trim()) { setErr('Give the reason for going ahead'); return; }
    setBusy(true); setErr('');
    const vit = Object.fromEntries(Object.entries(v.vitals || {}).filter(([, x]) => x !== '' && x != null));
    const body = {
      symptoms: v.symptoms, treatment: v.treatment, outcome: v.outcome, outcomeNote: v.outcomeNote, privateNotes: v.privateNotes,
      vitals: Object.keys(vit).length > 1 ? vit : undefined,
      medicines: v.medicines.filter((m) => m.item).map((m) => ({ item: m.item, quantity: Number(m.quantity), dosage: m.dosage })),
      override: stop ? { reason: why } : undefined,
    };
    try {
      const r = isNew ? await api.addStaffVisit({ ...body, staff: v.staff._id, reason: v.reason }) : await api.updateStaffVisit(visit._id, body);
      toast.success(isNew ? 'Staff visit recorded' : 'Visit updated');
      onSaved(r?.data ?? r);
    } catch (e) {
      if (e?.data?.code === 'MEDICAL_SAFETY' || e?.response?.data?.code === 'MEDICAL_SAFETY') { setStop({ message: errorText(e) }); setErr(''); }
      else setErr(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={busy ? () => {} : onClose} title={isNew ? 'A member of staff in the Medical Room' : `Update ${visit.number}`} icon="stethoscope" tone="indigo" width={760}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind={stop ? 'danger-solid' : 'primary'} busy={busy} onClick={go}>{stop ? 'Give it anyway' : 'Save'}</Btn></>}>
      {isNew ? (
        <div className="md-form__grid">
          <Field label="Member of staff" required><StudentPicker value={v.staff} onChange={(s) => setV({ ...v, staff: s })} fetcher={findStaff} placeholder="Search staff by name or designation" autoFocus /></Field>
          <Field label="Reason" required><input className="md-input" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} maxLength={200} placeholder="e.g. Headache" /></Field>
        </div>
      ) : null}
      {isNew ? <Field label="Symptoms" optional><input className="md-input" value={v.symptoms} onChange={(e) => setV({ ...v, symptoms: e.target.value })} maxLength={600} /></Field> : null}
      <Field label="Readings" optional><VitalsFields value={v.vitals} onChange={(x) => setV({ ...v, vitals: x })} unit={meta?.settings?.temperatureUnit || 'F'} /></Field>
      <Field label="Treatment" optional><textarea className="md-textarea" rows={2} value={v.treatment} onChange={(e) => setV({ ...v, treatment: e.target.value })} maxLength={1500} /></Field>
      <Field label="Medicine given" optional hint="Taken from the Medical Room's stock and checked against the person's allergies.">
        <div className="mdsh-meds">
          {v.medicines.map((m, i) => (
            <div key={i} className="mdsh-med">
              <select className="md-input" value={m.item} onChange={(e) => { line(i, { item: e.target.value }); setStop(null); }} aria-label="Medicine">
                <option value="">Choose a medicine…</option>
                {medicines.map((x) => <option key={x._id} value={x._id} disabled={Number(x.usable) <= 0}>{x.name}{x.strength ? ` ${x.strength}` : ''} — {qty(x.usable)} {x.unit || ''} in date</option>)}
              </select>
              <input className="md-input" type="number" min="0" step="0.5" value={m.quantity} onChange={(e) => line(i, { quantity: e.target.value })} aria-label="How many" />
              <input className="md-input" value={m.dosage} onChange={(e) => line(i, { dosage: e.target.value })} placeholder="Dose, e.g. 500 mg" aria-label="Dose" />
              <IconBtn icon="close" label="Remove this medicine" onClick={() => { setV((x) => ({ ...x, medicines: x.medicines.filter((_, j) => j !== i) })); setStop(null); }} />
            </div>
          ))}
          <div><Btn size="sm" kind="tint" icon="plus" onClick={() => setV((x) => ({ ...x, medicines: [...x.medicines, { item: '', quantity: 1, dosage: '' }] }))}>Add a medicine</Btn></div>
        </div>
      </Field>
      {stop ? (
        <>
          <Note tone="red" icon="alertTri"><b>{stop.message}.</b> Giving it anyway is recorded, and the other medical staff are told.</Note>
          <Field label="Why go ahead" required><input className="md-input" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} placeholder="e.g. Doctor confirmed by phone" /></Field>
        </>
      ) : null}
      <Field label="Now">
        <Segmented value={v.outcome} onChange={(x) => setV({ ...v, outcome: x })} label="Outcome" options={Object.entries(OUTCOME).map(([value, o]) => ({ value, label: o.label }))} />
      </Field>
      <Field label="Private notes" optional hint="Only the medical staff see these."><textarea className="md-textarea" rows={2} value={v.privateNotes} onChange={(e) => setV({ ...v, privateNotes: e.target.value })} maxLength={2000} /></Field>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

/** One member of staff: their record and every visit. */
function StaffCard({ id, onClose, onChanged, meta }) {
  const card = useLoad(() => api.getStaffHealth(id), id);
  const [edit, setEdit] = useState(false);
  const [visit, setVisit] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const reload = () => { card.reload(); onChanged(); };
  const d = card.data;
  return (
    <Dialog open onClose={onClose} title={d?.staff?.name || 'Staff health'} icon="user" tone="rose" width={780}
      footer={<><Btn onClick={onClose}>Close</Btn>{d ? <Btn kind="primary" icon="pencil" onClick={() => setEdit(true)}>Edit record</Btn> : null}</>}>
      {card.loading && !d ? <Spin /> : card.error && !d ? <LoadError error={card.error} onRetry={card.reload} /> : (
        <>
          <p className="md-muted" style={{ marginTop: 0 }}>{d.staff.designation || (d.staff.role === 'school_admin' ? 'School admin' : 'Teacher')}</p>
          <StaffRecordView health={d.health} emptyHint="Nothing on record — they can fill it in from their own portal, or you can." />
          <h4 className="mdp-h" style={{ marginTop: 16 }}>Visits</h4>
          {(d.visits || []).length ? (
            <ul className="mdd-list">
              {d.visits.map((x) => (
                <li key={x._id} className={x.archivedAt ? 'is-off' : ''}>
                  <div><b>{x.number} · {x.reason}</b><em>{fmtStamp(x.arrivedAt)} · {x.handledByName}{(x.medicines || []).length ? ` · ${x.medicines.map((m) => `${m.name} ${m.dosage}`).join(', ')}` : ''}{x.archivedAt ? ` · archived — ${x.archiveReason}` : ''}</em>{x.privateNotes ? <em>Private: {x.privateNotes}</em> : null}</div>
                  <Badge tone={OUTCOME[x.outcome]?.tone} size="sm">{OUTCOME[x.outcome]?.label}</Badge>
                  {!x.archivedAt ? <Btn size="sm" onClick={() => setVisit(x)}>Update</Btn> : null}
                  {!x.archivedAt ? <IconBtn icon="archive" label="Archive" onClick={() => setArchiving(x)} /> : null}
                </li>
              ))}
            </ul>
          ) : <p className="md-muted">No visits.</p>}
        </>
      )}
      <StaffRecordDialog open={edit} health={d?.health} title={`Health record — ${d?.staff?.name || ''}`} onClose={() => setEdit(false)}
        intro="Kept for the medical staff and the person themselves." save={(body) => api.saveStaffHealth(id, body)} onSaved={() => { toast.success('Saved'); reload(); }} />
      {visit ? <VisitDialog visit={visit} meta={meta} onClose={() => setVisit(null)} onSaved={() => { setVisit(null); reload(); }} /> : null}
      <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} title="Archive this visit?" danger reason reasonLabel="Why" confirmLabel="Archive"
        onConfirm={async (why) => { await api.archiveStaffVisit(archiving._id, why).catch((e) => { throw new Error(errorText(e)); }); toast.success('Archived'); setArchiving(null); reload(); }} />
    </Dialog>
  );
}

export default function MedicalStaffHealth() {
  const { meta } = useMeta();
  const [tab, setTab] = useState('today');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(q, 250);
  const list = useLoad(() => api.getStaffVisits({ tab, q: term, page }), { tab, term, page });
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const reload = useCallback(() => list.reload(), [list]);
  const d = list.data;
  const columns = [
    { key: 'staff', label: 'Member of staff', primary: true, render: (r) => <Person name={r.staffName} photo={r.staffPhoto} size={34} sub={r.designation || ''} /> },
    { key: 'arrivedAt', label: 'Seen', render: (r) => <span className="md-two"><b>{fmtTime(r.arrivedAt)}</b><em>{fmtStamp(r.arrivedAt).split(',')[0]} · {r.number}</em></span> },
    { key: 'reason', label: 'Reason', render: (r) => <span className="md-two"><b>{r.reason}</b><em>{(r.medicines || []).map((m) => m.name).join(', ')}</em></span> },
    { key: 'outcome', label: 'Now', render: (r) => <Badge tone={OUTCOME[r.outcome]?.tone} size="sm">{OUTCOME[r.outcome]?.label}</Badge> },
    { key: 'handledByName', label: 'Seen by' },
  ];
  return (
    <Page>
      <PageHead icon="user" tone="rose" title="Staff Health" subtitle="Members of staff seen in the Medical Room — kept apart from every student's record. Each person's allergies, conditions and the person to call are here, and in their own portal for them to keep up to date.">
        <Btn kind="primary" icon="plus" onClick={() => setAdding(true)}>Staff visit</Btn>
      </PageHead>
      <Panel pad={false}>
        <div className="md-listhead">
          <LineTabs items={[{ key: 'today', label: 'Today' }, { key: 'in_room', label: 'In the room' }, { key: 'all', label: 'All' }]} value={tab} onChange={(t) => { setTab(t); setPage(1); }} />
          <SearchBox value={q} onChange={(x) => { setQ(x); setPage(1); }} placeholder="Search name, reason or number" />
        </div>
        {list.error && !d ? <LoadError error={list.error} onRetry={reload} /> : (
          <>
            <Table columns={columns} rows={d?.rows || []} loading={list.loading && !d} onRow={(r) => setOpen(r.staffId)}
              empty={<Empty compact title={tab === 'today' ? 'No member of staff seen today' : 'No staff visits'}>Record a visit with “Staff visit”.</Empty>} />
            {d ? <Pager page={d.page} pages={d.pages} total={d.total} limit={d.limit} noun="visit" onPage={setPage} /> : null}
          </>
        )}
      </Panel>
      {adding ? <VisitDialog meta={meta} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} /> : null}
      {open ? <StaffCard id={open} meta={meta} onClose={() => setOpen(null)} onChanged={reload} /> : null}
    </Page>
  );
}
