/**
 * The Medical Room, live (Oct 2026). The server nudges the medical staff's
 * screens over the socket (`medical:changed` — the kind of record, never what
 * it says) and the teacher who sent a student (`medical:request`); a screen
 * reads again a moment later, through the same guarded endpoints as always.
 * An emergency (`urgent`) also sounds — unless this browser was told not to.
 */
import { useEffect, useRef, useState } from 'react';
import { connectSocket } from '../../socket';

const SOUND_KEY = 'md-live-sound';

export function soundOn() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

/** [on, toggle] — the desk's "sound" switch, remembered in this browser. */
export function useSoundSetting() {
  const [on, setOn] = useState(soundOn);
  const toggle = () => setOn((v) => {
    const next = !v;
    try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* a private window */ }
    if (next) beep();
    return next;
  });
  return [on, toggle];
}

let ctx = null;
/** Two short rising tones. Browsers allow sound only after the page has been clicked once. */
export function beep() {
  if (!soundOn()) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = ctx || new Ctx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    [[880, 0], [1175, 0.22], [880, 0.5], [1175, 0.72]].forEach(([f, at]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + at);
      o.stop(t0 + at + 0.22);
    });
  } catch { /* no sound is never an error */ }
}

/** A live notification from the Medical Room (for `when` on a family's or a teacher's page). */
export const medicalNotice = (n) => String(n?.link?.type || '').startsWith('medical.');

/**
 * Call `reload` (once, shortly after a burst of nudges) whenever the server
 * says something changed. `kinds` limits it to some records; `when` to the
 * events it accepts (a family's page listens to its own live notifications —
 * `notification:new` + medicalNotice — so urgent news shows its answer button
 * at once); `onUrgent` runs for an emergency as it arrives.
 */
export function useMedLive(reload, { event = 'medical:changed', kinds = null, when = null, onUrgent = null } = {}) {
  const ref = useRef({ reload, onUrgent, when });
  ref.current = { reload, onUrgent, when };
  const only = kinds ? kinds.join(',') : '';
  useEffect(() => {
    const sock = connectSocket();
    if (!sock) return undefined;
    let timer = null;
    const on = (data = {}) => {
      if (only && data.kind && !only.split(',').includes(data.kind)) return;
      if (ref.current.when && !ref.current.when(data)) return;
      if (data.urgent) ref.current.onUrgent?.(data);
      clearTimeout(timer);
      timer = setTimeout(() => ref.current.reload?.(), 400);
    };
    sock.on(event, on);
    return () => { clearTimeout(timer); sock.off(event, on); };
  }, [event, only]);
}
