/**
 * Selection: merit lists (built from criteria the office writes down — the
 * weights over approved exam results and the tie-breakers — never from
 * anything hidden), and every offer made.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import {
  Page, Head, Panel, Btn, Chip, ListChip, OfferChip, FeeChip, Table, Toolbar, Select, Empty, ErrorBox, Spin, Dialog, Field, Input, TextArea,
  Toggle, Check, IconBtn, Note, Person, useLoad,
} from '../admUI';
import { fmtDate, fmtDateTime, errMsg, money, toLocalInput, OFFER_STATUS, LIST_METHOD } from '../meta';
import { useAdmission, useQueryState, RoundSelect, ClassSelect } from './parts';

const BASE = '/admin/admissions';
export const TIE_LABEL = {
  score_desc: 'Higher score first', dob_asc: 'Older student first', dob_desc: 'Younger student first',
  submitted_asc: 'Applied earlier first', name_asc: 'Name, A to Z',
};
const POOL_STATUSES = ['verified', 'eligible', 'exam_completed', 'interview_completed', 'evaluated', 'waitlisted', 'selected', 'offer_expired'];

export default function Selection() {
  const [q, setQ] = useQueryState({ tab: 'lists' });
  return (
    <Page>
      <Head eyebrow="Admissions" title="Selection" subtitle="Merit lists, waiting lists and the offers they make." />
      <Tabs variant="line" value={q.tab} onChange={(v) => setQ({ tab: v })} items={[{ key: 'lists', label: 'Lists' }, { key: 'offers', label: 'Offers' }]} />
      {q.tab === 'offers' ? <Offers /> : <Lists />}
    </Page>
  );
}

function Lists() {
  const nav = useNavigate();
  const [q, setQ] = useQueryState({ tab: 'lists', round: '', class: '' });
  const { data, loading, error, reload } = useLoad(() => admin.lists({ round: q.round, class: q.class }), [q.round, q.class]);
  const [creating, setCreating] = useState(false);
  return (
    <Panel pad={false}>
      <Toolbar>
        <RoundSelect value={q.round} onChange={(v) => setQ({ round: v, class: '' })} />
        <ClassSelect value={q.class} round={q.round} onChange={(v) => setQ({ class: v })} />
        <span style={{ flex: 1 }} />
        <Btn kind="primary" icon="plus" onClick={() => setCreating(true)}>New list</Btn>
      </Toolbar>
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <Table rows={data || []} onRow={(r) => nav(`${BASE}/selection/${r._id}`)}
          empty={<Empty icon="trophy" title="No lists yet" action={<Btn kind="primary" onClick={() => setCreating(true)}>Draft the first list</Btn>}>A list ranks a class's applications by the criteria you set. Nothing reaches families until it is approved and published.</Empty>}
          columns={[
            { key: 'name', label: 'List', render: (r) => <><b>{r.name}</b><div className="adm-muted" style={{ fontSize: '.76rem' }}>{r.roundName} · list {r.listNo} · {LIST_METHOD[r.method || 'merit']?.short}{r.draw ? ' · drawn' : ''}</div></> },
            { key: 'class', label: 'Class', render: (r) => r.className },
            { key: 'lines', label: 'Ranked', align: 'right', render: (r) => r.lines },
            { key: 'sel', label: 'Selected', align: 'right', render: (r) => r.selected },
            { key: 'wait', label: 'Waiting', align: 'right', render: (r) => r.waitlisted },
            { key: 'status', label: 'Status', render: (r) => <><ListChip status={r.status} />{r.publishAt && r.status === 'approved' ? <div className="adm-muted" style={{ fontSize: '.72rem' }}>publishes {fmtDateTime(r.publishAt)}</div> : null}</> },
            { key: 'pub', label: 'Published', render: (r) => (r.publishedAt ? fmtDate(r.publishedAt) : '—') },
          ]} />
      )}
      <ListDialog open={creating} onClose={() => setCreating(false)} round={q.round} cls={q.class} onDone={(id) => nav(`${BASE}/selection/${id}`)} />
    </Panel>
  );
}

/* ── Criteria ─────────────────────────────────────────────────────────────── */

/** The rules a list is built by. `exams`: the round's exams. */
export function CriteriaEditor({ c, setC, exams }) {
  const adm = useAdmission();
  const weights = c.weights || [];
  const ties = c.tieBreakers || [];
  const filters = c.filters || {};
  const statuses = filters.statuses || POOL_STATUSES;
  const setF = (k, v) => setC({ ...c, filters: { ...filters, statuses, [k]: v } });
  const tieOptions = [...Object.entries(TIE_LABEL), ...exams.map((e) => [`exam:${e._id}`, `Higher in ${e.name} first`])];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Score" hint={exams.length ? 'Each exam\'s approved result, weighted. Leave empty to rank by the tie-breakers alone.' : 'This round has no exams — the list is ranked by the tie-breakers.'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {weights.map((w, i) => {
            const [, id, measure] = w.source.split(':');
            return (
              <div key={i} className="adm-row" style={{ flexWrap: 'nowrap' }}>
                <Select value={id} aria-label="Exam" onChange={(e) => setC({ ...c, weights: weights.map((x, j) => (j === i ? { ...x, source: `exam:${e.target.value}${measure === 'raw' ? ':raw' : ''}` } : x)) })}>
                  {exams.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
                </Select>
                <Select value={measure === 'raw' ? 'raw' : 'pct'} style={{ width: 150 }} aria-label="Measure" onChange={(e) => setC({ ...c, weights: weights.map((x, j) => (j === i ? { ...x, source: `exam:${id}${e.target.value === 'raw' ? ':raw' : ''}` } : x)) })}>
                  <option value="pct">Percentage</option><option value="raw">Marks</option>
                </Select>
                <span className="adm-muted">×</span>
                <Input type="number" min="0" max="100" step="0.5" style={{ width: 90 }} value={w.weight} aria-label="Weight"
                  onChange={(e) => setC({ ...c, weights: weights.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)) })} />
                <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => setC({ ...c, weights: weights.filter((_, j) => j !== i) })} />
              </div>
            );
          })}
          {exams.length ? <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => setC({ ...c, weights: [...weights, { source: `exam:${exams[0]._id}`, weight: 1 }] })}>Add an exam to the score</Btn> : null}
        </div>
      </Field>
      <Field label="Tie-breakers" hint="In order — the first that separates two applicants decides. Empty: the school's default.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ties.map((t, i) => (
            <div key={i} className="adm-row" style={{ flexWrap: 'nowrap' }}>
              <span className="adm-muted" style={{ width: 18 }}>{i + 1}.</span>
              <Select value={t} onChange={(e) => setC({ ...c, tieBreakers: ties.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Tie-breaker ${i + 1}`}>
                {tieOptions.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
              <IconBtn icon="arrowUp" label="Earlier" disabled={i === 0} onClick={() => { const n = [...ties]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setC({ ...c, tieBreakers: n }); }} />
              <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => setC({ ...c, tieBreakers: ties.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} onClick={() => setC({ ...c, tieBreakers: [...ties, tieOptions.find(([k]) => !ties.includes(k))?.[0] || 'submitted_asc'] })}>Add a tie-breaker</Btn>
        </div>
      </Field>
      <Field label="Who is ranked" hint="Applications of the class in these statuses that hold no seat already">
        <div className="adm-choices">
          {POOL_STATUSES.map((s) => (
            <label key={s} className={`adm-choice ${statuses.includes(s) ? 'is-on' : ''}`}>
              <input type="checkbox" checked={statuses.includes(s)} onChange={(e) => setF('statuses', e.target.checked ? [...statuses, s] : statuses.filter((x) => x !== s))} />{adm.statusOf(s).label}
            </label>
          ))}
        </div>
      </Field>
      <div className="adm-grid3">
        <Toggle checked={!!filters.requirePass} onChange={(v) => setF('requirePass', v)} label="Only those who qualified" sub="Passed every weighted exam" />
        <Toggle checked={!!filters.requireDocsVerified} onChange={(v) => setF('requireDocsVerified', v)} label="Only with documents verified" />
        <Field label="Lowest score" hint="Empty: none"><Input type="number" min="0" step="0.5" value={filters.minScore ?? ''} onChange={(e) => setF('minScore', e.target.value === '' ? null : e.target.value)} /></Field>
      </div>
    </div>
  );
}

/* ── A lottery's pool and priority points ─────────────────────────────────── */

const POINT_OPS = [['eq', 'is'], ['neq', 'is not'], ['in', 'is one of'], ['checked', 'is ticked'], ['filled', 'is answered'], ['gte', 'is at least'], ['lte', 'is at most']];

/** Questions of the class's current application form that a points rule may read. */
export function useFormFields(roundId, classId) {
  const adm = useAdmission();
  const [fields, setFields] = useState([]);
  useEffect(() => {
    const r = adm.roundOf(roundId);
    const cls = (r?.classes || []).find((c) => String(c.class) === String(classId));
    const formId = cls?.form || r?.form;
    if (!formId) { setFields([]); return; }
    admin.form(formId).then((res) => {
      const schema = res.data?.current?.schema || { sections: [] };
      setFields((schema.sections || []).flatMap((sec) => (sec.fields || []).filter((f) => !['info', 'file'].includes(f.type))));
    }).catch(() => setFields([]));
  }, [roundId, classId]); // eslint-disable-line react-hooks/exhaustive-deps
  return fields;
}

export function LotteryCriteria({ c, setC, method, fields }) {
  const adm = useAdmission();
  const filters = c.filters || {};
  const statuses = filters.statuses || POOL_STATUSES;
  const setF = (k, v) => setC({ ...c, filters: { ...filters, statuses, [k]: v } });
  const points = c.points || [];
  const setP = (i, patch) => setC({ ...c, points: points.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const fieldOf = (key) => fields.find((f) => f.key === key);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {method === 'points_lottery' ? (
        <Field label="Priority points" hint="Each rule reads one answer of the application form. Applicants are drawn most points first; equal points by lot. Use only the priorities your state's rules allow — living near the school, a sibling already studying here.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {points.map((p, i) => {
              const f = fieldOf(p.field);
              const choices = Array.isArray(f?.options) ? f.options.map((o) => (typeof o === 'string' ? o : o.value)) : null;
              const needsValue = !['checked', 'filled'].includes(p.op);
              return (
                <div key={i} className="adm-row" style={{ flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 10, padding: 8 }}>
                  <Select value={p.field} aria-label={`Rule ${i + 1} question`} style={{ minWidth: 220, flex: '1 1 220px' }}
                    onChange={(e) => setP(i, { field: e.target.value, label: fieldOf(e.target.value)?.label || '', value: '' })}>
                    <option value="">Choose a question…</option>
                    {fields.map((x) => <option key={x.key} value={x.key}>{x.label || x.key}</option>)}
                  </Select>
                  <Select value={p.op} aria-label={`Rule ${i + 1} comparison`} style={{ width: 140 }} onChange={(e) => setP(i, { op: e.target.value })}>
                    {POINT_OPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </Select>
                  {needsValue ? (choices && ['eq', 'neq'].includes(p.op) ? (
                    <Select value={p.value || ''} aria-label={`Rule ${i + 1} answer`} style={{ width: 160 }} onChange={(e) => setP(i, { value: e.target.value })}>
                      <option value="">Choose…</option>
                      {choices.map((o) => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  ) : (
                    <Input value={Array.isArray(p.value) ? p.value.join(', ') : (p.value ?? '')} aria-label={`Rule ${i + 1} answer`} style={{ width: 160 }}
                      placeholder={p.op === 'in' ? 'Yes, Maybe' : 'Answer'} onChange={(e) => setP(i, { value: e.target.value })} />
                  )) : null}
                  <span className="adm-muted">→</span>
                  <Input type="number" min="1" max="100" step="1" value={p.points} aria-label={`Rule ${i + 1} points`} style={{ width: 80 }} onChange={(e) => setP(i, { points: e.target.value })} />
                  <span className="adm-muted">points</span>
                  <Input value={p.label || ''} aria-label={`Rule ${i + 1} name`} placeholder="Name shown on the draw" maxLength={80} style={{ flex: '1 1 200px' }} onChange={(e) => setP(i, { label: e.target.value })} />
                  <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => setC({ ...c, points: points.filter((_, j) => j !== i) })} />
                </div>
              );
            })}
            {points.length < 10 ? <Btn size="sm" kind="ghost" icon="plus" style={{ alignSelf: 'flex-start' }} disabled={!fields.length}
              onClick={() => setC({ ...c, points: [...points, { field: '', op: 'eq', value: '', points: 10, label: '' }] })}>Add a priority rule</Btn> : null}
            {!fields.length ? <span className="adm-muted" style={{ fontSize: '.82rem' }}>Choose the round and class first — the rules read that class&rsquo;s form.</span> : null}
          </div>
        </Field>
      ) : null}
      <Field label="Who is in the draw" hint="Applications of the class in these statuses that hold no seat already">
        <div className="adm-choices">
          {POOL_STATUSES.map((st) => (
            <label key={st} className={`adm-choice ${statuses.includes(st) ? 'is-on' : ''}`}>
              <input type="checkbox" checked={statuses.includes(st)} onChange={(e) => setF('statuses', e.target.checked ? [...statuses, st] : statuses.filter((x) => x !== st))} />{adm.statusOf(st).label}
            </label>
          ))}
        </div>
      </Field>
      <Toggle checked={!!filters.requireDocsVerified} onChange={(v) => setF('requireDocsVerified', v)} label="Only with documents verified" />
      <Note tone="indigo" icon="info">The order is made by the draw — no score, date or name decides it. The draw is made once, in front of witnesses if you like, and published so anyone can check it.</Note>
    </div>
  );
}

const cleanLottery = (c, method) => ({
  filters: { statuses: c.filters?.statuses || POOL_STATUSES, requireDocsVerified: !!c.filters?.requireDocsVerified },
  points: method === 'points_lottery' ? (c.points || []).map((p) => ({
    field: p.field, op: p.op, label: (p.label || '').trim(), points: Number(p.points) || 1,
    value: p.op === 'in' ? String(Array.isArray(p.value) ? p.value.join(',') : p.value || '').split(',').map((x) => x.trim()).filter(Boolean) : p.value,
  })) : [],
});

const cleanCriteria = (c) => ({
  weights: (c.weights || []).map((w) => ({ source: w.source, weight: Number(w.weight) || 0 })),
  tieBreakers: c.tieBreakers || [],
  filters: { ...(c.filters || {}), statuses: c.filters?.statuses || POOL_STATUSES, minScore: c.filters?.minScore === '' || c.filters?.minScore == null ? null : Number(c.filters.minScore) },
});

/** Create a list, or edit a draft one. */
export function ListDialog({ open, onClose, list, round, cls, onDone }) {
  const adm = useAdmission();
  const isNew = !list;
  const [f, setF] = useState({});
  const [exams, setExams] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const vis = list?.visibility || adm.settings.selection.visibility || {};
    const startClass = String(list?.class || cls || '');
    setF({
      round: String(list?.round || round || ''), class: startClass, name: list?.name || '', kind: list?.kind || 'merit',
      method: list?.method || (adm.screening?.[startClass]?.banned ? 'lottery' : 'merit'), quota: list?.quota || '',
      seats: list?.seats ?? 0, waitlistSize: list?.waitlistSize ?? 0,
      acceptanceDeadline: toLocalInput(list?.acceptanceDeadline), paymentDeadline: toLocalInput(list?.paymentDeadline),
      visibility: { showRank: !!vis.showRank, showScore: !!vis.showScore, showNames: !!vis.showNames }, notes: list?.notes || '',
      criteria: list?.criteria || { weights: [], tieBreakers: [], filters: { statuses: POOL_STATUSES } },
    });
  }, [open, list, round, cls]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !f.round) { setExams([]); return; }
    admin.exams({ round: f.round }).then((r) => setExams((r.data || []).filter((e) => e.status !== 'cancelled'))).catch(() => setExams([]));
  }, [open, f.round]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const method = f.method || 'merit';
  const lotteryList = method !== 'merit';
  const barred = !!adm.screening?.[f.class]?.banned;
  const fields = useFormFields(f.round, f.class);
  const drawn = !!list?.draw;
  const go = async () => {
    setBusy(true);
    const body = {
      name: f.name.trim(), kind: f.kind, seats: Number(f.seats) || 0, waitlistSize: Number(f.waitlistSize) || 0,
      acceptanceDeadline: f.acceptanceDeadline ? new Date(f.acceptanceDeadline).toISOString() : null,
      paymentDeadline: f.paymentDeadline ? new Date(f.paymentDeadline).toISOString() : null,
      visibility: f.visibility, notes: f.notes.trim(),
      ...(drawn ? {} : { criteria: lotteryList ? cleanLottery(f.criteria, method) : cleanCriteria(f.criteria) }),
    };
    if (drawn) { delete body.seats; delete body.waitlistSize; }
    try {
      if (isNew) {
        const r = await admin.createList({ ...body, round: f.round, class: f.class, method, quota: f.quota || '' });
        toast.success(lotteryList ? `Drafted — ${r.data.built.pool} in the draw` : `Drafted — ${r.data.built.selected} selected, ${r.data.built.waitlisted} waiting`);
        onClose();
        onDone(r.data.list._id);
      } else {
        const r = await admin.updateList(list._id, body);
        toast.success(!r.data.built ? 'Saved' : lotteryList ? `Saved — ${r.data.built.pool} in the draw` : `Rebuilt — ${r.data.built.selected} selected, ${r.data.built.waitlisted} waiting`);
        onClose();
        onDone(list._id);
      }
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  // The form is filled by the effect above, one render after opening.
  if (!open || !f.criteria) return null;
  return (
    <Dialog open={open} onClose={onClose} title={isNew ? 'Draft a list' : `Edit ${list.name}`} width={780}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!f.round || !f.class || (barred && method === 'merit')} onClick={go}>{isNew ? 'Draft list' : drawn ? 'Save' : lotteryList ? 'Save' : 'Save and rebuild'}</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="adm-grid3">
          <Field label="Round" required><RoundSelect value={f.round} all="Choose a round" disabled={!isNew} onChange={(v) => setF((x) => ({ ...x, round: v, class: '' }))} /></Field>
          <Field label="Class" required><ClassSelect value={f.class} round={f.round} all="Choose a class" disabled={!isNew}
            onChange={(v) => setF((x) => ({ ...x, class: v, method: adm.screening?.[v]?.banned && (x.method || 'merit') === 'merit' ? 'lottery' : x.method }))} /></Field>
          <Field label="Seats from" hint="A quota's list ranks only applications whose claim to it is verified">
            <Select value={f.quota || ''} disabled={!isNew} onChange={(e) => set('quota', e.target.value)}>
              <option value="">General seats</option>
              {((adm.roundOf(f.round)?.classes || []).find((c) => String(c.class) === String(f.class))?.quotas || []).map((q) => <option key={q.key} value={q.key}>{q.name} quota ({q.seats} seats)</option>)}
            </Select>
          </Field>
          <Field label="How applicants are chosen" required>
            <Select value={method} disabled={!isNew} onChange={(e) => set('method', e.target.value)}>
              {Object.entries(LIST_METHOD).map(([k, m]) => <option key={k} value={k} disabled={k === 'merit' && barred}>{m.label}{k === 'merit' && barred ? ' — not for this class (RTE)' : ''}</option>)}
            </Select>
          </Field>
          <Field label="Name" hint="Empty: First List, Second List…"><Input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} data-text="title" /></Field>
          {!lotteryList ? <Field label="Kind"><Select value={f.kind} onChange={(e) => set('kind', e.target.value)} disabled={!isNew}><option value="merit">Merit list</option><option value="waiting">Waiting list</option><option value="final">Final list</option></Select></Field> : null}
          <Field label="Seats to fill" hint={drawn ? 'Fixed by the draw' : '0: every seat still free in the class'}><Input type="number" min="0" step="1" value={f.seats} disabled={drawn} onChange={(e) => set('seats', e.target.value)} /></Field>
          <Field label="Waiting list places"><Input type="number" min="0" step="1" value={f.waitlistSize} disabled={drawn} onChange={(e) => set('waitlistSize', e.target.value)} /></Field>
        </div>
        {barred ? <Note tone="amber" icon="shieldCheck">{adm.screening[f.class].why}: the RTE Act allows only a random draw to choose between applicants — a lottery, or points your state allows and then a lottery.</Note> : null}
        {drawn ? <Note tone="gray" icon="lock">The draw has been made. Who was in it, the seats and the waiting places are final.</Note>
          : lotteryList ? <LotteryCriteria c={f.criteria} setC={(c) => set('criteria', c)} method={method} fields={fields} />
            : <CriteriaEditor c={f.criteria} setC={(c) => set('criteria', c)} exams={exams} />}
        <div className="adm-grid2">
          <Field label="Families respond by" hint="Empty: the school's offer validity"><Input type="datetime-local" value={f.acceptanceDeadline} onChange={(e) => set('acceptanceDeadline', e.target.value)} /></Field>
          <Field label="Admission fee due by" hint="Empty: the round's due days"><Input type="datetime-local" value={f.paymentDeadline} onChange={(e) => set('paymentDeadline', e.target.value)} /></Field>
        </div>
        {lotteryList ? <Note tone="gray" icon="eye">Families see their own draw number and, once published, the whole draw record — application numbers and points only, never names.</Note> : null}
        <Field label="What families see of the published list">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {!lotteryList ? <Check checked={f.visibility?.showRank} onChange={(v) => set('visibility', { ...f.visibility, showRank: v })}>Their rank</Check> : null}
            <Check checked={f.visibility?.showScore} onChange={(v) => set('visibility', { ...f.visibility, showScore: v })}>Their score</Check>
            <Check checked={f.visibility?.showNames} onChange={(v) => set('visibility', { ...f.visibility, showNames: v })}>Other selected names</Check>
          </div>
        </Field>
        <Field label="Notes (staff only)"><TextArea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={1000} /></Field>
      </div>
    </Dialog>
  );
}

/* ── Offers ───────────────────────────────────────────────────────────────── */

function Offers() {
  const [q, setQ] = useQueryState({ tab: 'offers', status: '', round: '' });
  const { data, loading, error, reload } = useLoad(() => admin.offers({ status: q.status, round: q.round }), [q.status, q.round]);
  return (
    <Panel pad={false}>
      <Toolbar>
        <Select value={q.status} onChange={(e) => setQ({ status: e.target.value })} aria-label="Status">
          <option value="">Every offer</option>
          {Object.entries(OFFER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <RoundSelect value={q.round} onChange={(v) => setQ({ round: v })} />
      </Toolbar>
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <Table rows={data || []} empty={<Empty icon="mail" title="No offers yet">Offers are made when a list is published, or by hand from an application.</Empty>}
          columns={[
            { key: 'n', label: 'Offer', render: (o) => <span className="adm-num">{o.offerNumber}</span> },
            { key: 's', label: 'Student', render: (o) => <Person name={o.studentName} sub={`${o.applicationNumber} · ${o.className || ''}`} to={`${BASE}/applications/${o.application}`} /> },
            { key: 'l', label: 'From', render: (o) => o.listName || 'Made by hand' },
            { key: 'st', label: 'Status', render: (o) => <OfferChip status={o.status} /> },
            { key: 'by', label: 'Respond by', render: (o) => (o.status === 'issued' ? fmtDateTime(o.respondBy) : o.respondedAt ? `Answered ${fmtDate(o.respondedAt)}` : '—') },
            { key: 'fee', label: 'Admission fee', render: (o) => <>{money(o.feeAmount)} {o.feeAmount > 0 ? <FeeChip status={o.admissionFeeStatus} /> : null}</> },
          ]} />
      )}
      {data?.length >= 500 ? <Note tone="gray" icon="info">The newest 500 offers are shown — choose a round to narrow them down.</Note> : null}
      <div style={{ padding: '10px 18px' }}><Link to={`${BASE}/applications?status=offer_issued`}>Applications with an open offer</Link></div>
    </Panel>
  );
}
