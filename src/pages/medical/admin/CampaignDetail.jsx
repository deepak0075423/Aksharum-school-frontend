/**
 * One health campaign (Oct 2026): announce it, mark the roster section by
 * section on the day (and the mop-up day), see the coverage, close it.
 * "Given" is checked by the server against the family's answer and the
 * child's allergies; a row it refuses is reported, the rest are saved.
 */
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { Page, PageHead, Panel, Btn, Badge, Empty, Spin, LoadError, Select, Segmented, Switch, Dialog, Field, Note, Kebab, ConfirmDialog, Avatar, useLoad } from '../mdUI';
import { fmtDay, errorText, todayStr } from '../mdMeta';
import { CampaignDialog } from './Campaigns';

// An unanswered family means "no objection" when it is opt-out, "not yet" when a yes is needed.
const consentBadge = (mode, answer) => ({ yes: ['green', 'Family said yes'], no: ['red', 'Family said no'] }[answer]
  || (mode === 'opt_in' ? ['amber', 'No yes yet'] : ['slate', 'No objection']));
const FILTER = [{ value: 'all', label: 'All' }, { value: 'waiting', label: 'Not marked' }, { value: 'given', label: 'Given' }, { value: 'absent', label: 'Absent' }, { value: 'other', label: 'Not given' }];

export default function CampaignDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [section, setSection] = useState('');
  const r = useLoad(() => api.getCampaign(id, section ? { sectionId: section } : {}), { id, section });
  const [filter, setFilter] = useState('all');
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [why, setWhy] = useState(null);       // { row, outcome } — a reason is needed
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const d = r.data;
  const c = d?.campaign;
  usePageCrumbs(c ? [{ label: 'Campaigns', to: '/admin/medical/programmes/campaigns' }, { label: c.title }] : []);
  const [mopUpOn, setMopUp] = useState(null);
  if (r.error && !d) return <Page><LoadError error={r.error} onRetry={r.reload} /></Page>;
  if (!d) return <Page><Spin /></Page>;
  const today = todayStr();
  const mainOver = String(c.endOn || c.startOn).slice(0, 10) < today;
  const mopUp = mopUpOn === null ? (mainOver && !!c.mopUpOn) : mopUpOn;
  const canMark = c.status === 'announced' && String(c.startOn).slice(0, 10) <= today;
  const done = (res, label) => {
    const x = res?.data ?? res;
    const failed = x?.failed || [];
    if (x?.saved) toast.success(`${x.saved} ${label}`);
    for (const f of failed.slice(0, 4)) toast.error(f.message, { duration: 6000 });
    if (failed.length > 4) toast.error(`…and ${failed.length - 4} more could not be saved`);
    if (x?.left) toast(`${x.left} left for a decision (the family's answer)`, { icon: 'ℹ️' });
    r.reload();
  };
  const mark = async (row, outcome, text = '') => {
    setBusy(`${row.studentId}:${outcome}`);
    try { done(await api.recordCampaign(id, { entries: [{ student: row.studentId, outcome, reason: text }], mopUp }), 'saved'); } catch (e) { toast.error(errorText(e)); } finally { setBusy(''); }
  };
  const rest = async (outcome) => {
    setBusy(`rest:${outcome}`);
    try { done(await api.markCampaignRest(id, { sectionId: section || 'all', outcome, mopUp }), outcome === 'given' ? 'marked given' : 'marked absent'); } catch (e) { toast.error(errorText(e)); } finally { setBusy(''); }
  };
  const action = async (name, body) => {
    setBusy(name);
    try { await api.campaignAction(id, name, body); toast.success({ announce: 'Announced — the families have been told', close: 'Closed', cancel: 'Cancelled', reopen: 'Reopened' }[name]); setConfirm(''); r.reload(); } catch (e) { toast.error(errorText(e)); } finally { setBusy(''); }
  };
  const roster = d.roster.filter((x) => (filter === 'all' ? true : filter === 'waiting' ? !x.outcome : filter === 'other' ? ['refused', 'excluded'].includes(x.outcome) : x.outcome === filter));
  const t = d.total || {};
  return (
    <Page>
      <PageHead icon="megaphone" tone="teal" title={c.title}
        subtitle={`${c.number} · ${c.kindLabel}${c.what && c.what !== c.kindLabel ? ` · ${c.what}` : ''} · ${fmtDay(c.startOn)}${c.endOn ? ` – ${fmtDay(c.endOn)}` : ''}${c.mopUpOn ? ` · mop-up ${fmtDay(c.mopUpOn)}` : ''} · ${c.consentLabel}`}>
        <Badge tone={c.tone}>{c.phaseLabel}</Badge>
        {['draft', 'announced'].includes(c.status) ? <Btn icon="pencil" onClick={() => setEdit(true)}>Change</Btn> : null}
        {c.status === 'draft' ? <Btn kind="primary" icon="send" onClick={() => setConfirm('announce')}>Announce to families</Btn> : null}
        {c.status === 'announced' && canMark ? <Btn kind="primary" onClick={() => setConfirm('close')}>Close with this coverage</Btn> : null}
        {c.status === 'closed' ? <Btn onClick={() => action('reopen')}>Reopen</Btn> : null}
        {['draft', 'announced'].includes(c.status) ? <Kebab items={[{ label: 'Cancel the campaign', icon: 'close', danger: true, onClick: () => setConfirm('cancel') }]} /> : null}
      </PageHead>
      {c.status === 'draft' ? <Note tone="amber" icon="info">A draft: nobody has been told. Announcing makes the roster for {c.audience?.all ? 'the whole school' : 'the classes chosen'} and tells each family{c.consent === 'opt_out' ? ' — they can say no' : c.consent === 'opt_in' ? ' — their child takes part only if they say yes' : ''}.</Note> : null}
      {c.about ? <Note tone="slate" icon="info">{c.about}</Note> : null}
      {c.status !== 'draft' ? (
        <div className="mdrep-sum">
          <div><span>Students</span><strong>{t.students || 0}</strong></div>
          <div><span>Could take part</span><strong>{t.eligible || 0}</strong></div>
          <div className="md-t-green"><span>{c.doneLabel}</span><strong>{t.given || 0}</strong></div>
          <div className="md-t-amber"><span>Absent</span><strong>{t.absent || 0}</strong></div>
          {c.consent !== 'none' ? <div className="md-t-red"><span>Family said no</span><strong>{t.declined || 0}</strong></div> : null}
          {c.consent === 'opt_in' ? <div className="md-t-amber"><span>No yes yet</span><strong>{t.unanswered || 0}</strong></div> : null}
          <div className="md-t-indigo"><span>Coverage</span><strong>{t.coverage === null || t.coverage === undefined ? '—' : `${t.coverage}%`}</strong></div>
        </div>
      ) : null}
      {d.sections.length ? (
        <Panel pad={false} title="By section" icon="users" tone="indigo">
          <div className="mdc-readings" style={{ border: 0, borderRadius: 0 }}>
            <table>
              <thead><tr><th>Section</th><th>Students</th><th>Could take part</th><th>{c.doneLabel}</th><th>Absent</th><th>Not given</th><th>Not marked</th>{c.consent !== 'none' ? <th>Said no</th> : null}<th>Coverage</th></tr></thead>
              <tbody>
                {d.sections.map((s) => (
                  <tr key={s.sectionId || 'none'} className={s.sectionId === section ? 'is-on' : ''} onClick={() => setSection(s.sectionId || '')} style={{ cursor: 'pointer' }}>
                    <td><b>{s.label}</b></td><td>{s.students}</td><td>{s.eligible}</td><td>{s.given}</td><td className={s.absent ? 'is-warning' : ''}>{s.absent}</td><td>{s.refused + s.excluded}</td><td>{s.waiting}</td>{c.consent !== 'none' ? <td>{s.declined}</td> : null}
                    <td>{s.coverage === null ? '—' : `${s.coverage}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      {c.status !== 'draft' ? (
        <Panel pad={false} title="Roster" icon="clipboard" tone="teal"
          right={<Select value={section} onChange={setSection} all="All sections" label="Section" options={d.sections.filter((s) => s.sectionId).map((s) => ({ value: s.sectionId, label: s.label }))} />}>
          <div className="mdpr-rosterbar">
            <Segmented value={filter} onChange={setFilter} label="Show" options={FILTER} size="sm" />
            {canMark && c.mopUpOn ? <Switch checked={mopUp} onChange={setMopUp} label="Mop-up day" hint="Marks the children seen today as caught up" /> : null}
            {canMark ? <span className="md-acts"><Btn size="sm" busy={busy === 'rest:absent'} onClick={() => rest('absent')}>Rest absent</Btn><Btn size="sm" kind="primary" busy={busy === 'rest:given'} onClick={() => rest('given')}>Rest {c.doneLabel.toLowerCase()}</Btn></span> : null}
          </div>
          {!canMark && c.status === 'announced' ? <Note tone="slate" icon="info">The roster can be marked from {fmtDay(c.startOn)}.</Note> : null}
          {roster.length ? (
            <ul className="mdpr-roster">
              {roster.map((x) => {
                const [tone, label] = consentBadge(c.consent, x.consent);
                return (
                  <li key={x._id} className={x.outcome ? `is-${x.outcome}` : ''}>
                    <Avatar name={x.studentName} photo={x.studentPhoto} size={34} />
                    <div>
                      <b>{x.studentName}</b>
                      <em>{x.rollNumber ? `Roll ${x.rollNumber} · ` : ''}{x.admissionNumber}</em>
                      <span className="mdpr-roster__tags">
                        {c.consent !== 'none' ? <Badge tone={tone} size="sm">{label}</Badge> : null}
                        {x.allergies ? <Badge tone="red" size="sm" icon="alertTri">Allergy: {x.allergies}</Badge> : null}
                        {x.outcome ? <Badge tone={x.outcomeTone} size="sm">{x.outcome === 'given' ? c.doneLabel : x.outcomeLabel}{x.mopUp ? ' (mop-up)' : ''}</Badge> : null}
                      </span>
                      {x.consentReason ? <em>Family: “{x.consentReason}”</em> : null}
                      {x.outcomeReason ? <em>{x.outcomeReason}</em> : null}
                    </div>
                    {canMark ? (
                      <span className="md-acts">
                        {x.outcome !== 'given' ? <Btn size="sm" kind="primary" disabled={c.gives && !x.allowed} busy={busy === `${x.studentId}:given`} onClick={() => mark(x, 'given')}>{c.doneLabel}</Btn> : null}
                        {x.outcome !== 'absent' ? <Btn size="sm" busy={busy === `${x.studentId}:absent`} onClick={() => mark(x, 'absent')}>Absent</Btn> : null}
                        <Kebab items={[
                          { label: 'Refused on the day', onClick: () => { setWhy({ row: x, outcome: 'refused' }); setReason(''); } },
                          { label: 'Not given — medical reason', onClick: () => { setWhy({ row: x, outcome: 'excluded' }); setReason(x.allergies ? `Allergy: ${x.allergies}` : ''); } },
                          x.outcome ? { label: 'Clear the mark', onClick: () => mark(x, '') } : null,
                          { label: 'Open medical profile', icon: 'user', onClick: () => nav(`/admin/medical/students/${x.studentId}`) },
                        ].filter(Boolean)} />
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : <div style={{ padding: 16 }}><Empty compact title="Nobody here" /></div>}
        </Panel>
      ) : null}
      {edit ? <CampaignDialog campaign={c} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); r.reload(); }} /> : null}
      <ConfirmDialog open={confirm === 'announce'} onClose={() => setConfirm('')} title="Announce this campaign?" confirmLabel="Announce"
        message={`Each family in the audience is told about ${c.title} on ${fmtDay(c.startOn)}${c.consent === 'opt_out' ? ' and can say no' : c.consent === 'opt_in' ? ' and asked to say yes' : ''}; the class teachers are told too.`} onConfirm={() => action('announce')} />
      <ConfirmDialog open={confirm === 'close'} onClose={() => setConfirm('')} title="Close this campaign?" confirmLabel="Close it"
        message={`The coverage stays at ${t.coverage ?? 0}%. ${t.waiting ? `${t.waiting} children are not marked — they stay that way.` : ''} It can be reopened to correct a row.`} onConfirm={() => action('close')} />
      <ConfirmDialog open={confirm === 'cancel'} onClose={() => setConfirm('')} title="Cancel this campaign?" danger confirmLabel="Cancel the campaign" reason reasonLabel="Why (the families are told)"
        message={c.status === 'announced' ? 'Families who were told are told it will not take place.' : 'Nobody has been told yet.'} onConfirm={(text) => action('cancel', { reason: text })} />
      {why ? (
        <Dialog open onClose={() => setWhy(null)} title={`${why.outcome === 'refused' ? 'Refused' : 'Not given'} — ${why.row.studentName}`} icon="close" tone="slate" width={460}
          footer={<><Btn onClick={() => setWhy(null)}>Cancel</Btn><Btn kind="primary" disabled={reason.trim().length < 3} onClick={() => { mark(why.row, why.outcome, reason); setWhy(null); }}>Save</Btn></>}>
          <Field label="Why" required><textarea className="md-textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus /></Field>
        </Dialog>
      ) : null}
    </Page>
  );
}
