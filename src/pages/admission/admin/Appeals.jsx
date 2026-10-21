/**
 * Admissions → Appeals (Oct 2026): re-checks of results and appeals against
 * decisions, with the school's windows and answer time. Answering is for an
 * admission administrator, in writing; an upheld re-check corrects the marks
 * (recorded on the result with the appeal's number) and publishes them again,
 * an upheld appeal reopens the application. The staff note is never shown to
 * the family.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import {
  Page, Head, Panel, Btn, Chip, Table, Empty, ErrorBox, Spin, Dialog, Field, Input, TextArea, Select, Toggle, Note, KV, Tiles, Tile, useLoad,
} from '../admUI';
import { fmtDate, fmtDateTime, errMsg } from '../meta';
import { useAdmission, useQueryState, StaffSelect } from './parts';

const BASE = '/admin/admissions';
const STATUS = { open: ['Received', 'amber'], in_review: ['Being looked at', 'indigo'], upheld: ['Upheld', 'green'], not_upheld: ['Not upheld', 'gray'], withdrawn: ['Withdrawn', 'gray'] };
const KIND = { recheck: 'Re-check of a result', decision: 'Appeal against a decision' };

export default function Appeals() {
  const adm = useAdmission();
  const [q, setQ] = useQueryState({ status: 'waiting', kind: '' });
  const { data, meta, loading, error, reload } = useLoad(() => admin.appeals({ status: q.status === 'all' ? '' : q.status, kind: q.kind }), [q.status, q.kind]);
  const [open, setOpen] = useState(null);
  const t = meta?.totals || {};
  return (
    <Page>
      <Head eyebrow="Admissions" title="Appeals" subtitle="Re-checks of results and appeals against decisions — answered in writing by an administrator." />
      <AppealSettings a={adm.settings?.appeals || {}} onSaved={adm.reload} />
      <Tiles>
        <Tile icon="clock" tone="amber" label="Waiting for an answer" value={t.waiting ?? '—'} active={q.status === 'waiting'} onClick={() => setQ({ status: 'waiting' })} />
        <Tile icon="alert" tone="red" label="Past the answer date" value={t.overdue ?? '—'} />
        <Tile icon="checkCircle" tone="green" label="Upheld" value={t.upheld ?? '—'} active={q.status === 'upheld'} onClick={() => setQ({ status: 'upheld' })} />
        <Tile icon="closeCircle" tone="gray" label="Not upheld" value={t.notUpheld ?? '—'} active={q.status === 'not_upheld'} onClick={() => setQ({ status: 'not_upheld' })} />
      </Tiles>
      <Panel pad={false}>
        <div style={{ padding: '10px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Tabs variant="solid" size="sm" value={q.status} onChange={(v) => setQ({ status: v })} items={[{ key: 'waiting', label: 'Waiting' }, { key: 'upheld', label: 'Upheld' }, { key: 'not_upheld', label: 'Not upheld' }, { key: 'withdrawn', label: 'Withdrawn' }, { key: 'all', label: 'All' }]} />
          <Select value={q.kind} onChange={(e) => setQ({ kind: e.target.value })} aria-label="Kind" style={{ width: 'auto' }}>
            <option value="">Both kinds</option><option value="recheck">Re-checks</option><option value="decision">Decisions</option>
          </Select>
        </div>
        {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
          <Table rows={data || []} onRow={(r) => setOpen(r._id)} empty={<Empty icon="shieldCheck" title="No appeals here">Families can appeal once appeals are switched on above.</Empty>} columns={[
            { key: 'n', label: 'Appeal', render: (r) => <><b className="adm-num">{r.number}</b><div className="adm-muted" style={{ fontSize: '.74rem' }}>{fmtDateTime(r.createdAt)}</div></> },
            { key: 's', label: 'Application', render: (r) => <><Link to={`${BASE}/applications/${r.applicationId}`}><b>{r.studentName}</b></Link><div className="adm-muted adm-num" style={{ fontSize: '.74rem' }}>{r.applicationNumber}</div></> },
            { key: 'k', label: 'About', render: (r) => <>{KIND[r.kind]}{r.examName ? <div className="adm-muted" style={{ fontSize: '.74rem' }}>{r.examName}</div> : null}</> },
            { key: 'a', label: 'With', render: (r) => r.assigneeName || <span className="adm-muted">—</span> },
            { key: 'd', label: 'Answer by', render: (r) => (['open', 'in_review'].includes(r.status) ? <span style={{ color: r.overdue ? '#b91c1c' : undefined, fontWeight: r.overdue ? 700 : 400 }}>{fmtDate(r.dueAt)}{r.overdue ? ' — late' : ''}</span> : fmtDate(r.decidedAt)) },
            { key: 'st', label: '', render: (r) => <Chip tone={STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0]}</Chip> },
          ]} />
        )}
      </Panel>
      {open ? <AppealDialog id={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); }} /> : null}
    </Page>
  );
}

function AppealSettings({ a, onSaved }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const cur = f || a;
  const set = (patch) => setF({ ...cur, ...patch });
  const save = async () => {
    setBusy(true);
    try { await admin.saveSettings({ appeals: { ...cur, note: (cur.note || '').trim() } }); toast.success('Saved'); setF(null); onSaved?.(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Panel title="Appeals on the portal" icon="settings" right={f ? <Btn size="sm" kind="primary" busy={busy} onClick={save}>Save</Btn> : null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Toggle checked={!!cur.enabled} onChange={(x) => set({ enabled: x })} label="Families can appeal from their application page" sub="A re-check of a published result, or an appeal against a rejection or an ineligible decision" />
        <div className="adm-grid3">
          <Field label="Re-check: days after results" hint="0: not offered"><Input type="number" min="0" max="60" step="1" value={cur.recheckDays ?? 7} onChange={(e) => set({ recheckDays: Number(e.target.value) || 0 })} /></Field>
          <Field label="Decision: days after it" hint="0: not offered"><Input type="number" min="0" max="90" step="1" value={cur.decisionDays ?? 15} onChange={(e) => set({ decisionDays: Number(e.target.value) || 0 })} /></Field>
          <Field label="The school answers within (days)"><Input type="number" min="1" max="60" step="1" value={cur.answerDays ?? 10} onChange={(e) => set({ answerDays: Number(e.target.value) || 1 })} /></Field>
          <Field label="Appeals per application, at most"><Input type="number" min="1" max="10" step="1" value={cur.maxPerApplication ?? 3} onChange={(e) => set({ maxPerApplication: Number(e.target.value) || 1 })} /></Field>
        </div>
        <Field label="A note families read before appealing"><TextArea rows={2} maxLength={600} value={cur.note || ''} onChange={(e) => set({ note: e.target.value })} data-text="sentence" /></Field>
      </div>
    </Panel>
  );
}

function AppealDialog({ id, onClose, onDone }) {
  const { data: d, loading, error, reload } = useLoad(() => admin.appeal(id), [id]);
  const [f, setF] = useState({ outcome: '', decision: '', internalNote: '', reopenTo: '', marks: {} });
  const [busy, setBusy] = useState('');
  useEffect(() => { if (d?.result) setF((x) => ({ ...x, marks: { ...(d.result.marks || {}) } })); }, [d]);
  if (loading && !d) return <Dialog open onClose={onClose} title="Appeal"><Spin /></Dialog>;
  if (error && !d) return <Dialog open onClose={onClose} title="Appeal"><ErrorBox error={error} onRetry={reload} /></Dialog>;
  const a = d.appeal;
  const waiting = ['open', 'in_review'].includes(a.status);
  const assign = async (userId) => {
    setBusy('assign');
    try { await admin.assignAppeal(a._id, userId || null); toast.success('Assigned'); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const decide = async () => {
    setBusy('decide');
    try {
      await admin.decideAppeal(a._id, {
        outcome: f.outcome, decision: f.decision.trim(), internalNote: f.internalNote.trim(),
        ...(f.outcome === 'upheld' && a.kind === 'recheck' ? { marks: f.marks } : {}),
        ...(f.outcome === 'upheld' && a.kind === 'decision' ? { reopenTo: f.reopenTo } : {}),
      });
      toast.success('Answered — the family is told');
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const ready = f.outcome && f.decision.trim().length >= 10 && !(f.outcome === 'upheld' && a.kind === 'decision' && !f.reopenTo);
  return (
    <Dialog open onClose={onClose} title={`${a.number} — ${KIND[a.kind]}`} width={720}
      footer={waiting ? <><Btn onClick={onClose}>Close</Btn><Btn kind="primary" busy={busy === 'decide'} disabled={!ready} onClick={decide}>Send the answer</Btn></> : <Btn onClick={onClose}>Close</Btn>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <KV cols={3} items={[
          ['Application', <Link key="a" to={`${BASE}/applications/${d.application._id}`}>{d.application.studentName} · {d.application.applicationNumber}</Link>],
          ['Filed', fmtDateTime(a.createdAt)], [waiting ? 'Answer by' : 'Answered', fmtDate(waiting ? a.dueAt : a.decidedAt)],
        ]} />
        <Note tone="indigo" icon="userCircle">The family wrote: “{a.reason}”</Note>
        {d.exam && d.result ? (
          <Panel title={`${d.exam.name} — the result as it stands`} icon="fileCheck" pad={false}>
            <Table dense rowKey={(x) => x.key} rows={d.exam.subjects || []} columns={[
              { key: 's', label: 'Part', render: (x) => x.name },
              { key: 'm', label: 'Marks', render: (x) => `${d.result.marks?.[x.key] ?? '—'} / ${x.maxMarks}` },
              ...(waiting && f.outcome === 'upheld' ? [{ key: 'c', label: 'Corrected', render: (x) => <Input type="number" min="0" max={x.maxMarks} step="0.5" style={{ width: 90 }} value={f.marks[x.key] ?? ''} onChange={(e) => setF({ ...f, marks: { ...f.marks, [x.key]: e.target.value } })} aria-label={`Corrected ${x.name}`} /> }] : []),
            ]} />
            <div style={{ padding: '8px 14px', fontSize: '.84rem' }}>Total <b>{d.result.total}</b>{d.result.grade ? ` · grade ${d.result.grade}` : ''} · {d.result.passed ? 'qualified' : 'not qualified'}{(d.result.corrections || []).length ? ` · corrected ${(d.result.corrections || []).length} time(s) before` : ''}</div>
          </Panel>
        ) : null}
        {waiting ? (
          <>
            <Field label="Looked at by" hint="Optional — moves the appeal to “being looked at”">
              <StaffSelect value={a.assignedTo || ''} onChange={(v) => assign(v)} placeholder="Nobody yet" ariaLabel="Looked at by" />
            </Field>
            <Field label="The answer" required>
              <div className="adm-choices" role="radiogroup">
                {[['upheld', a.kind === 'recheck' ? 'Upheld — the marks change' : 'Upheld — reopen the application'], ['not_upheld', 'Not upheld — it stands']].map(([k, l]) => (
                  <label key={k} className={`adm-choice ${f.outcome === k ? 'is-on' : ''}`}><input type="radio" checked={f.outcome === k} onChange={() => setF({ ...f, outcome: k })} />{l}</label>
                ))}
              </div>
            </Field>
            {f.outcome === 'upheld' && a.kind === 'decision' ? (
              <Field label="Reopen the application at" required>
                <Select value={f.reopenTo} onChange={(e) => setF({ ...f, reopenTo: e.target.value })}>
                  <option value="">Choose a stage…</option>
                  {d.reopenTo.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </Select>
              </Field>
            ) : null}
            {f.outcome === 'upheld' && a.kind === 'recheck' ? <Note tone="amber" icon="info">The corrected marks are recorded on the result with this appeal&rsquo;s number, and published again to the family.</Note> : null}
            <Field label="What the family reads" required hint="Be specific — this is the school's written answer"><TextArea rows={3} maxLength={2000} value={f.decision} onChange={(e) => setF({ ...f, decision: e.target.value })} /></Field>
            <Field label="Staff note" hint="Kept in the application's history for staff only"><TextArea rows={2} maxLength={2000} value={f.internalNote} onChange={(e) => setF({ ...f, internalNote: e.target.value })} /></Field>
          </>
        ) : (
          <>
            <Note tone={a.status === 'upheld' ? 'green' : 'gray'} icon="info"><b>{STATUS[a.status]?.[0]}.</b> {a.decision}</Note>
            {a.internalNote ? <Note tone="gray" icon="lock">Staff note: {a.internalNote}</Note> : null}
            {a.outcome?.reopenedTo ? <p className="adm-muted" style={{ fontSize: '.84rem' }}>The application was reopened.</p> : null}
            {a.outcome?.after ? <p className="adm-muted" style={{ fontSize: '.84rem' }}>Total {a.outcome.before?.total} → {a.outcome.after?.total}.</p> : null}
          </>
        )}
      </div>
    </Dialog>
  );
}
