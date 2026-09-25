/** Transport → Requests. Ask the office to change something, and watch it. */
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  Card, CardHead, CardBody, Rows, Badge, Mark, Empty, Loading, Btn, Modal,
  Field, Input, Textarea, Select, FormGrid, Note, fmtDate, words,
} from '../admin/trUI';
import { useChildPicker, ParentPage } from './_shared';

const TYPES = {
  new_transport: 'Start using the bus',
  route_change: 'Move to a different route',
  stop_change: 'Change the pickup or drop stop',
  temporary_address: 'Pick up from another address for a while',
  cancellation: 'Stop using the bus',
};
const TONE = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'slate' };

export default function ParentRequests() {
  const { children, studentId, picker, loading: pl } = useChildPicker();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ requestType: 'new_transport', details: { reason: '', address: '', fromDate: '', toDate: '' } });

  const load = useCallback(() => {
    setLoading(true);
    return api.parentRequests()
      .then((r) => setRows((r?.data ?? r) || []))
      .catch((e) => toast.error(e?.message || 'Could not load your requests'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const setD = (k, v) => setForm((f) => ({ ...f, details: { ...f.details, [k]: v } }));
  const submit = async () => {
    if (!studentId) return toast.error('Pick which child this is for');
    setBusy(true);
    try {
      await api.parentCreateRequest({ studentId, requestType: form.requestType, details: form.details });
      toast.success('Sent to the transport office');
      setOpen(false);
      setForm({ requestType: 'new_transport', details: { reason: '', address: '', fromDate: '', toDate: '' } });
      load();
    } catch (e) { toast.error(e?.message || 'That did not send'); }
    finally { setBusy(false); }
  };

  const temp = form.requestType === 'temporary_address';
  const child = children.find((c) => c.studentId === studentId);

  return (
    <ParentPage icon="send" iconTone="purple" title="Transport Requests"
                subtitle="Ask the office to change something, and see what they decided"
                picker={picker} loading={pl} children={children}
                body={(
                  <>
                    <Card>
                      <CardHead icon="send" iconTone="purple" title="Your requests"
                                sub={rows.length ? 'Newest first' : undefined}
                                right={<Btn kind="primary" icon="plus" onClick={() => setOpen(true)}>New request</Btn>} />
                      <CardBody flush>
                        {loading ? <Loading /> : rows.length ? (
                          <Rows>
                            {rows.map((r) => (
                              <div className="tr-row" key={r._id}>
                                <Mark name="send" tone={TONE[r.status] === 'green' ? 'green' : TONE[r.status] === 'red' ? 'red' : 'slate'}
                                      size={34} glyph={16} />
                                <div className="tr-row__text">
                                  <b>{TYPES[r.requestType] || words(r.requestType || '')}</b>
                                  <span>
                                    {[r.requestCode, r.student?.name,
                                      r.details?.reason || r.details?.address || r.details?.route?.name]
                                      .filter(Boolean).join(' · ')}
                                  </span>
                                </div>
                                <div className="tr-row__end">
                                  <b>{fmtDate(r.createdAt)}</b>
                                  {r.decidedAt ? <span>decided {fmtDate(r.decidedAt)}</span> : <span>waiting</span>}
                                </div>
                                <Badge tone={TONE[r.status] || 'slate'}>{words(r.status || '')}</Badge>
                              </div>
                            ))}
                          </Rows>
                        ) : (
                          <Empty icon="send" title="No requests yet"
                                 action={<Btn size="sm" kind="soft" icon="plus" onClick={() => setOpen(true)}>Make one</Btn>}>
                            Anything you want changed about the bus — a different stop, a pause, a
                            new route — is asked for here.
                          </Empty>
                        )}
                      </CardBody>
                    </Card>

                    <Modal open={open} onClose={() => setOpen(false)} slim icon="send" iconTone="purple"
                           title="Ask the transport office"
                           sub={child ? `For ${child.name}` : undefined}
                           foot={<>
                             <Btn onClick={() => setOpen(false)} disabled={busy}>Cancel</Btn>
                             <Btn kind="primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send request'}</Btn>
                           </>}>
                      <Field label="What do you need" required>
                        <Select value={form.requestType} onChange={(x) => setForm((f) => ({ ...f, requestType: x }))}
                                options={Object.entries(TYPES).map(([value, label]) => ({ value, label }))} />
                      </Field>
                      {temp ? (
                        <>
                          <Field label="The other address" required>
                            <Textarea rows={2} value={form.details.address}
                                      onChange={(e) => setD('address', e.target.value)}
                                      placeholder="Where the bus should pick up from instead" />
                          </Field>
                          <FormGrid>
                            <Field label="From"><Input type="date" value={form.details.fromDate} onChange={(e) => setD('fromDate', e.target.value)} /></Field>
                            <Field label="Until"><Input type="date" value={form.details.toDate} onChange={(e) => setD('toDate', e.target.value)} /></Field>
                          </FormGrid>
                        </>
                      ) : null}
                      <Field label="Anything else the office should know"
                             hint="A reason, a date, a stop name — whatever makes the decision easy">
                        <Textarea rows={3} value={form.details.reason}
                                  onChange={(e) => setD('reason', e.target.value)}
                                  placeholder="We are moving to Gariahat from the 1st…" />
                      </Field>
                      <Note tone="info" title="The office decides">
                        Nothing changes on the bus until they approve it. You will see the decision
                        on this page.
                      </Note>
                    </Modal>
                  </>
                )} />
  );
}
