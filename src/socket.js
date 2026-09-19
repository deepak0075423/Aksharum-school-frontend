import { io } from 'socket.io-client';

// Gateway runs on a separate port/service from the API backend.
// VITE_WS_GATEWAY_URL defaults to port 4000 in local dev.
const GATEWAY_URL = import.meta.env.VITE_WS_GATEWAY_URL || 'http://localhost:4000';

let socket = null;

// Everyone who wants to know whether live delivery is up (the chat page's
// "Reconnecting…" strip). 'connecting' | 'connected' | 'offline'.
let state = 'offline';
const stateListeners = new Set();
function setState(next) {
  if (next === state) return;
  state = next;
  stateListeners.forEach((fn) => { try { fn(state); } catch { /* listener's problem */ } });
}

export function connectSocket() {
  // Idempotent: multiple providers (Header, ChatNotify, Chat) all ensure the
  // socket — return the existing singleton whether it's connected or still
  // handshaking, so we never open a second connection.
  if (socket) return socket;
  if (!localStorage.getItem('token')) return null;

  socket = io(GATEWAY_URL, {
    // Read the token on every (re)connect, not once: the API refreshes it when
    // it expires, and a reconnect presenting the old one was refused for good.
    auth: (cb) => cb({ token: localStorage.getItem('token') }),
    transports: ['websocket', 'polling'],
    // Keep trying for as long as the page is open — live chat giving up after
    // ten attempts left a tab silently deaf until it was reloaded.
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  setState('connecting');

  socket.on('connect', () => setState('connected'));
  socket.on('disconnect', (reason) => {
    // The server hung up on purpose (e.g. an auth failure) — socket.io will not
    // retry that on its own, so ask again once; `auth` reads a fresh token.
    if (reason === 'io server disconnect') socket.connect();
    setState('connecting');
  });
  socket.on('connect_error', () => setState(navigator.onLine === false ? 'offline' : 'connecting'));

  watchNetwork();
  return socket;
}

// A laptop waking up or a phone coming back into signal should not have to
// wait out the backoff. Registered once; always acts on the current socket.
let watching = false;
function watchNetwork() {
  if (watching) return;
  watching = true;
  const kick = () => { if (socket && !socket.connected) socket.connect(); };
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  window.addEventListener('offline', () => { if (socket) setState('offline'); });
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  setState('offline');
}

export function getSocket() {
  return socket;
}

export const socketState = () => state;

export function onSocketState(fn) {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

/**
 * Emit and wait for the server's acknowledgement.
 * Resolves with the ack payload; rejects when not connected or on timeout, so
 * the caller can fall back to REST.
 */
export function emitWithAck(event, payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) { reject(new Error('not connected')); return; }
    socket.timeout(timeoutMs).emit(event, payload, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}
