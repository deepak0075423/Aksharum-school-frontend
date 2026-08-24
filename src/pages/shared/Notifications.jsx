import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getAllNotifications, markOneRead } from '../../api/notifications.api';
import { PageHeader, Spinner, Modal } from '../../components/ui/index';
import { connectSocket, getSocket } from '../../socket';
import { notificationPath, hasTarget } from '../../utils/notificationLink';

export default function Notifications() {
  const navigate = useNavigate();
  // /n/:id sends readers here with ?receipt= when a notification has nowhere
  // more specific to go — so it opens on itself instead of a bare list.
  const [params, setParams] = useSearchParams();
  const openReceiptId = params.get('receipt');
  const [receipts,  setReceipts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [unread,    setUnread]    = useState(0);
  const [detail,    setDetail]    = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllNotifications();
      setReceipts(res.data || []);
      setUnread(res.unread ?? 0);
    } catch {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live updates over the WebSocket gateway — a notification sent while this
  // page is open appears at the top without a refresh.
  useEffect(() => {
    const token = localStorage.getItem('token');
    const sock  = getSocket() || (token ? connectSocket(token) : null);
    if (!sock) return;
    const onNew = () => load();
    sock.on('notification:new', onNew);
    return () => { sock.off('notification:new', onNew); };
  }, [load]);

  const handleClickReceipt = async (r) => {
    const n = r.notification || r;
    // Straight to what it is about when the notification names a destination;
    // otherwise the body is all there is, so show that.
    if (hasTarget(r)) navigate(notificationPath(r));
    else setDetail({ receipt: r, notification: n });
    if (!r.isRead) {
      try {
        await markOneRead(r._id);
        setReceipts(prev => prev.map(x => x._id === r._id ? { ...x, isRead: true } : x));
        setUnread(prev => Math.max(0, prev - 1));
      } catch {}
    }
  };

  // Arriving with ?receipt=… opens that one and drops the parameter, so a
  // refresh does not re-open it.
  useEffect(() => {
    if (!openReceiptId || loading) return;
    const r = receipts.find(x => String(x._id) === openReceiptId);
    if (!r) return;
    setDetail({ receipt: r, notification: r.notification || r });
    setParams(prev => { const next = new URLSearchParams(prev); next.delete('receipt'); return next; },
      { replace: true });
  }, [openReceiptId, loading, receipts, setParams]);

  return (
    <div className="page">
      {/* Opening a notification marks it read — no bulk "mark as read" action here */}
      <PageHeader title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : 'All notifications sent to you'} />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : receipts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔔</div>
          <h3>No notifications</h3>
          <p className="text-muted text-sm">You haven't received any notifications yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {receipts.map(r => {
            const n = r.notification || r;
            if (!n) return null;
            return (
              <div key={r._id}
                onClick={() => handleClickReceipt(r)}
                style={{
                  background: r.isRead ? 'var(--bg-card)' : '#eef2ff',
                  border: `1px solid ${r.isRead ? 'var(--border)' : '#c7d2fe'}`,
                  borderRadius: 'var(--radius)', padding: '14px 16px',
                  cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
                  transition: 'box-shadow .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.08)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {!r.isRead && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                    )}
                    <strong style={{ fontSize: '.9rem' }}>{n.title}</strong>
                  </div>
                  {n.body && (
                    <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--text-muted)', lineHeight: 1.5,
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {n.body}
                    </p>
                  )}
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
                    {new Date(r.createdAt || n.createdAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ flexShrink: 0, paddingTop: 2, textAlign: 'right' }}>
                  <div style={{ fontSize: '.75rem', color: r.isRead ? 'var(--text-muted)' : 'var(--primary)',
                    fontWeight: r.isRead ? 400 : 600 }}>
                    {r.isRead ? 'Read' : 'Unread'}
                  </div>
                  {hasTarget(r) && (
                    <div style={{ fontSize: '.72rem', color: 'var(--primary)', fontWeight: 600, marginTop: 4 }}>
                      Open →
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail popup */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Notification">
        {detail && (
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>{detail.notification?.title}</h3>
            <p style={{ margin: '0 0 16px', lineHeight: 1.7, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
              {detail.notification?.body}
            </p>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
              {new Date(detail.receipt?.createdAt || detail.notification?.createdAt).toLocaleString()}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
