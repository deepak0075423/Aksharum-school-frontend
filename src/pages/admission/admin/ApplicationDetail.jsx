/**
 * One application, everything the office does with it: move it along the
 * workflow (or ask for approval), approve what others asked for, correct
 * answers (with a reason, kept in the history), review documents, see exams
 * and lists, make and manage the offer, take fees at the counter and grant
 * waivers, confirm the admission and create the student — and the full
 * history, internal notes included.
 *
 * Every action is checked again on the server; a button shown here is only
 * the workflow's answer as of the last load.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import FormRenderer from '../FormRenderer';
import {
  Page, Head, Panel, Btn, Chip, StatusChip, DocChip, FeeChip, OfferChip, DecisionChip, ResultsChip, Table, Empty, ErrorBox, Spin, Note,
  KV, Timeline, Dialog, ConfirmDialog, Field, Input, TextArea, Select, Check, IconBtn, Ico, useLoad,
} from '../admUI';
import { fmtDate, fmtDateTime, money, errMsg, size, PAY_MODES, REFUND_MODES, REFUND_STATUS, INSTALMENT_STATUS, toDateInput, toLocalInput, EXAM_MODE } from '../meta';
import { useAdmission, MoveDialog, ReviewDialog, StaffSelect, openFile } from './parts';

const BASE = '/admin/admissions';

export default function ApplicationDetail() {
  const { id } = useParams();
  const adm = useAdmission();
  const { data: d, loading, error, reload } = useLoad(() => admin.application(id), [id]);
  const [tab, setTab] = useState('answers');
  const [moving, setMoving] = useState(false);
  const [deciding, setDeciding] = useState(null);   // 'approve' | 'decline'

  if (loading && !d) return <Spin />;
  if (error && !d) return <ErrorBox error={error} onRetry={reload} />;
  const app = d.application;
  const isAdmin = d.permissions?.isAdmin;
  const closed = adm.statusOf(app.status)?.closed;
  const pending = d.workflow?.pending;

  return (
    <Page>
      <Link to={`${BASE}/applications`} className="adm-linkbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)' }}><Ico name="arrowLeft" size={14} />Applications</Link>
      <Head eyebrow={app.applicationNumber ? `Application ${app.applicationNumber}` : 'Draft application'} title={app.studentName || 'Student not named yet'}
        subtitle={[app.className, app.yearName, app.roundName].filter(Boolean).join(' · ')}>
        <StatusChip status={app.status} />
        {app.applicationNumber ? <Btn icon="filePdf" onClick={() => openFile(admin.applicationPdfUrl(app._id))}>PDF</Btn> : null}
        <Btn kind="primary" icon="repeat" disabled={app.status === 'draft' || app.status === 'enrolled'} onClick={() => setMoving(true)}>Change status</Btn>
      </Head>

      <StageStrip stages={d.workflow?.stages || []} current={app.stage} status={app.status} />

      {pending ? (
        <Note tone="amber" icon="shieldCheck"
          action={isAdmin ? <div className="adm-row"><Btn size="sm" kind="success" onClick={() => setDeciding('approve')}>Approve</Btn><Btn size="sm" onClick={() => setDeciding('decline')}>Decline</Btn></div> : null}>
          <b>{pending.byName || 'A colleague'}</b> asked to move this application to <b>{adm.statusOf(pending.to).label}</b> on {fmtDateTime(pending.at)}.
          {pending.note ? <> Note: “{pending.note}”.</> : null}{pending.remarks ? <> Message to the family: “{pending.remarks}”.</> : null}
        </Note>
      ) : null}
      {(d.duplicates || []).length ? <Duplicates list={d.duplicates} app={app} reload={reload} /> : null}
      {closed && app.closedReason ? <Note tone="gray" icon="info">Closed — {app.closedReason}</Note> : null}
      {app.erasedAt ? <Note tone="gray" icon="trash">The family&rsquo;s personal data was erased on {fmtDateTime(app.erasedAt)} ({app.erasureReason || 'retention'}). Numbers, dates and the outcome are kept for the school&rsquo;s records.</Note> : null}
      {app.legalHold?.on ? <Note tone="amber" icon="lock">On legal hold since {fmtDate(app.legalHold.at)}{app.legalHold.byName ? ` (${app.legalHold.byName})` : ''} — {app.legalHold.reason}. It is kept out of the retention purge.</Note> : null}

      <div className="adm-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Tabs variant="line" value={tab} onChange={setTab} items={[
            { key: 'answers', label: 'Application' },
            { key: 'documents', label: 'Documents', count: d.documents.summary?.underReview || undefined, tone: 'amber' },
            { key: 'assessment', label: 'Exams & lists', count: (d.exams || []).length || undefined },
            { key: 'offer', label: 'Offer' },
            { key: 'fees', label: 'Fees' },
            { key: 'history', label: 'History' },
          ]} />
          {tab === 'answers' ? <AnswersTab d={d} reload={reload} /> : null}
          {tab === 'documents' ? <DocumentsTab d={d} reload={reload} /> : null}
          {tab === 'assessment' ? <AssessmentTab d={d} /> : null}
          {tab === 'offer' ? <OfferTab d={d} reload={reload} /> : null}
          {tab === 'fees' ? <FeesTab d={d} reload={reload} /> : null}
          {tab === 'history' ? <HistoryTab d={d} reload={reload} /> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <NextStep d={d} reload={reload} />
          <Panel title="Applicant" icon="user">
            <KV cols={1} items={[
              ['Account', app.applicantName ? `${app.applicantName} · ${app.applicantEmail}` : app.applicantEmail],
              ['Parent / guardian', app.guardianName],
              ['Mobile', app.guardianPhone || app.applicantPhone],
              ['Email', app.guardianEmail],
              ['Date of birth', app.studentDob ? fmtDate(app.studentDob) : ''],
              ['Started', fmtDateTime(app.createdAt)],
              ['Submitted', app.submittedAt ? fmtDateTime(app.submittedAt) : 'Not yet'],
              ['Source', app.source],
              ['Admission number', app.admissionNumber],
            ]} />
          </Panel>
          <AssignPanel app={app} reload={reload} />
          <GroupPanel app={app} closed={closed} />
          {(d.quotas || []).length || app.quota ? <QuotaPanel app={app} quotas={d.quotas || []} isAdmin={isAdmin} reload={reload} /> : null}
          {isAdmin && !app.erasedAt ? <HoldPanel app={app} reload={reload} /> : null}
          <Panel title="Checks" icon="checkSquare">
            <KV cols={2} items={[
              ['Documents', <DocChip key="d" status={app.docStatus || 'none'} />],
              ['Required', `${d.documents.summary?.uploaded ?? 0} of ${d.documents.summary?.required ?? 0} uploaded`],
              ['Verified', d.documents.summary?.verified ?? 0],
              ['To fix', (d.documents.summary?.rejected ?? 0) + (d.documents.summary?.missing ?? 0)],
              ['Application fee', <FeeChip key="a" status={d.fees.application.status} />],
              ['Admission fee', <FeeChip key="b" status={d.fees.admission.status} />],
              ['Exams', d.workflow?.facts?.exams ? `${d.workflow.facts.exams.scheduled} scheduled, ${d.workflow.facts.exams.pending} to sit` : '—'],
              ['Results', d.workflow?.facts?.results?.unapproved ? `${d.workflow.facts.results.unapproved} not approved` : 'All approved'],
            ]} />
          </Panel>
        </div>
      </div>

      <MoveDialog open={moving} onClose={() => setMoving(false)} app={app} moves={d.workflow?.moves || []} transition={admin.transition} onDone={reload} canReopen={isAdmin} />
      <ConfirmDialog open={!!deciding} onClose={() => setDeciding(null)} tone={deciding === 'approve' ? 'success' : 'danger'}
        title={deciding === 'approve' ? `Approve the move to ${pending ? adm.statusOf(pending.to).label : ''}?` : 'Decline this request?'}
        message={deciding === 'approve' ? 'The application moves now and the family is told.' : 'The application stays where it is; the request is closed.'}
        confirmLabel={deciding === 'approve' ? 'Approve' : 'Decline'} reason={deciding === 'decline'} reasonLabel="Why not"
        onConfirm={async (note) => { try { await admin.approval(app._id, deciding === 'approve', note); toast.success(deciding === 'approve' ? 'Approved' : 'Declined'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </Page>
  );
}

/* ── Other branches of the group (services/admission/groups.js) ─────────── */

/**
 * The same family's applications at the other branches, with their order of
 * preference (when the group shares status), and moving this application to
 * another branch at the family's request.
 */
function GroupPanel({ app, closed }) {
  const group = useLoad(() => admin.myGroup(), []);
  const sib = useLoad(() => admin.siblings(app._id), [app._id]);
  const [moving, setMoving] = useState(false);
  if (!group.data?.name) return null;
  const s = Array.isArray(sib.data?.others) ? sib.data : null;
  return (
    <Panel title={`Branches of ${group.data.name}`} icon="layers">
      {s ? (
        s.others.length ? (
          <div className="adm-doclist">
            {s.rank ? <p className="adm-muted" style={{ fontSize: '.8rem', margin: 0 }}>The family put this branch {s.rank} in their order of preference.</p> : null}
            {s.others.map((o, i) => (
              <div key={i} className="adm-row adm-row--between" style={{ flexWrap: 'nowrap', fontSize: '.84rem' }}>
                <span>{o.groupRank ? <b>{o.groupRank}. </b> : null}{o.schoolName} · {o.className}</span>
                <Chip tone="gray">{o.statusLabel}</Chip>
              </div>
            ))}
          </div>
        ) : <p className="adm-muted" style={{ fontSize: '.84rem', margin: 0 }}>No application at the other branches.</p>
      ) : <p className="adm-muted" style={{ fontSize: '.8rem', margin: 0 }}>The group does not share families&rsquo; status between branches.</p>}
      {!closed && app.status !== 'draft' && (group.data.branches || []).length ? <Btn size="sm" kind="ghost" icon="repeat" style={{ marginTop: 10 }} onClick={() => setMoving(true)}>Move to another branch…</Btn> : null}
      {moving ? <TransferDialog app={app} branches={group.data.branches} onClose={() => setMoving(false)} /> : null}
    </Panel>
  );
}

function TransferDialog({ app, branches, onClose }) {
  const [f, setF] = useState({ toSchool: branches[0]?._id || '', reason: '' });
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await admin.offerTransfer(app._id, { toSchool: f.toSchool, reason: f.reason.trim() }); toast.success('Offered — the other branch answers under Admissions → Branches'); onClose(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title="Move to another branch" width={520}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!f.toSchool || f.reason.trim().length < 5} onClick={go}>Offer the move</Btn></>}>
      <Note icon="info">Only at the family&rsquo;s request. The other branch accepts or declines; if it accepts, the family checks the copied application there and submits it, and this one is withdrawn then.</Note>
      <Field label="To" required className="adm-mt">
        <Select value={f.toSchool} onChange={(e) => setF({ ...f, toSchool: e.target.value })}>{branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</Select>
      </Field>
      <Field label="Why" required hint="What the family asked for" className="adm-mt"><TextArea rows={2} maxLength={500} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
    </Dialog>
  );
}

/* ── The stage strip ──────────────────────────────────────────────────────── */

function StageStrip({ stages, current, status }) {
  const at = stages.findIndex((s) => s.key === current);
  const done = status === 'enrolled';
  return (
    <div className="adm-steps" aria-label="Workflow stages">
      {stages.map((s, i) => (
        <span key={s.key} className={`adm-step ${done || i < at ? 'is-done' : i === at ? 'is-current' : ''}`}>
          <span className="adm-step__n">{done || i < at ? <Ico name="check" size={11} /> : i + 1}</span>{s.label}
        </span>
      ))}
    </div>
  );
}

function Duplicates({ list, app, reload }) {
  const [busy, setBusy] = useState(false);
  return (
    <Note tone="red" icon="copy" action={<Btn size="sm" busy={busy} onClick={async () => { setBusy(true); try { await admin.clearDuplicate(app._id); toast.success('Marked as reviewed'); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } }}>Not a duplicate</Btn>}>
      <b>Possible duplicate.</b> These applications this year have the same student, date of birth or contact:
      <ul style={{ margin: '6px 0 0 18px' }}>
        {list.map((x) => <li key={x._id}><Link to={`${BASE}/applications/${x._id}`}>{x.applicationNumber || 'Draft'} — {x.studentName}</Link> ({x.status.replace(/_/g, ' ')})</li>)}
      </ul>
    </Note>
  );
}

const QUOTA_STATUS = { claimed: ['Claimed — to check', 'amber'], verified: ['Verified', 'green'], rejected: ['Not accepted', 'red'], allotted: ['Allotted by the state', 'indigo'] };

/** The quota this application is considered under — the office verifies a claim, rejects it (with why), or places it. */
function QuotaPanel({ app, quotas, isAdmin, reload }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ quota: app.quota || '', status: app.quotaStatus === 'claimed' ? 'verified' : (app.quotaStatus || 'verified'), note: '' });
  const [busy, setBusy] = useState(false);
  const def = quotas.find((q) => q.key === app.quota);
  const save = async () => {
    setBusy(true);
    try { await admin.setQuota(app._id, f); toast.success('Quota saved'); setEdit(false); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const fee = (q) => (q?.feeRule?.type === 'free' ? 'no admission fee' : q?.feeRule?.type === 'percent' ? `${q.feeRule.percent}% off the admission fee` : 'the full admission fee');
  return (
    <Panel title="Quota" icon="layers" sub={def ? `${def.name} — ${fee(def)}` : 'General seats'}
      right={isAdmin && app.quotaStatus !== 'allotted' && !['confirmed', 'enrolled'].includes(app.status) ? <Btn size="sm" kind="ghost" icon="pencil" onClick={() => setEdit(true)}>Change</Btn> : null}>
      {app.quota ? (
        <KV cols={1} items={[
          ['Quota', def?.name || app.quota],
          ['Claim', <Chip key="s" tone={QUOTA_STATUS[app.quotaStatus]?.[1] || 'gray'}>{QUOTA_STATUS[app.quotaStatus]?.[0] || 'Placed by the office'}</Chip>],
          ...(app.externalRef ? [['State reference', app.externalRef]] : []),
          ...(app.quotaNote ? [['Note', app.quotaNote]] : []),
        ]} />
      ) : <p className="adm-muted" style={{ fontSize: '.86rem' }}>Not in any quota — it competes for the general seats.</p>}
      <Dialog open={edit} onClose={() => setEdit(false)} title="Quota" width={480}
        footer={<><Btn onClick={() => setEdit(false)}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>Save</Btn></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Considered under">
            <Select value={f.quota} onChange={(e) => setF({ ...f, quota: e.target.value })}>
              <option value="">General seats only</option>
              {quotas.filter((q) => q.kind !== 'rte').map((q) => <option key={q.key} value={q.key}>{q.name}</option>)}
            </Select>
          </Field>
          {f.quota ? (
            <Field label="The claim">
              <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                <option value="verified">Verified — eligible for these seats</option>
                <option value="rejected">Not accepted</option>
                <option value="claimed">Still to check</option>
              </Select>
            </Field>
          ) : null}
          <Field label={f.status === 'rejected' && f.quota ? 'Why (the family is told)' : 'Note'} required={f.status === 'rejected' && !!f.quota}>
            <TextArea rows={2} maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </div>
      </Dialog>
    </Panel>
  );
}

/** Keep an application out of the retention purge — a dispute, a court order, an inquiry. */
function HoldPanel({ app, reload }) {
  const [ask, setAsk] = useState(false);
  const on = !!app.legalHold?.on;
  return (
    <Panel title="Data protection" icon="shieldCheck" sub={on ? 'On legal hold: never erased while it lasts' : 'Erased by the retention rules once it is no longer needed'}>
      <div className="adm-row">
        <Btn size="sm" icon={on ? 'lock' : 'shieldCheck'} onClick={() => setAsk(true)}>{on ? 'Release the legal hold' : 'Put on legal hold'}</Btn>
      </div>
      <ConfirmDialog open={ask} onClose={() => setAsk(false)} tone={on ? 'primary' : 'danger'}
        title={on ? 'Release the legal hold?' : 'Put this application on legal hold?'}
        message={on ? 'The retention rules apply to it again.' : 'It will be kept, whatever the retention rules say, until the hold is released.'}
        confirmLabel={on ? 'Release' : 'Hold'} reason reasonLabel={on ? 'Why it can go' : 'Why it must be kept'}
        onConfirm={async (why) => { try { await admin.legalHold(app._id, !on, why); toast.success(on ? 'Hold released' : 'On legal hold'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </Panel>
  );
}

function AssignPanel({ app, reload }) {
  const [who, setWho] = useState(app.assignedTo || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setWho(app.assignedTo || ''), [app.assignedTo]);
  const save = async () => {
    setBusy(true);
    try { await admin.assign(app._id, who || null); toast.success(who ? 'Assigned' : 'Unassigned'); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Panel title="Assigned to" icon="userPlus" sub="Sees it under their admission duties">
      <div className="adm-row" style={{ flexWrap: 'nowrap' }}>
        <StaffSelect value={who} onChange={setWho} placeholder="Nobody" />
        <Btn busy={busy} disabled={String(who || '') === String(app.assignedTo || '')} onClick={save}>Save</Btn>
      </div>
    </Panel>
  );
}

/* ── Next step: confirm, enrol, activate ──────────────────────────────────── */

function NextStep({ d, reload }) {
  const app = d.application;
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(false);
  const blockers = d.confirmation?.blockers || [];
  const conv = app.conversion;

  if (['selected', 'accepted', 'payment_pending'].includes(app.status)) {
    const confirm = async () => {
      setBusy(true);
      try { await admin.confirm(app._id); toast.success('Admission confirmed'); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
    };
    return (
      <Panel title="Confirm the admission" icon="shieldCheck" tone="green">
        {blockers.length ? (
          <Note tone="amber" icon="alert"><b>Not yet:</b><ul style={{ margin: '6px 0 0 18px' }}>{blockers.map((b) => <li key={b}>{b}</li>)}</ul></Note>
        ) : <p className="adm-muted" style={{ fontSize: '.86rem' }}>Everything the school requires is in place. Confirming holds the seat for this student.</p>}
        <Btn kind="success" className="adm-mt" busy={busy} disabled={!!blockers.length} onClick={confirm} style={{ width: '100%' }}>Confirm admission</Btn>
      </Panel>
    );
  }
  if (app.status === 'confirmed') {
    return (
      <Panel title="Create the student" icon="gradCap" tone="green">
        <p className="adm-muted" style={{ fontSize: '.86rem' }}>The admission is confirmed. Create the student's account and record — the parent is created or linked, the student is placed in a section, and fees, transport, hostel and medical records follow where your school uses them.</p>
        <Btn kind="primary" icon="userPlus" className="adm-mt" style={{ width: '100%' }} onClick={() => setConverting(true)}>Create student account</Btn>
        <ConvertDialog open={converting} onClose={() => setConverting(false)} app={app} onDone={reload} />
      </Panel>
    );
  }
  if (app.status === 'enrolled' && conv) {
    const activate = async () => {
      setBusy(true);
      try { const r = await admin.activate(app._id); toast.success('Accounts activated'); (r.data?.sent || []).forEach((s) => toast(s)); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
    };
    const steps = Object.entries(conv.steps || {});
    return (
      <Panel title="Enrolled" icon="checkCircle" tone="green">
        <KV cols={1} items={[
          ['Admission number', app.admissionNumber],
          ['Section', conv.section?.name || 'Not placed yet'],
          ['Student sign-in', conv.studentEmail],
          ['Parent sign-in', `${conv.parentEmail || '—'}${conv.parentMode === 'linked_existing' ? ' (existing parent)' : ''}`],
          ['Fee structure', conv.feeStructure?.name],
          ['Enrolled by', conv.byName ? `${conv.byName}, ${fmtDateTime(conv.at)}` : ''],
        ]} />
        {steps.length ? (
          <ul style={{ listStyle: 'none', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.84rem' }}>
            {steps.map(([k, s]) => <li key={k} className="adm-row" style={{ gap: 6 }}><Ico name={s.ok ? 'checkCircle' : 'alert'} size={14} />{k}{s.ok ? '' : ` — ${s.error}`}</li>)}
          </ul>
        ) : null}
        {conv.activation === 'manual' && !conv.activatedAt ? (
          <>
            <Note tone="amber" icon="lock">The accounts were created switched off, as your enrolment settings ask.</Note>
            <Btn kind="primary" className="adm-mt" busy={busy} style={{ width: '100%' }} onClick={activate}>Activate accounts</Btn>
          </>
        ) : null}
      </Panel>
    );
  }
  return null;
}

function ConvertDialog({ open, onClose, app, onDone }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setP(null); setErr('');
    admin.conversion(app._id).then((r) => {
      const v = r.data;
      setP(v);
      if (v.done) return;
      setF({
        section: (v.placement.sections.find((s) => s.free == null || s.free > 0) || {})._id || '',
        studentAccount: v.student.canUseApplicantAccount && !v.student.email ? 'applicant' : 'new',
        studentEmail: v.student.email || '',
        admissionNumber: '',
        parentMode: 'new', parentId: v.parent.existing?.[0]?._id || '',
        relation: v.parent.relation || 'Father', parentName: v.parent.name || '', parentEmail: v.parent.email || '', parentPhone: v.parent.phone || '',
        activation: v.options.activation || 'immediate',
        fees: !!v.options.fees.available, transport: !!(v.options.transport.available && v.options.transport.requested),
        hostelId: '', medical: !!(v.options.medical.available && v.options.medical.has),
      });
    }).catch((e) => setErr(errMsg(e)));
  }, [open, app._id]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const go = async () => {
    setBusy(true);
    try {
      const body = {
        section: f.section || null,
        studentAccount: f.studentAccount, studentEmail: f.studentAccount === 'new' ? f.studentEmail.trim() : '',
        admissionNumber: f.admissionNumber.trim(),
        parent: f.parentMode === 'existing' ? { mode: 'existing', userId: f.parentId } : { mode: 'new', relation: f.relation, name: f.parentName.trim(), email: f.parentEmail.trim(), phone: f.parentPhone.trim() },
        activation: f.activation,
        options: { fees: f.fees, transport: f.transport, medical: f.medical, ...(f.hostelId ? { hostel: { hostelId: f.hostelId } } : {}) },
      };
      const r = await admin.convert(app._id, body);
      toast.success(r.message || 'Enrolled');
      onClose();
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const o = p?.options;
  return (
    <Dialog open={open} onClose={onClose} title="Create the student account" width={720}
      footer={p && !p.done ? <><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!p.ready} onClick={go}>Enrol student</Btn></> : <Btn onClick={onClose}>Close</Btn>}>
      {err ? <Note tone="red" icon="alert">{err}</Note> : !p ? <Spin /> : p.done ? (
        <Note tone="green" icon="checkCircle">Already enrolled — admission number {p.admissionNumber}. Nothing will be created twice.</Note>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {p.blockers.length ? <Note tone="red" icon="alert">{p.blockers.join('; ')}</Note> : null}
          {p.warnings.map((w) => <Note key={w} tone="amber" icon="alert">{w}</Note>)}
          <section>
            <h3 style={{ fontSize: '.95rem', marginBottom: 8 }}>Student</h3>
            <div className="adm-grid2">
              <Field label="Name"><Input value={p.student.name} disabled /></Field>
              <Field label="Admission number" hint={p.placement.admissionNumberPreview ? `Leave empty for the next number (${p.placement.admissionNumberPreview})` : 'Leave empty for the next number'}>
                <Input value={f.admissionNumber || ''} onChange={(e) => set('admissionNumber', e.target.value)} maxLength={40} data-text="code" />
              </Field>
              <Field label="Class">
                <Input value={`${p.placement.class.className} · ${p.placement.academicYear.yearName}`} disabled />
              </Field>
              <Field label="Section" hint={p.placement.sections.length ? '' : 'No section exists yet for this class and year'}>
                <Select value={f.section || ''} onChange={(e) => set('section', e.target.value)}>
                  <option value="">Place in a section later</option>
                  {p.placement.sections.map((s) => <option key={s._id} value={s._id} disabled={s.free === 0}>{s.sectionName}{s.capacity ? ` — ${s.free} of ${s.capacity} free` : ''}</option>)}
                </Select>
              </Field>
            </div>
            <div className="adm-mt" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {p.student.canUseApplicantAccount ? (
                <label className="adm-check"><input type="radio" checked={f.studentAccount === 'applicant'} onChange={() => set('studentAccount', 'applicant')} /><span>Turn the applicant's account ({p.student.applicantEmail}) into the student's</span></label>
              ) : null}
              <label className="adm-check"><input type="radio" checked={f.studentAccount === 'new'} onChange={() => set('studentAccount', 'new')} /><span>Give the student a sign-in of their own</span></label>
              {f.studentAccount === 'new' ? (
                <Field label="Student's sign-in email" required><Input type="email" value={f.studentEmail || ''} onChange={(e) => set('studentEmail', e.target.value)} maxLength={200} /></Field>
              ) : null}
            </div>
          </section>
          <section>
            <h3 style={{ fontSize: '.95rem', marginBottom: 8 }}>Parent</h3>
            <div className="adm-choices" style={{ marginBottom: 10 }}>
              <label className={`adm-choice ${f.parentMode === 'new' ? 'is-on' : ''}`}><input type="radio" checked={f.parentMode === 'new'} onChange={() => set('parentMode', 'new')} />From the application</label>
              {p.parent.existing.length ? <label className={`adm-choice ${f.parentMode === 'existing' ? 'is-on' : ''}`}><input type="radio" checked={f.parentMode === 'existing'} onChange={() => set('parentMode', 'existing')} />An existing parent at the school</label> : null}
            </div>
            {f.parentMode === 'existing' ? (
              <Field label="Parent account">
                <Select value={f.parentId} onChange={(e) => set('parentId', e.target.value)}>
                  {p.parent.existing.map((x) => <option key={x._id} value={x._id}>{x.name} — {x.email}{x.phone ? `, ${x.phone}` : ''} ({x.childCount} child{x.childCount === 1 ? '' : 'ren'})</option>)}
                </Select>
              </Field>
            ) : (
              <div className="adm-grid2">
                <Field label="Relation"><Select value={f.relation} onChange={(e) => set('relation', e.target.value)}>{['Father', 'Mother', 'Guardian'].map((r) => <option key={r}>{r}</option>)}</Select></Field>
                <Field label="Name" required><Input value={f.parentName || ''} onChange={(e) => set('parentName', e.target.value)} maxLength={100} data-text="name" /></Field>
                <Field label="Sign-in email" required><Input type="email" value={f.parentEmail || ''} onChange={(e) => set('parentEmail', e.target.value)} maxLength={200} /></Field>
                <Field label="Mobile"><Input value={f.parentPhone || ''} onChange={(e) => set('parentPhone', e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" /></Field>
              </div>
            )}
          </section>
          <section>
            <h3 style={{ fontSize: '.95rem', marginBottom: 8 }}>Along with the account</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {o.fees.available ? <Check checked={f.fees} onChange={(v) => set('fees', v)}>Assign fees{o.fees.structure ? ` — ${o.fees.structure.name} (${money(o.fees.structure.totalAmount)})` : ' (no fee structure found for this class yet)'}</Check> : null}
              {o.transport.available && o.transport.requested ? <Check checked={f.transport} onChange={(v) => set('transport', v)}>Send a transport request{o.transport.address ? ` — pickup at ${o.transport.address}` : ''}</Check> : null}
              {o.hostel.available && o.hostel.requested ? (
                <Field label="Hostel admission" hint="The family asked for a hostel place.">
                  <Select value={f.hostelId} onChange={(e) => set('hostelId', e.target.value)}>
                    <option value="">Do not create a hostel admission</option>
                    {o.hostel.hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
                  </Select>
                </Field>
              ) : null}
              {o.medical.available && o.medical.has ? <Check checked={f.medical} onChange={(v) => set('medical', v)}>Copy the health information to the Medical Room</Check> : null}
              {o.documents.available && o.documents.list.length ? <span className="adm-muted" style={{ fontSize: '.82rem' }}>Verified documents copied to the student record: {o.documents.list.filter((x) => x.status === 'verified').map((x) => x.name).join(', ') || 'none yet'}.</span> : null}
              <Field label="Accounts">
                <Select value={f.activation} onChange={(e) => set('activation', e.target.value)}>
                  <option value="immediate">Switch on now and send sign-in details</option>
                  <option value="manual">Create switched off — activate later</option>
                </Select>
              </Field>
            </div>
          </section>
        </div>
      )}
    </Dialog>
  );
}

/* ── Application answers ──────────────────────────────────────────────────── */

function AnswersTab({ d, reload }) {
  const app = d.application;
  const [section, setSection] = useState(null);
  const [shown, setShown] = useState({});   // Aadhaar numbers revealed in this visit (logged by the server)
  const reveal = async (key) => {
    try { const r = await admin.reveal(app._id, key); setShown((x) => ({ ...x, [key]: r.data.value })); } catch (e) { toast.error(errMsg(e)); }
  };
  const canCorrect = !['draft', 'enrolled'].includes(app.status) && !d.application.closedReason;
  if (!d.answers?.length) return <Panel><Empty icon="files" title="No answers yet">The family has not filled in the form yet.</Empty></Panel>;
  return (
    <>
      {app.retiredData && Object.keys(app.retiredData).length ? (
        <Note tone="gray" icon="history">Answers to questions the school has since removed are kept with the application ({Object.keys(app.retiredData).length}).</Note>
      ) : null}
      {d.answers.map((sec) => (
        <Panel key={sec.section} title={sec.title} right={canCorrect ? <Btn size="sm" kind="ghost" icon="pencil" onClick={() => setSection(sec.section)}>Correct</Btn> : null}>
          <KV cols={2} items={sec.fields.map((f) => [f.label, f.hidden ? <i key={f.key} className="adm-muted">Hidden</i> : (
            <span key={f.key}>
              {f.masked && shown[f.key] ? <span className="adm-num">{shown[f.key]}</span> : (String(f.value ?? '') || <span className="adm-muted">—</span>)}
              {f.sensitive ? <> <Chip tone="amber">Sensitive</Chip></> : null}
              {f.masked && !shown[f.key] && d.permissions?.canReveal ? <> <Btn size="sm" kind="ghost" icon="eye" onClick={() => reveal(f.key)} title="Shows the full number — the view is recorded">Show</Btn></> : null}
            </span>
          )])} />
        </Panel>
      ))}
      <CorrectDialog open={!!section} onClose={() => setSection(null)} d={d} sectionKey={section} onDone={reload} />
    </>
  );
}

function CorrectDialog({ open, onClose, d, sectionKey, onDone }) {
  const app = d.application;
  const [values, setValues] = useState({});
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setValues({ ...(app.data || {}) }); setReason(''); setErrors({}); } }, [open, app.data]);
  // Uploads are reviewed under Documents, never edited as answers.
  const schema = useMemo(() => ({ sections: (d.schema?.sections || []).map((s) => ({ ...s, fields: s.fields.filter((f) => f.type !== 'file') })) }), [d.schema]);
  const go = async () => {
    const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(app.data?.[k])));
    if (!Object.keys(changed).length) { toast('Nothing was changed'); return; }
    setBusy(true);
    try {
      await admin.correct(app._id, changed, reason.trim());
      toast.success('Answers corrected');
      onClose();
      onDone();
    } catch (e) {
      if (e?.data?.errors?.length) setErrors(Object.fromEntries(e.data.errors.map((x) => [x.path, x.message])));
      toast.error(errMsg(e));
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Correct the answers" width={760}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!reason.trim()} onClick={go}>Save correction</Btn></>}>
      <Note icon="history">The change, who made it and why are kept in the history. The family sees the corrected answers.</Note>
      <div className="adm-mt">
        <FormRenderer schema={schema} values={values} onChange={(k, v) => setValues((x) => ({ ...x, [k]: v }))} errors={errors}
          scope={{ classId: app.class, roundId: app.round }} sectionKeys={sectionKey ? [sectionKey] : undefined} showSensitiveMark />
      </div>
      <Field label="Reason for the correction" required className="adm-mt">
        <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </Field>
    </Dialog>
  );
}

/* ── Documents ────────────────────────────────────────────────────────────── */

function DocumentsTab({ d, reload }) {
  const app = d.application;
  const files = d.documents.files || [];
  const byKey = new Map(files.map((f) => [f.docKey, f]));
  const reqs = d.documents.requirements || [];
  const extra = files.filter((f) => !reqs.some((r) => r.key === f.docKey));
  const [review, setReview] = useState(null);   // { doc, decision, reasons }
  const [upKey, setUpKey] = useState('');
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!upKey || !file) return;
    setBusy(true);
    try { await admin.uploadDoc(app._id, upKey, file); toast.success('Document added'); setUpKey(''); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const row = (r, doc) => (
    <div key={r.key} className={`adm-upload ${doc ? (['rejected', 'resubmission_required'].includes(doc.status) ? 'is-bad' : 'is-filled') : ''}`}>
      <Ico name={doc ? 'files' : 'upload'} size={20} />
      <div className="adm-upload__text">
        <strong>{r.name}{r.required ? <span className="adm-req">*</span> : null}{r.sensitive ? <> <Chip tone="amber">Sensitive</Chip></> : null}</strong>
        <em>{doc ? `${doc.originalName || 'File'} · ${size(doc.size || 0)} · version ${doc.version} · ${fmtDateTime(doc.createdAt)}` : 'Not uploaded'}{doc?.rejectionReason ? ` — ${doc.rejectionReason}` : ''}</em>
      </div>
      {doc ? <DocChip status={doc.status} /> : r.required ? <Chip tone="amber">Missing</Chip> : <Chip tone="gray">Optional</Chip>}
      {doc?.origin === 'digilocker' ? <Chip tone="teal" title={`Fetched from DigiLocker${doc.originMeta?.account?.name ? ` (account: ${doc.originMeta.account.name}${doc.originMeta.account.dobMatchesStudent ? ', same date of birth as the student' : ', a different date of birth — likely a parent\'s locker'})` : ''}`}>DigiLocker{doc.originMeta?.issuer ? ` · ${doc.originMeta.issuer}` : ''}</Chip> : null}
      {doc?.scanStatus === 'unavailable' ? <Chip tone="amber" title="The virus scanner could not be reached when this was uploaded">Not virus-scanned</Chip>
        : doc?.scanStatus === 'clean' ? <Chip tone="green" title={`Checked by the virus scanner ${fmtDateTime(doc.scannedAt)}`}>Scanned</Chip> : null}
      {doc ? <IconBtn icon="eye" label="Open" onClick={() => openFile(admin.docUrl(doc._id))} /> : null}
      {doc && doc.status !== 'verified' ? <Btn size="sm" kind="success" onClick={() => setReview({ doc: { ...doc, name: r.name, fileUrl: admin.docUrl(doc._id) }, decision: 'verify', reasons: r.rejectionReasons || [] })}>Verify</Btn> : null}
      {doc ? <Btn size="sm" onClick={() => setReview({ doc: { ...doc, name: r.name, fileUrl: admin.docUrl(doc._id) }, decision: 'resubmit', reasons: r.rejectionReasons || [] })}>{doc.status === 'verified' ? 'Re-check' : 'Problem'}</Btn> : null}
    </div>
  );
  return (
    <>
      <Panel title="Documents" sub={`${d.documents.summary?.uploaded ?? 0} uploaded · ${d.documents.summary?.verified ?? 0} verified`} icon="fileCheck">
        {reqs.length || extra.length ? (
          <div className="adm-doclist">
            {reqs.map((r) => row(r, byKey.get(r.key)))}
            {extra.map((doc) => row({ key: doc.docKey, name: doc.docKey.replace(/_/g, ' '), required: false, rejectionReasons: [] }, doc))}
          </div>
        ) : <Empty compact icon="files" title="No documents are asked for" />}
        {app.status !== 'draft' && app.status !== 'enrolled' ? (
          <div className="adm-row adm-mt">
            <Select value={upKey} onChange={(e) => setUpKey(e.target.value)} style={{ width: 'auto', minWidth: 220 }} aria-label="Document type">
              <option value="">Add a document handed in at the office…</option>
              {reqs.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </Select>
            <label className={`adm-btn adm-btn--outline ${!upKey || busy ? 'is-busy' : ''}`} style={{ cursor: upKey ? 'pointer' : 'not-allowed', opacity: upKey ? 1 : 0.55 }}>
              {busy ? <span className="adm-spin adm-spin--sm" style={{ borderColor: '#c7d2fe', borderTopColor: 'var(--primary)' }} /> : <Ico name="upload" size={15} />}Choose file
              <input type="file" hidden disabled={!upKey || busy} accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; upload(x); }} />
            </label>
          </div>
        ) : null}
      </Panel>
      {(d.documents.history || []).length ? (
        <Panel title="Earlier copies" icon="history" pad={false}>
          <Table dense rows={d.documents.history} columns={[
            { key: 'docKey', label: 'Document', render: (h) => h.docKey.replace(/_/g, ' ') },
            { key: 'version', label: 'Version', render: (h) => h.version },
            { key: 'status', label: 'Status', render: (h) => <DocChip status={h.status} /> },
            { key: 'reason', label: 'Reason', render: (h) => h.rejectionReason || '—' },
            { key: 'at', label: 'Uploaded', render: (h) => fmtDate(h.createdAt) },
            { key: 'open', label: '', render: (h) => <IconBtn icon="eye" label="Open" onClick={() => openFile(admin.docUrl(h._id))} /> },
          ]} />
        </Panel>
      ) : null}
      <ReviewDialog open={!!review} onClose={() => setReview(null)} doc={review?.doc} reasons={review?.reasons || []} initial={review?.decision}
        review={admin.reviewDoc} onDone={reload} />
    </>
  );
}

/* ── Exams and lists ──────────────────────────────────────────────────────── */

function AssessmentTab({ d }) {
  const nav = useNavigate();
  return (
    <>
      <Panel title="Exams and interviews" icon="clipboard" pad={false}>
        <Table rows={d.exams || []} onRow={(r) => nav(`${BASE}/exams/${r.examId}`)}
          empty={<Empty compact icon="clipboard" title="Not scheduled for any exam" />}
          columns={[
            { key: 'name', label: 'Exam', render: (r) => <><b>{r.name}</b><div className="adm-muted" style={{ fontSize: '.76rem' }}>{EXAM_MODE[r.mode]} · {fmtDateTime(r.slot || r.startsAt)}</div></> },
            { key: 'roll', label: 'Roll no.', render: (r) => <span className="adm-num">{r.rollNumber || '—'}</span> },
            { key: 'status', label: 'Attendance', render: (r) => <Chip tone={r.status === 'absent' ? 'red' : ['present', 'attempted', 'evaluated'].includes(r.status) ? 'green' : 'gray'}>{r.status}</Chip> },
            { key: 'result', label: 'Result', render: (r) => (r.absent ? <Chip tone="red">Absent</Chip> : r.total != null ? <><b>{r.total}</b>{r.percentage != null ? ` (${r.percentage}%)` : ''}{r.grade ? ` · ${r.grade}` : ''}</> : <span className="adm-muted">—</span>) },
            { key: 'passed', label: '', render: (r) => (r.passed == null || r.absent ? null : <Chip tone={r.passed ? 'green' : 'red'}>{r.passed ? 'Qualified' : 'Not qualified'}</Chip>) },
            { key: 'rs', label: 'Results', render: (r) => <ResultsChip status={r.resultStatus === 'published' ? 'published' : r.resultsStatus} /> },
          ]} />
      </Panel>
      <Panel title="Merit lists" icon="trophy" pad={false}>
        <Table rows={d.lists || []} rowKey={(r) => `${r.name}-${r.listNo}`}
          empty={<Empty compact icon="trophy" title="Not on any list yet" />}
          columns={[
            { key: 'name', label: 'List', render: (r) => r.name },
            { key: 'rank', label: 'Rank', render: (r) => r.rank },
            { key: 'score', label: 'Score', render: (r) => (r.score ?? '—') },
            { key: 'decision', label: 'Decision', render: (r) => <><DecisionChip value={r.decision} />{r.waitPosition ? ` #${r.waitPosition}` : ''}{r.manual ? <> <Chip tone="amber" title={r.reason}>By hand</Chip></> : null}</> },
            { key: 'status', label: 'List status', render: (r) => r.status.replace(/_/g, ' ') },
          ]} />
      </Panel>
    </>
  );
}

/* ── Offer ────────────────────────────────────────────────────────────────── */

function OfferTab({ d, reload }) {
  const app = d.application;
  const live = (d.offers || []).find((o) => ['issued', 'accepted'].includes(o.status));
  const [dlg, setDlg] = useState(null);   // 'offer' | 'extend' | 'withdraw' | 'accept' | 'decline'
  const canOffer = !live && ['verified', 'eligible', 'exam_completed', 'interview_completed', 'evaluated', 'selected', 'waitlisted', 'offer_expired'].includes(app.status);
  return (
    <>
      <Panel title="Offer" icon="mail" right={canOffer ? <Btn size="sm" kind="primary" icon="send" onClick={() => setDlg('offer')}>Make an offer</Btn> : null}>
        {live ? (
          <>
            <KV cols={3} items={[
              ['Offer', live.offerNumber], ['Status', <OfferChip key="s" status={live.status} />], ['Issued', fmtDateTime(live.issuedAt)],
              ['Respond by', fmtDateTime(live.respondBy)], ['Admission fee', money(live.feeAmount)], ['Fee due', fmtDate(live.feeDueAt)],
            ]} />
            <div className="adm-row adm-mt">
              {live.status === 'issued' ? <><Btn size="sm" kind="success" onClick={() => setDlg('accept')}>Record acceptance</Btn><Btn size="sm" onClick={() => setDlg('decline')}>Record decline</Btn></> : null}
              <Btn size="sm" icon="calendar" onClick={() => setDlg('extend')}>Extend</Btn>
              <Btn size="sm" kind="ghost" icon="closeCircle" onClick={() => setDlg('withdraw')}>Withdraw offer</Btn>
            </div>
          </>
        ) : <p className="adm-muted">{canOffer ? 'No offer yet. Offers are usually made by publishing a merit list; you can also make one here.' : 'No open offer.'}</p>}
      </Panel>
      {(d.offers || []).length ? (
        <Panel title="All offers" icon="history" pad={false}>
          <Table dense rows={d.offers} columns={[
            { key: 'n', label: 'Offer', render: (o) => <span className="adm-num">{o.offerNumber}</span> },
            { key: 's', label: 'Status', render: (o) => <OfferChip status={o.status} /> },
            { key: 'i', label: 'Issued', render: (o) => fmtDate(o.issuedAt) },
            { key: 'r', label: 'Answered', render: (o) => (o.respondedAt ? `${fmtDate(o.respondedAt)}${o.responseNote ? ` — ${o.responseNote}` : ''}` : '—') },
            { key: 'why', label: 'Reason', render: (o) => o.reason || '—' },
          ]} />
        </Panel>
      ) : null}
      <ManualOffer open={dlg === 'offer'} onClose={() => setDlg(null)} app={app} onDone={reload} />
      <ExtendOffer open={dlg === 'extend'} onClose={() => setDlg(null)} app={app} offer={live} onDone={reload} />
      <ConfirmDialog open={dlg === 'withdraw'} onClose={() => setDlg(null)} title="Withdraw this offer?" confirmLabel="Withdraw offer" reason reasonLabel="Reason (the family is told)"
        message="The seat goes back to the class and may be offered to the waiting list."
        onConfirm={async (why) => { try { await admin.withdrawOffer(app._id, why); toast.success('Offer withdrawn'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
      <ConfirmDialog open={dlg === 'accept' || dlg === 'decline'} onClose={() => setDlg(null)} tone={dlg === 'accept' ? 'success' : 'danger'}
        title={dlg === 'accept' ? 'Record that the family accepted' : 'Record that the family declined'} confirmLabel={dlg === 'accept' ? 'Record acceptance' : 'Record decline'}
        reason reasonLabel="How they answered (a call, a letter)"
        onConfirm={async (note) => { try { await admin.respondOffer(app._id, dlg === 'accept', note); toast.success('Recorded'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </>
  );
}

function ManualOffer({ open, onClose, app, onDone }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ respondBy: '', feeAmount: '', feeDueAt: '', note: '' }); }, [open]);
  const go = async () => {
    setBusy(true);
    try {
      await admin.offer(app._id, {
        respondBy: f.respondBy ? new Date(f.respondBy).toISOString() : undefined,
        feeAmount: f.feeAmount === '' ? undefined : Number(f.feeAmount),
        feeDueAt: f.feeDueAt ? new Date(`${f.feeDueAt}T23:59:00`).toISOString() : undefined,
        note: f.note.trim(),
      });
      toast.success('Offer made — the family has been told');
      onClose();
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Make an offer" width={520}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={go}>Make offer</Btn></>}>
      <Note icon="info">A seat is held for this student once the offer is made. Leave a box empty to use the round's terms.</Note>
      <div className="adm-grid2 adm-mt">
        <Field label="Respond by"><Input type="datetime-local" value={f.respondBy || ''} onChange={(e) => setF({ ...f, respondBy: e.target.value })} /></Field>
        <Field label="Admission fee (₹)"><Input type="number" min="0" step="1" value={f.feeAmount ?? ''} onChange={(e) => setF({ ...f, feeAmount: e.target.value })} /></Field>
        <Field label="Fee due by"><Input type="date" value={f.feeDueAt || ''} onChange={(e) => setF({ ...f, feeDueAt: e.target.value })} /></Field>
      </div>
      <Field label="Internal note" className="adm-mt"><TextArea rows={2} value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} /></Field>
    </Dialog>
  );
}

function ExtendOffer({ open, onClose, app, offer, onDone }) {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setDate(toLocalInput(offer?.respondBy)); }, [open, offer?.respondBy]);
  const go = async () => {
    setBusy(true);
    try { await admin.extendOffer(app._id, new Date(date).toISOString()); toast.success('Offer extended'); onClose(); onDone(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Extend the offer" width={420}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!date} onClick={go}>Extend</Btn></>}>
      <Field label="New date to respond by"><Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
    </Dialog>
  );
}

/* ── Fees ─────────────────────────────────────────────────────────────────── */

const KIND_LABEL = { application_fee: 'Application fee', admission_fee: 'Admission fee' };

function FeesTab({ d, reload }) {
  const adm = useAdmission();
  const app = d.application;
  const closed = app.status !== 'enrolled' && adm.statusOf(app.status)?.closed;   // an enrolled student may still owe instalments
  const [pay, setPay] = useState(null);       // kind
  const [waive, setWaive] = useState(null);   // kind
  const [voiding, setVoiding] = useState(null);
  const [unwaive, setUnwaive] = useState(null);
  const [refunding, setRefunding] = useState(null);
  const [linking, setLinking] = useState(null); // kind
  const refunds = d.fees.refunds || [];
  const refundedOn = (p) => refunds.filter((r) => r.payment === p._id && r.status !== 'failed').reduce((s, r) => s + Number(r.amount), 0);
  const card = (kind, b) => (
    <Panel key={kind} title={KIND_LABEL[kind]} icon="wallet" right={<FeeChip status={b.status} />}>
      <KV cols={2} items={[['Fee', money(b.fee)], ['Waived', money(b.waived)], ['Paid', money(b.paid)], ['Due', <b key="d">{money(b.due)}</b>], ...(b.refunded > 0 ? [['Refunded', money(b.refunded)]] : [])]} />
      {b.excess > 0 ? <Note tone="amber" icon="alert">{money(b.excess)} more than the fee was received — refund it from the payments below.</Note> : null}
      {b.schedule ? <Instalments plan={b.schedule} /> : null}
      {b.due > 0 && !closed && app.status !== 'draft' ? (
        <div className="adm-row adm-mt">
          {app.status !== 'enrolled' || kind === 'admission_fee' ? <Btn size="sm" kind="primary" icon="wallet" onClick={() => setPay(kind)}>Record payment</Btn> : null}
          {(d.waivers || []).length && app.status !== 'enrolled' ? <Btn size="sm" icon="percent" onClick={() => setWaive(kind)}>Apply waiver</Btn> : null}
          {kind === 'application_fee' || ['offer_issued', 'accepted', 'payment_pending', 'confirmed', 'enrolled'].includes(app.status)
            ? <Btn size="sm" icon="send" onClick={() => setLinking(kind)}>Payment link…</Btn> : null}
        </div>
      ) : null}
    </Panel>
  );
  return (
    <>
      <div className="adm-grid2">
        {card('application_fee', d.fees.application)}
        {card('admission_fee', d.fees.admission)}
      </div>
      {d.fees.openOrder ? <Note tone="indigo" icon="info">An online payment was started on {fmtDateTime(d.fees.openOrder.createdAt)} and has not come back from the gateway. The family can check it from their page; it is never marked paid without the gateway's confirmation.</Note> : null}
      {(d.fees.waivers || []).length ? (
        <Panel title="Waivers" icon="percent" pad={false}>
          <Table dense rowKey={(w) => `${w.kind}-${w.key}`} rows={d.fees.waivers} columns={[
            { key: 'n', label: 'Waiver', render: (w) => w.name },
            { key: 'k', label: 'On', render: (w) => KIND_LABEL[w.kind] },
            { key: 'a', label: 'Amount', align: 'right', render: (w) => money(w.amount) },
            { key: 'r', label: 'Reason', render: (w) => <>{w.reason}<div className="adm-muted" style={{ fontSize: '.74rem' }}>{w.byName} · {fmtDate(w.at)}</div></> },
            { key: 'x', label: '', render: (w) => (app.status !== 'enrolled' ? <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => setUnwaive(w)} /> : null) },
          ]} />
        </Panel>
      ) : null}
      <Panel title="Payments" icon="creditCard" pad={false}>
        <Table rows={d.fees.payments || []} empty={<Empty compact icon="creditCard" title="No payments yet" />}
          columns={[
            { key: 'r', label: 'Receipt', render: (p) => <span className="adm-num">{p.receiptNumber || '—'}</span> },
            { key: 'k', label: 'For', render: (p) => KIND_LABEL[p.kind] },
            { key: 'a', label: 'Amount', align: 'right', render: (p) => { const r = refundedOn(p); return <>{money(p.amount)}{r > 0 ? <div className="adm-muted" style={{ fontSize: '.74rem' }}>{money(r)} refunded</div> : null}</>; } },
            { key: 'm', label: 'Mode', render: (p) => <>{(PAY_MODES.find((m) => m.value === p.mode)?.label) || (p.mode === 'online' ? 'Online' : p.mode)}{p.reference ? <div className="adm-muted" style={{ fontSize: '.74rem' }}>{p.reference}</div> : null}</> },
            { key: 'd', label: 'Paid', render: (p) => fmtDate(p.paidAt || p.createdAt) },
            { key: 's', label: 'Status', render: (p) => <Chip tone={p.status === 'paid' ? 'green' : p.status === 'void' ? 'gray' : 'amber'} title={p.voidReason}>{p.status === 'void' ? 'Cancelled' : p.status}</Chip> },
            { key: 'x', label: '', render: (p) => (
              <div className="adm-row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                {['paid', 'void'].includes(p.status) ? <IconBtn icon="eye" label="Receipt" onClick={() => openFile(admin.receiptUrl(app._id, p._id))} /> : null}
                {p.status === 'paid' && Number(p.amount) - refundedOn(p) > 0.001 ? <IconBtn icon="reply" label="Refund" onClick={() => setRefunding({ ...p, left: Math.round((Number(p.amount) - refundedOn(p)) * 100) / 100 })} /> : null}
                {p.status === 'paid' && p.mode !== 'online' && app.status !== 'enrolled' && !refundedOn(p) ? <IconBtn icon="closeCircle" kind="danger" label="Cancel receipt" onClick={() => setVoiding(p)} /> : null}
              </div>
            ) },
          ]} />
      </Panel>
      {refunds.length ? (
        <Panel title="Refunds" icon="reply" pad={false}>
          <Table dense rows={refunds} columns={[
            { key: 'r', label: 'On receipt', render: (r) => <span className="adm-num">{r.receiptNumber || '—'}</span> },
            { key: 'a', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
            { key: 'm', label: 'How', render: (r) => <>{r.mode === 'gateway' ? 'Through the gateway' : (REFUND_MODES.find((m) => m.value === r.mode)?.label || r.mode)}{r.reference ? <div className="adm-muted" style={{ fontSize: '.74rem' }}>{r.reference}</div> : null}</> },
            { key: 'w', label: 'Why', render: (r) => <>{r.reason}<div className="adm-muted" style={{ fontSize: '.74rem' }}>{fmtDateTime(r.createdAt)}</div></> },
            { key: 's', label: 'Status', render: (r) => <><Chip tone={REFUND_STATUS[r.status]?.[1]}>{REFUND_STATUS[r.status]?.[0] || r.status}</Chip>{r.error ? <div className="adm-muted" style={{ fontSize: '.74rem', maxWidth: 260 }}>{r.error}</div> : null}</> },
          ]} />
        </Panel>
      ) : null}
      <RecordPayment open={!!pay} kind={pay} due={pay ? d.fees[pay === 'application_fee' ? 'application' : 'admission'].due : 0} onClose={() => setPay(null)} app={app} onDone={reload} />
      <ApplyWaiver open={!!waive} kind={waive} waivers={d.waivers || []} onClose={() => setWaive(null)} app={app} onDone={reload} />
      <RefundDialog payment={refunding} app={app} onClose={() => setRefunding(null)} onDone={reload} />
      <PayLinkDialog kind={linking} app={app} due={linking ? d.fees[linking === 'application_fee' ? 'application' : 'admission'].due : 0} onClose={() => setLinking(null)} onDone={reload} />
      <ConfirmDialog open={!!voiding} onClose={() => setVoiding(null)} title={`Cancel receipt ${voiding?.receiptNumber || ''}?`} confirmLabel="Cancel receipt" reason
        message="The receipt stays on record, marked cancelled, and the amount is due again."
        onConfirm={async (why) => { try { await admin.voidPayment(app._id, voiding._id, why); toast.success('Receipt cancelled'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
      <ConfirmDialog open={!!unwaive} onClose={() => setUnwaive(null)} title={`Remove ${unwaive?.name || 'the waiver'}?`} confirmLabel="Remove waiver" reason
        onConfirm={async (why) => { try { await admin.removeWaiver(app._id, { kind: unwaive.kind, waiverKey: unwaive.key, reason: why }); toast.success('Waiver removed'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </>
  );
}

/** The admission fee's instalments — each with what is still owed on it (the family's page shows the same rows). */
function Instalments({ plan }) {
  return (
    <div className="adm-mt">
      <div className="adm-muted" style={{ fontSize: '.78rem', fontWeight: 650, marginBottom: 6 }}>In {plan.length} instalments</div>
      <div className="adm-instalments">
        {plan.map((x) => (
          <div key={x.index} className={`adm-instalment is-${x.status}`}>
            <span><b>{x.label}</b><em>{money(x.amount)} · by {fmtDate(x.dueAt)}</em></span>
            <Chip tone={INSTALMENT_STATUS[x.status]?.[1]}>{x.status === 'part' ? `${money(x.owing)} owing` : INSTALMENT_STATUS[x.status]?.[0]}</Chip>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Money given back on one payment. An online payment is refunded through the
 * gateway — its answer is shown as it comes, never assumed — and money taken
 * at the counter is recorded as given back by cash, cheque, transfer or UPI.
 */
function RefundDialog({ payment, app, onClose, onDone }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (payment) setF({ amount: String(payment.left), mode: payment.mode === 'online' ? 'gateway' : 'cash', reference: '', reason: '' }); }, [payment]);
  if (!payment) return null;
  const online = payment.mode === 'online';
  const needRef = !online && f.mode && f.mode !== 'cash';
  const go = async () => {
    setBusy(true);
    try {
      const r = await admin.refund(app._id, payment._id, { amount: Number(f.amount), mode: online ? undefined : f.mode, reference: (f.reference || '').trim(), reason: (f.reason || '').trim() });
      toast.success(r.data?.status === 'pending' ? 'Refund sent to the gateway — it shows here as refunded once the gateway completes it' : 'Refund recorded');
      onClose();
      onDone();
    } catch (e) { toast.error(errMsg(e)); if (e?.data?.code === 'REFUND_FAILED') { onClose(); onDone(); } } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Refund on receipt ${payment.receiptNumber || ''}`} width={500}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="danger" busy={busy} disabled={!(Number(f.amount) > 0) || Number(f.amount) > payment.left || !f.reason?.trim() || (needRef && !f.reference?.trim())} onClick={go}>{online ? 'Refund through the gateway' : 'Record the refund'}</Btn></>}>
      <Note icon="info" tone={online ? 'indigo' : 'gray'}>
        {online ? 'The gateway sends the money back to the card, account or UPI it came from. Its answer is recorded as it comes.' : 'For money given back at the school. The family is told, and the amount counts as due again.'}
        {' '}At most {money(payment.left)} of this payment can be refunded.
      </Note>
      <div className="adm-grid2 adm-mt">
        <Field label="Amount (₹)" required><Input type="number" min="0.01" step="0.01" max={payment.left} value={f.amount ?? ''} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        {online ? null : (
          <Field label="Given back by" required><Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{REFUND_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></Field>
        )}
        {needRef ? <Field label="Reference" required hint="Cheque or transaction number"><Input value={f.reference || ''} onChange={(e) => setF({ ...f, reference: e.target.value })} maxLength={80} data-text="code" /></Field> : null}
      </div>
      <Field label="Reason" required className="adm-mt" hint="The family sees it in the email about the refund"><TextArea rows={2} value={f.reason || ''} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={300} /></Field>
    </Dialog>
  );
}

/**
 * A signed link to pay one fee without signing in — for seven days, at this
 * school's portal only; it shows the application number, the child's first
 * name and the amount, and can only pay (services/admission/payLink.js).
 */
function PayLinkDialog({ kind, app, due, onClose, onDone }) {
  const [busy, setBusy] = useState('');
  const [made, setMade] = useState(null);
  useEffect(() => { if (kind) setMade(null); }, [kind]);
  if (!kind) return null;
  const make = async (send) => {
    setBusy(send ? 'send' : 'make');
    try {
      const r = await admin.payLink(app._id, { kind, send });
      setMade({ ...r.data, sent: send });
      toast.success(send ? 'Link emailed to the family' : 'Link made');
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(made.url); toast.success('Link copied'); } catch { toast.error('Copy it from the box'); }
  };
  return (
    <Dialog open onClose={onClose} title={`Payment link — ${KIND_LABEL[kind]?.toLowerCase()}`} width={540}
      footer={made ? <Btn onClick={onClose}>Done</Btn> : <><Btn onClick={onClose}>Cancel</Btn><Btn busy={busy === 'make'} disabled={!!busy} onClick={() => make(false)}>Make the link</Btn><Btn kind="primary" icon="send" busy={busy === 'send'} disabled={!!busy} onClick={() => make(true)}>Make and email it</Btn></>}>
      {made ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Note tone="green" icon="checkCircle">{made.sent ? 'Emailed to the family. ' : ''}It works until {fmtDateTime(made.expiresAt)}.</Note>
          <div className="adm-row" style={{ flexWrap: 'nowrap' }}>
            <Input readOnly value={made.url} onFocus={(e) => e.target.select()} aria-label="Payment link" />
            <Btn icon="copy" onClick={copy}>Copy</Btn>
          </div>
        </div>
      ) : (
        <Note icon="info">
          Anyone with the link can pay {money(due)} towards this {KIND_LABEL[kind]?.toLowerCase()} for the next seven days — a relative, say, or a family that cannot sign in.
          It shows only the application number, the child&rsquo;s first name and the amount, and it can only pay. The gateway must be switched on for admissions.
        </Note>
      )}
    </Dialog>
  );
}

function RecordPayment({ open, onClose, app, kind, due, onDone }) {
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ amount: String(due || ''), mode: 'cash', reference: '', paidAt: toDateInput(new Date()), notes: '' }); }, [open, due]);
  const needRef = f.mode && f.mode !== 'cash';
  const go = async () => {
    setBusy(true);
    try {
      await admin.recordPayment(app._id, { kind, amount: Number(f.amount), mode: f.mode, reference: f.reference.trim(), paidAt: f.paidAt ? new Date(`${f.paidAt}T12:00:00`).toISOString() : undefined, notes: f.notes.trim() });
      toast.success('Payment recorded — receipt issued');
      onClose();
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={`Record ${KIND_LABEL[kind]?.toLowerCase() || 'payment'}`} width={500}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!Number(f.amount) || (needRef && !f.reference?.trim())} onClick={go}>Record payment</Btn></>}>
      <Note icon="info">For money taken at the school. Online payments are recorded by the gateway itself. {money(due)} is due.</Note>
      <div className="adm-grid2 adm-mt">
        <Field label="Amount (₹)" required><Input type="number" min="0.01" step="0.01" max={due} value={f.amount ?? ''} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Paid by" required><Select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></Field>
        <Field label="Reference" required={needRef} hint={needRef ? 'Cheque, DD or transaction number' : ''}><Input value={f.reference || ''} onChange={(e) => setF({ ...f, reference: e.target.value })} maxLength={80} data-text="code" /></Field>
        <Field label="Date paid"><Input type="date" max={toDateInput(new Date())} value={f.paidAt || ''} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></Field>
      </div>
      <Field label="Notes" className="adm-mt"><TextArea rows={2} value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={300} /></Field>
    </Dialog>
  );
}

function ApplyWaiver({ open, onClose, app, kind, waivers, onDone }) {
  const [key, setKey] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setKey(''); setReason(''); } }, [open]);
  const list = waivers.filter((w) => w.appliesTo === 'both' || `${w.appliesTo}_fee` === kind);
  const go = async () => {
    setBusy(true);
    try { await admin.addWaiver(app._id, { kind, waiverKey: key, reason: reason.trim() }); toast.success('Waiver applied'); onClose(); onDone(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={`Waiver on the ${KIND_LABEL[kind]?.toLowerCase() || 'fee'}`} width={480}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!key || !reason.trim()} onClick={go}>Apply waiver</Btn></>}>
      {list.length ? (
        <>
          <Field label="Waiver" required>
            <Select value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">Choose a waiver</option>
              {list.map((w) => <option key={w.key} value={w.key}>{w.name} — {w.type === 'percent' ? `${w.value}%` : money(w.value)}{w.requiresApproval ? ' (administrators)' : ''}</option>)}
            </Select>
          </Field>
          <Field label="Reason" required className="adm-mt"><TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
        </>
      ) : <Empty compact icon="percent" title="No waiver applies to this fee">Waivers are set up under Settings → Fees.</Empty>}
    </Dialog>
  );
}

/* ── History ──────────────────────────────────────────────────────────────── */

function HistoryTab({ d, reload }) {
  const app = d.application;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [only, setOnly] = useState('all');
  const add = async () => {
    setBusy(true);
    try { await admin.note(app._id, text.trim()); setText(''); toast.success('Note added'); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const items = (d.timeline || []).filter((t) => only === 'all' || (only === 'notes' ? t.type === 'note' : t.visibility === 'applicant'));
  return (
    <Panel title="History" icon="history" right={<Tabs variant="solid" size="sm" value={only} onChange={setOnly} items={[{ key: 'all', label: 'Everything' }, { key: 'applicant', label: 'What the family sees' }, { key: 'notes', label: 'Notes' }]} />}>
      <div className="adm-row" style={{ alignItems: 'flex-start', marginBottom: 14, flexWrap: 'nowrap' }}>
        <TextArea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an internal note — staff only" maxLength={2000} />
        <Btn kind="primary" busy={busy} disabled={!text.trim()} onClick={add}>Add</Btn>
      </div>
      <Timeline items={items} />
    </Panel>
  );
}
