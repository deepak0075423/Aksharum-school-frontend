/**
 * Admission settings, one block per tab — each saved on its own and checked
 * by the server (unknown keys dropped, numbers held to the platform's bounds:
 * OTP rules can be made stricter, never weaker).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import PhoneInput from '../../../components/ui/PhoneInput';
import {
  Page, Head, Panel, Btn, Chip, Spin, ErrorBox, Field, Input, TextArea, Select, Toggle, IconBtn, Note, useLoad,
} from '../admUI';
import { errMsg } from '../meta';
import { useAdmission, useQueryState, useDebounced, StaffChecks } from './parts';
import { TIE_LABEL } from './Selection';

const TABS = [
  { key: 'portal', label: 'Portal' }, { key: 'workflow', label: 'Workflow' }, { key: 'applications', label: 'Applications' },
  { key: 'numbering', label: 'Numbers & security' }, { key: 'selection', label: 'Selection' }, { key: 'fees', label: 'Fees' },
  { key: 'conversion', label: 'Enrolment' }, { key: 'email', label: 'Email' }, { key: 'compliance', label: 'Compliance' },
];
const clone = (x) => JSON.parse(JSON.stringify(x));

export default function Settings() {
  const adm = useAdmission();
  const [q, setQ] = useQueryState({ tab: 'portal' });
  return (
    <Page>
      <Head eyebrow="Admissions" title="Admission settings" subtitle="How the portal looks and how applications move." />
      <Tabs variant="line" value={q.tab} onChange={(v) => setQ({ tab: v })} items={TABS} wrap={false} />
      {q.tab === 'portal' ? <PortalTab key="portal" adm={adm} /> : null}
      {q.tab === 'workflow' ? <WorkflowTab adm={adm} /> : null}
      {q.tab === 'applications' ? <><BlockTab adm={adm} block="applications" render={ApplicationsBlock} /><BlockTab adm={adm} block="digilocker" render={DigilockerBlock} /></> : null}
      {q.tab === 'numbering' ? <NumberingTab adm={adm} /> : null}
      {q.tab === 'selection' ? <BlockTab adm={adm} block="selection" render={SelectionBlock} /> : null}
      {q.tab === 'fees' ? <BlockTab adm={adm} block="fees" render={FeesBlock} /> : null}
      {q.tab === 'conversion' ? <BlockTab adm={adm} block="conversion" render={ConversionBlock} /> : null}
      {q.tab === 'email' ? <BlockTab adm={adm} block="email" render={EmailBlock} /> : null}
      {q.tab === 'compliance' ? <BlockTab adm={adm} block="compliance" render={ComplianceBlock} /> : null}
    </Page>
  );
}

/** One settings block: edited as a copy, saved on its own. */
function useBlock(adm, ...blocks) {
  const pick = () => Object.fromEntries(blocks.map((b) => [b, clone(adm.settings[b])]));
  const [v, setV] = useState(pick);
  const [busy, setBusy] = useState(false);
  const saved = useMemo(pick, [adm.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const save = async () => {
    setBusy(true);
    try { const r = await admin.saveSettings(v); toast.success('Saved'); setV(Object.fromEntries(blocks.map((b) => [b, clone(r.data[b])]))); adm.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return { v, setV, busy, dirty, save, reset: () => setV(pick()) };
}

function SaveBar({ b }) {
  return (
    <div className="adm-row" style={{ justifyContent: 'flex-end' }}>
      {b.dirty ? <Btn kind="ghost" onClick={b.reset}>Undo changes</Btn> : null}
      <Btn kind="primary" icon="save" busy={b.busy} disabled={!b.dirty} onClick={b.save}>Save</Btn>
    </div>
  );
}

function BlockTab({ adm, block, render: Render }) {
  const b = useBlock(adm, block);
  const set = (patch) => b.setV((x) => ({ ...x, [block]: { ...x[block], ...patch } }));
  return (
    <>
      <Render v={b.v[block]} set={set} adm={adm} />
      <SaveBar b={b} />
    </>
  );
}

/* ── Portal ───────────────────────────────────────────────────────────────── */

function SlugPanel({ adm }) {
  const [slug, setSlug] = useState(adm.settings.slug || adm.suggestedSlug || '');
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const typed = useDebounced(slug, 400);
  useEffect(() => {
    if (!typed || typed === adm.settings.slug) { setCheck(null); return; }
    admin.slugCheck(typed).then((r) => setCheck(r.data)).catch(() => setCheck(null));
  }, [typed, adm.settings.slug]);
  const origin = adm.portalUrl ? adm.portalUrl.replace(/\/[^/]*$/, '') : window.location.origin;
  const save = async () => {
    setBusy(true);
    try { await admin.saveSlug(slug); toast.success('Portal address saved'); adm.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Panel title="Portal address" icon="externalLink" sub="Where families apply. Only your school can use it.">
      <div className="adm-row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <span className="adm-muted" style={{ paddingTop: 10, whiteSpace: 'nowrap' }}>{origin}/</span>
        <Field error={check && !check.ok ? check.problem : null} hint={check?.ok ? 'Available' : 'Lowercase letters, digits and hyphens, 3 to 40'}>
          <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40))} maxLength={40} invalid={check && !check.ok} />
        </Field>
        <Btn kind="primary" busy={busy} disabled={!slug || slug === adm.settings.slug || (check && !check.ok)} onClick={save}>Save address</Btn>
      </div>
      {adm.settings.slug ? <p className="adm-mt" style={{ fontSize: '.86rem' }}>Live at <a href={adm.portalUrl} target="_blank" rel="noreferrer">{adm.portalUrl}</a>. Changing it breaks links already shared.</p> : <Note tone="amber" icon="alert" >The portal has no address yet.</Note>}
    </Panel>
  );
}

function LinksEditor({ list = [], onChange, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {list.map((l, i) => (
        <div key={i} className="adm-row" style={{ flexWrap: 'nowrap' }}>
          <Input value={l.label} placeholder="Label" maxLength={40} style={{ width: 180 }} onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <Input value={l.url} placeholder="https://" maxLength={300} data-text="token" onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))} />
        </div>
      ))}
      {list.length < 6 ? <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...list, { label: '', url: '' }])}>Add a {label} link</Btn> : null}
    </div>
  );
}

const SECTION_TYPES = { text: 'Text', steps: 'Steps', faq: 'Questions and answers', highlights: 'Highlights', dates: 'Important dates', documents: 'Documents needed' };

function PortalTab({ adm }) {
  const b = useBlock(adm, 'portal');
  const p = b.v.portal;
  const set = (patch) => b.setV((x) => ({ portal: { ...x.portal, ...patch } }));
  const setIn = (k, patch) => set({ [k]: { ...p[k], ...patch } });
  const setSection = (i, patch) => set({ sections: p.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <>
      <SlugPanel adm={adm} />
      <Panel title="Open or closed" icon="power">
        <div className="adm-grid3">
          {[['open', 'Open', 'Families can register, apply and pay'], ['closed', 'Closed', 'Families can sign in and follow their applications; nobody new can apply'], ['maintenance', 'Maintenance', 'Signed-in families see a notice; nothing can be submitted']].map(([k, l, sub]) => (
            <label key={k} className={`adm-choice ${p.status === k ? 'is-on' : ''}`} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}>
              <span className="adm-row" style={{ gap: 6 }}><input type="radio" name="pstatus" checked={p.status === k} onChange={() => set({ status: k })} /><b>{l}</b></span>
              <span className="adm-muted" style={{ fontSize: '.78rem' }}>{sub}</span>
            </label>
          ))}
        </div>
        <div className="adm-grid2 adm-mt">
          <Field label="Message while closed"><TextArea rows={2} value={p.closedMessage} onChange={(e) => set({ closedMessage: e.target.value })} maxLength={500} /></Field>
          <Field label="Message during maintenance"><TextArea rows={2} value={p.maintenanceMessage} onChange={(e) => set({ maintenanceMessage: e.target.value })} maxLength={500} /></Field>
        </div>
        <div className="adm-grid3 adm-mt">
          <Toggle checked={p.announcement.enabled} onChange={(v) => setIn('announcement', { enabled: v })} label="Announcement banner" />
          <Field label="Banner colour"><Select value={p.announcement.tone} onChange={(e) => setIn('announcement', { tone: e.target.value })}><option value="info">Blue</option><option value="warning">Amber</option><option value="success">Green</option></Select></Field>
          <Field label="Banner text"><Input value={p.announcement.text} onChange={(e) => setIn('announcement', { text: e.target.value })} maxLength={500} disabled={!p.announcement.enabled} /></Field>
        </div>
      </Panel>
      <Panel title="Look and words" icon="sparkle">
        <div className="adm-grid2">
          <Field label="Title" required><Input value={p.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} /></Field>
          <Field label="Tagline"><Input value={p.tagline} onChange={(e) => set({ tagline: e.target.value })} maxLength={140} /></Field>
          <Field label="Main colour"><div className="adm-row" style={{ flexWrap: 'nowrap' }}><input type="color" value={p.theme.primary} onChange={(e) => setIn('theme', { primary: e.target.value })} aria-label="Main colour" style={{ width: 48, height: 38, border: 'none', background: 'none' }} /><Input value={p.theme.primary} onChange={(e) => setIn('theme', { primary: e.target.value })} maxLength={7} style={{ width: 120 }} /></div></Field>
          <Field label="Second colour"><div className="adm-row" style={{ flexWrap: 'nowrap' }}><input type="color" value={p.theme.accent} onChange={(e) => setIn('theme', { accent: e.target.value })} aria-label="Second colour" style={{ width: 48, height: 38, border: 'none', background: 'none' }} /><Input value={p.theme.accent} onChange={(e) => setIn('theme', { accent: e.target.value })} maxLength={7} style={{ width: 120 }} /></div></Field>
        </div>
        <Field label="Welcome text" className="adm-mt"><TextArea rows={3} value={p.description} onChange={(e) => set({ description: e.target.value })} maxLength={4000} /></Field>
        <Field label="How to apply (instructions)" className="adm-mt"><TextArea rows={3} value={p.instructions} onChange={(e) => set({ instructions: e.target.value })} maxLength={4000} /></Field>
        <div className="adm-grid2 adm-mt">
          <Field label="Sign-in heading"><Input value={p.loginText.title} onChange={(e) => setIn('loginText', { title: e.target.value })} maxLength={80} /></Field>
          <Field label="Sign-in text"><Input value={p.loginText.subtitle} onChange={(e) => setIn('loginText', { subtitle: e.target.value })} maxLength={200} /></Field>
          <Field label="Registration heading"><Input value={p.registerText.title} onChange={(e) => setIn('registerText', { title: e.target.value })} maxLength={80} /></Field>
          <Field label="Registration text"><Input value={p.registerText.subtitle} onChange={(e) => setIn('registerText', { subtitle: e.target.value })} maxLength={200} /></Field>
        </div>
        <div className="adm-grid2 adm-mt">
          <Toggle checked={p.header.showSchoolName} onChange={(v) => setIn('header', { showSchoolName: v })} label="Show the school's name in the header" />
          <Toggle checked={p.enquiries} onChange={(v) => set({ enquiries: v })} label="Enquiry form on the home page" sub="Families can ask a question without an account" />
        </div>
        <div className="adm-grid2 adm-mt">
          <Field label="Header links"><LinksEditor list={p.header.links} onChange={(v) => setIn('header', { links: v })} label="header" /></Field>
          <Field label="Footer links"><LinksEditor list={p.footer.links} onChange={(v) => setIn('footer', { links: v })} label="footer" /></Field>
        </div>
        <Field label="Footer text" className="adm-mt"><Input value={p.footer.text} onChange={(e) => setIn('footer', { text: e.target.value })} maxLength={300} /></Field>
      </Panel>
      <Panel title="Contact and help" icon="phone">
        <div className="adm-grid3">
          <Field label="Office phone"><PhoneInput className="adm-input" value={p.contact.phone} onChange={(e) => setIn('contact', { phone: e.target.value })} /></Field>
          <Field label="Office email"><Input type="email" value={p.contact.email} onChange={(e) => setIn('contact', { email: e.target.value })} maxLength={200} /></Field>
          <Field label="Office hours"><Input value={p.contact.hours} onChange={(e) => setIn('contact', { hours: e.target.value })} maxLength={120} /></Field>
          <Field label="Website"><Input value={p.contact.website} onChange={(e) => setIn('contact', { website: e.target.value })} maxLength={300} data-text="token" placeholder="https://" /></Field>
          <Field label="Address" className="adm-span2"><Input value={p.contact.address} onChange={(e) => setIn('contact', { address: e.target.value })} maxLength={300} /></Field>
        </div>
        <div className="adm-grid3 adm-mt">
          <Field label="Help contact"><Input value={p.help.name} onChange={(e) => setIn('help', { name: e.target.value })} maxLength={80} /></Field>
          <Field label="Help phone"><PhoneInput className="adm-input" value={p.help.phone} onChange={(e) => setIn('help', { phone: e.target.value })} /></Field>
          <Field label="Help email"><Input type="email" value={p.help.email} onChange={(e) => setIn('help', { email: e.target.value })} maxLength={200} /></Field>
        </div>
        <Field label="Help text" className="adm-mt"><Input value={p.help.text} onChange={(e) => setIn('help', { text: e.target.value })} maxLength={500} /></Field>
      </Panel>
      <Panel title="Home page sections" icon="layers" sub="Shown under the welcome, in this order. Dates and documents fill themselves from your rounds and document types.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {p.sections.map((s, i) => (
            <div key={`${s.key}-${i}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="adm-row" style={{ flexWrap: 'nowrap' }}>
                <Toggle checked={s.enabled} onChange={(v) => setSection(i, { enabled: v })} label="" />
                <Input value={s.title} onChange={(e) => setSection(i, { title: e.target.value })} maxLength={80} placeholder="Title" />
                <Select value={s.type} onChange={(e) => setSection(i, { type: e.target.value })} style={{ width: 200 }} aria-label="Kind">{Object.entries(SECTION_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
                <IconBtn icon="arrowUp" label="Up" disabled={i === 0} onClick={() => { const n = [...p.sections]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set({ sections: n }); }} />
                <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => set({ sections: p.sections.filter((_, j) => j !== i) })} />
              </div>
              {s.enabled ? (
                <>
                  <TextArea rows={2} value={s.body} onChange={(e) => setSection(i, { body: e.target.value })} maxLength={4000} placeholder="Text (optional)" />
                  {['steps', 'faq', 'highlights'].includes(s.type) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(s.items || []).map((it, j) => (
                        <div key={j} className="adm-row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                          <Input value={it.title} placeholder={s.type === 'faq' ? 'Question' : 'Title'} maxLength={120} style={{ width: '35%' }} onChange={(e) => setSection(i, { items: s.items.map((x, k) => (k === j ? { ...x, title: e.target.value } : x)) })} />
                          <TextArea rows={1} value={it.text} placeholder={s.type === 'faq' ? 'Answer' : 'Text'} maxLength={1000} onChange={(e) => setSection(i, { items: s.items.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)) })} />
                          <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => setSection(i, { items: s.items.filter((_, k) => k !== j) })} />
                        </div>
                      ))}
                      <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => setSection(i, { items: [...(s.items || []), { title: '', text: '' }] })}>Add {s.type === 'faq' ? 'a question' : 'an item'}</Btn>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ))}
          {p.sections.length < 12 ? <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => set({ sections: [...p.sections, { key: `section_${Date.now().toString(36)}`, type: 'text', title: 'New section', body: '', enabled: true, items: [] }] })}>Add a section</Btn> : null}
        </div>
      </Panel>
      <Panel title="Privacy and declaration" icon="shieldCheck">
        <Field label="Privacy notice" hint={`Families agree to it when they register. Changing it makes a new version (now version ${adm.settings.portal.privacyVersion}).`}>
          <TextArea rows={6} value={p.privacyNotice} onChange={(e) => set({ privacyNotice: e.target.value })} maxLength={8000} />
        </Field>
        <Field label="Declaration on submitting" className="adm-mt"><TextArea rows={3} value={p.declaration} onChange={(e) => set({ declaration: e.target.value })} maxLength={2000} /></Field>
      </Panel>
      <SaveBar b={b} />
    </>
  );
}

/* ── Workflow ─────────────────────────────────────────────────────────────── */

function WorkflowTab({ adm }) {
  const { data, loading, error, reload } = useLoad(() => admin.workflow(), []);
  const [stages, setStages] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setStages(clone(data.stages)); }, [data]);
  if (loading && !data) return <Spin />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!stages) return <Spin />;
  const cat = new Map(data.catalog.stages.map((s) => [s.key, s]));
  const movable = new Set(data.catalog.movable);
  const statusesOf = (key) => data.catalog.statuses.filter((s) => s.stage === key);
  const set = (i, patch) => setStages((x) => x.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, dir) => {
    const j = i + dir;
    if (!stages[j] || !movable.has(stages[i].key) || !movable.has(stages[j].key)) return;
    setStages((x) => { const n = [...x]; [n[i], n[j]] = [n[j], n[i]]; return n.map((s, k) => ({ ...s, order: k })); });
  };
  const dirty = JSON.stringify(stages) !== JSON.stringify(data.stages);
  const save = async () => {
    setBusy(true);
    try { await admin.saveWorkflow(stages.map((s, k) => ({ ...s, order: k }))); toast.success('Workflow saved'); reload(); adm.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Note icon="info">The stages are the platform's; what you choose is which optional ones run, their order (among the movable ones), their names, who handles them, their deadlines, the checks that must pass before an application enters them, and which need an administrator's approval. Actions that belong to a step — an offer, a confirmation, an enrolment — always set their own status.</Note>
      <Panel pad={false}>
        {stages.map((s, i) => {
          const c = cat.get(s.key) || {};
          const n = statusesOf(s.key).reduce((sum, st) => sum + (data.counts[st.key] || 0), 0);
          return (
            <div key={s.key} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', opacity: s.enabled ? 1 : 0.6 }}>
              <div className="adm-row" style={{ flexWrap: 'nowrap' }}>
                <span className="adm-step__n" style={{ width: 26, height: 26, borderRadius: '50%', background: '#eef2ff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', fontWeight: 700 }}>{i + 1}</span>
                <Input value={s.label} onChange={(e) => set(i, { label: e.target.value })} maxLength={60} data-text="title" style={{ maxWidth: 320 }} aria-label="Stage name" />
                {c.optional ? <Toggle checked={s.enabled} onChange={(v) => set(i, { enabled: v })} label={s.enabled ? 'Runs' : 'Skipped'} /> : <Chip tone="gray">Always runs</Chip>}
                {n ? <Chip tone="indigo">{n} application(s) here now</Chip> : null}
                <span style={{ flex: 1 }} />
                {movable.has(s.key) ? <><IconBtn icon="arrowUp" label="Earlier" disabled={!movable.has(stages[i - 1]?.key)} onClick={() => move(i, -1)} /><IconBtn icon="arrowDown" label="Later" disabled={!movable.has(stages[i + 1]?.key)} onClick={() => move(i, 1)} /></> : null}
              </div>
              {s.enabled ? (
                <details style={{ marginTop: 8 }}>
                  <summary className="adm-muted" style={{ cursor: 'pointer', fontSize: '.82rem' }}>
                    {[s.requiresApproval ? 'needs approval' : '', s.requiredChecks?.length ? `${s.requiredChecks.length} check(s)` : '', s.assignees?.length ? `${s.assignees.length} handler(s)` : '', s.deadlineDays ? `${s.deadlineDays}-day deadline` : ''].filter(Boolean).join(' · ') || 'Handlers, deadlines, checks and approval'}
                  </summary>
                  <div className="adm-grid2 adm-mt">
                    <Toggle checked={!!s.requiresApproval} onChange={(v) => set(i, { requiresApproval: v })} label="Entering it needs an administrator's approval" sub="Others' moves wait until approved" />
                    <div className="adm-row">
                      <Field label="Deadline (days in the stage)"><Input type="number" min="1" max="365" step="1" value={s.deadlineDays ?? ''} placeholder="None" onChange={(e) => set(i, { deadlineDays: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                      <Field label="Remind handlers after (days)"><Input type="number" min="1" max="365" step="1" value={s.reminderDays ?? ''} placeholder="Never" onChange={(e) => set(i, { reminderDays: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                    </div>
                    <Field label="Checks before an application enters it">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {data.catalog.checks.map((ck) => (
                          <label key={ck.key} className="adm-check"><input type="checkbox" checked={(s.requiredChecks || []).includes(ck.key)} onChange={(e) => set(i, { requiredChecks: e.target.checked ? [...(s.requiredChecks || []), ck.key] : s.requiredChecks.filter((x) => x !== ck.key) })} /><span>{ck.label}</span></label>
                        ))}
                      </div>
                    </Field>
                    <Field label="Handled by" hint="They are told when applications reach this stage">
                      <StaffChecks value={s.assignees || []} onChange={(v) => set(i, { assignees: v })} max={20} />
                    </Field>
                  </div>
                </details>
              ) : null}
            </div>
          );
        })}
      </Panel>
      <div className="adm-row" style={{ justifyContent: 'flex-end' }}>
        {dirty ? <Btn kind="ghost" onClick={() => setStages(clone(data.stages))}>Undo changes</Btn> : null}
        <Btn kind="primary" icon="save" busy={busy} disabled={!dirty} onClick={save}>Save workflow</Btn>
      </div>
    </>
  );
}

/* ── Applications ─────────────────────────────────────────────────────────── */

function ApplicationsBlock({ v, set }) {
  return (
    <Panel title="Applications" icon="files">
      <div className="adm-grid2">
        <Field label="Applications per family in a round" hint="A round can set its own"><Input type="number" min="1" max="20" step="1" value={v.maxPerApplicant} onChange={(e) => set({ maxPerApplicant: Number(e.target.value) || 1 })} /></Field>
        <Field label="Application fee is paid">
          <Select value={v.applicationFeeTiming} onChange={(e) => set({ applicationFeeTiming: e.target.value })}>
            <option value="before_submit">Before the application can be submitted</option>
            <option value="after_submit">After submitting</option>
          </Select>
        </Field>
        <Field label="When the form changes, drafts already started">
          <Select value={v.draftMigration} onChange={(e) => set({ draftMigration: e.target.value })}>
            <option value="migrate">Move to the new version (answers to removed questions are kept aside)</option>
            <option value="keep">Keep the version they began with</option>
          </Select>
        </Field>
        <span />
        <Toggle checked={v.requireDocumentsAtSubmit} onChange={(x) => set({ requireDocumentsAtSubmit: x })} label="Required documents must be uploaded to submit" />
        <Toggle checked={v.duplicateCheck} onChange={(x) => set({ duplicateCheck: x })} label="Warn about possible duplicates" sub="Same student and date of birth, or the same contact, this year" />
        <Toggle checked={v.allowWithdraw} onChange={(x) => set({ allowWithdraw: x })} label="Families can withdraw an application" />
        <Toggle checked={v.allowReapplyAfterRejection} onChange={(x) => set({ allowReapplyAfterRejection: x })} label="A family may apply again after a rejection" />
      </div>
    </Panel>
  );
}

/** Documents families fetch from DigiLocker (school-backend services/admission/digilocker.js). */
function DigilockerBlock({ v, set }) {
  return (
    <Panel title="DigiLocker" icon="shieldCheck" sub="Families fetch documents issued to them — a birth certificate, mark sheets, a transfer certificate — straight from the issuer. Available where the platform is a DigiLocker partner.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Toggle checked={v.enabled !== false} onChange={(x) => set({ enabled: x })} label="Offer “Fetch from DigiLocker” on applications" />
        <Toggle checked={!!v.autoVerify} onChange={(x) => set({ autoVerify: x })} label="Count documents fetched from DigiLocker as verified"
          sub="They come signed by the issuer. Off: the office checks them like any upload, with the issuer shown." />
      </div>
    </Panel>
  );
}

/* ── Numbers and security ─────────────────────────────────────────────────── */

const TOKENS = [['{YYYY}', 'Year'], ['{YY}', 'Year, 2 digits'], ['{MM}', 'Month'], ['{DD}', 'Day'], ['{CODE}', 'School code'], ['{INITIALS}', 'School initials'], ['{CLASS}', 'Class name'], ['{CLASSNO}', 'Class number'], ['{####}', 'Running number (one # per digit)'], ['{SEQ}', 'Running number, no zeros']];

function NumberField({ label, value, onChange }) {
  const typed = useDebounced(value, 400);
  const [p, setP] = useState(null);
  useEffect(() => { admin.numberPreview(typed).then((r) => setP(r.data)).catch(() => setP(null)); }, [typed]);
  return (
    <Field label={label} error={p?.problem} hint={p?.preview ? `Next would look like ${p.preview}` : ''}>
      <Input value={value} onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9{}#/_-]/g, ''))} maxLength={60} className="adm-num" />
    </Field>
  );
}

function NumberingTab({ adm }) {
  const b = useBlock(adm, 'numbering', 'security');
  const n = b.v.numbering;
  const s = b.v.security;
  const setN = (patch) => b.setV((x) => ({ ...x, numbering: { ...x.numbering, ...patch } }));
  const setS = (patch) => b.setV((x) => ({ ...x, security: { ...x.security, ...patch } }));
  return (
    <>
      <Panel title="Numbers" icon="listDots" sub="Each counts up on its own and is never reused.">
        <div className="adm-grid2">
          <NumberField label="Application number" value={n.application} onChange={(v) => setN({ application: v })} />
          <NumberField label="Receipt number" value={n.receipt} onChange={(v) => setN({ receipt: v })} />
          <NumberField label="Exam roll number" value={n.admitCard} onChange={(v) => setN({ admitCard: v })} />
          <NumberField label="Offer number" value={n.offer} onChange={(v) => setN({ offer: v })} />
        </div>
        <div className="adm-row adm-mt" style={{ gap: 6 }}>{TOKENS.map(([t, l]) => <Chip key={t} title={l}>{t}</Chip>)}</div>
      </Panel>
      <Panel title="Sign-up codes" icon="lock" sub="Codes emailed to families. The platform's limits keep these safe — they can be made stricter, not looser.">
        <div className="adm-grid2">
          <Field label="A code lasts (minutes)" hint="5 to 30"><Input type="number" min="5" max="30" step="1" value={s.otpExpiryMinutes} onChange={(e) => setS({ otpExpiryMinutes: Number(e.target.value) })} /></Field>
          <Field label="Wait before sending again (seconds)" hint="30 to 600"><Input type="number" min="30" max="600" step="10" value={s.otpResendSeconds} onChange={(e) => setS({ otpResendSeconds: Number(e.target.value) })} /></Field>
          <Field label="Wrong tries allowed" hint="3 to 10"><Input type="number" min="3" max="10" step="1" value={s.otpMaxAttempts} onChange={(e) => setS({ otpMaxAttempts: Number(e.target.value) })} /></Field>
          <Field label="Codes per address per hour" hint="3 to 10"><Input type="number" min="3" max="10" step="1" value={s.otpMaxSendsPerHour} onChange={(e) => setS({ otpMaxSendsPerHour: Number(e.target.value) })} /></Field>
        </div>
      </Panel>
      <Panel title="“Not a robot” check" icon="shieldCheck" sub="On creating an account, resetting a password, a mobile sign-in code and an enquiry — when the platform has a check set up (Cloudflare Turnstile or hCaptcha).">
        <Toggle checked={s.captcha !== false} onChange={(v) => setS({ captcha: v })} label="Ask for the check on this school's portal"
          sub="Rate limits protect the portal either way; the check stops scripts creating accounts or sending codes in bulk." />
      </Panel>
      <SaveBar b={b} />
    </>
  );
}

/* ── Selection ────────────────────────────────────────────────────────────── */

function SelectionBlock({ v, set }) {
  const ties = v.tieBreakers || [];
  return (
    <Panel title="Selection and offers" icon="trophy">
      <div className="adm-grid2">
        <Field label="Default tie-breakers" hint="Used when a list sets none — in this order">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ties.map((t, i) => (
              <div key={i} className="adm-row" style={{ flexWrap: 'nowrap' }}>
                <span className="adm-muted" style={{ width: 18 }}>{i + 1}.</span>
                <Select value={t} onChange={(e) => set({ tieBreakers: ties.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Tie-breaker ${i + 1}`}>{Object.entries(TIE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
                <IconBtn icon="arrowUp" label="Earlier" disabled={i === 0} onClick={() => { const n = [...ties]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set({ tieBreakers: n }); }} />
                <IconBtn icon="trash" kind="danger" label="Remove" disabled={ties.length <= 1} onClick={() => set({ tieBreakers: ties.filter((_, j) => j !== i) })} />
              </div>
            ))}
            {ties.length < 5 ? <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => set({ tieBreakers: [...ties, Object.keys(TIE_LABEL).find((k) => !ties.includes(k))] })}>Add</Btn> : null}
          </div>
        </Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="An offer stays open for (days)"><Input type="number" min="1" max="60" step="1" value={v.offerValidityDays} onChange={(e) => set({ offerValidityDays: Number(e.target.value) || 7 })} /></Field>
          <Toggle checked={v.allowApplicantResponse} onChange={(x) => set({ allowApplicantResponse: x })} label="Families accept or decline on the portal" sub="Otherwise the office records their answer" />
          <Toggle checked={v.autoPromoteWaitlist} onChange={(x) => set({ autoPromoteWaitlist: x })} label="Move the waiting list up automatically" sub="When an offer is declined, expires or is withdrawn" />
        </div>
      </div>
      <Field label="New lists show families, by default" className="adm-mt">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Toggle checked={v.visibility.showRank} onChange={(x) => set({ visibility: { ...v.visibility, showRank: x } })} label="Their rank" />
          <Toggle checked={v.visibility.showScore} onChange={(x) => set({ visibility: { ...v.visibility, showScore: x } })} label="Their score" />
          <Toggle checked={v.visibility.showNames} onChange={(x) => set({ visibility: { ...v.visibility, showNames: x } })} label="Other selected names" />
        </div>
      </Field>
    </Panel>
  );
}

/* ── Fees ─────────────────────────────────────────────────────────────────── */

function FeesBlock({ v, set, adm }) {
  const ws = v.waivers || [];
  const setW = (i, patch) => set({ waivers: ws.map((w, j) => (j === i ? { ...w, ...patch } : w)) });
  return (
    <>
      <Note tone={adm.school.onlinePayment ? 'green' : 'amber'} icon="creditCard">
        Online payment for admissions is <b>{adm.school.onlinePayment ? 'on' : 'off'}</b>. It uses the school's own payment gateway — <Link to="/admin/school-settings?section=payments">School Settings → Payments</Link>, where "Admission fees" is switched on. The amounts themselves are set on each round.
      </Note>
      <Panel title="Waivers" icon="percent" sub="Reductions the office can grant on a fee, each with a reason kept on the application.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ws.map((w, i) => (
            <div key={i} className="adm-row" style={{ flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
              <Input value={w.name} placeholder="Name, e.g. Sibling concession" maxLength={60} data-text="title" style={{ width: 230 }} onChange={(e) => setW(i, { name: e.target.value })} />
              <Select value={w.type} onChange={(e) => setW(i, { type: e.target.value })} style={{ width: 130 }} aria-label="Kind"><option value="percent">Percentage</option><option value="amount">Fixed amount</option></Select>
              <Input type="number" min="0" max={w.type === 'percent' ? 100 : undefined} step="1" style={{ width: 110 }} value={w.value} onChange={(e) => setW(i, { value: Number(e.target.value) })} aria-label="Value" />
              <Select value={w.appliesTo} onChange={(e) => setW(i, { appliesTo: e.target.value })} style={{ width: 190 }} aria-label="On"><option value="both">Either fee</option><option value="application">Application fee</option><option value="admission">Admission fee</option></Select>
              <Toggle checked={w.requiresApproval} onChange={(x) => setW(i, { requiresApproval: x })} label="Administrators only" />
              <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => set({ waivers: ws.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => set({ waivers: [...ws, { key: `waiver_${Date.now().toString(36)}`, name: '', type: 'percent', value: 10, appliesTo: 'both', requiresApproval: true }] })}>Add a waiver</Btn>
        </div>
        <Field label="Note printed on receipts" className="adm-mt"><Input value={v.receiptNote} onChange={(e) => set({ receiptNote: e.target.value })} maxLength={300} /></Field>
      </Panel>
    </>
  );
}

/* ── Enrolment ────────────────────────────────────────────────────────────── */

function ConversionBlock({ v, set, adm }) {
  const m = adm.school.modules || {};
  return (
    <Panel title="Confirming and enrolling" icon="gradCap" sub="What has to be true before an admission is confirmed, and what happens when the student is created.">
      <div className="adm-grid2">
        <Toggle checked={v.requireAdmissionFeePaid} onChange={(x) => set({ requireAdmissionFeePaid: x })} label="The admission fee must be paid (or waived) to confirm" />
        <Toggle checked={v.requireDocumentsVerified} onChange={(x) => set({ requireDocumentsVerified: x })} label="Required documents must be verified to confirm" />
        <Field label="New accounts are">
          <Select value={v.activation} onChange={(e) => set({ activation: e.target.value })}>
            <option value="immediate">Switched on at once</option>
            <option value="manual">Created switched off, activated later</option>
          </Select>
        </Field>
        <Toggle checked={v.sendCredentials} onChange={(x) => set({ sendCredentials: x })} label="Email sign-in details to the student and parent" />
        <Toggle checked={v.transferDocuments} onChange={(x) => set({ transferDocuments: x })} label="Copy verified documents to the student record" />
        <Toggle checked={v.createFeeAssignment} onChange={(x) => set({ createFeeAssignment: x })} disabled={!m.fees} label="Assign the class's fee structure" sub={m.fees ? '' : 'The Fees module is off'} />
        <Toggle checked={v.transportRequest} onChange={(x) => set({ transportRequest: x })} disabled={!m.transport} label="Send a transport request when asked for" sub={m.transport ? '' : 'The Transport module is off'} />
        <Toggle checked={v.hostelRequest} onChange={(x) => set({ hostelRequest: x })} disabled={!m.hostel} label="Offer a hostel admission when asked for" sub={m.hostel ? '' : 'The Hostel module is off'} />
        <Toggle checked={v.medicalRecord} onChange={(x) => set({ medicalRecord: x })} disabled={!m.medical} label="Copy health answers to the Medical Room" sub={m.medical ? '' : 'The Medical Room is off'} />
      </div>
    </Panel>
  );
}

/* ── Email ────────────────────────────────────────────────────────────────── */

function EmailBlock({ v, set }) {
  return (
    <Panel title="Email" icon="mail" sub={<>The wording of each email is under <Link to="/admin/admissions/emails">Emails</Link>. Mail goes out through the school's own mail server when one is set up (School Settings → Email).</>}>
      <div className="adm-grid2">
        <Field label="Sender name" hint="Empty: the school's name"><Input value={v.fromName} onChange={(e) => set({ fromName: e.target.value })} maxLength={80} /></Field>
        <Field label="Replies go to" hint="Empty: the sending address"><Input type="email" value={v.replyTo} onChange={(e) => set({ replyTo: e.target.value })} maxLength={200} /></Field>
        <Field label="Remind of an exam (hours before)" hint="0: no reminder"><Input type="number" min="0" max="168" step="1" value={v.reminders.examHoursBefore} onChange={(e) => set({ reminders: { ...v.reminders, examHoursBefore: Number(e.target.value) || 0 } })} /></Field>
        <Field label="Remind of a fee (days before it is due)" hint="0: no reminder"><Input type="number" min="0" max="30" step="1" value={v.reminders.paymentDaysBefore} onChange={(e) => set({ reminders: { ...v.reminders, paymentDaysBefore: Number(e.target.value) || 0 } })} /></Field>
      </div>
    </Panel>
  );
}

/* ── Compliance ───────────────────────────────────────────────────────────── */

const EXEMPT = { minority: 'A recognised minority institution', not_applicable: 'The school has no elementary classes', other: 'Another reason (say which)' };

function ComplianceBlock({ v, set, adm }) {
  const rte = v.rte || {};
  const setR = (patch) => set({ rte: { ...rte, ...patch } });
  const nums = rte.classNumbers || [];
  const covered = (adm.classes || []).filter((c) => adm.screening?.[c._id]?.banned);
  return (
    <Panel title="Choosing between applicants — the RTE Act" icon="shieldCheck"
      sub="Section 13 of the Right of Children to Free and Compulsory Education Act, 2009 bars any screening when admitting a child to elementary education — and section 2(o) counts as screening any way of choosing one child over another other than a random one.">
      <Toggle checked={!!rte.enabled} onChange={(x) => setR({ enabled: x })} label="Keep to the rule"
        sub="For the classes below: no entrance test, no interview and no merit list. Families are chosen by a lottery list, and an offer by hand only while there is a seat for everyone waiting." />
      {rte.enabled ? (
        <>
          <Field label="Classes it covers, by class number" className="adm-mt">
            <div className="adm-choices">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <label key={n} className={`adm-choice ${nums.includes(n) ? 'is-on' : ''}`}>
                  <input type="checkbox" checked={nums.includes(n)} onChange={(e) => setR({ classNumbers: e.target.checked ? [...nums, n].sort((a, b) => a - b) : nums.filter((x) => x !== n) })} />Class {n}
                </label>
              ))}
            </div>
          </Field>
          <Toggle checked={!!rte.prePrimary} onChange={(x) => setR({ prePrimary: x })} label="Pre-primary classes too"
            sub="Nursery, LKG, UKG, KG and Balvatika — where the state's rules extend the bar to them. These are found by their names." />
          <Note tone={covered.length ? 'indigo' : 'gray'} icon="info">
            {covered.length
              ? <>As saved, it covers {covered.map((c) => c.className).join(', ')}.</>
              : <>As saved, it covers none of the school&rsquo;s classes.</>}
          </Note>
        </>
      ) : (
        <>
          <div className="adm-grid2 adm-mt">
            <Field label="Why it does not apply" required>
              <Select value={rte.exemptReason || ''} onChange={(e) => setR({ exemptReason: e.target.value })}>
                <option value="">Choose…</option>
                {Object.entries(EXEMPT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Note" required hint="The order, letter or reason — kept with the change">
              <TextArea rows={2} maxLength={500} value={rte.exemptNote || ''} onChange={(e) => setR({ exemptNote: e.target.value })} />
            </Field>
          </div>
          <Note tone="amber" icon="alert">Switching the rule off is recorded with your name. Do it only on advice — the fine for screening is up to ₹25,000, and ₹50,000 for each time after.</Note>
        </>
      )}
    </Panel>
  );
}
