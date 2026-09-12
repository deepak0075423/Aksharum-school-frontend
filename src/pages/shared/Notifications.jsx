/**
 * Notifications — one screen, every role.
 *
 * A mailbox in three boxes. **Inbox** is everything that has reached this
 * account and not been put away, **Archived** is what has, and **Sent** is what
 * this account has sent — with the figure that actually matters about a
 * broadcast, which is how much of the audience opened it.
 *
 * The four roles are the same mailbox with different words and different reach,
 * so they are one page rather than four: an admin addresses the school, a
 * teacher addresses the sections they teach, and a student or a parent only
 * ever receives, so neither is offered a Sent tab they could never fill. What
 * differs is entirely in ROLES below.
 *
 * Every filter is a server parameter. An account a year old has thousands of
 * receipts, and a search that only looked at the fifty rows already fetched
 * would answer a different question than the one asked — so the search, the
 * module, the priority, the kind, the read state, the sort and the page all go
 * to GET /notifications/all and come back narrowed.
 *
 * Built on the app's list frame (admin/listParts.jsx) for the card, the
 * toolbar, the row menu and the footer; the row itself is drawn in
 * notificationParts.jsx, because a notification is a headline and a sentence
 * rather than a set of columns.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getAllNotifications, getSent, markOneRead, markOneUnread, markAllRead,
  clearOne, restoreOne, archiveRead, resolveNotification,
  bulkNotifications, deleteAllNotifications,
} from '../../api/notifications.api';
import { sendNotification as adminSend, getClassesWithSections } from '../../api/admin.api';
import { sendNotification as teacherSend, getMySections } from '../../api/teacher.api';
import { useAuth } from '../../contexts/AuthContext';
import { useModules } from '../../contexts/ModulesContext';
import { connectSocket, getSocket } from '../../socket';
import { Alert, Button, Confirm, Empty, Spinner } from '../../components/ui/index';
import Icon, { SupportScene } from '../../components/ui/icons';
import {
  Crumbs, SearchField, ListTable, ListFooter, Drawer, HelpPanel, PageFoot, useSelection,
} from '../admin/listParts';
import {
  ADMIN_AUDIENCES, BulkBar, Channels, Composer, KINDS, NotifDetail, NotifHero, NotifRow,
  PRIORITIES, ReadThrough, READ_STATES, SORTS, SentCell, TEACHER_AUDIENCES,
  TabStrip, fullWhen, targetLabel, when,
} from './notificationParts';

// ── What each role's mailbox is ──────────────────────────────────────────────
// `sends` is the only structural difference: it decides whether the Sent tab
// and the compose button exist at all. A student has no way to send a
// notification, so offering either would be a dead end.
const ROLES = {
  school_admin: {
    home: '/admin/dashboard',
    subtitle: 'Everything that has happened across your school, and everything you have sent.',
    tip: 'Leave requests, approvals and fines arrive here the moment they happen.',
    sends: 'school',
  },
  teacher: {
    home: '/teacher/dashboard',
    subtitle: 'Everything your school has sent you, and everything you have sent your classes.',
    tip: 'Approvals, substitutions and library notices arrive here the moment they happen.',
    sends: 'sections',
  },
  student: {
    home: '/student/dashboard',
    subtitle: 'Everything your school has sent you — announcements, results, library and fees.',
    tip: 'Announcements, results and library notices arrive here the moment they happen.',
    sends: null,
  },
  parent: {
    home: '/parent/dashboard',
    subtitle: "Everything your school has sent you about your children.",
    tip: 'Fees, attendance and school announcements arrive here the moment they happen.',
    sends: null,
  },
};

const EMPTY_FILTERS = { kind: '', module: '', priority: '', read: '', sort: 'newest' };
const EMPTY_SENT    = { kind: '', priority: '', channel: '', sort: 'newest' };

const SENT_SORTS = [
  { value: 'newest',     label: 'Newest first' },
  { value: 'oldest',     label: 'Oldest first' },
  { value: 'recipients', label: 'Largest audience' },
  { value: 'title',      label: 'Title (A–Z)' },
];

export default function Notifications() {
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const { isEnabled } = useModules();
  const [params, setParams] = useSearchParams();

  const role = ROLES[me?.role] || ROLES.student;
  // Sending sits behind the notification module the same way the endpoint does
  // — a teacher whose school has it switched off would get a 403 from a button
  // this page had no business drawing.
  const canSend = !!role.sends && isEnabled('notification');

  const [tab,     setTab]     = useState('inbox');   // inbox | sent | archived
  const [search,  setSearch]  = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sentFilters, setSentFilters] = useState(EMPTY_SENT);
  const [page,    setPage]    = useState(1);
  const [limit,   setLimit]   = useState(10);
  const [viewing, setViewing] = useState(null);      // the notification behind the panel
  // The last one opened, kept after the panel closes: having read one of forty
  // near-identical rows, the question is which one you just looked at.
  const [activeId, setActiveId] = useState(null);
  const [confirm,  setConfirm]  = useState(null);   // { title, message, label, run }
  const [busy,     setBusy]     = useState(false);

  // A request per keystroke is a request per keystroke; wait for a pause.
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const isSent = tab === 'sent';

  const query = useMemo(() => (isSent
    ? { page, limit, q: term || undefined, ...Object.fromEntries(Object.entries(sentFilters).filter(([, v]) => v)) }
    : {
        page, limit, box: tab, q: term || undefined,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      }),
  [isSent, tab, page, limit, term, filters, sentFilters]);
  const queryKey = JSON.stringify(query);

  // Both boxes read the same endpoint with a different `box`, so switching tabs
  // is a refetch rather than a second list kept in sync with this one.
  const { data: listData, meta: listMeta, loading: listLoading, error, refetch } =
    useFetch(() => (isSent ? getSent(query) : getAllNotifications(query)), [queryKey]);

  const rows  = useMemo(() => listData || [], [listData]);
  const total = listMeta?.total ?? rows.length;
  const pages = listMeta?.pages ?? 1;
  // The tab badges are counted over the whole mailbox, never the filter, so a
  // search does not make "Inbox 3" drop to zero. Only the inbox call carries
  // them — hold the last set so they do not blank out on the Sent tab.
  const [boxes, setBoxes] = useState({ inbox: 0, unread: 0, archived: 0, sent: 0 });
  useEffect(() => { if (listMeta?.boxes) setBoxes(listMeta.boxes); }, [listMeta]);

  // Ticked rows. Dropped whenever the query changes, so a delete can never
  // reach a row left over from two filters ago.
  const selection = useSelection(rows, queryKey);

  const modules = listMeta?.modules || [];
  // Kept across a tab switch for the same reason as the badges — the Sent
  // response has no module list of its own.
  const [moduleOpts, setModuleOpts] = useState([]);
  useEffect(() => { if (modules.length) setModuleOpts(modules); }, [modules]);

  // ── Live ───────────────────────────────────────────────────────────────────
  // A notification that arrives while this page is open belongs at the top of
  // it, not behind a refresh.
  useEffect(() => {
    const token = localStorage.getItem('token');
    const sock  = getSocket() || (token ? connectSocket(token) : null);
    if (!sock) return undefined;
    const onNew = () => { if (tab !== 'sent') refetch(); };
    sock.on('notification:new', onNew);
    return () => { sock.off('notification:new', onNew); };
  }, [refetch, tab]);

  // ── Actions ────────────────────────────────────────────────────────────────
  // The open panel is corrected immediately as well as refetched: the list
  // takes a round trip to come back, and until it does the panel would still be
  // offering "Mark as Unread" on a notification just marked unread.
  const patch = (id, fields) => {
    if (viewing?._id === id) setViewing((v) => ({ ...v, ...fields }));
  };

  const openRow = useCallback(async (row) => {
    setActiveId(row._id);
    if (!row.isRead) {
      try { await markOneRead(row._id); } catch { /* it still opens */ }
    }
    // A notification that names a destination goes there; one whose body is the
    // whole point opens beside the list.
    if (row.link?.resolved) { navigate(row.link.web); return; }
    setViewing({ ...row, isRead: true });
    refetch();
  }, [navigate, refetch]);

  const act = (fn, id, fields) => async () => {
    try { await fn(id); patch(id, fields); refetch(); }
    catch (err) { toast.error(err.response?.data?.message || err.message); }
  };

  const onRead    = (row) => act(markOneRead,   row._id, { isRead: true })();
  const onUnread  = (row) => act(markOneUnread, row._id, { isRead: false })();
  const onArchive = (row) => { setViewing(null); act(clearOne,   row._id, { isCleared: true })(); };
  const onRestore = (row) => { setViewing(null); act(restoreOne, row._id, { isCleared: false })(); };
  const onGo      = (row) => { setViewing(null); navigate(row.link.web); };

  const markEverything = async () => {
    try { await markAllRead(); toast.success('All notifications marked as read'); refetch(); }
    catch (err) { toast.error(err.response?.data?.message || err.message); }
  };

  const sweepRead = async () => {
    try {
      const res = await archiveRead();
      const n = res?.archived ?? 0;
      toast.success(n ? `${n} read notification${n === 1 ? '' : 's'} archived` : 'Nothing read to archive');
      refetch();
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
  };

  // ── The selection ──────────────────────────────────────────────────────────
  const BULK_DONE = {
    read:    (n) => `${n} marked as read`,
    unread:  (n) => `${n} marked as unread`,
    archive: (n) => `${n} archived`,
    restore: (n) => `${n} moved back to the inbox`,
    delete:  (n) => `${n} deleted`,
  };

  const runBulk = async (action) => {
    const ids = selection.ids;
    if (!ids.length) return;
    setBusy(true);
    try {
      const res = await bulkNotifications(ids, action);
      const n = res?.affected ?? ids.length;
      toast.success(`${BULK_DONE[action](n === 1 ? '1 notification' : `${n} notifications`)}`);
      // A deleted or archived row may have been the one on screen behind the
      // panel, and a panel showing a record that no longer exists is a dead end.
      if (ids.includes(viewing?._id)) setViewing(null);
      selection.clear();
      refetch();
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setBusy(false); setConfirm(null); }
  };

  const askDeleteSelected = () => setConfirm({
    title: 'Delete these notifications?',
    message: `${selection.ids.length} notification${selection.ids.length === 1 ? '' : 's'} will be removed from your list permanently. This cannot be undone — archiving keeps them instead.`,
    label: 'Delete',
    run: () => runBulk('delete'),
  });

  const askDeleteAll = () => {
    const n = tab === 'archived' ? boxes.archived : boxes.inbox;
    setConfirm({
      title: tab === 'archived' ? 'Empty the archive?' : 'Delete every notification in your inbox?',
      message: `All ${n} notification${n === 1 ? '' : 's'} in your ${tab === 'archived' ? 'archive' : 'inbox'} will be removed permanently — including any you have not read. This cannot be undone.`,
      label: `Delete all ${n}`,
      run: async () => {
        setBusy(true);
        try {
          const res = await deleteAllNotifications(tab === 'archived' ? 'archived' : 'inbox');
          toast.success(`${res?.deleted ?? 0} notifications deleted`);
          setViewing(null); selection.clear(); setPage(1); refetch();
        } catch (err) { toast.error(err.response?.data?.message || err.message); }
        finally { setBusy(false); setConfirm(null); }
      },
    });
  };

  // ── Arriving from a link ───────────────────────────────────────────────────
  // /n/:id sends readers here with ?receipt= when a notification has nowhere
  // more specific to go, so it opens on itself instead of a bare list. The row
  // is usually on this page; when a filter or the paging has hidden it, the
  // receipt is fetched on its own rather than dropping the reader on page one
  // of a list with no sign of the thing they clicked.
  const openReceiptId = params.get('receipt');
  useEffect(() => {
    if (!openReceiptId || listLoading) return;
    const drop = () => setParams((prev) => {
      const next = new URLSearchParams(prev); next.delete('receipt'); return next;
    }, { replace: true });

    const hit = rows.find((r) => String(r._id) === openReceiptId);
    if (hit) { openRow(hit); drop(); return; }
    resolveNotification(openReceiptId)
      .then((res) => { if (res?.data) setViewing(res.data); refetch(); })
      .catch(() => toast.error('That notification could not be found'))
      .finally(drop);
  }, [openReceiptId, listLoading, rows, openRow, setParams, refetch]);

  // ── The composer ───────────────────────────────────────────────────────────
  const [sendOpen, setSendOpen] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [classes,  setClasses]  = useState([]);   // admin: the whole school
  const [sections, setSections] = useState([]);   // teacher: the ones they teach

  const openSend = async () => {
    setSendOpen(true);
    try {
      if (role.sends === 'school' && !classes.length) {
        const res = await getClassesWithSections();
        setClasses(res?.data || res || []);
      }
      if (role.sends === 'sections' && !sections.length) {
        const res = await getMySections();
        setSections(res?.data || res || []);
      }
    } catch { /* the form still opens; the picker is simply empty */ }
  };

  const handleSend = async (payload, audience) => {
    if (!payload.title)  return toast.error('Title is required');
    if (!payload.body)   return toast.error('Message body is required');
    if (!payload.channels.inApp && !payload.channels.email) return toast.error('Select at least one channel');
    if (audience.needsClass   && !payload.classId)   return toast.error('Please select a class');
    if (audience.needsSection && !payload.sectionId) return toast.error('Please select a section');

    setSaving(true);
    try {
      const send = role.sends === 'sections' ? teacherSend : adminSend;
      const res  = await send(payload);
      const n    = res?.data?.recipientCount;
      toast.success(n ? `Sent to ${n} recipient${n === 1 ? '' : 's'}` : 'Notification sent');
      setSendOpen(false);
      // Straight to Sent so what was just sent is visible, with the badge
      // counted up here — the Sent response carries no box counts of its own,
      // so the number would otherwise lag by one until the reader went back.
      setBoxes((b) => ({ ...b, sent: (b.sent || 0) + 1 }));
      setTab('sent'); setPage(1);
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  // ── Toolbar ────────────────────────────────────────────────────────────────
  const set     = (p) => { setFilters((f) => ({ ...f, ...p })); setPage(1); };
  const setSent = (p) => { setSentFilters((f) => ({ ...f, ...p })); setPage(1); };
  const anyFilter = !!term || (isSent
    ? Object.keys(EMPTY_SENT).some((k) => sentFilters[k] !== EMPTY_SENT[k])
    : Object.keys(EMPTY_FILTERS).some((k) => filters[k] !== EMPTY_FILTERS[k]));
  const clearFilters = () => {
    setSearch(''); setTerm('');
    setFilters(EMPTY_FILTERS); setSentFilters(EMPTY_SENT); setPage(1);
  };

  const pickTab = (value) => { setTab(value); setPage(1); setViewing(null); };

  const sentColumns = [
    { key: 'what', className: 'nfcol-what', label: 'Notification', render: (n) => <SentCell n={n} /> },
    { key: 'aud',  className: 'nfcol-aud',  label: 'Audience',
      render: (n) => (
        <>
          <div className="lstack__main">{targetLabel(n.target?.type)}</div>
          <div className="lstack__sub">{n.recipientCount} recipient{n.recipientCount === 1 ? '' : 's'}</div>
        </>
      ) },
    { key: 'chan', className: 'nfcol-chan', label: 'Channels', render: (n) => <Channels channels={n.channels} /> },
    { key: 'read', className: 'nfcol-read', label: 'Opened',
      render: (n) => <ReadThrough delivered={n.delivered} opened={n.opened} /> },
    { key: 'when', className: 'nfcol-when', label: 'Sent',
      render: (n) => (
        <>
          <div className="lstack__main">{when(n.createdAt)}</div>
          <div className="lstack__sub">{fullWhen(n.createdAt)}</div>
        </>
      ) },
  ];

  const emptyFor = {
    inbox:    { icon: '🔔', title: anyFilter ? 'Nothing matches those filters' : 'Your inbox is empty',
                message: anyFilter
                  ? 'Try a different module, priority or search term.'
                  : 'Anything your school sends you arrives here.' },
    archived: { icon: '🗂️', title: anyFilter ? 'Nothing matches those filters' : 'Nothing archived yet',
                message: 'Notifications you put away move here and stay searchable.' },
    sent:     { icon: '📤', title: anyFilter ? 'Nothing matches those filters' : 'You have not sent anything yet',
                message: 'Notifications you send will be listed here with how many people opened them.' },
  }[tab];

  const tabs = [
    { value: 'inbox',    label: 'Inbox',    icon: 'mail',   count: boxes.unread, accent: true },
    ...(canSend ? [{ value: 'sent', label: 'Sent', icon: 'upload', count: boxes.sent }] : []),
    { value: 'archived', label: 'Archived', icon: 'folder', count: boxes.archived },
  ];

  return (
    <div className="page listpg nfpg">
      <Crumbs home={role.home} here="Notifications" />

      <NotifHero unread={boxes.unread} subtitle={role.subtitle} tip={role.tip} />

      <TabStrip value={tab} onChange={pickTab} tabs={tabs}>
        {/* Offered on the inbox whether or not anything is unread, so it is in
            the same place every time rather than appearing and vanishing. Every
            role gets it — a student's inbox fills up exactly like an admin's. */}
        {tab === 'inbox' && (
          <Button variant="secondary" onClick={markEverything} disabled={!boxes.unread}
            title={boxes.unread ? undefined : 'Everything is already read'}>
            <Icon name="checkCircle" size={16} /> Mark all read
          </Button>
        )}
        {tab === 'inbox' && boxes.inbox > boxes.unread && (
          <Button variant="secondary" onClick={sweepRead}>
            <Icon name="folder" size={16} /> Archive read
          </Button>
        )}
        {tab !== 'sent' && (tab === 'archived' ? boxes.archived : boxes.inbox) > 0 && (
          <Button variant="danger" onClick={askDeleteAll}>
            <Icon name="trash" size={16} /> {tab === 'archived' ? 'Empty archive' : 'Delete all'}
          </Button>
        )}
        {canSend && (
          <Button onClick={openSend}>
            <Icon name="megaphone" size={16} /> Send Notification
          </Button>
        )}
      </TabStrip>

      {error && <Alert variant="danger">{error}</Alert>}

      <section className="card">
        <div className="ltools">
          <SearchField value={search} onChange={setSearch}
            placeholder={isSent ? 'Search what you have sent…' : 'Search notifications…'} />

          {isSent ? (
            <>
              <select className={`form-control lsel${sentFilters.kind ? ' lfsel--on' : ''}`}
                value={sentFilters.kind} onChange={(e) => setSent({ kind: e.target.value })}
                aria-label="Filter by type">
                <option value="">All Types</option>
                <option value="announcement">Written by me</option>
                <option value="activity">Raised by a module</option>
              </select>
              <select className={`form-control lsel${sentFilters.priority ? ' lfsel--on' : ''}`}
                value={sentFilters.priority} onChange={(e) => setSent({ priority: e.target.value })}
                aria-label="Filter by priority">
                <option value="">All Priorities</option>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <select className={`form-control lsel${sentFilters.channel ? ' lfsel--on' : ''}`}
                value={sentFilters.channel} onChange={(e) => setSent({ channel: e.target.value })}
                aria-label="Filter by channel">
                <option value="">All Channels</option>
                <option value="inApp">In-App</option>
                <option value="email">Email</option>
              </select>
              <span className="ltools__sep" />
              <select className={`form-control lsel${sentFilters.sort !== 'newest' ? ' lfsel--on' : ''}`}
                value={sentFilters.sort} onChange={(e) => setSent({ sort: e.target.value })}
                aria-label="Sort notifications">
                {SENT_SORTS.map((s) => <option key={s.value} value={s.value}>Sort by: {s.label}</option>)}
              </select>
            </>
          ) : (
            <>
              <select className={`form-control lsel${filters.kind ? ' lfsel--on' : ''}`}
                value={filters.kind} onChange={(e) => set({ kind: e.target.value })} aria-label="Filter by type">
                <option value="">All Types</option>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>

              <select className={`form-control lsel${filters.module ? ' lfsel--on' : ''}`}
                value={filters.module} onChange={(e) => set({ module: e.target.value })} aria-label="Filter by module">
                <option value="">All Modules</option>
                {moduleOpts.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>

              <select className={`form-control lsel${filters.priority ? ' lfsel--on' : ''}`}
                value={filters.priority} onChange={(e) => set({ priority: e.target.value })} aria-label="Filter by priority">
                <option value="">All Priorities</option>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>

              <select className={`form-control lsel${filters.read ? ' lfsel--on' : ''}`}
                value={filters.read} onChange={(e) => set({ read: e.target.value })} aria-label="Filter by read status">
                <option value="">All Read Status</option>
                {READ_STATES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>

              <span className="ltools__sep" />

              <select className={`form-control lsel${filters.sort !== 'newest' ? ' lfsel--on' : ''}`}
                value={filters.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort notifications">
                {SORTS.map((s) => <option key={s.value} value={s.value}>Sort by: {s.label}</option>)}
              </select>
            </>
          )}
        </div>

        {listLoading ? (
          <div className="nfloading"><Spinner /></div>
        ) : !rows.length ? (
          <Empty icon={emptyFor.icon} title={emptyFor.title} message={emptyFor.message}
            action={anyFilter
              ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
              : (tab === 'sent' && canSend ? <Button onClick={openSend}>Send your first notification</Button> : null)} />
        ) : isSent ? (
          <ListTable columns={sentColumns} rows={rows} startIndex={(page - 1) * limit} />
        ) : (
          <>
            <BulkBar count={selection.ids.length} total={rows.length}
              allOn={selection.allOn} some={selection.some}
              onToggleAll={selection.toggleAll} onClear={selection.clear}>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => runBulk('read')}>
                <Icon name="checkCircle" size={14} /> Read
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => runBulk('unread')}>
                <Icon name="bell" size={14} /> Unread
              </Button>
              {tab === 'archived' ? (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => runBulk('restore')}>
                  <Icon name="refresh" size={14} /> Move to Inbox
                </Button>
              ) : (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => runBulk('archive')}>
                  <Icon name="folder" size={14} /> Archive
                </Button>
              )}
              <Button variant="danger" size="sm" disabled={busy} onClick={askDeleteSelected}>
                <Icon name="trash" size={14} /> Delete
              </Button>
            </BulkBar>

            <div className="nflist">
              {rows.map((row) => (
                <NotifRow key={row._id} row={row}
                  active={activeId === row._id}
                  picked={selection.has(row._id)} onPick={() => selection.toggle(row._id)}
                  onOpen={openRow} onRead={onRead} onUnread={onUnread}
                  onArchive={onArchive} onRestore={onRestore} />
              ))}
            </div>
          </>
        )}

        <ListFooter page={page} pages={pages} total={total} limit={limit} count={rows.length}
          noun="notification" onPage={setPage}
          onLimit={(n) => { setLimit(n); setPage(1); }} />
      </section>

      <HelpPanel scene={SupportScene}
        text={canSend
          ? 'Notifications reach people in the app, on their phone and by email at the same time. If a message did not arrive, check the Sent tab — it shows how many of the audience have opened it.'
          : 'Notifications reach you in the app, on your phone and by email at the same time. Archiving one keeps it — nothing here is ever deleted, so an old notice is always searchable.'} />

      <PageFoot schoolName={me?.school?.name} />

      {/* One notification, opened */}
      <Drawer open={!!viewing} onClose={() => setViewing(null)}>
        <NotifDetail row={viewing} onClose={() => setViewing(null)}
          onGo={onGo} onUnread={onUnread} onArchive={onArchive} onRestore={onRestore} />
      </Drawer>

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => confirm?.run()}
        title={confirm?.title} message={confirm?.message}
        confirmLabel={confirm?.label} loading={busy} />

      {canSend && (
        <Composer
          open={sendOpen} onClose={() => setSendOpen(false)} onSend={handleSend} saving={saving}
          audiences={role.sends === 'sections' ? TEACHER_AUDIENCES : ADMIN_AUDIENCES}
          classes={role.sends === 'school' ? classes : null}
          sections={role.sends === 'sections' ? sections : null}
          note={role.sends === 'sections'
            ? 'You can write to the sections you teach — as class teacher, vice class teacher or subject teacher.'
            : null} />
      )}
    </div>
  );
}
