import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/video.api';
import { Spinner, Button, Badge, Empty } from '../../../components/ui/index';

// ─────────────────────────────────────────────────────────────────────────────
//  Student — Secure video player. Resume, progress + telemetry reporting,
//  per-user watermark, interactions (like / favorite / watch-later / bookmark /
//  report), transcript. S3/local videos use the signed streaming URL; YouTube/
//  Vimeo use privacy-enhanced embeds.
// ─────────────────────────────────────────────────────────────────────────────
const embedSrc = (playback, resumeAt) => {
  if (!playback) return '';
  if (playback.type === 'embed') {
    const sep = playback.url.includes('?') ? '&' : '?';
    return `${playback.url}${sep}start=${Math.floor(resumeAt || 0)}`;
  }
  return playback.url;
};
const fmt = (s) => { s = Math.floor(s || 0); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
const device = () => (/Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop');

export default function StudentVideoPlayer() {
  const { id } = useParams();
  const nav = useNavigate();
  const [state, setState] = useState(undefined);
  const videoRef = useRef(null);
  const lastReport = useRef(0);
  const watched = useRef(0);
  const sessionId = useRef(`${id}-${Date.now()}`);
  const [it, setIt] = useState({ liked: false, favorited: false, watchLater: false });

  useEffect(() => {
    setState(undefined);
    api.studentPlayer(id).then(r => { const d = r.data ?? r; setState(d); setIt({ liked: d.interactions?.liked, favorited: d.interactions?.favorited, watchLater: d.interactions?.watchLater }); })
      .catch(e => { toast.error(e.message); setState(null); });
  }, [id]);

  // Resume the native player to the saved position once metadata is ready.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !state?.resumeAt) return;
    const onMeta = () => { try { v.currentTime = state.resumeAt; } catch {} };
    v.addEventListener('loadedmetadata', onMeta);
    return () => v.removeEventListener('loadedmetadata', onMeta);
  }, [state]);

  const report = useCallback(async (completed = false) => {
    const v = videoRef.current;
    const pos = v ? v.currentTime : 0;
    const dur = v ? v.duration : (state?.video?.durationSec || 0);
    try {
      await api.reportProgress({
        videoId: id, assignmentId: state?.assignment?._id || null,
        positionSec: Math.floor(pos), watchedDeltaSec: Math.floor(watched.current), durationSec: Math.floor(dur || 0),
        device: device(), completed,
      });
      watched.current = 0;
    } catch {}
  }, [id, state]);

  // Native <video> heartbeat: accumulate watched time, report every 15s.
  const onTime = () => {
    const v = videoRef.current; if (!v) return;
    watched.current += 0.25;
    if (v.currentTime - lastReport.current >= 15) { lastReport.current = v.currentTime; report(false); }
  };

  // Report on unmount / tab close so progress is never lost.
  useEffect(() => {
    const flush = () => { if (state?.playback?.type === 'file') report(false); };
    window.addEventListener('beforeunload', flush);
    return () => { flush(); window.removeEventListener('beforeunload', flush); };
  }, [state, report]);

  const toggle = async (type) => {
    try {
      const res = (await api.interact({ videoId: id, type })).data;
      const active = res?.active ?? !it[type === 'watch_later' ? 'watchLater' : type + 'd'];
      setIt(s => ({ ...s, [type === 'watch_later' ? 'watchLater' : type === 'like' ? 'liked' : 'favorited']: active }));
      toast.success(active ? 'Added' : 'Removed');
    } catch (e) { toast.error(e.message); }
  };

  const bookmark = async () => {
    const v = videoRef.current;
    try { await api.interact({ videoId: id, type: 'bookmark', timestampSec: Math.floor(v?.currentTime || 0), note: '' }); toast.success('Bookmarked this moment'); }
    catch (e) { toast.error(e.message); }
  };

  const report_ = async () => {
    const reason = window.prompt('Report this video — what is the issue?');
    if (!reason) return;
    try { await api.interact({ videoId: id, type: 'report', reason }); toast.success('Reported to your school. Thank you.'); }
    catch (e) { toast.error(e.message); }
  };

  if (state === undefined) return <div className="loading-page"><Spinner /></div>;
  if (state === null) return <div className="page"><Empty icon="🔒" title="Video unavailable" message="This video isn't assigned to you or isn't available right now." action={<Button onClick={() => nav(-1)}>Go back</Button>} /></div>;

  const { video, playback, policy, assignment } = state;
  const isFile = playback?.type === 'file';

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <button onClick={() => nav(-1)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', marginBottom: 10, fontSize: '.9rem' }}>← Back to videos</button>

      {/* Player surface */}
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', aspectRatio: '16/9', marginBottom: 14 }}>
        {isFile ? (
          <video ref={videoRef} src={embedSrc(playback, state.resumeAt)} controls playsInline controlsList={policy?.allowDownload ? '' : 'nodownload'}
            onContextMenu={e => e.preventDefault()} onTimeUpdate={onTime}
            onPause={() => report(false)} onEnded={() => report(true)}
            style={{ width: '100%', height: '100%', display: 'block' }} />
        ) : (
          <iframe title={video.title} src={embedSrc(playback, state.resumeAt)} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen
            style={{ width: '100%', height: '100%', border: 0 }} />
        )}
        {/* per-user watermark (anti-piracy deterrent) */}
        {policy?.watermark && (
          <div style={{ position: 'absolute', top: 10, right: 12, pointerEvents: 'none', color: 'rgba(255,255,255,.55)', fontSize: '.72rem', fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,.8)', letterSpacing: .3 }}>
            {policy.watermarkText}
          </div>
        )}
      </div>

      {/* Title + action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem' }}>{video.title}</h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {assignment && <Badge variant={assignment.mandatory ? 'danger' : 'info'}>{assignment.mandatory ? 'Mandatory' : 'Assigned'}</Badge>}
            {assignment?.minWatchPercent > 0 && <Badge variant="warning">Watch ≥ {assignment.minWatchPercent}%</Badge>}
            <Badge variant="muted">{(video.category || '').replace(/_/g, ' ')}</Badge>
            <span className="text-muted text-sm">👍 {video.likesCount || 0}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button size="sm" variant={it.liked ? 'primary' : 'secondary'} onClick={() => toggle('like')}>👍 Like</Button>
          <Button size="sm" variant={it.favorited ? 'primary' : 'secondary'} onClick={() => toggle('favorite')}>❤️ Favorite</Button>
          <Button size="sm" variant={it.watchLater ? 'primary' : 'secondary'} onClick={() => toggle('watch_later')}>🕑 Watch Later</Button>
          {isFile && <Button size="sm" variant="ghost" onClick={bookmark}>🔖 Bookmark</Button>}
          <Button size="sm" variant="ghost" onClick={report_}>🚩 Report</Button>
        </div>
      </div>

      {policy?.antiScreenRecordingHint && (
        <div className="text-muted text-sm" style={{ marginTop: 8 }}>🔒 This content is watermarked and licensed for your personal learning only.</div>
      )}

      {video.shortDescription && <p style={{ marginTop: 14 }}>{video.shortDescription}</p>}
      {video.learningOutcome && (
        <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--bg-muted,#f8fafc)', borderRadius: 10 }}>
          <strong>🎯 Learning outcome:</strong> {video.learningOutcome}
        </div>
      )}

      {/* Mapping chips */}
      {video.taxonomy && (
        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(video.taxonomy).flatMap(([dim, vals]) => (vals || []).map((v, i) => <Badge key={`${dim}${i}`} variant="muted">{v}</Badge>))}
        </div>
      )}

      {/* Transcript */}
      {video.transcript && (
        <details style={{ marginTop: 18 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>📄 Transcript</summary>
          <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1.6 }}>{video.transcript}</div>
        </details>
      )}
    </div>
  );
}
