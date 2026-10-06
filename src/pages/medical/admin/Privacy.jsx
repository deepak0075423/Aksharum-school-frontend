/**
 * Privacy & Records (Oct 2026).
 *
 *   Access review   who opened which medical records, for the school admins:
 *                   per member of staff, students, downloads, emergency
 *                   openings, the busiest hour, openings out of hours
 *   Data requests   a family asks for a copy, a correction or erasure — answered
 *                   within 30 days
 *   Retention       former students: past the school's retention period or not,
 *                   a legal hold, and a purge only a school admin may do,
 *                   typing the student's name to confirm
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Badge, Dialog, Field, Note, Empty, Spin, LoadError, LineTabs, Segmented, ConfirmDialog, useLoad } from '../mdUI';
import { fmtStamp, fmtDate, errorText } from '../mdMeta';
import { useAuth } from '../../../contexts/AuthContext';

function AccessReview() {
  const [days, setDays] = useState('30');
  const r = useLoad(() => api.getAccessReview({ days }), days);
  if (r.error && !r.data) return <LoadError error={r.error} onRetry={r.reload} />;
  if (!r.data) return <Spin />;
  return (
    <Panel pad={false} title="Who opened which records" icon="users" tone="indigo"
      sub={`An alert goes to the school admins when someone opens more than ${r.data.threshold} students' records in an hour.`}
      right={<Segmented value={days} onChange={setDays} label="Period" options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />}>
      {r.data.rows.length ? (
        <div className="mdc-readings" style={{ border: 0, borderRadius: 0 }}>
          <table>
            <thead><tr><th>Member of staff</th><th>Students</th><th>Records opened</th><th>Downloads</th><th>Emergency openings</th><th>Changes</th><th>Busiest hour</th><th>Out of hours</th><th>Last</th></tr></thead>
            <tbody>
              {r.data.rows.map((x) => (
                <tr key={x.actor}>
                  <td><b>{x.name}</b><em>{x.role === 'school_admin' ? 'School admin' : 'Teacher / nurse'}</em>{x.flags.length ? <em style={{ color: '#b91c1c' }}>{x.flags.join(' · ')}</em> : null}</td>
                  <td>{x.students}</td><td>{x.views}</td><td>{x.downloads}</td>
                  <td className={x.breakGlass ? 'is-warning' : ''}>{x.breakGlass}</td><td>{x.changes}</td>
                  <td className={x.busiestHour >= r.data.threshold ? 'is-critical' : ''}>{x.busiestHour}</td>
                  <td className={x.outOfHours >= 5 ? 'is-warning' : ''}>{x.outOfHours}</td>
                  <td>{fmtStamp(x.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div style={{ padding: 16 }}><Empty compact title="Nobody opened a medical record in this period" /></div>}
    </Panel>
  );
}

function DataRequests() {
  const [tab, setTab] = useState('open');
  const r = useLoad(() => api.getDataRequests({ status: tab }), tab);
  const [answer, setAnswer] = useState(null);
  const [status, setStatus] = useState('done');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { await api.respondDataRequest(answer._id, { status, response: text }); toast.success('Answered — the family has been told'); setAnswer(null); r.reload(); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Panel pad={false}>
      <div className="md-listhead"><LineTabs items={[{ key: 'open', label: 'Waiting' }, { key: 'done', label: 'Done' }, { key: 'refused', label: 'Refused' }, { key: 'all', label: 'All' }]} value={tab} onChange={setTab} /></div>
      <div className="md-panel__body">
        {r.loading && !r.data ? <Spin /> : (r.data || []).length ? (
          <ul className="mdd-list">
            {r.data.map((d) => (
              <li key={d._id}>
                <div><b>{d.kindLabel} — {d.studentName || 'a former student'}</b>
                  <em>{d.requestedByName} · {fmtStamp(d.createdAt)} · {d.status === 'open' ? `answer by ${fmtDate(d.dueOn)}` : `${d.status} ${fmtStamp(d.respondedAt)} by ${d.respondedByName}`}</em>
                  {d.details ? <em>“{d.details}”</em> : null}{d.response ? <em>Answer: {d.response}</em> : null}</div>
                {d.overdue ? <Badge tone="red" size="sm">Overdue</Badge> : null}
                {d.status === 'open' ? <Btn size="sm" kind="primary" onClick={() => { setAnswer(d); setStatus('done'); setText(''); }}>Answer</Btn> : <Badge tone={d.status === 'done' ? 'green' : 'slate'} size="sm">{d.status === 'done' ? 'Done' : 'Refused'}</Badge>}
              </li>
            ))}
          </ul>
        ) : <Empty compact title="No requests">A family can ask for a copy of the record, a correction or erasure from their app.</Empty>}
      </div>
      {answer ? (
        <Dialog open onClose={() => setAnswer(null)} title={`${answer.kindLabel} — ${answer.studentName}`} icon="shieldCheck" tone="indigo" width={560}
          footer={<><Btn onClick={() => setAnswer(null)} disabled={busy}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!text.trim()} onClick={send}>Send the answer</Btn></>}>
          {answer.kind === 'access' && answer.student ? <Note tone="indigo" icon="info">The family can download the health summary from their app; <button type="button" className="md-link" onClick={() => api.downloadPdf(api.healthSummaryUrl(answer.student), 'health-summary.pdf').catch((e) => toast.error(errorText(e)))}>download it here</button> to send it another way.</Note> : null}
          {answer.kind === 'erasure' ? <Note tone="amber" icon="alertTri">A current student&rsquo;s record, and anything the law or a safeguarding duty requires the school to keep, cannot be erased — say so in the answer. A former student&rsquo;s record is purged from Retention after the retention period.</Note> : null}
          <Field label="Outcome"><Segmented value={status} onChange={setStatus} label="Outcome" options={[{ value: 'done', label: 'Done' }, { value: 'refused', label: 'Not possible' }]} /></Field>
          <Field label="The answer the family will read" required><textarea className="md-textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} /></Field>
        </Dialog>
      ) : null}
    </Panel>
  );
}

function Retention({ isAdmin }) {
  const r = useLoad(() => api.getRetention(), 'retention');
  const [purging, setPurging] = useState(null);
  const [name, setName] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [holding, setHolding] = useState(null);
  const purge = async () => {
    setBusy(true);
    try { const out = await api.purgeMedRecord(purging._id, { confirmName: name, reason: why }); toast.success(`Purged — ${(out?.data ?? out).purged} rows, ${(out?.data ?? out).files} files`); setPurging(null); r.reload(); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  if (r.error && !r.data) return <LoadError error={r.error} onRetry={r.reload} />;
  if (!r.data) return <Spin />;
  return (
    <Panel pad={false} title="Former students" icon="archive" tone="slate" sub={`The school keeps a former student's medical record for ${r.data.years} years. Nothing is purged by itself.`}>
      <div className="md-panel__body">
        {r.data.rows.length ? (
          <ul className="mdd-list">
            {r.data.rows.map((x) => (
              <li key={x._id}>
                <div><b>{x.name}{x.admissionNumber ? ` (${x.admissionNumber})` : ''}</b><em>Left {fmtDate(x.leftOn)} · {x.visits} visit{x.visits === 1 ? '' : 's'} · {x.documents} document{x.documents === 1 ? '' : 's'}{x.legalHold ? ` · held: ${x.legalHoldReason}` : ''}</em></div>
                <Btn size="xs" onClick={() => api.downloadPdf(api.healthSummaryUrl(x._id), `health-summary-${x.name}.pdf`).catch((e) => toast.error(errorText(e)))}>Summary PDF</Btn>
                {isAdmin ? <Btn size="xs" onClick={() => setHolding(x)}>{x.legalHold ? 'Lift hold' : 'Legal hold'}</Btn> : null}
                {x.legalHold ? <Badge tone="amber" size="sm">On hold</Badge> : x.pastRetention ? (isAdmin ? <Btn size="sm" kind="danger" onClick={() => { setPurging(x); setName(''); setWhy(''); }}>Purge</Btn> : <Badge tone="red" size="sm">Past retention</Badge>) : <Badge tone="slate" size="sm">Kept</Badge>}
              </li>
            ))}
          </ul>
        ) : <Empty compact title="No former students with a medical record" />}
      </div>
      {purging ? (
        <Dialog open onClose={() => setPurging(null)} title={`Purge the record of ${purging.name}?`} icon="alertTri" tone="red" width={540}
          footer={<><Btn onClick={() => setPurging(null)} disabled={busy}>Cancel</Btn><Btn kind="danger-solid" busy={busy} disabled={name.trim().toLowerCase() !== purging.name.toLowerCase() || !why.trim()} onClick={purge}>Purge for good</Btn></>}>
          <Note tone="red" icon="alertTri">Every medical record of this former student — visits, medicines, allergies, documents and their files — is deleted and cannot be brought back. The audit trail keeps who did what and when, without the health details. A safeguarding record is not touched. Download the summary first if the school must keep one.</Note>
          <Field label={`Type ${purging.name} to confirm`} required><input className="md-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label="Why" required><input className="md-input" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} placeholder="e.g. Retention period over" /></Field>
        </Dialog>
      ) : null}
      <ConfirmDialog open={!!holding} onClose={() => setHolding(null)} title={holding?.legalHold ? 'Lift the legal hold?' : `Hold the record of ${holding?.name || ''}?`}
        message={holding?.legalHold ? 'The record may be purged again once past the retention period.' : 'A held record is never purged, whatever its age.'}
        reason={!holding?.legalHold} reasonLabel="Why" confirmLabel={holding?.legalHold ? 'Lift it' : 'Hold it'}
        onConfirm={async (reason) => { await api.setLegalHold(holding._id, { on: !holding.legalHold, reason }).catch((e) => { throw new Error(errorText(e)); }); toast.success('Saved'); setHolding(null); r.reload(); }} />
    </Panel>
  );
}

export default function MedicalPrivacy() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'school_admin';
  const [tab, setTab] = useState(isAdmin ? 'access' : 'requests');
  return (
    <Page>
      <PageHead icon="lock" tone="slate" title="Privacy & Records" subtitle="Who opened which medical records, the families' requests about their child's data, and former students' records — kept for the school's retention period, purged only by a school admin." />
      <LineTabs items={[...(isAdmin ? [{ key: 'access', label: 'Access review' }] : []), { key: 'requests', label: 'Data requests' }, { key: 'retention', label: 'Former students' }]} value={tab} onChange={setTab} />
      {tab === 'access' && isAdmin ? <AccessReview /> : null}
      {tab === 'requests' ? <DataRequests /> : null}
      {tab === 'retention' ? <Retention isAdmin={isAdmin} /> : null}
    </Page>
  );
}
