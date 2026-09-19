import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useModules } from './ModulesContext';
import { getChats } from '../api/chat.api';
import { connectSocket, getSocket } from '../socket';
import { notificationIconUrl } from '../utils/branding';

const ChatNotifyContext = createContext({ unreadTotal: 0, refresh: () => {}, setActiveChat: () => {} });
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
  // A school without chat has no unread badge to keep and no messages to
  // notify about — and now that /api/chat is gated, seeding the badge would
  // just be a 403 on every login. `ready` matters: isEnabled fails open while
  // the module map loads, so this only settles once it has landed.
  const { isEnabled, ready } = useModules();
  const chatOn = !ready || isEnabled('chat');
  const location = useLocation();
  const [unreadTotal, setUnreadTotal] = useState(0);

  const prevRef     = useRef({});     // chatId -> { lastId, unread }
  const firstRef    = useRef(true);   // skip notifications on the very first fetch
  const debounceRef = useRef(null);
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;
  const userRef     = useRef(user);   // read inside stable callbacks
  userRef.current   = user;
  // The conversation open on the chat screen. While it is on screen its
  // messages are read the moment they land, so they neither count towards the
  // badge nor raise a desktop notification.
  const activeChatRef = useRef(null);
  const setActiveChat = useCallback((chatId) => { activeChatRef.current = chatId || null; }, []);

  // Ask for notification permission once (after login)
  useEffect(() => {
    if (!user) return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [user]);

  const fireNotification = useCallback((title, body, chatId) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Only notify when the chat screen isn't the focused thing
    const onChat = locationRef.current.startsWith('/chat');
    if (onChat && !document.hidden) return;
    try {
      const n = new Notification(title, { body, icon: notificationIconUrl(userRef.current?.school), tag: `school-chat-${chatId || ''}` });
      n.onclick = () => { window.focus(); window.location.href = chatId ? `/chat?c=${chatId}` : '/chat'; n.close(); };
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

      const onScreen = !document.hidden && locationRef.current.startsWith('/chat') ? activeChatRef.current : null;
      for (const c of chats) {
        const unread = c._id === onScreen ? 0 : (c.unreadCount || 0);
        if (!c.isMuted && !c.isArchived) total += unread;
        const lastId = c.lastMessage?._id || c.lastMessage?.createdAt || null;
        snapshot[c._id] = { lastId, unread };
        const prev = prevRef.current[c._id];
        // A newer message arrived (id changed) and it's unread and not from me
        if (prev && lastId && prev.lastId !== lastId && unread > prev.unread && !c.isMuted) {
          newOnes.push(c);
        }
      }

      setUnreadTotal(total);

      if (!firstRef.current) {
        for (const c of newOnes) {
          const name = c.displayName || c.name || 'New message';
          const preview = c.lastMessage?.isDeleted ? 'Message deleted'
            : c.lastMessage?.content || 'Sent you a message';
          const who = c.type !== 'direct' && c.lastMessage?.sender?.name ? `${c.lastMessage.sender.name.split(' ')[0]}: ` : '';
          fireNotification(name, `${who}${preview}`, c._id);
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
    if (!user || !chatOn) {
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

    const events = ['chat:message', 'chat:message_read', 'chat:group_created', 'chat:member_added',
      'chat:member_removed', 'chat:group_updated', 'chat:prefs'];
    events.forEach((ev) => sock.on(ev, onChange));
    sock.on('chat:ready', onReconnect);
    sock.on('connect', onReconnect);   // a gateway that predates chat:ready

    return () => {
      clearTimeout(debounceRef.current);
      events.forEach((ev) => sock.off(ev, onChange));
      sock.off('chat:ready', onReconnect);
      sock.off('connect', onReconnect);
    };
  }, [user, chatOn, refresh, scheduleRefresh]);

  return (
    <ChatNotifyContext.Provider value={{ unreadTotal, refresh: scheduleRefresh, setActiveChat }}>
      {children}
    </ChatNotifyContext.Provider>
  );
}
