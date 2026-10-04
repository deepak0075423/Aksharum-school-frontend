/**
 * The office's dialogs for one card (Oct 2026): bring it up to date, report it
 * lost or damaged, replace it, block, activate or cancel it — and print or
 * download a set of cards. Every one says what will happen before it does it.
 *
 * `useCardActions(onDone)` hands a page `act(action, card, extra)` and the
 * `dialogs` element to render once. The shared Modal sits under the Drawer, so
 * these overlays are lifted above it (styles/idcards.css, .ic-dialog).
 */
import React, { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui';
import {
  regenerateIdCard, reportIdCard, replaceIdCard, blockIdCard, activateIdCard, cancelIdCard,
  printIdCards, downloadIdCardAdmin,
} from '../../../api/idcards.api';
import { Btn, Ico, Segmented, Switch, Note, StatusBadge } from '../icUI';
import { KIND, errorText, pdfName, plural, printBlob, saveBlob } from '../icMeta';

export const Dialog = ({ open, onClose, title, icon, tone = 'indigo', children, footer, width = 520 }) => (
  <Modal open={open} onClose={onClose} title={title} maxWidth={width} footer={footer}>
    <div className={`ic-dialog ic-t-${tone}`}>
      {icon ? <span className="ic-dialog__mark"><Ico name={icon} size={22} /></span> : null}
      <div className="ic-dialog__body">{children}</div>
    </div>
  </Modal>
);

const BLOCK_REASONS = ['Under suspension', 'Fee and ID verification pending', 'Under investigation', 'Card misused'];
const CANCEL_REASONS = ['Left the school', 'Issued in error', 'Duplicate record', 'No longer linked to a student'];

function Reasons({ list, value, onPick }) {
  return (
    <div className="ic-reasons">
      {list.map((r) => (
        <button key={r} type="button" className={value === r ? 'is-on' : ''} onClick={() => onPick(value === r ? '' : r)}>{r}</button>
      ))}
    </div>
  );
}

/** Who and which card, at the top of every dialog. */
const Subject = ({ card }) => (
  <div className="ic-dialog__subject">
    <strong>{card?.snapshot?.name || card?.name}</strong>
    <span>{card?.number}{card?.yearName || card?.academicYear?.yearName ? ` · ${card.yearName || card.academicYear.yearName}` : ''}</span>
    {card?.status ? <StatusBadge status={card.status} size="sm" /> : null}
  </div>
);

function ChangeList({ changes }) {
  if (!changes?.length) return null;
  return (
    <ul className="ic-changes">
      {changes.map((c) => (
        <li key={c.key}><span>{c.label}</span><s>{c.was || '—'}</s><Ico name="arrowRight" size={14} /><b>{c.now || '—'}</b></li>
      ))}
    </ul>
  );
}

/**
 * card: anything with _id, number, snapshot/name, status, printedAt; for
 * regenerate also `changes` (from the drawer's detail) when known.
 */
export function useCardActions(onDone) {
  const [d, setD] = useState(null);        // { action, card, ... }
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});
  const close = useCallback(() => { if (!busy) { setD(null); setForm({}); } }, [busy]);

  const act = useCallback((action, card, extra = {}) => {
    setForm(action === 'report' ? { status: extra.status || 'lost', replace: true, note: '' } : { note: '', reason: '' });
    setD({ action, card, ...extra });
  }, []);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const res = await fn();
      toast.success(res?.message || okMsg);
      setD(null); setForm({});
      onDone?.(res?.data, d);
    } catch (e) {
      toast.error(await errorText(e, 'That could not be done'));
    } finally {
      setBusy(false);
    }
  };

  const card = d?.card;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  let dialog = null;
  if (d?.action === 'regenerate') {
    const inPlace = !card.printedAt;
    dialog = (
      <Dialog open onClose={close} title={inPlace ? 'Update the card' : 'Reissue the card'} icon="regen" tone="indigo"
        footer={<><Btn onClick={close}>Cancel</Btn><Btn kind="primary" icon="regen" busy={busy} onClick={() => run(() => regenerateIdCard(card._id, { note: form.note }), 'Card updated')}>{inPlace ? 'Update card' : 'Reissue card'}</Btn></>}>
        <Subject card={card} />
        {d.changes?.length ? <><p className="ic-dialog__lead">Since this card was issued:</p><ChangeList changes={d.changes} /></> : <p className="ic-dialog__lead">The card will be redrawn from the latest details on record.</p>}
        <Note tone={inPlace ? 'green' : 'amber'} icon={inPlace ? 'checkCircle' : 'alert'}>
          {inPlace
            ? <>This card has <b>not been printed yet</b>, so it is updated in place — the same card number and QR code.</>
            : <>This card <b>has been printed</b>. A new card with a new number is issued and <b>{card.number}</b> stops verifying as current — collect the old card if you can.</>}
        </Note>
        <label className="ic-field">
          <span className="ic-field__label">Note <em>(optional)</em></span>
          <input className="ic-input" value={form.note || ''} onChange={(e) => set('note')(e.target.value)} placeholder="e.g. Moved from VIII-A to VIII-B" maxLength={300} />
        </label>
      </Dialog>
    );
  } else if (d?.action === 'report') {
    dialog = (
      <Dialog open onClose={close} title="Report lost or damaged" icon="alertTri" tone="orange"
        footer={<><Btn onClick={close}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={() => run(() => reportIdCard(card._id, { status: form.status, note: form.note, replace: form.replace }), 'Card reported')}>
          {form.replace ? `Mark ${form.status} & issue replacement` : `Mark as ${form.status}`}
        </Btn></>}>
        <Subject card={card} />
        <Segmented value={form.status} onChange={set('status')} label="What happened" options={[{ value: 'lost', label: 'Lost', icon: 'search' }, { value: 'damaged', label: 'Damaged', icon: 'alert' }]} />
        <p className="ic-dialog__lead">
          {card.number} stops verifying at once{form.status === 'lost' ? ' — if anyone scans it, they are told it was reported lost' : ''}. The record stays in the card&rsquo;s history.
        </p>
        <Switch checked={form.replace} onChange={set('replace')} label="Issue the replacement now"
          hint={card.kind === 'student' ? 'A new card for the same academic year, marked as a duplicate.' : 'A new card, marked as a duplicate.'} />
        <label className="ic-field">
          <span className="ic-field__label">Note <em>(optional)</em></span>
          <input className="ic-input" value={form.note || ''} onChange={(e) => set('note')(e.target.value)} placeholder={form.status === 'lost' ? 'e.g. Lost on the school bus' : 'e.g. Card cracked'} maxLength={300} />
        </label>
      </Dialog>
    );
  } else if (d?.action === 'replace') {
    dialog = (
      <Dialog open onClose={close} title="Issue the replacement" icon="cardStack" tone="indigo"
        footer={<><Btn onClick={close}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={() => run(() => replaceIdCard(card._id, { note: form.note }), 'Replacement issued')}>Issue replacement</Btn></>}>
        <Subject card={card} />
        <p className="ic-dialog__lead">A new card is issued with the latest details and marked as a duplicate. {card.number} stays on record as {card.status}.</p>
        <label className="ic-field">
          <span className="ic-field__label">Note <em>(optional)</em></span>
          <input className="ic-input" value={form.note || ''} onChange={(e) => set('note')(e.target.value)} placeholder="e.g. Replacement fee paid" maxLength={300} />
        </label>
      </Dialog>
    );
  } else if (d?.action === 'block') {
    dialog = (
      <Dialog open onClose={close} title="Block this card" icon="ban" tone="red"
        footer={<><Btn onClick={close}>Cancel</Btn><Btn kind="danger-solid" icon="ban" busy={busy} disabled={!String(form.reason || '').trim()} onClick={() => run(() => blockIdCard(card._id, { reason: form.reason }), 'Card blocked')}>Block card</Btn></>}>
        <Subject card={card} />
        <p className="ic-dialog__lead">While blocked, the card does not verify — a scan says it is blocked. You can activate it again at any time.</p>
        <Reasons list={BLOCK_REASONS} value={form.reason} onPick={set('reason')} />
        <label className="ic-field">
          <span className="ic-field__label">Reason</span>
          <input className="ic-input" value={form.reason || ''} onChange={(e) => set('reason')(e.target.value)} placeholder="Why is it blocked?" maxLength={200} autoFocus />
        </label>
      </Dialog>
    );
  } else if (d?.action === 'activate') {
    dialog = (
      <Dialog open onClose={close} title="Activate this card" icon="checkDisc" tone="green"
        footer={<><Btn onClick={close}>Cancel</Btn><Btn kind="primary" busy={busy} onClick={() => run(() => activateIdCard(card._id), 'Card activated')}>Activate card</Btn></>}>
        <Subject card={card} />
        <p className="ic-dialog__lead">The card verifies as valid again{card.statusReason ? ` — it was blocked: “${card.statusReason}”` : ''}.</p>
      </Dialog>
    );
  } else if (d?.action === 'cancel') {
    dialog = (
      <Dialog open onClose={close} title="Cancel this card" icon="trash" tone="red"
        footer={<><Btn onClick={close}>Keep card</Btn><Btn kind="danger-solid" busy={busy} disabled={!String(form.reason || '').trim()} onClick={() => run(() => cancelIdCard(card._id, { reason: form.reason }), 'Card cancelled')}>Cancel card</Btn></>}>
        <Subject card={card} />
        <Note tone="red" icon="alert">A cancelled card never verifies again and cannot be reactivated. To give {card?.snapshot?.name || 'them'} a card later, generate a new one.</Note>
        <Reasons list={CANCEL_REASONS} value={form.reason} onPick={set('reason')} />
        <label className="ic-field">
          <span className="ic-field__label">Reason</span>
          <input className="ic-input" value={form.reason || ''} onChange={(e) => set('reason')(e.target.value)} placeholder="Why is it cancelled?" maxLength={200} />
        </label>
      </Dialog>
    );
  }

  return { act, dialogs: dialog };
}

/* ── Printing ─────────────────────────────────────────────────────────────── */

/**
 * Print or download a set of cards. `cards` [{ _id, number, snapshot?, design? }];
 * the layout decides the paper: A4 sheets of nine (ten landscape) with crop
 * marks, or one card per page for a PVC card printer.
 */
export function PrintDialog({ open, onClose, cards = [], onDone, title }) {
  const [layout, setLayout] = useState('sheet');
  const [sides, setSides] = useState('both');
  const [marks, setMarks] = useState(true);
  const [busy, setBusy] = useState('');
  const n = cards.length;
  const pages = useMemo(() => {
    if (!n) return 0;
    const per = layout === 'card' ? 1 : 9;
    const sheets = layout === 'card' ? n : Math.ceil(n / per);
    return sheets * (sides === 'both' ? 2 : 1);
  }, [n, layout, sides]);

  const go = async (how) => {
    setBusy(how);
    try {
      const blob = n === 1 && layout === 'card' && how === 'download'
        ? await downloadIdCardAdmin(cards[0]._id, 'card')
        : await printIdCards({ cardIds: cards.map((c) => c._id), layout, sides, cropMarks: marks });
      if (how === 'print') printBlob(blob);
      else saveBlob(blob, n === 1 ? pdfName(cards[0]) : `id-cards-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success(how === 'print' ? 'Sent to the printer' : `${plural(n, 'card')} downloaded`);
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(await errorText(e, 'The cards could not be prepared'));
    } finally {
      setBusy('');
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title={title || `Print ${plural(n, 'card')}`} icon="printer" width={560}
      footer={<>
        <Btn onClick={onClose} disabled={!!busy}>Cancel</Btn>
        <Btn icon="download" busy={busy === 'download'} disabled={!n || !!busy} onClick={() => go('download')}>Download PDF</Btn>
        <Btn kind="primary" icon="printer" busy={busy === 'print'} disabled={!n || !!busy} onClick={() => go('print')}>Print</Btn>
      </>}>
      <div className="ic-print">
        <button type="button" className={`ic-print__opt${layout === 'sheet' ? ' is-on' : ''}`} onClick={() => setLayout('sheet')}>
          <span className="ic-print__art ic-print__art--sheet" aria-hidden>{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
          <strong>A4 sheets</strong>
          <em>Nine cards a page with crop marks — print, cut and laminate.</em>
        </button>
        <button type="button" className={`ic-print__opt${layout === 'card' ? ' is-on' : ''}`} onClick={() => setLayout('card')}>
          <span className="ic-print__art ic-print__art--card" aria-hidden><i /></span>
          <strong>Card printer</strong>
          <em>One card per page at true size (CR80, 85.6 × 54 mm) for a PVC printer.</em>
        </button>
      </div>
      <div className="ic-print__row">
        <span>Sides</span>
        <Segmented size="sm" value={sides} onChange={setSides} label="Sides" options={[{ value: 'both', label: 'Front & back' }, { value: 'front', label: 'Front only' }, { value: 'back', label: 'Back only' }]} />
      </div>
      {layout === 'sheet' ? <Switch checked={marks} onChange={setMarks} label="Crop marks" hint="Fine lines at each card's corners to cut along." /> : null}
      <Note tone="slate" icon="info">
        {plural(n, 'card')} · {plural(pages, 'page')}. Print at <b>actual size (100%)</b>{sides === 'both' && layout === 'sheet' ? ', double-sided, flipping on the long edge — each back lands behind its front' : ''}. Printed cards are marked as printed.
      </Note>
    </Dialog>
  );
}

export const kindNoun = (kind) => KIND[kind]?.label.toLowerCase() || 'holder';
