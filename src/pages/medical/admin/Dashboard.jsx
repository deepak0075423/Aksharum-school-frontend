/**
 * Medical Room — the staff's dashboard (Oct 2026). Top to bottom it answers:
 * is anything urgent right now (an emergency, a teacher's request waiting),
 * who is in the room, how the day is going, which students carry alerts,
 * what needs doing (follow-ups, doses, checkups, stock) and what happened
 * recently.
 *
 * GET /medical/admin/overview — one read, every figure (services/medicalBoard).
 */
import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import {
  Page, PageHead, Btn, Tiles, Tile, Panel, Person, Status, Badge, Note, Spin, Empty, Ico, LoadError, useLoad,
} from '../mdUI';
import { VisitsChart, Bars } from '../mdShared';
import {
  INCIDENT_TYPE, INCIDENT_SEVERITY, URGENCY, CHECKUP_TYPE,
  count, plural, ago, since, fmtTime, fmtDay, qty, labelOf, studentLine, errorText,
} from '../mdMeta';
import { useMedWorkspace, MedSearch } from './mdDrawers';
import ScanIdDialog from './ScanId';
import { useMedLive, beep } from '../useMedLive';

const BASE = '/admin/medical';

function Row({ children, onClick, emergency, person }) {
  const cls = `mdx-row${person ? ' mdx-row--person' : ''}${emergency ? ' is-emergency' : ''}`;
  return onClick
    ? <button type="button" className={`${cls} mdx-row--link`} onClick={onClick}>{children}</button>
    : <div className={cls}>{children}</div>;
}

export default function MedicalDashboard() {
  const nav = useNavigate();
  const { data, loading, error, reload } = useLoad(() => api.getMedOverview(), 'overview');
  const [scan, setScan] = useState(false);
  const { forms, drawer: D, elements } = useMedWorkspace(reload);
  useMedLive(reload, { onUrgent: beep });

  const accept = useCallback(async (r) => {
    try { await api.acceptMedRequest(r._id); toast.success(`Accepted — ${r.requestedByName} has been told`); reload(); }
    catch (e) { toast.error(errorText(e)); }
  }, [reload]);

  if (loading && !data) return <Page><Spin /></Page>;
  if (error && !data) return <Page><LoadError error={error} onRetry={reload} title="The dashboard could not be loaded" /></Page>;
  const f = data.figures;

  const quick = [
    { label: 'Add Medical Visit', icon: 'stethoscope', tone: 'blue', run: () => forms.open('visit') },
    { label: 'Report Medical Incident', icon: 'alertTri', tone: 'orange', run: () => forms.open('incident') },
    { label: 'Add Medicine', icon: 'pill', tone: 'indigo', run: () => forms.open('medicine') },
    { label: 'Record Medicine Given', icon: 'syringe', tone: 'violet', run: () => nav(`${BASE}/medicines/administration`) },
    { label: 'Add Health Checkup', icon: 'clipboard', tone: 'teal', run: () => forms.open('checkup') },
    { label: 'Add Vaccination Record', icon: 'calendarCheck', tone: 'green', run: () => nav(`${BASE}/vaccinations?new=1`) },
    { label: 'View Medical Alerts', icon: 'shieldCheck', tone: 'red', run: () => nav(`${BASE}/alerts`) },
    { label: 'Walk-in Kiosk', icon: 'idCard', tone: 'slate', run: () => nav('/medical-kiosk') },
  ];

  return (
    <Page className="mdx">
      <PageHead icon="heartPulse" tone="rose" title={data.settings.roomName || 'Medical Room'}
        subtitle="Today's visits, students in the room, medical alerts, medicines and stock — and every medical record the school keeps.">
        <MedSearch />
        <Btn icon="idCard" onClick={() => setScan(true)}>Scan ID</Btn>
        <Btn kind="primary" icon="plus" onClick={() => forms.open('visit')}>Add Medical Visit</Btn>
      </PageHead>

      <div className="md-notes">
        {f.emergencyNow ? (
          <Note tone="red" icon="siren" action={<Btn size="sm" kind="emergency" onClick={() => nav(`${BASE}/room`)}>Open the room</Btn>}>
            <b>{plural(f.emergencyNow, 'emergency case')} in the Medical Room now.</b> The medical staff and the parents have been told.
          </Note>
        ) : null}
        {f.familiesWaiting ? (
          <Note tone={f.familiesNotReached ? 'red' : 'amber'} icon="phone" action={<Btn size="sm" kind={f.familiesNotReached ? 'emergency' : undefined} onClick={() => nav(`${BASE}/room`)}>See who to call</Btn>}>
            {f.familiesNotReached
              ? <><b>{plural(f.familiesNotReached, 'family has', 'families have')} not been reached</b> — every contact on record was tried.</>
              : <><b>{plural(f.familiesWaiting, 'family has', 'families have')} not answered yet</b> about urgent news. The call list moves on by itself.</>}
          </Note>
        ) : null}
        {f.pendingRequests ? (
          <Note tone="amber" icon="inbox" action={<Btn size="sm" onClick={() => nav(`${BASE}/requests`)}>View requests</Btn>}>
            <b>{plural(f.pendingRequests, 'student is', 'students are')}</b> on the way — teachers have sent them to the Medical Room.
          </Note>
        ) : null}
        {f.dosesOverdue ? (
          <Note tone="violet" icon="pill" action={<Btn size="sm" onClick={() => nav(`${BASE}/medicines/administration`)}>Today&rsquo;s round</Btn>}>
            <b>{plural(f.dosesOverdue, 'scheduled dose')}</b> past {f.dosesOverdue === 1 ? 'its' : 'their'} time and not yet recorded.
          </Note>
        ) : null}
        {f.pendingChanges ? (
          <Note tone="indigo" icon="users" action={<Btn size="sm" onClick={() => nav(`${BASE}/health/updates`)}>Review</Btn>}>
            Parents sent <b>{plural(f.pendingChanges, 'update')}</b> to their children&rsquo;s medical records.
          </Note>
        ) : null}
        {(data.programmes?.outbreaks || []).map((o) => (
          <Note key={o._id} tone="red" icon="alertTri" action={<Btn size="sm" kind="emergency" onClick={() => nav(`${BASE}/programmes/outbreaks?focus=${o._id}`)}>Look into it</Btn>}>
            <b>{o.status === 'confirmed' ? 'Outbreak' : 'Possible outbreak'}: {o.label}</b> — {plural(o.caseCount, 'child', 'children')} in {o.scope?.label}.
          </Note>
        ))}
        {data.programmes?.campaignsToday ? (
          <Note tone="teal" icon="megaphone" action={<Btn size="sm" onClick={() => nav(`${BASE}/programmes/campaigns`)}>Open the roster</Btn>}>
            <b>{plural(data.programmes.campaignsToday, 'health campaign')}</b> on today — mark the roster as you go.
          </Note>
        ) : null}
        {data.programmes?.referralsToReview || data.programmes?.referralsOverdue ? (
          <Note tone="indigo" icon="send" action={<Btn size="sm" onClick={() => nav(`${BASE}/checkups/referrals?tab=${data.programmes.referralsToReview ? 'seen' : 'overdue'}`)}>Referrals</Btn>}>
            {data.programmes.referralsToReview ? <><b>{plural(data.programmes.referralsToReview, 'family has', 'families have')}</b> sent what the specialist said. </> : null}
            {data.programmes.referralsOverdue ? <><b>{plural(data.programmes.referralsOverdue, 'referral')}</b> past {data.programmes.referralsOverdue === 1 ? 'its' : 'their'} date.</> : null}
          </Note>
        ) : null}
        {data.programmes?.hostelWaiting ? (
          <Note tone="violet" icon="bed" action={<Btn size="sm" onClick={() => nav(`${BASE}/requests`)}>See them</Btn>}>
            <b>{plural(data.programmes.hostelWaiting, 'resident was', 'residents were')} unwell in the hostel</b> — the warden&rsquo;s reports are waiting in the requests.
          </Note>
        ) : null}
        {data.programmes?.newIllness ? (
          <Note tone="amber" icon="thermometer" action={<Btn size="sm" onClick={() => nav(`${BASE}/programmes/off-sick`)}>Read</Btn>}>
            <b>{plural(data.programmes.newIllness, 'family has', 'families have')}</b> told the school their child is off sick.
          </Note>
        ) : null}
      </div>

      <div className="mdx-quick">
        {quick.map((q) => (
          <button key={q.label} type="button" className={`md-t-${q.tone}`} onClick={q.run}>
            <span><Ico name={q.icon} size={19} /></span><b>{q.label}</b>
          </button>
        ))}
      </div>

      <Tiles>
        <Tile tone="blue" icon="stethoscope" value={f.todayVisits} label="Today's medical room visits" caption={`${plural(data.charts.byDay.at(-1)?.incidents || 0, 'incident')} reported today`} onClick={() => nav(`${BASE}/visits?tab=today`)} />
        <Tile tone="indigo" icon="bed" value={f.inRoom} label="In the medical room now" caption={data.settings.hasBeds ? `${count(f.bedsOccupied)} of ${count(f.beds)} beds in use` : 'Students being seen'} onClick={() => nav(`${BASE}/room`)} />
        <Tile tone="orange" icon="alertTri" value={f.todayIncidents} label="Today's medical incidents" caption="Injuries and accidents reported" onClick={() => nav(`${BASE}/incidents?tab=all`)} />
        <Tile tone="red" icon="siren" value={f.emergencies} label="Emergency cases today" caption={f.emergencyNow ? `${count(f.emergencyNow)} still in the room` : 'Emergencies and critical incidents'} alert={f.emergencyNow > 0} onClick={() => nav(`${BASE}/visits?tab=today&emergency=1`)} />
      </Tiles>
      <Tiles>
        <Tile tone="slate" icon="student" value={f.totalStudents} label="Total students" caption={`${count(f.withConditions)} with a medical condition`} onClick={() => nav(`${BASE}/health/profiles`)} />
        <Tile tone="rose" icon="shieldCheck" value={f.withAlerts} label="Students with medical alerts" caption="Severe allergy, critical condition or emergency medicine" onClick={() => nav(`${BASE}/health/profiles?tab=alerts`)} />
        <Tile tone="amber" icon="alert" value={f.withAllergies} label="Students with allergies" caption="Any allergy still in force" onClick={() => nav(`${BASE}/health/allergies`)} />
        <Tile tone="violet" icon="pill" value={f.onMedication} label="Taking medication" caption={`${count(f.dosesGiven)} given today · ${count(f.dosesDue)} still due`} onClick={() => nav(`${BASE}/medicines/administration`)} />
      </Tiles>

      <div className="md-grid">
        <div className="md-col">
          <Panel title="In the Medical Room now" sub={f.inRoom ? `${plural(f.inRoom, 'student')} being cared for` : 'Nobody is in the room'} icon="bed" tone="indigo" pad={false}
            right={<Btn size="sm" kind="tint" onClick={() => nav(`${BASE}/room`)}>Room board</Btn>}>
            {data.active.length ? data.active.map((v) => (
              <Row key={v._id} person emergency={v.status === 'emergency'} onClick={() => D.show('visit', v._id)}>
                <Person name={v.studentName} photo={v.studentPhoto} size={36} sub={studentLine(v)} />
                <span className="mdx-row__main">
                  <b>{v.reason}</b>
                  <em>{[`arrived ${fmtTime(v.arrivedAt)} (${since(v.arrivedAt)})`, v.bedLabel, v.handledByName].filter(Boolean).join(' · ')}</em>
                </span>
                <span className="mdx-row__side"><Status of="visit" value={v.status} size="sm" />{v.flags?.length ? <Badge tone={v.flags.some((x) => x.level === 'critical') ? 'red' : 'amber'} size="sm">{v.flags[0].label}</Badge> : null}</span>
              </Row>
            )) : <Empty compact title="The room is empty">Students sent by teachers, and anyone who walks in, appear here while they are being seen.</Empty>}
          </Panel>

          <Panel title="Waiting requests" sub="Students teachers have sent — accept to let the teacher know" icon="inbox" tone="amber" pad={false}
            right={<Btn size="sm" kind="tint" onClick={() => nav(`${BASE}/requests`)}>All requests</Btn>}>
            {data.requests.length ? data.requests.map((r) => (
              <div key={r._id} className={`mdx-row mdx-row--person mdx-row--acts${r.urgency === 'emergency' ? ' is-emergency' : ''}`}>
                <Person name={r.studentName} photo={r.studentPhoto} size={36} sub={studentLine(r)} />
                <span className="mdx-row__main">
                  <b>{r.reason}</b>
                  <em>{[r.requestedByName, r.location, ago(r.createdAt)].filter(Boolean).join(' · ')}</em>
                </span>
                <span className="mdx-row__side" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Badge tone={URGENCY[r.urgency]?.tone} size="sm">{labelOf(URGENCY, r.urgency)}</Badge>
                  {r.status === 'requested' ? <Btn size="sm" onClick={() => accept(r)}>Accept</Btn> : null}
                  <Btn size="sm" kind="primary" onClick={() => forms.open('visit', { request: r._id, student: { _id: r.studentId, name: r.studentName, photo: r.studentPhoto, classLabel: r.classLabel, admissionNumber: r.admissionNumber }, reason: r.reason, symptoms: r.symptoms })}>Arrived</Btn>
                </span>
              </div>
            )) : <Empty compact title="No requests waiting">When a teacher sends a student to the Medical Room it appears here at once.</Empty>}
          </Panel>

          <div className="md-grid--even md-grid" style={{ gridTemplateColumns: undefined }}>
            <Panel title="Visits — last 14 days" icon="chart" tone="blue" pad={false}><VisitsChart rows={data.charts.byDay} /></Panel>
            <Panel title="Why students came (30 days)" icon="clipboard" tone="teal" pad={false}>
              <Bars rows={data.charts.reasons.map((r) => ({ label: r.label, value: r.n }))} tone="teal" />
            </Panel>
          </div>

          <Panel title="Recent visits" icon="history" tone="slate" pad={false} right={<Btn size="sm" kind="tint" onClick={() => nav(`${BASE}/visits?tab=all`)}>All visits</Btn>}>
            {data.recentVisits.length ? data.recentVisits.map((v) => (
              <Row key={v._id} person onClick={() => D.show('visit', v._id)} emergency={v.emergency && v.status === 'emergency'}>
                <Person name={v.studentName} photo={v.studentPhoto} size={34} sub={studentLine(v)} />
                <span className="mdx-row__main"><b>{v.reason}</b><em>{v.number} · {ago(v.arrivedAt)}{v.handledByName ? ` · ${v.handledByName}` : ''}</em></span>
                <span className="mdx-row__side"><Status of="visit" value={v.status} size="sm" />{v.emergency ? <Badge tone="red" size="sm">Emergency</Badge> : null}</span>
              </Row>
            )) : <Empty compact title="No visits yet">Record the first visit with “Add Medical Visit”.</Empty>}
          </Panel>
        </div>

        <div className="md-col">
          <Panel title="Needs attention" icon="alertTri" tone="orange" pad={false}>
            <div className="mdx-figs">
              <button type="button" className={`mdx-fig${f.followUpsDue ? ' is-warn' : ''}`} onClick={() => nav(`${BASE}/visits?tab=follow_up`)}><strong>{count(f.pendingFollowUps)}</strong><span>Pending follow-ups{f.followUpsDue ? ` · ${count(f.followUpsDue)} due` : ''}</span></button>
              <button type="button" className="mdx-fig" onClick={() => nav(`${BASE}/checkups?tab=scheduled`)}><strong>{count(f.upcomingCheckups)}</strong><span>Upcoming health checkups</span></button>
              <button type="button" className={`mdx-fig${f.lowStock ? ' is-warn' : ''}`} onClick={() => nav(`${BASE}/medicines/inventory?tab=low`)}><strong>{count(f.lowStock)}</strong><span>Low-stock items{f.outOfStock ? ` · ${count(f.outOfStock)} out` : ''}</span></button>
              <button type="button" className={`mdx-fig${f.expiringItems ? ' is-warn' : ''}`} onClick={() => nav(`${BASE}/medicines/inventory?tab=expiring`)}><strong>{count(f.expiringItems)}</strong><span>Expiring within {data.settings.expiryAlertDays} days</span></button>
              <button type="button" className={`mdx-fig${f.expiredItems ? ' is-bad' : ''}`} onClick={() => nav(`${BASE}/medicines/inventory?tab=expired`)}><strong>{count(f.expiredItems)}</strong><span>Expired stock on the shelf</span></button>
              <button type="button" className={`mdx-fig${f.vaccinationsOverdue ? ' is-bad' : ''}`} onClick={() => nav(`${BASE}/vaccinations?tab=${f.vaccinationsOverdue ? 'overdue' : 'due_soon'}`)}><strong>{count(f.vaccinationsDue + f.vaccinationsOverdue)}</strong><span>Vaccinations due{f.vaccinationsOverdue ? ` · ${count(f.vaccinationsOverdue)} overdue` : ''}</span></button>
              <button type="button" className={`mdx-fig${f.maintenanceDue ? ' is-warn' : ''}`} onClick={() => nav(`${BASE}/equipment?tab=due`)}><strong>{count(f.maintenanceDue)}</strong><span>Equipment due for service</span></button>
              <button type="button" className={`mdx-fig${f.pendingChanges ? ' is-warn' : ''}`} onClick={() => nav(`${BASE}/health/updates`)}><strong>{count(f.pendingChanges)}</strong><span>Parent updates to review</span></button>
            </div>
          </Panel>

          <Panel title="Today's medication round" sub={`${count(f.dosesDue)} due · ${count(f.dosesGiven)} given`} icon="pill" tone="violet" pad={false}
            right={<Btn size="sm" kind="tint" onClick={() => nav(`${BASE}/medicines/administration`)}>Open</Btn>}>
            {data.doses.length ? data.doses.map((d) => (
              <Row key={d._id} onClick={() => nav(`${BASE}/medicines/administration`)}>
                <span className="mdx-row__main"><b>{d.studentName}</b><em>{d.medicineName} · {d.dosage}</em></span>
                <span className="mdx-row__side"><b style={{ color: new Date(d.scheduledFor) < new Date() ? '#b45309' : 'inherit' }}>{fmtTime(d.scheduledFor)}</b></span>
              </Row>
            )) : <Empty compact title="Nothing due today">Scheduled doses from medication plans appear here.</Empty>}
          </Panel>

          <Panel title="Recent incidents" icon="alertTri" tone="orange" pad={false} right={<Btn size="sm" kind="tint" onClick={() => nav(`${BASE}/incidents?tab=all`)}>All</Btn>}>
            {data.recentIncidents.length ? data.recentIncidents.map((i) => (
              <Row key={i._id} onClick={() => D.show('incident', i._id)}>
                <span className="mdx-row__main"><b>{labelOf(INCIDENT_TYPE, i.type)} — {i.studentName}</b><em>{[i.location, i.injury, ago(i.occurredAt)].filter(Boolean).join(' · ')}</em></span>
                <span className="mdx-row__side"><Badge tone={INCIDENT_SEVERITY[i.severity]?.tone} size="sm">{labelOf(INCIDENT_SEVERITY, i.severity)}</Badge></span>
              </Row>
            )) : <Empty compact title="No incidents">Injuries and accidents reported by teachers or the room appear here.</Empty>}
          </Panel>

          <Panel title="Visit outcomes (30 days)" icon="checkCircle" tone="green" pad={false}>
            <Bars rows={data.charts.outcomes.filter((o) => o.key !== 'in_room').map((o) => ({ label: o.label, value: o.n, tone: o.tone }))} />
          </Panel>

          {data.sessions.length ? (
            <Panel title="Upcoming health checkups" icon="calendarCheck" tone="teal" pad={false}>
              {data.sessions.map((sx) => (
                <Row key={sx.sessionId} onClick={() => nav(`${BASE}/checkups?tab=scheduled&sessionId=${sx.sessionId}`)}>
                  <span className="mdx-row__main"><b>{sx.sessionName}</b><em>{labelOf(CHECKUP_TYPE, sx.type)} · {plural(sx.students, 'student')}</em></span>
                  <span className="mdx-row__side"><b>{fmtDay(sx.scheduledOn)}</b></span>
                </Row>
              ))}
            </Panel>
          ) : null}

          {data.lowItems.length || data.expiringBatches.length ? (
            <Panel title="Stock to watch" icon="package" tone="amber" pad={false} right={<Btn size="sm" kind="tint" onClick={() => nav(`${BASE}/inventory`)}>Inventory</Btn>}>
              {data.lowItems.map((it) => (
                <Row key={`l${it._id}`} onClick={() => D.show('item', it._id)}>
                  <span className="mdx-row__main"><b>{it.name}{it.strength ? ` ${it.strength}` : ''}</b><em>{qty(it.usable)} {it.unit} usable · minimum {it.minStock}</em></span>
                  <span className="mdx-row__side"><Badge tone={it.usable <= 0 ? 'red' : 'amber'} size="sm">{it.usable <= 0 ? 'Out of stock' : 'Low'}</Badge></span>
                </Row>
              ))}
              {data.expiringBatches.map((b) => (
                <Row key={`b${b._id}`} onClick={() => D.show('item', b.item)}>
                  <span className="mdx-row__main"><b>{b.name}</b><em>{qty(b.quantity)} {b.unit}{b.batchNumber ? ` · batch ${b.batchNumber}` : ''}</em></span>
                  <span className="mdx-row__side"><Badge tone={b.daysLeft < 0 ? 'red' : 'amber'} size="sm">{b.daysLeft < 0 ? 'Expired' : `${b.daysLeft} days`}</Badge></span>
                </Row>
              ))}
            </Panel>
          ) : null}
        </div>
      </div>

      <ScanIdDialog open={scan} onClose={() => setScan(false)} onOpen={(st) => nav(`${BASE}/students/${st._id}`)} onVisit={(st) => forms.open('visit', { student: st })} />
      {elements}
    </Page>
  );
}
