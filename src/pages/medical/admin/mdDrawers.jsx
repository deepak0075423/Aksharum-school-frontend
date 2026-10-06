/**
 * The detail drawers of the medical staff's screens (Oct 2026) — a visit, an
 * incident, a request, a medicine, a medication plan, a piece of equipment, a
 * first-aid record — and the module-wide search.
 *
 *   const drawer = useMedDrawer({ forms, onChange: reload });
 *   drawer.show('visit', id)            … render {drawer.element} once
 *
 * Every action a record allows is on its drawer, and each runs through the
 * same forms (useMedForms) as everywhere else in the module.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Drawer, DrawerHead, DrawerBody, DrawerFoot } from '../../../components/ui/Drawer';
import * as api from '../../../api/medical.api';
import {
  Ico, Btn, Badge, Status, KV, Section, Steps, AlertArea, Spin, Empty, Kebab, ConfirmDialog, Person, Table, MenuBtn, Note,
  SearchBox, useDebounced,
} from '../mdUI';
import { DocButton } from '../mdShared';
import { useMeta, useMedForms } from './mdForms';
import { SafetyHost } from './mdSafety';
import { TriageControl, ReadingsSection, ReadingDialog, ProtocolSection, BodyMapSection, useCareLibrary, TriageBadge } from './mdCare';
import {
  VISIT_STATUS, VISIT_NEXT, IN_ROOM, REQUEST_STATUS, URGENCY, INCIDENT_TYPE, INCIDENT_SEVERITY, INCIDENT_STATUS,
  PLAN_FREQUENCY, PLAN_STATUS, EQUIP_TYPE, EQUIP_STATUS, EQUIP_CONDITION, MOVE_TYPE, DOC_TYPE, FOLLOW_STATE,
  fmtStamp, fmtDay, fmtTime, ago, since, qty, money, errorText, labelOf, studentLine, tempText, isFever,
} from '../mdMeta';

const BASE = '/admin/medical';

/* ── Shared drawer pieces ─────────────────────────────────────────────────── */

const Mark = ({ icon, tone }) => <span className={`mdd-mark md-t-${tone}`}><Ico name={icon} size={24} /></span>;

function useDetail(fetcher, id) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!id) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fetcher(id).then((r) => alive && setState({ data: r?.data ?? r, loading: false, error: null }))
      .catch((e) => alive && setState({ data: null, loading: false, error: e }));
    return () => { alive = false; };
  }, [id, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: () => setN((x) => x + 1) };
}

const Loading = ({ onClose }) => (
  <div className="mdd"><DrawerHead name="Loading…" onClose={onClose} /><DrawerBody><Spin /></DrawerBody></div>
);
const Failed = ({ error, onClose }) => (
  <div className="mdd"><DrawerHead name="Not available" onClose={onClose} /><DrawerBody><Empty compact title="This record could not be opened">{error?.message}</Empty></DrawerBody></div>
);

/* ── Visit ────────────────────────────────────────────────────────────────── */

function VisitDrawer({ id, onClose, forms, notify: changed, version, confirm, nav }) {
  const { data: v, loading, error, reload } = useDetail(api.getVisit, id);
  const lib = useCareLibrary();
  const { meta } = useMeta();
  const [reading, setReading] = useState(null);
  useEffect(() => { if (version) reload(); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  /** After a reading, a colour or a red flag: read again — and offer the emergency the server suggests. */
  const after = (out) => {
    reload(); changed?.();
    if (out?.suggestEmergency) {
      confirm({
        title: 'Treat this as an emergency?', icon: 'siren', danger: true, confirmLabel: 'Make it an emergency',
        message: `${out?.visit?.triage?.reasons?.length ? `${out.visit.triage.reasons.join(' · ')}. ` : ''}The medical staff and the parents are told at once.`,
        run: async () => { await api.setVisitStatus(id, { status: 'emergency' }); toast.success('Treated as an emergency'); reload(); changed?.(); },
      });
    }
  };
  if (loading && !v) return <Loading onClose={onClose} />;
  if (error && !v) return <Failed error={error} onClose={onClose} />;
  const st = VISIT_STATUS[v.status] || {};
  const inRoom = IN_ROOM.includes(v.status);
  const fu = v.followUpState;
  return (
    <div className="mdd">
      <DrawerHead mark={<Mark icon={st.icon || 'stethoscope'} tone={st.tone} />} name={v.student?.name || 'Student'}
        sub={`${v.number} · ${studentLine(v.student)} · arrived ${fmtStamp(v.arrivedAt)}`} onClose={onClose}
        tags={<>
          <Status of="visit" value={v.status} />
          {v.emergency ? <Badge tone="red" icon="siren">Emergency case</Badge> : null}
          {fu ? <Badge tone={FOLLOW_STATE[fu].tone}>Follow-up {FOLLOW_STATE[fu].label.toLowerCase()}</Badge> : null}
          {inRoom ? <Badge tone="blue" icon="clock">In the room {since(v.arrivedAt)}</Badge> : null}
          <TriageBadge level={v.triage?.level} size={undefined} />
          {v.recheckDue && inRoom ? <Badge tone="red" icon="clock">Recheck due</Badge> : null}
        </>} />
      <DrawerBody>
        {v.alerts?.length ? <Section title="Medical alerts" icon="alertTri"><AlertArea alerts={v.alerts} compact /></Section> : null}
        <Section title="How urgent" icon="siren"><TriageControl visit={v} onSaved={after} /></Section>
        <ReadingsSection visit={v} onAdd={() => setReading(v)} onChanged={() => { reload(); changed?.(); }} confirm={confirm} />
        <ProtocolSection visit={v} lib={lib} onSaved={after} />
        <BodyMapSection kind="visit" record={v} lib={lib} onSaved={() => { reload(); changed?.(); }} />
        <Section title="Photos and documents" icon="files" right={v.status !== 'closed' ? <Btn size="xs" kind="tint" icon="upload" onClick={() => forms.open('document', { studentId: v.student?._id, linkKind: 'visit', linkId: v._id, type: 'incident_photo' })}>Add</Btn> : null}>
          {(v.documentList || []).length ? (
            <ul className="mdd-list">
              {v.documentList.map((d) => (
                <li key={d._id}><div><b>{d.title}</b><em>{labelOf(DOC_TYPE, d.type)} · {d.uploadedByName} · {ago(d.createdAt)}{d.visibility === 'staff' ? ' · medical staff only' : ''}</em></div><DocButton getLink={api.medDocLink} id={d._id} /></li>
              ))}
            </ul>
          ) : <p className="md-muted" style={{ margin: 0 }}>None attached.</p>}
        </Section>
        <Section title="Assessment and care" icon="stethoscope">
          <KV cols={1} items={[
            ['Reason', v.reason], ['Symptoms', v.symptoms], ['Initial observation', v.observation], ['Treatment provided', v.treatment],
            ['First aid provided', v.firstAid], ['Rest', v.restAdvised ? `Rest advised${v.restMinutes ? ` — ${v.restMinutes} min` : ''}` : ''],
            ['Bed', v.bedInfo?.label ? `${v.bedInfo.label}${v.bedIn ? ` · from ${fmtTime(v.bedIn)}` : ''}${v.bedOut ? ` to ${fmtTime(v.bedOut)}` : ''}` : ''],
          ]} />
        </Section>
        {(v.doses || []).length ? (
          <Section title="Medicine given" icon="pill">
            <ul className="mdd-list">
              {v.doses.map((d) => (
                <li key={d._id}>
                  <div><b>{d.medicineName}</b> — {d.dosage}<em>{[d.quantity ? `${qty(d.quantity)} from stock` : "Family's own", fmtTime(d.givenAt), d.givenByName].filter(Boolean).join(' · ')}</em></div>
                  <Status of="dose" value={d.status} size="sm" />
                  {d.status === 'given' ? <Kebab label="Dose actions" items={[{ label: 'Cancel this dose', icon: 'close', danger: true, onClick: () => confirm({
                    title: 'Cancel this dose?', message: `${d.medicineName} will be recorded as not given${d.quantity ? ' and its stock returned to the batch it came from' : ''}.`, reason: true, reasonLabel: 'Why', confirmLabel: 'Cancel dose', danger: true,
                    run: async (why) => { await api.cancelDose(d._id, why); toast.success('Dose cancelled'); reload(); changed?.(); },
                  }) }]} /> : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {(v.firstAidInfo?.supplies || []).length ? (
          <Section title="First-aid supplies used" icon="bandage">
            <ul className="mdd-list">{v.firstAidInfo.supplies.map((x, k) => <li key={k}><div><b>{qty(x.quantity)} {x.unit}</b> {x.name}<em>{(x.batches || []).map((b) => b.batchNumber).filter(Boolean).join(', ')}</em></div></li>)}</ul>
          </Section>
        ) : null}
        {v.status === 'sent_home' ? (
          <Section title="Collected" icon="users">
            {v.collection?.at ? (
              <KV cols={1} items={[
                ['Collected by', `${v.collection.name}${v.collection.relation ? ` (${v.collection.relation})` : ''}${v.collection.phone ? ` · ${v.collection.phone}` : ''}`],
                ['When', fmtStamp(v.collection.at)],
                ['Checked', [v.collection.verified ? 'On the student’s record' : 'Not on the record', v.collection.idChecked ? `ID seen${v.collection.idNote ? ` (${v.collection.idNote})` : ''}` : 'No ID checked'].join(' · ')],
                ['Allowed by', v.collection.note],
                ['Recorded by', v.collection.byName],
              ]} />
            ) : <Note tone="amber" icon="clock">Waiting to be collected — record who takes the student home.</Note>}
          </Section>
        ) : null}
        <Section title="Parents, referral and follow-up" icon="phone">
          <KV cols={1} items={[
            ['Parent contacted', v.parentContacted ? `Yes${v.parentContactedAt ? `, ${fmtStamp(v.parentContactedAt)}` : ''}${v.parentContactNote ? ` — ${v.parentContactNote}` : ''}` : 'Not yet'],
            ['Hospital referral', v.referral?.referred ? [v.referral.hospital, v.referral.transport && `by ${v.referral.transport}`, v.referral.accompaniedBy && `with ${v.referral.accompaniedBy}`, v.referral.reason].filter(Boolean).join(' · ') : ''],
            ['Follow-up', v.followUp?.required ? [v.followUp.on ? fmtDay(v.followUp.on) : 'No date', v.followUp.note, v.followUp.status === 'done' ? `Done: ${v.followUp.outcome}` : v.followUp.status === 'cancelled' ? 'Cancelled' : ''].filter(Boolean).join(' · ') : ''],
          ]} keep />
        </Section>
        {v.requestInfo || v.incidentInfo ? (
          <Section title="Where it came from" icon="inbox">
            <KV cols={1} items={[
              v.requestInfo ? ['Teacher request', `${v.requestInfo.number} · sent by ${v.requestInfo.requestedByName}${v.requestInfo.location ? ` from ${v.requestInfo.location}` : ''} · ${labelOf(URGENCY, v.requestInfo.urgency)} urgency`] : null,
              v.incidentInfo ? ['Incident', `${v.incidentInfo.number} · ${labelOf(INCIDENT_TYPE, v.incidentInfo.type)} · ${labelOf(INCIDENT_SEVERITY, v.incidentInfo.severity)}`] : null,
            ]} />
          </Section>
        ) : null}
        <Section title="Notes" icon="pencil">
          <KV cols={1} items={[['Handled by', v.handledByName], ['Remarks', v.remarks], ['Private notes', v.privateNotes ? <span style={{ color: '#7f1d1d' }}><Ico name="lock" size={12} /> {v.privateNotes}</span> : '']]} />
        </Section>
        <Section title="History" icon="history"><Steps steps={v.history || []} map={VISIT_STATUS} /></Section>
      </DrawerBody>
      <ReadingDialog visit={reading} unit={meta?.settings?.temperatureUnit || 'F'} onClose={() => setReading(null)} onSaved={(out) => { setReading(null); toast.success('Reading saved'); after(out); }} />
      <DrawerFoot>
        {v.status !== 'closed' ? <Btn kind="primary" icon="stethoscope" onClick={() => forms.open('visitEdit', { visit: v })}>Update treatment</Btn> : null}
        {(VISIT_NEXT[v.status] || []).length ? <Btn icon="bed" onClick={() => forms.open('visitStatus', { visit: v })}>{inRoom ? 'Outcome' : 'Change status'}</Btn> : null}
        {inRoom && !v.parentContacted ? <Btn icon="phone" onClick={() => forms.open('contactParent', { visit: v })}>Parent contacted</Btn> : null}
        {v.status === 'sent_home' && !v.collection?.at ? <Btn kind="primary" icon="users" onClick={() => forms.open('collection', { visit: v })}>Record collection</Btn> : null}
        {fu ? <Btn icon="calendarCheck" onClick={() => forms.open('followUp', { kind: 'visit', id: v._id })}>Follow-up done</Btn> : null}
        {['referred', 'emergency'].includes(v.status) ? <Btn icon="printer" onClick={() => api.downloadPdf(api.handoverUrl(v._id), `handover-${v.number}.pdf`).catch((e) => toast.error(errorText(e)))}>Hospital handover</Btn> : null}
        <Kebab items={[
          { label: 'Hospital handover (PDF)', icon: 'printer', onClick: () => api.downloadPdf(api.handoverUrl(v._id), `handover-${v.number}.pdf`).catch((e) => toast.error(errorText(e))) },
          { label: 'Open medical profile', icon: 'user', onClick: () => nav(`${BASE}/students/${v.student?._id}`) },
          { label: 'Emergency profile', icon: 'alertTri', onClick: () => nav(`${BASE}/health/emergency?student=${v.student?._id}`) },
          { label: 'Upload a document', icon: 'upload', onClick: () => forms.open('document', { studentId: v.student?._id, linkKind: 'visit', linkId: v._id }) },
          // A head injury: no sport for two days is the usual advice.
          { label: 'Restriction for teachers', icon: 'ban', onClick: () => forms.open('restriction', v.protocol?.key === 'head_injury'
            ? { studentId: v.student?._id, studentName: v.student?.name, visitId: v._id, kind: 'no_sports', days: 2, reason: 'Head injury' }
            : { studentId: v.student?._id, studentName: v.student?.name, visitId: v._id }) },
          '-',
          v.status === 'closed' ? { label: 'Reopen the visit', icon: 'repeat', onClick: () => confirm({ title: 'Reopen this visit?', reason: true, reasonLabel: 'Why', confirmLabel: 'Reopen', run: async (why) => { await api.reopenVisit(v._id, why); toast.success('Visit reopened'); reload(); changed?.(); } }) } : null,
          !inRoom ? { label: 'Archive the visit', icon: 'archive', danger: true, onClick: () => confirm({ title: 'Archive this visit?', message: 'It leaves the lists and the history, and is kept for the record. It can be restored.', reason: true, reasonLabel: 'Why', danger: true, confirmLabel: 'Archive', run: async (why) => { await api.archiveMedCase('visits', v._id, why); toast.success('Visit archived'); onClose(); changed?.(); } }) } : null,
        ]} />
      </DrawerFoot>
    </div>
  );
}

/* ── Incident ─────────────────────────────────────────────────────────────── */

function IncidentDrawer({ id, onClose, forms, notify: changed, version, confirm, nav, openOther }) {
  const { data: i, loading, error, reload } = useDetail(api.getIncident, id);
  const lib = useCareLibrary();
  useEffect(() => { if (version) reload(); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading && !i) return <Loading onClose={onClose} />;
  if (error && !i) return <Failed error={error} onClose={onClose} />;
  const sev = INCIDENT_SEVERITY[i.severity];
  const setStatus = async (status, note) => { try { await api.setIncidentStatus(i._id, { status, note }); toast.success(`Incident ${labelOf(INCIDENT_STATUS, status).toLowerCase()}`); reload(); changed?.(); } catch (e) { toast.error(errorText(e)); } };
  return (
    <div className="mdd">
      <DrawerHead mark={<Mark icon="alertTri" tone={sev.tone} />} name={i.student?.name} sub={`${i.number} · ${labelOf(INCIDENT_TYPE, i.type)} · ${fmtStamp(i.occurredAt)}`} onClose={onClose}
        tags={<>
          <Status of="incidentSeverity" value={i.severity} />
          <Status of="incidentStatus" value={i.status} />
          {i.parentNotified ? <Badge tone="green" icon="checkCircle">Parents told</Badge> : <Badge tone="amber">Parents not told yet</Badge>}
          {i.followUpState ? <Badge tone={FOLLOW_STATE[i.followUpState].tone}>Follow-up {FOLLOW_STATE[i.followUpState].label.toLowerCase()}</Badge> : null}
        </>} />
      <DrawerBody>
        <Section title="What happened" icon="alertTri">
          <KV cols={2} items={[
            ['Where', i.location], ['Type', labelOf(INCIDENT_TYPE, i.type)], ['Description', i.description, true], ['Injury', i.injury], ['Part of the body', i.bodyPart],
            ['Witnesses', i.witnesses, true], ['Reported by', `${i.reportedByName}${i.reportedByRole === 'teacher' ? ' (teacher)' : ''}`],
          ]} />
        </Section>
        <BodyMapSection kind="incident" record={i} lib={lib} onSaved={() => { reload(); changed?.(); }} />
        <Section title="Care" icon="firstAid">
          <KV cols={1} items={[
            ['First aid provided', i.firstAid], ['Medicine used', i.medicineUsed],
            ['Medical Room visit', i.visitInfo ? <button type="button" className="md-btn md-btn--ghost md-btn--xs" onClick={() => openOther('visit', i.visitInfo._id)}>{i.visitInfo.number} · {labelOf(VISIT_STATUS, i.visitInfo.status)}</button> : 'Not treated in the room'],
            ['Hospital referral', i.referral?.referred ? [i.referral.hospital, i.referral.transport, i.referral.reason].filter(Boolean).join(' · ') : ''],
            ['Follow-up', i.followUp?.required ? [i.followUp.on ? fmtDay(i.followUp.on) : '', i.followUp.note, i.followUp.status === 'done' ? `Done: ${i.followUp.outcome}` : ''].filter(Boolean).join(' · ') : ''],
            ['Parents', i.parentNotified ? `Told ${fmtStamp(i.parentNotifiedAt)}${i.parentNotifyNote ? ` — ${i.parentNotifyNote}` : ''}` : ''],
          ]} keep />
        </Section>
        <Section title="Photos and documents" icon="files" right={<Btn size="xs" kind="tint" icon="upload" onClick={() => forms.open('document', { studentId: i.student?._id, linkKind: 'incident', linkId: i._id, type: 'incident_photo' })}>Add</Btn>}>
          {(i.documentList || []).filter((d) => !d.archivedAt).length ? (
            <ul className="mdd-list">
              {i.documentList.filter((d) => !d.archivedAt).map((d) => (
                <li key={d._id}><div><b>{d.title}</b><em>{labelOf(DOC_TYPE, d.type)} · {d.uploadedByName} · {ago(d.createdAt)}</em></div><DocButton getLink={api.medDocLink} id={d._id} /></li>
              ))}
            </ul>
          ) : <p className="md-muted" style={{ margin: 0 }}>None attached.</p>}
        </Section>
        <Section title="Notes" icon="pencil"><KV cols={1} items={[['Remarks', i.remarks], ['Private notes', i.privateNotes]]} /></Section>
        <Section title="History" icon="history"><Steps steps={i.history || []} map={INCIDENT_STATUS} /></Section>
      </DrawerBody>
      <DrawerFoot>
        {!i.visit ? <Btn kind="primary" icon="stethoscope" onClick={() => forms.open('visit', { incident: i._id, student: i.student, reason: `${labelOf(INCIDENT_TYPE, i.type)}${i.injury ? ` — ${i.injury}` : ''}`, symptoms: i.description })}>Treat in Medical Room</Btn> : null}
        {!i.parentNotified ? <Btn icon="bell" onClick={() => confirm({ title: 'Tell the parents?', message: 'They receive what happened, the injury and the first aid given. Serious incidents are also emailed.', reasonLabel: 'Add a note (optional)', confirmLabel: 'Tell parents', run: async () => { await api.notifyIncidentParents(i._id, {}); toast.success('Parents told'); reload(); changed?.(); } })}>Tell parents</Btn> : null}
        <Btn icon="printer" onClick={() => api.downloadPdf(api.incidentReportUrl(i._id), `incident-${i.number}.pdf`).catch((e) => toast.error(errorText(e)))}>Print report</Btn>
        <MenuBtn label="Status" items={[
          i.status === 'reported' ? { label: 'Mark in progress', icon: 'activity', onClick: () => setStatus('in_progress') } : null,
          ['reported', 'in_progress'].includes(i.status) ? { label: 'Mark resolved', icon: 'checkCircle', onClick: () => setStatus('resolved') } : null,
          i.status !== 'closed' ? { label: 'Close', icon: 'archive', onClick: () => setStatus('closed') } : null,
          i.status === 'closed' ? { label: 'Reopen', icon: 'repeat', onClick: () => confirm({ title: 'Reopen this incident?', reason: true, reasonLabel: 'Why', confirmLabel: 'Reopen', run: async (why) => { await api.setIncidentStatus(i._id, { status: 'in_progress', note: why }); reload(); changed?.(); } }) } : null,
        ]}>Status</MenuBtn>
        <Kebab items={[
          { label: 'Edit the report', icon: 'pencil', onClick: () => forms.open('incident', { incident: i }) },
          i.followUpState ? { label: 'Record the follow-up', icon: 'calendarCheck', onClick: () => forms.open('followUp', { kind: 'incident', id: i._id }) } : null,
          { label: 'Record first aid', icon: 'firstAid', onClick: () => forms.open('firstAid', { student: i.student, incident: i._id }) },
          { label: 'Open medical profile', icon: 'user', onClick: () => nav(`${BASE}/students/${i.student?._id}`) },
          '-',
          { label: 'Archive the incident', icon: 'archive', danger: true, onClick: () => confirm({ title: 'Archive this incident?', message: 'It leaves the lists and is kept for the record.', reason: true, reasonLabel: 'Why', danger: true, confirmLabel: 'Archive', run: async (why) => { await api.archiveMedCase('incidents', i._id, why); toast.success('Incident archived'); onClose(); changed?.(); } }) },
        ]} />
      </DrawerFoot>
    </div>
  );
}

/* ── Request ──────────────────────────────────────────────────────────────── */

function RequestDrawer({ row, onClose, forms, notify: changed, confirm, openOther }) {
  const r = row;
  const accept = async () => { try { await api.acceptMedRequest(r._id); toast.success('Request accepted — the teacher has been told'); changed?.(); onClose(); } catch (e) { toast.error(errorText(e)); } };
  return (
    <div className="mdd">
      <DrawerHead mark={<Mark icon="inbox" tone={URGENCY[r.urgency]?.tone || 'blue'} />} name={r.studentName} sub={`${r.number} · ${studentLine(r)} · sent ${ago(r.createdAt)}`} onClose={onClose}
        tags={<><Status of="request" value={r.status} /><Badge tone={URGENCY[r.urgency]?.tone}>{labelOf(URGENCY, r.urgency)} urgency</Badge></>} />
      <DrawerBody>
        <Section title="The request" icon="inbox">
          <KV cols={1} items={[['Reason', r.reason], ['Symptoms', r.symptoms], ['Where the student is', r.location], ['Coming with', r.escortedBy], ['Remarks', r.remarks], ['Sent by', `${r.requestedByName} · ${fmtStamp(r.createdAt)}`], ['Cancelled', r.cancelReason], ['Told the teacher', r.outcomeNote]]} />
        </Section>
        {r.visit ? <Section title="Medical Room visit" icon="stethoscope"><Btn size="sm" kind="tint" onClick={() => openOther('visit', r.visit)}>{r.visitNumber} · {labelOf(VISIT_STATUS, r.visitStatus)}</Btn></Section> : null}
        <Section title="History" icon="history"><Steps steps={r.history || []} map={REQUEST_STATUS} /></Section>
      </DrawerBody>
      <DrawerFoot>
        {r.status === 'requested' ? <Btn kind="primary" icon="checkCircle" onClick={accept}>Accept</Btn> : null}
        {['requested', 'accepted'].includes(r.status) ? <Btn kind={r.status === 'accepted' ? 'primary' : 'outline'} icon="stethoscope"
          onClick={() => { onClose(); forms.open('visit', { request: r._id, student: { _id: r.studentId || r.student, name: r.studentName, photo: r.studentPhoto, classLabel: r.classLabel, admissionNumber: r.admissionNumber }, reason: r.reason, symptoms: r.symptoms }); }}>Student arrived</Btn> : null}
        {['requested', 'accepted'].includes(r.status) ? <Btn kind="danger" onClick={() => confirm({ title: 'Close this request?', message: 'The teacher is told it was closed, with your reason.', reason: true, reasonLabel: 'Reason', danger: true, confirmLabel: 'Close request', run: async (why) => { await api.cancelMedRequest(r._id, { reason: why }); toast.success('Request closed'); changed?.(); onClose(); } })}>Close</Btn> : null}
      </DrawerFoot>
    </div>
  );
}

/* ── Medicine / supply ────────────────────────────────────────────────────── */

function ItemDrawer({ id, onClose, forms, notify: changed, version, confirm }) {
  const { meta } = useMeta();
  const { data: it, loading, error, reload } = useDetail(api.getMedItem, id);
  useEffect(() => { if (version) reload(); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading && !it) return <Loading onClose={onClose} />;
  if (error && !it) return <Failed error={error} onClose={onClose} />;
  const med = it.kind === 'medicine';
  const low = it.minStock > 0 && it.usable <= it.minStock;
  const placeName = (id) => (id ? (meta?.places || []).find((pl) => pl._id === id)?.name || 'Another place' : (meta?.places || []).find((pl) => pl.isMain)?.name || 'Medical Room');
  const live = (it.batches || []).filter((b) => b.status === 'active' && b.quantity > 0);
  const old = (it.batches || []).filter((b) => !(b.status === 'active' && b.quantity > 0));
  return (
    <div className="mdd">
      <DrawerHead mark={<Mark icon={med ? 'pill' : 'bandage'} tone={it.isActive === false ? 'gray' : low ? 'amber' : 'green'} />} name={`${it.name}${it.strength ? ` ${it.strength}` : ''}`}
        sub={[it.genericName, it.category, it.form].filter(Boolean).join(' · ') || (med ? 'Medicine' : 'First-aid supply')} onClose={onClose}
        tags={<>
          <Badge tone={it.usable <= 0 ? 'red' : low ? 'amber' : 'green'}>{qty(it.usable)} {it.unit} usable</Badge>
          {it.stock > it.usable ? <Badge tone="red" icon="alertTri">{qty(it.stock - it.usable)} expired on the shelf</Badge> : null}
          {it.prescriptionOnly ? <Badge tone="violet">Plan only</Badge> : null}
          {it.controlled ? <Badge tone="red" icon="shieldCheck">Controlled</Badge> : null}
          {it.isActive === false ? <Badge tone="gray">Archived</Badge> : null}
        </>} />
      <DrawerBody>
        <Section title="Details" icon="info">
          <KV items={[['Minimum stock', `${it.minStock} ${it.unit}`], ['Counted in', it.unit], ['Storage', it.storageLocation], ['Supplier', it.supplier], ['Remarks', it.remarks, true]]} />
        </Section>
        <Section title="Batches in stock" icon="package">
          {live.length ? (
            <ul className="mdd-list">
              {live.map((b) => (
                <li key={b._id}>
                  <div><b>{b.batchNumber || 'No batch number'}</b> — {qty(b.quantity)} {it.unit}
                    <em>{placeName(b.location)}{' · '}{b.expiryDate ? `Expires ${fmtDay(b.expiryDate)}` : 'No expiry'}{b.supplier ? ` · ${b.supplier}` : ''}{b.unitCost ? ` · ${money(b.unitCost)} each` : ''}</em></div>
                  <Status of="batch" value={b.state} size="sm" />
                  <Kebab label="Batch actions" items={[
                    { label: 'Move to another place', icon: 'arrowRight', onClick: () => forms.open('transfer', { item: it, from: b.location || '' }) },
                    { label: 'Stock count (adjust)', icon: 'sliders', onClick: () => forms.open('adjust', { batch: b, unit: it.unit }) },
                    { label: b.state === 'expired' ? 'Write off as expired' : 'Mark expired', icon: 'hourglass', onClick: () => forms.open('writeOff', { batch: b, unit: it.unit, type: 'expired' }) },
                    { label: 'Mark damaged', icon: 'alert', onClick: () => forms.open('writeOff', { batch: b, unit: it.unit, type: 'damaged' }) },
                  ]} />
                </li>
              ))}
            </ul>
          ) : <p className="md-muted" style={{ margin: 0 }}>Nothing in stock.</p>}
          {old.length ? <details style={{ marginTop: 10 }}><summary className="md-muted" style={{ cursor: 'pointer', fontSize: '.84rem' }}>{old.length} finished or written-off batch{old.length === 1 ? '' : 'es'}</summary>
            <ul className="mdd-list" style={{ marginTop: 8 }}>{old.map((b) => <li key={b._id}><div><b>{b.batchNumber || 'No batch number'}</b><em>{b.expiryDate ? `Expiry ${fmtDay(b.expiryDate)}` : ''} · received {qty(b.received)}</em></div><Status of="batch" value={b.state} size="sm" /></li>)}</ul></details> : null}
        </Section>
        {it.controlled || (it.counts || []).length ? (
          <Section title="Counts" icon="checkCircle" right={it.isActive !== false ? <Btn size="xs" kind="tint" onClick={() => forms.open('countItem', { item: it })}>Count now</Btn> : null}>
            {(it.counts || []).length ? (
              <ul className="mdd-list">{it.counts.map((c) => (
                <li key={c._id}><div><b>{qty(c.counted)} counted · record {qty(c.expected)}</b><em>{[fmtStamp(c.at), c.countedByName, c.witnessName && `witness ${c.witnessName}`, c.note].filter(Boolean).join(' · ')}</em></div>
                  <Badge tone={c.difference ? 'red' : 'green'} size="sm">{c.difference ? `${c.difference > 0 ? '+' : ''}${qty(c.difference)}` : 'Matches'}</Badge></li>
              ))}</ul>
            ) : <p className="md-muted" style={{ margin: 0 }}>Not counted yet.</p>}
          </Section>
        ) : null}
        {(it.plans || []).length ? <Section title="On medication plans" icon="calendarCheck"><ul className="mdd-list">{it.plans.map((p) => <li key={p._id}><div><b>{p.studentName}</b><em>{p.dosage}</em></div><Status of="plan" value={p.status} size="sm" /></li>)}</ul></Section> : null}
        <Section title="Stock movements" icon="history">
          {(it.moves || []).length ? (
            <ul className="mdd-list">
              {it.moves.slice(0, 25).map((m) => (
                <li key={m._id}>
                  <div><b style={{ color: m.quantity < 0 ? '#b91c1c' : '#15803d' }}>{m.quantity > 0 ? '+' : ''}{qty(m.quantity)}</b> {labelOf(MOVE_TYPE, m.type)}{m.studentName ? ` — ${m.studentName}` : ''}
                    <em>{[fmtStamp(m.createdAt), m.batchNumber && `batch ${m.batchNumber}`, m.reason, m.byName].filter(Boolean).join(' · ')}</em></div>
                  <span className="md-muted" style={{ fontSize: '.78rem', whiteSpace: 'nowrap' }}>= {qty(m.itemBalance)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="md-muted" style={{ margin: 0 }}>No movements yet.</p>}
        </Section>
      </DrawerBody>
      <DrawerFoot>
        {it.isActive !== false ? <Btn kind="primary" icon="plus" onClick={() => forms.open('stockIn', { item: it })}>Receive stock</Btn> : null}
        {it.isActive !== false && it.usable > 0 ? <Btn icon="arrowRight" onClick={() => forms.open('stockOut', { item: it })}>Take out</Btn> : null}
        <Btn icon="pencil" onClick={() => forms.open(it.kind, { item: it })}>Edit</Btn>
        <Kebab items={[
          it.isActive !== false
            ? { label: 'Archive', icon: 'archive', danger: true, onClick: () => confirm({ title: `Archive ${it.name}?`, message: it.stock > 0 ? `${qty(it.stock)} ${it.unit} are still recorded in stock. Archiving keeps them on record but hides the item from the forms.` : 'It is hidden from the forms and kept on record.', danger: true, confirmLabel: 'Archive', run: async () => { await api.archiveMedItem(it._id, true); toast.success('Archived'); reload(); changed?.(); } }) }
            : { label: 'Restore', icon: 'repeat', onClick: async () => { await api.restoreMedItem(it._id); toast.success('Restored'); reload(); changed?.(); } },
        ]} />
      </DrawerFoot>
    </div>
  );
}

/* ── Medication plan ──────────────────────────────────────────────────────── */

function PlanDrawer({ id, onClose, forms, notify: changed, version, confirm }) {
  const { data: p, loading, error, reload } = useDetail(api.getPlan, id);
  useEffect(() => { if (version) reload(); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading && !p) return <Loading onClose={onClose} />;
  if (error && !p) return <Failed error={error} onClose={onClose} />;
  const st = async (status, note) => { try { await api.setPlanStatus(p._id, status, note); toast.success(`Plan ${labelOf(PLAN_STATUS, status).toLowerCase()}`); reload(); changed?.(); } catch (e) { toast.error(errorText(e)); } };
  const authorized = p.parentAuthorization?.authorized;
  return (
    <div className="mdd">
      <DrawerHead mark={<Mark icon="pill" tone={PLAN_STATUS[p.status]?.tone} />} name={`${p.medicineName} — ${p.dosage}`} sub={`${p.student?.name} · ${studentLine(p.student)}`} onClose={onClose}
        tags={<><Status of="plan" value={p.status} />{authorized ? <Badge tone="green" icon="shieldCheck">Parent authorised</Badge> : <Badge tone="amber">Waiting for parent authorisation</Badge>}<Badge tone="slate">{p.source === 'parent' ? "Family's own medicine" : 'School stock'}</Badge></>} />
      <DrawerBody>
        {!authorized ? <Note tone="amber" icon="shieldCheck">No dose is scheduled until the family authorises this medicine. The parent can authorise it from their app, or record a signed consent here.</Note> : null}
        <Section title="Schedule" icon="clock">
          <KV items={[['How often', labelOf(PLAN_FREQUENCY, p.frequency)], ['Times', (p.times || []).join(', ') || 'When needed'],
            ['Days', (p.days || []).map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')], ['From', fmtDay(p.startDate)], ['Until', p.endDate ? fmtDay(p.endDate) : 'Ongoing'],
            ['Route', p.route], ['For', p.reason], ['Per dose', p.source === 'school' ? `${qty(p.quantityPerDose)} from stock` : ''], ['Instructions', p.instructions, true],
            ['Authorised', authorized ? `${p.parentAuthorization.by || 'Parent'} · ${fmtStamp(p.parentAuthorization.at)}` : ''], ['Status note', p.statusNote, true]]} />
        </Section>
        {p.prescriptionDoc ? <Section title="Prescription" icon="fileDoc"><DocButton getLink={api.medDocLink} id={p.prescriptionDoc._id}>{p.prescriptionDoc.title}</DocButton></Section> : null}
        {p.source === 'parent' ? (
          <Section title="The family's supply" icon="package" right={['active', 'paused'].includes(p.status) ? <span className="md-acts">
            <Btn size="xs" kind="tint" onClick={() => forms.open('planSupply', { plan: p, kind: 'received' })}>Handed in</Btn>
            {p.supply?.left ? <Btn size="xs" onClick={() => forms.open('planSupply', { plan: p, kind: 'returned' })}>Handed back</Btn> : null}
          </span> : null}>
            {p.supply?.received ? (
              <>
                <KV items={[['Handed in', qty(p.supply.received)], ['Doses given', String(p.supply.given)], ['Handed back', qty(p.supply.returned)],
                  ['Left at school', p.supply.left == null ? '—' : `${qty(p.supply.left)}${p.supply.doses != null ? ` (${p.supply.doses} dose${p.supply.doses === 1 ? '' : 's'})` : ''}`]]} />
                {p.supply.doses != null && p.supply.doses <= 3 ? <Note tone={p.supply.doses ? 'amber' : 'red'} icon="alertTri">{p.supply.doses ? `${p.supply.doses} dose${p.supply.doses === 1 ? '' : 's'} left — the family has been asked for more.` : 'None left — the next dose cannot be given until the family sends more.'}</Note> : null}
              </>
            ) : <p className="md-muted" style={{ margin: 0 }}>Record what the family hands in, and the Medical Room keeps count — the family is asked for more when three doses are left.</p>}
          </Section>
        ) : null}
        <Section title="Administration history" icon="history">
          {(p.doses || []).length ? (
            <ul className="mdd-list">{p.doses.slice(0, 40).map((d) => (
              <li key={d._id}><div><b>{fmtStamp(d.givenAt || d.scheduledFor)}</b><em>{[d.givenByName, d.note].filter(Boolean).join(' · ')}</em></div><Status of="dose" value={d.status} size="sm" /></li>
            ))}</ul>
          ) : <p className="md-muted" style={{ margin: 0 }}>No doses yet.</p>}
        </Section>
      </DrawerBody>
      <DrawerFoot>
        {!authorized && !['completed', 'cancelled'].includes(p.status) ? <Btn kind="primary" icon="shieldCheck" onClick={() => confirm({ title: 'Record parent authorisation', message: 'Record that the family has authorised this medicine (for example on a signed consent form).', reason: true, reasonLabel: 'Authorised by', reasonPlaceholder: 'e.g. Rahul Sharma (father), consent form', confirmLabel: 'Record authorisation', run: async (by) => { await api.authorizePlan(p._id, by); toast.success('Authorisation recorded'); reload(); changed?.(); } })}>Record authorisation</Btn> : null}
        {p.status === 'active' ? <Btn kind="primary" icon="pill" onClick={() => forms.open('giveDose', { student: p.student, plan: p })}>Give a dose now</Btn> : null}
        <MenuBtn label="Plan" items={[
          ['active', 'paused'].includes(p.status) ? { label: 'Edit the plan', icon: 'pencil', onClick: () => forms.open('planEdit', { plan: p }) } : null,
          p.status === 'active' ? { label: 'Pause', icon: 'clock', onClick: () => st('paused') } : null,
          p.status === 'paused' && authorized ? { label: 'Resume', icon: 'repeat', onClick: () => st('active') } : null,
          ['active', 'paused'].includes(p.status) ? { label: 'Mark completed', icon: 'checkCircle', onClick: () => st('completed') } : null,
          ['active', 'paused'].includes(p.status) ? { label: 'Cancel the plan', icon: 'close', danger: true, onClick: () => confirm({ title: 'Cancel this plan?', message: 'Doses still to come are cancelled. The history stays.', reason: true, reasonLabel: 'Why', danger: true, confirmLabel: 'Cancel plan', run: async (why) => { await api.setPlanStatus(p._id, 'cancelled', why); reload(); changed?.(); } }) } : null,
        ]}>Plan</MenuBtn>
      </DrawerFoot>
    </div>
  );
}

/* ── Equipment ────────────────────────────────────────────────────────────── */

function EquipmentDrawer({ id, onClose, forms, notify: changed, version, confirm }) {
  const { data: e, loading, error, reload } = useDetail(api.getEquipment, id);
  useEffect(() => { if (version) reload(); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading && !e) return <Loading onClose={onClose} />;
  if (error && !e) return <Failed error={error} onClose={onClose} />;
  return (
    <div className="mdd">
      <DrawerHead mark={<Mark icon="wrench" tone={EQUIP_STATUS[e.status]?.tone} />} name={e.name} sub={[labelOf(EQUIP_TYPE, e.type), e.serialNumber, e.location].filter(Boolean).join(' · ')} onClose={onClose}
        tags={<><Status of="equipStatus" value={e.status} /><Badge tone={EQUIP_CONDITION[e.condition]?.tone}>Condition: {labelOf(EQUIP_CONDITION, e.condition)}</Badge></>} />
      <DrawerBody>
        <Section title="Details" icon="info">
          <KV items={[['Quantity', e.quantity], ['Vendor', e.vendor], ['Purchased', fmtDay(e.purchaseDate)], ['Warranty until', fmtDay(e.warrantyUntil)],
            ['Last maintenance', fmtDay(e.lastMaintenanceOn)], ['Next maintenance', fmtDay(e.nextMaintenanceOn)], ['Remarks', e.remarks, true]]} />
        </Section>
        <Section title="History" icon="history">
          <ul className="mdd-list">{[...(e.log || [])].reverse().map((l, i) => (
            <li key={i}><div><b>{l.kind === 'maintenance' ? 'Maintenance' : l.kind === 'status' ? 'Status' : l.kind === 'condition' ? 'Condition' : 'Note'}</b> — {l.note}<em>{[l.date ? fmtDay(l.date) : fmtStamp(l.at), l.byName, l.cost ? money(l.cost) : ''].filter(Boolean).join(' · ')}</em></div></li>
          ))}</ul>
        </Section>
      </DrawerBody>
      <DrawerFoot>
        {!e.archivedAt ? <Btn kind="primary" icon="wrench" onClick={() => forms.open('maintenance', { equipment: e })}>Record maintenance</Btn> : null}
        <Btn icon="pencil" onClick={() => forms.open('equipment', { equipment: e })}>Edit</Btn>
        {!e.archivedAt ? <Kebab items={[{ label: 'Retire', icon: 'archive', danger: true, onClick: () => confirm({ title: `Retire ${e.name}?`, reason: true, reasonLabel: 'Why', danger: true, confirmLabel: 'Retire', run: async (why) => { await api.archiveEquipment(e._id, why); toast.success('Retired'); reload(); changed?.(); } }) }]} /> : null}
      </DrawerFoot>
    </div>
  );
}

/* ── First aid ────────────────────────────────────────────────────────────── */

function FirstAidDrawer({ id, onClose, confirm, notify: changed, nav }) {
  const { data: f, loading, error } = useDetail(api.getFirstAid, id);
  if (loading && !f) return <Loading onClose={onClose} />;
  if (error && !f) return <Failed error={error} onClose={onClose} />;
  return (
    <div className="mdd">
      <DrawerHead mark={<Mark icon="firstAid" tone="violet" />} name={f.student?.name} sub={`First aid · ${fmtStamp(f.at)}`} onClose={onClose} />
      <DrawerBody>
        <Section title="First aid" icon="firstAid"><KV cols={1} items={[['Reason', f.reason], ['Injury / symptoms', f.injury], ['First aid provided', f.treatment], ['Given by', f.givenByName], ['Remarks', f.remarks]]} /></Section>
        {(f.supplies || []).length ? <Section title="Supplies used" icon="bandage"><ul className="mdd-list">{f.supplies.map((s, i) => <li key={i}><div><b>{qty(s.quantity)} {s.unit}</b> {s.name}</div></li>)}</ul></Section> : null}
      </DrawerBody>
      <DrawerFoot>
        <Btn icon="user" onClick={() => nav(`${BASE}/students/${f.student?._id}`)}>Medical profile</Btn>
        <Kebab items={[{ label: 'Archive', icon: 'archive', danger: true, onClick: () => confirm({ title: 'Archive this first-aid record?', message: 'The supplies stay recorded as used.', reason: true, reasonLabel: 'Why', danger: true, confirmLabel: 'Archive', run: async (why) => { await api.archiveMedCase('first-aid', f._id, why); toast.success('Archived'); onClose(); changed?.(); } }) }]} />
      </DrawerFoot>
    </div>
  );
}

/* ── The hook ─────────────────────────────────────────────────────────────── */

/**
 * `forms` is the page's useMedForms. `onChange` reloads the page's list after
 * anything in a drawer changed. Forms opened from a drawer report back through
 * the page's onDone, which should call `drawer.refresh()`.
 */
export function useMedDrawer({ forms, onChange }) {
  const [cur, setCur] = useState(null);   // { kind, id, row }
  const [version, setVersion] = useState(0);
  const [ask, setAsk] = useState(null);
  const nav = useNavigate();
  const close = useCallback(() => setCur(null), []);
  const show = useCallback((kind, id, row) => setCur({ kind, id, row }), []);
  // A drawer that changed something tells the page (its list reloads); a form
  // finished elsewhere bumps `version` (the open drawer reloads itself).
  const notify = useCallback(() => onChange?.(), [onChange]);
  const confirm = useCallback((opts) => setAsk(opts), []);
  const props = { id: cur?.id, row: cur?.row, onClose: close, forms, notify, version, confirm, nav, openOther: show };
  const body = !cur ? null
    : cur.kind === 'visit' ? <VisitDrawer key={`v${cur.id}`} {...props} />
    : cur.kind === 'incident' ? <IncidentDrawer key={`i${cur.id}`} {...props} />
    : cur.kind === 'request' ? <RequestDrawer key={`r${cur.id}`} {...props} />
    : cur.kind === 'item' ? <ItemDrawer key={`m${cur.id}`} {...props} />
    : cur.kind === 'plan' ? <PlanDrawer key={`p${cur.id}`} {...props} />
    : cur.kind === 'equipment' ? <EquipmentDrawer key={`e${cur.id}`} {...props} />
    : cur.kind === 'first_aid' ? <FirstAidDrawer key={`f${cur.id}`} {...props} />
    : null;
  const element = (
    <>
      {/* While a confirmation is up, Escape belongs to it, not to the drawer under it. */}
      <Drawer open={!!cur} onClose={ask ? () => {} : close} label="Medical record">{body}</Drawer>
      <ConfirmDialog open={!!ask} onClose={() => setAsk(null)} title={ask?.title} message={ask?.message} reason={ask?.reason} reasonLabel={ask?.reasonLabel}
        reasonPlaceholder={ask?.reasonPlaceholder} confirmLabel={ask?.confirmLabel} danger={ask?.danger}
        onConfirm={async (text) => { try { await ask.run(text); setAsk(null); } catch (e) { throw new Error(errorText(e)); } }} />
    </>
  );
  return { show, close, element, refresh: () => setVersion((t) => t + 1), confirm, current: cur };
}

/* ── The workspace every staff screen uses ────────────────────────────────── */

/**
 * The lists, the forms and the drawer of a staff screen, wired together: a
 * form finished from anywhere reloads the page (`reload`) and the open drawer.
 * Render `elements` once.
 */
export function useMedWorkspace(reload) {
  const { meta, refresh } = useMeta();
  const drawerRef = useRef(null);
  const forms = useMedForms({ meta, refreshMeta: refresh, onDone: (...a) => { reload?.(...a); drawerRef.current?.refresh(); } });
  const drawer = useMedDrawer({ forms, onChange: reload });
  drawerRef.current = drawer;
  // SafetyHost: the one place the dose safety check asks why a stopped dose should go ahead.
  return { meta, refreshMeta: refresh, forms, drawer, elements: <>{drawer.element}{forms.element}<SafetyHost /></> };
}

/* ── Search ───────────────────────────────────────────────────────────────── */

/** One box for the whole module: students, conditions, allergies, blood groups, medicines, incidents, visits. */
export function MedSearch({ onPick, placeholder = 'Search students, allergies, conditions, medicines, visits…' }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const term = useDebounced(q, 250);
  const box = useRef(null);
  const nav = useNavigate();
  useEffect(() => {
    if (term.trim().length < 2) { setRes(null); return undefined; }
    let alive = true;
    api.searchMedical(term).then((r) => alive && setRes(r?.data ?? r)).catch(() => alive && setRes({ groups: [], total: 0 }));
    return () => { alive = false; };
  }, [term]);
  useEffect(() => {
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  const go = (it) => {
    setOpen(false);
    if (onPick && onPick(it) !== false) return;
    if (it.kind === 'student' || it.kind === 'condition' || it.kind === 'allergy') nav(`${BASE}/students/${it.student || it.id}`);
    else if (it.kind === 'incident') nav(`${BASE}/incidents?tab=all&focus=${it.id}`);
    else if (it.kind === 'visit') nav(`${BASE}/visits?tab=all&focus=${it.id}`);
    else if (it.kind === 'request') nav(`${BASE}/requests?tab=all&focus=${it.id}`);
    else if (it.kind === 'medicine') nav(`${BASE}/medicines/inventory?focus=${it.id}`);
    else if (it.kind === 'supply') nav(`${BASE}/inventory?focus=${it.id}`);
  };
  return (
    <div className="mdx-search" ref={box}>
      <SearchBox value={q} onChange={(v) => { setQ(v); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={placeholder} label="Search the Medical Room" />
      {open && res && term.trim().length >= 2 ? (
        <div className="mds-results" role="listbox">
          {!res.groups.length ? <div className="md-picker__empty">Nothing matches “{res.term}”</div> : res.groups.map((g) => (
            <div key={g.key} className="mds-group">
              <h5>{g.label}</h5>
              {g.items.map((it) => (
                <button key={`${g.key}:${it.id}`} type="button" onClick={() => go(it)}>
                  {it.kind === 'student' ? <Person name={it.title} photo={it.photo} size={30} sub={it.sub} /> : (
                    <span className="md-two"><b>{it.title}</b><em>{it.sub}</em></span>
                  )}
                  {it.badge ? <Badge tone={it.badge.tone} size="sm">{it.badge.label}</Badge> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export { Table, Person };
