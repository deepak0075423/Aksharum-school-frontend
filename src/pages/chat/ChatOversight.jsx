import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import Icon from '../../components/ui/icons';
import { useAuth } from '../../contexts/AuthContext';
import * as chatApi from '../../api/chat.api';
import { Avatar, MessageList } from './chatParts';
import { HistoryDialog } from './chatDialogs';
import { listTime, shortName, ROLE_LABEL } from './chatFormat';
import '../../styles/chat.css';
import Tabs from '../../components/ui/Tabs';

const ROLES = [['', 'Everyone'], ['teacher', 'Teachers'], ['student', 'Students'], ['parent', 'Parents'], ['school_admin', 'Admins']];
const KINDS = [['all', 'All'], ['direct', 'Direct'], ['group', 'Groups']];
const EMPTY_PEOPLE = { rows: [], total: 0, counts: {}, page: 1, pages: 1, loading: true };

const personLine = (p) => {
  const role = ROLE_LABEL[p.role] || p.role;
  return p.line && p.line !== role ? `${role} · ${p.line}` : role;
};

const groupLabel = (c) => {
  if (c.kind === 'class') return 'Class group';
  if (c.kind === 'subject') return `${c.subjectName || 'Subject'} group`;
  return c.type === 'broadcast' ? 'Announcements' : 'Group';
};

/**
 * One conversation's full history, read as an observer. Nothing here is live —
 * the admin is not a member of the room — so there is a Refresh.
 */
function useObservedThread(chatId) {
  const [t, setT] = useState({ items: [], hasMore: false, loading: false, loadingOlder: false, error: '' });
  const ref = useRef(t);
  ref.current = t;
  const current = useRef(chatId);
  current.current = chatId;

  const load = useCallback(async () => {
    if (!chatId) { setT({ items: [], hasMore: false, loading: false, loadingOlder: false, error: '' }); return; }
    setT({ items: [], hasMore: false, loading: true, loadingOlder: false, error: '' });
    try {
      const res = await chatApi.getMessages(chatId, { limit: 60 });
      if (current.current !== chatId) return;
      setT({ items: (res?.data || []).map((m) => ({ ...m, status: 'sent' })), hasMore: !!res?.hasMore, loading: false, loadingOlder: false, error: '' });
    } catch (err) {
      if (current.current === chatId) setT((x) => ({ ...x, loading: false, error: err?.message || 'Could not load messages' }));
    }
  }, [chatId]);

  useEffect(() => { load(); }, [load]);

  const fetchOlder = useCallback(async (all) => {
    const cur = ref.current;
    if (!chatId || cur.loadingOlder || !cur.hasMore || !cur.items.length) return;
    setT((x) => ({ ...x, loadingOlder: true }));
    let before = cur.items[0].createdAt;
    let more = true;
    let older = [];
    try {
      for (let guard = 0; more && guard < (all ? 60 : 1); guard++) {
        const res = await chatApi.getMessages(chatId, { before, limit: 100 });
        const page = (res?.data || []).map((m) => ({ ...m, status: 'sent' }));
        older = [...page, ...older];
        more = !!res?.hasMore && page.length > 0;
        before = page[0]?.createdAt;
      }
      if (current.current !== chatId) return;
      setT((x) => ({ ...x, items: [...older, ...x.items], hasMore: more, loadingOlder: false }));
    } catch {
      setT((x) => ({ ...x, loadingOlder: false }));
      toast.error('Could not load earlier messages');
    }
  }, [chatId]);

  return { ...t, reload: load, loadOlder: () => fetchOlder(false), loadAll: () => fetchOlder(true) };
}

/**
 * View All Chats — the school admin's read-only view of every conversation.
 *
 *   people who have chatted  →  one person's conversations  →  the full history
 *
 * All three stay on one page, the selection rides in the URL (?u=person&c=chat)
 * so a reload or a shared link lands in the same place. Members are never told
 * the admin looked; the page says so.
 */
export default function ChatOversight() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const personId = params.get('u');
  const chatId = params.get('c');
  const isAdmin = user?.role === 'school_admin';

  // ── People ──────────────────────────────────────────────────────────────────
  const [people, setPeople] = useState(EMPTY_PEOPLE);
  const [pq, setPq] = useState('');
  const [role, setRole] = useState('');
  const peopleReq = useRef(0);
  const loadPeople = useCallback(async ({ page = 1, append = false } = {}) => {
    const req = ++peopleReq.current;
    setPeople((p) => ({ ...p, loading: true }));
    try {
      const res = await chatApi.getAdminPeople({ q: pq.trim() || undefined, role: role || undefined, page, limit: 40 });
      if (req !== peopleReq.current) return;
      setPeople((p) => ({
        rows: append ? [...p.rows, ...(res?.data || [])] : (res?.data || []),
        total: res?.total || 0, counts: res?.counts || {}, page: res?.page || page, pages: res?.pages || 1, loading: false,
      }));
    } catch (err) {
      if (req === peopleReq.current) setPeople((p) => ({ ...p, loading: false }));
      toast.error(err?.message || 'Could not load people');
    }
  }, [pq, role]);
  useEffect(() => {
    if (!isAdmin) return undefined;
    const t = setTimeout(() => loadPeople(), pq ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadPeople, pq, isAdmin]);

  // ── One person's conversations ──────────────────────────────────────────────
  const [person, setPerson] = useState({ loading: false, data: null, error: '' });
  const [cq, setCq] = useState('');
  const [kind, setKind] = useState('all');
  const reloadPerson = useCallback(async () => {
    if (!personId || !isAdmin) { setPerson({ loading: false, data: null, error: '' }); return; }
    setPerson((p) => ({ loading: true, data: p.data?.person?._id === personId ? p.data : null, error: '' }));
    try {
      const res = await chatApi.getAdminPersonChats(personId);
      setPerson({ loading: false, data: res?.data || null, error: '' });
    } catch (err) {
      setPerson({ loading: false, data: null, error: err?.message || 'Could not load conversations' });
    }
  }, [personId, isAdmin]);
  useEffect(() => { reloadPerson(); setCq(''); setKind('all'); }, [reloadPerson]);

  const convs = useMemo(() => {
    const list = person.data?.conversations || [];
    const term = cq.trim().toLowerCase();
    return list.filter((c) => (kind === 'all' || (kind === 'direct' ? c.type === 'direct' : c.type !== 'direct'))
      && (!term || c.displayName.toLowerCase().includes(term) || (c.lastMessage?.content || '').toLowerCase().includes(term)));
  }, [person.data, cq, kind]);
  const conv = (person.data?.conversations || []).find((c) => c._id === chatId) || null;

  // A link straight to ?c= (no person, or a group they are not in): read its profile for the header.
  const [loose, setLoose] = useState(null);
  useEffect(() => {
    setLoose(null);
    if (!isAdmin || !chatId || conv || person.loading) return;
    chatApi.getChatProfile(chatId).then((res) => setLoose(res?.data || null)).catch(() => setLoose(null));
  }, [chatId, conv, person.loading, isAdmin]);

  // ── Thread ──────────────────────────────────────────────────────────────────
  const thread = useObservedThread(isAdmin ? chatId : null);
  const [historyMsg, setHistoryMsg] = useState(null);

  const pick = (next) => setParams(() => {
    const n = new URLSearchParams();
    if (next.u) n.set('u', next.u);
    if (next.c) n.set('c', next.c);
    return n;
  });

  if (user && !isAdmin) return <Navigate to="/chat" replace />;

  const p = person.data?.person;
  const stats = p?.stats;
  const threadChat = conv
    ? { _id: conv._id, type: conv.type, kind: conv.kind }
    : loose ? { _id: loose._id, type: loose.type, kind: loose.kind } : null;
  const title = conv
    ? (conv.type === 'direct' ? `${p?.name} ↔ ${conv.displayName}` : conv.displayName)
    : loose ? (loose.type === 'direct' ? (loose.members || []).map((m) => m.name).join(' ↔ ') : loose.name) : '';
  const sub = conv
    ? [
      conv.type === 'direct' ? 'Direct conversation' : `${groupLabel(conv)} · ${conv.memberCount} members`,
      `${conv.messageCount} message${conv.messageCount === 1 ? '' : 's'}`,
      `${shortName(p?.name || '')} sent ${conv.sentCount}`,
      !conv.stillMember ? `${shortName(p?.name || '')} has left` : '',
    ].filter(Boolean).join(' · ')
    : loose ? `${loose.type === 'direct' ? 'Direct conversation' : `${groupLabel(loose)} · ${loose.memberCount} members`}` : '';

  const actions = {
    history: (m) => setHistoryMsg(m),
    jump: (id) => {
      const el = document.getElementById(`msg-${id}`);
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.animate?.([{ background: 'rgba(79,70,229,.14)' }, { background: 'transparent' }], { duration: 1400 }); }
      else toast('That message is further back — load earlier messages');
    },
    react: () => {}, reply: () => {}, forward: () => {}, copy: () => {}, edit: () => {}, remove: () => {}, retry: () => {}, discard: () => {},
  };

  return (
    <div className={`cho${personId ? ' has-person' : ''}${chatId ? ' has-chat' : ''}`}>
      {/* ── People ── */}
      <section className="cho-col cho-col--people" aria-label="People">
        <div className="cho-head">
          <button type="button" className="ch-iconbtn" onClick={() => navigate('/chat')} aria-label="Back to Chat"><Icon name="arrowLeft" size={20} /></button>
          <div className="cho-head__text">
            <div className="cho-title">All Chats</div>
            <div className="cho-sub">{people.loading && !people.rows.length ? 'Loading…' : `${people.total} ${people.total === 1 ? 'person has' : 'people have'} chatted · read-only`}</div>
          </div>
        </div>
        <div className="cho-search">
          <label className="ch-search">
            <Icon name="search" size={18} />
            <span className="ch-sr">Search people</span>
            <input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Search people..." />
            {pq && <button type="button" className="ch-search__clear" onClick={() => setPq('')} aria-label="Clear"><Icon name="close" size={16} /></button>}
          </label>
        </div>
        <div className="ch-rolechips" role="group" aria-label="Filter by role">
          {ROLES.map(([k, label]) => (
            <button key={k || 'all'} type="button" className={role === k ? 'is-on' : ''} onClick={() => setRole(k)}>
              {label}{k && people.counts?.[k] ? ` · ${people.counts[k]}` : ''}
            </button>
          ))}
        </div>
        <div className="cho-list"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 120 && !people.loading && people.page < people.pages) loadPeople({ page: people.page + 1, append: true });
          }}>
          {people.loading && !people.rows.length ? <div className="ch-empty-list">Loading…</div>
            : !people.rows.length ? <div className="ch-empty-list"><strong>Nobody here</strong>{pq ? `No one matches “${pq}”.` : 'Nobody has chatted yet.'}</div>
              : people.rows.map((r) => (
                <button key={r._id} type="button" className={`ch-row cho-row${r._id === personId ? ' is-active' : ''}`} onClick={() => pick({ u: r._id })}>
                  <Avatar name={r.name} size={44} image={r.profileImage} />
                  <span className="ch-row__body">
                    <span className="ch-row__name"><span>{r.name}</span>{!r.isActive && <span className="cho-left">Inactive</span>}</span>
                    <span className="ch-row__preview" style={{ display: 'block' }}>{personLine(r)}</span>
                  </span>
                  <span className="cho-row__side">
                    <span className="ch-row__time">{listTime(r.lastActivity)}</span>
                    <span className="cho-count">{r.conversations} chat{r.conversations === 1 ? '' : 's'}</span>
                  </span>
                </button>
              ))}
          {people.loading && people.rows.length > 0 && <div className="ch-empty-list" style={{ padding: 12 }}>Loading more…</div>}
        </div>
      </section>

      {/* ── Their conversations ── */}
      <section className="cho-col cho-col--convs" aria-label="Conversations">
        {!personId ? (
          <div className="cho-blank">
            <div className="ch-center__icon"><Icon name="users" size={30} /></div>
            <h3>Pick a person</h3>
            <p>You will see everyone they have talked to — one-to-one and in groups — and every message.</p>
          </div>
        ) : !p ? (
          <div className="cho-blank">{person.error ? <p>{person.error}</p> : <span className="spinner" />}</div>
        ) : (
          <>
            <div className="cho-person">
              <button type="button" className="ch-iconbtn cho-back" onClick={() => pick({})} aria-label="Back to people"><Icon name="arrowLeft" size={20} /></button>
              <Avatar name={p.name} size={52} image={p.profileImage} />
              <div className="cho-person__body">
                <div className="cho-person__name">{p.name}{!p.isActive && <span className="cho-left">Inactive</span>}</div>
                <div className="cho-person__line">{personLine(p)}</div>
                <div className="cho-stats">
                  <span className="cho-stat"><b>{stats.conversations}</b> conversation{stats.conversations === 1 ? '' : 's'}</span>
                  <span className="cho-stat"><b>{stats.direct}</b> direct</span>
                  <span className="cho-stat"><b>{stats.groups}</b> group{stats.groups === 1 ? '' : 's'}</span>
                  <span className="cho-stat"><b>{stats.messagesSent}</b> sent</span>
                </div>
              </div>
            </div>
            <div className="cho-search" style={{ marginTop: 12 }}>
              <label className="ch-search">
                <Icon name="search" size={18} />
                <span className="ch-sr">Search conversations</span>
                <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder={`Search ${shortName(p.name)}'s conversations...`} />
              </label>
            </div>
            <Tabs variant="solid" className="uitabs--sm" label="Conversation kind"
              value={kind} onChange={setKind}
              items={KINDS.map(([k, label]) => ({
                key: k, label,
                count: k === 'all' ? undefined : (k === 'direct' ? stats.direct : stats.groups),
              }))} />
            <div className="cho-list">
              {!convs.length ? (
                <div className="ch-empty-list">{cq ? `Nothing matches “${cq}”.` : `${shortName(p.name)} has no ${kind === 'all' ? '' : kind === 'direct' ? 'direct ' : 'group '}conversations.`}</div>
              ) : convs.map((c) => {
                const direct = c.type === 'direct';
                const last = c.lastMessage;
                const who = last ? (last.sender?._id === p._id ? shortName(p.name) : shortName(last.sender?.name || '')) : '';
                return (
                  <button key={c._id} type="button" className={`ch-row cho-row${c._id === chatId ? ' is-active' : ''}`} onClick={() => pick({ u: personId, c: c._id })}>
                    <Avatar name={c.displayName} size={44} image={c.with?.profileImage} group={direct ? false : (c.classSection ? 'glyph' : true)} />
                    <span className="ch-row__body">
                      <span className="ch-row__line">
                        <span className="ch-row__name"><span>{c.displayName}</span>{!c.stillMember && <span className="cho-left">Left</span>}</span>
                        <span className="ch-row__time">{listTime(last?.createdAt || c.lastActivity)}</span>
                      </span>
                      <span className="ch-row__line">
                        <span className={`ch-row__preview${last?.isDeleted ? ' is-deleted' : ''}`}>
                          {!last ? 'No messages' : last.isDeleted ? `${who}: message deleted` : `${who}: ${last.content || 'Attachment'}`}
                        </span>
                        <span className="cho-count" title="Messages">{c.messageCount}</span>
                      </span>
                      <span className="ch-row__meta">
                        {direct ? personLine(c.with || { role: '' }) : `${groupLabel(c)} · ${c.memberCount} members`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ── The conversation ── */}
      <section className="cho-col cho-col--thread" aria-label="Conversation">
        {!chatId ? (
          <div className="cho-blank">
            <div className="ch-center__icon"><Icon name="chat" size={30} /></div>
            <h3>{personId ? 'Pick a conversation' : 'Read any conversation'}</h3>
            <p>Every message is shown, including deleted and edited ones. Members are not notified that you read them.</p>
          </div>
        ) : (
          <>
            <header className="cho-thread-head">
              <button type="button" className="ch-iconbtn cho-back" onClick={() => pick({ u: personId })} aria-label="Back to conversations"><Icon name="arrowLeft" size={20} /></button>
              {conv?.type === 'direct' ? (
                <span className="cho-pair">
                  <Avatar name={p?.name} size={44} image={p?.profileImage} />
                  <Avatar name={conv.displayName} size={44} image={conv.with?.profileImage} />
                </span>
              ) : (
                <Avatar name={title || '?'} size={52} group={threadChat?.type === 'direct' ? false : ((conv?.classSection || loose?.classSection) ? 'glyph' : true)} />
              )}
              <div className="cho-thread-head__text">
                <div className="cho-thread-head__title">{title || 'Conversation'}</div>
                <div className="cho-thread-head__sub">{sub}</div>
              </div>
              <div className="cho-thread-head__tools">
                {thread.hasMore && (
                  <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm" onClick={thread.loadAll} disabled={thread.loadingOlder}>
                    <Icon name="history" size={15} /> {thread.loadingOlder ? 'Loading…' : 'Full history'}
                  </button>
                )}
                <button type="button" className="ch-iconbtn" onClick={() => { thread.reload(); reloadPerson(); }} aria-label="Refresh" title="Refresh"><Icon name="refresh" size={18} /></button>
              </div>
            </header>
            <div className="ch-observer">
              <Icon name="eye" size={16} /> Read-only. {p && conv ? `${shortName(p.name)}'s messages are on the right. ` : ''}Members are not notified.
            </div>
            <MessageList
              chatId={chatId}
              items={thread.items}
              chat={threadChat || { _id: chatId, type: 'group' }}
              loading={thread.loading}
              error={thread.error}
              onRetryLoad={thread.reload}
              hasMore={thread.hasMore}
              loadingOlder={thread.loadingOlder}
              onLoadOlder={thread.loadOlder}
              myId={personId || ''}
              isAdmin
              observer
              hideTicks
              peerOnline={false}
              typingNames={[]}
              unreadFrom={null}
              actions={actions}
            />
          </>
        )}
      </section>

      <HistoryDialog msg={historyMsg} onClose={() => setHistoryMsg(null)} />
    </div>
  );
}
