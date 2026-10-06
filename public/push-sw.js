/* Aksharum — Web Push (Oct 2026).
 *
 * Shows the school's notifications and chat messages as the operating
 * system's own desktop notifications, even when no Aksharum tab is open
 * (school-backend/services/pushService sends them; src/utils/webPush.js
 * subscribes this browser after sign-in). The payload is
 * { title, body, url, tag, urgent, kind }.
 *
 * When an Aksharum window is focused, the page itself says it (the toast, the
 * chat badge), so nothing is shown twice. Urgent news stays on screen until it
 * is dismissed. A click focuses an open Aksharum window — or opens one — on
 * the notification's receipt (/n/<receipt>, which marks it read and forwards
 * to the right page) or the chat conversation.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let d = {};
    try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some((w) => w.focused)) return;
    await self.registration.showNotification(d.title || 'Aksharum', {
      body: d.body || '',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      requireInteraction: !!d.urgent,
      icon: '/android-chrome-192x192.png',
      badge: '/favicon-96x96.png',
      data: { url: d.url || '/', kind: d.kind || 'notification' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of windows) {
      if (new URL(w.url).origin !== self.location.origin) continue;
      await w.focus();
      if ('navigate' in w) { await w.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
