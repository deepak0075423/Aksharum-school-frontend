/**
 * The applicant's home on a portal: every application they have made, what
 * each one is waiting for, a way to start another, and the latest updates.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { portal as api } from '../../../api/admission.api';
import { usePortal } from './PortalShell';
import { useLoad, Panel, Btn, Spin, Empty, ErrorBox, Dialog, Field, Select, Note, StatusChip, Ico, Chip } from '../admUI';
import { fmtDate, ago, money, errMsg } from '../meta';

/** The one thing an application needs from its family now, if anything. */
function nextStep(a) {
  if (a.status === 'draft') return { tone: 'indigo', text: 'Finish and submit the application', cta: 'Continue' };
  if (a.status === 'incomplete') return { tone: 'amber', text: 'The school needs more information', cta: 'Update' };
  if (a.status === 'documents_rejected' || a.docStatus === 'rejected') return { tone: 'red', text: 'A document needs to be uploaded again', cta: 'Fix it' };
  if (a.applicationFeeStatus === 'due' && a.status !== 'draft') return { tone: 'amber', text: `Application fee ${money(a.applicationFeeAmount)} due`, cta: 'Pay' };
  if (a.status === 'offer_issued') return { tone: 'teal', text: 'A seat has been offered — respond to the offer', cta: 'Respond' };
  if (a.status === 'payment_pending') return { tone: 'amber', text: `Admission fee ${money(a.admissionFeeAmount)} due`, cta: 'Pay' };
  if (a.status === 'exam_scheduled' || a.status === 'interview_scheduled') return { tone: 'indigo', text: 'See the exam details and admit card', cta: 'Details' };
  if (a.status === 'enrolled') return { tone: 'green', text: `Enrolled${a.admissionNumber ? ` — admission number ${a.admissionNumber}` : ''}`, cta: 'View' };
  return null;
}

function NewApplication({ open, onClose, onCreated }) {
  const { data, loading, error } = useLoad(() => (open ? api.rounds() : Promise.resolve({ data: [] })), [open]);
  const [round, setRound] = useState('');
  const [cls, setCls] = useState('');
  const [busy, setBusy] = useState(false);
  const rounds = data || [];
  const r = rounds.find((x) => x._id === round) || (rounds.length === 1 ? rounds[0] : null);
  const c = r?.classes.find((x) => x._id === cls);
  const go = async () => {
    setBusy(true);
    try {
      const res = await api.create({ round: r._id, class: cls, source: new URLSearchParams(window.location.search).get('src') || '' });
      onCreated(res.data);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Start a new application" width={520}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!r || !c?.available} onClick={go}>Start</Btn></>}>
      {loading ? <Spin /> : error ? <Note tone="red">{error}</Note> : !rounds.length ? (
        <Empty compact icon="calendar" title="No admission round is open">Please check back later.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rounds.length > 1 ? (
            <Field label="Admission round" required>
              <Select value={round} onChange={(e) => { setRound(e.target.value); setCls(''); }}>
                <option value="">Choose…</option>
                {rounds.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
              </Select>
            </Field>
          ) : <Note tone="indigo" icon="calendar">{r.name}{r.closesAt ? ` — apply by ${fmtDate(r.closesAt)}` : ''}</Note>}
          {r ? (
            <Field label="Class you are applying for" required>
              <Select value={cls} onChange={(e) => setCls(e.target.value)}>
                <option value="">Choose…</option>
                {r.classes.map((x) => <option key={x._id} value={x._id} disabled={!x.available}>{x.className}{!x.available ? ` — ${x.reason}` : x.applicationFee ? ` — fee ${money(x.applicationFee)}` : ''}</option>)}
              </Select>
            </Field>
          ) : null}
          {c?.eligibility && (c.eligibility.minAgeYears != null || c.eligibility.notes) ? (
            <Note tone="amber" icon="info">
              {c.eligibility.minAgeYears != null ? `Age ${c.eligibility.minAgeYears}–${c.eligibility.maxAgeYears ?? '—'} years${c.eligibility.ageOn ? ` on ${fmtDate(c.eligibility.ageOn)}` : ''}. ` : ''}{c.eligibility.notes}
            </Note>
          ) : null}
          <p className="adm-muted" style={{ fontSize: '.84rem' }}>Applying for more than one child? Start a separate application for each.</p>
        </div>
      )}
    </Dialog>
  );
}

export default function GuestDashboard() {
  const { slug, data: portalData } = usePortal();
  const nav = useNavigate();
  const me = useLoad(() => api.me(), []);
  const list = useLoad(() => api.list(), []);
  const updates = useLoad(() => api.updates(), []);
  const [creating, setCreating] = useState(false);
  const apps = list.data || [];
  const open = portalData.portal.status === 'open';
  const latest = useMemo(() => (updates.data || []).slice(0, 12), [updates.data]);

  if (list.loading && !list.data) return <Spin />;
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;

  return (
    <>
      <div className="adm-head">
        <div className="adm-head__text">
          <div className="adm-head__eyebrow">{portalData.school.name}</div>
          <h1>Hello{me.data?.user?.name ? `, ${me.data.user.name.split(' ')[0]}` : ''}</h1>
          <p>Your applications and everything the school has told you about them.</p>
        </div>
        <div className="adm-head__acts">
          {open ? <Btn kind="primary" icon="plus" onClick={() => setCreating(true)}>New application</Btn> : <Chip tone="gray">Admissions closed</Chip>}
        </div>
      </div>

      {!apps.length ? (
        <Panel>
          <Empty icon="fileDoc" title="No applications yet" action={open ? <Btn kind="primary" icon="plus" onClick={() => setCreating(true)}>Start an application</Btn> : null}>
            {open ? 'Start an application for your child. You can save it and finish later.' : portalData.portal.closedMessage}
          </Empty>
        </Panel>
      ) : (
        <div className="adm-appcards">
          {apps.map((a) => {
            const step = nextStep(a);
            return (
              <article key={a._id} className="adm-appcard">
                <div className="adm-appcard__top">
                  <div>
                    <strong>{a.studentName || 'New application'}</strong>
                    <span>{a.className} · {a.roundName}{a.yearName ? ` · ${a.yearName}` : ''}</span>
                  </div>
                  <StatusChip status={a.status} />
                </div>
                <div className="adm-muted" style={{ fontSize: '.82rem' }}>
                  {a.applicationNumber ? <>Application <strong className="adm-num">{a.applicationNumber}</strong> · </> : null}
                  {a.submittedAt ? `Submitted ${fmtDate(a.submittedAt)}` : `Started ${fmtDate(a.createdAt)}`}
                </div>
                {a.selection?.listName ? <Note tone={a.selection.decision === 'selected' ? 'green' : 'amber'} icon="list">{a.selection.listName}: {a.selection.decision === 'selected' ? 'selected' : `waiting list${a.selection.waitPosition ? `, position ${a.selection.waitPosition}` : ''}`}</Note> : null}
                {step ? <Note tone={step.tone} icon="arrowRight">{step.text}</Note> : <p className="adm-muted" style={{ fontSize: '.84rem' }}>{a.statusText}</p>}
                <div className="adm-row">
                  <Btn kind={step ? 'primary' : 'outline'} size="sm" onClick={() => nav(`/${slug}/applications/${a._id}`)}>{step?.cta || 'Open'}</Btn>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <GroupPanel />

      <Panel title="Latest updates" icon="bell" tone="indigo">
        {latest.length ? (
          <div className="adm-checklist">
            {latest.map((u) => (
              <button key={u._id} type="button" className="adm-checklist__item" style={{ textAlign: 'left', width: '100%' }} onClick={() => nav(`/${slug}/applications/${u.application}`)}>
                <Ico name="bell" size={15} />
                <span style={{ flex: 1, minWidth: 0 }}><strong>{u.studentName || u.applicationNumber || 'Application'}</strong> — {u.message}</span>
                <span className="adm-muted" style={{ fontSize: '.76rem', whiteSpace: 'nowrap' }}>{ago(u.createdAt)}</span>
              </button>
            ))}
          </div>
        ) : <Empty compact icon="bell" title="Nothing new">Updates about your applications appear here and in your email.</Empty>}
      </Panel>

      <NewApplication open={creating} onClose={() => setCreating(false)} onCreated={(a) => { setCreating(false); nav(`/${slug}/applications/${a._id}`); }} />
    </>
  );
}

/**
 * The family's applications at every branch of the school's group, in their
 * order of preference — which each branch's office sees when the group shares
 * status (school-backend services/admission/groups.js).
 */
function GroupPanel() {
  const { data, reload } = useLoad(() => api.group(), []);
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!Array.isArray(data?.applications) || data.applications.length < 2) return null;
  const open = data.applications.filter((a) => a.open);
  const list = order ? order.map((id) => open.find((a) => String(a._id) === id)).filter(Boolean) : open;
  const move = (i, d) => {
    const ids = list.map((a) => String(a._id));
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
  };
  const save = async () => {
    setBusy(true);
    try { await api.groupOrder(list.map((a) => a._id)); toast.success('Your order of preference is saved'); setOrder(null); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Panel title={`Your applications at ${data.name}`} icon="layers" tone="violet"
      sub={data.shareStatus ? 'Put the branches in the order you prefer — each branch sees your order and where you stand elsewhere.' : 'Put the branches in the order you prefer.'}
      right={order ? <Btn size="sm" kind="primary" busy={busy} onClick={save}>Save the order</Btn> : null}>
      <ol className="adm-doclist" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {list.map((a, i) => (
          <li key={a._id} className="adm-row adm-row--between" style={{ flexWrap: 'nowrap' }}>
            <span style={{ minWidth: 0 }}><b>{i + 1}.</b> {a.schoolName} · {a.className}{a.studentName ? ` · ${a.studentName}` : ''}</span>
            <span className="adm-row" style={{ flexWrap: 'nowrap', gap: 4 }}>
              <Chip tone="gray">{a.statusLabel}</Chip>
              <button type="button" className="adm-ibtn" aria-label={`Move ${a.schoolName} up`} disabled={i === 0} onClick={() => move(i, -1)}><Ico name="arrowUp" size={14} /></button>
              <button type="button" className="adm-ibtn" aria-label={`Move ${a.schoolName} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}><Ico name="arrowDown" size={14} /></button>
            </span>
          </li>
        ))}
      </ol>
      {data.applications.some((a) => !a.open) ? <p className="adm-muted" style={{ fontSize: '.8rem' }}>Closed: {data.applications.filter((a) => !a.open).map((a) => `${a.schoolName} (${a.statusLabel})`).join(', ')}.</p> : null}
    </Panel>
  );
}
