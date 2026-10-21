/**
 * On the family's application page: asking the school to look again (Oct 2026)
 * — a re-check of a published result, or an appeal against a decision — and
 * the answers. The windows and the number allowed are the school's, checked by
 * the server (school-backend services/admission/appeals.js).
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { portal as api } from '../../../api/admission.api';
import { useLoad, Panel, Btn, Chip, Note, Dialog, Field, Select, TextArea } from '../admUI';
import { fmtDate, errMsg } from '../meta';

const STATUS = { open: ['Received', 'amber'], in_review: ['Being looked at', 'indigo'], upheld: ['Upheld', 'green'], not_upheld: ['Not upheld', 'gray'], withdrawn: ['Withdrawn', 'gray'] };
const KIND = { recheck: 'Re-check of a result', decision: 'Appeal against the decision' };

export default function Appeals({ appId, onChanged }) {
  const { data, reload } = useLoad(() => api.appeals(appId), [appId]);
  const [asking, setAsking] = useState(null);   // 'recheck' | 'decision'
  if (!data) return null;
  const o = data.options;
  const can = o.enabled && o.left > 0 && (o.recheck.length || o.decision);
  if (!can && !data.appeals.length) return null;
  const withdraw = async (a) => {
    if (!window.confirm(`Withdraw appeal ${a.number}?`)) return;
    try { await api.withdrawAppeal(appId, a._id); toast.success('Withdrawn'); reload(); onChanged?.(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Panel title="Ask the school to look again" icon="shieldCheck" tone="amber">
      {o.note ? <p className="adm-muted" style={{ fontSize: '.86rem', marginTop: 0 }}>{o.note}</p> : null}
      {can ? (
        <div className="adm-row" style={{ marginBottom: data.appeals.length ? 12 : 0 }}>
          {o.recheck.length ? <Btn size="sm" icon="repeat" onClick={() => setAsking('recheck')}>Ask for a re-check of a result</Btn> : null}
          {o.decision ? <Btn size="sm" icon="send" onClick={() => setAsking('decision')}>Appeal the decision ({o.decision.label.toLowerCase()})</Btn> : null}
        </div>
      ) : null}
      <div className="adm-doclist">
        {data.appeals.map((a) => (
          <div key={a._id} className="adm-panel" style={{ padding: 12, boxShadow: 'none' }}>
            <div className="adm-row adm-row--between">
              <div><b className="adm-num">{a.number}</b> · {KIND[a.kind]}{a.examName ? ` — ${a.examName}` : ''}</div>
              <Chip tone={STATUS[a.status]?.[1]}>{STATUS[a.status]?.[0]}</Chip>
            </div>
            <p className="adm-muted" style={{ fontSize: '.84rem', margin: '6px 0 0' }}>You wrote: “{a.reason}”</p>
            {a.decision ? <Note tone={a.status === 'upheld' ? 'green' : 'gray'} icon="info">The school&rsquo;s answer ({fmtDate(a.decidedAt)}): {a.decision}</Note>
              : ['open', 'in_review'].includes(a.status) ? <p className="adm-muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>The school answers by {fmtDate(a.dueAt)}.{a.status === 'open' ? <> <button type="button" className="adm-linkbtn" onClick={() => withdraw(a)}>Withdraw</button></> : null}</p> : null}
          </div>
        ))}
      </div>
      {asking ? <AskDialog kind={asking} options={o} appId={appId} onClose={() => setAsking(null)} onDone={() => { setAsking(null); reload(); onChanged?.(); }} /> : null}
    </Panel>
  );
}

function AskDialog({ kind, options, appId, onClose, onDone }) {
  const [examId, setExamId] = useState(options.recheck[0]?.examId || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const until = kind === 'recheck' ? options.recheck.find((x) => x.examId === examId)?.until : options.decision?.until;
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.fileAppeal(appId, { kind, examId: kind === 'recheck' ? examId : undefined, reason: reason.trim() });
      toast.success(`Sent — number ${r.data.number}`);
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={kind === 'recheck' ? 'Ask for a re-check' : 'Appeal the decision'} width={560}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={reason.trim().length < 10 || (kind === 'recheck' && !examId)} onClick={go}>Send</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {kind === 'recheck' ? (
          <Field label="Which result" required>
            <Select value={examId} onChange={(e) => setExamId(e.target.value)}>
              {options.recheck.map((x) => <option key={x.examId} value={x.examId}>{x.name}</option>)}
            </Select>
          </Field>
        ) : <Note tone="indigo" icon="info">You are asking the school to look again at its decision: <b>{options.decision.label}</b>.</Note>}
        <Field label="Why" required hint={`Say what you think is wrong. The school answers in writing within ${options.answerDays} days.`}>
          <TextArea rows={4} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {until ? <p className="adm-muted" style={{ fontSize: '.8rem', margin: 0 }}>This can be asked until {fmtDate(until)}.</p> : null}
      </div>
    </Dialog>
  );
}
