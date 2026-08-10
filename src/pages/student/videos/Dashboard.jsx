import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/video.api';
import { PageHeader, StatCard, Spinner, Empty, Badge } from '../../../components/ui/index';

// ─────────────────────────────────────────────────────────────────────────────
//  Student — Video learning home. Continue watching, assigned, recently added.
// ─────────────────────────────────────────────────────────────────────────────
const fmtDur = (s) => { if (!s) return ''; const m = Math.floor(s / 60), sec = s % 60; return `${m}:${String(sec).padStart(2, '0')}`; };

function VideoCard({ v, onClick, progress }) {
  return (
    <div onClick={onClick} style={{ cursor: 'pointer', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface, #fff)', transition: 'transform .12s', display: 'flex', flexDirection: 'column' }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
      <div style={{ position: 'relative', aspectRatio: '16/9', background: v.thumbnailUrl ? `center/cover url(${v.thumbnailUrl})` : 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!v.thumbnailUrl && <span style={{ fontSize: 34 }}>🎬</span>}
        {v.durationSec > 0 && <span style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,.75)', color: '#fff', fontSize: '.72rem', padding: '1px 6px', borderRadius: 4 }}>{fmtDur(v.durationSec)}</span>}
        {progress != null && progress > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,.3)' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#ef4444' }} />
          </div>
        )}
      </div>
      <div style={{ padding: '10px 12px', flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '.9rem', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.title}</div>
        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="text-muted text-sm">{v.source === 'youtube' ? '▶️' : v.source === 'vimeo' ? '🔷' : '🎞'}</span>
          {v.category && <Badge variant="muted">{(v.category || '').replace(/_/g, ' ')}</Badge>}
        </div>
      </div>
    </div>
  );
}

function Row({ title, videos, onOpen, progressMap }) {
  if (!videos?.length) return null;
  return (
    <div style={{ marginBottom: 26 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem' }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 16 }}>
        {videos.map(v => <VideoCard key={v._id} v={v} onClick={() => onOpen(v._id)} progress={progressMap?.[v._id]} />)}
      </div>
    </div>
  );
}

export default function StudentVideoDashboard() {
  const [d, setD] = useState(undefined);
  const nav = useNavigate();

  useEffect(() => { api.studentDashboard().then(r => setD(r.data ?? r)).catch(e => { toast.error(e.message); setD(null); }); }, []);

  if (d === undefined) return <div className="loading-page"><Spinner /></div>;

  const open = (id) => nav(`/student/videos/${id}`);
  const continueProgress = Object.fromEntries((d?.continueWatching || []).map(p => [p.video?._id, p.progressPercent]));
  const continueVideos = (d?.continueWatching || []).map(p => ({ ...p.video, _cont: p.progressPercent }));
  const contMap = Object.fromEntries(continueVideos.map(v => [v._id, v._cont]));

  const hasAny = (d?.assignedVideos?.length || d?.continueWatching?.length || d?.recentlyAdded?.length);

  return (
    <div className="page">
      <PageHeader title="🎥 Video Learning" subtitle="Your assigned lessons, courses and the school library" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14, marginBottom: 22 }}>
        <StatCard icon="📌" label="Assigned" value={d?.stats?.assigned || 0} color="blue" />
        <StatCard icon="✅" label="Completed" value={d?.stats?.completed || 0} color="green" />
        <StatCard icon="❤️" label="Favorites" value={d?.stats?.favorites || 0} color="pink" />
      </div>

      {!hasAny ? (
        <Empty icon="🎬" title="Nothing here yet" message="Your teachers haven't assigned videos yet, and the school library is being set up." />
      ) : (
        <>
          <Row title="▶️ Continue Watching" videos={continueVideos} onOpen={open} progressMap={contMap} />
          <Row title="📌 Assigned to You" videos={d?.assignedVideos} onOpen={open} />
          <Row title="🆕 Recently Added" videos={d?.recentlyAdded} onOpen={open} />
        </>
      )}
    </div>
  );
}
