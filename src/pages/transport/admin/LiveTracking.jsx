import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Badge, Empty, Spinner } from '../../../components/ui/index';

const ST = { started: 'success', paused: 'warning' };

export default function TransportLiveTracking() {
  const [trips, setTrips] = useState(null);
  const [updated, setUpdated] = useState(null);
  const timer = useRef(null);

  const load = async () => {
    try { const res = await api.getLiveTrips(); setTrips(res.data ?? res); setUpdated(new Date()); }
    catch (err) { toast.error(err.message); setTrips([]); }
  };
  useEffect(() => { load(); timer.current = setInterval(load, 10000); return () => clearInterval(timer.current); }, []);

  return (
    <div className="page">
      <PageHeader title="Live Fleet Tracking" subtitle={updated ? `Auto-refreshing every 10s · updated ${updated.toLocaleTimeString()}` : 'Real-time bus positions'} />
      {trips === null ? <div className="loading-page"><Spinner /></div>
        : trips.length === 0 ? <Empty icon="🛰️" title="No trips running right now" message="Buses appear here once a trip is started. Positions stream from the GPS device or driver app." />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
            {trips.map(t => {
              const loc = t.lastLocation || {};
              const progress = t.stopsTotal ? Math.round((t.stopsReached / t.stopsTotal) * 100) : 0;
              const gmap = loc.latitude ? `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}` : null;
              return (
                <div key={t._id} className="card">
                  <div className="card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{t.vehicle?.vehicleNumber || '—'}</div>
                        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{t.route?.name} · {t.shift} {t.direction}</div>
                      </div>
                      <Badge variant={ST[t.status] || 'muted'}>{t.status}</Badge>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                      <span>👨‍✈️ {t.driver?.name || '—'}</span>
                      <span>🚦 {loc.speed || 0} km/h</span>
                      {t.delayMinutes > 0 && <span style={{ color: 'var(--danger,#ef4444)' }}>⏱ {t.delayMinutes}m late</span>}
                    </div>
                    <div style={{ fontSize: '.75rem', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Stops {t.stopsReached}/{t.stopsTotal}</span><span>Boarded {t.boarded}/{t.total}</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)' }} />
                    </div>
                    {loc.latitude ? (
                      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                        📍 {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                        {gmap && <> · <a href={gmap} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Open in Maps ↗</a></>}
                        {loc.updatedAt && <div>Last ping {new Date(loc.updatedAt).toLocaleTimeString()}</div>}
                      </div>
                    ) : <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Awaiting first GPS ping…</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
