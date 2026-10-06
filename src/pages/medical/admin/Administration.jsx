/**
 * Medication Administration (Oct 2026) — today's round. Every scheduled dose
 * of every medication plan, by time; record each as given, refused or missed
 * (given takes the stock out). Below, the medicines given as needed, and the
 * plans themselves.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Btn, Badge, Status, Panel, Person, Tiles, Tile, Empty, Spin, LoadError, Note, Dialog, Field, Segmented, Select, Ico, useLoad } from '../mdUI';
import { DOSE_STATUS, fmtTime, fmtDay, todayStr, addDays, labelOf, studentLine, errorText, qty } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { DoseCheck, withSafety } from './mdSafety';
import { useBoard, BoardPanel, ClassFilter } from './mdList';
import { useMedLive } from '../useMedLive';

function RecordDose({ dose, onClose, onDone }) {
  const [status, setStatus] = useState('given');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!dose) return null;
  const go = async () => {
    setBusy(true); setErr('');
    // A dose recorded as given goes through the same safety check as any other (mdSafety).
    try { await withSafety((override) => api.recordDose(dose._id, { status, note, override })); toast.success(`${dose.medicineName}: ${labelOf(DOSE_STATUS, status).toLowerCase()}`); onDone(); onClose(); }
    catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={busy ? () => {} : onClose} title="Record the dose" icon="pill" tone="violet" width={520}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind={status === 'given' ? 'success' : 'primary'} busy={busy} onClick={go}>Record as {labelOf(DOSE_STATUS, status).toLowerCase()}</Btn></>}>
      <div className="md-subject"><strong>{dose.studentName}</strong><span>{dose.medicineName} — {dose.dosage} · due {fmtTime(dose.scheduledFor)}</span></div>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
      {dose.instructions ? <Note tone="indigo" icon="info">{dose.instructions}</Note> : null}
      <Field label="What happened">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'given', label: 'Given', icon: 'checkCircle', tone: 'green' }, { value: 'refused', label: 'Refused', tone: 'orange' }, { value: 'missed', label: 'Missed', tone: 'red' }]} label="Dose" />
      </Field>
      {status === 'given' && dose.source === 'school' ? <p className="md-muted" style={{ margin: 0, fontSize: '.84rem' }}>{qty(dose.quantity)} {dose.itemUnit || ''} come out of school stock ({qty(dose.itemStock)} on hand).</p> : null}
      {status === 'given' ? <DoseCheck studentId={dose.student} plan={dose.plan || ''} medicineName={dose.plan ? '' : dose.medicineName} /> : null}
      <Field label={status === 'refused' ? 'Why was it refused?' : 'Note'} optional={status !== 'refused'} required={status === 'refused'}>
        <input className="md-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Field>
    </Dialog>
  );
}

export default function MedicationAdministration() {
  const [day, setDay] = useState(todayStr());
  const round = useLoad(() => api.getAdministration(day), day);
  const plans = useBoard('plans', { tab: 'active' });
  const reload = () => { round.reload(); plans.reload(); };
  const { meta, forms, drawer, elements } = useMedWorkspace(reload);
  // Another nurse giving a dose on another computer: the round shows it at once.
  useMedLive(reload, { kinds: ['dose', 'medication_plan', 'visit'] });
  const [dose, setDose] = useState(null);
  const d = round.data;
  const slots = [];
  for (const x of d?.doses || []) {
    const t = fmtTime(x.scheduledFor);
    if (!slots.length || slots[slots.length - 1].t !== t) slots.push({ t, at: x.scheduledFor, doses: [] });
    slots[slots.length - 1].doses.push(x);
  }
  const isToday = day === todayStr();
  return (
    <Page>
      <PageHead icon="syringe" tone="violet" title="Medication Administration" subtitle="Today's round of scheduled medicines from each student's medication plan. Record every dose as given, refused or missed — a dose given from school stock is taken out of stock at once.">
        <Btn icon="pill" onClick={() => forms.open('giveDose')}>Give a medicine now</Btn>
        <Btn kind="primary" icon="plus" onClick={() => forms.open('plan')}>New Medication Plan</Btn>
      </PageHead>
      {d ? (
        <Tiles>
          <Tile tone="indigo" icon="clock" value={d.counts.scheduled} label={isToday ? 'Still to give today' : 'Scheduled'} caption={d.counts.overdue ? `${d.counts.overdue} past their time` : 'None overdue'} />
          <Tile tone="green" icon="checkCircle" value={d.counts.given} label="Given" />
          <Tile tone="orange" icon="close" value={d.counts.refused} label="Refused" />
          <Tile tone="red" icon="alertTri" value={d.counts.missed} label="Missed" caption="Not recorded in time" />
        </Tiles>
      ) : null}
      <Panel title={isToday ? "Today's round" : `Round of ${fmtDay(day)}`} icon="calendarCheck" tone="violet" pad={false}
        right={<span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Btn size="sm" kind="ghost" icon="chevronLeft" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day" />
          <input className="md-input" type="date" value={day} onChange={(e) => setDay(e.target.value || todayStr())} style={{ width: 150, height: 32 }} aria-label="Day" />
          <Btn size="sm" kind="ghost" icon="chevronRight" onClick={() => setDay(addDays(day, 1))} aria-label="Next day" disabled={day >= todayStr()} />
          {!isToday ? <Btn size="sm" onClick={() => setDay(todayStr())}>Today</Btn> : null}
        </span>}>
        {round.error && !d ? <LoadError error={round.error} onRetry={round.reload} /> : !d ? <Spin /> : !slots.length ? (
          <Empty compact title="No scheduled doses">Medicines on a medication plan with times of day appear here on their days.</Empty>
        ) : slots.map((s) => {
          const late = isToday && new Date(s.at) < new Date() && s.doses.some((x) => x.status === 'scheduled');
          return (
            <div key={s.t} className="mda-slot">
              <div className={`mda-slot__time${late ? ' is-late' : ''}`}><Ico name="clock" size={14} />{s.t}{late ? ' — overdue' : ''}</div>
              {s.doses.map((x) => (
                <div key={x._id} className="mda-dose">
                  <Person name={x.studentName} photo={x.studentPhoto} size={34} sub={studentLine(x)} />
                  <span className="mda-dose__med"><b>{x.medicineName}</b><em>{x.dosage}{x.route ? ` · ${x.route}` : ''}{x.instructions ? ` · ${x.instructions}` : ''}</em></span>
                  <span className="mda-dose__acts">
                    {x.status === 'scheduled' ? (
                      <>
                        <Btn size="sm" kind="success" icon="checkCircle" onClick={() => setDose(x)}>Record</Btn>
                        <Btn size="sm" kind="ghost" onClick={() => drawer.show('plan', x.plan)}>Plan</Btn>
                      </>
                    ) : (
                      <><Status of="dose" value={x.status} />{x.givenAt ? <span className="md-muted" style={{ fontSize: '.78rem' }}>{fmtTime(x.givenAt)} · {x.givenByName}</span> : null}
                        {x.status === 'missed' ? <Btn size="sm" kind="ghost" onClick={() => setDose(x)}>Given late</Btn> : null}</>
                    )}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </Panel>
      {d?.asNeeded?.length ? (
        <Panel title="Given when needed" sub="Plans with no fixed time — record a dose when the student needs it" icon="pill" tone="indigo" pad={false}>
          {d.asNeeded.map((p) => (
            <div key={p._id} className="mda-dose">
              <Person name={p.studentName} photo={p.studentPhoto} size={34} sub={studentLine(p)} />
              <span className="mda-dose__med"><b>{p.medicineName}</b><em>{p.dosage}{p.instructions ? ` · ${p.instructions}` : ''}</em></span>
              <span className="mda-dose__acts"><Btn size="sm" kind="primary" onClick={() => forms.open('giveDose', { student: { _id: p.student, name: p.studentName, photo: p.studentPhoto, classLabel: p.classLabel }, plan: p })}>Give now</Btn></span>
            </div>
          ))}
        </Panel>
      ) : null}
      <BoardPanel board={plans} title="Medication plans" icon="calendarCheck" tone="slate" noun="plan" searchPlaceholder="Search student or medicine" exportName="medication-plans"
        onRow={(r) => drawer.show('plan', r._id)}
        filters={<><ClassFilter meta={meta} q={plans.q} setQ={plans.setQ} /><Select value={plans.q.source} onChange={(v) => plans.setQ({ source: v })} all="Any supply" label="Supplied by" options={[{ value: 'school', label: 'School stock' }, { value: 'parent', label: "Family's own" }]} /></>}
        columns={[
          { key: 'student', label: 'Student', primary: true, render: (r) => <Person name={r.studentName} photo={r.studentPhoto} size={34} sub={studentLine(r)} />, csv: (r) => r.studentName },
          { key: 'medicine', label: 'Medicine', render: (r) => <span className="md-two"><b>{r.medicineName}</b><em>{r.dosage}</em></span>, csv: (r) => r.medicineName },
          { key: 'when', label: 'When', render: (r) => (r.frequency === 'as_needed' ? 'As needed' : (r.times || []).join(', ')), csv: (r) => (r.times || []).join(' ') },
          { key: 'period', label: 'Period', render: (r) => `${fmtDay(r.startDate)}${r.endDate ? ` – ${fmtDay(r.endDate)}` : ' onwards'}` },
          { key: 'status', label: 'Status', render: (r) => <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><Status of="plan" value={r.status} />{!r.parentAuthorization?.authorized ? <Badge tone="amber" size="sm">Needs authorisation</Badge> : null}</span> },
        ]}
        empty={<Empty compact title="No plans here">A plan schedules a medicine a student takes at school.</Empty>} />
      {dose ? <RecordDose dose={dose} onClose={() => setDose(null)} onDone={reload} /> : null}
      {elements}
    </Page>
  );
}
