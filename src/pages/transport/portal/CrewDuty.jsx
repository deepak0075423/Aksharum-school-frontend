/**
 * Transport → My Duty. The driver's, conductor's and crew member's own screen.
 *
 * Until now a driver signing in was shown the RIDER screen — which bus am I on,
 * what do I owe — because a crew member holds a teacher account and that is what
 * a teacher account gets. That is the wrong question for the person at the
 * wheel. This one answers theirs: what am I crewing today, who is on board, is
 * my paperwork in date, and is my phone reporting a position.
 *
 * One read (`/transport/crew/duty`) answers the whole screen, and everything in
 * it is keyed on the caller, so there is no id in the URL and no way to look at
 * somebody else's bus. The roster is fetched per trip, and only for a trip the
 * server agrees is theirs.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  TrHead, Tiles, Tile, Card, CardHead, CardBody, Panel, Badge, Mark, Ico, Btn,
  Avatar, Empty, Note, Loading, Facts, Fact, Toggle, Modal,
  fmtDate, fmtTime, ago, count, plural, words, useBoard,
} from '../admin/trUI';
import { StopLine, BOARD_TONE, BOARD_WORD, TRIP_TONE, runWord } from './portalParts';
import { useLocationReporter } from './useLocationReporter';

const ROLE_WORD = { driver: 'Driver', conductor: 'Conductor', helper: 'Crew Member', attendant: 'Crew Member' };

export default function CrewDuty() {
  const { data, loading, error, reload } = useBoard(() => api.crewDuty(), [], { poll: 60 });
  const [sharing, setSharing] = useState(null);       // optimistic, until the server answers
  const [roster, setRoster] = useState(null);         // { trip, riders } for the open modal
  const [busy, setBusy] = useState(false);

  const d = data || {};
  const me = d.me || {};
  useEffect(() => { setSharing(null); }, [data]);
  const shareOn = sharing === null ? !!me.locationSharing : sharing;

  const toggleSharing = async (on) => {
    setSharing(on);
    try {
      await api.crewSetSharing(on);
      toast.success(on ? 'Your device will report its position while you are on duty'
        : 'Your device has stopped reporting a position');
      reload();
    } catch (e) {
      setSharing(!on);
      toast.error(e?.message || 'That did not save');
    }
  };

  // The run is driven from here. Every one of these calls a handler that has
  // existed since the module was built and that no client had ever invoked.
  const act = async (trip, action) => {
    setBusy(true);
    try {
      await api.crewTripAction(trip._id, { action });
      toast.success({ start: 'Run started', pause: 'Run paused', resume: 'Run resumed',
        complete: 'Run completed' }[action] || 'Done');
      reload();
    } catch (e) { toast.error(e?.message || 'That did not go through'); }
    finally { setBusy(false); }
  };

  const reachStop = async (trip, stop, status) => {
    setBusy(true);
    try {
      await api.crewReachStop(trip._id, { stopId: stop.stop || stop._id, status });
      toast.success(status === 'skipped' ? `${stop.name} skipped` : `Reached ${stop.name}`);
      reload();
    } catch (e) { toast.error(e?.message || 'That did not go through'); }
    finally { setBusy(false); }
  };

  const setRider = async (student, status) => {
    if (!roster?.trip?._id) return;
    setBusy(true);
    try {
      await api.crewAttendance(roster.trip._id, { entries: [{ student, status, method: 'manual' }] });
      const r = await api.crewRoster(roster.trip._id);
      setRoster(r?.data ?? r);
      reload();
    } catch (e) { toast.error(e?.message || 'That did not save'); }
    finally { setBusy(false); }
  };

  const openRoster = async (trip) => {
    setBusy(true);
    try {
      const r = await api.crewRoster(trip._id);
      setRoster((r?.data ?? r));
    } catch (e) { toast.error(e?.message || 'That register could not be loaded'); }
    finally { setBusy(false); }
  };

  const trips = d.trips || [];
  const running = trips.find((x) => x.status === 'started');
  const beacon = useLocationReporter({ active: shareOn && !!running, trip: running?._id });

  if (loading) return <div className="tr-page"><Loading /></div>;
  if (error) {
    return (
      <div className="tr-page">
        <Note tone="bad" title="Could not load your duty">{error}</Note>
      </div>
    );
  }

  const roleWord = ROLE_WORD[me.role] || 'Crew';
  const t = d.tiles || {};
  const live = d.live;

  return (
    <div className="tr-page">
      <TrHead icon="driver" iconTone="blue" title="My Duty"
              subtitle={`${roleWord}${me.employeeId ? ` · ${me.employeeId}` : ''} — today's runs, who is on board, and your paperwork`} />

      {/* Paperwork first: an expired licence stops the bus, and the person it
          stops should not have to hear it from the office. */}
      {(d.alerts || []).map((a) => (
        <div key={a.kind} style={{ marginBottom: 12 }}>
          <Note tone={a.days !== null && a.days < 0 ? 'bad' : 'warn'} title={a.label}>
            {a.days === null ? 'Ask the transport office to complete it.'
              : a.days < 0 ? `It lapsed ${fmtDate(a.date)} — ${plural(Math.abs(a.days), 'day')} ago. Tell the transport office.`
                : `It expires ${fmtDate(a.date)}, in ${plural(a.days, 'day')}. Renew it before then.`}
          </Note>
        </div>
      ))}

      <Tiles>
        <Tile icon="route"  tone="indigo" label="Routes I crew"  value={count(t.routes)} />
        <Tile icon="bus"    tone="blue"   label="Runs today"     value={count(t.tripsToday)}
              sub={`${count(t.done)} finished`} />
        <Tile icon="people" tone="green"  label="Riders today"   value={count(t.ridersToday)} />
        <Tile icon="mapPin" tone={shareOn ? 'green' : 'slate'} label="Location sharing"
              value={shareOn ? 'On' : 'Off'}
              sub={me.lastLocation?.at ? `last ${ago(me.lastLocation.at)}` : 'nothing reported'} />
      </Tiles>

      <div className="tr-duty">
        <div>
          <Card>
            <CardHead icon="bus" iconTone="blue" title="Today's runs"
                      sub={trips.length ? `${plural(trips.length, 'run')} on your routes` : undefined}
                      right={<Btn size="sm" kind="soft" icon="refresh" onClick={reload}>Refresh</Btn>} />
            <CardBody>
              {trips.length ? trips.map((tr) => (
                <div className="tr-dutytrip" key={tr._id}>
                  <Mark name="bus" tone={TRIP_TONE[tr.status] === 'green' ? 'green' : 'slate'} size={38} glyph={18} />
                  <div className="tr-dutytrip__text">
                    <b>{runWord(tr.shift, tr.direction)} · {tr.route?.name || 'Route'}</b>
                    <span>
                      {tr.vehicle?.vehicleNumber || 'No bus named'}
                      {tr.startTime ? ` · started ${fmtTime(tr.startTime)}` : ''}
                      {tr.delayMinutes > 0 ? ` · ${plural(tr.delayMinutes, 'minute')} late` : ''}
                    </span>
                  </div>
                  <div className="tr-headcount">
                    <div className="is-on"><b>{count(tr.riders?.boarded)}</b><span>On</span></div>
                    <div><b>{count(tr.riders?.pending)}</b><span>To board</span></div>
                    <div className="is-off"><b>{count(tr.riders?.absent)}</b><span>Absent</span></div>
                  </div>
                  <Badge tone={TRIP_TONE[tr.status] || 'slate'}>{words(tr.status || '')}</Badge>
                  <span className="tr-dutytrip__acts">
                    <Btn size="sm" kind="soft" icon="list" disabled={busy} onClick={() => openRoster(tr)}>Register</Btn>
                    {tr.status === 'scheduled' ? (
                      <Btn size="sm" kind="primary" icon="power" disabled={busy} onClick={() => act(tr, 'start')}>Start run</Btn>
                    ) : null}
                    {tr.status === 'started' ? (
                      <>
                        <Btn size="sm" kind="soft" disabled={busy} onClick={() => act(tr, 'pause')}>Pause</Btn>
                        <Btn size="sm" kind="primary" icon="check" disabled={busy} onClick={() => act(tr, 'complete')}>Finish</Btn>
                      </>
                    ) : null}
                    {tr.status === 'paused' ? (
                      <Btn size="sm" kind="primary" icon="power" disabled={busy} onClick={() => act(tr, 'resume')}>Resume</Btn>
                    ) : null}
                  </span>
                </div>
              )) : (
                <Empty icon="bus" sm title="Nothing scheduled for you today">
                  When the office schedules a trip on a route you crew, it appears here.
                </Empty>
              )}
            </CardBody>
          </Card>

          {running?.stops?.length ? (
            <Card style={{ marginTop: 16 }}>
              <CardHead icon="mapPin" iconTone="purple" title="Tick off the stops as you reach them"
                        sub={`${runWord(running.shift, running.direction)} · this is what the waiting parents see`} />
              <CardBody flush>
                {running.stops.map((st, i) => (
                  <div className={`tr-stoptick${st.status === 'reached' ? ' is-done' : ''}${st.status === 'skipped' ? ' is-skipped' : ''}`} key={i}>
                    <span className="tr-stoptick__n">{st.status === 'reached' ? <Ico name="check" size={13} /> : i + 1}</span>
                    <span className="tr-stoptick__text">
                      <b>{st.name}</b>
                      <span>{st.status === 'reached' ? `Reached ${fmtTime(st.reachedAt)}`
                        : st.status === 'skipped' ? 'Skipped'
                          : st.plannedTime ? `Due ${st.plannedTime}` : 'No time set'}</span>
                    </span>
                    {st.status === 'pending' ? (
                      <>
                        <Btn size="sm" kind="soft" disabled={busy} onClick={() => reachStop(running, st, 'skipped')}>Skip</Btn>
                        <Btn size="sm" kind="primary" icon="check" disabled={busy}
                             onClick={() => reachStop(running, st, 'reached')}>Reached</Btn>
                      </>
                    ) : null}
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : live ? (
            <Card style={{ marginTop: 16 }}>
              <CardHead icon="mapPin" iconTone="purple" title="The next run"
                        sub={runWord(live.shift, live.direction)} />
              <CardBody>
                <StopLine stops={trips.find((x) => x._id === live._id)?.stops || []} />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div>
          <Card>
            <CardHead icon="mapPin" iconTone={shareOn ? 'green' : 'slate'} title="Location sharing"
                      right={<Toggle checked={shareOn} onChange={toggleSharing} label="Share my location" />} />
            <CardBody>
              <p className="tr-field__hint" style={{ marginTop: 0 }}>
                While this is on, your own signed-in device reports where the bus is, so the
                office and the waiting parents can see it. Nothing is collected while it is off,
                and you can switch it off at any time.
              </p>
              {beacon.error ? <Note tone="warn" title="Not reporting">{beacon.error}</Note> : null}
              {shareOn && !running ? (
                <Note tone="info" title="Waiting for a run">
                  Your position is sent while a run is under way. Start one and it begins.
                </Note>
              ) : null}
              {beacon.on && running ? (
                <Note tone="good" title="Reporting now">
                  {plural(beacon.sent, 'position')} sent this session
                  {beacon.at ? ` · last ${fmtTime(beacon.at)}` : ''}.
                </Note>
              ) : null}
              {me.lastLocation?.at ? (
                <Facts>
                  <Fact icon="clock" k="Last reported" v={ago(me.lastLocation.at)} />
                  <Fact icon="mapPin" k="At" v={me.lastLocation.latitude
                    ? `${Number(me.lastLocation.latitude).toFixed(4)}, ${Number(me.lastLocation.longitude).toFixed(4)}`
                    : '—'} />
                </Facts>
              ) : null}
            </CardBody>
          </Card>

          <Card style={{ marginTop: 16 }}>
            <CardHead icon="idCard" iconTone="amber" title="My record" sub="What the office holds" />
            <CardBody>
              <Facts>
                <Fact k="Role" v={roleWord} />
                <Fact k="Employee ID" v={me.employeeId || '—'} />
                <Fact k="Bus" v={d.vehicle?.vehicleNumber || 'No fixed bus'} />
                {me.role === 'driver' ? <Fact k="Licence" v={[me.licenseNumber, me.licenseType].filter(Boolean).join(' · ') || '—'} /> : null}
                {me.role === 'driver' ? <Fact k="Licence expires" v={me.licenseExpiry ? fmtDate(me.licenseExpiry) : '—'} /> : null}
                <Fact k="Medical expires" v={me.medicalCertExpiry ? fmtDate(me.medicalCertExpiry) : '—'} />
                <Fact k="Police check" v={me.policeVerified ? 'Verified' : 'Not complete'} />
                <Fact k="With transport since" v={me.dateOfJoining ? fmtDate(me.dateOfJoining) : '—'} />
              </Facts>
              <Note tone="info" title="Something wrong here?">
                This is your employee record — the transport office is the only place it can be
                changed, so tell them rather than correcting it anywhere else.
              </Note>
            </CardBody>
          </Card>

          <div style={{ marginTop: 16 }}>
          <Panel title="My routes" icon="route">
            {(d.routes || []).length ? (d.routes || []).map((r) => (
              <div className="tr-row" key={r._id}>
                <Mark name="route" tone="indigo" size={34} glyph={16} />
                <div className="tr-row__text">
                  <b>{r.name}</b>
                  <span>
                    {[r.routeCode, `${count(r.stops)} stops`, r.distanceKm ? `${r.distanceKm} km` : null,
                      r.vehicle?.vehicleNumber].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <Badge tone={r.atTheWheel ? 'blue' : 'slate'}>{r.atTheWheel ? 'At the wheel' : 'Riding with it'}</Badge>
              </div>
            )) : <Empty icon="route" sm title="No routes yet">You have not been put on a route.</Empty>}
          </Panel>
          </div>
        </div>
      </div>

      {/* The register for one run, and the only way boarding has ever been
          recordable: the endpoint behind it had existed from the start with no
          client calling it, so every rider was 'pending' for ever. */}
      <Modal open={!!roster} onClose={() => setRoster(null)} wide
             icon="list" iconTone="blue"
             title={roster ? `${runWord(roster.trip?.shift, roster.trip?.direction)} — register` : ''}
             sub={roster?.trip ? `${roster.trip.route || ''}${roster.trip.tripCode ? ` · ${roster.trip.tripCode}` : ''}` : ''}
             foot={<Btn kind="primary" onClick={() => setRoster(null)}>Done</Btn>}>
        {(roster?.riders || []).length ? (
          <div className="tr-rows">
            {roster.riders.map((r) => (
              <div className="tr-row" key={r.student}>
                <Avatar name={r.name} src={r.photo} id={r.student} />
                <div className="tr-row__text">
                  <b>{r.name}</b>
                  <span>{[r.stop, r.boardTime ? `boarded ${fmtTime(r.boardTime)}` : null,
                    r.dropTime ? `dropped ${fmtTime(r.dropTime)}` : null].filter(Boolean).join(' · ') || 'No stop recorded'}</span>
                </div>
                <span className="tr-mark3">
                  {['boarded', 'dropped', 'absent'].map((st) => (
                    <button key={st} type="button" disabled={busy}
                            className={`tr-mark3__b${r.status === st ? ' is-on' : ''} is-${st}`}
                            onClick={() => setRider(r.student, st)}>
                      {st === 'boarded' ? 'On' : st === 'dropped' ? 'Off' : 'Absent'}
                    </button>
                  ))}
                </span>
                <Badge tone={BOARD_TONE[r.status] || 'slate'}>{BOARD_WORD[r.status] || words(r.status || '')}</Badge>
              </div>
            ))}
          </div>
        ) : <Empty icon="people" sm title="Nobody on this run">No child is enrolled on this trip.</Empty>}
      </Modal>
    </div>
  );
}
