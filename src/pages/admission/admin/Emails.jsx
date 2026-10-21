/**
 * The school's admission emails — the wording of each, in a small markup
 * that cannot carry HTML or script, with the placeholders the event provides,
 * a preview rendered by the server exactly as it will be sent, a test send,
 * and every earlier version. Codes (OTPs) are made and checked by the server;
 * a template only says where the code goes.
 *
 * And the delivery log: what was sent to whom, and what failed — retryable.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import { useAuth } from '../../../contexts/AuthContext';
import Tabs from '../../../components/ui/Tabs';
import {
  Page, Head, Panel, Btn, Chip, Table, Toolbar, SearchBox, Select, Pager, Empty, ErrorBox, Spin, Dialog, ConfirmDialog, Field, Input,
  TextArea, Toggle, Note, Tiles, Tile, useLoad,
} from '../admUI';
import { fmtDate, fmtDateTime, errMsg, ago } from '../meta';
import { useAdmission, useQueryState, useDebounced } from './parts';

export default function Emails() {
  const [q, setQ] = useQueryState({ tab: 'templates' });
  const adm = useAdmission();
  return (
    <Page>
      <Head eyebrow="Admissions" title="Emails" subtitle="What families are sent at each step, in your school's words." />
      {adm.catalogs?.mailDriver === 'log' ? <Note tone="amber" icon="mail">The server records admission emails instead of sending them (ADMISSION_MAIL_DRIVER=log). Templates and previews work; nothing reaches an inbox.</Note> : null}
      <Tabs variant="line" value={q.tab} onChange={(v) => setQ({ tab: v })} items={[{ key: 'templates', label: 'Templates' }, { key: 'log', label: 'Delivery log' }, { key: 'delivery', label: 'Getting delivered' }]} />
      {q.tab === 'log' ? <Log /> : q.tab === 'delivery' ? <Delivery /> : <Templates />}
    </Page>
  );
}

/* ── Templates ────────────────────────────────────────────────────────────── */

function Templates() {
  const [q, setQ] = useQueryState({ tab: 'templates', event: '' });
  const { data, loading, error, reload, setData } = useLoad(() => admin.emails(), []);
  const list = data || [];
  const current = list.find((t) => t.event === q.event) || list[0];
  const groups = useMemo(() => {
    const m = new Map();
    for (const t of list) { if (!m.has(t.group)) m.set(t.group, []); m.get(t.group).push(t); }
    return [...m.entries()];
  }, [list]);
  if (loading && !data) return <Spin />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="adm-split" style={{ gridTemplateColumns: '280px minmax(0, 1fr)' }}>
      <Panel pad={false} title="Emails" icon="mail">
        <div className="adm-eventlist" style={{ padding: 6, maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }}>
          {groups.map(([g, items]) => (
            <React.Fragment key={g}>
              <div className="adm-eventlist__group">{g}</div>
              {items.map((t) => (
                <button key={t.event} type="button" className={current?.event === t.event ? 'is-on' : ''} onClick={() => setQ({ event: t.event })}>
                  {t.label}<i className={t.enabled ? '' : 'is-off'} title={t.enabled ? 'On' : 'Off'} />
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      </Panel>
      {current ? <Editor key={`${current.event}-${current.version}`} t={current} onSaved={(row) => setData((rows) => rows.map((r) => (r.event === current.event ? { ...r, ...row } : r)))} reload={reload} /> : null}
    </div>
  );
}

const TOOLS = [
  ['H1', '# ', '', 'Heading'], ['H2', '## ', '', 'Smaller heading'], ['B', '**', '**', 'Bold'], ['I', '_', '_', 'Italic'],
  ['•', '- ', '', 'Bullet'], ['1.', '1. ', '', 'Numbered item'], ['❝', '> ', '', 'Highlighted note'], ['—', '\n---\n', '', 'Divider'],
];

function Editor({ t, onSaved, reload }) {
  const { user } = useAuth();
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const [testTo, setTestTo] = useState(user?.email || '');
  const [dlg, setDlg] = useState(null);   // 'versions' | 'reset' | 'test'
  const ref = useRef(null);
  const dirty = subject !== t.subject || body !== t.body;
  const ds = useDebounced(subject, 500);
  const db = useDebounced(body, 500);
  useEffect(() => {
    let live = true;
    admin.previewEmail(t.event, { subject: ds, body: db }).then((r) => { if (live) setPreview(r.data); }).catch(() => {});
    return () => { live = false; };
  }, [t.event, ds, db]);

  const insert = (before, after = '', placeholder = '') => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const chosen = body.slice(start, end) || placeholder;
    const lineStart = before.endsWith(' ') && !before.startsWith('*') && !before.startsWith('_') && !before.startsWith('\n');
    const at = lineStart ? body.lastIndexOf('\n', start - 1) + 1 : start;
    const next = lineStart ? `${body.slice(0, at)}${before}${body.slice(at)}` : `${body.slice(0, start)}${before}${chosen}${after}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => { el.focus(); const pos = lineStart ? end + before.length : start + before.length + chosen.length + after.length; el.setSelectionRange(pos, pos); });
  };
  const save = async () => {
    setBusy('save');
    try { const r = await admin.saveEmail(t.event, { subject, body, note: note.trim() }); toast.success(`Saved — version ${r.data.version}`); setNote(''); onSaved({ subject: r.data.subject, body: r.data.body, version: r.data.version, custom: true, enabled: r.data.enabled }); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const toggle = async (on) => {
    try { await admin.toggleEmail(t.event, on); onSaved({ enabled: on }); toast.success(on ? 'Switched on' : 'Switched off — this email is not sent'); } catch (e) { toast.error(errMsg(e)); }
  };
  const test = async () => {
    setBusy('test');
    try { const r = await admin.testEmail(t.event, { to: testTo.trim(), subject, body }); toast.success(r.message || 'Test sent'); setDlg(null); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <Panel title={t.label} sub={t.description} icon="mail"
        right={<>
          {t.required ? <Chip tone="indigo" title="Families cannot sign up or reset a password without it">Always sent</Chip> : <Toggle checked={t.enabled} onChange={toggle} label={t.enabled ? 'On' : 'Off'} />}
          <Chip tone={t.custom ? 'violet' : 'gray'}>{t.custom ? `Your wording · v${t.version}` : 'Default wording'}</Chip>
        </>}>
        {(t.needs || []).length ? <Note icon="lock">This email must contain {t.needs.map((n) => `{{${n}}}`).join(', ')} — the server fills in a code it made and checks; the template decides only where it appears.</Note> : null}
        <div className="adm-mailedit adm-mt">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></Field>
            <Field label="Message">
              <div>
                <div className="adm-mailedit__tools" role="toolbar" aria-label="Formatting">
                  {TOOLS.map(([l, b, a, title]) => <button key={l} type="button" title={title} onClick={() => insert(b, a, title === 'Bold' || title === 'Italic' ? 'text' : '')}>{l}</button>)}
                  <button type="button" title="Link" onClick={() => insert('[', '](https://)', 'link text')}>Link</button>
                  <button type="button" title="Button" onClick={() => insert('[[', '|{{application_link}}]]', 'Open my application')}>Button</button>
                </div>
                <TextArea ref={ref} rows={14} value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} spellCheck />
              </div>
            </Field>
            <Field label="Placeholders" hint="Click to insert at the cursor. Green ones are links the server makes.">
              <div className="adm-placeholders">
                {t.placeholders.map((p) => <button key={p.key} type="button" className={p.link ? 'is-link' : ''} title={p.label} onClick={() => insert(`{{${p.key}}}`)}>{`{{${p.key}}}`}</button>)}
              </div>
            </Field>
            <Field label="Note for this version" hint="Optional — kept in the history"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
            <div className="adm-row">
              <Btn kind="primary" icon="save" busy={busy === 'save'} disabled={!dirty || !!preview?.problems?.length} onClick={save}>Save</Btn>
              <Btn icon="send" onClick={() => setDlg('test')}>Send a test</Btn>
              <Btn kind="ghost" icon="history" onClick={() => setDlg('versions')}>Versions</Btn>
              {t.custom ? <Btn kind="ghost" onClick={() => setDlg('reset')}>Back to default</Btn> : null}
              {dirty ? <Btn kind="ghost" onClick={() => { setSubject(t.subject); setBody(t.body); }}>Undo changes</Btn> : null}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            {preview?.problems?.length ? <Note tone="red" icon="alert"><ul style={{ margin: '0 0 0 16px' }}>{preview.problems.map((p) => <li key={p}>{p}</li>)}</ul></Note> : null}
            <div className="adm-muted" style={{ fontSize: '.8rem' }}>Subject: <b style={{ color: 'var(--text)' }}>{preview?.subject || '…'}</b></div>
            <iframe title="Email preview" className="adm-mailframe" sandbox="" srcDoc={preview?.html || ''} />
            <span className="adm-muted" style={{ fontSize: '.74rem' }}>Shown with sample values. Values a family supplies are always inserted as plain text.</span>
          </div>
        </div>
      </Panel>
      <Dialog open={dlg === 'test'} onClose={() => setDlg(null)} title="Send a test" width={440}
        footer={<><Btn onClick={() => setDlg(null)}>Cancel</Btn><Btn kind="primary" busy={busy === 'test'} disabled={!testTo.trim()} onClick={test}>Send</Btn></>}>
        <Field label="Send to" hint="Uses the wording on screen, with sample values, and is marked [Test]."><Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} maxLength={200} /></Field>
      </Dialog>
      <VersionsDialog open={dlg === 'versions'} event={t.event} onClose={() => setDlg(null)} onRestored={() => { setDlg(null); reload(); }} />
      <ConfirmDialog open={dlg === 'reset'} onClose={() => setDlg(null)} title="Go back to the default wording?" confirmLabel="Use the default"
        message="It is saved as a new version; your wording stays in the history." onConfirm={async () => { try { await admin.resetEmail(t.event); toast.success('Default wording restored'); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </div>
  );
}

function VersionsDialog({ open, event, onClose, onRestored }) {
  const { data, loading } = useLoad(() => (open ? admin.emailVersions(event) : Promise.resolve({ data: [] })), [open, event]);
  const [busy, setBusy] = useState(null);
  const restore = async (v) => {
    setBusy(v.version);
    try { await admin.restoreEmail(event, v.version); toast.success(`Version ${v.version} restored`); onRestored(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Versions" width={640} footer={<Btn onClick={onClose}>Close</Btn>}>
      {loading ? <Spin /> : !(data || []).length ? <Empty compact icon="history" title="Only the default wording so far" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map((v) => (
            <div key={v._id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
              <div className="adm-row adm-row--between">
                <span><b>Version {v.version}</b> {v.isCurrent ? <Chip tone="green">In use</Chip> : null} {v.enabled === false ? <Chip tone="gray">Off</Chip> : null} <span className="adm-muted" style={{ fontSize: '.8rem' }}>{fmtDateTime(v.createdAt)}{v.note ? ` — ${v.note}` : ''}</span></span>
                {!v.isCurrent ? <Btn size="sm" busy={busy === v.version} onClick={() => restore(v)}>Restore</Btn> : null}
              </div>
              <div className="adm-muted" style={{ fontSize: '.82rem', marginTop: 4 }}>{v.subject}</div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/* ── The delivery log ─────────────────────────────────────────────────────── */

// "Sent" is what the mail server told us: it took the message. Whether it
// reached the inbox only a bounce report (Getting delivered) can say.
const LOG_STATUS = { sent: ['Accepted by the mail server', 'green'], failed: ['Refused', 'red'], logged: ['Recorded only', 'amber'], skipped: ['Not sent', 'gray'] };

function Log() {
  const [q, setQ] = useQueryState({ tab: 'log', status: '', event: '', q: '', page: '1' });
  const [search, setSearch] = useState(q.q);
  const term = useDebounced(search);
  useEffect(() => { if (term !== q.q) setQ({ q: term }); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps
  const adm = useAdmission();
  const params = { status: q.status, event: q.event, q: q.q, page: q.page, limit: 25 };
  const { data, meta, loading, error, reload } = useLoad(() => admin.emailLogs(params), [JSON.stringify(params)]);
  const [busy, setBusy] = useState(null);
  const retry = async (row) => {
    setBusy(row._id);
    try { const r = await admin.retryEmail(row._id); toast.success(r.data?.status === 'sent' ? 'Sent' : `Tried again: ${r.data?.status || 'done'}`); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  };
  const last = meta?.last30 || {};
  return (
    <>
      <Tiles>
        <Tile icon="checkCircle" tone="green" label="Sent (30 days)" value={last.sent || 0} onClick={() => setQ({ status: 'sent' })} active={q.status === 'sent'} />
        <Tile icon="alert" tone="red" label="Failed (30 days)" value={last.failed || 0} onClick={() => setQ({ status: 'failed' })} active={q.status === 'failed'} />
        <Tile icon="files" tone="amber" label="Recorded only" value={last.logged || 0} onClick={() => setQ({ status: 'logged' })} active={q.status === 'logged'} />
        <Tile icon="bellOff" tone="gray" label="Skipped" value={last.skipped || 0} sub="switched off, or no address" onClick={() => setQ({ status: 'skipped' })} active={q.status === 'skipped'} />
      </Tiles>
      <Panel pad={false}>
        <Toolbar>
          <SearchBox value={search} onChange={setSearch} placeholder="Address or subject" />
          <Select value={q.status} onChange={(e) => setQ({ status: e.target.value })} aria-label="Status">
            <option value="">Every status</option>
            {Object.entries(LOG_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Select value={q.event} onChange={(e) => setQ({ event: e.target.value })} aria-label="Email">
            <option value="">Every email</option>
            {(adm.catalogs?.emailEvents || []).map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
          </Select>
        </Toolbar>
        {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
          <>
            <Table rows={data || []} empty={<Empty icon="mail" title="Nothing sent yet" />}
              columns={[
                { key: 'at', label: 'When', render: (l) => <span title={fmtDateTime(l.createdAt)}>{ago(l.createdAt)}</span> },
                { key: 'e', label: 'Message', render: (l) => <>{l.label}{l.isTest ? <> <Chip tone="violet">Test</Chip></> : null}</> },
                { key: 'to', label: 'To', render: (l) => l.to || '—' },
                { key: 'sub', label: 'Subject', render: (l) => <span className="adm-muted">{l.subject}</span> },
                { key: 'st', label: 'Status', render: (l) => <><Chip tone={LOG_STATUS[l.status]?.[1]}>{LOG_STATUS[l.status]?.[0] || l.status}</Chip>{l.error ? <div className="adm-muted" style={{ fontSize: '.72rem', maxWidth: 260 }}>{l.error}</div> : null}{l.attempt > 1 ? <div className="adm-muted" style={{ fontSize: '.72rem' }}>try {l.attempt}</div> : null}</> },
                { key: 'x', label: '', render: (l) => (l.canRetry ? <Btn size="sm" busy={busy === l._id} onClick={() => retry(l)}>Retry</Btn> : null) },
              ]} />
            <Pager page={Number(q.page) || 1} pages={Math.max(1, Math.ceil((meta?.total || 0) / 25))} total={meta?.total || 0} onPage={(p) => setQ({ page: p }, { keepPage: true })} label="emails" />
          </>
        )}
      </Panel>
    </>
  );
}

/* ── Getting delivered ────────────────────────────────────────────────────── */

const SOURCE = { smtp_reject: 'Refused by the receiving server', bounce: 'Bounced', complaint: 'Marked as spam', manual: 'Added by the office' };

function Delivery() {
  const [selector, setSelector] = useState('');
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const { data, loading, error, reload } = useLoad(() => admin.suppressions(), []);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ email: '', reason: '' });
  const run = async () => {
    setChecking(true);
    try { const r = await admin.domainCheck(selector.trim()); setCheck(r.data); } catch (e) { toast.error(errMsg(e)); } finally { setChecking(false); }
  };
  const add = async () => {
    try { await admin.addSuppression(f.email.trim(), f.reason.trim()); toast.success('Added'); setAdding(false); setF({ email: '', reason: '' }); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (row) => {
    try { await admin.removeSuppression(row._id); toast.success('Removed — email to it will be tried again'); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <>
      <Panel title="Is the sending domain set up?" icon="shieldCheck"
        sub="Receivers trust mail from a domain that publishes SPF, DMARC and DKIM. Without them, codes and offers land in spam — or nowhere.">
        <div className="adm-row">
          <Input value={selector} onChange={(e) => setSelector(e.target.value)} placeholder="DKIM selector, e.g. google or s1" style={{ maxWidth: 280 }} aria-label="DKIM selector" />
          <Btn kind="primary" icon="search" busy={checking} onClick={run}>Check</Btn>
        </div>
        {check ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <Note tone={check.ok ? 'green' : 'amber'} icon={check.ok ? 'checkCircle' : 'alert'}>
              Mail is sent from <b>{check.from}</b>{check.ownServer ? ' through the school\'s own mail server' : ' through the platform\'s mail server'}.
              {check.driver === 'log' ? ' This server only records email (development) — nothing is delivered.' : ''}
            </Note>
            {check.checks.map((c) => (
              <div key={c.key} className="adm-row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <Chip tone={c.ok === true ? 'green' : c.ok === false ? 'red' : 'gray'}>{c.ok === true ? 'OK' : c.ok === false ? 'Missing' : 'Not checked'}</Chip>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: '.88rem' }}>{c.label}</b>
                  <div className="adm-muted" style={{ fontSize: '.8rem', wordBreak: 'break-word' }}>{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Panel>
      <Panel title="Do-not-send list" icon="bellOff" pad={false}
        sub="Addresses admission email is no longer sent to: they bounced for good, marked a message as spam, or asked. Families registering with one are told to use another address."
        right={<Btn size="sm" icon="plus" onClick={() => setAdding(true)}>Add an address</Btn>}>
        {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
          <Table rows={data || []} empty={<Empty icon="mail" title="Nothing on the list">Bounced and refused addresses appear here by themselves.</Empty>}
            columns={[
              { key: 'e', label: 'Address', render: (r) => <b>{r.email}</b> },
              { key: 's', label: 'Why', render: (r) => <>{SOURCE[r.source] || r.source}{r.reason ? <div className="adm-muted" style={{ fontSize: '.74rem', maxWidth: 360 }}>{r.reason}</div> : null}</> },
              { key: 'w', label: 'Since', render: (r) => fmtDate(r.createdAt) },
              { key: 'x', label: '', render: (r) => (r.platformWide ? <Chip tone="gray">All schools</Chip> : <Btn size="sm" kind="ghost" onClick={() => remove(r)}>Remove</Btn>) },
            ]} />
        )}
      </Panel>
      <Dialog open={adding} onClose={() => setAdding(false)} title="Stop emailing an address" width={480}
        footer={<><Btn onClick={() => setAdding(false)}>Cancel</Btn><Btn kind="primary" disabled={!f.email.trim()} onClick={add}>Add</Btn></>}>
        <Field label="Email address" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Why" className="adm-mt"><Input value={f.reason} maxLength={300} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </Dialog>
    </>
  );
}
