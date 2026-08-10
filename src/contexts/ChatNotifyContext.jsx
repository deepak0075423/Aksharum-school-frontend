import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getChats } from '../api/chat.api';
import { connectSocket, getSocket } from '../socket';

const ChatNotifyContext = createContext({ unreadTotal: 0, refresh: () => {} });
export const useChatNotify = () => useContext(ChatNotifyContext);

const REFRESH_DEBOUNCE_MS = 400;  // coalesce bursts of socket events into one fetch

/**
 * App-wide chat awareness that runs on every authenticated page (not just the
 * chat screen): keeps the unread badge current and fires browser notifications
 * for new messages when you're elsewhere.
 *
 * Push-based — no polling. The WebSocket gateway delivers `chat:message` and
 * membership events to every logged-in client; each event triggers a single
 * (debounced) chat-list refresh to recompute unread counts. When nothing is
 * happening, no requests are made. Presence (lastSeenAt) is maintained by the
 * gateway over the socket lifecycle, so there's no HTTP heartbeat here either.
 */
export function ChatNotifyProvider({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const [unreadTotal, setUnreadTotal] = useState(0);

  const prevRef     = useRef({});     // chatId -> { lastId, unread }
  const firstRef    = useRef(true);   // skip notifications on the very first fetch
  const debounceRef = useRef(null);
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  // Ask for notification permission once (after login)
  useEffect(() => {
    if (!user) return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [user]);

  const fireNotification = useCallback((title, body) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Only notify when the chat screen isn't the focused thing
    const onChat = locationRef.current.startsWith('/chat');
    if (onChat && !document.hidden) return;
    try {
      const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'school-chat' });
      n.onclick = () => { window.focus(); window.location.href = '/chat'; n.close(); };
    } catch { /* ignore */ }
  }, []);

  // Fetch the chat list, recompute the unread total, and fire notifications for
  // messages that are genuinely new since the last snapshot.
  const refresh = useCallback(async () => {
    try {
      const res = await getChats();
      const chats = res?.data || [];
      let total = 0;
      const snapshot = {};
      const newOnes = [];

      for (const c of chats) {
        const unread = c.unreadCount || 0;
        total += unread;
        const lastId = c.lastMessage?._id || c.lastMessage?.createdAt || null;
        snapshot[c._id] = { lastId, unread };
        const prev = prevRef.current[c._id];
        // A newer message arrived (id changed) and it's unread and not from me
        if (prev && lastId && prev.lastId !== lastId && unread > prev.unread) {
          newOnes.push(c);
        }
      }

      setUnreadTotal(total);

      if (!firstRef.current) {
        for (const c of newOnes) {
          const name = c.displayName || c.name || 'New message';
          const preview = c.lastMessage?.isDeleted ? 'Message deleted'
            : c.lastMessage?.content || 'Sent you a message';
          fireNotification(`💬 ${name}`, preview);
        }
      }
      prevRef.current = snapshot;
      firstRef.current = false;
    } catch { /* silent */ }
  }, [fireNotification]);

  // Debounced wrapper so a burst of socket events causes one fetch, not many.
  const scheduleRefresh = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => refresh(), REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  // Socket-driven awareness while logged in — no polling, no heartbeat.
  useEffect(() => {
    if (!user) {
      setUnreadTotal(0);
      prevRef.current = {};
      firstRef.current = true;
      return;
    }

    const token = localStorage.getItem('token');
    const sock = token ? connectSocket(token) : getSocket();

    refresh();  // seed the badge once on login

    if (!sock) return;

    // New message / membership change → recompute unread (debounced).
    const onChange    = () => scheduleRefresh();
    // On (re)connect, re-seed in case events were missed while disconnected.
    const onReconnect = () => scheduleRefresh();

    sock.on('chat:message',       onChange);
    sock.on('chat:group_created', onChange);
    sock.on('chat:member_added',  onChange);
    sock.on('chat:member_removed', onChange);
    sock.on('chat:group_updated', onChange);
    sock.on('connect',            onReconnect);

    return () => {
      clearTimeout(debounceRef.current);
      sock.off('chat:message',       onChange);
      sock.off('chat:group_created', onChange);
      sock.off('chat:member_added',  onChange);
      sock.off('chat:member_removed', onChange);
      sock.off('chat:group_updated', onChange);
      sock.off('connect',            onReconnect);
    };
  }, [user, refresh, scheduleRefresh]);

  return (
    <ChatNotifyContext.Provider value={{ unreadTotal, refresh }}>
      {children}
    </ChatNotifyContext.Provider>
  );
}
