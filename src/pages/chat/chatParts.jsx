import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/ui/icons';
import {
  avatarColor, initials, chatName, isGroup, listTime, clock, dayLabel, sameDay, lastSeen,
  previewText, personLine, fitsInline, fileHref, ROLE_LABEL,
} from './chatFormat';
import {
  singleEmoji, motionFor, particlesFor, durationOf, hasPlayed, markPlayed, prefersReducedMotion,
} from './emojiMotion';

// ─── Avatar ───────────────────────────────────────────────────────────────────

/**
 * `group`: false for a person, true for a named group (one letter), 'glyph'
 * for a section's staff group (the people icon on lavender).
 */
export function Avatar({ name, size = 54, group = false, image, online = false }) {
  const box = { width: size, height: size };
  if (group === 'glyph') {
    return (
      <span className="ch-av" style={box} aria-hidden="true">
        <span className="ch-av__disc is-group"><Icon name="users" size={Math.round(size * 0.46)} /></span>
      </span>
    );
  }
  return (
    <span className="ch-av" style={box} aria-hidden="true">
      <span className="ch-av__disc" style={{ background: image ? '#e5e7eb' : avatarColor(name || ''), fontSize: Math.round(size * 0.35) }}>
        {image ? <img src={fileHref(image)} alt="" /> : initials(name, !!group)}
      </span>
      {online && <span className="ch-av__dot" />}
    </span>
  );
}

export const chatAvatarKind = (chat) => (isGroup(chat) ? (chat.classSection ? 'glyph' : true) : false);

// ─── Popover ──────────────────────────────────────────────────────────────────

export function Popover({ open, onClose, style, children, label }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="ch-pop-scrim" onClick={onClose} />
      <div className="ch-pop" style={style} role="menu" aria-label={label}>{children}</div>
    </>
  );
}

export function PopItem({ icon, children, onClick, on, danger, hint }) {
  return (
    <button type="button" role="menuitem" className={`ch-pop__item${on ? ' is-on' : ''}${danger ? ' is-danger' : ''}`} onClick={onClick}>
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
      {hint !== undefined && <span className="ch-pop__hint">{hint}</span>}
      {on && <Icon name="check" size={16} style={{ marginLeft: hint !== undefined ? 6 : 'auto' }} />}
    </button>
  );
}

// ─── Conversation list ────────────────────────────────────────────────────────

const TABS = {
  staff:  [['all', 'All'], ['unread', 'Unread'], ['teacher', 'Teachers'], ['student', 'Students'], ['group', 'Groups']],
  family: [['all', 'All'], ['unread', 'Unread'], ['teacher', 'Teachers'], ['group', 'Groups']],
};

const VIEWS = {
  parent:       { label: 'Parents', icon: 'users', test: (c) => c.peerRole === 'parent' },
  school_admin: { label: 'Admins', icon: 'shieldCheck', test: (c) => c.peerRole === 'school_admin' },
  muted:        { label: 'Muted', icon: 'bellOff', test: (c) => c.isMuted },
  archived:     { label: 'Archived', icon: 'archive', test: (c) => c.isArchived },
};

export function filterChats(chats, { tab, view, q }) {
  let list = view === 'archived' ? chats.filter((c) => c.isArchived) : chats.filter((c) => !c.isArchived);
  if (view && view !== 'archived' && VIEWS[view]) list = list.filter(VIEWS[view].test);
  if (tab === 'unread') list = list.filter((c) => c.unreadCount > 0);
  else if (tab === 'group') list = list.filter(isGroup);
  else if (tab !== 'all') list = list.filter((c) => c.peerRole === tab);
  const term = q.trim().toLowerCase();
  if (term) {
    list = list.filter((c) => chatName(c).toLowerCase().includes(term)
      || (c.lastMessage?.content || '').toLowerCase().includes(term));
  }
  return list;
}

export function ChatRow({ chat, active, myId, typingLabel, onOpen }) {
  const unread = chat.unreadCount || 0;
  const deleted = !typingLabel && chat.lastMessage?.isDeleted;
  return (
    <button type="button" className={`ch-row${active ? ' is-active' : ''}`} onClick={() => onOpen(chat)}
      aria-current={active ? 'true' : undefined}>
      {/* Presence lives in the thread header, not on list avatars (as designed). */}
      <Avatar name={chatName(chat)} group={chatAvatarKind(chat)} image={chat.displayAvatar} />
      <span className="ch-row__body">
        <span className="ch-row__line">
          <span className="ch-row__name">
            <span>{chatName(chat)}</span>
            {chat.type === 'broadcast' && <span className="ch-row__flag" title="Announcements"><Icon name="megaphone" size={15} /></span>}
            {chat.isMuted && <span className="ch-row__flag" title="Muted"><Icon name="bellOff" size={15} /></span>}
          </span>
          <span className="ch-row__time">{listTime(chat.lastMessage?.createdAt || chat.lastActivity)}</span>
        </span>
        <span className="ch-row__line">
          <span className={`ch-row__preview${typingLabel ? ' is-typing' : ''}${deleted ? ' is-deleted' : ''}`}>
            {typingLabel || previewText(chat, myId)}
          </span>
          {unread > 0 && (
            <span className={`ch-row__badge${chat.isMuted ? ' is-muted' : ''}`} aria-label={`${unread} unread`}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function SkeletonRows({ n = 6 }) {
  return Array.from({ length: n }, (_, i) => (
    <div key={i} className="ch-skel" aria-hidden="true">
      <i />
      <div><i style={{ width: `${55 + ((i * 13) % 30)}%`, height: 13 }} /><i style={{ width: `${70 - ((i * 7) % 25)}%`, height: 11 }} /></div>
    </div>
  ));
}

export function ChatSidebar({
  role, chats, loading, activeId, myId, typingLabelFor,
  tab, setTab, view, setView, q, setQ, messageHits, searching,
  onOpen, onOpenHit, onNewChat, onCreateGroup, onViewAll, onMarkAllRead,
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const staff = role === 'school_admin' || role === 'teacher';
  const tabs = staff ? TABS.staff : TABS.family;
  const canGroup = staff;
  const visible = useMemo(() => filterChats(chats, { tab, view, q }), [chats, tab, view, q]);
  const unreadChats = chats.filter((c) => !c.isArchived && c.unreadCount > 0).length;
  const viewKeys = staff ? ['parent', 'school_admin', 'muted', 'archived'] : ['school_admin', 'muted', 'archived'];
  const countFor = (k) => (k === 'archived' ? chats.filter((c) => c.isArchived).length : chats.filter((c) => !c.isArchived && VIEWS[k].test(c)).length);
  const term = q.trim();

  return (
    <aside className="ch-side" aria-label="Conversations">
      <div className="ch-side__top">
        <label className="ch-search">
          <Icon name="search" size={18} />
          <span className="ch-sr">Search chats</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats..." />
          {q && <button type="button" className="ch-search__clear" onClick={() => setQ('')} aria-label="Clear search"><Icon name="close" size={16} /></button>}
        </label>
        <button type="button" className={`ch-iconbtn ch-iconbtn--boxed${view ? ' is-on' : ''}`}
          onClick={() => setFilterOpen((o) => !o)} aria-label="Filter conversations" aria-expanded={filterOpen}>
          <Icon name="sliders" size={20} />
        </button>
        <Popover open={filterOpen} onClose={() => setFilterOpen(false)} style={{ top: 64, right: 18 }} label="Filter conversations">
          <div className="ch-pop__title">Show</div>
          <PopItem icon="chat" on={!view} onClick={() => { setView(''); setFilterOpen(false); }}>All conversations</PopItem>
          {viewKeys.map((k) => (
            <PopItem key={k} icon={VIEWS[k].icon} on={view === k} hint={countFor(k)}
              onClick={() => { setView(view === k ? '' : k); setFilterOpen(false); }}>
              {VIEWS[k].label}
            </PopItem>
          ))}
          {unreadChats > 0 && <>
            <div className="ch-pop__sep" />
            <PopItem icon="checkCircle" onClick={() => { onMarkAllRead(); setFilterOpen(false); }}>Mark all as read</PopItem>
          </>}
        </Popover>
      </div>

      <div className="ch-tabs" role="tablist" aria-label="Conversation type">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key}
            className={`ch-tab${tab === key ? ' is-active' : ''}`} onClick={() => setTab(key)}>
            {label}
            {key === 'unread' && unreadChats > 0 && <span className="ch-count">{unreadChats}</span>}
          </button>
        ))}
      </div>

      <div className={`ch-actions${canGroup ? '' : ' ch-actions--one'}`}>
        <button type="button" className="ch-btn ch-btn--primary" onClick={onNewChat}>
          <Icon name="plus" size={20} strokeWidth={2} /> New Chat
        </button>
        {canGroup && (
          <button type="button" className="ch-btn ch-btn--ghost" onClick={onCreateGroup}>
            <Icon name="users" size={20} /> Create Group
          </button>
        )}
      </div>

      {role === 'school_admin' && (
        <button type="button" className="ch-allcard" onClick={onViewAll}>
          <span className="ch-allcard__icon"><Icon name="users" size={22} /></span>
          <span className="ch-allcard__body">
            <span className="ch-allcard__title">View All Chats</span>
            <span className="ch-allcard__sub">Browse and search all conversations</span>
          </span>
          <Icon name="chevronRight" size={18} className="ch-allcard__chev" />
        </button>
      )}

      {view && (
        <span className="ch-filterchip">
          Showing: {VIEWS[view]?.label}
          <button type="button" onClick={() => setView('')} aria-label="Clear filter"><Icon name="close" size={14} /></button>
        </span>
      )}

      <div className="ch-list">
        {loading ? <SkeletonRows /> : (
          <>
            {term && visible.length > 0 && <div className="ch-list__label">Chats</div>}
            {visible.map((c) => (
              <ChatRow key={c._id} chat={c} active={c._id === activeId} myId={myId}
                typingLabel={typingLabelFor(c)} onOpen={onOpen} />
            ))}
            {!visible.length && !term && (
              <div className="ch-empty-list">
                {chats.length === 0
                  ? <><strong>No conversations yet</strong>Start one with New Chat.</>
                  : <><strong>Nothing here</strong>{tab === 'unread' ? 'You are all caught up.' : 'No conversations match this view.'}</>}
              </div>
            )}
            {term.length >= 2 && (
              <>
                <div className="ch-list__label" style={{ marginTop: visible.length ? 14 : 0 }}>Messages</div>
                {searching && <SkeletonRows n={2} />}
                {!searching && !messageHits.length && !visible.length && (
                  <div className="ch-empty-list"><strong>No results</strong>Nothing matches “{term}”.</div>
                )}
                {!searching && messageHits.map((m) => (
                  <button key={m._id} type="button" className="ch-row" onClick={() => onOpenHit(m)}>
                    <Avatar name={m.chat?.name || m.sender?.name} size={44} group={m.chat?.type !== 'direct'} />
                    <span className="ch-row__body">
                      <span className="ch-row__line">
                        <span className="ch-row__name"><span>{m.chat?.name || m.sender?.name}</span></span>
                        <span className="ch-row__time">{listTime(m.createdAt)}</span>
                      </span>
                      <span className="ch-row__preview">
                        {String(m.sender?._id) === myId ? 'You' : (m.sender?.name || '').split(' ')[0]}: <Highlight text={m.content} term={term} />
                      </span>
                    </span>
                  </button>
                ))}
              </>
            )}
            {term.length === 1 && !visible.length && (
              <div className="ch-empty-list">Keep typing to search messages too.</div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function Highlight({ text = '', term }) {
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return text;
  const start = Math.max(0, i - 24);
  return (
    <>{start > 0 ? '…' : ''}{text.slice(start, i)}<mark style={{ background: '#fdf1b8', color: 'inherit', borderRadius: 3 }}>{text.slice(i, i + term.length)}</mark>{text.slice(i + term.length)}</>
  );
}

// ─── Thread header ────────────────────────────────────────────────────────────

export function ThreadHeader({ chat, profile, online, onlineCount, typingLabel, observer, onBack, onInfo, menu }) {
  const [open, setOpen] = useState(false);
  const group = isGroup(chat);
  const peer = chat.otherUser;
  const isOnline = !group && peer && online.has(peer._id);

  let status;
  if (typingLabel) status = <div className="ch-head__status is-typing">{typingLabel}</div>;
  else if (group) {
    status = (
      <div className="ch-head__status is-away">
        {chat.memberCount} member{chat.memberCount === 1 ? '' : 's'}{onlineCount > 0 ? `, ${onlineCount} online` : ''}
      </div>
    );
  } else if (isOnline) status = <div className="ch-head__status"><span className="ch-head__dot" />Online</div>;
  else if (!peer && observer) status = <div className="ch-head__status is-away">Direct conversation</div>;
  else status = <div className="ch-head__status is-away">{peer ? lastSeen(peer.lastSeenAt) : ''}</div>;

  let ctx = [];
  if (group) {
    const label = chat.sectionLabel || profile?.classSection?.label;
    if (chat.kind === 'class') ctx.push(`Class group · Class ${label}`);
    else if (chat.kind === 'subject') ctx.push(`${chat.subjectName || profile?.subject?.name || 'Subject'} · Class ${label}`);
    else if (chat.type === 'broadcast') ctx.push('Announcements');
    if (chat.isReadOnly && chat.type !== 'broadcast') ctx.push('Only teachers post');
    if (chat.description) ctx.push(chat.description);
  } else if (profile?.person) {
    ctx = personLine(profile.person);
  } else if (peer) {
    ctx = [ROLE_LABEL[peer.role] || ''];
  }
  ctx = ctx.filter(Boolean);

  return (
    <header className="ch-head">
      <button type="button" className="ch-iconbtn ch-head__back" onClick={onBack} aria-label="Back to conversations"><Icon name="arrowLeft" size={20} /></button>
      <Avatar name={chat.avatarName || chatName(chat)} size={60} group={chatAvatarKind(chat)} image={chat.displayAvatar} online={false} />
      <button type="button" className="ch-head__who" onClick={onInfo} title={group ? 'Group info' : 'Contact info'}>
        <div className="ch-head__name">
          <span>{chatName(chat)}</span>
          {observer && <span className="ch-tag ch-tag--warn"><Icon name="eye" size={13} /> Observer</span>}
          {chat.isMuted && !observer && <span className="ch-tag"><Icon name="bellOff" size={12} /> Muted</span>}
        </div>
        {status}
        {ctx.length > 0 && (
          <div className="ch-head__ctx">
            {ctx.map((part, i) => <React.Fragment key={i}>{i > 0 && <span className="ch-head__sep">|</span>}{part}</React.Fragment>)}
          </div>
        )}
      </button>
      <div className="ch-head__tools">
        <button type="button" className="ch-iconbtn" onClick={() => setOpen((o) => !o)} aria-label="Conversation options" aria-expanded={open}>
          <Icon name="dotsV" size={22} />
        </button>
        <Popover open={open} onClose={() => setOpen(false)} style={{ top: 48, right: 0 }} label="Conversation options">
          {menu.filter(Boolean).map((m, i) => (m === '-' ? <div key={i} className="ch-pop__sep" /> : (
            <PopItem key={m.label} icon={m.icon} danger={m.danger} onClick={() => { setOpen(false); m.run(); }}>{m.label}</PopItem>
          )))}
        </Popover>
      </div>
    </header>
  );
}

export function ConnectionStrip({ conn }) {
  if (conn === 'connected') return null;
  const offline = conn === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false);
  return (
    <div className={`ch-conn${offline ? ' is-offline' : ''}`} role="status">
      {offline ? <Icon name="wifiOff" size={16} /> : <span className="ch-conn__spin" />}
      {offline ? 'You are offline — messages will send when you reconnect' : 'Reconnecting to live chat…'}
    </div>
  );
}

// ─── Messages ─────────────────────────────────────────────────────────────────

const QUICK = ['👍', '❤️', '😂', '😮', '🙏'];

function Ticks({ state }) {
  if (state === 'pending') return <Icon name="clock" size={14} className="is-sent" />;
  if (state === 'read') return <Icon name="checks" size={17} className="is-read" strokeWidth={2} />;
  if (state === 'delivered') return <Icon name="checks" size={17} className="is-sent" strokeWidth={2} />;
  if (state === 'sent') return <Icon name="check" size={16} className="is-sent" strokeWidth={2} />;
  return null;
}

export function tickState(msg, chat, peerOnline) {
  if (msg.status === 'sending' || msg.status === 'queued') return 'pending';
  if (msg.status === 'failed') return 'failed';
  const t = Date.parse(msg.createdAt);
  const readUpTo = chat?.readUpTo ? Date.parse(chat.readUpTo) : 0;
  if (readUpTo && readUpTo >= t) return 'read';
  if (chat?.type === 'direct') {
    if (peerOnline) return 'delivered';
    const d = chat?.deliveredUpTo ? Date.parse(chat.deliveredUpTo) : 0;
    return d >= t ? 'delivered' : 'sent';
  }
  return 'delivered';
}

/**
 * A message that is exactly one emoji: shown large, and — when it arrives live
 * (`animate`) — played once with an animation that suits it (emojiMotion.js),
 * then left as the plain emoji. Tapping it plays it again. Never loops, never
 * replays by itself when a conversation is reopened, and stays still for
 * anyone who asked their system for reduced motion.
 */
function AnimatedEmoji({ char, animate, playKey }) {
  const kind = useMemo(() => motionFor(char), [char]);
  const [playing, setPlaying] = useState(() => animate && !hasPlayed(playKey) && !prefersReducedMotion());
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!playing) return undefined;
    markPlayed(playKey);
    const t = setTimeout(() => setPlaying(false), durationOf(kind) + 80);
    return () => clearTimeout(t);
  }, [playing, round, kind, playKey]);

  const replay = () => {
    if (prefersReducedMotion()) return;
    setRound((r) => r + 1);
    setPlaying(true);
  };
  const particles = useMemo(() => (playing ? particlesFor(kind) : []), [playing, kind, round]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span key={round} className={`ch-anim ch-anim--${kind}${playing ? ' is-playing' : ''}`} role="img" aria-label={char} onClick={replay}>
      <span className="ch-anim__glyph">{char}</span>
      {particles.map((p, i) => (
        <span key={i} className={`ch-anim__p ch-anim__p--${p.cls}`} style={p.style} aria-hidden="true">{p.char}</span>
      ))}
    </span>
  );
}

function Bubble({ msg, mine, chat, peerOnline, isAdmin, observer, myId, actions, menuOpen, setMenuOpen, hideTicks }) {
  const deletedForAll = msg.isDeleted && !(isAdmin && msg.content);
  // Exactly one emoji (with or without a reply quote above it). Two emoji, or
  // emoji with text, is an ordinary message.
  const emojiChar = !msg.isDeleted && !(msg.attachments || []).length ? singleEmoji(msg.content) : null;
  const emoji = !!emojiChar;
  const inline = !emoji && fitsInline(msg);
  const failed = msg.status === 'failed';
  const pending = msg.status === 'sending' || msg.status === 'queued';
  const canEdit = mine && !msg.isDeleted && !pending && !failed && Date.now() - Date.parse(msg.createdAt) < 86400000;
  const canDelete = !msg.isDeleted && !pending && !failed && (mine || isAdmin);
  const interactive = !observer && !msg.isDeleted && !pending && !failed;

  const cls = ['ch-bubble'];
  if (deletedForAll) cls.push('is-deleted');
  else if (emoji) cls.push('is-emoji');
  if (inline && !deletedForAll) cls.push('is-inline');
  if (pending) cls.push('is-pending');
  if (failed) cls.push('is-failed');

  const meta = (
    <span className="ch-bubble__meta">
      {msg.isEdited && !msg.isDeleted && (
        isAdmin && (msg.editHistory || []).length
          ? <span className="ch-bubble__edited is-link" role="button" tabIndex={0} onClick={() => actions.history(msg)}>edited</span>
          : <span className="ch-bubble__edited">edited</span>
      )}
      {msg.status === 'queued' ? 'waiting' : clock(msg.createdAt)}
      {mine && !deletedForAll && !hideTicks && <Ticks state={tickState(msg, chat, peerOnline)} />}
    </span>
  );

  const counts = (msg.reactions || []).reduce((acc, r) => {
    acc[r.emoji] = acc[r.emoji] || { n: 0, mine: false, names: [] };
    acc[r.emoji].n += 1;
    if (String(r.user) === myId) acc[r.emoji].mine = true;
    if (r.userName) acc[r.emoji].names.push(r.userName);
    return acc;
  }, {});

  // Low in the thread, the menu opens upward so the scroll area does not clip it.
  const [menuUp, setMenuUp] = useState(false);
  const toggleMenu = (e) => {
    if (!menuOpen) {
      const box = e.currentTarget.closest('.ch-thread')?.getBoundingClientRect();
      const at = e.currentTarget.getBoundingClientRect();
      setMenuUp(!!box && at.top - box.top > box.height * 0.5);
    }
    setMenuOpen(!menuOpen);
  };
  const side = mine ? 'right' : 'left';

  return (
    <>
      {interactive && (
        <div className={`ch-tools${menuOpen ? ' is-open' : ''}`}>
          {QUICK.slice(0, 3).map((e) => (
            <button key={e} type="button" onClick={() => actions.react(msg, e)} aria-label={`React ${e}`}>{e}</button>
          ))}
          <span className="ch-tools__sep" />
          <button type="button" onClick={() => actions.reply(msg)} aria-label="Reply"><Icon name="reply" size={17} /></button>
          <button type="button" onClick={toggleMenu} aria-label="More actions" aria-expanded={menuOpen}><Icon name="dots" size={18} /></button>
        </div>
      )}
      {interactive && (
        <Popover open={menuOpen} onClose={() => setMenuOpen(false)} label="Message actions"
          style={{ [menuUp ? 'bottom' : 'top']: 'calc(100% + 6px)', [side]: 0, minWidth: 200 }}>
          <div className="ch-pop__reacts">
            {QUICK.map((e) => (
              <button key={e} type="button" onClick={() => { setMenuOpen(false); actions.react(msg, e); }} aria-label={`React ${e}`}>{e}</button>
            ))}
          </div>
          <div className="ch-pop__sep" />
          <PopItem icon="reply" onClick={() => { setMenuOpen(false); actions.reply(msg); }}>Reply</PopItem>
          <PopItem icon="forward" onClick={() => { setMenuOpen(false); actions.forward(msg); }}>Forward</PopItem>
          {msg.content && <PopItem icon="copy" onClick={() => { setMenuOpen(false); actions.copy(msg); }}>Copy text</PopItem>}
          {canEdit && <PopItem icon="pencil" onClick={() => { setMenuOpen(false); actions.edit(msg); }}>Edit</PopItem>}
          {isAdmin && (msg.editHistory || []).length > 0 && <PopItem icon="history" onClick={() => { setMenuOpen(false); actions.history(msg); }}>Edit history</PopItem>}
          {canDelete && <PopItem icon="trash" danger onClick={() => { setMenuOpen(false); actions.remove(msg); }}>{mine ? 'Delete for everyone' : 'Delete (admin)'}</PopItem>}
        </Popover>
      )}
      <div className={cls.join(' ')}
        onClick={interactive ? (e) => { if (window.matchMedia?.('(hover: none)').matches && !e.target.closest('a, button')) toggleMenu(e); } : undefined}>
        {deletedForAll ? (
          <span className="ch-bubble__text"><Icon name="closeCircle" size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />This message was deleted</span>
        ) : (
          <>
            {msg.isDeleted && <div className="ch-bubble__adminnote">Deleted — visible to admins only</div>}
            {msg.isForwarded && <div className="ch-bubble__fwd"><Icon name="forward" size={13} /> Forwarded</div>}
            {msg.replyTo && (
              <button type="button" className="ch-bubble__quote" onClick={() => actions.jump(msg.replyTo._id)}>
                <b>{String(msg.replyTo.sender?._id) === myId ? 'You' : (msg.replyTo.sender?.name || 'Message')}</b>
                <span>{msg.replyTo.isDeleted ? 'Deleted message' : (msg.replyTo.content || 'Attachment')}</span>
              </button>
            )}
            {(msg.attachments || []).map((a, i) => (
              <a key={i} className="ch-bubble__att" href={fileHref(a.fileUrl)} target="_blank" rel="noreferrer">
                {/^image\//.test(a.fileType || '') ? <img src={fileHref(a.fileUrl)} alt={a.originalName || ''} /> : <><Icon name="fileDoc" size={18} />{a.originalName || 'Attachment'}</>}
              </a>
            ))}
            {emoji
              ? <AnimatedEmoji char={emojiChar} animate={!!msg.fresh} playKey={msg.clientId || msg._id} />
              : msg.content && <span className={`ch-bubble__text${msg.isDeleted ? ' ch-bubble__struck' : ''}`}>{msg.content}</span>}
          </>
        )}
        {!emoji && meta}
        {failed && (
          <div className="ch-bubble__fail">
            <Icon name="alert" size={14} /> {msg.error || 'Not sent'}
            <button type="button" onClick={() => actions.retry(msg)}>Retry</button>
            <button type="button" onClick={() => actions.discard(msg)}>Discard</button>
          </div>
        )}
      </div>
      {emoji && <div style={{ padding: '0 4px' }}>{meta}</div>}
      {Object.keys(counts).length > 0 && (
        <div className="ch-reacts">
          {Object.entries(counts).map(([e, c]) => (
            <button key={e} type="button" className={`ch-react${c.mine ? ' is-mine' : ''}`} title={c.names.join(', ')}
              onClick={() => !observer && actions.react(msg, e)} disabled={observer}>
              {e}{c.n > 1 && <b>{c.n}</b>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * The thread. Keeps the reader's place: sticks to the bottom while they are
 * there, holds still (with a "new messages" pill) when they have scrolled up,
 * and keeps the same message under their eye when older history loads above.
 */
export function MessageList({
  chatId, items, chat, loading, hasMore, loadingOlder, onLoadOlder, myId, isAdmin, observer,
  peerOnline, typingNames, unreadFrom, actions, error, onRetryLoad, hideTicks = false,
}) {
  const scroller = useRef(null);
  const [menuFor, setMenuFor] = useState(null);
  const [fresh, setFresh] = useState(0);
  const pinned = useRef(true);
  const lastCount = useRef(0);
  const lastLast = useRef(null);
  const firstId = useRef(null);
  const prevHeight = useRef(0);
  const opened = useRef(null);
  const group = isGroup(chat);

  // New conversation: start at the bottom (or at the first unread one).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || loading || opened.current === chatId) return;
    opened.current = chatId;
    const mark = unreadFrom && el.querySelector('[data-unread-rule]');
    if (mark) el.scrollTop = Math.max(0, mark.offsetTop - 80);
    else el.scrollTop = el.scrollHeight;
    pinned.current = !mark;
    lastCount.current = items.length;
    lastLast.current = items[items.length - 1]?._id || null;
    firstId.current = items[0]?._id || null;
    setFresh(0);
  }, [chatId, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || loading || opened.current !== chatId) return;
    const first = items[0]?._id || null;
    const last = items[items.length - 1];
    if (first !== firstId.current && lastLast.current === (last?._id || null)) {
      // Older history arrived above: keep the same message in view.
      el.scrollTop = el.scrollHeight - prevHeight.current + el.scrollTop;
    } else if ((last?._id || null) !== lastLast.current) {
      const mineNow = last && String(last.sender?._id) === myId;
      if (pinned.current || mineNow) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        setFresh(0);
      } else if (items.length > lastCount.current) {
        setFresh((n) => n + (items.length - lastCount.current));
      }
    }
    firstId.current = first;
    lastLast.current = last?._id || null;
    lastCount.current = items.length;
    prevHeight.current = el.scrollHeight;
  }, [items, chatId, loading, myId]);

  // The typing bubble appearing should not leave the reader short of the bottom.
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current && typingNames.length) el.scrollTop = el.scrollHeight;
  }, [typingNames.length]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    prevHeight.current = el.scrollHeight;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (pinned.current && fresh) setFresh(0);
    if (el.scrollTop < 80 && hasMore && !loadingOlder) onLoadOlder();
  };

  const jumpDown = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setFresh(0);
  };

  const blocks = [];
  let prev = null;
  for (const m of items) {
    const at = m.createdAt;
    if (!prev || !sameDay(prev.createdAt, at)) {
      const label = dayLabel(at);
      blocks.push(<div key={`d-${m._id}`} className={`ch-day${label === 'Today' ? ' ch-day--rule' : ''}`}><span>{label}</span></div>);
      prev = null;
    }
    if (unreadFrom && m._id === unreadFrom) {
      blocks.push(<div key="unread" className="ch-unread-rule" data-unread-rule>Unread messages</div>);
      prev = null;
    }
    const mine = String(m.sender?._id) === myId;
    const cont = prev && String(prev.sender?._id) === String(m.sender?._id) && Date.parse(at) - Date.parse(prev.createdAt) < 5 * 60000;
    const showWho = group && !mine && !cont;
    blocks.push(
      <div key={m.clientId || m._id} id={`msg-${m._id}`} className={`ch-msg ch-msg--${mine ? 'out' : 'in'}${cont ? ' is-cont' : ''}`}>
        {group && !mine && (
          <div className="ch-msg__av">{showWho ? <Avatar name={m.sender?.name} size={32} /> : null}</div>
        )}
        <div className="ch-msg__col" style={{ position: 'relative' }}>
          {showWho && (
            <div className="ch-msg__sender" style={{ color: avatarColor(m.sender?.name || '') }}>
              {m.sender?.name} {m.sender?.role && <em>· {ROLE_LABEL[m.sender.role] || m.sender.role}</em>}
            </div>
          )}
          <Bubble msg={m} mine={mine} chat={chat} peerOnline={peerOnline} isAdmin={isAdmin} observer={observer} myId={myId}
            actions={actions} menuOpen={menuFor === m._id} setMenuOpen={(o) => setMenuFor(o ? m._id : null)} hideTicks={hideTicks} />
        </div>
      </div>,
    );
    prev = m;
  }

  // The "new messages" pill lives OUTSIDE the scroller: an absolutely placed
  // child of a scrolling box scrolls with its content.
  return (
    <div className="ch-thread-wrap">
      <div className="ch-thread" ref={scroller} onScroll={onScroll} aria-live="polite" aria-relevant="additions">
        {loading ? (
          <div className="ch-center"><span className="spinner" /></div>
        ) : error && !items.length ? (
          <div className="ch-center">
            <p>{error}</p>
            <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" onClick={onRetryLoad}><Icon name="refresh" size={16} /> Try again</button>
          </div>
        ) : (
          <>
            <div className="ch-thread__older">
              {loadingOlder ? 'Loading earlier messages…' : hasMore ? (
                <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" onClick={onLoadOlder}>Load earlier messages</button>
              ) : items.length ? null : null}
            </div>
            {!items.length && (
              <div className="ch-center" style={{ paddingTop: 60 }}>
                <div className="ch-center__icon"><Icon name="chat" size={30} /></div>
                <h3>{observer ? 'No messages' : 'Say hello'}</h3>
                <p>{observer ? 'Nobody has written here yet.' : `This is the start of your conversation${chat.type === 'direct' ? ` with ${chatName(chat)}` : ''}.`}</p>
              </div>
            )}
            {blocks}
            {typingNames.length > 0 && (
              <div className="ch-typing" aria-label={`${typingNames.join(', ')} typing`}>
                {group && <div className="ch-msg__av"><Avatar name={typingNames[0]} size={32} /></div>}
                <div className="ch-typing__dots"><i /><i /><i /></div>
              </div>
            )}
          </>
        )}
      </div>
      {fresh > 0 && (
        <button type="button" className="ch-jump" onClick={jumpDown}>
          <Icon name="arrowDown" size={15} /> {fresh} new message{fresh === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

const EMOJI = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😍','🥰','😘',
  '😋','😜','🤪','😎','🤩','🥳','😏','😒','😔','😞','😢','😭','😤','😠','😡','🤯',
  '😳','🥺','😱','😨','😰','😥','🤔','🤗','🤭','🙄','😴','🤤','😷','🤒','🤕','🤢',
  '👍','👎','👌','✌️','🤞','🤝','👏','🙌','🙏','💪','🫶','👋','🖐️','✋','👀','🧠',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💖','💯','🔥','✨','🎉',
  '🎊','🎁','🏆','⭐','🌟','💡','✅','❌','⚠️','❓','❗','📚','📝','📅','🕐','☕',
];

const MAX = 4000;

export function Composer({ chatId, draft, setDraft, replyTo, editing, onCancel, onSend, onTyping, onEditLast, disabledReason, myName }) {
  const ref = useRef(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // Grow with the text, up to a limit.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [draft]);

  useEffect(() => { if (!disabledReason) ref.current?.focus(); }, [chatId, replyTo?._id, editing?._id, disabledReason]);

  if (disabledReason) {
    return <div className="ch-compose__notice"><Icon name="lock" size={16} /> {disabledReason}</div>;
  }

  const text = draft || '';
  const over = [...text].length > MAX;
  const canSend = text.trim().length > 0 && !over;

  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setEmojiOpen(false);
  };

  const insert = (e) => {
    const el = ref.current;
    if (el && typeof el.selectionStart === 'number') {
      const s = el.selectionStart, end = el.selectionEnd;
      setDraft(text.slice(0, s) + e + text.slice(end));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + e.length, s + e.length); });
    } else setDraft(text + e);
  };

  return (
    <>
      {(replyTo || editing) && (
        <div className="ch-bar">
          <Icon name={editing ? 'pencil' : 'reply'} size={18} />
          <div className="ch-bar__body">
            <b>{editing ? 'Editing message' : `Replying to ${String(replyTo.sender?.name || '') === myName ? 'yourself' : (replyTo.sender?.name || 'message')}`}</b>
            <span>{(editing || replyTo).content || 'Attachment'}</span>
          </div>
          <button type="button" className="ch-iconbtn" onClick={onCancel} aria-label="Cancel"><Icon name="close" size={18} /></button>
        </div>
      )}
      <form className="ch-compose" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {emojiOpen && (
          <>
            <div className="ch-pop-scrim" onClick={() => setEmojiOpen(false)} />
            <div className="ch-emoji" role="dialog" aria-label="Emoji">
              {EMOJI.map((e) => <button key={e} type="button" onClick={() => insert(e)}>{e}</button>)}
            </div>
          </>
        )}
        <div className="ch-input">
          <button type="button" className={`ch-input__emoji${emojiOpen ? ' is-on' : ''}`} onClick={() => setEmojiOpen((o) => !o)} aria-label="Emoji">
            <Icon name="smile" size={24} />
          </button>
          <label className="ch-sr" htmlFor="ch-composer">Message</label>
          <textarea
            id="ch-composer"
            ref={ref}
            rows={1}
            value={text}
            placeholder="Type a message..."
            onChange={(e) => { setDraft(e.target.value); if (e.target.value) onTyping(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
              else if (e.key === 'Escape' && (replyTo || editing)) { e.preventDefault(); onCancel(); }
              else if (e.key === 'ArrowUp' && !text && !editing) { if (onEditLast()) e.preventDefault(); }
            }}
          />
        </div>
        {[...text].length > MAX - 400 && (
          <span className={`ch-compose__count${over ? ' is-over' : ''}`}>{[...text].length}/{MAX}</span>
        )}
        <button type="submit" className="ch-send" disabled={!canSend} aria-label={editing ? 'Save edit' : 'Send message'}>
          <Icon name={editing ? 'check' : 'send'} size={22} strokeWidth={editing ? 2.2 : 1.9} />
        </button>
      </form>
    </>
  );
}
