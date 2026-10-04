/**
 * One card, in the office's slide-over (Oct 2026): the card itself in 3D,
 * what no longer matches the record, what became of it, every card the same
 * person was ever issued (click one to open it here), and the card's whole
 * timeline — issued, printed, blocked, replaced, scanned.
 *
 * Opened on a holder with no card (a Pending row) it shows who they are, any
 * earlier cards, and the button to issue theirs.
 *
 *   target  { cardId, holderId, kind, name }
 *   act     useCardActions().act — the dialogs live with the page
 */
import React, { useEffect, useState } from 'react';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { getIdCard, getIdCardHolder } from '../../../api/idcards.api';
import IdCard3D from '../IdCard3D';
import { Avatar, Btn, Ico, Kebab, KindChip, Note, Spin, StatusBadge } from '../icUI';
import { KIND, REISSUE_REASON, ago, fmtDate, fmtDay, fmtStamp, plural } from '../icMeta';

const ACTION_ICON = {
  issued: 'plus', reissued: 'regen', refreshed: 'regen', printed: 'printer', downloaded: 'download',
  blocked: 'ban', activated: 'checkCircle', cancelled: 'trash', lost: 'search', damaged: 'alert', replaced: 'cardStack',
  verified: 'shieldCheck', scanned: 'qr',
};

function Timeline({ rows }) {
  if (!rows?.length) return <p className="icd-quiet">Nothing has happened to this card yet.</p>;
  return (
    <ol className="icd-time">
      {rows.map((r) => (
        <li key={r._id} className={`icd-time__item icd-time__item--${r.action}`}>
          <span className="icd-time__dot"><Ico name={ACTION_ICON[r.action] || 'info'} size={13} /></span>
          <div>
            <strong>{r.label}</strong>
            {r.note ? <p>{r.note}</p> : null}
            {r.meta?.changes?.length ? <p>{r.meta.changes.map((c) => `${c.label}: ${c.was || '—'} → ${c.now || '—'}`).join(' · ')}</p> : null}
            {r.meta?.replacedBy ? <p>Replaced by {r.meta.replacedBy}</p> : null}
            {r.meta?.replaces ? <p>In place of {r.meta.replaces}</p> : null}
            <span>{r.by ? `${r.by} · ` : r.action === 'scanned' ? 'QR scan · ' : ''}{fmtStamp(r.createdAt)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function History({ list, currentId, onOpen, kind }) {
  if (!list?.length) return null;
  return (
    <div className="icd-history">
      {list.map((c) => (
        <button key={c._id} type="button" className={`icd-hrow${c._id === currentId ? ' is-on' : ''}`} onClick={() => onOpen(c._id)} disabled={c._id === currentId}>
          <span className="icd-hrow__main">
            <strong>{kind === 'student' ? (c.yearName || c.number) : c.number}</strong>
            <em>{kind === 'student' ? `${c.number} · ${c.line}` : `Issued ${fmtDate(c.issuedAt)}`}{c.reissueNo ? ` · reissue ${c.reissueNo}${REISSUE_REASON[c.reissueReason] ? ` (${REISSUE_REASON[c.reissueReason].toLowerCase()})` : ''}` : ''}</em>
          </span>
          <StatusBadge status={c.status} size="sm" />
          {c._id === currentId ? <span className="icd-hrow__here">Open</span> : <Ico name="chevronRight" size={15} />}
        </button>
      ))}
    </div>
  );
}

/** What became of the card, said in a sentence, with the step it invites. */
function StatusNote({ d, act, openCard }) {
  const c = d.card;
  const by = d.statusBy ? ` by ${d.statusBy}` : '';
  const when = c.statusAt ? ` on ${fmtDate(c.statusAt)}` : '';
  if (c.status === 'blocked') {
    return <Note tone="red" icon="ban" action={d.can.activate ? <Btn size="sm" onClick={() => act('activate', c)}>Activate</Btn> : null}>Blocked{when}{by}{c.statusReason ? <> — <b>{c.statusReason}</b></> : null}. It does not verify while blocked.</Note>;
  }
  if (c.status === 'lost' || c.status === 'damaged') {
    return (
      <Note tone="orange" icon="alertTri"
        action={c.replacedBy ? <Btn size="sm" onClick={() => openCard(c.replacedBy)}>Open new card</Btn> : d.can.replace ? <Btn size="sm" kind="primary" onClick={() => act('replace', c)}>Issue replacement</Btn> : null}>
        Reported {c.status}{when}{by}{c.statusReason ? <> — {c.statusReason}</> : null}. {c.replacedBy ? 'A replacement has been issued.' : 'No replacement has been issued yet.'}
      </Note>
    );
  }
  if (c.status === 'reissued') {
    return <Note tone="violet" icon="regen" action={c.replacedBy ? <Btn size="sm" onClick={() => openCard(c.replacedBy)}>Open new card</Btn> : null}>Replaced{when}{by}{c.statusReason ? <> — {c.statusReason}</> : null}. This card no longer verifies.</Note>;
  }
  if (c.status === 'cancelled') return <Note tone="gray" icon="trash">Cancelled{when}{by}{c.statusReason ? <> — <b>{c.statusReason}</b></> : null}. It never verifies again.</Note>;
  if (c.status === 'expired') return <Note tone="slate" icon="history">Expired with {c.academicYear?.yearName || 'its year'} — it stays on record exactly as it was issued and cannot be changed.</Note>;
  if (c.status === 'generated') return <Note tone="indigo" icon="hourglass">Issued ahead for {c.academicYear?.yearName}. It comes into force by itself when that year becomes the school&rsquo;s current year.</Note>;
  return null;
}

export default function CardDrawer({ open, onClose, target, act, onPrint, onDownload, onGenerate, version = 0, locked = false }) {
  const [cardId, setCardId] = useState(target?.cardId || null);
  const [state, setState] = useState({ loading: true, data: null, holder: null, error: null });
  const [back, setBack] = useState(false);

  useEffect(() => { if (open) { setCardId(target?.cardId || null); setBack(false); } }, [open, target]);

  useEffect(() => {
    if (!open || !target) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    const load = cardId
      ? getIdCard(cardId).then((r) => ({ data: r.data, holder: null }))
      : getIdCardHolder(target.holderId, target.kind).then((r) => ({ data: null, holder: r.data }));
    load.then((v) => { if (alive) setState({ loading: false, ...v, error: null }); })
      .catch((e) => { if (alive) setState({ loading: false, data: null, holder: null, error: e }); });
    return () => { alive = false; };
  }, [open, target, cardId, version]);

  if (!open || !target) return null;
  const kind = target.kind;
  const d = state.data;
  const c = d?.card;
  const k = KIND[kind];
  // While a dialog is open over the drawer, Escape belongs to the dialog.
  const close = locked ? () => {} : onClose;

  if (state.loading && !d && !state.holder) {
    return <Drawer open onClose={close} label="ID card"><div className="icd"><Spin /></div></Drawer>;
  }
  if (state.error) {
    return (
      <Drawer open onClose={close} label="ID card">
        <DrawerHead name={target.name || 'ID card'} onClose={onClose} />
        <DrawerBody><Note tone="red" icon="alert">{state.error.message || 'This card could not be loaded.'}</Note></DrawerBody>
      </Drawer>
    );
  }

  // A holder with no card selected: who they are, earlier cards, and the button.
  if (!cardId) {
    const h = state.holder;
    return (
      <Drawer open onClose={close} label={`${h?.holder?.name || target.name} — ID card`}>
        <div className="icd">
          <DrawerHead
            mark={<Avatar name={h?.holder?.name} photo={h?.holder?.photo} size={52} tone={k.tone} />}
            name={h?.holder?.name || target.name}
            sub={[h?.holder?.code, h?.holder?.now].filter(Boolean).join(' · ')}
            tags={<><StatusBadge status="pending" /><KindChip kind={kind} /></>}
            onClose={onClose}
          />
          <DrawerBody>
            <div className="icd-pending">
              <div className="icd-pending__ghost" aria-hidden><span /></div>
              <div>
                <strong>{kind === 'student' && h?.year ? `No card for ${h.year.yearName} yet` : 'No card in force'}</strong>
                <p>{kind === 'student' ? 'Generate it to give them this year’s card. Earlier years’ cards stay as they were.' : `Generate it to give this ${k.label.toLowerCase()} their card.`}</p>
              </div>
            </div>
            {h?.holder?.noPhoto ? <Note tone="amber" icon="alert">There is no photo on record — the card will show initials until a photo is added and the card updated.</Note> : null}
            {!h?.holder?.isActive ? <Note tone="red" icon="alert">This account is switched off. A card cannot be issued until it is switched on.</Note> : null}
            {h?.cards?.length ? (
              <DrawerSection title={`Earlier cards · ${h.cards.length}`}>
                <History list={h.cards} kind={kind} onOpen={setCardId} />
              </DrawerSection>
            ) : null}
          </DrawerBody>
          <DrawerFoot>
            <Btn onClick={onClose}>Close</Btn>
            {onGenerate && h?.holder?.isActive ? <Btn kind="primary" icon="cardStack" onClick={() => onGenerate(h.holder)}>Generate card</Btn> : null}
          </DrawerFoot>
        </div>
      </Drawer>
    );
  }

  const changes = d.changes || [];
  const yearName = c.academicYear?.yearName;
  const menu = [
    d.can.regenerate ? { label: d.can.refreshInPlace ? 'Update card details' : 'Reissue with latest details', icon: 'regen', onClick: () => act('regenerate', c, { changes }) } : null,
    d.can.report ? { label: 'Report lost', icon: 'search', onClick: () => act('report', c, { status: 'lost' }) } : null,
    d.can.report ? { label: 'Report damaged', icon: 'alert', onClick: () => act('report', c, { status: 'damaged' }) } : null,
    d.can.replace ? { label: 'Issue replacement', icon: 'cardStack', onClick: () => act('replace', c) } : null,
    '-',
    d.can.block ? { label: 'Block card', icon: 'ban', onClick: () => act('block', c) } : null,
    d.can.activate ? { label: 'Activate card', icon: 'checkCircle', onClick: () => act('activate', c) } : null,
    '-',
    { label: 'Open verification page', icon: 'externalLink', onClick: () => window.open(c.verifyUrl, '_blank', 'noopener') },
    d.can.cancel ? { label: 'Cancel card', icon: 'trash', danger: true, onClick: () => act('cancel', c) } : null,
  ];

  return (
    <Drawer open onClose={close} label={`${c.snapshot?.name} — ID card ${c.number}`}>
      <div className="icd">
        <DrawerHead
          mark={<Avatar name={c.snapshot?.name} photo={c.snapshot?.photo} size={52} tone={k.tone} />}
          name={d.holder?.name || c.snapshot?.name}
          sub={`${c.number}${yearName ? ` · ${yearName}` : ''}`}
          tags={<>
            <StatusBadge status={c.status} />
            <KindChip kind={kind} />
            {c.reissueNo ? <span className="icd-tag">Reissue {c.reissueNo}{REISSUE_REASON[c.reissueReason] ? ` · ${REISSUE_REASON[c.reissueReason]}` : ''}</span> : null}
            {!c.printedAt && ['active', 'generated', 'blocked'].includes(c.status) ? <span className="icd-tag icd-tag--warn">Not printed</span> : null}
          </>}
          onClose={onClose}
        />
        <DrawerBody>
          <div className="icd-stage">
            <IdCard3D key={c._id} card={c} width={200} flipped={back} onFlip={setBack} entrance={false} />
            <button type="button" className="icd-flip" onClick={() => setBack((b) => !b)}><Ico name="flip" size={14} />{back ? 'Show front' : 'Show back'}</button>
          </div>

          {changes.length && d.can.regenerate ? (
            <Note tone="amber" icon="alertTri" action={<Btn size="sm" kind="primary" icon="regen" onClick={() => act('regenerate', c, { changes })}>{d.can.refreshInPlace ? 'Update' : 'Reissue'}</Btn>}>
              <b>No longer matches the record.</b>
              <ul className="icd-changes">{changes.map((x) => <li key={x.key}>{x.label}: <s>{x.was || '—'}</s> → <b>{x.now || '—'}</b></li>)}</ul>
            </Note>
          ) : null}
          <StatusNote d={d} act={act} openCard={setCardId} />
          {(!d.holder.isActive || d.holder.removed) && ['active', 'blocked'].includes(c.stored) ? (
            <Note tone="red" icon="alert" action={d.can.cancel ? <Btn size="sm" onClick={() => act('cancel', c)}>Cancel card</Btn> : null}>
              {d.holder.removed ? 'This account no longer exists' : `${d.holder.name}'s account is switched off`} — the card no longer verifies. Cancel it to close the record.
            </Note>
          ) : null}
          {kind === 'student' && !d.holder.inScope && d.holder.isActive && c.status === 'active' ? (
            <Note tone="amber" icon="info">{d.holder.name} is no longer in {yearName}&rsquo;s classes on record.</Note>
          ) : null}

          <DrawerSection title="Card">
            <DrawerFields fields={[
              ['Card No.', c.number],
              ['Verification code', c.code],
              kind === 'student' ? ['Academic year', yearName] : null,
              ['Issued', `${fmtDate(c.issuedAt)}${d.issuedBy ? ` by ${d.issuedBy}` : ''}`],
              c.refreshedAt ? ['Details updated', fmtStamp(c.refreshedAt)] : null,
              kind === 'student' ? ['Valid till', fmtDay(c.validUntil)] : null,
              ['Printed', c.printedAt ? `${plural(c.printCount, 'time')} · last ${fmtDate(c.printedAt)}` : 'Not yet'],
              ['Scanned', c.verifyCount ? `${plural(c.verifyCount, 'time')} · last ${ago(c.verifiedAt)}` : 'Never'],
            ].filter(Boolean)} />
          </DrawerSection>

          {d.holder.now ? (
            <DrawerSection title="On record now">
              <p className="icd-now">{d.holder.now}</p>
            </DrawerSection>
          ) : null}

          {d.history.length > 1 ? (
            <DrawerSection title={`Every card of ${String(d.holder.name || '').split(' ')[0] || 'this person'} · ${d.history.length}`}>
              <History list={d.history} currentId={c._id} kind={kind} onOpen={setCardId} />
            </DrawerSection>
          ) : null}

          <DrawerSection title="Timeline">
            <Timeline rows={d.timeline} />
          </DrawerSection>
        </DrawerBody>
        <DrawerFoot>
          <Btn icon="download" onClick={() => onDownload?.(c)}>Download</Btn>
          <Btn icon="printer" onClick={() => onPrint?.([c])}>Print</Btn>
          <Kebab items={menu} label="Card actions" />
        </DrawerFoot>
      </div>
    </Drawer>
  );
}
