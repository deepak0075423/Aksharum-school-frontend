import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import Icon from '../../components/ui/icons';
import { Confirm } from '../../components/ui/index';
import { useAuth } from '../../contexts/AuthContext';
import { useChatNotify } from '../../contexts/ChatNotifyContext';
import * as chatApi from '../../api/chat.api';
import useChatLive from './useChatLive';
import {
  ChatSidebar, ThreadHeader, ConnectionStrip, MessageList, Composer,
} from './chatParts';
import {
  NewChatDialog, CreateGroupDialog, AddMembersDialog, EditGroupDialog, ForwardDialog, HistoryDialog, InfoDrawer,
} from './chatDialogs';
import { chatName, isGroup, shortName } from './chatFormat';
import '../../styles/chat.css';


/**
 * Chat — every role's messages, live over the WebSocket gateway.
 *
 * The open conversation rides in the URL (`?c=<chatId>`), so a reload, a
 * browser notification or another page can land on it; `?user=<id>` opens (or
 * starts) a direct conversation with that person. A school admin's View All
 * Chats opens its own page (ChatOversight, /chat/all-chats).
 */
export default function ChatPage() {
  const { user } = useAuth();
  const { refresh: refreshBadge, setActiveChat: setNotifyActive } = useChatNotify();
  const myId = String(user?._id || '');
  const role = user?.role;
  const isAdmin = role === 'school_admin';

  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c') || null;

  const openChat = useCallback((id, { replace = false } = {}) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (id) n.set('c', id); else n.delete('c');
      n.delete('user');
      return n;
    }, { replace });
  }, [setParams]);

  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const live = useChatLive({
    user,
    activeId,
    onBadge: refreshBadge,
    onChatGone: (id) => {
      if (id === activeIdRef.current) { openChat(null, { replace: true }); toast('You are no longer a member of that group'); }
    },
  });

  // ── Left pane state ─────────────────────────────────────────────────────────
  const [tab, setTab] = useState('all');
  const [view, setView] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [observed, setObserved] = useState(null);

  // ── Thread state ────────────────────────────────────────────────────────────
  const [drafts, setDrafts] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [infoOpen, setInfoOpen] = useState(false);
  const [dlg, setDlg] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [profileTick, setProfileTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const openMarks = useRef({});                 // chatId → { lastReadAt, unread } when opened

  const member = useMemo(() => live.chats.find((c) => c._id === activeId) || null, [live.chats, activeId]);
  const activeChat = member || (observed && observed._id === activeId ? observed : null);
  const observer = !!activeChat && !member;
  const thread = activeId ? live.threads[activeId] : null;
  const profile = activeId ? profiles[activeId]?.data : null;

  // ── Opening a conversation ──────────────────────────────────────────────────
  useEffect(() => {
    setReplyTo(null);
    setEditing(null);
    setInfoOpen(false);
    setNotifyActive?.(activeId);
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setNotifyActive?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const openedFor = useRef(null);
  useEffect(() => {
    if (!activeChat || openedFor.current === activeChat._id) return;
    openedFor.current = activeChat._id;
    if (!observer && activeChat.unreadCount > 0) {
      openMarks.current[activeChat._id] = { lastReadAt: activeChat.lastReadAt, unread: activeChat.unreadCount };
    } else {
      delete openMarks.current[activeChat._id];
    }
    live.openThread(activeChat._id, {
      observer,
      freshAfter: !observer && activeChat.unreadCount > 0 ? (activeChat.lastReadAt || new Date(0).toISOString()) : null,
    });
    if (!observer && activeChat.unreadCount > 0 && live.threads[activeChat._id]?.loaded) live.markRead(activeChat._id);
    else if (!observer && activeChat.unreadCount > 0) live.patchChat(activeChat._id, { unreadCount: 0 });
    setTimeout(() => refreshBadge?.(), 600);
  }, [activeChat?._id, observer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!activeId) openedFor.current = null; }, [activeId]);

  // A `?c=` the list does not hold: a conversation made a moment ago, or — for
  // an admin — one to read as an observer. Anyone else is told it is not theirs.
  const [missing, setMissing] = useState(null);
  const lookedUp = useRef(null);
  useEffect(() => {
    if (!activeId || live.chatsLoading || activeChat || lookedUp.current === activeId) return;
    lookedUp.current = activeId;
    (async () => {
      if (await live.refreshChat(activeId)) return;
      if (!isAdmin) { setMissing(activeId); return; }
      try {
        const res = await chatApi.getChatProfile(activeId);
        const p = res?.data;
        if (!p?._id) throw new Error('missing');
        const names = (p.members || []).map((m) => m.name);
        setObserved({
          _id: p._id, type: p.type, name: p.name, description: p.description, isReadOnly: p.isReadOnly,
          displayName: p.type === 'direct' ? names.join(' ↔ ') : p.name,
          avatarName: p.type === 'direct' ? names[0] : p.name,
          memberCount: p.memberCount, classSection: p.classSection?._id || null, unreadCount: 0,
        });
      } catch { setMissing(activeId); }
    })();
  }, [activeId, live.chatsLoading, activeChat]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (activeChat) setMissing(null); }, [activeChat]);

  // Who is in it / what they teach — the header's second line and the info panel.
  const profileKey = activeChat ? `${activeChat._id}:${activeChat.memberCount}:${activeChat._profileStamp || ''}:${profileTick}` : '';
  const reloadProfile = () => setProfileTick((n) => n + 1);
  useEffect(() => {
    if (!activeChat) return;
    const id = activeChat._id;
    setProfiles((p) => ({ ...p, [id]: { ...(p[id] || {}), loading: true } }));
    chatApi.getChatProfile(id)
      .then((res) => {
        setProfiles((p) => ({ ...p, [id]: { data: res?.data || null, loading: false } }));
        live.mergeOnline((res?.data?.members || []).filter((m) => m._id !== myId));
      })
      .catch(() => setProfiles((p) => ({ ...p, [id]: { ...(p[id] || {}), loading: false } })));
  }, [profileKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Deep link: ?user=<id> opens (or starts) that direct conversation ────────
  const startDirect = useCallback(async (userId) => {
    try {
      const res = await chatApi.startDirectChat(userId);
      const row = res?.data;
      if (!row?._id) throw new Error('Could not open chat');
      live.setChats((cs) => (cs.some((c) => c._id === row._id) ? cs : [row, ...cs]));
      openChat(row._id);
    } catch (err) { toast.error(err?.message || 'Cannot start chat'); }
  }, [live, openChat]);

  const deepLinked = useRef('');
  useEffect(() => {
    const target = params.get('user');
    if (!target || deepLinked.current === target) return;
    deepLinked.current = target;
    startDirect(target);
  }, [params, startDirect]);

  // ── Message search (server) ─────────────────────────────────────────────────
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setSearching(false); return undefined; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await chatApi.searchMessages({ q: term });
        setHits(Array.isArray(res?.data) ? res.data : []);
      } catch { setHits([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const [jumpTo, setJumpTo] = useState(null);
  const jump = useCallback((id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.animate?.([{ background: 'rgba(79,70,229,.14)' }, { background: 'transparent' }], { duration: 1400 });
    return true;
  }, []);
  useEffect(() => {
    if (!jumpTo || jumpTo.chatId !== activeId || !thread?.loaded) return;
    requestAnimationFrame(() => { jump(jumpTo.id); setJumpTo(null); });
  }, [jumpTo, activeId, thread?.loaded, thread?.items?.length, jump]);

  // ── Typing labels ───────────────────────────────────────────────────────────
  const nameIn = useCallback((chatId, userId) => {
    const m = profiles[chatId]?.data?.members?.find((x) => x._id === String(userId));
    if (m) return m.name;
    const msg = live.threads[chatId]?.items.find((x) => String(x.sender?._id) === String(userId));
    return msg?.sender?.name || '';
  }, [profiles, live.threads]);

  const typingIds = (chatId) => Object.keys(live.typing[chatId] || {});
  const typingLabelFor = useCallback((chat) => {
    const ids = Object.keys(live.typing[chat._id] || {});
    if (!ids.length) return '';
    if (!isGroup(chat)) return 'typing…';
    if (ids.length > 1) return `${ids.length} people are typing…`;
    const n = nameIn(chat._id, ids[0]);
    return `${n ? shortName(n) : 'Someone'} is typing…`;
  }, [live.typing, nameIn]);

  // ── Composer ────────────────────────────────────────────────────────────────
  const draft = activeId ? (drafts[activeId] || '') : '';
  const setDraft = (text) => setDrafts((d) => ({ ...d, [activeId]: text }));

  const onSend = (text) => {
    if (!activeId) return;
    if (editing) {
      live.editMessage(activeId, editing, text);
      setEditing(null);
      setDraft('');
      return;
    }
    live.send(activeId, { content: text, replyTo });
    live.stopTyping();
    setReplyTo(null);
    setDraft('');
  };

  const onEditLast = () => {
    const items = thread?.items || [];
    for (let i = items.length - 1; i >= 0; i--) {
      const m = items[i];
      if (String(m.sender?._id) !== myId) continue;
      if (m.isDeleted || m.status !== 'sent' || Date.now() - Date.parse(m.createdAt) > 86400000) return false;
      setReplyTo(null); setEditing(m); setDraft(m.content);
      return true;
    }
    return false;
  };

  const disabledReason = !activeChat ? null
    : observer ? 'Viewing as administrator — you are not part of this conversation'
      : activeChat.isReadOnly && !['school_admin', 'teacher'].includes(role) ? 'Only admins and teachers can post in this channel'
        : null;

  // ── Message actions ─────────────────────────────────────────────────────────
  const actions = {
    reply: (m) => { setEditing(null); setReplyTo(m); },
    forward: (m) => setDlg({ forward: m }),
    copy: (m) => { navigator.clipboard?.writeText(m.content || '').then(() => toast.success('Copied'), () => {}); },
    edit: (m) => { setReplyTo(null); setEditing(m); setDraft(m.content); },
    remove: (m) => setConfirm({
      title: 'Delete message',
      message: String(m.sender?._id) === myId ? 'Delete this message for everyone?' : `Delete ${m.sender?.name || 'this person'}'s message for everyone? It stays visible to school admins.`,
      label: 'Delete',
      run: () => live.deleteMessage(activeId, m),
    }),
    history: (m) => setDlg({ history: m }),
    react: (m, e) => live.react(activeId, m, e),
    retry: (m) => live.retry(activeId, m.clientId),
    discard: (m) => live.discard(activeId, m.clientId),
    jump: (id) => { if (!jump(id)) toast('That message is further back — scroll up to load it'); },
  };

  // ── Conversation actions ────────────────────────────────────────────────────
  const toggleMute = async () => {
    try {
      const res = await chatApi.toggleMute(activeId);
      live.patchChat(activeId, { isMuted: !!res?.data?.isMuted });
      toast.success(res?.data?.isMuted ? 'Notifications muted' : 'Notifications on');
      refreshBadge?.();
    } catch (err) { toast.error(err?.message || 'Could not change that'); }
  };
  const toggleArchive = async () => {
    try {
      const res = await chatApi.toggleArchive(activeId);
      live.patchChat(activeId, { isArchived: !!res?.data?.isArchived });
      toast.success(res?.data?.isArchived ? 'Archived — find it under Filter › Archived' : 'Moved back to chats');
    } catch (err) { toast.error(err?.message || 'Could not change that'); }
  };
  const leaveGroup = () => setConfirm({
    title: 'Leave group',
    message: `Leave “${chatName(activeChat)}”? You will stop receiving its messages.`,
    label: 'Leave',
    run: async () => {
      try {
        await chatApi.removeMember(activeId, myId);
        live.setChats((cs) => cs.filter((c) => c._id !== activeId));
        openChat(null, { replace: true });
        toast.success('You left the group');
      } catch (err) { toast.error(err?.message || 'Could not leave'); }
    },
  });
  const removeMember = (m) => setConfirm({
    title: 'Remove member',
    message: `Remove ${m.name} from “${chatName(activeChat)}”?`,
    label: 'Remove',
    run: async () => {
      try {
        await chatApi.removeMember(activeId, m._id);
        live.refreshChat(activeId);
        reloadProfile();
        setProfiles((p) => ({ ...p, [activeId]: { data: { ...p[activeId]?.data, members: (p[activeId]?.data?.members || []).filter((x) => x._id !== m._id) } } }));
      } catch (err) { toast.error(err?.message || 'Could not remove'); }
    },
  });

  const markAllRead = () => live.chats.filter((c) => c.unreadCount > 0 && !c.isArchived).forEach((c) => live.markRead(c._id));

  const members = profile?.members || [];
  const iAmGroupAdmin = members.some((m) => m._id === myId && m.memberRole === 'admin');
  // Class/subject groups: what this viewer may do comes from the server.
  const classKind = profile?.kind || '';
  const canAddMembers = classKind ? !!profile?.manage?.canManage : iAmGroupAdmin;
  const canLeaveGroup = classKind ? !!profile?.manage?.canLeave : true;
  const syncClassGroup = async () => {
    setSyncing(true);
    try {
      const res = await chatApi.syncGroup(activeId);
      const { added = 0, removed = 0 } = res?.data || {};
      toast.success(added || removed ? `Updated: ${added} joined, ${removed} left` : 'Already matches the class');
      live.refreshChat(activeId);
      reloadProfile();
    } catch (err) { toast.error(err?.message || 'Could not sync'); }
    finally { setSyncing(false); }
  };
  const menu = !activeChat ? [] : observer ? [
    { label: isGroup(activeChat) ? 'Group info' : 'Conversation info', icon: 'info', run: () => setInfoOpen(true) },
    { label: 'Refresh', icon: 'refresh', run: () => live.openThread(activeChat._id, { observer: true }) },
  ] : [
    { label: isGroup(activeChat) ? 'Group info' : 'Contact info', icon: 'info', run: () => setInfoOpen(true) },
    isGroup(activeChat) && canAddMembers && { label: 'Add members', icon: 'userPlus', run: () => setDlg({ addMembers: true }) },
    isGroup(activeChat) && iAmGroupAdmin && { label: 'Edit group', icon: 'pencil', run: () => setDlg({ editGroup: true }) },
    classKind && profile?.manage?.canSync && { label: `Sync with Class ${profile?.classSection?.label || ''}`, icon: 'refresh', run: syncClassGroup },
    '-',
    { label: activeChat.isMuted ? 'Unmute notifications' : 'Mute notifications', icon: activeChat.isMuted ? 'bell' : 'bellOff', run: toggleMute },
    { label: activeChat.isArchived ? 'Unarchive' : 'Archive chat', icon: 'archive', run: toggleArchive },
    isGroup(activeChat) && canLeaveGroup && '-',
    isGroup(activeChat) && canLeaveGroup && { label: 'Leave group', icon: 'logOut', danger: true, run: leaveGroup },
  ];

  const peerOnline = !!activeChat?.otherUser && live.online.has(activeChat.otherUser._id);
  const onlineCount = members.filter((m) => m._id !== myId && live.online.has(m._id)).length;
  const typingNow = activeId ? typingIds(activeId) : [];
  const typingNames = typingNow.map((id) => nameIn(activeId, id) || 'Someone');

  // First unread message at the moment of opening, for the "Unread messages" rule.
  const unreadFrom = useMemo(() => {
    const mark = activeId && openMarks.current[activeId];
    if (!mark || !thread?.loaded) return null;
    const since = mark.lastReadAt ? Date.parse(mark.lastReadAt) : 0;
    const first = thread.items.find((m) => String(m.sender?._id) !== myId && Date.parse(m.createdAt) > since);
    return first?._id || null;
  }, [activeId, thread?.loaded, thread?.items, myId]);

  return (
    <div className={`ch${activeId ? ' has-active' : ''}`}>
      <ChatSidebar
        role={role} chats={live.chats} loading={live.chatsLoading} activeId={activeId} myId={myId}
        typingLabelFor={typingLabelFor}
        tab={tab} setTab={setTab} view={view} setView={setView} q={q} setQ={setQ}
        messageHits={hits} searching={searching}
        onOpen={(c) => openChat(c._id)}
        onOpenHit={(m) => { openChat(m.chat._id); setJumpTo({ chatId: m.chat._id, id: m._id }); }}
        onNewChat={() => setDlg({ newChat: true })}
        onCreateGroup={() => setDlg({ createGroup: true })}
        onViewAll={() => navigate('/chat/all-chats')}
        onMarkAllRead={markAllRead}
      />

      <section className="ch-main" aria-label="Conversation">
        {!activeId ? (
          <>
            <ConnectionStrip conn={live.conn} />
            <div className="ch-center">
              <div className="ch-center__icon"><Icon name="chat" size={32} /></div>
              <h3>Your messages</h3>
              <p>Pick a conversation on the left, or start a new one. Messages arrive here the moment they are sent.</p>
            </div>
          </>
        ) : !activeChat ? (
          <div className="ch-center">
            {missing === activeId ? (
              <>
                <div className="ch-center__icon"><Icon name="lock" size={30} /></div>
                <h3>Conversation not available</h3>
                <p>It may have been removed, or you are no longer a member.</p>
                <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" onClick={() => openChat(null, { replace: true })}>Back to chats</button>
              </>
            ) : <span className="spinner" />}
          </div>
        ) : (
          <>
            <ThreadHeader
              chat={activeChat}
              profile={profile} online={live.online} onlineCount={onlineCount}
              typingLabel={typingLabelFor(activeChat)} observer={observer}
              onBack={() => openChat(null)} onInfo={() => setInfoOpen(true)} menu={menu} />
            <ConnectionStrip conn={live.conn} />
            {observer && (
              <div className="ch-observer">
                <Icon name="eye" size={16} /> You are reading this conversation as the school administrator. Its members are not notified.
                <button type="button" onClick={() => live.openThread(activeChat._id, { observer: true })}><Icon name="refresh" size={15} /> Refresh</button>
              </div>
            )}
            <MessageList
              chatId={activeChat._id}
              items={thread?.items || []}
              chat={activeChat}
              loading={!thread || (thread.loading && !thread.loaded)}
              error={thread?.error}
              onRetryLoad={() => live.openThread(activeChat._id, { observer })}
              hasMore={!!thread?.hasMore}
              loadingOlder={!!thread?.loadingOlder}
              onLoadOlder={() => live.loadOlder(activeChat._id)}
              myId={myId} isAdmin={isAdmin} observer={observer}
              peerOnline={peerOnline} typingNames={typingNames}
              unreadFrom={unreadFrom}
              actions={actions}
            />
            <Composer
              chatId={activeChat._id}
              draft={draft} setDraft={setDraft}
              replyTo={replyTo} editing={editing}
              onCancel={() => { if (editing) setDraft(''); setReplyTo(null); setEditing(null); }}
              onSend={onSend}
              onTyping={() => live.emitTyping(activeChat._id)}
              onEditLast={onEditLast}
              disabledReason={disabledReason}
              myName={user?.name}
            />
            {infoOpen && (
              <InfoDrawer
                chat={activeChat} profile={profile} loading={profiles[activeId]?.loading}
                myId={myId} online={live.online} observer={observer}
                onClose={() => setInfoOpen(false)}
                onMute={toggleMute} onArchive={toggleArchive}
                onAddMembers={() => setDlg({ addMembers: true })}
                onEditGroup={() => setDlg({ editGroup: true })}
                onRemoveMember={removeMember}
                onLeave={leaveGroup}
                onSync={syncClassGroup} syncing={syncing}
                onMessage={(m) => { setInfoOpen(false); startDirect(m._id); }}
              />
            )}
          </>
        )}
      </section>

      <NewChatDialog open={!!dlg.newChat} onClose={() => setDlg({})} myRole={role}
        onPick={(c) => { setDlg({}); startDirect(c._id); }} />
      <CreateGroupDialog open={!!dlg.createGroup} onClose={() => setDlg({})} myRole={role}
        onCreated={(row) => {
          setDlg({});
          if (row?._id) { live.setChats((cs) => (cs.some((c) => c._id === row._id) ? cs : [row, ...cs])); openChat(row._id); }
        }}
        onOpenExisting={async (chatId) => {
          setDlg({});
          await live.refreshChat(chatId);
          openChat(chatId);
        }} />
      {activeChat && (
        <>
          <AddMembersDialog open={!!dlg.addMembers} onClose={() => setDlg({})} myRole={role} chat={activeChat}
            existing={members.map((m) => m._id)}
            classGroup={!!classKind} staffOnly={role === 'teacher' && !classKind}
            onAdded={() => { setDlg({}); live.refreshChat(activeChat._id); reloadProfile(); }} />
          <EditGroupDialog open={!!dlg.editGroup} onClose={() => setDlg({})} chat={activeChat}
            onSaved={(patch) => { setDlg({}); live.patchChat(activeChat._id, patch); }} />
        </>
      )}
      <ForwardDialog msg={dlg.forward} chats={live.chats} onClose={() => setDlg({})}
        onPick={(target) => {
          const m = dlg.forward;
          setDlg({});
          if (!m?.content) { toast.error('Only text messages can be forwarded'); return; }
          live.send(target._id, { content: m.content, isForwarded: true });
          toast.success(`Forwarded to ${chatName(target)}`);
        }} />
      <HistoryDialog msg={dlg.history} onClose={() => setDlg({})} />
      <Confirm open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title} message={confirm?.message}
        confirmLabel={confirm?.label}
        onConfirm={async () => { const run = confirm?.run; setConfirm(null); await run?.(); }} />
    </div>
  );
}
