import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as chatApi from '../../api/chat.api';
import { connectSocket, getSocket, emitWithAck, onSocketState, socketState } from '../../socket';
import { newClientId } from './chatFormat';

/**
 * Live chat state for the chat screen.
 *
 * Owns the conversation list and every loaded thread, and keeps both current
 * from the WebSocket gateway — nothing polls. The list is patched in place
 * from events rather than refetched per message.
 *
 * Sending
 *   1. an optimistic bubble appears at once (status 'sending')
 *   2. it goes over the socket and waits for the gateway's ack, which carries
 *      the saved message — or the reason it was refused ('failed', retryable)
 *   3. no socket / no ack → the same attempt goes over REST; the server dedupes
 *      on clientId, so an ack that was merely slow never makes a second copy
 *   4. no network at all → 'queued', sent in order when the connection returns
 *
 * Staying in sync
 *   The gateway says `chat:ready` once a (re)connected socket has joined its
 *   rooms; from then on nothing can be missed, so that is when the list is
 *   reloaded and each open thread fetches whatever arrived while away.
 */

const SEND_ACK_MS = 6000;
const TYPING_TTL_MS = 6000;
const PENDING = new Set(['sending', 'queued', 'failed']);

const byTime = (a, b) => {
  const pa = PENDING.has(a.status), pb = PENDING.has(b.status);
  if (pa !== pb) return pa ? 1 : -1;
  return new Date(a.createdAt) - new Date(b.createdAt);
};

const sameMessage = (a, b) => a._id === b._id || (a.clientId && b.clientId && a.clientId === b.clientId);

function mergeMessages(existing, incoming) {
  const out = existing.slice();
  for (const m of incoming) {
    const i = out.findIndex((x) => sameMessage(x, m));
    if (i >= 0) out[i] = { ...out[i], ...m };
    else out.push(m);
  }
  return out.sort(byTime);
}

const asSent = (m) => ({ ...m, status: 'sent' });

function preview(m) {
  return {
    _id: m._id, content: m.content, type: m.type, isDeleted: !!m.isDeleted, createdAt: m.createdAt,
    sender: m.sender ? { _id: String(m.sender._id), name: m.sender.name } : null,
    hasAttachments: (m.attachments || []).length > 0,
  };
}

export default function useChatLive({ user, activeId, onChatGone, onBadge }) {
  const myId = String(user?._id || '');
  const isAdmin = user?.role === 'school_admin';

  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [threads, setThreads] = useState({});    // chatId → { items, hasMore, loading, loaded, observer }
  const [typing, setTyping] = useState({});      // chatId → { userId: expiresAt }
  const [online, setOnline] = useState(() => new Set());
  const [conn, setConn] = useState(socketState());

  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const queueRef = useRef([]);                   // offline sends, in order
  const inflightChat = useRef(new Set());        // getChat() calls in progress
  const readTimers = useRef({});
  const summaryTimers = useRef({});
  const goneRef = useRef(onChatGone);
  goneRef.current = onChatGone;
  const badgeRef = useRef(onBadge);
  badgeRef.current = onBadge;
  const markReadRef = useRef(null);   // markRead is declared below catchUp

  // ── List ────────────────────────────────────────────────────────────────────
  const loadChats = useCallback(async () => {
    try {
      const res = await chatApi.getChats();
      const list = Array.isArray(res?.data) ? res.data : [];
      setChats(list);
      setOnline((prev) => {
        const next = new Set(prev);
        for (const c of list) {
          if (!c.otherUser) continue;
          if (c.otherUser.isOnline) next.add(c.otherUser._id); else next.delete(c.otherUser._id);
        }
        return next;
      });
    } catch { /* keep what we have */ }
    finally { setChatsLoading(false); }
  }, []);

  /** Presence snapshot from a roster (group info) — events keep it current after. */
  const mergeOnline = useCallback((people) => {
    setOnline((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const p of people || []) {
        if (!p?._id) continue;
        const had = next.has(p._id);
        if (p.isOnline && !had) { next.add(p._id); changed = true; }
        if (!p.isOnline && had) { next.delete(p._id); changed = true; }
      }
      return changed ? next : prev;
    });
  }, []);

  const patchChat = useCallback((chatId, patch) => {
    setChats((cs) => cs.map((c) => (c._id === chatId ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)));
  }, []);

  /** Fetch one conversation's row and put it in the list (new chat, or counts changed). */
  const refreshChat = useCallback(async (chatId) => {
    if (inflightChat.current.has(chatId)) return null;
    inflightChat.current.add(chatId);
    try {
      const res = await chatApi.getChat(chatId);
      const row = res?.data;
      if (!row?._id) return null;
      setChats((cs) => {
        const rest = cs.filter((c) => c._id !== row._id);
        const merged = [row, ...rest];
        return merged.sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0));
      });
      return row;
    } catch { return null; /* not ours (any more) */ }
    finally { inflightChat.current.delete(chatId); }
  }, []);

  const refreshChatSoon = useCallback((chatId, ms = 500) => {
    clearTimeout(summaryTimers.current[chatId]);
    summaryTimers.current[chatId] = setTimeout(() => refreshChat(chatId), ms);
  }, [refreshChat]);

  /** A message changed the conversation: newest preview, to the top, unread +1 if it is not ours and not on screen. */
  const bumpChat = useCallback((chatId, msg, { countUnread = false } = {}) => {
    setChats((cs) => {
      const i = cs.findIndex((c) => c._id === chatId);
      if (i < 0) return cs;
      const c = cs[i];
      const newer = !c.lastMessage || new Date(msg.createdAt) >= new Date(c.lastMessage.createdAt || 0) || c.lastMessage._id === msg._id;
      if (!newer && !countUnread) return cs;
      const next = {
        ...c,
        lastMessage: newer ? preview(msg) : c.lastMessage,
        lastActivity: newer ? msg.createdAt : c.lastActivity,
        unreadCount: countUnread ? (c.unreadCount || 0) + 1 : c.unreadCount,
      };
      return [next, ...cs.slice(0, i), ...cs.slice(i + 1)];
    });
  }, []);

  // ── Threads ─────────────────────────────────────────────────────────────────
  const setThread = useCallback((chatId, fn) => {
    setThreads((ts) => {
      const cur = ts[chatId] || { items: [], hasMore: false, loading: false, loaded: false };
      return { ...ts, [chatId]: fn(cur) };
    });
  }, []);

  const upsertMessage = useCallback((chatId, msg) => {
    setThreads((ts) => {
      const t = ts[chatId];
      if (!t) return ts;
      return { ...ts, [chatId]: { ...t, items: mergeMessages(t.items, [msg]) } };
    });
  }, []);

  const patchMessage = useCallback((chatId, match, patch) => {
    setThreads((ts) => {
      const t = ts[chatId];
      if (!t) return ts;
      let hit = false;
      const items = t.items.map((m) => {
        if (!match(m)) return m;
        hit = true;
        return { ...m, ...(typeof patch === 'function' ? patch(m) : patch) };
      });
      return hit ? { ...ts, [chatId]: { ...t, items } } : ts;
    });
  }, []);

  /** Everything that arrived in a loaded thread while we could not hear it. */
  const catchUp = useCallback(async (chatId) => {
    const t = threadsRef.current[chatId];
    if (!t?.loaded) return;
    const sent = t.items.filter((m) => !PENDING.has(m.status));
    const newest = sent[sent.length - 1];
    try {
      const res = await chatApi.getMessages(chatId, newest ? { after: newest.createdAt, limit: 100 } : { limit: 40 });
      const items = (Array.isArray(res?.data) ? res.data : []).map(asSent);
      if (items.length) setThread(chatId, (cur) => ({ ...cur, items: mergeMessages(cur.items, items) }));
      if (items.length && activeRef.current === chatId && !document.hidden) markReadRef.current?.(chatId);
    } catch { /* next reconnect tries again */ }
  }, [setThread]);

  /**
   * @param freshAfter  messages from others newer than this were never on
   *                    screen (the unread ones) — they count as just received,
   *                    so a single-emoji one plays its animation.
   */
  const openThread = useCallback(async (chatId, { observer = false, freshAfter = null } = {}) => {
    const t = threadsRef.current[chatId];
    if (t?.loaded) {
      catchUp(chatId);
      return;
    }
    setThread(chatId, (cur) => ({ ...cur, loading: true, observer }));
    try {
      const res = await chatApi.getMessages(chatId, { limit: 40 });
      const cutoff = freshAfter ? Date.parse(freshAfter) : null;
      const items = (Array.isArray(res?.data) ? res.data : []).map((m) => asSent(
        cutoff != null && String(m.sender?._id) !== myId && Date.parse(m.createdAt) > cutoff ? { ...m, fresh: true } : m,
      ));
      setThread(chatId, (cur) => ({
        ...cur, items: mergeMessages(cur.items, items), hasMore: !!res?.hasMore, loading: false, loaded: true, observer,
      }));
    } catch (err) {
      setThread(chatId, (cur) => ({ ...cur, loading: false, loaded: false, error: err?.message || 'Could not load messages' }));
    }
  }, [setThread, catchUp, myId]);

  const loadOlder = useCallback(async (chatId) => {
    const t = threadsRef.current[chatId];
    if (!t || t.loadingOlder || !t.hasMore) return;
    const oldest = t.items.find((m) => !PENDING.has(m.status));
    if (!oldest) return;
    setThread(chatId, (cur) => ({ ...cur, loadingOlder: true }));
    try {
      const res = await chatApi.getMessages(chatId, { before: oldest.createdAt, limit: 40 });
      const items = (Array.isArray(res?.data) ? res.data : []).map(asSent);
      setThread(chatId, (cur) => ({ ...cur, items: mergeMessages(cur.items, items), hasMore: !!res?.hasMore, loadingOlder: false }));
    } catch {
      setThread(chatId, (cur) => ({ ...cur, loadingOlder: false }));
    }
  }, [setThread]);

  // ── Read ────────────────────────────────────────────────────────────────────
  const markRead = useCallback((chatId, messageId = null) => {
    const chat = chatsRef.current.find((c) => c._id === chatId);
    if (!chat) return;   // observers are not members
    patchChat(chatId, { unreadCount: 0, lastReadAt: new Date().toISOString() });
    clearTimeout(readTimers.current[chatId]);
    readTimers.current[chatId] = setTimeout(async () => {
      try {
        const res = await emitWithAck('chat:read', { chatId, messageId }, 4000);
        if (!res?.ok) throw new Error('read not acked');
      } catch {
        try { await chatApi.markRead(chatId, messageId); } catch { /* next open marks it */ }
      }
      badgeRef.current?.();
    }, 250);
  }, [patchChat]);
  markReadRef.current = markRead;

  // ── Send ────────────────────────────────────────────────────────────────────
  const settle = useCallback((chatId, clientId, message) => {
    if (!message?._id) return;
    upsertMessage(chatId, asSent({ ...message, clientId }));
    bumpChat(chatId, message);
    patchChat(chatId, { unreadCount: 0 });
  }, [upsertMessage, bumpChat, patchChat]);

  const failSend = useCallback((chatId, clientId, reason) => {
    patchMessage(chatId, (m) => m.clientId === clientId, { status: 'failed', error: reason || 'Not sent' });
    toast.error(reason || 'Message not sent');
  }, [patchMessage]);

  const deliver = useCallback(async (chatId, clientId, payload) => {
    patchMessage(chatId, (m) => m.clientId === clientId, { status: 'sending', error: null });

    let ack = null;
    try { ack = await emitWithAck('chat:send', payload, SEND_ACK_MS); } catch { ack = null; }
    if (ack?.ok) return settle(chatId, clientId, ack.data?.message);
    // Refused on its merits (empty, not a member, read-only, too fast…) — say so.
    if (ack && !ack.ok && ack.status && ack.status < 500) return failSend(chatId, clientId, ack.message);

    // No socket, no answer, or the gateway could not reach the service: REST.
    try {
      const res = await chatApi.sendMessage(chatId, payload);
      return settle(chatId, clientId, res?.data);
    } catch (err) {
      if (err?.status) return failSend(chatId, clientId, err.message);
      // No network at all. Hold it and send when we are back.
      patchMessage(chatId, (m) => m.clientId === clientId, { status: 'queued' });
      if (!queueRef.current.some((q) => q.clientId === clientId)) queueRef.current.push({ chatId, clientId, payload });
    }
  }, [patchMessage, settle, failSend]);

  const flushQueue = useCallback(async () => {
    const pending = queueRef.current.splice(0);
    for (const q of pending) await deliver(q.chatId, q.clientId, q.payload);  // in order
  }, [deliver]);

  const send = useCallback((chatId, { content, replyTo = null, isForwarded = false }) => {
    const text = String(content || '').trim();
    if (!chatId || !text) return null;
    const clientId = newClientId();
    const now = new Date().toISOString();
    const optimistic = {
      _id: clientId, clientId, chat: chatId, status: 'sending', fresh: true,
      sender: { _id: myId, name: user?.name || '', role: user?.role || '' },
      content: text, type: 'text', attachments: [], reactions: [], isForwarded,
      replyTo: replyTo ? {
        _id: replyTo._id, content: replyTo.content, isDeleted: !!replyTo.isDeleted, type: replyTo.type,
        sender: replyTo.sender ? { _id: replyTo.sender._id, name: replyTo.sender.name } : null,
      } : null,
      createdAt: now,
    };
    upsertMessage(chatId, optimistic);
    bumpChat(chatId, optimistic);
    deliver(chatId, clientId, { chatId, clientId, content: text, replyTo: replyTo?._id || null, isForwarded });
    return clientId;
  }, [myId, user?.name, user?.role, upsertMessage, bumpChat, deliver]);

  const retry = useCallback((chatId, clientId) => {
    const m = threadsRef.current[chatId]?.items.find((x) => x.clientId === clientId);
    if (!m) return;
    queueRef.current = queueRef.current.filter((q) => q.clientId !== clientId);
    deliver(chatId, clientId, {
      chatId, clientId, content: m.content, replyTo: m.replyTo?._id || null, isForwarded: !!m.isForwarded,
    });
  }, [deliver]);

  const discard = useCallback((chatId, clientId) => {
    queueRef.current = queueRef.current.filter((q) => q.clientId !== clientId);
    setThreads((ts) => {
      const t = ts[chatId];
      if (!t) return ts;
      return { ...ts, [chatId]: { ...t, items: t.items.filter((m) => m.clientId !== clientId || !PENDING.has(m.status)) } };
    });
  }, []);

  // ── Edit / delete / react (REST; the room hears it from the writer) ─────────
  const editMessage = useCallback(async (chatId, msg, content) => {
    const text = String(content || '').trim();
    if (!text || text === msg.content) return;
    const before = { content: msg.content, isEdited: msg.isEdited, editedAt: msg.editedAt };
    patchMessage(chatId, (m) => m._id === msg._id, { content: text, isEdited: true, editedAt: new Date().toISOString() });
    try { await chatApi.editMessage(msg._id, text); }
    catch (err) {
      patchMessage(chatId, (m) => m._id === msg._id, before);
      toast.error(err?.message || 'Could not edit');
    }
  }, [patchMessage]);

  const deleteMessage = useCallback(async (chatId, msg) => {
    try {
      await chatApi.deleteMessage(msg._id);
      patchMessage(chatId, (m) => m._id === msg._id, (m) => ({ isDeleted: true, ...(isAdmin ? {} : { content: '', attachments: [] }) }));
      patchChat(chatId, (c) => (c.lastMessage?._id === msg._id ? { lastMessage: { ...c.lastMessage, isDeleted: true, content: '' } } : {}));
    } catch (err) { toast.error(err?.message || 'Could not delete'); }
  }, [patchMessage, patchChat, isAdmin]);

  const react = useCallback(async (chatId, msg, emoji) => {
    try {
      const res = await chatApi.toggleReaction(msg._id, emoji);
      if (Array.isArray(res?.data)) patchMessage(chatId, (m) => m._id === msg._id, { reactions: res.data });
    } catch (err) { toast.error(err?.message || 'Could not react'); }
  }, [patchMessage]);

  // ── Typing ──────────────────────────────────────────────────────────────────
  const typingTimer = useRef(null);
  const typingChat = useRef(null);
  const emitTyping = useCallback((chatId) => {
    const sock = getSocket();
    if (!sock?.connected || !chatId) return;
    if (typingChat.current !== chatId) {
      sock.emit('chat:typing', { chatId });
      typingChat.current = chatId;
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      sock.emit('chat:stop_typing', { chatId });
      typingChat.current = null;
    }, 2500);
  }, []);
  const stopTyping = useCallback(() => {
    const sock = getSocket();
    clearTimeout(typingTimer.current);
    if (sock?.connected && typingChat.current) sock.emit('chat:stop_typing', { chatId: typingChat.current });
    typingChat.current = null;
  }, []);

  // Re-announce while still typing: the other side forgets after TYPING_TTL_MS.
  useEffect(() => {
    const t = setInterval(() => {
      const sock = getSocket();
      if (typingChat.current && sock?.connected) sock.emit('chat:typing', { chatId: typingChat.current });
    }, 3000);
    return () => clearInterval(t);
  }, []);

  // Expire stale "typing…" (a closed tab never says stop).
  const hasTyping = Object.keys(typing).length > 0;
  useEffect(() => {
    if (!hasTyping) return undefined;
    const t = setInterval(() => {
      const now = Date.now();
      setTyping((all) => {
        let changed = false;
        const next = {};
        for (const [cid, who] of Object.entries(all)) {
          const kept = Object.fromEntries(Object.entries(who).filter(([, exp]) => exp > now));
          if (Object.keys(kept).length !== Object.keys(who).length) changed = true;
          if (Object.keys(kept).length) next[cid] = kept;
        }
        return changed ? next : all;
      });
    }, 1500);
    return () => clearInterval(t);
  }, [hasTyping]);

  // ── Socket wiring ───────────────────────────────────────────────────────────
  const resyncTimer = useRef(null);
  const resync = useCallback(() => {
    clearTimeout(resyncTimer.current);
    resyncTimer.current = setTimeout(async () => {
      await loadChats();
      for (const [cid, t] of Object.entries(threadsRef.current)) if (t.loaded) catchUp(cid);
      flushQueue();
    }, 150);
  }, [loadChats, catchUp, flushQueue]);

  useEffect(() => { loadChats(); }, [loadChats]);

  useEffect(() => onSocketState(setConn), []);

  useEffect(() => {
    const sock = connectSocket();
    if (!sock) return undefined;
    setConn(socketState());

    let connectedOnce = sock.connected;
    const onConnect = () => {
      // A gateway that predates chat:ready still gets a catch-up, a little later.
      if (connectedOnce) setTimeout(resync, 1200);
      connectedOnce = true;
    };

    const onMessage = (raw) => {
      if (!raw?._id || !raw.chat) return;
      // `fresh`: arrived live, so a single-emoji message plays its animation.
      const msg = asSent({ ...raw, clientId: raw.clientId || raw.tempId || null, fresh: true });
      const chatId = String(msg.chat);
      const mine = String(msg.sender?._id || msg.sender) === myId;
      const viewing = activeRef.current === chatId && !document.hidden;

      upsertMessage(chatId, msg);
      if (!chatsRef.current.some((c) => c._id === chatId)) { refreshChat(chatId); return; }
      bumpChat(chatId, msg, { countUnread: !mine && !viewing });
      if (mine) patchChat(chatId, { unreadCount: 0 });

      if (!mine) {
        setTyping((all) => {
          if (!all[chatId]?.[msg.sender?._id]) return all;
          const { [msg.sender._id]: _, ...rest } = all[chatId];
          return { ...all, [chatId]: rest };
        });
        if (viewing) markRead(chatId, msg._id);
      }
    };

    const onRead = ({ chatId, userId, readAt }) => {
      if (!chatId) return;
      if (String(userId) === myId) { patchChat(chatId, { unreadCount: 0 }); return; }
      const chat = chatsRef.current.find((c) => c._id === chatId);
      if (!chat) return;
      if (chat.type === 'direct') patchChat(chatId, { otherReadAt: readAt, readUpTo: readAt });
      else refreshChatSoon(chatId, 800);   // "everyone has read" needs the slowest reader
    };

    const onEdited = ({ messageId, chatId, content, editedAt, previousContent }) => {
      patchMessage(chatId, (m) => m._id === messageId, (m) => ({
        content, isEdited: true, editedAt,
        ...(isAdmin ? { editHistory: [...(m.editHistory || []), { content: previousContent ?? m.content, editedAt }] } : {}),
      }));
      patchChat(chatId, (c) => (c.lastMessage?._id === messageId ? { lastMessage: { ...c.lastMessage, content } } : {}));
    };

    const onDeleted = ({ messageId, chatId }) => {
      patchMessage(chatId, (m) => m._id === messageId, isAdmin ? { isDeleted: true } : { isDeleted: true, content: '', attachments: [] });
      patchChat(chatId, (c) => (c.lastMessage?._id === messageId ? { lastMessage: { ...c.lastMessage, isDeleted: true, content: '' } } : {}));
    };

    const onReaction = ({ messageId, chatId, reactions }) => {
      patchMessage(chatId, (m) => m._id === messageId, { reactions: reactions || [] });
    };

    const onTyping = ({ chatId, userId }) => {
      if (!chatId || String(userId) === myId) return;
      setTyping((all) => ({ ...all, [chatId]: { ...(all[chatId] || {}), [userId]: Date.now() + TYPING_TTL_MS } }));
    };
    const onStopTyping = ({ chatId, userId }) => {
      setTyping((all) => {
        if (!all[chatId]?.[userId]) return all;
        const { [userId]: _, ...rest } = all[chatId];
        const next = { ...all };
        if (Object.keys(rest).length) next[chatId] = rest; else delete next[chatId];
        return next;
      });
    };

    const onOnline = ({ userId }) => setOnline((s) => (s.has(String(userId)) ? s : new Set([...s, String(userId)])));
    const onOffline = ({ userId }) => {
      setOnline((s) => { if (!s.has(String(userId))) return s; const n = new Set(s); n.delete(String(userId)); return n; });
      const now = new Date().toISOString();
      setChats((cs) => cs.map((c) => (c.otherUser?._id === String(userId)
        ? { ...c, otherUser: { ...c.otherUser, lastSeenAt: now, isOnline: false }, deliveredUpTo: now } : c)));
    };

    const onGroupCreated = ({ chatId }) => chatId && refreshChat(String(chatId));
    const onMemberAdded = ({ chatId, userId }) => {
      if (!chatId) return;
      refreshChatSoon(String(chatId), String(userId) === myId ? 0 : 400);
    };
    const onMemberRemoved = ({ chatId, userId }) => {
      if (!chatId) return;
      if (String(userId) === myId) {
        setChats((cs) => cs.filter((c) => c._id !== String(chatId)));
        goneRef.current?.(String(chatId));
      } else {
        refreshChatSoon(String(chatId), 400);
      }
    };
    const onGroupUpdated = ({ chatId, name, description, isReadOnly }) => {
      if (!chatId) return;
      patchChat(String(chatId), (c) => ({
        ...(name !== undefined ? { name, displayName: name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(isReadOnly !== undefined ? { isReadOnly } : {}),
        _profileStamp: Date.now(),
      }));
    };
    const onPrefs = ({ chatId, ...prefs }) => chatId && patchChat(String(chatId), prefs);
    const onError = ({ message, clientId }) => {
      if (clientId) {
        for (const [cid, t] of Object.entries(threadsRef.current)) {
          if (t.items.some((m) => m.clientId === clientId)) { failSend(cid, clientId, message); return; }
        }
      }
      if (message) toast.error(message);
    };

    const handlers = {
      connect:                onConnect,
      'chat:ready':           resync,
      'chat:message':         onMessage,
      'chat:message_read':    onRead,
      'chat:message_edited':  onEdited,
      'chat:message_deleted': onDeleted,
      'chat:reaction':        onReaction,
      'chat:typing':          onTyping,
      'chat:stop_typing':     onStopTyping,
      'chat:user_online':     onOnline,
      'chat:user_offline':    onOffline,
      'chat:group_created':   onGroupCreated,
      'chat:member_added':    onMemberAdded,
      'chat:member_removed':  onMemberRemoved,
      'chat:group_updated':   onGroupUpdated,
      'chat:prefs':           onPrefs,
      'chat:error':           onError,
    };
    Object.entries(handlers).forEach(([ev, fn]) => sock.on(ev, fn));
    const onBack = () => flushQueue();
    window.addEventListener('online', onBack);

    return () => {
      Object.entries(handlers).forEach(([ev, fn]) => sock.off(ev, fn));
      window.removeEventListener('online', onBack);
      stopTyping();
    };
  }, [myId, isAdmin, resync, upsertMessage, bumpChat, patchChat, patchMessage, refreshChat, refreshChatSoon,
      markRead, failSend, flushQueue, stopTyping]);

  // Back to a hidden tab that has the conversation open: that is reading it.
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden || !activeRef.current) return;
      const c = chatsRef.current.find((x) => x._id === activeRef.current);
      if (c?.unreadCount) markRead(c._id);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  return {
    chats, chatsLoading, threads, typing, online, conn,
    loadChats, refreshChat, patchChat, setChats, mergeOnline,
    openThread, loadOlder, markRead,
    send, retry, discard, editMessage, deleteMessage, react,
    emitTyping, stopTyping,
  };
}
