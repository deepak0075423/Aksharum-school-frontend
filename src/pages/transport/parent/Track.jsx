import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Spinner, Badge, Empty } from '../../../components/ui/index';
import { useChildPicker } from './_shared';

const STEP = { pending: 'muted', boarded: 'success', dropped: 'info', absent: 'danger' };

export default function ParentTrack() {
  const { studentId, picker, loading: pl } = useChildPicker();
  const [track, setTrack] = useState(null);
  const [loading, setLoad] = useState(false);
  const timer = useRef(null);

  const load = async () => {
    if (!studentId) return;
    try { const r = await api.parentTrack({ studentId }); setTrack(r.data ?? r); }
    catch (err) { toast.error(err.message); }
  };
  useEffect(() => {
    if (!studentId) return;
    setLoad(true); load().finally(() => setLoad(false));
    timer.current = setInterval(load, 10000);
    return () => clearInterval(timer.current);
  }, [studentId]); // eslint-disable-line

  const t = track;
  const gmap = t?.lastLocation?.latitude ? `https://www.google.com/maps?q=${t.lastLocation.latitude},${t.lastLocation.longitude}` : null;

  return (
    <div className="page">
      <PageHeader title="Track My Bus" subtitle="Live location & today's trip status" action={picker} />
      {pl || loading ? <div className="loading-page"><Spinner /></div>
        : !t || (!t.active && t.reason) ? <Empty icon="🛰️" title="No live trip"
            message={t?.reason === 'no_assignment' ? 'No transport assignment found for this child.' : 'The bus trip has not started yet today. Check back near pickup/drop time.'} />
        : (
          <div style={{ maxWidth: 560 }}>
            <div className="card" style={{ marginBottom: 16 }}><div className="card-body">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <Badge variant={t.status === 'started' ? 'success' : t.status === 'completed' ? 'info' : 'warning'}>{t.status}</Badge>
                <Badge variant="info">{t.shift} · {t.direction}</Badge>
                {t.delayMinutes > 0 && <Badge variant="danger">⏱ {t.delayMinutes}m late</Badge>}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: '.85rem', flexWrap: 'wrap', marginBottom: 12 }}>
                <div><div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>Bus</div><strong>{t.vehicle?.vehicleNumber || '—'}</strong></div>
                <div><div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>Driver</div><strong>{t.driver?.name || '—'}</strong></div>
                {t.driver?.phone && <div><div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>Call</div><a href={`tel:${t.driver.phone}`} style={{ color: 'var(--primary)' }}>{t.driver.phone}</a></div>}
                <div><div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>My child</div><Badge variant={STEP[t.myStatus] || 'muted'}>{t.myStatus}</Badge></div>
              </div>
              {t.lastLocation?.latitude ? (
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                  📍 {t.lastLocation.latitude.toFixed(5)}, {t.lastLocation.longitude.toFixed(5)} · {t.lastLocation.speed || 0} km/h
                  {gmap && <> · <a href={gmap} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Open in Maps ↗</a></>}
                </div>
              ) : <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Awaiting GPS signal…</div>}
            </div></div>

            <div className="card"><div className="card-header"><h3 className="card-title">Trip Progress</h3></div>
              <div className="card-body">
                {(t.stops || []).map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: s.status === 'reached' ? 'var(--success,#22c55e)' : s.status === 'skipped' ? 'var(--danger,#ef4444)' : 'var(--border)' }} />
                    <span style={{ flex: 1, fontSize: '.85rem' }}>{s.name}</span>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{s.reachedAt ? new Date(s.reachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : s.plannedTime}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
