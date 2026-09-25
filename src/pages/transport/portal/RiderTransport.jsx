/**
 * Transport → My Transport. The rider's screen.
 *
 * Serves a student and an enrolled teacher from one component: the two portals
 * ask the same four questions — which bus, where is it, was I on it, what do I
 * owe — and the server answers both off the caller's own user id, so the only
 * difference is which four endpoints to call.
 *
 * Rebuilt on the `tr-` kit the admin screens use. It was the last part of the
 * module still on the generic kit, with emoji headings and inline styles, which
 * made the rider's half of Transport look like a different product from the
 * office's half.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  TrHead, Tiles, Tile, Card, CardHead, CardBody, Panel, Badge, Mark, Btn, UTabs,
  Empty, Note, Loading, Rows, money, count, fmtDate, fmtTime, plural, words,
} from '../admin/trUI';
import {
  BusCard, CrewCard, StopLine, LiveStrip, InvoiceRow, NotEnrolled, Complaints,
  BOARD_TONE, BOARD_WORD, runWord,
} from './portalParts';

const TABS = [
  { value: 'bus',  label: 'My Bus',         icon: 'bus' },
  { value: 'live', label: 'Track the Bus',  icon: 'mapPin' },
  { value: 'att',  label: 'Attendance',     icon: 'checkSquare' },
  { value: 'fees', label: 'Fees',           icon: 'wallet' },
  { value: 'help', label: 'Complaints',     icon: 'megaphone' },
];

export default function RiderTransport({ role = 'student' }) {
  const staff = role === 'staff';
  const call = staff
    ? { info: api.staffTransport, track: api.staffTrack, att: api.staffAttendance, inv: api.staffInvoices,
        comp: api.staffComplaints, raise: api.staffCreateComplaint }
    : { info: api.studentTransport, track: api.studentTrack, att: api.studentAttendance, inv: api.studentInvoices,
        comp: api.studentComplaints, raise: api.studentCreateComplaint };

  const [tab, setTab] = useState('bus');
  const [info, setInfo] = useState(undefined);
  const [track, setTrack] = useState(null);
  const [att, setAtt] = useState([]);
  const [inv, setInv] = useState([]);
  const [comp, setComp] = useState([]);

  useEffect(() => {
    call.info().then((r) => setInfo(r?.data ?? r))
      .catch((e) => { toast.error(e?.message || 'Could not load your transport'); setInfo(null); });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const oops = (e) => toast.error(e?.message || 'That did not load');
    if (tab === 'live') call.track().then((r) => setTrack(r?.data ?? r)).catch(oops);
    if (tab === 'att')  call.att().then((r) => setAtt((r?.data ?? r) || [])).catch(oops);
    if (tab === 'fees') call.inv().then((r) => setInv((r?.data ?? r) || [])).catch(oops);
    if (tab === 'help') call.comp().then((r) => setComp((r?.data ?? r) || [])).catch(oops);
  }, [tab]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (info === undefined) return <div className="tr-page"><Loading /></div>;

  const r = info?.route;
  const outstanding = inv.reduce((n, x) => n + Math.max(0, (x.netAmount || 0) - (x.paidAmount || 0)), 0);
  const present = att.filter((x) => ['boarded', 'dropped'].includes(x.status)).length;

  return (
    <div className="tr-page">
      <TrHead icon="bus" iconTone="blue" title="My Transport"
              subtitle={staff
                ? 'Your bus, the live run, your boarding history and what it costs'
                : 'Your bus, where it is now, whether you were on it, and what is owed'} />

      {!info ? <NotEnrolled who={staff ? 'You are' : 'You are'} /> : (
        <>
          <Tiles>
            <Tile icon="route"  tone="indigo" label="My route" value={r?.routeCode || '—'} sub={r?.name} />
            <Tile icon="bus"    tone="blue"   label="My bus"   value={r?.vehicle?.vehicleNumber || '—'}
                  sub={r?.vehicle?.busName} />
            <Tile icon="mapPin" tone="purple" label="Pickup stop" value={info.pickupStopName || '—'}
                  sub={info.dropStopName ? `drops at ${info.dropStopName}` : undefined} />
            <Tile icon="wallet" tone={outstanding ? 'red' : 'green'} label="Outstanding"
                  value={money(outstanding)} sub={inv.length ? plural(inv.length, 'invoice') : 'no invoices yet'} />
          </Tiles>

          <UTabs items={TABS} value={tab} onChange={setTab} />

          {tab === 'bus' ? (
            <div className="tr-split">
              <div>
                <BusCard route={r} seat={info.seatNumber} status={info.status}
                         pickup={info.pickupStopName} drop={info.dropStopName} />
                {info.status === 'suspended' ? (
                  <div style={{ marginTop: 14 }}>
                    <Note tone="warn" title="Your service is paused">
                      The office has suspended this enrolment. The bus will not pick you up until it
                      is made active again — ask them why if you were not told.
                    </Note>
                  </div>
                ) : null}
                <Card style={{ marginTop: 14 }}>
                  <CardHead icon="mapPin" iconTone="indigo" title="The whole route"
                            sub="Every stop, in the order the bus visits them" />
                  <CardBody>
                    <StopLine compact highlight={info.pickupStopName}
                              stops={(r?.stops || []).map((st) => ({ name: st.name, plannedTime: st.arrivalTime, status: 'pending' }))} />
                  </CardBody>
                </Card>
              </div>
              <CrewCard route={r} />
            </div>
          ) : null}

          {tab === 'live' ? (
            !track || (!track.active && track.reason) ? (
              <Panel title="Nothing running">
                <Empty icon="bus" title="The bus is not out yet"
                       action={<Btn size="sm" kind="soft" icon="refresh"
                                    onClick={() => call.track().then((x) => setTrack(x?.data ?? x))}>Check again</Btn>}>
                  {track?.reason === 'no_assignment'
                    ? 'You are not on a route, so there is nothing to track.'
                    : "Today's run has not started. This fills in as soon as the driver sets off."}
                </Empty>
              </Panel>
            ) : (
              <>
                <LiveStrip trip={track} />
                <div className="tr-split">
                  <Card>
                    <CardHead icon="mapPin" iconTone="green" title="Where it has got to"
                              sub={runWord(track.shift, track.direction)} />
                    <CardBody>
                      <StopLine stops={track.stops} highlight={info.pickupStopName} />
                    </CardBody>
                  </Card>
                  <Card>
                    <CardHead icon="people" iconTone="blue" title="You, on this run" />
                    <CardBody>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Mark name={track.myStatus === 'boarded' ? 'check' : 'clock'}
                              tone={BOARD_TONE[track.myStatus] === 'green' ? 'green' : 'slate'} size={44} glyph={20} />
                        <div>
                          <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                            {BOARD_WORD[track.myStatus] || words(track.myStatus || '')}
                          </div>
                          <div className="tr-field__hint">
                            {track.myBoardTime ? `Boarded at ${fmtTime(track.myBoardTime)}` : 'Not scanned on board yet'}
                            {track.myDropTime ? ` · dropped ${fmtTime(track.myDropTime)}` : ''}
                          </div>
                        </div>
                      </div>
                      {track.driver ? (
                        <Note tone="info" title={`${track.driver.name} is driving`}>
                          {track.driver.phone
                            ? <>In an emergency on the road, ring <b>{track.driver.phone}</b>. For anything else, the transport office.</>
                            : 'The office has no number on file for today’s driver.'}
                        </Note>
                      ) : null}
                    </CardBody>
                  </Card>
                </div>
              </>
            )
          ) : null}

          {tab === 'att' ? (
            <Card>
              <CardHead icon="checkSquare" iconTone="green" title="Boarding history"
                        sub={att.length ? `${present} of ${att.length} runs boarded` : undefined} />
              <CardBody flush>
                {att.length ? (
                  <Rows>
                    {att.map((x, i) => (
                      <div className="tr-row" key={i}>
                        <Mark name="bus" tone={BOARD_TONE[x.status] === 'green' ? 'green'
                          : BOARD_TONE[x.status] === 'red' ? 'red' : 'slate'} size={34} glyph={16} />
                        <div className="tr-row__text">
                          <b>{fmtDate(x.date)}</b>
                          <span>{runWord(x.shift, x.direction)}{x.route ? ` · ${x.route}` : ''}</span>
                        </div>
                        <div className="tr-row__end">
                          <b>{x.boardTime ? fmtTime(x.boardTime) : '—'}</b>
                          <span>{x.dropTime ? `dropped ${fmtTime(x.dropTime)}` : 'no drop recorded'}</span>
                        </div>
                        <Badge tone={BOARD_TONE[x.status] || 'slate'}>{BOARD_WORD[x.status] || words(x.status || '')}</Badge>
                      </div>
                    ))}
                  </Rows>
                ) : (
                  <Empty icon="checkSquare" title="Nothing recorded yet">
                    Boarding is scanned on the bus. Once you have ridden it, every run shows up here.
                  </Empty>
                )}
              </CardBody>
            </Card>
          ) : null}

          {tab === 'help' ? (
            <Complaints
              list={comp} routeName={r?.name} who={staff ? 'your' : 'your'}
              onSend={async (f) => {
                await call.raise({ ...f, route: r?._id });
                toast.success('Sent to the transport office');
                call.comp().then((x) => setComp((x?.data ?? x) || []));
              }} />
          ) : null}

          {tab === 'fees' ? (
            <Card>
              <CardHead icon="wallet" iconTone={outstanding ? 'red' : 'green'} title="Transport fees"
                        sub={outstanding ? `${money(outstanding)} outstanding` : 'Nothing outstanding'} />
              <CardBody flush>
                {inv.length ? <Rows>{inv.map((x) => <InvoiceRow key={x._id || x.invoiceNumber} inv={x} />)}</Rows> : (
                  <Empty icon="wallet" title="No invoices yet">
                    Transport is billed from the office. Anything raised against this enrolment appears here.
                  </Empty>
                )}
              </CardBody>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
