/**
 * Admissions → Privacy (Oct 2026): what the Digital Personal Data Protection
 * Act asks of the admission office, in one place.
 *
 *   Requests     families asking to see, correct or erase their information,
 *                withdrawing consent, raising a grievance — each with its due date
 *   Retention    how long things are kept, who answers privacy questions, and
 *                what the next nightly run would erase
 *   Access log   every reveal of an Aadhaar number and every export
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import {
  Page, Head, Panel, Btn, Chip, Table, Toolbar, Select, Empty, ErrorBox, Spin, Dialog, ConfirmDialog, Field, Input, TextArea, Toggle, Note, KV, Tiles, Tile,
  Pager, useLoad,
} from '../admUI';
import { fmtDate, fmtDateTime, errMsg } from '../meta';
import { useAdmission, useQueryState } from './parts';

const BASE = '/admin/admissions';
const STATUS = { open: ['Open', 'amber'], in_progress: ['In progress', 'indigo'], done: ['Done', 'green'], declined: ['Declined', 'gray'] };

export default function Privacy() {
  const [q, setQ] = useQueryState({ tab: 'requests' });
  return (
    <Page>
      <Head eyebrow="Admissions" title="Privacy" subtitle="Families' requests about their information, how long it is kept, and who has looked at what." />
      <Tabs variant="line" value={q.tab} onChange={(v) => setQ({ tab: v })} wrap={false}
        items={[{ key: 'requests', label: 'Requests' }, { key: 'retention', label: 'Retention and contact' }, { key: 'log', label: 'Access log' }]} />
      {q.tab === 'retention' ? <Retention /> : q.tab === 'log' ? <AccessLog /> : <Requests />}
    </Page>
  );
}

/* ── Requests ─────────────────────────────────────────────────────────────── */

function Requests() {
  const [q, setQ] = useQueryState({ tab: 'requests', status: 'waiting' });
  const { data, loading, error, reload } = useLoad(() => admin.privacyRequests(q.status), [q.status]);
  const [open, setOpen] = useState(null);
  return (
    <>
      {data ? (
        <Tiles cols={3}>
          <Tile icon="clock" tone="amber" label="Waiting for an answer" value={data.counts.waiting} onClick={() => setQ({ status: 'waiting' })} active={q.status === 'waiting'} />
          <Tile icon="alert" tone="red" label="Past their due date" value={data.counts.overdue} onClick={() => setQ({ status: 'waiting' })} />
          <Tile icon="list" tone="indigo" label="All requests" value="View" onClick={() => setQ({ status: '' })} active={!q.status} />
        </Tiles>
      ) : null}
      <Panel pad={false}>
        <Toolbar>
          <Select value={q.status} onChange={(e) => setQ({ status: e.target.value })} aria-label="Status">
            <option value="waiting">Waiting for an answer</option>
            <option value="">Every request</option>
            {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Toolbar>
        {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
          <Table rows={data.rows} onRow={(r) => setOpen(r)}
            empty={<Empty icon="shieldCheck" title="No requests here">When a family asks about its information on the portal, the request lands here with the date it must be answered by.</Empty>}
            columns={[
              { key: 'n', label: 'Request', render: (r) => <><b className="adm-num">{r.number}</b><div className="adm-muted" style={{ fontSize: '.76rem' }}>{fmtDateTime(r.createdAt)}</div></> },
              { key: 'k', label: 'Asking for', render: (r) => r.kindLabel },
              { key: 'who', label: 'From', render: (r) => <>{r.applicantName || '—'}<div className="adm-muted" style={{ fontSize: '.76rem' }}>{r.applicantEmail}</div></> },
              { key: 'app', label: 'Application', render: (r) => (r.applicationNumber ? <Link to={`${BASE}/applications/${r.application}`} onClick={(e) => e.stopPropagation()}>{r.applicationNumber}</Link> : '—') },
              { key: 'due', label: 'Answer by', render: (r) => <span style={r.overdue ? { color: '#b91c1c', fontWeight: 600 } : undefined}>{fmtDate(r.dueAt)}{r.overdue ? ' — overdue' : ''}</span> },
              { key: 'st', label: 'Status', render: (r) => <Chip tone={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0]}</Chip> },
            ]} />
        )}
      </Panel>
      <RequestDialog req={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); }} />
    </>
  );
}

function RequestDialog({ req: r, onClose, onDone }) {
  const [f, setF] = useState({ status: 'in_progress', response: '', internalNote: '' });
  const [busy, setBusy] = useState('');
  const [erasing, setErasing] = useState(false);
  useEffect(() => { if (r) setF({ status: r.status === 'open' ? 'in_progress' : r.status, response: r.response || '', internalNote: r.internalNote || '' }); }, [r]);
  if (!r) return null;
  const closed = ['done', 'declined'].includes(r.status);
  const save = async () => {
    setBusy('save');
    try { await admin.answerRequest(r._id, f); toast.success('Saved'); onDone(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const erase = async () => {
    const res = await admin.eraseRequest(r._id);
    const kept = res.data.kept || [];
    toast.success(`${res.data.erased} application(s) erased${kept.length ? `; ${kept.length} kept` : ''}`);
    setF((x) => ({
      ...x, status: 'done',
      response: x.response || `Your information has been erased.${kept.length ? ` We have had to keep: ${kept.map((k) => `${k.applicationNumber} (${k.why})`).join('; ')}.` : ''} Payment records are kept as the law requires, without your details.`,
    }));
  };
  return (
    <Dialog open={!!r} onClose={onClose} title={`${r.number} — ${r.kindLabel}`} width={640}
      footer={<><Btn onClick={onClose}>Close</Btn>{!closed ? <Btn kind="primary" busy={busy === 'save'} onClick={save}>Save</Btn> : null}</>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <KV cols={2} items={[
          ['From', `${r.applicantName || '—'} · ${r.applicantEmail || ''}`], ['Received', fmtDateTime(r.createdAt)],
          ['Answer by', fmtDate(r.dueAt)], ['Application', r.applicationNumber || 'All of theirs'],
        ]} />
        {r.details ? <Note tone="gray" icon="chat">{r.details}</Note> : null}
        {r.kind === 'access' ? <Note tone="indigo" icon="info">The family can download everything held about them from &ldquo;Your data&rdquo; on the portal at any time. Answer to say so, or with anything else they asked.</Note> : null}
        {['erasure', 'withdraw_consent'].includes(r.kind) && !closed ? (
          <Note tone="amber" icon="trash" action={<Btn kind="danger" icon="trash" onClick={() => setErasing(true)}>Erase now</Btn>}>
            Erases every application of this family that may be erased: answers, documents and history. An admitted student&rsquo;s application, one on legal hold, and payment amounts are kept.
          </Note>
        ) : null}
        {closed ? (
          <Note tone="green" icon="checkCircle">{STATUS[r.status]?.[0]} {r.handledAt ? `on ${fmtDate(r.handledAt)}` : ''}{r.handledByName ? ` by ${r.handledByName}` : ''}. Told the family: &ldquo;{r.response}&rdquo;</Note>
        ) : (
          <>
            <Field label="Status">
              <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Answer to the family" hint={['done', 'declined'].includes(f.status) ? 'Required — emailed to them and shown on the portal' : 'Shown on the portal'}>
              <TextArea rows={3} maxLength={2000} value={f.response} onChange={(e) => setF({ ...f, response: e.target.value })} />
            </Field>
            <Field label="Note for the office" hint="Never shown to the family">
              <TextArea rows={2} maxLength={2000} value={f.internalNote} onChange={(e) => setF({ ...f, internalNote: e.target.value })} />
            </Field>
          </>
        )}
      </div>
      <ConfirmDialog open={erasing} onClose={() => setErasing(false)} title="Erase this family's information?" confirmLabel="Erase"
        message="This cannot be undone. Their applications keep only numbers, dates and outcomes for the school's statistics."
        onConfirm={async () => { try { await erase(); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
    </Dialog>
  );
}

/* ── Retention and the privacy contact ────────────────────────────────────── */

function Retention() {
  const adm = useAdmission();
  const pv = adm.settings.privacy || {};
  const [v, setV] = useState(() => JSON.parse(JSON.stringify(pv)));
  const [busy, setBusy] = useState('');
  const { data: pre, reload } = useLoad(() => admin.retention(), []);
  const dirty = JSON.stringify(v) !== JSON.stringify(pv);
  const r = v.retention || {};
  const setR = (patch) => setV((x) => ({ ...x, retention: { ...x.retention, ...patch } }));
  const setO = (patch) => setV((x) => ({ ...x, officer: { ...x.officer, ...patch } }));
  const save = async () => {
    setBusy('save');
    try { const res = await admin.saveSettings({ privacy: v }); setV(res.data.privacy); toast.success('Saved'); adm.reload(); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const run = async () => {
    setBusy('run');
    try {
      const res = await admin.runRetention();
      const d = res.data;
      toast.success(d.skipped || `${d.erased} erased, ${d.drafts} old draft(s), ${d.enquiries} enquiry(ies) and ${d.deliveryLogs} delivery log(s) deleted`);
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  return (
    <>
      <Panel title="How long things are kept" icon="history"
        sub="Applied every night. An application on legal hold, an admitted student's application and payment amounts are never erased.">
        <Toggle checked={!!r.enabled} onChange={(x) => setR({ enabled: x })} label="Apply these periods automatically" sub="Off: nothing is erased until you turn it back on" />
        <div className="adm-grid2 adm-mt">
          <Field label="An application that did not lead to admission is erased after (months closed)" hint="Rejected, not eligible, declined, withdrawn, cancelled, lapsed offers">
            <Input type="number" min="1" max="60" step="1" value={r.unsuccessfulMonths} onChange={(e) => setR({ unsuccessfulMonths: Number(e.target.value) || 1 })} />
          </Field>
          <Field label="A draft nobody has touched is deleted after (days)" hint="Drafts with a payment on them are kept">
            <Input type="number" min="30" max="730" step="1" value={r.abandonedDraftDays} onChange={(e) => setR({ abandonedDraftDays: Number(e.target.value) || 30 })} />
          </Field>
          <Field label="Enquiries are deleted after (months)"><Input type="number" min="1" max="60" step="1" value={r.enquiryMonths} onChange={(e) => setR({ enquiryMonths: Number(e.target.value) || 1 })} /></Field>
          <Field label="Email and message logs are deleted after (months)"><Input type="number" min="1" max="24" step="1" value={r.deliveryLogMonths} onChange={(e) => setR({ deliveryLogMonths: Number(e.target.value) || 1 })} /></Field>
        </div>
      </Panel>
      <Panel title="Who answers privacy questions" icon="userCircle" sub="Shown to families on the portal, beside the privacy notice and under “Your data”.">
        <div className="adm-grid3">
          <Field label="Name"><Input data-text="name" maxLength={80} value={v.officer?.name || ''} onChange={(e) => setO({ name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" maxLength={200} value={v.officer?.email || ''} onChange={(e) => setO({ email: e.target.value })} /></Field>
          <Field label="Phone"><Input data-text="digits" maxLength={15} value={v.officer?.phone || ''} onChange={(e) => setO({ phone: e.target.value.replace(/\D/g, '') })} /></Field>
        </div>
        <Field label="Answer a family's request within (days)" hint="At most 90 — the DPDP Rules' limit for a grievance" className="adm-mt">
          <Input type="number" min="1" max="90" step="1" value={v.requestDays} style={{ maxWidth: 160 }} onChange={(e) => setV((x) => ({ ...x, requestDays: Number(e.target.value) || 1 }))} />
        </Field>
      </Panel>
      <div className="adm-row" style={{ justifyContent: 'flex-end' }}>
        {dirty ? <Btn kind="ghost" onClick={() => setV(JSON.parse(JSON.stringify(pv)))}>Undo changes</Btn> : null}
        <Btn kind="primary" icon="save" busy={busy === 'save'} disabled={!dirty} onClick={save}>Save</Btn>
      </div>
      <Panel title="The next run would" icon="trash" right={<Btn icon="refresh" busy={busy === 'run'} disabled={dirty || !pre?.enabled} onClick={run}>Run now</Btn>}>
        {!pre ? <Spin /> : (
          <KV cols={3} items={[
            ['Erase applications', pre.unsuccessful], ['Delete old drafts', pre.drafts], ['Delete enquiries', pre.enquiries],
            ['Delete delivery logs', pre.deliveryLogs], ['On legal hold (kept)', pre.onHold], ['Erased so far', pre.erasedSoFar],
          ]} />
        )}
      </Panel>
    </>
  );
}

/* ── Access log ───────────────────────────────────────────────────────────── */

function AccessLog() {
  const [q, setQ] = useQueryState({ tab: 'log', page: 1 });
  const { data, loading, error, reload } = useLoad(() => admin.accessLog({ page: q.page }), [q.page]);
  return (
    <Panel pad={false} title="Who looked at what" icon="eye" sub="Every reveal of an Aadhaar number and every export of applications.">
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <>
          <Table rows={data.rows} empty={<Empty icon="eye" title="Nothing yet">Reveals and exports are recorded here.</Empty>}
            columns={[
              { key: 'when', label: 'When', render: (r) => fmtDateTime(r.createdAt) },
              { key: 'who', label: 'Who', render: (r) => <>{r.userName || '—'}<div className="adm-muted" style={{ fontSize: '.76rem' }}>{(r.role || '').replace('_', ' ')}</div></> },
              { key: 'what', label: 'What', render: (r) => (r.action === 'reveal' ? <Chip tone="amber" icon="eye">Revealed {r.detail || r.field}</Chip> : <Chip tone="indigo" icon="download">{r.detail || 'Export'}</Chip>) },
              { key: 'app', label: 'Application', render: (r) => (r.applicationNumber ? <Link to={`${BASE}/applications/${r.application}`}>{r.applicationNumber} · {r.studentName}</Link> : '—') },
            ]} />
          <Pager page={data.page} pages={data.pages} total={data.total} onPage={(p) => setQ({ page: p })} label="entries" />
        </>
      )}
    </Panel>
  );
}
