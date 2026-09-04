import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { logout } from '../../api/auth.api';
import { getInbox, markAllRead, markOneRead, clearAll } from '../../api/notifications.api';
import { connectSocket, disconnectSocket } from '../../socket';
import toast from 'react-hot-toast';
import { Modal } from '../ui/index';
import { notificationIconUrl } from '../../utils/branding';
import { notificationPath, hasTarget } from '../../utils/notificationLink';
import Icon from '../ui/icons';
import GlobalSearch from './GlobalSearch';
import pageTitle from '../../utils/pageTitle';

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

// `onOpen` fires when the OS notification itself is clicked — the tab is
// focused first, since the browser leaves it in the background otherwise and
// the navigation would happen somewhere nobody is looking.
function requestBrowserPush(title, body, school, onOpen) {
  if (!('Notification' in window)) return;
  const icon = notificationIconUrl(school);   // the school's own logo when it has one
  const show = () => {
    const n = new Notification(title, { body, icon });
    n.onclick = () => { window.focus(); n.close(); onOpen?.(); };
  };
  if (Notification.permission === 'granted') {
    show();
  } else if (Notification.permission === 'default') {
    Notification.requestPermission().then(p => { if (p === 'granted') show(); });
  }
}

export default function Header({ onMenuClick, onCollapseClick }) {
  const { user, signOut }   = useAuth();
  const navigate            = useNavigate();
  const location            = useLocation();

  const [dropOpen,   setDropOpen]   = useState(false);
  const [bellOpen,   setBellOpen]   = useState(false);
  const [notifs,     setNotifs]     = useState([]);
  const [notifLoad,  setNotifLoad]  = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [detailNotif, setDetailNotif] = useState(null);

  const dropRef    = useRef(null);
  const bellRef    = useRef(null);
  const prevUnread = useRef(0);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target))  setDropOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target))  setBellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Connect to WebSocket Gateway — push-based unread count, no polling
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    const sock = connectSocket(token);

    sock.on('notification:unread_count', ({ count }) => {
      prevUnread.current = count;
      setUnreadCount(count);
    });

    // Real-time action notifications pushed via the WebSocket Gateway. The
    // payload carries this reader's own destination — resolved server-side,
    // because the same notification opens elsewhere for a different role.
    sock.on('notification:new', (n) => {
      playNotifSound();
      const path = notificationPath(n);
      const open = () => { if (path) navigate(path); };
      requestBrowserPush(n?.title || 'New Notification', n?.body || '', user?.school, open);
      toast(t => (
        <div style={{ cursor: 'pointer' }} onClick={() => { toast.dismiss(t.id); open(); }}>
          <strong style={{ display: 'block', fontSize: '.88rem' }}>{n?.title}</strong>
          {n?.body && (
            <span style={{ fontSize: '.8rem', color: '#64748b', display: 'block',
              maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {n.body}
            </span>
          )}
          {hasTarget(n) && (
            <span style={{ fontSize: '.75rem', color: 'var(--primary)', fontWeight: 600 }}>Tap to open →</span>
          )}
        </div>
      ), { icon: '🔔', duration: 5000 });
      // Show it instantly in the bell dropdown list. The receipt id comes from
      // the payload so this row can be marked read and followed like any other.
      setNotifs(prev => [{
        _id: n?.receiptId || `rt-${n?._id || Date.now()}`,
        isRead: false,
        createdAt: n?.createdAt || new Date().toISOString(),
        notification: n,
        link: n?.link,
      }, ...prev].slice(0, 10));
    });

    return () => {
      sock.off('notification:unread_count');
      sock.off('notification:new');
    };
  }, [user]);

  const fetchNotifs = async () => {
    setNotifLoad(true);
    try {
      const res = await getInbox();
      const items = (res.data || res || []).slice(0, 10);
      setNotifs(items);
      // Sync unread count with actual items
      const count = items.filter(n => !n.isRead).length;
      prevUnread.current = count;
      setUnreadCount(count);
    } catch {}
    finally { setNotifLoad(false); }
  };

  const openBell = () => {
    setBellOpen(o => {
      if (!o) fetchNotifs();
      return !o;
    });
    setDropOpen(false);
  };

  const handleMarkAll = async () => {
    try { await markAllRead(); fetchNotifs(); }
    catch { toast.error('Failed to mark all read'); }
  };

  const handleClearAll = async () => {
    try { await clearAll(); fetchNotifs(); }
    catch { toast.error('Failed to clear inbox'); }
  };

  const handleClickNotif = async (receipt) => {
    const n    = receipt.notification || receipt;
    const path = notificationPath(receipt);
    setBellOpen(false);

    // A notification that names a destination goes straight there — reading the
    // body in a dialog first is a step nobody wants. Ones with nowhere to go
    // (a message an admin typed by hand) still open in the dialog.
    if (hasTarget(receipt)) navigate(path);
    else setDetailNotif({ receipt, notification: n });

    if (!receipt.isRead) {
      try {
        await markOneRead(receipt._id);
        setNotifs(prev => prev.map(r => r._id === receipt._id ? { ...r, isRead: true } : r));
        setUnreadCount(c => Math.max(0, c - 1));
      } catch {}
    }
  };

  const handleLogout = async () => {
    try { await logout(); } catch {}
    disconnectSocket();
    signOut();
    navigate('/login');
    toast.success('Logged out successfully');
  };

  const rolePrefix = user?.role === 'super_admin' ? 'super-admin'
    : user?.role === 'school_admin' ? 'admin'
    : user?.role || 'admin';

  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const title = pageTitle(location.pathname);
  // The global search reads the admin list endpoints, so it is only offered to
  // the role those endpoints answer for.
  const canSearch = user?.role === 'school_admin';

  return (
    <div className="header">
      {/* Mobile hamburger */}
      <button className="header__toggle btn-icon" onClick={onMenuClick}
        style={{ display: 'none' }} id="mobile-menu-btn" aria-label="Open menu">
        <Icon name="menu" size={20} />
      </button>

      {/* Desktop collapse toggle */}
      <button className="header__toggle btn-icon" onClick={onCollapseClick}
        id="desktop-collapse-btn" aria-label="Collapse sidebar">
        <Icon name="menu" size={20} />
      </button>

      <h1 className="header__title">{title}</h1>

      {canSearch && <GlobalSearch />}

      {/* Actions */}
      <div className="header__actions">
        {/* Bell */}
        <div className="dropdown" ref={bellRef}>
          <button className="header__btn" title="Notifications" onClick={openBell}
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
            <Icon name="bell" size={20} />
            {unreadCount > 0 && (
              <span className="header__count">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>

          {bellOpen && (
            <div className="dropdown-menu" style={{
              right: 0, left: 'auto', width: 340, maxHeight: 460,
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}>
              {/* Header row */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
              }}>
                <strong style={{ fontSize: '.9rem' }}>Notifications</strong>
                {notifs.length > 0 && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button onClick={handleMarkAll}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)',
                        fontSize: '.78rem', cursor: 'pointer', padding: 0 }}>
                      Mark all read
                    </button>
                    <span style={{ color: 'var(--border)' }}>|</span>
                    <button onClick={handleClearAll}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
                        fontSize: '.78rem', cursor: 'pointer', padding: 0 }}>
                      Clear all
                    </button>
                  </div>
                )}
              </div>

              {/* List */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {notifLoad ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.85rem' }}>
                    Loading…
                  </div>
                ) : notifs.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.85rem' }}>
                    No notifications
                  </div>
                ) : notifs.map(r => {
                  const n = r.notification || r;
                  return (
                    <div key={r._id}
                      onClick={() => handleClickNotif(r)}
                      style={{
                        padding: '12px 16px', borderBottom: '1px solid var(--border)',
                        cursor: 'pointer', background: r.isRead ? 'transparent' : '#eef2ff',
                        transition: 'background .15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, #f1f5f9)'}
                      onMouseLeave={e => e.currentTarget.style.background = r.isRead ? 'transparent' : '#eef2ff'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        {!r.isRead && (
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                        )}
                        <div style={{ fontWeight: r.isRead ? 400 : 600, fontSize: '.85rem' }}>
                          {n.title}
                        </div>
                      </div>
                      {n.body && (
                        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          paddingLeft: r.isRead ? 0 : 13 }}>
                          {n.body}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        gap: 8, marginTop: 4, paddingLeft: r.isRead ? 0 : 13 }}>
                        <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                          {new Date(r.createdAt || n.createdAt).toLocaleString()}
                        </span>
                        {hasTarget(r) && (
                          <span style={{ fontSize: '.72rem', color: 'var(--primary)', fontWeight: 600, flexShrink: 0 }}>
                            Open →
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <Link
                  to={`/${rolePrefix}/notifications`}
                  onClick={() => setBellOpen(false)}
                  style={{ fontSize: '.82rem', color: 'var(--primary)', textDecoration: 'none' }}>
                  View all notifications →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Avatar dropdown */}
        <div className="dropdown" ref={dropRef}>
          <button className="header__user" title={user?.name} type="button"
            onClick={() => { setDropOpen(o => !o); setBellOpen(false); }}
            aria-haspopup="menu" aria-expanded={dropOpen}>
            <span className="header__avatar">
              {user?.profileImage
                ? <img src={user.profileImage} alt="" />
                : initials}
            </span>
            <span className="header__user-text">
              <span className="header__user-name">{user?.name}</span>
              <span className="header__user-role">{user?.role?.replace('_', ' ')}</span>
            </span>
            <Icon name="chevronDown" size={15} className="header__user-caret" />
          </button>

          {dropOpen && (
            <div className="dropdown-menu">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{user?.name}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {user?.role?.replace('_', ' ')}
                </div>
              </div>
              <Link to="/profile" className="dropdown-item" onClick={() => setDropOpen(false)}>
                <Icon name="user" size={17} /> Profile
              </Link>
              <div className="dropdown-divider" />
              <button className="dropdown-item danger" onClick={handleLogout}>
                <Icon name="logOut" size={17} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Notification detail popup */}
      {detailNotif && (
        <Modal open={!!detailNotif} onClose={() => setDetailNotif(null)} title="Notification">
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>{detailNotif.notification?.title}</h3>
            <p style={{ margin: '0 0 16px', lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
              {detailNotif.notification?.body}
            </p>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
              {new Date(detailNotif.receipt?.createdAt || detailNotif.notification?.createdAt).toLocaleString()}
            </div>
          </div>
        </Modal>
      )}

      <style>{`
        @media (max-width: 768px) {
          #mobile-menu-btn    { display: flex !important; }
          #desktop-collapse-btn { display: none !important; }
        }
      `}</style>
    </div>
  );
}
