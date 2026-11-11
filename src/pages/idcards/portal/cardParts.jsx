/**
 * What the holders' pages share (Oct 2026): the showcase with the card in
 * force hanging in 3D, the history of every card, and the two ways a card
 * leaves the page — downloaded as a PDF or printed.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import IdCard3D from '../IdCard3D';
import IdCardFace from '../IdCardFace';
import { cardWords } from '../CardViewer';
import { Btn, Ico, StatusBadge, Panel, Empty } from '../icUI';
import { downloadMyIdCard } from '../../../api/idcards.api';
import { REISSUE_REASON, errorText, fmtDate, fmtDay, pdfName, printBlob, saveBlob, subLine } from '../icMeta';

/** Download / print a card the signed-in person may hold. */
export function useCardFiles(role) {
  const fetchPdf = (card) => downloadMyIdCard(role, card._id, 'card');
  return {
    download: async (card) => {
      try { saveBlob(await fetchPdf(card), pdfName(card)); toast.success('ID card downloaded'); }
      catch (e) { toast.error(await errorText(e, 'The card could not be downloaded')); }
    },
    print: async (card) => {
      try { printBlob(await fetchPdf(card)); }
      catch (e) { toast.error(await errorText(e, 'The card could not be printed')); }
    },
  };
}

/** The holder's code as the card names it. */
const codeLabel = (card) => (card.kind === 'student' ? 'Admission No.' : card.kind === 'parent' ? 'Parent ID' : 'Employee ID');

/** The card in force, hanging in the showcase, with what it says and what can be done with it. */
export function Hero({ card, files, onPresent, onOpen, compact = false, upcoming, earlier = 0 }) {
  const [back, setBack] = useState(false);
  const [busy, setBusy] = useState('');
  const s = card.snapshot || {};
  const run = async (what, fn) => { setBusy(what); try { await fn(card); } finally { setBusy(''); } };
  const width = compact ? 230 : 280;
  const valid = card.status === 'active';
  return (
    <section className={`icm-hero${compact ? ' icm-hero--compact' : ''}`}>
      <div className="icm-hero__glow" aria-hidden="true" />
      <div className="icm-hero__stage">
        <IdCard3D card={card} width={width} lanyard flipped={back} onFlip={setBack} hint={!compact} />
      </div>
      <div className="icm-hero__info">
        <div className="icm-hero__tags">
          <StatusBadge status={card.status} size="lg" />
          {card.kind === 'student' && card.academicYear?.yearName ? <span className="icm-yearchip">{card.academicYear.yearName}</span> : null}
          {card.reissueNo > 0 ? <span className="icm-yearchip icm-yearchip--soft">Reissue {card.reissueNo}</span> : null}
        </div>
        <h2>{s.name}</h2>
        <p className="icm-hero__sub">{subLine(card)}{card.kind === 'student' && s.rollNumber ? ` · Roll ${s.rollNumber}` : ''}</p>
        <div className={`icm-hero__state${valid ? '' : ' is-void'}`}>
          <Ico name={valid ? 'checkDisc' : card.status === 'generated' ? 'hourglass' : 'crossDisc'} size={17} />
          {cardWords(card)}
        </div>
        <dl className="icm-facts">
          <div><dt>Card number</dt><dd>{card.number}</dd></div>
          {s.holderCode ? <div><dt>{codeLabel(card)}</dt><dd>{s.holderCode}</dd></div> : null}
          {card.kind === 'student' ? <div><dt>Valid till</dt><dd>{fmtDay(card.validUntil || s.yearEnd) || '—'}</dd></div> : null}
          <div><dt>Issued on</dt><dd>{fmtDate(card.issuedAt)}</dd></div>
        </dl>
        <div className="icm-hero__acts">
          {onPresent && valid ? <Btn kind="light" icon="fullscreen" onClick={() => onPresent(card)}>Show at the gate</Btn> : null}
          <Btn kind="dark" icon="download" busy={busy === 'pdf'} onClick={() => run('pdf', files.download)}>Download</Btn>
          <Btn kind="dark" icon="printer" busy={busy === 'print'} onClick={() => run('print', files.print)}>Print</Btn>
          {/* Says what is on the other side: "Flip card" did not tell anyone
              that the back is where the QR code is. */}
          <Btn kind="dark" icon={back ? 'flip' : 'qr'} onClick={() => setBack((b) => !b)}>{back ? 'Show front' : 'Show back (QR code)'}</Btn>
          {/* No "Full screen" beside "Show at the gate" — both filled the
              screen with this same card. The viewer is still how an EARLIER
              card is opened, and only then is there anything else to see. */}
          {onOpen && earlier > 0 ? <Btn kind="dark" icon="history" onClick={() => onOpen(card)}>Earlier cards · {earlier}</Btn> : null}
        </div>
        {upcoming ? (
          <button type="button" className="icm-upcoming" onClick={() => onOpen?.(upcoming)}>
            <Ico name="sparkle" size={16} />
            <span>Your <b>{upcoming.academicYear?.yearName}</b> card is ready — it comes into force on {fmtDay(upcoming.validFrom)}.</span>
            <Ico name="chevronRight" size={15} />
          </button>
        ) : null}
        <p className="icm-hero__help">Card lost or damaged? Tell the school office — they will block it and issue a replacement.</p>
      </div>
    </section>
  );
}

/** No card in force yet. */
export function NoCard({ pending, kind = 'student' }) {
  return (
    <section className="icm-hero icm-hero--empty">
      <div className="icm-hero__glow" aria-hidden="true" />
      <div className="icm-none">
        <div className="icm-none__ghost" aria-hidden="true"><span /></div>
        <div>
          <h2>{pending ? `Your ${pending.yearName} ID card is on its way` : 'No ID card yet'}</h2>
          <p>
            {pending
              ? 'The school office has not issued it yet. It will appear here — and you will get a notification — as soon as it is ready.'
              : kind === 'student' ? 'Your school issues a new ID card each academic year. It will appear here once the office issues it.' : 'Your ID card will appear here once the school office issues it.'}
          </p>
        </div>
      </div>
    </section>
  );
}

/** One row of the history: a small card, what it was and what became of it. */
function HistoryRow({ card, onOpen, current }) {
  const s = card.snapshot || {};
  return (
    <button type="button" className={`icm-row${current ? ' is-current' : ''}`} onClick={() => onOpen(card)}>
      <span className="icm-row__thumb"><IdCardFace card={card} side="front" /></span>
      <span className="icm-row__main">
        <span className="icm-row__top">
          <strong>{card.number}</strong>
          <StatusBadge status={card.status} size="sm" />
          {current ? <span className="icm-row__now">Current</span> : null}
        </span>
        <span className="icm-row__line">
          {card.kind === 'student'
            ? [[s.className, s.sectionName].filter(Boolean).join(' – '), s.rollNumber ? `Roll ${s.rollNumber}` : ''].filter(Boolean).join(' · ')
            : subLine(card)}
        </span>
        <span className="icm-row__when">
          Issued {fmtDate(card.issuedAt)}
          {card.reissueNo > 0 ? ` · Reissue ${card.reissueNo}${REISSUE_REASON[card.reissueReason] ? ` (${REISSUE_REASON[card.reissueReason].toLowerCase()})` : ''}` : ''}
          {card.statusReason && card.status !== 'active' ? ` · ${card.statusReason}` : ''}
        </span>
      </span>
      <span className="icm-row__go">View <Ico name="chevronRight" size={15} /></span>
    </button>
  );
}

/**
 * Every EARLIER card, newest first. The card in force is not listed: it is
 * the one hanging at the top of the page, and a second copy of it down here
 * with its own "View" was the same card offered twice.
 *
 * Student cards are grouped by academic year — the year's original and any
 * replacement together — so "2025-26" reads as one entry however many copies
 * it took.
 */
export function History({ cards: every, currentId, onOpen, title = 'ID Card History', sub }) {
  const cards = useMemo(() => every.filter((c) => c._id !== currentId), [every, currentId]);
  const groups = useMemo(() => {
    if (!cards.length) return [];
    if (cards[0].kind !== 'student') return [{ key: 'all', label: '', cards }];
    const by = new Map();
    for (const c of cards) {
      const k = c.academicYear?.yearName || c.snapshot?.yearName || '—';
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(c);
    }
    return [...by.entries()]
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
      .map(([label, list]) => ({ key: label, label, cards: list.sort((x, y) => new Date(y.issuedAt) - new Date(x.issuedAt)) }));
  }, [cards]);

  return (
    <Panel title={title} sub={sub || (every[0]?.kind === 'student' ? 'A new card every academic year. Each year’s card stays exactly as it was issued.' : 'Cards issued to you before the current one.')} icon="history" tone="indigo">
      {!cards.length ? (
        <Empty compact title="No earlier cards">
          {every.length ? 'The card above is the only one issued to you so far. Earlier cards are kept here once it is replaced.' : 'Cards appear here as the school issues them.'}
        </Empty>
      ) : (
        <div className="icm-history">
          {groups.map((g) => (
            <div key={g.key} className="icm-year">
              {g.label ? (
                <div className="icm-year__label">
                  <span>{g.label}</span>
                </div>
              ) : null}
              <div className="icm-year__rows">
                {g.cards.map((c) => <HistoryRow key={c._id} card={c} current={c._id === currentId} onOpen={onOpen} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
