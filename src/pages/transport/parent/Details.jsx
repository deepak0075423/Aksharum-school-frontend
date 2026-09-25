/** Transport → My Child's Bus. Which bus, whose crew, and where it stops. */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { Card, CardHead, CardBody, Loading } from '../admin/trUI';
import { BusCard, CrewCard, StopLine, NotEnrolled, Complaints } from '../portal/portalParts';
import { useChildPicker, ParentPage } from './_shared';

export default function ParentDetails() {
  const { studentId, picker, loading: pl, children } = useChildPicker();
  const [info, setInfo] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [comp, setComp] = useState([]);

  const loadComplaints = () => api.parentComplaints()
    .then((r) => setComp((r?.data ?? r) || [])).catch(() => {});

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    api.parentTransport({ studentId })
      .then((r) => setInfo(r?.data ?? r))
      .catch((e) => { toast.error(e?.message || 'Could not load the bus'); setInfo(null); })
      .finally(() => setLoading(false));
    loadComplaints();
  }, [studentId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const r = info?.route;
  return (
    <ParentPage icon="bus" iconTone="blue" title="My Child's Bus"
                subtitle="The route, the people with it, and every stop it makes"
                picker={picker} loading={pl} children={children}
                body={loading || info === undefined ? <Loading />
                  : !info ? <NotEnrolled who="This child is" /> : (
                    <div className="tr-split">
                      <div>
                        <BusCard route={r} seat={info.seatNumber} status={info.status}
                                 pickup={info.pickupStopName} drop={info.dropStopName}
                                 title="The bus" />
                        <Card style={{ marginTop: 14 }}>
                          <CardHead icon="mapPin" iconTone="indigo" title="Every stop on the route"
                                    sub="In the order the bus visits them" />
                          <CardBody>
                            <StopLine compact highlight={info.pickupStopName}
                                      stops={(r?.stops || []).map((s) => ({ name: s.name, plannedTime: s.arrivalTime, status: 'pending' }))} />
                          </CardBody>
                        </Card>
                      </div>
                      <div>
                        <CrewCard route={r} title="Who is with the bus" />
                        <div style={{ marginTop: 14 }}>
                          <Complaints
                            list={comp} routeName={r?.name} who="your child's"
                            onSend={async (f) => {
                              await api.parentCreateComplaint({ ...f, studentId, route: r?._id });
                              toast.success('Sent to the transport office');
                              loadComplaints();
                            }} />
                        </div>
                      </div>
                    </div>
                  )} />
  );
}
