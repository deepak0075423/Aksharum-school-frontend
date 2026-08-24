// Following a notification to wherever it belongs.
//
// The server resolves every notification into a destination for the reader's
// own role — `{ web, mobile, resolved }` — because the same notification opens
// on different screens for a teacher, an admin and a parent. This module is
// only the client half: pick the web path, and remember it across a sign-in
// when someone opened the link while signed out.

/** The web path a notification (or its receipt) opens on, or null. */
export function notificationPath(receiptOrLink) {
  const link = receiptOrLink?.link || receiptOrLink;
  return link?.web || null;
}

/** True when the sender chose this destination, rather than it being the inbox fallback. */
export function hasTarget(receiptOrLink) {
  const link = receiptOrLink?.link || receiptOrLink;
  return !!link?.web && link.resolved !== false;
}

// ── Sign-in hand-off ─────────────────────────────────────────────────────────
// An emailed notification link lands on /n/:id, which needs a session. Rather
// than dropping the person on their dashboard after they sign in, the target is
// parked here and picked up by the login screen.
const PENDING_KEY = 'pendingNotification';

export function rememberPendingNotification(receiptId) {
  try { sessionStorage.setItem(PENDING_KEY, receiptId); } catch { /* private mode */ }
}

export function takePendingNotification() {
  try {
    const id = sessionStorage.getItem(PENDING_KEY);
    if (id) sessionStorage.removeItem(PENDING_KEY);
    return id || null;
  } catch { return null; }
}
