/**
 * Video Learning — the player.
 *
 * One set of controls over three kinds of video: a file or an HLS stream in a
 * <video> element, a Vimeo video, a YouTube video. Whatever is underneath, the
 * student gets exactly this:
 *
 *   play · pause · volume · fullscreen · resume · replay what they have watched
 *
 * and not: playback speed, picture-in-picture, download, share, or moving
 * ahead of what they have watched. The timeline can be clicked and dragged
 * anywhere up to the furthest point reached and no further.
 *
 * None of that is what keeps the record honest. A browser is the student's
 * own machine; anything here can be switched off in it. The record is kept by
 * the SERVER, which judges every heartbeat against its own clock
 * (school-backend/services/lms/tracking.js) and tells this player where the
 * student may be. The player follows: when the server refuses a position, the
 * video is moved back to where it says.
 *
 * It also does not stop a screen being recorded. Nothing in a browser can.
 *
 * `tracked={false}` (the Super Admin's preview) plays with no heartbeats and
 * no limit on seeking.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../../api/video.api';
import { clock } from '../vlParts';

// ── Icons (the app's set has no transport controls) ──────────────────────────
const Svg = ({ children, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>{children}</svg>
);
const IPlay   = (p) => <Svg {...p}><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></Svg>;
const IPause  = (p) => <Svg {...p}><rect x="6.5" y="5" width="4" height="14" rx="1" /><rect x="13.5" y="5" width="4" height="14" rx="1" /></Svg>;
const IReplay = (p) => <Svg {...p}><path d="M12 5V2.5L7.5 6 12 9.5V7a5.5 5.5 0 1 1-5.5 5.5h-2A7.5 7.5 0 1 0 12 5z" /></Svg>;
const IVol    = (p) => <Svg {...p}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" /><path d="M15 8.5a4.5 4.5 0 0 1 0 7M17.5 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></Svg>;
const IMute   = (p) => <Svg {...p}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></Svg>;
const IFull   = (p) => <Svg {...p}><path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
const IExit   = (p) => <Svg {...p}><path d="M9 5v4H5M19 9h-4V5M15 19v-4h4M5 15h4v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></Svg>;

// ── Engines: the same few verbs over each kind of video ──────────────────────
//
// An engine is { play, pause, seek, time, duration, volume, destroy } and calls
// back `on(event, value)` with: ready, play, pause, ended, time, rate, error.

function loadScript(src, ready) {
  return new Promise((resolve, reject) => {
    if (ready()) return resolve();
    let tag = document.querySelector(`script[src="${src}"]`);
    if (!tag) { tag = document.createElement('script'); tag.src = src; tag.async = true; document.head.appendChild(tag); }
    const started = Date.now();
    const t = setInterval(() => {
      if (ready()) { clearInterval(t); resolve(); }
      else if (Date.now() - started > 15000) { clearInterval(t); reject(new Error('The video player could not be loaded. Check your connection.')); }
    }, 100);
    tag.addEventListener('error', () => { clearInterval(t); reject(new Error('The video player could not be loaded. Check your connection.')); });
    return undefined;
  });
}

/** A file or an HLS stream in the page's own <video> element. */
async function htmlEngine(video, playback, on) {
  let hls = null;
  // The element outlives an engine: a newer one may already have attached to
  // it by the time an abandoned one is destroyed, and must keep its source.
  const owner = Symbol('engine');
  video.vlOwner = owner;
  const src = playback.url || apiUrl(playback.path);
  const handlers = {
    loadedmetadata: () => on('ready'), play: () => on('play'), pause: () => on('pause'), ended: () => on('ended'),
    timeupdate: () => on('time', video.currentTime), ratechange: () => on('rate', video.playbackRate),
    error: () => on('error', 'The video could not be played.'),
    enterpictureinpicture: () => { document.exitPictureInPicture?.().catch(() => {}); },
  };
  Object.entries(handlers).forEach(([e, fn]) => video.addEventListener(e, fn));
  if (playback.type === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
    const { default: Hls } = await import('hls.js');
    if (!Hls.isSupported()) throw new Error('This browser cannot play this video. Try a current version of Chrome, Edge, Firefox or Safari.');
    hls = new Hls({ enableWorker: true });
    hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) on('error', 'The video could not be played.'); });
    hls.loadSource(src);
    hls.attachMedia(video);
  } else {
    video.src = src;
  }
  return {
    play: () => video.play(), pause: () => video.pause(),
    seek: (t) => { try { video.currentTime = t; } catch { /* not ready */ } },
    time: () => video.currentTime || 0, duration: () => (Number.isFinite(video.duration) ? video.duration : 0),
    volume: (v, muted) => { video.volume = v; video.muted = muted; },
    rate: () => { if (video.playbackRate !== 1) video.playbackRate = 1; },
    destroy: () => {
      Object.entries(handlers).forEach(([e, fn]) => video.removeEventListener(e, fn));
      if (hls) hls.destroy();
      if (video.vlOwner === owner) { video.pause(); video.removeAttribute('src'); video.load(); }
    },
  };
}

/** YouTube, through its IFrame API, with its own controls and keyboard switched off. */
/** A fresh element inside the frame for a provider's script to replace — never the one React owns. */
function slot(frame) {
  const el = document.createElement('div');
  frame.appendChild(el);
  return el;
}

async function youtubeEngine(frame, playback, on) {
  await loadScript('https://www.youtube.com/iframe_api', () => !!window.YT?.Player);
  let timer = null;
  const mount = slot(frame);
  const player = await new Promise((resolve, reject) => {
    const p = new window.YT.Player(mount, {
      videoId: playback.videoId, host: 'https://www.youtube-nocookie.com',
      playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, origin: window.location.origin },
      events: {
        onReady: () => resolve(p),
        onError: () => reject(new Error('YouTube could not play this video.')),
        onStateChange: (e) => {
          const S = window.YT.PlayerState;
          if (e.data === S.PLAYING) on('play'); else if (e.data === S.PAUSED) on('pause'); else if (e.data === S.ENDED) on('ended');
        },
        onPlaybackRateChange: () => on('rate', p.getPlaybackRate?.()),
      },
    });
  });
  timer = setInterval(() => on('time', player.getCurrentTime?.() || 0), 400);
  on('ready');
  return {
    play: () => player.playVideo(), pause: () => player.pauseVideo(), seek: (t) => player.seekTo(t, true),
    time: () => player.getCurrentTime?.() || 0, duration: () => player.getDuration?.() || 0,
    volume: (v, muted) => { player.setVolume(Math.round(v * 100)); if (muted) player.mute(); else player.unMute(); },
    rate: () => { if (player.getPlaybackRate?.() !== 1) player.setPlaybackRate(1); },
    destroy: () => { clearInterval(timer); try { player.destroy(); } catch { /* already gone */ } mount.remove?.(); },
  };
}

/** Vimeo, through its player SDK, with its own controls switched off. */
async function vimeoEngine(frame, playback, on) {
  await loadScript('https://player.vimeo.com/api/player.js', () => !!window.Vimeo?.Player);
  const mount = slot(frame);
  const player = new window.Vimeo.Player(mount, {
    id: Number(playback.videoId), ...(playback.hash ? { h: playback.hash } : {}),
    controls: false, keyboard: false, pip: false, title: false, byline: false, portrait: false, dnt: true, playsinline: true, responsive: true, speed: false,
  });
  let now = 0; let total = 0;
  player.on('play', () => on('play')); player.on('pause', () => on('pause')); player.on('ended', () => on('ended'));
  player.on('timeupdate', (d) => { now = d.seconds; total = d.duration; on('time', now); });
  player.on('playbackratechange', (d) => on('rate', d.playbackRate));
  player.on('error', () => on('error', 'Vimeo could not play this video.'));
  await player.ready();
  total = await player.getDuration().catch(() => 0);
  on('ready');
  return {
    play: () => player.play(), pause: () => player.pause(), seek: (t) => player.setCurrentTime(t).catch(() => {}),
    time: () => now, duration: () => total,
    volume: (v, muted) => { player.setVolume(muted ? 0 : v).catch(() => {}); },
    rate: () => { player.setPlaybackRate(1).catch(() => {}); },
    destroy: () => { player.destroy().catch(() => {}).finally(() => mount.remove()); },
  };
}

const CLOSED = {
  session_superseded: ['Playing somewhere else', 'This video was opened in another tab or on another device with your account. It plays in one place at a time.'],
  session_idle:       ['This session timed out', 'The video was left for a while. Your place is saved.'],
  session_closed:     ['This video is no longer open to you', 'Your teacher may have changed what is released. Your progress is saved.'],
};

/**
 * @param {object}   props.session   what `student.authorize` answered: { sessionId, playback, video, progress, policy }
 * @param {boolean}  props.tracked   false for a preview: no heartbeats, free seeking
 * @param {function} props.beat      (body) => Promise<heartbeat answer>          (tracked only)
 * @param {function} props.onProgress ({ furthestSec, watchedPercent, completed }) after each accepted heartbeat
 * @param {function} props.onReopen  ask for a fresh session (after one was closed)
 * @param {function} props.onLeave   called once when the player goes away, with nothing to wait for
 */
export default function RestrictedPlayer({ session, tracked = true, beat, onProgress, onReopen, onLeave }) {
  const { playback, video, progress, policy } = session;
  const boxRef = useRef(null);
  const videoRef = useRef(null);
  const mountRef = useRef(null);
  const engine = useRef(null);
  const live = useRef({ seq: 0, frontier: tracked ? (progress?.furthestSec || 0) : Infinity, playing: false, sending: false, failures: 0, closed: false, last: 0 });

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [now, setNow] = useState(progress?.resumePositionSec || 0);
  const [frontier, setFrontier] = useState(tracked ? (progress?.furthestSec || 0) : 0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [full, setFull] = useState(false);
  const [idle, setIdle] = useState(false);
  const [note, setNote] = useState('');
  const [fatal, setFatal] = useState(null);       // { title, text, reopen }
  const duration = video?.durationSec || 0;
  const tolerance = policy?.toleranceSeconds ?? 2;

  const say = useCallback((text) => {
    setNote(text);
    clearTimeout(say.t);
    say.t = setTimeout(() => setNote(''), 3200);
  }, []);

  // ── Heartbeats ─────────────────────────────────────────────────────────────
  const send = useCallback(async (state) => {
    const L = live.current;
    if (!tracked || !beat || L.closed || L.sending) return;
    L.sending = true;
    const seq = ++L.seq;
    // On leaving, the engine is already torn down: the last position it reported stands in.
    const positionSec = Math.round((engine.current ? engine.current.time() : L.now || 0) * 100) / 100;
    try {
      const res = await beat({ seq, positionSec, state, elapsedSec: Math.round((Date.now() - (L.last || Date.now())) / 1000) });
      const a = res?.data || res;
      L.last = Date.now(); L.failures = 0;
      if (a.closed) {
        L.closed = true;
        engine.current?.pause();
        const [title, text] = CLOSED[a.reason] || CLOSED.session_closed;
        setFatal({ title, text, reopen: a.reason !== 'session_closed' });
        return;
      }
      if (a.accepted === false) {
        // The server did not believe this position. Go back to where it says.
        L.frontier = a.furthestSec;
        engine.current?.seek(a.resumePositionSec);
        say('You cannot skip ahead — watch the video to move forward.');
      } else if (typeof a.furthestSec === 'number') {
        L.frontier = Math.max(L.frontier, a.furthestSec);
      }
      setFrontier(L.frontier);
      onProgress?.(a);
    } catch (e) {
      L.failures += 1;
      if (e?.status === 403 || e?.status === 404) {
        L.closed = true; engine.current?.pause();
        setFatal({ title: 'This video is no longer open to you', text: e.message || 'Your progress is saved.', reopen: false });
      } else if (L.failures >= 4) {
        // A minute with no word from the server: stop, so nothing is watched that cannot be recorded.
        engine.current?.pause();
        say('Connection lost. Your progress is saved — play again once you are back online.');
      } else {
        say('Reconnecting…');
      }
    } finally { L.sending = false; }
  }, [tracked, beat, onProgress, say]);

  // ── The engine ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    const L = live.current;
    const on = (event, value) => {
      if (dead) return;
      if (event === 'ready') {
        setReady(true);
        const at = progress?.resumePositionSec || 0;
        if (at > 0) engine.current?.seek(at);
      } else if (event === 'play') {
        L.playing = true; setPlaying(true); setEnded(false); send('playing');
      } else if (event === 'pause') {
        L.playing = false; setPlaying(false); send('paused');
      } else if (event === 'ended') {
        L.playing = false; setPlaying(false); setEnded(true); send('ended');
      } else if (event === 'rate') {
        if (tracked && value !== 1) { engine.current?.rate(); say('Playback speed is fixed for this video.'); }
      } else if (event === 'time') {
        const t = value || 0;
        if (tracked) {
          // Playing on from the furthest point moves it; landing beyond it is a skip.
          if (t <= L.frontier + tolerance) { if (L.playing && t > L.frontier) L.frontier = t; }
          else { engine.current?.seek(L.frontier); say('You cannot skip ahead — watch the video to move forward.'); return; }
          setFrontier(L.frontier);
        }
        L.now = t;
        setNow(t);
      } else if (event === 'error') {
        setFatal({ title: 'The video could not be played', text: value || 'Please try again.', reopen: true });
      }
    };
    (async () => {
      try {
        const make = playback.type === 'youtube' ? () => youtubeEngine(mountRef.current, playback, on)
          : playback.type === 'vimeo' ? () => vimeoEngine(mountRef.current, playback, on)
            : () => htmlEngine(videoRef.current, playback, on);
        const e = await make();
        if (dead) { e.destroy(); return; }
        engine.current = e;
        e.volume(1, false);
      } catch (err) {
        if (!dead) setFatal({ title: 'The video could not be loaded', text: err.message, reopen: true });
      }
    })();
    return () => {
      dead = true;
      engine.current?.destroy();
      engine.current = null;
    };
    // The session is the identity of this player: a new one is a new player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionId]);

  // The beat: every few seconds while playing — and while paused too, so the
  // server knows the page is still open and keeps the session alive.
  useEffect(() => {
    if (!tracked) return undefined;
    const every = Math.max(5, policy?.heartbeatSeconds || 15) * 1000;
    const t = setInterval(() => { if (ready && !live.current.closed) send(live.current.playing ? 'playing' : 'paused'); }, every);
    return () => clearInterval(t);
  }, [tracked, ready, policy, send]);

  // Leaving: say so, so the session closes now rather than by timing out.
  // Deferred a moment and cancelled by a remount of the same player: React's
  // development mode mounts every component twice, and ending the session on
  // that first, pretend unmount would kill the playback address before the
  // video had even loaded.
  const leaveTimer = useRef(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    clearTimeout(leaveTimer.current);
    return () => {
      // The seconds since the last heartbeat are reported before the session closes.
      const L = live.current;
      if (L.last && !L.closed) { L.sending = false; sendRef.current(L.playing ? 'playing' : 'paused'); }
      leaveTimer.current = setTimeout(() => onLeave?.(), 400);
    };
  }, [onLeave]);

  // ── Controls ───────────────────────────────────────────────────────────────
  const toggle = useCallback(() => {
    const e = engine.current;
    if (!e || fatal) return;
    if (ended) { e.seek(0); e.play(); return; }
    if (live.current.playing) e.pause(); else Promise.resolve(e.play()).catch(() => say('Press play to start the video.'));
  }, [ended, fatal, say]);

  const seekTo = useCallback((t) => {
    const e = engine.current;
    if (!e) return;
    const max = tracked ? live.current.frontier : (duration || e.duration());
    const target = Math.max(0, Math.min(t, max));
    if (tracked && t > max + 0.5) say('You can go back over what you have watched, but not ahead of it.');
    e.seek(target); setNow(target); setEnded(false);
  }, [tracked, duration, say]);

  const applyVolume = (v, m) => { setVolume(v); setMuted(m); engine.current?.volume(v, m); };

  const toggleFull = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else (box.requestFullscreen || box.webkitRequestFullscreen)?.call(box);
  }, []);
  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // The bar hides itself while the video plays and nothing moves.
  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(wake.t);
    wake.t = setTimeout(() => { if (live.current.playing) setIdle(true); }, 2800);
  }, []);
  useEffect(() => { if (!playing) setIdle(false); else wake(); }, [playing, wake]);

  const onKey = (e) => {
    if (e.target.closest('input')) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); }
    else if (k === 'arrowleft') { e.preventDefault(); seekTo((engine.current?.time() || 0) - 10); }
    else if (k === 'arrowright') { e.preventDefault(); seekTo((engine.current?.time() || 0) + 10); }
    else if (k === 'f') { e.preventDefault(); toggleFull(); }
    else if (k === 'm') { e.preventDefault(); applyVolume(volume, !muted); }
    wake();
  };

  // Clicking or dragging the timeline.
  const trackRef = useRef(null);
  const fromPointer = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (duration || engine.current?.duration() || 0);
  };
  const onTrackDown = (e) => {
    if (!ready) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    seekTo(fromPointer(e));
  };
  const onTrackMove = (e) => { if (e.buttons === 1 && ready) seekTo(fromPointer(e)); };

  const total = duration || 1;
  const pct = (v) => `${Math.max(0, Math.min(100, (v / total) * 100))}%`;
  const embedded = playback.type === 'youtube' || playback.type === 'vimeo';

  return (
    <div ref={boxRef} className={`vl-player${idle && !fatal ? ' is-idle' : ''}`} tabIndex={0} onKeyDown={onKey} onMouseMove={wake} onTouchStart={wake}
      onContextMenu={(e) => e.preventDefault()} aria-label={`Video player: ${video?.title || ''}`}>
      {embedded
        ? <div className="vl-player__frame" ref={mountRef} />
        : (
          <video ref={videoRef} playsInline preload="metadata" controls={false}
            controlsList="nodownload noplaybackrate noremoteplayback nofullscreen" disablePictureInPicture disableRemotePlayback
            onContextMenu={(e) => e.preventDefault()} />
        )}

      {/* Clicks land here, never on the provider's own buttons or links. */}
      <button type="button" className="vl-player__shield" onClick={toggle} onDoubleClick={toggleFull} aria-label={playing ? 'Pause' : 'Play'} tabIndex={-1} />

      {!playing && !fatal && (
        <div className="vl-player__center">
          {ready
            ? <button type="button" className="vl-player__big" onClick={toggle} aria-label={ended ? 'Play again' : 'Play'}>{ended ? <IReplay size={34} /> : <IPlay size={36} />}</button>
            : <div className="spinner" />}
        </div>
      )}

      {note ? <div className="vl-player__toast" role="status">{note}</div> : null}

      {fatal && (
        <div className="vl-player__msg" role="alert">
          <div>
            <h3>{fatal.title}</h3>
            <p>{fatal.text}</p>
            {fatal.reopen && onReopen
              ? <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={onReopen}>Open the video again</button>
              : null}
          </div>
        </div>
      )}

      <div className="vl-player__bar">
        <div ref={trackRef} className="vl-track" onPointerDown={onTrackDown} onPointerMove={onTrackMove}
          role="slider" aria-label="Position in the video" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(now)} aria-valuetext={`${clock(now)} of ${clock(total)}`}>
          <div className="vl-track__rail">
            {tracked ? <div className="vl-track__seen" style={{ width: pct(frontier) }} /> : null}
            <div className="vl-track__now" style={{ width: pct(now) }} />
          </div>
          <div className="vl-track__knob" style={{ left: pct(now) }} />
        </div>
        <div className="vl-ctrls">
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={!ready}>{playing ? <IPause /> : ended ? <IReplay /> : <IPlay />}</button>
          <span className="vl-ctrls__time">{clock(now)} / {clock(total)}</span>
          <span className="vl-ctrls__sp" />
          <button type="button" onClick={() => applyVolume(volume, !muted)} aria-label={muted ? 'Unmute' : 'Mute'}>{muted || volume === 0 ? <IMute /> : <IVol />}</button>
          <input className="vl-ctrls__vol" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} aria-label="Volume"
            onChange={(e) => applyVolume(Number(e.target.value), Number(e.target.value) === 0)} />
          <button type="button" onClick={toggleFull} aria-label={full ? 'Leave full screen' : 'Full screen'}>{full ? <IExit /> : <IFull />}</button>
        </div>
      </div>
    </div>
  );
}
