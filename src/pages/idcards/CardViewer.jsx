/**
 * The full-screen card viewer (Oct 2026) — one card at a time on a dark
 * stage, hanging from its lanyard, with every other card of the same holder
 * in a rail beside it (the years, the replacements).
 *
 * "Show at the gate" turns it into a presentation: the card large and face
 * on, the school's name, whether the card is valid, and a clock ticking to
 * the second — a live screen, which a screenshot is not. The screen is kept
 * awake while it is shown (Wake Lock, where the browser has it).
 *
 *   cards     card views (services/idCardViews.cardView)
 *   index     which one to open on
 *   onDownload(card) / onPrint(card)   omitted → the button is not shown
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import IdCard3D from './IdCard3D';
import IdCardFace from './IdCardFace';
import { Btn, Ico, IconBtn, StatusBadge } from './icUI';
import { STATUS, fmtDate, fmtDay, REISSUE_REASON } from './icMeta';

let openViewers = 0;

function useLockScroll(open) {
  useEffect(() => {
    if (!open) return undefined;
    openViewers += 1;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      openViewers -= 1;
      if (!openViewers) document.body.style.overflow = prev;
    };
  }, [open]);
}

/** Keep the screen on while a card is being shown. */
function useWakeLock(on) {
  useEffect(() => {
    if (!on || !navigator.wakeLock?.request) return undefined;
    let lock = null;
    let alive = true;
    const take = () => navigator.wakeLock.request('screen').then((l) => { if (alive) lock = l; else l.release(); }).catch(() => {});
    take();
    const again = () => { if (document.visibilityState === 'visible') take(); };
    document.addEventListener('visibilitychange', again);
    return () => { alive = false; document.removeEventListener('visibilitychange', again); lock?.release?.().catch(() => {}); };
  }, [on]);
}

function useClock(on) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

/** The rail's second line: the class that year (a student), else when it was issued — and any reissue. */
function railLine(c) {
  const s = c.snapshot || {};
  const parts = [];
  if (c.kind === 'student') parts.push([[s.className, s.sectionName].filter(Boolean).join(' – '), s.rollNumber ? `Roll ${s.rollNumber}` : ''].filter(Boolean).join(' · '));
  else parts.push(`Issued ${fmtDate(c.issuedAt)}`);
  if (c.reissueNo > 0) parts.push(REISSUE_REASON[c.reissueReason] ? `Reissue ${c.reissueNo} (${REISSUE_REASON[c.reissueReason].toLowerCase()})` : `Reissue ${c.reissueNo}`);
  return parts.filter(Boolean).join(' · ');
}

export function cardWords(c) {
  if (!c) return '';
  const s = c.status;
  if (s === 'active') return c.kind === 'student' ? `Valid for ${c.academicYear?.yearName || 'this year'}` : 'Valid — in force';
  if (s === 'generated') return `For ${c.academicYear?.yearName || 'next year'} — not yet in force`;
  if (s === 'expired') return `Expired — this card was for ${c.academicYear?.yearName || c.snapshot?.yearName || 'an earlier year'}`;
  if (s === 'blocked') return c.statusReason ? `Blocked — ${c.statusReason}` : 'Blocked by the school';
  if (s === 'lost') return 'Reported lost — no longer valid';
  if (s === 'damaged') return 'Reported damaged — replaced';
  if (s === 'reissued') return 'Replaced by a newer card';
  if (s === 'cancelled') return c.statusReason ? `Cancelled — ${c.statusReason}` : 'Cancelled';
  return STATUS[s]?.label || s;
}

function Present({ card, school, onClose }) {
  const now = useClock(true);
  useWakeLock(true);
  const [back, setBack] = useState(false);
  const valid = card.status === 'active';
  const look = card.design || {};
  const w = Math.min(window.innerWidth - 48, card.design?.layout === 'landscape' ? 300 : 330);
  return (
    <div className={`icv-present${valid ? '' : ' is-void'}`}>
      <div className="icv-present__top">
        <span className="icv-present__school">{look.identity?.name || school?.name}</span>
        <span className="icv-live"><i />LIVE · {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        <span className="icv-present__date">{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>
      <div className="icv-present__card">
        <IdCard3D card={card} width={w} flipped={back} onFlip={setBack} idle entrance={false} label="Your ID card — tap to show the QR code" />
      </div>
      <div className={`icv-verdict${valid ? '' : ' is-void'}`}>
        <Ico name={valid ? 'checkDisc' : 'crossDisc'} size={22} />
        <span>{cardWords(card)}</span>
      </div>
      <p className="icv-present__tip">{back ? 'The guard scans this code to check the card.' : 'Tap the card to show its QR code.'}</p>
      <Btn kind="dark" icon="close" onClick={onClose}>Done</Btn>
    </div>
  );
}

export default function CardViewer({ open, onClose, cards = [], index = 0, title, onDownload, onPrint, present: presentable = false, startPresenting = false, school }) {
  const [at, setAt] = useState(index);
  const [back, setBack] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [busy, setBusy] = useState('');
  const closeRef = useRef(null);
  useLockScroll(open);

  useEffect(() => { if (open) { setAt(index); setBack(false); setPresenting(!!startPresenting); } }, [open, index, startPresenting]);
  useEffect(() => { setBack(false); }, [at]);
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); if (presenting) setPresenting(false); else onClose(); }
    };
    document.addEventListener('keydown', key);
    closeRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', key);
  }, [open, onClose, presenting]);

  const card = cards[at] || cards[0];
  const run = useCallback(async (what, fn) => {
    setBusy(what);
    try { await fn(card); } finally { setBusy(''); }
  }, [card]);

  if (!open || !card) return null;
  const landscape = card.design?.layout === 'landscape';
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const fitH = Math.max(220, (vh - 300) / (landscape ? 1.45 : 1.85));
  const width = Math.round(Math.min(landscape ? 310 : 300, vw - 64, fitH));

  return createPortal(
    <div className="icv" role="dialog" aria-modal="true" aria-label={title || 'ID card'}>
      {presenting ? <Present card={card} school={school} onClose={() => setPresenting(false)} /> : (
        <>
          <div className="icv-bar">
            <div className="icv-bar__who">
              <strong>{title || card.snapshot?.name}</strong>
              <span>{card.number}{card.kind === 'student' && card.academicYear?.yearName ? ` · ${card.academicYear.yearName}` : ''}</span>
            </div>
            <StatusBadge status={card.status} size="lg" />
            <IconBtn ref={closeRef} icon="close" label="Close" className="icv-close" onClick={onClose} />
          </div>

          <div className={`icv-body${cards.length > 1 ? ' has-rail' : ''}`}>
            {cards.length > 1 ? (
              <nav className="icv-rail" aria-label="Cards">
                <div className="icv-rail__title">{cards[0]?.kind === 'student' ? 'Every year' : 'Every card'}</div>
                {cards.map((c, i) => (
                  <button key={c._id} type="button" className={`icv-rail__item${i === at ? ' is-on' : ''}`} onClick={() => setAt(i)} aria-current={i === at ? 'true' : undefined}>
                    <span className="icv-rail__thumb"><IdCardFace card={c} side="front" /></span>
                    <span className="icv-rail__text">
                      <strong>{c.kind === 'student' ? (c.academicYear?.yearName || c.snapshot?.yearName) : c.number}</strong>
                      <em>{railLine(c) || c.number}</em>
                      <StatusBadge status={c.status} size="sm" />
                    </span>
                  </button>
                ))}
              </nav>
            ) : null}
            <div className="icv-stage">
              <div className={`icv-words${card.status === 'active' ? '' : ' is-void'}`}>
                <Ico name={card.status === 'active' ? 'checkDisc' : card.status === 'generated' ? 'hourglass' : 'crossDisc'} size={16} />
                {cardWords(card)}
              </div>
              <IdCard3D key={card._id} card={card} width={width} lanyard flipped={back} onFlip={setBack} hint />
            </div>
          </div>

          <div className="icv-tools">
            <Btn kind="dark" icon="flip" onClick={() => setBack((b) => !b)}>{back ? 'Show front' : 'Show back'}</Btn>
            {onDownload ? <Btn kind="dark" icon="download" busy={busy === 'pdf'} onClick={() => run('pdf', onDownload)}>Download PDF</Btn> : null}
            {onPrint ? <Btn kind="dark" icon="printer" busy={busy === 'print'} onClick={() => run('print', onPrint)}>Print</Btn> : null}
            {presentable && card.status !== 'expired' ? <Btn kind="light" icon="fullscreen" onClick={() => setPresenting(true)}>Show at the gate</Btn> : null}
          </div>
          <div className="icv-meta">
            {card.kind === 'student' && (card.validUntil || card.snapshot?.yearEnd) ? <span>Valid till {fmtDay(card.validUntil || card.snapshot.yearEnd)}</span> : null}
            <span>Issued {fmtDate(card.issuedAt)}</span>
            {card.reissueNo > 0 ? <span>Reissue {card.reissueNo}{REISSUE_REASON[card.reissueReason] ? ` · ${REISSUE_REASON[card.reissueReason]}` : ''}</span> : null}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
