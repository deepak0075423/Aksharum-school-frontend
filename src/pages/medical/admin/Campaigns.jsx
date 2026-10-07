/**
 * Health Programmes → Campaigns (Oct 2026): deworming days, vitamin A rounds,
 * vaccination drives, screening camps — planned, announced to the families,
 * marked on the day and closed with their coverage. One campaign's roster is
 * CampaignDetail.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Badge, Table, Empty, Spin, LoadError, LineTabs, Dialog, Field, Note, Segmented, Chips, useLoad, useQueryState } from '../mdUI';
import { fmtDay, errorText, todayStr } from '../mdMeta';
import { useMeta } from './mdForms';

export const CAMPAIGN_KIND = {
  deworming: { label: 'Deworming day', medicine: 'Albendazole 400 mg (chewable)', gives: true },
  vitamin_a: { label: 'Vitamin A round', medicine: 'Vitamin A solution', gives: true },
  iron: { label: 'Iron & folic acid (WIFS)', medicine: 'Iron & folic acid tablet', gives: true },
  vaccination: { label: 'Vaccination drive', gives: true },
  screening: { label: 'Health screening' }, dental: { label: 'Dental camp' }, eye: { label: 'Eye camp' }, awareness: { label: 'Health talk' }, other: { label: 'Other' },
};
const CONSENT = [
  { value: 'opt_out', label: 'Unless the family says no', hint: 'Families are told and can say no.' },
  { value: 'opt_in', label: 'Only with a yes', hint: 'A child takes part only when the family says yes.' },
  { value: 'none', label: 'Just tell them', hint: 'Families are told; nothing is asked.' },
];

/** Plan a campaign, or change one. */
export function CampaignDialog({ campaign, onClose, onSaved }) {
  const { meta } = useMeta();
  const c = campaign || {};
  const aud = c.audience || {};
  const [v, setV] = useState({
    title: c.title || '', kind: c.kind || 'deworming', medicine: c.medicine || CAMPAIGN_KIND[c.kind || 'deworming'].medicine || '',
    vaccine: c.vaccine || '', dose: c.dose || '', lotNumber: c.lotNumber || '', about: c.about || '',
    who: aud.all ? 'all' : (aud.sections || []).length ? 'sections' : 'classes', classes: aud.classes || [], sections: aud.sections || [],
    startOn: c.startOn ? String(c.startOn).slice(0, 10) : todayStr(), endOn: c.endOn ? String(c.endOn).slice(0, 10) : '', mopUpOn: c.mopUpOn ? String(c.mopUpOn).slice(0, 10) : '',
    consent: c.consent || 'opt_out', consentBy: c.consentBy ? String(c.consentBy).slice(0, 10) : '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const announced = c.status === 'announced';
  const k = CAMPAIGN_KIND[v.kind] || {};
  const classes = meta?.classes || [];
  const pick = (key, id) => setV((x) => ({ ...x, [key]: x[key].includes(id) ? x[key].filter((y) => y !== id) : [...x[key], id] }));
  const save = async () => {
    setBusy(true); setErr('');
    const body = {
      title: v.title, kind: v.kind, medicine: v.medicine, vaccine: v.vaccine, dose: v.dose, lotNumber: v.lotNumber, about: v.about,
      audience: v.who === 'all' ? { all: true } : v.who === 'classes' ? { classes: v.classes } : { sections: v.sections },
      startOn: v.startOn, endOn: v.endOn, mopUpOn: v.mopUpOn, consent: k.gives ? v.consent : 'none', consentBy: v.consentBy,
    };
    try {
      const res = c._id ? await api.updateCampaign(c._id, body) : await api.createCampaign(body);
      toast.success(c._id ? 'Campaign saved' : 'Campaign planned — announce it when it is ready'); onSaved?.(res?.data ?? res);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={c._id ? `Change ${c.title}` : 'Plan a health campaign'} icon="megaphone" tone="teal" width={680}
      footer={<><Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={save}>{c._id ? 'Save' : 'Plan it'}</Btn></>}>
      <div className="md-form__grid">
        <Field label="Kind" required>
          <select className="md-input" value={v.kind} disabled={announced} onChange={(e) => setV({ ...v, kind: e.target.value, medicine: CAMPAIGN_KIND[e.target.value].medicine || '', consent: CAMPAIGN_KIND[e.target.value].gives ? v.consent : 'none' })}>
            {Object.entries(CAMPAIGN_KIND).map(([key, x]) => <option key={key} value={key}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Name" required><input data-text="title" className="md-input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder={k.label === 'Other' ? 'e.g. Hand-washing week' : `e.g. ${k.label}, ${new Date().toLocaleString('en-IN', { month: 'long' })}`} maxLength={120} /></Field>
        {v.kind === 'vaccination' ? (
          <>
            <Field label="Vaccine" required><select className="md-input" value={v.vaccine} onChange={(e) => setV({ ...v, vaccine: e.target.value })}><option value="">Choose…</option>{(meta?.settings?.vaccines || []).map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
            <Field label="Dose" optional><input data-text="title" className="md-input" value={v.dose} onChange={(e) => setV({ ...v, dose: e.target.value })} placeholder="e.g. Booster" maxLength={40} /></Field>
            <Field label="Lot / batch number" optional><input data-text="code" className="md-input" value={v.lotNumber} onChange={(e) => setV({ ...v, lotNumber: e.target.value })} maxLength={60} /></Field>
          </>
        ) : k.gives ? <Field label="What is given" required className="is-wide"><input data-text="title" className="md-input" value={v.medicine} onChange={(e) => setV({ ...v, medicine: e.target.value })} maxLength={160} /></Field> : null}
        <Field label="Day" required><input className="md-input" type="date" value={v.startOn} onChange={(e) => setV({ ...v, startOn: e.target.value })} /></Field>
        <Field label="Last day" optional hint="For a campaign over several days"><input className="md-input" type="date" min={v.startOn} value={v.endOn} onChange={(e) => setV({ ...v, endOn: e.target.value })} /></Field>
        <Field label="Mop-up day" optional hint="For the children who were away"><input className="md-input" type="date" min={v.endOn || v.startOn} value={v.mopUpOn} onChange={(e) => setV({ ...v, mopUpOn: e.target.value })} /></Field>
      </div>
      <Field label="Who takes part" required>
        <Segmented value={v.who} onChange={(x) => setV({ ...v, who: x })} label="Who takes part" options={[{ value: 'all', label: 'Whole school' }, { value: 'classes', label: 'Classes' }, { value: 'sections', label: 'Sections' }]} />
      </Field>
      {v.who === 'classes' ? <Chips multi options={classes.map((x) => ({ value: x._id, label: x.className }))} value={v.classes} onPick={(id) => pick('classes', id)} /> : null}
      {v.who === 'sections' ? <Chips multi options={classes.flatMap((x) => (x.sections || []).map((s) => ({ value: s._id, label: `${x.className} – ${s.sectionName}` })))} value={v.sections} onPick={(id) => pick('sections', id)} /> : null}
      {k.gives ? (
        <>
          <Field label="Families' answer">
            <Segmented value={v.consent} onChange={(x) => !announced && setV({ ...v, consent: x })} label="Families' answer" options={CONSENT.map(({ value, label }) => ({ value, label }))} />
          </Field>
          <p className="md-muted" style={{ margin: '-6px 0 8px' }}>{CONSENT.find((x) => x.value === v.consent)?.hint}{announced ? ' It cannot change after the families were told.' : ''}</p>
          {v.consent !== 'none' ? <Field label="Answers by" optional hint="Leave empty to take answers until the day"><input className="md-input" type="date" max={v.startOn} value={v.consentBy} onChange={(e) => setV({ ...v, consentBy: e.target.value })} style={{ maxWidth: 200 }} /></Field> : null}
        </>
      ) : null}
      <Field label="What the families are told" optional hint="Why, and anything they should do — e.g. 'One chewable tablet after lunch; please make sure your child eats breakfast.'"><textarea className="md-textarea" rows={3} value={v.about} onChange={(e) => setV({ ...v, about: e.target.value })} maxLength={1500} /></Field>
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

export default function MedicalCampaigns() {
  const nav = useNavigate();
  const [q, setQ] = useQueryState({ tab: 'active' });
  const r = useLoad(() => api.getCampaigns(q), q);
  const [plan, setPlan] = useState(false);
  const d = r.data;
  return (
    <Page>
      <PageHead icon="megaphone" tone="teal" title="Health Campaigns" subtitle="Deworming days, vitamin A rounds, vaccination drives and screening camps — the families told first, the roster marked on the day, the coverage at the end.">
        <Btn kind="primary" icon="plus" onClick={() => setPlan(true)}>Plan a campaign</Btn>
      </PageHead>
      <Panel pad={false}>
        <div className="md-listhead"><LineTabs items={(d?.tabs || []).map((t) => ({ key: t.key, label: t.label, count: t.count }))} value={d?.tab || q.tab} onChange={(v) => setQ({ tab: v })} /></div>
        {r.error && !d ? <LoadError error={r.error} onRetry={r.reload} /> : !d ? <Spin /> : (
          <Table rows={d.rows} minWidth={860} onRow={(x) => nav(`/admin/medical/programmes/campaigns/${x._id}`)}
            columns={[
              { key: 'title', label: 'Campaign', primary: true, render: (x) => <span className="md-two"><b>{x.title}</b><em>{x.number} · {x.kindLabel}{x.what && x.what !== x.kindLabel ? ` · ${x.what}` : ''}</em></span> },
              { key: 'when', label: 'When', render: (x) => <span className="md-two"><b>{fmtDay(x.startOn)}{x.endOn ? ` – ${fmtDay(x.endOn)}` : ''}</b><em>{x.mopUpOn ? `Mop-up ${fmtDay(x.mopUpOn)}` : ''}</em></span> },
              { key: 'students', label: 'Students', render: (x) => (x.status === 'draft' ? <span className="md-none">—</span> : x.students) },
              { key: 'progress', label: 'Progress', render: (x) => (x.status === 'draft' ? <span className="md-none">Not announced</span> : <span className="md-two"><b>{x.given} {x.doneLabel.toLowerCase()}</b><em>{[x.absent ? `${x.absent} absent` : '', x.declined ? `${x.declined} said no` : '', x.consent !== 'none' && x.unanswered ? `${x.unanswered} not answered` : ''].filter(Boolean).join(' · ')}</em></span>) },
              { key: 'phase', label: 'Status', render: (x) => <Badge tone={x.tone} size="sm">{x.phaseLabel}</Badge> },
            ]}
            empty={<Empty compact title="No campaigns here">Plan one — it stays a draft until you announce it to the families.</Empty>} />
        )}
      </Panel>
      {plan ? <CampaignDialog onClose={() => setPlan(false)} onSaved={(c) => { setPlan(false); nav(`/admin/medical/programmes/campaigns/${c._id}`); }} /> : null}
    </Page>
  );
}
