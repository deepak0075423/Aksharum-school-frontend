/**
 * "Scan ID" (Oct 2026): a card scanner types the QR's address (or the card's
 * number) and Enter — or the nurse types an admission number — and the
 * student is found (services/medicalKiosk.resolve). Identity only here; the
 * record opens on its own page, where the opening is recorded.
 */
import React, { useState } from 'react';
import * as api from '../../../api/medical.api';
import { Dialog, Btn, Field, Note, Avatar } from '../mdUI';
import { errorText } from '../mdMeta';

export default function ScanIdDialog({ open, onClose, onOpen, onVisit }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!open) return null;
  const close = () => { setQ(''); setFound(null); setErr(''); onClose(); };
  const find = async () => {
    if (!q.trim()) return;
    setBusy(true); setErr(''); setFound(null);
    try { const r = await api.resolveMedStudent(q.trim()); setFound(r?.data ?? r); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const s = found?.student;
  return (
    <Dialog open onClose={close} title="Scan an ID card" icon="idCard" tone="indigo" width={480}
      footer={s ? <><Btn onClick={() => { setFound(null); setQ(''); }}>Scan another</Btn><Btn onClick={() => { onOpen(s); close(); }}>Open the record</Btn>{s.isActive ? <Btn kind="primary" icon="stethoscope" onClick={() => { onVisit(s); close(); }}>Add Medical Visit</Btn> : null}</>
        : <><Btn onClick={close}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!q.trim()} onClick={find}>Find</Btn></>}>
      {!s ? (
        <Field label="Scan the card, or type its number or an admission number">
          <input className="md-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); find(); } }} placeholder="Scan now…" aria-label="Card or admission number" />
        </Field>
      ) : (
        <div className="mdk-found">
          <Avatar name={s.name} photo={s.photo} size={64} />
          <div><b>{s.name}</b><em>{s.classLabel || 'No class'} · {s.admissionNumber}</em><em>{found.via === 'card' ? `ID card ${found.cardNumber}` : 'Found by admission number'}</em></div>
        </div>
      )}
      {found?.cardWarning ? <Note tone="amber" icon="alertTri">{found.cardWarning}.</Note> : null}
      {s && !s.isActive ? <Note tone="slate" icon="info">{s.name} has left the school — the record can be read, nothing new is added.</Note> : null}
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}
