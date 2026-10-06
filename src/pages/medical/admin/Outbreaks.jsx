/**
 * Health Programmes → Outbreak Watch (Oct 2026). The sweep opens an outbreak
 * when one section (or class, or the school) has several children with the
 * same illness in a few days — from visits, children kept off school and
 * families' reports. Here the medical staff look into it: the cases, the days,
 * a notice to families that names no child, a report to the health
 * authority, closing it.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Badge, Empty, Spin, LoadError, LineTabs, Dialog, Field, Note, Segmented, useLoad, useQueryState } from '../mdUI';
import { fmtDay, fmtStamp, errorText, todayStr } from '../mdMeta';

/** A row of little bars: children per day. */
function DayBars({ days = [] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <span className="mdpr-bars" aria-label={days.map((d) => `${fmtDay(d.day)}: ${d.count}`).join(', ')}>
      {days.slice(-21).map((d) => <i key={d.day} style={{ height: `${Math.max(2, (d.count / max) * 26)}px` }} title={`${fmtDay(d.day)}: ${d.count}`} className={d.count ? 'is-on' : ''} />)}
    </span>
  );
}

function OutbreakDialog({ id, onClose, onChanged }) {
  const nav = useNavigate();
  const r = useLoad(() => api.getOutbreak(id), id);
  const [mode, setMode] = useState('');
  const [v, setV] = useState({ text: '', textHi: '', to: '', reference: '', on: todayStr(), note: '', audience: 'section' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const o = r.data;
  const act = async (body, ok) => {
    setBusy(true); setErr('');
    try { await api.outbreakAct(id, body); toast.success(ok); setMode(''); r.reload(); onChanged?.(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const draft = async (audience) => {
    setV((x) => ({ ...x, audience }));
    try { const res = await api.outbreakNoticeDraft(id, audience); setV((x) => ({ ...x, audience, text: (res?.data ?? res).text })); } catch (e) { setErr(errorText(e)); }
  };
  const notice = async () => {
    setBusy(true); setErr('');
    try { const res = await api.sendOutbreakNotice(id, { audience: v.audience, text: v.text, textHi: v.textHi }); const s = (res?.data ?? res).sent; toast.success(`Sent to ${s.families} parent${s.families === 1 ? '' : 's'} and ${s.teachers} teacher${s.teachers === 1 ? '' : 's'}`); setMode(''); r.reload(); onChanged?.(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  if (!o) return <Dialog open onClose={onClose} title="Outbreak" icon="alertTri" tone="red" width={720}>{r.error ? <LoadError error={r.error} onRetry={r.reload} /> : <Spin />}</Dialog>;
  const open = o.status !== 'closed';
  const audiences = [
    ...(o.scope?.kind === 'section' ? [{ value: 'section', label: o.scope.label }] : []),
    ...(['section', 'class'].includes(o.scope?.kind) ? [{ value: 'class', label: 'The whole class' }] : []),
    { value: 'school', label: 'The whole school' },
  ];
  const footer = mode === 'notice' ? <><Btn onClick={() => setMode('')} disabled={busy}>Back</Btn><Btn kind="primary" busy={busy} disabled={v.text.trim().length < 20} onClick={notice}>Send the notice</Btn></>
    : mode === 'note' ? <><Btn onClick={() => setMode('')} disabled={busy}>Back</Btn><Btn kind="primary" busy={busy} onClick={() => act({ action: 'note', text: v.note }, 'Note added')}>Add note</Btn></>
      : mode === 'reported' ? <><Btn onClick={() => setMode('')} disabled={busy}>Back</Btn><Btn kind="primary" busy={busy} onClick={() => act({ action: 'reported', to: v.to, reference: v.reference, on: v.on }, 'Recorded')}>Record the report</Btn></>
        : mode === 'close' ? <><Btn onClick={() => setMode('')} disabled={busy}>Back</Btn><Btn kind="primary" busy={busy} onClick={() => act({ action: 'close', note: v.note }, 'Closed')}>Close the outbreak</Btn></>
          : <>
            {open ? <Btn icon="megaphone" onClick={() => { setMode('notice'); draft(audiences[0].value); }}>Notice to families</Btn> : null}
            <Btn onClick={() => { setMode('note'); setV({ ...v, note: '' }); }}>Add note</Btn>
            {open && !o.reported?.to ? <Btn onClick={() => setMode('reported')}>Reported to the health authority</Btn> : null}
            {o.status === 'watching' ? <Btn kind="primary" onClick={() => act({ action: 'confirm' }, 'Confirmed as an outbreak')}>Confirm outbreak</Btn> : null}
            {open ? <Btn onClick={() => { setMode('close'); setV({ ...v, note: '' }); }}>Close</Btn> : <Btn onClick={() => act({ action: 'reopen' }, 'Reopened')}>Reopen</Btn>}
          </>;
  return (
    <Dialog open onClose={onClose} title={`${o.number} — ${o.label}`} icon="alertTri" tone="red" width={760} footer={footer}>
      {mode === '' ? (
        <>
          <div className="mdpr-detail">
            <div><span>Where</span><b>{o.scope?.label}</b></div>
            <div><span>Children</span><b>{o.caseCount}</b><em>{fmtDay(o.firstDay)} – {fmtDay(o.lastDay)}</em></div>
            <div><span>Status</span><Badge tone={o.tone} size="sm">{o.statusLabel}</Badge></div>
            {o.reported?.to ? <div><span>Reported</span><b>{o.reported.to}</b><em>{fmtDay(o.reported.on)}{o.reported.reference ? ` · ${o.reported.reference}` : ''}</em></div> : null}
          </div>
          <DayBars days={o.days} />
          <Note tone="slate" icon="lock">Who the children are is for the medical staff only. A notice to families never names them.</Note>
          <h4 className="mdp-h">Cases</h4>
          <ul className="mdd-list">
            {o.cases.map((c) => (
              <li key={`${c.student}:${c.sourceId}`}>
                <div><b>{c.name}</b><em>{c.classLabel} · {c.sourceLabel} · {c.onLabel || fmtStamp(c.on)}</em></div>
                <Btn size="sm" kind="ghost" onClick={() => nav(`/admin/medical/students/${c.student}`)}>Record</Btn>
              </li>
            ))}
          </ul>
          {(o.notices || []).length ? (
            <>
              <h4 className="mdp-h">Notices sent</h4>
              <ul className="mdd-list">{o.notices.map((n) => <li key={n.at}><div><b>{n.audience === 'school' ? 'The whole school' : n.audience === 'class' ? 'The class' : o.scope?.label} · {n.families} parents, {n.teachers} teachers</b><em>{fmtStamp(n.at)} by {n.byName}</em><em>{n.text}</em></div></li>)}</ul>
            </>
          ) : null}
          <h4 className="mdp-h">Log</h4>
          <ul className="mdd-list">{[...(o.log || [])].reverse().map((l) => <li key={`${l.at}${l.text}`}><div><b>{l.text}</b><em>{fmtStamp(l.at)} · {l.byName || 'Outbreak watch'}</em></div></li>)}</ul>
        </>
      ) : null}
      {mode === 'notice' ? (
        <>
          <Field label="To the families of"><Segmented value={v.audience} onChange={draft} label="Audience" options={audiences} /></Field>
          <Field label="The notice" required hint="Say what to watch for and what to do. Do not name or describe any child — the school refuses a notice with a child's name in it."><textarea className="md-textarea" rows={6} value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} maxLength={1500} /></Field>
          <Field label="In Hindi (optional)" optional hint="Families who read Hindi get this instead — or both, if the school sends both."><textarea data-text="any" className="md-textarea" rows={4} value={v.textHi} onChange={(e) => setV({ ...v, textHi: e.target.value })} maxLength={1500} placeholder="हिन्दी में सूचना" /></Field>
          <Note tone="indigo" icon="info">The class teachers of the sections it reaches get it too.</Note>
        </>
      ) : null}
      {mode === 'note' ? <Field label="Note" required><textarea className="md-textarea" rows={4} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={1500} autoFocus /></Field> : null}
      {mode === 'reported' ? (
        <div className="md-form__grid">
          <Field label="Reported to" required><input className="md-input" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} placeholder="e.g. District IDSP cell" maxLength={160} /></Field>
          <Field label="On"><input className="md-input" type="date" max={todayStr()} value={v.on} onChange={(e) => setV({ ...v, on: e.target.value })} /></Field>
          <Field label="Reference" optional><input className="md-input" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} maxLength={120} /></Field>
        </div>
      ) : null}
      {mode === 'close' ? <Field label="Why it is over" required><textarea className="md-textarea" rows={3} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={600} autoFocus /></Field> : null}
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

export default function MedicalOutbreaks() {
  const [q, setQ] = useQueryState({ tab: 'open', focus: '' });
  const r = useLoad(() => api.getOutbreaks({ tab: q.tab }), q.tab);
  const [openId, setOpenId] = useState(q.focus || null);
  const d = r.data;
  return (
    <Page>
      <PageHead icon="alertTri" tone="red" title="Outbreak Watch" subtitle="Several children with the same illness in one section, class or the school within a few days — from Medical Room visits, children kept off school and families' reports." />
      {d && !d.watching ? <Note tone="amber" icon="info">The outbreak watch is off — turn it on in Settings → Programmes.</Note> : null}
      <Panel pad={false}>
        <div className="md-listhead"><LineTabs items={(d?.tabs || []).map((t) => ({ key: t.key, label: t.label, count: t.count }))} value={d?.tab || q.tab} onChange={(v) => setQ({ tab: v })} /></div>
        {r.error && !d ? <LoadError error={r.error} onRetry={r.reload} /> : !d ? <Spin /> : d.rows.length ? (
          <ul className="mdpr-obs">
            {d.rows.map((o) => (
              <li key={o._id} className={o.status === 'confirmed' ? 'is-critical' : ''}>
                <button type="button" onClick={() => setOpenId(o._id)}>
                  <div><b>{o.label}</b><em>{o.number} · {o.scope?.label} · {o.caseCount} child{o.caseCount === 1 ? '' : 'ren'} · {fmtDay(o.firstDay)} – {fmtDay(o.lastDay)}</em></div>
                  <DayBars days={o.days} />
                  <Badge tone={o.tone} size="sm">{o.statusLabel}</Badge>
                </button>
              </li>
            ))}
          </ul>
        ) : <div style={{ padding: 16 }}><Empty compact title={q.tab === 'open' ? 'Nothing going round' : 'None'}>The watch looks every quarter of an hour.</Empty></div>}
      </Panel>
      {d?.rules ? (
        <Panel title="What the watch looks for" icon="info" tone="slate" sub="Change the numbers in Settings → Programmes.">
          <ul className="mdd-list">{d.rules.map((x) => <li key={x.key} className={x.off ? 'is-off' : ''}><div><b>{x.label}</b><em>{x.off ? 'Not watched' : `${x.cases} children in one ${x.scope === 'school' ? 'school' : x.scope} within ${x.days} day${x.days === 1 ? '' : 's'}`}</em></div></li>)}</ul>
        </Panel>
      ) : null}
      {openId ? <OutbreakDialog id={openId} onClose={() => { setOpenId(null); if (q.focus) setQ({ focus: '' }); }} onChanged={r.reload} /> : null}
    </Page>
  );
}
