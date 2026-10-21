/**
 * /<slug>/lottery/<list id> — a published admission lottery, open to anyone
 * (Oct 2026). Who was in the draw (application numbers, never names), the
 * values the order came from, and the order — with a button that recomputes
 * the whole draw in this browser, so nobody has to take the school's word.
 *
 * The recomputation is the server's own (school-backend services/admission/
 * lottery.js), step for step: the secret matches the fingerprint shown before
 * the draw; the list of applications matches its fingerprint; the seed follows;
 * each application's key is HMAC-SHA256(seed, its number); most points first,
 * then the smaller key.
 */
import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { pub } from '../../../api/admission.api';
import { useLoad, Spin, ErrorBox, Panel, Chip, Btn, Note, Input, Table, KV } from '../admUI';
import { fmtDateTime, DECISION } from '../meta';
import { usePortal } from './PortalShell';

const ALGORITHM = 'aksharum-lottery-v1';
const enc = (t) => new TextEncoder().encode(t);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (t) => hex(await crypto.subtle.digest('SHA-256', enc(t)));
async function hmac(keyText, msg) {
  const key = await crypto.subtle.importKey('raw', enc(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc(msg)));
}

/** The draw, recomputed from the record alone. */
async function recompute(rec) {
  const d = rec.draw;
  const problems = [];
  if (await sha256(d.nonce) !== d.commitment) problems.push('the revealed secret does not match the fingerprint shown before the draw');
  const lines = rec.entries.map((e) => ({ n: String(e.applicationNumber), p: Number(e.points) || 0, shown: e.drawNo }));
  const text = [...lines].sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0)).map((l) => `${l.n}:${l.p}`).join('\n');
  const inputHash = await sha256(text);
  if (inputHash !== d.inputHash) problems.push('the list of applications does not match its fingerprint');
  const seed = await sha256(`${ALGORITHM}|${rec._id}|${d.nonce}|${d.phrase}|${inputHash}`);
  if (seed !== d.seed) problems.push('the seed does not follow from the phrase and the secret');
  const keyed = await Promise.all(lines.map(async (l) => ({ ...l, key: await hmac(seed, l.n) })));
  keyed.sort((a, b) => (b.p - a.p) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const wrong = keyed.filter((l, i) => Number(l.shown) !== i + 1).length;
  if (wrong) problems.push(`${wrong} draw number(s) differ from the recomputed order`);
  return { ok: !problems.length, problems, checked: keyed.length };
}

export default function LotteryPage() {
  const { listId } = useParams();
  const portal = usePortal();
  const { data: rec, loading, error, reload } = useLoad(() => pub.lottery(portal.slug, listId), [portal.slug, listId]);
  const [find, setFind] = useState('');
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => {
    const q = find.trim().toUpperCase();
    return (rec?.entries || []).filter((e) => !q || String(e.applicationNumber).toUpperCase().includes(q)).map((e) => ({ ...e, _id: e.applicationNumber }));
  }, [rec, find]);
  if (loading && !rec) return <Spin label="Opening the draw…" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const d = rec.draw;
  const points = rec.method === 'points_lottery';
  const run = async () => {
    setBusy(true);
    try { setCheck(await recompute(rec)); } catch (e) { setCheck({ ok: false, problems: [e?.message || 'This browser could not run the check'] }); } finally { setBusy(false); }
  };
  return (
    <div className="adm-page" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="adm-head">
        <div>
          <div className="adm-head__eyebrow">Admission lottery · {rec.yearName || rec.roundName}</div>
          <h1>{rec.name} — {rec.className}</h1>
          <p>Drawn {fmtDateTime(d.at)}. {d.poolSize} applications were in the draw for {d.seats} seat{d.seats === 1 ? '' : 's'}{d.waitingPlaces ? ` and ${d.waitingPlaces} waiting places` : ''}.</p>
        </div>
        <div className="adm-head__acts"><Chip tone="indigo" icon="sparkle">{points ? 'Points, then lottery' : 'Lottery'}</Chip></div>
      </div>

      {(rec.cancelled || []).length ? (
        <Note tone="gray" icon="history">Earlier draws for this class were cancelled: {rec.cancelled.map((c) => `${c.name} (${c.reason})`).join('; ')}.</Note>
      ) : null}

      <Panel title="The order" icon="list" pad={false}
        right={<Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find an application number" aria-label="Find an application number" style={{ width: 240 }} />}>
        <Table rows={rows} dense
          columns={[
            { key: 'drawNo', label: 'Draw no.', render: (e) => <b>{e.drawNo}</b> },
            { key: 'applicationNumber', label: 'Application', render: (e) => <span className="adm-num">{e.applicationNumber}</span> },
            ...(points ? [{ key: 'points', label: 'Points', align: 'right', render: (e) => e.points }] : []),
            { key: 'decision', label: 'Result', render: (e) => <Chip tone={DECISION[e.decision]?.tone}>{e.decision === 'waitlisted' ? `Waiting #${e.waitPosition || ''}` : e.decision === 'excluded' ? 'Taken out' : e.decision === 'not_selected' ? 'Not reached' : DECISION[e.decision]?.label}</Chip> },
            { key: 'key', label: 'Key', render: (e) => <span className="adm-num adm-muted" title={e.drawKey}>{(e.drawKey || '').slice(0, 12)}</span> },
          ]}
          empty={<p className="adm-muted" style={{ padding: 16 }}>No application number matches.</p>} />
      </Panel>

      <div className="adm-grid2">
        <Panel title="What the order came from" icon="shieldCheck">
          <KV cols={1} items={[
            ['Phrase given at the draw', `“${d.phrase}”`],
            ...(d.witnesses?.length ? [['Witnesses', d.witnesses.join(', ')]] : []),
            ...(points ? [['Priority points', rec.pointsRules.map((r) => `${r.label} +${r.points}`).join(' · ')]] : []),
            ['Fingerprint of the secret (shown before the draw)', <span key="c" className="adm-num" style={{ wordBreak: 'break-all' }}>{d.commitment}</span>],
            ['The secret, revealed at the draw', <span key="n" className="adm-num" style={{ wordBreak: 'break-all' }}>{d.nonce}</span>],
            ['Fingerprint of who was in the draw', <span key="i" className="adm-num" style={{ wordBreak: 'break-all' }}>{d.inputHash}</span>],
            ['Seed', <span key="s" className="adm-num" style={{ wordBreak: 'break-all' }}>{d.seed}</span>],
          ]} />
        </Panel>
        <Panel title="Check it yourself" icon="checkCircle">
          <ol className="adm-steps-plain">
            <li>The secret&rsquo;s SHA-256 must equal the fingerprint the school showed before the draw — so the secret was fixed in advance.</li>
            <li>The application numbers with their points, in number order as &ldquo;number:points&rdquo; lines, give the fingerprint of who was in the draw.</li>
            <li>The seed is the SHA-256 of &ldquo;{ALGORITHM}|list id|secret|phrase|that fingerprint&rdquo;.</li>
            <li>Each application&rsquo;s key is HMAC-SHA256 of its number with the seed. {points ? 'Most points draw first; with equal points, the smaller key first.' : 'The smaller key draws first.'}</li>
          </ol>
          <Btn kind="primary" icon="shieldCheck" busy={busy} onClick={run}>Check the draw now</Btn>
          {check ? (
            <Note tone={check.ok ? 'green' : 'red'} icon={check.ok ? 'checkCircle' : 'alert'}>
              {check.ok ? `Checked in this browser: all ${check.checked} draw numbers follow from the secret, the phrase and who was in the draw.` : `The check failed: ${check.problems.join('; ')}.`}
            </Note>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
