/**
 * A submitted application, as its family follows it: where it stands, what
 * the school is waiting for, and everything it has published about it —
 * document checks, fees and receipts, exams and admit cards, results, lists,
 * the offer, and the history.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { portal as api, openProtected } from '../../../api/admission.api';
import { openCheckout } from '../../../utils/razorpay';
import SlotPicker from './SlotPicker';
import Appeals from './Appeals';
import DigiLockerPanel from './DigiLockerPanel';
import FormRenderer from '../FormRenderer';
import {
  useLoad, Panel, Btn, Note, Chip, Ico, KV, Timeline, Table, ConfirmDialog, Dialog, Field, TextArea, DocChip, FeeChip, Empty,
} from '../admUI';
import { STATUS, fmtDate, fmtDateTime, money, size, errMsg, DECISION } from '../meta';

// The family's view of the road: a handful of milestones, not the office's stages.
const MILESTONES = [
  { key: 'submitted', label: 'Submitted', reached: (s) => s !== 'draft' },
  { key: 'review', label: 'Review', reached: (s) => !['draft', 'submitted', 'incomplete'].includes(s) },
  { key: 'assessment', label: 'Assessment', reached: (s) => ['exam_completed', 'interview_completed', 'evaluated', 'selected', 'waitlisted', 'offer_issued', 'accepted', 'payment_pending', 'confirmed', 'enrolled'].includes(s) },
  { key: 'decision', label: 'Decision', reached: (s) => ['selected', 'waitlisted', 'offer_issued', 'accepted', 'payment_pending', 'confirmed', 'enrolled', 'rejected'].includes(s) },
  { key: 'confirmed', label: 'Confirmed', reached: (s) => ['confirmed', 'enrolled'].includes(s) },
  { key: 'enrolled', label: 'Enrolled', reached: (s) => s === 'enrolled' },
];

function Lists({ appId }) {
  const { data } = useLoad(() => api.lists(appId), [appId]);
  if (!data?.length) return null;
  return (
    <Panel title="Selection lists" icon="list" tone="violet" sub="As published by the school">
      {data.map((l) => (
        <div key={l._id} style={{ marginBottom: 16 }}>
          <div className="adm-row" style={{ marginBottom: 8 }}>
            <strong>{l.name}</strong><span className="adm-muted">published {fmtDate(l.publishedAt)}</span>
            {l.method !== 'merit' ? <Chip tone="indigo" icon="sparkle">Lottery</Chip> : null}
            {l.mine ? <Chip tone={DECISION[l.mine.decision]?.tone || 'gray'}>You: {l.method !== 'merit' && l.mine.decision === 'not_selected' ? 'not reached in the draw' : DECISION[l.mine.decision]?.label}{l.mine.waitPosition ? ` #${l.mine.waitPosition}` : ''}</Chip> : <Chip tone="gray">Not on this list</Chip>}
          </div>
          {l.method !== 'merit' && l.mine?.rank ? (
            <p className="adm-muted" style={{ fontSize: '.86rem', marginBottom: 8 }}>
              Your application was number <b>{l.mine.rank}</b> in the draw{l.mine.score ? ` (with ${l.mine.score} priority points)` : ''}.
              {l.drawUrl ? <> <Link to={l.drawUrl}>See the whole draw and how to check it</Link></> : null}
            </p>
          ) : null}
          <Table dense rows={l.lines.map((x, i) => ({ ...x, _id: `${l._id}-${i}` }))} columns={[
            ...(l.lines.some((x) => x.rank) ? [{ key: 'rank', label: l.method !== 'merit' ? 'Draw no.' : 'Rank', width: 80 }] : []),
            { key: 'applicationNumber', label: 'Application', render: (x) => <span className="adm-num">{x.applicationNumber}{x.mine ? ' (you)' : ''}</span> },
            ...(l.lines.some((x) => x.name) ? [{ key: 'name', label: 'Name' }] : []),
            ...(l.lines.some((x) => x.score != null) ? [{ key: 'score', label: 'Score' }] : []),
            { key: 'decision', label: 'Decision', render: (x) => <Chip tone={DECISION[x.decision]?.tone}>{x.decision === 'waitlisted' ? `Waiting #${x.waitPosition || ''}` : DECISION[x.decision]?.label}</Chip> },
          ]} />
        </div>
      ))}
    </Panel>
  );
}

export default function Tracker({ detail, slug, reload, user }) {
  const nav = useNavigate();
  const app = detail.application;
  const meta = STATUS[app.status] || {};
  const [busy, setBusy] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineNote, setDeclineNote] = useState('');
  const [picking, setPicking] = useState(null);   // an exam whose time is being chosen
  const open = (url, name) => openProtected(url, name ? { download: true, filename: name } : {}).catch((e) => toast.error(e.message));
  const rejected = detail.documents.files.filter((d) => ['rejected', 'resubmission_required'].includes(d.status));
  const missing = detail.documents.requirements.filter((r) => r.required && !detail.documents.files.some((d) => d.docKey === r.key));
  const closed = ['withdrawn', 'cancelled', 'rejected', 'ineligible', 'declined'].includes(app.status);

  const upload = async (docKey, file) => {
    setBusy(`doc:${docKey}`);
    try { await api.upload(app._id, docKey, file); toast.success('Uploaded — the school will check it again'); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const pay = async (kind, part) => {
    setBusy(`pay:${kind}${part ? `:${part}` : ''}`);
    try {
      const order = await api.payOrder(app._id, kind, part);
      await openCheckout({
        order: order.data, amount: order.data.due, name: kind === 'application_fee' ? 'Application fee' : 'Admission fee', description: app.studentName,
        prefillName: user?.name, prefillEmail: user?.email,
        onVerify: async (resp) => { try { await api.payVerify(app._id, resp); toast.success('Payment received'); reload(); } catch (e) { toast.error(errMsg(e)); } },
        onError: (e) => toast.error(e.message),
      });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const respond = async (accept, note = '', withdrawOthers = false) => {
    setBusy('offer');
    try {
      const r = await api.respond(app._id, accept, note, withdrawOthers);
      toast.success(accept ? `Offer accepted${r.data?.withdrawnElsewhere ? ` — ${r.data.withdrawnElsewhere} application(s) at the other branches withdrawn` : ''}` : 'Offer declined');
      setDeclining(false); setAccepting(false); reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const startExam = async (exam) => {
    setBusy(`exam:${exam.examId}`);
    try {
      const r = await api.startExam(app._id, exam.examId);
      nav(`/${slug}/applications/${app._id}/exam/${r.data._id}`);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };

  const offer = detail.offer;
  const fees = detail.fees;
  // Open applications at the other branches of the school's group, to withdraw on accepting (the family's choice).
  const group = useLoad(() => (offer?.canRespond ? api.group() : Promise.resolve({ data: null })), [offer?.canRespond]);
  const elsewhere = (group.data?.applications || []).filter((a) => a.open && String(a._id) !== String(app._id));
  const [accepting, setAccepting] = useState(false);
  const [withdrawOthers, setWithdrawOthers] = useState(true);

  return (
    <div className="adm-split">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        <section className="adm-statushero">
          <div className="adm-statushero__top">
            <div>
              <h1>{app.studentName || 'Application'}</h1>
              <p>{detail.className} · {detail.round?.name}{detail.yearName ? ` · ${detail.yearName}` : ''}{app.applicationNumber ? <> · <span className="adm-num">{app.applicationNumber}</span></> : null}</p>
            </div>
            <span className={`adm-bigstatus adm-t-${meta.tone || 'gray'}`}><Ico name={closed ? 'closeCircle' : app.status === 'enrolled' ? 'checkCircle' : 'activity'} size={17} />{app.statusText}</span>
          </div>
          {!closed ? (
            <div className="adm-steps" aria-label="Progress">
              {MILESTONES.map((m, i) => {
                const done = m.reached(app.status);
                const next = !done && (i === 0 || MILESTONES[i - 1].reached(app.status));
                return <span key={m.key} className={`adm-step ${done ? 'is-done' : next ? 'is-current' : ''}`}><span className="adm-step__n">{done ? <Ico name="check" size={11} /> : i + 1}</span>{m.label}</span>;
              })}
            </div>
          ) : app.reason ? <Note tone="gray" icon="info">{app.reason}</Note> : null}
          {app.quota ? (
            <Note tone={app.quota.status === 'rejected' ? 'amber' : 'indigo'} icon="layers">
              {app.quota.status === 'allotted' ? <>Allotted a seat under the RTE Act by the state{app.quota.externalRef ? <> (reference {app.quota.externalRef})</> : null}.</>
                : app.quota.status === 'verified' ? <>Considered under the {app.quota.name} quota.</>
                  : app.quota.status === 'rejected' ? <>The {app.quota.name} quota claim was not accepted{app.quota.note ? ` — ${app.quota.note}` : ''}. The application is considered for the general seats.</>
                    : <>Applied under the {app.quota.name} quota — the school will check it.</>}
            </Note>
          ) : null}
          {app.admissionNumber ? <Note tone="green" icon="gradCap">Enrolled with admission number <b>{app.admissionNumber}</b>.{app.signInNote ? ` ${app.signInNote}` : ''}</Note> : null}
        </section>

        {offer && ['issued', 'accepted'].includes(offer.status) ? (
          <Panel title={offer.status === 'issued' ? 'You have been offered a seat' : 'Offer accepted'} icon="sparkle" tone="teal"
            right={<Btn size="sm" icon="download" onClick={() => open(api.offerUrl(app._id), `offer-${offer.offerNumber}.pdf`)}>Offer letter</Btn>}>
            <KV cols={3} items={[['Offer', offer.offerNumber], ['Respond by', fmtDateTime(offer.respondBy)], ['Admission fee', money(offer.feeAmount)], ['Pay by', fmtDate(offer.feeDueAt)]]} />
            {offer.canRespond ? (
              <div className="adm-row adm-mt">
                <Btn kind="success" icon="checkCircle" busy={busy === 'offer'} onClick={() => (elsewhere.length ? setAccepting(true) : respond(true))}>Accept the offer</Btn>
                <Btn kind="ghost" onClick={() => setDeclining(true)}>Decline</Btn>
              </div>
            ) : offer.status === 'issued' ? <Note tone="gray" icon="info">Please contact the admission office to respond.</Note> : null}
          </Panel>
        ) : null}

        {rejected.length || missing.length || app.status === 'documents_pending' ? (
          <>
          <DigiLockerPanel appId={app._id} requirements={detail.documents.requirements} onFetched={reload} />
          <Panel title="Documents to upload" icon="upload" tone="amber">
            <div className="adm-doclist">
              {[...rejected.map((d) => ({ key: d.docKey, name: detail.documents.requirements.find((r) => r.key === d.docKey)?.name || d.docKey, reason: d.rejectionReason, req: detail.documents.requirements.find((r) => r.key === d.docKey) })),
                ...missing.map((r) => ({ key: r.key, name: r.name, reason: 'Not uploaded yet', req: r }))].map((x) => (
                <div key={x.key} className="adm-upload is-bad">
                  <Ico name="alert" size={20} />
                  <div className="adm-upload__text"><strong>{x.name}</strong><em>{x.reason}</em></div>
                  <label className="adm-btn adm-btn--primary adm-btn--sm" style={{ cursor: 'pointer' }}>
                    {busy === `doc:${x.key}` ? <span className="adm-spin adm-spin--sm" /> : <Ico name="upload" size={14} />}Upload
                    <input type="file" hidden accept={(x.req?.accept || ['pdf', 'jpg', 'jpeg', 'png']).map((a) => `.${a}`).join(',')} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(x.key, f); }} />
                  </label>
                </div>
              ))}
            </div>
          </Panel>
          </>
        ) : null}

        {detail.exams.length ? (
          <Panel title="Exams & interviews" icon="fileCheck" tone="indigo">
            <div className="adm-doclist">
              {detail.exams.map((x) => (
                <div key={x.examId} className="adm-panel" style={{ padding: 14, boxShadow: 'none' }}>
                  <div className="adm-row adm-row--between">
                    <div>
                      <strong>{x.name}</strong> <Chip tone="indigo">{x.mode === 'online' ? 'Online' : x.mode === 'interview' ? 'Interview' : 'At the school'}</Chip>
                      <div className="adm-muted" style={{ fontSize: '.84rem' }}>{x.needsTime ? 'Time not chosen yet' : fmtDateTime(x.startsAt)}{x.mode === 'online' && x.endsAt ? ` – ${fmtDateTime(x.endsAt)}` : ''}{x.rollNumber ? ` · Roll ${x.rollNumber}` : ''}</div>
                    </div>
                    <div className="adm-row">
                      {x.admitCard ? <Btn size="sm" icon="download" onClick={() => open(api.admitUrl(app._id, x.examId), `admit-card-${x.rollNumber}.pdf`)}>Admit card</Btn> : x.admitCardFrom ? <Chip tone="gray">Admit card from {fmtDate(x.admitCardFrom)}</Chip> : null}
                      {x.online?.inProgress ? <Btn kind="primary" size="sm" icon="arrowRight" onClick={() => nav(`/${slug}/applications/${app._id}/exam/${x.online.inProgress._id}`)}>Resume exam</Btn>
                        : x.online?.canStart ? <Btn kind="primary" size="sm" busy={busy === `exam:${x.examId}`} onClick={() => startExam(x)}>Start exam</Btn> : null}
                      {x.result ? <Btn size="sm" icon="download" onClick={() => open(api.scoreUrl(app._id, x.examId), 'scorecard.pdf')}>Scorecard</Btn> : null}
                      {x.mode !== 'online' && !x.needsTime && !x.result && new Date(x.startsAt) > new Date() ? <Btn size="sm" icon="calendar" onClick={() => open(api.examCalUrl(app._id, x.examId), `${x.name.replace(/[^A-Za-z0-9]+/g, '-')}.ics`)}>Add to calendar</Btn> : null}
                    </div>
                  </div>
                  {x.needsTime && x.booking?.canChoose ? (
                    <Note tone="amber" icon="calendar" action={<Btn size="sm" kind="primary" onClick={() => setPicking(x)}>Choose a time</Btn>}>
                      Choose the time that suits you. The admit card is ready once you have.
                    </Note>
                  ) : x.needsTime ? <Note tone="gray" icon="info">No time can be booked online just now — please call the admission office.</Note> : null}
                  {x.booking?.mine && x.booking.canChoose ? <div className="adm-row" style={{ marginTop: 6 }}><Btn size="sm" kind="ghost" icon="repeat" onClick={() => setPicking(x)}>Change the time</Btn></div> : null}
                  {x.mode !== 'online' && (x.venue?.name || x.venue?.address) ? <p className="adm-muted" style={{ fontSize: '.84rem', marginTop: 6 }}><Ico name="mapPin" size={13} /> {[x.venue.name, x.room, x.venue.address].filter(Boolean).join(', ')}{x.reportingTime ? ` · report by ${x.reportingTime}` : ''}</p> : null}
                  {x.requiredItems ? <p className="adm-muted" style={{ fontSize: '.84rem' }}>Bring: {x.requiredItems}</p> : null}
                  {x.online?.submitted ? <Note tone="green" icon="checkCircle">Submitted. The result will appear here when the school publishes it.</Note> : null}
                  {x.online && !x.online.canStart && !x.online.submitted && !x.online.inProgress ? <p className="adm-muted" style={{ fontSize: '.84rem' }}>The exam opens on {fmtDateTime(x.online.opensAt)} and must be finished by {fmtDateTime(x.online.closesAt)} ({x.durationMinutes} minutes once started).</p> : null}
                  {x.result ? (
                    <div className="adm-mt"><KV cols={4} items={[
                      ['Result', x.result.absent ? 'Absent' : x.result.passed ? 'Qualified' : 'Not qualified'],
                      ['Score', x.result.total == null ? '—' : `${x.result.total} / ${x.result.maxMarks}`],
                      ['Percentage', x.result.percentage == null ? '—' : `${x.result.percentage}%`],
                      ['Grade', x.result.grade || '—'],
                    ]} /></div>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        {accepting ? (
          <Dialog open onClose={() => setAccepting(false)} title="Accept the offer" width={520}
            footer={<><Btn onClick={() => setAccepting(false)}>Cancel</Btn><Btn kind="success" busy={busy === 'offer'} onClick={() => respond(true, '', withdrawOthers)}>Accept</Btn></>}>
            <p>You also have {elsewhere.length} open application{elsewhere.length === 1 ? '' : 's'} at other branches: {elsewhere.map((a) => a.schoolName).join(', ')}.</p>
            <label className="adm-check"><input type="checkbox" checked={withdrawOthers} onChange={(e) => setWithdrawOthers(e.target.checked)} /><span>Withdraw them — this frees the seats for other families</span></label>
          </Dialog>
        ) : null}
        {picking ? <SlotPicker appId={app._id} exam={picking} onClose={() => setPicking(null)} onDone={() => { setPicking(null); reload(); }} /> : null}

        <Lists appId={app._id} />

        <Appeals appId={app._id} onChanged={reload} />

        <Panel title="Your answers" icon="fileDoc" tone="blue" right={app.applicationNumber ? <Btn size="sm" icon="download" onClick={() => open(api.ackUrl(app._id), `acknowledgement-${app.applicationNumber}.pdf`)}>Acknowledgement</Btn> : null}>
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 650 }}>Show the application as submitted</summary>
            <div className="adm-mt"><FormRenderer schema={detail.schema} values={app.data} scope={{ classId: app.class, roundId: app.round }} readOnly docs={{ byKey: Object.fromEntries(detail.documents.files.map((d) => [d.docKey, d])), onOpen: (d) => open(api.docUrl(app._id, d._id)) }} /></div>
          </details>
        </Panel>
      </div>

      <aside style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        <Panel title="Fees" icon="wallet" tone="green">
          <div className="adm-doclist">
            {[['application_fee', 'Application fee', fees.application], ['admission_fee', 'Admission fee', fees.admission]].filter(([, , b]) => b.fee > 0).map(([kind, label, b]) => {
              const payable = b.due > 0 && fees.online && (kind === 'application_fee' || ['offer_issued', 'accepted', 'payment_pending', 'confirmed', 'enrolled'].includes(app.status));
              const next = (b.schedule || []).find((x) => x.owing > 0);
              return (
                <React.Fragment key={kind}>
                  <div className="adm-row adm-row--between">
                    <div><strong>{label}</strong><div className="adm-muted" style={{ fontSize: '.8rem' }}>{money(b.fee)}{b.waived ? ` · ${money(b.waived)} waived` : ''}{b.paid ? ` · ${money(b.paid)} paid` : ''}{b.refunded ? ` · ${money(b.refunded)} refunded` : ''}</div></div>
                    {payable && !next ? <Btn kind="primary" size="sm" busy={busy === `pay:${kind}`} onClick={() => pay(kind)}>Pay {money(b.due)}</Btn> : <FeeChip status={b.status} />}
                  </div>
                  {b.schedule ? (
                    <div className="adm-instalments" aria-label="Instalments">
                      {b.schedule.map((x) => (
                        <div key={x.index} className={`adm-instalment is-${x.status}`}>
                          <span><b>{x.label}</b><em>{money(x.amount)} · by {fmtDate(x.dueAt)}</em></span>
                          <span>{x.status === 'paid' ? <Chip tone="green">Paid</Chip> : x.status === 'overdue' ? <Chip tone="red">Overdue</Chip> : x.status === 'part' ? <Chip tone="amber">{money(x.owing)} left</Chip> : <Chip tone="gray">Due</Chip>}</span>
                        </div>
                      ))}
                      {payable && next ? (
                        <div className="adm-row" style={{ justifyContent: 'flex-end' }}>
                          <Btn kind="primary" size="sm" busy={busy === `pay:${kind}:instalment`} onClick={() => pay(kind, 'instalment')}>Pay {next.label.toLowerCase()} — {money(Math.min(next.owing, b.due))}</Btn>
                          {b.due > next.owing ? <Btn size="sm" busy={busy === `pay:${kind}`} onClick={() => pay(kind)}>Pay all {money(b.due)}</Btn> : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </React.Fragment>
              );
            })}
            {fees.application.fee <= 0 && fees.admission.fee <= 0 ? <p className="adm-muted" style={{ fontSize: '.86rem' }}>No fees are due.</p> : null}
            {!fees.online && (fees.application.due > 0 || fees.admission.due > 0) ? <Note tone="gray" icon="info">Pay at the school office; the receipt appears here once recorded.</Note> : null}
            {(fees.refunds || []).map((r) => (
              <div key={r._id} className="adm-checklist__item">
                <Ico name="reply" size={15} /><span>{money(r.amount)} {r.status === 'pending' ? 'being refunded' : 'refunded'}<span className="adm-muted"> · receipt {r.receiptNumber} · {fmtDate(r.processedAt || r.createdAt)}</span></span>
              </div>
            ))}
            {fees.payments.filter((p) => p.status === 'paid').map((p) => (
              <button key={p._id} type="button" className="adm-checklist__item" style={{ width: '100%', textAlign: 'left' }} onClick={() => open(api.receiptUrl(app._id, p._id))}>
                <Ico name="fileCheck" size={15} /><span>Receipt <span className="adm-num">{p.receiptNumber}</span><span className="adm-muted"> · {money(p.amount)} · {fmtDate(p.paidAt)}</span></span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Documents" icon="files" tone="teal">
          {detail.documents.files.length ? (
            <div className="adm-doclist">
              {detail.documents.files.map((d) => (
                <div key={d._id} className="adm-row adm-row--between" style={{ flexWrap: 'nowrap' }}>
                  <button type="button" className="adm-linkbtn" style={{ textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => open(api.docUrl(app._id, d._id))}>
                    {detail.documents.requirements.find((r) => r.key === d.docKey)?.name || d.docKey}
                    <span className="adm-muted" style={{ fontWeight: 400 }}> · {size(d.size)}</span>
                  </button>
                  <DocChip status={d.status} />
                </div>
              ))}
            </div>
          ) : <Empty compact icon="files" title="No documents" />}
        </Panel>

        <Panel title="History" icon="history" tone="gray">
          <Timeline items={detail.timeline} />
        </Panel>

        {detail.canWithdraw ? <Btn kind="ghost" icon="closeCircle" onClick={() => setWithdrawing(true)}>Withdraw this application</Btn> : null}
      </aside>

      <ConfirmDialog open={withdrawing} onClose={() => setWithdrawing(false)} title="Withdraw the application?" reason reasonLabel="Why are you withdrawing? (the school is told)"
        message="Once withdrawn, the application closes and any seat it holds is given to the next applicant. This cannot be undone online."
        confirmLabel="Withdraw" onConfirm={async (reason) => { try { await api.withdraw(app._id, reason); toast.success('Application withdrawn'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
      <Dialog open={declining} onClose={() => setDeclining(false)} title="Decline the offer?" width={460}
        footer={<><Btn onClick={() => setDeclining(false)}>Keep the offer</Btn><Btn kind="danger" busy={busy === 'offer'} disabled={!declineNote.trim()} onClick={() => respond(false, declineNote)}>Decline</Btn></>}>
        <p className="adm-muted">The seat will be offered to the next applicant on the waiting list. This cannot be undone online.</p>
        <Field label="Please tell the school why" required className="adm-mt"><TextArea rows={3} value={declineNote} onChange={(e) => setDeclineNote(e.target.value)} maxLength={300} /></Field>
      </Dialog>
    </div>
  );
}
