/**
 * The Medical Room's walk-in kiosk (Oct 2026) — a tablet at the door, signed
 * in as the room (a nurse or the school admin), full screen.
 *
 *   setup     the nurse picks a four-digit PIN that is needed to leave the
 *             kiosk (kept in this tab only)
 *   check-in  a student scans their ID card or types their admission
 *             number, sees their own name and photo — nothing medical — says
 *             why they came, and the desk gets a request "at the door"
 *             (services/medicalKiosk.walkIn)
 *
 * Every screen goes back to the start after a minute untouched. The kiosk
 * runs on the staff member's sign-in: leave it only through the PIN, and do
 * not leave the tablet unattended in kiosk mode outside the room's hours.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../api/medical.api';
import { Btn, Avatar, Note, Spin } from './mdUI';
import { errorText } from './mdMeta';
import { StepUpHost } from './stepUp';

const PIN_KEY = 'medicalKioskPin';
const IDLE_MS = 60000;
const pinOf = () => { try { return sessionStorage.getItem(PIN_KEY) || ''; } catch { return ''; } };

export default function MedicalKiosk() {
  const nav = useNavigate();
  const [meta, setMeta] = useState(null);
  const [fail, setFail] = useState('');
  const [pin, setPin] = useState(pinOf());
  const [newPin, setNewPin] = useState('');
  const [stage, setStage] = useState('scan');        // scan | confirm | reason | done
  const [q, setQ] = useState('');
  const [who, setWho] = useState(null);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [exitPin, setExitPin] = useState('');
  const input = useRef(null);
  const idle = useRef(null);

  useEffect(() => {
    api.getKioskMeta().then((r) => setMeta(r?.data ?? r)).catch((e) => setFail(e?.status === 403 && e?.data?.code !== 'MEDICAL_STEP_UP' ? 'The kiosk runs on a Medical Room account — sign in as the nurse or the school admin.' : errorText(e)));
  }, []);
  const reset = useCallback(() => { setStage('scan'); setQ(''); setWho(null); setReason(''); setOther(''); setUrgent(false); setMsg(''); setBusy(false); setTimeout(() => input.current?.focus(), 50); }, []);
  // Back to the start after a minute untouched (and a few seconds after "thank you").
  useEffect(() => {
    clearTimeout(idle.current);
    if (stage !== 'scan') idle.current = setTimeout(reset, stage === 'done' ? 8000 : IDLE_MS);
    return () => clearTimeout(idle.current);
  }, [stage, reason, other, reset]);

  const find = async () => {
    if (!q.trim()) return;
    setBusy(true); setMsg('');
    try {
      const r = await api.resolveMedStudent(q.trim());
      const s = (r?.data ?? r).student;
      if (!s.isActive) { setMsg('This card belongs to a student who has left. Please see the nurse.'); setBusy(false); return; }
      setWho(s); setStage('confirm');
    } catch (e) { setMsg(e?.status === 404 || e?.status === 409 ? 'That card or number was not found. Try again, or knock on the door.' : errorText(e)); }
    finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api.kioskWalkIn({ student: who._id, reason, symptoms: reason === 'Something else' ? other : '', urgent });
      const x = r?.data ?? r;
      setMsg(x.already ? x.message : `Thank you, ${who.name.split(' ')[0]}. Please sit down — the nurse will see you soon.`);
      setStage('done');
    } catch (e) { setMsg(errorText(e)); } finally { setBusy(false); }
  };

  if (fail) return <div className="mdk"><div className="mdk-card"><h1>Medical Room kiosk</h1><Note tone="red" icon="alert">{fail}</Note><Btn onClick={() => nav('/admin/medical/dashboard')}>Back</Btn></div><StepUpHost /></div>;
  if (!meta) return <div className="mdk"><Spin /><StepUpHost /></div>;
  if (!pin) {
    return (
      <div className="mdk">
        <div className="mdk-card">
          <h1>Start the kiosk</h1>
          <p>The tablet will show only the check-in screen. Choose a four-digit PIN — it is needed to leave the kiosk.</p>
          <input data-text="digits" className="mdk-input" inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN" aria-label="Exit PIN" />
          <div className="mdk-row">
            <Btn onClick={() => nav('/admin/medical/dashboard')}>Cancel</Btn>
            <Btn kind="primary" disabled={newPin.length !== 4} onClick={() => { try { sessionStorage.setItem(PIN_KEY, newPin); } catch { /* this tab only */ } setPin(newPin); reset(); }}>Start the kiosk</Btn>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mdk" onClick={() => { if (stage === 'scan') input.current?.focus(); }}>
      <button type="button" className="mdk-exit" onClick={(e) => { e.stopPropagation(); setExiting(true); setExitPin(''); }}>Staff</button>
      <div className="mdk-card">
        <h1>{meta.room?.name || 'Medical Room'}</h1>
        {stage === 'scan' ? (
          <>
            <p>Scan your ID card, or type your admission number.</p>
            <input ref={input} className="mdk-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') find(); }} placeholder="Admission number" aria-label="ID card or admission number" />
            <Btn kind="primary" busy={busy} disabled={!q.trim()} onClick={find}>Next</Btn>
          </>
        ) : null}
        {stage === 'confirm' && who ? (
          <>
            <div className="mdk-who"><Avatar name={who.name} photo={who.photo} size={96} /><div><b>{who.name}</b><em>{who.classLabel}</em></div></div>
            <p>Is this you?</p>
            <div className="mdk-row"><Btn onClick={reset}>No</Btn><Btn kind="primary" onClick={() => setStage('reason')}>Yes, it is me</Btn></div>
          </>
        ) : null}
        {stage === 'reason' ? (
          <>
            <p>Why have you come?</p>
            <div className="mdk-reasons">
              {(meta.reasons || []).map((r) => <button key={r} type="button" className={reason === r ? 'is-on' : ''} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}
            </div>
            {reason === 'Something else' ? <input className="mdk-input" value={other} onChange={(e) => setOther(e.target.value)} placeholder="What is wrong?" maxLength={120} aria-label="What is wrong" /> : null}
            <label className="mdk-urgent"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> It is bad — I need the nurse now</label>
            <div className="mdk-row"><Btn onClick={reset}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!reason || (reason === 'Something else' && other.trim().length < 3)} onClick={send}>Tell the nurse</Btn></div>
          </>
        ) : null}
        {stage === 'done' ? <><p className="mdk-thanks">{msg}</p><Btn onClick={reset}>Done</Btn></> : null}
        {msg && stage !== 'done' ? <Note tone="amber" icon="info">{msg}</Note> : null}
      </div>
      {exiting ? (
        <div className="mdk-exitbox" onClick={(e) => e.stopPropagation()}>
          <p>Staff PIN to leave the kiosk</p>
          <input data-text="digits" className="mdk-input" inputMode="numeric" maxLength={4} autoFocus value={exitPin} onChange={(e) => setExitPin(e.target.value.replace(/\D/g, ''))} aria-label="Staff PIN" />
          <div className="mdk-row">
            <Btn onClick={() => setExiting(false)}>Cancel</Btn>
            <Btn kind="primary" disabled={exitPin.length !== 4} onClick={() => {
              if (exitPin !== pin) { setExitPin(''); return; }
              try { sessionStorage.removeItem(PIN_KEY); } catch { /* fine */ }
              nav('/admin/medical/dashboard');
            }}>Leave the kiosk</Btn>
          </div>
        </div>
      ) : null}
      <StepUpHost />
    </div>
  );
}
