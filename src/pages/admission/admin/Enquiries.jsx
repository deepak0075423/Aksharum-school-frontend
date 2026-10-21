/**
 * Admissions → Enquiries (rebuilt Oct 2026 as the office's follow-up desk):
 * enquiries from the portal and written down at the counter, each with an
 * owner, a next follow-up date (the owner is reminded when it falls due) and a
 * log of every call, email and visit; the Sources tab sets what each source of
 * families cost against what it brought; and the applicant accounts families
 * apply with (switched off here if one is misused — their applications stay).
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import PhoneInput from '../../../components/ui/PhoneInput';
import {
  Page, Head, Panel, Btn, Chip, Table, Toolbar, SearchBox, Select, Pager, Empty, ErrorBox, Spin, Dialog, Field, Input, TextArea, KV, Toggle, Tiles, Tile, useLoad,
} from '../admUI';
import { fmtDate, fmtDateTime, ago, errMsg, money, toLocalInput } from '../meta';
import { useAdmission, useQueryState, useDebounced, StaffSelect, YearSelect } from './parts';

const STATUS = { new: ['New', 'blue'], contacted: ['Contacted', 'amber'], registered: ['Registered', 'green'], closed: ['Closed', 'gray'] };
const PRIORITY = { hot: ['Hot', 'red'], warm: ['Warm', 'amber'], cold: ['Cold', 'gray'] };

export default function Enquiries() {
  const [q, setQ] = useQueryState({ tab: 'enquiries' });
  const [adding, setAdding] = useState(false);
  const [bump, setBump] = useState(0);
  return (
    <Page>
      <Head eyebrow="Admissions" title="Enquiries" subtitle="Every enquiry followed up — who has it, when they call next, what was said — and what each source of families costs.">
        <Btn kind="primary" icon="plus" onClick={() => setAdding(true)}>Write down an enquiry</Btn>
      </Head>
      <Tabs variant="line" value={q.tab} onChange={(v) => setQ({ tab: v })} items={[{ key: 'enquiries', label: 'Enquiries' }, { key: 'sources', label: 'Sources and spend' }, { key: 'applicants', label: 'Applicant accounts' }]} />
      {q.tab === 'applicants' ? <Applicants /> : q.tab === 'sources' ? <Sources /> : <EnquiryList key={bump} />}
      {adding ? <NewEnquiry onClose={() => setAdding(false)} onDone={() => { setAdding(false); setBump((b) => b + 1); setQ({ tab: 'enquiries' }); }} /> : null}
    </Page>
  );
}

function EnquiryList() {
  const [q, setQ] = useQueryState({ tab: 'enquiries', status: '', q: '', who: '', due: '', page: '1' });
  const [search, setSearch] = useState(q.q);
  const term = useDebounced(search);
  useEffect(() => { if (term !== q.q) setQ({ q: term }); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps
  const params = { status: q.status, q: q.q, assignedTo: q.who, due: q.due, page: q.page, limit: 25 };
  const { data, meta, loading, error, reload } = useLoad(() => admin.enquiries(params), [JSON.stringify(params)]);
  const [open, setOpen] = useState(null);
  const counts = meta?.counts || {};
  const due = meta?.due || {};
  return (
    <>
      <Tiles>
        <Tile icon="alert" tone="red" label="Follow-ups overdue" value={due.overdue ?? '—'} active={q.due === 'overdue'} onClick={() => setQ({ due: q.due === 'overdue' ? '' : 'overdue', who: '' })} />
        <Tile icon="calendar" tone="amber" label="Due today" value={due.today ?? '—'} active={q.due === 'today'} onClick={() => setQ({ due: q.due === 'today' ? '' : 'today' })} />
        <Tile icon="userCircle" tone="indigo" label="Mine, open" value={due.mine ?? '—'} active={q.who === 'me'} onClick={() => setQ({ who: q.who === 'me' ? '' : 'me', due: '' })} />
        <Tile icon="chat" tone="green" label="New, not yet contacted" value={counts.new ?? 0} active={q.status === 'new'} onClick={() => setQ({ status: q.status === 'new' ? '' : 'new' })} />
      </Tiles>
      <Panel pad={false}>
        <Toolbar>
          <SearchBox value={search} onChange={setSearch} placeholder="Name, email or phone" />
          <Tabs variant="solid" size="sm" value={q.status} onChange={(v) => setQ({ status: v })}
            items={[{ key: '', label: 'All' }, ...Object.entries(STATUS).map(([k, [l]]) => ({ key: k, label: l, count: counts[k] || undefined }))]} />
          <Select value={q.who} onChange={(e) => setQ({ who: e.target.value })} aria-label="Owner" style={{ width: 'auto' }}>
            <option value="">Anyone's</option><option value="me">Mine</option><option value="none">Nobody's yet</option>
          </Select>
        </Toolbar>
        {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
          <>
            <Table rows={data || []} onRow={setOpen} empty={<Empty icon="chat" title="No enquiries here">Families ask from the portal&rsquo;s home page (Settings → Portal), or write one down with the button above.</Empty>}
              columns={[
                { key: 'n', label: 'From', render: (e) => <><b>{e.name}</b>{e.priority && e.priority !== 'warm' ? <> <Chip tone={PRIORITY[e.priority][1]}>{PRIORITY[e.priority][0]}</Chip></> : null}<div className="adm-muted" style={{ fontSize: '.76rem' }}>{[e.email, e.phone].filter(Boolean).join(' · ')}</div></> },
                { key: 'c', label: 'Class', render: (e) => e.className || '—' },
                { key: 'o', label: 'Owner', render: (e) => e.assigneeName || <span className="adm-muted">Nobody yet</span> },
                { key: 'f', label: 'Next follow-up', render: (e) => (e.nextFollowUpAt && ['new', 'contacted'].includes(e.status)
                  ? <span style={{ color: new Date(e.nextFollowUpAt) < new Date() ? '#b91c1c' : undefined, fontWeight: new Date(e.nextFollowUpAt) < new Date() ? 700 : 400 }}>{fmtDateTime(e.nextFollowUpAt)}</span>
                  : <span className="adm-muted">—</span>) },
                { key: 'src', label: 'Source', render: (e) => e.source || <span className="adm-muted">—</span> },
                { key: 's', label: 'Status', render: (e) => <Chip tone={STATUS[e.status]?.[1]}>{STATUS[e.status]?.[0] || e.status}</Chip> },
                { key: 'd', label: 'Received', render: (e) => ago(e.createdAt) },
              ]} />
            <Pager page={Number(q.page) || 1} pages={Math.max(1, Math.ceil((meta?.total || 0) / 25))} total={meta?.total || 0} onPage={(p) => setQ({ page: p }, { keepPage: true })} label="enquiries" />
          </>
        )}
      </Panel>
      {open ? <EnquiryDialog row={open} kinds={meta?.kinds || {}} outcomes={meta?.outcomes || {}} onClose={() => setOpen(null)} onDone={(fresh) => { reload(); if (fresh) setOpen((x) => ({ ...x, ...fresh })); }} /> : null}
    </>
  );
}

function EnquiryDialog({ row, kinds, outcomes, onClose, onDone }) {
  const [c, setC] = useState({ kind: 'call', outcome: 'reached', text: '', next: '' });
  const [busy, setBusy] = useState('');
  const [closing, setClosing] = useState(false);
  const [lost, setLost] = useState('');
  const log = useMemo(() => [
    ...(row.interactions || []).map((x) => ({ ...x, type: 'contact' })),
    ...(row.notes || []).map((n) => ({ kind: 'note', text: n.text, byName: n.byName, at: n.at, type: 'note' })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)), [row]);
  const save = async (patch, msg) => {
    setBusy('save');
    try { const r = await admin.updateEnquiry(row._id, patch); toast.success(msg || 'Saved'); onDone(r.data); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const contact = async () => {
    setBusy('contact');
    try {
      const r = await admin.enquiryContact(row._id, { kind: c.kind, outcome: c.outcome, text: c.text.trim(), nextFollowUpAt: c.next ? new Date(c.next).toISOString() : null });
      toast.success('Logged');
      setC({ kind: 'call', outcome: 'reached', text: '', next: '' });
      onDone(r.data);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const open = ['new', 'contacted'].includes(row.status);
  return (
    <Dialog open onClose={onClose} title={`Enquiry from ${row.name}`} width={760} footer={<Btn onClick={onClose}>Close</Btn>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <KV cols={3} items={[
          ['Email', row.email ? <a key="e" href={`mailto:${row.email}`}>{row.email}</a> : ''], ['Phone', row.phone ? <a key="p" href={`tel:${row.phone}`}>{row.phone}</a> : ''],
          ['Class', row.className], ['Received', fmtDateTime(row.createdAt)], ['Source', row.source], ['Status', <Chip key="s" tone={STATUS[row.status]?.[1]}>{STATUS[row.status]?.[0]}</Chip>],
        ]} />
        {row.message ? <div className="adm-prose" style={{ background: '#f8fafc', borderRadius: 10, padding: 12 }}>{row.message}</div> : null}
        {row.status === 'closed' && row.lostReason ? <p className="adm-muted" style={{ fontSize: '.84rem', margin: 0 }}>Closed: {row.lostReason}</p> : null}
        <div className="adm-grid3">
          <Field label="Owner"><StaffSelect value={row.assignedTo || ''} placeholder="Nobody yet" onChange={(v) => save({ assignedTo: v || null }, 'Owner set')} /></Field>
          <Field label="Priority">
            <Select value={row.priority || 'warm'} onChange={(e) => save({ priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Next follow-up">
            <Input type="datetime-local" value={toLocalInput(row.nextFollowUpAt)} onChange={(e) => save({ nextFollowUpAt: e.target.value ? new Date(e.target.value).toISOString() : null }, 'Follow-up set')} disabled={!open} />
          </Field>
        </div>
        {open ? (
          <Panel title="Log a contact" icon="phone">
            <div className="adm-grid3">
              <Field label="How"><Select value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value })}>{Object.entries(kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label="What happened"><Select value={c.outcome} onChange={(e) => setC({ ...c, outcome: e.target.value })}>{Object.entries(outcomes).filter(([, l]) => l).map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="other">Something else</option></Select></Field>
              <Field label="Follow up next on" hint="Optional"><Input type="datetime-local" value={c.next} onChange={(e) => setC({ ...c, next: e.target.value })} /></Field>
            </div>
            <Field label="Notes" className="adm-mt"><TextArea rows={2} maxLength={1000} value={c.text} onChange={(e) => setC({ ...c, text: e.target.value })} /></Field>
            <div className="adm-row adm-mt" style={{ justifyContent: 'space-between' }}>
              <Btn kind="ghost" onClick={() => setClosing(true)}>Close the enquiry…</Btn>
              <Btn kind="primary" busy={busy === 'contact'} disabled={c.outcome === 'other' && !c.text.trim()} onClick={contact}>Log it</Btn>
            </div>
            {closing ? (
              <div className="adm-row adm-mt" style={{ alignItems: 'flex-end' }}>
                <Field label="Why it is closed" hint="Took a seat elsewhere, moved city, fees…"><Input value={lost} maxLength={300} onChange={(e) => setLost(e.target.value)} /></Field>
                <Btn kind="danger" busy={busy === 'save'} onClick={() => save({ status: 'closed', lostReason: lost.trim() }, 'Closed')}>Close it</Btn>
              </div>
            ) : null}
          </Panel>
        ) : row.status === 'closed' ? <Btn kind="ghost" onClick={() => save({ status: 'contacted' }, 'Reopened')}>Reopen</Btn> : null}
        <div>
          <div className="adm-muted" style={{ fontSize: '.76rem', fontWeight: 650, marginBottom: 6 }}>History</div>
          {log.length ? (
            <div className="adm-doclist">
              {log.map((x, i) => (
                <div key={i} style={{ fontSize: '.84rem' }}>
                  <b>{kinds[x.kind] || (x.kind === 'note' ? 'Note' : x.kind)}</b>{x.outcome && outcomes[x.outcome] ? ` — ${outcomes[x.outcome]}` : ''}
                  <span className="adm-muted"> · {x.byName || 'Staff'} · {fmtDateTime(x.at)}</span>
                  {x.text ? <div>{x.text}</div> : null}
                </div>
              ))}
            </div>
          ) : <p className="adm-muted" style={{ fontSize: '.84rem', margin: 0 }}>Nothing logged yet.</p>}
        </div>
      </div>
    </Dialog>
  );
}

function NewEnquiry({ onClose, onDone }) {
  const adm = useAdmission();
  const [f, setF] = useState({ name: '', phone: '', email: '', class: '', message: '', source: 'walk_in', kind: 'visit', next: '' });
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await admin.createEnquiry({ ...f, name: f.name.trim(), message: f.message.trim(), nextFollowUpAt: f.next ? new Date(f.next).toISOString() : null });
      toast.success('Enquiry written down — it is yours to follow up');
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title="Write down an enquiry" width={620}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!f.name.trim() || (!f.phone && !f.email)} onClick={go}>Save</Btn></>}>
      <div className="adm-grid2">
        <Field label="Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} data-text="name" /></Field>
        <Field label="Mobile"><PhoneInput className="adm-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={200} /></Field>
        <Field label="Class"><Select value={f.class} onChange={(e) => setF({ ...f, class: e.target.value })}><option value="">Not said</option>{(adm.classes || []).map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}</Select></Field>
        <Field label="How they came"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="visit">Walked in</option><option value="call">Phoned</option><option value="email">Emailed</option><option value="whatsapp">WhatsApp</option></Select></Field>
        <Field label="Source" hint="How they heard of the school — e.g. newspaper, referral"><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} maxLength={40} data-text="code" /></Field>
        <Field label="Follow up on" hint="Optional"><Input type="datetime-local" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
      </div>
      <Field label="What they asked" className="adm-mt"><TextArea rows={3} maxLength={1000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
    </Dialog>
  );
}

/** Each source of families against what the school spent on it. */
function Sources() {
  const adm = useAdmission();
  const [year, setYear] = useState(String(adm.currentYear?._id || ''));
  const { data, loading, error, reload } = useLoad(() => admin.sources({ academicYear: year }), [year]);
  const [edit, setEdit] = useState({});
  const [adding, setAdding] = useState({ source: '', label: '', amount: '' });
  const save = async (row) => {
    const v = edit[row.source];
    try { await admin.setSpend({ source: row.source, label: v.label ?? row.label, amount: Number(v.amount ?? row.spend) || 0, academicYear: year || undefined }); toast.success('Saved'); setEdit((e) => ({ ...e, [row.source]: undefined })); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const add = async () => {
    try { await admin.setSpend({ ...adding, amount: Number(adding.amount) || 0, academicYear: year || undefined }); toast.success('Added'); setAdding({ source: '', label: '', amount: '' }); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const t = data?.total;
  return (
    <Panel pad={false} title="Sources and spend" icon="compass" sub="Where families came from — the ?src= on the portal link they used, or what the office wrote down — set against what each cost."
      right={<YearSelect value={year} onChange={setYear} all="All years" />}>
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <>
          <Table rows={data.rows} rowKey={(r) => r.source} empty={<Empty compact icon="compass" title="No sources yet" />} columns={[
            { key: 's', label: 'Source', render: (r) => (edit[r.source] ? <Input value={edit[r.source].label ?? r.label} placeholder={r.source} onChange={(e) => setEdit({ ...edit, [r.source]: { ...edit[r.source], label: e.target.value } })} style={{ width: 160 }} aria-label="Name" />
              : <><b>{r.label || r.source}</b>{r.label ? <div className="adm-muted" style={{ fontSize: '.74rem' }}>{r.source}</div> : null}</>) },
            { key: 'e', label: 'Enquiries', align: 'right', render: (r) => r.enquiries },
            { key: 'a', label: 'Applications', align: 'right', render: (r) => r.applications },
            { key: 'd', label: 'Admissions', align: 'right', render: (r) => r.admissions },
            { key: 'c', label: 'Converted', align: 'right', render: (r) => (r.conversion == null ? '—' : `${r.conversion}%`) },
            { key: 'sp', label: 'Spent', align: 'right', render: (r) => (edit[r.source] ? <Input type="number" min="0" step="1" style={{ width: 110 }} value={edit[r.source].amount ?? r.spend} onChange={(e) => setEdit({ ...edit, [r.source]: { ...edit[r.source], amount: e.target.value } })} aria-label="Spent" /> : (r.spend ? money(r.spend) : '—')) },
            { key: 'ca', label: 'Per application', align: 'right', render: (r) => (r.costPerApplication == null ? '—' : money(r.costPerApplication)) },
            { key: 'cd', label: 'Per admission', align: 'right', render: (r) => (r.costPerAdmission == null ? '—' : money(r.costPerAdmission)) },
            { key: 'x', label: '', render: (r) => (r.source === 'unknown' ? null : edit[r.source] ? <Btn size="sm" kind="primary" onClick={() => save(r)}>Save</Btn> : <Btn size="sm" kind="ghost" onClick={() => setEdit({ ...edit, [r.source]: {} })}>Spend…</Btn>) },
          ]} />
          {t ? <div style={{ padding: '10px 14px', fontSize: '.86rem', borderTop: '1px solid var(--border)' }}>All sources: {t.enquiries} enquiries · {t.applications} applications · {t.admissions} admissions · {money(t.spend)} spent{t.costPerAdmission != null ? ` · ${money(t.costPerAdmission)} per admission` : ''}</div> : null}
          <div className="adm-row" style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', alignItems: 'flex-end' }}>
            <Field label="Source code"><Input value={adding.source} placeholder="newspaper" onChange={(e) => setAdding({ ...adding, source: e.target.value })} maxLength={40} data-text="code" style={{ width: 150 }} /></Field>
            <Field label="Name"><Input value={adding.label} placeholder="Times of India ad" onChange={(e) => setAdding({ ...adding, label: e.target.value })} maxLength={80} style={{ width: 200 }} /></Field>
            <Field label="Spent (₹)"><Input type="number" min="0" step="1" value={adding.amount} onChange={(e) => setAdding({ ...adding, amount: e.target.value })} style={{ width: 120 }} /></Field>
            <Btn icon="plus" disabled={!adding.source.trim()} onClick={add}>Add a source</Btn>
          </div>
          <p className="adm-muted" style={{ fontSize: '.78rem', padding: '0 14px 12px' }}>Give each advertisement its own portal link — e.g. <code>/your-portal?src=newspaper</code> — and families who arrive through it are counted here.</p>
        </>
      )}
    </Panel>
  );
}

function Applicants() {
  const [q, setQ] = useQueryState({ tab: 'applicants', q: '', page: '1' });
  const [search, setSearch] = useState(q.q);
  const term = useDebounced(search);
  useEffect(() => { if (term !== q.q) setQ({ q: term }); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps
  const params = { q: q.q, page: q.page, limit: 25 };
  const { data, meta, loading, error, reload, setData } = useLoad(() => admin.applicants(params), [JSON.stringify(params)]);
  const toggle = async (u, on) => {
    setData((rows) => rows.map((r) => (r._id === u._id ? { ...r, isActive: on } : r)));
    try { await admin.setApplicant(u._id, on); toast.success(on ? 'Account switched on' : 'Account switched off — they are signed out'); } catch (e) { toast.error(errMsg(e)); reload(); }
  };
  return (
    <Panel pad={false}>
      <Toolbar><SearchBox value={search} onChange={setSearch} placeholder="Name, email or phone" /></Toolbar>
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <>
          <Table rows={data || []} empty={<Empty icon="userPlus" title="No applicant accounts yet" />}
            columns={[
              { key: 'n', label: 'Applicant', render: (u) => <><b>{u.name}</b>{u.linkedExisting ? <> <Chip tone="violet" title="This address already had an account at the school">Existing address</Chip></> : null}<div className="adm-muted" style={{ fontSize: '.76rem' }}>{u.email}{u.phone ? ` · ${u.phone}` : ''}</div></> },
              { key: 'a', label: 'Applications', align: 'right', render: (u) => u.applications },
              { key: 'c', label: 'Registered', render: (u) => fmtDate(u.createdAt) },
              { key: 'l', label: 'Last sign-in', render: (u) => (u.lastLoginAt ? ago(u.lastLoginAt) : '—') },
              { key: 's', label: 'Source', render: (u) => u.source || '—' },
              { key: 'on', label: 'Active', render: (u) => <Toggle checked={u.isActive !== false} onChange={(v) => toggle(u, v)} /> },
            ]} />
          <Pager page={Number(q.page) || 1} pages={Math.max(1, Math.ceil((meta?.total || 0) / 25))} total={meta?.total || 0} onPage={(p) => setQ({ page: p }, { keepPage: true })} label="accounts" />
        </>
      )}
    </Panel>
  );
}
