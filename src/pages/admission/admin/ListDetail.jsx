/**
 * One merit list: its criteria, its ranked lines, the changes made by hand
 * (each with its reason), and its way through approval to publication —
 * publishing is what makes the offers, under the class's seat lock.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import {
  Page, Head, Panel, Btn, Chip, ListChip, DecisionChip, StatusChip, DocChip, OfferChip, Table, Empty, ErrorBox, Spin, Dialog, ConfirmDialog,
  Field, Input, TextArea, Select, Note, KV, Ico, useLoad,
} from '../admUI';
import { fmtDateTime, errMsg, LIST_METHOD } from '../meta';
import { useAdmission, openFile } from './parts';
import { ListDialog, TIE_LABEL } from './Selection';

const BASE = '/admin/admissions';

export default function ListDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const adm = useAdmission();
  const { data: d, loading, error, reload } = useLoad(() => admin.list(id), [id]);
  const [ask, setAsk] = useState(null);   // 'edit' | 'submit' | 'approve' | 'return' | 'publish' | 'close' | 'delete' | 'draw' | 'cancel'
  const [check, setCheck] = useState(null);
  const [line, setLine] = useState(null);
  const [busy, setBusy] = useState('');
  if (loading && !d) return <Spin />;
  if (error && !d) return <ErrorBox error={error} onRetry={reload} />;
  const list = d.list;
  const draft = list.status === 'draft';
  const c = list.criteria || {};
  const examName = (eid) => d.exams.find((e) => String(e._id) === String(eid))?.name || 'An exam';
  const run = async (key, fn, ok) => {
    setBusy(key);
    try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error(errMsg(e)); throw e; } finally { setBusy(''); }
  };
  const counts = d.lines.reduce((m, l) => ({ ...m, [l.decision]: (m[l.decision] || 0) + 1 }), {});
  const lotteryList = list.method === 'lottery' || list.method === 'points_lottery';
  const drawn = !!list.draw;
  const publicDraw = lotteryList && drawn && ['published', 'closed'].includes(list.status) && adm.settings.slug ? `/${adm.settings.slug}/lottery/${list._id}` : '';
  const verify = async () => {
    setBusy('verify');
    try { const r = await admin.verifyDraw(list._id); setCheck(r.data); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const unapproved = d.exams.filter((e) => (c.weights || []).some((w) => w.source.split(':')[1] === String(e._id)) && !['approved', 'published'].includes(e.resultsStatus));

  return (
    <Page>
      <Link to={`${BASE}/selection`} className="adm-linkbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)' }}><Ico name="arrowLeft" size={14} />Selection</Link>
      <Head eyebrow={`${d.roundName} · list ${list.listNo} · ${LIST_METHOD[list.method || 'merit']?.label}${list.quota ? ` · ${((adm.roundOf(list.round)?.classes || []).find((c) => String(c.class) === String(list.class))?.quotas || []).find((q) => q.key === list.quota)?.name || list.quota} quota` : ''}`} title={`${list.name} — ${d.className}`}
        subtitle={list.publishedAt ? `Published ${fmtDateTime(list.publishedAt)}` : drawn ? `Drawn ${fmtDateTime(list.draw.at)}` : lotteryList ? 'Not drawn yet' : list.generatedAt ? `Ranked ${fmtDateTime(list.generatedAt)}` : ''}>
        <ListChip status={list.status} />
        <Btn icon="download" onClick={() => openFile(admin.listExportUrl(list._id, 'xlsx'), { download: true, filename: `${list.name}.xlsx` })}>Excel</Btn>
        <Btn icon="filePdf" onClick={() => openFile(admin.listExportUrl(list._id, 'pdf', '1'))}>PDF</Btn>
        {list.status === 'published' || list.status === 'closed' ? <Btn icon="filePdf" onClick={() => openFile(admin.listExportUrl(list._id, 'pdf', '0'))}>Notice board PDF</Btn> : null}
        {publicDraw ? <Btn icon="externalLink" onClick={() => window.open(publicDraw, '_blank', 'noopener')}>Public draw record</Btn> : null}
      </Head>

      {d.screening?.banned ? <Note tone="indigo" icon="shieldCheck">{d.screening.why} — so applicants are chosen by a random draw.</Note> : null}
      {(d.cancelledDraws || []).length ? (
        <Note tone="gray" icon="history">Earlier lists of this class that were cancelled: {d.cancelledDraws.map((c) => `${c.name}${c.drawn ? ' (drawn)' : ''} — ${c.cancelReason}`).join('; ')}. They stay on record.</Note>
      ) : null}

      {draft && !lotteryList && unapproved.length ? <Note tone="amber" icon="alert">{unapproved.map((e) => e.name).join(', ')} {unapproved.length === 1 ? 'has' : 'have'} no approved results yet — applicants without an approved result score nothing for it. Approve the results, then rebuild.</Note> : null}
      {list.status === 'approved' && list.publishAt ? <Note icon="calendar">Publishes automatically on {fmtDateTime(list.publishAt)}.</Note> : null}

      <Panel title="Next step" icon="target">
        <div className="adm-row">
          {draft && !lotteryList ? <>
            <Btn icon="sliders" onClick={() => setAsk('edit')}>Edit criteria</Btn>
            <Btn icon="refresh" busy={busy === 'rebuild'} onClick={() => run('rebuild', () => admin.rebuildList(list._id), 'Rebuilt — changes made by hand were kept').catch(() => {})}>Rebuild</Btn>
            <Btn kind="primary" icon="send" onClick={() => setAsk('submit')}>Send for approval</Btn>
            <Btn kind="ghost" icon="trash" onClick={() => setAsk('delete')}>Delete</Btn>
          </> : null}
          {draft && lotteryList && !drawn ? <>
            <Btn kind="primary" icon="sparkle" onClick={() => setAsk('draw')}>Make the draw</Btn>
            <Btn icon="sliders" onClick={() => setAsk('edit')}>Edit</Btn>
            <Btn icon="refresh" busy={busy === 'rebuild'} onClick={() => run('rebuild', () => admin.rebuildList(list._id), 'The pool is up to date').catch(() => {})}>Refresh the pool</Btn>
            <Btn kind="ghost" icon="trash" onClick={() => setAsk('delete')}>Delete</Btn>
          </> : null}
          {draft && lotteryList && drawn ? <>
            <Btn kind="primary" icon="send" onClick={() => setAsk('submit')}>Send for approval</Btn>
            <Btn icon="shieldCheck" busy={busy === 'verify'} onClick={verify}>Verify the draw</Btn>
            <Btn icon="pencil" onClick={() => setAsk('edit')}>Edit name and dates</Btn>
            <Btn kind="ghost" icon="closeCircle" onClick={() => setAsk('cancel')}>Cancel list</Btn>
          </> : null}
          {list.status === 'pending_approval' ? <>
            <Btn kind="success" icon="checkCircle" onClick={() => setAsk('approve')}>Approve</Btn>
            <Btn onClick={() => setAsk('return')}>Send back to draft</Btn>
            {lotteryList ? <Btn icon="shieldCheck" busy={busy === 'verify'} onClick={verify}>Verify the draw</Btn> : null}
          </> : null}
          {list.status === 'approved' ? <>
            <Btn kind="primary" icon="megaphone" onClick={() => setAsk('publish')}>Publish</Btn>
            <Btn onClick={() => setAsk('return')}>Send back to draft</Btn>
            {lotteryList ? <Btn kind="ghost" icon="closeCircle" onClick={() => setAsk('cancel')}>Cancel list</Btn> : null}
          </> : null}
          {['published', 'closed'].includes(list.status) && lotteryList ? <Btn icon="shieldCheck" busy={busy === 'verify'} onClick={verify}>Verify the draw</Btn> : null}
          {list.status === 'published' ? <Btn icon="lock" onClick={() => setAsk('close')}>Close the list</Btn> : null}
          <span className="adm-muted" style={{ fontSize: '.84rem' }}>
            {draft && lotteryList && !drawn ? 'Check who is in the pool, then make the draw — once. It cannot be made again.'
              : draft && lotteryList ? 'The draw is final. A line can be taken out (with a reason); the seats go down the draw order.'
              : draft ? 'Change any line by hand (with a reason), then send the list for approval.'
              : list.status === 'pending_approval' ? 'Check the lines, then approve — or send it back.'
                : list.status === 'approved' ? 'Publishing makes the offers and tells every family on the list.'
                  : list.status === 'published' ? 'Offers are out. When a selected family declines or lets an offer lapse, the waiting list moves up automatically if the school allows it.' : ''}
          </span>
        </div>
      </Panel>

      <div className="adm-grid2">
        <Panel title="Seats" icon="layers">
          <KV cols={3} items={[
            ['In the class', d.seats.capacity || 'No limit'], ['Held now', d.seats.taken], ['Free', d.seats.available == null ? 'No limit' : d.seats.available],
            ['This list fills', list.seats || 'Every free seat'], ['Waiting places', list.waitlistSize || 0],
            ['Respond by', list.acceptanceDeadline ? fmtDateTime(list.acceptanceDeadline) : 'School default'],
          ]} />
        </Panel>
        {lotteryList ? <DrawPanel list={list} check={check} /> : (
        <Panel title="Criteria" icon="sliders">
          <KV cols={1} items={[
            ['Score', (c.weights || []).length ? c.weights.map((w) => `${w.label || examName(w.source.split(':')[1])} (${w.source.endsWith(':raw') ? 'marks' : '%'}) × ${w.weight}`).join(' + ') : 'No exam score — ranked by the tie-breakers'],
            ['Tie-breakers', (c.tieBreakers || []).length ? c.tieBreakers.map((t) => (t.startsWith('exam:') ? `Higher in ${examName(t.split(':')[1])}` : TIE_LABEL[t] || t)).join(', then ') : `School default: ${(adm.settings.selection.tieBreakers || []).map((t) => TIE_LABEL[t] || t).join(', then ')}`],
            ['Ranked', `${(c.filters?.statuses || []).map((s) => adm.statusOf(s).label).join(', ')}${c.filters?.requirePass ? ' · qualified only' : ''}${c.filters?.requireDocsVerified ? ' · documents verified' : ''}${c.filters?.minScore != null ? ` · score ${c.filters.minScore}+` : ''}`],
          ]} />
        </Panel>
        )}
      </div>

      <Panel pad={false} title={lotteryList ? (drawn ? 'The draw, in order' : 'In the draw') : 'Ranked applications'}
        sub={lotteryList && !drawn ? `${d.lines.filter((l) => l.decision !== 'excluded').length} in the pool · ${counts.excluded || 0} taken out` : `${counts.selected || 0} selected · ${counts.waitlisted || 0} waiting · ${counts.not_selected || 0} not on this list · ${counts.excluded || 0} excluded`} icon="trophy">
        <Table rows={d.lines}
          empty={<Empty icon="trophy" title={lotteryList ? 'Nobody is in the draw' : 'Nobody is ranked'}>No application of the class matches the list's filters yet.</Empty>}
          columns={[
            { key: 'rank', label: lotteryList ? 'Draw no.' : '#', render: (l) => (l.rank ? <b>{l.rank}</b> : <span className="adm-muted">—</span>) },
            { key: 's', label: 'Student', render: (l) => <><Link to={`${BASE}/applications/${l.applicationId}`}><b>{l.studentName}</b></Link><div className="adm-muted adm-num" style={{ fontSize: '.74rem' }}>{l.applicationNumber}</div></> },
            ...(lotteryList ? [
              ...(list.method === 'points_lottery' ? [{ key: 'score', label: 'Points', align: 'right', render: (l) => <span title={Object.entries(l.breakdown?.points || {}).map(([k, v]) => `${k}: +${v}`).join('\n')}>{l.score ?? 0}</span> }] : []),
              ...(drawn ? [{ key: 'key', label: 'Draw key', render: (l) => <span className="adm-num adm-muted" title={l.breakdown?.drawKey || ''}>{(l.breakdown?.drawKey || '').slice(0, 10)}</span> }] : []),
            ] : [{ key: 'score', label: 'Score', align: 'right', render: (l) => <span title={Object.entries(l.breakdown || {}).map(([k, v]) => `${k}: ${v}`).join('\n')}>{l.score ?? '—'}</span> }]),
            { key: 'dec', label: 'Decision', render: (l) => (
              <div className="adm-row" style={{ gap: 4 }}>
                <DecisionChip value={l.decision} />{l.waitPosition ? <Chip tone="amber">#{l.waitPosition}</Chip> : null}
                {l.manual ? <Chip tone="violet" title={`${l.reason}${l.changedByName ? ` — ${l.changedByName}` : ''}`}>By hand</Chip> : null}
              </div>
            ) },
            { key: 'app', label: 'Application', render: (l) => <StatusChip status={l.status} /> },
            { key: 'docs', label: 'Documents', render: (l) => <DocChip status={l.docStatus || 'none'} /> },
            { key: 'offer', label: 'Offer', render: (l) => (l.offerStatus ? <OfferChip status={l.offerStatus} /> : '—') },
            { key: 'act', label: '', render: (l) => (draft ? <Btn size="sm" kind="ghost" onClick={() => setLine(l)}>{lotteryList ? (l.decision === 'excluded' ? 'Put back' : 'Take out') : 'Change'}</Btn> : null) },
          ]} />
      </Panel>

      <ListDialog open={ask === 'edit'} onClose={() => setAsk(null)} list={list} onDone={reload} />
      {lotteryList ? <LotteryLineDialog line={line} list={list} onClose={() => setLine(null)} onDone={reload} />
        : <LineDialog line={line} list={list} onClose={() => setLine(null)} onDone={reload} />}
      <DrawDialog open={ask === 'draw'} list={list} pool={d.lines.filter((l) => l.decision !== 'excluded').length} onClose={() => setAsk(null)} onDone={reload} />
      <ConfirmDialog open={ask === 'cancel'} onClose={() => setAsk(null)} title="Cancel this list?" confirmLabel="Cancel list" reason reasonLabel="Why — kept on record beside the next list"
        message={drawn ? 'The draw stays on record with your reason. A new list of the class makes a new draw.' : 'The list stays on record with your reason.'}
        onConfirm={(why) => run('cancel', () => admin.cancelList(list._id, why), 'List cancelled')} />
      <ConfirmDialog open={ask === 'submit'} onClose={() => setAsk(null)} tone="primary" title="Send for approval?" confirmLabel="Send"
        message="The lines are frozen while the list waits; it can be sent back to draft." onConfirm={() => run('submit', () => admin.submitList(list._id), 'Sent for approval')} />
      <ConfirmDialog open={ask === 'approve'} onClose={() => setAsk(null)} tone="success" title="Approve this list?" confirmLabel="Approve"
        message="Approved lists can be published at once or at a set time." onConfirm={() => run('approve', () => admin.approveList(list._id), 'Approved')} />
      <ConfirmDialog open={ask === 'return'} onClose={() => setAsk(null)} title="Send the list back to draft?" confirmLabel="Send back" reason reasonLabel="What needs changing"
        onConfirm={(note) => run('return', () => admin.returnList(list._id, note), 'Back in draft')} />
      <ConfirmDialog open={ask === 'close'} onClose={() => setAsk(null)} title="Close this list?" confirmLabel="Close list"
        message="Offers already made stand. A closed list makes no further promotions." onConfirm={() => run('close', () => admin.closeList(list._id), 'List closed')} />
      <ConfirmDialog open={ask === 'delete'} onClose={() => setAsk(null)} title="Delete this draft list?" confirmLabel="Delete"
        onConfirm={async () => { try { await admin.deleteList(list._id); toast.success('Deleted'); nav(`${BASE}/selection`); } catch (e) { toast.error(errMsg(e)); throw e; } }} />
      <PublishDialog open={ask === 'publish'} list={list} counts={counts} onClose={() => setAsk(null)} onDone={reload} />
    </Page>
  );
}

function LineDialog({ line, list, onClose, onDone }) {
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (line) { setDecision(line.decision); setReason(''); } }, [line]);
  const go = async () => {
    setBusy(true);
    try { await admin.decision(list._id, line._id, { decision, reason: reason.trim() }); toast.success('Line changed'); onClose(); onDone(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!line} onClose={onClose} title={`#${line?.rank} ${line?.studentName || ''}`} width={460}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!reason.trim() || decision === line?.decision} onClick={go}>Change</Btn></>}>
      <Field label="Decision">
        <Select value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="selected">Selected</option><option value="waitlisted">Waitlisted</option>
          <option value="not_selected">Not on this list</option><option value="excluded">Excluded</option>
        </Select>
      </Field>
      <Field label="Reason" required hint="Kept on the line and in the application's history." className="adm-mt">
        <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </Field>
      <Note icon="info">Changes made by hand survive a rebuild.</Note>
    </Dialog>
  );
}

function PublishDialog({ open, list, counts, onClose, onDone }) {
  const [at, setAt] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setAt(''); }, [open]);
  const go = async () => {
    setBusy(true);
    try {
      const r = await admin.publishList(list._id, at ? new Date(at).toISOString() : null);
      toast.success(r.data?.scheduled ? 'The list will be published at the time set' : `Published — ${r.data?.offered ?? 0} offer(s) made, ${r.data?.waitlisted ?? 0} on the waiting list${r.data?.noSeat ? `, ${r.data.noSeat} moved to waiting for want of seats` : ''}`);
      onClose();
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={`Publish ${list.name}`} width={480}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={go}>{at ? 'Schedule' : 'Publish now'}</Btn></>}>
      <p>{counts.selected || 0} family(ies) get an offer and {counts.waitlisted || 0} a waiting-list place; each is told by email and on the portal. If seats ran out meanwhile, the lines beyond the free seats wait.</p>
      <Field label="Publish at" hint="Empty: now" className="adm-mt"><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
    </Dialog>
  );
}

/** A lottery's line: taken out of the draw (with a reason) or put back — never chosen. */
function LotteryLineDialog({ line, list, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (line) setReason(''); }, [line]);
  const out = line?.decision !== 'excluded';
  const go = async () => {
    setBusy(true);
    try { await admin.decision(list._id, line._id, { decision: out ? 'excluded' : 'restore', reason: reason.trim() }); toast.success(out ? 'Taken out of the draw' : 'Put back into the draw'); onClose(); onDone(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!line} onClose={onClose} title={`${out ? 'Take out' : 'Put back'}: ${line?.studentName || ''}`} width={480}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!reason.trim()} onClick={go}>{out ? 'Take out of the draw' : 'Put back'}</Btn></>}>
      <p className="adm-muted" style={{ marginBottom: 10 }}>
        {out ? 'Only for an application that should not be in the draw at all — a duplicate, or one found not eligible. Nobody is chosen by hand: the seats go down the draw order.'
          : 'The line goes back to its place in the draw order.'}
      </p>
      <Field label="Reason" required hint="Kept on the line and in the application's history">
        <TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      </Field>
    </Dialog>
  );
}

/** The draw: once, with a phrase given out at the draw, in front of witnesses if the school likes. */
function DrawDialog({ open, list, pool, onClose, onDone }) {
  const [phrase, setPhrase] = useState('');
  const [witnesses, setWitnesses] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPhrase(''); setWitnesses(''); } }, [open]);
  const go = async () => {
    setBusy(true);
    try {
      const r = await admin.drawList(list._id, { phrase: phrase.trim(), witnesses: witnesses.split(',').map((w) => w.trim()).filter(Boolean) });
      toast.success(`Drawn — ${r.data.selected} selected, ${r.data.waitlisted} on the waiting list`);
      onClose();
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={`Make the draw — ${list.name}`} width={560}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="sparkle" busy={busy} disabled={phrase.trim().length < 4} onClick={go}>Make the draw</Btn></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Note tone="indigo" icon="info">
          {pool} application{pool === 1 ? '' : 's'} go into the draw. The order comes from a value the system fixed when this list was made
          (its fingerprint, <span className="adm-num">{(list.lotteryCommitment || '').slice(0, 16)}…</span>, is shown here and on the record)
          together with the phrase below — so nobody could know the order before this moment. The draw is made once.
        </Note>
        <Field label="Draw phrase" required hint="Words or numbers given out loud at the draw — by the witnesses, say. Written on the public record.">
          <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} maxLength={120} placeholder="e.g. Seventeen blue kites 4721" />
        </Field>
        <Field label="Witnesses" hint="Names, separated by commas — parents, a member of the managing committee">
          <Input value={witnesses} onChange={(e) => setWitnesses(e.target.value)} maxLength={500} />
        </Field>
      </div>
    </Dialog>
  );
}

/** What a lottery is drawn from, and — once drawn — the record anyone can check. */
function DrawPanel({ list, check }) {
  const dr = list.draw;
  const c = list.criteria || {};
  return (
    <Panel title="The draw" icon="sparkle">
      {!dr ? (
        <KV cols={1} items={[
          ['Method', LIST_METHOD[list.method]?.sub],
          ...(list.method === 'points_lottery' ? [['Priority points', (c.points || []).map((p) => `${p.label} +${p.points}`).join(' · ') || '—']] : []),
          ['Fingerprint of the secret', <span key="c" className="adm-num" style={{ wordBreak: 'break-all' }}>{list.lotteryCommitment}</span>],
        ]} />
      ) : (
        <>
          <KV cols={1} items={[
            ['Drawn', `${fmtDateTime(dr.at)}${dr.byName ? ` by ${dr.byName}` : ''}`],
            ['Phrase', `“${dr.phrase}”`],
            ...(dr.witnesses?.length ? [['Witnesses', dr.witnesses.join(', ')]] : []),
            ['In the draw', `${dr.poolSize} · ${dr.selected ?? '—'} selected · ${dr.waitlisted ?? '—'} waiting`],
            ...(list.method === 'points_lottery' ? [['Priority points', (c.points || []).map((p) => `${p.label} +${p.points}`).join(' · ')]] : []),
            ['Secret, now revealed', <span key="n" className="adm-num" style={{ wordBreak: 'break-all' }}>{dr.nonce}</span>],
            ['Seed', <span key="s" className="adm-num" style={{ wordBreak: 'break-all' }}>{dr.seed}</span>],
          ]} />
          {check ? (
            <Note tone={check.ok ? 'green' : 'red'} icon={check.ok ? 'checkCircle' : 'alert'}>
              {check.ok ? `Verified: all ${check.checked} draw numbers follow from the fingerprint, the phrase and who was in the draw.` : `Not verified — ${check.problems.join('; ')}`}
            </Note>
          ) : null}
        </>
      )}
    </Panel>
  );
}
