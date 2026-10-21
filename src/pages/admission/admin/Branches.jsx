/**
 * Admissions → Branches (Oct 2026): the group of schools this school belongs
 * to (set up by the platform), whether it is listed on the group page, and
 * applications moved between branches — offered by one, accepted or declined
 * by the other (school-backend services/admission/groups.js).
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import { Page, Head, Panel, Btn, Chip, Table, Empty, ErrorBox, Spin, Dialog, Field, Select, TextArea, Toggle, Note, useLoad } from '../admUI';
import { fmtDateTime, errMsg } from '../meta';
import { useAdmission } from './parts';

const BASE = '/admin/admissions';
const STATUS = { pending: ['Waiting for an answer', 'amber'], accepted: ['Accepted — the family finishes it', 'indigo'], completed: ['Moved', 'green'], declined: ['Declined', 'gray'], cancelled: ['Taken back', 'gray'] };

export default function Branches() {
  const { data: g, loading, error, reload } = useLoad(() => admin.myGroup(), []);
  const t = useLoad(() => admin.transfers(), []);
  const [deciding, setDeciding] = useState(null);
  if (loading && !g) return <Spin />;
  if (error && !g) return <ErrorBox error={error} onRetry={reload} />;
  const setListed = async (v) => {
    try { await admin.groupListing(v); toast.success(v ? 'Listed on the group page' : 'Taken off the group page'); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const cancel = async (x) => {
    try { await admin.cancelTransfer(x._id); toast.success('Taken back'); t.reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Page>
      <Head eyebrow="Admissions" title="Branches" subtitle="The schools of your group, and applications moved between them." />
      {!g?.name ? (
        <Note tone="gray" icon="info">This school is not part of a group. Groups — schools of one trust or chain on one page for families — are set up by the platform; ask Aksharum support.</Note>
      ) : (
        <>
          <Panel title={g.name} icon="layers" sub={`app.aksharum.com/g/${g.slug}`} right={<a className="btn btn-secondary btn-sm" href={`/g/${g.slug}`} target="_blank" rel="noreferrer">Open the group page</a>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Toggle checked={g.listed} onChange={setListed} label="List this school on the group page" sub="Only when its admission portal is open or closed — never in maintenance" />
              <div className="adm-row" style={{ gap: 6 }}>Other branches: {g.branches.map((b) => <Chip key={b._id} tone="indigo">{b.name}</Chip>)}</div>
              {g.shareStatus ? <Note tone="amber" icon="shieldCheck">Branches of this group see the status of the same family&rsquo;s applications at each other — say so in your privacy notice (Settings → Portal).</Note> : null}
            </div>
          </Panel>
          <Panel title="Moves between branches" icon="repeat" pad={false} sub="Offer a move from an application's page (“Move to another branch…”), at the family's request.">
            {t.loading && !t.data ? <Spin /> : (
              <Table rows={t.data || []} empty={<Empty compact icon="repeat" title="No moves yet" />} columns={[
                { key: 'd', label: '', render: (x) => <Chip tone={x.direction === 'in' ? 'indigo' : 'gray'}>{x.direction === 'in' ? 'Coming in' : 'Going out'}</Chip> },
                { key: 'a', label: 'Application', render: (x) => <><b>{x.studentName}</b><div className="adm-muted adm-num" style={{ fontSize: '.74rem' }}>{x.applicationNumber} · {x.className}</div></> },
                { key: 'w', label: 'Branch', render: (x) => (x.direction === 'in' ? `From ${x.fromSchoolName}` : `To ${x.toSchoolName}`) },
                { key: 'r', label: 'Why', render: (x) => <>{x.reason}{x.answer ? <div className="adm-muted" style={{ fontSize: '.74rem' }}>Answer: {x.answer}</div> : null}</> },
                { key: 's', label: 'Status', render: (x) => <><Chip tone={STATUS[x.status]?.[1]}>{STATUS[x.status]?.[0]}</Chip><div className="adm-muted" style={{ fontSize: '.72rem' }}>{fmtDateTime(x.decidedAt || x.createdAt)}</div></> },
                { key: 'x', label: '', render: (x) => (x.status === 'pending' && x.direction === 'in' ? <Btn size="sm" kind="primary" onClick={() => setDeciding(x)}>Answer</Btn>
                  : x.status === 'pending' ? <Btn size="sm" kind="ghost" onClick={() => cancel(x)}>Take back</Btn>
                    : x.toApplication && x.direction === 'in' ? <Link to={`${BASE}/applications/${x.toApplication}`}>Open</Link> : null) },
              ]} />
            )}
          </Panel>
        </>
      )}
      {deciding ? <DecideDialog t={deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); t.reload(); }} /> : null}
    </Page>
  );
}

function DecideDialog({ t, onClose, onDone }) {
  const adm = useAdmission();
  const [f, setF] = useState({ round: '', class: '', answer: '' });
  const [busy, setBusy] = useState('');
  const round = (adm.rounds || []).find((r) => String(r._id) === f.round);
  const go = async (accept) => {
    setBusy(accept ? 'yes' : 'no');
    try {
      await admin.decideTransfer(t._id, { accept, round: f.round, class: f.class, answer: f.answer.trim() });
      toast.success(accept ? 'Accepted — the family is asked to check and submit it here' : 'Declined — the other branch is told');
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  return (
    <Dialog open onClose={onClose} title={`Move from ${t.fromSchoolName}: ${t.studentName}`} width={560}
      footer={<><Btn onClick={onClose}>Close</Btn><Btn busy={busy === 'no'} disabled={!f.answer.trim()} onClick={() => go(false)}>Decline</Btn><Btn kind="primary" busy={busy === 'yes'} disabled={!f.round || !f.class} onClick={() => go(true)}>Accept</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Note icon="info">Why: {t.reason}. Accepting copies the answers your form also asks and the documents into a draft for the family; they check it and submit it here, and their application at {t.fromSchoolName} is withdrawn then.</Note>
        <div className="adm-grid2">
          <Field label="Round" required>
            <Select value={f.round} onChange={(e) => setF({ ...f, round: e.target.value, class: '' })}>
              <option value="">Choose…</option>
              {(adm.rounds || []).filter((r) => r.status === 'open').map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Class" required>
            <Select value={f.class} onChange={(e) => setF({ ...f, class: e.target.value })} disabled={!round}>
              <option value="">Choose…</option>
              {(round?.classes || []).filter((c) => c.isOpen !== false).map((c) => <option key={c.class} value={c.class}>{adm.className(c.class)}{t.className && adm.className(c.class) === t.className ? ' (same class)' : ''}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Your answer" hint="Required to decline — the other branch reads it"><TextArea rows={2} maxLength={500} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}
