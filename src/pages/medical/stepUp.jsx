/**
 * "Confirm it is you" (Oct 2026) — when the school asks the medical staff to
 * confirm with an emailed code (settings.requireStepUp), a medical request
 * answers 403 MEDICAL_STEP_UP. api/axios.js then asks the one <StepUpHost />
 * (mounted by admin/MedicalShell.jsx round every /admin/medical page): it
 * emails a code, takes it, keeps the 12-hour token for this browser tab, and
 * the request is sent again.
 */
import React, { useEffect, useState } from 'react';
import * as api from '../../api/medical.api';
import { Dialog, Btn, Field, Note } from './mdUI';
import { errorText } from './mdMeta';

export const STEP_UP_KEY = 'medicalStepUp';

/** Ask for the code; resolves true when this tab holds a good token. */
export function StepUpHost() {
  const [pending, setPending] = useState(null);     // { resolve }
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const on = (e) => { setPending(e.detail); setSentTo(''); setCode(''); setErr(''); };
    window.addEventListener('medical:stepup', on);
    window.__medicalStepUpHost = (window.__medicalStepUpHost || 0) + 1;
    return () => { window.removeEventListener('medical:stepup', on); window.__medicalStepUpHost -= 1; };
  }, []);
  if (!pending) return null;
  const finish = (ok) => { pending.resolve(ok); setPending(null); };
  const send = async () => {
    setBusy(true); setErr('');
    try { const r = await api.sendStepUpCode(pending.force); setSentTo((r?.data ?? r)?.sentTo || 'your email'); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.verifyStepUpCode(code);
      try { sessionStorage.setItem(STEP_UP_KEY, (r?.data ?? r).token); } catch { /* a private window: this request only */ }
      finish(true);
    } catch (e) { setErr(errorText(e)); setBusy(false); return; }
    setBusy(false);
  };
  return (
    <Dialog open onClose={() => finish(false)} title="Confirm it is you" icon="lock" tone="indigo" width={460}
      footer={<><Btn onClick={() => finish(false)} disabled={busy}>Cancel</Btn>{sentTo ? <Btn kind="primary" busy={busy} disabled={code.replace(/\D/g, '').length !== 6} onClick={verify}>Confirm</Btn> : <Btn kind="primary" busy={busy} onClick={send}>Email me a code</Btn>}</>}>
      <Note tone="indigo" icon="info">{pending.force ? 'Before everyone is asked for a code, make sure the school\'s email reaches you.' : 'Your school asks the medical staff to confirm who they are every 12 hours before opening medical records.'}</Note>
      {sentTo ? (
        <Field label={`The code sent to ${sentTo}`} required>
          <input className="md-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={7} placeholder="6 digits" autoFocus />
        </Field>
      ) : null}
      {err ? <Note tone="red" icon="alert">{err}</Note> : null}
    </Dialog>
  );
}

/** For a screen that must prove email works first (turning the code on). */
export const askStepUp = (force = false) => new Promise((resolve) => {
  if (!window.__medicalStepUpHost) { resolve(false); return; }
  window.dispatchEvent(new CustomEvent('medical:stepup', { detail: { resolve, force } }));
});
