/**
 * Medical Room Management (Oct 2026) — the room, live: every student being
 * cared for now (emergencies first), how long they have been there, their
 * bed and what has been done; and the beds and rest areas themselves.
 * Refreshes every half minute while open.
 */
import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Btn, Badge, Status, Panel, Person, Tiles, Tile, Empty, Spin, LoadError, Kebab, Ico, AlertChips, Segmented, useLoad } from '../mdUI';
import { BED_STATUS, BED_KIND, since, fmtTime, labelOf, studentLine, tempText, errorText } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useMeta } from './mdForms';
import UrgentPanel from './UrgentPanel';
import { TriageBadge, ReadingDialog } from './mdCare';
import { useMedLive, useSoundSetting, beep } from '../useMedLive';

export default function MedicalRoom() {
  // A school with more than one Medical Room shows one at a time (?room=); the main one by default.
  const [params, setParams] = useSearchParams();
  const { meta: places } = useMeta();
  // The Medical Rooms, and a hostel's sick bay where a night nurse sees residents.
  const rooms = (places?.places || []).filter((pl) => pl.kind === 'room' || pl.kind === 'hostel');
  const mainId = (places?.places || []).find((pl) => pl.isMain)?._id || '';
  // Several rooms and none chosen: the main one (not all of them at once).
  const roomId = params.get('room') || (rooms.length > 1 ? mainId : '');
  const { data, loading, error, reload } = useLoad(() => api.getMedRoom(roomId || undefined), `room:${roomId}`);
  const urgent = useLoad(() => api.getUrgentNotices(), 'urgent');
  const reloadUrgent = urgent.reload;
  const both = React.useCallback(() => { reload(); reloadUrgent(); }, [reload, reloadUrgent]);
  const { meta, forms, drawer, elements } = useMedWorkspace(both);
  const [sound, toggleSound] = useSoundSetting();
  const [reading, setReading] = React.useState(null);
  // Live from the server; the half-minute read stays for a dropped socket.
  useMedLive(both, { onUrgent: beep });
  useEffect(() => { const t = setInterval(both, 30000); return () => clearInterval(t); }, [both]);
  if (loading && !data) return <Page><Spin /></Page>;
  if (error && !data) return <Page><LoadError error={error} onRetry={reload} /></Page>;
  const beds = data.beds || [];
  const free = beds.filter((b) => b.status === 'available').length;
  const setBed = async (b, status) => { try { await api.updateBed(b._id, { label: b.label, kind: b.kind, status }); toast.success(`${b.label}: ${labelOf(BED_STATUS, status).toLowerCase()}`); reload(); } catch (e) { toast.error(errorText(e)); } };
  const hasBeds = meta?.settings?.hasBeds !== false;
  return (
    <Page>
      <PageHead icon="bed" tone="indigo" title="Medical Room Management" subtitle="Who is in the Medical Room now, why, for how long and on which bed, the families still to reach, and the state of every bed and rest area. Updates by itself as things happen.">
        <Btn icon={sound ? 'bell' : 'bellOff'} onClick={toggleSound} aria-pressed={sound} title="A sound for an emergency, on this computer">{sound ? 'Sound on' : 'Sound off'}</Btn>
        <Btn icon="refresh" onClick={both}>Refresh</Btn>
        <Btn kind="primary" icon="plus" onClick={() => forms.open('visit', { room: roomId })}>Add Medical Visit</Btn>
      </PageHead>
      {rooms.length > 1 ? (
        <Segmented label="Room" value={roomId} onChange={(id) => {
          const next = new URLSearchParams(params); if (!id || id === mainId) next.delete('room'); else next.set('room', id); setParams(next, { replace: true });
        }} options={rooms.map((pl) => ({ value: pl._id, label: pl.name }))} />
      ) : null}
      <Tiles>
        <Tile tone="indigo" icon="bed" value={data.active.length} label="In the room now" caption={`${data.active.filter((v) => v.status === 'observation').length} under observation`} />
        <Tile tone="red" icon="siren" value={data.active.filter((v) => v.status === 'emergency').length} label="Emergencies now" alert={data.active.some((v) => v.status === 'emergency')} />
        <Tile tone="green" icon="checkCircle" value={data.today.returned} label="Back to class today" caption={`${data.today.total} visits today`} />
        <Tile tone="orange" icon="home" value={data.today.sentHome + data.today.referred} label="Sent home or referred" caption={`${data.today.sentHome} home · ${data.today.referred} hospital`} />
      </Tiles>
      <Panel title="Students in the room" icon="stethoscope" tone="blue" pad>
        {data.active.length ? (
          <div className="mdr-cards">
            {data.active.map((v) => (
              <article key={v._id} className={`mdr-card is-${v.status}${v.triage?.level ? ` is-triage-${v.triage.level}` : ''}`}>
                <div className="mdr-card__top">
                  <Person name={v.studentName} photo={v.studentPhoto} size={40} sub={studentLine(v)} />
                  <span className="md-stack" style={{ alignItems: 'flex-end' }}>
                    <Status of="visit" value={v.status} size="sm" />
                    <TriageBadge level={v.triage?.level} />
                  </span>
                </div>
                {v.recheckDue ? <div className="mdc-next is-due"><Ico name="clock" size={13} />Recheck due{v.protocolKey === 'head_injury' ? ' — head injury' : ''}</div>
                  : v.nextCheckAt ? <div className="mdc-next"><Ico name="clock" size={13} />Next check {fmtTime(v.nextCheckAt)}</div> : null}
                <div className="mdr-card__reason"><b>{v.reason}</b>{v.symptoms ? ` — ${v.symptoms}` : ''}</div>
                <div className="mdr-card__meta">
                  <span><Ico name="clock" size={13} />{fmtTime(v.arrivedAt)} · {since(v.arrivedAt)}</span>
                  {v.bedLabel ? <span><Ico name="bed" size={13} />{v.bedLabel}</span> : null}
                  {v.vitals?.temperature != null ? <span><Ico name="thermometer" size={13} />{tempText(v.vitals)}</span> : null}
                  {v.handledByName ? <span><Ico name="user" size={13} />{v.handledByName}</span> : null}
                  {v.parentContacted ? <span><Ico name="phone" size={13} />Parent contacted</span> : null}
                </div>
                {v.treatment ? <div className="mdr-card__meta"><span>Treatment: {v.treatment}</span></div> : null}
                {(v.medicines || []).length ? <div className="mdr-card__meta"><span><Ico name="pill" size={13} />{v.medicines.map((m) => m.name).join(', ')}</span></div> : null}
                {v.flags?.length ? <AlertChips alerts={v.flags.map((f) => ({ level: f.level, kind: 'condition', label: f.label }))} /> : null}
                <div className="mdr-card__acts">
                  <Btn size="sm" kind="primary" onClick={() => drawer.show('visit', v._id)}>Open</Btn>
                  <Btn size="sm" onClick={() => forms.open('visitStatus', { visitId: v._id })}>Outcome</Btn>
                  <Btn size="sm" icon="stethoscope" onClick={() => forms.open('visitEdit', { visitId: v._id })}>Treatment</Btn>
                  <Btn size="sm" kind={v.recheckDue ? 'primary' : undefined} icon="thermometer" onClick={() => setReading({ _id: v._id, protocol: v.protocolKey ? { key: v.protocolKey } : null })}>Reading</Btn>
                </div>
              </article>
            ))}
          </div>
        ) : <Empty compact title="Nobody is in the Medical Room">Students appear here from the moment they arrive until they go back to class, home or to hospital.</Empty>}
      </Panel>
      <UrgentPanel data={urgent.data} reload={both} onOpenVisit={(id) => drawer.show('visit', id)} />
      {(data.awaiting || []).length ? (
        <Panel title="Waiting to be collected" sub="Sent home — still at school until someone is recorded as taking them" icon="home" tone="orange" pad>
          <div className="mdr-cards">
            {data.awaiting.map((v) => (
              <article key={v._id} className="mdr-card is-sent_home">
                <div className="mdr-card__top">
                  <Person name={v.studentName} photo={v.studentPhoto} size={40} sub={studentLine(v)} />
                  <Badge tone="orange" size="sm" icon="clock">Waiting {since(v.departedAt)}</Badge>
                </div>
                <div className="mdr-card__reason"><b>{v.reason}</b></div>
                <div className="mdr-card__meta">
                  <span><Ico name="home" size={13} />Sent home at {fmtTime(v.departedAt)}</span>
                  {v.parentContacted ? <span><Ico name="phone" size={13} />Parent contacted{v.parentContactNote ? ` — ${v.parentContactNote}` : ''}</span> : <span><Ico name="phone" size={13} />Parent not reached yet</span>}
                </div>
                <div className="mdr-card__acts">
                  <Btn size="sm" kind="primary" icon="users" onClick={() => forms.open('collection', { visit: v })}>Record collection</Btn>
                  <Btn size="sm" onClick={() => drawer.show('visit', v._id)}>Open</Btn>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      ) : null}
      {hasBeds ? (
        <Panel title="Beds and rest areas" sub={beds.length ? `${free} of ${beds.length} free` : 'None set up yet'} icon="bed" tone="slate" pad
          right={<Btn size="sm" icon="plus" onClick={() => forms.open('bed', { room: roomId })}>Add bed</Btn>}>
          {beds.length ? (
            <div className="mdr-beds">
              {beds.map((b) => {
                const tone = BED_STATUS[b.status]?.tone || 'slate';
                return (
                  <div key={b._id} className={`mdr-bed md-t-${tone}`}>
                    <div className="mdr-bed__top">
                      <b><Ico name="bed" size={15} />{b.label}</b>
                      <Kebab label="Bed actions" items={[
                        b.status === 'cleaning' ? { label: 'Ready again', icon: 'checkCircle', onClick: () => setBed(b, 'available') } : null,
                        b.status === 'available' ? { label: 'Out of service', icon: 'ban', onClick: () => setBed(b, 'out_of_service') } : null,
                        b.status === 'out_of_service' ? { label: 'Back in service', icon: 'checkCircle', onClick: () => setBed(b, 'available') } : null,
                        b.status === 'occupied' && b.visit ? { label: 'Open the visit', icon: 'stethoscope', onClick: () => drawer.show('visit', b.visit) } : null,
                        { label: 'Edit', icon: 'pencil', onClick: () => forms.open('bed', { bed: b }) },
                        b.status !== 'occupied' ? { label: 'Remove', icon: 'trash', danger: true, onClick: () => drawer.confirm({ title: `Remove ${b.label}?`, danger: true, confirmLabel: 'Remove', run: async () => { await api.removeBed(b._id); reload(); } }) } : null,
                      ]} />
                    </div>
                    <Badge tone={tone} size="sm">{labelOf(BED_STATUS, b.status)}</Badge>
                    {b.status === 'occupied' ? (
                      <><span className="mdr-bed__who">{b.studentName}</span><span className="mdr-bed__when">{b.reason} · since {fmtTime(b.bedIn || b.since)} ({since(b.bedIn || b.since)})</span></>
                    ) : <span className="mdr-bed__when">{labelOf(BED_KIND, b.kind)}{b.note ? ` · ${b.note}` : ''}</span>}
                    {b.status === 'cleaning' ? <div className="mdr-bed__acts"><Btn size="xs" kind="soft" onClick={() => setBed(b, 'available')}>Ready</Btn></div> : null}
                  </div>
                );
              })}
            </div>
          ) : <Empty compact title="No beds set up" action={<Btn icon="plus" onClick={() => forms.open('bed')}>Add a bed or rest area</Btn>}>Add the room's beds and rest areas to put students on them and see what is free.</Empty>}
        </Panel>
      ) : null}
      <ReadingDialog visit={reading} unit={meta?.settings?.temperatureUnit || 'F'} onClose={() => setReading(null)}
        onSaved={(out) => { setReading(null); toast.success('Reading saved'); both(); if (out?.suggestEmergency) drawer.show('visit', out.visit?._id); }} />
      {elements}
    </Page>
  );
}
