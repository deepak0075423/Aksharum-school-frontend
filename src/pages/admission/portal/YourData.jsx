/**
 * /<slug>/privacy — "Your data" (Oct 2026). Anyone can read the school's
 * privacy notice and who to ask; a signed-in applicant can also download
 * everything held about them, and ask to correct or erase it, withdraw their
 * consent, or raise a grievance — and follow each answer here.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { portal as api, openProtected } from '../../../api/admission.api';
import { Panel, Btn, Chip, Field, Input, Select, TextArea, Note, Spin, ErrorBox, Dialog, Table, useLoad } from '../admUI';
import PhoneInput from '../../../components/ui/PhoneInput';
import { useAuth } from '../../../contexts/AuthContext';
import { fmtDate, fmtDateTime, errMsg } from '../meta';
import { usePortal, useApplicantHere } from './PortalShell';

const STATUS = { open: ['Received', 'amber'], in_progress: ['Being looked at', 'indigo'], done: ['Done', 'green'], declined: ['Declined', 'gray'] };
const HINT = {
  access: 'You can also download everything right away with the button above.',
  correction: 'Say what is wrong and what it should be.',
  erasure: 'Your applications are withdrawn and erased. An admitted student\'s record and payment amounts are kept, as the law requires.',
  withdraw_consent: 'The application you choose below is withdrawn at once — or every open one, if you leave it on all — and the school stops using that information except where the law requires it to be kept.',
  grievance: 'Tell the school what went wrong. If you are not satisfied with its answer, you may take it to the Data Protection Board of India.',
};

export default function YourData() {
  const portal = usePortal();
  const here = useApplicantHere();
  const p = portal.data.portal;
  return (
    <div className="adm-page" style={{ maxWidth: 920, margin: '0 auto' }}>
      <div className="adm-head">
        <div>
          <div className="adm-head__eyebrow">Privacy</div>
          <h1>Your data</h1>
          <p>What {portal.data.school.name} holds about you for admissions, and what you can ask for.</p>
        </div>
      </div>
      {here ? <Account /> : null}
      {here ? <Mine /> : (
        <Note tone="indigo" icon="lock" action={<Link to={`/${portal.slug}/login`} className="btn btn-primary btn-sm">Sign in</Link>}>
          Sign in to download your information or to ask the school to correct or erase it.
        </Note>
      )}
      <Panel title="The privacy notice" icon="shieldCheck" sub={`Version ${p.privacyVersion || 1}`}>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: '.9rem', lineHeight: 1.6, color: '#334155' }}>{p.privacyNotice}</div>
        {p.privacyContact ? (
          <Note tone="gray" icon="userCircle">
            Questions about your information: {p.privacyContact.name ? <b>{p.privacyContact.name}</b> : 'the admission office'}
            {p.privacyContact.email ? <> · <a href={`mailto:${p.privacyContact.email}`}>{p.privacyContact.email}</a></> : null}
            {p.privacyContact.phone ? <> · {p.privacyContact.phone}</> : null}
          </Note>
        ) : null}
        <p className="adm-muted" style={{ fontSize: '.84rem' }}>See also the <Link to={`/${portal.slug}/cookies`}>cookie policy</Link>.</p>
      </Panel>
    </div>
  );
}

function Mine() {
  const { data, loading, error, reload } = useLoad(() => api.privacy(), []);
  const [asking, setAsking] = useState(false);
  if (loading && !data) return <Spin />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const download = () => openProtected(api.privacyExportUrl(), { download: true, filename: `my-admission-data-${new Date().toISOString().slice(0, 10)}.json` }).catch((e) => toast.error(e.message));
  return (
    <>
      <Panel title="Your information" icon="files" sub={`You agreed to version ${data.consent.agreedVersion || '—'} of the privacy notice${data.consent.agreedAt ? ` on ${fmtDate(data.consent.agreedAt)}` : ''}.`}>
        <div className="adm-row">
          <Btn kind="primary" icon="download" onClick={download}>Download a copy of everything</Btn>
          <Btn icon="send" onClick={() => setAsking(true)}>Ask the school…</Btn>
        </div>
        <p className="adm-muted" style={{ fontSize: '.84rem' }}>
          The school answers within {data.requestDays} days. Your documents can be downloaded from each application&rsquo;s page.
        </p>
      </Panel>
      <Panel title="Your requests" icon="list" pad={false}>
        <Table rows={data.requests}
          empty={<p className="adm-muted" style={{ padding: 16 }}>You have not asked for anything yet.</p>}
          columns={[
            { key: 'n', label: 'Request', render: (r) => <><b className="adm-num">{r.number}</b><div className="adm-muted" style={{ fontSize: '.76rem' }}>{fmtDateTime(r.createdAt)}</div></> },
            { key: 'k', label: 'You asked', render: (r) => r.kindLabel },
            { key: 's', label: 'Status', render: (r) => <Chip tone={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0]}</Chip> },
            { key: 'a', label: 'Answer', render: (r) => (r.response ? r.response : <span className="adm-muted">By {fmtDate(r.dueAt)}</span>) },
          ]} />
      </Panel>
      <AskDialog open={asking} kinds={data.kinds} onClose={() => setAsking(false)} onDone={() => { setAsking(false); reload(); }} />
    </>
  );
}

/**
 * The applicant's own name, mobile and password (Nov 2026 — none of them
 * could be changed while signed in). The email is the sign-in and stays.
 */
function Account() {
  const { user, reload } = useAuth();
  const [f, setF] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [pw, setPw] = useState({ currentPassword: '', password: '', confirm: '' });
  const [busy, setBusy] = useState('');
  const changed = f.name.trim() !== (user?.name || '') || f.phone !== (user?.phone || '');
  const save = async () => {
    setBusy('profile');
    try { await api.updateProfile({ name: f.name.trim(), phone: f.phone }); toast.success('Saved'); await reload?.(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const change = async () => {
    setBusy('password');
    try { await api.changePassword({ currentPassword: pw.currentPassword, password: pw.password }); toast.success('Password changed'); setPw({ currentPassword: '', password: '', confirm: '' }); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  return (
    <Panel title="Your account" icon="userCircle" sub={`You sign in with ${user?.email || 'your email'}.`}>
      <div className="adm-grid2">
        <Field label="Your name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} data-text="name" /></Field>
        <Field label="Mobile"><PhoneInput className="adm-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <div className="adm-row adm-mt"><Btn kind="primary" busy={busy === 'profile'} disabled={!changed || f.name.trim().length < 2} onClick={save}>Save</Btn></div>
      <details className="adm-mt">
        <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: '.9rem' }}>Change your password</summary>
        <div className="adm-grid2 adm-mt">
          <Field label="Present password" required><Input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <span />
          <Field label="New password" required hint="At least 8 characters, with a letter and a number"><Input type="password" autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></Field>
          <Field label="New password again" required error={pw.confirm && pw.confirm !== pw.password ? 'The two do not match' : ''}><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        </div>
        <Note tone="gray" icon="info">This is your email&rsquo;s password: if the same email signs in elsewhere in Aksharum, it changes there too.</Note>
        <div className="adm-row adm-mt"><Btn busy={busy === 'password'} disabled={!pw.currentPassword || pw.password.length < 8 || pw.password !== pw.confirm} onClick={change}>Change password</Btn></div>
      </details>
    </Panel>
  );
}

function AskDialog({ open, kinds, onClose, onDone }) {
  const [kind, setKind] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const apps = useLoad(() => (open ? api.list() : Promise.resolve({ data: [] })), [open]);
  const [application, setApplication] = useState('');
  const strong = ['erasure', 'withdraw_consent'].includes(kind);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.privacyRequest({ kind, details: details.trim(), application: application || undefined });
      toast.success(`Request ${r.data.number} sent`);
      setKind(''); setDetails(''); setApplication('');
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Ask the school about your information" width={560}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind={strong ? 'danger' : 'primary'} busy={busy} disabled={!kind} onClick={go}>{strong ? 'Send — I understand' : 'Send'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="What are you asking for" required>
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Choose…</option>
            {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </Select>
        </Field>
        {kind ? <Note tone={strong ? 'amber' : 'indigo'} icon={strong ? 'alert' : 'info'}>{HINT[kind]}</Note> : null}
        {(apps.data || []).length > 1 ? (
          <Field label="About which application" hint="Leave as it is for all of them">
            <Select value={application} onChange={(e) => setApplication(e.target.value)}>
              <option value="">All my applications</option>
              {apps.data.map((a) => <option key={a._id} value={a._id}>{a.studentName || 'Draft'}{a.applicationNumber ? ` — ${a.applicationNumber}` : ''}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label="Your message" required={['correction', 'grievance'].includes(kind)}>
          <TextArea rows={4} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/**
 * Shown instead of the applicant's pages when the school has changed its
 * privacy notice since they agreed to it — the server refuses changes until
 * they agree again.
 */
export function ConsentGate({ notice, version, onAgreed }) {
  const [busy, setBusy] = useState(false);
  const [read, setRead] = useState(false);
  const agree = async () => {
    setBusy(true);
    try { await api.consent(version); toast.success('Thank you'); onAgreed(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="adm-authcard" style={{ maxWidth: 680, margin: '0 auto' }}>
      <h1>The privacy notice has changed</h1>
      <p>Please read the school&rsquo;s updated privacy notice. You can carry on with your application once you agree to it.</p>
      <div className="adm-privacy" tabIndex={0} aria-label="Privacy notice" style={{ maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{notice}</div>
      <label className="adm-check" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
        <span>I have read the privacy notice and agree to my information being used as it describes.</span>
      </label>
      <div className="adm-row" style={{ marginTop: 14 }}>
        <Btn kind="primary" busy={busy} disabled={!read} onClick={agree}>Agree and continue</Btn>
      </div>
    </div>
  );
}
