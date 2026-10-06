/**
 * Web Push (Oct 2026): this browser shows the signed-in person's
 * notifications and chat messages as the operating system's own desktop
 * notifications — even with no Aksharum tab open. public/push-sw.js shows
 * them; the server sends them (school-backend/services/pushService) right
 * after the same notification goes out live over the websocket.
 *
 *   enableWebPush()    after sign-in, once notifications are allowed: the
 *                      service worker, a subscription with the server's key,
 *                      the device registered for this person
 *   disableWebPush(t)  on sign-out (t = the session token, read before the
 *                      session is cleared): the device removed, unsubscribed
 *   isWebPushOn()      while on, the page does not raise its own desktop
 *                      notification as well (Header, ChatNotifyContext)
 *
 * A browser without Web Push (or with notifications refused) keeps the old
 * behaviour: an open tab raises the desktop notification itself.
 */
import api from '../api/axios';

const SW_URL = '/push-sw.js';
const API_BASE = import.meta.env.VITE_API_URL || '/api';
let on = false;

export const isWebPushOn = () => on;

function supported() {
  return typeof window !== 'undefined' && window.isSecureContext
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** The server's public key, as the bytes PushManager wants. */
function keyBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** The key a subscription was made with, as the server writes it (base64url, no padding) — '' when the browser does not say. */
function keyOf(sub) {
  const had = sub?.options?.applicationServerKey;
  if (!had) return '';
  let bin = '';
  new Uint8Array(had).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deviceName() {
  const ua = navigator.userAgent || '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` on ${os}` : ''}`;
}

async function subscribeAndRegister() {
  const reg = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;
  const cfg = await api.get('/notifications/push/config');
  const key = (cfg?.data ?? cfg)?.webPublicKey;
  if (!key) return false;
  let sub = await reg.pushManager.getSubscription();
  // Made with a key the server no longer signs with: start again. A browser that does not say which
  // key keeps its subscription — replacing it on every page would leave a trail of dead ones.
  const had = keyOf(sub);
  if (sub && had && had !== key.replace(/=+$/, '')) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await api.post('/notifications/push/devices', { kind: 'web', subscription: sub.toJSON(), deviceName: deviceName() });
  return true;
}

let pending = null;
/**
 * Subscribe this browser for the signed-in person. True when Web Push is now
 * carrying their notifications. One tab at a time (a Web Lock): several tabs
 * opening at once must find the one subscription, not make one each.
 */
export function enableWebPush() {
  if (!supported() || Notification.permission !== 'granted') { on = false; return Promise.resolve(false); }
  if (pending) return pending;
  const run = () => subscribeAndRegister();
  pending = (navigator.locks?.request ? navigator.locks.request('aksharum-web-push', run) : run())
    .then((ok) => { on = !!ok; return on; })
    // A browser that cannot reach its push service (or refuses) — the open tab still notifies.
    .catch(() => { on = false; return false; })
    .finally(() => { pending = null; });
  return pending;
}

/** Ask once (when the browser has not been asked), then subscribe. */
export async function askAndEnable() {
  if (!supported()) return false;
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* the browser said no */ }
  }
  return enableWebPush();
}

/** Signing out: this browser stops showing that person's notifications. `authToken`: the session token, read before it is cleared. */
export async function disableWebPush(authToken) {
  on = false;
  if (!supported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    if (authToken) {
      await fetch(`${API_BASE}/notifications/push/devices/remove`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ endpoint: sub.endpoint }), keepalive: true,
      }).catch(() => {});
    }
    await sub.unsubscribe().catch(() => {});
  } catch { /* signing out regardless */ }
}
