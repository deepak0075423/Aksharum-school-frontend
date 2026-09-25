/**
 * Transport → Track the Bus.
 *
 * Polls every ten seconds while it is open, because the whole point of the page
 * is that it is watched at the stop. It stops polling when it is unmounted.
 */
import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  Card, CardHead, CardBody, Loading, Empty, Btn, Badge, Mark, Note, Tiles, Tile,
  fmtTime, ago, plural, words,
} from '../admin/trUI';
import { StopLine, LiveStrip, BOARD_TONE, BOARD_WORD, runWord } from '../portal/portalParts';
import { useChildPicker, ParentPage } from './_shared';

export default function ParentTrack() {
  const { studentId, picker, loading: pl, children } = useChildPicker();
  const [track, setTrack] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!studentId) return undefined;
    let alive = true;
    const load = () => api.parentTrack({ studentId })
      .then((r) => { if (alive) setTrack(r?.data ?? r); })
      .catch((e) => { if (alive) toast.error(e?.message || 'Could not reach the bus'); });
    setLoading(true);
    load().finally(() => { if (alive) setLoading(false); });
    timer.current = setInterval(load, 10000);
    return () => { alive = false; clearInterval(timer.current); };
  }, [studentId]);

  const t = track;
  const maps = t?.lastLocation?.latitude
    ? `https://www.google.com/maps?q=${t.lastLocation.latitude},${t.lastLocation.longitude}` : null;

  return (
    <ParentPage icon="mapPin" iconTone="green" title="Track the Bus"
                subtitle="Where today's run has got to, and whether your child is on it"
                picker={picker} loading={pl} children={children}
                body={loading || track === undefined ? <Loading />
                  : !t || (!t.active && t.reason) ? (
                    <Empty icon="bus" title="The bus is not out yet"
                           action={<Btn size="sm" kind="soft" icon="refresh"
                                        onClick={() => api.parentTrack({ studentId }).then((r) => setTrack(r?.data ?? r))}>
                             Check again
                           </Btn>}>
                      {t?.reason === 'no_assignment'
                        ? 'This child is not on a route, so there is nothing to track.'
                        : "Today's run has not started. This fills in by itself as soon as the driver sets off."}
                    </Empty>
                  ) : (
                    <>
                      <LiveStrip trip={t} />
                      <Tiles>
                        <Tile icon="bus" tone="blue" label="Bus" value={t.vehicle?.vehicleNumber || '—'} />
                        <Tile icon="clock" tone={t.delayMinutes > 0 ? 'amber' : 'green'} label="Running"
                              value={t.delayMinutes > 0 ? `${t.delayMinutes}m late` : 'To time'} />
                        <Tile icon="people" tone={BOARD_TONE[t.myStatus] === 'green' ? 'green' : 'slate'}
                              label="Your child" value={BOARD_WORD[t.myStatus] || words(t.myStatus || '')}
                              sub={t.myBoardTime ? `boarded ${fmtTime(t.myBoardTime)}` : undefined} />
                        <Tile icon="mapPin" tone="purple" label="Last reported"
                              value={t.lastLocation?.at ? ago(t.lastLocation.at) : '—'} />
                      </Tiles>

                      <div className="tr-split">
                        <Card>
                          <CardHead icon="mapPin" iconTone="green" title="Where it has got to"
                                    sub={runWord(t.shift, t.direction)} />
                          <CardBody><StopLine stops={t.stops} /></CardBody>
                        </Card>
                        <div>
                          <Card>
                            <CardHead icon="people" iconTone="blue" title="Today's driver" />
                            <CardBody>
                              {t.driver ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <Mark name="driver" tone="blue" size={42} glyph={19} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '.92rem' }}>{t.driver.name}</div>
                                    <div className="tr-field__hint">{t.driver.phone || 'No number on file'}</div>
                                  </div>
                                  {t.driver.phone ? <Btn size="sm" kind="soft" icon="phone" as="a" href={`tel:${t.driver.phone}`}>Call</Btn> : null}
                                </div>
                              ) : <Empty icon="people" sm title="No driver named">The office has not assigned one to this run.</Empty>}
                              <Note tone="info" title="Ring the office first">
                                The driver is driving. For anything that is not an emergency on the
                                road, the transport office is the right number.
                              </Note>
                            </CardBody>
                          </Card>
                          {maps ? (
                            <Card style={{ marginTop: 14 }}>
                              <CardHead icon="mapPin" iconTone="indigo" title="Last known position"
                                        sub={t.lastLocation?.at ? `reported ${ago(t.lastLocation.at)}` : undefined} />
                              <CardBody>
                                <Btn kind="soft" icon="externalLink" block as="a" href={maps}
                                     target="_blank" rel="noreferrer">Open in Maps</Btn>
                                <span className="tr-field__hint">
                                  A position from the driver&apos;s own device. A phone that is off, asleep
                                  or out of signal stops reporting, so this can be older than it looks.
                                </span>
                              </CardBody>
                            </Card>
                          ) : null}
                        </div>
                      </div>
                    </>
                  )} />
  );
}
