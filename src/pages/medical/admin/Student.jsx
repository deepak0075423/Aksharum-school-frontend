/**
 * A student's medical profile (Oct 2026) — everything the medical room keeps
 * about one child, with the alerts first.
 *
 *   overview       the profile, the alert area, contacts, doctor and hospital
 *   history        the timeline of every record
 *   allergies · conditions · medication · vaccinations · checkups · documents
 *   updates        what the parents have sent
 *   access         who opened or changed this record (the audit trail)
 *
 * Opening the page is recorded in the audit trail (the server does it).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import {
  Page, Btn, Badge, Status, Panel, LineTabs, Avatar, AlertArea, KV, Empty, Spin, LoadError, Kebab, MenuBtn, Ico, Table, Note, useLoad,
} from '../mdUI';
import { Timeline, DocButton, openDocument } from '../mdShared';
import {
  ALLERGY_CATEGORY, CONDITION_TYPE, PLAN_FREQUENCY, VACCINATION_STATUS, CHECKUP_TYPE, DOC_TYPE, CHANGE_KIND,
  CARE_PLAN_KIND, RESCUE_KIND, RESCUE_PLACE, rescueState, RESTRICTION_KIND, RESTRICTION_STATE, EXCLUSION_STATUS,
  fmtDay, fmtDate, fmtStamp, ago, labelOf, fileSize, errorText, plural, checkupLine, telOf, todayStr, addDays,
} from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useExclusionRules } from './mdForms';
import { openHistoryItem } from './History';
import { ConsentDialog, ConsentSummary, ConsentBadge } from '../consentParts';
import { GrowthPanel, GrowthLine } from '../growthParts';
import { ScheduleList, ExemptionDialog, ReferralList, ReferralDialog, ReferralDetail } from '../programmeParts';

// A checkup's type → who a child it refers is sent to (as the server does for "Referred").
const REFER_TO = { vision: 'eye', hearing: 'ent', dental: 'dental', bmi: 'nutrition', weight: 'nutrition', height: 'paediatric', bp: 'paediatric' };

const live = (r) => !r.archivedAt;
// A review date: past → red, within a month → amber.
const dueTone = (d) => { const x = String(d || '').slice(0, 10); if (!x) return 'slate'; if (x < todayStr()) return 'red'; return x <= addDays(todayStr(), 30) ? 'amber' : 'slate'; };
const places = (m) => (m.locations || []).map((l) => `${labelOf(RESCUE_PLACE, l.place)}${l.note ? ` (${l.note})` : ''}`).join(', ');

function Rec({ critical, off, title, badges, lines = [], actions }) {
  return (
    <div className={`mdp-rec${critical ? ' is-critical' : ''}${off ? ' is-off' : ''}`}>
      <div className="mdp-rec__main">
        <div className="mdp-rec__top"><b>{title}</b>{badges}</div>
        {lines.filter(Boolean).length ? <div className="mdp-rec__lines">{lines.filter(Boolean).map((l, i) => <span key={i}>{l}</span>)}</div> : null}
      </div>
      {actions}
    </div>
  );
}

export default function MedicalStudent() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const { data: r, loading, error, reload } = useLoad(() => api.getMedStudent(id), id);
  const { meta, forms, drawer, elements } = useMedWorkspace(reload);
  const rules = useExclusionRules();
  const [paper, setPaper] = useState(false);
  const [exempt, setExempt] = useState(null);
  const [refer, setRefer] = useState(null);        // { preset } — the referral form
  const [openRef, setOpenRef] = useState(null);
  usePageCrumbs(r?.student ? [{ label: r.student.name }] : []);
  const setTab = (t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true });
  const historyFetcher = useCallback((q) => api.getMedHistory(id, q), [id]);
  const auditBoard = useLoad(() => (tab === 'access' ? api.getMedBoard('audit', { student: id, limit: 50 }) : Promise.resolve(null)), { tab, id });

  const act = async (fn, ok) => { try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error(errorText(e)); } };
  const archive = (kind, row, label) => drawer.confirm({
    title: `Archive this ${label}?`, message: 'It leaves the profile and is kept for the record — it can be restored.', reason: true, reasonLabel: 'Why', danger: true, confirmLabel: 'Archive',
    run: async (why) => { await api.archiveMedRecord(kind, row._id, why); toast.success('Archived'); reload(); },
  });

  const tabs = useMemo(() => {
    if (!r) return [];
    const n = (list) => (list || []).filter(live).length;
    return [
      { key: 'overview', label: 'Overview' },
      { key: 'history', label: 'Medical History' },
      { key: 'allergies', label: 'Allergies', count: r.summary.allergies },
      { key: 'conditions', label: 'Conditions', count: r.summary.conditions },
      { key: 'care', label: 'Emergency Care', count: (r.carePlans || []).filter((c) => live(c) && c.status === 'active').length + (r.rescueMeds || []).filter((m) => live(m) && m.status === 'active').length },
      { key: 'limits', label: 'Limits & Time Off', count: (r.restrictions || []).filter((x) => x.state === 'active').length + (r.exclusions || []).filter((x) => x.status === 'excluded').length },
      { key: 'medication', label: 'Medication', count: r.summary.medications },
      { key: 'vaccinations', label: 'Vaccinations', count: n(r.vaccinations) },
      { key: 'checkups', label: 'Checkups', count: n(r.checkups) },
      { key: 'growth', label: 'Growth' },
      { key: 'documents', label: 'Documents', count: n(r.documents) },
      { key: 'updates', label: 'Parent Updates', count: r.summary.pendingChanges },
      { key: 'access', label: 'Access Log' },
    ];
  }, [r]);

  if (loading && !r) return <Page><Spin /></Page>;
  if (error && !r) return <Page><LoadError error={error} onRetry={reload} title="This medical profile could not be opened" /></Page>;
  const s = r.student;
  const p = r.profile || {};
  const activeRescue = (r.rescueMeds || []).filter((m) => live(m) && m.status === 'active');
  const activePlans = (r.carePlans || []).filter((c) => live(c) && c.status === 'active');
  const vit = [['Blood group', r.bloodGroup || '—', 'is-blood'], ['Height', p.heightCm ? `${p.heightCm} cm` : '—'], ['Weight', p.weightKg ? `${p.weightKg} kg` : '—'], ['BMI', p.bmi ?? '—']];

  return (
    <Page className="mdp">
      <section className="mdp-hero">
        <div className="mdp-hero__photo"><Avatar name={s.name} photo={s.photo} size={84} tone="rose" /></div>
        <div style={{ minWidth: 0 }}>
          <h1 className="mdp-hero__name">{s.name}</h1>
          <div className="mdp-hero__line">
            <span><b>{s.classLabel || 'No class yet'}</b></span>
            <span>Admission No. <b>{s.admissionNumber || '—'}</b></span>
            <span>Student ID <b>{s.code || s.admissionNumber || '—'}</b></span>
            {s.rollNumber ? <span>Roll No. <b>{s.rollNumber}</b></span> : null}
            <span>Born <b>{s.dob ? `${fmtDay(s.dob)}${s.age != null ? ` (${s.age})` : ''}` : '—'}</b></span>
            {s.gender ? <span><b>{s.gender}</b></span> : null}
          </div>
          <div className="mdp-hero__line">
            {r.openVisit ? <Badge tone="blue" icon="bed">In the Medical Room now — {r.openVisit.number}</Badge> : null}
            {r.lastVisit && !r.openVisit ? <span>Last visit <b>{ago(r.lastVisit.arrivedAt)}</b> ({r.lastVisit.reason})</span> : null}
            <span>{plural(r.counts.visits, 'visit')} · {plural(r.counts.incidents, 'incident')} · {plural(r.counts.doses, 'dose')} given</span>
            {p.reviewedAt ? <span>Profile reviewed <b>{fmtDate(p.reviewedAt)}</b></span> : <Badge tone="amber" size="sm">Profile not reviewed yet</Badge>}
            <GrowthLine growth={r.growth} keys={['bmi']} />
          </div>
        </div>
        <div className="mdp-hero__facts">
          {vit.map(([k, v, c]) => <div key={k} className={`mdp-fact ${c || ''}`}><span>{k}</span><strong>{v}</strong></div>)}
        </div>
        <div className="mdp-hero__acts">
          {r.openVisit
            ? <Btn kind="primary" icon="stethoscope" onClick={() => drawer.show('visit', r.openVisit._id)}>Open the visit</Btn>
            : <Btn kind="primary" icon="stethoscope" onClick={() => forms.open('visit', { student: s })}>Add Medical Visit</Btn>}
          <Btn icon="pencil" onClick={() => forms.open('profile', { record: r })}>Edit profile</Btn>
          <Btn kind="danger" icon="siren" onClick={() => nav(`/admin/medical/health/emergency?student=${s._id}`)}>Emergency card</Btn>
          <MenuBtn kind="outline" label="Print" items={[
            { label: 'Health summary', icon: 'printer', onClick: () => api.downloadPdf(api.healthSummaryUrl(s._id), `health-summary-${s.name}.pdf`).catch((e) => toast.error(errorText(e))) },
            { label: 'Annual health card', icon: 'printer', onClick: () => api.downloadPdf(api.annualCardUrl(s._id), `health-card-${s.name}.pdf`).catch((e) => toast.error(errorText(e))) },
          ]}>Print</MenuBtn>
          <MenuBtn kind="outline" label="Add" items={[
            { label: 'Allergy', icon: 'alertTri', onClick: () => forms.open('allergy', { studentId: s._id }) },
            { label: 'Medical condition', icon: 'heartPulse', onClick: () => forms.open('condition', { studentId: s._id }) },
            { label: 'Medication plan', icon: 'pill', onClick: () => forms.open('plan', { student: s }) },
            { label: 'Emergency care plan', icon: 'heartPulse', onClick: () => forms.open('carePlan', { studentId: s._id, rescueMeds: activeRescue }) },
            { label: 'Rescue medicine', icon: 'syringe', onClick: () => forms.open('rescueMed', { studentId: s._id }) },
            { label: 'Restriction for teachers', icon: 'ban', onClick: () => forms.open('restriction', { studentId: s._id, studentName: s.name }) },
            { label: 'Off school', icon: 'calendarCheck', onClick: () => forms.open('exclusion', { studentId: s._id, studentName: s.name, rules }) },
            { label: 'Vaccination', icon: 'syringe', onClick: () => forms.open('vaccination', { studentId: s._id }) },
            { label: 'Health checkup', icon: 'clipboard', onClick: () => forms.open('checkup', { student: s }) },
            { label: 'Document', icon: 'upload', onClick: () => forms.open('document', { studentId: s._id }) },
            '-',
            { label: 'Medical incident', icon: 'alert', onClick: () => forms.open('incident', { student: s }) },
            { label: 'First aid', icon: 'firstAid', onClick: () => forms.open('firstAid', { student: s }) },
          ]}>Add</MenuBtn>
        </div>
      </section>

      <AlertArea alerts={r.alerts} instructions={p.instructions} />

      <Panel pad={false}>
        <div className="md-listhead"><LineTabs items={tabs} value={tab} onChange={setTab} /></div>
        <div className="md-panel__body">
          {tab === 'overview' ? (
            <div className="md-grid md-grid--even">
              <div className="md-col">
                <section>
                  <h3 className="mdp-h"><Ico name="shieldCheck" size={16} /> Parents&rsquo; consent{r.consentYear ? ` for ${r.consentYear.yearName}` : ''} <ConsentBadge consent={r.consent} /></h3>
                  <ConsentSummary consent={r.consent} year={r.consentYear} />
                  {(r.rescueMeds || []).some((m) => live(m) && m.status === 'active' && m.selfCarry) && !(r.consent?.status === 'given' && r.consent.selfCarry)
                    ? <Note tone="amber" icon="alertTri">A rescue medicine is marked as carried by the student, but the parents have not agreed to it this year.</Note> : null}
                  <div className="mdp-tabhead" style={{ marginTop: 8 }}>
                    <Btn size="sm" kind="tint" icon="upload" onClick={() => setPaper(true)}>Record a paper form</Btn>
                    {r.consent?.status === 'given' ? <Btn size="sm" onClick={() => drawer.confirm({ title: 'Withdraw the consent?', reason: true, reasonLabel: 'Why', danger: true, confirmLabel: 'Withdraw',
                      run: async (why) => { await api.withdrawConsentAdmin(r.consent._id, why); toast.success('Withdrawn'); reload(); } })}>Withdraw</Btn> : null}
                  </div>
                </section>
                <section>
                  <h3 className="mdp-h"><Ico name="alertTri" size={16} /> Allergies</h3>
                  {r.allergies.filter(live).length ? r.allergies.filter(live).map((a) => (
                    <Rec key={a._id} critical={['severe', 'life_threatening'].includes(a.severity) && a.status !== 'resolved'} off={a.status === 'resolved'} title={a.allergen}
                      badges={<><Status of="allergySeverity" value={a.severity} size="sm" />{a.status === 'resolved' ? <Badge size="sm" tone="slate">Resolved</Badge> : null}</>}
                      lines={[a.reaction, a.emergencyInstructions && <><strong>If exposed:</strong> {a.emergencyInstructions}</>]} />
                  )) : <p className="md-muted">No allergies on record.</p>}
                </section>
                <section>
                  <h3 className="mdp-h"><Ico name="heartPulse" size={16} /> Medical and chronic conditions</h3>
                  {r.conditions.filter(live).length ? r.conditions.filter(live).map((c) => (
                    <Rec key={c._id} critical={['severe', 'critical'].includes(c.severity) && c.status !== 'resolved'} off={c.status === 'resolved'} title={c.condition}
                      badges={<><Status of="conditionSeverity" value={c.severity} size="sm" />{c.chronic ? <Badge size="sm" tone="violet">Chronic</Badge> : null}<Status of="conditionStatus" value={c.status} size="sm" /></>}
                      lines={[c.treatment, c.medication && <><strong>Medication:</strong> {c.medication}</>]} />
                  )) : <p className="md-muted">No conditions on record.</p>}
                </section>
                <section>
                  <h3 className="mdp-h"><Ico name="pill" size={16} /> Current medication</h3>
                  {r.plans.filter((x) => ['active', 'paused'].includes(x.status)).length ? r.plans.filter((x) => ['active', 'paused'].includes(x.status)).map((x) => (
                    <Rec key={x._id} title={`${x.medicineName} — ${x.dosage}`} badges={<Status of="plan" value={x.status} size="sm" />}
                      lines={[`${labelOf(PLAN_FREQUENCY, x.frequency)}${(x.times || []).length ? ` at ${x.times.join(', ')}` : ''}`, x.instructions]}
                      actions={<Btn size="sm" kind="tint" onClick={() => drawer.show('plan', x._id)}>Open</Btn>} />
                  )) : <p className="md-muted">No medication at school.</p>}
                  {p.emergencyMedication?.required && !activeRescue.length ? <Note tone="red" icon="syringe"><b>Emergency medication:</b> {p.emergencyMedication.name}{p.emergencyMedication.location ? ` — kept ${p.emergencyMedication.location}` : ''}</Note> : null}
                </section>
                {activeRescue.length || activePlans.length ? (
                  <section>
                    <h3 className="mdp-h"><Ico name="heartPulse" size={16} /> Emergency care</h3>
                    {activePlans.map((c) => (
                      <Rec key={c._id} critical title={`Care plan: ${c.title}`} badges={c.parentConfirmedAt ? <Badge size="sm" tone="green">Parent confirmed</Badge> : <Badge size="sm" tone="amber">Waiting for the parent</Badge>}
                        lines={[(c.steps || []).filter((x) => x.critical).map((x) => x.text).slice(0, 3).join(' → ')]}
                        actions={<Btn size="sm" kind="tint" onClick={() => setTab('care')}>Open</Btn>} />
                    ))}
                    {activeRescue.map((m) => (
                      <Rec key={m._id} critical={rescueState(m) === 'expired'} title={m.name}
                        badges={rescueState(m) ? <Status of="rescue" value={rescueState(m)} size="sm" /> : null}
                        lines={[places(m) && <><strong>Kept:</strong> {places(m)}</>, m.expiresOn && `Expires ${fmtDay(m.expiresOn)}`]} />
                    ))}
                  </section>
                ) : null}
                <section>
                  <h3 className="mdp-h"><Ico name="clipboard" size={16} /> Diet and instructions</h3>
                  <KV cols={1} keep items={[['Dietary restrictions', p.dietaryRestrictions], ['Important medical instructions', p.instructions], ['Private notes (staff only)', p.privateNotes]]} />
                </section>
              </div>
              <div className="md-col">
                <section>
                  <h3 className="mdp-h"><Ico name="phone" size={16} /> Emergency contacts</h3>
                  <div className="mdp-contacts">
                    {r.contacts.length ? r.contacts.map((c, i) => (
                      <div key={`${c.phone}-${i}`} className="mdp-contact">
                        <span><Ico name={c.kind === 'parent' ? 'users' : 'phone'} size={16} /></span>
                        <div style={{ minWidth: 0 }}><b>{c.name || '—'}</b><em>{c.relation}</em>{c.phone ? <a href={`tel:${telOf(c.phone)}`}><Ico name="phone" size={13} />{c.phone}</a> : <em>No phone</em>}</div>
                      </div>
                    )) : <p className="md-muted">No contacts on record. Add an emergency contact in the profile.</p>}
                  </div>
                </section>
                <section>
                  <h3 className="mdp-h"><Ico name="stethoscope" size={16} /> Doctor and hospital</h3>
                  <KV cols={1} keep items={[
                    ['Family doctor', p.doctor?.name ? [p.doctor.name, p.doctor.clinic, p.doctor.phone].filter(Boolean).join(' · ') : ''],
                    ['Preferred hospital', p.hospital?.name ? [p.hospital.name, p.hospital.phone, p.hospital.address].filter(Boolean).join(' · ') : ''],
                  ]} />
                </section>
                <section>
                  <h3 className="mdp-h"><Ico name="syringe" size={16} /> Vaccinations</h3>
                  {r.vaccinations.length ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {r.vaccinations.slice(0, 10).map((v) => <Badge key={v._id} tone={VACCINATION_STATUS[v.state]?.tone}>{v.vaccine}{v.dose ? ` ${v.dose}` : ''} · {labelOf(VACCINATION_STATUS, v.state)}</Badge>)}
                    </div>
                  ) : <p className="md-muted">No vaccinations on record.</p>}
                </section>
                <section>
                  <h3 className="mdp-h"><Ico name="clipboard" size={16} /> Latest checkup</h3>
                  {r.checkups.find((k) => k.status === 'completed') ? (() => {
                    const k = r.checkups.find((x) => x.status === 'completed');
                    return <Rec title={`${labelOf(CHECKUP_TYPE, k.type)} — ${fmtDay(k.checkedOn)}`} badges={k.outcome ? <Status of="checkupOutcome" value={k.outcome} size="sm" /> : null} lines={[k.findings, k.recommendations]} />;
                  })() : <p className="md-muted">No checkups recorded.</p>}
                </section>
              </div>
            </div>
          ) : null}

          {tab === 'history' ? <Timeline fetcher={historyFetcher} years={meta?.years || []} onOpen={openHistoryItem(drawer, nav)} compact /> : null}

          {tab === 'allergies' ? (
            <>
              <div className="mdp-tabhead"><Btn kind="primary" icon="plus" onClick={() => forms.open('allergy', { studentId: s._id })}>Add allergy</Btn></div>
              {r.allergies.length ? r.allergies.map((a) => (
                <Rec key={a._id} critical={['severe', 'life_threatening'].includes(a.severity) && a.status !== 'resolved' && !a.archivedAt} off={a.status === 'resolved' || a.archivedAt} title={a.allergen}
                  badges={<>
                    <Status of="allergySeverity" value={a.severity} size="sm" /><Badge size="sm" tone="slate">{labelOf(ALLERGY_CATEGORY, a.category)}</Badge>
                    {a.status === 'resolved' ? <Badge size="sm" tone="slate">Resolved</Badge> : null}
                    {a.archivedAt ? <Badge size="sm" tone="gray">Archived — {a.archiveReason}</Badge> : null}
                    {a.source === 'parent' ? <Badge size="sm" tone="indigo">From parent</Badge> : null}
                    {!a.verified ? <Badge size="sm" tone="amber">Not verified</Badge> : null}
                    {a.shareWithTeachers === false ? <Badge size="sm" tone="gray">Not shown to teachers</Badge> : <Badge size="sm" tone="blue">Teachers see it</Badge>}
                  </>}
                  lines={[a.reaction && <><strong>Reaction:</strong> {a.reaction}</>, a.emergencyInstructions && <><strong>If exposed:</strong> {a.emergencyInstructions}</>, a.medication && <><strong>Medication:</strong> {a.medication}</>, a.doctor && <><strong>Doctor:</strong> {a.doctor}</>, a.parentNote && <><strong>Family says:</strong> {a.parentNote}</>, `Recorded ${fmtDate(a.createdAt)}`]}
                  actions={<Kebab items={a.archivedAt ? [{ label: 'Restore', icon: 'repeat', onClick: () => act(() => api.restoreMedRecord('allergies', a._id), 'Restored') }] : [
                    { label: 'Edit', icon: 'pencil', onClick: () => forms.open('allergy', { allergy: a }) },
                    !a.verified ? { label: 'Mark verified', icon: 'checkCircle', onClick: () => act(() => api.verifyMedRecord('allergies', a._id), 'Verified') } : null,
                    a.status !== 'resolved' ? { label: 'No longer applies', icon: 'checkSquare', onClick: () => act(() => api.updateAllergy(a._id, { status: 'resolved' }), 'Marked resolved') } : { label: 'Applies again', icon: 'repeat', onClick: () => act(() => api.updateAllergy(a._id, { status: 'active' }), 'Marked active') },
                    '-', { label: 'Archive (entered by mistake)', icon: 'archive', danger: true, onClick: () => archive('allergies', a, 'allergy') },
                  ]} />} />
              )) : <Empty compact title="No allergies on record">Add one here; parents can also send them for approval.</Empty>}
            </>
          ) : null}

          {tab === 'conditions' ? (
            <>
              <div className="mdp-tabhead"><Btn kind="primary" icon="plus" onClick={() => forms.open('condition', { studentId: s._id })}>Add condition</Btn></div>
              {r.conditions.length ? r.conditions.map((c) => (
                <Rec key={c._id} critical={['severe', 'critical'].includes(c.severity) && c.status !== 'resolved' && !c.archivedAt} off={c.status === 'resolved' || c.archivedAt} title={c.condition}
                  badges={<>
                    <Status of="conditionSeverity" value={c.severity} size="sm" /><Badge size="sm" tone="slate">{labelOf(CONDITION_TYPE, c.type)}</Badge><Status of="conditionStatus" value={c.status} size="sm" />
                    {c.chronic ? <Badge size="sm" tone="violet">Chronic</Badge> : null}
                    {c.archivedAt ? <Badge size="sm" tone="gray">Archived — {c.archiveReason}</Badge> : null}
                    {c.source === 'parent' ? <Badge size="sm" tone="indigo">From parent</Badge> : null}
                    {c.shareWithTeachers === false ? <Badge size="sm" tone="gray">Not shown to teachers</Badge> : <Badge size="sm" tone="blue">Teachers see it</Badge>}
                  </>}
                  lines={[c.diagnosedOn && `Diagnosed ${fmtDay(c.diagnosedOn)}`, c.treatment && <><strong>Treatment:</strong> {c.treatment}</>, c.medication && <><strong>Medication:</strong> {c.medication}</>, c.emergencyInstructions && <><strong>In an emergency:</strong> {c.emergencyInstructions}</>, c.doctor && <><strong>Doctor:</strong> {c.doctor}</>]}
                  actions={<Kebab items={c.archivedAt ? [{ label: 'Restore', icon: 'repeat', onClick: () => act(() => api.restoreMedRecord('conditions', c._id), 'Restored') }] : [
                    { label: 'Edit', icon: 'pencil', onClick: () => forms.open('condition', { condition: c }) },
                    !c.verified ? { label: 'Mark verified', icon: 'checkCircle', onClick: () => act(() => api.verifyMedRecord('conditions', c._id), 'Verified') } : null,
                    '-', { label: 'Archive (entered by mistake)', icon: 'archive', danger: true, onClick: () => archive('conditions', c, 'condition') },
                  ]} />} />
              )) : <Empty compact title="No conditions on record" />}
            </>
          ) : null}

          {tab === 'care' ? (
            <>
              <div className="mdp-tabhead">
                <Btn kind="primary" icon="plus" onClick={() => forms.open('carePlan', { studentId: s._id, rescueMeds: activeRescue })}>New care plan</Btn>
                <Btn icon="syringe" onClick={() => forms.open('rescueMed', { studentId: s._id })}>Add rescue medicine</Btn>
              </div>
              <h3 className="mdp-h"><Ico name="heartPulse" size={16} /> Emergency care plans</h3>
              {(r.carePlans || []).length ? r.carePlans.map((c) => (
                <Rec key={c._id} critical={live(c) && c.status === 'active'} off={!live(c) || c.status === 'draft'} title={c.title}
                  badges={<>
                    <Badge size="sm" tone="slate">{labelOf(CARE_PLAN_KIND, c.kind)}</Badge>
                    {c.status === 'draft' ? <Badge size="sm" tone="gray">Draft</Badge> : null}
                    {c.archivedAt ? <Badge size="sm" tone="gray">Archived — {c.archiveReason}</Badge> : null}
                    {live(c) && c.status === 'active' ? (c.parentConfirmedAt
                      ? <Badge size="sm" tone="green">Parent confirmed {fmtDay(c.parentConfirmedAt)}</Badge>
                      : <Badge size="sm" tone="amber">Waiting for the parent</Badge>) : null}
                    {c.reviewDue && live(c) ? <Badge size="sm" tone={dueTone(c.reviewDue)}>Review by {fmtDay(c.reviewDue)}</Badge> : null}
                  </>}
                  lines={[
                    c.triggers && <><strong>Triggers:</strong> {c.triggers}</>,
                    ...(c.steps || []).map((x, i) => <>{i + 1}. {x.critical ? <strong>{x.text}</strong> : x.text}</>),
                    c.ambulanceWhen && <><strong>Ambulance:</strong> {c.ambulanceWhen}</>,
                    c.doctorName && <><strong>Signed off:</strong> {c.doctorName}{c.doctorSignedOn ? `, ${fmtDay(c.doctorSignedOn)}` : ''}</>,
                  ]}
                  actions={<Kebab items={c.archivedAt ? [{ label: 'Restore', icon: 'repeat', onClick: () => act(() => api.restoreMedRecord('care-plans', c._id), 'Restored') }] : [
                    { label: 'Edit', icon: 'pencil', onClick: () => forms.open('carePlan', { studentId: s._id, carePlan: c, rescueMeds: activeRescue }) },
                    '-', { label: 'Archive', icon: 'archive', danger: true, onClick: () => archive('care-plans', c, 'care plan') },
                  ]} />} />
              )) : <Empty compact title="No care plans">A care plan says, step by step, what to do in an anaphylaxis, asthma, seizure or low-blood-sugar emergency.</Empty>}

              <h3 className="mdp-h" style={{ marginTop: 20 }}><Ico name="syringe" size={16} /> Rescue medicines</h3>
              {(r.rescueMeds || []).length ? r.rescueMeds.map((m) => {
                const st = rescueState(m);
                return (
                  <Rec key={m._id} critical={live(m) && st === 'expired'} off={!live(m) || m.status !== 'active'} title={m.name}
                    badges={<>
                      <Badge size="sm" tone="slate">{labelOf(RESCUE_KIND, m.kind)}</Badge>
                      {st ? <Status of="rescue" value={st} size="sm" /> : <Badge size="sm" tone="amber">No expiry date</Badge>}
                      {m.selfCarry ? <Badge size="sm" tone="indigo">Carried by the student</Badge> : null}
                      {m.archivedAt ? <Badge size="sm" tone="gray">Archived — {m.archiveReason}</Badge> : null}
                    </>}
                    lines={[
                      [m.quantity != null ? `${m.quantity} kept` : '', m.dose].filter(Boolean).join(' · '),
                      places(m) && <><strong>Kept:</strong> {places(m)}</>,
                      m.expiresOn && `Expires ${fmtDay(m.expiresOn)}`,
                      m.lastCheckedAt ? `Checked ${fmtDate(m.lastCheckedAt)}${m.lastCheckedName ? ` by ${m.lastCheckedName}` : ''}` : 'Not checked yet',
                      m.instructions,
                    ]}
                    actions={<Kebab items={m.archivedAt ? [{ label: 'Restore', icon: 'repeat', onClick: () => act(() => api.restoreMedRecord('rescue-meds', m._id), 'Restored') }] : [
                      { label: 'Checked today', icon: 'checkCircle', onClick: () => forms.open('rescueCheck', { rescueMed: m }) },
                      { label: 'Edit', icon: 'pencil', onClick: () => forms.open('rescueMed', { studentId: s._id, rescueMed: m }) },
                      '-', { label: 'Archive (used, replaced or returned)', icon: 'archive', danger: true, onClick: () => archive('rescue-meds', m, 'rescue medicine') },
                    ]} />} />
                );
              }) : <Empty compact title="No rescue medicines">An auto-injector, a reliever inhaler, glucagon — with every place one is kept, and its expiry date watched.</Empty>}
            </>
          ) : null}

          {tab === 'limits' ? (
            <>
              <div className="mdp-tabhead">
                <Btn kind="primary" icon="plus" onClick={() => forms.open('restriction', { studentId: s._id, studentName: s.name })}>New restriction</Btn>
                <Btn icon="calendarCheck" onClick={() => forms.open('exclusion', { studentId: s._id, studentName: s.name, rules })}>Off school</Btn>
              </div>
              <h3 className="mdp-h"><Ico name="ban" size={16} /> What teachers are asked to do</h3>
              {(r.restrictions || []).length ? r.restrictions.map((x) => (
                <Rec key={x._id} off={x.state === 'ended'} title={x.teacherText}
                  badges={<>
                    <Badge size="sm" tone="slate">{labelOf(RESTRICTION_KIND, x.kind)}</Badge>
                    <Badge size="sm" tone={RESTRICTION_STATE[x.state]?.tone}>{x.endedAt ? 'Ended early' : labelOf(RESTRICTION_STATE, x.state)}</Badge>
                  </>}
                  lines={[
                    `${fmtDay(x.startsOn)} → ${x.endsOn ? fmtDay(x.endsOn) : 'until further notice'}`,
                    x.reason && <><strong>Why (not shown to teachers):</strong> {x.reason}</>,
                    x.endedAt && `Ended by ${x.endedByName}${x.endNote ? ` — ${x.endNote}` : ''}`,
                  ]}
                  actions={x.state !== 'ended' ? <Kebab items={[
                    { label: 'Change', icon: 'pencil', onClick: () => forms.open('restriction', { restriction: x }) },
                    { label: 'End now', icon: 'checkCircle', onClick: () => drawer.confirm({ title: 'End this restriction now?', reason: true, reasonLabel: 'Note', confirmLabel: 'End it',
                      run: async (note) => { await api.endRestriction(x._id, note); toast.success('Ended — teachers told'); reload(); } }) },
                    '-', { label: 'Archive (entered by mistake)', icon: 'archive', danger: true, onClick: () => archive('restrictions', x, 'restriction') },
                  ]} /> : null} />
              )) : <Empty compact title="No restrictions">No PE after a sprain, water in class, rest breaks — teachers see what to do, never why.</Empty>}

              <h3 className="mdp-h" style={{ marginTop: 20 }}><Ico name="calendarCheck" size={16} /> Off school</h3>
              {(r.exclusions || []).length ? r.exclusions.map((x) => (
                <Rec key={x._id} critical={x.status === 'excluded'} off={x.status !== 'excluded'} title={x.label}
                  badges={<>
                    <Badge size="sm" tone={EXCLUSION_STATUS[x.status]?.tone}>{labelOf(EXCLUSION_STATUS, x.status)}</Badge>
                    {x.needsCertificate ? <Badge size="sm" tone={x.certificateDoc ? 'green' : 'amber'}>{x.certificateDoc ? 'Certificate received' : 'Certificate needed'}</Badge> : null}
                  </>}
                  lines={[
                    `Since ${fmtDate(x.from)} · back ${x.earliestReturn ? `no earlier than ${fmtDate(x.earliestReturn)}` : 'when a doctor certifies'}`,
                    x.text,
                    x.status === 'cleared' && `Cleared by ${x.clearedByName}${x.clearNote ? ` — ${x.clearNote}` : ''}`,
                    x.status === 'cancelled' && `Cancelled — ${x.cancelReason}`,
                  ]}
                  actions={x.status === 'excluded' ? <Btn size="sm" kind="primary" onClick={() => forms.open('clearExclusion', { exclusion: x, studentName: s.name })}>Clear to return</Btn> : null} />
              )) : <Empty compact title="Never off school for illness">A student sent home with an illness that keeps them off school appears here.</Empty>}
            </>
          ) : null}

          {tab === 'medication' ? (
            <>
              <div className="mdp-tabhead">
                <Btn kind="primary" icon="plus" onClick={() => forms.open('plan', { student: s })}>New medication plan</Btn>
                <Btn icon="pill" onClick={() => forms.open('giveDose', { student: s })}>Give a medicine now</Btn>
              </div>
              {r.plans.length ? r.plans.map((x) => (
                <Rec key={x._id} off={['completed', 'cancelled'].includes(x.status)} title={`${x.medicineName} — ${x.dosage}`}
                  badges={<><Status of="plan" value={x.status} size="sm" />{x.parentAuthorization?.authorized ? <Badge size="sm" tone="green">Authorised</Badge> : <Badge size="sm" tone="amber">Not authorised</Badge>}<Badge size="sm" tone="slate">{x.source === 'parent' ? "Family's own" : 'School stock'}</Badge></>}
                  lines={[`${labelOf(PLAN_FREQUENCY, x.frequency)}${(x.times || []).length ? ` at ${x.times.join(', ')}` : ''} · from ${fmtDay(x.startDate)}${x.endDate ? ` to ${fmtDay(x.endDate)}` : ''}`, x.reason, x.instructions, x.statusNote]}
                  actions={<Btn size="sm" kind="tint" onClick={() => drawer.show('plan', x._id)}>Open</Btn>} />
              )) : <Empty compact title="No medication plans">A plan schedules a medicine the student takes at school; each dose is recorded in today&rsquo;s round.</Empty>}
            </>
          ) : null}

          {tab === 'vaccinations' ? (
            <>
              <h4 className="mdp-h">The school&rsquo;s schedule</h4>
              <ScheduleList schedule={r.schedule} staff onExempt={setExempt}
                onEndExempt={(e) => drawer.confirm({ title: `End the exemption from ${e.label}?`, reason: true, reasonLabel: 'Why', confirmLabel: 'End it',
                  run: async (why) => { await api.endVaccineExemption(e.exemption, why); toast.success('Exemption ended'); reload(); } })} />
              <div className="mdp-tabhead" style={{ marginTop: 14 }}><h4 className="mdp-h" style={{ margin: 0, flex: 1 }}>Records</h4><Btn kind="primary" icon="plus" onClick={() => forms.open('vaccination', { studentId: s._id })}>Add vaccination</Btn></div>
              <Table rows={r.vaccinations} minWidth={640} columns={[
                { key: 'vaccine', label: 'Vaccine', primary: true, render: (v) => <span className="md-two"><b>{v.vaccine}</b><em>{v.dose}</em></span> },
                { key: 'when', label: 'Given / due', render: (v) => (v.givenOn ? `Given ${fmtDay(v.givenOn)}` : v.dueOn ? `Due ${fmtDay(v.dueOn)}` : '—') },
                { key: 'provider', label: 'Where', render: (v) => v.provider || <span className="md-none">—</span> },
                { key: 'state', label: 'Status', render: (v) => <Status of="vaccination" value={v.state} /> },
                { key: 'acts', label: '', align: 'right', stop: true, render: (v) => (
                  <span className="md-acts">
                    {!v.givenOn ? <Btn size="sm" kind="primary" onClick={() => forms.open('vaccinationGiven', { vaccination: v })}>Mark given</Btn> : null}
                    {v.certificate ? <DocButton getLink={api.medDocLink} id={v.certificate}>Certificate</DocButton> : null}
                    <Kebab items={[{ label: 'Edit', icon: 'pencil', onClick: () => forms.open('vaccination', { studentId: s._id, vaccination: v }) }, { label: 'Archive', icon: 'archive', danger: true, onClick: () => archive('vaccinations', v, 'vaccination record') }]} />
                  </span>
                ) },
              ]} empty={<Empty compact title="No vaccinations on record" />} />
            </>
          ) : null}

          {tab === 'checkups' ? (
            <>
              <div className="mdp-tabhead"><Btn kind="primary" icon="plus" onClick={() => forms.open('checkup', { student: s })}>Record checkup</Btn></div>
              <Table rows={r.checkups} minWidth={640} columns={[
                { key: 'type', label: 'Checkup', primary: true, render: (k) => <span className="md-two"><b>{labelOf(CHECKUP_TYPE, k.type)}</b><em>{k.sessionName || k.professional}</em></span> },
                { key: 'date', label: 'Date', render: (k) => (k.status === 'scheduled' ? `Scheduled ${fmtDay(k.scheduledOn)}` : fmtDay(k.checkedOn)) },
                { key: 'results', label: 'Results', render: (k) => <span className="md-clamp">{checkupLine(k.results, k.findings) || '—'}</span> },
                { key: 'outcome', label: 'Outcome', render: (k) => (k.status === 'scheduled' ? <Badge tone="indigo">Scheduled</Badge> : k.outcome ? <Status of="checkupOutcome" value={k.outcome} /> : <Badge tone="green">Completed</Badge>) },
                { key: 'acts', label: '', align: 'right', stop: true, render: (k) => (
                  <span className="md-acts">
                    {k.status === 'scheduled' ? <Btn size="sm" kind="primary" onClick={() => forms.open('checkup', { checkup: k })}>Record results</Btn> : null}
                    {k.followUp?.status === 'pending' ? <Btn size="sm" onClick={() => forms.open('followUp', { kind: 'checkup', id: k._id })}>Follow-up</Btn> : null}
                    <Kebab items={[k.status !== 'scheduled' ? { label: 'Edit', icon: 'pencil', onClick: () => forms.open('checkup', { checkup: k }) } : null,
                      k.status === 'completed' ? { label: 'Refer to a specialist', icon: 'send', onClick: () => setRefer({ specialty: REFER_TO[k.type] || 'paediatric', reason: k.recommendations || k.findings || '', findings: checkupLine(k.results, k.findings), source: { kind: 'checkup', id: k._id, label: `${labelOf(CHECKUP_TYPE, k.type)} checkup, ${fmtDay(k.checkedOn)}` } }) } : null,
                      { label: 'Archive', icon: 'archive', danger: true, onClick: () => archive('checkups', k, 'checkup') }]} />
                  </span>
                ) },
              ]} empty={<Empty compact title="No checkups recorded" />} />
              <div className="mdp-tabhead" style={{ marginTop: 18 }}><h4 className="mdp-h" style={{ margin: 0, flex: 1 }}>Referrals to a specialist</h4><Btn icon="send" onClick={() => setRefer({})}>Refer to a specialist</Btn></div>
              <ReferralList rows={r.referrals || []} staff onOpen={async (x) => { try { const res = await api.getReferral(x._id); setOpenRef(res?.data ?? res); } catch { setOpenRef({ ...x, studentName: s.name, classLabel: s.classLabel }); } }} />
            </>
          ) : null}

          {tab === 'growth' ? (
            <>
              <GrowthPanel growth={r.growth} />
              {r.growth?.latest?.concern ? <div className="mdp-tabhead" style={{ marginTop: 12 }}><Btn icon="send" onClick={() => setRefer({ specialty: r.growth.latest.indicators?.height?.concern ? 'paediatric' : 'nutrition', reason: `${s.name}'s growth is outside the usual range on the WHO charts (${Object.values(r.growth.latest.indicators).filter((x) => x.concern).map((x) => `${x.label}: ${x.bandLabel.toLowerCase()}`).join('; ')}).`, findings: `Height ${r.growth.latest.heightCm ?? '—'} cm, weight ${r.growth.latest.weightKg ?? '—'} kg, BMI ${r.growth.latest.bmi ?? '—'} on ${fmtDay(r.growth.latest.on)}`, source: { kind: 'growth', label: 'WHO growth chart' } })}>Refer to a specialist</Btn></div> : null}
            </>
          ) : null}

          {tab === 'documents' ? (
            <>
              <div className="mdp-tabhead"><Btn kind="primary" icon="upload" onClick={() => forms.open('document', { studentId: s._id })}>Upload document</Btn></div>
              <Table rows={r.documents} minWidth={700} rowClass={(d) => (d.archivedAt ? 'is-off' : '')} columns={[
                { key: 'title', label: 'Document', primary: true, render: (d) => <span className="md-two"><b>{d.title}</b><em>{labelOf(DOC_TYPE, d.type)} · {fileSize(d.size)}</em></span> },
                { key: 'date', label: 'Date', render: (d) => <span className="md-two"><b>{d.documentDate ? fmtDay(d.documentDate) : fmtDate(d.createdAt)}</b><em>{d.expiresOn ? `Valid until ${fmtDay(d.expiresOn)}` : ''}</em></span> },
                { key: 'visibility', label: 'Who can see it', render: (d) => <Status of="docVisibility" value={d.visibility} /> },
                { key: 'by', label: 'Uploaded by', render: (d) => <span className="md-two"><b>{d.uploadedByName}</b><em>{d.uploadedByRole === 'parent' ? 'Parent' : 'Staff'} · {ago(d.createdAt)}</em></span> },
                { key: 'status', label: 'Status', render: (d) => (d.archivedAt ? <Badge tone="gray">Archived</Badge> : <Status of="docStatus" value={d.status} />) },
                { key: 'acts', label: '', align: 'right', stop: true, render: (d) => (
                  <span className="md-acts">
                    <DocButton getLink={api.medDocLink} id={d._id} />
                    <Kebab items={d.archivedAt ? [{ label: 'Restore', icon: 'repeat', onClick: () => act(() => api.restoreMedRecord('documents', d._id), 'Restored') }] : [
                      { label: 'Download', icon: 'download', onClick: () => openDocument(api.medDocLink, d._id, { download: true }) },
                      { label: 'Edit details', icon: 'pencil', onClick: () => forms.open('documentEdit', { document: d }) },
                      d.status === 'pending' ? { label: 'Accept', icon: 'checkCircle', onClick: () => act(() => api.reviewMedDocument(d._id, { status: 'verified' }), 'Accepted') } : null,
                      '-', { label: 'Archive', icon: 'archive', danger: true, onClick: () => archive('documents', d, 'document') },
                    ]} />
                  </span>
                ) },
              ]} empty={<Empty compact title="No documents">Prescriptions, certificates and reports uploaded here are kept private.</Empty>} />
            </>
          ) : null}

          {tab === 'updates' ? (
            r.changes.length ? (
              <Table rows={r.changes} minWidth={640} onRow={(c) => nav(`/admin/medical/health/updates?tab=all&focus=${c._id}`)} columns={[
                { key: 'kind', label: 'Update', primary: true, render: (c) => <span className="md-two"><b>{CHANGE_KIND[c.kind]}</b><em>{c.action === 'add' ? 'New' : c.action === 'remove' ? 'No longer applies' : 'Change'}</em></span> },
                { key: 'from', label: 'From', render: (c) => <span className="md-two"><b>{c.submittedByName}</b><em>{fmtStamp(c.createdAt)}</em></span> },
                { key: 'status', label: 'Status', render: (c) => <Status of="change" value={c.status} /> },
                { key: 'note', label: 'Answer', render: (c) => <span className="md-clamp">{c.reviewNote || '—'}</span> },
              ]} />
            ) : <Empty compact title="No updates from parents">Parents can send allergies, conditions, contacts and documents from their app.</Empty>
          ) : null}

          {tab === 'access' ? (
            auditBoard.data?.rows ? (
              <Table rows={auditBoard.data.rows} minWidth={640} columns={[
                { key: 'createdAt', label: 'When', render: (l) => fmtStamp(l.createdAt) },
                { key: 'actor', label: 'Who', primary: true, render: (l) => <span className="md-two"><b>{l.actorName || 'System'}</b><em>{l.actorRole?.replace('_', ' ')}</em></span> },
                { key: 'action', label: 'What', render: (l) => <Badge tone={l.action === 'viewed' ? 'slate' : 'indigo'} size="sm">{l.action.replace(/_/g, ' ')}</Badge> },
                { key: 'summary', label: 'Detail', render: (l) => <span className="md-clamp">{l.summary}</span> },
              ]} empty={<Empty compact title="Nothing recorded yet" />} />
            ) : <Spin />
          ) : null}
        </div>
      </Panel>
      {exempt ? <ExemptionDialog entry={exempt} studentId={r.student._id} onClose={() => setExempt(null)} onDone={() => { setExempt(null); reload(); }} /> : null}
      {refer ? <ReferralDialog student={r.student} preset={refer} onClose={() => setRefer(null)} onDone={() => { setRefer(null); reload(); }} /> : null}
      {openRef ? <ReferralDetail referral={openRef} onClose={() => setOpenRef(null)} onChanged={() => { reload(); api.getReferral(openRef._id).then((res) => setOpenRef(res?.data ?? res)).catch(() => {}); }} /> : null}
      {r ? <ConsentDialog open={paper} consent={r.consent} year={r.consentYear} categories={r.otcCategories || []} studentName={r.student?.name}
        save={(v) => api.recordPaperConsent(r.student._id, v)} onClose={() => setPaper(false)} onSaved={() => { toast.success('Consent recorded'); reload(); }} /> : null}
      {elements}
    </Page>
  );
}
