/**
 * Student → Video Learning → watching a video.
 *
 * Asks the server to authorise playback (which opens a watch session), hands
 * the answer to the player, and relays the player's heartbeats. The other
 * released videos of the chapter are listed alongside.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { student as api } from '../../../api/video.api';
import { Alert } from '../../../components/ui/index';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import RestrictedPlayer from '../player/RestrictedPlayer';
import { Head, Panel, Loadable, Thumb, Meter, StatusBadge, Icon, clock, errText } from '../vlParts';

export default function StudentVideoWatch() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);      // { message, code }
  const [state, setState] = useState(null);      // the latest heartbeat answer

  const open = useCallback(async () => {
    setLoading(true); setError(null); setState(null);
    try {
      const res = await api.authorize(id);
      const s = res.data;
      setSession(s);
      api.chapter(s.chapter).then((c) => setChapter(c.data)).catch(() => {});
    } catch (e) {
      setSession(null);
      setError({ message: errText(e), code: e?.data?.code });
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { open(); }, [open]);

  const sessionId = session?.sessionId;
  const beat = useCallback((body) => api.heartbeat(sessionId, body), [sessionId]);
  const leave = useCallback(() => { if (sessionId) api.end(sessionId).catch(() => {}); }, [sessionId]);

  const ch = chapter?.chapter;
  usePageCrumbs(ch ? [{ label: ch.bookTitle, to: `/student/videos/books/${ch.book}` }, { label: `Chapter ${ch.chapterNumber}`, to: `/student/videos/chapters/${ch._id}` }, { label: session?.video?.title }] : []);

  const percent = state?.watchedPercent ?? session?.progress?.watchedPercent ?? 0;
  const completed = state?.completed ?? session?.progress?.completed ?? false;
  const threshold = session?.policy?.completionThresholdPercent;

  return (
    <div className="page vl-page">
      <Loadable loading={loading}>
        {error ? (
          <>
            <Head title="Video" />
            <Alert variant={error.code === 'NOT_RELEASED' ? 'warning' : 'danger'}>
              {error.code === 'NOT_RELEASED' ? 'This video has not been released to you, or it is no longer available.' : error.message}{' '}
              <Link to="/student/videos" className="vl-link">Back to Video Learning</Link>
            </Alert>
          </>
        ) : session ? (
          <>
            <Head title={session.video.title} subtitle={ch ? `Chapter ${ch.chapterNumber}: ${ch.title} · ${ch.bookTitle}` : ''}>
              {ch ? <Link to={`/student/videos/chapters/${ch._id}`} className="btn btn-secondary"><Icon name="arrowLeft" size={16} /> Chapter</Link> : null}
            </Head>

            <div className="vl-watch">
              <div className="vl-stack">
                <RestrictedPlayer key={session.sessionId} session={session} beat={beat} onProgress={setState} onReopen={open} onLeave={leave} />
                <div className="vl-card vl-card__body vl-stack" style={{ gap: 10 }}>
                  <div className="vl-row">
                    <StatusBadge status={completed ? 'completed' : percent > 0 ? 'in_progress' : 'not_started'} />
                    <span className="vl-small vl-muted">
                      {completed ? 'You have completed this video.' : `Watch ${threshold}% of the video to complete it.`}
                    </span>
                  </div>
                  <Meter percent={percent} label="Watched" />
                  {session.video.description ? <p className="vl-muted">{session.video.description}</p> : null}
                  <p className="vl-small vl-muted">
                    You can pause, replay and go back over anything you have watched. Moving ahead of what you have watched and changing the speed are switched off for this video.
                  </p>
                </div>
              </div>

              <Panel title="In this chapter">
                {chapter ? (
                  <div className="vl-next">
                    {chapter.videos.map((v) => (
                      <Link key={v.chapterVideo} to={`/student/videos/watch/${v.chapterVideo}`} className={String(v.chapterVideo) === String(id) ? 'is-on' : ''}>
                        <Thumb src={v.thumbnailUrl} durationSec={v.durationSec} percent={String(v.chapterVideo) === String(id) ? percent : v.watchedPercent} size="sm" />
                        <span className="vl-grow">
                          <span className="vl-small" style={{ fontWeight: 600, display: 'block' }}>{v.title}</span>
                          <span className="vl-small vl-muted">{clock(v.durationSec)}</span>
                        </span>
                        {(String(v.chapterVideo) === String(id) ? completed : v.status === 'completed') ? <Icon name="checkCircle" size={16} style={{ color: 'var(--success)' }} /> : null}
                      </Link>
                    ))}
                  </div>
                ) : <p className="vl-muted vl-small">Loading the chapter…</p>}
              </Panel>
            </div>
          </>
        ) : null}
      </Loadable>
    </div>
  );
}
